const Doctor = require('../modal/Doctor');
const Appointment = require('../modal/Appointment');
const Patient = require('../modal/Patient');
const googleCalendarService = require('./googleCalendar');
const notificationService = require('./notificationService');
const { validateAppointmentAvailability } = require('../utils/availabilityChecker');
const { findNextAvailableSlot } = require('../utils/slotFinder');
const { recordActivity } = require('./activityLogger');

const AUTO_RESCHEDULE_SEARCH_DAYS = 7;

function runInBackground(fn) {
  setImmediate(() => {
    fn().catch((err) => {
      console.error('[availability] background task error:', err?.message || err);
    });
  });
}

async function syncAppointmentToGoogle(doctorDoc, appt) {
  try {
    if (!doctorDoc.googleCalendar?.isConnected) {
      return { success: false, error: 'Calendar not connected' };
    }

    const payload = {
      appointmentId: appt._id,
      slotStartIso: appt.slotStartIso,
      slotEndIso: appt.slotEndIso,
      status: appt.status,
      patientEmail: appt.patientId?.email,
      attendees: appt.patientId?.email
        ? [{ email: appt.patientId.email, displayName: appt.patientId.name }]
        : [],
    };

    const result = appt.googleCalendar?.eventId
      ? await googleCalendarService.updateAppointmentEvent(
          doctorDoc,
          appt.googleCalendar.eventId,
          payload
        )
      : await googleCalendarService.createAppointmentEventWithDoctor(
          doctorDoc,
          appt.patientId,
          payload
        );

    if (!result?.success) {
      return { success: false, error: result?.error || 'Failed to sync appointment' };
    }

    return { success: true, eventId: result.eventId, eventLink: result.eventLink };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
}

function cleanVipTimings(timings) {
  if (Array.isArray(timings)) {
    return timings.map(t => String(t).trim()).filter(t => /^\d{2}:\d{2}$/.test(t));
  }
  if (typeof timings === 'string') {
    return timings.split(',').map(t => t.trim()).filter(t => /^\d{2}:\d{2}$/.test(t));
  }
  return [];
}

function normalizeAvailabilityPayload(body) {
  const {
    availabilityMode,
    dailyTimeRanges,
    availabilityRange,
    excludedWeekdays,
    appointmentDuration,
    customDailySchedule,
  } = body;

  if (!['default', 'custom'].includes(availabilityMode)) {
    return { error: "availabilityMode must be 'default' or 'custom'" };
  }

  if (appointmentDuration && ![15, 30, 45, 60].includes(Number(appointmentDuration))) {
    return { error: 'appointmentDuration must be one of 15, 30, 45, 60' };
  }

  let normalizedRanges = [];
  let customScheduleToSave;

  const incomingAvailRange = availabilityRange || {};
  const incomingExcluded = Array.isArray(incomingAvailRange.excludedWeekdays)
    ? incomingAvailRange.excludedWeekdays.map((v) => Number(v))
    : Array.isArray(excludedWeekdays)
      ? excludedWeekdays.map(Number)
      : [];

  if (availabilityMode === 'default') {
    normalizedRanges = Array.isArray(dailyTimeRanges)
      ? dailyTimeRanges
          .filter((r) => r?.start && r?.end)
          .map((r) => ({
            start: r.start,
            end: r.end,
            isOnline: Boolean(r.isOnline),
            vipSlots: r.vipSlots !== undefined ? Number(r.vipSlots) : 0,
            vipTimings: cleanVipTimings(r.vipTimings),
          }))
      : [];

    const baseRanges =
      normalizedRanges.length > 0 ? normalizedRanges : [{ start: '09:00', end: '17:00', isOnline: false, vipSlots: 0, vipTimings: [] }];

    customScheduleToSave = {};
    for (let day = 0; day <= 6; day++) {
      customScheduleToSave[day] = incomingExcluded.includes(day)
        ? []
        : baseRanges.map((r) => ({ ...r }));
    }
  } else if (availabilityMode === 'custom') {
    if (Array.isArray(dailyTimeRanges) && dailyTimeRanges.length > 0) {
      normalizedRanges = dailyTimeRanges
        .filter(
          (r) =>
            r &&
            typeof r.day === 'number' &&
            r.day >= 0 &&
            r.day <= 6 &&
            r.start &&
            r.end
        )
        .map((r) => ({
          day: Number(r.day),
          start: r.start,
          end: r.end,
          isOnline: Boolean(r.isOnline),
          vipSlots: r.vipSlots !== undefined ? Number(r.vipSlots) : 0,
          vipTimings: cleanVipTimings(r.vipTimings),
        }));

      customScheduleToSave = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
      for (const r of normalizedRanges) {
        if (!customScheduleToSave[r.day]) customScheduleToSave[r.day] = [];
        customScheduleToSave[r.day].push({
          start: r.start,
          end: r.end,
          isOnline: Boolean(r.isOnline),
          vipSlots: r.vipSlots,
          vipTimings: r.vipTimings,
        });
      }
    } else if (customDailySchedule && typeof customDailySchedule === 'object') {
      normalizedRanges = [];
      customScheduleToSave = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
      for (const [dayKey, ranges] of Object.entries(customDailySchedule)) {
        const dayIndex = Number(dayKey);
        if (!Array.isArray(ranges)) continue;
        for (const r of ranges) {
          if (!r?.start || !r?.end) continue;
          const cleanedT = cleanVipTimings(r.vipTimings);
          const vSlots = r.vipSlots !== undefined ? Number(r.vipSlots) : 0;
          const isOnlineVal = Boolean(r.isOnline);
          normalizedRanges.push({
            day: dayIndex,
            start: r.start,
            end: r.end,
            isOnline: isOnlineVal,
            vipSlots: vSlots,
            vipTimings: cleanedT,
          });
          if (!customScheduleToSave[dayIndex]) customScheduleToSave[dayIndex] = [];
          customScheduleToSave[dayIndex].push({
            start: r.start,
            end: r.end,
            isOnline: isOnlineVal,
            vipSlots: vSlots,
            vipTimings: cleanedT,
          });
        }
      }
    }
  }

  for (const r of normalizedRanges) {
    if (!r.start || !r.end) {
      return { error: 'Each time range must have start and end' };
    }
  }

  return {
    payload: {
      availabilityMode,
      dailyTimeRanges: normalizedRanges,
      customDailySchedule: availabilityMode === 'custom' ? customScheduleToSave : undefined,
      availabilityRange: {
        startDate: incomingAvailRange.startDate || null,
        endDate: incomingAvailRange.endDate || null,
        excludedWeekdays: incomingExcluded,
      },
      excludedWeekdays: incomingExcluded,
      appointmentDuration,
    },
  };
}

async function runAvailabilityBackgroundReschedule(updatedDoctor, requestedBy) {
  const upcomingAppointments = await Appointment.find({
    doctorId: updatedDoctor._id,
    status: { $in: ['Scheduled', 'In Progress', 'Rescheduled', 'Reassigned'] },
    slotEndIso: { $gt: new Date() },
  }).populate('patientId');

  const results = { attempted: upcomingAppointments.length, rescheduled: [], failed: [] };

  for (const appt of upcomingAppointments) {
    try {
      const stillValid = validateAppointmentAvailability(
        updatedDoctor,
        appt.slotStartIso,
        appt.slotEndIso
      ).available;
      if (stillValid) continue;

      const searchFrom = new Date(appt.slotEndIso || new Date());
      const duration = Number(updatedDoctor.appointmentDuration || 30);
      const candidate = await findNextAvailableSlot(
        updatedDoctor,
        duration,
        searchFrom,
        AUTO_RESCHEDULE_SEARCH_DAYS,
        [appt._id]
      );

      if (!candidate) {
        results.failed.push({ appointmentId: appt._id, reason: 'No slot found within search window' });
        continue;
      }

      const fromSnapshot = {
        start: appt.slotStartIso,
        end: appt.slotEndIso,
      };

      appt.date = new Date(
        candidate.start.getFullYear(),
        candidate.start.getMonth(),
        candidate.start.getDate()
      );
      appt.slotStartIso = candidate.start;
      appt.slotEndIso = candidate.end;
      appt.status = 'Rescheduled';
      appt.rescheduleHistory = Array.isArray(appt.rescheduleHistory) ? appt.rescheduleHistory : [];
      appt.rescheduleHistory.push({
        by: requestedBy?.id || null,
        byType: requestedBy?.type || requestedBy?.role || 'system',
        at: new Date(),
        from: fromSnapshot,
        to: { start: candidate.start, end: candidate.end },
        note: 'Auto-rescheduled due to availability update',
      });
      appt.rescheduleCount = Number(appt.rescheduleCount || 0) + 1;
      appt.updatedAt = new Date();
      await appt.save();

      try {
        if (updatedDoctor.googleCalendar?.isConnected) {
          const syncRes = await syncAppointmentToGoogle(updatedDoctor, appt);
          appt.googleCalendar = {
            ...(appt.googleCalendar || {}),
            synced: !!syncRes.success,
            syncError: syncRes.error,
          };
          if (syncRes.success) {
            appt.googleCalendar.eventId = syncRes.eventId || appt.googleCalendar.eventId;
            appt.googleCalendar.eventLink = syncRes.eventLink || appt.googleCalendar.eventLink;
            appt.googleCalendar.lastSyncedAt = new Date();
            appt.googleCalendar.syncError = undefined;
          }
          await appt.save();
        }
      } catch (calErr) {
        console.error('[availability] Google sync error:', calErr?.message || calErr);
      }

      try {
        const patient =
          appt.patientId?._id ? appt.patientId : await Patient.findById(appt.patientId);
        await notificationService.sendAppointmentRescheduledEmail({
          appointment: appt,
          doctor: updatedDoctor,
          patient,
          requestedByRole: requestedBy?.type || requestedBy?.role || 'system',
        });
      } catch (emailErr) {
        console.error('[availability] email error:', emailErr?.message || emailErr);
      }

      results.rescheduled.push({
        appointmentId: appt._id,
        newStart: candidate.start,
        newEnd: candidate.end,
      });
    } catch (innerErr) {
      results.failed.push({ appointmentId: appt._id, reason: innerErr?.message || 'Unexpected' });
    }
  }

  console.log('[availability] background finished for doctor=', updatedDoctor._id, results);
  return results;
}

async function updateDoctorAvailability(req, res, doctorId) {
  try {
    const normalized = normalizeAvailabilityPayload(req.body);
    if (normalized.error) {
      return res.status(400).json({ status: 'error', message: normalized.error });
    }

    const updatedDoctor = await Doctor.findByIdAndUpdate(doctorId, normalized.payload, {
      new: true,
      runValidators: true,
    })
      .select('-password')
      .lean();

    if (!updatedDoctor) {
      return res.status(404).json({ status: 'error', message: 'Doctor not found' });
    }

    const upcomingCount = await Appointment.countDocuments({
      doctorId: updatedDoctor._id,
      status: { $in: ['Scheduled', 'In Progress', 'Rescheduled', 'Reassigned'] },
      slotEndIso: { $gt: new Date() },
    });

    res.json({
      status: 'success',
      data: {
        doctor: updatedDoctor,
        preview: { upcomingAppointments: upcomingCount },
      },
      message: 'Availability saved — auto-reschedule is processing in background',
    });

    try {
      const user = req.user || {};
      const ar = updatedDoctor.availabilityRange || {};
      const start = ar.startDate ? new Date(ar.startDate).toISOString().slice(0, 10) : null;
      const end = ar.endDate ? new Date(ar.endDate).toISOString().slice(0, 10) : null;
      await recordActivity({
        userId: user.id || user._id,
        userName: user.name,
        userEmail: user.email,
        userType: user.type || user.role || user.userType || 'receptionist',
        action: 'Set doctor availability',
        description: `Updated availability for Dr. ${updatedDoctor.name || 'doctor'}${
          start || end ? ` (${start || '…'} → ${end || '…'})` : ''
        }`,
        req,
        metadata: {
          doctorId: String(updatedDoctor._id),
          doctorName: updatedDoctor.name,
          availabilityMode: updatedDoctor.availabilityMode,
          startDate: start,
          endDate: end,
          dailyTimeRangesCount: Array.isArray(updatedDoctor.dailyTimeRanges)
            ? updatedDoctor.dailyTimeRanges.length
            : 0,
          upcomingAppointments: upcomingCount,
        },
      });
    } catch (logErr) {
      console.warn('[availability] activity log failed:', logErr?.message || logErr);
    }

    runInBackground(() =>
      runAvailabilityBackgroundReschedule(updatedDoctor, {
        id: req.user?.id || req.user?._id,
        type: req.user?.type || req.user?.role,
        role: req.user?.role || req.user?.type,
      })
    );
  } catch (error) {
    console.error('Error updating availability:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update availability',
      errors: [error.message || String(error)],
    });
  }
}

module.exports = {
  updateDoctorAvailability,
  normalizeAvailabilityPayload,
};
