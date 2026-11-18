const express = require('express');
const router = express.Router();
const Doctor = require('../modal/Doctor');
const Appointment = require('../modal/Appointment');
const AppointmentTesting = require('../modal/AppointmentTesting');
const BlockedSlot = require('../modal/BlockedSlot'); // Add your blocked slot model path
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');
const jwt = require('jsonwebtoken');
const googleCalendarService = require('../services/googleCalendar'); // Adjust path
const cloudinary = require('../config/cloudinaryConfig');
const multer = require('multer');
const fs = require('fs');
const moment = require('moment-timezone');
const Patient = require('../modal/Patient');
const notificationService = require('../services/notificationService'); // NEW
const { validateAppointmentAvailability } = require('../utils/availabilityChecker');
const { updateDoctorAvailability } = require('../services/doctorAvailabilityService');
const { recordActivity } = require('../services/activityLogger');
const { Readable } = require('stream');

// ========== FILE UPLOAD SETUP WITH CLOUDINARY V2 ==========
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
    return cb(new Error('Only image files (JPG, PNG, WEBP) are allowed'), false);
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
    const doctorId = req.body.doctorId || req.user?.id || Date.now();
    const filename = `doctor_${doctorId}_${Date.now()}`;
    const result = await uploadToCloudinary(req.file.buffer, 'healthapp/doctors/avatars', filename);
    req.cloudinaryResult = result;
    next();
  } catch (error) {
    next(error);
  }
};

// ✅ UPDATED PROFILE IMAGE UPLOAD ROUTE
router.post('/profile-image', upload.single('image'), uploadDoctorImage, async (req, res) => {
  try {
    if (!req.cloudinaryResult) {
      return res.status(400).json({ status: 'error', message: 'No image file provided' });
    }

    if (!req.body.doctorId) {
      return res.status(400).json({ status: 'error', message: 'No doctorId provided' });
    }

    console.log('✅ Cloudinary upload result:', req.cloudinaryResult.secure_url);

    // ✅ Update doctor with Cloudinary URL
    const doctor = await Doctor.findByIdAndUpdate(
      req.body.doctorId,
      { profileImage: req.cloudinaryResult.secure_url },
      { new: true }
    );

    if (!doctor) {
      return res.status(404).json({ status: 'error', message: 'Doctor not found' });
    }

    res.json({
      status: 'success',
      imageUrl: req.cloudinaryResult.secure_url,
      doctor,
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Upload failed',
      error: err.message,
    });
  }
});

// ========== MIDDLEWARE ==========
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'No token provided'
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    console.log('✅ Token verified for user:', decoded.email);
    next();
  } catch (error) {
    console.error('❌ Token verification failed:', error.message);
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

const requireDoctor = (req, res, next) => {
  const userRole = String(req.user?.type || req.user?.role || req.user?.userType || '').toLowerCase();
  if (!['doctor', 'admin', 'receptionist', 'call_center', 'callcenter', 'superadmin', 'super_admin'].includes(userRole)) {
    return res.status(403).json({
      success: false,
      message: 'Doctor access required'
    });
  }
  next();
};

const checkDoctorStatus = async (req, res, next) => {
  try {
    const doctor = await Doctor.findById(req.user.id);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor account not found'
      });
    }
    if (!doctor.isActive || doctor.status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'Account suspended. Please contact administration.',
        suspensionReason: doctor.suspensionReason,
        suspendedAt: doctor.suspendedAt
      });
    }
    if (doctor.status === 'inactive') {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact administration.'
      });
    }
    req.doctor = doctor;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to verify account status',
      errors: [error.message]
    });
  }
};

