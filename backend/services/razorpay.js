// backend/services/razorpay.js
const Razorpay = require('razorpay');
const crypto = require('crypto');

let client = null;

function getRazorpayClient() {
  const keyId = String(process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || '').trim();

  if (!keyId || !keySecret || keyId === 'dummy' || keySecret === 'dummy') {
    const err = new Error(
      'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend/.env (use Razorpay test keys).'
    );
    err.code = 'RAZORPAY_NOT_CONFIGURED';
    throw err;
  }

  if (!client) {
    client = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }
  return client;
}

function getRazorpayKeyId() {
  const keyId = String(process.env.RAZORPAY_KEY_ID || '').trim();
  if (!keyId || keyId === 'dummy') {
    const err = new Error('Razorpay key id is not configured');
    err.code = 'RAZORPAY_NOT_CONFIGURED';
    throw err;
  }
  return keyId;
}

/**
 * @param {{ amountInr: number, receipt: string, notes?: object }} params
 * amountInr is in rupees (e.g. 500). Razorpay expects paise.
 */
async function createOrder({ amountInr, receipt, notes = {} }) {
  const rzp = getRazorpayClient();
  const amountPaise = Math.round(Number(amountInr) * 100);
  if (!Number.isFinite(amountPaise) || amountPaise < 100) {
    const err = new Error('Minimum online payment amount is ₹1');
    err.code = 'INVALID_AMOUNT';
    throw err;
  }

  const order = await rzp.orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt: String(receipt).slice(0, 40),
    notes,
  });

  return order;
}

function verifyPaymentSignature({ orderId, paymentId, signature }) {
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || '').trim();
  if (!keySecret || keySecret === 'dummy') {
    const err = new Error('Razorpay is not configured');
    err.code = 'RAZORPAY_NOT_CONFIGURED';
    throw err;
  }

  const body = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(body)
    .digest('hex');

  return expected === signature;
}

module.exports = {
  getRazorpayClient,
  getRazorpayKeyId,
  createOrder,
  verifyPaymentSignature,
};
