// frontend/src/components/Dashboard/receptionist/ReceptionistDoctorCalendar.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useBlockedSlotStore } from "../../../store/blockedSlotStore";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import Swal from "sweetalert2";

const API = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

import {
  getBlockedMetaForDate,
  ymdLocal,
} from "../doctor/DoctorAppoinmentPage";
import BlockDateModal from "../doctor/BlockDateModal";
import ReceptionistDashboardHeader from "./ReceptionistDashboardHeader";
import Footer from "@/components/HomePage/Footer";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Collapse per-day ranges so identical hours aren't repeated (e.g. Mon–Fri 09:00–18:00). */
function formatDoctorWorkingHours(dailyTimeRanges, availabilityMode) {
  if (!Array.isArray(dailyTimeRanges) || dailyTimeRanges.length === 0)
    return null;

  const ranges = dailyTimeRanges.filter((r) => r?.start && r?.end);
  if (!ranges.length) return null;

  const hasDayField = ranges.some((r) => typeof r.day === "number");
  const uniqueTimeKeys = [
    ...new Set(ranges.map((r) => `${r.start} - ${r.end}`)),
  ];

  if (uniqueTimeKeys.length === 1) return uniqueTimeKeys[0];

  if (!hasDayField && availabilityMode !== "custom") {
    return uniqueTimeKeys.join(", ");
  }

  const grouped = new Map();
  for (const r of ranges) {
    const key = `${r.start} - ${r.end}`;
    if (!grouped.has(key)) grouped.set(key, []);
    if (typeof r.day === "number" && !grouped.get(key).includes(r.day)) {
      grouped.get(key).push(r.day);
    }
  }

  const parts = [];
  for (const [timeKey, days] of grouped) {
    days.sort((a, b) => a - b);
    if (!days.length) {
      parts.push(timeKey);
    } else {
      const dayStr = days.map((d) => WEEKDAY_SHORT[d] ?? d).join(", ");
      parts.push(`${dayStr}: ${timeKey}`);
    }
  }
  return parts.join(" · ");
}

function normalizePatientRecord(raw) {
  const r = raw || {};
  return {
    _id:
      r._id ??
      r.id ??
      r.userId ??
      r.patientId ??
      Math.random().toString(36).slice(2),
    name:
      r.name ??
      r.fullName ??
      r.displayName ??
      r.patientName ??
      r.user?.name ??
      "Patient",
    raw: r,
  };
}

function getPatientContact(p) {
  if (!p) return { name: "", email: "", phone: "", age: null };
  const raw = p.raw ?? p;
  const email = String(raw.email ?? raw.user?.email ?? "").trim();
  const phone = String(raw.phone ?? raw.user?.phone ?? "").trim();
  const isPlaceholderEmail = email.includes("@noemail.brainshospital.local");
  return {
    name: p.name ?? raw.name ?? "Patient",
    email: isPlaceholderEmail ? "" : email,
    phone,
    age: raw.age ?? null,
  };
}

function patientInitials(name) {
  const label = String(name || "P").trim() || "P";
  return (
    label
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "P"
  );
}

