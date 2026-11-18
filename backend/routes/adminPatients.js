// backend/routes/adminPatients.js
const express = require("express");
const { param, body, query } = require("express-validator");
const router = express.Router();

const mongoose = require("mongoose");
const Patient = require("../modal/Patient");
const Appointment = require("../modal/Appointment");

// 🔥 NEW: import staff models so we can fetch latest name
const Admin = require("../modal/Admin");
const Doctor = require("../modal/Doctor");
const Receptionist = require("../modal/Receptionist");

const { authenticate, requireRole } = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");

/**
 * Small helper: get the *current* name of the actor from DB
 */
async function resolveActorName(
  callerType,
  callerId,
  fallbackName,
  fallbackEmail
) {
  if (!callerId || !mongoose.isValidObjectId(callerId)) {
    return fallbackName || fallbackEmail || null;
  }

  let Model = null;
  switch ((callerType || "").toLowerCase()) {
    case "admin":
    case "super_admin":
      Model = Admin;
      break;
    case "receptionist":
      Model = Receptionist;
      break;
    case "doctor":
      Model = Doctor;
      break;
    default:
      Model = null;
  }

  if (!Model) {
    return fallbackName || fallbackEmail || null;
  }

  try {
    const doc = await Model.findById(callerId)
      .select("name fullName displayName email")
      .lean();

    if (!doc) {
      return fallbackName || fallbackEmail || null;
    }

    return (
      doc.name ||
      doc.fullName ||
      doc.displayName ||
      doc.email ||
      fallbackName ||
      fallbackEmail ||
      null
    );
  } catch (err) {
    console.warn("resolveActorName failed:", err?.message || err);
    return fallbackName || fallbackEmail || null;
  }
}

/**
 * GET /api/admin/patients
 * - list (basic), supports ?limit & ?search
 */
router.get(
  "/",
  authenticate,
  requireRole("admin", "super_admin", "receptionist"),
  [
    query("limit").optional().toInt(),
    query("page").optional().toInt(),
    query("search").optional().isString(),
  ],
  validate,
  async (req, res) => {
    try {
      const limit = Math.min(
        500,
        Math.max(1, parseInt(req.query.limit || "200", 10))
      );
      const page = Math.max(1, parseInt(req.query.page || "1", 10));
      const skip = (page - 1) * limit;
      const search = String(req.query.search || "").trim();

      const q = {};
      if (search) {
        q.$or = [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } },
        ];
      }

      const [patients, total] = await Promise.all([
        Patient.find(q)
          .select("-password -googleId")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Patient.countDocuments(q),
      ]);

      // ✅ sync / compute noShowCount from appointments
      try {
        const patientIds = patients.map((p) => p._id);

        if (patientIds.length > 0) {
          const noShowAgg = await Appointment.aggregate([
            {
              $match: {
                patientId: { $in: patientIds },
                status: { $in: ["No Show", "Missed"] },
              },
            },
            {
              $group: {
                _id: "$patientId",
                noShowCount: { $sum: 1 },
              },
            },
          ]);

          const noShowMap = new Map(
            noShowAgg.map((row) => [String(row._id), row.noShowCount])
          );

          // 2) For patients with clearedNoShowsAt, compute the count after that timestamp.
          //    We'll perform countDocuments per patient with clearedNoShowsAt.
          const patientsWithCleared = patients.filter((p) => p.clearedNoShowsAt);

          // build promises for filtered counts
          const filteredCountPromises = patientsWithCleared.map((p) =>
            Appointment.countDocuments({
              patientId: p._id,
              status: { $in: ["No Show", "Missed"] },
              createdAt: { $gt: new Date(p.clearedNoShowsAt) },
            }).then((cnt) => ({ id: String(p._id), cnt }))
          );

          const filteredCounts = await Promise.all(filteredCountPromises);
          const filteredMap = new Map(filteredCounts.map((r) => [r.id, r.cnt]));

          // 3) assign computed values back to patient objects
          patients.forEach((p) => {
            const current =
              typeof p.noShowCount === "number" ? p.noShowCount : 0;
            const agg = noShowMap.get(String(p._id)) || 0;

            if (p.clearedNoShowsAt) {
              const after = filteredMap.get(String(p._id)) || 0;
              // prefer the value after cleared timestamp
              p.noShowCount = Math.max(current, after);
            } else {
              p.noShowCount = Math.max(current, agg);
            }
          });
        }
      } catch (aggErr) {
        console.warn(
          "No-show aggregation failed (non-fatal):",
          aggErr?.message || aggErr
        );
      }

      return res.status(200).json({
        status: "success",
        data: {
          patients,
          meta: { total, page, limit, pages: Math.ceil(total / limit) },
        },
        message: "Patients fetched",
      });
    } catch (err) {
      console.error("Admin patients list error:", err);
      return res
        .status(500)
        .json({
          status: "error",
          message: "Failed to fetch patients",
          errors: [err.message],
        });
    }
  }
);

/**
 * GET /api/admin/patients/:id
 * - fetch single patient; be defensive about bad blockedBy values
 */
router.get(
  "/:id",
  authenticate,
  requireRole("admin", "super_admin", "receptionist"),
  [param("id").isMongoId().withMessage("Invalid patient id")],
  validate,
  async (req, res) => {
    try {
      const pid = req.params.id;

      // fetch WITHOUT populate to avoid casting errors on bad blockedBy
      const patient = await Patient.findById(pid)
        .select("-password -googleId")
        .lean();

      if (!patient) {
        return res
          .status(404)
          .json({ status: "error", message: "Patient not found" });
      }

      // Normalize blockedBy: if it's an invalid ObjectId (old string data), drop it
      if (patient.blockedBy && !mongoose.isValidObjectId(patient.blockedBy)) {
        console.warn(
          "⚠️ Invalid blockedBy value on patient, cleaning in response only",
          {
            patientId: pid,
            blockedBy: patient.blockedBy,
          }
        );
        patient.blockedBy = null;
      }

      return res
        .status(200)
        .json({ status: "success", data: patient, message: "Patient fetched" });
    } catch (err) {
      console.error("Get patient error:", err);
      return res
        .status(500)
        .json({
          status: "error",
          message: "Failed to fetch patient",
          errors: [err.message],
        });
    }
  }
);

