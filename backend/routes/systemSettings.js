const express = require('express');
const router = express.Router();
const SystemSetting = require('../modal/SystemSetting');
const { authenticate, requireRole } = require('../middleware/authMiddleware');

// Get all system settings
router.get('/', async (req, res) => {
  try {
    const settings = await SystemSetting.find({});
    const settingsMap = {};
    settings.forEach(s => {
      settingsMap[s.key] = s.value;
    });
    if (settingsMap.onlineBookingLive === undefined) {
      settingsMap.onlineBookingLive = true;
    }
    return res.json({
      status: 'success',
      data: settingsMap,
      settings: settingsMap
    });
  } catch (error) {
    console.error('Error fetching system settings:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch system settings',
      error: error.message
    });
  }
});

// Get online booking live status (public endpoint)
router.get('/online-booking', async (req, res) => {
  try {
    const setting = await SystemSetting.findOne({ key: 'onlineBookingLive' });
    // Default to true if setting is not configured yet
    const onlineBookingLive = setting ? setting.value === true : true;

    return res.json({
      status: 'success',
      onlineBookingLive
    });
  } catch (error) {
    console.error('Error fetching online booking status:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch online booking status',
      error: error.message
    });
  }
});

// Update online booking live status (auth required)
router.put('/online-booking', authenticate, requireRole('doctor', 'call_center', 'receptionist', 'admin', 'super_admin', 'superadmin'), async (req, res) => {
  try {
    const { onlineBookingLive } = req.body;

    if (typeof onlineBookingLive !== 'boolean') {
      return res.status(400).json({
        status: 'error',
        message: 'onlineBookingLive must be a boolean value'
      });
    }

    const setting = await SystemSetting.findOneAndUpdate(
      { key: 'onlineBookingLive' },
      { value: onlineBookingLive },
      { new: true, upsert: true }
    );

    return res.json({
      status: 'success',
      message: `Online booking is now ${onlineBookingLive ? 'live' : 'disabled'}`,
      onlineBookingLive: setting.value
    });
  } catch (error) {
    console.error('Error updating online booking status:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update online booking status',
      error: error.message
    });
  }
});

// Get detailed system services status (database, email, storage, razorpay, cloudinary)
router.get('/services-status', async (req, res) => {
  try {
    const mongoose = require('mongoose');

    const dbConnected = mongoose.connection.readyState === 1;

    const rzpKey = (process.env.RAZORPAY_KEY_ID || '').trim();
    const rzpConfigured = !!(rzpKey && rzpKey !== 'dummy');

    const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
    const cloudConfigured = !!cloudName;

    const smtpUser = (process.env.SMTP_USER || 'doctorjoshi18@gmail.com').trim();
    const smtpConfigured = !!(process.env.SMTP_HOST || process.env.GMAIL_REFRESH_TOKEN || smtpUser);

    const maskedRzpKey = rzpKey ? `${rzpKey.slice(0, 8)}...${rzpKey.slice(-4)}` : 'Not Configured';

    const services = [
      {
        id: 'database',
        name: 'Database (MongoDB)',
        subtitle: `Connection: ${dbConnected ? 'Connected' : 'Disconnected'}`,
        status: dbConnected ? 'Healthy' : 'Error',
        ok: dbConnected,
        iconType: 'database'
      },
      {
        id: 'email',
        name: 'Email Gateway (Gmail OAuth2)',
        subtitle: `Sender: ${smtpUser}`,
        status: smtpConfigured ? 'Connected' : 'Not Configured',
        ok: smtpConfigured,
        iconType: 'email'
      },
      {
        id: 'storage',
        name: 'Document Storage (Plesk Server)',
        subtitle: `Endpoint: ${process.env.VITE_BACKEND_URL || 'http://localhost:8000'}/uploads`,
        status: 'Online',
        ok: true,
        iconType: 'folder'
      },
      {
        id: 'whatsapp',
        name: 'WhatsApp API (QuickMessage)',
        subtitle: 'Template: otp_verification',
        status: 'Configured',
        ok: true,
        iconType: 'chat'
      },
      {
        id: 'media',
        name: 'Media Storage (Cloudinary CDN)',
        subtitle: `Cloud Name: ${cloudName || 'dml2h9ej4'}`,
        status: cloudConfigured ? 'Connected' : 'Offline',
        ok: cloudConfigured,
        iconType: 'image'
      },
      {
        id: 'payment',
        name: 'Payment Portal (Razorpay Gateway)',
        subtitle: `Merchant Key: ${maskedRzpKey}`,
        status: rzpConfigured ? 'Connected' : 'Not Configured',
        ok: rzpConfigured,
        iconType: 'payment'
      }
    ];

    return res.json({
      status: 'success',
      services
    });
  } catch (error) {
    console.error('Error fetching services status:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch services status',
      error: error.message
    });
  }
});

// Send test email endpoint
router.post('/send-test-email', async (req, res) => {
  try {
    const { to, recipientEmail, subject, message, messageBody } = req.body;
    const targetEmail = (to || recipientEmail || '').trim();

    if (!targetEmail || !targetEmail.includes('@')) {
      return res.status(400).json({
        status: 'error',
        message: 'A valid recipient email address is required'
      });
    }

    const mailSubject = (subject || 'System Test Mail').trim();
    const mailBody = (message || messageBody || 'Hello! This is a test email sent from the API & Mail Tester.').trim();

    const { sendMail } = require('../services/notificationService');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8"/>
      </head>
      <body style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 20px; color: #1e293b;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 24px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
            <span style="font-size: 20px;">✉️</span>
            <h2 style="margin: 0; color: #047857; font-size: 18px;">${mailSubject}</h2>
          </div>
          <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 20px;">
            ${mailBody.replace(/\n/g, '<br/>')}
          </p>
          <div style="border-top: 1px solid #f1f5f9; margin-top: 20px; padding-top: 12px; font-size: 12px; color: #64748b;">
            <p style="margin: 0;">Sent automatically via <strong>Brains Hospital System API & Mail Tester</strong>.</p>
            <p style="margin: 4px 0 0 0; color: #94a3b8;">Timestamp: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await sendMail(targetEmail, mailSubject, htmlContent);

    return res.json({
      status: 'success',
      message: `Test email sent successfully to ${targetEmail}`
    });
  } catch (error) {
    console.error('Error sending test email:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to send test email'
    });
  }
});

module.exports = router;
