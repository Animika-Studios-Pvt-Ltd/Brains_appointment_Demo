// backend/server.js â€” Express API, JWT Auth, CORS (Updated)
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');

const app = express();

// Enable trust proxy for secure headers behind reverse proxies (Railway, Heroku, etc.)
app.enable('trust proxy');

// ========== CSRF PROTECTION ==========
// ðŸ›¡ï¸ CSRF Protection Strategy:
// This API uses JWT tokens in the Authorization header for authentication.
// JWT-based authentication is inherently protected against CSRF attacks because:
// 1. Tokens are stored in localStorage/sessionStorage (not cookies)
// 2. Browsers do NOT automatically send Authorization headers on cross-site requests
// 3. Attackers cannot access tokens from other origins due to Same-Origin Policy
// 4. All state-changing endpoints require valid JWT in Authorization header
//
// Traditional CSRF tokens are only needed when using cookie-based sessions.
// Since we use JWT tokens that must be manually attached to requests,
// CSRF attacks are not possible even without explicit CSRF middleware.
//
// Reference: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#use-of-custom-request-headers

// ========== CORS CONFIGURATION ==========
const envAllowed = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const allowedOrigins = [
  ...new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://djwa.onrender.com',
    'https://cb072b8a.brains-appointment.pages.dev',
    'https://app.brainshospital.com',
    'https://www.brainshospital.com',
    'https://brainshospital.com',
    process.env.FRONTEND_URL,
    ...envAllowed,
  ].filter(Boolean)),
];

const corsOptions = {
  origin: (origin, callback) => callback(null, true), // Allow all origins for mobile/web dev
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400, // Cache preflight for 24 hours
  optionsSuccessStatus: 204
};

// Apply CORS middleware globally
app.use(cors(corsOptions));

// ========== MIDDLEWARE ==========
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const passport = require('./config/passport');
app.use(passport.initialize());

// Serve static files (uploaded images)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Request logging with enhanced details
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);

  // Log auth header presence (not the actual token)
  if (req.headers.authorization) {
    console.log('  ðŸ”‘ Auth header present');
  }

  next();
});

// ========== HEALTH CHECK ENDPOINT ==========
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    message: 'Server is running',
    timestamp: new Date(),
    environment: process.env.NODE_ENV || 'development',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Healthcare API Server',
    version: '1.0.0',
    auth: 'JWT (email/password)',
    endpoints: {
      auth: '/api/auth',
      admin: '/api/admin',
      doctor: '/api/doctor',
      patient: '/api/patient',
      receptionist: '/api/receptionist',
      appointments: '/api/appointment',
      blockedSlots: '/api/blocked-slots',
      google: '/api/google',
      health: '/health'
    },
    authEndpoints: {
      login: 'POST /api/auth/login',
      register: 'POST /api/auth/register',
      verify: 'GET /api/auth/verify',
      me: 'GET /api/auth/me'
    }
  });
});

// ========== IMPORT ROUTES ==========
console.log('ðŸ“ Loading route modules...');

const authRoutes = require('./routes/auth');
console.log('âœ… Auth routes loaded');

const adminRoutes = require('./routes/admin');
console.log('âœ… Admin routes loaded');

const doctorRoutes = require('./routes/doctor');
console.log('âœ… Doctor routes loaded');

const patientRoutes = require('./routes/patient');
console.log('âœ… Patient routes loaded');

const receptionistRoutes = require('./routes/receptionist');
console.log('âœ… Receptionist routes loaded');

const appointmentRoutes = require('./routes/appointment');
console.log('âœ… Appointment routes loaded');

const blockedSlotsRoutes = require('./routes/blockedSlots');
console.log('âœ… Blocked slots routes loaded');

const googleRoutes = require('./routes/google');
console.log('âœ… Google routes loaded');

const adminPatientsRouter = require('./routes/adminPatients');

const adminAnalyticsRoutes = require('./routes/adminAnalytics');
const superAdminRoutes = require('./routes/superAdmin');
console.log('âœ… Super Admin routes loaded');
const { startNoShowJob } = require('./services/noShowJob');
const { startMeetReminderJob } = require('./services/meetReminderJob');
const { startMonthlyLogCron } = require('./services/monthlyLogExporter');

