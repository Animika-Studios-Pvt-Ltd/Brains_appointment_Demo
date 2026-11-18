const { google } = require('googleapis');
const nodemailer = require('nodemailer');

let oauth2Client = null;
let gmail = null;
let smtpTransporter = null;

function initGmailService(overrideRefreshToken = null) {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    GMAIL_REFRESH_TOKEN,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  } = process.env;

  const refreshTokenToUse = String(overrideRefreshToken || GMAIL_REFRESH_TOKEN || '').trim();

  // Option A: SMTP Transporter (Fallback/Live)
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    try {
      smtpTransporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT || 587),
        secure: String(SMTP_PORT) === '465',
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS
        }
      });
      console.log(`✉️ Gmail Service: Initialized SMTP Transporter (${SMTP_HOST}:${SMTP_PORT || 587} for ${SMTP_USER})`);
    } catch (smtpInitErr) {
      console.warn('⚠️ SMTP Transporter init failed:', smtpInitErr.message);
    }
  }

  // Option B: Google OAuth (Gmail API)
  if (refreshTokenToUse && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
    try {
      console.log('✉️ Gmail Service: Initializing via Google OAuth (Gmail API)...');
      oauth2Client = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI || 'http://localhost:8000/api/super-admin/google-oauth-callback'
      );

      oauth2Client.setCredentials({
        refresh_token: refreshTokenToUse
      });

      gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      console.log('✉️ Gmail Service: Ready to send messages via Google OAuth2 API.');
    } catch (oauthInitErr) {
      console.warn('⚠️ Google OAuth API init failed:', oauthInitErr.message);
    }
  }
}

// Auto-run on module import
initGmailService();

/**
 * Send Mail via SMTP or Google OAuth Gmail API with attachment support
 * attachments: [{ filename, content, contentType }]
 */
async function sendMail(to, subject, html, attachments = []) {
  const { SMTP_FROM, SMTP_USER } = process.env;
  const from = SMTP_FROM || (SMTP_USER ? `Brains Appointment <${SMTP_USER}>` : 'no-reply@brains-appointment.com');

  // Send exclusively via Google OAuth Gmail API
  if (gmail) {
    try {
      console.log(`✉️ Sending email via Google Gmail API to ${to}...`);
      
      let rawMessage = '';

      if (attachments && attachments.length > 0) {
        const boundary = 'foo_bar_baz_' + Date.now().toString(16);
        const parts = [];

        parts.push(`To: ${to}`);
        parts.push(`From: ${from}`);
        parts.push(`Subject: ${subject}`);
        parts.push('MIME-Version: 1.0');
        parts.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
        parts.push('');
        parts.push(`--${boundary}`);
        parts.push('Content-Type: text/html; charset=utf-8');
        parts.push('');
        parts.push(html);

        for (const att of attachments) {
          const fileContent = typeof att.content === 'string'
            ? Buffer.from(att.content).toString('base64')
            : att.content.toString('base64');
          parts.push(`--${boundary}`);
          parts.push(`Content-Type: ${att.contentType || 'application/octet-stream'}; name="${att.filename}"`);
          parts.push(`Content-Disposition: attachment; filename="${att.filename}"`);
          parts.push('Content-Transfer-Encoding: base64');
          parts.push('');
          parts.push(fileContent);
        }

        parts.push(`--${boundary}--`);
        rawMessage = parts.join('\n');
      } else {
        rawMessage = [
          `To: ${to}`,
          `From: ${from}`,
          'Content-Type: text/html; charset=utf-8',
          'MIME-Version: 1.0',
          `Subject: ${subject}`,
          '',
          html
        ].join('\n');
      }

      const encodedMessage = Buffer.from(rawMessage)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage
        }
      });
      console.log(`✅ Email successfully sent via Google Gmail API to ${to}`);
      return { success: true, method: 'oauth2' };
    } catch (apiError) {
      console.warn('⚠️ Google Gmail API send failed:', apiError.message);
      if (!smtpTransporter) {
        throw new Error(`Google Gmail API send failed: ${apiError.message}`);
      }
      console.log(`✉️ Falling back to SMTP Transporter for ${to}...`);
    }
  }

  // Send via SMTP Transporter
  if (smtpTransporter) {
    try {
      console.log(`✉️ Sending email via SMTP to ${to}...`);
      await smtpTransporter.sendMail({
        from,
        to,
        subject,
        html,
        attachments: attachments && attachments.length > 0 ? attachments : undefined
      });
      console.log(`✅ Email successfully sent via SMTP to ${to}`);
      return { success: true, method: 'smtp' };
    } catch (smtpErr) {
      console.error('❌ SMTP send failed:', smtpErr.message);
      throw new Error(`SMTP send failed: ${smtpErr.message}`);
    }
  }

  throw new Error('Neither Google Gmail API nor SMTP is configured. Please check your credentials or authorize Google.');
}

module.exports = { sendMail, initGmailService };