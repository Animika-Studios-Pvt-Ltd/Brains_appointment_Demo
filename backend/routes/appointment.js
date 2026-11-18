const express = require("express");
const router = express.Router();

const Appointment = require("../modal/Appointment");
const AppointmentTesting = require("../modal/AppointmentTesting");
const Doctor = require("../modal/Doctor");
const Patient = require("../modal/Patient");
const BlockedSlot = require("../modal/BlockedSlot");
const SystemSetting = require("../modal/SystemSetting");
const { verifyTurnstile } = require("../middleware/turnstile");
const jwt = require("jsonwebtoken");

const { authenticate, requireRole } = require('../middleware/authMiddleware');
const { query, body } = require("express-validator");
const { validate } = require("../middleware/validate");

const googleCalendarService = require("../services/googleCalendar");
const notificationService = require("../services/notificationService"); // ✉️ NEW
const {
  rescheduleAppointment,
  runRescheduleBackgroundSync,
  reassignAppointment,
  runReassignBackgroundSync,
} = require("../services/appointmentRescheduleService");
const {
  validateAppointmentAvailability,
  isSlotStartBookableByTime,
} = require("../utils/availabilityChecker");
const { isDoctorCalendarConnected } = require("../utils/calendarConnection");
const { param } = require("express-validator");
const {
  normalizeEmail,
  phonesMatch,
  signRescheduleAccessToken,
  signCancelAccessToken,
  verifyRescheduleAccessToken,
  verifyCancelAccessToken,
  issueGuestAppointmentTokens,
  buildReschedulePageUrl,
  buildCancelPageUrl,
} = require("../utils/rescheduleAccess");
const {
  findOrCreateGuestPatient,
  assertGuestPatientCanBook,
} = require("../utils/guestPatient");

const RESCHEDULABLE_STATUSES = ["Scheduled", "In Progress", "Rescheduled", "Reassigned"];
const PATIENT_CANCEL_LIMIT = 3;
const PATIENT_RESCHEDULE_LIMIT = 3;
const PATIENT_NO_SHOW_LIMIT = 3;

function serializeRescheduleDoctor(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    name: doc.name,
    specialization: doc.specialization,
    profileImage: doc.profileImage,
    availabilityRange: doc.availabilityRange,
    slotDurationMinutes: doc.slotDurationMinutes,
  };
}

function serializeRescheduleAppointment(appt) {
  if (!appt) return null;
  return {
    _id: appt._id,
    date: appt.date,
    slotStartIso: appt.slotStartIso,
    slotEndIso: appt.slotEndIso,
    symptoms: appt.symptoms,
    status: appt.status,
    rescheduleCount: appt.rescheduleCount || 0,
  };
}

async function authorizeGuestAppointmentAccess(req, appointmentId, purpose) {
  const queryToken = req.query.token || req.body?.token;
  const verifyFn =
    purpose === "cancel" ? verifyCancelAccessToken : verifyRescheduleAccessToken;

  if (queryToken) {
    try {
      const decoded = verifyFn(queryToken);
      if (String(decoded.appointmentId) !== String(appointmentId)) {
        return { ok: false, status: 403, message: "Token does not match this appointment" };
      }
      const appt = await Appointment.findById(appointmentId).populate("patientId");
      if (!appt) {
        return { ok: false, status: 404, message: "Appointment not found" };
      }
      const patientEmail = normalizeEmail(appt.patientId?.email);
      if (patientEmail && decoded.email !== patientEmail) {
        return { ok: false, status: 403, message: "Invalid appointment link" };
      }
      return { ok: true, appt, role: "guest", callerId: appt.patientId?._id };
    } catch {
      return { ok: false, status: 401, message: "Invalid or expired link" };
    }
  }

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const appt = await Appointment.findById(appointmentId).populate("patientId");
      if (!appt) {
        return { ok: false, status: 404, message: "Appointment not found" };
      }
      const role = decoded.type || decoded.role;
      const callerId = decoded.id || decoded._id;
      if (role === "patient" && String(appt.patientId?._id) !== String(callerId)) {
        return { ok: false, status: 403, message: "Unauthorized" };
      }
      if (!["patient", "admin", "super_admin", "receptionist", "call_center"].includes(role)) {
        return { ok: false, status: 403, message: "Unauthorized" };
      }
      return { ok: true, appt, role, callerId };
    } catch {
      return { ok: false, status: 401, message: "Authentication required" };
    }
  }

  return { ok: false, status: 401, message: "Appointment link or login required" };
}

async function authorizeRescheduleAccess(req, appointmentId) {
  return authorizeGuestAppointmentAccess(req, appointmentId, "reschedule");
}

async function authorizeCancelAccess(req, appointmentId) {
  return authorizeGuestAppointmentAccess(req, appointmentId, "cancel");
}

// ⚠️ TEMPORARY DEBUG ROUTE - Remove after fixing
router.get('/debug/auth-test', authenticate, (req, res) => {
  res.json({
    success: true,
    message: 'Authentication working!',
    user: req.user,
    auth: req.user,
    canBook: req.user?.type === 'patient',
    timestamp: new Date().toISOString()
  });
});


// ---------- Small helpers ----------
const toRFC3339 = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const overlaps = (aStart, aEnd, bStart, bEnd) => {
  const start1 = new Date(aStart);
  const end1 = new Date(aEnd);
  const start2 = new Date(bStart);
  const end2 = new Date(bEnd);
  return start1 < end2 && start2 < end1;
};

// ---------- Timezone helpers (force everything to IST, independent of server TZ) ----------
const IST_OFFSET_MINUTES = 5 * 60 + 30;
const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000;

// Parse "YYYY-MM-DD" -> { y, m, d } or null
function parseYmd(ymd) {
  if (!ymd) return null;
  const [y, m, d] = String(ymd).split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

/**
 * Normalize availabilityRange start/end (Mongo Date, ISO string, or YYYY-MM-DD)
 * to IST calendar parts — must match availabilityChecker / booking validation.
 */
function availabilityYmdParts(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const ist = new Date(value.getTime() + IST_OFFSET_MS);
    return {
      y: ist.getUTCFullYear(),
      m: ist.getUTCMonth() + 1,
      d: ist.getUTCDate(),
    };
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return parseYmd(trimmed);
    const dt = new Date(trimmed);
    if (!Number.isNaN(dt.getTime())) {
      const ist = new Date(dt.getTime() + IST_OFFSET_MS);
      return {
        y: ist.getUTCFullYear(),
        m: ist.getUTCMonth() + 1,
        d: ist.getUTCDate(),
      };
    }
    const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  }
  return null;
}

// Build a Date representing that local IST time as an instant in UTC
function makeIstDateFromParts(
  y,
  m,
  d,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0
) {
  const utcMs = Date.UTC(y, m - 1, d, hour, minute, second, ms);
  // Local IST time = UTC + 5:30 → UTC = local - 5:30
  return new Date(utcMs - IST_OFFSET_MS);
}

function intersectInterval(aStart, aEnd, bStart, bEnd) {
  const start = new Date(Math.max(aStart.getTime(), bStart.getTime()));
  const end = new Date(Math.min(aEnd.getTime(), bEnd.getTime()));
  if (start >= end) return null;
  return { start, end };
}

function checkIsStaffRequest(req) {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      console.log("checkIsStaffRequest: No Bearer token in headers");
      return false;
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const role = String(decoded.role || decoded.type || decoded.userType || '').toLowerCase().replace(/[\s_-]/g, "");
    console.log("checkIsStaffRequest: Decoded token role is:", role);
    const isStaff = ["admin", "superadmin", "receptionist", "callcenter"].includes(role);
    console.log("checkIsStaffRequest: isStaff =", isStaff);
    return isStaff;
  } catch (e) {
    console.error("checkIsStaffRequest validation error:", e.message);
    return false;
  }
}

