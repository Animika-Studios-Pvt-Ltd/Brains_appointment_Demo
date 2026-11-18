// backend/routes/patient.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const path = require('path');
const fs = require('fs');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const cloudinary = require('../config/cloudinaryConfig');
const { Readable } = require('stream');
const Patient = require('../modal/Patient');
const Doctor = require('../modal/Doctor');
const { validate } = require('../middleware/validate');
const { computeAgeFromDob } = require('../utils/date');
const Appointment = require('../modal/Appointment');
const AppointmentTesting = require('../modal/AppointmentTesting');
const googleCalendarService = require('../services/googleCalendar');
const notificationService = require('../services/notificationService');
const { syncPatientBookingExternal } = require('../services/patientBookingSync');
const BlockedSlot = require('../modal/BlockedSlot');
const SystemSetting = require('../modal/SystemSetting');
const requireFields = require('../middleware/requireFields');
const { isSlotVip, toIstParts } = require('../utils/slotFinder');
const { recordActivity } = require('../services/activityLogger');
const {
  createOrder: createRazorpayOrder,
  verifyPaymentSignature,
  getRazorpayKeyId,
} = require('../services/razorpay');
const {
  validateAppointmentAvailability,
  isSlotStartBookableByTime,
} = require('../utils/availabilityChecker');

// Mobile app (/api/patient/*) only — raised for testing. Web/staff stay at 3.
const PATIENT_RESCHEDULE_LIMIT = 999; // TODO testing: restore to 3
const PATIENT_CANCEL_LIMIT = 999; // TODO testing: restore to 3

const slotOverlapFilter = (doctorId, start, end, excludeId) => {
  const q = {
    doctorId,
    status: { $nin: ['Cancelled', 'No Show', 'Missed'] },
    slotStartIso: { $lt: end },
    slotEndIso: { $gt: start },
  };
  if (excludeId) q._id = { $ne: excludeId };
  return q;
};

async function hasSlotConflict({ doctorId, start, end, excludeId } = {}) {
  const q = slotOverlapFilter(doctorId, start, end, excludeId);
  const [prod, test] = await Promise.all([
    Appointment.findOne(q).lean(),
    AppointmentTesting.findOne(q).lean(),
  ]);
  return !!(prod || test);
}

async function findPatientAppointmentDoc(id, patientId) {
  const query = { _id: id, patientId };
  const populate = [{ path: 'doctorId' }, { path: 'patientId' }];
  const prod = await Appointment.findOne(query).populate(populate);
  if (prod) {
    return { appt: prod, Model: Appointment, collection: 'appointments' };
  }
  const test = await AppointmentTesting.findOne(query).populate(populate);
  if (test) {
    return { appt: test, Model: AppointmentTesting, collection: 'appointment-testing' };
  }
  return null;
}

/* ===========================
   AUTH (same pattern as admin.js)
=========================== */
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', message: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, type, role }
    next();
  } catch (error) {
    return res.status(401).json({ status: 'error', message: 'Invalid token' });
  }
};

const requirePatient = (req, res, next) => {
  const t = String(req.user?.type || req.user?.userType || '').toLowerCase();
  if (t !== 'patient') {
    return res.status(403).json({
      status: 'error',
      message: 'Patient access required',
      code: 'INSUFFICIENT_PERMISSIONS',
    });
  }
  next();
};

/**
 * Generate initials-based avatar URL
 */
