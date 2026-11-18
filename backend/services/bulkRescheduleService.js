const Appointment = require('../modal/Appointment');
const AppointmentTesting = require('../modal/AppointmentTesting');
const Doctor = require('../modal/Doctor');
const googleCalendarService = require('./googleCalendar');
const notificationService = require('./notificationService');
const { validateAppointmentAvailability } = require('../utils/availabilityChecker');
const {
  overlaps,
  toIstParts,
  makeIstInstant,
  getIstDayBounds,
  findNextAvailableSlot,
} = require('../utils/slotFinder');

const ACTIVE_STATUSES = ['Scheduled', 'Rescheduled', 'Reassigned'];

function slotConflictsPlanned(start, end, plannedSlots, doctorId) {
  for (const p of plannedSlots) {
    if (String(p.doctorId) !== String(doctorId)) continue;
    if (overlaps(start, end, p.start, p.end)) return true;
  }
  return false;
}

function computeShiftedSlot(appt, { shiftDays, targetDate }) {
  const oldStart = new Date(appt.slotStartIso);
  const oldEnd = new Date(appt.slotEndIso);
  const durationMs = oldEnd.getTime() - oldStart.getTime();

  if (targetDate) {
    const parts = toIstParts(oldStart);
    const [ty, tm, td] = String(targetDate).split('-').map(Number);
    const newStart = makeIstInstant(ty, tm, td, parts.hour, parts.minute, 0, 0);
    return { start: newStart, end: new Date(newStart.getTime() + durationMs) };
  }

  const days = Number(shiftDays) || 1;
  const shiftMs = days * 24 * 60 * 60 * 1000;
  return {
    start: new Date(oldStart.getTime() + shiftMs),
    end: new Date(oldEnd.getTime() + shiftMs),
  };
}

async function proposeNewSlot(appt, doctor, mode, options, plannedSlots) {
  const excludeIds = options.excludeAppointmentIds || [];
  let candidate = null;

  if (mode === 'auto') {
    const durationMin = Math.round(
      (new Date(appt.slotEndIso) - new Date(appt.slotStartIso)) / 60000
    );
    const searchFrom = new Date(appt.slotEndIso);
    candidate = await findNextAvailableSlot(
      doctor,
      durationMin,
      searchFrom,
      options.searchDays || 30,
      excludeIds
    );
    if (!candidate) {
      return { ok: false, reason: 'No available slot found within search window' };
    }
  } else {
    candidate = computeShiftedSlot(appt, options);
    const availability = validateAppointmentAvailability(
      doctor,
      candidate.start.toISOString(),
      candidate.end.toISOString()
    );
    if (!availability.available) {
      return { ok: false, reason: availability.reason || 'Doctor not available at proposed time' };
    }
  }

  if (slotConflictsPlanned(candidate.start, candidate.end, plannedSlots, doctor._id)) {
    return { ok: false, reason: 'Proposed slot conflicts with another bulk move' };
  }

  const [conflictOffline, conflictOnline] = await Promise.all([
    Appointment.findOne({
      _id: { $nin: excludeIds },
      doctorId: doctor._id,
      status: { $in: ['Scheduled', 'In Progress', 'Rescheduled', 'Reassigned'] },
      slotStartIso: { $lt: candidate.end },
      slotEndIso: { $gt: candidate.start },
    }).select('_id'),
    AppointmentTesting.findOne({
      _id: { $nin: excludeIds },
      doctorId: doctor._id,
      status: { $in: ['Scheduled', 'In Progress', 'Rescheduled', 'Reassigned'] },
      slotStartIso: { $lt: candidate.end },
      slotEndIso: { $gt: candidate.start },
    }).select('_id'),
  ]);

  if (conflictOffline || conflictOnline) {
    return { ok: false, reason: 'Proposed slot is already booked' };
  }

  return { ok: true, start: candidate.start, end: candidate.end };
}

async function fetchAppointmentsForBulk({ sourceDate, doctorIds }) {
  const bounds = getIstDayBounds(sourceDate);
  if (!bounds) throw new Error('Invalid source date');

  const doctorQuery = Array.isArray(doctorIds) && doctorIds.length
    ? { doctorId: { $in: doctorIds } }
    : {};

  return Appointment.find({
    ...doctorQuery,
    status: { $in: ACTIVE_STATUSES },
    slotStartIso: { $gte: bounds.dayStart, $lte: bounds.dayEnd },
  })
    .populate('doctorId')
    .populate('patientId', 'name email phone')
    .sort({ slotStartIso: 1 })
    .lean();
}