function SelectedPatientCard({ patient, onClear }) {
  const { name, email, phone, age } = getPatientContact(patient);
  const detailLine = [email, phone, age != null && age !== "" ? `Age ${age}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mt-2 flex items-center gap-2.5 rounded-lg border border-emerald-200/80 bg-emerald-50/50 px-2.5 py-2">
      <div className="w-8 h-8 rounded-full bg-[#134e97] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
        {patientInitials(name)}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#134e97] truncate leading-tight">
          {name}
        </p>
        {detailLine && (
          <p className="text-[11px] text-slate-500 truncate leading-tight mt-0.5">
            {detailLine}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selected patient"
        className="p-1.5 rounded-full text-slate-500 hover:text-slate-700 hover:bg-white/80 border border-transparent hover:border-slate-200 transition-all duration-200 flex-shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function CalendarGrid({
  days,
  selectedDate,
  onSelectDate,
  availabilityMap = {},
  doctor = {},
  userRole,
}) {
  if (!days || !days.length) return null;

  const normalizedRole = String(userRole || "").toLowerCase().replace(/[\s_-]/g, "");
  const isAllowedRole =
    normalizedRole === "admin" ||
    normalizedRole === "superadmin" ||
    normalizedRole === "receptionist" ||
    normalizedRole === "callcenter";

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
    <div className="grid grid-cols-7 gap-2">
      {blanks.map((i) => (
        <div key={`b-${i}`} />
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

        // If user is allowed to double book, fully booked or partially blocked day is clickable
        const forceRedDisabled =
          blockedFull || (partiallyBlockedNoSlots && !isAllowedRole) || (fullyBooked && !isAllowedRole);

        const isCalendarConnected = doctor?.googleCalendar?.isConnected || doctor?.googleCalendar?.connected;
        const clickable = isCalendarConnected && !meta.isPast && !forceRedDisabled && (meta.selectable || false);

        let cls =
          "aspect-square flex flex-col items-center justify-center rounded-xl border text-xs transition";

        if (!isCalendarConnected || meta.isPast) {
          cls +=
            " bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60";
        } else if (forceRedDisabled) {
          cls +=
            " bg-rose-100 text-rose-700 border-rose-200 cursor-not-allowed";
        } else if (isSelected) {
          cls += " bg-blue-100 text-blue-900 border-blue-300";
        } else if ((fullyBooked || partiallyBlockedNoSlots) && isAllowedRole) {
          cls += " bg-orange-100 text-orange-850 border-orange-300 hover:brightness-95 cursor-pointer";
        } else {
          cls +=
            " bg-teal-100 text-teal-800 border-teal-300 hover:brightness-95 cursor-pointer";
        }

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
            <span className="text-[10px] sm:text-sm font-normal">
              {d.getDate()}
            </span>
            <span className="text-[9px] sm:text-xs">
              {d.toLocaleString("en-US", { month: "short" })}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function ReceptionistDoctorCalendar() {
  const { doctorId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      const [, payload] = token.split(".");
      const decoded = JSON.parse(atob(payload));

      const role =
        decoded.role ||
        decoded.type ||
        decoded.userType ||
        decoded.user_type ||
        null;

      setUserRole(role);
    } catch (err) {
      console.error("Failed to decode token for role", err);
    }
  }, []);

  const mode = location?.state?.mode || null;
  const isRescheduleMode = mode === "reschedule" && !!location?.state?.apptId;
  const isReassignMode = mode === "reassign" && !!location?.state?.apptId;
  const rescheduleApptId =
    isRescheduleMode || isReassignMode ? location.state.apptId : null;
  const preselectStartIso =
    isRescheduleMode || isReassignMode ? location.state.currentSlotStart : null;

  const [doctor, setDoctor] = useState(null);
  const [loadingDoctor, setLoadingDoctor] = useState(true);
  const [error, setError] = useState(null);

  const blockedSlots = useBlockedSlotStore((s) => s.blockedSlots);
  const fetchBlockedSlots = useBlockedSlotStore((s) => s.fetchBlockedSlots);

  const [isBlockOpen, setIsBlockOpen] = useState(false);

  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const [selectedDate, setSelectedDate] = useState(
    preselectStartIso ? new Date(preselectStartIso) : new Date()
  );

  const [availableSlots, setAvailableSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [selectedSlotTouched, setSelectedSlotTouched] = useState(false);

  const [patientId, setPatientId] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patients, setPatients] = useState([]);

  const [showAddPatient, setShowAddPatient] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [newPatient, setNewPatient] = useState({
    name: "",
    email: "",
    phone: "",
    age: "",
  });

  const [symptoms, setSymptoms] = useState("");
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState(null);

  const [availabilityMap, setAvailabilityMap] = useState({});
  const [bookedSlots, setBookedSlots] = useState([]);
  const searchTimeout = React.useRef(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isPrevDisabled =
    viewMonth.getFullYear() < today.getFullYear() ||
    (viewMonth.getFullYear() === today.getFullYear() &&
      viewMonth.getMonth() <= today.getMonth());
  // --------------------------------------------------------------------

  // fetch doctor info
  const fetchDoctor = async () => {
    try {
      setLoadingDoctor(true);
      setError(null);
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Unauthorized");

      const res = await fetch(`${API}/api/receptionist/doctors/${doctorId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Failed to fetch doctor");
      setDoctor(json.data);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoadingDoctor(false);
    }
  };

  // patient search (local first, then server)
  const handleSearchPatients = async (q) => {
    const query = (q ?? searchQuery).trim();
    if (!query) {
      setSearchResults([]);
      return;
    }

    const term = query.toLowerCase().replace(/\s+/g, "");

    if (patients && patients.length) {
      const results = patients.filter((p) => {
        const name = String(p.raw?.name ?? p.name ?? "")
          .toLowerCase()
          .replace(/\s+/g, "");
        const email = String(
          p.raw?.email ?? p.raw?.user?.email ?? p.raw?.user?.username ?? ""
        )
          .toLowerCase()
          .replace(/\s+/g, "");
        const phone = String(p.raw?.phone ?? p.raw?.user?.phone ?? "")
          .toLowerCase()
          .replace(/\s+/g, "");

        return `${name} ${email} ${phone}`.includes(term);
      });

      setSearchResults(results);
      return;
    }

    try {
      setSearching(true);
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API}/api/receptionist/patients?search=${encodeURIComponent(query)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const json = await res.json().catch(() => null);
      const list =
        json?.data?.patients ?? json?.data ?? (Array.isArray(json) ? json : []);
      const normalized = (list || []).map((raw) => normalizePatientRecord(raw));

      setSearchResults(normalized);
    } catch (e) {
      console.error("Patient search failed", e);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectPatient = (p) => {
    setPatientId(p._id);
    setSelectedPatient(p);
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleClearSelectedPatient = () => {
    setPatientId("");
    setSelectedPatient(null);
    setSearchQuery("");
    setSearchResults([]);
  };

  useEffect(() => {
    return () => {
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    fetchDoctor();
    fetchBlockedSlots(doctorId).catch(() => {});
  }, [doctorId, fetchBlockedSlots]);

  // fetch appointment details for reschedule/reassign
  const [apptDetails, setApptDetails] = useState(null);
  useEffect(() => {
    if (!(isRescheduleMode || isReassignMode) || !rescheduleApptId) return;

    (async () => {
      try {
        const token = localStorage.getItem("token");
        const candidates = [
          `${API}/api/receptionist/appointments/${rescheduleApptId}`,
          `${API}/api/appointment/${rescheduleApptId}`,
          `${API}/api/admin/appointments/${rescheduleApptId}`,
        ];
        let json = null;
        for (const url of candidates) {
          try {
            const r = await fetch(url, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const j = await r.json().catch(() => null);
            if (r.ok && j) {
              json = j;
              break;
            }
          } catch (e) {
            // continue
          }
        }
        if (json) {
          const appt =
            json.data?.appointment ?? json.data ?? json.appointment ?? json;
          setApptDetails(appt);
          if (appt?.slotStartIso) {
            const d = new Date(appt.slotStartIso);
            setSelectedDate(
              new Date(d.getFullYear(), d.getMonth(), d.getDate())
            );
          }
        }
      } catch (e) {
        console.error(
          "Failed to fetch appointment details for reschedule/reassign:",
          e
        );
      }
    })();
  }, [isRescheduleMode, isReassignMode, rescheduleApptId]);

  // fetch patients list (if not in reschedule/reassign mode)
  useEffect(() => {
    if (isRescheduleMode || isReassignMode) return;

    const fetchPatients = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API}/api/receptionist/patients`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => null);

        let list = [];
        if (Array.isArray(json)) list = json;
        else if (Array.isArray(json?.data?.patients)) list = json.data.patients;
        else if (Array.isArray(json?.data)) list = json.data;
        else list = [];

        const normalized = (list || []).map((raw) => normalizePatientRecord(raw));

        setPatients(normalized);
      } catch (e) {
        console.error("Failed to fetch patients", e);
        setPatients([]);
      }
    };
    fetchPatients();
  }, [isRescheduleMode, isReassignMode]);

  // month -> days
  const monthDays = useMemo(() => {
    if (!viewMonth) return [];

    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const isPast = date < today;
      const ymd =
        date.getFullYear() +
        "-" +
        String(date.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(date.getDate()).padStart(2, "0");

      let selectable = true;
      let isBlocked = false;
      let isUnavailable = false;
      let isPartiallyBlocked = false;

      const availabilityRange = doctor?.availabilityRange || null;

      if (availabilityRange) {
        const s = availabilityRange.startDate
          ? new Date(availabilityRange.startDate)
          : null;
        const e = availabilityRange.endDate
          ? new Date(availabilityRange.endDate)
          : null;
        if (s) {
          const sClone = new Date(s);
          sClone.setHours(0, 0, 0, 0);
          if (date < sClone) {
            selectable = false;
            isUnavailable = true;
          }
        }
        if (e) {
          const eClone = new Date(e);
          eClone.setHours(23, 59, 59, 999);
          if (date > eClone) {
            selectable = false;
            isUnavailable = true;
          }
        }
        const excluded = availabilityRange?.excludedWeekdays || [];
        if (excluded.includes(date.getDay())) {
          selectable = false;
          isUnavailable = true;
        }
      }

      const meta = getBlockedMetaForDate(blockedSlots, ymd);
      if (meta.isFullDayBlocked) {
        selectable = false;
        isBlocked = true;
      }
      if (
        !meta.isFullDayBlocked &&
        Array.isArray(meta.intervals) &&
        meta.intervals.length
      ) {
        isPartiallyBlocked = true;
      }

      days.push({
        date,
        ymd,
        day: d,
        selectable: selectable && !isBlocked && !isUnavailable && !isPast,
        isBlocked,
        isPartiallyBlocked,
        isUnavailable,
        isPast,
        blockedIntervals: meta.intervals || [],
      });
    }

    return days;
  }, [viewMonth, doctor, blockedSlots]);

  // prefetch availability for month
  useEffect(() => {
    if (!doctor || !monthDays.length) return;
    let cancelled = false;
    (async () => {
      try {
        const map = {};
        const token = localStorage.getItem("token");
        const jobs = monthDays.map((dayMeta) => {
          const ymd = dayMeta.ymd;
          return fetch(
            `${API}/api/appointment/available-slots/${doctorId}/${ymd}`,
            {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            }
          )
            .then((r) => r.json())
            .then((json) => ({
              ymd,
              data: Array.isArray(json?.data) ? json.data : [],
            }))
            .catch(() => ({ ymd, data: [] }));
        });

        const settled = await Promise.allSettled(jobs);
        for (const res of settled) {
          if (res.status === "fulfilled") {
            const val = res.value;
            if (val && val.ymd) {
              map[val.ymd] = {
                fetched: true,
                availableCount: (val.data || []).length,
                slots: val.data || [],
              };
            }
          }
        }
        if (!cancelled) setAvailabilityMap((prev) => ({ ...prev, ...map }));
      } catch (e) {
        console.error("Receptionist calendar prefetch failed:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doctor, monthDays, doctorId]);

  // load slots for selected date (fetch available + booked, apply blocked ranges)
  useEffect(() => {
    if (!selectedDate) return;

    const controller = new AbortController();
    const ymd = ymdLocal(selectedDate);

    (async () => {
      setSlotsLoading(true);
      setAvailableSlots([]);
      setBookedSlots([]);
      setSelectedSlot(null);

      try {
        // AVAILABLE
        const token = localStorage.getItem("token");
        const availRes = await fetch(
          `${API}/api/appointment/available-slots/${doctorId}/${ymd}`,
          {
            signal: controller.signal,
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }
        );
        const availJson = await availRes.json();
        const availList = Array.isArray(availJson?.data) ? availJson.data : [];

        // BOOKED
        const bookedRes = await fetch(
          `${API}/api/appointment/booked-slots/${doctorId}/${ymd}`,
          { signal: controller.signal }
        );
        const bookedJson = await bookedRes.json();
        const bookedList = Array.isArray(bookedJson?.data)
          ? bookedJson.data
          : [];

        setAvailableSlots(availList);
        setBookedSlots(bookedList);
      } catch (e) {
        if (e.name !== "AbortError") {
          console.error("Slot fetch failed", e);
        }
      } finally {
        setSlotsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [selectedDate, doctorId]);

  const blockedMetaForSelectedDate = useMemo(() => {
    if (!selectedDate) return { intervals: [], isFullDayBlocked: false };
    return getBlockedMetaForDate(blockedSlots, ymdLocal(selectedDate));
  }, [blockedSlots, selectedDate]);

  const workingHoursLabel = useMemo(
    () =>
      formatDoctorWorkingHours(
        doctor?.dailyTimeRanges,
        doctor?.availabilityMode
      ),
    [doctor?.dailyTimeRanges, doctor?.availabilityMode]
  );

  const displaySelectedPatient = useMemo(() => {
    if (selectedPatient) return selectedPatient;
    if (!patientId) return null;
    return patients.find((x) => x._id === patientId) ?? null;
  }, [selectedPatient, patientId, patients]);

  // unifiedSlots: available + booked (split) + blocked (split)
  const unifiedSlots = useMemo(() => {
    const map = new Map();

    const overlaps = (s1, e1, s2, e2) =>
      new Date(s1) < new Date(e2) && new Date(e1) > new Date(s2);

    // Available
    availableSlots.forEach((s) => {
      const key = `${s.start}_${s.end}`;
      map.set(key, {
        type: s.status === "vip" ? "vip" : "available",
        start: s.start,
        end: s.end,
        raw: s,
      });
    });

    // Booked overrides available
    bookedSlots.forEach((b) => {
      const key = `${b.start}_${b.end}`;
      map.set(key, {
        type: "booked",
        start: b.start,
        end: b.end,
        raw: b,
      });
    });

    // Blocked overrides everything
    if (blockedMetaForSelectedDate?.intervals?.length) {
      for (const blk of blockedMetaForSelectedDate.intervals) {
        for (const [key, slot] of map.entries()) {
          if (overlaps(slot.start, slot.end, blk.start, blk.end)) {
            map.set(key, {
              ...slot,
              type: "blocked",
            });
          }
        }
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(a.start) - new Date(b.start)
    );
  }, [availableSlots, bookedSlots, blockedMetaForSelectedDate]);

  // create patient
  const handleCreatePatient = async () => {
    try {
      const { name, email, phone, age } = newPatient;
      if (!name.trim()) {
        await Swal.fire({
          icon: "warning",
          title: "Missing details",
          text: "Patient name is required.",
        });
        return;
      }

      if (!String(age).trim()) {
        await Swal.fire({
          icon: "warning",
          title: "Missing details",
          text: "Patient age is required.",
        });
        return;
      }

      const ageNum = Number(age);
      if (!Number.isFinite(ageNum) || ageNum < 0 || ageNum > 150) {
        await Swal.fire({
          icon: "warning",
          title: "Invalid age",
          text: "Please enter a valid age between 0 and 150.",
        });
        return;
      }

      if (!phone.trim()) {
        await Swal.fire({
          icon: "warning",
          title: "Missing details",
          text: "Mobile number is required.",
        });
        return;
      }

      const phoneDigits = phone.replace(/\D/g, "");
      if (phoneDigits.length !== 10) {
        await Swal.fire({
          icon: "warning",
          title: "Invalid mobile number",
          text: "Please enter a valid 10-digit mobile number.",
        });
        return;
      }

      const emailTrimmed = email.trim();
      if (emailTrimmed) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailTrimmed)) {
          await Swal.fire({
            icon: "warning",
            title: "Invalid email",
            text: "Please enter a valid email id.",
          });
          return;
        }
      }

      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/api/receptionist/patients`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          phone: phoneDigits,
          age: ageNum,
          ...(emailTrimmed ? { email: emailTrimmed } : {}),
        }),
      });

      const json = await res.json();

      if (json.status === "warning") {
        await Swal.fire({
          icon: "warning",
          title: "Duplicate detected",
          text: json.message,
        });
        return;
      }

      if (!res.ok || json.status === "error") {
        await Swal.fire({
          icon: "error",
          title: "Create failed",
          text: json.message || "Failed to create patient",
        });
        return;
      }

      const created = json.data.patient;
      const normalizedCreated = normalizePatientRecord(created);
      setPatients((p) => [...p, normalizedCreated]);
      setPatientId(normalizedCreated._id);
      setSelectedPatient(normalizedCreated);
      setShowAddPatient(false);
      setNewPatient({ name: "", email: "", phone: "", age: "" });

      await Swal.fire({
        icon: "success",
        title: "Added",
        text: "Patient added successfully!",
        timer: 1400,
        showConfirmButton: false,
      });
    } catch (e) {
      console.error(e);
      await Swal.fire({
        icon: "error",
        title: "Error",
        text: e?.message || "Error creating patient",
      });
    }
  };

  const bookAppointment = async () => {
    if (!patientId) {
      setBookingError("Please select a patient");
      return;
    }
    if (!selectedSlot) {
      setBookingError("Please select a time slot");
      return;
    }
    setBookingError(null);

    let forceDoubleBook = false;
    if (selectedSlot.isBooked) {
      const result = await Swal.fire({
        icon: "warning",
        title: "Double Booking Confirmation",
        text: `Do you want to book this slot for this patient? The previous patient's appointment will be rescheduled to the next available slot automatically.`,
        showCancelButton: true,
        confirmButtonText: "Yes, Book & Reschedule Previous",
        confirmButtonColor: "#f97316",
        cancelButtonText: "Cancel",
      });

      if (!result || !result.isConfirmed) return;
      forceDoubleBook = true;
    } else {
      const result = await Swal.fire({
        icon: "question",
        title: "Confirm Booking?",
        text: `Book on ${selectedDate.toLocaleDateString()} at ${new Date(
          selectedSlot.start
        ).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}?`,
        showCancelButton: true,
      });

      if (!result || !result.isConfirmed) return;
    }

    try {
      setBookingLoading(true);
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/api/receptionist/appointments/book`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          doctorId,
          patientId,
          slotStartIso: selectedSlot.start,
          slotEndIso: selectedSlot.end,
          symptoms,
          forceDoubleBook,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Booking failed");

      await Swal.fire({
        icon: "success",
        title: "Booked",
        text: "The appointment was booked successfully.",
        timer: 1400,
        showConfirmButton: false,
      });
      navigate(-1);
    } catch (e) {
      console.error(e);
      setBookingError(e.message || "Booking failed");
      await Swal.fire({
        icon: "error",
        title: "Booking failed",
        text: e?.message || "Booking failed",
      });
    } finally {
      setBookingLoading(false);
    }
  };

  const confirmAction = async () => {
    if (!(isRescheduleMode || isReassignMode) || !rescheduleApptId) return;

    if (!selectedSlot) {
      Swal.fire({
        icon: "warning",
        title: "Select a slot",
        text: "Please pick an available time slot from the calendar.",
      });
      return;
    }

    const humanLabel = isReassignMode ? "Reassign" : "Reschedule";
    const confirmButtonText = isReassignMode
      ? "Confirm Reassign"
      : "Confirm Appointment";

    const confirmText = `${humanLabel} to ${selectedDate.toLocaleDateString()} at ${new Date(
      selectedSlot.start
    ).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}?`;

    const result = await Swal.fire({
      icon: "question",
      title: `${humanLabel}?`,
      text: confirmText,
      showCancelButton: true,
      confirmButtonText,
    });

    if (!result || !result.isConfirmed) return;

    try {
      setBookingLoading(true);
      const token = localStorage.getItem("token");
      const body = {
        date: new Date(selectedSlot.start).toISOString(),
        slotStartIso: new Date(selectedSlot.start).toISOString(),
        slotEndIso: new Date(selectedSlot.end).toISOString(),
      };

      if (isReassignMode) body.newDoctorId = doctorId;

      const reassignCandidates = [
        `${API}/api/receptionist/appointments/${rescheduleApptId}/reassign`,
        `${API}/api/appointment/${rescheduleApptId}/reassign`,
        `${API}/api/admin/appointments/${rescheduleApptId}/reassign`,
        `${API}/api/appointment/${rescheduleApptId}/assign`,
      ];

      const rescheduleCandidates = [
        `${API}/api/receptionist/appointments/${rescheduleApptId}/reschedule`,
        `${API}/api/appointment/reschedule/${rescheduleApptId}`,
      ];

      const urlCandidates = isReassignMode
        ? reassignCandidates
        : rescheduleCandidates;

      let lastErr = null;
      let successJson = null;

      for (const url of urlCandidates) {
        try {
          const r = await fetch(url, {
            method: isReassignMode ? "PATCH" : "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
          });
          const j = await r.json().catch(() => null);
          if (r.ok) {
            successJson = j;
            break;
          } else {
            lastErr =
              j?.message ||
              j?.errors?.[0] ||
              (j && JSON.stringify(j)) ||
              `HTTP ${r.status}`;
          }
        } catch (e) {
          lastErr = e.message || String(e);
        }
      }

      if (!successJson) throw new Error(lastErr || `${humanLabel} failed`);

      await Swal.fire({
        icon: "success",
        title: `${humanLabel}d`,
        text: `Appointment ${
          isReassignMode ? "reassigned" : "rescheduled"
        } successfully.`,
        timer: 1400,
        showConfirmButton: false,
      });

      navigate("/receptionist/appointments", { replace: true });
    } catch (e) {
      console.error(`${isReassignMode ? "Reassign" : "Reschedule"} error:`, e);
      Swal.fire({
        icon: "error",
        title: `${isReassignMode ? "Reassign" : "Reschedule"} failed`,
        text: e.message || String(e),
      });
    } finally {
      setBookingLoading(false);
    }
  };

  if (loadingDoctor) return <p>Loading doctor info...</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!doctor) return null;


  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-[#134e97]/5 to-[#06adc6]/5" style={{ fontFamily: "'roboto-regular', 'Roboto', sans-serif" }}>
      {userRole === "admin" ||
      userRole === "super_admin" ||
      userRole === "superadmin" ? (
        // 🔹 Admin / Super Admin header
        <header className="sticky top-0 z-40 bg-gradient-to-r from-[#134e97] via-[#0b5c9b] to-[#06adc6] mb-4 shadow">
          <div className="backdrop-blur-md bg-white/0 py-3 sm:py-4">
            <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-1 sm:py-2">
              <div className="flex items-center justify-between">
                {/* LEFT: Back */}
                <button
                  onClick={() => navigate(-1)}
                  className="inline-flex items-center gap-2 px-2.5 py-1.5 text-xs sm:text-sm rounded-full bg-white/10 text-white hover:bg-white/20 border border-white/20 transition"
                  aria-label="Back">
                  <svg
                    viewBox="0 0 24 24"
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2">
                    <path d="M15 19l-7-7 7-7" />
                  </svg>
                  <span className="hidden sm:inline">Back</span>
                </button>

                {/* CENTER */}
                <div className="absolute left-1/2 -translate-x-1/2 text-center pointer-events-none">
                  <h1 className="text-base sm:text-2xl font-bold text-white truncate max-w-[220px] sm:max-w-none" style={{ fontFamily: "'mirador-medium', 'Outfit', sans-serif" }}>
                    Booking for Dr. {location.state?.doctorName ?? "Doctor"}
                  </h1>
                  {location.state?.specialization && (
                    <p className="text-[9px] sm:text-xs text-white/80 mt-0.5 truncate max-w-[220px] sm:max-w-none">
                      {location.state.specialization}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </header>
      ) : (
        // 🔹 Normal receptionist header
        <ReceptionistDashboardHeader />
      )}

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 mb-10 rounded-2xl">
        {userRole !== "admin" &&
          userRole !== "super_admin" &&
          userRole !== "superadmin" && (
            <div className="mt-6">
              <Card className="p-4 sm:p-6 bg-white rounded-2xl shadow-md mb-6 border-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center">
                    <Button
                      onClick={() => {
                        if (isRescheduleMode || isReassignMode) {
                          navigate("/receptionist/appointments");
                        } else {
                          navigate(-1); // default behavior
                        }
                      }}
                      variant="outline"
                      className="flex items-center gap-2 bg-white/10 text-gray-700 border-slate-200 hover:bg-gray-50 rounded-full px-2 py-1 sm:px-4 sm:py-1.5"
                      aria-label="Back to dashboard">
                      <ArrowLeft size={18} />
                      <span className="hidden sm:inline">Back</span>
                    </Button>
                  </div>
                  <div className="flex-1 text-center">
                    <h2 className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-800" style={{ fontFamily: "'mirador-medium', 'Outfit', sans-serif" }}>
                      Doctor Calendar
                    </h2>
                  </div>

                  <div className="w-[70px] sm:w-[100px]" />
                </div>
              </Card>
            </div>
          )}

        {!isRescheduleMode && !isReassignMode && (
          <div className="w-full mb-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3 bg-white rounded-2xl border border-slate-100 shadow-md p-4 sm:p-6 overflow-hidden">
              <img
                src={doctor.profileImage || "/avatar-placeholder.png"}
                alt={doctor.name}
                className="w-16 h-16 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-xl object-cover border border-[#134e97]/10 shadow-md flex-shrink-0"
              />

              <div className="flex-1 min-w-0 text-center sm:text-left">
                <h1 className="text-xl sm:text-xl font-semibold text-[#134e97] truncate" style={{ fontFamily: "'mirador-medium', 'Outfit', sans-serif" }}>
                  Dr. {doctor.name}
                </h1>

                <div className="mt-2 flex flex-wrap justify-center sm:justify-start gap-2 text-xs sm:text-sm font-medium text-[#134e97]">
                  <span className="px-3 py-1 rounded-full bg-white border border-[#134e97]/15 shadow-sm max-w-full break-words">
                    {doctor.specialization || "General"}
                  </span>


                  {doctor.qualification && (
                    <span className="px-3 py-1 rounded-full bg-white border border-[#134e97]/15 shadow-sm max-w-full break-words">
                      {doctor.qualification}
                    </span>
                  )}

                  {doctor.experience != null && (
                    <span className="px-3 py-1 rounded-full bg-white border border-[#134e97]/15 shadow-sm">
                      {doctor.experience} yrs
                    </span>
                  )}
                  {doctor.fees != null && (
                    <span className="px-3 py-1 rounded-full bg-white border border-[#134e97]/15 shadow-sm">
                      ₹{doctor.fees} Fees
                    </span>
                  )}
                </div>


                {doctor.about && (
                  <p
                    className="text-xs sm:text-sm text-gray-500 mt-2 whitespace-normal break-words"
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={doctor.about}>
                    {doctor.about}
                  </p>
                )}

                {workingHoursLabel && (
                    <p className="text-xs sm:text-sm text-gray-500 mt-1 whitespace-normal break-words">
                      Working hours: {workingHoursLabel}
                    </p>
                  )}

                <div className="mt-3 flex flex-col sm:flex-row gap-2 items-center sm:items-start">
                  <button
                    type="button"
                    onClick={() => setIsBlockOpen(true)}
                    className="px-2 py-1.5 rounded-full bg-white text-red-600 border border-red-300 hover:bg-red-50 text-sm font-medium w-full sm:w-auto transition-all duration-200">
                    Block Calendar Dates
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="w-full mb-4 sm:mb-4 md:mb-6 text-center">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-[#134e97] leading-tight px-2" style={{ fontFamily: "'mirador-medium', 'Outfit', sans-serif" }}>
            {isReassignMode
              ? "Appointment Reassign"
              : isRescheduleMode
              ? "Appointment Reschedule"
              : "Book An Appointment"}
          </h2>
        </div>

        <div className="grid grid-cols-1 min-[991px]:grid-cols-12 gap-4 min-[991px]:gap-5">
          <section className="col-span-12 min-[991px]:col-span-6 bg-white p-4 sm:p-6 rounded-2xl shadow-md border border-slate-100">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
              <h2 className="text-lg sm:text-xl font-bold text-[#134e97]" style={{ fontFamily: "'mirador-medium', 'Outfit', sans-serif" }}>
                Select Available Date
              </h2>

              <div className="flex items-center gap-3 text-xs sm:text-sm font-normal">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-teal-100 border border-teal-300" />{" "}
                  <span className="text-xs text-gray-600">Available</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-rose-100 border border-rose-200" />{" "}
                  <span className="text-xs text-gray-600">Blocked / Fully Booked</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-blue-100 border border-blue-300" />{" "}
                  <span className="text-xs text-gray-600">Selected</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between py-2 mb-6">
              <button
                type="button"
                disabled={isPrevDisabled}
                onClick={() =>
                  setViewMonth(
                    (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1)
                  )
                }
                className={`px-5 py-2 rounded-full border text-xs sm:text-sm transition-all duration-200 ${
                  isPrevDisabled
                    ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                    : "bg-white text-[#134e97] border-[#134e97]/30 hover:bg-[#134e97]/5"
                }`}>
                ← Prev
              </button>

              <span className="text-base sm:text-lg font-bold text-[#134e97] text-center truncate">
                {viewMonth.toLocaleString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </span>

              <button
                type="button"
                onClick={() =>
                  setViewMonth(
                    (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1)
                  )
                }
                className="px-5 py-2 rounded-full border bg-white text-[#134e97] border-[#134e97]/30 shadow-sm hover:bg-[#134e97]/5 transition-all duration-200 text-xs sm:text-sm">
                Next →
              </button>
            </div>

            <div className="grid grid-cols-7 text-center text-xs sm:text-sm text-gray-500 mb-3 font-normal">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="truncate">
                  {d}
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-[#134e97]/10 bg-[#134e97]/2 p-2 sm:p-3 overflow-auto text-[11px] sm:text-sm">
              <CalendarGrid
                days={monthDays}
                selectedDate={selectedDate}
                onSelectDate={(d) => setSelectedDate(d)}
                availabilityMap={availabilityMap}
                doctor={doctor}
                userRole={userRole}
              />
            </div>
          </section>

          <section className="col-span-12 min-[991px]:col-span-6 bg-white p-4 sm:p-6 rounded-2xl shadow-md border border-slate-100">
            <div className="flex items-start justify-between mb-4 gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-base sm:text-lg font-semibold text-[#134e97]" style={{ fontFamily: "'mirador-medium', 'Outfit', sans-serif" }}>
                  {isReassignMode
                    ? "Select New Slot"
                    : isRescheduleMode
                    ? "Select New Slot"
                    : "Select Available Slot"}
                </h2>
              </div>
              <div className="ml-2 flex-shrink-0">
                <span className="inline-block text-xs px-2 py-1 rounded-full bg-[#134e97]/5 border border-[#134e97]/10 text-[#134e97] shadow-sm">
                  {isReassignMode
                    ? "Reassign"
                    : isRescheduleMode
                    ? "Reschedule"
                    : "New"}
                </span>
              </div>
            </div>

            {(isRescheduleMode || isReassignMode) && apptDetails && (
              <div className="mb-4 p-3 sm:p-4 rounded-lg border border-slate-100 bg-gradient-to-r from-white to-gray-50 shadow-sm text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-700 truncate">
                      <strong>Patient:</strong>{" "}
                      {apptDetails.patientId?.name ??
                        apptDetails.patient?.name ??
                        apptDetails.patientName ??
                        "—"}
                    </p>
                    <p className="text-sm text-gray-700 mt-1 truncate">
                      <strong>Current slot:</strong>{" "}
                      {apptDetails.slotStartIso
                        ? `${new Date(
                            apptDetails.slotStartIso
                          ).toLocaleDateString()} ${new Date(
                            apptDetails.slotStartIso
                          ).toLocaleTimeString()}`
                        : "—"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <p className="mb-2 font-semibold text-gray-700 text-sm">
              Date:{" "}
              <span className="text-gray-600 font-medium">
                {selectedDate
                  ? selectedDate.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "—"}
              </span>
            </p>

            <div className="mb-3">
              <div
                className="grid 
      grid-cols-3 
      sm:grid-cols-4
      md:grid-cols-4
      lg:grid-cols-4 
      gap-3">
                {!(doctor?.googleCalendar?.isConnected || doctor?.googleCalendar?.connected) ? (
                  <div className="col-span-full text-gray-600">
                    No slots available
                  </div>
                ) : slotsLoading ? (
                  <div className="col-span-full text-gray-500">
                    Loading slots...
                  </div>
                ) : unifiedSlots.length ? (
                  unifiedSlots.map((slotItem) => {
                    const isSel =
                      selectedSlot &&
                      selectedSlot.start === slotItem.start &&
                      selectedSlot.end === slotItem.end;

                    const isPast = new Date(slotItem.start) < new Date();
                    const timeText = new Date(
                      slotItem.start
                    ).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    });

                    // VIP SLOT
                    if (slotItem.type === "vip") {
                      return (
                        <button
                          key={`vip-${slotItem.start}`}
                          type="button"
                          disabled={isPast}
                          onClick={() =>
                            !isPast && setSelectedSlot({ ...slotItem.raw, isVipSlot: true })
                          }
                          className={
                            isSel
                              ? "w-full px-3 py-2 rounded-full text-sm bg-purple-600 text-white border border-purple-750 shadow-md font-semibold transition"
                              : isPast
                              ? "w-full px-3 py-2 rounded-full text-sm bg-gray-200 text-gray-600 border border-slate-200 cursor-not-allowed"
                              : "w-full px-3 py-2 rounded-full text-sm border border-purple-400 text-purple-700 bg-purple-50 hover:bg-purple-100 hover:border-purple-500 transition font-medium"
                          }>
                          {timeText} VIP
                        </button>
                      );
                    }

                    // AVAILABLE SLOT
                    if (slotItem.type === "available") {
                      return (
                        <button
                          key={`av-${slotItem.start}`}
                          type="button"
                          disabled={isPast}
                          onClick={() =>
                            !isPast && setSelectedSlot(slotItem.raw)
                          }
                          className={
                            isSel
                              ? "w-full px-3 py-2 rounded-full text-sm bg-[#134e97] text-white border border-[#013473] shadow"
                              : isPast
                              ? "w-full px-3 py-2 rounded-full text-sm bg-gray-200 text-gray-600 border border-slate-200 cursor-not-allowed"
                              : "w-full px-3 py-2 rounded-full text-sm border border-[#134e97]/30 text-[#134e97] bg-white hover:bg-[#134e97]/5 hover:border-[#134e97]/50 hover:shadow-sm transition"
                          }>
                          {timeText}
                        </button>
                      );
                    }

                    // BOOKED SLOT
                    if (slotItem.type === "booked") {
                      const isAllowedRole =
                        userRole === "admin" ||
                        userRole === "super_admin" ||
                        userRole === "superadmin" ||
                        userRole === "receptionist" ||
                        userRole === "call_center";

                      return (
                        <button
                          key={`bo-${slotItem.start}`}
                          type="button"
                          disabled={!isAllowedRole || isPast}
                          onClick={() => {
                            if (!isPast && isAllowedRole) {
                              setSelectedSlot({ ...slotItem.raw, isBooked: true });
                            }
                          }}
                          className={
                            isSel
                              ? "w-full px-3 py-2 rounded-full text-sm bg-orange-500 text-white border border-orange-600 shadow-md"
                              : isPast
                              ? "w-full px-3 py-2 rounded-full text-sm bg-gray-200 text-gray-600 border border-slate-200 cursor-not-allowed"
                              : "w-full px-3 py-2 rounded-full text-sm border border-orange-500/40 text-orange-700 bg-orange-50/50 hover:bg-orange-50 hover:border-orange-500 hover:shadow-sm transition"
                          }>
                          {timeText}
                        </button>
                      );
                    }

                    // BLOCKED SLOT
                    return (
                      <button
                        key={`bl-${slotItem.start}`}
                        type="button"
                        disabled
                        className="w-full px-3 py-2 rounded-full text-sm bg-red-100 text-red-700 border border-red-200 cursor-not-allowed">
                        {timeText}
                      </button>
                    );
                  })
                ) : (
                  <div className="col-span-full text-gray-600">
                    No slots available
                  </div>
                )}
              </div>
            </div>

            {!isRescheduleMode && !isReassignMode && (
              <>
                <div className="mb-3">
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSearchQuery(v);
                        if (patientId) {
                          setPatientId("");
                          setSelectedPatient(null);
                        }
                        if (searchTimeout.current)
                          clearTimeout(searchTimeout.current);
                        searchTimeout.current = setTimeout(
                          () => handleSearchPatients(v),
                          250
                        );
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSearchPatients();
                        } else if (e.key === "Escape") {
                          handleClearSelectedPatient();
                        }
                      }}
                      placeholder="Search Patient Name/Email/Mobile"
                      className="w-full p-2 pr-10 rounded-md text-sm bg-white border border-[#134e97]/30 hover:border-[#134e97]/50 focus:border-[#134e97] focus:ring-1 focus:ring-[#134e97] outline-none"
                      aria-label="Search Patient Name, Email or Mobile"
                    />
                    <button
                      type="button"
                      onClick={() => handleSearchPatients()}
                      disabled={searching}
                      className="absolute right-1 top-1/2 -translate-y-1/2 px-3 py-1 rounded-md bg-[#134e97] text-white text-sm shadow-sm hover:bg-[#013473]"
                      aria-label="Search patients">
                      <Search className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-2">
                    {patientId && displaySelectedPatient && (
                      <SelectedPatientCard
                        patient={displaySelectedPatient}
                        onClear={handleClearSelectedPatient}
                      />
                    )}

                    {!patientId &&
                      searchResults &&
                      searchResults.length > 0 && (
                        <div className="mt-2 border border-slate-200/80 rounded-xl bg-white shadow-sm p-1.5 max-h-48 overflow-auto text-sm">
                          {searchResults.map((p) => {
                            const contact = getPatientContact(p);
                            return (
                              <button
                                key={p._id}
                                type="button"
                                onClick={() => handleSelectPatient(p)}
                                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[#134e97]/5 border border-transparent hover:border-[#134e97]/10 flex items-center gap-3 transition-all duration-200">
                                <div className="w-9 h-9 rounded-full bg-slate-100 text-[#134e97] flex items-center justify-center text-xs font-bold flex-shrink-0">
                                  {patientInitials(contact.name)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-semibold text-[#134e97] truncate text-sm">
                                    {contact.name}
                                  </div>
                                  <div className="text-xs text-slate-500 mt-0.5 space-y-0.5">
                                    {contact.email && (
                                      <div className="truncate">{contact.email}</div>
                                    )}
                                    {contact.phone && (
                                      <div className="truncate">{contact.phone}</div>
                                    )}
                                  </div>
                                </div>
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#134e97]/70 flex-shrink-0">
                                  Select
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                    {!patientId &&
                      !searching &&
                      searchResults &&
                      searchResults.length === 0 &&
                      searchQuery.trim() !== "" && (
                        <div className="mt-2 text-sm text-gray-600">
                          No matching patients found.
                        </div>
                      )}

                    {searching && (
                      <div className="mt-2 text-sm text-gray-600">
                        Searching...
                      </div>
                    )}
                  </div>

                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => setShowAddPatient(true)}
                      className="px-5 py-2 rounded-full bg-[#134e97] text-white hover:bg-[#013473] text-sm font-medium transition-all duration-200">
                      + Add New Patient
                    </button>
                  </div>
                </div>

                {showAddPatient && (
                  <div className="bg-[#134e97]/2 border border-slate-100 rounded-xl p-4 sm:p-5 mb-4 shadow-sm">
                    <h3 className="text-sm sm:text-md font-semibold text-[#134e97] mb-3" style={{ fontFamily: "'mirador-medium', 'Outfit', sans-serif" }}>
                      New Patient Details
                    </h3>
                    <input
                      className="w-full p-2 border rounded-md mb-3 bg-white border-[#134e97]/30 focus:ring-2 focus:ring-[#134e97]/20 text-sm"
                      placeholder="Name *"
                      required
                      value={newPatient.name}
                      onChange={(e) =>
                        setNewPatient({ ...newPatient, name: e.target.value })
                      }
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={150}
                      className="w-full p-2 border rounded-md mb-3 bg-white border-[#134e97]/30 focus:ring-2 focus:ring-[#134e97]/20 text-sm"
                      placeholder="Age *"
                      required
                      value={newPatient.age}
                      onChange={(e) =>
                        setNewPatient({ ...newPatient, age: e.target.value })
                      }
                    />
                    <input
                      type="email"
                      className="w-full p-2 border rounded-md mb-3 bg-white border-[#134e97]/30 focus:ring-2 focus:ring-[#134e97]/20 text-sm"
                      placeholder="Email (optional)"
                      value={newPatient.email}
                      onChange={(e) =>
                        setNewPatient({ ...newPatient, email: e.target.value })
                      }
                    />
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      className="w-full p-2 border rounded-md mb-3 bg-white border-[#134e97]/30 focus:ring-2 focus:ring-[#134e97]/20 text-sm"
                      placeholder="Mobile Number *"
                      required
                      value={newPatient.phone}
                      onChange={(e) => {
                        const digitsOnly = e.target.value.replace(/\D/g, "");
                        if (digitsOnly.length <= 10)
                          setNewPatient({ ...newPatient, phone: digitsOnly });
                      }}
                    />
                    <div className="flex flex-col sm:flex-row justify-end gap-3">
                      <button
                        className="px-5 py-2 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium transition-all duration-200"
                        onClick={() => setShowAddPatient(false)}>
                        Cancel
                      </button>
                      <button
                        className="px-5 py-2 rounded-full bg-[#134e97] text-white hover:bg-[#013473] text-sm font-medium transition-all duration-200"
                        onClick={handleCreatePatient}>
                        Register
                      </button>
                    </div>
                  </div>
                )}

                <label className="block mb-1 font-medium text-gray-700 text-sm">
                  Symptoms (optional)
                </label>
                <textarea
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  placeholder="Brief note about symptoms"
                  className="w-full rounded-md border border-[#134e97]/30 p-2 mb-4 text-sm"
                  rows={3}
                />
              </>
            )}

            {bookingError && (
              <p className="text-red-600 mb-2 text-sm">{bookingError}</p>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-between mt-4 gap-3">
              <button
                type="button"
                onClick={() =>
                  navigate(
                    isRescheduleMode || isReassignMode
                      ? "/receptionist/appointments"
                      : "/receptionist/dashboard"
                  )
                }
                className="w-full sm:w-auto flex-1 px-5 py-2.5 rounded-full border border-[#134e97]/30 text-[#134e97] font-medium hover:bg-[#134e97]/5 transition-all duration-200 text-sm">
                Back
              </button>

              {isRescheduleMode || isReassignMode ? (
                <button
                  disabled={bookingLoading || !selectedSlot}
                  onClick={confirmAction}
                  className={`w-full sm:w-auto flex-1 px-5 py-2.5 rounded-full font-medium text-white shadow transition-all duration-200 ${
                    bookingLoading || !selectedSlot
                      ? "bg-[#134e97]/30 cursor-not-allowed"
                      : "bg-green-600 hover:bg-green-700 shadow-md"
                  } text-sm`}>
                  {bookingLoading
                    ? "Saving..."
                    : isReassignMode
                    ? "Reassign"
                    : "Reschedule"}
                </button>
              ) : (
                <button
                  disabled={
                    bookingLoading ||
                    !selectedSlot ||
                    !patientId ||
                    !selectedDate
                  }
                  onClick={bookAppointment}
                  className={`w-full sm:w-auto flex-1 px-5 py-2.5 rounded-full font-medium text-white shadow transition-all duration-200 ${
                    bookingLoading ||
                    !selectedSlot ||
                    !patientId ||
                    !selectedDate
                      ? "bg-[#134e97]/30 cursor-not-allowed"
                      : "bg-[#134e97] hover:bg-[#013473] shadow-md"
                  } text-sm`}>
                  {bookingLoading ? "Booking..." : "Confirm"}
                </button>
              )}
            </div>
          </section>
        </div>
      </main>

      <BlockDateModal
        isOpen={isBlockOpen}
        onClose={() => setIsBlockOpen(false)}
        doctorId={doctorId}
        onSuccess={async () => {
          await fetchBlockedSlots(doctorId);
          await fetchDoctor();
          setIsBlockOpen(false);
        }}
      />

      <Footer />
    </div>
  );
}
