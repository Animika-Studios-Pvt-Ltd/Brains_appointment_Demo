const mongoose = require('mongoose');
const Appointment = require('./Appointment');

/**
 * Mirror of Appointment for mobile-app booking tests.
 * Collection name in MongoDB: appointment-testing
 */
const appointmentTestingSchema = Appointment.schema.clone();

module.exports = mongoose.model(
  'AppointmentTesting',
  appointmentTestingSchema,
  'appointment-testing'
);
