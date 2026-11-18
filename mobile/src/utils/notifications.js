import AsyncStorage from '@react-native-async-storage/async-storage';

const READ_KEY = '@brains_notification_read_ids';
const DISMISSED_KEY = '@brains_notification_dismissed_ids';

const ACTIVE_STATUSES = new Set([
  'Scheduled',
  'scheduled',
  'confirmed',
  'pending',
  'Rescheduled',
  'Reassigned',
  'In Progress',
]);

const formatWhen = (isoOrDate) => {
  if (!isoOrDate) return '';
  try {
    const d = new Date(isoOrDate);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
};

const formatDoctorLabel = (name) => {
  const raw = String(name || '').trim();
  if (!raw) return 'your doctor';
  return /^dr\.?\s/i.test(raw) ? raw : `Dr. ${raw}`;
};

export function formatNotificationDate(isoOrDate) {
  if (!isoOrDate) return '';
  try {
    const d = new Date(isoOrDate);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return '';
  }
}

export function formatNotificationTime(isoOrDate) {
  if (!isoOrDate) return '';
  try {
    const d = new Date(isoOrDate);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

/** e.g. "2m ago", "15m ago", "Yesterday" */
export function formatRelativeTime(isoOrDate) {
  if (!isoOrDate) return '';
  try {
    const d = new Date(isoOrDate);
    if (Number.isNaN(d.getTime())) return '';
    const diffMs = Date.now() - d.getTime();
    if (diffMs < 0) {
      const aheadMin = Math.round(-diffMs / 60000);
      if (aheadMin < 60) return `in ${aheadMin}m`;
      const aheadHrs = Math.round(aheadMin / 60);
      if (aheadHrs < 24) return `in ${aheadHrs}h`;
      return formatNotificationDate(d);
    }
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return formatNotificationDate(d);
  } catch {
    return '';
  }
}

export function isSameDay(a, b = new Date()) {
  try {
    const d1 = new Date(a);
    const d2 = new Date(b);
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  } catch {
    return false;
  }
}

/**
 * Group notifications into Today / Earlier sections (design).
 */
export function groupNotificationsByDay(notifications = []) {
  const today = [];
  const earlier = [];
  (notifications || []).forEach((n) => {
    const stamp = n.createdAt || n.slotStartIso;
    if (stamp && isSameDay(stamp)) today.push(n);
    else earlier.push(n);
  });
  return { today, earlier };
}

/**
 * Build in-app notifications from appointments (no separate backend inbox yet).
 */
export function buildNotificationsFromAppointments(appointments = [], { isAuthenticated } = {}) {
  const list = [];

  if (!isAuthenticated) {
    list.push({
      id: 'guest-welcome',
      title: 'Welcome to Brains Hospital',
      subtitle: 'Browse doctors and book anytime',
      body: 'Find a doctor and book an appointment when you are ready.',
      type: 'info',
      createdAt: new Date().toISOString(),
      action: 'book',
    });
    return list;
  }

  const appts = Array.isArray(appointments) ? appointments : [];

  appts.forEach((appt) => {
    const id = String(appt._id || appt.id || '');
    if (!id) return;

    const doctorName = formatDoctorLabel(
      appt.doctorId?.name || appt.doctorName || 'your doctor'
    );
    const slotIso = appt.slotStartIso || appt.date || null;
    const when = formatWhen(slotIso || appt.createdAt);
    const dateLabel = formatNotificationDate(slotIso);
    const timeLabel = formatNotificationTime(slotIso);
    const status = String(appt.status || '');
    const paymentMode = String(appt.paymentMode || '').toLowerCase();
    const paymentStatus = String(appt.paymentStatus || '').toLowerCase();
    const amount =
      appt.paymentAmount != null && !Number.isNaN(Number(appt.paymentAmount))
        ? Number(appt.paymentAmount)
        : null;

    // Online Razorpay payment successful
    if (paymentMode === 'online' && paymentStatus === 'paid') {
      list.push({
        id: `payment-success-${id}`,
        title: 'Payment successful',
        subtitle: doctorName,
        body: `Your payment${amount != null ? ` of ₹${amount}` : ''} for ${doctorName} was successful${when ? ` · ${when}` : ''}.`,
        type: 'payment',
        createdAt: appt.updatedAt || appt.createdAt || new Date().toISOString(),
        slotStartIso: slotIso,
        dateLabel,
        timeLabel,
        doctorName,
        appointmentId: id,
        action: 'payments',
      });
    }

    // Skip unpaid online payment holds from upcoming reminders
    const isOnlineHold =
      paymentMode === 'online' &&
      paymentStatus === 'pending' &&
      !appt.razorpayPaymentId;

    if (ACTIVE_STATUSES.has(status) && !isOnlineHold) {
      list.push({
        id: `appt-upcoming-${id}`,
        title: 'Upcoming appointment',
        subtitle: `With ${doctorName}`,
        body: `With ${doctorName}${when ? ` · ${when}` : ''}`,
        type: 'appointment',
        createdAt: appt.updatedAt || appt.createdAt || new Date().toISOString(),
        slotStartIso: slotIso,
        dateLabel,
        timeLabel,
        doctorName,
        appointmentId: id,
        action: 'appointments',
      });
    } else if (status === 'Cancelled' || status === 'cancelled') {
      // Don't notify for payment-cancelled holds (user abandoned checkout)
      if (paymentMode === 'online' && paymentStatus === 'cancelled' && !appt.razorpayPaymentId) {
        return;
      }
      list.push({
        id: `appt-cancelled-${id}`,
        title: 'Appointment cancelled',
        subtitle: doctorName,
        body: `Your visit with ${doctorName} was cancelled.`,
        type: 'warning',
        createdAt: appt.cancelledAt || appt.updatedAt || appt.createdAt,
        slotStartIso: slotIso,
        dateLabel,
        timeLabel,
        doctorName,
        appointmentId: id,
        action: 'appointments',
      });
    } else if (status === 'Completed' || status === 'completed') {
      list.push({
        id: `appt-done-${id}`,
        title: 'Visit completed',
        subtitle: doctorName,
        body: `Consultation with ${doctorName} is marked completed.`,
        type: 'success',
        createdAt: appt.updatedAt || appt.createdAt,
        slotStartIso: slotIso,
        dateLabel,
        timeLabel,
        doctorName,
        appointmentId: id,
        action: 'records',
      });
    } else if (status === 'Missed' || status === 'No Show') {
      list.push({
        id: `appt-missed-${id}`,
        title: 'Missed appointment',
        subtitle: doctorName,
        body: `You missed the slot with ${doctorName}. Book again if needed.`,
        type: 'warning',
        createdAt: appt.updatedAt || appt.createdAt,
        slotStartIso: slotIso,
        dateLabel,
        timeLabel,
        doctorName,
        appointmentId: id,
        action: 'book',
      });
    }
  });

  list.push({
    id: 'system-tips',
    title: 'Booking tip',
    subtitle: 'Complete your profile before booking',
    body: 'Complete your profile (name, phone, age) before confirming a booking.',
    type: 'info',
    createdAt: new Date(0).toISOString(),
    action: 'profile',
  });

  // Newest first
  list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return list;
}

export async function getReadNotificationIds() {
  try {
    const raw = await AsyncStorage.getItem(READ_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getDismissedNotificationIds() {
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function markNotificationsRead(ids = []) {
  if (!ids.length) return [];
  const current = await getReadNotificationIds();
  const next = Array.from(new Set([...current, ...ids.map(String)]));
  await AsyncStorage.setItem(READ_KEY, JSON.stringify(next));
  return next;
}

export async function markAllNotificationsRead(notifications = []) {
  return markNotificationsRead(notifications.map((n) => n.id));
}

export async function dismissNotification(id) {
  if (!id) return [];
  const current = await getDismissedNotificationIds();
  const next = Array.from(new Set([...current, String(id)]));
  await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
  return next;
}

export function filterDismissedNotifications(notifications = [], dismissedIds = []) {
  const dismissed = new Set((dismissedIds || []).map(String));
  return (notifications || []).filter((n) => !dismissed.has(String(n.id)));
}
