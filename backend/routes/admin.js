// backend/routes/admin.js
const express = require('express');
const router = express.Router();
const Doctor = require('../modal/Doctor');
const Patient = require('../modal/Patient');
const Admin = require('../modal/Admin');
const Receptionist = require('../modal/Receptionist');
const Appointment = require('../modal/Appointment');
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');
const jwt = require('jsonwebtoken');
const { requireRole } = require('../middleware/authMiddleware');
const notificationService = require('../services/notificationService');
const { runBulkReschedule } = require('../services/bulkRescheduleService');
const { updateDoctorAvailability } = require('../services/doctorAvailabilityService');
const { recordActivity } = require('../services/activityLogger');

// ========== FILE UPLOAD SETUP WITH CLOUDINARY V2 ==========
const cloudinary = require('../config/cloudinaryConfig');
const { Readable } = require('stream');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const multer = require('multer');

/** ≥8 chars from body, else random temp returned once in API response */
function hashNewStaffPassword(bodyPassword) {
  const fromBody = bodyPassword != null ? String(bodyPassword).trim() : '';
  if (fromBody.length >= 8) {
    return { hash: bcrypt.hashSync(fromBody, 10), temporaryPassword: null };
  }
  const temp = crypto.randomBytes(14).toString('base64url').slice(0, 16);
  return { hash: bcrypt.hashSync(temp, 10), temporaryPassword: temp };
}

// Helper function for initials avatars
function generateInitialsAvatar(name, bgColor = '4f46e5') {
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return `https://ui-avatars.com/api/?name=U&background=${bgColor}&color=fff&size=500`;
  }
  const initials = name.trim().split(' ').filter(n => n).map(n => n[0]).join('').toUpperCase().slice(0, 2);
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=${bgColor}&color=fff&size=500&bold=true`;
}

// Helper function to upload buffer to Cloudinary
const uploadToCloudinary = (buffer, folder, filename) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        public_id: filename,
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 500, height: 500, crop: 'fill', gravity: 'face' }]
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    
    const readableStream = Readable.from(buffer);
    readableStream.pipe(uploadStream);
  });
};

// Multer memory storage configuration
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error('Only image files allowed'), false);
  }
  cb(null, true);
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: fileFilter
});

// Middleware to handle Cloudinary upload after multer processes the file
const uploadDoctorImage = async (req, res, next) => {
  if (!req.file) return next();
  
  try {
    const filename = `doctor_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const result = await uploadToCloudinary(req.file.buffer, 'healthapp/doctors/avatars', filename);
    req.cloudinaryResult = result;
    next();
  } catch (error) {
    next(error);
  }
};

const uploadAdminImage = async (req, res, next) => {
  if (!req.file) return next();
  
  try {
    const filename = `admin_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const result = await uploadToCloudinary(req.file.buffer, 'healthapp/admins/avatars', filename);
    req.cloudinaryResult = result;
    next();
  } catch (error) {
    next(error);
  }
};

const uploadReceptionistImage = async (req, res, next) => {
  if (!req.file) return next();
  
  try {
    const filename = `receptionist_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const result = await uploadToCloudinary(req.file.buffer, 'healthapp/receptionists/avatars', filename);
    req.cloudinaryResult = result;
    next();
  } catch (error) {
    next(error);
  }
};

// Admin routes: verify app JWT and attach decoded user (admin API uses this `authenticate`)
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      status: 'error',
      message: 'No token provided',
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // add this line:
    req.user = decoded;           // <-- ensure requireRole sees the authenticated user

    req.user = decoded;
    console.log('🔍 Authenticated user:', decoded.email, 'Type:', decoded.type, 'Role:', decoded.role);
    next();
  } catch (error) {
    return res.status(401).json({
      status: 'error',
      message: 'Invalid token',
    });
  }
};


function parseMaybeJSON(value, fallback = null) {
  if (typeof value !== 'string') return value ?? fallback;
  const s = value.trim();
  if (!s) return fallback;
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
    try { return JSON.parse(s); } catch { /* fall through */ }
  }
  return value; // not JSON, return raw string
}



