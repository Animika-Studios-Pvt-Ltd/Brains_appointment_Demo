// backend/routes/auth.js — application JWT auth (login/register/verify)
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../modal/Admin');
const Doctor = require('../modal/Doctor');
const Receptionist = require('../modal/Receptionist');
const Patient = require('../modal/Patient');
const passport = require('passport');
const authenticate = require('../middleware/authMiddleware');
const { recordLoginHistory, recordActivity } = require('../services/activityLogger');

const PASSWORD_RESET_PURPOSE = 'password-reset';

function frontendBaseUrl() {
  return String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Helper function to find user across all collections (email normalized)
const findUserByEmail = async (email) => {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return { user: null, type: null };

  let user = await Admin.findOne({ email: e });
  if (user) {
    return { user, type: user.userType || user.role || 'admin' };
  }

  user = await Doctor.findOne({ email: e });
  if (user) {
    return { user, type: 'doctor' };
  }

  user = await Receptionist.findOne({ email: e });
  if (user) {
    return { user, type: user.userType || 'receptionist' };
  }

  user = await Patient.findOne({ email: e });
  if (user) {
    return { user, type: 'patient' };
  }

  return { user: null, type: null };
};

// Helper function to find user by ID and type
const findUserById = async (id, type) => {
  let Model;
  
  switch (type) {
    case 'admin':
    case 'super_admin':
      Model = Admin;
      break;
    case 'doctor':
      Model = Doctor;
      break;
    case 'receptionist':
    case 'call_center':
      Model = Receptionist;
      break;
    case 'patient':
      Model = Patient;
      break;
    default:
      return null;
  }

  return await Model.findById(id).select('+password');
};

const prepareUserResponse = (user, userType, authProvider = null) => {
  const provider = authProvider || user.authProvider || (user.googleId ? 'google' : 'password');
  const hasPassword =
    user.password !== undefined && user.password !== null && String(user.password).length > 0
      ? true
      : user.hasPassword !== undefined
      ? Boolean(user.hasPassword)
      : provider === 'password' || !user.googleId;

  return {
    id: user._id,
    _id: user._id,
    name: user.name,
    email: user.email,
    type: userType,
    role: user.role || user.userType || userType,
    userType: user.userType || userType,
    profileImage: user.profileImage,
    permissions: user.permissions || [],
    isVerified: user.isVerified || false,
    isActive: user.isActive !== false,
    googleId: user.googleId || null,
    hasPassword,
    authProvider: authProvider || user.authProvider || (user.googleId ? 'google' : 'password'),
    ...(userType === 'patient' && {
      phone: user.phone || '',
      age: user.age ?? null,
      address: user.address || '',
      gender: user.gender || null,
      dob: user.dob || null,
      bloodGroup: user.bloodGroup || null,
    }),
    ...(userType === 'doctor' && {
      specialization: user.specialization,
      fees: user.fees,
      qualifications: user.qualifications,
    }),
  };
};

async function findUserWithCredentialsByEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return { user: null, type: null };
  let user = await Admin.findOne({ email: e }).select('+password');
  if (user) {
    return { user, type: user.userType || user.role || 'admin' };
  }
  user = await Doctor.findOne({ email: e }).select('+password');
  if (user) return { user, type: 'doctor' };
  user = await Receptionist.findOne({ email: e }).select('+password');
  if (user) return { user, type: user.userType || 'receptionist' };
  user = await Patient.findOne({ email: e }).select('+password');
  if (user) return { user, type: 'patient' };
  return { user: null, type: null };
}

