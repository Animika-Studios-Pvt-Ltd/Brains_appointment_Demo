// backend/routes/patientPayments.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');
const Patient = require('../modal/Patient');
const Doctor = require('../modal/Doctor');
const Appointment = require('../modal/Appointment');
const AppointmentTesting = require('../modal/AppointmentTesting');
const BlockedSlot = require('../modal/BlockedSlot');
const SystemSetting = require('../modal/SystemSetting');
const { isSlotVip, toIstParts } = require('../utils/slotFinder');
const { recordActivity } = require('../services/activityLogger');
const { syncPatientBookingExternal } = require('../services/patientBookingSync');
const { validateAppointmentAvailability } = require('../utils/availabilityChecker');
const {
  createOrder: createRazorpayOrder,
  verifyPaymentSignature,
  getRazorpayKeyId,
} = require('../services/razorpay');

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', message: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ status: 'error', message: 'Invalid token' });
  }
};

const requirePatient = (req, res, next) => {
  const role = req.user?.role || req.user?.type || req.user?.userType;
  if (role !== 'patient') {
    return res.status(403).json({ status: 'error', message: 'Patient access only' });
  }
  next();
};

router.post(
  '/create-order',
  authenticate,
  requirePatient,
  [
    body('doctorId').notEmpty().withMessage('doctorId is required'),
    body('slotStartIso').isISO8601().withMessage('slotStartIso must be ISO date'),
    body('durationMinutes').optional().isInt({ min: 5, max: 300 }),
  ],
  validate,
  async (req, res) => {
    try {
      const { doctorId, slotStartIso, durationMinutes = 30 } = req.body;

      // Check if online booking is live
      const setting = await SystemSetting.findOne({ key: 'onlineBookingLive' });
      const onlineBookingLive = setting ? setting.value === true : true;
      if (!onlineBookingLive) {
        return res.status(403).json({
          status: 'error',
          message: 'Online booking is temporarily disabled. Please contact the hospital to book your slot.'
        });
      }

      const patientObj = await Patient.findById(req.user.id);
      if (!patientObj || !patientObj.name || !patientObj.phone || !patientObj.age) {
        return res.status(400).json({
          status: 'error',
          message:
            'Profile incomplete. Please complete your profile details (including name, phone, and age) to book an appointment.',
        });
      }

      const doctor = await Doctor.findOne({
        _id: doctorId,
        isVerified: true,
        isActive: true,
        status: 'active',
      });
      if (!doctor) {
        return res.status(404).json({ status: 'error', message: 'Doctor not found or not active' });
      }

      const fee = Number(doctor.fees);
      if (!Number.isFinite(fee) || fee <= 0) {
        return res.status(400).json({
          status: 'error',
          message:
            'This doctor has no consultation fee configured for online payment. Please book offline.',
        });
      }

      const start = new Date(slotStartIso);
      if (Number.isNaN(start.getTime())) {
        return res.status(400).json({ status: 'error', message: 'Invalid slotStartIso' });
      }
      const duration =
        Number(durationMinutes) || doctor.appointmentDuration || doctor.slotDurationMinutes || 30;
      const end = new Date(start.getTime() + duration * 60000);
      const slotEndIso = end.toISOString();

      const availabilityCheck = validateAppointmentAvailability(
        doctor,
        start.toISOString(),
        slotEndIso
      );
      if (!availabilityCheck.available) {
        return res.status(400).json({
          status: 'error',
          message: availabilityCheck.reason || 'Selected time is outside working hours',
        });
      }

      const blocked = await BlockedSlot.findOne({
        doctorId,
        startTime: { $lt: slotEndIso },
        endTime: { $gt: slotStartIso },
      });
      if (blocked) {
        return res.status(409).json({ status: 'error', message: 'Selected time is blocked by doctor' });
      }

      const [testConflict, prodConflict] = await Promise.all([
        AppointmentTesting.findOne({
          doctorId,
          status: { $nin: ['Cancelled', 'No Show', 'Missed'] },
          slotStartIso: { $lt: slotEndIso },
          slotEndIso: { $gt: slotStartIso },
        }).lean(),
        Appointment.findOne({
          doctorId,
          status: { $nin: ['Cancelled', 'No Show', 'Missed'] },
          slotStartIso: { $lt: slotEndIso },
          slotEndIso: { $gt: slotStartIso },
        }).lean(),
      ]);
      const conflict = testConflict || prodConflict;
      if (conflict) {
        const samePatientPending =
          String(conflict.patientId) === String(req.user.id) &&
          String(conflict.paymentMode || '').toLowerCase() === 'online' &&
          String(conflict.paymentStatus || '').toLowerCase() === 'pending' &&
          !conflict.razorpayPaymentId;

        if (samePatientPending && testConflict && String(conflict._id) === String(testConflict._id)) {
          await AppointmentTesting.updateOne(
            { _id: conflict._id },
            {
              $set: {
                paymentStatus: 'cancelled',
                status: 'Cancelled',
                cancelReason: 'Replaced by a new payment attempt',
                cancelledAt: new Date(),
                cancelledBy: req.user.id,
                cancelledByType: 'patient',
              },
            }
          );
        } else {
          return res.status(409).json({
            status: 'error',
            message: 'Selected time overlaps an existing appointment',
          });
        }
      }

      const receipt = `apt_${String(req.user.id).slice(-6)}_${Date.now()}`.slice(0, 40);
      const order = await createRazorpayOrder({
        amountInr: fee,
        receipt,
        notes: {
          doctorId: String(doctor._id),
          patientId: String(req.user.id),
          slotStartIso: start.toISOString(),
        },
      });

      const ist = toIstParts(start);
      const dateStr = `${ist.year}-${String(ist.month).padStart(2, '0')}-${String(ist.day).padStart(2, '0')}`;

      // Hold a pending online booking so cancel/fail can be recorded (not shown as paid).
      const pendingAppt = await AppointmentTesting.create({
        doctorId,
        patientId: req.user.id,
        date: dateStr,
        slotStartIso: start.toISOString(),
        slotEndIso,
        symptoms: '',
        status: 'Scheduled',
        bookedBy: 'self',
        paymentMode: 'online',
        paymentStatus: 'pending',
        paymentAmount: fee,
        razorpayOrderId: order.id,
        notes: [
          'Video Consultation',
          'source:mobile-app-testing',
          'payment:online',
          'payment-status:pending',
        ].join(' | '),
      });

      return res.status(201).json({
        status: 'success',
        message: 'Payment order created',
        data: {
          keyId: getRazorpayKeyId(),
          orderId: order.id,
          amount: order.amount,
          currency: order.currency || 'INR',
          amountInr: fee,
          doctorName: doctor.name,
          patientName: patientObj.name,
          patientEmail: patientObj.email,
          patientPhone: patientObj.phone,
          appointmentId: pendingAppt._id,
        },
      });
    } catch (error) {
      console.error('Create Razorpay order error:', error);
      const statusCode = error.code === 'RAZORPAY_NOT_CONFIGURED' ? 503 : 500;
      return res.status(statusCode).json({
        status: 'error',
        message: error.message || 'Failed to create payment order',
        code: error.code || undefined,
      });
    }
  }
);