// ✅ REQUIRE ADMIN MIDDLEWARE - ONLY ADMIN/SUPER_ADMIN CAN ACCESS
const requireAdmin = (req, res, next) => {
  console.log('🔐 Checking admin access for type:', req.user.type);

  if (req.user.type !== 'super_admin' && req.user.type !== 'admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Admin access required',
      code: 'INSUFFICIENT_PERMISSIONS',
      currentType: req.user.type,
      requiredTypes: ['admin', 'super_admin']
    });
  }

  console.log('✅ Admin access granted');
  next();
};

// ✅ REQUIRE SUPER ADMIN MIDDLEWARE
const requireSuperAdmin = (req, res, next) => {
  console.log('🔐 Checking super admin access for type:', req.user.type);

  if (req.user.type !== 'super_admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Super Admin access required',
      code: 'SUPER_ADMIN_ONLY',
      currentType: req.user.type,
      requiredType: 'super_admin'
    });
  }

  console.log('✅ Super admin access granted');
  next();
};

// ========== DASHBOARD ENDPOINT ==========
router.get('/dashboard', authenticate, requireAdmin, async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.id).select('-password');

    if (!admin) {
      return res.status(404).json({
        status: 'error',
        message: 'Admin not found',
      });
    }

    res.json({
      status: 'success',
      message: 'Admin dashboard access granted',
      user: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        userType: admin.userType,
        permissions: admin.permissions || []
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Dashboard access failed',
      errors: [error.message],
    });
  }
});

// ========== DASHBOARD STATISTICS ==========
router.get('/dashboard/stats', authenticate, requireAdmin, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const [
      totalDoctors,
      activeDoctors,
      suspendedDoctors,
      totalPatients,
      totalAdmins,
      totalReceptionists,
      todayAppointments,
      weekAppointments,
      monthAppointments,
      pendingAppointments,
      completedAppointments,
    ] = await Promise.all([
      Doctor.countDocuments(),
      Doctor.countDocuments({ isActive: true, status: 'active' }),
      Doctor.countDocuments({ status: 'suspended' }),
      Patient.countDocuments(),
      Admin.countDocuments({ isActive: true }),
      Receptionist.countDocuments({ isActive: true }),
      Appointment.countDocuments({ date: { $gte: today.toISOString().split('T')[0] } }),
      Appointment.countDocuments({ createdAt: { $gte: weekAgo } }),
      Appointment.countDocuments({ createdAt: { $gte: monthAgo } }),
      Appointment.countDocuments({ status: 'pending' }),
      Appointment.countDocuments({ status: 'completed' }),
    ]);

    res.json({
      status: 'success',
      data: {
        users: {
          totalDoctors,
          activeDoctors,
          suspendedDoctors,
          totalPatients,
          totalAdmins,
          totalReceptionists,
        },
        appointments: {
          today: todayAppointments,
          thisWeek: weekAppointments,
          thisMonth: monthAppointments,
          pending: pendingAppointments,
          completed: completedAppointments,
        },
      },
      message: 'Dashboard stats fetched',
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch stats',
      errors: [error.message],
    });
  }
});

// ========== ADMIN MANAGEMENT ==========
// Create new admin (super_admin only)
router.post(
  '/admins/create',
  authenticate,
  requireSuperAdmin,
  upload.single('profileImage'),
  uploadAdminImage,
  [
    body('name').notEmpty().withMessage('Name required'),
    body('email').isEmail().withMessage('Valid email required'),
    body('role').isIn(['admin', 'super_admin']).withMessage('Invalid role'),
  ],
  validate,
  async (req, res) => {
    try {
      const { name, email, role, password } = req.body;

      // Check if email exists
      const existingAdmin = await Admin.findOne({ email });
      if (existingAdmin) {
        return res.status(400).json({
          status: 'error',
          message: 'Admin with this email already exists',
        });
      }

      const pw = hashNewStaffPassword(password);

      const adminData = {
        name,
        email,
        role: role || 'admin',
        userType: role || 'admin',
        password: pw.hash,
        isVerified: true,
        isActive: true,
        permissions: role === 'super_admin'
          ? ['manage_users', 'manage_doctors', 'manage_appointments', 'view_analytics', 'manage_holidays', 'system_settings']
          : ['manage_doctors', 'manage_appointments', 'view_analytics']
      };

      if (req.cloudinaryResult) {
        adminData.profileImage = req.cloudinaryResult.secure_url;
      } else {
        adminData.profileImage = generateInitialsAvatar(name, 'f59e0b'); // Orange for admins
      }

      const admin = await Admin.create(adminData);

      // Send welcome credentials email
      try {
        await notificationService.sendWelcomeEmail({
          name: admin.name,
          email: admin.email,
          password: pw.temporaryPassword || password || '',
          role: admin.role,
        });
      } catch (err) {
        console.error('Failed to send welcome email to new admin:', err?.message || err);
      }

      res.status(201).json({
        status: 'success',
        message: 'Admin created successfully',
        data: admin,
        ...(pw.temporaryPassword && {
          notice: 'Share this one-time temporary password with the user; they should change it after first login.',
          temporaryPassword: pw.temporaryPassword,
        }),
      });
    } catch (error) {
      console.error('Error creating admin:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to create admin',
        errors: [error.message],
      });
    }
  }
);

