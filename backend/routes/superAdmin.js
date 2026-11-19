// backend/routes/superAdmin.js — Super Admin exclusive log and management endpoints
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const LoginHistory = require('../modal/LoginHistory');
const ActivityLog = require('../modal/ActivityLog');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const { generateActivityLogsCSV, sendMonthlyActivityLogsEmail } = require('../services/monthlyLogExporter');
const { initGmailService } = require('../services/gmailService');

function getOAuthRedirectUri(req) {
  const host = req.get('host') || 'localhost:8000';
  if (host.includes('192.168.') || host.includes('10.') || host.includes('127.0.0.1')) {
    const port = host.split(':')[1] || '8000';
    return `http://localhost:${port}/api/super-admin/google-oauth-callback`;
  }
  return `${req.protocol}://${host}/api/super-admin/google-oauth-callback`;
}

/**
 * Public Callback for Google OAuth Token Refresh (Triggered by Google Redirect)
 */
router.get('/google-oauth-callback', async (req, res) => {
  try {
    const { code, error } = req.query;

    if (error) {
      return res.status(400).send(`<h1>Authorization Error: ${error}</h1>`);
    }

    if (!code) {
      return res.status(400).send('<h1>No authorization code received</h1>');
    }

    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
    const redirectUri = getOAuthRedirectUri(req);

    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);

    if (tokens.refresh_token) {
      console.log('🎉 New GMAIL_REFRESH_TOKEN obtained:', tokens.refresh_token);
      process.env.GMAIL_REFRESH_TOKEN = tokens.refresh_token;

      // Update backend/.env file on disk
      try {
        const envPath = path.join(__dirname, '../.env');
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, 'utf8');
          if (envContent.includes('GMAIL_REFRESH_TOKEN=')) {
            envContent = envContent.replace(/GMAIL_REFRESH_TOKEN=.*/, `GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
          } else {
            envContent += `\nGMAIL_REFRESH_TOKEN=${tokens.refresh_token}\n`;
          }
          fs.writeFileSync(envPath, envContent, 'utf8');
          console.log('✅ Updated GMAIL_REFRESH_TOKEN in backend/.env file');
        }
      } catch (fileErr) {
        console.warn('⚠️ Could not rewrite backend/.env file:', fileErr.message);
      }

      initGmailService(tokens.refresh_token);

      return res.send(`
        <!DOCTYPE html>
        <html>
          <body style="font-family: system-ui; text-align: center; padding: 3rem; background: #f0fdf4; color: #166534;">
            <div style="max-width: 500px; margin: 0 auto; background: white; padding: 2.5rem; border-radius: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
              <h1 style="font-size: 2.5rem; margin-bottom: 0.5rem;">🎉 Success!</h1>
              <h2 style="color: #15803d; margin-bottom: 1rem;">GMAIL_REFRESH_TOKEN Updated</h2>
              <p>Your Google OAuth Gmail API token has been successfully refreshed and saved to backend/.env.</p>
              <p style="margin-top: 1.5rem; font-size: 0.9rem; color: #4b5563;">You can now close this tab and return to your Super Admin Dashboard.</p>
            </div>
          </body>
        </html>
      `);
    } else {
      return res.send(`
        <!DOCTYPE html>
        <html>
          <body style="font-family: system-ui; text-align: center; padding: 3rem; background: #fffbebfb; color: #92400e;">
            <div style="max-width: 500px; margin: 0 auto; background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
              <h1>⚠️ Access Granted</h1>
              <p>Google returned an access token. (If a new refresh token was not returned, revoke access for this app in your Google Account settings and try again).</p>
            </div>
          </body>
        </html>
      `);
    }
  } catch (err) {
    console.error('❌ Google OAuth Callback error:', err.message);
    return res.status(500).send(`<h1>Authorization Failed: ${err.message}</h1>`);
  }
});

/**
 * GET /api/super-admin/system-stats
 * Returns system statistics including server, database status, user counts, appointment metrics, and log activity
 */
router.get('/system-stats', authenticate, requireRole('super_admin', 'admin'), async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const Doctor = require('../modal/Doctor');
    const Patient = require('../modal/Patient');
    const Admin = require('../modal/Admin');
    const Receptionist = require('../modal/Receptionist');
    const Appointment = require('../modal/Appointment');

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      totalDoctors,
      totalPatients,
      totalAdmins,
      totalReceptionists,
      totalAppointments,
      todayAppointments,
      totalLoginsToday,
      failedLoginsToday,
      totalActivitiesToday,
      totalLoginEntries,
      totalActivityEntries
    ] = await Promise.all([
      Doctor.countDocuments({}).catch(() => 0),
      Patient.countDocuments({}).catch(() => 0),
      Admin.countDocuments({}).catch(() => 0),
      Receptionist.countDocuments({}).catch(() => 0),
      Appointment.countDocuments({}).catch(() => 0),
      Appointment.countDocuments({ slotStartIso: { $gte: startOfToday } }).catch(() => 0),
      LoginHistory.countDocuments({ timestamp: { $gte: startOfToday }, action: 'LOGIN_SUCCESS' }).catch(() => 0),
      LoginHistory.countDocuments({ timestamp: { $gte: startOfToday }, status: 'FAILED' }).catch(() => 0),
      ActivityLog.countDocuments({ timestamp: { $gte: startOfToday } }).catch(() => 0),
      LoginHistory.countDocuments().catch(() => 0),
      ActivityLog.countDocuments().catch(() => 0)
    ]);

    const dbConnected = mongoose.connection.readyState === 1;

    return res.json({
      success: true,
      stats: {
        server: {
          uptime: process.uptime(),
          environment: process.env.NODE_ENV || 'development',
          nodeVersion: process.version,
          memoryUsage: process.memoryUsage(),
          timestamp: new Date().toISOString()
        },
        database: {
          connected: dbConnected,
          status: dbConnected ? 'connected' : 'disconnected'
        },
        users: {
          totalDoctors,
          totalPatients,
          totalAdmins,
          totalReceptionists,
          totalUsers: totalDoctors + totalPatients + totalAdmins + totalReceptionists
        },
        appointments: {
          total: totalAppointments,
          today: todayAppointments
        },
        logs: {
          totalLoginsToday,
          failedLoginsToday,
          totalActivitiesToday,
          totalLoginEntries,
          totalActivityEntries
        }
      }
    });
  } catch (err) {
    console.error('❌ system-stats error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Guard ALL subsequent endpoints in this router to super_admin ONLY
router.use(authenticate, requireRole('super_admin'));

const googleCalendarService = require('../services/googleCalendar');

/**
 * GET /api/super-admin/get-gmail-auth-url
 * Generate Google OAuth Consent URL using configured system redirect URI
 */
router.get('/get-gmail-auth-url', (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const userType = req.user.type || req.user.role || 'super_admin';
    const authUrl = googleCalendarService.getAuthUrl(userId, userType);
    return res.json({ success: true, authUrl });
  } catch (err) {
    console.error('❌ get-gmail-auth-url error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/super-admin/login-history
 * Paginated login history list for Super Admin
 */
router.get('/login-history', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const { search, userType, status, action, startDate, endDate } = req.query;

    const query = {};

    if (userType && userType !== 'all') {
      query.userType = userType;
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    if (action && action !== 'all') {
      query.action = action;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { userName: regex },
        { userEmail: regex },
        { ipAddress: regex },
        { failureReason: regex },
        { userType: regex }
      ];
    }

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.timestamp.$lte = end;
      }
    }

    const [logs, total] = await Promise.all([
      LoginHistory.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      LoginHistory.countDocuments(query)
    ]);

    return res.json({
      success: true,
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1
    });
  } catch (error) {
    console.error('❌ SuperAdmin login-history error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch login history',
      error: error.message
    });
  }
});

/**
 * GET /api/super-admin/activity-logs
 * Paginated activity logs list for Super Admin
 */
router.get('/activity-logs', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const { search, userType, action, startDate, endDate } = req.query;

    const query = {};

    if (userType && userType !== 'all') {
      query.userType = userType;
    }

    if (action && action !== 'all') {
      query.action = action;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { userName: regex },
        { userEmail: regex },
        { action: regex },
        { description: regex },
        { ipAddress: regex }
      ];
    }

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.timestamp.$lte = end;
      }
    }

    const rawLogs = await ActivityLog.find(query)
      .sort({ timestamp: -1 })
      .limit(500)
      .lean();

    // Deduplicate logs: ignore identical action/description for the same user within 60s
    const uniqueLogs = [];
    const seenBuckets = new Set();

    for (const log of rawLogs) {
      const tsMinute = Math.floor(new Date(log.timestamp).getTime() / (60 * 1000));
      const key = `${log.userEmail || log.userName}_${log.action}_${log.description}_${tsMinute}`;
      if (!seenBuckets.has(key)) {
        seenBuckets.add(key);
        uniqueLogs.push(log);
      }
    }

    const total = uniqueLogs.length;
    const paginatedLogs = uniqueLogs.slice(skip, skip + limit);

    return res.json({
      success: true,
      logs: paginatedLogs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1
    });
  } catch (error) {
    console.error('❌ SuperAdmin activity-logs error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch activity logs',
      error: error.message
    });
  }
});

/**
 * GET /api/super-admin/activity-logs/export-csv
 * Download CSV export of activity logs
 */
router.get('/activity-logs/export-csv', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '40', 10);
    const now = new Date();
    const fromDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const csvContent = await generateActivityLogsCSV(fromDate, now);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=activity_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    return res.send(csvContent);
  } catch (error) {
    console.error('❌ SuperAdmin CSV export error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to export CSV logs',
      error: error.message
    });
  }
});

/**
 * POST /api/super-admin/activity-logs/send-monthly-email
 * Trigger manual dispatch of monthly CSV logs report to Super Admins
 */
router.post('/activity-logs/send-monthly-email', async (req, res) => {
  try {
    const result = await sendMonthlyActivityLogsEmail();
    if (result.success) {
      return res.json({
        success: true,
        message: `Monthly activity logs CSV report emailed to ${result.recipients} Super Admin(s)`
      });
    } else {
      return res.status(500).json({
        success: false,
        message: result.message || result.error || 'Failed to send monthly email'
      });
    }
  } catch (error) {
    console.error('❌ SuperAdmin manual email send error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send monthly activity logs email',
      error: error.message
    });
  }
});

/**
 * GET /api/super-admin/logs-summary
 * Summary metrics for Super Admin Dashboard
 */
router.get('/logs-summary', async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      totalLoginsToday,
      failedLoginsToday,
      totalActivitiesToday,
      totalLoginEntries,
      totalActivityEntries
    ] = await Promise.all([
      LoginHistory.countDocuments({ timestamp: { $gte: startOfToday }, action: 'LOGIN_SUCCESS' }),
      LoginHistory.countDocuments({ timestamp: { $gte: startOfToday }, status: 'FAILED' }),
      ActivityLog.countDocuments({ timestamp: { $gte: startOfToday } }),
      LoginHistory.countDocuments(),
      ActivityLog.countDocuments()
    ]);

    return res.json({
      success: true,
      summary: {
        totalLoginsToday,
        failedLoginsToday,
        totalActivitiesToday,
        totalLoginEntries,
        totalActivityEntries
      }
    });
  } catch (error) {
    console.error('❌ SuperAdmin logs-summary error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch logs summary',
      error: error.message
    });
  }
});

module.exports = router;
