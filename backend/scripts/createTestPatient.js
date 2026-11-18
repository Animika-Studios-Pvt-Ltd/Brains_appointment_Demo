// backend/scripts/createTestPatient.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const Patient = require('../modal/Patient');

async function createPatient() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/brains_appointment';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);

    const email = 'test@test.co';
    const plainPassword = 'q1w2';
    
    // Check if user already exists
    let patient = await Patient.findOne({ email });
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    if (patient) {
      console.log(`User ${email} already exists. Updating password...`);
      patient.password = hashedPassword;
      patient.isVerified = true;
      patient.isActive = true;
      await patient.save();
      console.log(`✅ Updated existing user: ${email} with new password.`);
    } else {
      patient = new Patient({
        name: 'Test Patient',
        email: email,
        password: hashedPassword,
        phone: '+1234567890',
        userType: 'patient',
        isVerified: true,
        isActive: true,
      });
      await patient.save();
      console.log(`✅ Patient account created successfully!`);
      console.log(`Email: ${email}`);
      console.log(`Password: ${plainPassword}`);
    }
  } catch (error) {
    console.error('❌ Error creating user:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

createPatient();