// ---------- Admin listing ----------
router.get(
  "/list",
  authenticate,
  requireRole("admin", "super_admin", "receptionist"),
  [
    query("doctorId").optional().isMongoId().withMessage("doctorId must be a valid id"),
    query("status").optional().isString().withMessage("status must be a string or comma-separated list"),
    query("startDate").optional().isISO8601().withMessage("startDate must be a valid ISO8601 date string"),
    query("endDate").optional().isISO8601().withMessage("endDate must be a valid ISO8601 date string"),
    query("page").optional().toInt(),
    query("limit").optional().toInt(),
  ],
  validate,
  async (req, res) => {
    try {
      const { doctorId, status, startDate, endDate } = req.query;
      const page = Math.max(1, parseInt(req.query.page || "1", 10));
      const limit = Math.min(10000, parseInt(req.query.limit || "10000", 10));
      const skip = (page - 1) * limit;

      const filter = {};
      if (doctorId) filter.doctorId = doctorId;
      if (status) {
        const statuses = String(status).split(",").map(s => s.trim()).filter(Boolean);
        if (statuses.length) filter.status = { $in: statuses };
      }

      if (startDate || endDate) {
        filter.slotStartIso = {};
        if (startDate) filter.slotStartIso.$gte = new Date(startDate);
        if (endDate) filter.slotStartIso.$lte = new Date(endDate);
      }

      const [appointments, total] = await Promise.all([
        Appointment.find(filter)
          .populate("patientId", "name email phone dob age profileImage")
          .populate("doctorId", "name fees phone specialization profileImage")
          .sort({ slotStartIso: -1, slotEndIso: -1 })
          .skip(skip)
          .limit(limit),
        Appointment.countDocuments(filter),
      ]);

      return res.status(200).json({
        status: "success",
        data: {
          appointments,
          meta: { total, page, limit, pages: Math.ceil(total / limit) },
        },
        message: "Appointments fetched successfully",
      });
    } catch (error) {
      console.error("Admin appointment list error", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to fetch appointments",
        errors: [error.message],
      });
    }
  }
);

// ---------- Doctor appointments ----------
router.get(
  "/doctor",
  authenticate,
  requireRole("doctor"),
  [
    query("status").optional().isArray().withMessage("Status can be an array"),
    query("status.*").optional().isString().withMessage("Each status must be a string"),
  ],
  validate,
  async (req, res) => {
    try {
      const { status } = req.query;
      const filter = { doctorId: req.user.id };
      if (status) filter.status = { $in: Array.isArray(status) ? status : [status] };

      const appointment = await Appointment.find(filter)
        .populate("patientId", "name email phone dob age profileImage")
        .populate("doctorId", "name fees phone specialization profileImage")
        .sort({ slotStartIso: 1, slotEndIso: 1 });

      return res.status(200).json({
        status: 'success',
        data: appointment,
        message: 'Appointment fetched successfully'
      });
    } catch (error) {
      console.error("Doctor appointment fetch error", error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to fetch appointment',
        errors: [error.message],
      });
    }
  }
);

// ---------- Patient appointments ----------
router.get(
  "/patient",
  authenticate,
  requireRole("patient"),
  [
    query("status").optional().isArray().withMessage("Status can be an array"),
    query("status.*").optional().isString().withMessage("Each status must be a string"),
  ],
  validate,
  async (req, res) => {
    try {
      const { status } = req.query;

      // ✅ FIX: Changed from req.auth.id to req.user._id
      const filter = { patientId: req.user._id || req.user.id };

      console.log('📋 Fetching appointments for patient:', req.user.email, 'ID:', req.user._id);

      if (status) filter.status = { $in: Array.isArray(status) ? status : [status] };

      const appointment = await Appointment.find(filter)
        .populate("doctorId", "name fees phone specialization profileImage")
        .populate("patientId", "name email profileImage")
        .sort({ slotStartIso: 1, slotEndIso: 1 });

      console.log('✅ Found', appointment.length, 'appointments for patient');

      return res.status(200).json({
        status: 'success',
        data: appointment,
        message: 'Appointment fetched successfully'
      });
    } catch (error) {
      console.error("❌ Patient appointment fetch error", error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to fetch appointment',
        errors: [error.message],
      });
    }
  }
);

// ---------- Booked slots for a day (IST-aware) ----------
router.get("/booked-slots/:doctorId/:date", async (req, res) => {
  try {
    const { doctorId, date } = req.params;

    const parts = parseYmd(date);
    if (!parts) {
      return res.status(400).json({
        status: "error",
        message: "Invalid date format. Expected YYYY-MM-DD",
      });
    }
    const { y, m, d } = parts;

    // 00:00–23:59.999 of that day in IST, expressed as UTC instants
    const startDay = makeIstDateFromParts(y, m, d, 0, 0, 0, 0);
    const endOfDay = makeIstDateFromParts(y, m, d, 23, 59, 59, 999);

    const activeStatuses = ["Scheduled", "In Progress", "Rescheduled", "Reassigned"];
    const [offlineAppts, onlineAppts] = await Promise.all([
      Appointment.find({
        doctorId,
        slotStartIso: { $gte: startDay, $lte: endOfDay },
        status: { $in: activeStatuses },
      }).select("slotStartIso slotEndIso"),
      AppointmentTesting.find({
        doctorId,
        slotStartIso: { $gte: startDay, $lte: endOfDay },
        status: { $in: activeStatuses },
      }).select("slotStartIso slotEndIso"),
    ]);

    const bookedSlots = [...offlineAppts, ...onlineAppts].map((a) => ({
      start: new Date(a.slotStartIso).toISOString(),
      end: new Date(a.slotEndIso).toISOString(),
    }));

    return res.status(200).json({
      status: "success",
      data: bookedSlots,
      message: "Booked slot retrieved",
    });
  } catch (error) {
    console.error("Booked-slots error:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to fetch booked slot",
      errors: [error.message],
    });
  }
});


