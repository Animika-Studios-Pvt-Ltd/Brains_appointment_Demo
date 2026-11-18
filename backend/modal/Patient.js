// backend/modal/Patient.js
const mongoose = require("mongoose");
const { computeAgeFromDob } = require("../utils/date");

function generateInitialsAvatar(name) {
  if (!name) return 'https://ui-avatars.com/api/?name=U&background=random&color=fff&size=500';
  const initials = name.trim().split(' ').filter(n => n).map(n => n[0]).join('').toUpperCase().slice(0, 2);
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=random&color=fff&size=500&bold=true`;
}

const emergencyContactSchema = new mongoose.Schema({
  name: { type: String, required: false },
  phone: { type: String, required: false },
  relationship: { type: String, required: false },
}, { _id: false });

const medicalHistorySchema = new mongoose.Schema({
  allergies: { type: String, default: '' },
  currentMedications: { type: String, default: '' },
  chronicConditions: { type: String, default: '' },
  vaccinations: { type: String, default: '' },
}, { _id: false });

const medicalDocumentSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['pdf', 'image', 'scan', 'medical_history', 'allergies', 'vaccination'],
    required: true,
  },
  title: { type: String, default: '' },
  url: { type: String, default: '' },
  mimeType: { type: String, default: '' },
  fileName: { type: String, default: '' },
  notes: { type: String, default: '' },
  uploadedAt: { type: Date, default: Date.now },
}, { _id: true });

const googleCalendarSchema = new mongoose.Schema({
  connected: { type: Boolean, default: false },
  accessToken: { type: String },
  refreshToken: { type: String },
  tokenExpiry: { type: Date },
  calendarId: { type: String, default: 'primary' },
  email: { type: String },
}, { _id: false });

const patientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, select: false },
  googleId: { type: String, unique: true, sparse: true },
  userType: { type: String, default: 'patient', enum: ['patient'] },
  profileImage: { type: String, default: function() { return generateInitialsAvatar(this.name); } },
  phone: { type: String },
  address: { type: String, default: '' },
  dob: { type: Date },
  age: { type: Number },
  gender: { type: String, enum: ['male', 'female', 'other'] },
  bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
  emergencyContact: emergencyContactSchema,
  medicalHistory: medicalHistorySchema,
  medicalDocuments: { type: [medicalDocumentSchema], default: [] },
  googleCalendar: googleCalendarSchema,
  isVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },

  // existing counters
  cancelCount: { type: Number, default: 0, index: true },

  // track how many times patient has rescheduled (aggregated across appointments)
  rescheduleCount: { type: Number, default: 0, index: true },

  // track no-show count (for auto-blocking)
  noShowCount: { type: Number, default: 0, index: true },

  // admin-controlled block state
  isBlocked: { type: Boolean, default: false, index: true },
  blockedAt: { type: Date, default: null },
  blockedReason: { type: String, default: null },

  // who blocked them (reference + meta)
  blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  blockedByType: {
    type: String,
    enum: ['admin', 'super_admin', 'receptionist', 'doctor', 'patient', null],
    default: null,
  },

  // 🔥 NEW: store the human-readable name of the blocker
  blockedByName: { type: String, default: null },

  // inside Patient schema definition
  clearedNoShowsAt: {
    type: Date,
    default: null,
    index: false // optional: you can add an index if you expect queries on this field
  },


}, { timestamps: true });

patientSchema.pre('save', function (next) {
  if (this.dob && this.isModified('dob')) {
    this.age = computeAgeFromDob(this.dob);
  }
  next();
});

const { registerCloudinaryAvatarHooks } = require('../utils/avatar');
registerCloudinaryAvatarHooks(patientSchema, 'healthapp/patients/avatars');

module.exports = mongoose.model('Patient', patientSchema);
