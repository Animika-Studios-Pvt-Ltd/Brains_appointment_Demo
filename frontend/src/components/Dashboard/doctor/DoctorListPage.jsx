import Footer from "@/components/HomePage/Footer";
import Header from "@/components/HomePage/Header";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Search,
  Stethoscope,
  Star,
  Brain,
  CalendarDays,
} from "lucide-react";
import { getImageUrl } from "@/utils/imageUrl";
import {
  BRAND_PAGE_BG_CLASS,
  DOCTOR_PUBLIC_PAGE_CONTAINER,
} from "@/config/doctorPublicPageLayout";
import "./DoctorListPage.css";

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
/** API caps list size at 50 per request */
const DOCTOR_LIST_FETCH_LIMIT = 50;

/** In-memory cache so back navigation from detail does not flash an empty list */
let cachedDoctors = null;

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

export default function DoctorListPage() {
  const [doctors, setDoctors] = useState(() => cachedDoctors ?? []);
  const [loading, setLoading] = useState(() => !cachedDoctors?.length);
  const [hasFetched, setHasFetched] = useState(() => Boolean(cachedDoctors?.length));
  const [error, setError] = useState(null);
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("search") || "");

  useEffect(() => {
    const q = searchParams.get("search");
    if (q !== null && q !== undefined) {
      setSearch(q);
    }
  }, [searchParams]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const controller = new AbortController();
    const showFullPageLoader = !cachedDoctors?.length;

    async function run() {
      try {
        if (showFullPageLoader) setLoading(true);
        setError(null);
        const params = new URLSearchParams();
        params.set("page", "1");
        params.set("limit", String(DOCTOR_LIST_FETCH_LIMIT));
        if (search.trim()) params.set("search", search.trim());

        const res = await fetch(
          `${BACKEND}/api/patient/doctors?${params.toString()}`,
          {
            signal: controller.signal,
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }
        );

        const json = await res.json();
        if (!res.ok || json.status === "error") {
          throw new Error(json.message || `Failed to load doctors (${res.status})`);
        }

        const list = json?.data?.doctors ?? [];
        cachedDoctors = list;
        setDoctors(list);
        setHasFetched(true);
      } catch (e) {
        if (e?.name !== "AbortError") {
          setError(e?.message || "Failed to load doctors");
          if (showFullPageLoader) {
            cachedDoctors = null;
            setDoctors([]);
          }
          setHasFetched(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    run();
    return () => controller.abort();
  }, [search]);

  return (
    <div className={`min-h-screen flex flex-col ${BRAND_PAGE_BG_CLASS}`}>
      <Header />

      <div
        className={`${DOCTOR_PUBLIC_PAGE_CONTAINER} pt-3 pb-5 sm:pt-6 sm:pb-6 md:py-8`}>
        {/* Title */}
        <div className="text-center py-4 sm:py-5 md:py-6 mb-2 sm:mb-4">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#134e97] tracking-tight">
            Our Expert Doctors
          </h1>
          <span
            className="mt-2 mx-auto block h-1 w-14 rounded-full bg-[#06adc6]"
            aria-hidden
          />
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-amber-50 text-amber-900 border border-amber-200 text-sm text-center max-w-3xl mx-auto">
            {error}
          </div>
        )}

        {(loading && doctors.length === 0) || !hasFetched ? (
          <GridSkeleton />
        ) : doctors.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="doctor-list-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 items-start gap-4 sm:gap-6 md:gap-8 max-w-5xl xl:max-w-none mx-auto xl:mx-0">
            {doctors.map((d) => (
              <DoctorCard key={d._id} d={d} />
            ))}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}

function DoctorCard({ d }) {
  const imgSrc = getImageUrl(d.profileImage, d.name);
  const showPhoto = hasRealDoctorPhoto(d.profileImage);
  const initials = doctorInitials(d.name);
  const expYears = d.experience != null && d.experience !== "" ? String(d.experience) : null;
  const subTag = d.qualification?.split(",")?.[0]?.trim() || null;

  return (
    <article className="@container doctor-list-card flex flex-col w-full overflow-hidden rounded-[22px] bg-white border border-slate-100 shadow-[0_4px_20px_rgba(19,78,151,0.06)] transition-shadow duration-300 hover:shadow-[0_8px_28px_rgba(19,78,151,0.1)]">
      {/* Header — fixed height so footer never overflows on narrow fold screens */}
      {showPhoto ? (
        <div className="doctor-list-card__header relative shrink-0 flex items-center justify-center overflow-hidden bg-white">
          <span
            className="pointer-events-none absolute -left-6 top-4 h-24 w-24 rounded-full bg-[#06adc6]/20 blur-sm"
            aria-hidden
          />
          <span
            className="pointer-events-none absolute right-0 bottom-0 h-28 w-28 rounded-full bg-[#134e97]/10 blur-md"
            aria-hidden
          />
          <span
            className="pointer-events-none absolute right-8 top-6 h-16 w-16 rounded-2xl bg-[#06adc6]/15 rotate-12"
            aria-hidden
          />
          <div className="relative z-[1] h-[5.5rem] w-[5.5rem] sm:h-24 sm:w-24 rounded-full bg-white ring-1 ring-slate-200/80 shadow-[0_8px_24px_rgba(19,78,151,0.12)] overflow-hidden flex items-center justify-center p-1">
            <img
              key={d.profileImage}
              src={imgSrc}
              alt={d.name}
              className="h-full w-full object-cover rounded-full"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = getImageUrl("", d.name);
              }}
            />
          </div>
        </div>
      ) : (
        <div className="doctor-list-card__header relative shrink-0 flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#2a6cb8] via-[#134e97] to-[#013473]">
          <svg
            className="pointer-events-none absolute bottom-0 left-0 w-full h-12 text-white/10"
            viewBox="0 0 400 48"
            preserveAspectRatio="none"
            aria-hidden>
            <path
              fill="currentColor"
              d="M0,32 Q100,8 200,28 T400,20 L400,48 L0,48 Z"
            />
          </svg>
          <span className="relative z-[1] text-5xl sm:text-6xl font-bold text-white tracking-wider select-none">
            {initials}
          </span>
        </div>
      )}

      {/* Body */}
      <div className="doctor-list-card__body flex flex-col flex-1 min-h-0 px-5 sm:px-6 pt-5 pb-3 text-center min-w-0">
        <h2 className="text-lg sm:text-xl font-bold text-[#134e97] leading-tight">
          Dr. {d.name}
        </h2>

        <div className="mt-3 flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f4fc] text-[#134e97] px-3.5 py-1.5 text-xs font-semibold">
            <Stethoscope className="h-3.5 w-3.5 shrink-0 text-[#06adc6]" strokeWidth={2} />
            {d.specialization || "General Physician"}
          </span>
        </div>

        <div className="doctor-list-card__meta mt-5">
          {expYears != null && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f4fc] text-[#134e97] px-3 py-1.5 text-xs font-medium">
              <Star className="h-3.5 w-3.5 text-[#06adc6]" strokeWidth={2} fill="#06adc6" fillOpacity={0.35} />
              {expYears} yrs experience
            </span>
          )}
          {subTag && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-800 px-3 py-1.5 text-xs font-medium">
              <Brain className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2} />
              {subTag}
            </span>
          )}
          {!expYears && !subTag && (
            <span className="text-xs text-[#134e97]/50">Experience details coming soon</span>
          )}
        </div>
      </div>

      <div className="doctor-list-card__actions mt-auto border-t border-slate-100 px-4 sm:px-5 py-4">
        <Link
          to={`/doctor/detail/${d._id}`}
          className="doctor-list-card__btn-view inline-flex items-center justify-center rounded-full text-xs sm:text-sm font-semibold"
        >
          <span className="truncate">View Profile</span>
        </Link>
        <Link
          to={`/doctor/${d._id}`}
          className="doctor-list-card__book inline-flex items-center justify-center rounded-full text-xs sm:text-sm font-semibold"
        >
          <CalendarDays
            className="doctor-list-card__book-icon h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0"
            strokeWidth={2}
          />
          <span className="truncate">Book Appointment</span>
        </Link>
      </div>
    </article>
  );
}

