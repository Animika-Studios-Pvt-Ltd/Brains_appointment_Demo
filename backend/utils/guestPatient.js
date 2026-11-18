const Patient = require('../modal/Patient');
const { normalizeEmail, phonesMatch } = require('./rescheduleAccess');

const PATIENT_CANCEL_LIMIT = 3;
const PATIENT_RESCHEDULE_LIMIT = 3;
const PATIENT_NO_SHOW_LIMIT = 3;

/**
 * Find existing patient by email, or create a guest patient (no password).
 */
async function findOrCreateGuestPatient({ name, email, phone }) {
  const normalized = normalizeEmail(email);
  let patient = await Patient.findOne({ email: normalized });

  if (patient) {
    let dirty = false;
    if (name && (!patient.name || patient.name === 'Guest')) {
      patient.name = String(name).trim();
      dirty = true;
    }
    if (phone && !patient.phone) {
      patient.phone = String(phone).trim();
      dirty = true;
    } else if (phone && patient.phone && !phonesMatch(patient.phone, phone)) {
      // Keep existing phone; booking flow may still validate separately
    }
    if (dirty) await patient.save();
    return patient;
  }

  patient = await Patient.create({
    name: String(name || 'Guest').trim(),
    email: normalized,
    phone: phone ? String(phone).trim() : undefined,
    isVerified: false,
    isActive: true,
  });

  return patient;
}

function assertGuestPatientCanBook(patient) {
  if (!patient) {
    return { allowed: false, message: 'Patient not found' };
  }
  if (patient.isActive === false) {
    return { allowed: false, message: 'This account is deactivated. Please contact support.' };
  }

  const cancelCount = Number(patient.cancelCount || 0);
  const rescheduleCount = Number(patient.rescheduleCount || 0);
  const noShowCount = Number(patient.noShowCount || 0);
  const isHardBlocked = !!patient.isBlocked;
  const autoBlocked =
    cancelCount >= PATIENT_CANCEL_LIMIT ||
    rescheduleCount >= PATIENT_RESCHEDULE_LIMIT ||
    noShowCount >= PATIENT_NO_SHOW_LIMIT;

  if (isHardBlocked || autoBlocked) {
    return {
      allowed: false,
      message:
        'Online booking is locked for this email due to repeated cancellations/reschedules/missed appointments. Please contact support.',
    };
  }

  return { allowed: true };
}

module.exports = {
  findOrCreateGuestPatient,
  assertGuestPatientCanBook,
  PATIENT_CANCEL_LIMIT,
  PATIENT_RESCHEDULE_LIMIT,
  PATIENT_NO_SHOW_LIMIT,
};
