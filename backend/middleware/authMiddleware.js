const jwt = require('jsonwebtoken');
const Patient = require('../modal/Patient');
const Doctor = require('../modal/Doctor');
const Receptionist = require('../modal/Receptionist');
const Admin = require('../modal/Admin');

/** Verify app JWT and attach `req.user` from MongoDB */
const authenticate = async (req, res, next) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      console.log('❌ No token provided');
      return res.status(401).json({
        success: false,
        message: 'No authentication token provided',
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('🔐 Token decoded:', { id: decoded.id, email: decoded.email, type: decoded.type });

    let user = null;
    const userType = decoded.type || decoded.role || decoded.userType;

    switch (userType) {
      case 'patient':
        user = await Patient.findById(decoded.id).select('-password');
        break;
      case 'doctor':
        user = await Doctor.findById(decoded.id).select('-password');
        break;
      case 'receptionist':
      case 'call_center':
        user = await Receptionist.findById(decoded.id).select('-password');
        break;
      case 'admin':
      case 'super_admin':
        user = await Admin.findById(decoded.id).select('-password');
        break;
      default:
        console.error('❌ Unknown user type:', userType);
        return res.status(403).json({
          success: false,
          message: 'Invalid user type',
        });
    }

    if (!user) {
      console.error('❌ User not found in database:', decoded.id);
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (!user.type) {
      user.type = userType;
    }

    if (!user.role) {
      user.role = userType;
    }

    req.user = {
      ...user.toObject(),
      type: user.type || userType,
      role: user.role || userType,
      permissions: user.permissions || [],
    };

    console.log('✅ User authenticated:', req.user.email, 'as', req.user.type);
    next();
  } catch (error) {
    console.error('❌ Auth middleware error:', error);

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token',
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Authentication error',
      error: error.message,
    });
  }
};

const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      console.log('❌ No user in request - authentication required first');
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const userRole = req.user.role || req.user.type || req.user.userType;

    // Treat 'call_center' as having 'receptionist' privileges in route guards
    const rolesToCheck = [userRole];
    if (userRole === 'call_center') {
      rolesToCheck.push('receptionist');
    }

    console.log('🔒 Checking role access:', {
      userRole,
      allowedRoles,
      userEmail: req.user.email,
    });

    if (!rolesToCheck.some(role => allowedRoles.includes(role))) {
      console.log('❌ Access denied for role:', userRole);
      return res.status(403).json({
        success: false,
        message: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
      });
    }

    console.log('✅ Role access granted:', userRole);
    next();
  };
};

module.exports = authenticate;
module.exports.authenticate = authenticate;
module.exports.requireRole = requireRole;