/** Issue JWT + user payload after password or registration success */
async function sendLoginSuccess(res, user, userType, req = null) {
  if (user.isActive === false) {
    if (req) {
      await recordLoginHistory({
        userId: user._id,
        userName: user.name,
        userEmail: user.email,
        userType,
        action: 'LOGIN_FAILED',
        status: 'FAILED',
        failureReason: 'Account deactivated',
        req
      });
    }
    return res.status(403).json({
      success: false,
      message: 'Your account has been deactivated. Please contact administrator.',
    });
  }

  user.lastLogin = new Date();
  await user.save();

  // Log successful login & activity
  await recordLoginHistory({
    userId: user._id,
    userName: user.name,
    userEmail: user.email,
    userType,
    action: 'LOGIN_SUCCESS',
    status: 'SUCCESS',
    req
  });

  await recordActivity({
    userId: user._id,
    userName: user.name,
    userEmail: user.email,
    userType,
    action: 'USER_LOGIN',
    description: `${user.name} (${userType}) logged in successfully`,
    req
  });

  const tokenPayload = {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    type: userType,
    role: user.role || userType,
    userType,
    authProvider: 'password',
  };

  const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '7d' });
  const userData = prepareUserResponse(user, userType, 'password');

  return res.json({
    success: true,
    message: 'Authentication successful',
    token,
    user: userData,
  });
}

// ========== GOOGLE OAUTH START ROUTE ==========
const encodeOAuthState = ({ type = 'patient', returnTo = null, mobile = false } = {}) =>
  Buffer.from(JSON.stringify({ type, returnTo, mobile: !!mobile }), 'utf8').toString('base64url');

const parseOAuthState = (raw) => {
  const fallback = { type: 'patient', returnTo: null, mobile: false };
  if (!raw || typeof raw !== 'string') return fallback;

  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded);
    return {
      type: String(parsed.type || 'patient').trim().toLowerCase() || 'patient',
      returnTo: parsed.returnTo || null,
      mobile: parsed.mobile === true || parsed.mobile === '1' || parsed.mobile === 1,
    };
  } catch {
    try {
      return {
        type: decodeURIComponent(raw).trim().toLowerCase() || 'patient',
        returnTo: null,
        mobile: false,
      };
    } catch {
      return { type: raw.trim().toLowerCase() || 'patient', returnTo: null, mobile: false };
    }
  }
};

const isSafeFrontendReturnTo = (value) => {
  if (!value || typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    const protocol = String(url.protocol || '').toLowerCase();

    // Mobile app deep links (Expo Go / standalone)
    if (protocol === 'exp:' || protocol === 'exps:' || protocol === 'brains:') {
      return true;
    }

    if (protocol !== 'http:' && protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    // Local web + LAN hosts used by mobile WebView
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    // Known production / staging frontends
    const allowedHosts = new Set([
      'app.brainshospital.com',
      'www.brainshospital.com',
      'brainshospital.com',
      'djwa.onrender.com',
      'cb072b8a.brains-appointment.pages.dev',
    ]);
    if (allowedHosts.has(host)) return true;
    if (host.endsWith('.brains-appointment.pages.dev')) return true;
    // Also allow whatever FRONTEND_URL is configured on this server
    const configured = frontendBaseUrl();
    try {
      if (host === new URL(configured).hostname.toLowerCase()) return true;
    } catch {
      // ignore
    }
    return false;
  } catch {
    return false;
  }
};

const isAppDeepLinkReturnTo = (value) => {
  if (!value || typeof value !== 'string') return false;
  try {
    const protocol = new URL(value).protocol.toLowerCase();
    return protocol === 'exp:' || protocol === 'exps:' || protocol === 'brains:';
  } catch {
    return /^(exp|exps|brains):/i.test(value);
  }
};

/** Prefer a stable localhost frontend URL after OAuth (avoid 127.0.0.1 mismatch). */
const normalizeFrontendReturnTo = (value) => {
  if (!isSafeFrontendReturnTo(value)) return frontendBaseUrl();
  // Keep full deep-link path (e.g. exp://192.168.x.x:8081/--/oauth)
  if (isAppDeepLinkReturnTo(value)) {
    return String(value).replace(/\/$/, '');
  }
  try {
    const url = new URL(value);
    if (url.hostname === '127.0.0.1') {
      url.hostname = 'localhost';
    }
    // Always land on /login so token query is handled by Login.jsx
    return url.origin;
  } catch {
    return frontendBaseUrl();
  }
};

/** Final browser/app redirect after Google OAuth succeeds or fails. */
const buildOAuthClientRedirect = (returnTo, params = {}) => {
  const target = normalizeFrontendReturnTo(returnTo);
  const q = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      q.set(key, String(value));
    }
  });
  const qs = q.toString();

  if (isAppDeepLinkReturnTo(target)) {
    const sep = target.includes('?') ? '&' : '?';
    return qs ? `${target}${sep}${qs}` : target;
  }

  return qs ? `${target}/login?${qs}` : `${target}/login`;
};

