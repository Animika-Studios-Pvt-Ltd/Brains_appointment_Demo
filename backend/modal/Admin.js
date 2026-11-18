const mongoose = require('mongoose');

// Google Calendar integration schema
const googleCalendarSchema = new mongoose.Schema({
  connected: { type: Boolean, default: false },
  accessToken: { type: String },
  refreshToken: { type: String },
  tokenExpiry: { type: Date },
  calendarId: { type: String, default: 'primary' },
  email: { type: String }, // Their Google email
}, { _id: false });

const adminSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
    },
    userType: {
      type: String,
      enum: ['admin', 'super_admin'],
      required: true
    },
    role: {
      type: String,
      enum: ['admin', 'super_admin'],
      default: 'admin',
    },
    googleId: { type: String, unique: true, sparse: true },

    password: {
      type: String,
      select: false,
    },

    // Google Calendar Integration
    googleCalendar: googleCalendarSchema,

    isVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    profileImage: { type: String, default: '' },
    permissions: [{
      type: String,
      enum: [
        'manage_users',
        'manage_doctors',
        'manage_appointments',
        'view_analytics',
        'manage_holidays',
        'system_settings',
      ],
    }],
    lastLogin: Date,
  },
  { timestamps: true }
);

const { registerCloudinaryAvatarHooks } = require('../utils/avatar');
registerCloudinaryAvatarHooks(adminSchema, 'healthapp/admins/avatars');

module.exports = mongoose.model('Admin', adminSchema);
