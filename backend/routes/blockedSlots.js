// routes/blockedSlots.js (updated)
const express = require('express');
const router = express.Router();
const BlockedSlot = require('../modal/BlockedSlot');
const Doctor = require('../modal/Doctor');
const Appointment = require('../modal/Appointment');
const Patient = require('../modal/Patient');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const googleCalendarService = require('../services/googleCalendar');
const notificationService = require('../services/notificationService');
const { validateAppointmentAvailability } = require('../utils/availabilityChecker');
const { recordActivity } = require('../services/activityLogger');
const { v4: uuidv4 } = require('uuid');


const sendResponse = (res, statusCode, message, data) => {
  return res.status(statusCode).json({
    success: statusCode >= 200 && statusCode < 300,
    message,
    data
  });
};

async function logBlockedSlotActivity(req, action, description, metadata = {}) {
  try {
    const user = req.user || {};
    await recordActivity({
      userId: user.id || user._id,
      userName: user.name,
      userEmail: user.email,
      userType: user.type || user.role || user.userType || 'receptionist',
      action,
      description,
      req,
      metadata,
    });
  } catch (err) {
    console.warn('[blockedSlots] activity log failed:', err?.message || err);
  }
}

const overlaps = (aStart, aEnd, bStart, bEnd) => {
  const s1 = new Date(aStart), e1 = new Date(aEnd), s2 = new Date(bStart), e2 = new Date(bEnd);
  return s1 < e2 && s2 < e1;
};

// ---------- Timezone helpers: force all working-hours math to IST ----------
const IST_OFFSET_MINUTES = 5 * 60 + 30; // +05:30
const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000;

// run heavy work in background so HTTP response is fast
const runInBackground = (fn) => {
  try {
    // next tick to avoid blocking the current request
    setImmediate(() => {
      fn().catch((err) => {
        console.error('[blockedSlots] background task error:', err?.message || err);
      });
    });
  } catch (e) {
    console.error('[blockedSlots] failed to schedule background task:', e?.message || e);
  }
};


// Convert a UTC instant -> IST "wall clock" parts
function toIstParts(dateUtc) {
  const ist = new Date(dateUtc.getTime() + IST_OFFSET_MS);
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth() + 1, // 1-12
    day: ist.getUTCDate(),
    hour: ist.getUTCHours(),
    minute: ist.getUTCMinutes(),
    second: ist.getUTCSeconds(),
    ms: ist.getUTCMilliseconds(),
  };
}

// Build a Date that represents a local IST time (YYYY-MM-DD HH:mm)
// as a specific UTC instant.
function makeIstInstant(
  year,
  month, // 1–12
  day,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0
) {
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  // local IST = UTC + 5:30 => UTC instant = local - 5:30
  return new Date(utcMs - IST_OFFSET_MS);
}



async function findNextAvailableSlot(doctorDoc, durationMinutes, from, maxDays = 30) {
  if (!doctorDoc) return null;

  const dailyRanges = Array.isArray(doctorDoc.dailyTimeRanges)
    ? doctorDoc.dailyTimeRanges
    : [];
  if (!dailyRanges.length) return null;

  // ✅ NEW: Get availability settings
  const availabilityMode = doctorDoc.availabilityMode || 'default';
  const excludedWeekdays = doctorDoc.availabilityRange?.excludedWeekdays || [];

  // 'from' is a UTC instant; we interpret it as IST wall-clock
  const startInstant = from instanceof Date ? new Date(from) : new Date(from);
  if (Number.isNaN(startInstant.getTime())) return null;

  const appointmentDuration = Number(
    durationMinutes || doctorDoc.appointmentDuration || 30
  );

  // For DB queries we can still use a simple +N days window in UTC
  const windowEnd = new Date(
    startInstant.getTime() + maxDays * 24 * 60 * 60 * 1000
  );

  const existingAppointments = await Appointment.find({
    doctorId: doctorDoc._id,
    status: { $in: ["Scheduled", "In Progress", "Rescheduled", "Reassigned"] },
    slotStartIso: { $lt: windowEnd },
    slotEndIso: { $gt: startInstant },
  }).select("slotStartIso slotEndIso");

  const blockedSlots = await BlockedSlot.find({
    doctorId: doctorDoc._id,
    startTime: { $lt: windowEnd },
    endTime: { $gt: startInstant },
  }).select("startTime endTime");

  const slotIsFree = (candStart, candEnd) => {
    for (const ap of existingAppointments) {
      if (overlaps(candStart, candEnd, ap.slotStartIso, ap.slotEndIso))
        return false;
    }
    for (const b of blockedSlots) {
      if (overlaps(candStart, candEnd, b.startTime, b.endTime)) return false;
    }
    return true;
  };

  const now = new Date();

  // Convert the starting instant into IST calendar day
  const startIst = new Date(startInstant.getTime() + IST_OFFSET_MS);

  for (let dayIndex = 0; dayIndex <= maxDays; dayIndex++) {
    // dayIst = IST wall-clock date for this iteration
    const dayIst = new Date(startIst);
    dayIst.setUTCDate(dayIst.getUTCDate() + dayIndex);

    const y = dayIst.getUTCFullYear();
    const m = dayIst.getUTCMonth() + 1;
    const d = dayIst.getUTCDate();

    // ✅ NEW: Get weekday for this date (0=Sun...6=Sat)
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();

    // ✅ NEW: Check if this day is excluded
    if (excludedWeekdays.includes(weekday)) {
      continue; // Skip this day entirely
    }

    // ✅ NEW: Filter ranges based on mode
    let applicableRanges = [];
    if (availabilityMode === 'custom') {
      // Custom mode: only use ranges matching this weekday
      applicableRanges = dailyRanges.filter(r => r.day === weekday);
    } else {
      // Default mode: use all ranges (no day field)
      applicableRanges = dailyRanges.filter(r => r.day === undefined || r.day === null);
    }

    // ✅ UPDATED: Loop through applicable ranges only
    for (const range of applicableRanges) {
      if (!range || !range.start || !range.end) continue;

      const [sh, sm] = String(range.start)
        .split(":")
        .map((n) => parseInt(n, 10));
      const [eh, em] = String(range.end)
        .split(":")
        .map((n) => parseInt(n, 10));
      if (
        Number.isNaN(sh) ||
        Number.isNaN(sm) ||
        Number.isNaN(eh) ||
        Number.isNaN(em)
      )
        continue;

      // Working range boundaries in IST (as UTC instants)
      const rangeStart = makeIstInstant(y, m, d, sh ?? 0, sm ?? 0, 0, 0);
      const rangeEnd = makeIstInstant(y, m, d, eh ?? 0, em ?? 0, 0, 0);
      if (rangeEnd <= rangeStart) continue;

      let cursor = new Date(rangeStart);

      // For day 0, don't search before the requested 'from' instant
      if (dayIndex === 0 && startInstant > cursor) {
        cursor = new Date(startInstant);
      }

      while (
        cursor.getTime() + appointmentDuration * 60000 <= rangeEnd.getTime()
      ) {
        const candStart = new Date(cursor);
        const candEnd = new Date(
          candStart.getTime() + appointmentDuration * 60000
        );

        // Skip slots that finish before "from"
        if (candEnd <= startInstant) {
          cursor = new Date(cursor.getTime() + appointmentDuration * 60000);
          continue;
        }

        // Skip past slots
        if (candStart < now) {
          cursor = new Date(cursor.getTime() + appointmentDuration * 60000);
          continue;
        }

        if (slotIsFree(candStart.toISOString(), candEnd.toISOString())) {
          return { start: candStart, end: candEnd };
        }

        cursor = new Date(cursor.getTime() + appointmentDuration * 60000);
      }
    }
  }

  return null;
}



