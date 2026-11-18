/**
 * Timezone constants for IST
 */
const IST_OFFSET_MINUTES = 5 * 60 + 30; // +05:30
const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000;

/**
 * Convert UTC instant to IST wall-clock parts
 */
const toIstParts = (dateUtc) => {
  const ist = new Date(dateUtc.getTime() + IST_OFFSET_MS);
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth() + 1, // 1-12
    day: ist.getUTCDate(),
    hour: ist.getUTCHours(),
    minute: ist.getUTCMinutes(),
    weekday: ist.getUTCDay() // 0=Sunday, 6=Saturday
  };
};

/**
 * Check if a given time slot falls within doctor's available time ranges
 * Takes availabilityMode into account
 */
const isTimeSlotAvailable = (slotStart, slotEnd, dailyTimeRanges, availabilityMode = 'default') => {
  if (!dailyTimeRanges || dailyTimeRanges.length === 0) {
    return true; // If no ranges set, allow all times
  }

  const startParts = toIstParts(new Date(slotStart));
  const endParts = toIstParts(new Date(slotEnd));
  
  const slotStartMinutes = startParts.hour * 60 + startParts.minute;
  const slotEndMinutes = endParts.hour * 60 + endParts.minute;
  const weekday = startParts.weekday;

  // Filter ranges based on mode with robust type conversion & fallbacks
  let applicableRanges;
  if (availabilityMode === 'custom') {
    applicableRanges = dailyTimeRanges.filter(range => range.day !== undefined && range.day !== null && Number(range.day) === Number(weekday));
    if (applicableRanges.length === 0) {
      applicableRanges = dailyTimeRanges.filter(range => range.day === undefined || range.day === null);
    }
    if (applicableRanges.length === 0) {
      applicableRanges = dailyTimeRanges;
    }
  } else {
    applicableRanges = dailyTimeRanges.filter(range => range.day === undefined || range.day === null || Number(range.day) === Number(weekday));
    if (applicableRanges.length === 0) {
      applicableRanges = dailyTimeRanges;
    }
  }

  if (applicableRanges.length === 0) {
    return false; // No applicable ranges for this day
  }

  // Check if slot falls within any of the applicable time ranges
  return applicableRanges.some(range => {
    const [startHour, startMin] = range.start.split(':').map(Number);
    const [endHour, endMin] = range.end.split(':').map(Number);
    const rangeStartMinutes = startHour * 60 + startMin;
    const rangeEndMinutes = endHour * 60 + endMin;
    
    return slotStartMinutes >= rangeStartMinutes && slotEndMinutes <= rangeEndMinutes;
  });
};

/**
 * Check if a date falls within doctor's availability range (IST)
 */
const isDateInRange = (date, availabilityRange) => {
  if (!availabilityRange) {
    return true;
  }
  if (!availabilityRange.startDate && !availabilityRange.endDate) {
    return true;
  }

  const checkParts = toIstParts(new Date(date));
  const checkCode = checkParts.year * 10000 + checkParts.month * 100 + checkParts.day;

  const toDayCode = (value) => {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const p = toIstParts(value);
      return p.year * 10000 + p.month * 100 + p.day;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        const [y, m, d] = trimmed.split('-').map(Number);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
          return y * 10000 + m * 100 + d;
        }
      }
      const dt = new Date(trimmed);
      if (!Number.isNaN(dt.getTime())) {
        const p = toIstParts(dt);
        return p.year * 10000 + p.month * 100 + p.day;
      }
      // ISO-like "YYYY-MM-DDTHH:mm..." — take calendar date prefix only as last resort
      const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
      }
    }
    return null;
  };

  if (availabilityRange.startDate) {
    const startCode = toDayCode(availabilityRange.startDate);
    if (startCode && checkCode < startCode) {
      return false;
    }
  }

  if (availabilityRange.endDate) {
    const endCode = toDayCode(availabilityRange.endDate);
    if (endCode && checkCode > endCode) {
      return false;
    }
  }

  return true;
};

/**
 * Check if a weekday is excluded (IST timezone)
 */
const isWeekdayExcluded = (date, excludedWeekdays) => {
  if (!excludedWeekdays || excludedWeekdays.length === 0) {
    return false;
  }

  const parts = toIstParts(new Date(date));
  return excludedWeekdays.includes(parts.weekday);
};

/**
 * Main validation function
 */
const validateAppointmentAvailability = (doctor, slotStartIso, slotEndIso) => {
  const { availabilityRange, dailyTimeRanges, availabilityMode = 'default' } = doctor;

  // Check if date is within availability range
  if (!isDateInRange(slotStartIso, availabilityRange)) {
    return {
      available: false,
      reason: 'Selected date is outside doctor\'s availability period'
    };
  }

  // Check if weekday is excluded
  if (isWeekdayExcluded(slotStartIso, availabilityRange?.excludedWeekdays)) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const parts = toIstParts(new Date(slotStartIso));
    const dayName = dayNames[parts.weekday];
    return {
      available: false,
      reason: `Doctor is not available on ${dayName}s`
    };
  }

  // Check if time slot falls within daily time ranges (respecting availabilityMode)
  if (!isTimeSlotAvailable(slotStartIso, slotEndIso, dailyTimeRanges, availabilityMode)) {
    return {
      available: false,
      reason: 'Selected time is outside doctor\'s working hours'
    };
  }

  return {
    available: true,
    reason: null
  };
};

/**
 * Slot starts are not bookable if they begin within the next hour (lead time).
 */
const isSlotStartBookableByTime = (slotStart, leadMinutes = 60) => {
  const start = slotStart instanceof Date ? slotStart : new Date(slotStart);
  if (Number.isNaN(start.getTime())) return false;
  const threshold = new Date(Date.now() + Number(leadMinutes) * 60 * 1000);
  return start >= threshold;
};

module.exports = {
  validateAppointmentAvailability,
  isTimeSlotAvailable,
  isDateInRange,
  isWeekdayExcluded,
  isSlotStartBookableByTime,
};
