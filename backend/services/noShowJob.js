const Appointment = require('../modal/Appointment');
const Patient = require('../modal/Patient');
const googleCalendarService = require('./googleCalendar');
const notificationService = require('./notificationService');

const DEFAULT_GRACE_MINUTES = 30;
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

/** Upcoming visit states that should auto-mark as Missed after slot end + grace */
const AUTO_MISS_STATUSES = ['Scheduled', 'Rescheduled', 'Reassigned'];

let intervalHandle = null;
let isRunning = false;

function getGraceMinutes() {
  const parsed = Number(process.env.NO_SHOW_GRACE_MINUTES);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_GRACE_MINUTES;
}

function getIntervalMs() {
  const parsed = Number(process.env.NO_SHOW_JOB_INTERVAL_MS);
  return Number.isFinite(parsed) && parsed >= 60_000 ? parsed : DEFAULT_INTERVAL_MS;
}

function isJobEnabled() {
  const flag = String(process.env.NO_SHOW_JOB_ENABLED || 'true').toLowerCase();
  return flag !== 'false' && flag !== '0' && flag !== 'off';
}

async function syncMissedAppointmentSideEffects(appointmentId, previousStatus) {
  try {
    const appointment = await Appointment.findById(appointmentId)
      .populate('doctorId')
      .populate('patientId')
      .lean()
      .exec();

    if (!appointment) return;

    const doctorDoc = appointment.doctorId;
    if (doctorDoc) {
      const eventId = appointment.googleCalendar?.eventId || null;
      try {
        const res = eventId
          ? await googleCalendarService.updateAppointmentEvent(
              doctorDoc,
              eventId,
              appointment
            )
          : await googleCalendarService.createAppointmentEvent(
              doctorDoc,
              appointment.patientId,
              appointment
            );

        if (res?.success && res.eventId) {
          await Appointment.findByIdAndUpdate(appointmentId, {
            'googleCalendar.eventId': res.eventId,
            'googleCalendar.synced': true,
            'googleCalendar.lastSyncedAt': new Date(),
          }).exec();
        }
      } catch (calErr) {
        console.warn(
          '[noShowJob] Google Calendar sync failed:',
          calErr?.message || calErr
        );
      }
    }

    if (appointment.patientId?.email && doctorDoc) {
      try {
        await notificationService.sendAppointmentStatusChangedEmail({
          appointment,
          doctor: doctorDoc,
          patient: appointment.patientId,
          previousStatus,
          newStatus: 'Missed',
          changedByRole: 'system',
        });
      } catch (emailErr) {
        console.warn(
          '[noShowJob] Status email failed:',
          emailErr?.message || emailErr
        );
      }
    }
  } catch (err) {
    console.warn('[noShowJob] Side-effect sync failed:', err?.message || err);
  }
}

/**
 * Mark Scheduled appointments as Missed when slot end + grace period has passed
 * and the patient never checked in.
 */
async function markOverdueAppointmentsAsNoShow() {
  if (isRunning) {
    console.log('[noShowJob] Previous run still in progress, skipping');
    return { skipped: true };
  }

  isRunning = true;
  const graceMs = getGraceMinutes() * 60 * 1000;
  const cutoff = new Date(Date.now() - graceMs);

  let marked = 0;
  let patientCountsUpdated = 0;

  try {
    const overdue = await Appointment.find({
      status: { $in: AUTO_MISS_STATUSES },
      slotEndIso: { $lt: cutoff },
    })
      .select('_id patientId status slotEndIso')
      .lean();

    if (!overdue.length) {
      return { marked: 0, patientCountsUpdated: 0, checked: 0 };
    }

    for (const appt of overdue) {
      const updated = await Appointment.findOneAndUpdate(
        { _id: appt._id, status: { $in: AUTO_MISS_STATUSES } },
        { $set: { status: 'Missed', updatedAt: new Date() } },
        { new: true }
      );

      if (!updated) continue;

      marked += 1;

      if (updated.patientId) {
        try {
          await Patient.findByIdAndUpdate(updated.patientId, {
            $inc: { noShowCount: 1 },
          });
          patientCountsUpdated += 1;
        } catch (countErr) {
          console.warn(
            '[noShowJob] Failed to increment noShowCount:',
            countErr?.message || countErr
          );
        }
      }

      setImmediate(() => {
        syncMissedAppointmentSideEffects(appt._id, appt.status || 'Scheduled');
      });
    }

    if (marked > 0) {
      console.log(
        `[noShowJob] Auto-marked ${marked} appointment(s) as Missed (grace: ${getGraceMinutes()} min)`
      );
    }

    return {
      marked,
      patientCountsUpdated,
      checked: overdue.length,
    };
  } catch (err) {
    console.error('[noShowJob] Run failed:', err?.message || err);
    return { error: err?.message || String(err) };
  } finally {
    isRunning = false;
  }
}

function startNoShowJob() {
  if (!isJobEnabled()) {
    console.log('[noShowJob] Disabled via NO_SHOW_JOB_ENABLED');
    return;
  }

  if (intervalHandle) return;

  const intervalMs = getIntervalMs();
  const graceMinutes = getGraceMinutes();

  console.log(
    `[noShowJob] Starting (every ${Math.round(intervalMs / 60000)} min, grace ${graceMinutes} min after slot end)`
  );

  // Run once shortly after startup, then on interval
  setTimeout(() => {
    markOverdueAppointmentsAsNoShow().catch((err) => {
      console.error('[noShowJob] Initial run failed:', err?.message || err);
    });
  }, 10_000);

  intervalHandle = setInterval(() => {
    markOverdueAppointmentsAsNoShow().catch((err) => {
      console.error('[noShowJob] Scheduled run failed:', err?.message || err);
    });
  }, intervalMs);

  if (typeof intervalHandle.unref === 'function') {
    intervalHandle.unref();
  }
}

function stopNoShowJob() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = {
  startNoShowJob,
  stopNoShowJob,
  markOverdueAppointmentsAsNoShow,
};