// Helper: sync appointment to Google Calendar (update if eventId exists else create)
async function syncAppointmentToGoogle(doctor, appt) {
  try {
    if (!doctor?.googleCalendar?.isConnected) return { success: false, error: 'Doctor not connected' };
    const patient = appt.patientId && appt.patientId._id ? appt.patientId : await Patient.findById(appt.patientId);

    if (appt.googleCalendar && appt.googleCalendar.eventId) {
      // try update
      const upd = await googleCalendarService.updateAppointmentEvent(doctor, appt.googleCalendar.eventId, {
        appointmentId: appt._id,
        slotStartIso: appt.slotStartIso,
        slotEndIso: appt.slotEndIso,
        status: appt.status,
        patientEmail: patient?.email,
        patientName: patient?.name
      });

      if (upd && upd.success) return { success: true, eventId: upd.eventId, eventLink: upd.eventLink };
      // fallback create
      const create = await googleCalendarService.createAppointmentEvent(doctor, patient, {
        appointmentId: appt._id,
        slotStartIso: appt.slotStartIso,
        slotEndIso: appt.slotEndIso,
        status: appt.status,
      });
      if (create && create.success) return { success: true, eventId: create.eventId, eventLink: create.eventLink };
      return { success: false, error: create?.error || upd?.error || 'Failed update/create' };
    } else {
      const create = await googleCalendarService.createAppointmentEvent(doctor, patient, {
        appointmentId: appt._id,
        slotStartIso: appt.slotStartIso,
        slotEndIso: appt.slotEndIso,
        status: appt.status,
      });
      if (create && create.success) return { success: true, eventId: create.eventId, eventLink: create.eventLink };
      return { success: false, error: create?.error || 'Failed create' };
    }
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
}


// List mass holidays (one row per batch)
router.get('/mass', authenticate, requireRole('admin', 'super_admin', 'receptionist'), async (req, res) => {
  try {
    const now = new Date();

    const agg = await BlockedSlot.aggregate([
      { $match: { isMassHoliday: true, endTime: { $gte: now } } },
      {
        $group: {
          _id: "$batchId",
          startTime: { $min: "$startTime" },
          endTime: { $max: "$endTime" },
          reason: { $first: "$reason" },
          createdAt: { $min: "$createdAt" },
          slotIds: { $push: "$_id" },
          doctorIds: { $push: "$doctorId" },
          count: { $sum: 1 }
        }
      },
      { $sort: { startTime: 1 } },
      {
        $project: {
          batchId: "$_id",
          _id: 0,
          startTime: 1,
          endTime: 1,
          reason: 1,
          createdAt: 1,
          doctorIds: 1,
          slotIds: 1,
          count: 1
        }
      }
    ]);

    return sendResponse(res, 200, 'Mass holidays fetched', agg);
  } catch (err) {
    console.error('Error fetching mass holidays:', err);
    return sendResponse(res, 500, 'Failed to fetch mass holidays', null);
  }
});

// Create mass holiday
router.post('/mass', authenticate, requireRole('admin', 'super_admin', 'receptionist'),
  async (req, res) => {
    const AUTO_RESCHEDULE_SEARCH_DAYS = 30;
    try {
      const { startTime, endTime, reason, doctorIds, autoReschedule = true, sendGoogleSync = true } = req.body;

      if (!startTime || !endTime) return sendResponse(res, 400, 'Start time and end time are required', null);
      const startDate = new Date(startTime);
      const endDate = new Date(endTime);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return sendResponse(res, 400, 'Invalid date/time format', null);
      }
      if (startDate >= endDate) return sendResponse(res, 400, 'End time must be after start time', null);
      if (startDate < new Date()) return sendResponse(res, 400, 'Cannot block time slots in the past', null);

      // Resolve doctors now (we'll reuse in background)
      let doctors;
      if (Array.isArray(doctorIds) && doctorIds.length) {
        doctors = await Doctor.find({ _id: { $in: doctorIds } });
      } else {
        doctors = await Doctor.find({});
      }
      if (!doctors || doctors.length === 0) return sendResponse(res, 404, 'No doctors found to apply mass block', null);

      const batchId = uuidv4();
      const now = new Date();
      const actor = req.user || {}; // capture user/actor for background use

      const slotsToInsert = doctors.map(d => ({
        doctorId: d._id,
        startTime: startDate,
        endTime: endDate,
        reason: reason || 'Mass holiday / hospital wide block',
        createdAt: now,
        updatedAt: now,
        batchId,
        isMassHoliday: true,
        createdBy: { id: actor.id || actor._id || null, role: actor.role || actor.type || null }
      }));

      // insert documents
      const inserted = await BlockedSlot.insertMany(slotsToInsert, { ordered: false });
      const createdCount = Array.isArray(inserted) ? inserted.length : 0;

      // ---------- FAST RESPONSE: return immediately ----------
      sendResponse(res, 201, `Mass block accepted - processing in background for ${createdCount} doctor(s)`, {
        batchId,
        createdCount,
        preview: inserted.map(s => ({ blockedSlotId: s._id, doctorId: s.doctorId }))
      });

      logBlockedSlotActivity(
        req,
        'Block dates (mass)',
        `Mass blocked ${createdCount} doctor(s) from ${startDate.toISOString()} to ${endDate.toISOString()}`,
        {
          batchId,
          createdCount,
          doctorCount: doctors.length,
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
          reason: reason || 'Mass holiday / hospital wide block',
        }
      );

      // ---------- BACKGROUND: process heavy work (google sync + auto-reschedule) ----------
      runInBackground(async () => {
        const results = [];
        try {
          // iterate inserted slots (serially to keep calls predictable; change to chunks if you want concurrency)
          for (const slot of inserted) {
            const doctor = doctors.find(d => String(d._id) === String(slot.doctorId));
            const entry = { blockedSlotId: slot._id, doctorId: slot.doctorId, google: null, reschedule: null };

            // --- Google sync (best-effort) ---
            if (sendGoogleSync && doctor?.googleCalendar?.isConnected && doctor.googleCalendar?.accessToken) {
              try {
                const calendarResult = await googleCalendarService.createBlockedSlotEvent(
                  doctor,
                  {
                    _id: slot._id,
                    startTime: slot.startTime.toISOString(),
                    endTime: slot.endTime.toISOString(),
                    reason: slot.reason,
                    blockedSlotId: slot._id
                  },
                  { noAttendees: true, sendNotifications: false, visibility: 'private', sendUpdates: 'none', onlyOnDoctorCalendar: true }
                );
                if (calendarResult && calendarResult.success) {
                  slot.googleCalendar = { eventId: calendarResult.eventId, synced: true, syncedAt: new Date() };
                  await slot.save();
                  entry.google = { success: true, eventId: calendarResult.eventId };
                } else {
                  slot.googleCalendar = { synced: false, syncError: calendarResult?.error || 'Unknown' };
                  await slot.save();
                  entry.google = { success: false, error: calendarResult?.error };
                }
              } catch (gErr) {
                slot.googleCalendar = { synced: false, syncError: gErr?.message || String(gErr) };
                await slot.save();
                entry.google = { success: false, error: gErr?.message || String(gErr) };
              }
            }

            // --- Auto-reschedule overlapping appointments (best-effort) ---
            if (autoReschedule) {
              try {
                const appts = await Appointment.find({
                  doctorId: slot.doctorId,
                  status: { $in: ['Scheduled', 'In Progress', 'Rescheduled', 'Reassigned'] },
                  slotStartIso: { $lt: slot.endTime },
                  slotEndIso: { $gt: slot.startTime }
                }).populate('patientId');

                const rescheduled = [], failed = [];
                for (const appt of appts) {
                  try {
                    const candidate = await findNextAvailableSlot(
                      doctor,
                      doctor?.appointmentDuration || 30,
                      new Date(slot.endTime),
                      AUTO_RESCHEDULE_SEARCH_DAYS
                    );
                    if (!candidate) {
                      failed.push({ appointmentId: appt._id, reason: 'No slot found' });
                      continue;
                    }

                    // update appointment (same logic as single-slot flow)
                    const histEntry = {
                      by: actor.id || null,
                      byType: actor.type || 'system',
                      at: new Date(),
                      batchId,
                      from: { start: appt.slotStartIso, end: appt.slotEndIso },
                      to: { start: candidate.start, end: candidate.end },
                      note: `Auto-rescheduled due to mass blocked slot (${slot._id})`
                    };
                    appt.date = new Date(candidate.start.getFullYear(), candidate.start.getMonth(), candidate.start.getDate());
                    appt.slotStartIso = candidate.start;
                    appt.slotEndIso = candidate.end;
                    appt.status = 'Rescheduled';
                    appt.rescheduleHistory = Array.isArray(appt.rescheduleHistory) ? appt.rescheduleHistory : [];
                    appt.rescheduleHistory.push(histEntry);
                    appt.rescheduleCount = Number(appt.rescheduleCount || 0) + 1;
                    appt.updatedAt = new Date();
                    await appt.save();

                    // google sync for appointment (best-effort)
                    try {
                      if (doctor && doctor.googleCalendar?.isConnected) {
                        const syncRes = await syncAppointmentToGoogle(doctor, appt);
                        appt.googleCalendar = { ...(appt.googleCalendar || {}), synced: !!syncRes.success, syncError: syncRes.error };
                        if (syncRes && syncRes.success) {
                          appt.googleCalendar.eventId = syncRes.eventId || appt.googleCalendar.eventId;
                          appt.googleCalendar.eventLink = syncRes.eventLink || appt.googleCalendar.eventLink;
                          appt.googleCalendar.lastSyncedAt = new Date();
                          appt.googleCalendar.syncError = undefined;
                        }
                        await appt.save();
                      }
                    } catch (calErr) {
                      appt.googleCalendar = { ...(appt.googleCalendar || {}), synced: false, syncError: calErr?.message || String(calErr) };
                      await appt.save();
                    }

                    // notify patient (best-effort)
                    try {
                      const patient = appt.patientId && appt.patientId._id ? appt.patientId : await Patient.findById(appt.patientId);
                      await notificationService.sendAppointmentRescheduledEmail({ appointment: appt, doctor, patient, requestedByRole: 'system', auto: true });
                    } catch (emailErr) {
                      console.error('Failed to notify patient', emailErr);
                    }

                    rescheduled.push({ appointmentId: appt._id, newStart: candidate.start });
                  } catch (innerErr) {
                    failed.push({ appointmentId: appt._id, reason: innerErr?.message || 'Unexpected' });
                  }
                } // end appts loop

                entry.reschedule = { attempted: appts.length, rescheduled: rescheduled.length, failed: failed.length ? failed : undefined, details: { rescheduled, failed } };
              } catch (rsErr) {
                entry.reschedule = { error: rsErr?.message || String(rsErr) };
                console.error('Mass reschedule fail for doctor', slot.doctorId, rsErr);
              }
            } // end autoReschedule

            results.push(entry);

            // OPTIONAL: you can update a BatchStatus DB doc here periodically so frontend can poll progress
          } // end slots loop

          // OPTIONAL: save results summary to DB (BatchStatus) if you want history/polling
          // e.g. await BatchStatus.create({ batchId, createdAt: now, finishedAt: new Date(), summary: results });

        } catch (bgErr) {
          console.error('[mass-block background] error processing batch', batchId, bgErr);
        }
      }); // runInBackground end

      // returned response already sent above
      return;
    } catch (error) {
      console.error('Error creating mass blocked slots:', error);
      return sendResponse(res, 500, error.message || 'Error creating mass blocked slots', null);
    }
  }
);


