const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const googleCalendarService = require('../services/googleCalendar');
const Doctor = require('../modal/Doctor');
const Patient = require('../modal/Patient');
const Admin = require('../modal/Admin');
const Receptionist = require('../modal/Receptionist');
const jwt = require('jsonwebtoken');
const { initGmailService } = require('../services/gmailService');

// ========== AUTHENTICATE MIDDLEWARE ==========
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('❌ No valid Authorization header');
    return res.status(401).json({
      success: false,
      message: 'No token provided'
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    console.log('✅ Token verified:', decoded.email, decoded.type);
    next();
  } catch (error) {
    console.log('❌ Token verification failed:', error.message);
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

// Helper to get user model
const getUserModel = (userType) => {
  switch (userType) {
    case 'doctor': return Doctor;
    case 'patient': return Patient;
    case 'admin':
    case 'super_admin': return Admin;
    case 'receptionist': return Receptionist;
    default: throw new Error('Invalid user type');
  }
};

// ========== GET AUTHORIZATION URL ==========
router.get('/auth', authenticate, (req, res) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  try {
    const { id, type } = req.user;
    console.log('📋 Generating Google auth URL for:', { id, type });

    const authUrl = googleCalendarService.getAuthUrl(id, type);
    
    res.json({
      success: true,
      data: { authUrl },
      message: 'Authorization URL generated'
    });
  } catch (error) {
    console.error('❌ Error generating auth URL:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ========== PUBLIC SYSTEM GMAIL AUTHORIZATION LINK ==========
router.get('/authorize-gmail', (req, res) => {
  try {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
    // Must match GOOGLE_REDIRECT_URI (calendar/gmail) — NOT the login callback
    const redirectUri =
      GOOGLE_REDIRECT_URI || 'http://localhost:8000/api/google/callback';

    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    const SCOPES = [
      'openid',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/gmail.send'
    ];

    const state = encodeURIComponent(JSON.stringify({ isSystemGmailAuth: true }));

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent select_account',
      scope: SCOPES,
      state
    });

    if (req.query.json === 'true' || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, authUrl });
    }

    return res.redirect(authUrl);
  } catch (err) {
    console.error('❌ authorize-gmail error:', err);
    return res.status(500).send(`<h1>Failed to generate Google Auth URL: ${err.message}</h1>`);
  }
});

// ========== OAUTH CALLBACK ==========
router.get('/callback', async (req, res) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  try {
    const { code, state, error } = req.query;

    console.log('📞 Google OAuth callback received');

    if (error) {
      console.error('❌ User denied access:', error);
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Connection Failed</title>
            <style>
              body { font-family: system-ui; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); margin: 0; }
              .container { background: white; padding: 3rem; border-radius: 1.5rem; box-shadow: 0 25px 60px rgba(0,0,0,0.3); text-align: center; max-width: 500px; }
              h1 { color: #dc2626; margin-bottom: 1rem; font-size: 2rem; }
              p { color: #6b7280; line-height: 1.6; }
              button { background: #3b82f6; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; margin-top: 1.5rem; transition: background 0.2s; }
              button:hover { background: #2563eb; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>❌ Connection Failed</h1>
              <p>Google access was not granted.</p>
              <button onclick="window.close()">Close Window</button>
            </div>
          </body>
        </html>
      `);
    }

    if (!code) {
      return res.status(400).send('<h1>Invalid callback parameters</h1>');
    }

    let stateData = {};
    if (state) {
      try {
        stateData = JSON.parse(decodeURIComponent(state));
      } catch (e) {
        stateData = {};
      }
    }

    // Exchange code for tokens
    const tokens = await googleCalendarService.exchangeCodeForTokens(code);
    console.log('🎫 Tokens received:', JSON.stringify(tokens, null, 2));

    // Get user email
    const userEmail = await googleCalendarService.getUserEmail(tokens.access_token);
    console.log('📧 Calendar email:', userEmail);

    // If a refresh token is returned, update system GMAIL_REFRESH_TOKEN automatically
    if (tokens.refresh_token) {
      console.log('🎉 Captured GMAIL_REFRESH_TOKEN from Google OAuth for:', userEmail);
      process.env.GMAIL_REFRESH_TOKEN = tokens.refresh_token;

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
    }

    if (stateData.isSystemGmailAuth || !stateData.userId) {
      const finalRefreshToken = tokens.refresh_token || process.env.GMAIL_REFRESH_TOKEN || 'None Captured';
      const redirectUri =
        process.env.GOOGLE_REDIRECT_URI ||
        'http://localhost:8000/api/google/callback';
      const clientId =
        process.env.GOOGLE_CLIENT_ID ||
        '325081311407-bhereldf4121m22unht84rp555ng00ar.apps.googleusercontent.com';

      return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Google OAuth Token Details</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: #0f172a;
              color: #f8fafc;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              padding: 2rem;
            }
            .card {
              background: #1e293b;
              border: 1px solid #334155;
              border-radius: 1.25rem;
              padding: 2.5rem;
              max-width: 680px;
              width: 100%;
              box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            }
            .header {
              display: flex;
              align-items: center;
              gap: 1rem;
              margin-bottom: 2rem;
              border-bottom: 1px solid #334155;
              padding-bottom: 1.5rem;
            }
            .badge {
              background: ${tokens.refresh_token ? '#059669' : '#d97706'};
              color: white;
              padding: 0.25rem 0.75rem;
              border-radius: 9999px;
              font-size: 0.85rem;
              font-weight: 600;
            }
            .field-group {
              margin-bottom: 1.5rem;
            }
            label {
              display: block;
              font-size: 0.85rem;
              font-weight: 600;
              color: #94a3b8;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              margin-bottom: 0.5rem;
            }
            input, textarea {
              width: 100%;
              background: #0f172a;
              border: 1px solid #475569;
              color: #38bdf8;
              padding: 0.85rem 1rem;
              border-radius: 0.75rem;
              font-family: monospace;
              font-size: 0.95rem;
              outline: none;
            }
            textarea {
              height: 110px;
              resize: none;
            }
            .copy-btn {
              background: #2563eb;
              color: white;
              border: none;
              padding: 0.65rem 1.25rem;
              border-radius: 0.5rem;
              font-weight: 600;
              cursor: pointer;
              margin-top: 0.5rem;
              transition: background 0.2s;
            }
            .copy-btn:hover { background: #1d4ed8; }
            .note {
              background: #0f172a;
              border-left: 4px solid #38bdf8;
              padding: 1rem;
              border-radius: 0.5rem;
              font-size: 0.9rem;
              color: #cbd5e1;
              line-height: 1.5;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <h2 style="font-size: 1.5rem; color: #f8fafc;">🔑 Google OAuth Token Screen</h2>
              <span class="badge">${tokens.refresh_token ? '🎉 NEW TOKEN CAPTURED' : '⚠️ CACHED TOKEN'}</span>
            </div>

            <div class="field-group">
              <label>Authorized Account Email</label>
              <input type="text" readonly value="${userEmail || 'callcenter@brains.org.in'}" />
            </div>

            <div class="field-group">
              <label>GMAIL_REFRESH_TOKEN</label>
              <textarea id="tokenBox" readonly>${finalRefreshToken}</textarea>
              <button class="copy-btn" onclick="copyToken()">📋 Copy Refresh Token</button>
            </div>

            <div class="field-group">
              <label>Authorized Redirect URI</label>
              <input type="text" readonly value="${redirectUri}" />
            </div>

            <div class="field-group">
              <label>Google Client ID</label>
              <input type="text" readonly value="${clientId}" />
            </div>

            <div class="note">
              ${tokens.refresh_token 
                ? '✅ This token was automatically saved to <code>backend/.env</code> and loaded into your server.' 
                : '⚠️ Google cached consent so no new refresh token was sent. To force a new token, remove app access at <a href="https://myaccount.google.com/permissions" target="_blank" style="color: #38bdf8;">Google Permissions</a> and re-open this link.'}
            </div>
          </div>

          <script>
            function copyToken() {
              const box = document.getElementById('tokenBox');
              box.select();
              document.execCommand('copy');
              alert('Copied GMAIL_REFRESH_TOKEN to clipboard!');
            }
          </script>
        </body>
      </html>
    `);
    }

    const UserModel = getUserModel(stateData.userType);
    if (!UserModel) {
      throw new Error(`Invalid user type: ${stateData.userType}`);
    }
    const user = await UserModel.findById(stateData.userId);
    if (!user) {
      throw new Error(`User not found with ID: ${stateData.userId}`);
    }

    const existingCalendarId = user.googleCalendar?.workCalendarId || null;

    // ✅ Create/get work calendar
    console.log('📅 Setting up work calendar...');
    const workCalendarId = await googleCalendarService.getOrCreateWorkCalendar(tokens, existingCalendarId);
    console.log('✅ Work calendar ID:', workCalendarId);

    user.googleCalendar = {
      connected: true,
      isConnected: true,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || user.googleCalendar?.refreshToken,
      expiryDate: tokens.expiry_date,
      tokenExpiry: new Date(tokens.expiry_date),
      scope: tokens.scope,
      tokenType: tokens.token_type,
      email: userEmail,
      calendarId: 'primary',
      workCalendarId: workCalendarId, // ✅ Store work calendar ID
      connectedAt: new Date()
    };

    await user.save();
    console.log('✅ Calendar data saved to database');

    // Success page
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Calendar Connected</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
              display: flex; 
              justify-content: center; 
              align-items: center; 
              min-height: 100vh; 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            }
            .container { 
              background: white; 
              padding: 3rem; 
              border-radius: 1.5rem; 
              box-shadow: 0 25px 70px rgba(0,0,0,0.3); 
              text-align: center; 
              max-width: 550px;
              animation: slideIn 0.5s ease-out;
            }
            @keyframes slideIn {
              from { opacity: 0; transform: translateY(20px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .checkmark { 
              width: 90px; 
              height: 90px; 
              background: linear-gradient(135deg, #10b981 0%, #059669 100%); 
              border-radius: 50%; 
              display: flex; 
              align-items: center; 
              justify-content: center; 
              margin: 0 auto 2rem; 
              animation: pop 0.5s ease-out 0.3s both;
              box-shadow: 0 10px 30px rgba(16, 185, 129, 0.3);
            }
            @keyframes pop {
              0% { transform: scale(0); }
              50% { transform: scale(1.1); }
              100% { transform: scale(1); }
            }
            .checkmark svg { 
              width: 50px; 
              height: 50px; 
              stroke: white; 
              stroke-width: 3; 
              fill: none;
              stroke-dasharray: 100;
              stroke-dashoffset: 100;
              animation: draw 0.5s ease-out 0.5s forwards;
            }
            @keymarks draw {
              to { stroke-dashoffset: 0; }
            }
            h1 { 
              color: #111827; 
              margin-bottom: 1rem; 
              font-size: 2rem;
              font-weight: 700;
            }
            p { 
              color: #6b7280; 
              line-height: 1.8; 
              margin-bottom: 0.5rem;
            }
            .email { 
              color: #3b82f6; 
              font-weight: 600; 
              background: #eff6ff;
              padding: 10px 20px;
              border-radius: 8px;
              display: inline-block;
              margin: 1rem 0;
            }
            .calendar-name {
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
              color: white;
              padding: 12px 20px;
              border-radius: 10px;
              font-weight: 600;
              margin: 1rem 0;
              display: inline-block;
            }
            .info { 
              background: #f0f9ff; 
              border-left: 4px solid #3b82f6; 
              padding: 1.5rem; 
              margin-top: 1.5rem; 
              text-align: left;
              border-radius: 0.75rem;
            }
            .info-title {
              margin: 0 0 0.75rem 0; 
              color: #1f2937; 
              font-weight: 700;
              font-size: 1.1rem;
            }
            .info-list {
              margin: 0;
              padding-left: 1.5rem;
              color: #4b5563;
              line-height: 2;
            }
            .countdown {
              margin-top: 1.5rem;
              color: #9ca3af;
              font-size: 0.875rem;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="checkmark">
              <svg viewBox="0 0 52 52">
                <polyline points="10,26 20,36 42,14" />
              </svg>
            </div>
            <h1>✅ Calendar Connected!</h1>
            <p>Your work calendar has been successfully set up.</p>
            <div class="email">📧 ${userEmail}</div>
            <div class="calendar-name">📅 Medical Appointments</div>
            <div class="info">
              <p class="info-title">🎉 What's Configured:</p>
              <ul class="info-list">
                <li><strong>Separate Work Calendar:</strong> Only medical appointments sync here</li>
                <li><strong>Personal Privacy:</strong> Your personal events stay completely private</li>
                <li><strong>Auto-Sync:</strong> New appointments appear instantly</li>
                <li><strong>Smart Reminders:</strong> Email 1hr before, popup 15min before</li>
              </ul>
            </div>
            <div class="countdown">Closing in <span id="timer">4</span> seconds...</div>
          </div>
          <script>
            let count = 4;
            const timer = document.getElementById('timer');
            const countdown = setInterval(() => {
              count--;
              timer.textContent = count;
              if (count <= 0) {
                clearInterval(countdown);
                if (window.opener) {
                  window.opener.postMessage({ 
                    type: 'CALENDAR_CONNECTED',
                    calendarId: '${workCalendarId}'
                  }, '*');
                }
                window.close();
              }
            }, 1000);
          </script>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('❌ Google calendar callback error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Connection Error</title></head>
        <body style="font-family: system-ui; text-align: center; padding: 3rem; background: #f3f4f6;">
          <div style="background: white; padding: 2rem; border-radius: 1rem; max-width: 500px; margin: 0 auto; box-shadow: 0 10px 40px rgba(0,0,0,0.1);">
            <h1 style="color: #dc2626; margin-bottom: 1rem;">❌ Connection Failed</h1>
            <p style="color: #6b7280; margin-bottom: 1.5rem;">${error.message}</p>
            <button onclick="window.close()" style="background: #3b82f6; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 600;">Close Window</button>
          </div>
        </body>
      </html>
    `);
  }
});

// ========== GET CONNECTION STATUS ==========
router.get('/status', authenticate, async (req, res) => {
  try {
    const { id, type } = req.user;
    console.log('🔍 Checking Google Calendar status for:', id);

    const UserModel = getUserModel(type);
    const user = await UserModel.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const isConnected = !!(user.googleCalendar?.accessToken && user.googleCalendar?.refreshToken);

    res.json({
      success: true,
      data: {
        isConnected,
        email: user.googleCalendar?.email || null,
        connectedAt: user.googleCalendar?.connectedAt || null,
        workCalendarId: user.googleCalendar?.workCalendarId || null,
        hasWorkCalendar: !!user.googleCalendar?.workCalendarId
      }
    });
  } catch (error) {
    console.error('❌ Error checking status:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ========== GET CALENDAR EVENTS ==========
router.get('/events', authenticate, async (req, res) => {
  try {
    const { id, type } = req.user;
    const { timeMin, timeMax, maxResults } = req.query;

    console.log('📅 Fetching work calendar events for:', id);

    const UserModel = getUserModel(type);
    const user = await UserModel.findById(id);

    if (!user || !user.googleCalendar?.accessToken) {
      return res.status(400).json({
        success: false,
        message: 'Calendar not connected'
      });
    }

    const events = await googleCalendarService.getCalendarEvents(
      user.googleCalendar,
      {
        timeMin: timeMin || new Date().toISOString(),
        timeMax: timeMax || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        maxResults: parseInt(maxResults) || 50
      },
      id,
      type
    );

    console.log('✅ Returning', events.length, 'work appointments (personal events excluded)');

    res.json({
      success: true,
      data: { 
        events,
        calendarId: user.googleCalendar.workCalendarId || 'primary',
        isWorkCalendar: !!user.googleCalendar.workCalendarId
      },
      message: 'Work calendar events fetched successfully'
    });
  } catch (error) {
    console.error('❌ Error fetching events:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ========== DISCONNECT CALENDAR ==========
router.delete('/disconnect', authenticate, async (req, res) => {
  try {
    const { id, type } = req.user;
    console.log('🔌 Disconnecting calendar for:', id);

    const UserModel = getUserModel(type);
    const user = await UserModel.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.googleCalendar = undefined;
    await user.save();

    console.log('✅ Calendar disconnected (work calendar remains in Google)');

    res.json({
      success: true,
      message: 'Calendar disconnected. Your "Medical Appointments" calendar remains in Google Calendar.'
    });
  } catch (error) {
    console.error('❌ Error disconnecting calendar:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ========== CREATE CALENDAR EVENT ==========
router.post('/event', authenticate, async (req, res) => {
  try {
    const { id, type } = req.user;
    const { patientId, appointmentData } = req.body;

    console.log('📝 Creating calendar event');

    const UserModel = getUserModel(type);
    const doctor = await UserModel.findById(id);

    if (!doctor || !doctor.googleCalendar?.accessToken) {
      return res.status(400).json({
        success: false,
        message: 'Calendar not connected'
      });
    }

    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    const result = await googleCalendarService.createAppointmentEvent(
      doctor,
      patient,
      appointmentData
    );

    if (result.success) {
      res.json({
        success: true,
        data: result,
        message: 'Appointment added to work calendar'
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error
      });
    }
  } catch (error) {
    console.error('❌ Error creating event:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ========== UPDATE CALENDAR EVENT ==========
router.put('/event/:eventId', authenticate, async (req, res) => {
  try {
    const { id, type } = req.user;
    const { eventId } = req.params;
    const { appointmentData } = req.body;

    const UserModel = getUserModel(type);
    const doctor = await UserModel.findById(id);

    if (!doctor || !doctor.googleCalendar?.accessToken) {
      return res.status(400).json({
        success: false,
        message: 'Calendar not connected'
      });
    }

    const result = await googleCalendarService.updateAppointmentEvent(
      doctor,
      eventId,
      appointmentData
    );

    if (result.success) {
      res.json({
        success: true,
        message: 'Work calendar event updated'
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error
      });
    }
  } catch (error) {
    console.error('❌ Error updating event:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ========== DELETE CALENDAR EVENT ==========
router.delete('/event/:eventId', authenticate, async (req, res) => {
  try {
    const { id, type } = req.user;
    const { eventId } = req.params;

    const UserModel = getUserModel(type);
    const doctor = await UserModel.findById(id);

    if (!doctor || !doctor.googleCalendar?.accessToken) {
      return res.status(400).json({
        success: false,
        message: 'Calendar not connected'
      });
    }

    const result = await googleCalendarService.deleteAppointmentEvent(doctor, eventId);

    if (result.success) {
      res.json({
        success: true,
        message: 'Appointment removed from work calendar'
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error
      });
    }
  } catch (error) {
    console.error('❌ Error deleting event:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ========== DEBUG ENDPOINT ==========
router.get('/debug/calendar-data', authenticate, async (req, res) => {
  try {
    const { id, type } = req.user;
    const UserModel = getUserModel(type);
    const user = await UserModel.findById(id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      data: {
        hasCalendarData: !!user.googleCalendar,
        email: user.googleCalendar?.email,
        calendarId: user.googleCalendar?.calendarId,
        workCalendarId: user.googleCalendar?.workCalendarId,
        hasAccessToken: !!user.googleCalendar?.accessToken,
        hasRefreshToken: !!user.googleCalendar?.refreshToken,
        tokenExpiry: user.googleCalendar?.tokenExpiry,
        connectedAt: user.googleCalendar?.connectedAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
