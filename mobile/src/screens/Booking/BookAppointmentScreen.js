import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  StatusBar,
  TextInput,
  Modal,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, RADIUS } from '../../constants/theme';
import { getTabBarScrollPadding } from '../../constants/layout';
import { patientApi, appointmentApi } from '../../api/patient.api';
import { useAuth } from '../../context/AuthContext';
import { useAppTheme } from '../../context/SettingsContext';
import { AppDialog } from '../../components/AppDialog';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { HeaderBackButton, HeaderBackSpacer, headerBackStyles } from '../../components/HeaderBackButton';
import { RazorpayCheckoutModal } from '../../components/RazorpayCheckoutModal';
import {
  User,
  Calendar,
  Clock,
  FileText,
  Shield,
  MessageCircle,
  Check,
  Users,
} from 'lucide-react-native';

const PRIMARY = '#2B84ED';
const PRIMARY_SOFT = '#E8F2FF';
const TEXT = '#1A1C1E';
const MUTED = '#8C9199';
const BORDER = '#E8EAED';
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const toYmd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parseYmd = (ymd) => {
  const [y, m, d] = String(ymd || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0, 0);
};

/**
 * Normalize stored availability dates to YYYY-MM-DD in IST (same as backend
 * appointment available-slots / doctor calendar).
 * ISO midnight IST must not be sliced as the previous UTC calendar day.
 */