async function runBulkReschedule({
  sourceDate,
  doctorIds = [],
  mode = 'shift',
  shiftDays = 1,
  targetDate = null,
  note = '',
  dryRun = false,
  sendNotifications = true,
  requestedByRole = 'receptionist',
  requestedById = null,
}) {
  const appointments = await fetchAppointmentsForBulk({ sourceDate, doctorIds });
  const excludeIds = appointments.map((a) => a._id);
  const plannedSlots = [];
  const results = [];
  let rescheduled = 0;
  let failed = 0;

  for (const appt of appointments) {
    const doctor = appt.doctorId;
    const patient = appt.patientId;
    const entry = {
      appointmentId: appt._id,
      patientName: patient?.name || 'Unknown',
      doctorName: doctor?.name || 'Unknown',
      oldStart: appt.slotStartIso,
      oldEnd: appt.slotEndIso,
      newStart: null,
      newEnd: null,
      status: 'failed',
      reason: null,
    };

    if (!doctor?._id) {
      entry.reason = 'Doctor not found';
      failed += 1;
      results.push(entry);
      continue;
    }

    const proposal = await proposeNewSlot(
      appt,
      doctor,
      mode,
      { shiftDays, targetDate, excludeAppointmentIds: excludeIds, searchDays: 30 },
      plannedSlots
    );

    if (!proposal.ok) {
      entry.reason = proposal.reason;
      failed += 1;
      results.push(entry);
      continue;
    }

    entry.newStart = proposal.start;
    entry.newEnd = proposal.end;
    entry.status = 'ready';
    plannedSlots.push({
      doctorId: doctor._id,
      start: proposal.start,
      end: proposal.end,
    });

    if (!dryRun) {
      const fromSnapshot = {
        start: appt.slotStartIso,
        end: appt.slotEndIso,
        date: appt.date,
      };

      const updated = await Appointment.findByIdAndUpdate(
        appt._id,
        {
          $set: {
            date: new Date(
              proposal.start.getFullYear(),
              proposal.start.getMonth(),
              proposal.start.getDate()
            ),
            slotStartIso: proposal.start,
            slotEndIso: proposal.end,
            status: 'Rescheduled',
            updatedAt: new Date(),
          },
          $push: {
            rescheduleHistory: {
              by: requestedById,
              byType: requestedByRole,
              at: new Date(),
              from: fromSnapshot,
              to: {
                start: proposal.start,
                end: proposal.end,
                date: new Date(
                  proposal.start.getFullYear(),
                  proposal.start.getMonth(),
                  proposal.start.getDate()
                ),
              },
              note: note || `Bulk rescheduled by ${requestedByRole}`,
            },
          },
        },
        { new: true }
      )
        .populate('doctorId')
        .populate('patientId', 'name email phone');

      entry.status = 'rescheduled';
      rescheduled += 1;

      if (updated) {
        setImmediate(async () => {
          try {
            const doc = updated.doctorId;
            if (updated.googleCalendar?.eventId && doc?.googleCalendar?.isConnected) {
              await googleCalendarService.updateAppointmentEvent(
                doc,
                updated.googleCalendar.eventId,
                {
                  appointmentId: updated._id,
                  slotStartIso: proposal.start,
                  slotEndIso: proposal.end,
                  status: updated.status,
                }
              );
            }
            if (sendNotifications && updated.patientId?.email) {
              await notificationService.sendAppointmentRescheduledEmail({
                appointment: updated,
                doctor: doc,
                patient: updated.patientId,
                requestedByRole,
              });
            }
          } catch (err) {
            console.error('[bulkReschedule] background sync failed:', err?.message || err);
          }
        });
      }
    } else {
      entry.status = 'preview';
      rescheduled += 1;
    }

    results.push(entry);
  }

  return {
    sourceDate,
    mode,
    dryRun,
    total: appointments.length,
    rescheduled,
    failed,
    results,
  };
}

module.exports = {
  runBulkReschedule,
  fetchAppointmentsForBulk,
};