// ========== DASHBOARD ==========
router.get(
  '/dashboard',
  authenticate,
  requireDoctor,
  checkDoctorStatus,
  async (req, res) => {
    try {
      const doctorId = req.user.id;
      console.log('📊 Building dashboard for doctor:', doctorId);

      const doctor = await Doctor.findById(doctorId)
        .select('-password')
        .lean();

      if (!doctor) {
        return res.status(404).json({
          success: false,
          message: 'Doctor not found',
        });
      }

      const toIso = (dateStr, timeStr = '00:00') =>
        new Date(`${dateStr}T${timeStr}:00.000Z`).toISOString();

      const addEnd = (startIso, minutes) => {
        const d = new Date(startIso);
        d.setMinutes(d.getMinutes() + (minutes || doctor.appointmentDuration || 30));
        return d.toISOString();
      };

      const mapAppointment = (a) => {
        const startIso =
          a.slotStartIso || (a.date ? toIso(a.date, a.timeSlot?.start) : null);
        const endIso =
          a.slotEndIso ||
          (startIso ? addEnd(startIso, a.slotDurationMinutes || doctor.appointmentDuration) : null);

        return {
          ...a,
          _id: a._id,
          slotStartIso: startIso,
          slotEndIso: endIso,
        };
      };

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      const [prodAppts, testAppts] = await Promise.all([
        Appointment.find({ doctorId })
          .populate('patientId', 'name email phone profileImage age')
          .populate('doctorId')
          .lean(),
        AppointmentTesting.find({ doctorId })
          .populate('patientId', 'name email phone profileImage age')
          .populate('doctorId')
          .lean(),
      ]);

      const seen = new Set();
      const all = [];
      for (const row of [...prodAppts, ...testAppts]) {
        const id = String(row._id);
        if (seen.has(id)) continue;
        seen.add(id);
        all.push(row);
      }

      console.log('📋 Found total appointments:', all.length);

      const now = new Date();

      const todayAppointments = all
        .filter((a) => {
          if (a.date) return a.date === todayStr;
          if (a.slotStartIso) {
            const d = new Date(a.slotStartIso);
            return (
              d.getFullYear() === today.getFullYear() &&
              d.getMonth() === today.getMonth() &&
              d.getDate() === today.getDate()
            );
          }
          return false;
        })
        .map(mapAppointment)
        .sort((a, b) => new Date(a.slotStartIso) - new Date(b.slotStartIso));

      console.log('📅 Today appointments:', todayAppointments.length);

      const upcomingAppointments = all
        .map(mapAppointment)
        .filter((a) => {
          const start = a.slotStartIso ? new Date(a.slotStartIso) : null;
          return start && start > now;
        })
        .sort((a, b) => new Date(a.slotStartIso) - new Date(b.slotStartIso));


      console.log('🔜 Upcoming appointments:', upcomingAppointments.length);

      const totalCompleted = all.filter((a) => a.status === 'Completed').length;
      const totalPatients = new Set(
        all.map((a) => String(a.patientId?._id || a.patientId)).filter(Boolean)
      ).size;

      console.log('📊 Stats calculated:', {
        totalPatients,
        todayCount: todayAppointments.length,
        totalCompleted
      });

      return res.json({
        success: true,
        data: {
          user: doctor,
          stats: {
            totalPatients,
            todayAppointments: todayAppointments.length,
            totalRevenue: null,
            totalCompleted,
            averageRating: null,
          },
          todayAppointments,
          upcomingAppointments,
        },
        message: 'Dashboard fetched successfully',
      });
    } catch (error) {
      console.error('❌ Error building dashboard:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to load dashboard',
        error: error.message,
      });
    }
  }
);

// ========== PROFILE ROUTES ==========
router.get('/profile',
  authenticate,
  requireDoctor,
  checkDoctorStatus,
  async (req, res) => {
    try {
      const doctor = await Doctor.findById(req.user.id)
        .select('-password')
        .lean();

      if (!doctor) {
        return res.status(404).json({
          status: 'error',
          message: 'Doctor not found'
        });
      }

      // ✅ IMPORTANT: Explicitly include availability fields
      const responseData = {
        ...doctor,
        availabilityMode: doctor.availabilityMode || 'default',
        dailyTimeRanges: doctor.dailyTimeRanges || [],
        availabilityRange: doctor.availabilityRange || {
          startDate: null,
          endDate: null,
          excludedWeekdays: []
        },
        appointmentDuration: doctor.appointmentDuration || 30
      };

      console.log('✅ Doctor profile fetched:', doctor._id);
      console.log('📤 Sending availabilityMode:', responseData.availabilityMode);

      res.json({
        status: 'success',
        data: responseData,
        message: 'Profile fetched successfully'
      });
    } catch (error) {
      console.error('❌ Error fetching doctor profile:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch profile',
        errors: [error.message]
      });
    }
  }
);