// ---------- Available slots for a day (IST-aware) ----------
router.get("/available-slots/:doctorId/:date", async (req, res) => {
  try {
    const { doctorId, date } = req.params;

    const parts = parseYmd(date);
    if (!parts) {
      return res.status(400).json({
        status: "error",
        message: "Invalid date format. Expected YYYY-MM-DD",
      });
    }
    const { y, m, d } = parts;

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res
        .status(404)
        .json({ status: "error", message: "Doctor not found" });
    }

    const setting = await SystemSetting.findOne({ key: "onlineBookingLive" });
    const onlineBookingLive = setting ? setting.value === true : true;
    if (!onlineBookingLive) {
      doctor.dailyTimeRanges = (doctor.dailyTimeRanges || []).filter(r => !r.isOnline);
    }

    const isCalendarConnected = isDoctorCalendarConnected(doctor);
    if (!isCalendarConnected) {
      return res.status(200).json({
        status: "success",
        data: [],
        message: "Doctor's calendar is not connected to Google Calendar",
      });
    }

    // IST day boundaries in UTC
    const startDay = makeIstDateFromParts(y, m, d, 0, 0, 0, 0);
    const endOfDay = makeIstDateFromParts(y, m, d, 23, 59, 59, 999);

    const { availabilityRange, dailyTimeRanges, availabilityMode } = doctor;

    // Day-of-week for this calendar date (timezone-independent)
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();

    // Excluded weekdays (0=Sun..6=Sat)
    if (availabilityRange?.excludedWeekdays) {
      if (availabilityRange.excludedWeekdays.includes(weekday)) {
        return res.status(200).json({
          status: "success",
          data: [],
          message: "Doctor is not available on this day",
        });
      }
    }

    // Helpers to parse stored availabilityRange dates (Date | ISO | YYYY-MM-DD)
    function parseAvailabilityStart(value) {
      const p = availabilityYmdParts(value);
      if (!p) return null;
      return makeIstDateFromParts(p.y, p.m, p.d, 0, 0, 0, 0);
    }
    function parseAvailabilityEnd(value) {
      const p = availabilityYmdParts(value);
      if (!p) return null;
      return makeIstDateFromParts(p.y, p.m, p.d, 23, 59, 59, 999);
    }

    // Check availability start
    if (availabilityRange?.startDate) {
      const availStart = parseAvailabilityStart(availabilityRange.startDate);
      if (availStart && startDay < availStart) {
        return res.status(200).json({
          status: "success",
          data: [],
          message: "Doctor is not available on this date",
        });
      }
    }

    // Check availability end
    if (availabilityRange?.endDate) {
      const availEnd = parseAvailabilityEnd(availabilityRange.endDate);
      if (availEnd && startDay > availEnd) {
        return res.status(200).json({
          status: "success",
          data: [],
          message: "Doctor is not available on this date",
        });
      }
    }

    const ranges = Array.isArray(dailyTimeRanges) ? dailyTimeRanges : [];
    if (ranges.length === 0) {
      return res.status(200).json({
        status: "success",
        data: [],
        message: "Doctor has no working hours configured",
      });
    }

    // Filter ranges based on availabilityMode with robust type conversion & fallbacks
    const mode = availabilityMode || 'default';
    let applicableRanges = [];

    if (mode === 'custom') {
      // Custom mode: match weekday using Number comparison
      applicableRanges = ranges.filter(r => r.day !== undefined && r.day !== null && Number(r.day) === Number(weekday));
      if (applicableRanges.length === 0) {
        applicableRanges = ranges.filter(r => r.day === undefined || r.day === null);
      }
      if (applicableRanges.length === 0) {
        applicableRanges = ranges;
      }
    } else {
      // Default mode: use general ranges or matching day ranges
      applicableRanges = ranges.filter(r => r.day === undefined || r.day === null || Number(r.day) === Number(weekday));
      if (applicableRanges.length === 0) {
        applicableRanges = ranges;
      }
    }

    if (applicableRanges.length === 0) {
      return res.status(200).json({
        status: "success",
        data: [],
        message: "Doctor is not available on this day",
      });
    }

    const activeStatuses = ["Scheduled", "In Progress", "Rescheduled", "Reassigned"];
    const appointments = await Appointment.find({
      doctorId,
      slotStartIso: { $lt: endOfDay },
      slotEndIso: { $gt: startDay },
      status: { $in: activeStatuses },
    }).select("slotStartIso slotEndIso");

    // Include mobile/test bookings so slots show as booked for patients
    const testAppointments = await AppointmentTesting.find({
      doctorId,
      slotStartIso: { $lt: endOfDay },
      slotEndIso: { $gt: startDay },
      status: { $in: activeStatuses },
    }).select("slotStartIso slotEndIso");

    const allAppointments = [...appointments, ...testAppointments];

    const blockedSlots = await BlockedSlot.find({
      doctorId,
      startTime: { $lt: endOfDay },
      endTime: { $gt: startDay },
    }).select("startTime endTime");

    const duration = Number(doctor.appointmentDuration || 30);
    const slotsMap = new Map();

    // ✅ UPDATED: Use applicableRanges with Map deduplication & isOnline flag
    for (const r of applicableRanges) {
      if (!r?.start || !r?.end) continue;

      const [sh, sm] = r.start.split(":").map(Number);
      const [eh, em] = r.end.split(":").map(Number);

      // Start & end of this working range in IST
      let current = makeIstDateFromParts(y, m, d, sh ?? 0, sm ?? 0, 0, 0);
      const rangeEnd = makeIstDateFromParts(y, m, d, eh ?? 0, em ?? 0, 0, 0);

      // 1. Calculate rangeTotalSlots for this specific range
      let rangeTotalSlots = 0;
      let tempCursor = new Date(current);
      while (tempCursor < rangeEnd) {
        const slotEnd = new Date(tempCursor.getTime() + duration * 60000);
        if (slotEnd > rangeEnd) break;
        rangeTotalSlots++;
        tempCursor = new Date(tempCursor.getTime() + duration * 60000);
      }

      // 2. Calculate local VIP indices for this range
      const vipSlotsCount = typeof r.vipSlots === 'number' ? r.vipSlots : 0;
      const vipIndices = new Set();
      if (rangeTotalSlots > 0 && vipSlotsCount > 0) {
        if (vipSlotsCount >= rangeTotalSlots) {
          for (let i = 0; i < rangeTotalSlots; i++) vipIndices.add(i);
        } else {
          const step = rangeTotalSlots / vipSlotsCount;
          for (let i = 0; i < vipSlotsCount; i++) {
            const idx = Math.floor((i + 0.5) * step);
            vipIndices.add(idx);
          }
        }
      }

      // 3. Custom VIP timings for this range
      const customTimings = Array.isArray(r.vipTimings) ? r.vipTimings : [];

      let rangeSlotIndex = 0;
      while (current < rangeEnd) {
        const slotStart = new Date(current);
        const slotEnd = new Date(current.getTime() + duration * 60000);
        if (slotEnd > rangeEnd) break;

        // Form the HH:mm string in IST to match custom vipTimings
        const istDate = new Date(slotStart.getTime() + (5 * 60 + 30) * 60 * 1000);
        const hh = String(istDate.getUTCHours()).padStart(2, '0');
        const mm = String(istDate.getUTCMinutes()).padStart(2, '0');
        const hhmm = `${hh}:${mm}`;

        // Skip slots that are in the past or start within 1 hour from now
        const isPast = !isSlotStartBookableByTime(slotStart);

        const hasAppt = allAppointments.some((a) => {
          const apptStart = new Date(a.slotStartIso);
          const apptEnd = new Date(a.slotEndIso);
          return overlaps(slotStart, slotEnd, apptStart, apptEnd);
        });

        const blockedForRange = blockedSlots
          .map(b =>
            intersectInterval(
              new Date(b.startTime),
              new Date(b.endTime),
              current,
              rangeEnd
            )
          )
          .filter(Boolean);

        const hasBlocked = blockedForRange.some(b =>
          overlaps(slotStart, slotEnd, b.start, b.end)
        );

        const isVip = customTimings.includes(hhmm) || vipIndices.has(rangeSlotIndex);
        let status = "available";

        if (isPast) {
          status = "past";
        } else if (hasAppt) {
          status = "booked";
        } else if (hasBlocked) {
          status = "blocked";
        } else if (isVip) {
          const isStaff = checkIsStaffRequest(req);
          if (isStaff) {
            status = "vip";
          } else {
            status = "booked";
          }
        }

        const startIsoStr = slotStart.toISOString();
        const isOnlineRange = Boolean(r.isOnline);

        if (slotsMap.has(startIsoStr)) {
          const existing = slotsMap.get(startIsoStr);
          if (isOnlineRange) existing.isOnline = true;
          if (status === "available" && existing.status !== "available") {
            existing.status = "available";
          }
        } else {
          slotsMap.set(startIsoStr, {
            start: startIsoStr,
            end: slotEnd.toISOString(),
            status,
            isVip,
            isOnline: isOnlineRange,
          });
        }

        rangeSlotIndex++;
        current = new Date(current.getTime() + duration * 60000);
      }
    }

    const slots = Array.from(slotsMap.values()).sort(
      (a, b) => new Date(a.start) - new Date(b.start)
    );

    return res.status(200).json({
      status: "success",
      data: slots,
      message: "Available slots retrieved",
    });
  } catch (error) {
    console.error("Available-slots error:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to fetch available slots",
      errors: [error.message],
    });
  }
});

