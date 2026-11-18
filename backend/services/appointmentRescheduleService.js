const Appointment = require('../modal/Appointment');
const AppointmentTesting = require('../modal/AppointmentTesting');
const Patient = require('../modal/Patient');
const Doctor = require('../modal/Doctor');
const googleCalendarService = require('./googleCalendar');
const notificationService = require('./notificationService');

async function findRescheduleAppointment(apptId) {
  let appt = await Appointment.findById(apptId).populate('doctorId').populate('patientId');
  if (appt) return { appt, Model: Appointment };
  appt = await AppointmentTesting.findById(apptId).populate('doctorId').populate('patientId');
  if (appt) return { appt, Model: AppointmentTesting };
  return null;
}

const PATIENT_RESCHEDULE_LIMIT = 3;

async function rescheduleAppointment({
  apptId,
  slotStartIso,
  slotEndIso,
  date,
  symptoms,
  note,
  user,
}) {
  const newStart = new Date(slotStartIso);
  const newEnd = new Date(slotEndIso);
  const newDate = new Date(date);

  const found = await findRescheduleAppointment(apptId);
  if (!found) {
    const err = new Error('Appointment not found');
    err.statusCode = 404;
    throw err;
  }
  const { appt } = found;

  const role = user.type || user.role;
  const callerId = user._id || user.id;

  if (role === 'patient' && String(appt.patientId._id) !== callerId.toString()) {
    const err = new Error('Unauthorized');
    err.statusCode = 403;
    throw err;
  }

  const count = appt.patientId.rescheduleCount || 0;
  if (role === 'patient' && count >= PATIENT_RESCHEDULE_LIMIT) {
    const err = new Error('Reschedule limit reached');
    err.statusCode = 403;
    err.payload = {
      status: 'error',
      message: 'Reschedule limit reached',
      limit: PATIENT_RESCHEDULE_LIMIT,
      rescheduleCount: count,
    };
    throw err;
  }

  if (role === 'patient') {
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
    if (newStart < oneHourFromNow) {
      const err = new Error('Appointments must be rescheduled at least 1 hour in advance');
      err.statusCode = 403;
      throw err;
    }
  }

  const doctor = appt.doctorId;

  if (doctor) {
    const SystemSetting = require('../modal/SystemSetting');
    const setting = await SystemSetting.findOne({ key: 'onlineBookingLive' });
    const onlineBookingLive = setting ? setting.value === true : true;
    if (!onlineBookingLive && role === 'patient') {
      doctor.dailyTimeRanges = (doctor.dailyTimeRanges || []).filter(r => !r.isOnline);
    }
  }

  // 1) General availability check
  const { validateAppointmentAvailability } = require('../utils/availabilityChecker');
  const availabilityCheck = validateAppointmentAvailability(
    doctor,
    slotStartIso,
    slotEndIso
  );
  if (!availabilityCheck.available) {
    const err = new Error(availabilityCheck.reason || 'Selected slot is not within doctor availability');
    err.statusCode = 403;
    throw err;
  }

  // 2) Overlap conflict check (excluding current appointment ID)
  const activeStatuses = ['Scheduled', 'In Progress', 'Rescheduled', 'Reassigned'];
  const [conflictOffline, conflictOnline] = await Promise.all([
    Appointment.findOne({
      _id: { $ne: appt._id },
      doctorId: doctor._id,
      status: { $in: activeStatuses },
      slotStartIso: { $lt: newEnd },
      slotEndIso: { $gt: newStart },
    }),
    AppointmentTesting.findOne({
      _id: { $ne: appt._id },
      doctorId: doctor._id,
      status: { $in: activeStatuses },
      slotStartIso: { $lt: newEnd },
      slotEndIso: { $gt: newStart },
    }),
  ]);

  if (conflictOffline || conflictOnline) {
    const err = new Error('This time slot is already booked');
    err.statusCode = 409;
    throw err;
  }

  const fromSnapshot = {
    start: appt.slotStartIso,
    end: appt.slotEndIso,
    date: appt.date,
  };

  appt.date = newDate;
  appt.slotStartIso = newStart;
  appt.slotEndIso = newEnd;
  appt.symptoms = symptoms || appt.symptoms;
  appt.status = 'Rescheduled';

  if (role === 'patient') appt.rescheduleCount++;

  if (!Array.isArray(appt.rescheduleHistory)) {
    appt.rescheduleHistory = [];
  }

  appt.rescheduleHistory.push({
    by: callerId,
    byType: role,
    at: new Date(),
    from: fromSnapshot,
    to: { start: newStart, end: newEnd, date: newDate },
    note: note || `Rescheduled by ${role}`,
  });

  await appt.save();

  return { appt, doctor, role };
}

function runRescheduleBackgroundSync({ appt, doctor, role }) {
  process.nextTick(async () => {
    try {
      if (appt.googleCalendar?.eventId && doctor?.googleCalendar?.isConnected) {
        await googleCalendarService.updateAppointmentEvent(
          doctor,
          appt.googleCalendar.eventId,
          {
            appointmentId: appt._id,
            slotStartIso: appt.slotStartIso,
            slotEndIso: appt.slotEndIso,
            status: appt.status,
          }
        );
      }

      await notificationService.sendAppointmentRescheduledEmail({
        appointment: appt,
        doctor,
        patient: appt.patientId,
        requestedByRole: role,
      });
    } catch (err) {
      console.error('Background reschedule sync failed:', err);
    }
  });
}