// Get specific blocked slot
router.get('/:slotId', authenticate, async (req, res) => {
  try {
    const { slotId } = req.params;
    const blockedSlot = await BlockedSlot.findById(slotId);
    if (!blockedSlot) return sendResponse(res, 404, 'Blocked slot not found', null);
    return sendResponse(res, 200, 'Blocked slot fetched successfully', blockedSlot);
  } catch (error) {
    console.error('Error fetching blocked slot:', error);
    return sendResponse(res, 500, 'Error fetching blocked slot', null);
  }
});

// Create single blocked slot (kept unchanged except for google/notification best-effort already present)
// Create single blocked slot (auto-reschedule + google in BACKGROUND)
router.post('/', authenticate, async (req, res) => {
  const AUTO_RESCHEDULE_SEARCH_DAYS = 30;

  try {
    const { doctorId, startTime, endTime, reason } = req.body;

    if (!doctorId) return sendResponse(res, 400, 'Doctor ID is required', null);
    if (!startTime || !endTime) {
      return sendResponse(res, 400, 'Start time and end time are required', null);
    }

    const startDate = new Date(startTime);
    const endDate = new Date(endTime);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return sendResponse(res, 400, 'Invalid date/time format', null);
    }
    if (startDate >= endDate) {
      return sendResponse(res, 400, 'End time must be after start time', null);
    }
    if (startDate < new Date()) {
      return sendResponse(res, 400, 'Cannot block time slots in the past', null);
    }

    // overlap check
    const overlapping = await BlockedSlot.findOne({
      doctorId,
      $or: [
        { startTime: { $lte: startDate }, endTime: { $gt: startDate } },
        { startTime: { $lt: endDate }, endTime: { $gte: endDate } },
        { startTime: { $gte: startDate }, endTime: { $lte: endDate } },
      ],
    });

    if (overlapping) {
      return sendResponse(res, 400, 'This time range overlaps with an existing blocked slot', {
        overlappingSlot: overlapping,
      });
    }

    const blockedSlot = new BlockedSlot({
      doctorId,
      startTime: startDate,
      endTime: endDate,
      reason: reason || 'Blocked for personal use',
    });

    await blockedSlot.save();

    const doctor = await Doctor.findById(doctorId);

    // ✅ FAST RESPONSE (NO waiting for google / reschedule)
    sendResponse(
      res,
      201,
      'Slot blocked successfully (auto-reschedule is running in background)',
      { blockedSlotId: blockedSlot._id, blockedSlot }
    );

    const doctorName = doctor?.name || 'doctor';
    logBlockedSlotActivity(
      req,
      'Block dates',
      `Blocked time for Dr. ${doctorName}: ${startDate.toISOString()} → ${endDate.toISOString()}`,
      {
        doctorId: String(doctorId),
        doctorName,
        blockedSlotId: String(blockedSlot._id),
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
        reason: blockedSlot.reason,
      }
    );

    if (!doctor) {
      console.warn('[blockedSlots] doctor not found for auto-reschedule/google', doctorId);
      return;
    }

    // 🔥 BACKGROUND: Google Calendar + auto-reschedule
    runInBackground(async () => {
      // ---------- Google Calendar sync for the blocked slot ----------
      if (doctor.googleCalendar?.isConnected && doctor.googleCalendar?.accessToken) {
        try {
          const calendarResult = await googleCalendarService.createBlockedSlotEvent(
            doctor,
            {
              _id: blockedSlot._id,
              startTime: blockedSlot.startTime.toISOString(),
              endTime: blockedSlot.endTime.toISOString(),
              reason: blockedSlot.reason,
              blockedSlotId: blockedSlot._id,
            },
            {
              noAttendees: true,
              sendNotifications: false,
              visibility: 'private',
              sendUpdates: 'none',
              onlyOnDoctorCalendar: true,
            }
          );

          if (calendarResult.success) {
            blockedSlot.googleCalendar = {
              eventId: calendarResult.eventId,
              synced: true,
              syncedAt: new Date(),
            };
          } else {
            blockedSlot.googleCalendar = {
              synced: false,
              syncError: calendarResult.error,
            };
          }
          await blockedSlot.save();
        } catch (calendarError) {
          console.error('Google Calendar sync for blocked slot failed', calendarError);
          blockedSlot.googleCalendar = {
            synced: false,
            syncError: calendarError.message || String(calendarError),
          };
          await blockedSlot.save();
        }
      }

      // ---------- Auto-reschedule overlapping appointments ----------
      try {
        const overlappingAppointments = await Appointment.find({
          doctorId,
          status: ['Scheduled', 'In Progress', 'Rescheduled', 'Reassigned'],
          slotStartIso: { $lt: blockedSlot.endTime },
          slotEndIso: { $gt: blockedSlot.startTime },
        }).populate('patientId');

        const rescheduled = [];
        const failedToReschedule = [];

        for (const appt of overlappingAppointments) {
          try {
            const searchFrom = new Date(blockedSlot.endTime);
            const candidate = await findNextAvailableSlot(
              doctor,
              doctor.appointmentDuration || 30,
              searchFrom,
              AUTO_RESCHEDULE_SEARCH_DAYS
            );

            if (!candidate) {
              failedToReschedule.push({
                appointmentId: appt._id,
                reason: 'No slot found within search window',
              });
              continue;
            }

            const histEntry = {
              by: req.user.id || null,
              byType: req.user.type || 'system',
              at: new Date(),
              from: {
                start: appt.slotStartIso ? new Date(appt.slotStartIso) : null,
                end: appt.slotEndIso ? new Date(appt.slotEndIso) : null,
              },
              to: { start: candidate.start, end: candidate.end },
              note: `Auto-rescheduled due to doctor blocked time (${blockedSlot._id})`,
            };

            appt.date = new Date(
              candidate.start.getFullYear(),
              candidate.start.getMonth(),
              candidate.start.getDate()
            );
            appt.slotStartIso = candidate.start;
            appt.slotEndIso = candidate.end;
            appt.status = 'Rescheduled';
            appt.rescheduleHistory = Array.isArray(appt.rescheduleHistory)
              ? appt.rescheduleHistory
              : [];
            appt.rescheduleHistory.push(histEntry);
            appt.rescheduleCount = Number(appt.rescheduleCount || 0) + 1;
            appt.updatedAt = new Date();
            await appt.save();

            // sync appointment to google (best-effort)
            try {
              if (doctor.googleCalendar?.isConnected) {
                const syncRes = await syncAppointmentToGoogle(doctor, appt);
                appt.googleCalendar = {
                  ...(appt.googleCalendar || {}),
                  synced: !!syncRes.success,
                  syncError: syncRes.error,
                };
                if (syncRes && syncRes.success) {
                  appt.googleCalendar.eventId =
                    syncRes.eventId || appt.googleCalendar.eventId;
                  appt.googleCalendar.eventLink =
                    syncRes.eventLink || appt.googleCalendar.eventLink;
                  appt.googleCalendar.lastSyncedAt = new Date();
                  appt.googleCalendar.syncError = undefined;
                }
                await appt.save();
              }
            } catch (calErr) {
              appt.googleCalendar = {
                ...(appt.googleCalendar || {}),
                synced: false,
                syncError: calErr?.message || String(calErr),
              };
              await appt.save();
            }

            // notify patient (best-effort)
            try {
              const patient =
                appt.patientId && appt.patientId._id
                  ? appt.patientId
                  : await Patient.findById(appt.patientId);
              await notificationService.sendAppointmentRescheduledEmail({
                appointment: appt,
                doctor,
                patient,
                requestedByRole: 'system',
                auto: true,
              });
            } catch (emailErr) {
              console.error('Failed to send reschedule email', emailErr);
            }

            rescheduled.push({
              appointmentId: appt._id,
              newStart: candidate.start,
              newEnd: candidate.end,
            });
          } catch (innerErr) {
            console.error('Error while rescheduling appointment', appt._id, innerErr);
            failedToReschedule.push({
              appointmentId: appt._id,
              reason: innerErr?.message || 'Unexpected error',
            });
          }
        }

        console.log(
          `[blockedSlots] auto-reschedule finished for doctor=${doctorId}, rescheduled=${rescheduled.length}, failed=${failedToReschedule.length}`
        );
      } catch (rescheduleErr) {
        console.error('Auto-reschedule process failed:', rescheduleErr);
      }
    });
  } catch (error) {
    console.error('Error creating blocked slot:', error);
    return sendResponse(res, 500, error.message || 'Error blocking slot', null);
  }
});