// Get all admins
router.get('/admins', authenticate, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const admins = await Admin.find(query)
      .select('-password')
      .limit(parseInt(limit))
      .skip(skip)
      .sort({ createdAt: -1 });

    const total = await Admin.countDocuments(query);

    res.json({
      status: 'success',
      data: {
        admins,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit),
        },
      },
      message: 'Admins fetched',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch admins',
      errors: [error.message],
    });
  }
});

// Update admin
router.put(
  '/admins/:adminId',
  authenticate,
  upload.single('profileImage'),
  uploadAdminImage,
  async (req, res) => {
    try {
      const { adminId } = req.params;

      // Permission: super_admin OR the same admin editing self
      const isSuper = req.user?.type === 'super_admin';
      const isSelf = String(req.user?.id) === String(adminId);
      if (!isSuper && !isSelf) {
        return res.status(403).json({
          status: 'error',
          message: 'Super Admin access required',
          code: 'SUPER_ADMIN_ONLY',
          currentType: req.user?.type || null,
          requiredType: 'super_admin'
        });
      }

      // Only allow safe fields
      const updateData = {};
      if (typeof req.body.name === 'string' && req.body.name.trim()) {
        updateData.name = req.body.name.trim();
      }
      if (req.cloudinaryResult) {
        updateData.profileImage = req.cloudinaryResult.secure_url;
      }
      
      // Disallow changing email/role/permissions via this route
      delete req.body.email;
      delete req.body.role;
      delete req.body.userType;
      delete req.body.permissions;
      delete req.body.createdAt;

      const updated = await Admin.findByIdAndUpdate(
        adminId,
        updateData,
        { new: true, runValidators: true }
      ).select('-password');

      if (!updated) {
        return res.status(404).json({
          status: 'error',
          message: 'Admin not found',
        });
      }

      res.json({
        status: 'success',
        data: updated,
        message: 'Admin updated successfully',
      });
    } catch (error) {
      console.error('Update admin error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to update admin',
        errors: [error.message],
      });
    }
  }
);

// Delete admin
router.delete(
  '/admins/:adminId',
  authenticate,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const { adminId } = req.params;

      // Optional safety: prevent deleting self
      if (String(req.user.id) === String(adminId)) {
        return res.status(400).json({
          status: 'error',
          message: 'You cannot delete your own admin account',
        });
      }

      const adminDoc = await Admin.findById(adminId);
      if (!adminDoc) {
        return res.status(404).json({ status: 'error', message: 'Admin not found' });
      }

      // Optional safety: prevent removing the last super_admin
      if (adminDoc.role === 'super_admin') {
        const superAdmins = await Admin.countDocuments({ role: 'super_admin', isActive: true });
        if (superAdmins <= 1) {
          return res.status(400).json({
            status: 'error',
            message: 'Cannot delete the last active super admin',
          });
        }
      }

      await Admin.findByIdAndDelete(adminId);

      return res.json({
        status: 'success',
        data: { _id: adminId },
        message: 'Admin deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting admin:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to delete admin',
        errors: [error.message],
      });
    }
  }
);