async function reassignAppointment({
  apptId,
  newDoctorId,
  slotStartIso,
  slotEndIso,
  date,
  note,
  user,
}) {
  const found = await findRescheduleAppointment(apptId);
  if (!found) {
    const err = new Error('Appointment not found');
    err.statusCode = 404;
    throw err;
  }
  const { appt } = found;

  const newDoctor = await Doctor.findById(newDoctorId);
  if (!newDoctor) {
    const err = new Error('Doctor not found');
    err.statusCode = 404;
    throw err;
  }

  const isCalendarConnected =
    newDoctor.googleCalendar?.isConnected || newDoctor.googleCalendar?.connected;
  if (!isCalendarConnected) {
    const err = new Error("New doctor's calendar is not connected to Google Calendar");
    err.statusCode = 400;
    throw err;
  }

  const oldDoctor = appt.doctorId;
  const oldEventId = appt.googleCalendar?.eventId || null;

  const newStart = slotStartIso ? new Date(slotStartIso) : appt.slotStartIso;
  const newEnd = slotEndIso ? new Date(slotEndIso) : appt.slotEndIso;
  const newDate = date ? new Date(date) : appt.date;

  // 1) General availability check for the new doctor
  const { validateAppointmentAvailability } = require('../utils/availabilityChecker');
  const availabilityCheck = validateAppointmentAvailability(
    newDoctor,
    newStart.toISOString(),
    newEnd.toISOString()
  );
  if (!availabilityCheck.available) {
    const err = new Error(availabilityCheck.reason || 'Selected slot is not within new doctor availability');
    err.statusCode = 403;
    throw err;
  }

  // 2) Overlap conflict check for the new doctor (excluding current appointment ID)
  const activeStatuses = ['Scheduled', 'In Progress', 'Rescheduled', 'Reassigned'];
  const [conflictOffline, conflictOnline] = await Promise.all([
    Appointment.findOne({
      _id: { $ne: appt._id },
      doctorId: newDoctorId,
      status: { $in: activeStatuses },
      slotStartIso: { $lt: newEnd },
      slotEndIso: { $gt: newStart },
    }),
    AppointmentTesting.findOne({
      _id: { $ne: appt._id },
      doctorId: newDoctorId,
      status: { $in: activeStatuses },
      slotStartIso: { $lt: newEnd },
      slotEndIso: { $gt: newStart },
    }),
  ]);

  if (conflictOffline || conflictOnline) {
    const err = new Error('This time slot is already booked for the new doctor');
    err.statusCode = 409;
    throw err;
  }

  const fromSnapshot = {
    start: appt.slotStartIso,
    end: appt.slotEndIso,
    date: appt.date,
  };

  appt.doctorId = newDoctorId;
  appt.slotStartIso = newStart;
  appt.slotEndIso = newEnd;
  appt.date = newDate;
  appt.status = 'Reassigned';
  appt.reassignCount = (appt.reassignCount || 0) + 1;

  if (!Array.isArray(appt.reassignHistory)) {
    appt.reassignHistory = [];
  }

  appt.reassignHistory.push({
    by: user._id || user.id || null,
    byType: user.type || user.role,
    at: new Date(),
    fromDoctor: oldDoctor._id,
    toDoctor: newDoctorId,
    from: fromSnapshot,
    to: { start: newStart, end: newEnd, date: newDate },
    note: note || `Reassigned by ${user.type || user.role}`,
  });

  await appt.save();

  return { appt, oldDoctor, newDoctor, oldEventId };
}

function runReassignBackgroundSync({ appt, oldDoctor, newDoctor, oldEventId }) {
  process.nextTick(async () => {
    try {
      try {
        await notificationService.sendAppointmentReassignedEmail({
          appointment: appt,
          oldDoctor,
          newDoctor,
          patient: appt.patientId,
        });
      } catch (e) {
        console.error('Reassign email error:', e?.message || e);
      }

      if (oldEventId && oldDoctor.googleCalendar?.isConnected) {
        try {
          await googleCalendarService.deleteAppointmentEvent(oldDoctor, oldEventId);
        } catch (e) {
          console.error("Failed to delete old doctor's calendar event on reassign:", e?.message || e);
        }
      }

      let newEventMeta = null;
      if (newDoctor.googleCalendar?.isConnected) {
        const result = await googleCalendarService.createAppointmentEvent(
          newDoctor,
          appt.patientId,
          {
            appointmentId: appt._id,
            slotStartIso: appt.slotStartIso,
            slotEndIso: appt.slotEndIso,
            status: appt.status,
          }
        );

        if (result.success) {
          newEventMeta = {
            eventId: result.eventId,
            eventLink: result.eventLink,
            synced: true,
            syncError: null,
            lastSyncedAt: new Date(),
          };
        } else {
          newEventMeta = {
            ...(appt.googleCalendar || {}),
            synced: false,
            syncError: result.error || 'Reassign sync failed',
            lastSyncedAt: new Date(),
          };
        }
      }

      if (newEventMeta) {
        await appt.constructor.findByIdAndUpdate(appt._id, {
          $set: { googleCalendar: newEventMeta },
        });
      } else if (oldEventId) {
        await appt.constructor.findByIdAndUpdate(appt._id, {
          $set: {
            'googleCalendar.synced': false,
            'googleCalendar.syncError':
              'Old event removed but failed to create new event on reassign',
            'googleCalendar.lastSyncedAt': new Date(),
          },
        });
      }
    } catch (err) {
      console.error('Background reassign sync failed:', err);
    }
  });
}

module.exports = {
  rescheduleAppointment,
  runRescheduleBackgroundSync,
  reassignAppointment,
  runReassignBackgroundSync,
};
