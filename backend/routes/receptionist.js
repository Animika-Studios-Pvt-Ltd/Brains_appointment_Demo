// backend/routes/receptionist.js
const express = require("express");
const router = express.Router();

const { body, query } = require("express-validator");
const { validate } = require("../middleware/validate");
const ActivityLog = require("../modal/ActivityLog");
const Appointment = require("../modal/Appointment");
const AppointmentTesting = require("../modal/AppointmentTesting");
const Doctor = require("../modal/Doctor");
const Patient = require("../modal/Patient");
const BlockedSlot = require("../modal/BlockedSlot");
const Receptionist = require("../modal/Receptionist");

const googleCalendarService = require("../services/googleCalendar");
const {
  validateAppointmentAvailability,
} = require("../utils/availabilityChecker");

const { authenticate, requireRole } = require("../middleware/authMiddleware");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const notificationService = require("../services/notificationService");
const { runBulkReschedule } = require("../services/bulkRescheduleService");
const {
  rescheduleAppointment,
  runRescheduleBackgroundSync,
  reassignAppointment,
  runReassignBackgroundSync,
} = require("../services/appointmentRescheduleService");
const { updateDoctorAvailability } = require("../services/doctorAvailabilityService");
const { findNextAvailableSlot } = require("../utils/slotFinder");

/** Resolve an appointment from production or mobile testing collection. */
async function findAppointmentAnywhere(id, populate = false) {
  const doPopulate = async (doc) => {
    if (!doc || !populate) return doc;
    return doc.populate([
      { path: "doctorId", select: "name specialization profileImage fees email phone googleCalendar" },
      { path: "patientId", select: "name phone email" },
    ]);
  };

  let appt = await Appointment.findById(id);
  if (appt) {
    appt = await doPopulate(appt);
    return { appt, Model: Appointment };
  }

  appt = await AppointmentTesting.findById(id);
  if (appt) {
    appt = await doPopulate(appt);
    return { appt, Model: AppointmentTesting };
  }

  return null;
}

async function findAppointmentLeanAnywhere(id) {
  const fromProd = await Appointment.findById(id)
    .populate("doctorId")
    .populate("patientId")
    .lean()
    .exec();
  if (fromProd) return { appointment: fromProd, Model: Appointment };

  const fromTest = await AppointmentTesting.findById(id)
    .populate("doctorId")
    .populate("patientId")
    .lean()
    .exec();
  if (fromTest) return { appointment: fromTest, Model: AppointmentTesting };

  return null;
}