// DELETE doctor
router.delete(
  '/doctors/:doctorId',
  authenticate,
  requireRole('admin', 'super_admin'),
  async (req, res) => {
    try {
      const { doctorId } = req.params;

      const doctor = await Doctor.findById(doctorId);
      if (!doctor) {
        return res.status(404).json({ status: 'error', message: 'Doctor not found' });
      }

      try {
        await Appointment.updateMany(
          { doctorId: doctorId, status: { $in: ['Scheduled', 'In Progress', 'Rescheduled', 'Reassigned'] } },
          { status: 'Cancelled', notes: 'Doctor account deleted by admin' }
        );
      } catch (err) {
        console.warn('Failed to cancel appointments during doctor delete (non-fatal):', err?.message || err);
      }

      await Doctor.findByIdAndDelete(doctorId);

      return res.json({
        status: 'success',
        data: { _id: doctorId },
        message: 'Doctor deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting doctor:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to delete doctor', errors: [error.message] });
    }
  }
);

router.delete(
  '/receptionists/:receptionistId',
  authenticate,
  requireRole('admin', 'super_admin'),
  async (req, res) => {
    try {
      const { receptionistId } = req.params;
      const recep = await Receptionist.findById(receptionistId);
      if (!recep) {
        return res.status(404).json({ status: 'error', message: 'Receptionist not found' });
      }

      await Receptionist.findByIdAndDelete(receptionistId);

      return res.json({
        status: 'success',
        data: { _id: receptionistId },
        message: 'Receptionist deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting receptionist:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to delete receptionist', errors: [error.message] });
    }
  }
);

// Activate/Deactivate admin
router.patch('/admins/:adminId/toggle-status', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { adminId } = req.params;
    const admin = await Admin.findById(adminId);

    if (!admin) {
      return res.status(404).json({
        status: 'error',
        message: 'Admin not found',
      });
    }

    admin.isActive = !admin.isActive;
    await admin.save();

    res.json({
      status: 'success',
      data: admin,
      message: `Admin ${admin.isActive ? 'activated' : 'deactivated'} successfully`,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to toggle admin status',
      errors: [error.message],
    });
  }
});

// Create receptionist
router.post(
  '/receptionists/create',
  authenticate,
  requireAdmin,
  upload.single('profileImage'),
  uploadReceptionistImage,
  [
    body('name').notEmpty().withMessage('Name required'),
    body('email').isEmail().withMessage('Valid email required'),
  ],
  validate,
  async (req, res) => {
    try {
      const { name, email } = req.body;
      // role can be 'receptionist' (default) or 'call_center'
      const staffRole = ['receptionist', 'call_center'].includes(req.body.role)
        ? req.body.role
        : 'receptionist';

      const existingReceptionist = await Receptionist.findOne({ email });
      if (existingReceptionist) {
        return res.status(400).json({
          status: 'error',
          message: 'A user with this email already exists',
        });
      }

      const receptionistData = {
        name,
        email,
        userType: staffRole,
        role: staffRole,
        isVerified: true,
        isActive: true,
        permissions: ['manage_appointments']
      };

      const pw = hashNewStaffPassword(req.body.password);
      receptionistData.password = pw.hash;

      if (req.cloudinaryResult) {
        receptionistData.profileImage = req.cloudinaryResult.secure_url;
      } else {
        // Green for receptionist, teal for call_center
        const avatarColor = staffRole === 'call_center' ? '06adc6' : '10b981';
        receptionistData.profileImage = generateInitialsAvatar(name, avatarColor);
      }

      const receptionist = await Receptionist.create(receptionistData);

      // Send welcome credentials email
      try {
        await notificationService.sendWelcomeEmail({
          name: receptionist.name,
          email: receptionist.email,
          password: pw.temporaryPassword || req.body.password || '',
          role: receptionist.userType || 'receptionist',
        });
      } catch (err) {
        console.error('Failed to send welcome email to new staff:', err?.message || err);
      }

      const roleLabel = staffRole === 'call_center' ? 'Call Center user' : 'Receptionist';
      res.status(201).json({
        status: 'success',
        message: `${roleLabel} created successfully`,
        data: receptionist,
        ...(pw.temporaryPassword && {
          notice: 'Share this one-time temporary password with the user.',
          temporaryPassword: pw.temporaryPassword,
        }),
      });
    } catch (error) {
      console.error('Error creating receptionist:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to create receptionist',
        errors: [error.message],
      });
    }
  }
);

