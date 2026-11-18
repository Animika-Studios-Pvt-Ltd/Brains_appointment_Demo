// backend/scripts/checkDoctors.js
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const Doctor = require('../modal/Doctor');

async function checkDoctors() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);

    const doctors = await Doctor.find({});
    console.log(`Found ${doctors.length} total doctor records in DB:`);
    doctors.forEach(d => {
      console.log(`- Name: ${d.name}, isVerified: ${d.isVerified}, isActive: ${d.isActive}, status: ${d.status}`);
    });

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

checkDoctors();