// Check if time slot is blocked
router.post('/check', authenticate, async (req, res) => {
  try {
    const { doctorId, startTime, endTime } = req.body;

    if (!doctorId || !startTime || !endTime) {
      return sendResponse(res, 400, 'Doctor ID, start time, and end time are required', null);
    }

    const requestedStart = new Date(startTime);
    const requestedEnd = new Date(endTime);

    const isBlocked = await BlockedSlot.findOne({
      doctorId: doctorId,
      $or: [
        { startTime: { $lte: requestedStart }, endTime: { $gt: requestedStart } },
        { startTime: { $lt: requestedEnd }, endTime: { $gte: requestedEnd } },
        { startTime: { $gte: requestedStart }, endTime: { $lte: requestedEnd } }
      ]
    });

    if (isBlocked) {
      return res.json({
        success: true,
        data: { isBlocked: true, blockedSlot: isBlocked },
        message: 'Time slot is blocked'
      });
    }

    return res.json({ success: true, data: { isBlocked: false }, message: 'Time slot is available' });
  } catch (error) {
    console.error('Error checking blocked slot:', error);
    return sendResponse(res, 500, 'Error checking slot availability', null);
  }
});

// Update blocked slot (now with auto-reschedule for overlapping appointments)
// Update blocked slot (auto-reschedule + google in BACKGROUND)
router.put('/:slotId', authenticate, async (req, res) => {
  const AUTO_RESCHEDULE_SEARCH_DAYS = 30;

  try {
    const { slotId } = req.params;
    const { startTime, endTime, reason } = req.body;
    const blockedSlot = await BlockedSlot.findById(slotId);

    if (!blockedSlot) return sendResponse(res, 404, 'Blocked slot not found', null);

    if (startTime) blockedSlot.startTime = new Date(startTime);
    if (endTime) blockedSlot.endTime = new Date(endTime);
    if (reason !== undefined) blockedSlot.reason = reason;

    if (blockedSlot.startTime >= blockedSlot.endTime) {
      return sendResponse(res, 400, 'End time must be after start time', null);
    }
    if (blockedSlot.startTime < new Date()) {
      return sendResponse(res, 400, 'Cannot update to time slots in the past', null);
    }

    const overlapping = await BlockedSlot.findOne({
      _id: { $ne: slotId },
      doctorId: blockedSlot.doctorId,
      $or: [
        {
          startTime: { $lte: blockedSlot.startTime },
          endTime: { $gt: blockedSlot.startTime },
        },
        {
          startTime: { $lt: blockedSlot.endTime },
          endTime: { $gte: blockedSlot.endTime },
        },
        {
          startTime: { $gte: blockedSlot.startTime },
          endTime: { $lte: blockedSlot.endTime },
        },
      ],
    });

    if (overlapping) {
      return sendResponse(
        res,
        400,
        'Updated time range overlaps with another blocked slot',
        null
      );
    }

    await blockedSlot.save();
    const doctor = await Doctor.findById(blockedSlot.doctorId);

    // ✅ FAST RESPONSE
    sendResponse(
      res,
      200,
      'Blocked slot updated successfully (auto-reschedule running in background)',
      { blockedSlotId: blockedSlot._id, blockedSlot }
    );

    logBlockedSlotActivity(
      req,
      'Update blocked dates',
      `Updated blocked time for Dr. ${doctor?.name || 'doctor'}: ${blockedSlot.startTime.toISOString()} → ${blockedSlot.endTime.toISOString()}`,
      {
        doctorId: String(blockedSlot.doctorId),
        doctorName: doctor?.name,
        blockedSlotId: String(blockedSlot._id),
        startTime: blockedSlot.startTime.toISOString(),
        endTime: blockedSlot.endTime.toISOString(),
        reason: blockedSlot.reason,
      }
    );

    if (!doctor) {
      console.warn('[blockedSlots] doctor not found for update background tasks');
      return;
    }

    // 🔥 BACKGROUND: google calendar + auto-reschedule
    runInBackground(async () => {
      // --- Google calendar patch/create ---
      if (doctor.googleCalendar?.isConnected && doctor.googleCalendar?.accessToken) {
        try {
          const updRes = await googleCalendarService.updateBlockedSlotEvent(
            doctor,
            blockedSlot._id, // 👈 FIXED: use blockedSlot._id, not "slot"
            {
              startTime: blockedSlot.startTime,
              endTime: blockedSlot.endTime,
              reason: blockedSlot.reason,
            },
            {
              noAttendees: true,
              sendNotifications: false,
              visibility: 'private',
              sendUpdates: 'none',
              onlyOnDoctorCalendar: true,
            }
          );

          if (updRes && updRes.success) {
            blockedSlot.googleCalendar = {
              ...(blockedSlot.googleCalendar || {}),
              eventId: updRes.eventId || blockedSlot.googleCalendar?.eventId,
              synced: true,
              syncedAt: new Date(),
            };
          } else {
            blockedSlot.googleCalendar = {
              ...(blockedSlot.googleCalendar || {}),
              synced: false,
              syncError: updRes?.error || 'update failed',
            };
          }
          await blockedSlot.save();
        } catch (calErr) {
          console.warn(
            'Calendar patch/create for updated blocked slot failed (non-fatal):',
            calErr
          );
          blockedSlot.googleCalendar = {
            ...(blockedSlot.googleCalendar || {}),
            synced: false,
            syncError: calErr?.message || String(calErr),
          };
          await blockedSlot.save();
        }
      }

      // --- Auto-reschedule overlapping appointments ---
      try {
        const overlappingAppointments = await Appointment.find({
          doctorId: doctor._id,
          status: ['Scheduled', 'In Progress', 'Rescheduled', 'Reassigned'],
          slotStartIso: { $lt: blockedSlot.endTime },
          slotEndIso: { $gt: blockedSlot.startTime },
        }).populate('patientId');

        if (!overlappingAppointments.length) {
          console.log(
            `[blockedSlots] no overlapping appointments to reschedule for updated slot ${blockedSlot._id}`
          );
          return;
        }

        const rescheduled = [];
        const failedToReschedule = [];

        for (const appt of overlappingAppointments) {
          try {
            const searchFrom = new Date(blockedSlot.endTime);
            const candidate = await findNextAvailableSlot(
              doctor,
              doctor.appointmentDuration || 30,
              searchFrom,
              AUTO_RESCHEDULE_SEARCH_DAYS
            );

            if (!candidate) {
              failedToReschedule.push({
                appointmentId: appt._id,
                reason: 'No slot found within search window',
              });
              continue;
            }

            const histEntry = {
              by: req.user.id || null,
              byType: req.user.type || 'system',
              at: new Date(),
              from: { start: appt.slotStartIso, end: appt.slotEndIso },
              to: { start: candidate.start, end: candidate.end },
              note: `Auto-rescheduled due to blocked slot update (${blockedSlot._id})`,
            };

            appt.date = new Date(
              candidate.start.getFullYear(),
              candidate.start.getMonth(),
              candidate.start.getDate()
            );
            appt.slotStartIso = candidate.start;
            appt.slotEndIso = candidate.end;
            appt.status = 'Rescheduled';
            appt.rescheduleHistory = Array.isArray(appt.rescheduleHistory)
              ? appt.rescheduleHistory
              : [];
            appt.rescheduleHistory.push(histEntry);
            appt.rescheduleCount = Number(appt.rescheduleCount || 0) + 1;
            appt.updatedAt = new Date();
            await appt.save();

            // sync to Google (best-effort)
            try {
              if (doctor.googleCalendar?.isConnected) {
                const syncRes = await syncAppointmentToGoogle(doctor, appt);
                appt.googleCalendar = {
                  ...(appt.googleCalendar || {}),
                  synced: !!syncRes.success,
                  syncError: syncRes.error,
                };
                if (syncRes && syncRes.success) {
                  appt.googleCalendar.eventId =
                    syncRes.eventId || appt.googleCalendar.eventId;
                  appt.googleCalendar.eventLink =
                    syncRes.eventLink || appt.googleCalendar.eventLink;
                  appt.googleCalendar.lastSyncedAt = new Date();
                  appt.googleCalendar.syncError = undefined;
                }
                await appt.save();
              }
            } catch (calErr2) {
              appt.googleCalendar = {
                ...(appt.googleCalendar || {}),
                synced: false,
                syncError: calErr2?.message || String(calErr2),
              };
              await appt.save();
            }

            // notify patient (best-effort)
            try {
              const patient =
                appt.patientId && appt.patientId._id
                  ? appt.patientId
                  : await Patient.findById(appt.patientId);
              await notificationService.sendAppointmentRescheduledEmail({
                appointment: appt,
                doctor,
                patient,
                requestedByRole: 'system',
                auto: true,
              });
            } catch (emailErr) {
              console.error('Failed to send reschedule email', emailErr);
            }

            rescheduled.push({
              appointmentId: appt._id,
              newStart: candidate.start,
              newEnd: candidate.end,
            });
          } catch (errInner) {
            console.error('Error rescheduling appointment', appt._id, errInner);
            failedToReschedule.push({
              appointmentId: appt._id,
              reason: errInner?.message || 'Unexpected',
            });
          }
        }

        console.log(
          `[blockedSlots] update auto-reschedule finished; rescheduled=${rescheduled.length}, failed=${failedToReschedule.length}`
        );
      } catch (resErr) {
        console.error('Reschedule attempt after update failed', resErr);
      }
    });
  } catch (error) {
    console.error('Error updating blocked slot:', error);
    return sendResponse(res, 500, 'Error updating blocked slot', null);
  }
});