// Get all receptionists
router.get('/receptionists', authenticate, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const receptionists = await Receptionist.find(query)
      .limit(parseInt(limit))
      .skip(skip)
      .sort({ createdAt: -1 });

    const total = await Receptionist.countDocuments(query);

    res.json({
      status: 'success',
      data: {
        receptionists,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit),
        },
      },
      message: 'Receptionists fetched',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch receptionists',
      errors: [error.message],
    });
  }
});

// Update receptionist
router.put(
  '/receptionists/:receptionistId',
  authenticate,
  requireAdmin,
  upload.single('profileImage'),
  uploadReceptionistImage,
  async (req, res) => {
    try {
      const updateData = { ...req.body };

      delete updateData.email;
      delete updateData.createdAt;

      if (req.cloudinaryResult) {
        updateData.profileImage = req.cloudinaryResult.secure_url;
      }

      const receptionist = await Receptionist.findByIdAndUpdate(
        req.params.receptionistId,
        updateData,
        { new: true, runValidators: true }
      );

      if (!receptionist) {
        return res.status(404).json({
          status: 'error',
          message: 'Receptionist not found',
        });
      }

      res.json({
        status: 'success',
        data: receptionist,
        message: 'Receptionist updated successfully',
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: 'Failed to update receptionist',
        errors: [error.message],
      });
    }
  }
);

// Toggle receptionist status
router.patch(
  '/receptionists/:receptionistId/toggle-status',
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const receptionist = await Receptionist.findById(req.params.receptionistId);

      if (!receptionist) {
        return res.status(404).json({
          status: 'error',
          message: 'Receptionist not found',
        });
      }

      receptionist.isActive = !receptionist.isActive;
      await receptionist.save();

      res.json({
        status: 'success',
        data: receptionist,
        message: `Receptionist ${receptionist.isActive ? 'activated' : 'deactivated'} successfully`,
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: 'Failed to toggle receptionist status',
        errors: [error.message],
      });
    }
  }
);

// Create doctor (optional password ≥8 chars; otherwise a one-time temp password is returned)
router.post(
  '/doctors/create',
  authenticate,
  requireAdmin,
  upload.single('profileImage'),
  uploadDoctorImage,
  [
    body('name').notEmpty().withMessage('Name required'),
    body('email').isEmail().withMessage('Valid email required'),
    body('specialization').notEmpty().withMessage('Specialization required'),
  ],
  validate,
  async (req, res) => {
    try {
      const {
        name,
        email,
        specialization,
        qualification,
        experience,
        fees,
        about,
      } = req.body;

      const existingDoctor = await Doctor.findOne({ email });
      if (existingDoctor) {
        return res.status(400).json({
          status: 'error',
          message: 'Doctor with this email already exists',
        });
      }

      const doctorData = {
        name,
        email,
        specialization,
        qualification: qualification || '',
        experience: experience ? Number(experience) : 0,
        fees: fees ? Number(fees) : 0,
        about: about || '',
        userType: 'doctor',
        isVerified: true,
        isActive: true,
        status: 'active',
        
        availabilityMode: 'default',
        appointmentDuration: 30,
        dailyTimeRanges: [{ start: '09:00', end: '17:00' }],
        availabilityRange: {
          startDate: new Date(),
          endDate: null,
          excludedWeekdays: [0, 6]
        }
      };

      const pw = hashNewStaffPassword(req.body.password);
      doctorData.password = pw.hash;

      if (req.cloudinaryResult) {
        doctorData.profileImage = req.cloudinaryResult.secure_url;
      } else {
        doctorData.profileImage = generateInitialsAvatar(name, '4f46e5'); // Blue for doctors
      }

      const doctor = await Doctor.create(doctorData);

      // Send welcome credentials email
      try {
        await notificationService.sendWelcomeEmail({
          name: doctor.name,
          email: doctor.email,
          password: pw.temporaryPassword || req.body.password || '',
          role: doctor.userType,
        });
      } catch (err) {
        console.error('Failed to send welcome email to new doctor:', err?.message || err);
      }

      res.status(201).json({
        status: 'success',
        message: 'Doctor created successfully',
        data: doctor,
        ...(pw.temporaryPassword && {
          notice: 'Share this one-time temporary password with the doctor.',
          temporaryPassword: pw.temporaryPassword,
        }),
      });
    } catch (error) {
      console.error('Error creating doctor:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to create doctor',
        errors: [error.message],
      });
    }
  }
);