router.put(
  '/profile',
  authenticate,
  requireDoctor,
  checkDoctorStatus,
  async (req, res) => {
    try {
      const updateData = { ...req.body };

      // Strip protected fields
      delete updateData.googleId;
      delete updateData.password;
      delete updateData.email;
      delete updateData.isActive;
      delete updateData.status;
      delete updateData.isVerified;
      delete updateData.googleCalendar;
      delete updateData.createdAt;
      delete updateData.suspensionReason;
      delete updateData.suspendedAt;

      // File uploads use POST /profile-image; keep profileImage from JSON body only

      const doctor = await Doctor.findByIdAndUpdate(
        req.user.id,
        updateData,
        { new: true, runValidators: true }
      ).select('-password');

      if (!doctor) {
        return res.status(404).json({ status: 'error', message: 'Doctor not found' });
      }

      console.log('Doctor profile updated:', doctor._id);
      res.json({
        status: 'success',
        data: doctor,
        message: 'Profile updated successfully',
      });
    } catch (error) {
      console.error('Error updating doctor profile:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to update profile',
        errors: [error.message],
      });
    }
  }
);

// ========== APPOINTMENTS ==========
router.get('/appointments',
  authenticate,
  requireDoctor,
  checkDoctorStatus,
  async (req, res) => {
    try {
      const { status, date, page = 1, limit = 20 } = req.query;
      const skip = (page - 1) * limit;

      let query = { doctorId: req.user.id };

      if (status) {
        query.status = status;
      }

      if (date) {
        query.date = date;
      }

      const totalProd = await Appointment.countDocuments(query);
      const totalTest = await AppointmentTesting.countDocuments(query);

      const [prodAppts, testAppts] = await Promise.all([
        Appointment.find(query)
          .populate('patientId', 'name email phone profileImage')
          .lean(),
        AppointmentTesting.find(query)
          .populate('patientId', 'name email phone profileImage')
          .lean(),
      ]);

      const seen = new Set();
      const merged = [];
      for (const row of [...prodAppts, ...testAppts]) {
        const id = String(row._id);
        if (seen.has(id)) continue;
        seen.add(id);
        merged.push(row);
      }

      merged.sort((a, b) => {
        const aTime = new Date(a.slotStartIso || a.createdAt || 0).getTime();
        const bTime = new Date(b.slotStartIso || b.createdAt || 0).getTime();
        return bTime - aTime;
      });

      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 20;
      const skipNum = (pageNum - 1) * limitNum;
      const appointments = merged.slice(skipNum, skipNum + limitNum);
      const total = totalProd + totalTest;

      res.json({
        status: 'success',
        data: {
          appointments,
          pagination: {
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum) || 1,
          },
        },
        message: 'Appointments fetched successfully'
      });
    } catch (error) {
      console.error('Error fetching appointments:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch appointments',
        errors: [error.message]
      });
    }
  }
);

router.get('/appointments/:appointmentId',
  authenticate,
  requireDoctor,
  checkDoctorStatus,
  async (req, res) => {
    try {
      const { appointmentId } = req.params;

      const query = {
        _id: appointmentId,
        doctorId: req.user.id
      };
      const populateOpts = { path: 'patientId', select: 'name email phone profileImage age gender medicalHistory' };

      let appointment = await Appointment.findOne(query).populate(populateOpts);
      if (!appointment) {
        appointment = await AppointmentTesting.findOne(query).populate(populateOpts);
      }

      if (!appointment) {
        return res.status(404).json({
          status: 'error',
          message: 'Appointment not found'
        });
      }

      res.json({
        status: 'success',
        data: appointment,
        message: 'Appointment details fetched'
      });
    } catch (error) {
      console.error('Error fetching appointment:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch appointment',
        errors: [error.message]
      });
    }
  }
);

