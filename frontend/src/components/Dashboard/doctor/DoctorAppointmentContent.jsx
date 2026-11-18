// src/components/Dashboard/doctor/DoctorAppointmentContent.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from '../../ui/button';
import { userAuthStore } from "@/store/authStore";
import { useBlockedSlotStore } from "@/store/blockedSlotStore";
import { Save, Loader2, CheckCircle, Video } from 'lucide-react';
import { getStatusColor } from "@/lib/constant";
import { getImageUrl } from "@/utils/imageUrl";
import Footer from "@/components/HomePage/Footer";


const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

// Helper functions

function formatLocalDate(isoOrDate) {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return d.toLocaleString([], { year: "numeric", month: "short", day: "numeric" });
}

function ymdLocal(dateObj) {
  const d = new Date(dateObj);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Helper to check if day is fully blocked
function isFullDayBlocked(blockedSlots, ymd, workingHours = { start: "09:00", end: "17:00" }) {
  const workStart = new Date(`${ymd}T${workingHours.start}:00`);
  const workEnd = new Date(`${ymd}T${workingHours.end}:00`);
  const intervals = blockedSlots
    .map(slot => {
      const s = slot.startTime ? new Date(slot.startTime) : null;
      const e = slot.endTime ? new Date(slot.endTime) : null;
      if (!s || !e || s > workEnd || e < workStart) return null;
      const clippedStart = s < workStart ? new Date(workStart) : s;
      const clippedEnd = e > workEnd ? new Date(workEnd) : e;
      return { start: clippedStart, end: clippedEnd };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);

  if (!intervals.length) return false;

  // Merge intervals
  const merged = [];
  for (const interval of intervals) {
    if (!merged.length) {
      merged.push(interval);
      continue;
    }
    const last = merged[merged.length - 1];
    if (interval.start <= last.end) {
      last.end = new Date(Math.max(last.end, interval.end));
    } else {
      merged.push(interval);
    }
  }

  return (
    merged.length === 1 &&
    merged[0].start.getTime() <= workStart.getTime() &&
    merged[0].end.getTime() >= workEnd.getTime()
  );
}

function Section({ title, subtitle, right, children }) {
  return (
    <section className="rounded-2xl border border-blue-100 bg-white shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 sm:px-5 py-4 border-b border-blue-100">
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-blue-900">{title}</h3>
          {subtitle && <p className="text-xs sm:text-sm text-gray-600 mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-2.5 text-xs text-gray-700 mb-2 font-body">
      <span className="flex items-center gap-1">
        <span className="w-3 h-3 rounded bg-teal-100 ring-1 ring-teal-300" />
        In-Person Available
      </span>
      <span className="flex items-center gap-1">
        <span className="w-3 h-3 rounded bg-purple-100 ring-1 ring-purple-400" />
        💻 Online Meeting
      </span>
      <span className="flex items-center gap-1">
        <span className="w-3 h-3 rounded bg-rose-100 ring-1 ring-rose-300" />
        Blocked / Fully Booked
      </span>
      <span className="flex items-center gap-1">
        <span className="w-3 h-3 rounded bg-blue-100 ring-1 ring-blue-300" />
        Selected
      </span>
    </div>
  );
}

function Badge({ children }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs ring-1 bg-blue-50 text-blue-700 ring-blue-200">
      {children}
    </span>
  );
}

function ErrorBanner({ children }) {
  return (
    <div className="p-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-sm">
      {children}
    </div>
  );
}

function InfoBanner({ tone = "amber", children }) {
  const tones = {
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  return <div className={`p-3 rounded-xl border text-sm ${tones[tone]}`}>{children}</div>;
}

function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-xl bg-gray-100 ${className}`} />;
}

// Appointment Card Component
function AppointmentCard({ apt }) {
  return (
    <div className="relative p-5 rounded-xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white shadow-md hover:shadow-lg transition-all">

      {/* Status Badge - Top Right */}
      {apt.status && (
        <div className="absolute top-3 right-3">
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs border-2 shadow-sm ${getStatusColor(
              apt.status
            )}`}
          >
            {apt.status}
          </span>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-col gap-4">

        {/* Patient Info Section */}
        <div className="flex items-start gap-4">
          <img
            src={getImageUrl(apt.patientId?.profileImage, apt.patientId?.name)}
            alt={apt.patientId?.name || "Patient"}
            className="w-16 h-16 rounded-full object-cover border-3 border-blue-300 shadow-md"
          />
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold text-blue-900">
              {apt.patientId?.name || "Unknown Patient"}
            </p>
            {apt.patientId?.email && (
              <p className="text-sm text-gray-600 truncate">
                📧 {apt.patientId.email}
              </p>
            )}
            {apt.patientId?.phone && (
              <p className="text-sm text-gray-700 font-medium">
                📱 {apt.patientId.phone}
              </p>
            )}
          </div>
        </div>

        {/* Appointment Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-white/60 p-4 rounded-lg border border-blue-100">

          <div className="flex items-center gap-2">
            <span className="text-blue-600">📅 Date:</span>
            <span className="text-gray-800 font-medium">
              {apt.date ? formatLocalDate(apt.date) : formatLocalDate(apt.slotStartIso)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-blue-600">🕐 Time:</span>
            <span className="text-gray-800 font-medium">
              {formatTime(apt.slotStartIso)} – {formatTime(apt.slotEndIso)}
            </span>
          </div>

          {apt._id && (
            <div className="flex items-center gap-2 md:col-span-2">
              <span className="text-gray-500 text-xs">ID:</span>
              <span className="text-gray-600 text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                {apt._id.toString().slice(-8).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Clinical Information */}
        {(apt.symptoms || apt.prescription || apt.notes) && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
            <h4 className="text-amber-900 text-sm mb-2">📋 Clinical Details</h4>

            {apt.symptoms && (
              <div>
                <span className="text-xs text-gray-700">Symptoms:</span>
                <p className="text-sm text-gray-800 mt-1">{apt.symptoms}</p>
              </div>
            )}

            {apt.prescription && (
              <div>
                <span className="text-xs text-gray-700">Prescription:</span>
                <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{apt.prescription}</p>
              </div>
            )}

            {apt.notes && (
              <div>
                <span className="text-xs text-gray-700">Notes:</span>
                <p className="text-sm text-gray-800 mt-1">{apt.notes}</p>
              </div>
            )}
          </div>
        )}

        {/* Reschedule Info */}
        {apt.rescheduleCount > 0 && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm">
            <span className="text-purple-800">🔄 Rescheduled {apt.rescheduleCount}x</span>
            {apt.rescheduleHistory?.[apt.rescheduleHistory.length - 1]?.note && (
              <p className="text-xs text-gray-600 mt-1">
                {apt.rescheduleHistory[apt.rescheduleHistory.length - 1].note}
              </p>
            )}
          </div>
        )}

        {/* Reassign Info */}
        {apt.reassignCount > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm">
            <span className="text-orange-800">👥 Reassigned {apt.reassignCount}x</span>
            {apt.previousDoctorId && (
              <p className="text-xs text-gray-600 mt-1">Previously assigned to another doctor</p>
            )}
          </div>
        )}

        {/* Cancellation Info */}
        {apt.status === "Cancelled" && apt.cancelReason && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-800">❌ Cancelled</p>
            <p className="text-xs text-gray-700 mt-1">
              <span className="font-medium">Reason:</span> {apt.cancelReason}
            </p>
            {apt.cancelledBy && (
              <p className="text-xs text-gray-600 mt-1">
                Cancelled by: {apt.cancelledByType || 'Unknown'} on {formatLocalDate(apt.cancelledAt)}
              </p>
            )}
          </div>
        )}

        {/* Missed appointment */}
        {(apt.status === "No Show" || apt.status === "Missed") && (
          <div className="bg-gray-100 border border-gray-300 rounded-lg p-3">
            <p className="text-sm text-gray-800">⚠️ Patient missed this appointment</p>
          </div>
        )}

        {/* Google Calendar */}
        {apt.googleCalendar?.synced && apt.googleCalendar.eventLink && (
          <a
            href={apt.googleCalendar.eventLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
          >
            📅 View in Google Calendar
          </a>
        )}

        {/* Timestamps */}
        <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-200">
          <span>Created: {formatLocalDate(apt.createdAt)}</span>
          {apt.updatedAt && apt.updatedAt !== apt.createdAt && (
            <span>Updated: {formatLocalDate(apt.updatedAt)}</span>
          )}
        </div>

      </div>
    </div>
  );
}