// Activate doctor
router.patch(
  '/doctors/:doctorId/activate',
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const { doctorId } = req.params;

      const doctor = await Doctor.findByIdAndUpdate(
        doctorId,
        {
          isActive: true,
          status: 'active',
          suspensionReason: null,
          suspendedAt: null,
        },
        { new: true }
      ).select('-password');

      if (!doctor) {
        return res.status(404).json({
          status: 'error',
          message: 'Doctor not found',
        });
      }

      res.json({
        status: 'success',
        data: doctor,
        message: 'Doctor activated successfully',
      });
    } catch (error) {
      console.error('Error activating doctor:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to activate doctor',
        errors: [error.message],
      });
    }
  }
);

// Suspend doctor
router.patch(
  '/doctors/:doctorId/suspend',
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const { doctorId } = req.params;
      const { reason } = req.body;

      const doctor = await Doctor.findByIdAndUpdate(
        doctorId,
        {
          isActive: false,
          status: 'suspended',
          suspensionReason: reason || 'Suspended by admin',
          suspendedAt: new Date(),
        },
        { new: true }
      ).select('-password');

      if (!doctor) {
        return res.status(404).json({
          status: 'error',
          message: 'Doctor not found',
        });
      }

      // Cancel future appointments
      await Appointment.updateMany(
        {
          doctorId: doctorId,
          date: { $gte: new Date().toISOString().split('T')[0] },
          status: 'Scheduled',
        },
        {
          status: 'Cancelled',
          notes: `Doctor suspended: ${reason || 'Administrative action'}`,
        }
      );

      res.json({
        status: 'success',
        data: doctor,
        message: 'Doctor suspended successfully',
      });
    } catch (error) {
      console.error('Error suspending doctor:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to suspend doctor',
        errors: [error.message],
      });
    }
  }
);

// Get all doctors
router.get('/doctors', authenticate, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { specialization: { $regex: search, $options: 'i' } },
      ];
    }
    if (status) query.status = status;

    const doctors = await Doctor.find(query)
      .select('-password')
      .limit(parseInt(limit))
      .skip(skip)
      .sort({ createdAt: -1 });

    const total = await Doctor.countDocuments(query);

    res.json({
      status: 'success',
      data: {
        doctors,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit),
        },
      },
      message: 'Doctors fetched',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch doctors',
      errors: [error.message],
    });
  }
});

// Get single doctor
router.get('/doctors/:doctorId', authenticate, requireAdmin, async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.doctorId).select('-password');
    if (!doctor) {
      return res.status(404).json({
        status: 'error',
        message: 'Doctor not found',
      });
    }

    const responseData = {
      ...doctor.toObject(),
      availabilityMode: doctor.availabilityMode || 'default',
      dailyTimeRanges: doctor.dailyTimeRanges || [],
      availabilityRange: doctor.availabilityRange || {
        startDate: null,
        endDate: null,
        excludedWeekdays: []
      },
      appointmentDuration: doctor.appointmentDuration || 30
    };

    res.json({
      status: 'success',
      data: responseData,
      message: 'Doctor details fetched',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch doctor',
      errors: [error.message],
    });
  }
});

