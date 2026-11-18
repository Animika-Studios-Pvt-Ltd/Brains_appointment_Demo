const mongoose = require('mongoose');

function generateInitialsAvatar(name) {
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return 'https://ui-avatars.com/api/?name=D&background=4f46e5&color=fff&size=500';
  }
  const initials = name.trim().split(' ').filter(n => n).map(n => n[0]).join('').toUpperCase().slice(0, 2);
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=4f46e5&color=fff&size=500&bold=true`;
}

// ✅ SIMPLIFIED: Single time range schema with optional day
const timeRangeSchema = new mongoose.Schema({
  day: { type: Number, min: 0, max: 6 }, // 0=Sun, 1=Mon, ..., 6=Sat (optional for default mode)
  start: { type: String, required: true }, // "09:00"
  end: { type: String, required: true },    // "17:00"
  vipSlots: { type: Number, default: 0 },
  vipTimings: { type: [String], default: [] },
  isOnline: { type: Boolean, default: false }
}, { _id: false });

const availabilityRangeSchema = new mongoose.Schema({
  startDate: { type: Date },
  endDate: { type: Date },
  excludedWeekdays: { type: [Number], default: [] }
}, { _id: false });

const googleCalendarSchema = new mongoose.Schema({
  connected: { type: Boolean, default: false },
  accessToken: { type: String },
  refreshToken: { type: String },
  tokenExpiry: { type: Date },
  expiryDate: { type: Number },
  scope: { type: String },
  tokenType: { type: String },
  calendarId: { type: String, default: 'primary' },
  workCalendarId: { type: String },
  email: { type: String },
  isConnected: { type: Boolean, default: false },
  connectedAt: { type: Date }
}, { _id: false });

const doctorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, select: false },
  googleId: { type: String, unique: true, sparse: true },
  userType: { type: String, default: 'doctor', enum: ['doctor'] },
  profileImage: { type: String, default: '' },
  specialization: {
    type: String,
    enum: [
      "Neurologist",
      "General Physician",
      "Clinical Psychologist",
    ]
  },
  qualification: { type: String },
  experience: { type: Number },
  about: { type: String },
  fees: { type: Number },

  // ✅ SIMPLIFIED AVAILABILITY
  availabilityMode: {
    type: String,
    enum: ['default', 'custom'],
    default: 'default'
  },

  availabilityRange: availabilityRangeSchema,

  // ✅ UNIFIED: Works for both modes
  // - Default mode: array of { start, end } (no day field)
  // - Custom mode: array of { day, start, end }
  dailyTimeRanges: {
    type: [timeRangeSchema],
    default: []
  },

  // ✅ Appointment Duration
  appointmentDuration: {
    type: Number,
    enum: [15, 30, 45, 60],
    default: 30,
    required: true
  },

  slotDurationMinutes: { type: Number, default: 30 }, // Legacy

  googleCalendar: googleCalendarSchema,
  isVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ['invited', 'active', 'inactive', 'suspended'],
    default: 'invited'
  },
  suspensionReason: { type: String },
  suspendedAt: { type: Date }
}, { timestamps: true });

// Pre-save sync
doctorSchema.pre('save', function (next) {
  if (this.appointmentDuration) {
    this.slotDurationMinutes = this.appointmentDuration;
  }
  next();
});

doctorSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  if (update.appointmentDuration) {
    update.slotDurationMinutes = update.appointmentDuration;
  }
  if (update.$set && update.$set.appointmentDuration) {
    update.$set.slotDurationMinutes = update.$set.appointmentDuration;
  }
  next();
});

const { registerCloudinaryAvatarHooks } = require('../utils/avatar');
registerCloudinaryAvatarHooks(doctorSchema, 'healthapp/doctors/avatars');

module.exports = mongoose.model('Doctor', doctorSchema);