// backend/modal/Receptionist.js
const mongoose = require("mongoose");

// Google Calendar Schema (kept for integration consistency)
const googleCalendarSchema = new mongoose.Schema(
  {
    connected: { type: Boolean, default: false },
    accessToken: { type: String },
    refreshToken: { type: String },
    tokenExpiry: { type: Date },
    calendarId: { type: String, default: "primary" },
    email: { type: String },
  },
  { _id: false }
);

const receptionistSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },

    phone: {
      type: String,
      default: null,
      index: true,
    },

    password: {
      type: String,
      select: false,
    },

    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },

    userType: {
      type: String,
      enum: ["receptionist", "call_center"],
      default: "receptionist",
    },

    profileImage: { type: String, default: "" },

    googleCalendar: googleCalendarSchema,

    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },

    // Permissions
    // permissions: [
    //   {
    //     type: String,
    //     enum: [
    //       "view_appointments",
    //       "book_appointments",
    //       "edit_appointments",
    //       "cancel_appointments",
    //       "checkin_patients",
    //       "manage_walkins",
    //     ],
    //   },
    // ],

    // Created by Admin
    createdByAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },

    // Account status (active/suspended/inactive)
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
    },

    suspendedAt: { type: Date },
    suspensionReason: { type: String },
  },
  { timestamps: true }
);

const { registerCloudinaryAvatarHooks } = require('../utils/avatar');
registerCloudinaryAvatarHooks(receptionistSchema, 'healthapp/receptionists/avatars');

module.exports = mongoose.model("Receptionist", receptionistSchema);
