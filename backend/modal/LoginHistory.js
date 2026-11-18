const mongoose = require('mongoose');

const loginHistorySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  userEmail: { type: String, required: true },
  userType: {
    type: String,
    enum: ['admin', 'super_admin', 'doctor', 'receptionist', 'call_center'],
    required: true
  },
  action: {
    type: String,
    enum: ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_RESET', 'GOOGLE_LOGIN'],
    required: true
  },
  status: {
    type: String,
    enum: ['SUCCESS', 'FAILED'],
    default: 'SUCCESS'
  },
  failureReason: { type: String, default: null },
  ipAddress: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
  timestampIST: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed }
}, {
  timestamps: true
});

loginHistorySchema.index({ userId: 1, timestamp: -1 });
loginHistorySchema.index({ userEmail: 1, timestamp: -1 });
loginHistorySchema.index({ userType: 1, timestamp: -1 });
loginHistorySchema.index({ action: 1, timestamp: -1 });
loginHistorySchema.index({ timestamp: -1 });

module.exports = mongoose.model('LoginHistory', loginHistorySchema);
