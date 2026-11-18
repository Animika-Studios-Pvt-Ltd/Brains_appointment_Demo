/* Temporary testing script: reset cancel/reschedule counters */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const patients = await mongoose.connection.db.collection('patients').updateMany(
    {},
    { $set: { cancelCount: 0, rescheduleCount: 0 } }
  );
  console.log('patients reset:', patients.modifiedCount);

  const testing = await mongoose.connection.db
    .collection('appointment-testing')
    .updateMany({}, { $set: { rescheduleCount: 0 } });
  console.log('appointment-testing rescheduleCount reset:', testing.modifiedCount);

  const appointments = await mongoose.connection.db
    .collection('appointments')
    .updateMany({}, { $set: { rescheduleCount: 0 } });
  console.log('appointments rescheduleCount reset:', appointments.modifiedCount);

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