function generateInitialsAvatar(name) {
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return 'https://ui-avatars.com/api/?name=U&background=random&color=fff&size=500';
  }
  const initials = name.trim().split(' ').filter(n => n.length > 0).map(n => n[0]).join('').toUpperCase().slice(0, 2);
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=random&color=fff&size=500&bold=true`;
}

/** Always return a usable image URL for doctor cards/detail */
function resolveDoctorProfileImage(doctor) {
  const img = doctor?.profileImage;
  if (img && typeof img === 'string' && img.trim()) {
    const s = img.trim();
    if (/^https?:\/\//i.test(s) || s.startsWith('//')) return s;
    if (s.startsWith('/')) return s;
    return `/${s}`;
  }
  return generateInitialsAvatar(doctor?.name || 'Doctor');
}

function doctorWithResolvedImage(doc) {
  const o = doc?.toObject ? doc.toObject() : { ...doc };
  o.profileImage = resolveDoctorProfileImage(o);
  return o;
}

/* ===========================
   FILE UPLOAD SETUP WITH CLOUDINARY V2
=========================== */
// Helper function to upload buffer to Cloudinary
const uploadToCloudinary = (buffer, folder, filename) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        public_id: filename,
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        // Lighter than face-detection crop — faster uploads while keeping reasonable size
        transformation: [
          { width: 512, height: 512, crop: 'limit', fetch_format: 'auto', quality: 'auto:good' },
        ],
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
const uploadPatientImage = async (req, res, next) => {
  if (!req.file) return next();
  
  try {
    const patientId = req.user?.id || Date.now();
    const filename = `patient_${patientId}_${Date.now()}`;
    const result = await uploadToCloudinary(req.file.buffer, 'healthapp/patients/avatars', filename);
    req.cloudinaryResult = result;
    next();
  } catch (error) {
    next(error);
  }
};

router.get('/me', authenticate, requirePatient, async (req, res) => {
  try {
    const me = await Patient.findById(req.user.id).select('+password');
    if (!me) return res.status(404).json({ status: 'error', message: 'Patient not found' });

    const hasPassword =
      me.password !== undefined && me.password !== null && String(me.password).length > 0
        ? true
        : !me.googleId;

    // ✅ Ensure profileImage has a value
    if (!me.profileImage || me.profileImage === '') {
      me.profileImage = generateInitialsAvatar(me.name);
      await me.save();
    }

    const meData = me.toObject();
    delete meData.password;
    meData.hasPassword = hasPassword;
    meData.authProvider = meData.authProvider || (me.googleId ? 'google' : 'password');

    console.log('📡 /api/patient/me returning safe user:', {
      id: meData._id || meData.id,
      email: meData.email,
      authProvider: meData.authProvider,
      googleId: !!meData.googleId,
      hasPassword: meData.hasPassword,
    });

    res.json({ status: 'success', data: meData, message: 'Profile fetched' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch profile', errors: [error.message] });
  }
});

router.put(
  '/profile',
  authenticate,
  requirePatient,
  requireFields(['name', 'phone', 'age']),
  [
    body('name').optional().isString().notEmpty(),
    body('phone').optional().isString(),
    body('dob').optional({ values: 'falsy' }).isISO8601(),
    body('age').notEmpty().withMessage('Age is required').isInt({ min: 0, max: 120 }).withMessage('A valid age between 0 and 120 is required'),
    body('gender').optional({ values: 'falsy' }).isIn(['male', 'female', 'other']),
    body('bloodGroup').optional({ values: 'falsy' }).isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
    body('emergencyContact').optional(),
    body('medicalHistory').optional(),
  ],
  validate,
  async (req, res) => {
    try {
      const updates = { ...req.body };

      // Strip protected fields
      delete updates.email;
      delete updates.password;
      delete updates.googleId;
      delete updates.userType;
      delete updates.role;

      // Clean up empty strings to avoid Mongoose validation failure
      if (updates.gender === '') delete updates.gender;
      if (updates.bloodGroup === '') delete updates.bloodGroup;
      if (updates.dob === '') delete updates.dob;

      // Parse nested objects if they arrived as text (multipart)
      const parseMaybeJSON = (v) => {
        if (v == null) return v;
        if (typeof v !== 'string') return v;
        const s = v.trim();
        if (!s) return undefined;
        if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
          try { return JSON.parse(s); } catch { return s; }
        }
        return v;
      };

      if (typeof updates.emergencyContact !== 'undefined') {
        updates.emergencyContact = parseMaybeJSON(updates.emergencyContact);
      }
      if (typeof updates.medicalHistory !== 'undefined') {
        updates.medicalHistory = parseMaybeJSON(updates.medicalHistory);
      }

      if (updates.age !== undefined && updates.age !== null && updates.age !== '') {
        updates.age = parseInt(updates.age, 10);
      } else if (updates.dob) {
        updates.age = computeAgeFromDob(updates.dob);
      }

      // Profile image: use value from JSON body, or keep existing DB image.
      // File uploads use PUT /profile/avatar.
      const hasNewImage =
        typeof updates.profileImage === 'string' && updates.profileImage.trim() !== '';
      if (!hasNewImage) {
        const currentPatient = await Patient.findById(req.user.id).select('name profileImage');
        if (currentPatient?.profileImage) {
          delete updates.profileImage;
        } else {
          updates.profileImage = generateInitialsAvatar(
            updates.name || currentPatient?.name || 'Patient'
          );
        }
      }

      // mark verified on completion
      updates.isVerified = true;

      const doc = await Patient.findByIdAndUpdate(req.user.id, updates, {
        new: true,
        runValidators: true,
      }).select('-password -googleId');

      if (!doc) {
        return res.status(404).json({ status: 'error', message: 'Patient not found' });
      }

      res.json({ status: 'success', data: doc, message: 'Profile updated' });
    } catch (error) {
      res.status(500).json({ status: 'error', message: 'Update failed', errors: [error.message] });
    }
  }
);

router.put('/profile/avatar', authenticate, requirePatient, upload.single('profileImage'), uploadPatientImage, async (req, res) => {
  try {
    if (!req.cloudinaryResult) return res.status(400).json({ status: 'error', message: 'No image uploaded' });

    // Store Cloudinary URL
    const updated = await Patient.findByIdAndUpdate(
      req.user.id,
      { profileImage: req.cloudinaryResult.secure_url },
      { new: true }
    ).select('-password -googleId');

    if (!updated) return res.status(404).json({ status: 'error', message: 'Patient not found' });

    res.json({
      status: 'success',
      data: updated,
      message: 'Profile image updated',
      imageUrl: req.cloudinaryResult.secure_url
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Avatar update failed', errors: [error.message] });
  }
});

/* ===========================
   PATIENT MEDICAL DOCUMENTS
=========================== */
const DOC_TYPES = ['pdf', 'image', 'scan', 'medical_history', 'allergies', 'vaccination'];

const uploadMedicalToCloudinary = (buffer, folder, filename, mimeType) => {
  const isPdf = mimeType === 'application/pdf';
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: filename,
        resource_type: isPdf ? 'raw' : 'image',
        ...(isPdf
          ? {}
          : {
              transformation: [
                { width: 1600, height: 1600, crop: 'limit', fetch_format: 'auto', quality: 'auto:good' },
              ],
            }),
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    Readable.from(buffer).pipe(uploadStream);
  });
};

const medicalDocFilter = (req, file, cb) => {
  const mime = String(file.mimetype || '').toLowerCase();
  const allowed = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/jpg',
    'image/heic',
    'image/heif',
    'application/pdf',
  ]);
  if (!allowed.has(mime) && !mime.startsWith('image/')) {
    return cb(new Error('Only PDF or image files (JPG, PNG, WEBP) are allowed'), false);
  }
  cb(null, true);
};

const uploadMedicalDoc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: medicalDocFilter,
});

router.get('/medical-documents', authenticate, requirePatient, async (req, res) => {
  try {
    const me = await Patient.findById(req.user.id).select('medicalDocuments medicalHistory');
    if (!me) return res.status(404).json({ status: 'error', message: 'Patient not found' });
    res.json({
      status: 'success',
      data: {
        documents: me.medicalDocuments || [],
        medicalHistory: me.medicalHistory || {},
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch medical documents',
      errors: [error.message],
    });
  }
});

router.post(
  '/medical-documents',
  authenticate,
  requirePatient,
  (req, res, next) => {
    uploadMedicalDoc.single('file')(req, res, (err) => {
      if (err) {
        console.error('📎 medical-documents multer error:', err?.message || err);
        return res.status(400).json({
          status: 'error',
          message: err.message || 'Invalid file upload',
        });
      }
      return next();
    });
  },
  async (req, res) => {
    try {
      const type = String(req.body?.type || '').trim();
      if (!DOC_TYPES.includes(type)) {
        return res.status(400).json({
          status: 'error',
          message: `Invalid type. Allowed: ${DOC_TYPES.join(', ')}`,
        });
      }

      const title = String(req.body?.title || '').trim();
      const notes = String(req.body?.notes || '').trim();
      const textOnlyTypes = new Set(['medical_history', 'allergies', 'vaccination']);

      let url = '';
      let mimeType = '';
      let fileName = '';

      if (req.file) {
        const patientId = req.user.id;
        const safeName = `doc_${patientId}_${Date.now()}`;
        const result = await uploadMedicalToCloudinary(
          req.file.buffer,
          'healthapp/patients/medical-documents',
          safeName,
          req.file.mimetype
        );
        url = result.secure_url;
        mimeType = req.file.mimetype;
        fileName = req.file.originalname || safeName;
      } else if (!textOnlyTypes.has(type) || !notes) {
        return res.status(400).json({
          status: 'error',
          message: textOnlyTypes.has(type)
            ? 'Please enter details or attach a file.'
            : 'A file is required for this upload type.',
        });
      }

      const doc = {
        type,
        title:
          title ||
          ({
            pdf: 'Uploaded PDF',
            image: 'Uploaded Image',
            scan: 'Uploaded Scan',
            medical_history: 'Medical History',
            allergies: 'Allergies',
            vaccination: 'Vaccination Record',
          }[type] || 'Medical Document'),
        url,
        mimeType,
        fileName,
        notes,
        uploadedAt: new Date(),
      };

      const update = { $push: { medicalDocuments: doc } };

      // Keep profile medicalHistory in sync for text entries
      if (type === 'allergies' && notes) {
        update.$set = { ...(update.$set || {}), 'medicalHistory.allergies': notes };
      }
      if (type === 'medical_history' && notes) {
        update.$set = {
          ...(update.$set || {}),
          'medicalHistory.chronicConditions': notes,
        };
      }
      if (type === 'vaccination' && notes) {
        update.$set = {
          ...(update.$set || {}),
          'medicalHistory.vaccinations': notes,
        };
      }

      const updated = await Patient.findByIdAndUpdate(req.user.id, update, {
        new: true,
      }).select('medicalDocuments medicalHistory');

      if (!updated) {
        return res.status(404).json({ status: 'error', message: 'Patient not found' });
      }

      const created = updated.medicalDocuments[updated.medicalDocuments.length - 1];
      res.status(201).json({
        status: 'success',
        data: created,
        documents: updated.medicalDocuments,
        medicalHistory: updated.medicalHistory,
        message: 'Document saved',
      });
    } catch (error) {
      console.error('📎 medical-documents upload failed:', error?.message || error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to upload medical document',
        errors: [error.message],
      });
    }
  }
);

router.delete('/medical-documents/:docId', authenticate, requirePatient, async (req, res) => {
  try {
    const updated = await Patient.findByIdAndUpdate(
      req.user.id,
      { $pull: { medicalDocuments: { _id: req.params.docId } } },
      { new: true }
    ).select('medicalDocuments medicalHistory');

    if (!updated) {
      return res.status(404).json({ status: 'error', message: 'Patient not found' });
    }

    res.json({
      status: 'success',
      data: {
        documents: updated.medicalDocuments || [],
        medicalHistory: updated.medicalHistory || {},
      },
      message: 'Document deleted',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete document',
      errors: [error.message],
    });
  }
});

// -------- Public: List doctors (verified + active only) --------
router.get('/doctors', async (req, res) => {
  try {
    const {
      search = '',
      specialization = '',
      city = '',
      page = 1,
      limit = 12,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
    const skip = (pageNum - 1) * limitNum;

    const query = {
      isVerified: true,
      isActive: true,
      status: 'active',
    };

    if (specialization) {
      query.specialization = specialization;
    }

    // text-ish search across name, specialization
    if (search && search.trim()) {
      query.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { specialization: { $regex: search.trim(), $options: 'i' } },
        { qualification: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    const [doctors, total] = await Promise.all([
      Doctor.find(query)
        .select('-password -googleId -googleCalendar.accessToken -googleCalendar.refreshToken -googleCalendar.tokenExpiry -googleCalendar.expiryDate -googleCalendar.scope -googleCalendar.tokenType -googleCalendar.calendarId -googleCalendar.workCalendarId -suspensionReason -suspendedAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Doctor.countDocuments(query),
    ]);

    const setting = await SystemSetting.findOne({ key: 'onlineBookingLive' });
    const onlineBookingLive = setting ? setting.value === true : true;

    const doctorsResolved = doctors.map((doc) => {
      const d = doctorWithResolvedImage(doc);
      if (!onlineBookingLive && Array.isArray(d.dailyTimeRanges)) {
        d.dailyTimeRanges = d.dailyTimeRanges.filter((r) => !r.isOnline);
      }
      return d;
    });

    return res.json({
      status: 'success',
      data: {
        doctors: doctorsResolved,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      },
      message: 'Doctors fetched',
    });
  } catch (error) {
    console.error('Patient list doctors error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch doctors',
      errors: [error.message],
    });
  }
});

// -------- Public: Single doctor details --------
router.get('/doctors/:id', async (req, res) => {
  try {
    const doc = await Doctor.findOne({
      _id: req.params.id,
      isVerified: true,
      isActive: true,
      status: 'active',
    })
      .select('-password -googleId -googleCalendar.accessToken -googleCalendar.refreshToken -googleCalendar.tokenExpiry -googleCalendar.expiryDate -googleCalendar.scope -googleCalendar.tokenType -googleCalendar.calendarId -googleCalendar.workCalendarId -suspensionReason -suspendedAt');

    if (!doc) {
      return res.status(404).json({
        status: 'error',
        message: 'Doctor not found',
      });
    }

    const setting = await SystemSetting.findOne({ key: 'onlineBookingLive' });
    const onlineBookingLive = setting ? setting.value === true : true;

    const resolvedDoc = doctorWithResolvedImage(doc);
    if (!onlineBookingLive && Array.isArray(resolvedDoc.dailyTimeRanges)) {
      resolvedDoc.dailyTimeRanges = resolvedDoc.dailyTimeRanges.filter((r) => !r.isOnline);
    }

    return res.json({
      status: 'success',
      data: resolvedDoc,
      message: 'Doctor details fetched',
    });
  } catch (error) {
    console.error('Patient doctor details error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch doctor',
      errors: [error.message],
    });
  }
});

router.get('/doctors/:id/calendar', async (req, res) => {
  try {
    const { id } = req.params;
    const timeMin = req.query.timeMin ? new Date(req.query.timeMin) : new Date();
    const timeMax = req.query.timeMax
      ? new Date(req.query.timeMax)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    if (Number.isNaN(timeMin) || Number.isNaN(timeMax)) {
      return res.status(400).json({ status: 'error', message: 'Invalid time range' });
    }

    const doctor = await Doctor.findOne({
      _id: id,
      isVerified: true,
      isActive: true,
      status: 'active',
    }).lean();

    if (!doctor) {
      return res.status(404).json({ status: 'error', message: 'Doctor not found' });
    }

    const setting = await SystemSetting.findOne({ key: 'onlineBookingLive' });
    const onlineBookingLive = setting ? setting.value === true : true;
    if (!onlineBookingLive) {
      doctor.dailyTimeRanges = (doctor.dailyTimeRanges || []).filter(r => !r.isOnline);
    }

    const startIso = timeMin.toISOString();
    const endIso = timeMax.toISOString();

    const appts = await Appointment.find({
      doctorId: id,
      status: { $nin: ['Cancelled', 'No Show', 'Missed'] },
      $or: [
        { slotStartIso: { $lte: endIso }, slotEndIso: { $gte: startIso } },
        { date: { $exists: true }, 'timeSlot.start': { $exists: true } },
      ],
    }).select('date timeSlot slotStartIso slotEndIso consultationType status');

    const busyFromAppts = appts
      .map((a) => {
        if (a.slotStartIso && a.slotEndIso) {
          return {
            startIso: new Date(a.slotStartIso).toISOString(),
            endIso: new Date(a.slotEndIso).toISOString(),
            source: 'appointment',
            status: a.status,
            kind: a.consultationType || 'Appointment',
          };
        }
        if (a.date && a.timeSlot?.start) {
          const s = new Date(`${a.date}T${a.timeSlot.start}:00.000Z`).toISOString();
          const e = new Date(`${a.date}T${a.timeSlot.end || a.timeSlot.start}:00.000Z`).toISOString();
          return { startIso: s, endIso: e, source: 'appointment', status: a.status, kind: 'Appointment' };
        }
        return null;
      })
      .filter(Boolean);

    const blocks = await BlockedSlot.find({
      doctorId: id,
      startTime: { $lte: endIso },
      endTime: { $gte: startIso },
    }).select('startTime endTime reason');

    const busyFromBlocks = blocks.map(b => ({
      startIso: new Date(b.startTime).toISOString(),
      endIso: new Date(b.endTime).toISOString(),
      source: 'blocked',
      kind: 'Blocked',
      summary: b.reason || 'Blocked',
    }));

    let busyFromGcal = [];
    const gcalConnected = !!doctor.googleCalendar?.accessToken;

    if (gcalConnected) {
      try {
        const fb = await googleCalendarService.getBusyTimes(doctor, startIso, endIso);
        if (fb.success) {
          busyFromGcal = (fb.busyTimes || []).map((b) => ({
            startIso: b.start,
            endIso: b.end,
            source: 'gcal',
            kind: 'Calendar',
          }));
        }
      } catch (err) {
        console.warn('GCAL fetch failed (non-fatal):', err?.message || err);
      }
    }

    const busy = [...busyFromAppts, ...busyFromBlocks, ...busyFromGcal].sort(
      (a, b) => new Date(a.startIso) - new Date(b.startIso)
    );

    return res.json({
      status: 'success',
      data: {
        busy,
        slotDurationMinutes: doctor.slotDurationMinutes || doctor.appointmentDuration || 30,
        dailyTimeRanges: doctor.dailyTimeRanges || [],
        availabilityRange: doctor.availabilityRange || null,
        availabilityMode: doctor.availabilityMode || 'default',
        gcalConnected,
        workCalendarId: doctor.googleCalendar?.workCalendarId || null,
      },
      message: 'Doctor calendar fetched',
    });
  } catch (error) {
    console.error('patient.doctor.calendar error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch calendar', errors: [error.message] });
  }
});

// ========== PATIENT APPOINTMENTS ==========
// Get patient's appointments with filtering and pagination
// Merges production `appointments` + mobile `appointment-testing` so call-center
// status updates (Completed / Missed / etc.) appear in the patient app.
router.get('/appointments', authenticate, requirePatient, async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const query = { patientId: req.user.id };
    if (status) query.status = status;

    const populateDoctor = { path: 'doctorId', select: 'name specialization profileImage fees' };

    const [testingRows, productionRows] = await Promise.all([
      AppointmentTesting.find(query).populate(populateDoctor).lean(),
      Appointment.find(query).populate(populateDoctor).lean(),
    ]);

    const seen = new Set();
    const merged = [];
    // Prefer production docs when the same id somehow exists in both
    for (const row of [...productionRows, ...testingRows]) {
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

    const total = merged.length;
    const appointments = merged.slice(skip, skip + limitNum);

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
    console.error('Get appointments error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch appointments', errors: [error.message] });
  }
});

// Get single appointment details
router.get('/appointments/:id', authenticate, requirePatient, async (req, res) => {
  try {
    const idQuery = { _id: req.params.id, patientId: req.user.id };
    const populateOpts = [
      { path: 'doctorId', select: 'name specialization profileImage fees email phone' },
      { path: 'patientId', select: 'name email phone profileImage' },
    ];

    let appointment = await Appointment.findOne(idQuery).populate(populateOpts);
    if (!appointment) {
      appointment = await AppointmentTesting.findOne(idQuery).populate(populateOpts);
    }

    if (!appointment) {
      return res.status(404).json({ status: 'error', message: 'Appointment not found' });
    }

    res.json({ status: 'success', data: appointment, message: 'Appointment details fetched' });
  } catch (error) {
    console.error('Get appointment details error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch appointment', errors: [error.message] });
  }
});

// Book appointment
router.post(
  '/appointments',
  authenticate,
  requirePatient,
  [
    body('doctorId').notEmpty().withMessage('doctorId is required'),
    body('slotStartIso').isISO8601().withMessage('slotStartIso must be ISO date'),
    body('durationMinutes').optional().isInt({ min: 5, max: 300 }),
    body('consultationType').optional().isString(),
    body('symptoms').optional().isString(),
    body('paymentMode').optional().isIn(['offline', 'online']),
  ],
  validate,
  async (req, res) => {
    try {
      const {
        doctorId,
        slotStartIso,
        durationMinutes = 30,
        consultationType = 'Video Consultation',
        symptoms = '',
        paymentMode = 'offline',
      } = req.body;

      // Check if patient profile required fields are filled (name, phone, age)
      const patientObj = await Patient.findById(req.user.id);
      if (!patientObj || !patientObj.name || !patientObj.phone || !patientObj.age) {
        return res.status(400).json({
          status: 'error',
          message: 'Profile incomplete. Please complete your profile details (including name, phone, and age) to book an appointment.',
        });
      }

      const doctor = await Doctor.findOne({
        _id: doctorId,
        isVerified: true,
        isActive: true,
        status: 'active',
      });
      if (!doctor) {
        return res.status(404).json({ status: 'error', message: 'Doctor not found or not active' });
      }

      const setting = await SystemSetting.findOne({ key: 'onlineBookingLive' });
      const onlineBookingLive = setting ? setting.value === true : true;
      if (!onlineBookingLive) {
        doctor.dailyTimeRanges = (doctor.dailyTimeRanges || []).filter(r => !r.isOnline);
      }

      const isCalendarConnected = doctor.googleCalendar?.isConnected || doctor.googleCalendar?.connected;
      if (!isCalendarConnected) {
        return res.status(400).json({ status: 'error', message: "Doctor's calendar is not connected to Google Calendar" });
      }

      // Check if this is a VIP slot
      const isVip = await isSlotVip(doctorId, slotStartIso);
      if (isVip) {
        return res.status(403).json({
          status: 'error',
          message: 'Selected slot is reserved for VIP/Priority bookings.',
        });
      }

      const start = new Date(slotStartIso);
      if (Number.isNaN(start.getTime())) {
        return res.status(400).json({ status: 'error', message: 'Invalid slotStartIso' });
      }
      const duration = Number(durationMinutes) || doctor.appointmentDuration || doctor.slotDurationMinutes || 30;
      const end = new Date(start.getTime() + duration * 60000);
      const slotEndIso = end.toISOString();

      // Use IST calendar date (matches available-slots generation)
      const ist = toIstParts(start);
      const dateStr = `${ist.year}-${String(ist.month).padStart(2, '0')}-${String(ist.day).padStart(2, '0')}`;

      const availabilityCheck = validateAppointmentAvailability(
        doctor,
        start.toISOString(),
        slotEndIso
      );
      if (!availabilityCheck.available) {
        return res.status(400).json({
          status: 'error',
          message: availabilityCheck.reason || 'Selected time is outside working hours',
        });
      }

      const blocked = await BlockedSlot.findOne({
        doctorId,
        startTime: { $lt: slotEndIso },
        endTime: { $gt: slotStartIso },
      });
      if (blocked) {
        return res.status(409).json({ status: 'error', message: 'Selected time is blocked by doctor' });
      }

      const mode = paymentMode === 'online' ? 'online' : 'offline';
      const useTesting = mode === 'online';
      const AppointmentModel = useTesting ? AppointmentTesting : Appointment;
      const collectionName = useTesting ? 'appointment-testing' : 'appointments';

      const conflict = await hasSlotConflict({
        doctorId,
        start: slotStartIso,
        end: slotEndIso,
      });
      if (conflict) {
        return res.status(409).json({
          status: 'error',
          message: 'Selected time overlaps an existing appointment',
        });
      }

      let created;
      try {
        const fee = Number(doctor.fees) || null;
        created = await AppointmentModel.create({
          doctorId,
          patientId: req.user.id,
          date: dateStr,
          slotStartIso: start.toISOString(),
          slotEndIso: slotEndIso,
          symptoms: symptoms || '',
          status: 'Scheduled',
          bookedBy: 'self',
          paymentMode: mode,
          paymentStatus: mode === 'online' ? 'pending' : 'unpaid',
          paymentAmount: fee,
          notes: [
            mode === 'online'
              ? consultationType === 'Phone Consultation'
                ? 'Voice Call'
                : 'Video Consultation'
              : 'In-Person Consultation',
            useTesting ? 'source:mobile-app-testing' : 'source:mobile-app',
            `payment:${mode}`,
          ].join(' | '),
        });
      } catch (createErr) {
        console.error(`${AppointmentModel.modelName}.create error:`, createErr);
        return res.status(400).json({
          status: 'error',
          message: 'Appointment validation failed',
          errors: [createErr.message],
        });
      }

      let patientForLog = null;
      try {
        patientForLog = await Patient.findById(req.user.id).lean();
        await recordActivity({
          userId: req.user.id,
          userName: patientForLog?.name || req.user.email || 'Patient',
          userEmail: patientForLog?.email || req.user.email || 'patient@app.com',
          userType: 'patient',
          action: useTesting ? 'BOOK_APPOINTMENT_TESTING' : 'BOOK_APPOINTMENT',
          description: useTesting
            ? `Patient ${patientForLog?.name || req.user.email} booked a TEST appointment with Dr. ${doctor.name} on ${dateStr} (appointment-testing)`
            : `Patient ${patientForLog?.name || req.user.email} booked an appointment with Dr. ${doctor.name} on ${dateStr}`,
          req,
          metadata: {
            appointmentId: created._id,
            doctorId: doctor._id,
            doctorName: doctor.name,
            slotStartIso: created.slotStartIso,
            collection: collectionName,
          },
        });
      } catch (logErr) {
        console.warn('⚠️ Patient book activity log failed:', logErr.message);
      }

      // Meet (video/online) + patient confirmation email — await so app gets meetLink
      const patientForEmail = patientForLog || { email: req.user.email, name: req.user.email };
      try {
        await syncPatientBookingExternal({
          appointment: created,
          doctor,
          patient: patientForEmail,
          AppointmentModel,
        });
      } catch (err) {
        console.error('✉️ Mobile booking sync error:', err?.message || err);
      }

      const booked =
        (await AppointmentModel.findById(created._id)
          .populate('doctorId', 'name specialization profileImage fees')
          .lean()) || created;

      return res.status(201).json({
        status: 'success',
        data: booked,
        message: useTesting
          ? 'Test appointment booked successfully (appointment-testing)'
          : 'Appointment booked successfully',
        collection: collectionName,
      });
    } catch (error) {
      console.error('Book appointment error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to book appointment',
        errors: [error.message],
      });
    }
  }
);

// Reschedule appointment (production for offline; appointment-testing for online)
router.put(
  '/appointments/:id/reschedule',
  authenticate,
  requirePatient,
  [
    body('slotStartIso').isISO8601().withMessage('slotStartIso must be ISO date'),
    body('slotEndIso').optional().isISO8601(),
    body('date').optional().isString(),
    body('symptoms').optional().isString(),
    body('durationMinutes').optional().isInt({ min: 5, max: 300 }),
  ],
  validate,
  async (req, res) => {
    try {
      const apptId = req.params.id;
      const {
        slotStartIso,
        slotEndIso,
        symptoms,
        durationMinutes,
      } = req.body;

      const patientObj = await Patient.findById(req.user.id);
      if (!patientObj || !patientObj.name || !patientObj.phone || !patientObj.age) {
        return res.status(400).json({
          status: 'error',
          message:
            'Profile incomplete. Please complete your profile details (including name, phone, and age) to reschedule.',
        });
      }

      const patientRescheduleCount = Number(patientObj.rescheduleCount || 0);
      if (patientRescheduleCount >= PATIENT_RESCHEDULE_LIMIT) {
        return res.status(403).json({
          status: 'error',
          message: 'Reschedule limit reached',
          limit: PATIENT_RESCHEDULE_LIMIT,
          rescheduleCount: patientRescheduleCount,
        });
      }

      const found = await findPatientAppointmentDoc(apptId, req.user.id);
      if (!found) {
        return res.status(404).json({
          status: 'error',
          message: 'Appointment not found',
        });
      }
      const { appt, collection: collectionName } = found;

      const statusLower = String(appt.status || '').toLowerCase();
      if (['cancelled', 'completed', 'missed', 'no show', 'rejected'].includes(statusLower)) {
        return res.status(400).json({
          status: 'error',
          message: 'This appointment can no longer be rescheduled.',
        });
      }

      const apptRescheduleCount = Number(appt.rescheduleCount || 0);
      if (apptRescheduleCount >= PATIENT_RESCHEDULE_LIMIT) {
        return res.status(403).json({
          status: 'error',
          message: 'Reschedule limit reached',
          limit: PATIENT_RESCHEDULE_LIMIT,
          rescheduleCount: apptRescheduleCount,
        });
      }

      const newStart = new Date(slotStartIso);
      if (Number.isNaN(newStart.getTime())) {
        return res.status(400).json({ status: 'error', message: 'Invalid slotStartIso' });
      }

      if (!isSlotStartBookableByTime(newStart)) {
        return res.status(403).json({
          status: 'error',
          message: 'Appointments must be rescheduled at least 1 hour in advance',
        });
      }

      const doctor = appt.doctorId;
      if (!doctor) {
        return res.status(404).json({ status: 'error', message: 'Doctor not found' });
      }

      const setting = await SystemSetting.findOne({ key: 'onlineBookingLive' });
      const onlineBookingLive = setting ? setting.value === true : true;
      if (!onlineBookingLive) {
        doctor.dailyTimeRanges = (doctor.dailyTimeRanges || []).filter(r => !r.isOnline);
      }

      const duration =
        Number(durationMinutes) ||
        doctor.appointmentDuration ||
        doctor.slotDurationMinutes ||
        30;
      const newEnd = slotEndIso
        ? new Date(slotEndIso)
        : new Date(newStart.getTime() + duration * 60000);
      if (Number.isNaN(newEnd.getTime()) || newEnd <= newStart) {
        return res.status(400).json({ status: 'error', message: 'Invalid slotEndIso' });
      }

      const availabilityCheck = validateAppointmentAvailability(
        doctor,
        newStart.toISOString(),
        newEnd.toISOString()
      );
      if (!availabilityCheck.available) {
        return res.status(400).json({
          status: 'error',
          message: availabilityCheck.reason || 'Selected time is outside working hours',
        });
      }

      const blocked = await BlockedSlot.findOne({
        doctorId: doctor._id,
        startTime: { $lt: newEnd },
        endTime: { $gt: newStart },
      });
      if (blocked) {
        return res.status(409).json({
          status: 'error',
          message: 'Selected time is blocked by doctor',
        });
      }

      const conflict = await hasSlotConflict({
        doctorId: doctor._id,
        start: newStart.toISOString(),
        end: newEnd.toISOString(),
        excludeId: appt._id,
      });

      if (conflict) {
        return res.status(409).json({
          status: 'error',
          message: 'Selected time overlaps an existing appointment',
        });
      }

      const ist = toIstParts(newStart);
      const dateStr = `${ist.year}-${String(ist.month).padStart(2, '0')}-${String(ist.day).padStart(2, '0')}`;

      const fromSnapshot = {
        start: appt.slotStartIso,
        end: appt.slotEndIso,
        date: appt.date,
      };

      appt.date = dateStr;
      appt.slotStartIso = newStart.toISOString();
      appt.slotEndIso = newEnd.toISOString();
      if (typeof symptoms === 'string' && symptoms.trim()) {
        appt.symptoms = symptoms.trim();
      }
      appt.status = 'Rescheduled';
      appt.rescheduleCount = apptRescheduleCount + 1;
      if (!Array.isArray(appt.rescheduleHistory)) appt.rescheduleHistory = [];
      appt.rescheduleHistory.push({
        by: req.user.id,
        byType: 'patient',
        at: new Date(),
        from: fromSnapshot,
        to: {
          start: appt.slotStartIso,
          end: appt.slotEndIso,
          date: dateStr,
        },
        note:
          collectionName === 'appointment-testing'
            ? 'Rescheduled via mobile app (appointment-testing)'
            : 'Rescheduled via mobile app',
      });

      await appt.save();
      await Patient.findByIdAndUpdate(req.user.id, { $inc: { rescheduleCount: 1 } });

      try {
        await recordActivity({
          userId: req.user.id,
          userName: patientObj?.name || req.user.email || 'Patient',
          userEmail: patientObj?.email || req.user.email || 'patient@app.com',
          userType: 'patient',
          action:
            collectionName === 'appointment-testing'
              ? 'RESCHEDULE_APPOINTMENT_TESTING'
              : 'RESCHEDULE_APPOINTMENT',
          description: `Patient ${patientObj?.name || req.user.email} rescheduled appointment ${appt._id} with Dr. ${doctor.name}`,
          req,
          metadata: {
            appointmentId: appt._id,
            doctorId: doctor._id,
            slotStartIso: appt.slotStartIso,
            collection: collectionName,
          },
        });
      } catch (logErr) {
        console.warn('⚠️ Patient reschedule activity log failed:', logErr.message);
      }

      process.nextTick(() => {
        notificationService
          .sendAppointmentRescheduledEmail({
            appointment: appt,
            doctor,
            patient: patientObj,
            requestedByRole: 'patient',
          })
          .catch((err) =>
            console.error('✉️ Mobile reschedule email error:', err?.message || err)
          );
      });

      return res.json({
        status: 'success',
        data: appt,
        message: 'Appointment rescheduled successfully',
        collection: collectionName,
      });
    } catch (error) {
      console.error('Reschedule appointment error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to reschedule appointment',
        errors: [error.message],
      });
    }
  }
);

// Cancel appointment (appointment-testing collection — mobile app)
const cancelPatientAppointment = async (req, res) => {
  try {
    const apptId = req.params.id;
    const { reason } = req.body || {};

    const patientObj = await Patient.findById(req.user.id);
    if (!patientObj) {
      return res.status(404).json({ status: 'error', message: 'Patient not found' });
    }

    const cancelCount = Number(patientObj.cancelCount || 0);
    if (cancelCount >= PATIENT_CANCEL_LIMIT) {
      return res.status(403).json({
        status: 'error',
        message: `You reached cancellation limit (${PATIENT_CANCEL_LIMIT}). Please contact support.`,
        limit: PATIENT_CANCEL_LIMIT,
        cancelCount,
      });
    }

    const found = await findPatientAppointmentDoc(apptId, req.user.id);
    if (!found) {
      return res.status(404).json({
        status: 'error',
        message: 'Appointment not found',
      });
    }
    const { appt, collection: collectionName } = found;

    const statusLower = String(appt.status || '').toLowerCase();
    if (statusLower === 'cancelled' || statusLower === 'canceled') {
      return res.status(400).json({ status: 'error', message: 'Already cancelled' });
    }
    if (['completed', 'missed', 'no show'].includes(statusLower)) {
      return res.status(400).json({
        status: 'error',
        message: 'This appointment can no longer be cancelled.',
      });
    }

    appt.status = 'Cancelled';
    appt.cancelReason = reason || 'Patient requested cancellation';
    appt.cancelledAt = new Date();
    appt.cancelledBy = req.user.id;
    appt.cancelledByType = 'patient';
    await appt.save();

    const updatedPatient = await Patient.findByIdAndUpdate(
      req.user.id,
      { $inc: { cancelCount: 1 } },
      { new: true }
    );

    try {
      await recordActivity({
        userId: req.user.id,
        userName: patientObj?.name || req.user.email || 'Patient',
        userEmail: patientObj?.email || req.user.email || 'patient@app.com',
        userType: 'patient',
        action:
          collectionName === 'appointment-testing'
            ? 'CANCEL_APPOINTMENT_TESTING'
            : 'CANCEL_APPOINTMENT',
        description: `Patient ${patientObj?.name || req.user.email} cancelled appointment ${appt._id}`,
        req,
        metadata: {
          appointmentId: appt._id,
          doctorId: appt.doctorId?._id || appt.doctorId,
          collection: collectionName,
        },
      });
    } catch (logErr) {
      console.warn('Patient cancel activity log failed:', logErr.message);
    }

    process.nextTick(async () => {
      try {
        const doctor = appt.doctorId;
        const patient = appt.patientId || patientObj;
        await notificationService.sendAppointmentCancelledEmail({
          appointment: appt,
          doctor,
          patient,
          cancelledByRole: 'patient',
        });
      } catch (err) {
        console.error('✉️ Mobile cancel email error:', err?.message || err);
      }

      try {
        const doctor = appt.doctorId;
        const eventId = appt.googleCalendar?.eventId;
        if (eventId && doctor?.googleCalendar?.isConnected) {
          await googleCalendarService.updateAppointmentEvent(doctor, eventId, {
            appointmentId: appt._id,
            slotStartIso: appt.slotStartIso,
            slotEndIso: appt.slotEndIso,
            status: 'Cancelled',
          });
        }
      } catch (err) {
        console.error('Background cancel calendar sync failed:', err?.message || err);
      }
    });

    return res.status(200).json({
      status: 'success',
      message: 'Appointment cancelled successfully',
      data: {
        appointment: appt,
        patientCancelCount: updatedPatient?.cancelCount,
      },
      collection: collectionName,
    });
  } catch (error) {
    console.error('Cancel appointment error:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to cancel appointment',
      errors: [error.message],
    });
  }
};

router.put(
  '/appointments/:id/cancel',
  authenticate,
  requirePatient,
  [body('reason').optional().isString().trim()],
  validate,
  cancelPatientAppointment
);

router.post(
  '/appointments/:id/cancel',
  authenticate,
  requirePatient,
  [body('reason').optional().isString().trim()],
  validate,
  cancelPatientAppointment
);

module.exports = router;