// Delete blocked slot
router.delete('/:slotId', authenticate, async (req, res) => {
  try {
    const { slotId } = req.params;
    const blockedSlot = await BlockedSlot.findById(slotId);
    if (!blockedSlot) return sendResponse(res, 404, 'Blocked slot not found', null);

    const identifier = blockedSlot.googleCalendar?.eventId || String(blockedSlot._id);

    if (identifier) {
      try {
        const doctor = await Doctor.findById(blockedSlot.doctorId);
        if (doctor?.googleCalendar?.isConnected) {
          const delRes = await googleCalendarService.deleteBlockedSlotEvent(doctor, identifier);
          if (!(delRes && delRes.success)) {
            console.warn('Failed to remove blocked slot from calendar (non-fatal):', delRes?.error);
          }
        }
      } catch (calendarError) {
        console.warn('Failed to remove blocked slot from calendar (non-fatal):', calendarError?.message || calendarError);
      }
    }

    const deleted = await BlockedSlot.findByIdAndDelete(slotId);
    const doctor = await Doctor.findById(blockedSlot.doctorId).select('name').lean();
    logBlockedSlotActivity(
      req,
      'Unblock dates',
      `Removed blocked time for Dr. ${doctor?.name || 'doctor'}: ${blockedSlot.startTime?.toISOString?.() || ''} → ${blockedSlot.endTime?.toISOString?.() || ''}`,
      {
        doctorId: String(blockedSlot.doctorId),
        doctorName: doctor?.name,
        blockedSlotId: String(slotId),
        startTime: blockedSlot.startTime,
        endTime: blockedSlot.endTime,
        reason: blockedSlot.reason,
      }
    );
    return sendResponse(res, 200, 'Blocked slot deleted successfully', deleted);
  } catch (error) {
    console.error('Error deleting blocked slot:', error);
    return sendResponse(res, 500, 'Error deleting blocked slot', null);
  }
});

