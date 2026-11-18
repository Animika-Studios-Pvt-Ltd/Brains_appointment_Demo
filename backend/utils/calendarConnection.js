/**
 * Whether a doctor Google Calendar connection is usable for syncing events.
 */
function isDoctorCalendarConnected(doctor) {
  if (!doctor) return false;
  const cal = doctor.googleCalendar || {};
  return !!(cal.isConnected || cal.connected);
}

module.exports = {
  isDoctorCalendarConnected,
};