// ---------- Common booking creation ----------
async function createAndMaybeSync({ doctor, patient, date, slotStartIso, slotEndIso, symptoms }) {
  const appointment = await createAppointmentOnly({
    doctor,
    patient,
    date,
    slotStartIso,
    slotEndIso,
    symptoms,
  });
  await syncAppointmentExternal(appointment, doctor, patient, symptoms);
  return appointment;
}



// ---------- Helpers for fast booking ----------

// DB-only appointment creation (FAST)
async function createAppointmentOnly({ doctor, patient, date, slotStartIso, slotEndIso, symptoms }) {
  const appointment = await Appointment.create({
    doctorId: doctor._id,
    patientId: patient._id,
    date,
    slotStartIso,
    slotEndIso,
    symptoms: symptoms || '',
    status: 'Scheduled',
  });

  return appointment;
}

// Background sync: Google Calendar + Email (SLOW, but not blocking)
async function syncAppointmentExternal(appointment, doctor, patient, symptoms) {
  const appointmentId = appointment?._id;
  if (!appointmentId) {
    console.error("📅 Background sync skipped: missing appointment id");
    return;
  }

  console.log(`✉️ Background sync started for appointment ${appointmentId}`);

  const doctorId = doctor?._id || doctor?.id;
  const patientId = patient?._id || patient?.id;

  const [freshDoctor, freshPatient, freshAppointment] = await Promise.all([
    doctorId ? Doctor.findById(doctorId) : null,
    patientId ? Patient.findById(patientId) : null,
    Appointment.findById(appointmentId),
  ]);

  const doctorDoc = freshDoctor || doctor;
  const patientDoc = freshPatient || patient;
  const appointmentDoc = freshAppointment || appointment;

  if (!doctorDoc || !patientDoc || !appointmentDoc) {
    console.error("📅 Background sync skipped: record not found", {
      appointmentId,
      doctorId,
      patientId,
    });
    return;
  }

  if (isDoctorCalendarConnected(doctorDoc)) {
    try {
      const result = await googleCalendarService.createAppointmentEvent(
        doctorDoc,
        patientDoc,
        {
          appointmentId: appointmentDoc._id,
          symptoms: symptoms || appointmentDoc.symptoms,
          slotStartIso: toRFC3339(appointmentDoc.slotStartIso),
          slotEndIso: toRFC3339(appointmentDoc.slotEndIso),
          status: appointmentDoc.status || "Scheduled",
        }
      );

      if (result.success) {
        appointmentDoc.googleCalendar = {
          eventId: result.eventId,
          eventLink: result.eventLink,
          meetLink: result.meetLink || null,
          synced: true,
          lastSyncedAt: new Date(),
        };
        console.log(
          `📅 Calendar event synced for appointment ${appointmentId} → ${result.eventId}`
        );
      } else {
        appointmentDoc.googleCalendar = {
          synced: false,
          syncError: result.error,
          lastSyncedAt: new Date(),
        };
        console.error(
          `📅 Calendar sync failed for appointment ${appointmentId}:`,
          result.error
        );
      }
      await appointmentDoc.save();
    } catch (e) {
      console.error("📅 Calendar sync error:", e?.message || e);
    }
  } else {
    console.warn(
      `📅 Calendar sync skipped for appointment ${appointmentId}: calendar not connected`
    );
  }

  try {
    const emailResult = await notificationService.sendAppointmentBookedEmail({
      appointment: appointmentDoc,
      doctor: doctorDoc,
      patient: patientDoc,
    });
    if (emailResult?.failed > 0) {
      console.error(
        `✉️ Booking notifications partially failed for appointment ${appointmentId}:`,
        emailResult
      );
    } else {
      console.log(`✉️ Booking notifications sent for appointment ${appointmentId}`);
    }
  } catch (e) {
    console.error("✉️ Booking email error:", e?.message || e);
  }
}

// ---------- Guest booking (no login) ----------
router.post(
  "/guest-book",
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("phone").trim().notEmpty().withMessage("Phone number is required"),
    body("doctorId").isMongoId().withMessage("Valid doctor ID is required"),
    body("slotStartIso").isISO8601().withMessage("Valid start time is required"),
    body("slotEndIso").isISO8601().withMessage("Valid end time is required"),
    body("date").isISO8601().withMessage("Valid date is required"),
    body("symptoms").optional().isString().trim(),
    body("turnstileToken").optional().isString(),
  ],
  validate,
  verifyTurnstile,
  async (req, res) => {
    try {
      const { name, email, phone, doctorId, slotStartIso, slotEndIso, date, symptoms } =
        req.body;

      const doctor = await Doctor.findById(doctorId);
      if (!doctor) {
        return res.status(404).json({ status: "error", message: "Doctor not found" });
      }

      const setting = await SystemSetting.findOne({ key: "onlineBookingLive" });
      const onlineBookingLive = setting ? setting.value === true : true;
      if (!onlineBookingLive) {
        doctor.dailyTimeRanges = (doctor.dailyTimeRanges || []).filter(r => !r.isOnline);
      }

      const patient = await findOrCreateGuestPatient({ name, email, phone });
      const blockCheck = assertGuestPatientCanBook(patient);
      if (!blockCheck.allowed) {
        return res.status(403).json({
          status: "error",
          message: blockCheck.message,
        });
      }

      if (!isSlotStartBookableByTime(slotStartIso)) {
        return res.status(403).json({
          status: "error",
          message: "Appointments must be booked at least 1 hour in advance",
        });
      }

      const availabilityCheck = validateAppointmentAvailability(
        doctor,
        slotStartIso,
        slotEndIso
      );
      if (!availabilityCheck.available) {
        return res
          .status(403)
          .json({ status: "error", message: availabilityCheck.reason });
      }

      const isBlocked = await BlockedSlot.findOne({
        doctorId,
        startTime: { $lt: new Date(slotEndIso) },
        endTime: { $gt: new Date(slotStartIso) },
      });
      if (isBlocked) {
        return res.status(403).json({
          status: "error",
          message: "This time slot is blocked and cannot be booked",
        });
      }

      const activeStatuses = ["Scheduled", "In Progress", "Rescheduled", "Reassigned"];
      const [conflictProd, conflictTest] = await Promise.all([
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
      if (conflictProd || conflictTest) {
        return res.status(403).json({
          status: "error",
          message: "This time slot is already booked",
        });
      }

      const appointment = await createAppointmentOnly({
        doctor,
        patient,
        date: new Date(date),
        slotStartIso: new Date(slotStartIso),
        slotEndIso: new Date(slotEndIso),
        symptoms,
      });

      res.status(201).json({
        status: "success",
        data: {
          appointmentId: appointment._id,
          message:
            "Appointment booked. Check your email for reschedule and cancel links.",
        },
        message: "Appointment booked successfully",
      });

      const bookedId = appointment._id;
      setImmediate(() => {
        console.log(`✉️ Queued background sync for guest appointment ${bookedId}`);
        syncAppointmentExternal(appointment, doctor, patient, symptoms).catch((err) =>
          console.error("Background guest booking sync error:", err)
        );
      });
    } catch (error) {
      console.error("Guest book error:", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to book appointment",
        errors: [error.message],
      });
    }
  }
);

