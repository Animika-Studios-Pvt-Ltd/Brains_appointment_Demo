/**
 * Create or update a Receptionist with userType call_center and a bcrypt password.
 * Sign in at the app /login with the same email + password.
 *
 * Usage (from backend/):
 *   node scripts/seedCallCenter.js "YourPassword12"
 *   node scripts/seedCallCenter.js "YourPassword12" other@example.com "Display Name"
 *   CALLCENTER_EMAIL=... CALLCENTER_NAME=... CALLCENTER_PASSWORD=... node scripts/seedCallCenter.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Receptionist = require('../modal/Receptionist');

async function main() {
  const plainPassword = process.argv[2] || process.env.CALLCENTER_PASSWORD;
  const email = (process.argv[3] || process.env.CALLCENTER_EMAIL || 'callcenter@brains.org.in')
    .trim()
    .toLowerCase();
  const name = (process.argv[4] || process.env.CALLCENTER_NAME || 'Call Center').trim();

  if (!plainPassword || String(plainPassword).length < 8) {
    console.error(
      'Missing or short password (min 8 chars). Pass as 1st argument or set CALLCENTER_PASSWORD in .env:\n' +
        '  node scripts/seedCallCenter.js "Password8chars+"'
    );
    process.exit(1);
  }

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set in backend/.env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const hash = bcrypt.hashSync(String(plainPassword), 10);

  const existing = await Receptionist.findOne({ email }).select('+password');
  if (existing) {
    existing.name = name || existing.name;
    existing.userType = 'call_center';
    existing.password = hash;
    existing.isVerified = true;
    existing.isActive = true;
    existing.status = 'active';
    await existing.save();
    console.log(`Updated call_center account with new password: ${email} (_id: ${existing._id})`);
    await mongoose.disconnect();
    process.exit(0);
  }

  const doc = await Receptionist.create({
    email,
    name,
    userType: 'call_center',
    password: hash,
    isVerified: true,
    isActive: true,
    status: 'active',
  });

  console.log(`Created call_center account: ${email} (_id: ${doc._id})`);
  console.log('Sign in at /login with this email and the password you provided.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