router.post(
  '/cancel-order',
  authenticate,
  requirePatient,
  [
    body('razorpay_order_id').optional().isString(),
    body('appointmentId').optional().isString(),
  ],
  validate,
  async (req, res) => {
    try {
      const { razorpay_order_id, appointmentId } = req.body || {};
      if (!razorpay_order_id && !appointmentId) {
        return res.status(400).json({
          status: 'error',
          message: 'razorpay_order_id or appointmentId is required',
        });
      }

      const query = {
        patientId: req.user.id,
        paymentMode: 'online',
        paymentStatus: 'pending',
        $or: [
          { razorpayPaymentId: null },
          { razorpayPaymentId: { $exists: false } },
          { razorpayPaymentId: '' },
        ],
      };
      if (appointmentId) query._id = appointmentId;
      if (razorpay_order_id) query.razorpayOrderId = razorpay_order_id;

      const appt = await AppointmentTesting.findOne(query);
      if (!appt) {
        return res.status(200).json({
          status: 'success',
          message: 'No pending payment found to cancel',
          data: null,
        });
      }

      if (String(appt.paymentStatus).toLowerCase() === 'paid' || appt.razorpayPaymentId) {
        return res.status(400).json({
          status: 'error',
          message: 'Paid appointments cannot be cancelled via payment cancel',
        });
      }

      appt.paymentStatus = 'cancelled';
      appt.status = 'Cancelled';
      appt.cancelReason = 'Payment cancelled by patient';
      appt.cancelledAt = new Date();
      appt.cancelledBy = req.user.id;
      appt.cancelledByType = 'patient';
      appt.notes = [appt.notes || '', 'payment-status:cancelled'].filter(Boolean).join(' | ');
      await appt.save();

      return res.status(200).json({
        status: 'success',
        message: 'Payment marked as cancelled',
        data: appt,
      });
    } catch (error) {
      console.error('Cancel payment order error:', error);
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to cancel payment',
      });
    }
  }
);

