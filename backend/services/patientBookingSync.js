// backend/services/patientBookingSync.js
// Mobile patient booking: Google Meet (video) + confirmation email (patient only)

const googleCalendarService = require('./googleCalendar');
const notificationService = require('./notificationService');
const { isDoctorCalendarConnected } = require('../utils/calendarConnection');

function toRFC3339(value) {
  if (!value) return value;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString();
}

/** Online payment only → generate Google Meet (clinic / video visit). Offline = in-person, no Meet. */
function shouldIncludeVideoConference(appointment) {
  if (!appointment) return false;
  return String(appointment.paymentMode || '').toLowerCase() === 'online';
}

async function createMeetViaClinicFallback(appointmentDoc, doctor, patient) {
  const summary = `Video consult — ${patient?.name || 'Patient'} with Dr. ${
    doctor?.name || 'Doctor'
  }`;
  const description = [
    `Patient: ${patient?.name || 'N/A'} (${patient?.email || 'no email'})`,
    `Doctor: Dr. ${doctor?.name || 'N/A'}`,
    appointmentDoc.symptoms ? `Symptoms: ${appointmentDoc.symptoms}` : null,
    `Appointment ID: ${appointmentDoc._id}`,
  ]
    .filter(Boolean)
    .join('\n');

  return googleCalendarService.createGeneralGoogleMeetLink({
    appointmentId: appointmentDoc._id,
    slotStartIso: toRFC3339(appointmentDoc.slotStartIso),
    slotEndIso: toRFC3339(appointmentDoc.slotEndIso),
    summary,
    description,
  });
}

/**
 * Background: create calendar event + Meet (if video), then email patient.
 * Works with Appointment or AppointmentTesting documents.
 */
async function syncPatientBookingExternal({
  appointment,
  doctor,
  patient,
  AppointmentModel,
}) {
  const appointmentId = appointment?._id;
  if (!appointmentId || !AppointmentModel) {
    console.error('📅 Patient booking sync skipped: missing appointment/model');
    return;
  }

  let appointmentDoc = appointment;
  try {
    const fresh = await AppointmentModel.findById(appointmentId);
    if (fresh) appointmentDoc = fresh;
  } catch (_) {
    // keep in-memory doc
  }

  const includeVideoConference = shouldIncludeVideoConference(appointmentDoc);
  let meetLink = appointmentDoc.googleCalendar?.meetLink || null;
  let eventId = appointmentDoc.googleCalendar?.eventId || null;
  let eventLink = appointmentDoc.googleCalendar?.eventLink || null;
  let syncError;

  if (includeVideoConference) {
    // 1) Prefer doctor's connected Google Calendar (like Lumos primary path)
    if (isDoctorCalendarConnected(doctor)) {
      try {
        const result = await googleCalendarService.createAppointmentEvent(
          doctor,
          patient,
          {
            appointmentId: appointmentDoc._id,
            symptoms: appointmentDoc.symptoms,
            slotStartIso: toRFC3339(appointmentDoc.slotStartIso),
            slotEndIso: toRFC3339(appointmentDoc.slotEndIso),
            status: appointmentDoc.status || 'Scheduled',
            includeVideoConference: true,
          }
        );

        if (result.success) {
          meetLink = result.meetLink || null;
          eventId = result.eventId || eventId;
          eventLink = result.eventLink || eventLink;
          console.log(
            `📅 Doctor calendar synced ${appointmentId} meet=${meetLink || 'none'}`
          );
        } else {
          syncError = result.error || 'Calendar sync failed';
          console.error(
            `📅 Doctor calendar failed ${appointmentId}:`,
            syncError
          );
        }
      } catch (err) {
        syncError = err?.message || String(err);
        console.error(
          `📅 Doctor calendar error ${appointmentId}:`,
          syncError
        );
      }
    } else {
      console.warn(
        `📅 Doctor calendar not connected for ${appointmentId} — using clinic Meet fallback`
      );
    }

    // 2) Lumos-style fallback: clinic Gmail calendar Meet link
    if (!meetLink) {
      try {
        const fallback = await createMeetViaClinicFallback(
          appointmentDoc,
          doctor,
          patient
        );
        if (fallback?.meetLink) {
          meetLink = fallback.meetLink;
          eventId = eventId || fallback.eventId;
          eventLink = eventLink || fallback.eventLink;
          syncError = undefined;
          console.log(
            `📅 Clinic Meet fallback OK for ${appointmentId} → ${meetLink}`
          );
        } else {
          console.warn(
            `📅 Clinic Meet fallback returned no link for ${appointmentId}`
          );
        }
      } catch (err) {
        console.error(
          `📅 Clinic Meet fallback error ${appointmentId}:`,
          err?.message || err
        );
      }
    }

    appointmentDoc.googleCalendar = {
      ...(appointmentDoc.googleCalendar || {}),
      eventId: eventId || undefined,
      eventLink: eventLink || undefined,
      meetLink: meetLink || undefined,
      synced: !!meetLink || !!eventId,
      syncError: meetLink ? undefined : syncError || 'Meet link not generated',
      lastSyncedAt: new Date(),
    };
    try {
      await appointmentDoc.save();
    } catch (saveErr) {
      console.error(
        `📅 Failed saving meet metadata ${appointmentId}:`,
        saveErr?.message || saveErr
      );
    }
  }

  try {
    await notificationService.sendAppointmentBookedEmail({
      appointment: appointmentDoc,
      doctor,
      patient,
    });
  } catch (err) {
    console.error(
      `✉️ Mobile booking email error ${appointmentId}:`,
      err?.message || err
    );
  }
}

module.exports = {
  syncPatientBookingExternal,
  shouldIncludeVideoConference,
};
