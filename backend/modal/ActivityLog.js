const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  userName: { type: String, required: true },
  userEmail: { type: String, required: true },
  userId: { type: String, required: true },
  userType: {
    type: String,
    enum: ['admin', 'super_admin', 'doctor', 'receptionist', 'call_center'],
    required: true
  },
  action: { type: String, required: true },
  description: { type: String },
  ipAddress: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now }, // UTC for queries
  timestampIST: { type: String }, // IST string for display
  metadata: mongoose.Schema.Types.Mixed,
}, {
  timestamps: true
});

// Indexes for faster queries
activityLogSchema.index({ userId: 1, timestamp: -1 });
activityLogSchema.index({ userEmail: 1, timestamp: -1 });
activityLogSchema.index({ userType: 1, timestamp: -1 });
activityLogSchema.index({ action: 1, timestamp: -1 });
activityLogSchema.index({ timestamp: -1 });

// TTL Index: Automatically auto-delete each log document 45 days after creation (45 * 24 * 60 * 60 = 3888000 seconds)
activityLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 3888000 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
