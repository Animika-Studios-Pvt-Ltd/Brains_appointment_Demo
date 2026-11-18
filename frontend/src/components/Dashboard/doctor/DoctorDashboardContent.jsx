// src/components/Dashboard/doctor/DoctorDashboardContent.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { userAuthStore } from "@/store/authStore";
import { useDoctorStore } from "@/store/doctorStore";
import { useAppointmentStore } from "@/store/appointmentStore";
import { useBlockedSlotStore } from "@/store/blockedSlotStore";
import BlockDateModal from "./BlockDateModal";
import PrescriptionModal from "./PrescriptionModal";
import AvailabilityModal from "./AvailabilityModal";
import GoogleCalendarConnect from "@/components/GoogleCalendarConnect";
import GoogleCalendarView from "./GoogleCalendarView";
import Footer from "@/components/HomePage/Footer";
import { performLogout } from "@/utils/api";

import {
  Ban,
  Calendar,
  ChevronRight,
  Clock,
  MapPin,
  Briefcase,
  Activity,
  Settings,
  LogOut,
  Video,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "../../ui/avatar";
import { Button } from "../../ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../ui/card";
import { Badge } from "../../ui/badge";
import { getStatusColor } from "@/lib/constant";
import { FiClock } from "react-icons/fi";

import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import { getImageUrl } from "@/utils/imageUrl";

// ✅ BACKEND constant — change if needed
const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

const deriveStatusFromEvent = (event) => {
  if (!event) return null;
  if (event.description) {
    const match = event.description.match(/Status:\s*([^\n]+)/i);
    if (match && match[1]) return match[1].trim();
  }
  if (event.summary) {
    const match = event.summary.match(/\(([^)]+)\)\s*$/);
    if (match && match[1]) return match[1].trim();
  }
  if (event.status && event.status !== "confirmed") return event.status;
  return null;
};