const toIstYmd = (value) => {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const dt = new Date(trimmed);
    if (Number.isNaN(dt.getTime())) {
      const m = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
      return m ? m[1] : null;
    }
    const ist = new Date(dt.getTime() + IST_OFFSET_MS);
    const y = ist.getUTCFullYear();
    const mo = String(ist.getUTCMonth() + 1).padStart(2, '0');
    const d = String(ist.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }
  try {
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return null;
    const ist = new Date(dt.getTime() + IST_OFFSET_MS);
    const y = ist.getUTCFullYear();
    const mo = String(ist.getUTCMonth() + 1).padStart(2, '0');
    const d = String(ist.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  } catch {
    return null;
  }
};

const ymdWeekdayUtc = (ymd) => {
  const [y, m, d] = String(ymd || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/** Day bounds in IST (matches production booking / web clinic timezone). */
const dayBoundsIst = (ymd) => {
  const dayStart = new Date(`${ymd}T00:00:00+05:30`);
  const dayEnd = new Date(`${ymd}T23:59:59.999+05:30`);
  return { dayStart, dayEnd };
};

/** Blocked intervals for a calendar day (matches web getBlockedMetaForDate). */
const getBlockedMetaForDate = (ymd, blockedBusy) => {
  if (!ymd || !Array.isArray(blockedBusy) || blockedBusy.length === 0) {
    return { intervals: [], isFullDayBlocked: false, isPartiallyBlocked: false };
  }
  const { dayStart, dayEnd } = dayBoundsIst(ymd);
  const intervals = blockedBusy
    .map((b) => {
      const s = new Date(b.startIso || b.startTime);
      const e = new Date(b.endIso || b.endTime);
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
      if (e < dayStart || s > dayEnd) return null;
      return {
        start: s < dayStart ? dayStart : s,
        end: e > dayEnd ? dayEnd : e,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);

  if (!intervals.length) {
    return { intervals: [], isFullDayBlocked: false, isPartiallyBlocked: false };
  }

  const merged = [];
  for (const it of intervals) {
    if (!merged.length) {
      merged.push({ ...it });
      continue;
    }
    const last = merged[merged.length - 1];
    if (it.start.getTime() <= last.end.getTime()) {
      last.end = new Date(Math.max(last.end.getTime(), it.end.getTime()));
    } else {
      merged.push({ ...it });
    }
  }

  const isFullDayBlocked =
    merged.length === 1 &&
    merged[0].start.getTime() <= dayStart.getTime() &&
    merged[0].end.getTime() >= dayEnd.getTime();

  return {
    intervals: merged,
    isFullDayBlocked,
    isPartiallyBlocked: !isFullDayBlocked && merged.length > 0,
  };
};

/**
 * Outside doctor availability — mirrors backend available-slots checks:
 * startDate / endDate (IST YMD) + excludedWeekdays + working hours for that weekday.
 */
const isOutsideDoctorAvailability = (ymd, doctor) => {
  if (!doctor || !ymd) return false;
  const ar = doctor.availabilityRange || null;

  const startYmd = toIstYmd(ar?.startDate);
  const endYmd = toIstYmd(ar?.endDate);
  if (startYmd && ymd < startYmd) return true;
  if (endYmd && ymd > endYmd) return true;

  const weekday = ymdWeekdayUtc(ymd);
  if (weekday == null) return true;

  const excluded = Array.isArray(ar?.excludedWeekdays)
    ? ar.excludedWeekdays.map((v) => Number(v))
    : [];
  if (excluded.includes(weekday)) return true;

  const ranges = Array.isArray(doctor.dailyTimeRanges) ? doctor.dailyTimeRanges : [];
  if (ranges.length > 0) {
    const mode = doctor.availabilityMode || 'default';
    const applicable =
      mode === 'custom'
        ? ranges.filter((r) => r.day !== undefined && r.day !== null && Number(r.day) === Number(weekday))
        : ranges.filter((r) => r.day === undefined || r.day === null || Number(r.day) === Number(weekday));
    const finalApplicable = applicable.length > 0 ? applicable : ranges;
    if (finalApplicable.length === 0) return true;
  }

  return false;
};

const dayHasWorkingHours = (doctor) =>
  Array.isArray(doctor?.dailyTimeRanges) && doctor.dailyTimeRanges.length > 0;

/**
 * Build the booking window: today .. today+29, clipped to doctor availabilityRange.
 */
const getAvailabilityWindowYmds = (doctor, daysAhead = 30) => {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const todayYmd = toYmd(today);

  const ar = doctor?.availabilityRange || null;
  const startYmd = toIstYmd(ar?.startDate);
  const endYmd = toIstYmd(ar?.endDate);

  let fromYmd = todayYmd;
  if (startYmd && startYmd > fromYmd) fromYmd = startYmd;

  const last = new Date(today);
  last.setDate(last.getDate() + (daysAhead - 1));
  let toYmdBound = toYmd(last);
  if (endYmd && endYmd < toYmdBound) toYmdBound = endYmd;

  if (fromYmd > toYmdBound) return [];

  const out = [];
  const cursor = parseYmd(fromYmd);
  const end = parseYmd(toYmdBound);
  if (!cursor || !end) return [];
  while (cursor <= end) {
    out.push(toYmd(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
};

/** Bookable slots only (for time-slot UI). */
const countAvailableSlots = (list) =>
  (Array.isArray(list) ? list : []).filter((s) => s?.status === 'available' && s?.start)
    .length;

/**
 * Web calendar uses total returned slots length (not only status===available)
 * when deciding Fully Booked vs Available.
 */
const countCalendarSlots = (list) =>
  (Array.isArray(list) ? list : []).filter((s) => s?.start).length;

  const STEPS = [
  { key: 'doctor', label: 'Doctor' },
  { key: 'datetime', label: 'Date & Time' },
  { key: 'reason', label: 'Reason' },
  { key: 'confirm', label: 'Confirm' },
];

export const BookAppointmentScreen = ({ navigation, route }) => {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const PRIMARY = colors.primary;
  const PRIMARY_SOFT = colors.primaryLight;
  const TEXT = colors.textPrimary;
  const MUTED = colors.textSecondary;
  const BORDER = colors.cardBorder;
  const PAGE_BG = colors.background;
  const CARD_BG = colors.cardBackground;
  const { user, isAuthenticated } = useAuth();
  const preselectedDoctorId = route?.params?.doctorId;
  const rescheduleAppointment = route?.params?.rescheduleAppointment || null;
  const rescheduleId = rescheduleAppointment?._id || rescheduleAppointment?.id || null;
  const isReschedule = !!rescheduleId;
  const hideDoctorPicker = isReschedule || !!preselectedDoctorId;

  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [selectedDate, setSelectedDate] = useState(() => toYmd(new Date()));
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [selectedSlotTouched, setSelectedSlotTouched] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsMessage, setSlotsMessage] = useState('');
  const [reason, setReason] = useState(() =>
    String(rescheduleAppointment?.symptoms || '').trim()
  );
  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [paymentMode, setPaymentMode] = useState('offline'); // offline | online
  const [onlineBookingLive, setOnlineBookingLive] = useState(false);

  useEffect(() => {
    let alive = true;
    const checkOnlineStatus = async () => {
      try {
        const res = await appointmentApi.getOnlineBookingStatus();
        if (!alive) return;
        if (res && res.status === 'success') {
          setOnlineBookingLive(!!res.onlineBookingLive);
          if (!res.onlineBookingLive) {
            setPaymentMode('offline');
          }
        }
      } catch (err) {
        console.warn('Failed to load online booking status:', err);
      }
    };
    checkOnlineStatus();
    return () => {
      alive = false;
    };
  }, []);

  const [successOpen, setSuccessOpen] = useState(false);
  const [popup, setPopup] = useState({ visible: false });
  const [razorpayOpen, setRazorpayOpen] = useState(false);
  const [razorpayCheckout, setRazorpayCheckout] = useState(null);
  const [pendingOnlineBooking, setPendingOnlineBooking] = useState(null);
  const [blockedBusy, setBlockedBusy] = useState([]);
  const [doctorSchedule, setDoctorSchedule] = useState(null);
  const [availabilityByDate, setAvailabilityByDate] = useState({});
  const prefetchRequestIdRef = useRef(0);
  const closePopup = () => setPopup({ visible: false });
  const showPopup = (cfg) => setPopup({ visible: true, ...cfg });
  /** Avoid stacking over Razorpay Modal (Android often drops the second modal). */
  const showPopupAfterCheckout = (cfg) => {
    setRazorpayOpen(false);
    setRazorpayCheckout(null);
    setPendingOnlineBooking(null);
    setTimeout(() => showPopup(cfg), 280);
  };

  const BOOKING_DAYS_AHEAD = 30;

  const scheduleDoctor = doctorSchedule || selectedDoctor;

  const selectableDates = useMemo(() => {
    // Dates clipped to doctor availabilityRange ∩ next 30 days (IST),
    // then marked like web: available / blocked / fully booked.
    const hasHours = dayHasWorkingHours(scheduleDoctor);
    const windowYmds = getAvailabilityWindowYmds(scheduleDoctor, BOOKING_DAYS_AHEAD);
    const days = [];

    for (const dateString of windowYmds) {
      const d = parseYmd(dateString);
      if (!d) continue;

      const blockedMeta = getBlockedMetaForDate(dateString, blockedBusy);
      const isUnavailable = isOutsideDoctorAvailability(dateString, scheduleDoctor);
      const isBlocked = !!blockedMeta.isFullDayBlocked;
      const isPartiallyBlocked = !!blockedMeta.isPartiallyBlocked;

      const availEntry = availabilityByDate[dateString] || {
        fetched: false,
        availableCount: undefined,
      };
      const isFetched = availEntry.fetched === true;
      const availableCount = availEntry.availableCount ?? 0;

      const blockedFull =
        isBlocked || (isUnavailable && !isPartiallyBlocked);
      const partiallyBlockedNoSlots =
        isFetched && isPartiallyBlocked && availableCount === 0;
      const fullyBooked =
        isFetched &&
        availableCount === 0 &&
        !blockedFull &&
        !isPartiallyBlocked &&
        !isUnavailable &&
        hasHours;
      const forceRedDisabled =
        blockedFull || partiallyBlockedNoSlots || fullyBooked;

      days.push({
        dateString,
        dayNum: d.toLocaleDateString('en-US', { day: 'numeric' }),
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        monthName: d.toLocaleDateString('en-US', { month: 'short' }),
        disabled: forceRedDisabled,
        selectable: !isBlocked && !isUnavailable,
        isFullDayBlocked: isBlocked,
        isPartiallyBlocked,
        isOutside: isUnavailable,
        fullyBooked,
        availableCount,
      });
    }
    return days;
  }, [scheduleDoctor, blockedBusy, availabilityByDate]);

  const disabledDates = useMemo(() => {
    return new Set(
      selectableDates.filter((d) => d.disabled).map((d) => d.dateString)
    );
  }, [selectableDates]);

  const selectedDateMeta = useMemo(() => {
    const fromList = selectableDates.find((d) => d.dateString === selectedDate);
    const blockedMeta = getBlockedMetaForDate(selectedDate, blockedBusy);
    return {
      ...(fromList || {}),
      ...blockedMeta,
    };
  }, [selectableDates, selectedDate, blockedBusy]);

  const availableSlotCount = useMemo(
    () => countAvailableSlots(slots),
    [slots]
  );

  const dateStatusBanner = useMemo(() => {
    if (!selectedDate || slotsLoading) return null;

    if (selectedDateMeta.isFullDayBlocked) {
      return {
        tone: 'error',
        title: 'Date blocked',
        text:
          'Doctor has blocked this date — no appointments can be booked. If you think this is an error, please contact support.',
      };
    }

    if (selectedDateMeta.isOutside && availableSlotCount === 0) {
      return {
        tone: 'error',
        title: 'Date unavailable',
        text:
          'This date is outside the doctor’s available schedule. Please choose another date.',
      };
    }

    if (selectedDateMeta.isPartiallyBlocked && availableSlotCount === 0) {
      return {
        tone: 'error',
        title: 'Partially blocked',
        text:
          'Partially blocked — the available time ranges are fully booked for this date. Please choose another date or contact support.',
      };
    }

    if (selectedDateMeta.isPartiallyBlocked && availableSlotCount > 0) {
      return {
        tone: 'info',
        title: 'Partially blocked',
        text:
          'Partially blocked: some time ranges are unavailable. Available slots (if any) are shown below.',
      };
    }

    if (availableSlotCount === 0) {
      return {
        tone: 'muted',
        title: 'No available slots',
        text: 'No available slots for this date. Please select another date.',
      };
    }

    return null;
  }, [selectedDate, slotsLoading, selectedDateMeta, availableSlotCount]);

  const activeStep = useMemo(() => {
    if (hideDoctorPicker) {
      if (!selectedDate || !selectedSlot) return 0;
      if (!reason.trim()) return 1;
      return 2;
    }
    if (!selectedDoctor) return 0;
    if (!selectedDate || !selectedSlot) return 1;
    if (!reason.trim()) return 2;
    return 3;
  }, [hideDoctorPicker, selectedDoctor, selectedDate, selectedSlot, reason]);

  const visibleSteps = useMemo(() => {
    if (hideDoctorPicker) {
      return [
        { key: 'datetime', label: 'Date & Time' },
        { key: 'reason', label: 'Reason' },
        { key: 'confirm', label: 'Confirm' },
      ];
    }
    return STEPS;
  }, [hideDoctorPicker]);

  const formatSlotLabel = (iso) => {
    try {
      return new Date(iso).toLocaleTimeString('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return iso;
    }
  };

  const prefetchAvailability = async (doctor, requestId, scheduleOverride = null) => {
    const doctorId = doctor?._id || doctor?.id;
    if (!doctorId) {
      setAvailabilityByDate({});
      return;
    }

    const schedule = scheduleOverride || doctorSchedule || doctor;
    // Only prefetch days inside the doctor's availability window
    const dates = getAvailabilityWindowYmds(schedule, BOOKING_DAYS_AHEAD).filter(
      (ymd) => !isOutsideDoctorAvailability(ymd, schedule)
    );

    if (!dates.length) {
      if (requestId !== prefetchRequestIdRef.current) return;
      setAvailabilityByDate({});
      return;
    }

    const results = await Promise.all(
      dates.map(async (ymd) => {
        try {
          const res = await appointmentApi.getAvailableSlots(doctorId, ymd);
          let raw = Array.isArray(res?.data)
            ? res.data
            : Array.isArray(res?.slots)
              ? res.slots
              : Array.isArray(res)
                ? res
                : [];
          if (!onlineBookingLive) {
            raw = raw.filter((s) => !s.isOnline);
          }
          return {
            ymd,
            availableCount: countCalendarSlots(raw),
            bookableCount: countAvailableSlots(raw),
            fetched: true,
          };
        } catch {
          return { ymd, availableCount: 0, bookableCount: 0, fetched: true };
        }
      })
    );

    if (requestId !== prefetchRequestIdRef.current) return;

    const map = {};
    for (const row of results) {
      map[row.ymd] = {
        fetched: true,
        availableCount: row.availableCount,
        bookableCount: row.bookableCount,
      };
    }
    setAvailabilityByDate(map);
  };

  const fetchDoctorCalendar = async (doctor) => {
    const doctorId = doctor?._id || doctor?.id;
    if (!doctorId) {
      setBlockedBusy([]);
      setDoctorSchedule(null);
      setAvailabilityByDate({});
      return null;
    }
    try {
      try {
        const statusRes = await appointmentApi.getOnlineBookingStatus();
        if (statusRes && statusRes.status === 'success') {
          setOnlineBookingLive(!!statusRes.onlineBookingLive);
        }
      } catch (stErr) {
        console.warn('Failed to refresh online booking status:', stErr);
      }

      // Prefer full doctor details (same as web) for availabilityRange / hours
      let detailDoctor = doctor;
      try {
        const detailRes = await patientApi.getDoctorDetails(doctorId);
        const detail = detailRes?.data || detailRes?.doctor || detailRes;
        if (detail && (detail._id || detail.id || detail.name)) {
          detailDoctor = { ...doctor, ...detail };
        }
      } catch {
        // keep list doctor
      }

      // Same blocked source as web booking calendar
      let blocked = [];
      let calendarMeta = {};
      try {
        const blockedRes = await patientApi.getDoctorBlockedSlots(doctorId);
        const raw =
          blockedRes?.data ||
          blockedRes?.blockedSlots ||
          (Array.isArray(blockedRes) ? blockedRes : []);
        blocked = Array.isArray(raw) ? raw : [];
      } catch (blockedErr) {
        console.warn(
          'Blocked slots fetch error, falling back to calendar busy:',
          blockedErr?.response?.data || blockedErr?.message || blockedErr
        );
        const timeMin = new Date();
        timeMin.setHours(0, 0, 0, 0);
        const timeMax = new Date(timeMin);
        timeMax.setDate(timeMax.getDate() + BOOKING_DAYS_AHEAD);
        const res = await patientApi.getDoctorCalendar(doctorId, timeMin, timeMax);
        const data = res?.data || res || {};
        calendarMeta = data;
        const busy = Array.isArray(data.busy) ? data.busy : [];
        blocked = busy
          .filter((b) => b?.source === 'blocked')
          .map((b) => ({
            startTime: b.startIso,
            endTime: b.endIso,
            reason: b.summary || b.reason || 'Blocked',
          }));
      }

      // Also pull schedule fields from calendar endpoint when details are thin
      try {
        if (!detailDoctor.availabilityRange || !detailDoctor.dailyTimeRanges?.length) {
          const timeMin = new Date();
          timeMin.setHours(0, 0, 0, 0);
          const timeMax = new Date(timeMin);
          timeMax.setDate(timeMax.getDate() + BOOKING_DAYS_AHEAD);
          const res = await patientApi.getDoctorCalendar(doctorId, timeMin, timeMax);
          calendarMeta = res?.data || res || calendarMeta;
        }
      } catch {
        // optional enrichment
      }

      const schedule = {
        ...detailDoctor,
        availabilityRange:
          detailDoctor.availabilityRange ??
          calendarMeta.availabilityRange ??
          doctor.availabilityRange ??
          null,
        dailyTimeRanges:
          (Array.isArray(detailDoctor.dailyTimeRanges) && detailDoctor.dailyTimeRanges.length > 0
            ? detailDoctor.dailyTimeRanges
            : Array.isArray(calendarMeta.dailyTimeRanges) && calendarMeta.dailyTimeRanges.length > 0
              ? calendarMeta.dailyTimeRanges
              : doctor.dailyTimeRanges || []
          ).filter((r) => onlineBookingLive || !r.isOnline),
        availabilityMode:
          detailDoctor.availabilityMode ??
          calendarMeta.availabilityMode ??
          doctor.availabilityMode ??
          'default',
      };

      setBlockedBusy(blocked);
      setDoctorSchedule(schedule);
      return schedule;
    } catch (err) {
      console.warn('Doctor calendar fetch error:', err?.response?.data || err?.message || err);
      setBlockedBusy([]);
      setDoctorSchedule(doctor);
      return doctor;
    }
  };

  const normalizeSlotsPayload = (res) => {
    if (Array.isArray(res?.data)) return res.data;
    if (Array.isArray(res?.slots)) return res.slots;
    if (Array.isArray(res)) return res;
    return [];
  };

  const fetchSlots = async (doctor, dateStr) => {
    const doctorId = doctor?._id || doctor?.id;
    if (!doctorId || !dateStr) {
      setSlots([]);
      setSelectedSlot(null);
      return;
    }

    setSlotsLoading(true);
    setSlotsMessage('');
    try {
      const res = await appointmentApi.getAvailableSlots(doctorId, dateStr);
      let raw = normalizeSlotsPayload(res);
      if (!onlineBookingLive) {
        raw = raw.filter((s) => !s.isOnline);
      }
      const list = raw.filter((s) => s?.start);
      setSlots(list);
      const calendarCount = countCalendarSlots(list);
      const bookableCount = countAvailableSlots(list);
      setAvailabilityByDate((prev) => ({
        ...prev,
        [dateStr]: {
          fetched: true,
          availableCount: calendarCount,
          bookableCount,
        },
      }));
      if (isReschedule) {
        setSelectedSlot(null);
        setSelectedSlotTouched(false);
      } else {
        const firstAvailable = list.find((s) => s.status === 'available') || null;
        setSelectedSlot(firstAvailable);
        if (firstAvailable?.isOnline && onlineBookingLive) {
          setPaymentMode('online');
        } else {
          setPaymentMode('offline');
        }
      }
      if (bookableCount === 0) {
        setSlotsMessage('No more slots left. Please select another date.');
      }
    } catch (err) {
      console.warn('Fetch slots error:', err?.response?.data || err?.message || err);
      setSlots([]);
      setSelectedSlot(null);
      setAvailabilityByDate((prev) => ({
        ...prev,
        [dateStr]: { fetched: true, availableCount: 0 },
      }));
      setSlotsMessage('No more slots left. Please select another date.');
    } finally {
      setSlotsLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      navigation.navigate('WebsiteLogin');
    }
  }, [isAuthenticated, navigation]);

  useEffect(() => {
    fetchDoctors();
  }, []);

  useEffect(() => {
    if (selectedDoctor) {
      setBlockedBusy([]);
      setDoctorSchedule(selectedDoctor);
      setAvailabilityByDate({});
      const requestId = prefetchRequestIdRef.current + 1;
      prefetchRequestIdRef.current = requestId;
      (async () => {
        const schedule = await fetchDoctorCalendar(selectedDoctor);
        if (prefetchRequestIdRef.current !== requestId) return;
        await prefetchAvailability(selectedDoctor, requestId, schedule);
      })();
    } else {
      setBlockedBusy([]);
      setDoctorSchedule(null);
      setAvailabilityByDate({});
    }
  }, [selectedDoctor]);

  useEffect(() => {
    if (!selectableDates.length) return;
    const current = selectableDates.find((d) => d.dateString === selectedDate);
    if (!current || current.disabled) {
      const firstOpen = selectableDates.find((d) => !d.disabled);
      if (firstOpen && firstOpen.dateString !== selectedDate) {
        setSelectedDate(firstOpen.dateString);
      }
    }
  }, [selectableDates, selectedDate]);

  useEffect(() => {
    if (!selectedDoctor || !selectedDate) return;

    // Client-side "outside range" is only a hint for greying dates.
    // Prefetch can mark a day bookable while schedule parsing still says
    // outside — if we skip fetch here, the chip looks open but slots stay empty.
    // Always hit the slots API (same as web); only skip full-day blocks.
    if (selectedDateMeta.isFullDayBlocked) {
      setSlots([]);
      setSelectedSlot(null);
      setSlotsLoading(false);
      setSlotsMessage('Doctor is not available on this date.');
      return;
    }

    fetchSlots(selectedDoctor, selectedDate);
  }, [selectedDoctor, selectedDate, selectedDateMeta.isFullDayBlocked]);

  const fetchDoctors = async () => {
    try {
      const res = await patientApi.getDoctors();
      let docs = [];
      if (Array.isArray(res)) docs = res;
      else if (res?.data?.doctors && Array.isArray(res.data.doctors)) docs = res.data.doctors;
      else if (res?.doctors && Array.isArray(res.doctors)) docs = res.doctors;
      else if (res?.data && Array.isArray(res.data)) docs = res.data;

      setDoctors(docs);
      if (docs.length > 0) {
        const match = preselectedDoctorId
          ? docs.find((d) => String(d._id || d.id) === String(preselectedDoctorId))
          : null;
        setSelectedDoctor(match || docs[0]);
      }
    } catch (err) {
      console.warn('Error fetching doctors:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkIncompleteProfile = () => {
    const phone = String(user?.phone || '').trim();
    const ageOk = user?.age !== null && user?.age !== undefined && user?.age !== '';
    const nameOk = String(user?.name || '').trim().length > 0;

    if (!user || !nameOk || !phone || !ageOk) {
      showPopup({
        variant: 'warning',
        title: 'Complete your profile',
        message:
          'Add your name, phone, and age before confirming an appointment.',
        primaryLabel: 'Go to Profile',
        onPrimary: () => {
          closePopup();
          navigation.navigate('Profile');
        },
        secondaryLabel: 'Not now',
        onSecondary: closePopup,
      });
      return true;
    }
    return false;
  };

  const formatBookingDate = (ymd) => {
    const d = parseYmd(ymd);
    if (!d) return ymd;
    return d.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const openConfirmBooking = () => {
    if (!selectedDoctor) {
      showPopup({
        variant: 'warning',
        title: 'Select a doctor',
        message: 'Choose a doctor before continuing.',
        primaryLabel: 'OK',
      });
      return;
    }
    if (!selectedSlot?.start) {
      showPopup({
        variant: 'warning',
        title: 'Select a time',
        message: 'Please choose an available time slot.',
        primaryLabel: 'OK',
      });
      return;
    }
    if (isReschedule && !selectedSlotTouched) {
      showPopup({
        variant: 'warning',
        title: 'Select a new slot',
        message: 'Please select a new time slot to continue.',
        primaryLabel: 'OK',
      });
      return;
    }
    if (checkIncompleteProfile()) return;
    const isOnlineSlot = Boolean(selectedSlot?.isOnline || selectedSlot?.consultationType === 'online');
    if (isOnlineSlot && onlineBookingLive) {
      setPaymentMode('online');
    } else {
      setPaymentMode('offline');
    }
    setConfirmOpen(true);
  };

  const submitBooking = async () => {
    if (bookingLoading) return;
    if (!isReschedule && paymentMode !== 'online' && paymentMode !== 'offline') {
      showPopup({
        variant: 'warning',
        title: 'Select payment',
        message: 'Please choose Online or Offline payment.',
        primaryLabel: 'OK',
      });
      return;
    }

    // Same rule as backend validateAppointmentAvailability — don't call API if out of range
    const slotDayYmd =
      selectedSlot?.start
        ? toIstYmd(selectedSlot.start) || selectedDate
        : selectedDate;
    if (
      isOutsideDoctorAvailability(slotDayYmd, scheduleDoctor) ||
      isOutsideDoctorAvailability(selectedDate, scheduleDoctor)
    ) {
      showPopup({
        variant: 'error',
        title: 'Date unavailable',
        message:
          "Selected date is outside doctor's availability period. Please choose another date.",
        primaryLabel: 'OK',
      });
      setConfirmOpen(false);
      return;
    }

    setBookingLoading(true);
    try {
      const doctorId = selectedDoctor._id || selectedDoctor.id;
      const durationMinutes =
        selectedDoctor.appointmentDuration || selectedDoctor.slotDurationMinutes || 30;
      const slotEndIso =
        selectedSlot.end ||
        new Date(
          new Date(selectedSlot.start).getTime() + durationMinutes * 60000
        ).toISOString();

      if (isReschedule) {
        await appointmentApi.rescheduleAppointment(rescheduleId, {
          date: selectedDate,
          slotStartIso: selectedSlot.start,
          slotEndIso,
          symptoms: reason.trim() || rescheduleAppointment?.symptoms || 'General Consultation',
          durationMinutes,
        });
        setConfirmOpen(false);
        setSuccessOpen(true);
        fetchSlots(selectedDoctor, selectedDate);
        return;
      }

      const isOnlineSlot = Boolean(selectedSlot?.isOnline || selectedSlot?.consultationType === 'online');
      const isOnlineBooking = isOnlineSlot && onlineBookingLive;

      if (isOnlineBooking) {
        const orderRes = await appointmentApi.createPaymentOrder({
          doctorId,
          slotStartIso: selectedSlot.start,
          durationMinutes,
        });
        const orderData = orderRes?.data || orderRes;
        if (!orderData?.orderId || !orderData?.keyId) {
          throw new Error(orderRes?.message || 'Failed to start online payment');
        }
        setPendingOnlineBooking({
          doctorId,
          slotStartIso: selectedSlot.start,
          durationMinutes,
          consultationType: 'Video Consultation',
          symptoms: reason.trim() || 'General Consultation',
        });
        setRazorpayCheckout(orderData);
        setConfirmOpen(false);
        setRazorpayOpen(true);
        return;
      }

      await appointmentApi.bookAppointment({
        doctorId,
        slotStartIso: selectedSlot.start,
        durationMinutes,
        consultationType: 'In-Person Consultation',
        symptoms: reason.trim() || 'General Consultation',
        paymentMode: 'offline',
      });
      setConfirmOpen(false);
      setSuccessOpen(true);
      fetchSlots(selectedDoctor, selectedDate);
    } catch (err) {
      console.error('Booking error detail:', err.response?.data || err);
      const msg =
        err.response?.data?.message ||
        err.message ||
        (isReschedule ? 'Failed to reschedule appointment.' : 'Failed to book appointment.');
      setConfirmOpen(false);
      if (String(msg).toLowerCase().includes('profile incomplete')) {
        checkIncompleteProfile();
      } else if (String(msg).toLowerCase().includes('reschedule limit')) {
        showPopup({
          variant: 'warning',
          title: 'Reschedule limit reached',
          message:
            'You have reached the maximum allowed reschedules. Please contact support or the receptionist.',
          primaryLabel: 'OK',
        });
      } else {
        showPopup({
          variant: 'error',
          title: isReschedule ? 'Reschedule failed' : 'Booking failed',
          message: msg,
          primaryLabel: 'OK',
        });
        fetchSlots(selectedDoctor, selectedDate);
      }
    } finally {
      setBookingLoading(false);
    }
  };

  const handleRazorpayResult = async (result) => {
    const cancelPendingPayment = async () => {
      const orderId = razorpayCheckout?.orderId;
      const appointmentId = razorpayCheckout?.appointmentId;
      if (!orderId && !appointmentId) return;
      try {
        await appointmentApi.cancelPaymentOrder({
          razorpay_order_id: orderId,
          appointmentId,
        });
      } catch (err) {
        console.warn('Cancel payment record failed:', err?.response?.data || err?.message || err);
      }
    };

    const bookingDetails = [
      selectedDoctor?.name
        ? { label: 'Doctor', value: selectedDoctor.name }
        : null,
      selectedDate
        ? { label: 'Date', value: formatBookingDate(selectedDate) }
        : null,
      selectedSlot?.start
        ? { label: 'Time', value: formatSlotLabel(selectedSlot.start) }
        : null,
    ].filter(Boolean);

    if (result?.type === 'dismiss') {
      await cancelPendingPayment();
      showPopupAfterCheckout({
        variant: 'warning',
        icon: 'card-outline',
        title: 'Payment cancelled',
        message:
          'No money was charged. Your appointment is not booked yet — complete payment to confirm the slot.',
        details: bookingDetails,
        primaryLabel: 'Try payment again',
        onPrimary: () => {
          closePopup();
          setPaymentMode('online');
          setConfirmOpen(true);
        },
        secondaryLabel: 'Close',
        onSecondary: closePopup,
      });
      return;
    }

    if (result?.type === 'failed') {
      await cancelPendingPayment();
      const desc =
        result?.error?.description ||
        result?.error?.reason ||
        'Payment failed. Please try again.';
      showPopupAfterCheckout({
        variant: 'error',
        icon: 'close-circle',
        title: 'Payment failed',
        message: desc,
        details: bookingDetails,
        primaryLabel: 'Try again',
        onPrimary: () => {
          closePopup();
          setPaymentMode('online');
          setConfirmOpen(true);
        },
        secondaryLabel: 'Close',
        onSecondary: closePopup,
      });
      return;
    }

    if (result?.type !== 'success' || !pendingOnlineBooking) {
      setRazorpayOpen(false);
      return;
    }

    setBookingLoading(true);
    try {
      await appointmentApi.verifyPaymentAndBook({
        ...pendingOnlineBooking,
        razorpay_order_id: result.razorpay_order_id,
        razorpay_payment_id: result.razorpay_payment_id,
        razorpay_signature: result.razorpay_signature,
      });
      setRazorpayOpen(false);
      setRazorpayCheckout(null);
      setPendingOnlineBooking(null);
      setSuccessOpen(true);
      fetchSlots(selectedDoctor, selectedDate);
    } catch (err) {
      console.error('Verify payment error:', err.response?.data || err);
      const msg =
        err.response?.data?.message ||
        err.message ||
        'Payment received but booking failed. Contact support with your payment ID.';
      showPopup({
        variant: 'error',
        title: 'Booking failed',
        message: msg,
        primaryLabel: 'OK',
      });
      setRazorpayOpen(false);
    } finally {
      setBookingLoading(false);
    }
  };

  const closeSuccessAndGoAppointments = () => {
    setSuccessOpen(false);
    if (isReschedule) {
      navigation.setParams({ rescheduleAppointment: undefined, doctorId: undefined });
    }
    navigation.navigate('Main', { screen: 'Appointments' });
  };

  const dismissSuccessModal = () => {
    setSuccessOpen(false);
    if (isReschedule) {
      navigation.setParams({ rescheduleAppointment: undefined, doctorId: undefined });
    }
  };

  const currentBookingSummary = useMemo(() => {
    if (!rescheduleAppointment) return null;
    const doc =
      rescheduleAppointment.doctorId?.name ||
      selectedDoctor?.name ||
      'Doctor';
    const spec =
      rescheduleAppointment.doctorId?.specialization ||
      selectedDoctor?.specialization ||
      '';
    const whenIso = rescheduleAppointment.slotStartIso;
    let dateLabel = '—';
    let timeLabel = '—';
    if (whenIso) {
      try {
        const d = new Date(whenIso);
        dateLabel = d.toLocaleDateString('en-IN', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
        timeLabel = d.toLocaleTimeString('en-IN', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
      } catch {
        // keep defaults
      }
    }
    return {
      doctor: doc,
      specialization: spec,
      dateLabel,
      timeLabel,
      status: rescheduleAppointment.status || 'Scheduled',
      reason: String(rescheduleAppointment.symptoms || '').trim(),
      count: Number(rescheduleAppointment.rescheduleCount || 0),
    };
  }, [rescheduleAppointment, selectedDoctor]);

  if (loading) {
    return <LoadingSpinner message="Loading doctors..." />;
  }

  const accent = PRIMARY;
  const pageBg = isDark ? colors.background : '#F2F8FB';

  return (
    <View style={[styles.container, { backgroundColor: pageBg }]}>
      <StatusBar barStyle="light-content" backgroundColor="#053B74" />

      <View style={styles.headerWrap}>
        <LinearGradient
          colors={['#053B74', '#124E96', '#06ADC6']}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.headerShell, { paddingTop: insets.top + 10 }]}
        >
          <View style={styles.headerTop}>
            <HeaderBackButton
              onPress={() => {
                if (isReschedule) {
                  navigation.setParams({
                    rescheduleAppointment: undefined,
                    doctorId: undefined,
                  });
                  navigation.navigate('Main', { screen: 'Appointments' });
                  return;
                }
                if (navigation.canGoBack()) navigation.goBack();
                else navigation.navigate('Main', { screen: 'Home' });
              }}
            />
            <Text style={[styles.headerTitle, { color: '#FFFFFF' }]}>
              {isReschedule ? 'Reschedule' : 'Book Appointment'}
            </Text>
            {isReschedule ? (
              <View style={headerBackStyles.gradient}>
                <Calendar color="#FFFFFF" size={18} />
              </View>
            ) : (
              <HeaderBackSpacer />
            )}
          </View>
        </LinearGradient>
      </View>

      <View style={[styles.contentSheet, { backgroundColor: pageBg }]}>
        <LinearGradient
          pointerEvents="none"
          colors={
            isDark
              ? [colors.background, colors.surfaceMuted || colors.background]
              : ['#DCEAF6', '#E8F3F8', '#DFF5F8', '#F2F8FB']
          }
          locations={[0, 0.32, 0.68, 1]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        {!isReschedule ? (
          <View style={[styles.stepper, { backgroundColor: 'transparent', borderBottomColor: 'transparent' }]}>
            {visibleSteps.map((step, index) => {
              const done = index < activeStep;
              const current = index === activeStep;
              return (
                <React.Fragment key={step.key}>
                  <View style={styles.stepItem}>
                    {done || current ? (
                      <LinearGradient
                        colors={['#124E96', '#06ADC6']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.stepCircle}
                      >
                        {done ? (
                          <Check color="#fff" size={12} strokeWidth={3} />
                        ) : (
                          <Text style={[styles.stepNumber, styles.stepNumberActive]}>
                            {index + 1}
                          </Text>
                        )}
                      </LinearGradient>
                    ) : (
                      <View style={styles.stepCircle}>
                        <Text style={styles.stepNumber}>{index + 1}</Text>
                    </View>
                  )}
                    <Text
                      style={[
                        styles.stepLabel,
                        (done || current) && styles.stepLabelActive,
                      ]}
                      numberOfLines={1}
                    >
                      {step.label}
                  </Text>
                  </View>
                  {index < visibleSteps.length - 1 ? (
                    <View
                      style={[
                        styles.stepLine,
                        index < activeStep && styles.stepLineActive,
                      ]}
                    />
                  ) : null}
                </React.Fragment>
              );
            })}
          </View>
        ) : (
          <View style={styles.rescheduleBanner}>
            <Text style={styles.rescheduleBannerEyebrow}>Change appointment time</Text>
            <Text style={styles.rescheduleBannerText}>
              Review your current booking, then pick a new date and time below.
            </Text>
          </View>
        )}

        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: getTabBarScrollPadding(insets.bottom) + 8 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
        {isReschedule && currentBookingSummary ? (
          <View style={styles.currentBookingCard}>
            <View style={styles.currentBookingTop}>
              <Text style={styles.currentBookingLabel}>Current booking</Text>
              <View style={styles.currentStatusPill}>
                <Text style={styles.currentStatusText}>{currentBookingSummary.status}</Text>
              </View>
            </View>
            <Text style={styles.currentDoctorName}>{currentBookingSummary.doctor}</Text>
            {currentBookingSummary.specialization ? (
              <Text style={styles.currentDoctorSpec}>
                {currentBookingSummary.specialization}
              </Text>
            ) : null}
            <View style={styles.currentMetaRow}>
              <View style={styles.currentMetaItem}>
                <Calendar color={PRIMARY} size={15} />
                <Text style={styles.currentMetaText}>{currentBookingSummary.dateLabel}</Text>
              </View>
              <View style={styles.currentMetaItem}>
                <Clock color={PRIMARY} size={15} />
                <Text style={styles.currentMetaText}>{currentBookingSummary.timeLabel}</Text>
              </View>
            </View>
            {currentBookingSummary.reason ? (
              <Text style={styles.currentReason} numberOfLines={2}>
                Reason: {currentBookingSummary.reason}
              </Text>
            ) : null}
            <Text style={styles.currentCountHint}>
              Reschedules used: {currentBookingSummary.count}/3
            </Text>
          </View>
        ) : null}

        {isReschedule ? (
          <View style={styles.reschedulePanel}>
            <Text style={styles.reschedulePanelTitle}>Choose a new slot</Text>
            <Text style={styles.reschedulePanelSub}>
              Select another available date and time with the same doctor.
            </Text>
          </View>
        ) : hideDoctorPicker && selectedDoctor ? (
          <View
            style={[
              styles.selectedDoctorCard,
              {
                backgroundColor: CARD_BG,
                borderColor: isDark ? BORDER : 'rgba(18,78,150,0.10)',
              },
            ]}
          >
              {selectedDoctor.profileImage ? (
              <Image
                source={{ uri: selectedDoctor.profileImage }}
                style={styles.selectedDoctorAvatar}
              />
              ) : (
              <View style={[styles.selectedDoctorAvatar, styles.avatarFallback]}>
                <User color={PRIMARY} size={22} />
                </View>
              )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.selectedDoctorName, { color: TEXT }]} numberOfLines={1}>
                {selectedDoctor.name}
              </Text>
              <Text style={[styles.selectedDoctorSpec, { color: MUTED }]} numberOfLines={1}>
                {selectedDoctor.specialization || 'Specialist'}
              </Text>
              {selectedDoctor.fees != null ? (
                <Text style={styles.selectedDoctorFee}>Consultation ₹{selectedDoctor.fees}</Text>
                ) : null}
              </View>
            <TouchableOpacity
              style={styles.changeDoctorBtn}
              onPress={() => {
                if (navigation.canGoBack()) navigation.goBack();
                else navigation.navigate('Main', { screen: 'SelectDoctor' });
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.changeDoctorBtnText}>Change</Text>
            </TouchableOpacity>
            </View>
        ) : !hideDoctorPicker ? (
          <View style={[styles.sectionCard, { backgroundColor: CARD_BG, borderColor: BORDER }]}>
            <Text style={styles.sectionTitle}>1. Select Doctor</Text>
            <Text style={styles.sectionSub}>Choose your preferred specialist.</Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.doctorsRow}
            >
              {doctors.map((doc) => {
                const id = doc._id || doc.id;
                const isSelected =
                  selectedDoctor &&
                  String(selectedDoctor._id || selectedDoctor.id) === String(id);
                return (
                  <TouchableOpacity
                    key={id}
                    style={[styles.doctorChip, isSelected && styles.doctorChipSelected]}
                    onPress={() => setSelectedDoctor(doc)}
                    activeOpacity={0.9}
                  >
                    {isSelected ? (
                      <View style={styles.checkBadge}>
                        <Check color={PRIMARY} size={10} strokeWidth={3} />
              </View>
            ) : null}
                    {doc.profileImage ? (
                      <Image source={{ uri: doc.profileImage }} style={styles.doctorChipAvatar} />
                    ) : (
                      <View style={[styles.doctorChipAvatar, styles.avatarFallback]}>
                        <User color={isSelected ? '#fff' : PRIMARY} size={22} />
                      </View>
                    )}
                    <Text
                      style={[styles.doctorChipName, isSelected && styles.doctorChipTextOn]}
                      numberOfLines={1}
                    >
                      {doc.name}
                </Text>
                    <Text
                      style={[styles.doctorChipSpec, isSelected && styles.doctorChipTextOnMuted]}
                      numberOfLines={1}
                    >
                      {doc.specialization || 'Specialist'}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <View style={styles.comingSoonChip}>
                <Users color={MUTED} size={22} />
                <Text style={styles.comingSoonText}>More Doctors{'\n'}Coming Soon</Text>
              </View>
            </ScrollView>
          </View>
        ) : null}

        {/* Date */}
        <View style={[styles.sectionCard, { backgroundColor: CARD_BG, borderColor: isDark ? BORDER : 'rgba(18,78,150,0.08)' }]}>
          <View style={styles.sectionHeaderLeft}>
            <View style={styles.sectionIconWrap}>
              <Calendar color="#124E96" size={16} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitleInline, { color: TEXT }]}>
                {isReschedule ? 'New date' : hideDoctorPicker ? '1. Select Date' : '2. Select Date'}
              </Text>
            </View>
          </View>

          <View style={styles.calLegendRow}>
            <View style={styles.calLegendItem}>
              <View style={[styles.calLegendSwatch, styles.calLegendAvailable]} />
              <Text style={[styles.calLegendText, { color: MUTED }]}>Available</Text>
            </View>
            <View style={styles.calLegendItem}>
              <View style={[styles.calLegendSwatch, styles.calLegendBlocked]} />
              <Text style={[styles.calLegendText, { color: MUTED }]}>Blocked / Fully Booked</Text>
            </View>
            <View style={styles.calLegendItem}>
              <View style={[styles.calLegendSwatch, styles.calLegendSelected]} />
              <Text style={[styles.calLegendText, { color: MUTED }]}>Selected</Text>
            </View>
          </View>

          {!selectableDates.length ? (
            <View style={styles.emptySlotsBox}>
              <Calendar color={MUTED} size={22} />
              <Text style={styles.emptySlotsTitle}>No dates available</Text>
              <Text style={styles.emptySlotsText}>
                This doctor has no bookable dates in their current availability window.
              </Text>
            </View>
          ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.datesRow}
          >
            {selectableDates.map((item) => {
              const isBlockedLook = item.disabled;
            const isSelected = selectedDate === item.dateString;
              if (isSelected) {
                return (
                  <TouchableOpacity
                    key={item.dateString}
                    onPress={() => {
                      if (isBlockedLook) return;
                      setSelectedDate(item.dateString);
                      if (isReschedule) {
                        setSelectedSlot(null);
                        setSelectedSlotTouched(false);
                      }
                    }}
                    disabled={isBlockedLook}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.dateChip, styles.dateChipSelectedWeb]}>
                      <Text style={[styles.dateDayName, styles.dateTextSelectedWeb]}>
                        {item.dayName}
                      </Text>
                      <Text style={[styles.dateDayNum, styles.dateTextSelectedWebNum]}>
                        {item.dayNum}
                      </Text>
                      <Text style={[styles.dateMonthName, styles.dateTextSelectedWeb]}>
                        {item.monthName}
                      </Text>
                      <Text style={styles.dateSelectedTag}>Selected</Text>
                    </View>
                  </TouchableOpacity>
                );
              }
            return (
              <TouchableOpacity
                key={item.dateString}
                style={[
                  styles.dateChip,
                    isBlockedLook ? styles.dateChipBlockedWeb : styles.dateChipAvailableWeb,
                  ]}
                  onPress={() => {
                    if (isBlockedLook) return;
                    setSelectedDate(item.dateString);
                    if (isReschedule) {
                      setSelectedSlot(null);
                      setSelectedSlotTouched(false);
                    }
                  }}
                  disabled={isBlockedLook}
                  activeOpacity={isBlockedLook ? 1 : 0.85}
                >
                  <Text
                    style={[
                      styles.dateDayName,
                      isBlockedLook ? styles.dateTextBlockedWeb : styles.dateTextAvailableWeb,
                    ]}
                  >
                  {item.dayName}
                </Text>
                  <Text
                    style={[
                      styles.dateDayNum,
                      isBlockedLook ? styles.dateTextBlockedWebNum : styles.dateTextAvailableWebNum,
                    ]}
                  >
                  {item.dayNum}
                </Text>
                  <Text
                    style={[
                      styles.dateMonthName,
                      isBlockedLook ? styles.dateTextBlockedWeb : styles.dateTextAvailableWeb,
                    ]}
                  >
                  {item.monthName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
          )}
        </View>

        {/* Time */}
        <View style={[styles.sectionCard, { backgroundColor: CARD_BG, borderColor: isDark ? BORDER : 'rgba(18,78,150,0.08)' }]}>
          <View style={styles.sectionHeaderLeft}>
            <View style={styles.sectionIconWrap}>
              <Clock color="#124E96" size={16} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitleInline, { color: TEXT }]}>
                {isReschedule
                  ? 'New time'
                  : hideDoctorPicker
                    ? '2. Select Time Slot'
                    : '3. Select Time Slot'}
              </Text>
              <Text style={[styles.sectionSubInline, { color: MUTED }]}>
                {isReschedule
                  ? 'Tap a free slot to move your appointment.'
                  : 'Choose an available time.'}
              </Text>
            </View>
          </View>

          {dateStatusBanner ? (
            <View
              style={[
                styles.statusBanner,
                dateStatusBanner.tone === 'error' && styles.statusBannerError,
                dateStatusBanner.tone === 'info' && styles.statusBannerInfo,
                dateStatusBanner.tone === 'muted' && styles.statusBannerMuted,
              ]}
            >
              <Text
                style={[
                  styles.statusBannerTitle,
                  dateStatusBanner.tone === 'error' && styles.statusBannerTitleError,
                  dateStatusBanner.tone === 'info' && styles.statusBannerTitleInfo,
                ]}
              >
                {dateStatusBanner.title}
              </Text>
              <Text style={styles.statusBannerText}>{dateStatusBanner.text}</Text>
            </View>
          ) : null}

          {slotsLoading ? (
            <View style={styles.emptySlotsBox}>
              <Text style={styles.emptySlotsText}>Loading slots…</Text>
            </View>
          ) : slots.length === 0 ? (
            dateStatusBanner ? null : (
              <View style={styles.emptySlotsBox}>
                <Calendar color={accent} size={22} />
                <Text style={styles.emptySlotsTitle}>No more slots left.</Text>
                <Text style={styles.emptySlotsText}>Please select another date.</Text>
              </View>
            )
          ) : (
            <View style={styles.slotsGrid}>
              {slots.map((slot) => {
                const label = formatSlotLabel(slot.start);
                const isUnavailable =
                  slot.status === 'booked' ||
                  slot.status === 'blocked' ||
                  slot.status === 'past';
                const isAvailable = !isUnavailable;
                const isSelected = isAvailable && selectedSlot?.start === slot.start;
                if (isSelected) {
              return (
                    <View key={slot.start} style={styles.slotCell}>
                <TouchableOpacity
                        onPress={() => {
                          setSelectedSlot(slot);
                          setSelectedSlotTouched(true);
                        }}
                        activeOpacity={0.85}
                      >
                        <LinearGradient
                          colors={['#124E96', '#06ADC6']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={[styles.slotItem, styles.slotItemSelectedGrad]}
                        >
                          <Clock color="#fff" size={14} />
                          <Text
                            style={[styles.slotText, styles.slotTextOn]}
                            numberOfLines={1}
                          >
                            {label}
                  </Text>
                        </LinearGradient>
                </TouchableOpacity>
                    </View>
                  );
                }
                return (
                  <View key={slot.start} style={styles.slotCell}>
                    <TouchableOpacity
                      style={[
                        styles.slotItem,
                        isAvailable && styles.slotItemAvailable,
                        isUnavailable && styles.slotItemUnavailable,
                      ]}
                      onPress={() => {
                        if (isUnavailable) return;
                        setSelectedSlot(slot);
                        setSelectedSlotTouched(true);
                        if (slot.isOnline && onlineBookingLive) {
                          setPaymentMode('online');
                        } else {
                          setPaymentMode('offline');
                        }
                      }}
                      disabled={isUnavailable}
                      activeOpacity={isUnavailable ? 1 : 0.85}
                    >
                      <Clock color={isAvailable ? (slot.isOnline ? '#7c3aed' : '#059669') : MUTED} size={14} />
                      <Text
                        style={[
                          styles.slotText,
                          isAvailable && (slot.isOnline ? { color: '#7c3aed', fontWeight: '600' } : styles.slotTextAvailable),
                          isUnavailable && styles.slotTextUnavailable,
                        ]}
                        numberOfLines={1}
                      >
                        {label} {slot.isOnline ? '📹' : ''}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Reason */}
        <View style={[styles.sectionCard, { backgroundColor: CARD_BG, borderColor: isDark ? BORDER : 'rgba(18,78,150,0.08)' }]}>
          <View style={styles.sectionHeaderLeft}>
            <View style={styles.sectionIconWrap}>
              <MessageCircle color="#124E96" size={16} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitleInline, { color: TEXT }]}>
                {isReschedule
                  ? 'Update reason (optional)'
                  : hideDoctorPicker
                    ? '3. Reason for Visit'
                    : '4. Reason for Visit'}
              </Text>
              <Text style={[styles.sectionSubInline, { color: MUTED }]}>
                {isReschedule
                  ? 'Keep or edit the reason for this visit.'
                  : 'Let us know how we can help you.'}
              </Text>
            </View>
          </View>

          <View style={[styles.reasonBox, { borderColor: isDark ? BORDER : 'rgba(18,78,150,0.10)' }]}>
            <FileText color={MUTED} size={16} style={{ marginTop: 2 }} />
            <TextInput
              style={[styles.reasonInput, { color: TEXT }]}
          placeholder="Describe your symptoms or reason..."
              placeholderTextColor={MUTED}
          value={reason}
          onChangeText={setReason}
          multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        </View>

        {isReschedule && selectedSlotTouched && selectedSlot?.start ? (
          <View style={styles.newSelectionCard}>
            <Text style={styles.newSelectionLabel}>New selection</Text>
            <Text style={styles.newSelectionValue}>
              {formatBookingDate(selectedDate)} · {formatSlotLabel(selectedSlot.start)}
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.bookBtnWrap, bookingLoading && styles.bookBtnDisabled]}
          onPress={openConfirmBooking}
          disabled={bookingLoading}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={['#124E96', '#06ADC6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.bookBtn}
          >
            <Text style={styles.bookBtnText}>
              {isReschedule ? 'Confirm Reschedule' : 'Confirm & Book Appointment'}
            </Text>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
      </View>

      {/* Confirm booking / reschedule */}
      <Modal
        visible={confirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !bookingLoading && setConfirmOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => !bookingLoading && setConfirmOpen(false)}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalIconWrap}>
              <Calendar color={PRIMARY} size={28} />
            </View>
            <Text style={styles.modalTitle}>
              {isReschedule ? 'Confirm reschedule?' : 'Confirm booking?'}
            </Text>
            <Text style={styles.modalSubtitle}>
              {isReschedule
                ? 'Please review the new appointment details before confirming.'
                : 'Please review your appointment details before confirming.'}
            </Text>

            <View style={styles.summaryBox}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Doctor</Text>
                <Text style={styles.summaryValue} numberOfLines={1}>
                  {selectedDoctor?.name || '—'}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Date</Text>
                <Text style={styles.summaryValue}>{formatBookingDate(selectedDate)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Time</Text>
                <Text style={styles.summaryValue}>
                  {selectedSlot?.start ? formatSlotLabel(selectedSlot.start) : '—'}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Type</Text>
                <Text style={styles.summaryValue}>
                  {selectedSlot?.isOnline ? 'Video Consultation' : 'In-Person Consultation'}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Payment</Text>
                <Text style={styles.summaryValue}>
                  {selectedSlot?.isOnline && onlineBookingLive ? 'Online (Razorpay)' : 'Pay at Clinic'}
                </Text>
              </View>
              {reason.trim() ? (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Reason</Text>
                  <Text style={styles.summaryValue} numberOfLines={2}>
                    {reason.trim()}
                  </Text>
                </View>
              ) : null}
              {!isReschedule && selectedDoctor?.fees != null ? (
                <View style={[styles.summaryRow, styles.summaryRowLast]}>
                  <Text style={styles.summaryLabel}>Fee</Text>
                  <Text style={styles.summaryValue}>₹{selectedDoctor.fees}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setConfirmOpen(false)}
                disabled={bookingLoading}
                activeOpacity={0.85}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, bookingLoading && styles.bookBtnDisabled]}
                onPress={submitBooking}
                disabled={bookingLoading}
                activeOpacity={0.9}
              >
                <Text style={styles.modalConfirmText}>
                  {bookingLoading
                    ? isReschedule
                      ? 'Rescheduling…'
                      : 'Booking…'
                    : isReschedule
                      ? 'Reschedule'
                      : selectedSlot?.isOnline && onlineBookingLive
                        ? 'Pay & Book'
                        : 'Confirm Booking'}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <RazorpayCheckoutModal
        visible={razorpayOpen}
        checkout={razorpayCheckout}
        onResult={handleRazorpayResult}
        onClose={async () => {
          const orderId = razorpayCheckout?.orderId;
          const appointmentId = razorpayCheckout?.appointmentId;
          if (orderId || appointmentId) {
            try {
              await appointmentApi.cancelPaymentOrder({
                razorpay_order_id: orderId,
                appointmentId,
              });
            } catch (err) {
              console.warn('Cancel payment on close failed:', err?.message || err);
            }
          }
          setRazorpayOpen(false);
          setRazorpayCheckout(null);
          setPendingOnlineBooking(null);
        }}
      />

      {/* Booking / reschedule success */}
      <Modal
        visible={successOpen}
        transparent
        animationType="fade"
        onRequestClose={dismissSuccessModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={dismissSuccessModal}>
          <Pressable
            style={[styles.successCard, { backgroundColor: CARD_BG, borderColor: BORDER }]}
            onPress={(e) => e.stopPropagation?.()}
          >
            {paymentMode === 'online' && !isReschedule ? null : (
              <TouchableOpacity
                style={[styles.successCloseBtn, { backgroundColor: PAGE_BG, borderColor: BORDER }]}
                onPress={dismissSuccessModal}
                activeOpacity={0.85}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Ionicons name="close" size={18} color={MUTED} />
              </TouchableOpacity>
            )}

            <View style={styles.successRing}>
              <View style={[styles.successRingInner, { backgroundColor: '#ECFDF3' }]}>
                <View style={styles.successCircle}>
                  <Check color="#fff" size={30} strokeWidth={3} />
                </View>
              </View>
            </View>
            <Text style={[styles.successTitle, { color: TEXT }]}>
              {isReschedule ? 'Rescheduled!' : 'Booking confirmed'}
            </Text>
            <Text style={[styles.successBody, { color: MUTED }]}>
              {isReschedule
                ? 'Your visit has been moved to the new slot.'
                : paymentMode === 'online'
                  ? 'Payment received and your appointment is confirmed. Join Google Meet from My Appointments when the visit window opens.'
                  : 'Your appointment is confirmed. Pay the consultation fee at the clinic.'}
            </Text>

            <View
              style={[
                styles.successSummary,
                {
                  backgroundColor: PAGE_BG,
                  borderColor: BORDER,
                },
              ]}
            >
              <Text style={[styles.successSummaryDoctor, { color: TEXT }]} numberOfLines={1}>
                {selectedDoctor?.name || 'Doctor'}
              </Text>
              {selectedDoctor?.specialization ? (
                <Text style={[styles.successSummaryMeta, { color: MUTED }]} numberOfLines={1}>
                  {selectedDoctor.specialization}
                </Text>
              ) : null}
              <View style={styles.successSummaryRow}>
                <Calendar color={MUTED} size={14} />
                <Text style={[styles.successSummaryMeta, { color: MUTED }]}>
                  {formatBookingDate(selectedDate)}
                </Text>
              </View>
              <View style={styles.successSummaryRow}>
                <Clock color={MUTED} size={14} />
                <Text style={[styles.successSummaryMeta, { color: MUTED }]}>
                  {selectedSlot?.start ? formatSlotLabel(selectedSlot.start) : 'Scheduled'}
                </Text>
              </View>
              {!isReschedule ? (
                <View
                  style={[
                    styles.successPayPill,
                    {
                      backgroundColor:
                        paymentMode === 'online' ? '#ECFDF5' : PRIMARY_SOFT,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.successPayPillText,
                      { color: paymentMode === 'online' ? '#059669' : PRIMARY },
                    ]}
                  >
                    {paymentMode === 'online' ? 'Paid online' : 'Pay at clinic'}
                  </Text>
                </View>
              ) : null}
            </View>

            <TouchableOpacity
              style={styles.successPrimaryBtn}
              onPress={closeSuccessAndGoAppointments}
              activeOpacity={0.9}
            >
              <Text style={styles.successPrimaryText}>View Appointments</Text>
            </TouchableOpacity>
            {isReschedule || paymentMode === 'online' ? null : (
              <TouchableOpacity
                style={styles.successSecondaryBtn}
                onPress={dismissSuccessModal}
                activeOpacity={0.85}
              >
                <Text style={styles.successSecondaryText}>Book another</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.successCloseTextBtn,
                paymentMode === 'online' && !isReschedule
                  ? [styles.successCloseBtnFilled, { backgroundColor: PAGE_BG, borderColor: BORDER }]
                  : null,
              ]}
              onPress={dismissSuccessModal}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.successCloseText,
                  {
                    color:
                      paymentMode === 'online' && !isReschedule ? TEXT : MUTED,
                  },
                ]}
              >
                Close
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <AppDialog
        visible={popup.visible}
        onClose={closePopup}
        variant={popup.variant || 'info'}
        icon={popup.icon}
        title={popup.title}
        message={popup.message}
        details={popup.details}
        options={popup.options}
        primaryLabel={popup.primaryLabel}
        onPrimary={popup.onPrimary || closePopup}
        secondaryLabel={popup.secondaryLabel}
        onSecondary={popup.onSecondary || closePopup}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerWrap: {
    zIndex: 4,
    elevation: 8,
    shadowColor: '#053B74',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  headerShell: {
    paddingHorizontal: SPACING.md,
    paddingBottom: 22,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    overflow: 'hidden',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  headerTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  contentSheet: {
    flex: 1,
    marginTop: -16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    zIndex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerReschedule: {
    backgroundColor: '#F8FAFC',
    borderBottomColor: '#E2E8F0',
  },
  rescheduleBanner: {
    marginHorizontal: SPACING.md,
    marginTop: 22,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(43,132,237,0.10)',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  rescheduleBannerEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: PRIMARY,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  rescheduleBannerText: {
    marginTop: 4,
    fontSize: 13,
    color: '#1E3A5F',
    lineHeight: 18,
  },
  currentBookingCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    padding: 16,
    marginBottom: 16,
  },
  currentBookingTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  currentBookingLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: PRIMARY,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  currentStatusPill: {
    backgroundColor: PRIMARY_SOFT,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  currentStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: PRIMARY,
  },
  currentDoctorName: {
    fontSize: 18,
    fontWeight: '800',
    color: TEXT,
  },
  currentDoctorSpec: {
    marginTop: 2,
    fontSize: 13,
    color: MUTED,
    fontWeight: '600',
  },
  currentMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 12,
  },
  currentMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  currentMetaText: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT,
  },
  currentReason: {
    marginTop: 10,
    fontSize: 12,
    color: MUTED,
    lineHeight: 17,
  },
  currentCountHint: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '700',
    color: PRIMARY,
  },
  reschedulePanel: {
    marginBottom: 8,
  },
  reschedulePanelTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: TEXT,
  },
  reschedulePanelSub: {
    marginTop: 4,
    fontSize: 13,
    color: MUTED,
    lineHeight: 18,
    marginBottom: 8,
  },
  selectedDoctorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#053B74',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  selectedDoctorAvatar: {
    width: 54,
    height: 54,
    borderRadius: 16,
  },
  selectedDoctorName: {
    fontSize: 16,
    fontWeight: '800',
  },
  selectedDoctorSpec: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  selectedDoctorFee: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: '#124E96',
  },
  changeDoctorBtn: {
    backgroundColor: '#EAF2FC',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  changeDoctorBtnText: {
    color: '#124E96',
    fontWeight: '700',
    fontSize: 13,
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    elevation: 1,
    shadowColor: '#053B74',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  sectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#EAF2FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newSelectionCard: {
    marginTop: 14,
    backgroundColor: PRIMARY_SOFT,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  newSelectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: PRIMARY,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  newSelectionValue: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '700',
    color: TEXT,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5F6F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: 22,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  stepItem: {
    alignItems: 'center',
    width: 64,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EEF0F3',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stepCircleActive: {
    backgroundColor: PRIMARY,
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: MUTED,
  },
  stepNumberActive: {
    color: '#fff',
  },
  stepLabel: {
    fontSize: 10,
    color: MUTED,
    fontWeight: '600',
  },
  stepLabelActive: {
    color: '#124E96',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#EEF0F3',
    marginBottom: 16,
  },
  stepLineActive: {
    backgroundColor: '#06ADC6',
  },
  scrollContent: {
    paddingHorizontal: SPACING.md,
    paddingTop: 8,
    paddingBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT,
  },
  sectionSub: {
    fontSize: 12,
    color: MUTED,
    marginTop: 2,
    marginBottom: 12,
  },
  sectionHeaderLeftSpaced: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    marginBottom: 12,
  },
  sectionTitleInline: {
    fontSize: 15,
    fontWeight: '800',
    color: TEXT,
  },
  sectionSubInline: {
    fontSize: 12,
    color: MUTED,
    marginTop: 2,
  },
  doctorsRow: {
    paddingBottom: 4,
    gap: 10,
  },
  doctorChip: {
    width: 128,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    marginRight: 2,
  },
  doctorChipSelected: {
    backgroundColor: PRIMARY,
    borderColor: PRIMARY,
  },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  doctorChipAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginBottom: 8,
    marginTop: 4,
  },
  avatarFallback: {
    backgroundColor: PRIMARY_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doctorChipName: {
    fontSize: 13,
    fontWeight: '700',
    color: TEXT,
    textAlign: 'center',
  },
  doctorChipSpec: {
    fontSize: 11,
    color: MUTED,
    marginTop: 2,
    textAlign: 'center',
  },
  doctorChipTextOn: {
    color: '#fff',
  },
  doctorChipTextOnMuted: {
    color: 'rgba(255,255,255,0.85)',
  },
  comingSoonChip: {
    width: 128,
    backgroundColor: '#F5F6F8',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  comingSoonText: {
    marginTop: 8,
    fontSize: 11,
    color: MUTED,
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 15,
  },
  datesRow: {
    gap: 10,
    paddingBottom: 4,
  },
  calLegendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
    marginTop: 2,
  },
  calLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  calLegendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
    borderWidth: 1,
  },
  calLegendAvailable: {
    backgroundColor: '#d1fae5',
    borderColor: '#6ee7b7',
  },
  calLegendBlocked: {
    backgroundColor: '#ffe4e6',
    borderColor: '#fecdd3',
  },
  calLegendSelected: {
    backgroundColor: '#dbeafe',
    borderColor: '#3b82f6',
  },
  calLegendText: {
    fontSize: 11,
    fontWeight: '600',
  },
  dateChip: {
    width: 72,
    height: 96,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  dateChipSelected: {
    backgroundColor: PRIMARY,
    borderColor: PRIMARY,
  },
  dateChipSelectedGrad: {
    borderWidth: 0,
  },
  dateChipAvailableWeb: {
    backgroundColor: '#d1fae5',
    borderColor: '#6ee7b7',
  },
  dateChipBlockedWeb: {
    backgroundColor: '#ffe4e6',
    borderColor: '#fecdd3',
  },
  dateChipSelectedWeb: {
    backgroundColor: '#dbeafe',
    borderColor: '#3b82f6',
    borderWidth: 2.5,
  },
  dateChipUnavailable: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
    opacity: 0.85,
  },
  dateDayName: {
    fontSize: 11,
    color: MUTED,
    fontWeight: '600',
  },
  dateDayNum: {
    fontSize: 22,
    fontWeight: '800',
    color: TEXT,
    marginVertical: 2,
  },
  dateMonthName: {
    fontSize: 11,
    color: MUTED,
    fontWeight: '600',
  },
  dateTextOn: {
    color: '#fff',
  },
  dateTextOnMuted: {
    color: 'rgba(255,255,255,0.85)',
  },
  dateTextUnavailable: {
    color: MUTED,
  },
  dateTextAvailableWeb: {
    color: '#047857',
  },
  dateTextAvailableWebNum: {
    color: '#065f46',
  },
  dateTextBlockedWeb: {
    color: '#be123c',
  },
  dateTextBlockedWebNum: {
    color: '#9f1239',
  },
  dateTextSelectedWeb: {
    color: '#1d4ed8',
  },
  dateTextSelectedWebNum: {
    color: '#1e40af',
  },
  dateSelectedTag: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '700',
    color: '#2563eb',
  },
  statusBanner: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  statusBannerError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  statusBannerInfo: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  statusBannerMuted: {
    backgroundColor: PRIMARY_SOFT,
    borderColor: '#BFDBFE',
  },
  statusBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: TEXT,
    marginBottom: 4,
  },
  statusBannerTitleError: {
    color: '#B91C1C',
  },
  statusBannerTitleInfo: {
    color: '#047857',
  },
  statusBannerText: {
    fontSize: 12,
    lineHeight: 18,
    color: MUTED,
  },
  emptySlotsBox: {
    backgroundColor: PRIMARY_SOFT,
    borderRadius: 16,
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 4,
  },
  emptySlotsTitle: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '700',
    color: TEXT,
  },
  emptySlotsText: {
    fontSize: 12,
    color: MUTED,
    textAlign: 'center',
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -5,
  },
  slotCell: {
    width: '33.333%',
    paddingHorizontal: 5,
    marginBottom: 10,
  },
  slotItem: {
    width: '100%',
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 11,
    backgroundColor: '#fff',
  },
  slotItemAvailable: {
    backgroundColor: '#ECFDF5',
    borderColor: '#6EE7B7',
  },
  slotItemSelected: {
    backgroundColor: PRIMARY,
    borderColor: PRIMARY,
  },
  slotItemSelectedGrad: {
    borderWidth: 0,
  },
  slotItemUnavailable: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
    opacity: 0.75,
  },
  slotText: {
    fontSize: 12,
    fontWeight: '700',
    color: TEXT,
    flexShrink: 1,
  },
  slotTextAvailable: {
    color: '#047857',
  },
  slotTextOn: {
    color: '#fff',
  },
  slotTextUnavailable: {
    color: MUTED,
  },
  reasonBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 12,
    minHeight: 110,
    backgroundColor: '#F8FBFF',
  },
  reasonInput: {
    flex: 1,
    fontSize: 14,
    color: TEXT,
    minHeight: 90,
    padding: 0,
  },
  bookBtnWrap: {
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 16,
    overflow: 'hidden',
  },
  bookBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  bookBtnDisabled: {
    opacity: 0.7,
  },
  bookBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 18, 32, 0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 22,
  },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: PRIMARY_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: TEXT,
    textAlign: 'center',
  },
  modalSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 19,
  },
  summaryBox: {
    marginTop: 18,
    backgroundColor: '#F7F9FC',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  summaryRowLast: {
    borderBottomWidth: 0,
  },
  summaryLabel: {
    fontSize: 13,
    color: MUTED,
    fontWeight: '600',
  },
  summaryValue: {
    flex: 1,
    fontSize: 13,
    color: TEXT,
    fontWeight: '700',
    textAlign: 'right',
  },
  modalActions: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 10,
  },
  paymentSection: {
    marginTop: 16,
  },
  paymentTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: TEXT,
    marginBottom: 10,
  },
  paymentRow: {
    flexDirection: 'row',
    gap: 10,
  },
  paymentCard: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    backgroundColor: '#fff',
    gap: 4,
  },
  paymentCardActive: {
    borderColor: PRIMARY,
    backgroundColor: PRIMARY_SOFT,
  },
  paymentCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: TEXT,
    marginTop: 4,
  },
  paymentCardTitleActive: {
    color: PRIMARY,
  },
  paymentCardSub: {
    fontSize: 11,
    color: MUTED,
    textAlign: 'center',
  },
  paymentHint: {
    marginTop: 10,
    fontSize: 11,
    lineHeight: 16,
    color: MUTED,
  },
  modalCancelBtn: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: TEXT,
  },
  modalConfirmBtn: {
    flex: 1,
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: PRIMARY,
  },
  modalConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  successCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 24,
    paddingTop: 28,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    position: 'relative',
    elevation: 10,
    shadowColor: '#0057FF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
  },
  successCloseBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  successCloseTextBtn: {
    marginTop: 4,
    paddingVertical: 8,
  },
  successCloseBtnFilled: {
    marginTop: 10,
    alignSelf: 'stretch',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 13,
    alignItems: 'center',
  },
  successCloseText: {
    fontSize: 14,
    fontWeight: '700',
  },
  successRing: {
    marginBottom: 16,
  },
  successRingInner: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#12B76A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: TEXT,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  successBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: MUTED,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  successSummary: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
  },
  successSummaryDoctor: {
    fontSize: 15,
    fontWeight: '800',
  },
  successSummaryMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  successSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  successPayPill: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  successPayPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  successHighlight: {
    color: TEXT,
    fontWeight: '700',
  },
  meetJoinWrap: {
    marginTop: 14,
    alignSelf: 'stretch',
  },
  meetJoinBtn: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 13,
  },
  meetJoinBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  meetJoinHint: {
    marginTop: 6,
    fontSize: 12,
    textAlign: 'center',
  },
  successPrimaryBtn: {
    marginTop: 14,
    alignSelf: 'stretch',
    backgroundColor: PRIMARY,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  successPrimaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  successSecondaryBtn: {
    marginTop: 8,
    paddingVertical: 10,
  },
  successSecondaryText: {
    color: PRIMARY,
    fontSize: 14,
    fontWeight: '700',
  },
  successCloseTextBtn: {
    marginTop: 4,
    paddingVertical: 8,
  },
  successCloseBtnFilled: {
    marginTop: 10,
    alignSelf: 'stretch',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 13,
    alignItems: 'center',
  },
  successCloseText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
