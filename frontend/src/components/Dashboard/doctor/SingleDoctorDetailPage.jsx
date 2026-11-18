import Footer from "@/components/HomePage/Footer";
import Header from "@/components/HomePage/Header";
import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  Briefcase,
  Clock,
  GraduationCap,
  Calendar,
  CalendarDays,
  FileText,
  UserRound,
  ChevronRight,
  ChevronDown,
  ShieldCheck,
  Star,
  Users,
} from "lucide-react";
import { getImageUrl } from "@/utils/imageUrl";
import { DOCTOR_PUBLIC_PAGE_CONTAINER } from "@/config/doctorPublicPageLayout";
import "./SingleDoctorDetailPage.css";

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

function EmptyValue() {
  return <span className="text-sm text-slate-400 italic font-body">Not provided</span>;
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

function formatTimeToAMPM(time) {
  if (!time) return "";
  const [h, m] = time.split(":");
  let hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${m || "00"} ${ampm}`;
}

/** Split doctor bio into readable paragraphs (newlines, then sentences). */
function splitAboutParagraphs(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];

  const byBlankLine = raw
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (byBlankLine.length > 1) return byBlankLine;

  const byLine = raw
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (byLine.length > 1) return byLine;

  const sentences =
    raw.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  if (sentences.length > 1) return sentences;

  return [raw];
}

function DetailPageSkeleton() {
  return (
    <div className={`${DOCTOR_PUBLIC_PAGE_CONTAINER} py-8 lg:py-12 animate-pulse`}>
      <div className="h-9 w-24 rounded-xl bg-slate-200/80 mb-6" />
      <div className="rounded-[32px] border border-slate-200 bg-white p-6 sm:p-8 md:p-10 shadow-sm flex flex-col lg:flex-row gap-8">
        <div className="flex-1 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="h-28 rounded-2xl bg-slate-200" />
            <div className="h-28 rounded-2xl bg-slate-200" />
          </div>
          <div className="h-28 rounded-2xl bg-slate-200" />
          <div className="h-64 rounded-2xl bg-slate-200" />
        </div>
        <div className="w-full lg:w-85 space-y-6">
          <div className="h-80 rounded-2xl bg-slate-200" />
          <div className="h-44 rounded-2xl bg-slate-200" />
        </div>
      </div>
    </div>
  );
}

export default function DoctorDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [doctor, setDoctor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);
  const [aboutExpanded, setAboutExpanded] = useState(false);

  useEffect(() => {
    setAboutExpanded(false);
  }, [id]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${BACKEND}/api/patient/doctors/${id}`);
        const json = await res.json();
        if (!res.ok) {
          setDoctor(null);
          return;
        }
        const doc = json?.data ?? json;
        if (doc && !doc.message) setDoctor(doc);
        else setDoctor(null);
      } catch {
        setDoctor(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#eef3f8]">
        <Header />
        <DetailPageSkeleton />
        <Footer />
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="min-h-screen flex flex-col bg-[#eef3f8]">
        <Header />
        <div className="flex-1 flex items-center justify-center text-[#64748B] font-medium font-body">Doctor not found</div>
        <Footer />
      </div>
    );
  }

  const portrait = getImageUrl(doctor.profileImage, doctor.name);
  const showPhoto = hasRealDoctorPhoto(doctor.profileImage);
  const initials = doctorInitials(doctor.name);
  const excluded = doctor.availabilityRange?.excludedWeekdays || [];
  const availableDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !excluded.includes(d));
  const activeDay = selectedDay !== null && availableDays.includes(selectedDay) ? selectedDay : (availableDays[0] ?? null);
  const isCustomMode = doctor.availabilityMode === "custom";
  const daily = (doctor.dailyTimeRanges || []).filter((slot) => {
    if (isCustomMode && activeDay !== null) {
      return slot.day === activeDay;
    }
    return true; // default mode applies to all days
  });
  const consultationMinutes =
    doctor.appointmentDuration ?? doctor.slotDurationMinutes ?? null;
  const weekdays = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const aboutText =
    doctor.about || doctor.bio || "Experienced doctor providing patient-centered care.";
  const aboutParagraphs = splitAboutParagraphs(aboutText);
  const hasMoreAbout = aboutParagraphs.length > 1;
  const visibleAboutParagraphs = aboutExpanded
    ? aboutParagraphs
    : aboutParagraphs.slice(0, 1);

  return (
    <div className="min-h-screen flex flex-col bg-[#eef3f8] font-body text-slate-800">
      <Header />

      <div className={`${DOCTOR_PUBLIC_PAGE_CONTAINER} py-6 sm:py-8 lg:py-12 sm:-mt-5`}>
        <div className="doctor-detail-shell bg-white rounded-[32px] border border-slate-200/80 p-4 sm:p-8 md:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.025)] w-full max-w-full box-border overflow-x-hidden">

          {/* Back Button — hidden on mobile (use browser / header nav) */}
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="group hidden sm:flex items-center gap-3 text-sm font-bold text-[#002e62] hover:opacity-85 transition-opacity mb-0 sm:mb-8 cursor-pointer font-body sm:-mt-5"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-[0_4px_12px_rgba(0,0,0,0.06)] border border-slate-200/80 text-[#008cc9] transition-transform duration-500 group-hover:-rotate-[360deg]">
              <ArrowLeft className="h-4 w-4" strokeWidth={3} />
            </span>
            Back
          </button>

          {/* 2-Column Grid */}
          <div className="doctor-detail-grid grid w-full max-w-full grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-8 items-start min-w-0">

            {/* Stats Column: Experience, Consultation & Qualification */}
            <div className="doctor-detail-grid__stats lg:col-span-8 flex w-full max-w-full min-w-0 flex-col gap-5 sm:gap-6 doctor-detail-animate doctor-detail-animate--2">

              {/* Row 1: Experience & Consultation Stats */}
              <div className="grid w-full max-w-full grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">

                {/* Experience Card */}
                <div className="doctor-detail-stat-card group relative w-full max-w-full min-w-0 overflow-hidden rounded-[24px] bg-gradient-to-br from-white via-[#edf4fc] to-[#d2e4f7] border border-[#134e97]/15 p-4 sm:p-6 shadow-[0_8px_30px_rgba(0,32,71,0.02)] flex gap-4 sm:gap-5 transition-all duration-300 sm:hover:-translate-y-2 hover:border-[#134e97] hover:shadow-[0_20px_40px_rgba(0,140,201,0.12)] cursor-pointer box-border">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] bg-white border border-slate-200 shadow-[0_6px_16px_rgba(0,0,0,0.04)] group-hover:scale-105 group-hover:shadow-[0_6px_20px_rgba(0,140,201,0.1)] transition-all duration-300">
                    <Briefcase className="h-6 w-6 text-[#002e62] group-hover:text-[#008cc9] transition-colors duration-300" strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0 pt-1">
                    <span className="text-xs font-semibold text-slate-400 tracking-wider block font-body">Experience</span>
                    <span className="text-[20px] font-extrabold text-[#002e62] mt-0.5 block leading-tight font-body group-hover:text-[#008cc9] transition-colors duration-300">
                      {doctor.experience != null && doctor.experience !== "" ? `${doctor.experience} yrs` : "N/A"}
                    </span>
                    <span className="text-xs text-slate-400 font-semibold mt-1 block font-body">of Expertise</span>
                  </div>
                </div>

                {/* Consultation Card */}
                <div className="doctor-detail-stat-card group relative w-full max-w-full min-w-0 overflow-hidden rounded-[24px] bg-gradient-to-br from-white via-[#edf4fc] to-[#d2e4f7] border border-[#134e97]/15 p-4 sm:p-6 shadow-[0_8px_30px_rgba(0,32,71,0.02)] flex gap-4 sm:gap-5 transition-all duration-300 sm:hover:-translate-y-2 hover:border-[#134e97] hover:shadow-[0_20px_40px_rgba(0,140,201,0.12)] cursor-pointer box-border">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] bg-white border border-slate-200 shadow-[0_6px_16px_rgba(0,0,0,0.04)] group-hover:scale-105 group-hover:shadow-[0_6px_20px_rgba(0,140,201,0.1)] transition-all duration-300">
                    <Clock className="h-6 w-6 text-[#002e62] group-hover:text-[#008cc9] transition-colors duration-300" strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0 pt-1">
                    <span className="text-xs font-semibold text-slate-400 tracking-wider block font-body">Consultation</span>
                    <span className="text-[20px] font-extrabold text-[#002e62] mt-0.5 block leading-tight font-body group-hover:text-[#008cc9] transition-colors duration-300">
                      {consultationMinutes ? `${consultationMinutes} mins` : "30 mins"}
                    </span>
                    <span className="text-xs text-slate-400 font-semibold mt-1 block font-body">Session Duration</span>
                  </div>
                </div>

              </div>

              {/* Row 2: Qualification Card */}
              <div className="doctor-detail-stat-card group relative w-full max-w-full min-w-0 overflow-hidden rounded-[24px] bg-gradient-to-br from-white via-[#edf4fc] to-[#d2e4f7] border border-[#134e97]/15 p-4 sm:p-6 shadow-[0_8px_30px_rgba(0,32,71,0.02)] flex gap-4 sm:gap-5 transition-all duration-300 sm:hover:-translate-y-2 hover:border-[#134e97] hover:shadow-[0_20px_40px_rgba(0,140,201,0.12)] cursor-pointer box-border sm:-mt-2">
                {/* Certificate Background SVG watermark */}
                <svg
                  className="absolute bottom-0 right-0 h-28 w-36 text-[#002e62]/5 pointer-events-none group-hover:scale-103 group-hover:text-[#008cc9]/5 transition-all duration-300"
                  viewBox="0 0 100 70"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                >
                  <rect x="10" y="10" width="80" height="50" rx="3" />
                  <line x1="20" y1="20" x2="45" y2="20" />
                  <line x1="20" y1="28" x2="65" y2="28" />
                  <line x1="20" y1="36" x2="50" y2="36" />
                  <circle cx="75" cy="45" r="7" />
                  <path d="M72,50 L70,62 L75,58 L80,62 L78,50" />
                </svg>

                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] bg-white border border-slate-200 shadow-[0_6px_16px_rgba(0,0,0,0.04)] group-hover:scale-105 group-hover:shadow-[0_6px_20px_rgba(0,140,201,0.1)] transition-all duration-300">
                  <GraduationCap className="h-6 w-6 text-[#002e62] group-hover:text-[#008cc9] transition-colors duration-300" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <span className="text-xs font-semibold text-slate-400 tracking-wider block font-body">Qualification</span>
                  <span className="text-[20px] font-extrabold text-[#002e62] mt-0.5 block leading-tight font-body group-hover:text-[#008cc9] transition-colors duration-300">
                    {doctor.qualification || "MBBS"}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold mt-1 block font-body">Medical Graduate</span>
                </div>
              </div>

            </div>

            {/* Availability Column */}
            <div className="doctor-detail-grid__availability lg:col-span-8 flex w-full max-w-full min-w-0 flex-col doctor-detail-animate doctor-detail-animate--2">

              {/* Availability Panel Card */}
              <div className="doctor-availability-panel group relative w-full max-w-full min-w-0 overflow-hidden rounded-[24px] bg-gradient-to-br from-white via-[#edf4fc] to-[#d2e4f7] border border-[#134e97]/15 p-4 sm:p-6 shadow-[0_8px_30px_rgba(0,32,71,0.02)] transition-all duration-300 hover:border-[#134e97] hover:shadow-[0_16px_35px_rgba(0,140,201,0.08)] box-border">
                {/* Hospital Building Background SVG watermark */}
                <svg
                  className="doctor-availability-panel__watermark absolute bottom-0 right-0 h-36 w-36 text-[#002e62]/5 pointer-events-none group-hover:scale-105 group-hover:text-[#008cc9]/5 transition-all duration-300"
                  viewBox="0 0 100 100"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                >
                  {/* Hospital Building Outline */}
                  <path d="M20,90 L20,30 L40,30 L40,15 L60,15 L60,30 L80,30 L80,90 Z" />
                  {/* Windows */}
                  <rect x="28" y="40" width="6" height="8" rx="1" />
                  <rect x="28" y="55" width="6" height="8" rx="1" />
                  <rect x="28" y="70" width="6" height="8" rx="1" />
                  <rect x="66" y="40" width="6" height="8" rx="1" />
                  <rect x="66" y="55" width="6" height="8" rx="1" />
                  <rect x="66" y="70" width="6" height="8" rx="1" />
                  {/* Center Gate */}
                  <path d="M46,90 L46,75 L54,75 L54,90" />
                  {/* Medical Plus/Cross Sign on Top Tower */}
                  <path d="M50,22 L50,28 M47,25 L53,25" strokeWidth="2" strokeLinecap="round" />
                </svg>

                {/* Header Row */}
                <div className="doctor-availability-panel__header relative z-[1] flex gap-3 sm:gap-4 items-start sm:items-center min-w-0">
                  <div className="flex h-11 w-11 sm:h-16 sm:w-16 shrink-0 items-center justify-center rounded-[14px] sm:rounded-[20px] bg-white border border-slate-200 shadow-[0_6px_16px_rgba(0,0,0,0.04)] group-hover:scale-105 group-hover:shadow-[0_6px_20px_rgba(0,140,201,0.1)] transition-all duration-300">
                    <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-[#008cc9]" strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] sm:text-xs font-semibold text-slate-400 tracking-wider block font-body">Availability</span>
                    <span className="doctor-availability-panel__title text-[15px] sm:text-[20px] font-extrabold text-[#002e62] leading-snug font-body block">
                      Check doctor&apos;s available days
                    </span>
                  </div>
                </div>

                {/* Content area: full-width below header */}
                <div className="doctor-availability-panel__content relative z-[1] mt-4 sm:mt-5 min-w-0">
                  {/* Weekday pills — scroll on narrow mobile */}
                  {availableDays.length > 0 ? (
                    <div className="doctor-availability-panel__days" role="tablist" aria-label="Available weekdays">
                      {availableDays.map((d) => {
                        const isActive = d === activeDay;
                        return (
                          <button
                            key={d}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            onClick={() => setSelectedDay(d)}
                            className={`doctor-detail-day-pill shrink-0 px-3 sm:px-3.5 py-2 text-[11px] sm:text-xs font-bold rounded-full transition-all cursor-pointer font-body min-h-[2.5rem] ${isActive
                              ? "bg-[#008cc9] text-white shadow-md shadow-[#008cc9]/10"
                              : "border border-[#008cc9]/30 text-[#008cc9] bg-white hover:bg-slate-50 hover:border-[#008cc9]/60"
                              }`}
                          >
                            {weekdays[d]}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div><EmptyValue /></div>
                  )}

                  {/* Daily Time Slots */}
                  <p className="doctor-availability-panel__slots-label text-[10px] sm:text-[10px] font-extrabold uppercase tracking-widest text-[#002e62]/60 mt-5 sm:mt-6 mb-2.5 sm:mb-3 font-body">
                    Daily Time Slots
                  </p>
                  {daily.length ? (
                    <div className="doctor-availability-panel__slots space-y-2.5 sm:space-y-3">
                      {daily.map((slot, i) => (
                        <div
                          key={i}
                          className={`doctor-detail-slot doctor-availability-panel__slot flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 rounded-xl border border-l-4 ${
                            slot.isOnline
                              ? "border-l-purple-600 border-purple-200 bg-gradient-to-r from-purple-50/50 via-white to-indigo-50/30"
                              : "border-l-[#00a8e8] border-slate-200 bg-[#fbfdfd]"
                          } px-3.5 py-3 sm:px-6 sm:py-4 shadow-sm`}
                        >
                          <span className="flex items-center gap-2.5 sm:gap-3 text-[13px] sm:text-sm font-bold text-[#002e62] font-body min-w-0">
                            <Clock className={`h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem] ${slot.isOnline ? "text-purple-600" : "text-[#00a8e8]"} shrink-0`} strokeWidth={2.5} />
                            <span className="truncate">{slot.label || `Slot ${i + 1}`}</span>
                            {slot.isOnline && (
                              <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-bold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200 shrink-0">
                                💻 Online Meeting
                              </span>
                            )}
                          </span>
                          <span className={`flex items-center justify-between gap-2 text-[13px] sm:text-sm font-bold ${slot.isOnline ? "text-purple-700" : "text-[#008cc9]"} font-body w-full sm:w-auto border-t border-slate-100 pt-2 sm:border-t-0 sm:pt-0 shrink-0`}>
                            <span className="whitespace-nowrap">{formatTimeToAMPM(slot.start)} – {formatTimeToAMPM(slot.end)}</span>
                            <ChevronRight className={`h-4 w-4 ${slot.isOnline ? "text-purple-500" : "text-[#008cc9]/70"} shrink-0`} aria-hidden />
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-slate-400 italic font-body">No slots configured for this day</span>
                  )}
                </div>
              </div>

            </div>

            {/* Right Column */}
            <aside className="doctor-detail-grid__aside lg:col-span-4 lg:row-span-2 flex w-full max-w-full min-w-0 flex-col gap-5 sm:gap-6 doctor-detail-animate doctor-detail-animate--3">

              {/* Profile Overview Card (Navy Blue Card) */}
              <div className="group relative overflow-hidden rounded-[24px] bg-gradient-to-b from-[#002047] to-[#04336c] p-6 text-center text-white shadow-[0_12px_40px_rgba(0,32,71,0.15)] border border-slate-800/30 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_18px_45px_rgba(0,32,71,0.22)]">



                {/* Avatar with Ring */}
                <div className="relative mx-auto mt-4 h-24 w-24 rounded-full bg-slate-50 p-1 border-4 border-white/90 shadow-md overflow-hidden group-hover:scale-103 transition-transform duration-300">
                  {showPhoto ? (
                    <img
                      src={portrait}
                      alt={doctor.name}
                      className="h-full w-full rounded-full object-cover"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = getImageUrl("", doctor.name);
                      }}
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-[#134e97] to-[#008cc9] text-3xl font-extrabold text-white font-body">
                      {initials}
                    </span>
                  )}
                </div>

                {/* Name */}
                <h2 className="mt-4 text-xl font-extrabold tracking-tight leading-snug font-heading">
                  Dr. {doctor.name}
                </h2>

                {/* Specialization Pill (Rose / Pink background) */}
                <div className="mt-2 flex justify-center">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fdf0f4] px-4 py-1.5 text-[10px] font-extrabold tracking-wider text-[#b91c1c] uppercase border border-pink-200/10 group-hover:scale-102 transition-transform duration-300 font-body">
                    <UserRound className="h-3.5 w-3.5" strokeWidth={3} />
                    {doctor.specialization || "Specialist"}
                  </span>
                </div>

                {/* Booking Button inside Profile card */}
                <div className="doctor-detail-profile-book-wrap mt-6 pt-5 border-t border-white/10">
                  <Link
                    to={`/doctor/${id}`}
                    className="doctor-detail-book-btn inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#008cb9] hover:bg-[#007ba3] py-3 text-sm font-bold text-white shadow-sm transition-all duration-200 cursor-pointer hover:shadow-md hover:shadow-cyan-500/10 font-body sm:py-3.5"
                  >
                    <CalendarDays className="h-4 w-4" />
                    Book Appointment
                  </Link>
                </div>

                {/* Micro Stat Details Row */}
                <div className="grid grid-cols-3 gap-2 text-center pt-5 border-t border-white/10 mt-6">
                  <div className="flex flex-col items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-[#00a8e8] mb-1.5">
                      <ShieldCheck className="h-6 w-6" strokeWidth={2.5} />
                    </div>
                    <span className="text-[12px] text-slate-300 font-semibold leading-tight font-body mt-2">Verified Doctor</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-[#00a8e8] mb-1.5">
                      <Star className="h-6 w-6" strokeWidth={2.5} />
                    </div>
                    <span className="text-[11px] text-slate-300 font-semibold leading-tight font-body mt-2">
                      {doctor.experience || 12}+ yrs Experience
                    </span>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-[#00a8e8] mb-1.5">
                      <Users className="h-6 w-6" strokeWidth={2.5} />
                    </div>
                    <span className="text-[12px] text-slate-300 font-semibold leading-tight font-body mt-2">500+ Patients</span>
                  </div>
                </div>

              </div>

            </aside>

            {/* About — full page width below main columns */}
            <div className="doctor-detail-grid__about lg:col-span-12 w-full max-w-full min-w-0 doctor-detail-animate doctor-detail-animate--4">
              <div className="doctor-about-panel group relative w-full max-w-full min-w-0 overflow-hidden rounded-[24px] bg-gradient-to-br from-white via-[#edf4fc] to-[#d2e4f7] border border-[#134e97]/15 p-4 sm:p-6 shadow-[0_10px_35px_rgba(0,0,0,0.02)] transition-all duration-300 hover:border-[#134e97] hover:shadow-[0_20px_40px_rgba(0,140,201,0.12)] box-border">
                <svg
                  className="absolute bottom-2 right-4 h-12 w-24 text-[#002e62]/5 pointer-events-none group-hover:scale-105 group-hover:text-[#008cc9]/5 transition-all duration-300"
                  viewBox="0 0 100 30"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden
                >
                  <path
                    d="M0,15 L30,15 L35,5 L40,25 L45,10 L50,20 L53,15 L100,15"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>

                <div className="doctor-about-panel__inner relative z-[1] w-full min-w-0">
                  <div className="flex w-full items-center gap-3 sm:gap-4 min-w-0">
                    <div className="flex h-11 w-11 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-[14px] sm:rounded-[20px] bg-white border border-slate-200 shadow-[0_6px_16px_rgba(0,0,0,0.04)] group-hover:scale-105 group-hover:shadow-[0_6px_20px_rgba(0,140,201,0.1)] transition-all duration-300">
                      <FileText className="h-5 w-5 sm:h-7 sm:w-7 text-[#008cc9]" strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <span className="text-[15px] sm:text-[20px] font-extrabold text-[#002e62] tracking-wider uppercase leading-snug font-body">
                        About
                      </span>
                    </div>
                  </div>

                  <div className="doctor-about-panel__text mt-4 w-full flex flex-col gap-3.5 sm:gap-4 sm:mt-5">
                    {visibleAboutParagraphs.map((paragraph, index) => (
                      <p
                        key={index}
                        className="text-[13px] sm:text-sm text-slate-500 leading-relaxed font-semibold font-body"
                      >
                        {paragraph}
                      </p>
                    ))}
                    {hasMoreAbout && (
                      <button
                        type="button"
                        onClick={() => setAboutExpanded((prev) => !prev)}
                        className={`doctor-about-panel__toggle mt-2 self-start w-fit max-w-full inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-bold font-body transition-all duration-300 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#008cc9]/40 focus-visible:ring-offset-2 active:scale-[0.98] ${
                          aboutExpanded
                            ? "border-[#134e97]/30 bg-[#134e97]/10 text-[#002e62] hover:bg-[#134e97]/15 hover:border-[#134e97]/45 hover:shadow-md"
                            : "border-[#008cc9]/35 bg-white text-[#008cc9] hover:bg-[#008cc9] hover:text-white hover:border-[#008cc9] hover:shadow-[0_6px_20px_rgba(0,140,201,0.25)] hover:-translate-y-0.5"
                        }`}
                        aria-expanded={aboutExpanded}
                        aria-label={aboutExpanded ? "Show less about the doctor" : "Show more about the doctor"}
                      >
                        <span>{aboutExpanded ? "Read less" : "Read more"}</span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 transition-transform duration-300 ${aboutExpanded ? "rotate-180" : ""}`}
                          strokeWidth={2.5}
                          aria-hidden
                        />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

          </div>

        </div>
      </div>

      <Footer />
    </div>
  );
}
