// backend/routes/adminAnalytics.js
const express = require('express');
const router = express.Router();
const Appointment = require('../modal/Appointment');
const Doctor = require('../modal/Doctor');
const Patient = require('../modal/Patient');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const { query } = require('express-validator');
const { validate } = require('../middleware/validate');

function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23,59,59,999); return x; }

// --- daily series ---
// GET /api/admin/analytics/daily?days=30
router.get(
  '/daily',
  authenticate,
  requireRole('admin','super_admin'),
  [ query('days').optional().toInt() ],
  validate,
  async (req, res) => {
    try {
      const days = Math.min(90, Math.max(7, Number(req.query.days || 30)));
      const end = endOfDay(new Date());
      const start = startOfDay(new Date(Date.now() - (days-1) * 24*60*60*1000));

      // aggregate appointments by date
      const agg = await Appointment.aggregate([
        { $match: { slotStartIso: { $gte: start, $lte: end } } },
        {
          $project: {
            dateOnly: {
              $dateToString: { format: "%Y-%m-%d", date: "$slotStartIso" }
            },
            status: 1
          }
        },
        {
          $group: {
            _id: "$dateOnly",
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: [ { $toLower: "$status" }, "completed" ] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $eq: [ { $toLower: "$status" }, "scheduled" ] }, 1, 0] } }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // convert to map for fast lookup
      const byDate = (agg || []).reduce((acc, r) => { acc[r._id] = r; return acc; }, {});

      // produce full series for each day in range
      const out = [];
      for (let i = 0; i < days; i++) {
        const d = new Date(start.getTime() + i * 24*60*60*1000);
        const key = d.toISOString().slice(0,10); // YYYY-MM-DD
        const row = byDate[key] || { total: 0, completed: 0, pending: 0 };
        // label e.g. Nov 19 2025
        const label = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).replace(',', '');
        out.push({ date: label, iso: key, appointments: row.total, completed: row.completed, pending: row.pending });
      }

      return res.json({ success: true, data: out });
    } catch (err) {
      console.error('Analytics daily error', err);
      return res.status(500).json({ success: false, message: err.message, data: null });
    }
  }
);

