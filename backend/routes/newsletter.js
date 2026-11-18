const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const Subscriber = require('../modal/Subscriber');
const gmailService = require('../services/gmailService');

// POST /api/newsletter/subscribe
router.post('/subscribe', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, message: 'Valid email address is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email format.' });
    }

    // Save or update subscriber in DB
    try {
      await Subscriber.findOneAndUpdate(
        { email: cleanEmail },
        {
          status: 'active',
          lastEmailSentAt: new Date()
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (dbErr) {
      console.warn('Warning: Could not save subscriber to database:', dbErr.message);
    }

    // Prepare attachments: Latest 3 Brain Voice PDF issues
    // Fetches directly via live website URL or local disk if available
    const filesMeta = [
      {
        filename: 'Brain-Voice-Feb-2025.pdf',
        localPath: path.resolve(__dirname, '../../../Brains/static/brainshospital-com/brain-voice-feb-2025.pdf'),
        url: 'https://brainshospital.com/static/brainshospital-com/brain-voice-feb-2025.pdf'
      },
      {
        filename: 'Brain-Voice-Jan-2025.pdf',
        localPath: path.resolve(__dirname, '../../../Brains/static/brainshospital-com/brain-voice-jan-2025.pdf'),
        url: 'https://brainshospital.com/static/brainshospital-com/brain-voice-jan-2025.pdf'
      },
      {
        filename: 'Brain-Voice-Dec-2024.pdf',
        localPath: path.resolve(__dirname, '../../../Brains/static/brainshospital-com/brain-voice-dec-2024.pdf'),
        url: 'https://brainshospital.com/static/brainshospital-com/brain-voice-dec-2024.pdf'
      }
    ];

    const attachments = [];

    for (const item of filesMeta) {
      try {
        if (fs.existsSync(item.localPath)) {
          const fileBuffer = fs.readFileSync(item.localPath);
          attachments.push({
            filename: item.filename,
            content: fileBuffer,
            contentType: 'application/pdf'
          });
        } else {
          // Download buffer via HTTP if running in cloud container (Railway)
          const response = await axios.get(item.url, { responseType: 'arraybuffer', timeout: 10000 });
          if (response.data) {
            attachments.push({
              filename: item.filename,
              content: Buffer.from(response.data),
              contentType: 'application/pdf'
            });
          }
        }
      } catch (fileErr) {
        console.warn('Could not fetch attachment ' + item.filename + ':', fileErr.message);
      }
    }

    const liveArchiveUrl = 'https://brainshospital.com/Brain-Voice.html';

    const emailSubject = 'Welcome to Brain Voice - Your Monthly Newsletters from Brains Hospital';
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f8fa; margin: 0; padding: 20px; color: #333333; }
    .card { max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #104c97 0%, #15b9c5 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0 0 8px 0; font-size: 26px; font-weight: 700; }
    .header p { margin: 0; font-size: 15px; opacity: 0.95; }
    .body { padding: 30px 28px; line-height: 1.6; }
    .welcome-text { font-size: 16px; margin-bottom: 20px; color: #222222; }
    .attachment-box { background: #edf9fb; border-left: 4px solid #15b9c5; padding: 14px 18px; border-radius: 6px; margin: 20px 0; }
    .attachment-box h3 { margin: 0 0 8px 0; font-size: 15px; color: #104c97; }
    .attachment-box ul { margin: 0; padding-left: 20px; font-size: 14px; color: #444444; }
    .btn-container { text-align: center; margin: 32px 0 20px 0; }
    .btn { background: linear-gradient(90deg, #104c97, #15b9c5); color: #ffffff !important; text-decoration: none; padding: 13px 30px; font-size: 15px; font-weight: 600; border-radius: 25px; display: inline-block; box-shadow: 0 4px 12px rgba(16,76,151,0.25); }
    .footer { background: #f8fafc; border-top: 1px solid #eef2f5; padding: 20px; text-align: center; font-size: 12px; color: #777777; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>Brain Voice Newsletter</h1>
      <p>Brains Super Speciality Hospital, Bengaluru</p>
    </div>
    <div class="body">
      <p class="welcome-text">Dear Reader,</p>
      <p>Thank you for subscribing to <strong>Brain Voice</strong>, the official monthly health and neuroscience publication from Brains Super Speciality Hospital.</p>
      
      <p>Brain Voice brings you groundbreaking insights, articles by <strong>Dr. N. K. Venkataramana</strong> and leading neuro-specialists, brain wellness tips, and case stories.</p>

      <div class="attachment-box">
        <h3>Attached with this email (Latest 3 Editions):</h3>
        <ul>
          <li><strong>February 2025</strong> Issue (Bilingual - English & Kannada)</li>
          <li><strong>January 2025</strong> Issue (Bilingual)</li>
          <li><strong>December 2024</strong> Issue (Bilingual)</li>
        </ul>
      </div>

      <p>Want to explore our entire archive of past newsletters and special publications?</p>
      <div class="btn-container">
        <a href="${liveArchiveUrl}" class="btn" target="_blank">View Previous Publications & Archive</a>
      </div>
    </div>
    <div class="footer">
      <p style="margin: 0 0 6px 0;"><strong>Brains Super Speciality Hospital</strong></p>
      <p style="margin: 0 0 6px 0;">Helpline: +91 91480 80000 | Bengaluru, Karnataka, India</p>
      <p style="margin: 0;">You received this email because you subscribed on our website.</p>
    </div>
  </div>
</body>
</html>
`;

    // Dispatch email via Gmail service
    await gmailService.sendMail(cleanEmail, emailSubject, emailHtml, attachments);

    return res.status(200).json({
      success: true,
      message: 'Subscription successful! The latest 3 editions of Brain Voice have been sent to your email.'
    });
  } catch (error) {
    console.error('Newsletter subscription error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to process subscription. Please try again later.'
    });
  }
});

module.exports = router;