// ========== REGISTER ROUTES ==========
console.log('ðŸ“ Registering API routes...');

app.use('/api/auth', authRoutes);
console.log('  âœ“ /api/auth');

app.use('/api/super-admin', superAdminRoutes);
console.log('  âœ“ /api/super-admin');

app.use('/api/admin/patients', adminPatientsRouter);
console.log('  âœ“ /api/admin/patients');

app.use('/api/admin', adminRoutes);
console.log('  âœ“ /api/admin');

app.use('/api/doctor', doctorRoutes);
console.log('  âœ“ /api/doctor');

app.use('/api/patient', patientRoutes);
  console.log('  âœ“ /api/patient');

  const patientPaymentsRoutes = require('./routes/patientPayments');
  app.use('/api/patient/payments', patientPaymentsRoutes);
  console.log('  âœ“ /api/patient/payments');

app.use('/api/receptionist', receptionistRoutes);
console.log('  âœ“ /api/receptionist');

app.use('/api/appointment', appointmentRoutes);
console.log('  âœ“ /api/appointment');

app.use('/api/blocked-slots', blockedSlotsRoutes);
console.log('  âœ“ /api/blocked-slots');

// Calendar/Gmail only at /api/google â€” do NOT mount on /api/auth/google
// (that path is reserved for passport login in auth.js)
app.use('/api/google', googleRoutes);
console.log('  âœ“ /api/google');

app.use('/api/admin/analytics', adminAnalyticsRoutes);
console.log('  âœ“ /api/admin/analytics');

const systemSettingsRoutes = require('./routes/systemSettings');
app.use('/api/system-settings', systemSettingsRoutes);

const newsletterRoutes = require('./routes/newsletter');
app.use('/api/newsletter', newsletterRoutes);
const careerRoutes = require('./routes/careers');
app.use('/api/careers', careerRoutes);
console.log('  ✔ /api/careers');
console.log('  ✔ /api/newsletter');
console.log('  âœ“ /api/system-settings');
console.log('âœ… All routes registered successfully');

// ========== DATABASE CONNECTION ==========
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => {
    console.log('â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”');
    console.log('âœ… MongoDB connected successfully');
    console.log(`ðŸ“¦ Database: ${mongoose.connection.name}`);
    console.log(`ðŸ”— Host: ${mongoose.connection.host}`);
    console.log('â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”');
    startNoShowJob();
    startMeetReminderJob();
    startMonthlyLogCron();
  })
  .catch((err) => {
    console.error('âŒ MongoDB connection error:', err);
    process.exit(1);
  });