const requestPublicOrigin = (req) => {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http')
    .split(',')[0]
    .trim();
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || '')
    .split(',')[0]
    .trim();
  if (!host) return null;
  return `${proto}://${host}`;
};

/** Use the host the client actually hit (LAN IP / Railway / localhost). */
const resolveGoogleLoginCallbackURL = (req) => {
  const fromReq = requestPublicOrigin(req);
  if (fromReq) {
    return `${fromReq.replace(/\/$/, '')}/api/auth/google/callback`;
  }
  return (
    process.env.GOOGLE_CALLBACK_URL ||
    'http://localhost:8000/api/auth/google/callback'
  );
};

router.get('/google', (req, res, next) => {
  const userType = String(req.query.type || 'patient').trim().toLowerCase();
  const rawReturnTo = String(req.query.returnTo || '').trim();
  const returnTo = isSafeFrontendReturnTo(rawReturnTo)
    ? (isAppDeepLinkReturnTo(rawReturnTo)
        ? rawReturnTo.replace(/\/$/, '')
        : normalizeFrontendReturnTo(rawReturnTo))
    : frontendBaseUrl();
  const mobile =
    req.query.mobile === '1' ||
    req.query.mobile === 'true' ||
    isAppDeepLinkReturnTo(returnTo) ||
    String(req.query.returnTo || '').includes('mobile=1');

  const state = encodeOAuthState({
    type: userType,
    returnTo,
    mobile,
  });

  // Must match the URL Google redirects to (LAN phone ≠ localhost on the device)
  const callbackURL = resolveGoogleLoginCallbackURL(req);

  console.log('🔐 Google login start:', { userType, returnTo, callbackURL, mobile });

  // Patients only need identity; calendar scope often breaks consent / WebView OAuth
  const scope =
    userType === 'patient'
      ? [
          'openid',
          'https://www.googleapis.com/auth/userinfo.profile',
          'https://www.googleapis.com/auth/userinfo.email',
        ]
      : [
          'openid',
          'https://www.googleapis.com/auth/userinfo.profile',
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/calendar.app.created',
        ];

  passport.authenticate('google', {
    scope,
    state,
    callbackURL,
    accessType: userType === 'patient' ? 'online' : 'offline',
    prompt: userType === 'patient' ? 'select_account' : 'consent',
  })(req, res, next);
});