// Cleanup single slot — deletes calendar events matching blockedSlotId (or eventId fallback)
router.post('/cleanup/:slotId', authenticate, async (req, res) => {
  try {
    const { slotId } = req.params;
    const slot = await BlockedSlot.findById(slotId);
    if (!slot) return sendResponse(res, 404, 'Blocked slot not found', null);
    const doctor = await Doctor.findById(slot.doctorId);
    if (!doctor) return sendResponse(res, 404, 'Doctor not found for slot', null);

    const identifier = slot.googleCalendar?.eventId || String(slot._id);
    const delRes = await googleCalendarService.deleteBlockedSlotEvent(doctor, identifier);
    if (!delRes || !delRes.success) {
      return sendResponse(res, 200, 'Cleanup attempted; check logs for details', { deleted: false, details: delRes });
    }
    return sendResponse(res, 200, 'Cleanup succeeded for blocked slot', { deleted: true });
  } catch (err) {
    console.error('cleanup slot error', err);
    return sendResponse(res, 500, 'Cleanup failed', null);
  }
});

// Cleanup doctor: iterate slots and remove events for each
router.post('/cleanup/doctor/:doctorId', authenticate, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) return sendResponse(res, 404, 'Doctor not found', null);

    const slots = await BlockedSlot.find({ doctorId });
    const results = [];
    for (const s of slots) {
      try {
        const identifier = s.googleCalendar?.eventId || String(s._id);
        const r = await googleCalendarService.deleteBlockedSlotEvent(doctor, identifier);
        results.push({ slotId: s._id, success: !!(r && r.success), error: r && r.error });
      } catch (e) {
        results.push({ slotId: s._id, success: false, error: e?.message || String(e) });
      }
    }
    return sendResponse(res, 200, 'Cleanup completed (see details)', { results });
  } catch (err) {
    console.error('cleanup doctor error', err);
    return sendResponse(res, 500, 'Cleanup failed', null);
  }
});

