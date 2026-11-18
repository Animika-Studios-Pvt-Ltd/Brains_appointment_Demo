// backend/services/monthlyLogExporter.js
const ActivityLog = require('../modal/ActivityLog');
const Admin = require('../modal/Admin');
const { sendMail } = require('./gmailService');

/** Helper: Escape field for CSV formatting */
function escapeCsvField(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Generate CSV string of staff activity logs for a specific date range
 * Default range: 2nd of previous month (00:00:00) till 2nd of current month (23:59:59)
 */
async function generateActivityLogsCSV(fromDate = null, toDate = null) {
  const now = new Date();
  
  // If dates are not provided, default strictly to 2nd of previous month till 2nd of current month
  const start = fromDate || new Date(now.getFullYear(), now.getMonth() - 1, 2, 0, 0, 0, 0);
  const end = toDate || new Date(now.getFullYear(), now.getMonth(), 2, 23, 59, 59, 999);

  const logs = await ActivityLog.find({
    timestamp: { $gte: start, $lte: end },
    userType: { $ne: 'patient' } // Ensure patients are strictly excluded
  })
    .sort({ timestamp: -1 })
    .lean();

  const headers = [
    'Timestamp (IST)',
    'User Name',
    'User Email',
    'User Type',
    'Action',
    'Description',
    'IP Address',
    'User Agent'
  ];

  const rows = logs.map(log => [
    escapeCsvField(log.timestampIST || new Date(log.timestamp).toLocaleString()),
    escapeCsvField(log.userName),
    escapeCsvField(log.userEmail),
    escapeCsvField(log.userType),
    escapeCsvField(log.action),
    escapeCsvField(log.description),
    escapeCsvField(log.ipAddress),
    escapeCsvField(log.userAgent)
  ].join(','));

  return [headers.join(','), ...rows].join('\n');
}

let lastSentMonthKey = null; // e.g. "2026-2"

/**
 * Send monthly activity logs email to all Super Admins
 * Covers strictly from 2nd of previous month till 2nd of current month
 */
async function sendMonthlyActivityLogsEmail() {
  try {
    const now = new Date();
    console.log('📧 Preparing monthly Activity Logs CSV report (2nd of Previous Month to 2nd of Current Month) for Super Admins...');

    // Target Super Admin recipient exclusively
    const recipientEmails = new Set(['india.lumos@gmail.com']);

    // From 2nd of previous month (00:00:00) up to current date & time (now)
    const fromDate = new Date(now.getFullYear(), now.getMonth() - 1, 2, 0, 0, 0, 0);
    const toDate = now;

    const csvContent = await generateActivityLogsCSV(fromDate, toDate);
    const toDateStr = toDate.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: '2-digit'
    });

    const fromDateStr = fromDate.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: '2-digit'
    });

    const totalLogsCount = Math.max(0, (csvContent.match(/\n/g) || []).length);

    const htmlBody = `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; padding: 30px; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #1e1b4b, #312e81); padding: 20px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
      <h1 style="color: #ffffff; margin: 0; font-size: 20px;">Monthly Audit Report</h1>
      <p style="color: #c7d2fe; margin: 4px 0 0 0; font-size: 14px;">Monthly Cycle (${fromDateStr} - ${toDateStr})</p>
    </div>

    <p>Hello Super Admin,</p>
    <p>Attached is your automated monthly CSV export of staff activity audit logs covering from <strong>${fromDateStr}</strong> to <strong>${toDateStr}</strong>.</p>

    <div style="background: #f1f5f9; padding: 16px; border-radius: 12px; margin: 20px 0;">
      <p style="margin: 0; font-weight: 600; color: #334155;">Report Summary:</p>
      <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #475569;">
        <li>Report Range: <strong>${fromDateStr} to ${toDateStr}</strong></li>
        <li>Staff Activity Records Captured: <strong>${totalLogsCount}</strong></li>
        <li>Export Format: CSV</li>
      </ul>
    </div>

    <p style="font-size: 13px; color: #64748b; margin-top: 24px;">This is an automated monthly security report sent on the 2nd of each month exclusively to Super Admins of Brains Appointment System.</p>
  </div>
</body>
</html>`;

    let successCount = 0;
    let lastErrorMessage = 'Check email credentials in backend .env';

    for (const email of Array.from(recipientEmails)) {
      try {
        await sendMail(
          email,
          `[Brains Appointment] Monthly Activity Logs Report (${fromDateStr} - ${toDateStr})`,
          htmlBody,
          [
            {
              filename: `activity_logs_${fromDate.toISOString().slice(0, 10)}_to_${now.toISOString().slice(0, 10)}.csv`,
              content: csvContent,
              contentType: 'text/csv'
            }
          ]
        );
        successCount++;
        console.log(`✅ Sent monthly activity log CSV email to Super Admin: ${email}`);
      } catch (mailErr) {
        lastErrorMessage = mailErr.message || String(mailErr);
        console.warn(`⚠️ Could not send email to ${email}:`, lastErrorMessage);
      }
    }

    if (successCount === 0) {
      return {
        success: false,
        message: `Email delivery failed: ${lastErrorMessage}`
      };
    }

    return { success: true, count: totalLogsCount, recipients: successCount };
  } catch (error) {
    console.error('❌ Error in sendMonthlyActivityLogsEmail:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Purge activity logs older than 45 days
 * Ensures each individual log is deleted strictly 45 days after its creation
 */
async function cleanupOldActivityLogs() {
  try {
    const cutoffDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const result = await ActivityLog.deleteMany({ timestamp: { $lt: cutoffDate } });
    if (result.deletedCount > 0) {
      console.log(`🧹 Auto-cleanup: Deleted ${result.deletedCount} activity log(s) older than 45 days (before ${cutoffDate.toISOString().slice(0, 10)})`);
    }
  } catch (err) {
    console.error('❌ Error during 45-day activity log cleanup:', err.message);
  }
}

let cronIntervalHandle = null;

/**
 * Start scheduler to run on the 2nd day of every month & perform daily 45-day log cleanup
 */
function startMonthlyLogCron() {
  if (cronIntervalHandle) return;

  console.log('⏰ Initializing Monthly Log Scheduler & 45-Day Auto-Cleanup Task...');

  const checkAndRun = async () => {
    try {
      // 1. Run 45-day log cleanup
      await cleanupOldActivityLogs();

      // 2. Check if today is the 2nd of the month to send monthly email
      const now = new Date();
      const currentDay = now.getDate();
      const monthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;

      if (currentDay === 2 && lastSentMonthKey !== monthKey) {
        console.log(`🗓️ Today is the 2nd of the month (${monthKey}). Executing monthly report email...`);
        lastSentMonthKey = monthKey;
        await sendMonthlyActivityLogsEmail();
      }
    } catch (err) {
      console.error('❌ Monthly log scheduler error:', err.message);
    }
  };

  // Run check 1 minute after server start, then every 6 hours
  setTimeout(checkAndRun, 60_000);
  cronIntervalHandle = setInterval(checkAndRun, 6 * 60 * 60 * 1000);

  if (typeof cronIntervalHandle.unref === 'function') {
    cronIntervalHandle.unref();
  }
}

module.exports = {
  generateActivityLogsCSV,
  sendMonthlyActivityLogsEmail,
  startMonthlyLogCron,
  cleanupOldActivityLogs
};
