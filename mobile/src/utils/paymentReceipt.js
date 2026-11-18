import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const DOWNLOAD_DIR_KEY = '@brains_receipt_download_dir';

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const formatWhen = (isoOrDate) => {
  if (!isoOrDate) return '—';
  try {
    const d = new Date(isoOrDate);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
};

const paymentStatusLabel = (pay) => {
  const raw = String(pay?.paymentStatus || '').toLowerCase();
  const apptStatus = String(pay?.status || '').toLowerCase();
  if (raw === 'paid') return 'Paid';
  if (raw === 'cancelled' || raw === 'canceled') return 'Canceled';
  if (apptStatus === 'cancelled' || apptStatus === 'canceled') return 'Canceled';
  if (raw === 'pending') return 'Pending';
  if (raw === 'unpaid') return 'Unpaid';
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Unknown';
};

const makeReceiptFileName = (pay = {}) => {
  const doctorSlug = String(pay?.doctorId?.name || pay?.doctorName || 'payment')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
  const stamp = Date.now();
  return `brains-receipt-${doctorSlug || 'payment'}-${stamp}.pdf`;
};

/**
 * Build HTML receipt for an online payment / appointment.
 */
export function buildPaymentReceiptHtml(pay = {}) {
  const doctor = pay.doctorId?.name || pay.doctorName || 'Consultation';
  const specialization = pay.doctorId?.specialization || '';
  const when = formatWhen(pay.slotStartIso || pay.date || pay.createdAt);
  const amount =
    pay.paymentAmount != null
      ? Number(pay.paymentAmount)
      : pay.doctorId?.fees != null
        ? Number(pay.doctorId.fees)
        : null;
  const amountText =
    amount != null && !Number.isNaN(amount) ? `₹${amount.toFixed(2)}` : 'N/A';
  const status = paymentStatusLabel(pay);
  const paymentId = pay.razorpayPaymentId || '—';
  const orderId = pay.razorpayOrderId || '—';
  const apptId = String(pay._id || pay.id || '—');
  const generatedAt = formatWhen(new Date().toISOString());

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Payment Receipt</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #0F172A;
      margin: 0;
      padding: 28px;
      background: #fff;
    }
    .brand { font-size: 22px; font-weight: 800; color: #2B84ED; letter-spacing: -0.3px; }
    .sub { margin-top: 4px; font-size: 12px; color: #64748B; }
    h1 { margin: 28px 0 6px; font-size: 18px; font-weight: 800; }
    .status {
      display: inline-block; margin-top: 8px; padding: 4px 10px; border-radius: 999px;
      font-size: 11px; font-weight: 700;
      background: ${status === 'Paid' ? '#ECFDF5' : status === 'Canceled' ? '#FEF2F2' : '#FFF7ED'};
      color: ${status === 'Paid' ? '#059669' : status === 'Canceled' ? '#DC2626' : '#C2410C'};
    }
    table { width: 100%; border-collapse: collapse; margin-top: 22px; }
    td { padding: 10px 0; border-bottom: 1px solid #E2E8F0; font-size: 13px; vertical-align: top; }
    td.label { width: 38%; color: #64748B; font-weight: 600; }
    td.value { color: #0F172A; font-weight: 600; word-break: break-all; }
    .amount { font-size: 20px; font-weight: 800; color: #0F172A; }
    .footer { margin-top: 28px; font-size: 11px; color: #94A3B8; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="brand">Brains Hospital</div>
  <div class="sub">Online payment receipt</div>
  <h1>Payment Receipt</h1>
  <div class="status">${escapeHtml(status)}</div>
  <table>
    <tr>
      <td class="label">Doctor</td>
      <td class="value">${escapeHtml(doctor)}${specialization ? `<br/><span style="font-weight:500;color:#64748B">${escapeHtml(specialization)}</span>` : ''}</td>
    </tr>
    <tr><td class="label">Appointment</td><td class="value">${escapeHtml(when)}</td></tr>
    <tr><td class="label">Amount</td><td class="value amount">${escapeHtml(amountText)}</td></tr>
    <tr><td class="label">Payment mode</td><td class="value">Online (Razorpay)</td></tr>
    <tr><td class="label">Payment ID</td><td class="value">${escapeHtml(paymentId)}</td></tr>
    <tr><td class="label">Order ID</td><td class="value">${escapeHtml(orderId)}</td></tr>
    <tr><td class="label">Booking ID</td><td class="value">${escapeHtml(apptId)}</td></tr>
  </table>
  <div class="footer">
    Generated on ${escapeHtml(generatedAt)}.<br/>
    This is a system-generated receipt for your online consultation payment.
  </div>
</body>
</html>`;
}

async function getAndroidDownloadDirectoryUri() {
  const cached = await AsyncStorage.getItem(DOWNLOAD_DIR_KEY);
  if (cached) return cached;

  const { StorageAccessFramework } = FileSystem;
  const suggested = StorageAccessFramework.getUriForDirectoryInRoot('Download');
  const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync(suggested);
  if (!permissions.granted) {
    throw new Error('Storage permission is required to download the receipt.');
  }
  await AsyncStorage.setItem(DOWNLOAD_DIR_KEY, permissions.directoryUri);
  return permissions.directoryUri;
}

async function savePdfToDevice(sourceUri, fileName) {
  if (Platform.OS === 'android') {
    const { StorageAccessFramework } = FileSystem;
    let directoryUri = await getAndroidDownloadDirectoryUri();

    const base64 = await FileSystem.readAsStringAsync(sourceUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const writeToDir = async (dirUri) => {
      const targetUri = await StorageAccessFramework.createFileAsync(
        dirUri,
        fileName,
        'application/pdf'
      );
      await FileSystem.writeAsStringAsync(targetUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return targetUri;
    };

    try {
      return await writeToDir(directoryUri);
    } catch (err) {
      // Cached folder permission may have been revoked — ask again.
      await AsyncStorage.removeItem(DOWNLOAD_DIR_KEY);
      directoryUri = await getAndroidDownloadDirectoryUri();
      return writeToDir(directoryUri);
    }
  }

  // iOS / others: save into app documents (accessible via Files → On My iPhone → app)
  if (!FileSystem.documentDirectory) {
    throw new Error('Could not access device storage.');
  }
  const dest = `${FileSystem.documentDirectory}${fileName}`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

/**
 * Create a PDF receipt and save it to device storage (no share sheet).
 */
export async function downloadPaymentReceipt(pay) {
  const html = buildPaymentReceiptHtml(pay);
  const file = await Print.printToFileAsync({
    html,
    base64: false,
  });

  const fileName = makeReceiptFileName(pay);
  const savedUri = await savePdfToDevice(file.uri, fileName);
  return { uri: savedUri, fileName };
}

/**
 * Download receipt PDF directly (paid payments only). No share sheet.
 * Prefer passing `onNotify` so the UI can show a styled popup instead of Alert.
 */
export async function promptDownloadReceipt(
  pay,
  { onStart, onDone, onError, onNotify } = {}
) {
  const notify = (cfg) => {
    if (typeof onNotify === 'function') onNotify(cfg);
  };

  const status = paymentStatusLabel(pay);
  if (status !== 'Paid') {
    const err = new Error('Receipt only for paid payments');
    notify({
      variant: 'warning',
      icon: 'receipt-outline',
      title: 'Receipt unavailable',
      message: 'Receipts are only available for successful (paid) payments.',
      primaryLabel: 'OK',
    });
    onError?.(err);
    return;
  }

  try {
    onStart?.();
    const { fileName } = await downloadPaymentReceipt(pay);
    onDone?.({ fileName });
    notify({
      variant: 'success',
      icon: 'download',
      title: 'Downloaded',
      message:
        Platform.OS === 'android'
          ? 'Your payment receipt PDF was saved to the Downloads folder.'
          : 'Your payment receipt PDF was saved. Open the Files app to find it.',
      details: [
        { label: 'File', value: fileName },
        {
          label: 'Location',
          value: Platform.OS === 'android' ? 'Downloads' : 'Files app',
          accent: true,
        },
      ],
      primaryLabel: 'Done',
    });
  } catch (err) {
    const message = err?.message || 'Could not download the receipt PDF.';
    onError?.(err);
    notify({
      variant: 'error',
      icon: 'cloud-offline-outline',
      title: 'Download failed',
      message,
      primaryLabel: 'Try again',
    });
  }
}