router.post(
  '/verify-and-book',
  authenticate,
  requirePatient,
  [
    body('doctorId').notEmpty().withMessage('doctorId is required'),
    body('slotStartIso').isISO8601().withMessage('slotStartIso must be ISO date'),
    body('durationMinutes').optional().isInt({ min: 5, max: 300 }),
    body('consultationType').optional().isString(),
    body('symptoms').optional().isString(),
    body('razorpay_order_id').notEmpty().withMessage('razorpay_order_id is required'),
    body('razorpay_payment_id').notEmpty().withMessage('razorpay_payment_id is required'),
    body('razorpay_signature').notEmpty().withMessage('razorpay_signature is required'),
  ],
  validate,
  async (req, res) => {
    try {
      const {
        doctorId,
        slotStartIso,
        durationMinutes = 30,
        consultationType = 'Video Consultation',
        symptoms = '',
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      } = req.body;

      const ok = verifyPaymentSignature({
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
      });
      if (!ok) {
        return res.status(400).json({
          status: 'error',
          message: 'Payment verification failed. Please try again.',
        });
      }

      const existingPaid = await AppointmentTesting.findOne({
        razorpayPaymentId: razorpay_payment_id,
      }).lean();
      if (existingPaid) {
        return res.status(200).json({
          status: 'success',
          data: existingPaid,
          message: 'Appointment already booked for this payment',
          collection: 'appointment-testing',
        });
      }

      const patientObj = await Patient.findById(req.user.id);
      if (!patientObj || !patientObj.name || !patientObj.phone || !patientObj.age) {
        return res.status(400).json({
          status: 'error',
          message:
            'Profile incomplete. Please complete your profile details (including name, phone, and age) to book an appointment.',
        });
      }

      const doctor = await Doctor.findOne({
        _id: doctorId,
        isVerified: true,
        isActive: true,
        status: 'active',
      });
      if (!doctor) {
        return res.status(404).json({ status: 'error', message: 'Doctor not found or not active' });
      }

      const setting = await SystemSetting.findOne({ key: 'onlineBookingLive' });
      const onlineBookingLive = setting ? setting.value === true : true;
      if (!onlineBookingLive) {
        doctor.dailyTimeRanges = (doctor.dailyTimeRanges || []).filter(r => !r.isOnline);
      }

      const fee = Number(doctor.fees);
      if (!Number.isFinite(fee) || fee <= 0) {
        return res.status(400).json({
          status: 'error',
          message: 'This doctor has no consultation fee configured for online payment.',
        });
      }

      const isCalendarConnected =
        doctor.googleCalendar?.isConnected || doctor.googleCalendar?.connected;
      if (!isCalendarConnected) {
        return res.status(400).json({
          status: 'error',
          message: "Doctor's calendar is not connected to Google Calendar",
        });
      }

      const isVip = await isSlotVip(doctorId, slotStartIso);
      if (isVip) {
        return res.status(403).json({
          status: 'error',
          message: 'Selected slot is reserved for VIP/Priority bookings.',
        });
      }

      const start = new Date(slotStartIso);
      if (Number.isNaN(start.getTime())) {
        return res.status(400).json({ status: 'error', message: 'Invalid slotStartIso' });
      }
      const duration =
        Number(durationMinutes) || doctor.appointmentDuration || doctor.slotDurationMinutes || 30;
      const end = new Date(start.getTime() + duration * 60000);
      const slotEndIso = end.toISOString();
      const ist = toIstParts(start);
      const dateStr = `${ist.year}-${String(ist.month).padStart(2, '0')}-${String(ist.day).padStart(2, '0')}`;

      const availabilityCheck = validateAppointmentAvailability(
        doctor,
        start.toISOString(),
        slotEndIso
      );
      if (!availabilityCheck.available) {
        return res.status(400).json({
          status: 'error',
          message: availabilityCheck.reason || 'Selected time is outside working hours',
        });
      }

      const blocked = await BlockedSlot.findOne({
        doctorId,
        startTime: { $lt: slotEndIso },
        endTime: { $gt: slotStartIso },
      });
      if (blocked) {
        return res.status(409).json({ status: 'error', message: 'Selected time is blocked by doctor' });
      }

      const [testConflict, prodConflict] = await Promise.all([
        AppointmentTesting.findOne({
          doctorId,
          status: { $nin: ['Cancelled', 'No Show', 'Missed'] },
          slotStartIso: { $lt: slotEndIso },
          slotEndIso: { $gt: slotStartIso },
          razorpayOrderId: { $ne: razorpay_order_id },
        }).lean(),
        Appointment.findOne({
          doctorId,
          status: { $nin: ['Cancelled', 'No Show', 'Missed'] },
          slotStartIso: { $lt: slotEndIso },
          slotEndIso: { $gt: slotStartIso },
        }).lean(),
      ]);
      const conflict = testConflict || prodConflict;
      if (conflict) {
        return res.status(409).json({
          status: 'error',
          message: 'Selected time overlaps an existing appointment',
        });
      }

      let created = await AppointmentTesting.findOne({
        patientId: req.user.id,
        razorpayOrderId: razorpay_order_id,
      });

      if (created) {
        created.symptoms = symptoms || created.symptoms || '';
        created.status = 'Scheduled';
        created.paymentMode = 'online';
        created.paymentStatus = 'paid';
        created.paymentAmount = fee;
        created.razorpayPaymentId = razorpay_payment_id;
        created.cancelReason = null;
        created.cancelledAt = null;
        created.cancelledBy = null;
        created.cancelledByType = null;
        created.notes = [
          consultationType === 'Phone Consultation' ? 'Voice Call' : 'Video Consultation',
          'source:mobile-app-testing',
          'payment:online',
          `rzp:${razorpay_payment_id}`,
        ].join(' | ');
        await created.save();
      } else {
        created = await AppointmentTesting.create({
          doctorId,
          patientId: req.user.id,
          date: dateStr,
          slotStartIso: start.toISOString(),
          slotEndIso,
          symptoms: symptoms || '',
          status: 'Scheduled',
          bookedBy: 'self',
          paymentMode: 'online',
          paymentStatus: 'paid',
          paymentAmount: fee,
          razorpayOrderId: razorpay_order_id,
          razorpayPaymentId: razorpay_payment_id,
          notes: [
            consultationType === 'Phone Consultation' ? 'Voice Call' : 'Video Consultation',
            'source:mobile-app-testing',
            'payment:online',
            `rzp:${razorpay_payment_id}`,
          ].join(' | '),
        });
      }

      try {
        await recordActivity({
          userId: req.user.id,
          userName: patientObj?.name || req.user.email || 'Patient',
          userEmail: patientObj?.email || req.user.email || 'patient@app.com',
          userType: 'patient',
          action: 'BOOK_APPOINTMENT_ONLINE',
          description: `Patient ${patientObj?.name || req.user.email} paid online and booked with Dr. ${doctor.name}`,
          req,
          metadata: {
            appointmentId: created._id,
            doctorId: doctor._id,
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            amount: fee,
            collection: 'appointment-testing',
          },
        });
      } catch (logErr) {
        console.warn('Online book activity log failed:', logErr.message);
      }

      // Google Meet (online video) + patient confirmation email — await so app gets meetLink
      try {
        await syncPatientBookingExternal({
          appointment: created,
          doctor,
          patient: patientObj,
          AppointmentModel: AppointmentTesting,
        });
      } catch (err) {
        console.error('✉️ Mobile online booking sync error:', err?.message || err);
      }

      const booked =
        (await AppointmentTesting.findById(created._id)
          .populate('doctorId', 'name specialization profileImage fees')
          .lean()) || created;

      return res.status(201).json({
        status: 'success',
        data: booked,
        message: 'Payment successful. Appointment booked.',
        collection: 'appointment-testing',
      });
    } catch (error) {
      console.error('Verify-and-book error:', error);
      const statusCode = error.code === 'RAZORPAY_NOT_CONFIGURED' ? 503 : 500;
      return res.status(statusCode).json({
        status: 'error',
        message: error.message || 'Failed to verify payment and book',
        code: error.code || undefined,
      });
    }
  }
);

module.exports = router;