/**
 * PATCH /api/admin/patients/:id/block
 * - always store role + *latest* name in blockedByName
 */
router.patch(
  "/:id/block",
  authenticate,
  requireRole("admin", "super_admin", "receptionist"),
  [
    param("id").isMongoId().withMessage("Invalid patient id"),
    body("reason").optional().isString().trim(),
  ],
  validate,
  async (req, res) => {
    try {
      const pid = req.params.id;

      const callerId = req.user?.id || null;
      const callerType = req.user?.type || "admin";

      // 👇 resolve the latest name from DB (Admin / Receptionist / Doctor)
      const callerName = await resolveActorName(
        callerType,
        callerId,
        req.user?.name,
        req.user?.email
      );

      const rawReason = (req.body.reason || "").trim();
      const baseReason = rawReason || `Blocked by ${callerType}`;

      let finalReason = baseReason;
      if (callerName && callerId && mongoose.isValidObjectId(callerId)) {
        finalReason = `${baseReason} (blocked by ${callerName} id:${callerId})`;
      }

      const updates = {
        isBlocked: true,
        blockedAt: new Date(),
        blockedReason: finalReason,
        blockedBy: callerId,
        blockedByType: callerType,
        blockedByName: callerName || null, // 🔥 always latest name
      };

      const updated = await Patient.findByIdAndUpdate(pid, updates, {
        new: true,
      }).select("-password -googleId");

      if (!updated) {
        return res
          .status(404)
          .json({ status: "error", message: "Patient not found" });
      }

      return res.status(200).json({
        status: "success",
        data: updated,
        message: "Patient blocked",
      });
    } catch (err) {
      console.error("Block patient error:", err);
      return res
        .status(500)
        .json({
          status: "error",
          message: "Failed to block patient",
          errors: [err.message],
        });
    }
  }
);

/**
 * PATCH /api/admin/patients/:id/unblock
 */
router.patch(
  "/:id/unblock",
  authenticate,
  requireRole("admin", "super_admin", "receptionist"),
  [
    param("id").isMongoId().withMessage("Invalid patient id"),
    body("resetCounts").optional().isBoolean(),
  ],
  validate,
  async (req, res) => {
    try {
      const pid = req.params.id;
      const { resetCounts = false } = req.body || {};

      const updates = {
        isBlocked: false,
        blockedAt: null,
        blockedReason: null,
        blockedBy: null,
        blockedByType: null,
        blockedByName: null, // clear stored name
      };
      if (resetCounts) {
        updates.cancelCount = 0;
        updates.rescheduleCount = 0;
        updates.noShowCount = 0;
        // <-- NEW: mark when no-shows were cleared so aggregation can ignore older ones
        updates.clearedNoShowsAt = new Date();
      }

      const updated = await Patient.findByIdAndUpdate(pid, updates, {
        new: true,
      }).select("-password -googleId");

      if (!updated) {
        return res
          .status(404)
          .json({ status: "error", message: "Patient not found" });
      }

      if (resetCounts) {
        try {
          await Appointment.updateMany(
            { patientId: pid },
            { $set: { rescheduleCount: 0, rescheduleHistory: [] } }
          );
        } catch (apptErr) {
          console.warn(
            "Non-fatal: failed to reset appointment reschedule counters:",
            apptErr?.message || apptErr
          );
        }
      }

      return res.status(200).json({
        status: "success",
        data: updated,
        message: "Patient unblocked",
      });
    } catch (err) {
      console.error("Unblock patient error:", err);
      return res
        .status(500)
        .json({
          status: "error",
          message: "Failed to unblock patient",
          errors: [err.message],
        });
    }
  }
);

/**
 * PATCH /api/admin/patients/:id/reset-counts
 */
router.patch(
  "/:id/reset-counts",
  authenticate,
  requireRole("admin", "super_admin", "receptionist"),
  [param("id").isMongoId().withMessage("Invalid patient id")],
  validate,
  async (req, res) => {
    try {
      const pid = req.params.id;

      const updated = await Patient.findByIdAndUpdate(
        pid,
        {
          $set: {
            cancelCount: 0,
            rescheduleCount: 0,
            noShowCount: 0,
            clearedNoShowsAt: new Date(), // <-- NEW
          },
        },
        { new: true }
      ).select("-password -googleId");

      if (!updated) {
        return res
          .status(404)
          .json({ status: "error", message: "Patient not found" });
      }

      try {
        await Appointment.updateMany(
          { patientId: pid },
          { $set: { rescheduleCount: 0, rescheduleHistory: [] } }
        );
      } catch (apptErr) {
        console.warn(
          "Failed to reset appointment-level reschedule counts:",
          apptErr?.message || apptErr
        );
      }

      return res.status(200).json({
        status: "success",
        data: updated,
        message:
          "Patient counts reset (cancelCount & rescheduleCount cleared). Appointment reschedule counters reset.",
      });
    } catch (err) {
      console.error("Reset patient counts error:", err);
      return res
        .status(500)
        .json({
          status: "error",
          message: "Failed to reset counts",
          errors: [err.message],
        });
    }
  }
);

module.exports = router;