// ========== GOOGLE OAUTH CALLBACK ROUTE ==========
router.get(
  '/google/callback',
  (req, res, next) => {
    const callbackURL = resolveGoogleLoginCallbackURL(req);
    const { returnTo, mobile } = parseOAuthState(req.query.state);

    if (req.query.error) {
      console.error('❌ Google OAuth denied/error:', req.query.error);
      return res.redirect(
        buildOAuthClientRedirect(returnTo, {
          error: 'google_auth_failed',
          ...(mobile ? { mobile: '1' } : {}),
        })
      );
    }

    passport.authenticate('google', {
      session: false,
      callbackURL,
      failureRedirect: buildOAuthClientRedirect(returnTo, {
        error: 'google_auth_failed',
        ...(mobile ? { mobile: '1' } : {}),
      }),
    })(req, res, next);
  },
  async (req, res) => {
    try {
      if (!req.user?.user) {
        console.error('❌ Google callback: missing req.user after passport');
        const { returnTo, mobile } = parseOAuthState(req.query.state);
        return res.redirect(
          buildOAuthClientRedirect(returnTo, {
            error: 'google_auth_failed',
            ...(mobile ? { mobile: '1' } : {}),
          })
        );
      }

      const { user, type } = req.user;
      const { returnTo, mobile } = parseOAuthState(req.query.state);
      console.log('✅ Google login callback OK:', user?.email, type, { mobile, returnTo });

      const userType = type || 'patient';

      await recordLoginHistory({
        userId: user._id,
        userName: user.name,
        userEmail: user.email,
        userType,
        action: 'GOOGLE_LOGIN',
        status: 'SUCCESS',
        req
      });

      await recordActivity({
        userId: user._id,
        userName: user.name,
        userEmail: user.email,
        userType,
        action: 'GOOGLE_LOGIN',
        description: `${user.name} logged in via Google OAuth (${userType})`,
        req
      });

      const token = jwt.sign(
        {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          type: userType,
          role: user.role || userType,
          userType,
          authProvider: 'google',
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.redirect(
        buildOAuthClientRedirect(returnTo, {
          token,
          type: String(userType),
          ...(mobile ? { mobile: '1' } : {}),
        })
      );

    } catch (error) {
      console.error('❌ Auth callback error:', error);
      const { returnTo, mobile } = parseOAuthState(req.query.state);
      return res.redirect(
        buildOAuthClientRedirect(returnTo, {
          error: 'google_auth_failed',
          ...(mobile ? { mobile: '1' } : {}),
        })
      );
    }
  });

// ========== LOCAL LOGIN ROUTE ==========
router.post('/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    const { user, type: userType } = await findUserWithCredentialsByEmail(email);

    if (!user) {
      await bcrypt.compare(password, '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy');
      await recordLoginHistory({
        userId: 'unknown',
        userName: email,
        userEmail: email,
        userType: 'patient',
        action: 'LOGIN_FAILED',
        status: 'FAILED',
        failureReason: 'User not found',
        req
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    if (!user.password) {
      await recordLoginHistory({
        userId: user._id,
        userName: user.name,
        userEmail: user.email,
        userType: userType || 'patient',
        action: 'LOGIN_FAILED',
        status: 'FAILED',
        failureReason: 'Password not set',
        req
      });
      return res.status(403).json({
        success: false,
        code: 'PASSWORD_NOT_SET',
        message: 'No password is set for this account. Please use Google Login or contact administrator.',
      });
    }

    const passwordOk = await bcrypt.compare(password, user.password);
    if (!passwordOk) {
      await recordLoginHistory({
        userId: user._id,
        userName: user.name,
        userEmail: user.email,
        userType: userType || 'patient',
        action: 'LOGIN_FAILED',
        status: 'FAILED',
        failureReason: 'Invalid password',
        req
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    return sendLoginSuccess(res, user, userType, req);
  } catch (error) {
    console.error('❌ Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
});

// ========== LOCAL REGISTER ROUTE ==========
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const nameTrim = String(name || '').trim();
    const emailNorm = String(email || '').trim().toLowerCase();
    const passwordStr = String(password || '');

    if (!nameTrim || !emailNorm || !passwordStr) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required',
      });
    }

    if (passwordStr.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters',
      });
    }

    const existing = await findUserByEmail(emailNorm);
    if (existing.user) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists',
      });
    }

    const patient = await Patient.create({
      name: nameTrim,
      email: emailNorm,
      password: bcrypt.hashSync(passwordStr, 10),
      userType: 'patient',
      isVerified: true,
      isActive: true,
      emergencyContact: {},
      medicalHistory: {},
    });

    return sendLoginSuccess(res, patient, 'patient', req);
  } catch (error) {
    console.error('❌ Register error:', error);
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists',
      });
    }
    if (error.name === 'ValidationError') {
      const first = Object.values(error.errors || {})[0];
      const msg = first?.message || 'Please check your details and try again.';
      return res.status(400).json({ success: false, message: msg });
    }
    return res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again or contact support.',
      ...(process.env.NODE_ENV === 'development' && {
        detail: error.message,
      }),
    });
  }
});