// ---------- Validate & book (patient) ----------
router.post(
  "/book",
  authenticate,
  requireRole("patient"),
  [
    body("doctorId").isMongoId().withMessage("Valid doctor ID is required"),
    body("slotStartIso").isISO8601().withMessage("Valid start time is required"),
    body("slotEndIso").isISO8601().withMessage("Valid end time is required"),
    body("date").isISO8601().withMessage("Valid date is required"),
    body("symptoms").optional().isString().trim(),
    body("turnstileToken").optional().isString(),
  ],
  validate,
  verifyTurnstile,
  async (req, res) => {
    try {
      const { doctorId, slotStartIso, slotEndIso, date, symptoms } = req.body;

      // 1) Get doctor & patient
      const doctor = await Doctor.findById(doctorId);
      if (!doctor) {
        return res.status(404).json({ status: 'error', message: 'Doctor not found' });
      }

      const setting = await SystemSetting.findOne({ key: "onlineBookingLive" });
      const onlineBookingLive = setting ? setting.value === true : true;
      if (!onlineBookingLive) {
        doctor.dailyTimeRanges = (doctor.dailyTimeRanges || []).filter(r => !r.isOnline);
      }

      const patient = await Patient.findById(req.user._id || req.user.id);
      if (!patient) {
        return res.status(404).json({ status: 'error', message: 'Patient not found' });
      }

      // Check if patient profile required fields are filled (name, phone, age)
      if (!patient.name || !patient.phone || !patient.age) {
        return res.status(400).json({
          status: 'error',
          message: 'Profile incomplete. Please complete your profile details (including name, phone, and age) before booking an appointment.',
        });
      }

      // 2) Blocking logic based on counts
      const cancelCount = Number(patient.cancelCount || 0);
      const rescheduleCount = Number(patient.rescheduleCount || 0);
      const noShowCount = Number(patient.noShowCount || 0);
      const isHardBlocked = !!patient.isBlocked;
      const autoBlockedByCounts =
        cancelCount >= PATIENT_CANCEL_LIMIT ||
        rescheduleCount >= PATIENT_RESCHEDULE_LIMIT ||
        noShowCount >= PATIENT_NO_SHOW_LIMIT;

      if (isHardBlocked || autoBlockedByCounts) {
        return res.status(403).json({
          status: 'error',
          message:
            'Your account is Locked for online booking due to repeated cancellations/reschedules/missed appointments. Please contact the support team/receptionist for further assistance.',
          data: {
            isBlocked: !!patient.isBlocked,
            cancelCount,
            rescheduleCount,
            noShowCount,
            cancelLimit: PATIENT_CANCEL_LIMIT,
            rescheduleLimit: PATIENT_RESCHEDULE_LIMIT,
            noShowLimit: PATIENT_NO_SHOW_LIMIT,
            supportPhone: "+91 91480 80000",
            supportEmail: "callcenter@brains.org.in",
          },
        });
      }

      // 3) Enforce 1 hour buffer from now
      const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
      if (new Date(slotStartIso) < oneHourFromNow) {
        return res.status(403).json({
          status: 'error',
          message: 'Appointments must be booked at least 1 hour in advance'
        });
      }

      // 3.5) Availability validation
      const availabilityCheck = validateAppointmentAvailability(
        doctor,
        slotStartIso,
        slotEndIso
      );
      if (!availabilityCheck.available) {
        return res
          .status(403)
          .json({ status: 'error', message: availabilityCheck.reason });
      }

      // 4) Check blocked slot
      const isBlocked = await BlockedSlot.findOne({
        doctorId: doctorId,
        startTime: { $lt: new Date(slotEndIso) },
        endTime: { $gt: new Date(slotStartIso) },
      });
      if (isBlocked) {
        return res.status(403).json({
          status: 'error',
          message: 'This time slot is blocked by the doctor and cannot be booked',
        });
      }

      // 5) Check conflicting appointment across both collections
      const activeStatuses = ['Scheduled', 'In Progress', 'Rescheduled', 'Reassigned'];
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

      if (conflictOffline || conflictOnline) {
        return res.status(403).json({
          status: 'error',
          message: 'This time slot is already booked',
        });
      }

      // 6) Create appointment in DB (FAST)
      const appointment = await createAppointmentOnly({
        doctor,
        patient,
        date: new Date(date),
        slotStartIso: new Date(slotStartIso),
        slotEndIso: new Date(slotEndIso),
        symptoms,
      });

      // ✅ 7) Respond immediately to frontend (popup becomes fast)
      res.status(201).json({
        status: 'success',
        data: appointment,
        message: 'Appointment booked successfully',
      });

      // 🔥 8) Do slow stuff in background (Google Calendar + Email)
      process.nextTick(() => {
        syncAppointmentExternal(appointment, doctor, patient, symptoms)
          .catch(err => console.error("Background booking sync error:", err));
      });

    } catch (error) {
      console.error('Book appointment error', error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to book appointment',
        errors: [error.message],
      });
    }
  }
);


// ---------- Legacy "create" ----------
router.post('/create', authenticate, async (req, res) => {
  try {
    const { doctorId, date, slotStartIso, slotEndIso, symptoms } = req.body;

    const patientId = req.user.id;
    if (!doctorId || !date || !slotStartIso || !slotEndIso) {
      return res.status(400).json({ status: 'error', message: 'Missing required fields' });
    }

    const doctor = await Doctor.findById(doctorId);
    const patient = await Patient.findById(patientId);
    if (!doctor || !patient) {
      return res.status(404).json({ status: 'error', message: 'Doctor or Patient not found' });
    }

    const setting = await SystemSetting.findOne({ key: "onlineBookingLive" });
    const onlineBookingLive = setting ? setting.value === true : true;
    if (!onlineBookingLive) {
      doctor.dailyTimeRanges = (doctor.dailyTimeRanges || []).filter(r => !r.isOnline);
    }

    const availabilityCheck = validateAppointmentAvailability(doctor, slotStartIso, slotEndIso);
    if (!availabilityCheck.available) {
      return res.status(400).json({ status: 'error', message: availabilityCheck.reason });
    }

    const isBlocked = await BlockedSlot.findOne({
      doctorId: doctorId,
      startTime: { $lt: new Date(slotEndIso) },
      endTime: { $gt: new Date(slotStartIso) },
    });
    if (isBlocked) {
      return res.status(400).json({ status: 'error', message: 'This time slot is blocked by the doctor and cannot be booked' });
    }

    const conflictingAppointment = await Appointment.findOne({
      doctorId,
      status: { $in: ["Scheduled", "In Progress"] },
      $or: [{ slotStartIso: { $lt: new Date(slotEndIso) }, slotEndIso: { $gt: new Date(slotStartIso) } }],
    });
    if (conflictingAppointment) {
      return res.status(400).json({ status: 'error', message: 'This time slot is already booked' });
    }

    const appointment = await createAndMaybeSync({
      doctor,
      patient,
      date: new Date(date),
      slotStartIso: new Date(slotStartIso),
      slotEndIso: new Date(slotEndIso),
      symptoms,
    });

    return res.status(201).json({
      status: 'success',
      message: 'Appointment created successfully',
      data: {
        appointment,
        calendarSynced: appointment.googleCalendar?.synced || false,
      },
    });
  } catch (error) {
    console.error('❌ Error creating appointment:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to create appointment', errors: [error.message] });
  }
});

// ---------- Join / End / Status / Details ----------
router.get("/join/:id", authenticate, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate("patientId", "name")
      .populate("doctorId", "name");

    if (!appointment) {
      return res.status(404).json({ status: 'error', message: 'Appointment not found' });
    }

    appointment.status = "In Progress";
    await appointment.save();

    return res.status(200).json({
      status: 'success',
      data: { roomId: appointment.zegoRoomId, appointment },
      message: 'Consultation joined successfully'
    });
  } catch (error) {
    console.error("Join consultation error", error);
    return res.status(500).json({ status: 'error', message: 'Failed to join consultation', errors: [error.message] });
  }
});

