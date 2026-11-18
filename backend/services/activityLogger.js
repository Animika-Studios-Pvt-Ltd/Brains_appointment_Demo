const LoginHistory = require('../modal/LoginHistory');
const ActivityLog = require('../modal/ActivityLog');

/** Helper to get client IP address from Express req object */
function getClientIp(req) {
  if (!req) return '';
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    ''
  );
}

/** Helper to get User Agent string from Express req object */
function getUserAgent(req) {
  if (!req) return '';
  return req.headers['user-agent'] || '';
}

/** Helper to format current date to IST string */
function getISTTimestamp(date = new Date()) {
  try {
    return date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  } catch (err) {
    return date.toISOString();
  }
}

/**
 * Log a user login/logout/attempt event into LoginHistory (Excludes patients)
 */
async function recordLoginHistory({
  userId,
  userName,
  userEmail,
  userType,
  action,
  status = 'SUCCESS',
  failureReason = null,
  req = null,
  metadata = null
}) {
  // EXCLUDE PATIENTS
  const type = String(userType || '').toLowerCase();
  if (type === 'patient') {
    return;
  }

  try {
    const now = new Date();
    await LoginHistory.create({
      userId: String(userId || 'unknown'),
      userName: String(userName || userEmail || 'Unknown User'),
      userEmail: String(userEmail || '').toLowerCase(),
      userType: type || 'receptionist',
      action: action || 'LOGIN_SUCCESS',
      status,
      failureReason,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
      timestamp: now,
      timestampIST: getISTTimestamp(now),
      metadata
    });
  } catch (err) {
    console.error('❌ Failed to record login history:', err.message);
  }
}

/**
 * Log a user action into ActivityLog (Excludes patients)
 */
async function recordActivity({
  userId,
  userName,
  userEmail,
  userType,
  action,
  description = '',
  req = null,
  metadata = null
}) {
  // EXCLUDE PATIENTS
  const type = String(userType || '').toLowerCase();
  if (type === 'patient') {
    return;
  }

  try {
    const now = new Date();
    const cleanEmail = String(userEmail || '').toLowerCase();
    const act = action || 'ACTION';
    const desc = description || act;

    // Deduplication check: skip if identical action/description was logged for this user in the last 60 seconds
    const windowStart = new Date(now.getTime() - 60 * 1000);
    const existingRecent = await ActivityLog.findOne({
      userEmail: cleanEmail,
      action: act,
      description: desc,
      timestamp: { $gte: windowStart }
    }).lean();

    if (existingRecent) {
      return; // Skip logging duplicate action within 60 seconds
    }

    await ActivityLog.create({
      userId: String(userId || 'system'),
      userName: String(userName || userEmail || 'System'),
      userEmail: cleanEmail,
      userType: type || 'receptionist',
      action: act,
      description: desc,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
      timestamp: now,
      timestampIST: getISTTimestamp(now),
      metadata
    });
  } catch (err) {
    console.error('❌ Failed to record activity log:', err.message);
  }
}

module.exports = {
  getClientIp,
  getUserAgent,
  getISTTimestamp,
  recordLoginHistory,
  recordActivity
};
