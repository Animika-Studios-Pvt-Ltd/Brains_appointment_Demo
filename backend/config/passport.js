const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const Patient = require("../modal/Patient");
const Doctor = require("../modal/Doctor");
const Admin = require("../modal/Admin");
const Receptionist = require("../modal/Receptionist");

require("dotenv").config();

passport.use(
  "google",
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Login only — calendar/gmail use GOOGLE_REDIRECT_URI (/api/google/callback)
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        "http://localhost:8000/api/auth/google/callback",
      passReqToCallback: true,
      proxy: true, // Trust reverse proxy secure headers (Railway, Cloudflare)
    },

    async (req, accessToken, refreshToken, profile, done) => {
      try {
        console.log("🔐 Passport Google strategy for:", profile?.emails?.[0]?.value);
        const rawState = req.query.state;
        let userType = "patient";
        if (typeof rawState === "string" && rawState.trim()) {
          try {
            const decoded = Buffer.from(rawState, "base64url").toString("utf8");
            const parsed = JSON.parse(decoded);
            userType = String(parsed.type || "patient").trim().toLowerCase();
          } catch {
            try {
              userType = decodeURIComponent(rawState).trim().toLowerCase();
            } catch {
              userType = rawState.trim().toLowerCase();
            }
          }
        }

        const { emails, displayName, photos } = profile;
        const email = (emails?.[0]?.value || "").trim().toLowerCase();
        const photo = photos?.[0]?.value;

        if (!email) {
          return done(new Error("Google account has no email; cannot sign in."));
        }

        // Extract Birthday
        let dob = null;
        if (profile._json.birthdays && profile._json.birthdays[0] && profile._json.birthdays[0].date) {
          const { year, month, day } = profile._json.birthdays[0].date;
          if (year && month && day) {
            dob = new Date(year, month - 1, day);
          }
        }

        // Extract Gender
        let gender = profile._json.genders?.[0]?.value;
        if (gender === 'unspecified') gender = 'other'; // Map to our enum
        if (gender && typeof gender === 'string') {
          gender = gender.toLowerCase();
          if (!['male', 'female', 'other'].includes(gender)) gender = 'other';
        }

        // 1. Search Admin
        let user = await Admin.findOne({ email });
        if (user) {
          const resolvedType = user.userType || user.role || "admin";
          user.googleId = profile.id;
          if (photo) user.profileImage = photo;
          user.googleCalendar = {
            ...(user.googleCalendar || {}),
            connected: true,
            accessToken,
            refreshToken,
            tokenExpiry: new Date(Date.now() + 3600 * 1000),
            email: email
          };
          await user.save();
          return done(null, { user, type: resolvedType });
        }

        // 2. Search Doctor
        user = await Doctor.findOne({ email });
        if (user) {
          user.googleId = profile.id;
          if (photo) user.profileImage = photo;
          user.googleCalendar = {
            ...(user.googleCalendar || {}),
            connected: true,
            isConnected: true,
            accessToken,
            refreshToken,
            tokenExpiry: new Date(Date.now() + 3600 * 1000),
            email: email
          };
          await user.save();
          return done(null, { user, type: "doctor" });
        }

        // 3. Search Receptionist
        user = await Receptionist.findOne({ email });
        if (user) {
          user.googleId = profile.id;
          if (photo) user.profileImage = photo;
          user.googleCalendar = {
            ...(user.googleCalendar || {}),
            connected: true,
            accessToken,
            refreshToken,
            tokenExpiry: new Date(Date.now() + 3600 * 1000),
            email: email
          };
          await user.save();
          return done(null, { user, type: "receptionist" });
        }

        // 4. Search Patient
        user = await Patient.findOne({ email });
        if (user) {
          user.googleId = profile.id;
          if (photo) user.profileImage = photo;
          if (!user.dob) user.dob = dob;
          if (!user.gender) user.gender = gender;
          user.googleCalendar = {
            ...(user.googleCalendar || {}),
            connected: true,
            accessToken,
            refreshToken,
            tokenExpiry: new Date(Date.now() + 3600 * 1000),
            email: email
          };
          await user.save();
          return done(null, { user, type: "patient" });
        }

        // 5. Create new user if not found in any collection
        if (userType === "doctor") {
          user = await Doctor.create({
            googleId: profile.id,
            email,
            name: displayName,
            profileImage: photo,
            isVerified: true,
            isActive: true,
            status: 'active',
            googleCalendar: {
              connected: true,
              isConnected: true,
              accessToken,
              refreshToken,
              tokenExpiry: new Date(Date.now() + 3600 * 1000),
              email: email
            }
          });
          return done(null, { user, type: "doctor" });
        } else {
          user = await Patient.create({
            googleId: profile.id,
            email,
            name: displayName,
            profileImage: photo,
            isVerified: true,
            dob,
            gender,
            googleCalendar: {
              connected: true,
              accessToken,
              refreshToken,
              tokenExpiry: new Date(Date.now() + 3600 * 1000),
              email: email
            }
          });
          return done(null, { user, type: "patient" });
        }
      } catch (error) {
        return done(error);
      }
    }
  )
);


module.exports = passport;