function CalendarGrid({
  days,
  selectedDate,
  onSelectDate,
  fullyBookedSet,
  blockedSlots,
  availabilityRange,
  setSelectedRedDate,
  setSelectedRedReason,
}) {
  if (!days.length) return null;

  function getReason(date, ymd, isPast) {
    if (isPast) return "Past Date";
    if (fullyBookedSet.has(ymd)) return "Fully Booked";
    for (const slot of blockedSlots) {
      const s = new Date(slot.startTime);
      const e = new Date(slot.endTime);
      s.setHours(0, 0, 0, 0);
      e.setHours(23, 59, 59, 999);
      if (date >= s && date <= e) return slot.reason || "Blocked";
    }
    if (availabilityRange) {
      const excluded = availabilityRange.excludedWeekdays || [];
      if (excluded.includes(date.getDay())) return "Unavailable weekday";
    }
    return null;
  }

  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((meta, idx) => {
        if (meta === null) return <div key={`empty-${idx}`} />;
        const d = new Date(meta.date);
        const isSelected = selectedDate && new Date(selectedDate).toDateString() === d.toDateString();
        const isBlockedOrUnavailable = !meta.selectable || meta.isBlocked || meta.isUnavailable;
        const isFullyBooked = fullyBookedSet.has(meta.ymd);
        let cls =
          "aspect-square flex flex-col items-center justify-center rounded-xl border text-xs cursor-pointer transition";
        if (meta.isPast) {
          cls += " bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60";
        } else if (isBlockedOrUnavailable || isFullyBooked) {
          cls += " bg-rose-100 text-rose-700 border-rose-200 hover:ring-2 hover:ring-rose-400";
        } else if (isSelected) {
          cls += meta.hasOnlineShift
            ? " bg-purple-600 text-white border-purple-700 shadow-md font-semibold"
            : " bg-blue-100 text-blue-900 border-blue-300 font-semibold";
        } else if (meta.hasOnlineShift) {
          cls += " bg-purple-100 text-purple-900 border-purple-300 hover:bg-purple-200 shadow-xs";
        } else {
          cls += " bg-teal-100 text-teal-800 border-teal-300 hover:brightness-95";
        }
        const reason = getReason(d, meta.ymd, meta.isPast);
        return (
          <button
            key={meta.ymd}
            disabled={meta.isPast}
            onClick={() => {
              if (meta.isPast) return;
              onSelectDate(new Date(d));
              setSelectedRedDate(meta.ymd);
              if (isBlockedOrUnavailable || isFullyBooked) setSelectedRedReason(reason || "Blocked");
              else setSelectedRedReason(null);
            }}
            className={cls}
            title={reason || (meta.hasOnlineShift ? "Online Meeting Available" : meta.ymd)}
          >
            <span className="text-[10px] sm:text-sm font-semibold">{d.getDate()}</span>
            <span className="text-[10px]">{d.toLocaleString("en-US", { month: "short" })}</span>
            {meta.hasOnlineShift && !meta.isPast && !isBlockedOrUnavailable && !isFullyBooked && (
              <span className="text-[9px] leading-none text-purple-700 font-bold bg-purple-200/80 px-1 rounded-full mt-0.5">
                💻 Online
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function DoctorAppointmentContent() {
  const navigate = useNavigate();
  const { user } = userAuthStore();
  const [loading, setLoading] = useState(true);
  const [doctor, setDoctor] = useState(null);
  const [error, setError] = useState(null);
  const [availabilityRange, setAvailabilityRange] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const selectedYmd = selectedDate ? ymdLocal(selectedDate) : null;
  const [selectedRedReason, setSelectedRedReason] = useState(null);
  const [selectedRedDate, setSelectedRedDate] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const blockedSlots = useBlockedSlotStore((state) => state.blockedSlots);
  const fetchBlockedSlots = useBlockedSlotStore((state) => state.fetchBlockedSlots);

  const [appointments, setAppointments] = useState([]);
  const [slotsMap, setSlotsMap] = useState({});

  const token = localStorage.getItem("token");
  const doctorId = user?._id;

  const goToPreviousMonth = () => {
    if (
      calendarMonth.getFullYear() === new Date().getFullYear() &&
      calendarMonth.getMonth() === new Date().getMonth()
    )
      return;
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    setSelectedDate(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1));
    setSelectedRedReason(null);
  };

  const goToNextMonth = () => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    setSelectedDate(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1));
    setSelectedRedReason(null);
  };

  const goToCurrentMonth = () => {
    const now = new Date();
    setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(now);
    setSelectedRedReason(null);
  };

  const calendarDays = useMemo(() => {
    if (!calendarMonth) return [];
    const days = [];
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const firstDayWeekday = firstDayOfMonth.getDay();
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();

    const workingHours = availabilityRange?.workingHours || { start: "09:00", end: "17:00" };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < firstDayWeekday; i++) {
      days.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      let selectable = true;
      let isBlocked = false;
      let isUnavailable = false;
      let isPast = false;

      if (d < today) {
        selectable = false;
        isPast = true;
      }

      if (!isPast && availabilityRange) {
        const excluded = availabilityRange?.excludedWeekdays || [];
        if (excluded.includes(d.getDay())) {
          selectable = false;
          isUnavailable = true;
        }
      }

      const ymd = ymdLocal(d);
      if (!isPast) {
        const fullBlocked = isFullDayBlocked(blockedSlots, ymd, workingHours);
        if (fullBlocked) {
          selectable = false;
          isBlocked = true;
        }
      }

      let hasOnlineShift = false;
      if (!isPast && doctor) {
        const dayNum = d.getDay();
        const dailyRanges = doctor.dailyTimeRanges || [];
        if (doctor.availabilityMode === "custom") {
          hasOnlineShift = dailyRanges.some((r) => r.day === dayNum && r.isOnline);
        } else {
          const excluded = availabilityRange?.excludedWeekdays || [];
          if (!excluded.includes(dayNum)) {
            hasOnlineShift = dailyRanges.some((r) => r.day === undefined && r.isOnline);
          }
        }
      }

      days.push({ date: d, ymd, selectable, isBlocked, isUnavailable, isPast, hasOnlineShift });
    }

    while (days.length % 7 !== 0) {
      days.push(null);
    }

    return days;
  }, [calendarMonth, availabilityRange, blockedSlots, doctor]);

  useEffect(() => {
    if (doctorId) {
      fetchBlockedSlots(doctorId);
    }
  }, [doctorId, fetchBlockedSlots]);

  useEffect(() => {
    if (!doctorId || !token) return;
    let active = true;

    (async () => {
      const map = {};
      await Promise.all(
        calendarDays
          .filter((d) => d !== null && !d.isPast)
          .map(async (day) => {
            try {
              const res = await fetch(`${BACKEND}/api/appointment/available-slots/${doctorId}/${day.ymd}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              const json = await res.json();
              if (active) map[day.ymd] = Array.isArray(json.data) ? json.data : [];
            } catch {
              if (active) map[day.ymd] = [];
            }
          })
      );
      if (active) setSlotsMap(map);
    })();

    return () => {
      active = false;
    };
  }, [doctorId, calendarDays, token]);

  const fullyBookedSet = useMemo(() => {
    const set = new Set();
    for (const day of calendarDays) {
      if (day && day.selectable && !day.isBlocked && !day.isUnavailable && !day.isPast) {
        if ((slotsMap[day.ymd] || []).length === 0) {
          set.add(day.ymd);
        }
      }
    }
    return set;
  }, [calendarDays, slotsMap]);

  useEffect(() => {
    if (!doctorId || !token) return;
    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${BACKEND}/api/patient/doctors/${doctorId}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok || json.status === "error") {
          throw new Error(json.message || "Failed to load profile");
        }
        setDoctor(json.data);
        setAvailabilityRange(json?.data?.availabilityRange || null);
      } catch (e) {
        if (e?.name !== "AbortError") {
          setError(e?.message || "Failed to load profile");
        }
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [doctorId, token]);

  const selectedDayAppointments = useMemo(() => {
    if (!selectedDate || !appointments.length) return [];

    const today = selectedDate; // Use the selected date from calendar

    // Same-day checker (copied from DoctorDashboard - PROVEN TO WORK)
    const isSameDay = (d1, d2) =>
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();

    // 🔹 Filter appointments for the selected day
    const apptsForDay = appointments.filter((apt) => {
      // Try multiple possible date fields (same as dashboard)
      const dateValue =
        apt.slotStartIso ||
        apt.start?.dateTime ||
        apt.startDate ||
        apt.date ||
        apt.slot?.start;

      if (!dateValue) return false;

      const aptDate = new Date(dateValue);

      // Check if date is valid
      if (Number.isNaN(aptDate.getTime())) return false;

      // Check if same day
      return isSameDay(aptDate, today);
    });

    // 🔹 Sort by time (earliest first)
    return apptsForDay.sort((a, b) => {
      const timeA = new Date(
        a.slotStartIso || a.start?.dateTime || a.startDate || a.date
      ).getTime();
      const timeB = new Date(
        b.slotStartIso || b.start?.dateTime || b.startDate || b.date
      ).getTime();
      return timeA - timeB;
    });
  }, [selectedDate, appointments]);

  useEffect(() => {
    console.log('='.repeat(80));
    console.log('🔍 DEBUG INFO:');
    console.log('📅 Selected Date:', selectedDate);
    console.log('📋 Total Appointments:', appointments.length);
    console.log('✅ Filtered Appointments:', selectedDayAppointments.length);

    if (appointments.length > 0) {
      console.log('📦 First 3 appointments:', appointments.slice(0, 3).map(apt => ({
        id: apt._id?.toString().slice(-8),
        patient: apt.patientId?.name,
        slotStartIso: apt.slotStartIso,
        date: apt.date,
        status: apt.status
      })));
    }

    if (selectedDayAppointments.length > 0) {
      console.log('🎯 Matched appointments:', selectedDayAppointments.map(apt => ({
        id: apt._id?.toString().slice(-8),
        patient: apt.patientId?.name,
        time: formatTime(apt.slotStartIso),
        status: apt.status
      })));
    } else {
      console.log('❌ NO APPOINTMENTS MATCHED THE SELECTED DATE');
    }

    console.log('='.repeat(80));
  }, [selectedDate, appointments, selectedDayAppointments]);

  useEffect(() => {
    if (!doctorId || !token) {
      console.log('⚠️ No doctorId or token');
      return;
    }

    const controller = new AbortController();
    let isMounted = true;

    (async () => {
      try {
        console.log('🔄 Fetching all appointments for doctor:', doctorId);

        const res = await fetch(`${BACKEND}/api/doctor/appointments?limit=1000`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const json = await res.json();

        console.log('📥 Appointments API Response:', {
          status: json.status,
          count: json.data?.appointments?.length,
        });

        const rawAppointments = json.data?.appointments || [];

        const mapped = rawAppointments.map((a) => {
          const startIso =
            a.slotStartIso || (a.date && a.timeSlot?.start ? new Date(`${a.date}T${a.timeSlot.start}:00`).toISOString() : null) || a.date;
          const endIso =
            a.slotEndIso || (a.date && a.timeSlot?.end ? new Date(`${a.date}T${a.timeSlot.end}:00`).toISOString() : null);

          return {
            ...a,
            slotStartIso: startIso,
            slotEndIso: endIso,
          };
        });

        if (isMounted) {
          setAppointments(mapped);
          console.log('✅ Set appointments:', mapped.length);
        }

      } catch (error) {
        if (error.name !== 'AbortError' && isMounted) {
          console.error('❌ Error fetching appointments:', error);
          setAppointments([]);
        }
      }
    })();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [doctorId, token]);


  if (!user || user.type !== "doctor") {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <ErrorBanner>Access denied. This page is for doctors only.</ErrorBanner>
        <Link to="/doctor/dashboard" className="inline-flex mt-4 px-4 py-2 rounded-full bg-white ring-1 ring-blue-200 text-blue-900 hover:bg-blue-50">
          Back
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-8 px-4">
        <Skeleton className="h-24 mb-4" />
        <Skeleton className="h-48 mb-4" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <ErrorBanner>{error}</ErrorBanner>
        <Link to="/doctor/dashboard" className="inline-flex mt-4 px-4 py-2 rounded-full bg-white ring-1 ring-blue-200 text-blue-900 hover:bg-blue-50">
          Back
        </Link>
      </div>
    );
  }

  if (!doctor) return null;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-gradient-to-r from-[#134e97] via-[#0b5c9b] to-[#06adc6] shadow">
        <div className="backdrop-blur-md bg-white/0 py-3 sm:py-4 relative">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-1 sm:py-2 relative">
            <div className="flex items-center justify-start">
              <button
                onClick={() => navigate(-1)}
                className="inline-flex items-center gap-2 px-2.5 py-1.5 text-xs sm:text-sm rounded-full bg-white/10 text-white hover:bg-white/20 border border-white/20 transition"
                aria-label="Back"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 19l-7-7 7-7" />
                </svg>
                <span className="hidden sm:inline">Back</span>
              </button>
            </div>
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
              <h1 className="text-base sm:text-2xl font-bold text-white text-center truncate max-w-[220px] sm:max-w-none">
                All Appointments
              </h1>
            </div>
          </div>
        </div>
      </header>

      <div className="p-4 sm:p-6 max-w-6xl mx-auto flex-1 w-full">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Left: Calendar */}
          <div className="md:col-span-7 space-y-6">
            <Section title="My Availability" right={<Legend />}>
              <div className="flex items-center justify-between mb-4 gap-2 whitespace-nowrap overflow-hidden">
                <button
                  onClick={goToPreviousMonth}
                  disabled={
                    calendarMonth.getFullYear() === new Date().getFullYear() &&
                    calendarMonth.getMonth() === new Date().getMonth()
                  }
                  className={`flex items-center gap-1 px-2 sm:px-3 py-1 rounded-full border border-blue-200 bg-white text-blue-700 transition ${calendarMonth.getFullYear() === new Date().getFullYear() &&
                    calendarMonth.getMonth() === new Date().getMonth()
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-blue-100"
                    }`}
                >
                  <span className="text-xs sm:text-sm">←</span>
                  <span className="hidden sm:inline">Prev</span>
                </button>

                <div className="font-semibold text-base sm:text-lg px-1 py-1 text-center flex-1 truncate">
                  {calendarMonth.toLocaleString("default", { month: "long", year: "numeric" })}
                </div>

                <button
                  onClick={goToNextMonth}
                  className="flex items-center gap-1 px-2 sm:px-3 py-1 rounded-full border border-blue-200 bg-white text-blue-700 hover:bg-blue-100 transition"
                >
                  <span className="hidden sm:inline">Next</span>
                  <span className="text-xs sm:text-sm">→</span>
                </button>
              </div>

              <div className="grid grid-cols-7 text-center text-[13px] font-medium text-gray-600 mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>

              <CalendarGrid
                days={calendarDays}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                fullyBookedSet={fullyBookedSet}
                blockedSlots={blockedSlots}
                availabilityRange={availabilityRange}
                setSelectedRedDate={setSelectedRedDate}
                setSelectedRedReason={setSelectedRedReason}
              />
            </Section>
          </div>

          {/* Right: Appointments List */}
          <div className="md:col-span-5 md:sticky md:top-4">
            <Section title={selectedRedReason ? "Date Unavailable" : "Booked Appointments"}>
              <div className="space-y-4">
                <div>
                  <div className="text-sm font-medium text-blue-900 mb-2">
                    Date: <span className="font-normal text-gray-600">{selectedYmd ? formatLocalDate(selectedYmd) : ""}</span>
                  </div>

                  {selectedRedReason ? (
                    <div className="p-4 rounded-xl bg-rose-100 border border-rose-200 text-rose-900 text-sm">
                      <strong>Reason:</strong> {selectedRedReason}
                    </div>
                  ) : loading ? (
                    <p className="text-sm text-gray-500 mt-1">Loading appointments…</p>
                  ) : (
                    <div className="space-y-3">
                      {/* Blocked Slots */}
                      {blockedSlots
                        .filter(slot => {
                          const start = new Date(slot.startTime);
                          return (
                            start.getFullYear() === selectedDate.getFullYear() &&
                            start.getMonth() === selectedDate.getMonth() &&
                            start.getDate() === selectedDate.getDate()
                          );
                        })
                        .map((slot, i) => (
                          <div
                            key={`blocked-${i}`}
                            className="p-4 rounded-xl border border-rose-200 bg-rose-50 flex items-center justify-between"
                          >
                            <div>
                              <p className="text-rose-800">Blocked Slot</p>
                              <p className="text-sm text-gray-600">{slot.reason || "Time blocked"}</p>
                            </div>
                            <span className="text-sm font-medium text-rose-700">
                              {formatTime(slot.startTime)}{slot.endTime ? ` – ${formatTime(slot.endTime)}` : ""}
                            </span>
                          </div>
                        ))}

                      {/* ALL APPOINTMENTS - Simple Card Layout */}
                      {selectedDayAppointments.length === 0 ? (
                        <InfoBanner>No appointments for this date.</InfoBanner>
                      ) : (
                        <>
                          {selectedDayAppointments.map(apt => (
                            <div
                              key={apt._id}
                              className="p-4 rounded-xl border-2 border-blue-200 bg-white hover:shadow-md transition-all flex items-center justify-between"
                            >
                              {/* Left: Patient Info */}
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <img
                                  src={getImageUrl(apt.patientId?.profileImage, apt.patientId?.name)}
                                  alt={apt.patientId?.name || "Patient"}
                                  className="w-12 h-12 rounded-full object-cover border-2 border-blue-300"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="font-bold text-blue-900 truncate">
                                    {apt.patientId?.name || "Unknown Patient"}
                                  </p>
                                  <p className="text-sm text-gray-600">
                                    {formatTime(apt.slotStartIso)} – {formatTime(apt.slotEndIso)}
                                  </p>
                                </div>
                              </div>

                              {/* Right: Status Badge & Meet Link */}
                              <div className="flex items-center gap-3">
                                {(apt.googleCalendar?.meetLink || apt.meetLink) && apt.status !== 'Cancelled' && (
                                  <a
                                    href={apt.googleCalendar?.meetLink || apt.meetLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-2 rounded-lg bg-[#06adc6] text-white hover:bg-[#059ab0] hover:scale-105 transition-all flex items-center justify-center shadow-xs"
                                    title="Join Video Call"
                                  >
                                    <Video className="w-4 h-4" />
                                  </a>
                                )}
                                <span
                                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs whitespace-nowrap ${getStatusColor(
                                    apt.status
                                  )}`}
                                >
                                  {apt.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Section>

          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}




