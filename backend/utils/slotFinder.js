const Appointment = require('../modal/Appointment');
const AppointmentTesting = require('../modal/AppointmentTesting');
const BlockedSlot = require('../modal/BlockedSlot');
const Doctor = require('../modal/Doctor');

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const overlaps = (aStart, aEnd, bStart, bEnd) => {
  const s1 = new Date(aStart);
  const e1 = new Date(aEnd);
  const s2 = new Date(bStart);
  const e2 = new Date(bEnd);
  return s1 < e2 && s2 < e1;
};

function toIstParts(dateUtc) {
  const ist = new Date(dateUtc.getTime() + IST_OFFSET_MS);
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth() + 1,
    day: ist.getUTCDate(),
    hour: ist.getUTCHours(),
    minute: ist.getUTCMinutes(),
    second: ist.getUTCSeconds(),
    ms: ist.getUTCMilliseconds(),
  };
}

function makeIstInstant(year, month, day, hour = 0, minute = 0, second = 0, ms = 0) {
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  return new Date(utcMs - IST_OFFSET_MS);
}

function getIstDayBounds(dateStr) {
  const [y, m, d] = String(dateStr || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return {
    dayStart: makeIstInstant(y, m, d, 0, 0, 0, 0),
    dayEnd: makeIstInstant(y, m, d, 23, 59, 59, 999),
  };
}

async function findNextAvailableSlot(doctorDoc, durationMinutes, from, maxDays = 30, excludeAppointmentIds = []) {
  if (!doctorDoc) return null;

  const dailyRanges = Array.isArray(doctorDoc.dailyTimeRanges)
    ? doctorDoc.dailyTimeRanges
    : [];
  if (!dailyRanges.length) return null;

  const availabilityMode = doctorDoc.availabilityMode || 'default';
  const excludedWeekdays = doctorDoc.availabilityRange?.excludedWeekdays || [];

  const startInstant = from instanceof Date ? new Date(from) : new Date(from);
  if (Number.isNaN(startInstant.getTime())) return null;

  const appointmentDuration = Number(durationMinutes || doctorDoc.appointmentDuration || 30);
  const windowEnd = new Date(startInstant.getTime() + maxDays * 24 * 60 * 60 * 1000);

  const [offlineAppts, onlineAppts] = await Promise.all([
    Appointment.find({
      doctorId: doctorDoc._id,
      _id: { $nin: excludeAppointmentIds },
      status: { $in: ['Scheduled', 'In Progress', 'Rescheduled', 'Reassigned'] },
      slotStartIso: { $lt: windowEnd },
      slotEndIso: { $gt: startInstant },
    }).select('slotStartIso slotEndIso').lean(),
    AppointmentTesting.find({
      doctorId: doctorDoc._id,
      _id: { $nin: excludeAppointmentIds },
      status: { $in: ['Scheduled', 'In Progress', 'Rescheduled', 'Reassigned'] },
      slotStartIso: { $lt: windowEnd },
      slotEndIso: { $gt: startInstant },
    }).select('slotStartIso slotEndIso').lean(),
  ]);

  const existingAppointments = [...offlineAppts, ...onlineAppts];

  const blockedSlots = await BlockedSlot.find({
    doctorId: doctorDoc._id,
    startTime: { $lt: windowEnd },
    endTime: { $gt: startInstant },
  }).select('startTime endTime');

  const slotIsFree = (candStart, candEnd) => {
    for (const ap of existingAppointments) {
      if (overlaps(candStart, candEnd, ap.slotStartIso, ap.slotEndIso)) return false;
    }
    for (const b of blockedSlots) {
      if (overlaps(candStart, candEnd, b.startTime, b.endTime)) return false;
    }
    return true;
  };

  const now = new Date();
  const startIst = new Date(startInstant.getTime() + IST_OFFSET_MS);

  for (let dayIndex = 0; dayIndex <= maxDays; dayIndex++) {
    const dayIst = new Date(startIst);
    dayIst.setUTCDate(dayIst.getUTCDate() + dayIndex);

    const y = dayIst.getUTCFullYear();
    const m = dayIst.getUTCMonth() + 1;
    const d = dayIst.getUTCDate();
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();

    if (excludedWeekdays.includes(weekday)) continue;

    let applicableRanges = [];
    if (availabilityMode === 'custom') {
      applicableRanges = dailyRanges.filter((r) => r.day === weekday);
    } else {
      applicableRanges = dailyRanges.filter((r) => r.day === undefined || r.day === null);
    }

    for (const range of applicableRanges) {
      if (!range?.start || !range?.end) continue;

      const [sh, sm] = String(range.start).split(':').map((n) => parseInt(n, 10));
      const [eh, em] = String(range.end).split(':').map((n) => parseInt(n, 10));
      if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em)) continue;

      const rangeStart = makeIstInstant(y, m, d, sh ?? 0, sm ?? 0, 0, 0);
      const rangeEnd = makeIstInstant(y, m, d, eh ?? 0, em ?? 0, 0, 0);
      if (rangeEnd <= rangeStart) continue;

      let cursor = new Date(rangeStart);
      if (dayIndex === 0 && startInstant > cursor) cursor = new Date(startInstant);

      while (cursor.getTime() + appointmentDuration * 60000 <= rangeEnd.getTime()) {
        const candStart = new Date(cursor);
        const candEnd = new Date(candStart.getTime() + appointmentDuration * 60000);

        if (candEnd <= startInstant) {
          cursor = new Date(cursor.getTime() + appointmentDuration * 60000);
          continue;
        }
        if (candStart < now) {
          cursor = new Date(cursor.getTime() + appointmentDuration * 60000);
          continue;
        }
        if (slotIsFree(candStart, candEnd)) {
          return { start: candStart, end: candEnd };
        }
        cursor = new Date(cursor.getTime() + appointmentDuration * 60000);
      }
    }
  }

  return null;
}