// ========== FORGOT PASSWORD (email reset link) ==========
router.post('/forgot-password', async (req, res) => {
  const genericOk = {
    success: true,
    message:
      'If an account exists for this email, you will receive password reset instructions shortly.',
  };
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const { user, type } = await findUserByEmail(email);
    if (!user || user.isActive === false) {
      return res.json(genericOk);
    }

    const userType = type || 'patient';
    const resetToken = jwt.sign(
      { id: user._id.toString(), type: userType, purpose: PASSWORD_RESET_PURPOSE },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const base = frontendBaseUrl();
    const resetUrl = `${base}/reset-password?token=${encodeURIComponent(resetToken)}`;
    const appName = process.env.APP_NAME || 'Brains Appointment';

    const { sendMail } = require('../services/gmailService');
    const html = `<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1e293b">
  <p>Hi ${escapeHtml(user.name || 'there')},</p>
  <p>You asked to reset your password for <strong>${escapeHtml(appName)}</strong>.</p>
  <p><a href="${resetUrl}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Reset password</a></p>
  <p style="font-size:14px;color:#64748b">This link expires in <strong>1 hour</strong>. If you did not request this, you can ignore this email.</p>
  <p style="font-size:12px;color:#94a3b8;word-break:break-all">${escapeHtml(resetUrl)}</p>
</body></html>`;

    await sendMail(user.email, `${appName} — reset your password`, html);
    return res.json(genericOk);
  } catch (error) {
    console.error('❌ forgot-password:', error);
    return res.status(500).json({
      success: false,
      message:
        'Could not send reset email. Check that email (Gmail) is configured on the server, or try again later.',
      ...(process.env.NODE_ENV === 'development' && { detail: error.message }),
    });
  }
});

// ========== RESET PASSWORD (token from email) ==========
router.post('/reset-password', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: 'Reset token and new password are required',
      });
    }
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset link. Please request a new password reset.',
      });
    }

    if (decoded.purpose !== PASSWORD_RESET_PURPOSE || !decoded.id || !decoded.type) {
      return res.status(400).json({ success: false, message: 'Invalid reset link' });
    }

    const t = String(decoded.type).toLowerCase();
    const ModelMap = {
      patient: Patient,
      doctor: Doctor,
      receptionist: Receptionist,
      call_center: Receptionist,
      admin: Admin,
      super_admin: Admin,
    };
    const Model = ModelMap[t];
    if (!Model) {
      return res.status(400).json({ success: false, message: 'Invalid reset link' });
    }

    const user = await Model.findById(decoded.id).select('+password');
    if (!user) {
      return res.status(400).json({ success: false, message: 'Account not found' });
    }
    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'This account is deactivated. Contact support.',
      });
    }

    user.password = bcrypt.hashSync(password, 10);
    await user.save();

    return res.json({
      success: true,
      message: 'Your password has been reset. You can sign in with your new password.',
    });
  } catch (error) {
    console.error('❌ reset-password:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not reset password. Please try again.',
      ...(process.env.NODE_ENV === 'development' && { detail: error.message }),
    });
  }
});

// ========== CHANGE PASSWORD (logged in) ==========
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required',
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters',
      });
    }

    const userType = req.user.type || req.user.role || req.user.userType;
    let Model;
    switch (userType) {
      case 'admin':
      case 'super_admin':
        Model = Admin;
        break;
      case 'doctor':
        Model = Doctor;
        break;
      case 'receptionist':
      case 'call_center':
        Model = Receptionist;
        break;
      case 'patient':
        Model = Patient;
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Unknown account type',
        });
    }

    const user = await Model.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (!user.password) {
      return res.status(400).json({
        success: false,
        message:
          'No password is set for this account. Use Google sign-in or forgot password to set one.',
      });
    }

    const currentOk = await bcrypt.compare(currentPassword, user.password);
    if (!currentOk) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }

    const sameAsOld = await bcrypt.compare(newPassword, user.password);
    if (sameAsOld) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from your current password',
      });
    }

    user.password = bcrypt.hashSync(newPassword, 10);
    await user.save();

    return res.json({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error) {
    console.error('❌ change-password:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not update password. Please try again.',
      ...(process.env.NODE_ENV === 'development' && { detail: error.message }),
    });
  }
});

// ========== VERIFY TOKEN ROUTE ==========
// Used by the SPA (ProtectedRoute): JWT signature + Mongo user + active flag.
router.get('/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    console.log('🔍 Verifying token for user:', decoded.email, 'type:', decoded.type);

    const user = await findUserById(decoded.id, decoded.type);

    if (!user) {
      console.log('❌ User not found for token verification:', decoded.id);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.isActive === false) {
      console.log('⚠️ Inactive account attempted access:', decoded.email);
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    const userData = prepareUserResponse(user, decoded.type, decoded.authProvider);

    console.log('📡 /api/auth/verify returning safe user:', {
      id: userData.id,
      email: userData.email,
      authProvider: userData.authProvider,
      googleId: !!userData.googleId,
      hasPassword: userData.hasPassword,
    });

    res.json({
      success: true,
      user: userData
    });

  } catch (error) {
    console.error('❌ Token verification error:', error.message);

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please login again.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Token verification failed'
    });
  }
});

