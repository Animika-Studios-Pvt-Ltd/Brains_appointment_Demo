const jwt = require('jsonwebtoken');

const RESCHEDULE_PURPOSE = 'guest_reschedule';
const CANCEL_PURPOSE = 'guest_cancel';
const DEFAULT_TTL = '7d';

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function digitsOnly(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function phonesMatch(a, b) {
  const da = digitsOnly(a);
  const db = digitsOnly(b);
  if (!da || !db) return false;
  if (da === db) return true;
  // Compare last 10 digits (common IN mobile format)
  return da.slice(-10) === db.slice(-10);
}

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
}

function frontendBaseUrl() {
  return String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function signAccessToken({ appointmentId, email, purpose, expiresIn = DEFAULT_TTL }) {
  return jwt.sign(
    {
      appointmentId: String(appointmentId),
      email: normalizeEmail(email),
      purpose,
    },
    getSecret(),
    { expiresIn }
  );
}

function verifyAccessToken(token, expectedPurpose) {
  const decoded = jwt.verify(token, getSecret());
  if (decoded.purpose !== expectedPurpose) {
    throw new Error('Invalid token purpose');
  }
  return {
    appointmentId: decoded.appointmentId,
    email: normalizeEmail(decoded.email),
    purpose: decoded.purpose,
  };
}

function signRescheduleAccessToken({ appointmentId, email, expiresIn }) {
  return signAccessToken({
    appointmentId,
    email,
    purpose: RESCHEDULE_PURPOSE,
    expiresIn,
  });
}

function signCancelAccessToken({ appointmentId, email, expiresIn }) {
  return signAccessToken({
    appointmentId,
    email,
    purpose: CANCEL_PURPOSE,
    expiresIn,
  });
}

function verifyRescheduleAccessToken(token) {
  return verifyAccessToken(token, RESCHEDULE_PURPOSE);
}

function verifyCancelAccessToken(token) {
  return verifyAccessToken(token, CANCEL_PURPOSE);
}

function issueGuestAppointmentTokens(appointmentId, email) {
  return {
    rescheduleToken: signRescheduleAccessToken({ appointmentId, email }),
    cancelToken: signCancelAccessToken({ appointmentId, email }),
  };
}

function buildReschedulePageUrl(appointmentId, token) {
  const base = frontendBaseUrl();
  const q = new URLSearchParams({ token: String(token || '') });
  return `${base}/reschedule/${appointmentId}?${q.toString()}`;
}

function buildCancelPageUrl(appointmentId, token) {
  const base = frontendBaseUrl();
  const q = new URLSearchParams({ token: String(token || '') });
  return `${base}/cancel/${appointmentId}?${q.toString()}`;
}

module.exports = {
  normalizeEmail,
  phonesMatch,
  signRescheduleAccessToken,
  signCancelAccessToken,
  verifyRescheduleAccessToken,
  verifyCancelAccessToken,
  issueGuestAppointmentTokens,
  buildReschedulePageUrl,
  buildCancelPageUrl,
  RESCHEDULE_PURPOSE,
  CANCEL_PURPOSE,
};