// Handle MongoDB connection events
mongoose.connection.on('disconnected', () => {
  console.warn('âš ï¸  MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('âœ… MongoDB reconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('âŒ MongoDB error:', err);
});

// ========== ERROR HANDLING ==========
// Handle 404 - Route not found (MUST return JSON, not HTML)
app.use((req, res) => {
  console.warn(`âš ï¸  404 Not Found: ${req.method} ${req.path}`);

  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.path}`,
    availableEndpoints: {
      auth: '/api/auth',
      admin: '/api/admin',
      doctor: '/api/doctor',
      patient: '/api/patient',
      receptionist: '/api/receptionist',
      appointments: '/api/appointment',
      blockedSlots: '/api/blocked-slots',
      google: '/api/google',
      health: '/health'
    },
    data: null
  });
});

// Global error handler (MUST return JSON, not HTML)
app.use((error, req, res, next) => {
  console.error('â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”');
  console.error('âŒ Server error occurred:');
  console.error('Path:', req.path);
  console.error('Method:', req.method);
  console.error('Error:', error.message);
  console.error('Stack:', error.stack);
  console.error('â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”');

  // Handle Mongoose validation errors
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: Object.values(error.errors).map(err => err.message)
    });
  }


  // Handle Mongoose duplicate key errors
  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern)[0];
    return res.status(400).json({
      success: false,
      message: `${field} already exists`,
      field: field
    });
  }

  // Handle Mongoose cast errors
  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format'
    });
  }

  // Handle JWT errors
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
      code: 'INVALID_TOKEN'
    });
  }

  // Handle JWT expired errors
  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired',
      code: 'TOKEN_EXPIRED'
    });
  }

  // Handle Multer errors
  if (error.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      message: error.message,
      code: 'FILE_UPLOAD_ERROR'
    });
  }

  // Handle file filter errors
  if (error.message === 'Only image files allowed') {
    return res.status(400).json({
      success: false,
      message: 'Only image files are allowed',
      code: 'INVALID_FILE_TYPE'
    });
  }

  // Default error response (ALWAYS JSON)
  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    data: null
  });
});

// ========== GRACEFUL SHUTDOWN ==========
const gracefulShutdown = (signal) => {
  console.log(`\nðŸ‘‹ ${signal} received, closing server gracefully...`);

  // Close server first
  if (server) {
    server.close(() => {
      console.log('ðŸ“ª HTTP server closed');

      // Then close MongoDB connection
      mongoose.connection.close().then(() => {
        console.log('ðŸ“¦ MongoDB connection closed');
        console.log('âœ… Graceful shutdown completed');
        process.exit(0);
      }).catch((err) => {
        console.error('âŒ Error closing MongoDB connection:', err);
        process.exit(1);
      });
    });

    // Force close after 10 seconds
    setTimeout(() => {
      console.error('âš ï¸  Forcefully shutting down after timeout');
      process.exit(1);
    }, 10000);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”');
  console.error('ðŸ’¥ UNCAUGHT EXCEPTION:');
  console.error(error);
  console.error('â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”');
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”');
  console.error('ðŸ’¥ UNHANDLED PROMISE REJECTION:');
  console.error('Reason:', reason);
  console.error('Promise:', promise);
  console.error('â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”');
  process.exit(1);
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 8000;
const HOST = process.env.HOST || '0.0.0.0'; // Railway requires 0.0.0.0

const server = app.listen(PORT, HOST, () => {
  console.log('â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”');
  console.log('âœ… Server started successfully');
  console.log(`ðŸš€ Server running on ${HOST}:${PORT}`);
  console.log(`ðŸŒ Local: http://localhost:${PORT}`);
  console.log(`ðŸ” Auth: backend JWT (email/password)`);
  console.log(`ðŸ›¡ï¸  CSRF Protection: JWT (inherent)`);
  console.log(`ðŸ“Š Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`ðŸ’¾ MongoDB: ${process.env.MONGODB_URI ? 'Configured' : 'Not configured'}`);
  const rzpKey = String(process.env.RAZORPAY_KEY_ID || '').trim();
  console.log(
    `ðŸ’³ Razorpay: ${rzpKey && rzpKey !== 'dummy' ? `Configured (${rzpKey.slice(0, 12)}â€¦)` : 'Not configured'}`
  );
  console.log('');
  console.log('ðŸ”“ CORS Allowed Origins:');
  allowedOrigins.forEach(origin => {
    console.log(`   - ${origin}`);
  });
  console.log('');
  console.log('ðŸ“ Key API Routes:');
  console.log('   POST   /api/auth/login         - Sign in');
  console.log('   POST   /api/auth/register      - Patient self-registration');
  console.log('   GET    /api/auth/verify         - Verify Token');
  console.log('   POST   /api/auth/change-password - Change password (logged in)');
  console.log('   GET    /api/auth/me             - Get Current User');
  console.log('   GET    /api/doctor/dashboard    - Doctor Dashboard');
  console.log('   POST   /api/appointment/book    - Book Appointment');
  console.log('   GET    /api/blocked-slots/doctor/:id - Get Blocked Slots');
  console.log('   GET    /health                  - Health Check');
  console.log('â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”');
});

// Handle server errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`âŒ Port ${PORT} is already in use`);
    console.error('ðŸ’¡ Try running: npx kill-port 8000');
    process.exit(1);
  } else {
    console.error('âŒ Server error:', error);
    process.exit(1);
  }
});

module.exports = app;