router.patch('/appointments/:appointmentId/status',
  authenticate,
  requireDoctor,
  checkDoctorStatus,
  async (req, res) => {
    try {
      const { appointmentId } = req.params;
      const { status, notes } = req.body;

      const validStatuses = ['Scheduled', 'Completed', 'Cancelled', 'Missed', 'No Show'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid status'
        });
      }

      const query = { _id: appointmentId, doctorId: req.user.id };
      const updateData = { status, notes: notes || '' };

      let appointment = await Appointment.findOneAndUpdate(query, updateData, { new: true });
      if (!appointment) {
        appointment = await AppointmentTesting.findOneAndUpdate(query, updateData, { new: true });
      }

      if (!appointment) {
        return res.status(404).json({
          status: 'error',
          message: 'Appointment not found'
        });
      }

      console.log('✅ Appointment status updated:', appointmentId);

      res.json({
        status: 'success',
        data: appointment,
        message: 'Appointment status updated'
      });
    } catch (error) {
      console.error('Error updating appointment:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to update appointment',
        errors: [error.message]
      });
    }
  }
);

router.post('/appointments/:appointmentId/prescription',
  authenticate,
  requireDoctor,
  checkDoctorStatus,
  [
    body('diagnosis').notEmpty().withMessage('Diagnosis is required'),
    body('medications').isArray().withMessage('Medications must be an array'),
  ],
  validate,
  async (req, res) => {
    try {
      const { appointmentId } = req.params;
      const { diagnosis, medications, notes } = req.body;

      const query = {
        _id: appointmentId,
        doctorId: req.user.id
      };

      let appointment = await Appointment.findOne(query);
      if (!appointment) {
        appointment = await AppointmentTesting.findOne(query);
      }

      if (!appointment) {
        return res.status(404).json({
          status: 'error',
          message: 'Appointment not found'
        });
      }

      appointment.prescription = {
        diagnosis,
        medications,
        notes: notes || '',
        prescribedAt: new Date(),
      };

      await appointment.save();

      console.log('✅ Prescription added to appointment:', appointmentId);

      res.json({
        status: 'success',
        data: appointment,
        message: 'Prescription added successfully'
      });
    } catch (error) {
      console.error('Error adding prescription:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to add prescription',
        errors: [error.message]
      });
    }
  }
);

// ========== AVAILABILITY ==========
const runInBackground = (fn) => {
  try {
    setImmediate(() => {
      fn().catch((err) => {
        console.error('[availability] background task error:', err?.message || err);
      });
    });
  } catch (e) {
    console.error('[availability] failed to schedule background task:', e?.message || e);
  }
};

router.put(
  '/availability',
  authenticate,
  requireDoctor,
  checkDoctorStatus,
  (req, res) => updateDoctorAvailability(req, res, req.user.id)
);

// ========== STATISTICS ==========
router.get('/stats',
  authenticate,
  requireDoctor,
  checkDoctorStatus,
  async (req, res) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayStr = today.toISOString().split('T')[0];
      const [
        totalProd,
        totalTest,
        todayProd,
        todayTest,
        completedProd,
        completedTest,
        cancelledProd,
        cancelledTest,
        upcomingProd,
        upcomingTest,
      ] = await Promise.all([
        Appointment.countDocuments({ doctorId: req.user.id }),
        AppointmentTesting.countDocuments({ doctorId: req.user.id }),
        Appointment.countDocuments({
          doctorId: req.user.id,
          date: { $gte: todayStr }
        }),
        AppointmentTesting.countDocuments({
          doctorId: req.user.id,
          date: { $gte: todayStr }
        }),
        Appointment.countDocuments({ doctorId: req.user.id, status: 'Completed' }),
        AppointmentTesting.countDocuments({ doctorId: req.user.id, status: 'Completed' }),
        Appointment.countDocuments({ doctorId: req.user.id, status: 'Cancelled' }),
        AppointmentTesting.countDocuments({ doctorId: req.user.id, status: 'Cancelled' }),
        Appointment.countDocuments({
          doctorId: req.user.id,
          status: 'Scheduled',
          date: { $gte: todayStr }
        }),
        AppointmentTesting.countDocuments({
          doctorId: req.user.id,
          status: 'Scheduled',
          date: { $gte: todayStr }
        }),
      ]);

      const totalAppointments = totalProd + totalTest;
      const todayAppointments = todayProd + todayTest;
      const completedAppointments = completedProd + completedTest;
      const cancelledAppointments = cancelledProd + cancelledTest;
      const upcomingAppointments = upcomingProd + upcomingTest;

      res.json({
        status: 'success',
        data: {
          totalAppointments,
          todayAppointments,
          completedAppointments,
          cancelledAppointments,
          upcomingAppointments,
        },
        message: 'Statistics fetched successfully'
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch statistics',
        errors: [error.message]
      });
    }
  }
);

