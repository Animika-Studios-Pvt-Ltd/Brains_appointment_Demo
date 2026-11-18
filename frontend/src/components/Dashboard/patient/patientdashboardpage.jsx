import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import Swal from "sweetalert2";
import {
  ArrowRight,
  Headphones,
  Phone,
  Mail,
  ChevronRight,
  Stethoscope,
  Pencil,
  XCircle,
  CheckCircle2,
  AlertCircle,
  LogOut,
} from "lucide-react";
import Footer from "@/components/HomePage/Footer";
import Header from "@/components/HomePage/Header";
import {
  notifyUserStorageUpdated,
  parseStoredUser,
  USER_STORAGE_UPDATED,
} from "@/utils/authStorage";
import { getImageUrl } from "@/utils/imageUrl";
import { performLogout } from "@/utils/api";
import {
  enrichAppointmentsWithDoctorNames,
  formatDoctorLabel,
  resolveDoctorName,
} from "@/utils/resolveDoctorName";

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

/** BrainS logo palette (see index.css @theme) */
const BRAND_PRIMARY = "#134e97";
const BRAND_DARK = "#013473";
const BRAND_DARKER = "#011f41";
const BRAND_ACCENT = "#06adc6";

/** Solid buttons ? logo dark blue */
const BTN_PRIMARY =
  "bg-[#013473] text-white hover:bg-[#011f41] transition";

const Icon = ({ children, className = "w-5 h-5" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round">
    {children}
  </svg>
);
const CalendarIcon = (p) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </Icon>
);
async function safeJson(res) {
  const txt = await res.text();
  try {
    return JSON.parse(txt);
  } catch {
    throw new Error(txt || `HTTP ${res.status}`);
  }
}
function hasRealProfilePhoto(path) {
  if (!path || typeof path !== "string") return false;
  const p = path.trim();
  if (!p || p.includes("avatar-placeholder")) return false;
  if (p.includes("ui-avatars.com")) return false;
  return true;
}
function badgeClass(status) {
  const s = (status || "").toLowerCase();
  if (s.includes("resched")) {
    return "bg-amber-100 text-amber-900 border border-amber-300";
  }
  if (s.includes("reassign")) {
    return "bg-indigo-100 text-indigo-900 border border-indigo-300";
  }
  if (s.includes("cancel") || s.includes("no show") || s.includes("noshow") || s.includes("missed") || s.includes("expired")) {
    return "bg-[#013473] text-white border border-[#013473]";
  }
  return "bg-[#06adc6]/15 text-[#134e97] border border-[#06adc6]/40";
}

function upcomingRowClass() {
  return "bg-white";
}

function getAppointmentStartMs(item) {
  if (item?.slotStartIso) {
    const t = new Date(item.slotStartIso).getTime();
    if (Number.isFinite(t)) return t;
  }
  if (item?.dateObj instanceof Date && !Number.isNaN(item.dateObj.getTime())) {
    return item.dateObj.getTime();
  }
  return Infinity;
}

function ProfileDetailRow({ label, value }) {
  return (
    <div className="flex min-h-[52px] items-center gap-3 px-4 py-3">
      <span className="flex-1 text-sm font-bold text-[#134e97]">{label}</span>
      <span className="h-6 w-px shrink-0 bg-slate-200" aria-hidden />
      <span className="shrink-0 text-sm font-bold text-[#134e97]">{value || "?"}</span>
    </div>
  );
}

function PatientProfileCard({ user, onLogout, className = "mb-6" }) {
  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "";

  const initial = (user?.name || "P").trim().charAt(0).toUpperCase();
  const showPhoto = hasRealProfilePhoto(user?.profileImage);

  return (
    <div
      className={`flex h-full min-h-0 md:min-h-[240px] xl:min-h-[280px] w-full flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md ${className}`}>
      {/* Header */}
      <div className="relative shrink-0 overflow-hidden px-5 pb-4 pt-5">
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#06adc6]/20 via-sky-50/90 to-white"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute right-4 top-4 grid grid-cols-3 gap-1 opacity-25"
          aria-hidden>
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-full bg-slate-400" />
          ))}
        </div>

        <div className="relative z-[1] flex items-center gap-3">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-white shadow-md ring-2 ring-[#06adc6]/40">
            <img
              key={user?.profileImage}
              src={getImageUrl(user?.profileImage, user?.name)}
              alt={user?.name || "Profile"}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <div className="truncate text-base font-bold text-[#134e97]">
              {user?.name || "Patient"}
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500">{user?.email || "?"}</p>
          </div>
        </div>
      </div>

      {/* Details ? text only, dynamic values */}
      <div className="mx-4 shrink-0 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/90">
        <ProfileDetailRow label="Member since" value={memberSince} />
        <div className="mx-4 border-t border-slate-200/80" />
        <ProfileDetailRow label="Phone" value={user?.phone} />
      </div>

      {/* Actions */}
      <div className="mt-auto flex shrink-0 gap-2 p-4 pt-3">
        <Link to="/patient/profile" className="flex-1">
          <button
            type="button"
            className={`flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium shadow-sm ${BTN_PRIMARY}`}>
            <Pencil className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            Edit Profile
          </button>
        </Link>
        <button
          type="button"
          onClick={onLogout}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-500 bg-white px-3 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50">
          <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} />
          Logout
        </button>
      </div>
    </div>
  );
}

function appointmentTitle(appt) {
  const s = String(appt?.status || "").toLowerCase();
  if (s.includes("cancel")) return "Cancelled";
  if (s.includes("no show") || s.includes("noshow") || s.includes("missed") || s.includes("expired")) return "Missed";
  if (s.includes("comp")) return "Completed";
  if (appt.symptoms) return String(appt.symptoms).slice(0, 48);
  if (appt.doctorSpecialization) return appt.doctorSpecialization;
  return "Consultation";
}