router.put("/end/:id", authenticate, async (req, res) => {
  try {
    const { prescription, notes } = req.body;
    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status: "Completed", prescription, notes, updatedAt: new Date() },
      { new: true }
    ).populate("patientId doctorId");

    if (!appointment) {
      return res.status(404).json({ status: 'error', message: 'Appointment not found' });
    }

    return res.status(200).json({ status: 'success', data: appointment, message: 'Consultation completed successfully' });
  } catch (error) {
    console.error("End consultation error", error);
    return res.status(500).json({ status: 'error', message: 'Failed to end consultation', errors: [error.message] });
  }
});

router.put(
  "/status/:id",
  authenticate,
  requireRole("doctor", "admin", "super_admin", "receptionist"),
  async (req, res) => {
    try {
      const apptId = req.params.id;
      let { status } = req.body;

      if (!status) return res.status(400).json({ status: "error", message: "Status required" });

      const map = {
        scheduled: "Scheduled",
        completed: "Completed",
        cancelled: "Cancelled",
        "in progress": "In Progress",
        rescheduled: "Rescheduled",
        "no show": "Missed",
        missed: "Missed",
        expired: "Missed",
      };

      status = map[String(status).toLowerCase()] || status;

      const appointment = await Appointment.findById(apptId)
        .populate("doctorId")
        .populate("patientId");

      if (!appointment) return res.status(404).json({ status: "error", message: "Not found" });

      const role = req.user.type;
      if (role === "doctor" && String(appointment.doctorId._id) !== req.user.id) {
        return res.status(403).json({ status: "error", message: "Unauthorized" });
      }

      const prev = appointment.status;
      const isMissedStatusKey = (s) => ["missed", "no show", "noshow", "no-show", "expired"].includes(String(s || "").toLowerCase().trim());
      const wasNoShow = isMissedStatusKey(prev);
      const isNowNoShow = isMissedStatusKey(status);

      appointment.status = status;
      appointment.updatedAt = new Date();
      if (status === "Completed") {
        if (!appointment.completedAt) appointment.completedAt = new Date();
      } else {
        appointment.completedAt = null;
      }

      await appointment.save();

      if (wasNoShow && !isNowNoShow && appointment.patientId?._id) {
        try {
          await Patient.findOneAndUpdate(
            { _id: appointment.patientId._id, noShowCount: { $gt: 0 } },
            { $inc: { noShowCount: -1 } }
          );
        } catch (err) {
          console.warn("Non-fatal: failed to decrement patient noShowCount:", err?.message || err);
        }
      } else if (!wasNoShow && isNowNoShow && appointment.patientId?._id) {
        try {
          await Patient.findByIdAndUpdate(appointment.patientId._id, {
            $inc: { noShowCount: 1 }
          });
        } catch (err) {
          console.warn("Non-fatal: failed to increment patient noShowCount:", err?.message || err);
        }
      }

      // Immediate response ⚡
      res.status(200).json({
        status: "success",
        data: { appointment },
        message: "Status updated",
      });

      // Background sync 🔥
      process.nextTick(async () => {
        try {
          // Google update
          const doctor = appointment.doctorId;
          const eventId = appointment.googleCalendar?.eventId;

          if (eventId && doctor.googleCalendar?.isConnected) {
            await googleCalendarService.updateAppointmentEvent(
              doctor,
              eventId,
              {
                appointmentId: appointment._id,
                slotStartIso: appointment.slotStartIso,
                slotEndIso: appointment.slotEndIso,
                status,
              }
            );
          }

          // email to patient
          await notificationService.sendAppointmentStatusChangedEmail({
            appointment,
            doctor,
            patient: appointment.patientId,
            previousStatus: prev,
            newStatus: status,
            changedByRole: role,
          });

        } catch (err) {
          console.error("Background status sync failed:", err);
        }
      });

    } catch (error) {
      console.error("Status update error:", error);
      return res.status(500).json({
        status: "error",
        message: "Status update failed",
        errors: [error.message],
      });
    }
  }
);


router.get("/:id", authenticate, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate("patientId", "name email phone dob age profileImage")
      .populate("doctorId", "name fees phone specialization profileImage");

    if (!appointment) {
      return res.status(404).json({ status: 'error', message: 'Appointment not found' });
    }

    const role = req.user.type;
    if (role === "doctor" && String(appointment.doctorId._id) !== req.user.id) {
      return res.status(403).json({ status: 'error', message: 'Access denied' });
    }
    if (role === "patient" && String(appointment.patientId._id) !== req.user.id) {
      return res.status(403).json({ status: 'error', message: 'Access denied' });
    }

    return res.status(200).json({ status: 'success', data: { appointment }, message: 'Appointment fetched successfully' });
  } catch (error) {
    console.error("Get appointment error", error);
    return res.status(500).json({ status: 'error', message: 'Failed to get appointment', errors: [error.message] });
  }
});

router.put(
  "/cancel/:id",
  authenticate,
  requireRole("patient", "admin", "super_admin", "receptionist"),
  [
    body("reason").optional().isString().trim(),
  ],
  validate,
  async (req, res) => {
    try {
      const apptId = req.params.id;
      const { reason } = req.body;
      const LIMIT_PER_PATIENT = 3;

      const appointment =
        (await Appointment.findById(apptId)
          .populate("doctorId")
          .populate("patientId")) ||
        (await AppointmentTesting.findById(apptId)
          .populate("doctorId")
          .populate("patientId"));

      if (!appointment) {
        return res.status(404).json({ status: "error", message: "Appointment not found" });
      }

      const callerRole = req.user.type;
      const callerId = req.user._id || req.user.id;

      if (callerRole === "patient" &&
        String(appointment.patientId._id) !== String(callerId)) {
        return res.status(403).json({ status: "error", message: "Unauthorized access" });
      }

      if (String(appointment.status).toLowerCase() === "cancelled") {
        return res.status(400).json({ status: "error", message: "Already cancelled" });
      }

      if (callerRole === "patient") {
        const count = Number(appointment.patientId.cancelCount || 0);
        if (count >= LIMIT_PER_PATIENT) {
          return res.status(403).json({
            status: "error",
            message: `You reached cancellation limit (${LIMIT_PER_PATIENT}).`,
            limit: LIMIT_PER_PATIENT,
            cancelCount: count,
          });
        }
      }

      appointment.status = "Cancelled";
      appointment.cancelReason = reason || `Cancelled by ${callerRole}`;
      appointment.cancelledAt = new Date();
      appointment.cancelledBy = callerId;
      appointment.cancelledByType =
        callerRole === "patient"
          ? "patient"
          : callerRole === "receptionist"
            ? "receptionist"
            : callerRole === "super_admin"
              ? "super_admin"
              : callerRole === "admin"
                ? "admin"
                : "patient";

      await appointment.save();

      let updatedPatient = null;
      if (callerRole === "patient") {
        updatedPatient = await Patient.findByIdAndUpdate(
          appointment.patientId._id,
          { $inc: { cancelCount: 1 } },
          { new: true }
        );
      } else {
        updatedPatient = await Patient.findById(appointment.patientId._id);
      }

      // ✅ Respond immediately (NO waiting for email/calendar)
      res.status(200).json({
        status: "success",
        message: "Appointment cancelled successfully",
        data: {
          appointment,
          patientCancelCount: updatedPatient.cancelCount,
        },
      });

      // 🔥 Run external sync in background
      process.nextTick(async () => {
        try {
          // update Google event → "Cancelled"
          const doctor = appointment.doctorId;
          const eventId = appointment.googleCalendar?.eventId;
          if (eventId && doctor.googleCalendar?.isConnected) {
            await googleCalendarService.updateAppointmentEvent(doctor, eventId, {
              appointmentId: appointment._id,
              slotStartIso: toRFC3339(appointment.slotStartIso),
              slotEndIso: toRFC3339(appointment.slotEndIso),
              status: "Cancelled",
            });
          }

          // send cancel email
          await notificationService.sendAppointmentCancelledEmail({
            appointment,
            doctor: appointment.doctorId,
            patient: appointment.patientId,
            cancelledByRole: callerRole,
          });

        } catch (err) {
          console.error("Background cancel sync failed:", err);
        }
      });

    } catch (error) {
      console.error("Cancel error:", error);
      return res.status(500).json({ status: "error", message: "Cancel failed", errors: [error.message] });
    }
  }
);


