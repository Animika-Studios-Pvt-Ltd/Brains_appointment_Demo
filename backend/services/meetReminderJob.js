const Appointment = require('../modal/Appointment');
const AppointmentTesting = require('../modal/AppointmentTesting');
const notificationService = require('./notificationService');

/** Reminder ~1 hour before online Meet appointments */
const DEFAULT_LEAD_MINUTES = 60;
const DEFAULT_WINDOW_MINUTES = 15; // catch once per lead window with job interval
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

const REMINDABLE_STATUSES = ['Scheduled', 'Rescheduled', 'Reassigned'];

let intervalHandle = null;
let isRunning = false;

function getLeadMinutes() {
  const parsed = Number(process.env.MEET_REMINDER_LEAD_MINUTES);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LEAD_MINUTES;
}

function getWindowMinutes() {
  const parsed = Number(process.env.MEET_REMINDER_WINDOW_MINUTES);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_WINDOW_MINUTES;
}

function getIntervalMs() {
  const parsed = Number(process.env.MEET_REMINDER_JOB_INTERVAL_MS);
  return Number.isFinite(parsed) && parsed >= 60_000 ? parsed : DEFAULT_INTERVAL_MS;
}

function isJobEnabled() {
  const flag = String(process.env.MEET_REMINDER_JOB_ENABLED || 'true').toLowerCase();
  return flag !== 'false' && flag !== '0' && flag !== 'off';
}

function sameInstant(a, b) {
  if (!a || !b) return false;
  return new Date(a).getTime() === new Date(b).getTime();
}

/**
 * Send reminder emails for online video appointments whose slot starts
 * about 1 hour from now (when the app Join Meet window opens).
 */
async function sendDueMeetReminders() {
  if (isRunning) {
    console.log('[meetReminderJob] Previous run still in progress, skipping');
    return { skipped: true };
  }

  isRunning = true;
  const leadMs = getLeadMinutes() * 60 * 1000;
  const windowMs = getWindowMinutes() * 60 * 1000;
  const now = Date.now();
  // Window: [now + lead - window, now + lead] e.g. 45–60 min before start
  const windowStart = new Date(now + leadMs - windowMs);
  const windowEnd = new Date(now + leadMs);

  let sent = 0;
  let checked = 0;

  try {
    const query = {
      paymentMode: 'online',
      status: { $in: REMINDABLE_STATUSES },
      'googleCalendar.meetLink': { $exists: true, $nin: [null, ''] },
      slotStartIso: { $gte: windowStart, $lte: windowEnd },
    };

    const [prodAppts, testAppts] = await Promise.all([
      Appointment.find(query)
        .populate('doctorId')
        .populate('patientId')
        .exec(),
      AppointmentTesting.find(query)
        .populate('doctorId')
        .populate('patientId')
        .exec(),
    ]);

    const candidates = [...prodAppts, ...testAppts];
    checked = candidates.length;

    for (const appt of candidates) {
      if (
        sameInstant(appt.meetReminderForSlotStartIso, appt.slotStartIso) &&
        appt.meetReminderSentAt
      ) {
        continue;
      }

      const patient = appt.patientId;
      const doctor = appt.doctorId;
      if (!patient?.email || !doctor) continue;

      try {
        await notificationService.sendOnlineMeetingReminderEmail({
          appointment: appt,
          doctor,
          patient,
        });

        appt.meetReminderSentAt = new Date();
        appt.meetReminderForSlotStartIso = appt.slotStartIso;
        await appt.save();
        sent += 1;
      } catch (emailErr) {
        console.warn(
          `[meetReminderJob] Reminder failed for ${appt._id}:`,
          emailErr?.message || emailErr
        );
      }
    }

    if (sent > 0) {
      console.log(
        `[meetReminderJob] Sent ${sent} online meeting reminder(s) (~${getLeadMinutes()} min before)`
      );
    }

    return { sent, checked };
  } catch (err) {
    console.error('[meetReminderJob] Run failed:', err?.message || err);
    return { error: err?.message || String(err) };
  } finally {
    isRunning = false;
  }
}

function startMeetReminderJob() {
  if (!isJobEnabled()) {
    console.log('[meetReminderJob] Disabled via MEET_REMINDER_JOB_ENABLED');
    return;
  }

  if (intervalHandle) return;

  const intervalMs = getIntervalMs();
  const leadMinutes = getLeadMinutes();

  console.log(
    `[meetReminderJob] Starting (every ${Math.round(intervalMs / 60000)} min, ~${leadMinutes} min before online Meet)`
  );

  setTimeout(() => {
    sendDueMeetReminders().catch((err) => {
      console.error('[meetReminderJob] Initial run failed:', err?.message || err);
    });
  }, 15_000);

  intervalHandle = setInterval(() => {
    sendDueMeetReminders().catch((err) => {
      console.error('[meetReminderJob] Scheduled run failed:', err?.message || err);
    });
  }, intervalMs);

  if (typeof intervalHandle.unref === 'function') {
    intervalHandle.unref();
  }
}

function stopMeetReminderJob() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = {
  startMeetReminderJob,
  stopMeetReminderJob,
  sendDueMeetReminders,
};