const UPCOMING_DASHBOARD_LIMIT = 2;

function mapStoredToDashboardUser(stored) {
  if (!stored) return null;
  const role = (stored.type || stored.role || stored.userType || "patient")
    .toString()
    .toLowerCase();
  return {
    id: stored.id || stored._id,
    name: stored.name || "Patient",
    email: stored.email || "",
    profileImage: stored.profileImage || stored.avatar || "",
    phone: stored.phone || "",
    createdAt: stored.createdAt || stored.created_at || "",
    role,
    cancelCount: Number(stored.cancelCount || 0),
  };
}

function mapApiToDashboardUser(me) {
  if (!me) return null;
  const role = (me.type || me.role || me.userType || "patient")
    .toString()
    .toLowerCase();
  return {
    id: me._id || me.id,
    name: me.name || me.fullName || "Patient",
    email: me.email || "",
    profileImage: me.profileImage || me.avatar || "",
    phone: me.phone || "",
    createdAt: me.createdAt || me.created_at || "",
    role,
    cancelCount: Number(me.cancelCount || 0),
  };
}

function persistPatientUser(me) {
  const patientType = (me.type || me.role || me.userType || "patient")
    .toString()
    .toLowerCase();
  localStorage.setItem(
    "user",
    JSON.stringify({
      id: me._id || me.id,
      name: me.name || me.fullName || "Patient",
      email: me.email || "",
      type: patientType,
      userType: patientType,
      role: patientType,
      profileImage: me.profileImage || me.avatar || "",
      cancelCount: Number(me.cancelCount || 0),
    })
  );
  notifyUserStorageUpdated();
}

/** Icon matches appointment status (not list position). */
function getRecentAppointmentIcon(appt) {
  const s = String(appt?.status || "").toLowerCase();
  if (s.includes("cancel")) {
    return { bg: "bg-slate-100", color: "text-slate-600", Icon: XCircle };
  }
  if (
    s.includes("no show") ||
    s.includes("noshow") ||
    s.includes("missed") ||
    s.includes("expired")
  ) {
    return { bg: "bg-amber-50", color: "text-amber-700", Icon: AlertCircle };
  }
  if (s.includes("comp")) {
    return { bg: "bg-emerald-50", color: "text-emerald-700", Icon: CheckCircle2 };
  }
  if (s.includes("resched")) {
    return { bg: "bg-amber-50", color: "text-amber-800", Icon: CalendarIcon };
  }
  return { bg: "bg-[#06adc6]/15", color: "text-[#134e97]", Icon: Stethoscope };
}

