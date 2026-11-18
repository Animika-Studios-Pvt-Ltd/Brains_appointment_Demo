/**
 * Create or promote a MongoDB Admin with role super_admin and a bcrypt password.
 * Sign in at the app /login with the same email + password.
 *
 * Usage (from backend/):
 *   node scripts/seedSuperAdmin.js you@example.com "Display Name" "YourPassword12"
 *   SUPERADMIN_EMAIL=... SUPERADMIN_NAME=... SUPERADMIN_BOOTSTRAP_PASSWORD=... node scripts/seedSuperAdmin.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Admin = require('../modal/Admin');

const SUPER_PERMISSIONS = [
  'manage_users',
  'manage_doctors',
  'manage_appointments',
  'view_analytics',
  'manage_holidays',
  'system_settings',
];

async function main() {
  const emailArg = process.argv[2];
  const nameArg = process.argv[3];
  const passwordArg = process.argv[4];
  const email = (emailArg || process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
  const name = (nameArg || process.env.SUPERADMIN_NAME || 'Super Admin').trim();
  const plainPassword =
    passwordArg ||
    process.env.SUPERADMIN_BOOTSTRAP_PASSWORD ||
    process.env.LOCAL_SUPERADMIN_PASSWORD;

  if (!email) {
    console.error(
      'Missing email. Set SUPERADMIN_EMAIL or pass as first argument:\n' +
        '  node scripts/seedSuperAdmin.js you@example.com "Your Name" "Password8chars+"'
    );
    process.exit(1);
  }

  if (!plainPassword || String(plainPassword).length < 8) {
    console.error(
      'Missing or short password (min 8 chars). Pass as 3rd argument or set SUPERADMIN_BOOTSTRAP_PASSWORD in .env'
    );
    process.exit(1);
  }

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set in backend/.env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const hash = bcrypt.hashSync(String(plainPassword), 10);

  const existing = await Admin.findOne({ email }).select('+password');
  if (existing) {
    existing.name = name || existing.name;
    existing.userType = 'super_admin';
    existing.role = 'super_admin';
    existing.permissions = SUPER_PERMISSIONS;
    existing.isVerified = true;
    existing.isActive = true;
    existing.password = hash;
    await existing.save();
    console.log(`Updated admin to super_admin with new password: ${email} (_id: ${existing._id})`);
    await mongoose.disconnect();
    process.exit(0);
  }

  const doc = await Admin.create({
    email,
    name,
    userType: 'super_admin',
    role: 'super_admin',
    password: hash,
    isVerified: true,
    isActive: true,
    profileImage: '',
    permissions: SUPER_PERMISSIONS,
  });

  console.log(`Created super_admin: ${email} (_id: ${doc._id})`);
  console.log('Sign in at /login with this email and the password you provided.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
