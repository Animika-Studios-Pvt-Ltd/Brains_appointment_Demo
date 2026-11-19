// frontend/src/components/DoctorAppointment/DoctorAppointmentPage.jsx
import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import { useParams, Link, useLocation, useNavigate } from "react-router-dom";
import { useBlockedSlotStore } from "../../../store/blockedSlotStore";
import Swal from "sweetalert2";
import Footer from "@/components/HomePage/Footer";
import PageBackButton from "@/components/common/PageBackButton";
import Header from "@/components/HomePage/Header";
import { getImageUrl } from "@/utils/imageUrl";
import { BOOK_APPOINTMENT_PAGE_CONTAINER } from "@/config/doctorPublicPageLayout";
import {
  BadgeCheck,
  Calendar,
  Check,
  Stethoscope,
} from "lucide-react";
import "./DoctorAppointmentPage.css";

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/* ---------- network helper (tries multiple endpoints) ---------- */
async function tryEndpoints(endpoints, options = {}) {
  let lastErr = null;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, options);
      const text = await res.text().catch(() => "");
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch (e) {
        json = text;
      }

      if (!res.ok) {
        lastErr =
          json?.message ||
          `HTTP ${res.status} ${res.statusText} — ${text || url}`;
        continue;
      }
      return { ok: true, url, json, res };
    } catch (err) {
      lastErr = err?.message || String(err);
    }
  }
  return { ok: false, lastErr };
}

/* ---------- small format helpers ---------- */