function AppointmentsSectionHeader({
  icon: Icon,
  iconWrapClass,
  iconClass,
  title,
  subtitle,
  viewAllTo,
  showViewAll = true,
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3 mb-4">
      <div className="flex items-start gap-2 sm:gap-3 min-w-0 flex-1">
        <div
          className={`flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl ${iconWrapClass}`}>
          <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${iconClass}`} strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm sm:text-base md:text-lg font-bold text-[#134e97] leading-tight">{title}</h3>
          <p className="text-xs text-[#134e97]/60 mt-0.5 line-clamp-2">{subtitle}</p>
        </div>
      </div>
      {showViewAll && viewAllTo ? (
        <Link
          to={viewAllTo}
          className="text-xs sm:text-sm font-semibold text-[#134e97] hover:text-[#134e97]/70 shrink-0">
          View all
        </Link>
      ) : null}
    </div>
  );
}

function UpcomingEmptyState() {
  return (
    <div className="rounded-2xl bg-[#06adc6]/8 border border-[#06adc6]/25 py-10 px-4 text-center">
      <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#06adc6]/20 flex items-center justify-center">
        <CalendarIcon className="w-7 h-7 text-[#134e97]" />
      </div>
      <h4 className="text-base font-bold   text-[#134e97]">No upcoming appointments</h4>
      <p className="text-sm text-[#134e97]/60 mt-1">Book an appointment to get started</p>
      <Link to="/patient/DoctorListPage" className="inline-block mt-5">
        <button
          type="button"
          className={`px-6 py-2.5 rounded-full text-sm font-semibold shadow-sm ${BTN_PRIMARY}`}>
          Book Now
        </button>
      </Link>
    </div>
  );
}

function RecentEmptyState() {
  return (
    <div className="rounded-2xl bg-[#06adc6]/8 border border-[#06adc6]/25 py-10 px-4 text-center">
      <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#06adc6]/20 flex items-center justify-center">
        <CalendarIcon className="w-7 h-7 text-[#134e97]" />
      </div>
      <h4 className="text-base font-bold text-[#134e97]">No recent appointments</h4>
      <p className="text-sm text-[#134e97]/60 mt-1">Past visits will appear here</p>
    </div>
  );
}

/** Personalized welcome hero */
function WelcomeBanner({ firstName }) {
  const name = firstName && firstName !== "there" ? firstName : "there";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#06adc6]/30 bg-gradient-to-br from-[#06adc6]/12 via-white to-white shadow-sm min-h-[180px] sm:min-h-[200px] md:min-h-[220px] h-full">
      <div className="relative z-10 p-4 sm:p-6 md:p-7 xl:p-8">
        <span className="inline-block px-3.5 py-1 rounded-lg bg-white/95 text-[#134e97] text-xs sm:text-sm font-medium border border-[#06adc6]/35 shadow-sm">
          Welcome back,
        </span>
        <h2 className="mt-3 text-xl sm:text-2xl md:text-2xl xl:text-3xl font-bold text-[#134e97] leading-tight tracking-tight">
          Hi {name}!{" "}
          <span role="img" aria-label="wave">
            {"\u{1F44B}"}
          </span>
        </h2>
        <p className="mt-2 text-sm sm:text-base text-[#134e97]/75 leading-relaxed max-w-lg">
          We&apos;re here to help you with better healthcare, every step of the way.
        </p>
        <Link to="/patient/DoctorListPage" className="inline-block mt-4 sm:mt-5">
          <span className={`inline-flex items-center gap-2 sm:gap-3 pl-4 sm:pl-5 pr-1.5 py-1.5 sm:py-2 rounded-full text-sm sm:text-base font-medium shadow-md ${BTN_PRIMARY}`}>
            Book an Appointment
            <span className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/95 text-[#134e97] shrink-0">
              <ArrowRight className="w-4 h-4 sm:w-[18px] sm:h-[18px]" strokeWidth={2.5} />
            </span>
          </span>
        </Link>
      </div>
    </div>
  );
}

function SupportBubblesArt({ compact = false }) {
  if (compact) {
    return (
      <div className="relative h-14 w-16 shrink-0" aria-hidden>
        <div className="absolute right-0 top-1 h-9 w-10 rounded-[14px] rounded-br-md bg-gradient-to-br from-[#06adc6] to-[#134e97] shadow-sm" />
        <div className="absolute right-3 top-4 flex h-10 w-12 items-center justify-center gap-1 rounded-[14px] rounded-bl-md bg-gradient-to-br from-[#06adc6]/35 to-[#06adc6]/55 ring-1 ring-white/60">
          <span className="h-1.5 w-1.5 rounded-full bg-[#134e97]/75" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#134e97]/75" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#134e97]/75" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[84px] w-[100px] sm:h-[92px] sm:w-[112px] shrink-0" aria-hidden>
      <div className="absolute right-0 top-2 h-[50px] w-[58px] sm:h-[54px] sm:w-[64px] rounded-[18px] rounded-br-md bg-gradient-to-br from-[#06adc6] to-[#134e97] shadow-[2px_4px_10px_rgba(10,37,64,0.22)]" />
      <div className="absolute right-5 top-7 flex h-[54px] w-[66px] sm:h-[58px] sm:w-[72px] items-center justify-center gap-1.5 rounded-[20px] rounded-bl-md bg-gradient-to-br from-[#06adc6]/35 to-[#06adc6]/55 shadow-[2px_5px_12px_rgba(10,37,64,0.18)] ring-1 ring-white/60">
        <span className="h-2 w-2 rounded-full bg-[#134e97]/75 shadow-sm" />
        <span className="h-2 w-2 rounded-full bg-[#134e97]/75 shadow-sm" />
        <span className="h-2 w-2 rounded-full bg-[#134e97]/75 shadow-sm" />
      </div>
    </div>
  );
}

function NeedHelpCard({ compact = false, sidebar = false }) {
  const shellClass = sidebar
    ? "px-5 py-4 rounded-2xl min-h-[168px]"
    : compact
      ? "px-4 py-3 rounded-2xl"
      : "px-5 py-4 sm:px-6 sm:py-5";

  const decorClass = sidebar
    ? "h-16 w-20"
    : compact
      ? "h-14 w-16"
      : "h-20 w-24 sm:h-24 sm:w-28";

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-[#06adc6]/40 bg-[#06adc6]/10 w-full ${shellClass}`}>
      <div
        className={`pointer-events-none absolute bottom-0 right-0 rounded-tl-[85%] bg-[#06adc6]/25 ${decorClass}`}
        aria-hidden
      />
      <div
        className={
          sidebar
            ? "relative z-10 pr-2"
            : `relative flex items-center justify-between ${compact ? "gap-2" : "gap-3 sm:gap-5"}`
        }>
        <div className={sidebar ? "w-full" : "min-w-0 flex-1"}>
          <div className="flex items-center gap-2">
            <Headphones
              className={`shrink-0 text-[#134e97] ${sidebar || !compact ? "h-5 w-5" : "h-4 w-4"}`}
              strokeWidth={2}
            />
            <h4
              className={`font-bold text-[#134e97] leading-none ${
                sidebar ? "text-base" : compact ? "text-sm" : "text-base sm:text-lg"
              }`}>
              Need Help?
            </h4>
          </div>
          <p
            className={`font-medium text-[#134e97]/70 ${
              sidebar ? "mt-1.5 text-sm" : compact ? "mt-1 text-xs" : "mt-1.5 text-sm"
            }`}>
            We&apos;re here for you
          </p>
          <div
            className={`${
              sidebar ? "mt-3 space-y-2.5 text-sm" : compact ? "mt-2 space-y-1.5 text-xs" : "mt-3 space-y-2 text-sm"
            }`}>
            <a
              href="tel:08042070577"
              className="flex items-center gap-2.5 text-[#134e97] hover:text-[#06adc6] transition-colors">
              <Phone className="h-4 w-4 shrink-0 text-[#134e97]" strokeWidth={2} />
              <span>+91 9148080000</span>
            </a>
            <a
              href="mailto:callcenter@brains.org.in"
              className="flex items-start gap-2.5 text-[#134e97] hover:text-[#06adc6] transition-colors">
              <Mail className="h-4 w-4 shrink-0 text-[#134e97] mt-0.5" strokeWidth={2} />
              <span className="break-words leading-snug">callcenter@brains.org.in</span>
            </a>
          </div>
        </div>
        {!sidebar && <SupportBubblesArt compact={compact} />}
      </div>
    </div>
  );
}