// ========= BLOCK DATES AND SLOT LOCKING ==========

router.post('/block-dates',
  authenticate,
  requireDoctor,
  checkDoctorStatus,
  async (req, res) => {
    try {
      const { doctor } = req;
      const { startDate, endDate, reason } = req.body;

      if (!startDate || !endDate || !reason) {
        return res.status(400).json({
          status: 'error',
          message: 'startDate, endDate and reason are required.'
        });
      }

      const blockedSlot = new BlockedSlot({
        doctorId: doctor._id,
        startDate,
        endDate,
        reason
      });

      await blockedSlot.save();

      // TODO: Add your business logic here to lock all slots between these dates per your system

      if (doctor.googleCalendar && doctor.googleCalendar.isConnected) {
        try {
          await googleCalendarService.createBlockedSlotEvent(
            doctor.googleCalendar.accessToken,
            doctor.googleCalendar.calendarId || 'primary',
            blockedSlot
          );
        } catch (err) {
          console.error('Error creating Google Calendar blocked event:', err.message);
        }
      }

      res.json({
        status: 'success',
        message: 'Dates blocked successfully and slots locked.',
        data: blockedSlot
      });
    } catch (error) {
      console.error('Error blocking dates:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to block dates.',
        errors: [error.message]
      });
    }
  }
);

// ---------- Timezone + overlap helpers (same as blockedSlots) ----------
const IST_OFFSET_MINUTES = 5 * 60 + 30; // +05:30
const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000;

const overlaps = (aStart, aEnd, bStart, bEnd) => {
  const s1 = new Date(aStart),
    e1 = new Date(aEnd),
    s2 = new Date(bStart),
    e2 = new Date(bEnd);
  return s1 < e2 && s2 < e1;
};

// Convert a UTC instant -> IST "wall clock" parts
function toIstParts(dateUtc) {
  const ist = new Date(dateUtc.getTime() + IST_OFFSET_MS);
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth() + 1, // 1-12
    day: ist.getUTCDate(),
    hour: ist.getUTCHours(),
    minute: ist.getUTCMinutes(),
    second: ist.getUTCSeconds(),
    ms: ist.getUTCMilliseconds(),
  };
}

// Build a Date that represents a local IST time (YYYY-MM-DD HH:mm)
// as a specific UTC instant.
function makeIstInstant(
  year,
  month, // 1–12
  day,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0
) {
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  // local IST = UTC + 5:30 => UTC instant = local - 5:30
  return new Date(utcMs - IST_OFFSET_MS);
}