// ---------- Guest / link-based reschedule ----------
router.post(
  "/reschedule/lookup",
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("phone").optional().isString().trim(),
  ],
  validate,
  async (req, res) => {
    try {
      const email = normalizeEmail(req.body.email);
      const phone = req.body.phone || "";

      const patient = await Patient.findOne({ email });
      if (!patient) {
        return res.status(404).json({
          status: "error",
          message: "No bookings found for this email.",
        });
      }

      if (patient.phone && phone && !phonesMatch(patient.phone, phone)) {
        return res.status(403).json({
          status: "error",
          message: "Email and phone number do not match our records.",
        });
      }

      const now = new Date();
      const appointments = await Appointment.find({
        patientId: patient._id,
        status: { $in: RESCHEDULABLE_STATUSES },
        slotEndIso: { $gt: now },
      })
        .populate("doctorId", "name specialization profileImage")
        .sort({ slotStartIso: 1 })
        .limit(10);

      if (!appointments.length) {
        return res.status(404).json({
          status: "error",
          message: "No upcoming appointments found to reschedule.",
        });
      }

      const list = appointments.map((appt) => ({
        appointment: serializeRescheduleAppointment(appt),
        doctor: serializeRescheduleDoctor(appt.doctorId),
        patient: {
          name: patient.name,
          email: patient.email,
          phone: patient.phone,
        },
        rescheduleToken: signRescheduleAccessToken({
          appointmentId: appt._id,
          email: patient.email,
        }),
        cancelToken: signCancelAccessToken({
          appointmentId: appt._id,
          email: patient.email,
        }),
        rescheduleLimit: PATIENT_RESCHEDULE_LIMIT,
        patientRescheduleCount: patient.rescheduleCount || 0,
      }));

      return res.json({
        status: "success",
        data: { appointments: list },
        message: "Appointments found",
      });
    } catch (error) {
      console.error("Reschedule lookup error:", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to look up appointments",
        errors: [error.message],
      });
    }
  }
);

router.get("/reschedule/details/:id", async (req, res) => {
  try {
    const auth = await authorizeRescheduleAccess(req, req.params.id);
    if (!auth.ok) {
      return res.status(auth.status).json({ status: "error", message: auth.message });
    }

    const appt = await Appointment.findById(req.params.id)
      .populate("doctorId")
      .populate("patientId");

    if (!appt) {
      return res.status(404).json({ status: "error", message: "Appointment not found" });
    }

    const status = String(appt.status || "");
    if (!RESCHEDULABLE_STATUSES.includes(status)) {
      return res.status(400).json({
        status: "error",
        message: "This appointment can no longer be rescheduled.",
      });
    }

    if (new Date(appt.slotEndIso) <= new Date()) {
      return res.status(400).json({
        status: "error",
        message: "This appointment has already passed.",
      });
    }

    const patient = appt.patientId;
    const tokens = issueGuestAppointmentTokens(appt._id, patient.email);

    return res.json({
      status: "success",
      data: {
        appointment: serializeRescheduleAppointment(appt),
        doctor: serializeRescheduleDoctor(appt.doctorId),
        patient: {
          name: patient.name,
          email: patient.email,
          phone: patient.phone,
        },
        rescheduleToken: tokens.rescheduleToken,
        cancelToken: tokens.cancelToken,
        rescheduleLimit: PATIENT_RESCHEDULE_LIMIT,
        patientRescheduleCount: patient.rescheduleCount || 0,
      },
      message: "Reschedule details loaded",
    });
  } catch (error) {
    console.error("Reschedule details error:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to load reschedule details",
      errors: [error.message],
    });
  }
});

router.put(
  "/guest-reschedule/:id",
  [
    body("token").notEmpty().withMessage("Reschedule token is required"),
    body("slotStartIso").isISO8601(),
    body("slotEndIso").isISO8601(),
    body("date").isISO8601(),
    body("note").optional().isString(),
  ],
  validate,
  async (req, res) => {
    try {
      const { slotStartIso, slotEndIso, date, note } = req.body;
      req.query.token = req.body.token;
      const auth = await authorizeRescheduleAccess(req, req.params.id);
      if (!auth.ok) {
        return res.status(auth.status).json({ status: "error", message: auth.message });
      }

      const appt = await Appointment.findById(req.params.id)
        .populate("doctorId")
        .populate("patientId");

      if (!appt) {
        return res.status(404).json({ status: "error", message: "Appointment not found" });
      }

      const patient = appt.patientId;
      const count = patient.rescheduleCount || 0;
      if (count >= PATIENT_RESCHEDULE_LIMIT) {
        return res.status(403).json({
          status: "error",
          message: "Reschedule limit reached",
          limit: PATIENT_RESCHEDULE_LIMIT,
          rescheduleCount: count,
        });
      }

      const doctor = appt.doctorId;
      if (doctor) {
        const setting = await SystemSetting.findOne({ key: "onlineBookingLive" });
        const onlineBookingLive = setting ? setting.value === true : true;
        if (!onlineBookingLive) {
          doctor.dailyTimeRanges = (doctor.dailyTimeRanges || []).filter(r => !r.isOnline);
        }
      }
      const newStart = new Date(slotStartIso);
      const newEnd = new Date(slotEndIso);
      const newDate = new Date(date);

      const availabilityCheck = validateAppointmentAvailability(
        doctor,
        slotStartIso,
        slotEndIso
      );
      if (!availabilityCheck.available) {
        return res.status(403).json({ status: "error", message: availabilityCheck.reason });
      }

      // Conflict check (exclude current appointment)
      const activeStatuses = ['Scheduled', 'In Progress', 'Rescheduled', 'Reassigned'];
      const [conflictOffline, conflictOnline] = await Promise.all([
        Appointment.findOne({
          _id: { $ne: appt._id },
          doctorId: doctor._id,
          status: { $in: activeStatuses },
          slotStartIso: { $lt: newEnd },
          slotEndIso: { $gt: newStart },
        }),
        AppointmentTesting.findOne({
          _id: { $ne: appt._id },
          doctorId: doctor._id,
          status: { $in: activeStatuses },
          slotStartIso: { $lt: newEnd },
          slotEndIso: { $gt: newStart },
        }),
      ]);

      if (conflictOffline || conflictOnline) {
        return res.status(409).json({
          status: "error",
          message: "This time slot is already booked",
        });
      }

      const prevStart = appt.slotStartIso;
      const prevEnd = appt.slotEndIso;
      const prevDate = appt.date;

      appt.date = newDate;
      appt.slotStartIso = newStart;
      appt.slotEndIso = newEnd;
      appt.status = "Rescheduled";
      appt.rescheduleCount = (appt.rescheduleCount || 0) + 1;

      if (!Array.isArray(appt.rescheduleHistory)) appt.rescheduleHistory = [];
      appt.rescheduleHistory.push({
        by: patient._id,
        byType: "patient",
        at: new Date(),
        from: { start: prevStart, end: prevEnd, date: prevDate },
        to: { start: newStart, end: newEnd, date: newDate },
        note: note || "Rescheduled via guest reschedule page",
      });

      await appt.save();
      await Patient.findByIdAndUpdate(patient._id, { $inc: { rescheduleCount: 1 } });

      const freshTokens = issueGuestAppointmentTokens(appt._id, patient.email);

      res.status(200).json({
        status: "success",
        message: "Appointment rescheduled successfully",
        data: {
          appointment: serializeRescheduleAppointment(appt),
          rescheduleToken: freshTokens.rescheduleToken,
          cancelToken: freshTokens.cancelToken,
        },
      });

      process.nextTick(async () => {
        try {
          if (appt.googleCalendar?.eventId && doctor.googleCalendar?.isConnected) {
            await googleCalendarService.updateAppointmentEvent(
              doctor,
              appt.googleCalendar.eventId,
              {
                appointmentId: appt._id,
                slotStartIso: newStart,
                slotEndIso: newEnd,
                status: appt.status,
              }
            );
          }
          await notificationService.sendAppointmentRescheduledEmail({
            appointment: appt,
            doctor,
            patient,
            requestedByRole: "patient",
          });
        } catch (err) {
          console.error("Background guest reschedule sync failed:", err);
        }
      });
    } catch (error) {
      console.error("Guest reschedule error:", error);
      return res.status(500).json({
        status: "error",
        message: "Reschedule failed",
        errors: [error.message],
      });
    }
  }
);