/* === Top Doctors carousel === */
function TopDoctorsCarousel({ compact = false }) {
  const [doctors, setDoctors] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    const url = `${BACKEND}/api/patient/doctors?limit=8`;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = await safeJson(res);
        const arr =
          json?.data?.doctors ??
          json?.data ??
          json?.doctors ??
          (Array.isArray(json) ? json : []);
        setDoctors(Array.isArray(arr) ? arr : []);
      } catch (e) {
        setError(e?.message || "Failed to load doctors");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!doctors.length) return;
    timerRef.current = setInterval(
      () => setIndex((i) => (i + 1) % doctors.length),
      4000
    );
    return () => clearInterval(timerRef.current);
  }, [doctors]);

  if (loading)
    return (
      <div className="rounded-xl border border-[#06adc6]/25 bg-white p-6 text-center animate-pulse text-[#134e97]/60">
        Loading?
      </div>
    );
  if (error)
    return (
      <div className="rounded-xl border border-[#134e97]/25 bg-[#134e97]/5 p-4 text-center text-[#134e97]">
        {error}
      </div>
    );
  if (!doctors.length)
    return (
      <div className="rounded-xl border border-[#06adc6]/25 bg-white p-6 text-center text-[#134e97]/60">
        No top doctors found.
      </div>
    );

  const d = doctors[index];
  return (
    <div className="text-center">
      <h4 className={`font-semibold text-[#134e97] ${compact ? "text-sm mb-2" : "text-base sm:text-lg mb-4"}`}>
        Our Top Doctors
      </h4>
      <button
        type="button"
        onClick={() => navigate(`/doctor/detail/${d._id}`)}
        className={`group w-full flex flex-col items-center focus:outline-none ${compact ? "gap-1.5" : "gap-3"}`}>
        <div
          className={`rounded-full overflow-hidden border-[#06adc6]/30 shadow-sm ${
            compact ? "w-20 h-20 border-2" : "w-32 h-32 border-4"
          }`}>
          <img
            src={getImageUrl(d.profileImage, d.name)}
            alt={d.name}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="px-2 max-w-[220px] truncate">
          <div className={`font-semibold text-[#134e97] truncate ${compact ? "text-sm" : "text-sm sm:text-lg"}`}>
            Dr. {d.name}
          </div>
          <div className={`text-[#134e97]/55 truncate ${compact ? "text-xs" : "text-xs sm:text-sm"}`}>
            {d.specialization || "General Practitioner"}
          </div>
        </div>
      </button>
      <div className={`flex items-center justify-center gap-1.5 ${compact ? "mt-2" : "mt-4 gap-2"}`}>
        {doctors.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            className={`rounded-full ${compact ? "w-2 h-2" : "w-2.5 h-2.5"} ${
              i === index ? "bg-[#134e97]" : "bg-[#06adc6]/35"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/* === Helper: show reschedule limit Swal === */
function showRescheduleLimitSwal(currentCount, limit) {
  return Swal.fire({
    icon: "info",
    title: "Reschedule Limit Reached",
    html: `You have reached the maximum allowed (${limit}) reschedules.
    Please contact the support team / receptionist for further changes.
    <div style="margin-top:10px; font-size:0.9em; color:#134e97;">
        Call: <strong>+91 9148080000</strong><br/>
        Email: <strong>callcenter@brains.org.in</strong>
      </div>`,
    showCloseButton: true,
    showCancelButton: false,
    confirmButtonText: "OK",
    confirmButtonColor: BRAND_DARK,
    width: 520,
  });
}

/* === Main component === */
export default function PatientDashboard() {
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser] = useState(() => mapStoredToDashboardUser(parseStoredUser()));
  const [loading, setLoading] = useState(() => !mapStoredToDashboardUser(parseStoredUser()));
  const [profileError, setProfileError] = useState(null);
  const [profileReloadKey, setProfileReloadKey] = useState(0);

  const [upcoming, setUpcoming] = useState([]);
  const [upcomingTotal, setUpcomingTotal] = useState(0);
  const [recent, setRecent] = useState([]);

  const [listsLoading, setListsLoading] = useState(true);
  const [listsError, setListsError] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);

  const loadProfile = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login", { replace: true });
      return false;
    }

    const cached = mapStoredToDashboardUser(parseStoredUser());
    if (cached) setUser(cached);

    // Avoid full-screen loader flicker when cached profile data already exists.
    // In that case, keep current UI visible and refresh in the background.
    setLoading(!cached);
    setProfileError(null);

    const candidates = [
      `${BACKEND}/api/patient/me`,
      `${BACKEND}/api/auth/me`,
      `${BACKEND}/api/auth/verify`,
    ];
    let me = null;
    let lastErr = null;

    for (const url of candidates) {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          navigate("/login", { replace: true });
          return false;
        }
        if (!res.ok) continue;
        const json = await safeJson(res);
        me =
          json?.data ||
          json?.user ||
          (json?.success && json?.user ? json.user : null) ||
          null;
        if (me && typeof me === "object" && (me._id || me.id || me.email || me.name)) {
          break;
        }
        me = null;
      } catch (e) {
        lastErr = e;
      }
    }

    if (!me) {
      const msg =
        lastErr?.message || "Could not load your profile. Please try again.";
      setProfileError(msg);
      if (!cached) setUser(null);
      setLoading(false);
      return false;
    }

    setUser(mapApiToDashboardUser(me));
    try {
      persistPatientUser(me);
    } catch {
      /* ignore storage errors */
    }
    setLoading(false);
    return true;
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadProfile();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadProfile, location.pathname, location.key, profileReloadKey]);

  useEffect(() => {
    const onPageShow = (e) => {
      if (e.persisted) {
        setProfileReloadKey((k) => k + 1);
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    const syncFromStorage = () => {
      const stored = parseStoredUser();
      if (!stored) return;
      setUser((u) =>
        u
          ? {
              ...u,
              name: stored.name ?? u.name,
              profileImage: stored.profileImage ?? u.profileImage,
            }
          : u
      );
    };
    window.addEventListener(USER_STORAGE_UPDATED, syncFromStorage);
    return () => window.removeEventListener(USER_STORAGE_UPDATED, syncFromStorage);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || loading) return;

    (async () => {
      setListsLoading(true);
      setListsError(null);

      const apptEndpoints = [
        `${BACKEND}/api/patient/appointments?limit=50`,
        `${BACKEND}/api/appointment/patient?limit=50`,
        `${BACKEND}/api/appointment?scope=patient&limit=50`,
        `${BACKEND}/api/appointments?limit=50`,
      ];
      let apptsRaw = null;
      for (const url of apptEndpoints) {
        try {
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) continue;
          const json = await safeJson(res);
          apptsRaw =
            json?.data?.appointments ??
            json?.data ??
            json?.appointments ??
            (Array.isArray(json) ? json : null);
          if (apptsRaw) break;
        } catch (e) { }
      }
      if (!apptsRaw) apptsRaw = [];

      apptsRaw = await enrichAppointmentsWithDoctorNames(apptsRaw, token);

      // Map appointments while preserving raw/original and extracting symptoms defensively
      const appts = (apptsRaw || []).map((a) => {
        const status = (a.status || a.state || "").toString();
        const dateRaw =
          a.date || a.appointmentDate || a.startsAt || a.start || null;
        const slotStart =
          a.slotStartIso || a.startTime || a.slot?.start || null;
        const slotEnd = a.slotEndIso || a.endTime || a.slot?.end || null;

        const time =
          a.time ||
          a.appointmentTime ||
          (slotStart && slotEnd
            ? `${new Date(slotStart).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })} - ${new Date(slotEnd).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}`
            : "");

        const doc = resolveDoctorName(a);

        const spec =
          a.assignedDoctorSpecialization ||
          a.newDoctorSpecialization ||
          a.doctorId?.specialization ||
          a.doctor?.specialization ||
          "";

        const parsedDate = slotStart
          ? new Date(slotStart)
          : dateRaw
            ? new Date(dateRaw)
            : null;
        const dateDisplay = parsedDate
          ? parsedDate.toLocaleDateString(undefined, {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
          : null;

        // Symptoms: check multiple possible backend keys
        const symptoms =
          a.symptoms ??
          a.symptom ??
          a.complaint ??
          a.notes ??
          a.reason ??
          a.description ??
          a.problemDescription ??
          null;

        return {
          _id: a._id || a.id || Math.random().toString(36).slice(2),
          doctorId:
            a.doctorId?._id || a.doctorId || a.doctor?._id || a.doctor || null,
          doctorName: doc,
          doctorSpecialization: spec,
          date: parsedDate ? parsedDate.toISOString() : null,
          dateObj: parsedDate,
          time:
            typeof time === "string" ? time : time?.start || time?.from || null,
          status: status || "unknown",
          slotStartIso: slotStart ? new Date(slotStart).toISOString() : null,
          slotEndIso: slotEnd ? new Date(slotEnd).toISOString() : null,
          original: a, // keep the full original object (so reschedule page can read any backend-only fields like symptoms)
          symptoms,
          dateDisplay,
        };
      });

      const activeStatuses = new Set([
        "scheduled",
        "in progress",
        "rescheduled",
        "reassigned",
      ]);

      const now = new Date();
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);

      const upcomingList = appts
        .filter((a) => {
          const s = String(a.status || "").toLowerCase();
          if (!activeStatuses.has(s)) return false;
          if (!a.dateObj) return false;
          return a.dateObj.getTime() >= startOfToday.getTime();
        })
        .sort((a, b) => getAppointmentStartMs(a) - getAppointmentStartMs(b));

      const recentStatuses = new Set([
        "completed",
        "cancelled",
        "no show",
        "noshow",
        "missed",
        "expired",
      ]);

      const recentList = appts
        .filter((a) => recentStatuses.has(String(a.status || "").toLowerCase()))
        .slice()
        .sort((a, b) => {
          const aKey = a.original?.slotStartIso
            ? new Date(a.original.slotStartIso).getTime()
            : a.dateObj
              ? a.dateObj.getTime()
              : 0;
          const bKey = b.original?.slotStartIso
            ? new Date(b.original.slotStartIso).getTime()
            : b.dateObj
              ? b.dateObj.getTime()
              : 0;
          return bKey - aKey;
        })
        .slice(0, 4);

      setUpcomingTotal(upcomingList.length);
      setUpcoming(upcomingList.slice(0, UPCOMING_DASHBOARD_LIMIT));
      setRecent(recentList.slice(0, 4));
      setListsLoading(false);
    })().catch((e) => {
      console.error(e);
      setListsError(e?.message || "Failed to load lists");
      setListsLoading(false);
    });
  }, [navigate, loading, profileReloadKey, user?.id]);

  const handleLogout = () => {
    performLogout();
  };

  function handleReschedule(appt) {
    const doctorId = appt.doctorId || appt.doctorId?._id || null;
    if (!doctorId) {
      setListsError("Doctor information is not available for rescheduling.");
      return;
    }
    const payload = appt.original || appt;
    navigate(`/doctor/${doctorId}`, {
      state: { rescheduleAppointment: payload },
    });
  }

  const firstName = useMemo(
    () =>
      user?.name && typeof user.name === "string"
        ? user.name.split(" ")[0]
        : "there",
    [user?.name]
  );

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-white via-[#06adc6]/8 to-[#06adc6]/18">
        <Header />
        <div className="flex flex-1 items-center justify-center text-[#134e97]/60">
          Loading…
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-white via-[#06adc6]/8 to-[#06adc6]/18">
        <Header />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center">
          <p className="max-w-md text-sm text-[#134e97]">
            {profileError || "Could not load your dashboard. This can happen after using hospital menu links."}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setProfileReloadKey((k) => k + 1)}
              className={`rounded-full px-5 py-2.5 text-sm font-medium shadow-sm ${BTN_PRIMARY}`}>
              Try again
            </button>
            <Link
              to="/patient/DoctorListPage"
              className="rounded-full border border-[#134e97]/30 px-5 py-2.5 text-sm font-medium text-[#134e97] hover:bg-[#134e97]/5">
              Back to doctors
            </Link>
          </div>
        </main>
      </div>
    );
  }

  async function handleCancel(apptId) {
    const isPatient =
      (user?.role || "patient").toString().toLowerCase() === "patient";
    const cancelLimit = 3; // updated to 3
    const currentCancelCount = Number(user?.cancelCount || 0);

    if (isPatient && currentCancelCount >= cancelLimit) {
      await Swal.fire({
        icon: "info",
        title: "Cancellation Limit Reached",
        html: `You have reached the maximum allowed (${cancelLimit}) cancellations.
      Please contact the support team/receptionist for further assistance.
      <div style="margin-top:10px; font-size:0.9em; color:#134e97;">
        Call: <strong>+91 9148080000</strong><br/>
        Email: <strong>callcenter@brains.org.in</strong>
      </div>
    `,
        showCloseButton: true,
        showCancelButton: false,
        confirmButtonText: "OK",
        confirmButtonColor: BRAND_DARK,
        width: 520,
      });
      return;
    }

    // Fixed list of cancellation reasons (key -> label)
    const cancelReasons = {
      feeling_better: "Feeling better",
      schedule_conflict: "Scheduling conflict",
      unable_to_visit: "Unable to visit clinic today",
      found_alternative: "Found another time/doctor",
      others: "Others",
    };

    const { value: reasonKey, isDismissed } = await Swal.fire({
      title: "Why are you cancelling?",
      html: `
    <style>
      .reason-pill-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-top: 0.5rem;
      }
      .reason-option input[type="radio"] {
        display: none;
      }
      .reason-option label {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
        padding: 0.55rem 0.9rem;
        border-radius: 9999px;
        border: 1px solid rgba(6, 173, 198, 0.35);
        background: #ffffff;
        cursor: pointer;
        font-size: 0.875rem;
        transition: all 0.15s ease;
      }
      .reason-option label:hover {
        border-color: #06adc6;
        background: rgba(6, 173, 198, 0.1);
      }
      .reason-option input[type="radio"]:checked + label {
        border-color: #013473;
        background: #013473;
        color: #ffffff;
        box-shadow: 0 0 0 2px rgba(1, 52, 115, 0.25);
      }
      .reason-dot {
        width: 10px;
        height: 10px;
        border-radius: 9999px;
        border: 2px solid currentColor;
        margin-top: 4px;
      }
      .reason-option-title {
        font-weight: 600;
      }

      /* ?? ROUND SWEETALERT BUTTONS */
      .swal2-confirm,
      .swal2-cancel {
        border-radius: 9999px !important;
        padding: 10px 22px !important;
        font-size: 0.9rem !important;
        font-weight: 600 !important;
      }
      .swal2-confirm {
        background-color: #013473 !important;
        color: #ffffff !important;
        border: none !important;
      }
      .swal2-confirm:hover {
        background-color: #011f41 !important;
      }
      .swal2-cancel {
        background-color: #ffffff !important;
        color: #134e97 !important;
        border: 1px solid rgba(19, 78, 151, 0.3) !important;
      }
      .swal2-cancel:hover {
        background-color: rgba(6, 173, 198, 0.08) !important;
      }
    </style>

    <div class="text-left">
      <p class="text-sm mb-2" style="color:#134e97; opacity:0.75;">
        Please select a reason for cancelling your appointment.
      </p>

      <div class="reason-pill-group">

        <div class="reason-option">
          <input type="radio" id="reason_feeling_better" name="cancel_reason" value="feeling_better" />
          <label for="reason_feeling_better">
            <span class="reason-dot"></span>
            <div><div class="reason-option-title">Feeling better</div></div>
          </label>
        </div>

        <div class="reason-option">
          <input type="radio" id="reason_schedule_conflict" name="cancel_reason" value="schedule_conflict" />
          <label for="reason_schedule_conflict">
            <span class="reason-dot"></span>
            <div><div class="reason-option-title">Scheduling conflict</div></div>
          </label>
        </div>

        <div class="reason-option">
          <input type="radio" id="reason_unable_to_visit" name="cancel_reason" value="unable_to_visit" />
          <label for="reason_unable_to_visit">
            <span class="reason-dot"></span>
            <div><div class="reason-option-title">Unable to visit today</div></div>
          </label>
        </div>

        <div class="reason-option">
          <input type="radio" id="reason_found_alternative" name="cancel_reason" value="found_alternative" />
          <label for="reason_found_alternative">
            <span class="reason-dot"></span>
            <div><div class="reason-option-title">Found another time/doctor</div></div>
          </label>
        </div>



        <div class="reason-option">
          <input type="radio" id="reason_others" name="cancel_reason" value="others" />
          <label for="reason_others">
            <span class="reason-dot"></span>
            <div><div class="reason-option-title">Others</div></div>
          </label>
        </div>

      </div>
    </div>
  `,
      showCancelButton: true,
      confirmButtonText: "Continue",
      cancelButtonText: "Cancel",
      focusConfirm: false,
      width: 520,
      customClass: {
        popup: "rounded-2xl shadow-xl",
      },

      preConfirm: () => {
        const selected = document.querySelector(
          'input[name="cancel_reason"]:checked'
        );
        if (!selected) {
          Swal.showValidationMessage("Please select a reason to continue.");
          return false;
        }
        return selected.value;
      },
    });

    if (isDismissed || !reasonKey) return;
    const reason = cancelReasons[reasonKey] || reasonKey;

    const confirm = await Swal.fire({
      title: "Confirm cancellation",
      text: "Are you sure you want to cancel this appointment?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, cancel it",
      cancelButtonText: "No, keep it",
      width: 480,

      html: `
    <style>
      /* Rounded SweetAlert Buttons */
      .swal2-confirm,
      .swal2-cancel {
        border-radius: 9999px !important;
        padding: 10px 22px !important;
        font-size: 0.9rem !important;
        font-weight: 600 !important;
      }

      .swal2-confirm {
        background-color: #013473 !important;
        color: white !important;
        border: none !important;
      }
      .swal2-confirm:hover {
        background-color: #011f41 !important;
      }

      .swal2-cancel {
        background-color: #ffffff !important;
        color: #134e97 !important;
        border: 1px solid rgba(19, 78, 151, 0.3) !important;
      }
      .swal2-cancel:hover {
        background-color: rgba(6, 173, 198, 0.08) !important;
      }
    </style>
  `,

      customClass: {
        popup: "rounded-xl shadow-lg",
      },
    });


    if (!confirm.isConfirmed) return;

    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${BACKEND}/api/appointment/cancel/${apptId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason }),
      });
      const json = await safeJson(res);

      // If backend blocked due to limit, surface message
      if (!res.ok) {
        const msg = json?.message || "Failed to cancel";
        throw new Error(msg);
      }

      // remove from upcoming list
      setUpcoming((u) => u.filter((a) => a._id !== apptId));
      setUpcomingTotal((n) => Math.max(0, n - 1));
      const returned = json.data || null;
      const recentItem = returned
        ? {
          ...(returned.appointment || returned),
          _id: returned.appointment?._id || apptId,
        }
        : { _id: apptId };
      setRecent((r) => [recentItem, ...r].slice(0, 4));

      // update cancel count on user state & localStorage if backend returned it
      const patientCancelCount =
        json?.data?.patientCancelCount ??
        json?.data?.appointment?.patientId?.cancelCount ??
        null;

      if (patientCancelCount !== null) {
        setUser((u) => ({
          ...(u || {}),
          cancelCount: Number(patientCancelCount),
        }));
        try {
          const stored = JSON.parse(localStorage.getItem("user") || "{}");
          stored.cancelCount = Number(patientCancelCount);
          localStorage.setItem("user", JSON.stringify(stored));
        } catch (e) {
          /* ignore */
        }
      }

      setActionMsg("Appointment cancelled successfully.");
      setTimeout(() => setActionMsg(null), 4000);

      await Swal.fire({
        icon: "success",
        title: "Cancelled",
        text: "Appointment cancelled successfully.",
        timer: 1800,
        showConfirmButton: false,
      });
    } catch (e) {
      // If backend responded with informative message (e.g. reached limit), show it.
      await Swal.fire({
        icon: "error",
        title: "Unable to cancel",
        text: e?.message || "Cancel failed",
      });
    }
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-b from-white via-[#06adc6]/8 to-[#06adc6]/18 flex flex-col">
      <Header />
      <main className="w-full max-w-7xl mx-auto px-4 sm:px-5 md:px-6 xl:px-8 py-4 sm:py-5 md:py-6 flex flex-col gap-4 sm:gap-5 md:gap-6 box-border">

        {/* Row 1: welcome + profile ? side by side from tablet (md) up */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-5 xl:gap-6 items-stretch">
          <div className="md:col-span-7 xl:col-span-8 min-w-0">
            <WelcomeBanner firstName={firstName} />
          </div>
          <div className="md:col-span-5 xl:col-span-4 min-w-0">
            <PatientProfileCard user={user} onLogout={handleLogout} className="h-full mb-0" />
          </div>
        </div>

        {/* Row 2: appointments + sidebar (sidebar from xl / large desktop) */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-5 xl:gap-6 items-start">
        <section className="xl:col-span-8 flex flex-col gap-4 sm:gap-5 md:gap-6 min-w-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 xl:gap-6 items-stretch">
            {/* UPCOMING */}
            <div className="rounded-2xl border border-[#06adc6]/25 bg-white p-4 sm:p-5 shadow-sm h-full flex flex-col min-w-0">
              <AppointmentsSectionHeader
                icon={CalendarIcon}
                iconWrapClass="bg-[#06adc6]/15"
                iconClass="text-[#134e97]"
                title="Upcoming Appointments"
                subtitle={
                  upcomingTotal === 0
                    ? "You have no upcoming appointments"
                    : upcomingTotal > UPCOMING_DASHBOARD_LIMIT
                      ? `Showing next ${UPCOMING_DASHBOARD_LIMIT} of ${upcomingTotal} upcoming appointments`
                      : `You have ${upcomingTotal} upcoming appointment${upcomingTotal === 1 ? "" : "s"}`
                }
                viewAllTo="/patient/appointments"
                showViewAll={upcomingTotal > UPCOMING_DASHBOARD_LIMIT}
              />

              {listsLoading ? (
                <div className="py-10 text-center text-[#134e97]/60 text-sm">Loading?</div>
              ) : upcomingTotal === 0 ? (
                <UpcomingEmptyState />
              ) : (
                <ul className="divide-y divide-[#06adc6]/15 rounded-2xl border border-[#06adc6]/20 bg-[#06adc6]/5 overflow-hidden">
                  {upcoming.map((a) => {
                    const timeDisplay = a.original?.slotStartIso
                      ? new Date(a.original.slotStartIso).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : a.time || "";
                    const dateDisplay = a.dateDisplay || "?";
                    const currentRescheduleCount = Number(a.original?.rescheduleCount || 0);
                    const rescheduleLimit = 3;
                    const isPatient =
                      (user?.role || "patient").toString().toLowerCase() === "patient";
                    const exhausted = isPatient && currentRescheduleCount >= rescheduleLimit;
                    const cancelLimit = 3;
                    const storedUser = (() => {
                      try {
                        return JSON.parse(localStorage.getItem("user") || "{}");
                      } catch {
                        return {};
                      }
                    })();
                    const currentCancelCount = Number(
                      user?.cancelCount ?? storedUser?.cancelCount ?? 0
                    );
                    const cancelExceeded = isPatient && currentCancelCount >= cancelLimit;

                    const isRescheduled =
                      String(a.status || "").toLowerCase().includes("resched") ||
                      currentRescheduleCount > 0;

                    return (
                      <li
                        key={a._id}
                        className={`p-4 first:rounded-t-2xl last:rounded-b-2xl ${upcomingRowClass()}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-[#134e97] truncate">
                              {appointmentTitle(a)}
                            </div>
                            <div className="text-xs text-[#134e97]/55 mt-0.5">
                              {formatDoctorLabel(a.doctorName)}
                            </div>
                            <div className="text-xs text-[#134e97]/45 mt-0.5">
                              {dateDisplay}
                              {timeDisplay ? ` · ${timeDisplay}` : ""}
                            </div>
                            {isRescheduled && (
                              <p className="mt-1.5 text-[11px] font-medium text-amber-800">
                                This appointment was rescheduled
                              </p>
                            )}
                          </div>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${badgeClass(a.status)}`}>
                            {a.status}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3">
                          <button
                            type="button"
                            onClick={() => {
                              if (exhausted) {
                                showRescheduleLimitSwal(
                                  currentRescheduleCount,
                                  rescheduleLimit,
                                  a._id
                                );
                                return;
                              }
                              handleReschedule(a);
                            }}
                            className={`px-3 py-1 text-xs rounded-full font-medium ${
                              exhausted
                                ? "bg-[#134e97]/10 text-[#134e97] ring-1 ring-[#134e97]/25"
                                : "bg-[#134e97] text-white ring-1 ring-[#134e97] hover:bg-[#0f3d75]"
                            }`}>
                            Reschedule
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (cancelExceeded) {
                                Swal.fire({
                                  icon: "info",
                                  title: "Cancellation Limit Reached",
                                  html: `You have reached the maximum allowed (${cancelLimit}) cancellations.`,
                                  confirmButtonText: "OK",
                                });
                                return;
                              }
                              handleCancel(a._id);
                            }}
                            className="px-3 py-1 text-xs rounded-full font-medium bg-white ring-1 ring-[#134e97]/30 text-[#134e97] hover:bg-[#134e97]/5">
                            Cancel
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* RECENT */}
            <div className="rounded-2xl border border-[#06adc6]/25 bg-white p-4 sm:p-5 shadow-sm h-full flex flex-col min-w-0">
              <AppointmentsSectionHeader
                icon={CalendarIcon}
                iconWrapClass="bg-[#06adc6]/15"
                iconClass="text-[#134e97]"
                title="Recent Appointments"
                subtitle="Latest 4 recent appointments"
                viewAllTo="/patient/appointments?filter=recent"
              />

              {listsLoading ? (
                <div className="py-10 text-center text-[#134e97]/60 text-sm">Loading?</div>
              ) : recent.length === 0 ? (
                <RecentEmptyState />
              ) : (
                <ul className="divide-y divide-[#06adc6]/15">
                  {recent.map((a) => {
                    const timeDisplay = a.original?.slotStartIso
                      ? new Date(a.original.slotStartIso).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : a.time || "";
                    const dateDisplay = a.dateDisplay || "?";
                    const { bg, color, Icon } = getRecentAppointmentIcon(a);

                    return (
                      <li key={a._id}>
                        <Link
                          to="/patient/appointments?filter=recent"
                          className="flex items-center gap-3 py-3.5 group hover:bg-[#06adc6]/8 -mx-1 px-1 rounded-xl transition">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${bg}`}>
                            <Icon className={`w-4 h-4 ${color}`} strokeWidth={2} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-[#134e97] truncate">
                              {appointmentTitle(a)}
                            </div>
                            <div className="text-xs text-[#134e97]/55 truncate">
                              {formatDoctorLabel(a.doctorName)}
                            </div>
                            <div className="sm:hidden text-xs text-[#134e97]/45 mt-0.5">
                              {dateDisplay}
                              {timeDisplay ? `, ${timeDisplay}` : ""}
                            </div>
                          </div>
                          <div className="hidden sm:block text-xs text-[#134e97]/55 whitespace-nowrap shrink-0">
                            {dateDisplay}
                            {timeDisplay ? `, ${timeDisplay}` : ""}
                          </div>
                          <ChevronRight className="w-4 h-4 text-[#134e97]/40 group-hover:text-[#06adc6] shrink-0" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Tablet / iPad: Top Doctors + Need Help (below appointments until xl sidebar) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 xl:hidden">
            <div className="rounded-2xl border border-[#06adc6]/25 bg-white p-4 sm:p-5 shadow-sm min-w-0">
              <TopDoctorsCarousel compact />
            </div>
            <div className="min-w-0">
              <NeedHelpCard compact />
            </div>
          </div>

          {listsError && (
            <div className="mt-6 p-3 rounded-xl bg-[#134e97]/5 text-[#134e97] border border-[#134e97]/20">
              {listsError}
            </div>
          )}

          {actionMsg && (
            <div className="mt-4 p-3 rounded-xl bg-[#06adc6]/15 text-[#134e97] border border-[#06adc6]/35">
              {actionMsg}
            </div>
          )}
        </section>

        {/* RIGHT RAIL ? large desktop / iPad landscape wide only */}
        <aside className="hidden xl:flex xl:col-span-4 flex-col gap-3 min-w-0">
          <div className="rounded-2xl border border-[#06adc6]/25 bg-white p-4 shadow-sm shrink-0">
            <TopDoctorsCarousel compact />
          </div>
          <NeedHelpCard sidebar />
        </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}
