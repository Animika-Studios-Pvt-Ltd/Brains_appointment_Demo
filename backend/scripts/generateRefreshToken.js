// backend/scripts/generateRefreshToken.js
const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');

// Load environment variables from backend/.env
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
  console.log('✅ Loaded environment variables from backend/.env');
} else {
  require('dotenv').config();
  console.log('⚠️ Could not find backend/.env file at absolute path. Using default dotenv load.');
}

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
const redirectUri = 'http://localhost:8000/api/google/callback';

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error('\n❌ ERROR: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing in your .env file!');
  console.error('Please configure these credentials from Google Cloud Console first.\n');
  process.exit(1);
}

// Scopes required for both Gmail (sending emails) and Google Calendar (synchronizing appointments)
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
  'https://www.googleapis.com/auth/gmail.send' // Required for Gmail API email sending
];

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  redirectUri
);

const crypto = require('crypto');
const state = crypto.randomBytes(16).toString('hex');

// Generate auth URL
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline', // Get a refresh token
  prompt: 'consent',     // Force consent screen to guarantee refresh token is returned
  scope: SCOPES,
  state: state
});

// Extract port and path from Redirect URI
let port = 8000;
let callbackPath = '/api/google/callback';
try {
  const parsedUrl = new url.URL(redirectUri);
  port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : 80;
  callbackPath = parsedUrl.pathname;
} catch (err) {
  console.warn(`⚠️ Could not parse redirectUri '${redirectUri}'. Using defaults (Port: 8000, Path: /api/google/callback)`);
}

// Start temporary local HTTP server to capture authorization code
const server = http.createServer(async (req, res) => {
  const reqUrl = url.parse(req.url, true);

  // Check if request is the callback
  if (reqUrl.pathname === callbackPath) {
    const { code, state: returnedState, error } = reqUrl.query;

    if (returnedState !== state) {
      console.error(`\n❌ Authorization failed: State mismatch. Expected ${state}, got ${returnedState}`);
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <body style="font-family: system-ui; text-align: center; padding: 3rem; background: #fff5f5; color: #c53030;">
            <h1>❌ Authorization Denied</h1>
            <p>Error details: State validation failed (anti-CSRF check).</p>
            <p>Please close this tab and run the script again.</p>
          </body>
        </html>
      `);
      server.close();
      process.exit(1);
    }

    if (error) {
      console.error(`\n❌ Authorization failed: ${error}`);
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <body style="font-family: system-ui; text-align: center; padding: 3rem; background: #fff5f5; color: #c53030;">
            <h1>❌ Authorization Denied</h1>
            <p>Error details: ${error}</p>
            <p>Please close this tab and run the script again.</p>
          </body>
        </html>
      `);
      server.close();
      process.exit(1);
    }

    if (code) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authorization Successful</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%); display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
              .card { background: white; padding: 3rem; border-radius: 1.5rem; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1); text-align: center; max-width: 500px; }
              .icon { font-size: 4rem; margin-bottom: 1.5rem; animation: scale 0.5s ease-out; }
              h1 { color: #1e1b4b; margin-bottom: 0.5rem; }
              p { color: #4338ca; line-height: 1.6; }
              @keyframes scale { 0% { transform: scale(0); } 100% { transform: scale(1); } }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="icon">🎉</div>
              <h1>Authorization Complete</h1>
              <p>Success! You can now close this tab. Please check your command line terminal to copy your new <b>GMAIL_REFRESH_TOKEN</b>.</p>
            </div>
          </body>
        </html>
      `);

      console.log('\n✅ Authorization code captured! Exchanging for tokens...');
      try {
        const { tokens } = await oauth2Client.getToken(code);
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🎉 TOKENS OBTAINED SUCCESSFULLY! 🎉');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\nCopy the refresh token below and add it to your environment variables:\n');
        console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('Save this in your local backend/.env and production Railway dashboard.');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        server.close(() => {
          console.log('👋 Local temporary callback server closed successfully.');
          process.exit(0);
        });
      } catch (tokenErr) {
        console.error('\n❌ Error exchanging authorization code for tokens:', tokenErr.message);
        server.close();
        process.exit(1);
      }
    }
  } else {
    // Return standard redirect warning
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found. Please wait for OAuth callback.');
  }
});

// Start listening
server.listen(port, () => {
  console.log('\n========================================================================');
  console.log(`🚀 Temporary server listening on port ${port} for OAuth callback...`);
  console.log('========================================================================');
  console.log('\n👉 ACTION REQUIRED:');
  console.log('Open the link below in your web browser, log in with your clinic Gmail account');
  console.log('(`doctorjoshi18@gmail.com`), and approve the scopes (Calendar & Gmail):\n');
  console.log(`🔗 \x1b[36m${authUrl}\x1b[0m\n`);
  console.log('========================================================================');
  console.log('💡 Note: If port 8000 is already in use, stop your backend server temporarily');
  console.log('   (Ctrl+C in your backend terminal) before running this script.');
  console.log('========================================================================\n');
});
