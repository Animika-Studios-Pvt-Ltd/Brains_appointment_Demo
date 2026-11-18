const mongoose = require('mongoose');

const blockedSlotSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },

  // Mass Holiday batch id (so we can edit/delete all at once)
  batchId: {
    type: String,
    default: null
  },

  isMassHoliday: {
    type: Boolean,
    default: false
  },

  startTime: {
    type: Date,
    required: true
  },

  endTime: {
    type: Date,
    required: true
  },

  reason: {
    type: String,
    default: 'Blocked for personal use'
  },

  googleCalendar: {
    eventId: { type: String },
    synced: { type: Boolean, default: false },
    syncedAt: { type: Date },
    syncError: { type: String }
  },

}, { timestamps: true });


// Faster lookup per doctor
blockedSlotSchema.index({ doctorId: 1, startTime: 1, endTime: 1 });

// For mass holiday retrieval/edit/delete
blockedSlotSchema.index({ batchId: 1 });

// Querying mass holidays separately
blockedSlotSchema.index({ isMassHoliday: 1 });

module.exports = mongoose.model('BlockedSlot', blockedSlotSchema);