// PUT /mass/:batchId  — FAST response + background processing for edits
router.put('/mass/:batchId', authenticate, requireRole('admin', 'super_admin', 'receptionist'), async (req, res) => {
  const AUTO_RESCHEDULE_SEARCH_DAYS = 30;
  try {
    const { batchId } = req.params;
    const { startTime, endTime, reason, autoReschedule = true, sendGoogleSync = true } = req.body;

    if (!batchId) return sendResponse(res, 400, 'batchId is required', null);

    // Validate provided times (if present)
    let startDate = null, endDate = null;
    if (startTime) startDate = new Date(startTime);
    if (endTime) endDate = new Date(endTime);
    if ((startDate && isNaN(startDate.getTime())) || (endDate && isNaN(endDate.getTime()))) {
      return sendResponse(res, 400, 'Invalid start or end time', null);
    }
    if (startDate && endDate && startDate >= endDate) return sendResponse(res, 400, 'End time must be after start time', null);
    if (startDate && startDate < new Date()) return sendResponse(res, 400, 'Cannot set mass block in the past', null);

    // Load all slots for batch
    const slots = await BlockedSlot.find({ batchId });
    if (!slots || slots.length === 0) return sendResponse(res, 404, 'No mass holiday found for batchId', null);

    // QUICK APPLY: update DB records now (fast). We'll update each doc and save
    const now = new Date();
    const actor = req.user || {};
    const updatedSlots = [];
    for (const slot of slots) {
      if (startDate) slot.startTime = startDate;
      if (endDate) slot.endTime = endDate;
      if (reason !== undefined) slot.reason = reason;
      slot.updatedAt = now;
      // keep batchId etc intact
      await slot.save();
      updatedSlots.push(slot);
    }

    // FAST response to client
    sendResponse(res, 200, `Mass holiday update accepted - processing reschedule in background`, {
      batchId,
      updatedCount: updatedSlots.length,
      preview: updatedSlots.map(s => ({ blockedSlotId: s._id, doctorId: s.doctorId, startTime: s.startTime, endTime: s.endTime }))
    });

    // BACKGROUND: process each updated slot for Google-sync + reschedule
    runInBackground(async () => {
      try {
        const results = [];
        // iterate serially to keep external API calls predictable (you can batch or add concurrency later)
        for (const slot of updatedSlots) {
          const entry = { blockedSlotId: slot._id, doctorId: slot.doctorId, google: null, reschedule: null };

          // fetch fresh doctor doc (ensure availability fields for findNextAvailableSlot)
          const doctor = await Doctor.findById(slot.doctorId);

          // 1) Google patch/create — best-effort (works with edited times)
          if (sendGoogleSync && doctor?.googleCalendar?.isConnected) {
            try {
              const updRes = await googleCalendarService.updateBlockedSlotEvent(
                doctor,
                slot._id,
                { startTime: slot.startTime, endTime: slot.endTime, reason: slot.reason },
                { noAttendees: true, sendNotifications: false, visibility: 'private', sendUpdates: 'none', onlyOnDoctorCalendar: true }
              );

              if (updRes && updRes.success) {
                slot.googleCalendar = { ...(slot.googleCalendar || {}), eventId: updRes.eventId || slot.googleCalendar?.eventId, synced: true, syncedAt: new Date() };
                await slot.save();
                entry.google = { success: true, eventId: updRes.eventId || slot.googleCalendar?.eventId };
              } else {
                // If update failed, try create (some implementations prefer create fallback)
                if (updRes && updRes.error && String(updRes.error).includes('notFound')) {
                  try {
                    const createRes = await googleCalendarService.createBlockedSlotEvent(doctor, {
                      _id: slot._id,
                      startTime: slot.startTime.toISOString(),
                      endTime: slot.endTime.toISOString(),
                      reason: slot.reason,
                      blockedSlotId: slot._id
                    }, { noAttendees: true, sendNotifications: false, visibility: 'private', sendUpdates: 'none', onlyOnDoctorCalendar: true });

                    if (createRes && createRes.success) {
                      slot.googleCalendar = { eventId: createRes.eventId, synced: true, syncedAt: new Date() };
                      await slot.save();
                      entry.google = { success: true, eventId: createRes.eventId };
                    } else {
                      slot.googleCalendar = { ...(slot.googleCalendar || {}), synced: false, syncError: createRes?.error || updRes?.error || 'Unknown' };
                      await slot.save();
                      entry.google = { success: false, error: createRes?.error || updRes?.error };
                    }
                  } catch (crErr) {
                    slot.googleCalendar = { ...(slot.googleCalendar || {}), synced: false, syncError: crErr?.message || String(crErr) };
                    await slot.save();
                    entry.google = { success: false, error: crErr?.message || String(crErr) };
                  }
                } else {
                  slot.googleCalendar = { ...(slot.googleCalendar || {}), synced: false, syncError: updRes?.error || 'update failed' };
                  await slot.save();
                  entry.google = { success: false, error: updRes?.error };
                }
              }
            } catch (gErr) {
              slot.googleCalendar = { ...(slot.googleCalendar || {}), synced: false, syncError: gErr?.message || String(gErr) };
              await slot.save();
              entry.google = { success: false, error: gErr?.message || String(gErr) };
            }
          }

          // 2) Auto-reschedule overlapping appointments (best-effort)
          if (autoReschedule) {
            try {
              // find appointments overlapping the **edited** slot interval
              const appts = await Appointment.find({
                doctorId: slot.doctorId,
                status: { $in: ['Scheduled', 'In Progress', 'Rescheduled', 'Reassigned'] },
                slotStartIso: { $lt: slot.endTime },
                slotEndIso: { $gt: slot.startTime }
              }).populate('patientId');

              const rescheduled = [];
              const failed = [];

              // ensure doctorDoc for searching
              const doctorDoc = doctor || await Doctor.findById(slot.doctorId);

              for (const appt of appts) {
                try {
                  // search from end of edited slot (so we don't move into the same block)
                  const searchFrom = new Date(slot.endTime);
                  const candidate = await findNextAvailableSlot(
                    doctorDoc,
                    doctorDoc?.appointmentDuration || 30,
                    searchFrom,
                    AUTO_RESCHEDULE_SEARCH_DAYS
                  );

                  if (!candidate) {
                    failed.push({ appointmentId: appt._id, reason: 'No slot found' });
                    continue;
                  }

                  const histEntry = {
                    by: req.user?.id || actor.id || null,
                    byType: req.user?.type || actor.type || 'system',
                    at: new Date(),
                    batchId,
                    from: { start: appt.slotStartIso, end: appt.slotEndIso },
                    to: { start: candidate.start, end: candidate.end },
                    note: `Auto-rescheduled due to mass holiday edit (${batchId})`
                  };

                  appt.date = new Date(candidate.start.getFullYear(), candidate.start.getMonth(), candidate.start.getDate());
                  appt.slotStartIso = candidate.start;
                  appt.slotEndIso = candidate.end;
                  appt.status = 'Rescheduled';
                  appt.rescheduleHistory = Array.isArray(appt.rescheduleHistory) ? appt.rescheduleHistory : [];
                  appt.rescheduleHistory.push(histEntry);
                  appt.rescheduleCount = Number(appt.rescheduleCount || 0) + 1;
                  appt.updatedAt = new Date();
                  await appt.save();

                  // sync to Google for appointment (best-effort)
                  try {
                    if (doctorDoc && doctorDoc.googleCalendar?.isConnected) {
                      const syncRes = await syncAppointmentToGoogle(doctorDoc, appt);
                      appt.googleCalendar = { ...(appt.googleCalendar || {}), synced: !!syncRes.success, syncError: syncRes.error };
                      if (syncRes && syncRes.success) {
                        appt.googleCalendar.eventId = syncRes.eventId || appt.googleCalendar.eventId;
                        appt.googleCalendar.eventLink = syncRes.eventLink || appt.googleCalendar.eventLink;
                        appt.googleCalendar.lastSyncedAt = new Date();
                        appt.googleCalendar.syncError = undefined;
                      }
                      await appt.save();
                    }
                  } catch (calErr) {
                    appt.googleCalendar = { ...(appt.googleCalendar || {}), synced: false, syncError: calErr?.message || String(calErr) };
                    await appt.save();
                  }

                  // notify patient (best-effort)
                  try {
                    const patient = appt.patientId && appt.patientId._id ? appt.patientId : await Patient.findById(appt.patientId);
                    await notificationService.sendAppointmentRescheduledEmail({ appointment: appt, doctor: doctorDoc, patient, requestedByRole: 'system', auto: true });
                  } catch (emailErr) {
                    console.error('Failed to notify patient', emailErr);
                  }

                  rescheduled.push({ appointmentId: appt._id, newStart: candidate.start, newEnd: candidate.end });
                } catch (innerErr) {
                  failed.push({ appointmentId: appt._id, reason: innerErr?.message || 'Unexpected' });
                }
              } // end appts loop

              entry.reschedule = { attempted: appts.length, rescheduled: rescheduled.length, failed: failed.length ? failed : undefined, details: { rescheduled, failed } };
            } catch (rsErr) {
              entry.reschedule = { error: rsErr?.message || String(rsErr) };
              console.error('Mass update reschedule fail for slot', slot._id, rsErr);
            }
          } // end autoReschedule

          results.push(entry);
        } // end updatedSlots loop

        // OPTIONAL: persist results summary to DB for polling or auditing:
        // await BatchStatus.create({ batchId, kind: 'mass-edit', createdAt: new Date(), finishedAt: new Date(), summary: results });

        console.log('[mass-edit background] finished', { batchId, processed: results.length });
      } catch (bgErr) {
        console.error('[mass-edit background] error processing batch', batchId, bgErr);
      }
    }); // runInBackground end

    // client already sent response above
    return;
  } catch (err) {
    console.error('Error updating mass holiday', err);
    return sendResponse(res, 500, 'Failed to update mass holiday', null);
  }
});


