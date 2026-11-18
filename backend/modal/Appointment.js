const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Doctor",
    required: true,
    index: true,
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient",
    required: true,
    index: true,
  },

  date: { type: Date, required: true },
  slotStartIso: { type: Date, required: true },
  slotEndIso: { type: Date, required: true },

  status: {
    type: String,
    enum: [
      "Scheduled",
      "Completed",
      "Cancelled",
      "In Progress",
      "Rescheduled",
      "Reassigned",
      "Missed",
      "No Show", // legacy records
    ],
    default: "Scheduled",
    index: true,
  },

  // clinical fields
  symptoms: { type: String, default: '' },
  prescription: { type: String, default: '' },
  notes: { type: String, default: '' },

  cancelReason: { type: String, default: null },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'cancelledByType', default: null },
  cancelledByType: { type: String, enum: ['patient', 'doctor', 'admin', 'super_admin', 'receptionist', 'call_center', null], default: null },
  cancelledAt: { type: Date, default: null },

  rescheduleCount: { type: Number, default: 0 },
  rescheduleHistory: [
    {
      by: { type: mongoose.Schema.Types.ObjectId, refPath: 'rescheduleHistory.byType', default: null },
      byType: { type: String, enum: ['patient', 'doctor', 'admin', 'receptionist', 'call_center', 'super_admin', null], default: null },
      at: { type: Date, default: Date.now },
      from: { start: Date, end: Date, date: Date },
      to: { start: Date, end: Date, date: Date },
      note: { type: String, default: "" },
    }
  ],
  rescheduledTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },

  previousDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', default: null },

  reassignCount: { type: Number, default: 0 },

  reassignHistory: [
    {
      by: { type: mongoose.Schema.Types.ObjectId, refPath: 'reassignHistory.byType', default: null },
      byType: { type: String, enum: ['admin', 'receptionist', 'call_center', 'super_admin', 'doctor', null], default: null },
      at: { type: Date, default: Date.now },
      fromDoctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', default: null },
      toDoctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', default: null },
      from: { start: Date, end: Date, date: Date },
      to: { start: Date, end: Date, date: Date },
      note: { type: String, default: "" },
    }
  ],

  // ---------- google calendar sync metadata ----------
  googleCalendar: {
    eventId: { type: String },
    eventLink: { type: String },
    meetLink: { type: String },
    synced: { type: Boolean, default: false },
    syncError: { type: String },
    lastSyncedAt: { type: Date },
  },

  bookedBy: {
    type: String,
    enum: ["self", "receptionist", "call center", "admin", null],
    default: "self",
    index: true,
  },

  // Patient booking payment preference
  paymentMode: {
    type: String,
    enum: ["offline", "online", null],
    default: "offline",
    index: true,
  },
  paymentStatus: {
    type: String,
    enum: ["unpaid", "pending", "paid", "cancelled", null],
    default: "unpaid",
  },
  paymentAmount: {
    type: Number,
    default: null,
  },
  razorpayOrderId: {
    type: String,
    default: null,
    index: true,
  },
  razorpayPaymentId: {
    type: String,
    default: null,
  },

  // One-hour Google Meet reminder email (online appointments only)
  meetReminderSentAt: { type: Date, default: null },
  meetReminderForSlotStartIso: { type: Date, default: null },

}, { timestamps: true });


appointmentSchema.index(
  { doctorId: 1, slotStartIso: 1, slotEndIso: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $ne: "Cancelled" } }
  }
);

// helpful query indexes
appointmentSchema.index({ doctorId: 1, slotStartIso: 1, status: 1 });
appointmentSchema.index({ patientId: 1, slotStartIso: 1 });

module.exports = mongoose.model('Appointment', appointmentSchema);