// Update doctor
router.put(
  '/doctors/:doctorId',
  authenticate,
  requireAdmin,
  upload.single('profileImage'),
  uploadDoctorImage,
  async (req, res) => {
    try {
      const updateData = { ...req.body };

      // Remove protected fields
      delete updateData.password;
      delete updateData.googleId;
      delete updateData.createdAt;
      delete updateData.email;

      if (req.cloudinaryResult) {
        updateData.profileImage = req.cloudinaryResult.secure_url;
      }


      // Handle availability updates
      if (updateData.availabilityMode) {
        if (!['default', 'custom'].includes(updateData.availabilityMode)) {
          return res.status(400).json({
            status: 'error',
            message: 'Invalid availabilityMode. Must be "default" or "custom"'
          });
        }
      }

      if (updateData.dailyTimeRanges) {
        const parsed = parseMaybeJSON(updateData.dailyTimeRanges, updateData.dailyTimeRanges);
        if (Array.isArray(parsed)) {
          updateData.dailyTimeRanges = parsed;
        }
      }

      if (updateData.availabilityRange) {
        const parsed = parseMaybeJSON(updateData.availabilityRange, updateData.availabilityRange);
        if (parsed && typeof parsed === 'object') {
          updateData.availabilityRange = parsed;
        }
      }

      if (updateData.appointmentDuration) {
        const duration = Number(updateData.appointmentDuration);
        if ([15, 30, 45, 60].includes(duration)) {
          updateData.appointmentDuration = duration;
        } else {
          delete updateData.appointmentDuration;
        }
      }

      const doctor = await Doctor.findByIdAndUpdate(
        req.params.doctorId,
        updateData,
        { new: true, runValidators: true }
      ).select('-password');

      if (!doctor) {
        return res.status(404).json({
          status: 'error',
          message: 'Doctor not found',
        });
      }

      res.json({
        status: 'success',
        data: doctor,
        message: 'Doctor updated successfully',
      });
    } catch (error) {
      console.error('Error updating doctor:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to update doctor',
        errors: [error.message],
      });
    }
  }
);

// ========== PATIENT MANAGEMENT ==========
// Get all patients
router.get('/patients', authenticate, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const patients = await Patient.find(query)
      .limit(parseInt(limit))
      .skip(skip)
      .sort({ createdAt: -1 });

    const total = await Patient.countDocuments(query);

    res.json({
      status: 'success',
      data: {
        patients,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit),
        },
      },
      message: 'Patients fetched',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch patients',
      errors: [error.message],
    });
  }
});

// Get single patient
router.get('/patients/:patientId', authenticate, requireAdmin, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.patientId);
    if (!patient) {
      return res.status(404).json({
        status: 'error',
        message: 'Patient not found',
      });
    }

    res.json({
      status: 'success',
      data: patient,
      message: 'Patient details fetched',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch patient',
      errors: [error.message],
    });
  }
});

// ========== PENDING APPROVALS ==========
router.get('/pending-approvals', authenticate, requireAdmin, async (req, res) => {
  try {
    const limit = Math.max(1, parseInt(req.query.limit?.toString() || '12', 10));

    const doctorsSusp = await Doctor.find({
      $or: [{ status: 'suspended' }, { isActive: false }],
    })
      .select('_id name email userType isActive status')
      .sort({ createdAt: -1 })
      .limit(limit);

    const adminsPending = await Admin.find({ isActive: false })
      .select('_id name email role userType isActive')
      .sort({ createdAt: -1 })
      .limit(limit);

    const recepsPending = await Receptionist.find({ isActive: false })
      .select('_id name email role userType isActive')
      .sort({ createdAt: -1 })
      .limit(limit);

    const users = [
      ...doctorsSusp.map(d => ({
        _id: d._id,
        name: d.name || '—',
        email: d.email || '',
        role: d.userType || 'doctor',
        isActive: !!d.isActive,
      })),
      ...adminsPending.map(a => ({
        _id: a._id,
        name: a.name || '—',
        email: a.email || '',
        role: a.role || a.userType || 'admin',
        isActive: !!a.isActive,
      })),
      ...recepsPending.map(r => ({
        _id: r._id,
        name: r.name || '—',
        email: r.email || '',
        role: r.role || r.userType || 'receptionist',
        isActive: !!r.isActive,
      })),
    ].slice(0, limit);

    res.json({
      status: 'success',
      data: { users },
      message: 'Pending approvals fetched',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch pending approvals',
      errors: [error.message],
    });
  }
});