// ---------- Guest / link-based cancel ----------
router.get("/cancel/details/:id", async (req, res) => {
  try {
    const auth = await authorizeCancelAccess(req, req.params.id);
    if (!auth.ok) {
      return res.status(auth.status).json({ status: "error", message: auth.message });
    }

    const appt = await Appointment.findById(req.params.id)
      .populate("doctorId")
      .populate("patientId");

    if (!appt) {
      return res.status(404).json({ status: "error", message: "Appointment not found" });
    }

    const status = String(appt.status || "");
    if (!RESCHEDULABLE_STATUSES.includes(status)) {
      return res.status(400).json({
        status: "error",
        message: "This appointment can no longer be cancelled.",
      });
    }

    if (new Date(appt.slotEndIso) <= new Date()) {
      return res.status(400).json({
        status: "error",
        message: "This appointment has already passed.",
      });
    }

    const patient = appt.patientId;
    const tokens = issueGuestAppointmentTokens(appt._id, patient.email);

    return res.json({
      status: "success",
      data: {
        appointment: serializeRescheduleAppointment(appt),
        doctor: serializeRescheduleDoctor(appt.doctorId),
        patient: {
          name: patient.name,
          email: patient.email,
          phone: patient.phone,
        },
        cancelToken: tokens.cancelToken,
        rescheduleToken: tokens.rescheduleToken,
        cancelLimit: PATIENT_CANCEL_LIMIT,
        patientCancelCount: patient.cancelCount || 0,
      },
      message: "Cancel details loaded",
    });
  } catch (error) {
    console.error("Cancel details error:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to load cancel details",
      errors: [error.message],
    });
  }
});

router.put(
  "/guest-cancel/:id",
  [
    body("token").notEmpty().withMessage("Cancel token is required"),
    body("reason").optional().isString().trim(),
  ],
  validate,
  async (req, res) => {
    try {
      const { reason } = req.body;
      req.query.token = req.body.token;
      const auth = await authorizeCancelAccess(req, req.params.id);
      if (!auth.ok) {
        return res.status(auth.status).json({ status: "error", message: auth.message });
      }

      const appointment = await Appointment.findById(req.params.id)
        .populate("doctorId")
        .populate("patientId");

      if (!appointment) {
        return res.status(404).json({ status: "error", message: "Appointment not found" });
      }

      if (String(appointment.status).toLowerCase() === "cancelled") {
        return res.status(400).json({ status: "error", message: "Already cancelled" });
      }

      const patient = appointment.patientId;
      const count = Number(patient.cancelCount || 0);
      if (count >= PATIENT_CANCEL_LIMIT) {
        return res.status(403).json({
          status: "error",
          message: `Cancellation limit reached (${PATIENT_CANCEL_LIMIT}).`,
          limit: PATIENT_CANCEL_LIMIT,
          cancelCount: count,
        });
      }

      appointment.status = "Cancelled";
      appointment.cancelReason = reason || "Cancelled via guest cancel page";
      appointment.cancelledAt = new Date();
      appointment.cancelledBy = patient._id;

      await appointment.save();

      const updatedPatient = await Patient.findByIdAndUpdate(
        patient._id,
        { $inc: { cancelCount: 1 } },
        { new: true }
      );

      res.status(200).json({
        status: "success",
        message: "Appointment cancelled successfully",
        data: {
          appointment: serializeRescheduleAppointment(appointment),
          patientCancelCount: updatedPatient.cancelCount,
        },
      });

      process.nextTick(async () => {
        try {
          const doctor = appointment.doctorId;
          const eventId = appointment.googleCalendar?.eventId;
          if (eventId && doctor.googleCalendar?.isConnected) {
            await googleCalendarService.updateAppointmentEvent(doctor, eventId, {
              appointmentId: appointment._id,
              slotStartIso: toRFC3339(appointment.slotStartIso),
              slotEndIso: toRFC3339(appointment.slotEndIso),
              status: "Cancelled",
            });
          }
          await notificationService.sendAppointmentCancelledEmail({
            appointment,
            doctor,
            patient,
            cancelledByRole: "patient",
          });
        } catch (err) {
          console.error("Background guest cancel sync failed:", err);
        }
      });
    } catch (error) {
      console.error("Guest cancel error:", error);
      return res.status(500).json({
        status: "error",
        message: "Cancellation failed",
        errors: [error.message],
      });
    }
  }
);

// ---------- Reschedule ----------
router.put(
  "/reschedule/:id",
  authenticate,
  requireRole("patient", "admin", "super_admin", "receptionist", "call_center"),
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

      if (role === "patient") {
        await Patient.findByIdAndUpdate(
          appt.patientId._id,
          { $inc: { rescheduleCount: 1 } },
          { new: true }
        );
      }

      res.status(200).json({
        status: "success",
        message: "Appointment rescheduled successfully",
        data: appt,
      });

      runRescheduleBackgroundSync({ appt, doctor, role });
    } catch (error) {
      console.error("Reschedule error:", error);
      if (error.statusCode) {
        return res.status(error.statusCode).json(
          error.payload || { status: "error", message: error.message }
        );
      }
      return res.status(500).json({ status: "error", message: error.message || "Reschedule failed", errors: [error.message] });
    }
  }
);

// ---------- Reassign ----------
router.patch(
  "/:id/reassign",
  authenticate,
  requireRole("admin", "super_admin", "receptionist", "call_center"),
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

      res.status(200).json({
        status: "success",
        message: "Appointment reassigned",
        data: appt,
      });

      runReassignBackgroundSync({ appt, oldDoctor, newDoctor, oldEventId });
    } catch (error) {
      console.error("Reassign error:", error);
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

router.patch("/:id/assign", authenticate, requireRole("admin", "super_admin", "receptionist"), async (req, res, next) => {
  req.url = `/${req.params.id}/reassign`;
  return router.handle(req, res, next);
});

module.exports = router;