async function isSlotVip(doctorId, slotStartIso) {
  try {
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) return false;

    const startInstant = new Date(slotStartIso);
    if (Number.isNaN(startInstant.getTime())) return false;

    const ist = new Date(startInstant.getTime() + IST_OFFSET_MS);
    const y = ist.getUTCFullYear();
    const m = ist.getUTCMonth() + 1;
    const d = ist.getUTCDate();
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();

    const dailyRanges = Array.isArray(doctor.dailyTimeRanges) ? doctor.dailyTimeRanges : [];
    if (!dailyRanges.length) return false;

    const availabilityMode = doctor.availabilityMode || 'default';
    let applicableRanges = [];
    if (availabilityMode === 'custom') {
      applicableRanges = dailyRanges.filter((r) => r.day === weekday);
    } else {
      applicableRanges = dailyRanges.filter((r) => r.day === undefined || r.day === null);
    }

    const duration = Number(doctor.appointmentDuration || doctor.slotDurationMinutes || 30);

    for (const range of applicableRanges) {
      if (!range?.start || !range?.end) continue;

      const [sh, sm] = String(range.start).split(':').map(Number);
      const [eh, em] = String(range.end).split(':').map(Number);

      const rangeStart = makeIstInstant(y, m, d, sh ?? 0, sm ?? 0, 0, 0);
      const rangeEnd = makeIstInstant(y, m, d, eh ?? 0, em ?? 0, 0, 0);

      // Check if slot falls inside this range
      if (startInstant >= rangeStart && new Date(startInstant.getTime() + duration * 60000) <= rangeEnd) {
        // Form the HH:mm string in IST
        const hh = String(ist.getUTCHours()).padStart(2, '0');
        const mm = String(ist.getUTCMinutes()).padStart(2, '0');
        const hhmm = `${hh}:${mm}`;

        // 1. Check if matches custom timings
        const customTimings = Array.isArray(range.vipTimings) ? range.vipTimings : [];
        if (customTimings.includes(hhmm)) {
          return true;
        }

        // 2. Check if matches dynamic VIP indices distribution
        const vipSlotsCount = typeof range.vipSlots === 'number' ? range.vipSlots : 0;
        if (vipSlotsCount > 0) {
          // Count total slots inside THIS range
          let rangeTotalSlots = 0;
          let tempCursor = new Date(rangeStart);
          while (tempCursor.getTime() + duration * 60000 <= rangeEnd.getTime()) {
            rangeTotalSlots++;
            tempCursor = new Date(tempCursor.getTime() + duration * 60000);
          }

          // Calculate VIP indices for this range
          const vipIndices = new Set();
          if (vipSlotsCount >= rangeTotalSlots) {
            for (let i = 0; i < rangeTotalSlots; i++) vipIndices.add(i);
          } else {
            const step = rangeTotalSlots / vipSlotsCount;
            for (let i = 0; i < vipSlotsCount; i++) {
              const idx = Math.floor((i + 0.5) * step);
              vipIndices.add(idx);
            }
          }

          // Find slotIndex of current slot within this range
          let currentSlotIndex = -1;
          let searchCursor = new Date(rangeStart);
          let indexCounter = 0;
          while (searchCursor.getTime() + duration * 60000 <= rangeEnd.getTime()) {
            if (Math.abs(searchCursor.getTime() - startInstant.getTime()) < 1000) {
              currentSlotIndex = indexCounter;
              break;
            }
            indexCounter++;
            searchCursor = new Date(searchCursor.getTime() + duration * 60000);
          }

          if (vipIndices.has(currentSlotIndex)) {
            return true;
          }
        }
      }
    }
    return false;
  } catch (e) {
    console.error("isSlotVip error:", e);
    return false;
  }
}

module.exports = {
  overlaps,
  toIstParts,
  makeIstInstant,
  getIstDayBounds,
  findNextAvailableSlot,
  isSlotVip,
};