// Replace existing router.delete('/mass/:batchId', ...) with this FAST version
router.delete('/mass/:batchId', authenticate, requireRole('admin', 'super_admin', 'receptionist'), async (req, res) => {
  try {
    const { batchId } = req.params;
    if (!batchId) return sendResponse(res, 400, 'batchId required', null);

    // Load slots and prefetch doctors now (so background has what it needs)
    const slots = await BlockedSlot.find({ batchId }).lean();
    if (!slots || !slots.length) return sendResponse(res, 404, 'No mass holiday found', null);

    const doctorIds = [...new Set(slots.map(s => String(s.doctorId)))];
    const doctors = await Doctor.find({ _id: { $in: doctorIds } }).lean();

    // immediate/faster response: we accepted deletion request; background will perform actual deletions and appointment work
    sendResponse(res, 200, `Mass holiday deletion accepted - processing in background for ${slots.length} slot(s)`, {
      batchId,
      slotCount: slots.length,
      doctorCount: doctors.length,
      preview: slots.slice(0, 10).map(s => ({ blockedSlotId: s._id, doctorId: s.doctorId }))
    });

    // Background: delete calendar events, try to re-place rescheduled appointments, then remove slot docs
    runInBackground(async () => {
      const results = [];
      try {
        for (const s of slots) {
          const entry = { blockedSlotId: s._id, doctorId: s.doctorId, google: null, undoneAppointments: null };
          try {
            const doctor = doctors.find(d => String(d._id) === String(s.doctorId)) || await Doctor.findById(s.doctorId);

            // 1) delete calendar event (best-effort)
            try {
              const identifier = s.googleCalendar?.eventId || String(s._id);
              if (doctor?.googleCalendar?.isConnected) {
                const delRes = await googleCalendarService.deleteBlockedSlotEvent(doctor, identifier);
                entry.google = { success: !!(delRes && delRes.success), error: delRes && delRes.error };
              } else {
                entry.google = { success: false, error: 'Doctor not connected to Google' };
              }
            } catch (gErr) {
              entry.google = { success: false, error: gErr?.message || String(gErr) };
            }

            // 2) Attempt to reposition appointments that were rescheduled due to this batch (best-effort)
            try {
              const appts = await Appointment.find({ 'rescheduleHistory.batchId': batchId }).populate('patientId');
              const attempted = [];
              const failed = [];

              for (const appt of appts) {
                try {
                  const doctorDoc = doctor || await Doctor.findById(appt.doctorId);
                  if (!doctorDoc) {
                    failed.push({ appointmentId: appt._id, reason: 'Doctor not found' });
                    continue;
                  }

                  // search from now (policy)
                  const candidate = await findNextAvailableSlot(doctorDoc, doctorDoc.appointmentDuration || 30, new Date(), 14);
                  if (!candidate) {
                    failed.push({ appointmentId: appt._id, reason: 'No slot found to move after deletion' });
                    continue;
                  }

                  const histEntry = {
                    by: null, byType: 'system', at: new Date(), batchId,
                    from: { start: appt.slotStartIso, end: appt.slotEndIso },
                    to: { start: candidate.start, end: candidate.end },
                    note: `Auto-rescheduled after mass holiday deletion (${batchId})`
                  };

                  appt.date = new Date(candidate.start.getFullYear(), candidate.start.getMonth(), candidate.start.getDate());
                  appt.slotStartIso = candidate.start;
                  appt.slotEndIso = candidate.end;
                  appt.status = 'Rescheduled';
                  appt.rescheduleHistory = Array.isArray(appt.rescheduleHistory) ? appt.rescheduleHistory : [];
                  appt.rescheduleHistory.push(histEntry);
                  appt.rescheduleCount = Number(appt.rescheduleCount || 0) + 1;
                  appt.updatedAt = new Date();
                  await appt.save();

                  attempted.push({ appointmentId: appt._id, newStart: candidate.start });
                } catch (innerErr) {
                  console.error('Error restoring appointment after mass delete', innerErr);
                  failed.push({ appointmentId: appt._id, reason: innerErr?.message || 'Unexpected' });
                }
              } // end appts loop

              entry.undoneAppointments = { attempted: attempted.length, failed: failed.length ? failed : undefined, details: { attempted, failed } };
            } catch (apErr) {
              entry.undoneAppointments = { error: apErr?.message || String(apErr) };
            }

            // 3) finally delete the slot document (best-effort)
            try {
              await BlockedSlot.findByIdAndDelete(s._id);
            } catch (delErr) {
              console.error('Failed to delete slot doc', s._id, delErr);
            }

            results.push(entry);
          } catch (slotErr) {
            console.error('Error processing slot in mass delete background', s._id, slotErr);
            results.push({ blockedSlotId: s._id, error: slotErr?.message || String(slotErr) });
          }
        } // end slots loop

        // OPTIONAL: persist summary to BatchStatus model if implemented:
        // await BatchStatus.create({ batchId, createdAt: new Date(), finishedAt: new Date(), summary: results });

        console.log(`[blockedSlots] mass delete background finished for batch=${batchId}`);
      } catch (bgErr) {
        console.error('[blockedSlots] mass delete background error for batch=', batchId, bgErr);
      }
    });
    return;
  } catch (err) {
    console.error('Error accepting mass holiday deletion:', err);
    return sendResponse(res, 500, 'Failed to accept mass holiday deletion', null);
  }
});


router.get('/mass/:batchId', authenticate, requireRole('admin', 'super_admin', 'receptionist'), async (req, res) => {
  try {
    const { batchId } = req.params;
    const slots = await BlockedSlot.find({ batchId }).sort({ startTime: 1 });
    if (!slots.length) return sendResponse(res, 404, 'No mass holiday found for this batchId', null);
    return sendResponse(res, 200, 'Mass holiday slots fetched', slots);
  } catch (err) {
    console.error('Error fetching mass batch:', err);
    return sendResponse(res, 500, 'Failed to fetch mass batch', null);
  }
});

// Get blocked slots for a doctor (ongoing + upcoming)
router.get('/doctor/:doctorId', async (req, res) => {
  try {
    const { doctorId } = req.params;
    if (!doctorId) return sendResponse(res, 400, 'doctorId is required', null);

    const futureOnly = req.query.futureOnly !== 'false'; // default true

    const now = new Date();
    const match = { doctorId };
    if (futureOnly) {
      match.endTime = { $gte: now };
    }

    const slots = await BlockedSlot.find(match)
      .select('_id doctorId startTime endTime reason isMassHoliday batchId googleCalendar createdAt')
      .sort({ startTime: 1 })
      .lean();

    return sendResponse(res, 200, 'Doctor blocked slots fetched', slots);
  } catch (err) {
    console.error('Error fetching doctor blocked slots:', err);
    return sendResponse(res, 500, 'Failed to fetch blocked slots', null);
  }
});

module.exports = router;