function formatLocalDate(isoOrDate) {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return d.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatLocalTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatSlotTime12h(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatSelectedDateLong(date) {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function hasRealDoctorPhoto(path) {
  if (!path || typeof path !== "string") return false;
  const p = path.trim();
  return p && !p.includes("ui-avatars.com") && !p.includes("avatar-placeholder");
}

function doctorInitials(name) {
  return (
    (name || "DR")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "DR"
  );
}

function ymdLocal(dateObj) {
  const d = new Date(dateObj);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatFullDateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function extractOldSlotIso(res) {
  if (!res) return null;
  const candidates = [
    res.slotStartIso,
    res.start,
    res.slot?.start,
    res.__orig?.slotStartIso,
    res.__orig?.start,
    res.__orig?.slot?.start,
  ];
  for (const c of candidates) if (c) return c;
  return null;
}

/* ---------- blocked-slot helpers (copied) ---------- */
function getBlockedMetaForDate(blockedSlots, ymd) {
  if (!Array.isArray(blockedSlots) || blockedSlots.length === 0) {
    return { intervals: [], isFullDayBlocked: false };
  }

  const dayStart = new Date(`${ymd}T00:00:00`);
  const dayEnd = new Date(`${ymd}T23:59:59.999`);

  const intervals = blockedSlots
    .map((slot) => {
      const s = slot.startTime ? new Date(slot.startTime) : null;
      const e = slot.endTime ? new Date(slot.endTime) : null;
      if (!s || !e || Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()))
        return null;
      if (e < dayStart || s > dayEnd) return null;
      const clippedStart = s < dayStart ? new Date(dayStart) : s;
      const clippedEnd = e > dayEnd ? new Date(dayEnd) : e;
      return {
        start: clippedStart,
        end: clippedEnd,
        reason: slot.reason || "Blocked",
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  if (!intervals.length) return { intervals: [], isFullDayBlocked: false };

  const merged = [];
  for (const it of intervals) {
    if (!merged.length) {
      merged.push({ start: it.start, end: it.end });
      continue;
    }
    const last = merged[merged.length - 1];
    if (it.start.getTime() <= last.end.getTime()) {
      last.end = new Date(Math.max(last.end.getTime(), it.end.getTime()));
    } else {
      merged.push({ start: it.start, end: it.end });
    }
  }

  const coversWhole =
    merged.length === 1 &&
    merged[0].start.getTime() <= dayStart.getTime() &&
    merged[0].end.getTime() >= dayEnd.getTime();

  const mergedIso = merged.map((m) => ({
    start: m.start.toISOString(),
    end: m.end.toISOString(),
  }));

  return { intervals: mergedIso, isFullDayBlocked: coversWhole };
}

/* ---------- small UI components ---------- */
function BookingLegend() {
  return (
    <div className="book-legend" aria-label="Calendar legend">
      <span className="book-legend__item">
        <span className="book-legend__swatch book-legend__swatch--available" />
        Available
      </span>
      <span className="book-legend__item">
        <span className="book-legend__swatch book-legend__swatch--blocked" />
        Blocked / Fully Booked
      </span>
      <span className="book-legend__item">
        <span className="book-legend__swatch book-legend__swatch--selected" />
        Selected
      </span>
    </div>
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
  return (
    <div className={`p-3 rounded-xl border text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

function Skeleton({ className = "" }) {
  return (
    <div className={`animate-pulse rounded-xl bg-gray-100 ${className}`} />
  );
}

function BookSlotsSkeleton() {
  return (
    <>
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="book-time-slot book-time-slot--skeleton"
          aria-hidden
        />
      ))}
    </>
  );
}

/* ---------- main component ---------- */
export default function DoctorAppointmentPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [doctor, setDoctor] = useState(null);
  const [error, setError] = useState(null);

  const [availabilityRange, setAvailabilityRange] = useState(null);
  const blockedSlots = useBlockedSlotStore((s) => s.blockedSlots);
  const fetchBlockedSlots = useBlockedSlotStore((s) => s.fetchBlockedSlots);

  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState(null);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);

  // require user to actively choose a slot for reschedule/reassign
  const [selectedSlotTouched, setSelectedSlotTouched] = useState(false);

  const [symptoms, setSymptoms] = useState("");
  const [bookingMsg, setBookingMsg] = useState(null);
  const [bookingErr, setBookingErr] = useState(null);
  const [bookingLoading, setBookingLoading] = useState(false);

  const [availabilityMap, setAvailabilityMap] = useState({});
  const [calendarFetching, setCalendarFetching] = useState(false);
  const [paymentMode, setPaymentMode] = useState("offline"); // offline | online
  const [isOnlineBookingLive, setIsOnlineBookingLive] = useState(true);

  const token = localStorage.getItem("token");

  useEffect(() => {
    async function checkOnlineBookingStatus() {
      try {
        const res = await fetch(`${BACKEND}/api/system-settings/online-booking`);
        const json = await res.json();
        if (json.status === "success") {
          setIsOnlineBookingLive(json.onlineBookingLive);
          if (!json.onlineBookingLive) {
            setPaymentMode("offline");
          }
        }
      } catch (err) {
        console.warn("Failed to check online booking status:", err);
      }
    }
    checkOnlineBookingStatus();
  }, []);

  // NEW: slot to restore after login
  const [pendingSlotFromLogin, setPendingSlotFromLogin] = useState(null);

  const slotsSectionRef = useRef(null);
  const slotsFetchAbortRef = useRef(null);

  // existing reschedule flow:
  const rescheduleAppointment = location?.state?.rescheduleAppointment || null;

  // NEW: admin reassign flow:
  const adminReassign = location?.state?.adminReassign === true;
  const reassignAppointment = location?.state?.reassignAppointment || null;

  // Turnstile related
  const [turnstileToken, setTurnstileToken] = useState(null);
  const turnstileWidgetRef = useRef(null);
  const rawSiteKey =
    import.meta.env.VITE_CLOUDFLARE_TURNSTILE_SITEKEY ||
    (typeof process !== 'undefined' && process?.env?.REACT_APP_CLOUDFLARE_TURNSTILE_SITEKEY) ||
    null;
  const turnstileSiteKey = rawSiteKey ? rawSiteKey.trim() : null;

  // For UI: compute the old slot label from either rescheduleAppointment or reassignAppointment
  const oldIso = extractOldSlotIso(
    rescheduleAppointment || reassignAppointment
  );
  const oldSlotLabel = oldIso ? formatFullDateTime(oldIso) : null;

  // Align a given ISO datetime to the nearest slot boundary (round down)
  // e.g. 10:17 with slotMinutes=30 -> 10:00. Alignment is computed relative to local day start.
  function alignToSlotStart(iso, slotMinutes) {
    const d = new Date(iso);
    // compute minutes since local midnight
    const midnight = new Date(d);
    midnight.setHours(0, 0, 0, 0);
    const minsSinceMidnight = Math.floor((d - midnight) / 60000);
    const slotIndex = Math.floor(minsSinceMidnight / slotMinutes);
    const aligned = new Date(
      midnight.getTime() + slotIndex * slotMinutes * 60000
    );
    return aligned;
  }

  // Split interval [startIso, endIso) into slot-sized chunks aligned to slot boundaries.
  // If end isn't exactly on a boundary we still create only full slots that fit wholly inside the interval.
  function splitIntoSlotChunks(startIso, endIso, slotMinutes) {
    if (!startIso || !endIso) return [];
    const startRaw = new Date(startIso);
    const endRaw = new Date(endIso);
    if (Number.isNaN(startRaw.getTime()) || Number.isNaN(endRaw.getTime()))
      return [];

    // Align start to slot boundary (round DOWN)
    let cursor = alignToSlotStart(startRaw.toISOString(), slotMinutes);
    if (cursor < startRaw) {
      const maybeNext = new Date(cursor.getTime() + slotMinutes * 60000);
      if (maybeNext <= startRaw) {
        cursor = maybeNext;
      } else {
        const slotEnd = new Date(cursor.getTime() + slotMinutes * 60000);
        if (slotEnd <= startRaw) {
          cursor = new Date(cursor.getTime() + slotMinutes * 60000);
        }
      }
    }

    const chunks = [];
    while (true) {
      const next = new Date(cursor.getTime() + slotMinutes * 60000);
      if (next > endRaw) break;
      chunks.push({
        start: cursor.toISOString(),
        end: next.toISOString(),
      });
      cursor = next;
    }
    return chunks;
  }

  const unifiedSlots = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const s of (availableSlots || [])) {
      if (!s || !s.start) continue;
      if (!seen.has(s.start)) {
        seen.add(s.start);
        result.push({
          type: s.status || "available",
          start: s.start,
          end: s.end,
          isOnline: Boolean(s.isOnline),
          raw: s,
        });
      }
    }
    return result;
  }, [availableSlots]);

  useEffect(() => {
    if (!pendingSlotFromLogin || !unifiedSlots.length) return;

    const targetStartDate = pendingSlotFromLogin.start
      ? new Date(pendingSlotFromLogin.start)
      : null;

    if (!targetStartDate || Number.isNaN(targetStartDate.getTime())) {
      setPendingSlotFromLogin(null);
      return;
    }

    const targetHour = targetStartDate.getHours();
    const targetMinute = targetStartDate.getMinutes();

    let availableMatch = null;
    let anyMatch = null;

    for (const slot of unifiedSlots) {
      const d = new Date(slot.start);
      if (Number.isNaN(d.getTime())) continue;

      const h = d.getHours();
      const m = d.getMinutes();

      // same time (HH:mm)?
      if (h === targetHour && m === targetMinute) {
        if (!anyMatch) anyMatch = slot;
        if (slot.type === "available" && !availableMatch) {
          availableMatch = slot;
        }
      }
    }

    const match = availableMatch || anyMatch;

    if (match && match.type === "available") {
      // ✅ slot is still available → pre-select it
      setSelectedSlot(match.raw || { start: match.start, end: match.end });
      setSelectedSlotTouched(true);

      // scroll into view on mobile/tablets
      if (typeof window !== "undefined" && window.innerWidth <= 1024) {
        if (slotsSectionRef.current) {
          setTimeout(() => {
            slotsSectionRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }, 80);
        }
      }
    } else if (anyMatch) {
      // ⛔ The same time exists but is no longer available (past / booked / blocked)
      // You can optionally show a message here if you want.
      // Example (uncomment if you like):
      // setBookingErr("Your previously selected time is no longer available. Please choose another slot.");
    } else {
      console.warn("❌ Could not find matching slot to restore after login", {
        pendingSlotFromLogin,
        unifiedSlots,
      });
    }

    setPendingSlotFromLogin(null);
  }, [pendingSlotFromLogin, unifiedSlots]);



  useEffect(() => {
    const saved = sessionStorage.getItem("postLoginBooking");
    if (!saved) return;

    const booking = JSON.parse(saved);

    if (booking.selectedDate) {
      setSelectedDate(new Date(booking.selectedDate));
    }

    if (booking.selectedSlot && booking.selectedSlot.start) {
      setPendingSlotFromLogin({
        start: booking.selectedSlot.start,
        end: booking.selectedSlot.end || null,
      });
    }

    if (typeof booking.symptoms === "string") {
      setSymptoms(booking.symptoms);
    }

    sessionStorage.removeItem("postLoginBooking");
  }, []);


  // Turnstile script loader (unchanged)
  useEffect(() => {
    if (!turnstileSiteKey) {
      console.warn("Turnstile sitekey missing — widget will not be shown.");
      return;
    }

    let mounted = true;
    let attempts = 0;
    const maxAttempts = 8;
    const attemptIntervalMs = 300;
    let widgetId = null;

    function renderWidgetIfReady() {
      attempts += 1;
      const targetEl = document.getElementById("cf-turnstile");
      if (!targetEl) {
        if (attempts < maxAttempts && mounted) {
          setTimeout(renderWidgetIfReady, attemptIntervalMs);
        } else {
          console.warn(
            "Turnstile: target element #cf-turnstile not found after retries."
          );
        }
        return;
      }

      if (!window.turnstile) {
        if (attempts < maxAttempts && mounted) {
          setTimeout(renderWidgetIfReady, attemptIntervalMs);
        } else {
          console.warn("Turnstile script not loaded after retries.");
        }
        return;
      }

      try {
        const already = targetEl.getAttribute("data-turnstile-rendered");
        if (already) {
          turnstileWidgetRef.current = already;
          return;
        }

        const wid = window.turnstile.render(targetEl, {
          sitekey: turnstileSiteKey,
          theme: "light",
          callback: (token) => setTurnstileToken(token),
          "expired-callback": () => setTurnstileToken(null),
        });

        if (wid !== undefined && wid !== null) {
          targetEl.setAttribute("data-turnstile-rendered", String(wid));
          turnstileWidgetRef.current = wid;
        }
      } catch (e) {
        console.warn("Turnstile render failed (exception):", e);
      }
    }

    if (
      !document.querySelector(
        'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
      )
    ) {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (mounted) renderWidgetIfReady();
      };
      script.onerror = () =>
        console.warn("Failed to load Turnstile script (network/adblock).");
      document.head.appendChild(script);
    } else {
      renderWidgetIfReady();
    }

    return () => {
      mounted = false;
      try {
        if (turnstileWidgetRef.current && window.turnstile) {
          if (window.turnstile.remove) {
            window.turnstile.remove(turnstileWidgetRef.current);
          } else {
            window.turnstile.reset(turnstileWidgetRef.current);
          }
        }
        turnstileWidgetRef.current = null;
        const target = document.getElementById("cf-turnstile");
        if (target) {
          target.removeAttribute("data-turnstile-rendered");
        }
      } catch (e) { }
    };
  }, [turnstileSiteKey]);

  function resetTurnstileWidget() {
    try {
      if (turnstileWidgetRef.current && window.turnstile) {
        window.turnstile.reset(turnstileWidgetRef.current);
        setTurnstileToken(null);
      } else {
        setTurnstileToken(null);
      }
    } catch (e) {
      console.warn("Failed to reset turnstile widget:", e);
      setTurnstileToken(null);
    }
  }

  /** Fresh token from widget (avoids stale token after confirm dialog) */
  function getTurnstileTokenForSubmit() {
    if (!turnstileSiteKey) return null;
    try {
      const wid = turnstileWidgetRef.current;
      if (wid != null && window.turnstile?.getResponse) {
        const live = window.turnstile.getResponse(wid);
        if (live) return live;
      }
    } catch (e) {
      console.warn("Turnstile getResponse failed:", e);
    }
    return turnstileToken;
  }

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`${BACKEND}/api/patient/doctors/${id}`, {
          signal: controller.signal,
        });

        const json = await res.json();
        if (!res.ok || json.status === "error") {
          throw new Error(json.message || `Failed to load doctor`);
        }

        setDoctor(json.data);
        setAvailabilityRange(json?.data?.availabilityRange || null);
      } catch (e) {
        if (e?.name !== "AbortError") {
          setError(e?.message || "Failed to load doctor");
        }
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetchBlockedSlots(id).catch(() => { });
  }, [id, fetchBlockedSlots]);

  const calendarDays = useMemo(() => {
    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);

      const local = new Date(d);
      local.setHours(0, 0, 0, 0);

      let selectable = true;
      let isBlocked = false;
      let isUnavailable = false;

      if (availabilityRange) {
        const s = availabilityRange?.startDate
          ? new Date(availabilityRange.startDate)
          : null;
        const e = availabilityRange?.endDate
          ? new Date(availabilityRange.endDate)
          : null;

        if (s) {
          const sClone = new Date(s);
          sClone.setHours(0, 0, 0, 0);
          if (local < sClone) {
            selectable = false;
            isUnavailable = true;
          }
        }
        if (e) {
          const eClone = new Date(e);
          eClone.setHours(23, 59, 59, 999);
          if (local > eClone) {
            selectable = false;
            isUnavailable = true;
          }
        }

        const excluded = availabilityRange?.excludedWeekdays || [];
        if (excluded.includes(local.getDay())) {
          selectable = false;
          isUnavailable = true;
        }
      }

      const ymd = ymdLocal(d);
      const meta = getBlockedMetaForDate(blockedSlots, ymd);
      const isFullDayBlocked = meta.isFullDayBlocked;
      const isPartiallyBlocked = !isFullDayBlocked && meta.intervals.length > 0;

      if (isFullDayBlocked) {
        selectable = false;
        isBlocked = true;
      }

      days.push({
        date: d,
        ymd,
        isPast: false,
        selectable: selectable && !isBlocked && !isUnavailable,
        isBlocked,
        isPartiallyBlocked,
        blockedIntervals: meta.intervals,
        isUnavailable,
      });
    }

    return days;
  }, [availabilityRange, blockedSlots]);

  const fetchSlots = useCallback(
    async (dateObj, { clearSlots = false, resetSelection = true } = {}) => {
      const ymd = ymdLocal(dateObj);

      slotsFetchAbortRef.current?.abort();
      const controller = new AbortController();
      slotsFetchAbortRef.current = controller;

      setSlotsLoading(true);
      setSlotsError(null);
      if (clearSlots) setAvailableSlots([]);
      if (resetSelection) {
        setSelectedSlot(null);
        setSelectedSlotTouched(false);
      }

      try {
        const res = await fetch(
          `${BACKEND}/api/appointment/available-slots/${id}/${ymd}`,
          { signal: controller.signal }
        );

        const json = await res.json();

        if (!res.ok) {
          throw new Error(json?.message || "Failed to load slots");
        }

        const slots = Array.isArray(json?.data) ? json.data : [];
        setAvailableSlots(slots);
        setAvailabilityMap((prev) => ({
          ...prev,
          [ymd]: { fetched: true, availableCount: slots.length, slots },
        }));
      } catch (e) {
        if (e?.name === "AbortError") return;
        setSlotsError(e?.message || "Failed to load slots");
      } finally {
        if (!controller.signal.aborted) {
          setSlotsLoading(false);
        }
      }
    },
    [id]
  );

  useEffect(() => {
    if (!selectedDate) return;
    const ymd = ymdLocal(selectedDate);
    const cached = availabilityMap[ymd];

    if (cached?.fetched && Array.isArray(cached.slots)) {
      setAvailableSlots(cached.slots);
      setSlotsError(null);
    }

    fetchSlots(selectedDate, { clearSlots: !cached?.fetched, resetSelection: true });
  }, [selectedDate, id]); // eslint-disable-line react-hooks/exhaustive-deps -- fetch when date changes only

  useEffect(() => {
    const appointment = reassignAppointment || rescheduleAppointment;
    if (!appointment) return;

    if (appointment.symptoms) {
      setSymptoms(appointment.symptoms);
    }

    const startIso =
      appointment.slotStartIso ||
      appointment.start ||
      appointment.slot?.start ||
      null;
    const endIso =
      appointment.slotEndIso ||
      appointment.end ||
      appointment.slot?.end ||
      null;
    if (startIso) {
      const s = new Date(startIso);
      const e = endIso ? new Date(endIso) : null;
      setSelectedDate(new Date(s.getFullYear(), s.getMonth(), s.getDate()));
      setSelectedSlot(
        e
          ? { start: s.toISOString(), end: e.toISOString() }
          : { start: s.toISOString(), end: null }
      );
      setSelectedSlotTouched(false);
    } else if (appointment.date) {
      setSelectedDate(new Date(appointment.date));
      setSelectedSlot(null);
      setSelectedSlotTouched(false);
    }
  }, [reassignAppointment, rescheduleAppointment]);

  function formatFullDate(dateObj) {
    const d = new Date(dateObj);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  const handleSelectDate = useCallback((date) => {
    setSelectedDate(date);
  }, []);

  async function submitBooking(e) {
    e.preventDefault();
    setBookingMsg(null);
    setBookingErr(null);
    if (!token) {
      await Swal.fire({
        icon: "info",
        title: "Please Log In.",
        text: "You must be logged in as a patient to book an appointment.",
        confirmButtonText: "Login",
        allowOutsideClick: false,
      });

      try {
        console.log("💾 Saving postLoginBooking:", {
          from: location.pathname + location.search,
          doctorId: id,
          selectedDate: selectedDate ? selectedDate.toISOString() : null,
          selectedSlot: selectedSlot
            ? { start: selectedSlot.start, end: selectedSlot.end }
            : null,
          symptoms,
        });

        sessionStorage.setItem(
          "postLoginBooking",
          JSON.stringify({
            from: location.pathname + location.search,
            doctorId: id,
            selectedDate: selectedDate ? selectedDate.toISOString() : null,
            selectedSlot: selectedSlot
              ? { start: selectedSlot.start, end: selectedSlot.end }
              : null,
            symptoms,
          })
        );

      } catch (e) {
        console.warn("Failed to save post-login booking info:", e);
      }

      navigate("/login", { replace: true });
      return;
    }

    // Check if patient profile required fields are filled (name, phone, and age)
    setBookingLoading(true);
    try {
      const meRes = await fetch(`${BACKEND}/api/patient/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const meJson = await meRes.json().catch(() => ({}));
      const p = meJson?.data || {};

      if (!meRes.ok || !p.name || !p.phone || !p.age) {
        setBookingLoading(false);
        await Swal.fire({
          icon: "warning",
          title: "Profile Incomplete",
          html: 'Please complete your required profile details (including full name, phone number, and age) before booking an appointment. You can update your profile <a href="/patient/profile" style="color: #134e97; text-decoration: underline; font-weight: bold;">here</a>.',
          confirmButtonText: "Go to Profile",
          showCancelButton: true,
          cancelButtonText: "Cancel",
          allowOutsideClick: false,
          confirmButtonColor: "#134e97",
        }).then((result) => {
          if (result.isConfirmed) {
            navigate("/patient/profile");
          }
        });
        return;
      }
    } catch (e) {
      console.warn("Failed to check profile completion:", e);
    } finally {
      setBookingLoading(false);
    }

    if (!selectedSlot) {
      setBookingErr("Please select a slot.");
      return;
    }

    const isReschedule = !!rescheduleAppointment && !adminReassign;
    const isReassign = adminReassign && !!reassignAppointment;

    if ((isReschedule || isReassign) && !selectedSlotTouched) {
      setBookingErr("Please select a new slot to continue.");
      return;
    }

    if (turnstileSiteKey && !turnstileToken) {
      await Swal.fire({
        icon: "info",
        title: "Human verification required",
        text: "Please complete the Cloudflare verification (the widget below) and try again.",
      });
      resetTurnstileWidget();
      return;
    }

    const confirmation = await Swal.fire({
      title: isReassign
        ? "Confirm Reassign?"
        : isReschedule
          ? "Confirm Reschedule?"
          : paymentMode === "online"
            ? "Confirm Online Appointment & Pay?"
            : "Confirm Booking?",
      text: isReassign
        ? `Reassign appointment to Dr. ${doctor?.name || id
        } on ${formatFullDate(selectedDate)} at ${formatLocalTime(
          selectedSlot.start
        )}?`
        : isReschedule
          ? `Reschedule the appointment to ${formatFullDate(
            selectedDate
          )} at ${formatLocalTime(selectedSlot.start)}?`
          : paymentMode === "online"
            ? `You are booking an Online Video Consultation on ${formatFullDate(
              selectedDate
            )} at ${formatLocalTime(selectedSlot.start)}. Consultation fee is ₹${doctor?.fees}.`
            : `Book an In-Person (Offline) Consultation on ${formatFullDate(
              selectedDate
            )} at ${formatLocalTime(selectedSlot.start)}?`,
      showCancelButton: true,
      confirmButtonText: isReassign
        ? "Yes, reassign"
        : isReschedule
          ? "Yes, reschedule"
          : paymentMode === "online"
            ? "Yes, Pay & Book"
            : "Yes, book",
      cancelButtonText: "No, cancel",
      confirmButtonColor: "#059669",
      customClass: {
        confirmButton: "swal-round-btn",
        cancelButton: "swal-round-btn",
      },
      buttonsStyling: false,
      width: "520px",
      padding: "1.5rem",
      allowOutsideClick: () => !Swal.isLoading(),
    });

    if (!confirmation || !confirmation.isConfirmed) return;

    const submitTurnstileToken = getTurnstileTokenForSubmit();
    if (turnstileSiteKey && !submitTurnstileToken) {
      await Swal.fire({
        icon: "info",
        title: "Verification expired",
        text: "Please complete the Cloudflare check again, then confirm booking.",
      });
      resetTurnstileWidget();
      return;
    }

    const finalSymptoms =
      symptoms && typeof symptoms === "string" && symptoms.trim()
        ? symptoms.trim()
        : rescheduleAppointment?.symptoms ||
        reassignAppointment?.symptoms ||
        "";

    try {
      setBookingLoading(true);

      if (isReassign) {
        const candidates = [
          `${BACKEND}/api/admin/appointments/${reassignAppointment._id}/reassign`,
          `${BACKEND}/api/appointment/${reassignAppointment._id}/reassign`,
          `${BACKEND}/api/appointment/reassign/${reassignAppointment._id}`,
          `${BACKEND}/api/admin/appointments/${reassignAppointment._id}/move`,
        ];

        const body = {
          newDoctorId: id,
          date: ymdLocal(selectedDate),
          slotStartIso: selectedSlot.start,
          slotEndIso: selectedSlot.end,
          symptoms: finalSymptoms,
        };

        if (submitTurnstileToken) body.turnstileToken = submitTurnstileToken;

        const res = await tryEndpoints(candidates, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          if (
            String(res.lastErr || "")
              .toLowerCase()
              .includes("verification")
          ) {
            resetTurnstileWidget();
          }
          throw new Error(res.lastErr || "Reassign failed");
        }

        await Swal.fire({
          icon: "success",
          title: "Reassigned",
          text: "Appointment reassigned successfully.",
          timer: 1500,
          showConfirmButton: false,
        });

        navigate(-1);
        return;
      }

      if (isReschedule) {
        const res = await fetch(
          `${BACKEND}/api/appointment/reschedule/${rescheduleAppointment._id}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              date: ymdLocal(selectedDate),
              slotStartIso: selectedSlot.start,
              slotEndIso: selectedSlot.end,
              symptoms: finalSymptoms,
              ...(submitTurnstileToken ? { turnstileToken: submitTurnstileToken } : {}),
            }),
          }
        );

        const json = await res.json();
        if (!res.ok) {
          if (
            res.status === 403 &&
            String(json?.message || "")
              .toLowerCase()
              .includes("verification")
          ) {
            resetTurnstileWidget();
          }
          throw new Error(json?.message || "Reschedule failed");
        }

        await Swal.fire({
          icon: "success",
          title: "Rescheduled",
          text: "Your appointment was rescheduled.",
          timer: 1500,
          showConfirmButton: false,
        });

        navigate(-1);
        return;
      }

      if (paymentMode === 'online') {
        const loaded = await loadRazorpayScript();
        if (!loaded) {
          throw new Error("Razorpay SDK failed to load. Please check your internet connection.");
        }

        const durationMinutes = doctor.appointmentDuration || doctor.slotDurationMinutes || 30;

        const orderRes = await fetch(`${BACKEND}/api/patient/payments/create-order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            doctorId: id,
            slotStartIso: selectedSlot.start,
            durationMinutes,
          }),
        });

        const orderJson = await orderRes.json();
        if (!orderRes.ok) {
          throw new Error(orderJson?.message || "Failed to create payment order");
        }

        const orderData = orderJson?.data || orderJson;
        if (!orderData?.orderId || !orderData?.keyId) {
          throw new Error(orderJson?.message || "Failed to initiate online payment order");
        }

        // Open Razorpay Checkout modal
        const options = {
          key: orderData.keyId,
          amount: orderData.amount,
          currency: orderData.currency || "INR",
          name: "Appointment Scheduler",
          description: `Video Consultation with Dr. ${doctor.name}`,
          order_id: orderData.orderId,
          handler: async function (response) {
            try {
              setBookingLoading(true);
              setBookingMsg("Verifying payment and booking appointment...");
              
              const verifyRes = await fetch(`${BACKEND}/api/patient/payments/verify-and-book`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  doctorId: id,
                  slotStartIso: selectedSlot.start,
                  durationMinutes,
                  consultationType: "Video Consultation",
                  symptoms: finalSymptoms,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              });

              const verifyJson = await verifyRes.json();
              if (!verifyRes.ok) {
                throw new Error(verifyJson?.message || "Payment verification failed");
              }

              await Swal.fire({
                icon: "success",
                title: "Booked",
                text: "Your Online Consultation has been successfully booked!",
                timer: 2000,
                showConfirmButton: false,
              });

              navigate("/patient/dashboard");
              setSymptoms("");
              setSelectedSlot(null);
              setSelectedSlotTouched(false);
              fetchSlots(selectedDate, { clearSlots: true });
              setAvailabilityMap((m) => ({
                ...m,
                [ymdLocal(selectedDate)]: { fetched: false },
              }));
              if (turnstileSiteKey) {
                resetTurnstileWidget();
              }
            } catch (err) {
              await Swal.fire({
                icon: "error",
                title: "Verification Failed",
                text: err.message || "Payment verification failed. Please contact support.",
              });
            } finally {
              setBookingLoading(false);
              setBookingMsg(null);
            }
          },
          prefill: {
            name: orderData.patientName || "",
            email: orderData.patientEmail || "",
            contact: orderData.patientPhone || "",
          },
          theme: {
            color: "#134e97",
          },
          modal: {
            ondismiss: async function () {
              try {
                await fetch(`${BACKEND}/api/patient/payments/cancel-order`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    razorpay_order_id: orderData.orderId,
                    appointmentId: orderData.appointmentId,
                  }),
                });
              } catch (e) {
                console.warn("Failed to cancel payment order on dismiss:", e);
              }
              setBookingLoading(false);
            },
          },
        };

        const rzp = new window.Razorpay(options);
        rzp.open();
        return;
      }

      {
        const res = await fetch(`${BACKEND}/api/appointment/book`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            doctorId: id,
            date: ymdLocal(selectedDate),
            slotStartIso: selectedSlot.start,
            slotEndIso: selectedSlot.end,
            symptoms: finalSymptoms,
            ...(submitTurnstileToken ? { turnstileToken: submitTurnstileToken } : {}),
          }),
        });

        const json = await res.json();

        if (!res.ok) {
          if (
            res.status === 403 &&
            (String(json?.message || "")
              .toLowerCase()
              .includes("verification") ||
              Array.isArray(json?.errorCodes))
          ) {
            resetTurnstileWidget();
            throw new Error(json?.message || "Verification failed");
          }

          if (
            res.status === 403 &&
            json?.data &&
            (json.data.isBlocked ||
              (typeof json.data.cancelCount === "number" &&
                typeof json.data.cancelLimit === "number" &&
                json.data.cancelCount >= json.data.cancelLimit) ||
              (typeof json.data.rescheduleCount === "number" &&
                typeof json.data.rescheduleLimit === "number" &&
                json.data.rescheduleCount >= json.data.rescheduleLimit))
          ) {
            const msg =
              json?.message ||
              "Your account is Locked for online booking. Please contact the receptionist to book a slot or unblock your account.";
            throw new Error(msg);
          }

          throw new Error(json?.message || "Booking failed");
        }

        await Swal.fire({
          icon: "success",
          title: "Booked",
          text: "Your appointment was booked.",
          timer: 1400,
          showConfirmButton: false,
        });

        navigate("/patient/dashboard");
        setSymptoms("");
        setSelectedSlot(null);
        setSelectedSlotTouched(false);
        fetchSlots(selectedDate, { clearSlots: true });
        setAvailabilityMap((m) => ({
          ...m,
          [ymdLocal(selectedDate)]: { fetched: false },
        }));
        if (turnstileSiteKey) {
          resetTurnstileWidget();
        }
      }
    } catch (err) {
      const msg = err?.message || "Operation failed";
      setBookingErr(msg);

      if (msg.includes("Locked for online booking")) {
        await Swal.fire({
          icon: "info",
          title: "Online Booking Locked",
          html: `
        Your account is Locked for online booking due to repeated cancellations/reschedules.
        Please contact the support team/receptionist for further assistance.
        <div style="margin-top:10px; font-size:0.9em; color:#374151;">
          Call: <strong>+91 9148080000</strong><br/>
          Email: <strong>support@appointmentportal.com</strong>
        </div>
      `,
          showCloseButton: true,
          showCancelButton: false,
          confirmButtonText: "OK",
          width: 520,
        });
      } else {
        if (msg && msg.toLowerCase().includes("profile incomplete")) {
          await Swal.fire({
            icon: "warning",
            title: "Profile Incomplete",
            html: 'Please complete your required profile details (including full name, phone number, and age) before booking an appointment. You can update your profile <a href="/patient/profile" style="color: #134e97; text-decoration: underline; font-weight: bold;">here</a>.',
            confirmButtonText: "Go to Profile",
            showCancelButton: true,
            cancelButtonText: "Cancel",
            allowOutsideClick: false,
            confirmButtonColor: "#134e97",
          }).then((result) => {
            if (result.isConfirmed) {
              navigate("/patient/profile");
            }
          });
          return;
        }

        await Swal.fire({
          icon: "error",
          title: "Regarding Appointment Booking",
          text: msg || "Something went wrong",
        });
      }
    } finally {
      setBookingLoading(false);
    }
  }

  const selectedMeta = selectedDate
    ? getBlockedMetaForDate(blockedSlots, ymdLocal(selectedDate))
    : { intervals: [], isFullDayBlocked: false };

  const noSlotsButPartiallyBlocked =
    !slotsLoading &&
    !slotsError &&
    selectedMeta &&
    Array.isArray(selectedMeta.intervals) &&
    selectedMeta.intervals.length > 0 &&
    !selectedMeta.isFullDayBlocked &&
    availableSlots.length === 0;

  useEffect(() => {
    if (!doctor || !calendarDays || calendarDays.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        setCalendarFetching(true);
        const map = {};
        const jobs = calendarDays.map((dayMeta) => {
          const ymd = dayMeta.ymd;
          return fetch(
            `${BACKEND}/api/appointment/available-slots/${id}/${ymd}`
          )
            .then((r) => r.json())
            .then((json) => ({
              ymd,
              data: json?.data || [],
              ok: json?.status === "success" || Array.isArray(json?.data),
            }))
            .catch(() => ({ ymd, data: [], ok: false }));
        });

        const settled = await Promise.allSettled(jobs);

        for (const res of settled) {
          if (res.status === "fulfilled") {
            const val = res.value;
            if (val && val.ymd) {
              const ymd = val.ymd;
              const slots = Array.isArray(val.data) ? val.data : [];
              map[ymd] = { fetched: true, availableCount: slots.length, slots };
            }
          }
        }

        if (!cancelled) setAvailabilityMap((prev) => ({ ...prev, ...map }));
      } catch (e) {
        console.error("Calendar availability prefetch failed:", e);
      } finally {
        if (!cancelled) setCalendarFetching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doctor, calendarDays, id]);

  if (loading) {
    return (
      <div className="book-appointment-page min-h-screen flex flex-col">
        <Header />
        <div className={`${BOOK_APPOINTMENT_PAGE_CONTAINER} py-6 flex-1`}>
          <Skeleton className="h-10 w-24 mb-6" />
          <Skeleton className="h-36 mb-6 rounded-2xl" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-96 rounded-2xl" />
            <Skeleton className="h-96 rounded-2xl" />
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${BOOK_APPOINTMENT_PAGE_CONTAINER} py-8`}>
        <ErrorBanner>{error}</ErrorBanner>
        <Link
          to="/patient/DoctorListPage"
          className="inline-flex mt-4 px-4 py-2 rounded-full bg-white ring-1 ring-blue-200 text-blue-900 hover:bg-blue-50">
          Back
        </Link>
      </div>
    );
  }

  if (!doctor) return null;

  const canSubmit =
    !!selectedSlot &&
    (!(rescheduleAppointment || reassignAppointment) || selectedSlotTouched);

  const appointmentForMeta = reassignAppointment || rescheduleAppointment;
  const patientName =
    appointmentForMeta?.patientId?.name ||
    appointmentForMeta?.patient?.name ||
    appointmentForMeta?.patientName ||
    "Patient";

  const headerTitle = adminReassign
    ? `Reassign: ${patientName} → Dr. ${doctor.name}`
    : rescheduleAppointment
      ? `Reschedule: ${patientName}`
      : "Book Appointment";

  const headerSubtitle = adminReassign
    ? `Current slot : ${oldSlotLabel || "—"}. Choose a new slot.`
    : rescheduleAppointment
      ? `Current slot: ${oldSlotLabel || "—"}. Select a new slot.`
      : "Pick a date and time to proceed.";

  const showPhoto = hasRealDoctorPhoto(doctor.profileImage);
  const expLabel =
    doctor.experience != null && doctor.experience !== ""
      ? `${doctor.experience} yrs Experience`
      : null;

  const confirmLabel = adminReassign
    ? "Reassign"
    : rescheduleAppointment
      ? "Reschedule"
      : "Confirm Booking";

  const confirmLoadingLabel = adminReassign
    ? "Reassigning…"
    : rescheduleAppointment
      ? "Rescheduling…"
      : "Booking…";

  return (
    <div className="book-appointment-page min-h-screen flex flex-col">
      <Header />
      <div
        className={`book-appointment-page__content ${BOOK_APPOINTMENT_PAGE_CONTAINER} py-4 sm:py-6 lg:py-8 flex-1`}>
        <PageBackButton
          className="book-appointment-page__back mb-4 sm:mb-5"
          onClick={() => navigate(-1)}
        />

        <div className="book-doctor-card">
          <div className="book-doctor-card__avatar-wrap">
            {showPhoto ? (
              <img
                src={getImageUrl(doctor.profileImage, doctor.name)}
                alt={doctor.name}
                className="book-doctor-card__avatar"
              />
            ) : (
              <span className="book-doctor-card__avatar-fallback" aria-hidden>
                {doctorInitials(doctor.name)}
              </span>
            )}
          </div>

          <div className="book-doctor-card__body">
            <div className="book-doctor-card__name-row">
              <h1 className="book-doctor-card__name">Dr. {doctor.name}</h1>
              <BadgeCheck className="book-doctor-card__verified h-5 w-5" aria-label="Verified" />
            </div>
            <p className="book-doctor-card__meta">
              <Stethoscope className="book-doctor-card__meta-icon h-4 w-4" aria-hidden />
              <span>
                {doctor.specialization || "General Physician"}
                {expLabel ? ` | ${expLabel}` : ""}
              </span>
            </p>
          </div>

          <div className="book-doctor-card__brand">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#134e97] bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full">
              Verified Doctor
            </span>
          </div>
        </div>

        <div className="book-appointment-layout">
          <section className="book-panel book-panel--calendar" aria-labelledby="availability-heading">
            <div className="book-panel__head">
              <h2 id="availability-heading" className="book-panel__title">
                Availability
              </h2>
              <BookingLegend />
            </div>
            <div className="book-panel__body">
              <div className="book-cal-wrap">
                <div className="book-cal-weekdays">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <div key={d}>
                      <span className="book-cal-wd book-cal-wd--full">{d}</span>
                      <span className="book-cal-wd book-cal-wd--short" aria-hidden>
                        {d.charAt(0)}
                      </span>
                    </div>
                  ))}
                </div>
                <CalendarGrid
                  days={calendarDays}
                  selectedDate={selectedDate}
                  onSelectDate={handleSelectDate}
                  availabilityMap={availabilityMap}
                  doctor={doctor}
                />
              </div>
            </div>
          </section>

          <section className="book-panel book-panel--booking" aria-labelledby="booking-heading">
            <div className="book-panel__head">
              <div>
                <div className="book-panel__title-row">
                  <Calendar className="book-panel__title-icon h-5 w-5" aria-hidden />
                  <h2 id="booking-heading" className="book-panel__title">
                    {headerTitle}
                  </h2>
                </div>
                <p className="book-panel__subtitle">{headerSubtitle}</p>
              </div>
            </div>

            <div className="book-panel__body">
              <form onSubmit={submitBooking}>
                <div ref={slotsSectionRef} className="book-slots-area">
                  <div className="book-date-field">
                    <Calendar className="book-date-field__icon h-5 w-5" aria-hidden />
                    <span className="book-date-field__text">
                      {selectedDate
                        ? formatSelectedDateLong(selectedDate)
                        : "Select a date"}
                    </span>
                    {selectedDate && (
                      <Check className="book-date-field__check h-5 w-5" aria-hidden />
                    )}
                  </div>

                  <div className="book-slots-messages">
                    {slotsError && <ErrorBanner>{slotsError}</ErrorBanner>}
                    {!slotsLoading &&
                      !slotsError &&
                      availableSlots.length === 0 && (
                        <>
                          {selectedMeta.isFullDayBlocked ? (
                            <ErrorBanner>
                              Doctor has blocked this date — no appointments can be
                              booked. If you think this is an error, please contact
                              support.
                            </ErrorBanner>
                          ) : noSlotsButPartiallyBlocked ? (
                            <ErrorBanner>
                              Partially blocked — the available time ranges are fully
                              booked for this date. Please choose another date or
                              contact support.
                            </ErrorBanner>
                          ) : selectedMeta.intervals &&
                            selectedMeta.intervals.length > 0 ? (
                            <InfoBanner tone="emerald">
                              Partially blocked: some time ranges are unavailable.
                              Available slots (if any) are shown below.
                            </InfoBanner>
                          ) : (
                            <InfoBanner>No available slots for this date.</InfoBanner>
                          )}
                        </>
                      )}
                  </div>

                  {selectedDate && (
                    <>
                      <p className="book-time-label">Select Time</p>
                      <div
                        className={`book-time-grid-wrap ${slotsLoading ? "book-time-grid-wrap--loading" : ""}`}
                        aria-busy={slotsLoading}>
                        {slotsLoading && unifiedSlots.length > 0 && (
                          <div
                            className="book-time-grid-overlay"
                            aria-hidden
                          />
                        )}
                        <div className="book-time-grid">
                          {slotsLoading && unifiedSlots.length === 0 ? (
                            <BookSlotsSkeleton />
                          ) : unifiedSlots.length === 0 ? (
                            <p className="book-slots-empty">No slots for this date.</p>
                          ) : (
                            unifiedSlots.map((slotItem) => {
                              const isSel =
                                selectedSlot &&
                                selectedSlot.start === slotItem.start &&
                                selectedSlot.end === slotItem.end;
                              const timeLabel = formatSlotTime12h(slotItem.start);
                              const isVideoSlot = Boolean(slotItem.isOnline || slotItem.raw?.isOnline);
                              const slotClass = [
                                "book-time-slot",
                                isVideoSlot ? "book-time-slot--video" : "",
                                isSel ? "book-time-slot--selected" : "",
                              ]
                                .filter(Boolean)
                                .join(" ");

                              if (slotItem.type === "available") {
                                return (
                                  <button
                                    key={`av-${slotItem.start}`}
                                    type="button"
                                    onClick={() => {
                                      setSelectedSlot(slotItem.raw);
                                      setSelectedSlotTouched(true);
                                      if (isVideoSlot && isOnlineBookingLive) {
                                        setPaymentMode("online");
                                      } else {
                                        setPaymentMode("offline");
                                      }
                                    }}
                                    className={slotClass}
                                    aria-label={`${timeLabel}, ${formatLocalTime(slotItem.start)} to ${formatLocalTime(slotItem.end)} ${isVideoSlot ? "(Online Video Call)" : "(Clinic)"}`}
                                    aria-pressed={isSel}>
                                    <span className="book-time-slot__text">{timeLabel}</span>
                                    {isVideoSlot && (
                                      <span className="book-time-slot__badge">
                                        📹 Video
                                      </span>
                                    )}
                                  </button>
                                );
                              }

                              return (
                                <button
                                  key={`${slotItem.type}-${slotItem.start}`}
                                  type="button"
                                  disabled
                                  className="book-time-slot"
                                  aria-label={`${timeLabel}, unavailable`}>
                                  {timeLabel}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Automatic Consultation Mode Banner based on Doctor Slot Config */}
                {selectedSlot && !(rescheduleAppointment || reassignAppointment) && (
                  <div className="mt-4">
                    {paymentMode === "online" ? (
                      <div className="p-3.5 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-2xl flex items-center gap-3 text-xs text-purple-900 font-body shadow-xs">
                        <span className="text-xl">📹</span>
                        <div>
                          <p className="font-bold text-purple-900">Online Video Consultation Selected</p>
                          <p className="text-purple-700 text-xxs mt-0.5">
                            This slot is configured by the doctor for Online Video Call (₹{doctor?.fees || 0}). Google Meet link generated upon booking.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3.5 bg-sky-50/80 border border-sky-200 rounded-2xl flex items-center gap-3 text-xs text-sky-900 font-body shadow-xs">
                        <span className="text-xl">🏥</span>
                        <div>
                          <p className="font-bold text-sky-900">In-Person Clinic Consultation Selected</p>
                          <p className="text-sky-700 text-xxs mt-0.5">
                            This slot is configured by the doctor for In-Person Clinic Visit. Consultation fee payable at hospital reception.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <label htmlFor="booking-symptoms" className="book-symptoms-label">
                  Symptoms (Optional)
                </label>
                <textarea
                  id="booking-symptoms"
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  className="book-symptoms-input"
                  placeholder="Briefly describe your symptoms (optional)"
                  rows={3}
                />

                {turnstileSiteKey ? (
                  <div className="book-turnstile-section">
                    <div className="book-turnstile-wrap">
                      <div id="cf-turnstile" className="book-turnstile-widget" />
                    </div>
                    <p className="book-turnstile-hint">
                      Complete the verification above before confirming booking.
                    </p>
                  </div>
                ) : null}

                {bookingErr && (
                  <div className="mt-3">
                    <ErrorBanner>{bookingErr}</ErrorBanner>
                  </div>
                )}
                {bookingMsg && (
                  <div className="mt-3">
                    <InfoBanner tone="emerald">{bookingMsg}</InfoBanner>
                  </div>
                )}

                <div className="book-actions">
                  <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="book-btn book-btn--ghost">
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={bookingLoading || !canSubmit}
                    className="book-btn book-btn--primary">
                    {bookingLoading ? confirmLoadingLabel : confirmLabel}
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>
      </div>
      <Footer />
    </div>
  );
}

/* ---------- CalendarGrid component (unchanged except consumer) ---------- */
function CalendarGrid({
  days,
  selectedDate,
  onSelectDate,
  availabilityMap = {},
  doctor = {},
}) {
  if (!days || !days.length) return null;

  const firstDay = days[0];
  const weekday = new Date(firstDay.date).getDay();
  const blanks = Array.from({ length: weekday }, (_, i) => i);

  function dayHasWorkingHours(ymd) {
    const ranges = Array.isArray(doctor.dailyTimeRanges)
      ? doctor.dailyTimeRanges
      : [];
    return ranges.length > 0;
  }

  return (
    <div className="book-cal-grid">
      {blanks.map((i) => (
        <div key={`b-${i}`} aria-hidden />
      ))}
      {days.map((meta) => {
        const d = new Date(meta.date);
        const isSelected =
          selectedDate &&
          new Date(selectedDate).toDateString() === d.toDateString();
        const ymd = meta.ymd;
        const availEntry = availabilityMap[ymd] || {
          fetched: false,
          availableCount: 0,
          slots: [],
        };
        const availableCount = availEntry.availableCount ?? 0;
        const blockedFull =
          meta.isBlocked ||
          (meta.isUnavailable &&
            !meta.selectable &&
            meta.isPartiallyBlocked === false);

        const partiallyBlockedNoSlots =
          meta.isPartiallyBlocked && availableCount === 0;

        const fullyBooked =
          availableCount === 0 &&
          !blockedFull &&
          !meta.isPartiallyBlocked &&
          !meta.isUnavailable &&
          dayHasWorkingHours(ymd);

        const forceRedDisabled =
          blockedFull || partiallyBlockedNoSlots || fullyBooked;

        const clickable = !meta.isPast && !forceRedDisabled && (meta.selectable || false);

        let stateClass = "book-cal-day--available";
        if (meta.isPast) {
          stateClass = "book-cal-day--past";
        } else if (isSelected) {
          stateClass = "book-cal-day--selected";
        } else if (forceRedDisabled) {
          stateClass = "book-cal-day--blocked";
        }

        const cls = ["book-cal-day", stateClass].filter(Boolean).join(" ");

        return (
          <button
            key={ymd}
            type="button"
            onClick={() => clickable && onSelectDate(new Date(meta.date))}
            disabled={!clickable}
            className={cls}
            title={
              meta.isPast
                ? "Past Date"
                : partiallyBlockedNoSlots
                  ? "Partially blocked — available ranges are fully booked"
                  : fullyBooked
                    ? "All slots booked"
                    : ymd
            }
            aria-pressed={isSelected}>
            <span className="book-cal-day__num">{d.getDate()}</span>
            <span className="book-cal-day__mon">
              {d.toLocaleString("en-US", { month: "short" })}
            </span>
            {isSelected && (
              <span className="book-cal-day__tag" aria-hidden>
                Selected
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export { CalendarGrid, getBlockedMetaForDate, ymdLocal };