// ========== GET CURRENT USER (ME) ROUTE ==========
// ✅ GET /api/auth/me - Get current user info
router.get('/me', authenticate, async (req, res) => {
  try {
    console.log('📡 /me endpoint hit, user ID:', req.user?._id);

    // ✅ Check if user exists
    if (!req.user) {
      console.error('❌ No user found in request');
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const userType = req.user.type || req.user.userType || req.user.role || 'patient';
    const fullUser = await findUserById(req.user._id || req.user.id, userType);
    const userData = fullUser
      ? prepareUserResponse(fullUser, userType, req.user.authProvider)
      : {
          id: req.user._id,
          _id: req.user._id,
          email: req.user.email,
          name: req.user.name,
          type: userType,
          role: userType,
          userType,
          profileImage: req.user.profileImage || '/default-avatar.png',
          permissions: Array.isArray(req.user.permissions) ? req.user.permissions : [],
          isVerified: req.user.isVerified !== undefined ? req.user.isVerified : true,
          isActive: req.user.isActive !== undefined ? req.user.isActive : true,
          googleId: req.user.googleId || null,
          hasPassword: req.user.hasPassword !== undefined ? req.user.hasPassword : false,
          authProvider: req.user.authProvider || (req.user.googleId ? 'google' : 'password'),
        };

    console.log('📡 /api/auth/me returning safe user:', {
      id: userData.id,
      email: userData.email,
      authProvider: userData.authProvider,
      googleId: !!userData.googleId,
      hasPassword: userData.hasPassword,
    });

    return res.status(200).json({
      success: true,
      user: userData
    });
  } catch (error) {
    console.error('❌ Error in /me route:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// ========== LOGOUT ROUTE ==========
router.post('/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await findUserById(decoded.id, decoded.type);
        
        if (user) {
          user.lastLogout = new Date();
          await user.save();
          const uType = decoded.type || user.userType || user.role || 'patient';
          await recordLoginHistory({
            userId: user._id,
            userName: user.name,
            userEmail: user.email,
            userType: uType,
            action: 'LOGOUT',
            status: 'SUCCESS',
            req
          });
          await recordActivity({
            userId: user._id,
            userName: user.name,
            userEmail: user.email,
            userType: uType,
            action: 'USER_LOGOUT',
            description: `${user.name} (${uType}) logged out`,
            req
          });
          console.log('✅ Logout recorded for:', decoded.email);
        }
      } catch (err) {
        console.log('ℹ️ Logout with invalid/expired token');
      }
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('❌ Logout error:', error);
    res.json({
      success: true,
      message: 'Logged out'
    });
  }
});

// ========== REFRESH TOKEN ROUTE ==========
router.post('/refresh', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const oldToken = authHeader.split(' ')[1];
    
    let decoded;
    try {
      decoded = jwt.verify(oldToken, process.env.JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        decoded = jwt.decode(oldToken);
      } else {
        throw error;
      }
    }

    console.log('🔄 Refreshing token for:', decoded.email);

    const user = await findUserById(decoded.id, decoded.type);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    const tokenPayload = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      type: decoded.type,
      role: user.role || decoded.type,
      userType: decoded.type
    };

    const newToken = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const userData = prepareUserResponse(user, decoded.type);

    console.log('✅ Token refreshed for:', decoded.email);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      token: newToken,
      user: userData
    });

  } catch (error) {
    console.error('❌ Token refresh error:', error.message);

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Token refresh failed'
    });
  }
});

// ========== CHECK EMAIL EXISTS ==========
router.post('/check-email', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const { user, type } = await findUserByEmail(email);

    res.json({
      success: true,
      exists: !!user,
      userType: type,
      isActive: user ? user.isActive !== false : null
    });

  } catch (error) {
    console.error('❌ Check email error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check email'
    });
  }
});

module.exports = router;