// --- monthly series ---
// GET /api/admin/analytics/monthly?months=12
router.get(
  '/monthly',
  authenticate,
  requireRole('admin','super_admin'),
  [ query('months').optional().toInt() ],
  validate,
  async (req, res) => {
    try {
      const months = Math.min(36, Math.max(3, Number(req.query.months || 12)));
      const end = new Date();
      const start = new Date(end.getFullYear(), end.getMonth() - (months-1), 1);

      // group by year-month
      const agg = await Appointment.aggregate([
        { $match: { slotStartIso: { $gte: start, $lte: end } } },
        {
          $project: {
            ym: {
              $dateToString: { format: "%Y-%m", date: "$slotStartIso" }
            }
          }
        },
        {
          $group: {
            _id: "$ym",
            total: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      const byYm = (agg || []).reduce((s, r) => { s[r._id] = r.total; return s; }, {});
      const out = [];
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
        const ymKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; // YYYY-MM
        const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        out.push({ month: label, ym: ymKey, appointments: byYm[ymKey] || 0 });
      }

      return res.json({ success: true, data: out });
    } catch (err) {
      console.error('Analytics monthly error', err);
      return res.status(500).json({ success: false, message: err.message, data: null });
    }
  }
);

// --- by-status ---
// GET /api/admin/analytics/by-status
router.get(
  '/by-status',
  authenticate,
  requireRole('admin','super_admin'),
  async (req, res) => {
    try {
      const agg = await Appointment.aggregate([
        {
          $group: {
            _id: { $toLower: "$status" },
            count: { $sum: 1 }
          }
        }
      ]);
      const out = (agg || []).map(a => ({ name: (a._id || 'unknown').replace(/^\w/, c => c.toUpperCase()), value: a.count }));
      return res.json({ success: true, data: out });
    } catch (err) {
      console.error('Analytics by-status error', err);
      return res.status(500).json({ success: false, message: err.message, data: null });
    }
  }
);

// --- detailed appointments list ---
// GET /api/admin/analytics/appointments?month=YYYY-MM
router.get(
  '/appointments',
  authenticate,
  requireRole('admin', 'super_admin'),
  async (req, res) => {
    try {
      const monthParam = req.query.month;
      let matchQuery = {};

      if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
        const [y, m] = monthParam.split('-').map(Number);
        const start = new Date(y, m - 1, 1);
        const end = new Date(y, m, 0, 23, 59, 59, 999);
        matchQuery = { slotStartIso: { $gte: start, $lte: end } };
      }

      const appointments = await Appointment.find(matchQuery)
        .populate("patientId", "name phone email profileImage")
        .populate("doctorId", "name specialization profileImage")
        .sort({ slotStartIso: -1 });

      return res.json({ success: true, data: appointments });
    } catch (err) {
      console.error('Analytics appointments list error', err);
      return res.status(500).json({ success: false, message: err.message, data: null });
    }
  }
);

// --- high-level stats (enhanced) ---
// GET /api/admin/analytics/stats?month=YYYY-MM
router.get(
  '/stats',
  authenticate,
  requireRole('admin','super_admin'),
  async (req, res) => {
    try {
      const monthParam = req.query.month;
      const totalDoctors = await Doctor.countDocuments({});
      const totalPatients = await Patient.countDocuments({});
      let totalAdmins = 0;
      try {
        const Admin = require('../modal/Admin');
        totalAdmins = await Admin.countDocuments({});
      } catch (err) {
        // Ignore if Admin model is not present or configured
      }

      let startQueryDate, endQueryDate;
      let isFiltered = false;
      let year = null;
      let month = null;

      if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
        const [y, m] = monthParam.split('-').map(Number);
        year = y;
        month = m;
        startQueryDate = new Date(y, m - 1, 1);
        endQueryDate = new Date(y, m, 0, 23, 59, 59, 999);
        isFiltered = true;
      }

      const now = new Date();
      let matchQuery = {};
      if (isFiltered) {
        matchQuery = { slotStartIso: { $gte: startQueryDate, $lte: endQueryDate } };
      }

      // 1. Total appointments count in this period
      const totalPeriodAppts = await Appointment.countDocuments(matchQuery);

      // 2. Pending, Completed, No Show, Cancelled status aggregation for this period
      const statusBreakdownRaw = await Appointment.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: { $toLower: "$status" },
            count: { $sum: 1 }
          }
        }
      ]);
      const statusBreakdown = statusBreakdownRaw.map(a => ({
        name: (a._id || 'unknown').replace(/^\w/, c => c.toUpperCase()),
        value: a.count
      }));

      // Find individual values for completed, pending, cancelled, no-show
      const completedCount = statusBreakdownRaw.find(a => a._id === 'completed')?.count || 0;
      const pendingCount = statusBreakdownRaw.find(a => ['scheduled', 'pending'].includes(a._id))?.count || 0;
      const cancelledCount = statusBreakdownRaw.find(a => a._id === 'cancelled')?.count || 0;
      const isMissedStatusKey = (id) => {
        const raw = String(id || '').toLowerCase().trim();
        const compact = raw.replace(/\s+/g, '');
        return (
          compact === 'noshow' ||
          raw === 'no show' ||
          raw === 'no-show' ||
          raw === 'missed' ||
          raw === 'expired'
        );
      };
      const noShowCount = statusBreakdownRaw
        .filter((a) => isMissedStatusKey(a._id))
        .reduce((sum, a) => sum + (a.count || 0), 0);

      // 3. No Show Percentage for this period
      const noShowPercent = totalPeriodAppts ? Math.round((noShowCount / totalPeriodAppts) * 10000) / 100 : 0;

      // 4. Avg appointments per doctor in this period
      const avgPerDoctorMonth = totalDoctors ? (totalPeriodAppts / totalDoctors) : 0;

      // 5. Specialty breakdown
      const specialtyAgg = await Appointment.aggregate([
        { $match: matchQuery },
        {
          $lookup: {
            from: "doctors",
            localField: "doctorId",
            foreignField: "_id",
            as: "doctorInfo"
          }
        },
        { $unwind: { path: "$doctorInfo", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: "$doctorInfo.specialization",
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]);
      const specialtyData = specialtyAgg
        .filter(s => s._id)
        .map(s => ({
          name: s._id,
          value: s.count
        }));

      // 6. Doctor Performance Leaderboard
      const doctorAgg = await Appointment.aggregate([
        { $match: matchQuery },
        {
          $lookup: {
            from: "doctors",
            localField: "doctorId",
            foreignField: "_id",
            as: "doctorInfo"
          }
        },
        { $unwind: { path: "$doctorInfo", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: "$doctorInfo._id",
            name: { $first: { $ifNull: ["$doctorInfo.name", "Unknown Doctor"] } },
            specialization: { $first: { $ifNull: ["$doctorInfo.specialization", "General"] } },
            profileImage: { $first: { $ifNull: ["$doctorInfo.profileImage", ""] } },
            count: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: [ { $toLower: "$status" }, "completed" ] }, 1, 0] } }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]);
      const doctorLeaderboard = doctorAgg
        .filter(d => d._id)
        .map(d => ({
          id: d._id,
          name: d.name,
          specialization: d.specialization,
          profileImage: d.profileImage,
          appointments: d.count,
          completed: d.completed
        }));

      // 7. Daily trend for the chosen period
      let dailySeries = [];
      if (isFiltered) {
        // daily series specifically for this month
        const aggDaily = await Appointment.aggregate([
          { $match: matchQuery },
          {
            $project: {
              dateOnly: { $dateToString: { format: "%Y-%m-%d", date: "$slotStartIso" } },
              status: 1
            }
          },
          {
            $group: {
              _id: "$dateOnly",
              total: { $sum: 1 },
              completed: { $sum: { $cond: [{ $eq: [{ $toLower: "$status" }, "completed"] }, 1, 0] } },
              pending: { $sum: { $cond: [{ $eq: [{ $toLower: "$status" }, "scheduled"] }, 1, 0] } }
            }
          },
          { $sort: { _id: 1 } }
        ]);

        const byDate = aggDaily.reduce((acc, r) => { acc[r._id] = r; return acc; }, {});
        const daysInMonth = new Date(year, month, 0).getDate();
        for (let i = 1; i <= daysInMonth; i++) {
          const d = new Date(year, month - 1, i);
          const key = `${year}-${String(month).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
          const row = byDate[key] || { total: 0, completed: 0, pending: 0 };
          const label = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
          dailySeries.push({
            date: label,
            iso: key,
            appointments: row.total,
            completed: row.completed,
            pending: row.pending
          });
        }
      } else {
        // Default All Time or last 30 days
        const end = endOfDay(now);
        const start = startOfDay(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));
        const aggDaily = await Appointment.aggregate([
          { $match: { slotStartIso: { $gte: start, $lte: end } } },
          {
            $project: {
              dateOnly: { $dateToString: { format: "%Y-%m-%d", date: "$slotStartIso" } },
              status: 1
            }
          },
          {
            $group: {
              _id: "$dateOnly",
              total: { $sum: 1 },
              completed: { $sum: { $cond: [{ $eq: [{ $toLower: "$status" }, "completed"] }, 1, 0] } },
              pending: { $sum: { $cond: [{ $eq: [{ $toLower: "$status" }, "scheduled"] }, 1, 0] } }
            }
          },
          { $sort: { _id: 1 } }
        ]);

        const byDate = aggDaily.reduce((acc, r) => { acc[r._id] = r; return acc; }, {});
        for (let i = 29; i >= 0; i--) {
          const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          const key = d.toISOString().slice(0, 10);
          const row = byDate[key] || { total: 0, completed: 0, pending: 0 };
          const label = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
          dailySeries.push({
            date: label,
            iso: key,
            appointments: row.total,
            completed: row.completed,
            pending: row.pending
          });
        }
      }

      // 8. Booking source breakdown
      const sourceAgg = await Appointment.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: { $ifNull: ["$bookedBy", "self"] },
            count: { $sum: 1 }
          }
        }
      ]);

      const sourceMap = {
        self: "Self Booking",
        receptionist: "Receptionist",
        "call center": "Call Center",
        admin: "Admin"
      };

      const sourceCounts = {
        self: 0,
        receptionist: 0,
        "call center": 0,
        admin: 0
      };

      sourceAgg.forEach(s => {
        const key = s._id || "self";
        if (sourceCounts[key] !== undefined) {
          sourceCounts[key] = s.count;
        } else {
          sourceCounts[key] = (sourceCounts[key] || 0) + s.count;
        }
      });

      const sourceData = Object.keys(sourceCounts).map(key => ({
        name: sourceMap[key] || key.replace(/^\w/, c => c.toUpperCase()),
        value: sourceCounts[key]
      }));

      // Return unified response
      return res.json({
        success: true,
        data: {
          users: { totalDoctors, totalPatients, totalAdmins },
          appointments: {
            total: totalPeriodAppts,
            completed: completedCount,
            pending: pendingCount,
            cancelled: cancelledCount,
            noShow: noShowCount,
            avgPerDoctorMonth: Number((avgPerDoctorMonth).toFixed(2)),
            noShowPercent,
            byDay: dailySeries,
            byStatus: statusBreakdown,
            doctorLeaderboard,
            specialtyData,
            bySource: sourceData
          }
        }
      });
    } catch (err) {
      console.error('Analytics stats error', err);
      return res.status(500).json({ success: false, message: err.message, data: null });
    }
  }
);

module.exports = router;