function isSlotWithinAvailability(doctorDoc, slotStart, slotEnd) {
  if (!doctorDoc || !slotStart || !slotEnd) return false;

  const start = slotStart instanceof Date ? new Date(slotStart) : new Date(slotStart);
  const end = slotEnd instanceof Date ? new Date(slotEnd) : new Date(slotEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;

  const dailyRangesRaw = Array.isArray(doctorDoc.dailyTimeRanges)
    ? doctorDoc.dailyTimeRanges
    : [];
  if (!dailyRangesRaw.length) return false;

  const availabilityRange = doctorDoc.availabilityRange || {};
  const availabilityMode = doctorDoc.availabilityMode || "default";

  // Excluded working days from both availabilityRange and legacy field
  let excludedWeekdays = [];
  if (Array.isArray(availabilityRange.excludedWeekdays)) {
    excludedWeekdays = excludedWeekdays.concat(
      availabilityRange.excludedWeekdays.map((v) => Number(v))
    );
  }
  if (Array.isArray(doctorDoc.excludedWeekdays)) {
    excludedWeekdays = excludedWeekdays.concat(
      doctorDoc.excludedWeekdays.map((v) => Number(v))
    );
  }
  excludedWeekdays = [...new Set(excludedWeekdays)]; // unique

  const dayCode = (y, m, d) => y * 10000 + m * 100 + d;

  // Compute availability date window (IST)
  let availStartCode = null;
  if (availabilityRange.startDate) {
    if (availabilityRange.startDate instanceof Date && !isNaN(availabilityRange.startDate)) {
      const ist = toIstParts(availabilityRange.startDate);
      availStartCode = dayCode(ist.year, ist.month, ist.day);
    } else if (typeof availabilityRange.startDate === "string") {
      const [sy, sm, sd] = availabilityRange.startDate.split("-").map((n) => parseInt(n, 10));
      if (!Number.isNaN(sy) && !Number.isNaN(sm) && !Number.isNaN(sd)) {
        availStartCode = dayCode(sy, sm, sd);
      }
    }
  }

  let availEndCode = null;
  if (availabilityRange.endDate) {
    if (availabilityRange.endDate instanceof Date && !isNaN(availabilityRange.endDate)) {
      const ist = toIstParts(availabilityRange.endDate);
      availEndCode = dayCode(ist.year, ist.month, ist.day);
    } else if (typeof availabilityRange.endDate === "string") {
      const [ey, em, ed] = availabilityRange.endDate.split("-").map((n) => parseInt(n, 10));
      if (!Number.isNaN(ey) && !Number.isNaN(em) && !Number.isNaN(ed)) {
        availEndCode = dayCode(ey, em, ed);
      }
    }
  }

  // Convert slotStart to IST calendar day
  const ist = new Date(start.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth() + 1;
  const d = ist.getUTCDate();
  const weekday = ist.getUTCDay(); // 0–6

  const code = dayCode(y, m, d);

  // Outside doctor availability date window
  if (availStartCode !== null && code < availStartCode) return false;
  if (availEndCode !== null && code > availEndCode) return false;

  // Day is off
  if (excludedWeekdays.includes(weekday)) return false;

  // Pick time ranges that apply to THIS weekday
  let applicableRanges;
  if (availabilityMode === "custom") {
    applicableRanges = dailyRangesRaw.filter((r) => r && r.day === weekday);
  } else {
    applicableRanges = dailyRangesRaw.filter(
      (r) => r && (r.day === undefined || r.day === null)
    );
  }

  if (!applicableRanges.length) return false;

  // Check if appointment is fully inside any working range
  for (const range of applicableRanges) {
    if (!range || !range.start || !range.end) continue;

    const [sh, sm] = String(range.start).split(":").map((n) => parseInt(n, 10));
    const [eh, em] = String(range.end).split(":").map((n) => parseInt(n, 10));
    if (
      Number.isNaN(sh) ||
      Number.isNaN(sm) ||
      Number.isNaN(eh) ||
      Number.isNaN(em)
    )
      continue;

    const rangeStart = makeIstInstant(y, m, d, sh ?? 0, sm ?? 0, 0, 0);
    const rangeEnd = makeIstInstant(y, m, d, eh ?? 0, em ?? 0, 0, 0);
    if (rangeEnd <= rangeStart) continue;

    // ✅ current slot is valid if fully inside a working range
    if (start >= rangeStart && end <= rangeEnd) {
      return true;
    }
  }

  return false;
}

// ---------- Timezone helpers above this function stay the same ----------

async function findNextAvailableSlot(doctorDoc, durationMinutes, from, maxDays = 7) {
  if (!doctorDoc) return null;

  // All time ranges configured on the doctor
  const dailyRangesRaw = Array.isArray(doctorDoc.dailyTimeRanges)
    ? doctorDoc.dailyTimeRanges
    : [];
  if (!dailyRangesRaw.length) return null;

  const availabilityRange = doctorDoc.availabilityRange || {};
  const availabilityMode = doctorDoc.availabilityMode || "default";

  // Excluded working days (0 = Sun ... 6 = Sat)
  const excludedWeekdays = Array.isArray(availabilityRange.excludedWeekdays)
    ? availabilityRange.excludedWeekdays.map((v) => Number(v))
    : [];

  const dayCode = (y, m, d) => y * 10000 + m * 100 + d;

  // Pre-compute availability start/end as numeric yyyymmdd codes (IST)
  let availStartCode = null;
  if (availabilityRange.startDate) {
    if (availabilityRange.startDate instanceof Date && !isNaN(availabilityRange.startDate)) {
      const ist = toIstParts(availabilityRange.startDate);
      availStartCode = dayCode(ist.year, ist.month, ist.day);
    } else if (typeof availabilityRange.startDate === "string") {
      const [sy, sm, sd] = availabilityRange.startDate.split("-").map((n) => parseInt(n, 10));
      if (!Number.isNaN(sy) && !Number.isNaN(sm) && !Number.isNaN(sd)) {
        availStartCode = dayCode(sy, sm, sd);
      }
    }
  }

  let availEndCode = null;
  if (availabilityRange.endDate) {
    if (availabilityRange.endDate instanceof Date && !isNaN(availabilityRange.endDate)) {
      const ist = toIstParts(availabilityRange.endDate);
      availEndCode = dayCode(ist.year, ist.month, ist.day);
    } else if (typeof availabilityRange.endDate === "string") {
      const [ey, em, ed] = availabilityRange.endDate.split("-").map((n) => parseInt(n, 10));
      if (!Number.isNaN(ey) && !Number.isNaN(em) && !Number.isNaN(ed)) {
        availEndCode = dayCode(ey, em, ed);
      }
    }
  }

  // 'from' is a UTC instant; we interpret it as IST wall-clock
  const startInstant = from instanceof Date ? new Date(from) : new Date(from);
  if (Number.isNaN(startInstant.getTime())) return null;

  const appointmentDuration = Number(
    durationMinutes || doctorDoc.appointmentDuration || 30
  );

  // For DB queries we can still use a simple +N days window in UTC
  const windowEnd = new Date(
    startInstant.getTime() + maxDays * 24 * 60 * 60 * 1000
  );

  const existingAppointments = await Appointment.find({
    doctorId: doctorDoc._id,
    status: { $in: ["Scheduled", "In Progress", "Rescheduled", "Reassigned"] },
    slotStartIso: { $lt: windowEnd },
    slotEndIso: { $gt: startInstant },
  }).select("slotStartIso slotEndIso");

  const blockedSlots = await BlockedSlot.find({
    doctorId: doctorDoc._id,
    startTime: { $lt: windowEnd },
    endTime: { $gt: startInstant },
  }).select("startTime endTime");

  const slotIsFree = (candStart, candEnd) => {
    for (const ap of existingAppointments) {
      if (overlaps(candStart, candEnd, ap.slotStartIso, ap.slotEndIso))
        return false;
    }
    for (const b of blockedSlots) {
      if (overlaps(candStart, candEnd, b.startTime, b.endTime)) return false;
    }
    return true;
  };

  const now = new Date();

  // Convert the starting instant into IST calendar day
  const startIst = new Date(startInstant.getTime() + IST_OFFSET_MS);

  for (let dayIndex = 0; dayIndex <= maxDays; dayIndex++) {
    // dayIst = IST wall-clock date for this iteration
    const dayIst = new Date(startIst);
    dayIst.setUTCDate(dayIst.getUTCDate() + dayIndex);

    const y = dayIst.getUTCFullYear();
    const m = dayIst.getUTCMonth() + 1;
    const d = dayIst.getUTCDate();
    const weekday = dayIst.getUTCDay(); // 0–6, aligned with excludedWeekdays

    const code = dayCode(y, m, d);

    // 🔴 Skip outside availability date range
    if (availStartCode !== null && code < availStartCode) continue;
    if (availEndCode !== null && code > availEndCode) continue;

    // 🔴 Skip blocked working days (Sun/Mon/etc checked here)
    if (excludedWeekdays.includes(weekday)) continue;

    // Pick the ranges that apply to THIS weekday
    let applicableRanges;
    if (availabilityMode === "custom") {
      // For custom mode, ranges should have .day = 0–6
      applicableRanges = dailyRangesRaw.filter(
        (r) => r && r.day === weekday
      );
    } else {
      // Default mode: ranges without a specific day
      applicableRanges = dailyRangesRaw.filter(
        (r) => r && (r.day === undefined || r.day === null)
      );
    }

    if (!applicableRanges.length) continue;

    for (const range of applicableRanges) {
      if (!range || !range.start || !range.end) continue;

      const [sh, sm] = String(range.start)
        .split(":")
        .map((n) => parseInt(n, 10));
      const [eh, em] = String(range.end)
        .split(":")
        .map((n) => parseInt(n, 10));
      if (
        Number.isNaN(sh) ||
        Number.isNaN(sm) ||
        Number.isNaN(eh) ||
        Number.isNaN(em)
      )
        continue;

      // Working range boundaries in IST (as UTC instants)
      const rangeStart = makeIstInstant(y, m, d, sh ?? 0, sm ?? 0, 0, 0);
      const rangeEnd = makeIstInstant(y, m, d, eh ?? 0, em ?? 0, 0, 0);
      if (rangeEnd <= rangeStart) continue;

      let cursor = new Date(rangeStart);

      // For day 0, don't search before the requested 'from' instant
      if (dayIndex === 0 && startInstant > cursor) {
        cursor = new Date(startInstant);
      }

      while (
        cursor.getTime() + appointmentDuration * 60000 <= rangeEnd.getTime()
      ) {
        const candStart = new Date(cursor);
        const candEnd = new Date(
          candStart.getTime() + appointmentDuration * 60000
        );

        // Skip slots that finish before "from"
        if (candEnd <= startInstant) {
          cursor = new Date(cursor.getTime() + appointmentDuration * 60000);
          continue;
        }

        // Skip past slots
        if (candStart < now) {
          cursor = new Date(cursor.getTime() + appointmentDuration * 60000);
          continue;
        }

        if (slotIsFree(candStart.toISOString(), candEnd.toISOString())) {
          return { start: candStart, end: candEnd };
        }

        cursor = new Date(cursor.getTime() + appointmentDuration * 60000);
      }
    }
  }

  return null;
}


// ---------- Best-effort sync helper (same as blockedSlots) ----------
async function syncAppointmentToGoogle(doctorDoc, appt) {
  try {
    if (!doctorDoc.googleCalendar?.isConnected) {
      return { success: false, error: 'Calendar not connected' };
    }

    const payload = {
      appointmentId: appt._id,
      slotStartIso: appt.slotStartIso,
      slotEndIso: appt.slotEndIso,
      status: appt.status,
      patientEmail: appt.patientId?.email,
      attendees: [
        ...(appt.patientId?.email
          ? [{ email: appt.patientId.email, displayName: appt.patientId.name }]
          : []),
      ],
    };

    let result;

    if (appt.googleCalendar?.eventId) {
      result = await googleCalendarService.updateAppointmentEvent(
        doctorDoc,
        appt.googleCalendar.eventId,
        payload
      );
    } else {
      result = await googleCalendarService.createAppointmentEventWithDoctor(
        doctorDoc,
        appt.patientId,
        payload
      );
    }

    if (!result || !result.success) {
      return {
        success: false,
        error: result?.error || 'Failed to sync appointment',
      };
    }

    return {
      success: true,
      eventId: result.eventId,
      eventLink: result.eventLink,
    };
  } catch (err) {
    console.error('syncAppointmentToGoogle error:', err);
    return { success: false, error: err?.message || String(err) };
  }
}


module.exports = router;