// PUT /users/:userId/change-password
router.put(
  '/users/:userId/change-password',
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { newPassword, role } = req.body;

      if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 6) {
        return res.status(400).json({
          status: 'error',
          message: 'Password must be at least 6 characters long.',
        });
      }

      if (!role) {
        return res.status(400).json({
          status: 'error',
          message: 'User role is required to locate the account.',
        });
      }

      const changerRole = req.user.type || req.user.role;
      const targetRole = String(role).toLowerCase();
      const isTargetAdmin = (targetRole === 'admin' || targetRole === 'super_admin');
      const isChangerSuperAdmin = (changerRole === 'super_admin');
      const isSelf = String(req.user.id) === String(userId);

      // Security check: Only Super Admin can change Admin passwords
      if (isTargetAdmin && !isChangerSuperAdmin && !isSelf) {
        return res.status(403).json({
          status: 'error',
          message: 'You do not have permission to change another administrator\'s password.',
        });
      }

      // Hash password using bcrypt
      const hashedPassword = bcrypt.hashSync(newPassword.trim(), 10);

      let targetUser = null;
      if (targetRole === 'admin' || targetRole === 'super_admin') {
        targetUser = await Admin.findById(userId);
      } else if (targetRole === 'doctor') {
        targetUser = await Doctor.findById(userId);
      } else if (targetRole === 'receptionist' || targetRole === 'call_center') {
        targetUser = await Receptionist.findById(userId);
      } else if (targetRole === 'patient') {
        targetUser = await Patient.findById(userId);
      } else {
        return res.status(400).json({
          status: 'error',
          message: `Invalid role parameter: ${role}`,
        });
      }

      if (!targetUser) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found.',
        });
      }

      targetUser.password = hashedPassword;
      await targetUser.save();

      // Send password updated email notification
      try {
        await notificationService.sendPasswordChangedEmail({
          name: targetUser.name,
          email: targetUser.email,
          newPassword: newPassword.trim(),
          changerRole,
        });
      } catch (emailErr) {
        console.error('Failed to send password updated email notification:', emailErr?.message || emailErr);
      }

      return res.json({
        status: 'success',
        message: 'Password changed successfully, and the user has been notified via email.',
      });
    } catch (error) {
      console.error('Error changing password:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to change password.',
        errors: [error.message],
      });
    }
  }
);

// Update doctor availability (admin / super admin)
router.put(
  '/doctors/:doctorId/availability',
  authenticate,
  requireAdmin,
  (req, res) => updateDoctorAvailability(req, res, req.params.doctorId)
);

// Bulk reschedule appointments on a given source date
router.post(
  '/appointments/bulk-reschedule',
  authenticate,
  requireAdmin,
  [
    body('sourceDate').isISO8601().withMessage('sourceDate is required (YYYY-MM-DD)'),
    body('mode').optional().isIn(['shift', 'target', 'auto']),
    body('shiftDays').optional().isInt({ min: 1, max: 90 }),
    body('targetDate').optional().isISO8601(),
    body('doctorIds').optional().isArray(),
    body('note').optional().isString().trim(),
    body('dryRun').optional().isBoolean(),
    body('sendNotifications').optional().isBoolean(),
  ],
  validate,
  async (req, res) => {
    try {
      const {
        sourceDate,
        mode = 'shift',
        shiftDays = 1,
        targetDate = null,
        doctorIds = [],
        note = '',
        dryRun = false,
        sendNotifications = true,
      } = req.body;

      const sourceDay = String(sourceDate).slice(0, 10);
      const todayIst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      if (sourceDay < todayIst) {
        return res.status(400).json({
          status: 'error',
          message: 'Cannot bulk reschedule appointments on a past date.',
        });
      }

      if (mode === 'target' && !targetDate) {
        return res.status(400).json({
          status: 'error',
          message: 'targetDate is required when mode is target.',
        });
      }

      const callerId = req.user.id || req.user._id;
      const callerRole = req.user.type || req.user.role || 'admin';

      const summary = await runBulkReschedule({
        sourceDate: sourceDay,
        doctorIds: Array.isArray(doctorIds) ? doctorIds : [],
        mode,
        shiftDays,
        targetDate: targetDate ? String(targetDate).slice(0, 10) : null,
        note,
        dryRun: !!dryRun,
        sendNotifications: sendNotifications !== false,
        requestedByRole: callerRole,
        requestedById: callerId,
      });

      return res.json({
        status: 'success',
        message: dryRun
          ? `Preview: ${summary.rescheduled} of ${summary.total} appointment(s) can be rescheduled`
          : `Bulk reschedule completed: ${summary.rescheduled} rescheduled, ${summary.failed} failed`,
        data: summary,
      });
    } catch (err) {
      console.error('Admin bulk reschedule error:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message || 'Bulk reschedule failed',
      });
    }
  }
);

module.exports = router;