// 👇 NEW: upload setup (same upload dir as admin)
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path
      .basename(file.originalname, ext)
      .replace(/\s+/g, "-")
      .toLowerCase();
    cb(null, `${Date.now()}-${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files allowed"), false);
    }
    cb(null, true);
  },
});

// Small helpers
const toRFC3339 = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const overlaps = (aStart, aEnd, bStart, bEnd) => {
  const start1 = new Date(aStart),
    end1 = new Date(aEnd),
    start2 = new Date(bStart),
    end2 = new Date(bEnd);
  return start1 < end2 && start2 < end1;
};

// small helper
function isNoShowStatusText(text) {
  if (!text) return false;
  const raw = String(text).toLowerCase().trim();
  const compact = raw.replace(/\s+/g, "");
  return (
    compact === "noshow" ||
    raw === "no show" ||
    raw === "no-show" ||
    raw === "missed" ||
    raw === "expired"
  );
}

// --- Receptionist logging helpers ---
function getReceptionistContext(req) {
  const id =
    req.user?.id || req.user?.id || req.user?.sub || req.user?.sub || null;

  const email = req.user?.email || req.user?.email || null;

  const name =
    req.user?.name ||
    req.user?.name ||
    req.user?.nickname ||
    req.user?.nickname ||
    null;

  return { id, email, name };
}

const IMPORTANT_ACTIONS = [
  "Book appointment",
  "Check-in appointment",
  "Complete appointment",
  "Update appointment status",
  "Create patient",
  "Block patient",
  "Unblock patient",
  "Reset patient counts",
  "Update own profile",
  "View doctor calendar",
  "Cancel appointment",
  "Reschedule appointment",
  "Login",
  "Logout",
];

// Helper: Format date as IST string
function formatIST(date) {
  return new Date(date).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

async function logReceptionistAction(req, action, extra = {}) {
  const { id, email, name } = getReceptionistContext(req);
  const timestamp = new Date();
  const uType = req.user?.type || req.user?.role || "receptionist";

  console.log(
    `📋 [ACTION LOG] ${formatIST(timestamp)} IST - ${action}`,
    {
      userId: id,
      name,
      email,
      userType: uType,
      ...extra,
    }
  );

  try {
    const { recordActivity } = require("../services/activityLogger");
    await recordActivity({
      userId: id || "system",
      userName: name || email || "User",
      userEmail: email || "unknown",
      userType: uType,
      action: action,
      description: extra.description || action,
      req,
      metadata: extra
    });
  } catch (err) {
    console.warn("⚠️ Failed to save activity log:", err.message);
  }
}

// ---------- Dashboard (simple counts) ----------
router.get(
  "/dashboard",
  authenticate,
  requireRole("receptionist", "admin", "superadmin", "super_admin"),
  async (req, res) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [todayCount, upcomingCount, checkedInCount] = await Promise.all([
        Appointment.countDocuments({
          slotStartIso: { $gte: today, $lt: tomorrow },
          status: { $ne: "Cancelled" },
        }),
        Appointment.countDocuments({
          slotStartIso: { $gt: new Date() },
          status: { $in: ["Scheduled", "In Progress"] },
        }),
        Appointment.countDocuments({ status: "In Progress" }),
      ]);

      logReceptionistAction(req, "View dashboard", {
        todayCount,
        upcomingCount,
        checkedInCount,
      });

      return res.json({
        status: "success",
        data: { todayCount, upcomingCount, checkedInCount },
        message: "Receptionist dashboard",
      });
    } catch (error) {
      console.error("Receptionist dashboard error", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to fetch dashboard",
        errors: [error.message],
      });
    }
  }
);

// GET /receptionist/profile - current receptionist profile
router.get(
  "/profile",
  authenticate,
  requireRole("receptionist", "admin", "superadmin", "super_admin"),
  async (req, res) => {
    try {
      // JWT auth may attach user as req.user or nested; cover both options.
      const userId = req.user?.id || req.user?.id;
      const email = req.user?.email || req.user?.email;

      let query = {};
      if (userId) query._id = userId;
      else if (email) query.email = email;
      else {
        return res.status(400).json({
          status: "error",
          message: "Unable to determine receptionist identity from token",
        });
      }

      const receptionist = await Receptionist.findOne(query).select(
        "-password"
      );

      if (!receptionist) {
        return res.status(404).json({
          status: "error",
          message: "Receptionist profile not found",
        });
      }

      logReceptionistAction(req, "View own profile", {
        receptionistId: receptionist._id,
      });

      return res.json({
        status: "success",
        data: receptionist,
        message: "Receptionist profile fetched",
      });
    } catch (error) {
      console.error("Receptionist profile fetch error:", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to fetch receptionist profile",
        errors: [error.message],
      });
    }
  }
);

// PUT /receptionist/profile - update own profile (name, phone, profileImage)
router.put(
  "/profile",
  authenticate,
  requireRole("receptionist", "admin", "superadmin", "super_admin"),
  upload.single("profileImage"),
  async (req, res) => {
    try {
      const userId = req.user?.id || req.user?.id;
      const email = req.user?.email || req.user?.email;

      let query = {};
      if (userId) query._id = userId;
      else if (email) query.email = email;
      else {
        return res.status(400).json({
          status: "error",
          message: "Unable to determine receptionist identity from token",
        });
      }

      // Only allow safe fields
      const updateData = {};

      if (typeof req.body.name === "string" && req.body.name.trim()) {
        updateData.name = req.body.name.trim();
      }

      if (typeof req.body.phone === "string") {
        updateData.phone = req.body.phone.trim();
      }

      // Image
      if (req.file) {
        updateData.profileImage = `/uploads/${req.file.filename}`;
      }

      // Explicitly block protected fields
      delete req.body.email;
      delete req.body.status;
      delete req.body.isActive;
      delete req.body.suspendedAt;
      delete req.body.suspensionReason;
      delete req.body.userType;
      delete req.body.createdAt;
      delete req.body.updatedAt;

      const receptionist = await Receptionist.findOneAndUpdate(
        query,
        updateData,
        { new: true, runValidators: true }
      ).select("-password");

      if (!receptionist) {
        return res.status(404).json({
          status: "error",
          message: "Receptionist profile not found",
        });
      }

      logReceptionistAction(req, "Update own profile", {
        receptionistId: receptionist._id,
        updatedFields: Object.keys(updateData),
        hasNewImage: !!req.file,
      });

      return res.json({
        status: "success",
        data: receptionist,
        message: "Receptionist profile updated successfully",
      });
    } catch (error) {
      console.error("Receptionist profile update error:", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to update receptionist profile",
        errors: [error.message],
      });
    }
  }
);

// Fetch all doctors (for receptionist)
router.get(
  "/doctors",
  authenticate,
  requireRole("receptionist", "admin", "superadmin", "super_admin"),
  async (req, res) => {
    try {
      const {
        search = "",
        specialization = "",
        city = "",
        page = 1,
        limit = 8,
      } = req.query;

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.max(1, parseInt(limit, 10) || 8);

      const q = {};

      if (specialization) {
        q.specialization = specialization;
      }

      if (search && String(search).trim()) {
        const term = String(search).trim();
        const regex = { $regex: term, $options: "i" };

        q.$or = [
          { name: regex },
          { specialization: regex },
          { qualification: regex },
        ];
      }

      const total = await Doctor.countDocuments(q);

      const doctors = await Doctor.find(q)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .select(
          "name specialization experience fees profileImage googleCalendar.isConnected googleCalendar.connected " +
            "qualification"
        )
        .lean();

      logReceptionistAction(req, "List doctors", {
        search,
        specialization,
        city,
        page: pageNum,
        limit: limitNum,
        total,
        resultCount: doctors.length,
      });

      return res.json({
        status: "success",
        data: {
          doctors,
          pagination: {
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.max(1, Math.ceil(total / limitNum)),
          },
        },
      });
    } catch (err) {
      console.error("Error fetching doctors:", err);
      return res.status(500).json({
        status: "error",
        message: err.message || "Failed to load doctors",
      });
    }
  }
);

// Fetch doctor's calendar(for receptionist to view)
router.get(
  "/doctors/:id",
  authenticate,
  requireRole("receptionist", "admin", "superadmin", "super_admin"),
  async (req, res) => {
    try {
      const doctorId = req.params.id;
      const doctor = await Doctor.findById(doctorId).select(
        "name specialization experience fees profileImage googleCalendar.isConnected googleCalendar.connected " +
          "availabilityMode availabilityRange dailyTimeRanges appointmentDuration customDailySchedule " +
          "qualification"
      );

      if (!doctor) {
        return res.status(404).json({
          status: "error",
          message: "Doctor not found",
        });
      }

      logReceptionistAction(req, "View doctor details", {
        doctorId,
      });

      res.json({
        status: "success",
        data: doctor,
        message: "Doctor fetched successfully",
      });
    } catch (error) {
      console.error("Error fetching doctor for receptionist:", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to fetch doctor",
      });
    }
  }
);

// Fetch doctor's calendar events (for receptionist to view)
router.get(
  "/doctors/:doctorId/calendar",
  authenticate,
  requireRole("receptionist", "admin", "superadmin", "super_admin"),
  async (req, res) => {
    try {
      const { doctorId } = req.params;
      const doctor = await Doctor.findById(doctorId).select(
        "googleCalendar name"
      );

      if (!doctor) {
        return res
          .status(404)
          .json({ status: "error", message: "Doctor not found" });
      }

      if (!doctor.googleCalendar?.isConnected) {
        return res.status(400).json({
          status: "error",
          message:
            "Doctor's calendar is not connected. Please ask the doctor to connect their Google Calendar.",
        });
      }

      // Fetch events from the doctor's work calendar
      const events = await googleCalendarService.getCalendarEvents(
        doctor.googleCalendar,
        {
          timeMin: req.query.timeMin || new Date().toISOString(),
          timeMax:
            req.query.timeMax ||
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // Default: next 30 days
          maxResults: req.query.maxResults || 50,
        },
        doctorId,
        "doctor"
      );

      logReceptionistAction(req, "View doctor calendar", {
        doctorId,
        timeMin: req.query.timeMin || null,
        timeMax: req.query.timeMax || null,
        eventCount: Array.isArray(events) ? events.length : 0,
      });

      res.json({
        status: "success",
        data: {
          doctorName: doctor.name,
          events: events || [],
          workCalendarId: doctor.googleCalendar.workCalendarId,
        },
        message: "Doctor calendar events fetched successfully",
      });
    } catch (error) {
      console.error("Receptionist fetch doctor calendar error:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to fetch doctor calendar",
        errors: [error.message],
      });
    }
  }
);

// Search patients (renamed from /patients/search)
router.get(
  "/patients",
  authenticate,
  requireRole("receptionist", "admin", "superadmin", "super_admin"),
  async (req, res) => {
    try {
      const search = req.query.search || "";
      const regex = new RegExp(search, "i");
      const patients = await Patient.find({
        $or: [{ name: regex }, { phone: regex }, { email: regex }],
      }).limit(100);

      logReceptionistAction(req, "Search patients", {
        search,
        resultCount: patients.length,
      });

      res.json({ status: "success", data: { patients } });
    } catch (err) {
      res.status(500).json({ status: "error", message: err.message });
    }
  }
);

// Create new patient (with duplicate email check)
router.post(
  "/patients",
  authenticate,
  requireRole("receptionist", "admin", "superadmin", "super_admin"),
  async (req, res) => {
    try {
      const { name, email, phone, age, gender, address } = req.body;

      if (!name || !String(name).trim()) {
        return res.status(400).json({
          status: "error",
          message: "Patient name is required.",
        });
      }

      const ageNum = Number(age);
      if (!Number.isFinite(ageNum) || ageNum < 0 || ageNum > 150) {
        return res.status(400).json({
          status: "error",
          message: "A valid age between 0 and 150 is required.",
        });
      }

      const phoneDigits = String(phone || "").replace(/\D/g, "");
      if (phoneDigits.length !== 10) {
        return res.status(400).json({
          status: "error",
          message: "A valid 10-digit mobile number is required.",
        });
      }

      const emailTrimmed = email ? String(email).trim() : "";
      const hasRealEmail = emailTrimmed.length > 0;

      if (hasRealEmail) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailTrimmed)) {
          return res.status(400).json({
            status: "error",
            message: "Please provide a valid email address.",
          });
        }
      }

      const emailLower = hasRealEmail
        ? emailTrimmed.toLowerCase()
        : `walkin.${phoneDigits}@noemail.brainshospital.local`;

      if (hasRealEmail) {
        const emailExists = await Patient.findOne({ email: emailLower });
        if (emailExists) {
          return res.status(200).json({
            status: "warning",
            message: "This email address already exists.",
          });
        }
      }

      const phoneExists = await Patient.findOne({ phone: phoneDigits });
      if (phoneExists) {
        return res.status(200).json({
          status: "warning",
          message: "This mobile number already exists.",
        });
      }

      const fromBody = req.body.password != null ? String(req.body.password).trim() : '';
      let tempPassword = '';
      let hashedPassword = '';
      if (fromBody.length >= 8) {
        hashedPassword = bcrypt.hashSync(fromBody, 10);
      } else {
        tempPassword = crypto.randomBytes(14).toString('base64url').slice(0, 16);
        hashedPassword = bcrypt.hashSync(tempPassword, 10);
      }

      // Create patient only if safe
      const newPatient = await Patient.create({
        name: String(name).trim(),
        email: emailLower,
        password: hashedPassword,
        phone: phoneDigits,
        age: ageNum,
        gender,
        address,
      });

      logReceptionistAction(req, "Create patient", {
        patientId: newPatient._id,
        name: String(name).trim(),
        email: emailLower,
        phone: phoneDigits,
        age: ageNum,
        hasRealEmail,
      });

      if (hasRealEmail) {
        try {
          await notificationService.sendWelcomeEmail({
            name: newPatient.name,
            email: newPatient.email,
            password: tempPassword || fromBody || '',
            role: 'patient',
          });
        } catch (err) {
          console.error('Failed to send welcome email to new patient:', err?.message || err);
        }
      }

      return res.status(201).json({
        status: "success",
        data: { patient: newPatient },
        ...(tempPassword && {
          notice: 'Share this one-time temporary password with the patient.',
          temporaryPassword: tempPassword,
        }),
      });
    } catch (err) {
      // Catch Mongo duplicate just in case (race condition)
      if (err.code === 11000 && err.keyPattern?.email) {
        return res.status(200).json({
          status: "warning",
          message: "This email address already exists.",
        });
      }

      console.error("Create patient error:", err);
      return res.status(500).json({
        status: "error",
        message: "Failed to create patient",
      });
    }
  }
);

// GET /appointments — list all or filtered appointments
router.get(
  "/appointments",
  authenticate,
  requireRole("receptionist", "admin", "superadmin", "super_admin"),
  async (req, res) => {
    try {
      const {
        status,
        date,
        search,
        doctorId,
        page = 1,
        limit = 20,
      } = req.query;
      const q = {};

      if (status) q.status = status;
      if (doctorId) q.doctorId = doctorId;
      if (date) {
        const start = new Date(`${date}T00:00:00.000Z`);
        const end = new Date(`${date}T23:59:59.999Z`);
        q.slotStartIso = { $gte: start, $lte: end };
      }

      if (search) {
        const regex = new RegExp(search, "i");
        q.$or = [
          { reason: regex },
          { "patientId.name": regex },
          { "doctorId.name": regex },
        ];
      }

      const totalProd = await Appointment.countDocuments(q);
      const totalTest = await AppointmentTesting.countDocuments(q);

      const [prodAppts, testAppts] = await Promise.all([
        Appointment.find(q)
          .populate("doctorId", "name")
          .populate("patientId", "name phone email")
          .lean(),
        AppointmentTesting.find(q)
          .populate("doctorId", "name")
          .populate("patientId", "name phone email")
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
      merged.sort(
        (a, b) => new Date(b.slotStartIso || 0) - new Date(a.slotStartIso || 0)
      );

      const pageNum = Number(page) || 1;
      const limitNum = Number(limit) || 20;
      const appointments = merged.slice(
        (pageNum - 1) * limitNum,
        pageNum * limitNum
      );
      const total = totalProd + totalTest;

      logReceptionistAction(req, "List appointments", {
        status,
        date,
        search,
        doctorId,
        page,
        limit,
        total,
        resultCount: appointments.length,
      });

      return res.json({
        status: "success",
        data: { appointments, pagination: { total } },
      });
    } catch (error) {
      console.error("Receptionist appointments fetch error", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to fetch appointments",
        errors: [error.message],
      });
    }
  }
);

router.post(
  "/appointments/book",
  authenticate,
  requireRole("receptionist", "admin", "superadmin", "super_admin", "call_center"),
  async (req, res) => {
    try {
      const {
        doctorId,
        patientId,
        slotStartIso,
        slotEndIso,
        symptoms,
        mode = "offline",
        forceDoubleBook = false,
      } = req.body;

      if (!doctorId || !patientId || !slotStartIso || !slotEndIso) {
        return res
          .status(400)
          .json({ message: "Missing required fields", status: false });
      }

      // Fetch the doctor (critical fix for the 500 error)
      const doctor = await Doctor.findById(doctorId);
      if (!doctor) {
        return res
          .status(404)
          .json({ status: "error", message: "Doctor not found" });
      }

      const isCalendarConnected = doctor.googleCalendar?.isConnected || doctor.googleCalendar?.connected;
      if (!isCalendarConnected) {
        return res.status(400).json({ status: "error", message: "Doctor's calendar is not connected to Google Calendar" });
      }

      // Check for blocked slots (reuse logic from /walkin)
      const blocked = await BlockedSlot.findOne({
        doctorId,
        startTime: { $lt: new Date(slotEndIso) },
        endTime: { $gt: new Date(slotStartIso) },
      });
      if (blocked) {
        return res
          .status(403)
          .json({ status: "error", message: "This time is blocked" });
      }

      // ADD: Check for existing appointments (conflict check) across both collections
      const activeStatuses = ["Scheduled", "In Progress", "Rescheduled", "Reassigned"];
      const [conflictOffline, conflictOnline] = await Promise.all([
        Appointment.findOne({
          doctorId,
          status: { $in: activeStatuses },
          slotStartIso: { $lt: new Date(slotEndIso) },
          slotEndIso: { $gt: new Date(slotStartIso) },
        }),
        AppointmentTesting.findOne({
          doctorId,
          status: { $in: activeStatuses },
          slotStartIso: { $lt: new Date(slotEndIso) },
          slotEndIso: { $gt: new Date(slotStartIso) },
        }),
      ]);
      const conflict = conflictOffline || conflictOnline;
      if (conflict) {
        if (forceDoubleBook === true) {
          // Find next available slot for the conflicting appointment
          const nextSlot = await findNextAvailableSlot(
            doctor,
            doctor.appointmentDuration || doctor.slotDurationMinutes || 30,
            new Date(),
            30,
            [conflict._id]
          );

          if (!nextSlot) {
            return res.status(409).json({
              status: "error",
              message: "Double booking failed: No available slots found to reschedule the previous patient's appointment.",
            });
          }

          // Reschedule previous patient's appointment
          const prevStart = conflict.slotStartIso;
          const prevEnd = conflict.slotEndIso;

          conflict.slotStartIso = nextSlot.start.toISOString();
          conflict.slotEndIso = nextSlot.end.toISOString();
          conflict.date = nextSlot.start.toLocaleDateString("en-CA");
          conflict.time = nextSlot.start.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
          conflict.status = "Rescheduled";
          conflict.rescheduleCount = Number(conflict.rescheduleCount || 0) + 1;
          conflict.rescheduleHistory = Array.isArray(conflict.rescheduleHistory) ? conflict.rescheduleHistory : [];
          conflict.rescheduleHistory.push({
            fromDoctorId: conflict.doctorId,
            toDoctorId: conflict.doctorId,
            fromSlotStartIso: prevStart,
            fromSlotEndIso: prevEnd,
            toSlotStartIso: nextSlot.start.toISOString(),
            toSlotEndIso: nextSlot.end.toISOString(),
            note: "Automatically rescheduled due to receptionist double-booking",
          });

          await conflict.save();

          // Sync rescheduled appointment with Google Calendar
          if (doctor.googleCalendar?.isConnected || doctor.googleCalendar?.accessToken) {
            try {
              const conflictPatient = await Patient.findById(conflict.patientId);
              if (conflict.googleCalendar?.eventId) {
                await googleCalendarService.updateAppointmentEvent(
                  doctor,
                  conflict.googleCalendar.eventId,
                  {
                    appointmentId: conflict._id,
                    slotStartIso: conflict.slotStartIso,
                    slotEndIso: conflict.slotEndIso,
                    status: conflict.status,
                    patientName: conflictPatient?.name || "Patient",
                    patientEmail: conflictPatient?.email,
                  }
                );
              }
            } catch (gcalErr) {
              console.warn("Failed to update rescheduled appointment in GCal (ignored):", gcalErr?.message || gcalErr);
            }
          }

          // Send email notification to rescheduled patient
          try {
            const conflictPatient = await Patient.findById(conflict.patientId);
            await notificationService.sendAppointmentRescheduledEmail({
              appointment: conflict,
              doctor,
              patient: conflictPatient,
              who: req.user?.name || "Hospital Staff",
            });
          } catch (emailErr) {
            console.warn("Failed to send reschedule notification email:", emailErr?.message || emailErr);
          }
        } else {
          return res
            .status(409)
            .json({ status: "error", message: "Slot already booked", hasConflict: true });
        }
      }

      // Convert ISO to readable date/time if needed
      const slotStartDate = new Date(slotStartIso);
      const date = slotStartDate.toLocaleDateString("en-CA");
      const time = slotStartDate.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      let bookedByVal = "receptionist";
      const userRole = String(req.user?.role || req.user?.type || "").toLowerCase();
      if (userRole === "admin" || userRole === "super_admin" || userRole === "superadmin") {
        bookedByVal = "admin";
      } else if (userRole === "call_center" || userRole === "callcenter") {
        bookedByVal = "call center";
      }

      const appointment = await Appointment.create({
        doctorId,
        patientId,
        slotStartIso,
        slotEndIso,
        date,
        time,
        symptoms: symptoms || "",
        mode,
        bookedBy: bookedByVal,
        status: "Scheduled", // Standardized status
      });

      // FIX: Now 'doctor' is defined, so Google Calendar sync works
      if (
        doctor.googleCalendar?.isConnected ||
        doctor.googleCalendar?.accessToken
      ) {
        try {
          const patient = await Patient.findById(patientId); // Fetch patient for event details
          const resCal = await googleCalendarService.createAppointmentEvent(
            doctor,
            patient,
            {
              appointmentId: appointment._id,
              symptoms,
              slotStartIso: toRFC3339(slotStartIso),
              slotEndIso: toRFC3339(slotEndIso),
            }
          );
          if (resCal?.success) {
            appointment.googleCalendar = {
              eventId: resCal.eventId,
              eventLink: resCal.eventLink,
              synced: true,
              lastSyncedAt: new Date(),
            };
            await appointment.save();
          } else {
            // Log error but don't fail booking (best-effort sync)
            console.warn(
              "Calendar sync failed for receptionist booking:",
              resCal?.error
            );
            appointment.googleCalendar = {
              synced: false,
              syncError: resCal?.error,
              lastSyncedAt: new Date(),
            };
            await appointment.save();
          }
        } catch (e) {
          console.warn("Calendar sync error (ignored):", e?.message || e);
        }
      }

      logReceptionistAction(req, "Book appointment", {
        appointmentId: appointment._id,
        doctorId,
        patientId,
        slotStartIso,
        slotEndIso,
        mode,
      });

      return res.status(201).json({
        status: "success", // Standardized response format
        message: "Appointment booked successfully",
        data: { appointment },
      });
    } catch (error) {
      console.error("❌ Error booking appointment:", error);
      return res.status(500).json({
        status: "error",
        message: "Error booking appointment",
        error: error.message,
      });
    }
  }
);

// Mark as checked-in (In Progress)
router.patch(
  "/appointments/:id/checkin",
  authenticate,
  requireRole("receptionist", "admin", "superadmin", "super_admin"),
  async (req, res) => {
    try {
      const apptId = req.params.id;
      const found = await findAppointmentAnywhere(apptId);
      if (!found) {
        return res
          .status(404)
          .json({ status: "error", message: "Appointment not found" });
      }
      const { appt, Model } = found;

      const prevStatus = appt.status;
      const statusLower = String(appt.status || "").toLowerCase();

      // Block for cancelled / completed
      if (statusLower === "cancelled") {
        return res.status(400).json({
          status: "error",
          message: "Cannot check-in a cancelled appointment",
        });
      }

      if (statusLower === "completed") {
        return res
          .status(400)
          .json({ status: "error", message: "Appointment already completed" });
      }

      const wasMissedOnCheckin = isNoShowStatusText(prevStatus);

      appt.status = "In Progress";
      appt.checkedInAt = new Date();
      await appt.save();

      if (wasMissedOnCheckin && appt.patientId) {
        try {
          await Patient.findOneAndUpdate(
            { _id: appt.patientId, noShowCount: { $gt: 0 } },
            { $inc: { noShowCount: -1 } }
          );
        } catch (err) {
          console.warn(
            "Non-fatal: failed to decrement patient noShowCount on checkin:",
            err?.message || err
          );
        }
      }

      // after appt.save() in check-in / complete / status / cancel handlers
      const leanFound = await findAppointmentLeanAnywhere(apptId);
      const appointmentForSync = leanFound?.appointment || null;

      process.nextTick(async () => {
        try {
          if (!appointmentForSync) return;
          const doctorDoc = appointmentForSync.doctorId;
          if (!doctorDoc) return;

          const eventId = appointmentForSync.googleCalendar?.eventId || null;

          if (
            appointmentForSync.status &&
            String(appointmentForSync.status).toLowerCase().includes("cancel")
          ) {
            if (eventId) {
              await googleCalendarService.deleteAppointmentEvent(
                doctorDoc,
                eventId,
                { sendUpdates: "all" }
              );
            } else {
              await googleCalendarService.createAppointmentEvent(
                doctorDoc,
                appointmentForSync.patientId,
                appointmentForSync
              );
            }
          } else {
            const syncRes = eventId
              ? await googleCalendarService.updateAppointmentEvent(
                  doctorDoc,
                  eventId,
                  appointmentForSync
                )
              : await googleCalendarService.createAppointmentEvent(
                  doctorDoc,
                  appointmentForSync.patientId,
                  appointmentForSync
                );

            if (syncRes && syncRes.success && syncRes.eventId) {
              try {
                await Model.findByIdAndUpdate(
                  apptId,
                  { "googleCalendar.eventId": syncRes.eventId },
                  { new: true }
                ).exec();
              } catch (e) {
                console.warn(
                  "Failed to persist eventId to appointment:",
                  e?.message || e
                );
              }
            }
          }
        } catch (err) {
          console.error(
            "Background Google Calendar sync failed (receptionist checkin):",
            err?.message || err
          );
        }
      });

      // populate for response similar to other endpoints
      const populated = await Model.findById(apptId)
        .populate("doctorId", "name")
        .populate("patientId", "name phone email");

      logReceptionistAction(req, "Check-in appointment", {
        appointmentId: apptId,
        previousStatus: prevStatus,
        newStatus: appt.status,
      });

      return res.json({
        status: "success",
        message: "Checked in",
        data: { appointment: populated },
      });
    } catch (err) {
      console.error("Checkin error:", err);
      return res.status(500).json({
        status: "error",
        message: "Failed to check-in",
        errors: [err.message],
      });
    }
  }
);

// Mark as completed
router.patch(
  "/appointments/:id/complete",
  authenticate,
  requireRole("receptionist", "admin", "superadmin", "super_admin"),
  async (req, res) => {
    try {
      const apptId = req.params.id;
      const found = await findAppointmentAnywhere(apptId);
      if (!found) {
        return res
          .status(404)
          .json({ status: "error", message: "Appointment not found" });
      }
      const { appt, Model } = found;

      const prevStatus = appt.status;
      const statusLower = String(appt.status || "").toLowerCase();
      // Block for cancelled / completed
      if (statusLower === "cancelled") {
        return res.status(400).json({
          status: "error",
          message: "Cannot complete a cancelled appointment",
        });
      }

      if (statusLower === "completed") {
        return res
          .status(400)
          .json({ status: "error", message: "Appointment already completed" });
      }

      const wasMissedOnComplete = isNoShowStatusText(prevStatus);

      appt.status = "Completed";
      appt.completedAt = new Date();
      await appt.save();

      if (wasMissedOnComplete && appt.patientId) {
        try {
          await Patient.findOneAndUpdate(
            { _id: appt.patientId, noShowCount: { $gt: 0 } },
            { $inc: { noShowCount: -1 } }
          );
        } catch (err) {
          console.warn(
            "Non-fatal: failed to decrement patient noShowCount on complete:",
            err?.message || err
          );
        }
      }
      // after appt.save() in check-in / complete / status / cancel handlers
      const leanFound = await findAppointmentLeanAnywhere(apptId);
      const appointmentForSync = leanFound?.appointment || null;

      process.nextTick(async () => {
        try {
          if (!appointmentForSync) return;
          const doctorDoc = appointmentForSync.doctorId;
          if (!doctorDoc) return;
          const eventId = appointmentForSync.googleCalendar?.eventId || null;

          if (
            appointmentForSync.status &&
            String(appointmentForSync.status).toLowerCase().includes("cancel")
          ) {
            if (eventId) {
              await googleCalendarService.deleteAppointmentEvent(
                doctorDoc,
                eventId,
                { sendUpdates: "all" }
              );
            } else {
              await googleCalendarService.createAppointmentEvent(
                doctorDoc,
                appointmentForSync.patientId,
                appointmentForSync
              );
            }
          } else {
            const syncRes = eventId
              ? await googleCalendarService.updateAppointmentEvent(
                  doctorDoc,
                  eventId,
                  appointmentForSync
                )
              : await googleCalendarService.createAppointmentEvent(
                  doctorDoc,
                  appointmentForSync.patientId,
                  appointmentForSync
                );

            if (syncRes && syncRes.success && syncRes.eventId) {
              try {
                await Model.findByIdAndUpdate(
                  apptId,
                  { "googleCalendar.eventId": syncRes.eventId },
                  { new: true }
                ).exec();
              } catch (e) {
                console.warn(
                  "Failed to persist eventId to appointment:",
                  e?.message || e
                );
              }
            }
          }
        } catch (err) {
          console.error(
            "Background Google Calendar sync failed (receptionist complete):",
            err?.message || err
          );
        }
      });

      const populated = await Model.findById(apptId)
        .populate("doctorId", "name")
        .populate("patientId", "name phone email");

      logReceptionistAction(req, "Complete appointment", {
        appointmentId: apptId,
        previousStatus: prevStatus,
        newStatus: appt.status,
      });

      return res.json({
        status: "success",
        message: "Marked completed",
        data: { appointment: populated },
      });
    } catch (err) {
      console.error("Complete error:", err);
      return res.status(500).json({
        status: "error",
        message: "Failed to complete appointment",
        errors: [err.message],
      });
    }
  }
);

// Generic status patch (used by receptionist frontend fallback)
router.patch(
  "/appointments/:id/status",
  authenticate,
  requireRole("receptionist", "admin", "superadmin", "super_admin"),
  async (req, res) => {
    try {
      const apptId = req.params.id;
      const { status } = req.body;

      if (!status) {
        return res.status(400).json({
          status: "error",
          message: "Missing status in body",
        });
      }

      const found = await findAppointmentAnywhere(apptId);
      if (!found) {
        return res.status(404).json({
          status: "error",
          message: "Appointment not found",
        });
      }
      const { appt, Model } = found;

      const prevStatus = appt.status || "";
      const wasNoShow = isNoShowStatusText(prevStatus);

      const lower = String(status).trim().toLowerCase();
      let becameNoShow = false;

      if (lower === "cancelled") {
        appt.status = "Cancelled";
        appt.cancelledAt = new Date();
        appt.completedAt = null;
      } else if (
        lower === "in progress" ||
        lower === "in-progress" ||
        lower === "inprogress" ||
        lower === "check-in" ||
        lower === "checked-in"
      ) {
        appt.status = "In Progress";
        appt.checkedInAt = new Date();
        appt.completedAt = null;
      } else if (lower === "completed" || lower === "comp") {
        appt.status = "Completed";
        appt.completedAt = new Date();
      } else if (lower === "scheduled") {
        appt.status = "Scheduled";
        appt.completedAt = null;
      } else if (lower === "rescheduled" || lower === "reschedule") {
        appt.status = "Rescheduled";
        appt.completedAt = null;
      } else if (
        lower === "no show" ||
        lower === "noshow" ||
        lower === "no-show" ||
        lower === "missed" ||
        lower === "expired"
      ) {
        appt.status = "Missed";
        appt.completedAt = null;

        if (!wasNoShow) {
          becameNoShow = true;
        }
      } else {
        appt.status = status;
      }

      await appt.save();

      const leanFound = await findAppointmentLeanAnywhere(apptId);
      const appointmentForSync = leanFound?.appointment || null;

      process.nextTick(async () => {
        try {
          if (!appointmentForSync) return;
          const doctorDoc = appointmentForSync.doctorId;
          if (!doctorDoc) return;

          const eventId = appointmentForSync.googleCalendar?.eventId || null;

          if (
            appointmentForSync.status &&
            String(appointmentForSync.status).toLowerCase().includes("cancel")
          ) {
            if (eventId) {
              await googleCalendarService.deleteAppointmentEvent(
                doctorDoc,
                eventId,
                { sendUpdates: "all" }
              );
            } else {
              await googleCalendarService.createAppointmentEvent(
                doctorDoc,
                appointmentForSync.patientId,
                appointmentForSync
              );
            }
          } else {
            const syncRes = eventId
              ? await googleCalendarService.updateAppointmentEvent(
                  doctorDoc,
                  eventId,
                  appointmentForSync
                )
              : await googleCalendarService.createAppointmentEvent(
                  doctorDoc,
                  appointmentForSync.patientId,
                  appointmentForSync
                );

            if (syncRes && syncRes.success && syncRes.eventId) {
              try {
                await Model.findByIdAndUpdate(
                  apptId,
                  { "googleCalendar.eventId": syncRes.eventId },
                  { new: true }
                ).exec();
              } catch (e) {
                console.warn(
                  "Failed to persist eventId to appointment:",
                  e?.message || e
                );
              }
            }
          }
        } catch (err) {
          console.error(
            "Background Google Calendar sync failed (receptionist status):",
            err?.message || err
          );
        }
      });

      // If we transitioned to No Show, increment patient's noShowCount
      if (becameNoShow && appt.patientId) {
        try {
          await Patient.findByIdAndUpdate(appt.patientId, {
            $inc: { noShowCount: 1 },
          });
        } catch (err) {
          console.warn(
            "Non-fatal: failed to increment patient noShowCount:",
            err?.message || err
          );
        }
      } else if (wasNoShow && !becameNoShow && appt.patientId) {
        try {
          await Patient.findOneAndUpdate(
            { _id: appt.patientId, noShowCount: { $gt: 0 } },
            { $inc: { noShowCount: -1 } }
          );
        } catch (err) {
          console.warn(
            "Non-fatal: failed to decrement patient noShowCount:",
            err?.message || err
          );
        }
      }

      const populated = await Model.findById(apptId)
        .populate("doctorId", "name")
        .populate("patientId", "name phone email");

      logReceptionistAction(req, "Update appointment status", {
        appointmentId: apptId,
        previousStatus: prevStatus,
        newStatus: appt.status,
        requestedStatusRaw: status,
        becameNoShow,
      });

      return res.json({
        status: "success",
        message: "Status updated",
        data: { appointment: populated },
      });
    } catch (err) {
      console.error("Status update error:", err);
      return res.status(500).json({
        status: "error",
        message: "Failed to update status",
        errors: [err.message],
      });
    }
  }
);

// Reschedule appointment (call center / receptionist dashboard)
router.put(
  "/appointments/:id/reschedule",
  authenticate,
  requireRole("receptionist", "call_center", "admin", "superadmin", "super_admin"),
  [
    body("slotStartIso").isISO8601(),
    body("slotEndIso").isISO8601(),
    body("date").isISO8601(),
    body("symptoms").optional().isString(),
    body("note").optional().isString(),
  ],
  validate,
  async (req, res) => {
    try {
      const { slotStartIso, slotEndIso, date, symptoms, note } = req.body;
      const result = await rescheduleAppointment({
        apptId: req.params.id,
        slotStartIso,
        slotEndIso,
        date,
        symptoms,
        note,
        user: req.user,
      });

      const { appt, doctor, role } = result;

      logReceptionistAction(req, "Reschedule appointment", {
        appointmentId: req.params.id,
        newSlotStart: slotStartIso,
        newSlotEnd: slotEndIso,
      });

      res.status(200).json({
        status: "success",
        message: "Appointment rescheduled successfully",
        data: appt,
      });

      runRescheduleBackgroundSync({ appt, doctor, role });
    } catch (error) {
      console.error("Receptionist reschedule error:", error);
      if (error.statusCode) {
        return res.status(error.statusCode).json(
          error.payload || { status: "error", message: error.message }
        );
      }
      return res.status(500).json({
        status: "error",
        message: error.message || "Reschedule failed",
        errors: [error.message],
      });
    }
  }
);

// Reassign appointment to another doctor (call center / receptionist dashboard)
router.patch(
  "/appointments/:id/reassign",
  authenticate,
  requireRole("receptionist", "call_center", "admin", "superadmin", "super_admin"),
  [
    body("newDoctorId").isMongoId(),
    body("slotStartIso").optional().isISO8601(),
    body("slotEndIso").optional().isISO8601(),
    body("date").optional().isISO8601(),
    body("note").optional().isString(),
  ],
  validate,
  async (req, res) => {
    try {
      const { newDoctorId, slotStartIso, slotEndIso, date, note } = req.body;
      const result = await reassignAppointment({
        apptId: req.params.id,
        newDoctorId,
        slotStartIso,
        slotEndIso,
        date,
        note,
        user: req.user,
      });

      const { appt, oldDoctor, newDoctor, oldEventId } = result;

      logReceptionistAction(req, "Reassign appointment", {
        appointmentId: req.params.id,
        newDoctorId,
        newSlotStart: slotStartIso,
      });

      res.status(200).json({
        status: "success",
        message: "Appointment reassigned",
        data: appt,
      });

      runReassignBackgroundSync({ appt, oldDoctor, newDoctor, oldEventId });
    } catch (error) {
      console.error("Receptionist reassign error:", error);
      if (error.statusCode) {
        return res.status(error.statusCode).json({ status: "error", message: error.message });
      }
      return res.status(500).json({
        status: "error",
        message: "Reassign failed",
        errors: [error.message],
      });
    }
  }
);

// Update doctor availability (receptionist / call center / admin)
router.put(
  "/doctors/:doctorId/availability",
  authenticate,
  requireRole("receptionist", "call_center", "admin", "superadmin", "super_admin"),
  (req, res) => updateDoctorAvailability(req, res, req.params.doctorId)
);

// Bulk reschedule appointments on a given source date
router.post(
  "/appointments/bulk-reschedule",
  authenticate,
  requireRole("receptionist", "admin", "superadmin", "super_admin"),
  [
    body("sourceDate").isISO8601().withMessage("sourceDate is required (YYYY-MM-DD)"),
    body("mode").optional().isIn(["shift", "target", "auto"]),
    body("shiftDays").optional().isInt({ min: 1, max: 90 }),
    body("targetDate").optional().isISO8601(),
    body("doctorIds").optional().isArray(),
    body("note").optional().isString().trim(),
    body("dryRun").optional().isBoolean(),
    body("sendNotifications").optional().isBoolean(),
  ],
  validate,
  async (req, res) => {
    try {
      const {
        sourceDate,
        mode = "shift",
        shiftDays = 1,
        targetDate = null,
        doctorIds = [],
        note = "",
        dryRun = false,
        sendNotifications = true,
      } = req.body;

      const sourceDay = String(sourceDate).slice(0, 10);
      const todayIst = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      if (sourceDay < todayIst) {
        return res.status(400).json({
          status: "error",
          message: "Cannot bulk reschedule appointments on a past date.",
        });
      }

      if (mode === "target" && !targetDate) {
        return res.status(400).json({
          status: "error",
          message: "targetDate is required when mode is target.",
        });
      }

      const callerId = req.user._id || req.user.id;
      const callerRole = req.user.type || req.user.role || "receptionist";

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

      logReceptionistAction(req, dryRun ? "Preview bulk reschedule" : "Bulk reschedule appointments", {
        sourceDate: sourceDay,
        mode,
        shiftDays,
        targetDate,
        doctorCount: doctorIds?.length || 0,
        total: summary.total,
        rescheduled: summary.rescheduled,
        failed: summary.failed,
        dryRun: !!dryRun,
      });

      return res.json({
        status: "success",
        message: dryRun
          ? `Preview: ${summary.rescheduled} of ${summary.total} appointment(s) can be rescheduled`
          : `Bulk reschedule completed: ${summary.rescheduled} rescheduled, ${summary.failed} failed`,
        data: summary,
      });
    } catch (err) {
      console.error("Bulk reschedule error:", err);
      return res.status(500).json({
        status: "error",
        message: err.message || "Bulk reschedule failed",
      });
    }
  }
);

// GET /api/receptionist/activity-logs - View own activity history
router.get(
  "/activity-logs",
  authenticate,
  requireRole("receptionist", "call_center", "admin", "superadmin", "super_admin"),
  async (req, res) => {
    try {
      const userId = String(req.user?.id || req.user?._id || "");
      if (!userId) {
        return res.status(401).json({
          status: "error",
          message: "Unauthorized",
        });
      }

      const { limit = 50, page = 1 } = req.query;

      const limitNum = Math.min(parseInt(limit, 10) || 50, 200);
      const pageNum = Math.max(1, parseInt(page, 10) || 1);

      // Hide auth events from the in-dashboard activity feed
      const query = {
        userId,
        action: { $not: /login|logout/i },
      };

      const total = await ActivityLog.countDocuments(query);
      const logs = await ActivityLog.find(query)
        .sort({ timestamp: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .select("userName userEmail userType action description timestamp timestampIST metadata")
        .lean();

      return res.json({
        status: "success",
        data: {
          logs,
          pagination: {
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum) || 1,
          },
        },
      });
    } catch (error) {
      console.error("Failed to fetch activity logs:", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to fetch activity logs",
      });
    }
  }
);

module.exports = router;