function GridSkeleton() {
  return (
    <div className="doctor-list-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 items-start gap-4 sm:gap-6 md:gap-8 max-w-5xl xl:max-w-none mx-auto xl:mx-0">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl bg-white border border-slate-100 overflow-hidden animate-pulse shadow-sm">
          <div className="h-32 sm:h-36 bg-slate-100" />
          <div className="p-5 space-y-3">
            <div className="h-5 bg-slate-200 rounded w-3/4 mx-auto" />
            <div className="h-6 bg-slate-100 rounded-full w-1/2 mx-auto" />
            <div className="h-4 bg-slate-100 rounded w-full" />
            <div className="h-4 bg-slate-100 rounded w-2/3" />
            <div className="flex gap-2 pt-2">
              <div className="h-10 flex-1 bg-slate-100 rounded-full" />
              <div className="h-10 flex-1 bg-slate-100 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16 px-6 rounded-2xl bg-white border border-slate-100 shadow-sm max-w-lg mx-auto">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#06adc6]/15 flex items-center justify-center">
        <Stethoscope className="w-8 h-8 text-[#134e97]/50" strokeWidth={1.5} />
      </div>
      <h4 className="text-lg font-bold text-[#134e97]">No doctors found</h4>
      <p className="text-sm text-[#134e97]/60 mt-2">
        Try a different search term or clear the search.
      </p>
    </div>
  );
}