function formatFullDate(d) {
  try {
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function formatFullTime(d) {
  try {
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
}

const formatTime = (dateString) => {
  try {
    return new Date(dateString).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "-";
  }
};

const formatTimeOnly = (dateString) => {
  try {
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "-";
  }
};

function getPatientName(item) {
  if (!item) return null;
  if (item?.patientId?.name) return item.patientId.name;
  if (item?.patientName) return item.patientName;
  if (item?.patient) return item.patient;

  const raw = item?.summary || item?.title || "";
  if (!raw) return null;
  let t = String(raw);
  t = t.replace(/^\s*\([^)]+\)\s*/g, "");
  t = t.replace(/Appointment\s*Details[:\s\-–—]*/i, "");
  t = t.replace(/^(Details[:\s\-–—]*)/i, "");
  t = t.replace(/[\u2022\u00B7\-\–\—\|·•]\s*(?:Dr\.?\s*)?[A-Za-z0-9\s\.\-]+$/i, "");
  t = t.replace(/^[\s\|:\-–—]+|[\s\|:\-–—]+$/g, "").trim();
  const parts = t.split(/[\u2022\u00B7\-\–\—\|·•]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length) return parts[0];
  return t || null;
}

function parsePatientAndSymptoms(item = {}) {
  const patientFromFields =
    item?.patientId?.name ||
    item?.patientName ||
    item?.patient ||
    null;

  const apptId = item._id || item.id || null;
  const extractLabel = (text = "", labelRegex) => {
    if (!text) return null;
    const m = text.match(labelRegex);
    if (m && m[1]) return m[1].trim();
    return null;
  };

  const descr = (item.description || item.notes || "").toString();
  const summ = (item.summary || item.title || "").toString();
  const combined = `${summ}\n${descr}`;

  const namePatterns = [
    /Patient(?: Name)?[:\-\s]+(.+?)(?:$|\n|,|·|\|)/i,
    /Name[:\-\s]+(.+?)(?:$|\n|,|·|\|)/i,
    /Patient[:\-\s]+(.+?)(?:$|\n|,|·|\|)/i,
    /For[:\-\s]+(.+?)(?:$|\n|,|·|\|)/i,
  ];

  let parsedName = null;
  for (const p of namePatterns) {
    parsedName = extractLabel(combined, p);
    if (parsedName) break;
  }

  if (!patientFromFields && parsedName) {
    parsedName = parsedName.replace(/Appointment\s*Details[:\s\-–—]*/i, "").trim();
  }

  const symptomPatterns = [
    /Symptoms?[:\-\s]+(.+?)(?:$|\n)/i,
    /Chief Complaint[:\-\s]+(.+?)(?:$|\n)/i,
    /Complaint[:\-\s]+(.+?)(?:$|\n)/i,
    /Notes?[:\-\s]+(.+?)(?:$|\n)/i,
  ];

  let parsedSymptoms = null;
  for (const p of symptomPatterns) {
    parsedSymptoms = extractLabel(descr, p);
    if (parsedSymptoms) break;
  }

  if (!parsedSymptoms && descr && descr.length < 180 && descr.split(/\n/).length <= 3) {
    parsedSymptoms = descr.trim();
  }

  return {
    patient: patientFromFields || parsedName || null,
    symptoms: parsedSymptoms || null,
    apptId,
  };
}

const sanitizeDescription = (text = "") => {
  if (Array.isArray(text)) {
    return text
      .map((it) => {
        if (!it) return null;
        if (typeof it === "string") return { text: it.trim() };
        if (typeof it === "object" && it.text) return { text: String(it.text).trim() };
        return { text: Object.values(it).filter(Boolean).join(" · ").trim() || null };
      })
      .filter(Boolean);
  }

  if (typeof text === "object" && text !== null) {
    const vals = Object.values(text).filter(Boolean);
    return vals.length ? vals.map((v) => ({ text: String(v).trim() })) : [];
  }

  let t = String(text || "");
  t = t.replace(/<[^>]*>/g, " ");
  t = t.replace(/([-_*.]{3,})/g, "\n");
  t = t.replace(/\r?\n+/g, "\n");
  t = t.replace(/[ ]{2,}/g, " ");
  t = t.trim();
  if (!t) return [];

  return t
    .split(/\n|•|—| - | \| /)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => ({ text: x }));
};

const DoctorDashboardContent = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const { user, loading: authLoading, initAuth, logout: authLogout } = userAuthStore();
  const { dashboardData, fetchDashboard, loading: dashLoading } = useDoctorStore();
  const { endConsultation, fetchAppointmentById, currentAppointment } = useAppointmentStore();
  const { blockedSlots, fetchBlockedSlots } = useBlockedSlotStore();

  const [isInitialized, setIsInitialized] = useState(false);
  const [isCalendarConnected, setIsCalendarConnected] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarEmail, setCalendarEmail] = useState(null);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [isAvailabilityModalOpen, setIsAvailabilityModalOpen] = useState(false);
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);
  const [completingAppointmentId, setCompletingAppointmentId] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [now, setNow] = useState(new Date());
  const [apptDetails, setApptDetails] = useState({});
  const [onlineLive, setOnlineLive] = useState(true);
  const [updatingLive, setUpdatingLive] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    async function fetchOnlineStatus() {
      try {
        const token = localStorage.getItem("token");
        const headers = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        
        const res = await fetch(`${BACKEND}/api/system-settings/online-booking`, {
          headers
        });
        const json = await res.json();
        if (json.status === "success") {
          setOnlineLive(json.onlineBookingLive);
        }
      } catch (err) {
        console.error("Failed to load online booking status:", err);
      }
    }
    fetchOnlineStatus();
  }, []);

  const handleToggleOnlineLive = async () => {
    if (updatingLive) return;

    const targetState = !onlineLive;
    const result = await Swal.fire({
      icon: "question",
      title: targetState ? "Enable Online Booking?" : "Disable Online Booking?",
      text: targetState
        ? "Do you want to enable online booking so patients can book video consultations?"
        : "Are you sure you want to disable online booking?",
      showCancelButton: true,
      confirmButtonText: targetState ? "Yes, Enable" : "Yes, Disable",
      cancelButtonText: "Cancel",
      customClass: {
        confirmButton: "swal-round-btn",
        cancelButton: "swal-round-btn swal2-cancel",
      },
      buttonsStyling: false,
    });

    if (!result.isConfirmed) return;

    setUpdatingLive(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BACKEND}/api/system-settings/online-booking`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ onlineBookingLive: targetState })
      });
      const json = await res.json();
      if (json.status === "success") {
        setOnlineLive(json.onlineBookingLive);
        Swal.fire({
          icon: "success",
          title: "Status Updated",
          text: `Online booking is now ${json.onlineBookingLive ? "enabled (Live)" : "disabled (Off)"}.`,
          confirmButtonText: "OK",
          customClass: {
            confirmButton: "swal-round-btn",
          },
          buttonsStyling: false,
        });
      } else {
        throw new Error(json.message || "Failed to update status");
      }
    } catch (err) {
      console.error("Failed to toggle online booking status:", err);
      Swal.fire({
        icon: "error",
        title: "Update Failed",
        text: err.message || "Failed to toggle online booking status",
        confirmButtonText: "OK",
        customClass: { confirmButton: "swal-round-btn" },
        buttonsStyling: false,
      });
    } finally {
      setUpdatingLive(false);
    }
  };

  useEffect(() => {
    const initialize = async () => {
      if (!isInitialized) {
        await initAuth();
        setIsInitialized(true);
      }
    };
    initialize();
  }, [isInitialized, initAuth]);

  useEffect(() => {
    const fetchDoctorProfile = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;
        const res = await fetch(`${BACKEND}/api/doctor/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();
        if (data.status === "success" && data.data) setDoctorLocal(data.data);
        else console.error("Failed to fetch doctor profile:", data.message);
      } catch (error) {
        console.error("Error fetching doctor profile:", error);
      }
    };

    async function setDoctorLocal(d) {
      // no-op
    }

    const isDoctor =
      user?.type === "doctor" || user?.userType === "doctor";
    if (user?._id && isDoctor) fetchDoctorProfile();
  }, [user?._id, user?.type, user?.userType]);

  useEffect(() => {
    const isDoctor =
      user?.type === "doctor" || user?.userType === "doctor";
    if (user?._id && isDoctor) {
      fetchDashboard(user.type || user.userType || "doctor");
      fetchBlockedSlots(user._id);
    }
  }, [user?._id, user?.type, user?.userType, fetchDashboard, fetchBlockedSlots]);

  useEffect(() => {
    if (user?._id) checkCalendarStatus();
    const handleMessage = (e) => {
      if (e.data?.type === "CALENDAR_CONNECTED") checkCalendarStatus();
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [user?._id]);

  useEffect(() => {
    const completedCallId = searchParams.get("completedCall");
    if (completedCallId) {
      setCompletingAppointmentId(completedCallId);
      fetchAppointmentById(completedCallId);
      setShowPrescriptionModal(true);
    }
  }, [searchParams, fetchAppointmentById]);

  useEffect(() => {
    const id = setInterval(() => setCalendarEvents((ev) => [...ev]), 60000);
    return () => clearInterval(id);
  }, []);

  const checkCalendarStatus = async () => {
    try {
      setCalendarLoading(true);
      const token = localStorage.getItem("token");
      if (!token) {
        setCalendarLoading(false);
        return;
      }
      const res = await fetch(`${BACKEND}/api/google/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setIsCalendarConnected(!!data?.data?.isConnected);
        setCalendarEmail(data?.data?.email || null);
      }
    } catch (err) {
      setIsCalendarConnected(false);
      setCalendarEmail(null);
    } finally {
      setCalendarLoading(false);
    }
  };

  const upcomingSchedule = useMemo(() => {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const isAfterToday = (d) => {
      const dt = new Date(d);
      if (Number.isNaN(dt.getTime())) return false;
      return dt.getTime() >= startOfToday.getTime() + 24 * 60 * 60 * 1000;
    };

    const blocked = (blockedSlots || []).map((slot) => ({
      ...slot,
      id: `blocked_${slot._id}`,
      start: { dateTime: slot.startTime },
      end: { dateTime: slot.endTime },
      isBlocked: true,
      status: "Blocked",
      reason: slot.reason || slot.note || slot.title || null,
      summary: slot.reason || slot.title || "Blocked",
    }));

    const appts = (dashboardData?.upcomingAppointments || []).map((a) => ({
      ...a,
      start: { dateTime: a.slotStartIso },
      end: { dateTime: a.slotEndIso },
      isBlocked: false,
    }));

    const events = (calendarEvents || []).map((ev) => ({
      ...ev,
      start: ev.start || { dateTime: ev.start?.dateTime || ev.startDate || ev.startDateTime },
      end: ev.end || { dateTime: ev.end?.dateTime || ev.endDate || ev.endDateTime },
      isBlocked: !!ev.isBlocked,
    }));

    const combined = [...appts, ...events, ...blocked];

    const futureOnly = combined.filter((item) => {
      const s = item.slotStartIso || item.start?.dateTime;
      return s && isAfterToday(s);
    });

    return futureOnly
      .sort((a, b) => {
        const ta = new Date(a.slotStartIso || a.start?.dateTime).getTime();
        const tb = new Date(b.slotStartIso || b.start?.dateTime).getTime();
        return ta - tb;
      })
      .slice(0, 4);
  }, [dashboardData?.upcomingAppointments, calendarEvents, blockedSlots]);

  const todaySchedule = useMemo(() => {
    const today = new Date();

    const isSameDay = (d1, d2) =>
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();

    // 🔹 1) Blocked slots for today
    const blockedToday = (blockedSlots || [])
      .filter((slot) => {
        const start = slot.startTime ? new Date(slot.startTime) : null;
        return start && isSameDay(start, today);
      })
      .map((slot) => ({
        id: `blocked_${slot._id}`,
        start: { dateTime: slot.startTime },
        end: { dateTime: slot.endTime },
        isBlocked: true,
        reason: slot.reason || slot.note || slot.title || null,
        summary: slot.reason || slot.title || "Blocked",
      }));

    // 🔹 2) Try multiple possible today-* fields from backend
    let baseTodayAppts = [
      ...(dashboardData?.todayAppointments || []),
      ...(dashboardData?.appointmentsToday || []),
      ...(dashboardData?.todaysAppointments || []),
    ];

    // If still empty, derive “today” from upcomingAppointments
    if (
      baseTodayAppts.length === 0 &&
      Array.isArray(dashboardData?.upcomingAppointments)
    ) {
      baseTodayAppts = dashboardData.upcomingAppointments.filter((a) => {
        const s =
          a.slotStartIso ||
          a.start?.dateTime ||
          a.startDate ||
          a.slot?.start;
        if (!s) return false;
        const d = new Date(s);
        return !Number.isNaN(d.getTime()) && isSameDay(d, today);
      });
    }

    // Normalise to same shape as the blocked/calendar events
    const apptsToday = baseTodayAppts.map((a) => ({
      ...a,
      start: {
        dateTime:
          a.slotStartIso ||
          a.start?.dateTime ||
          a.startDate ||
          a.slot?.start,
      },
      end: {
        dateTime:
          a.slotEndIso || a.end?.dateTime || a.endDate || a.slot?.end,
      },
      isBlocked: false,
    }));

    // 🔹 3) Google calendar events for today only
    const calendarToday = (calendarEvents || []).filter((ev) => {
      const s =
        ev.slotStartIso ||
        ev.start?.dateTime ||
        ev.startDate ||
        ev.startDateTime;
      if (!s) return false;
      const d = new Date(s);
      return !Number.isNaN(d.getTime()) && isSameDay(d, today);
    });

    // 🔹 4) Combine and sort
    return [...apptsToday, ...calendarToday, ...blockedToday].sort((a, b) => {
      const ta = new Date(a.slotStartIso || a.start?.dateTime).getTime();
      const tb = new Date(b.slotStartIso || b.start?.dateTime).getTime();
      return ta - tb;
    });
  }, [
    dashboardData?.todayAppointments,
    dashboardData?.appointmentsToday,
    dashboardData?.todaysAppointments,
    dashboardData?.upcomingAppointments,
    calendarEvents,
    blockedSlots,
  ]);

  const onlineConsultations = useMemo(() => {
    if (!dashboardData) return [];
    
    // Combine today's and upcoming appointments
    const allAppts = [
      ...(dashboardData.todayAppointments || []),
      ...(dashboardData.appointmentsToday || []),
      ...(dashboardData.todaysAppointments || []),
      ...(dashboardData.upcomingAppointments || []),
    ];

    // De-duplicate by ID
    const uniqueMap = {};
    allAppts.forEach((a) => {
      if (a && a._id) {
        uniqueMap[a._id] = a;
      }
    });

    const list = Object.values(uniqueMap).filter((a) => {
      const isOnline = String(a.paymentMode || '').toLowerCase() === 'online';
      const hasMeet = !!(a.googleCalendar?.meetLink || a.meetLink);
      return (isOnline || hasMeet) && a.status !== 'Cancelled';
    });

    // Sort by date/time start
    return list.sort((a, b) => {
      const ta = new Date(a.slotStartIso || a.start?.dateTime).getTime();
      const tb = new Date(b.slotStartIso || b.start?.dateTime).getTime();
      return ta - tb;
    });
  }, [dashboardData]);

  const hasScheduleItems =
    todaySchedule.length > 0 || upcomingSchedule.length > 0;

  async function fetchAppointmentDetail(id) {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BACKEND}/api/appointments/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data?.data || data?.appointment || data;
    } catch (err) {
      console.warn("Failed to fetch appointment", id, err);
      return null;
    }
  }

  useEffect(() => {
    if (!todaySchedule || !todaySchedule.length) return;

    const idsToFetch = todaySchedule
      .map((it) => it._id || it.id)
      .filter(Boolean)
      .filter((id) => {
        const cached = apptDetails[id];
        return !cached || (!cached.symptoms && !cached.fetchedAt);
      });

    if (idsToFetch.length === 0) return;

    (async () => {
      try {
        const promises = idsToFetch.map((id) => fetchAppointmentDetail(id));
        const results = await Promise.all(promises);

        setApptDetails((prev) => {
          const next = { ...prev };
          results.forEach((r, i) => {
            const id = idsToFetch[i];
            if (!id) return;
            if (!r) {
              next[id] = { ...(next[id] || {}), fetchedAt: Date.now() };
              return;
            }
            const symptoms =
              r.symptoms ||
              r.notes ||
              r.description ||
              r.appointment?.symptoms ||
              r.appointment?.notes ||
              "";
            next[id] = { ...(next[id] || {}), ...r, symptoms, fetchedAt: Date.now() };
          });
          return next;
        });
      } catch (e) {
        console.warn("Error fetching appointment details", e);
      }
    })();
  }, [todaySchedule]);

  // --------------------------
  // Logout with SweetAlert2
  // --------------------------
  // --------------------------
  // Logout with SweetAlert2 + clear session
  // --------------------------
  const confirmLogout = async () => {
    const result = await Swal.fire({
      title: "Logout?",
      text: "Are you sure you want to logout?",
      icon: "warning",
      iconColor: "#ef4444",
      showCancelButton: true,
      confirmButtonText: "Yes, Logout",
      cancelButtonText: "Cancel",
      buttonsStyling: false,
      customClass: {
        popup: "rounded-3xl border border-slate-100 bg-white shadow-2xl p-6 sm:p-8 max-w-sm font-body",
        title: "text-xl sm:text-2xl font-heading font-extrabold text-slate-800 mb-2",
        htmlContainer: "text-sm text-slate-500 font-body mb-6 leading-relaxed",
        confirmButton: "rounded-full px-6 py-2.5 bg-red-600 border border-transparent text-white font-medium text-xs sm:text-sm hover:bg-red-700 transition-all duration-300 hover:scale-102 shadow-md hover:shadow-lg focus:outline-none mx-2",
        cancelButton: "rounded-full px-6 py-2.5 bg-slate-100 border border-slate-200 text-slate-600 font-medium text-xs sm:text-sm hover:bg-slate-200 transition-all duration-300 hover:scale-102 focus:outline-none mx-2",
      }
    });

    if (!result.isConfirmed) return;

    try {
      setIsLoggingOut(true);
      if (typeof authLogout === "function") {
        try {
          await authLogout();
        } catch (e) {
          console.error("authLogout store error", e);
        }
      }

      await Swal.fire({
        icon: "success",
        title: "Logged Out Successfully",
        iconColor: "#10b981",
        timer: 1200,
        showConfirmButton: false,
        buttonsStyling: false,
        customClass: {
          popup: "rounded-3xl border border-slate-100 bg-white shadow-2xl p-6 font-body",
          title: "text-lg sm:text-xl font-heading font-extrabold text-slate-800",
        }
      });

      await performLogout();
    } catch (err) {
      console.error("Logout failed", err);
      Swal.fire({
        icon: "error",
        title: "Logout failed",
        text: "Could not log out. Please try again.",
        buttonsStyling: false,
        customClass: {
          popup: "rounded-3xl border border-slate-100 bg-white shadow-2xl p-6 font-body",
          title: "text-lg sm:text-xl font-heading font-extrabold text-slate-800",
          htmlContainer: "text-sm text-slate-500 font-body mb-4",
          confirmButton: "rounded-full px-6 py-2.5 bg-red-600 text-white font-medium text-xs sm:text-sm hover:bg-red-700 transition-all duration-300 focus:outline-none",
        }
      });
    }
  };

  if (!isInitialized || authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#134e97] via-[#0b5c9b] to-[#06adc6] flex items-center justify-center font-body">
        <div className="text-center p-8 backdrop-blur-md bg-white/10 rounded-3xl border border-white/20 shadow-2xl max-w-sm w-full mx-4">
          <div className="relative mb-6">
            <div className="w-16 h-16 sm:w-20 sm:h-20 border-4 border-white/20 border-t-[#05dcfb] rounded-full animate-spin mx-auto"></div>
            <Activity className="w-8 h-8 text-[#05dcfb] absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 animate-pulse" />
          </div>
          <h3 className="text-white text-xl font-heading mb-2">Brains Hospital</h3>
          <p className="text-blue-100 text-sm font-light">Securing your clinical workspace...</p>
        </div>
      </div>
    );
  }

  // add this inside the component (near checkCalendarStatus)
  const handleDisconnectCalendar = async () => {
    try {
      // quick confirm
      const confirm = await Swal.fire({
        title: "Disconnect Google Calendar?",
        text: "This will stop syncing events with your Google Calendar.",
        icon: "warning",
        iconColor: "#ef4444",
        showCancelButton: true,
        confirmButtonText: "Disconnect Sync",
        cancelButtonText: "Keep Connected",
        customClass: {
          popup: "rounded-3xl border border-[#134e97]/10 shadow-2xl p-6 sm:p-8 font-body",
          title: "text-lg sm:text-xl font-heading font-extrabold text-slate-800 tracking-tight mb-2",
          htmlContainer: "text-xs sm:text-sm text-slate-500 font-body leading-relaxed mb-6",
          confirmButton: "bg-red-600 hover:bg-red-700 text-white font-body text-xs font-bold rounded-full px-6 py-3 border-0 transition-all duration-300 hover:scale-102 cursor-pointer shadow-sm outline-none mx-1.5",
          cancelButton: "bg-slate-100 hover:bg-slate-200 text-slate-700 font-body text-xs font-bold rounded-full px-6 py-3 border-0 transition-all duration-300 hover:scale-102 cursor-pointer shadow-sm outline-none mx-1.5"
        },
        buttonsStyling: false,
        backdrop: "rgba(19, 78, 151, 0.15)",
      });
      if (!confirm.isConfirmed) return;

      setCalendarLoading(true);

      const token = localStorage.getItem("token");
      if (!token) {
        setIsCalendarConnected(false);
        setCalendarEmail(null);
        await checkCalendarStatus();
        return;
      }

      // inside handleDisconnectCalendar()
      const res = await fetch(`${BACKEND}/api/google/disconnect`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        // no body required for DELETE here
      });


      // network / non-JSON handling
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.warn("Disconnect returned non-OK:", res.status, text);
        await Swal.fire({ icon: "error", title: "Disconnect failed", text: `Server responded ${res.status}.` });
        return;
      }

      const data = await res.json().catch(() => ({}));

      // If backend returns a success flag, respect it
      if (data && (data.success === true || data.status === "success")) {
        // immediately update UI and re-check authoritative status
        setIsCalendarConnected(false);
        setCalendarEmail(null);

        // Give visual feedback then re-check the server-side status
        await Swal.fire({ icon: "success", title: "Disconnected", timer: 1200, showConfirmButton: false });
        await checkCalendarStatus(); // authoritative re-check
      } else {
        console.warn("Disconnect response body:", data);
        await Swal.fire({ icon: "info", title: "Disconnect attempted", text: data?.message || "Server did not confirm disconnect. Check logs." });
        await checkCalendarStatus();
      }
    } catch (err) {
      console.error("Error disconnecting calendar", err);
      Swal.fire({ icon: "error", title: "Error", text: err?.message || "Could not disconnect calendar." });
    } finally {
      setCalendarLoading(false);
    }
  };


  if (isLoggingOut) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#134e97] via-[#0b5c9b] to-[#06adc6] flex items-center justify-center font-body">
        <div className="text-center p-8 backdrop-blur-md bg-white/10 rounded-3xl border border-white/20 shadow-2xl max-w-sm w-full mx-4">
          <div className="relative mb-6">
            <div className="w-16 h-16 sm:w-20 sm:h-20 border-4 border-white/20 border-t-[#05dcfb] rounded-full animate-spin mx-auto"></div>
            <Activity className="w-8 h-8 text-[#05dcfb] absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 animate-pulse" />
          </div>
          <h3 className="text-white text-xl font-heading mb-2">Logging out...</h3>
          <p className="text-blue-100 text-sm font-light">Please wait...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#134e97]/10 via-white to-[#06adc6]/10 flex items-center justify-center p-4 font-body">
        <Card className="w-full max-w-md shadow-2xl border-t-4 border-t-red-500 rounded-3xl overflow-hidden bg-white/95 backdrop-blur-xl">
          <CardContent className="p-8 sm:p-10 text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6 ring-4 ring-red-100">
              <Ban className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-heading  text-slate-900 mb-3">Authentication Required</h2>
            <p className="text-slate-600 text-sm mb-6">Please log in to access your secure doctor dashboard portal.</p>
            <Button
              onClick={() => navigate("/login")}
              className="bg-[#134e97] hover:bg-[#013473] text-white w-full py-4 text-base rounded-full shadow-lg hover:shadow-xl transition-all duration-200"
            >
              Sign In to Portal
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isDoctorAccount =
    user.type === "doctor" || user.userType === "doctor";

  if (!isDoctorAccount) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#134e97]/10 via-white to-[#06adc6]/10 flex items-center justify-center p-4 font-body">
        <Card className="w-full max-w-md shadow-2xl border-t-4 border-t-amber-500 rounded-3xl overflow-hidden bg-white/95 backdrop-blur-xl">
          <CardContent className="p-8 sm:p-10 text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6 ring-4 ring-amber-100">
              <Ban className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="text-2xl font-heading  text-slate-900 mb-3">Access Denied</h2>
            <p className="text-slate-600 text-sm mb-2">This secure dashboard is only accessible to doctor accounts.</p>
            <p className="text-xs text-slate-500 mb-6 bg-slate-100 py-1.5 px-3 rounded-full inline-block">
              Current Account Role:{" "}
              <strong className="text-slate-800 uppercase">
                {user.type || user.userType || user.role || "unknown"}
              </strong>
            </p>
            <Button
              onClick={() => navigate("/")}
              className="bg-[#134e97] hover:bg-[#013473] text-white w-full py-3.5 rounded-full shadow-md hover:shadow-lg transition-all duration-200"
            >
              Go to Home Page
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (dashLoading || !dashboardData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-[#134e97]/5 to-[#06adc6]/5 pt-20 font-body">
        <div className="container mx-auto px-4 sm:px-6 max-w-7xl">
          <div className="animate-pulse space-y-6">
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 sm:p-8">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-slate-200 rounded-2xl" />
                <div className="flex-1 space-y-3">
                  <div className="h-6 bg-slate-200 rounded-lg w-2/3" />
                  <div className="h-4 bg-slate-200 rounded-lg w-1/2" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-28 bg-white rounded-3xl border border-slate-100 shadow-sm" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const patientName = currentAppointment?.patientId?.name || "";

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-[#134e97]/5 to-[#06adc6]/5 font-body text-slate-800">



      {/* 2. MAIN SECURE WORKSPACE */}
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

          {/* A. CLINICAL HERO WELCOME BANNER */}
          <Card
            className="mb-8 border-0 bg-gradient-to-r from-[#134e97] via-[#09a3bf] to-[#06adc6] text-white shadow-2xl relative rounded-3xl overflow-hidden group"
          >
            {/* Dynamic visual blobs inspired by custom.css gradients */}
            <div
              className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/10 filter blur-3xl group-hover:scale-110 transition-transform duration-700 pointer-events-none"
            />
            <div
              className="absolute -bottom-20 -left-20 w-48 h-48 rounded-full bg-[#05dcfb]/20 filter blur-2xl pointer-events-none"
            />

            <CardContent className="p-6 sm:p-8 md:p-10 relative z-10">
              <div className="flex flex-col md:flex-row md:flex-wrap lg:flex-nowrap items-center md:items-start lg:items-center justify-between gap-6 md:gap-4 lg:gap-8 md:max-[850px]:flex-col md:max-[850px]:items-center md:max-[850px]:justify-start">

                {/* LEFT COLUMN: Avatar + Professional Credentials */}
                <div className="flex flex-col md:flex-row items-center md:items-center gap-5 min-w-0 w-full md:w-auto md:flex-1 md:min-w-[15rem] md:max-[850px]:w-full md:max-[850px]:max-w-xl md:max-[850px]:justify-center">
                  <div className="relative flex-shrink-0">
                    <Avatar
                      className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 
                       ring-4 ring-white/80 shadow-2xl rounded-2xl 
                       bg-white/10 backdrop-blur-md transition-all duration-300 hover:scale-102"
                    >
                      <AvatarImage src={getImageUrl(dashboardData?.user?.profileImage, dashboardData?.user?.name)} alt={dashboardData?.user?.name} className="object-cover" />
                      <AvatarFallback
                        className="text-3xl bg-[#06adc6] text-white font-body rounded-2xl"
                      >
                        {dashboardData?.user?.name?.charAt(0)?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>

                  <div className="min-w-0 text-center md:text-left">
                    <p className="text-xs sm:text-sm text-blue-100 font-light uppercase tracking-widest mb-1">
                      {getGreeting()},
                    </p>

                    <h1 className="text-2xl sm:text-3xl md:text-4xl font-heading font-extrabold mb-2 tracking-tight text-white drop-shadow-sm">
                      Dr. {dashboardData?.user?.name}
                    </h1>

                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-2">
                      <span
                        className="bg-white/15 border border-white/25 text-white text-xs sm:text-sm font-medium rounded-full px-3.5 py-1 backdrop-blur-sm"
                      >
                        {dashboardData?.user?.specialization || "Super Speciality Practitioner"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* MIDDLE COLUMN: Glassmorphic Clock Widget with Availability Button */}
                <div className="w-full max-w-xl md:max-w-none md:w-[15rem] lg:w-auto flex flex-col items-center justify-center backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl p-4 sm:p-5 shadow-inner gap-3 md:max-[850px]:w-full md:max-[850px]:max-w-xl">
                  <div className="text-center min-w-[140px]">
                    <p className="text-2xl sm:text-3xl font-heading font-black text-white tracking-widest leading-none drop-shadow-sm">
                      {formatFullTime(now)}
                    </p>
                    <p className="text-[10px] sm:text-xs text-white font-body uppercase tracking-widest mt-2">
                      {formatFullDate(now)}
                    </p>
                  </div>

                  <Button
                    onClick={() => setIsAvailabilityModalOpen(true)}
                    className="w-full rounded-full px-5 py-2 text-xs sm:text-sm font-body
                     bg-[#013473] border-2 border-[#013473] text-white hover:bg-white hover:text-[#134e97] hover:border-white
                     shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-102 flex items-center justify-center"
                  >
                    <FiClock className="w-4 h-4 mr-2" /> Set Availability
                  </Button>
                </div>

                {/* RIGHT COLUMN: Interactive Control Center */}
                <div className="flex-shrink-0 flex flex-col gap-3 w-full max-w-xl md:max-w-none md:w-56 lg:w-64 items-stretch md:ml-auto md:max-[850px]:w-full md:max-[850px]:max-w-xl md:max-[850px]:ml-0">
                  <Button
                    onClick={handleToggleOnlineLive}
                    disabled={updatingLive}
                    className={`w-full rounded-full px-5 py-2.5 text-xs sm:text-sm font-body transition-all duration-300 shadow-md hover:shadow-lg hover:scale-102 flex items-center justify-between border-2 ${
                      onlineLive
                        ? "bg-emerald-600/90 border-emerald-400 text-white hover:bg-emerald-700"
                        : "bg-rose-600/90 border-rose-400 text-white hover:bg-rose-700"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Video className="w-4 h-4" />
                      <span>{onlineLive ? "Online Booking: LIVE" : "Online Booking: OFF"}</span>
                    </div>
                    <span className={`w-2.5 h-2.5 rounded-full ${onlineLive ? "bg-emerald-200 animate-ping" : "bg-rose-200"}`} />
                  </Button>

                  <Button
                    onClick={() => setIsBlockModalOpen(true)}
                    variant="outline"
                    className="w-full rounded-full px-5 py-2.5 text-xs sm:text-sm font-body
                     border-2 border-white/40 bg-white/10 text-white hover:bg-red-500 hover:text-white hover:border-red-500
                     shadow-md hover:shadow-lg transition-all duration-300 hover:scale-102"
                  >
                    <Ban className="w-4 h-4 mr-2" /> Block Dates
                  </Button>

                  <Link to="/doctor/profile/edit" className="w-full">
                    <Button
                      className="w-full rounded-full px-5 py-2.5 text-xs sm:text-sm font-body
                       bg-[#013473] border-2 border-[#013473] text-white hover:bg-white hover:text-[#134e97] hover:border-white
                       shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-102"
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Edit Profile
                    </Button>
                  </Link>

                  <Button
                    onClick={confirmLogout}
                    variant="outline"
                    className="w-full rounded-full px-5 py-2.5 text-xs sm:text-sm font-body
                     border-2 border-red-400/60 bg-red-500/50 text-white hover:bg-red-600 hover:text-white hover:border-red-600
                     shadow-md hover:shadow-lg transition-all duration-300 hover:scale-102 flex items-center justify-center gap-2"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </Button>
                </div>

              </div>
            </CardContent>
          </Card>

          {/* B. GOOGLE CALENDAR SYNC COMPONENT */}
          {!calendarLoading && (
            <Card className="mb-8 border border-[#134e97]/15 bg-white shadow-xl rounded-3xl overflow-hidden relative group">
              <CardContent className="p-0">
                <div className="w-full">
                  {/* Part 1: Status Action Bar */}
                  {isCalendarConnected && calendarEmail ? (
                    <div className="w-full p-5 sm:p-7 flex flex-col md:flex-row items-center justify-between gap-6 bg-gradient-to-r from-emerald-500/5 to-teal-500/5 border-b border-emerald-500/10 relative overflow-hidden">
                      {/* active glowing backdrop blobs */}
                      <div className="absolute -right-10 -bottom-10 w-32 h-32 rounded-full bg-emerald-500/5 filter blur-2xl pointer-events-none" />

                      <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left relative z-10">
                        {/* Overlapping Connected visual */}
                        <div>
                          <h4 className="text-lg font-heading text-emerald-900 tracking-tight leading-tight flex items-center justify-center sm:justify-start gap-2 font-normal">
                            Google Calendar Sync Active
                            <span className="inline-flex items-center w-2.5 h-2.5 rounded-full bg-emerald-500 relative">
                              <span className="absolute w-full h-full rounded-full bg-emerald-400 animate-ping opacity-75" />
                            </span>
                          </h4>
                          <p className="text-xs sm:text-sm text-emerald-700/90 font-body mt-1.5 leading-relaxed max-w-xl truncate font-normal" title={calendarEmail}>
                            Connected Account: {calendarEmail}
                          </p>
                        </div>
                      </div>

                      <div className="flex-shrink-0 relative z-10">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleDisconnectCalendar}
                          className="rounded-full px-6 py-2.5 border border-red-200 bg-white text-red-600 hover:bg-red-600 hover:text-white hover:border-transparent font-body text-xs shadow-sm transition-all duration-300 hover:scale-102"
                        >
                          Disconnect Sync
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full p-5 sm:p-7 flex flex-col md:flex-row items-center justify-between gap-6 bg-gradient-to-br from-[#134e97]/5 via-white to-[#06adc6]/5 relative overflow-hidden">
                      {/* active background abstract elements */}
                      <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-[#06adc6]/10 filter blur-2xl pointer-events-none group-hover:scale-110 transition-transform duration-700" />

                      <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left relative z-10">
                        {/* Overlapping Connection graphic */}
                        <div>
                          <h4 className="text-lg font-heading font-extrabold text-[#134e97] tracking-tight leading-tight">
                            Google Calendar Integration
                          </h4>
                          <p className="text-xs sm:text-sm text-slate-600 font-body mt-1.5 leading-relaxed max-w-xl">
                            Sync your appointments to a dedicated work calendar.
                          </p>
                        </div>
                      </div>

                      <div className="flex-shrink-0 relative z-10">
                        <GoogleCalendarConnect
                          onConnect={() => {
                            setIsCalendarConnected(true);
                            checkCalendarStatus();
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Part 2 & 3: Benefit Column Showcase Grid (Only displayed when NOT connected) */}
                  {(!isCalendarConnected || !calendarEmail) && (
                    <>
                      {/* Horizontal elegant separator line */}
                      <div className="border-t border-slate-100 w-full" />

                      {/* Benefit Column Showcase Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-5 sm:p-7 bg-slate-50/40">
                        {/* Column 1: Separate Calendar */}
                        <div className="flex flex-col items-start p-4 bg-white border border-slate-100 rounded-2xl shadow-xs hover:shadow-md transition-all duration-300">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#134e97] flex items-center justify-center mb-3.5 shadow-inner">
                            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </svg>
                          </div>
                          <h5 className="text-sm font-heading font-bold text-slate-800">
                            Separate Calendar
                          </h5>
                          <p className="text-xs text-slate-500 font-body leading-relaxed mt-1.5">
                            Only work appointments, personal events stay private
                          </p>
                        </div>

                        {/* Column 2: Auto-Sync */}
                        <div className="flex flex-col items-start p-4 bg-white border border-slate-100 rounded-2xl shadow-xs hover:shadow-md transition-all duration-300">
                          <div className="w-10 h-10 rounded-xl bg-[#06adc6]/10 text-[#06adc6] flex items-center justify-center mb-3.5 shadow-inner">
                            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                            </svg>
                          </div>
                          <h5 className="text-sm font-heading font-bold text-slate-800">
                            Auto-Sync
                          </h5>
                          <p className="text-xs text-slate-500 font-body leading-relaxed mt-1.5">
                            Appointments appear instantly in Google Calendar
                          </p>
                        </div>

                        {/* Column 3: Smart Reminders */}
                        <div className="flex flex-col items-start p-4 bg-white border border-slate-100 rounded-2xl shadow-xs hover:shadow-md transition-all duration-300">
                          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3.5 shadow-inner">
                            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                            </svg>
                          </div>
                          <h5 className="text-sm font-heading font-bold text-slate-800">
                            Smart Reminders
                          </h5>
                          <p className="text-xs text-slate-500 font-body leading-relaxed mt-1.5">
                            Email 1hr before, popup 15min before
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* C. VIDEO CONSULTATIONS SECTION */}
          <Card className="mb-8 border border-blue-100 bg-white shadow-xl rounded-3xl overflow-hidden border-t-4 border-t-[#06adc6]">
            <CardHeader className="border-b border-slate-100 bg-slate-50/70 p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 bg-[#06adc6]/10 text-[#06adc6] rounded-xl flex items-center justify-center shadow-inner">
                    <Video className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-heading font-extrabold text-[#134e97] leading-none">Online & Video Consultations</h3>
                    <p className="text-xs text-slate-500 font-medium mt-1.5">Tele-health checkups and online virtual appointments</p>
                  </div>
                </div>
                <span className="text-xs font-body px-3 py-1.5 bg-[#06adc6]/10 text-[#06adc6] rounded-full">
                  {onlineConsultations.length} Scheduled
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-5 sm:p-6">
              {onlineConsultations.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {onlineConsultations.map((appt) => {
                    const meetLink = appt.googleCalendar?.meetLink || appt.meetLink;
                    const patientName = appt.patientId?.name || appt.patientName || "Patient";
                    const symptoms = appt.symptoms || "None reported";
                    const timeLabel = appt.slotStartIso
                      ? `${new Date(appt.slotStartIso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} · ${formatTime(appt.slotStartIso)} - ${formatTime(appt.slotEndIso)}`
                      : "Time not scheduled";
                    
                    return (
                      <div
                        key={appt._id}
                        className="p-5 rounded-2xl border border-slate-200 bg-slate-50/30 hover:bg-slate-50/70 transition-all duration-300 flex flex-col justify-between gap-4 relative group"
                      >
                        {/* Status Badge */}
                        <div className="absolute top-4 right-4">
                          <span className={`inline-block px-2.5 py-1 text-[10px] uppercase tracking-wider rounded-full ${getStatusColor(appt.status)} shadow-xs`}>
                            {appt.status || "Scheduled"}
                          </span>
                        </div>

                        {/* Patient info */}
                        <div className="flex items-start gap-3">
                          <Avatar className="w-12 h-12 flex-shrink-0 ring-2 ring-slate-100 rounded-xl">
                            <AvatarImage src={getImageUrl(appt.patientId?.profileImage, patientName)} alt={patientName} />
                            <AvatarFallback className="bg-gradient-to-br from-[#134e97] to-[#06adc6] text-white font-body rounded-xl text-sm">
                              {patientName.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 pr-16">
                            <h4 className="font-heading font-bold text-slate-800 text-sm sm:text-base truncate" title={patientName}>
                              {patientName}
                            </h4>
                            <p className="text-xs text-slate-500 font-medium mt-1 truncate" title={timeLabel}>
                              📅 {timeLabel}
                            </p>
                          </div>
                        </div>

                        {/* Symptoms */}
                        <div className="bg-white/80 border border-slate-100 rounded-xl p-3 text-xs text-slate-600">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Symptoms</span>
                          <p className="line-clamp-2 italic">"{symptoms}"</p>
                        </div>

                        {/* Meeting Link Action */}
                        <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
                          {meetLink ? (
                            <a
                              href={meetLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-full rounded-xl py-2.5 text-xs font-body font-bold text-center
                               bg-[#06adc6] hover:bg-[#059ab0] text-white shadow-md hover:shadow-lg transition-all duration-300 hover:scale-[1.02] flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Video className="w-4 h-4" /> Join Video Call
                            </a>
                          ) : (
                            <div className="w-full rounded-xl py-2.5 text-xs font-body font-medium text-center bg-slate-100 text-slate-400 border border-slate-200">
                              Awaiting Meet Link...
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-10 px-4 border-2 border-dashed border-slate-200 rounded-3xl">
                  <div className="w-14 h-14 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-inner">
                    <Video className="w-7 h-7" />
                  </div>
                  <h3 className="text-lg font-heading font-bold text-slate-700 mb-1">No Video Consultations Scheduled</h3>
                  <p className="text-slate-500 text-sm max-w-md mx-auto">All booked virtual video consults will appear in this dedicated section for quick access.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* C. CLINICAL SCHEDULE WORKSPACE GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">

            {/* COLUMN 1: Today's Clinical Schedule */}
            <Card className="lg:col-span-2 border border-slate-200 shadow-xl rounded-3xl overflow-hidden bg-white border-t-4 border-t-[#06adc6]">
              <CardHeader className="border-b border-slate-100 bg-slate-50/70 p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 bg-[#134e97]/10 text-[#134e97] rounded-xl flex items-center justify-center shadow-inner">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-xl font-heading font-extrabold text-[#134e97] leading-none">Today's Schedule</h3>
                      <p className="text-xs text-slate-500 font-medium mt-1.5">{formatFullDate(now)}</p>
                    </div>
                  </div>
                  <span className="text-xs font-body px-3 py-1.5 bg-[#06adc6]/10 text-[#06adc6] rounded-full">
                    {todaySchedule.length} Events
                  </span>
                </div>
              </CardHeader>

              <CardContent className="p-4 sm:p-6">
                {todaySchedule.length > 0 ? (
                  <div className="space-y-4">
                    {todaySchedule.map((item, index) => {
                      const isBlocked = !!item.isBlocked;
                      const key = item._id || item.id || index;
                      const start = item.slotStartIso || item.start?.dateTime;
                      const end = item.slotEndIso || item.end?.dateTime;
                      const apptId = item._id || item.id || null;

                      const backend = apptDetails[apptId] || {};
                      const { patient: parsedPatient, symptoms: parsedSymptoms } = parsePatientAndSymptoms(item);

                      const patientNameFinal = item?.patientId?.name || item?.patientName || backend?.patientName || parsedPatient || getPatientName(item) || "External Appointment";
                      const symptomsFinal = item?.symptoms || backend?.symptoms || parsedSymptoms || "";
                      const blockReason = item.reason || item.summary || "Consultation Blocked";

                      return (
                        <article
                          key={key}
                          className={`relative flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 sm:p-5 border rounded-2xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md border-l-4 ${isBlocked
                            ? "bg-red-50/40 border-red-200 border-l-red-500 hover:border-red-300"
                            : "bg-white border-slate-200 border-l-[#134e97] hover:border-slate-300 hover:border-l-[#06adc6]"
                            }`}
                        >
                          <div className="flex-1 min-w-0">

                            {/* Badges/States */}
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs  uppercase tracking-wider ${isBlocked
                                ? "bg-red-100 text-red-800 border border-red-200"
                                : item.status === "Scheduled"
                                  ? "bg-blue-50 text-[#134e97] border border-blue-200"
                                  : item.status === "In Progress"
                                    ? "bg-amber-50 text-amber-800 border border-amber-200"
                                    : item.status === "Completed"
                                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                      : item.status === "Cancelled"
                                        ? "bg-slate-100 text-slate-700 border border-slate-200"
                                        : "bg-[#06adc6]/10 text-[#06adc6] border border-[#06adc6]/20"
                                }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${isBlocked
                                  ? "bg-red-600"
                                  : item.status === "Scheduled"
                                    ? "bg-[#134e97]"
                                    : item.status === "In Progress"
                                      ? "bg-amber-600"
                                      : item.status === "Completed"
                                        ? "bg-emerald-600"
                                        : item.status === "Cancelled"
                                          ? "bg-slate-600"
                                          : "bg-[#06adc6]"
                                  }`} />
                                {isBlocked ? "Blocked" : item.status || "Scheduled"}
                              </span>

                              {/* Time Display */}
                              <span className="text-xs  text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full whitespace-nowrap">
                                {start
                                  ? isBlocked
                                    ? `${formatTimeOnly(start)} — ${formatTimeOnly(end)}`
                                    : `${formatTime(start)} - ${formatTime(end)}`
                                  : "Time not scheduled"}
                              </span>
                            </div>

                            {/* Core Patient Details */}
                            <div className="space-y-1">
                              {isBlocked ? (
                                <h4 className="text-base font-heading  text-slate-800 leading-tight">
                                  <span className="text-red-500 mr-1.5 ">Blocked:</span>
                                  {blockReason}
                                </h4>
                              ) : (
                                <>
                                  <h4 className="text-base text-slate-900 leading-tight flex items-center gap-1.5">
                                    <span className="text-slate-800 font-extrabold text-xs uppercase tracking-wider">Patient:</span>
                                    {patientNameFinal}
                                  </h4>

                                  {symptomsFinal && (
                                    <p className="text-sm text-slate-600 font-light max-w-xl break-words line-clamp-2 mt-1">
                                      <span className="text-slate-400 font-medium text-xs uppercase tracking-wider mr-1.5">Symptoms:</span>
                                      {symptomsFinal}
                                    </p>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 px-4 border-2 border-dashed border-slate-200 rounded-3xl">
                    <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-inner">
                      <Calendar className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-heading  text-slate-800 mb-1">No Appointments Booked Today</h3>
                    <p className="text-slate-500 text-sm max-w-sm mx-auto">There are no diagnostic checkups or consultation visits lined up in your calendar today.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* COLUMN 2: Upcoming Schedules */}
            <Card className="border border-slate-200 shadow-xl rounded-3xl overflow-hidden bg-white border-t-4 border-t-[#134e97] h-fit md:sticky md:top-24">
              <CardHeader className="border-b border-slate-100 bg-slate-50/70 p-5">
                <CardTitle className="flex items-center justify-between text-base">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-[#134e97]/10 text-[#134e97] rounded-xl flex items-center justify-center">
                      <Clock className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-heading text-[#134e97] leading-none">Upcoming Visits</h3>
                    </div>
                  </div>
                  <span className="text-xs font-body px-2.5 py-1 bg-[#134e97]/10 text-[#134e97] rounded-full">
                    {upcomingSchedule.length} Left
                  </span>
                </CardTitle>
              </CardHeader>

              <CardContent className="p-4 max-h-[500px] overflow-y-auto space-y-3.5">
                {upcomingSchedule.length > 0 ? (
                  <div className="space-y-3">
                    {upcomingSchedule.map((item, index) => {
                      const key = item._id || item.id || item.idStr || `up_${index}`;
                      const start = item.slotStartIso || item.start?.dateTime;
                      const end = item.slotEndIso || item.end?.dateTime;
                      const isBlocked = !!item.isBlocked;
                      const isCancelled = item.status && String(item.status).toLowerCase() === "cancelled";
                      const patientLabel = item.patientId?.name || item.summary || getPatientName(item) || "External Visit";
                      const timeLabel = start ? (isBlocked ? `${formatTimeOnly(start)} — ${formatTimeOnly(end)}` : `${new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${formatTime(start)}`) : "Time not scheduled";
                      const statusText = isBlocked ? "Blocked" : (item.status || "Scheduled");

                      return (
                        <div
                          key={key}
                          className={`relative p-3.5 border rounded-2xl transition-all duration-300 border-l-4 ${isBlocked
                            ? "border-slate-200 border-l-red-500 bg-red-50/20"
                            : isCancelled
                              ? "border-slate-200 border-l-slate-400 bg-slate-50/50"
                              : "border-slate-200 border-l-[#134e97] bg-white hover:border-slate-300 hover:border-l-[#06adc6] hover:-translate-y-0.5"
                            }`}
                        >
                          <div className="absolute top-3 right-3">
                            <span className={`inline-block px-2 py-0.5 text-[9px]  uppercase tracking-wider rounded-full ${getStatusColor(item.status)} shadow-xs`}>
                              {statusText}
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            {isBlocked ? (
                              <div className="w-10 h-10 bg-red-50 text-red-500 rounded-xl flex items-center justify-center flex-shrink-0 border border-red-100">
                                <Ban className="w-4.5 h-4.5" />
                              </div>
                            ) : item.patientId ? (
                              <Avatar className="w-10 h-10 flex-shrink-0 ring-2 ring-slate-100 rounded-xl">
                                <AvatarImage src={getImageUrl(item.patientId?.profileImage, item.patientId?.name)} alt={patientLabel} />
                                <AvatarFallback className="bg-gradient-to-br from-[#134e97] to-[#06adc6] text-white font-body rounded-xl text-sm">
                                  {item.patientId?.name?.charAt(0)?.toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            ) : (
                              <div className="w-10 h-10 bg-blue-50 text-[#134e97] rounded-xl flex items-center justify-center flex-shrink-0 border border-blue-100">
                                <Calendar className="w-4.5 h-4.5" />
                              </div>
                            )}

                            <div className="flex-1 min-w-0 pr-12">
                              <h4 className={`font-body  text-sm text-slate-800 truncate ${isCancelled ? "line-through text-slate-400 font-normal" : ""}`} title={patientLabel}>
                                {patientLabel}
                              </h4>
                              <p className={`text-xs  mt-0.5 ${isCancelled ? "text-slate-400 line-through font-normal" : "text-slate-500"}`} title={timeLabel}>
                                {timeLabel}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner text-slate-400">
                      <Clock className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-body  text-slate-600">No Upcoming Events Found</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-[200px] mx-auto">There are no future clinic days or virtual visits in the immediate pipeline.</p>
                  </div>
                )}

                {hasScheduleItems && (
                  <Link to="/doctor/appointments" className="block mt-4">
                    <Button variant="outline" className="w-full border-2 border-slate-200 hover:border-[#134e97] hover:bg-[#134e97]/5 text-slate-700 font-body  text-xs py-2.5 rounded-full transition-all duration-200">
                      Open Comprehensive Schedule
                      <ChevronRight className="w-4 h-4 ml-1.5" />
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>

          </div>

        </div>
      </main>

      <Footer />

      {/* Modals */}
      <PrescriptionModal isOpen={showPrescriptionModal} onClose={() => { setShowPrescriptionModal(false); setCompletingAppointmentId(null); }} onSave={async (prescription, notes) => {
        if (!completingAppointmentId) return;
        setModalLoading(true);
        try {
          await endConsultation(completingAppointmentId, prescription, notes);
          setShowPrescriptionModal(false);
          setCompletingAppointmentId(null);
          if (user?.type) fetchDashboard(user.type);
          const url = new URL(window.location.href);
          url.searchParams.delete("completedCall");
          window.history.replaceState({}, "", url.pathname);
        } catch (error) {
          console.error("Failed to complete consultation", error);
        } finally {
          setModalLoading(false);
        }
      }} patientName={patientName} loading={modalLoading} />

      <BlockDateModal isOpen={isBlockModalOpen} onClose={() => setIsBlockModalOpen(false)} doctorId={user?._id || ""} onSuccess={() => { if (user?._id) fetchBlockedSlots(user._id); }} />

      <AvailabilityModal
        isOpen={isAvailabilityModalOpen}
        onClose={() => setIsAvailabilityModalOpen(false)}
        doctorId={user?._id}
        showVipFields={false}
        currentAvailability={{
          availabilityMode: dashboardData?.user?.availabilityMode,  // ✅ ADD THIS LINE
          dailyTimeRanges: dashboardData?.user?.dailyTimeRanges,
          availabilityRange: dashboardData?.user?.availabilityRange,
          appointmentDuration: dashboardData?.user?.appointmentDuration,
        }}
        onSuccess={() => {
          if (user?.type) fetchDashboard(user.type);
          setIsAvailabilityModalOpen(false);
        }}
      />

    </div>
  );
};

export default DoctorDashboardContent;