import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import BlockDateModal from "../../doctor/BlockDateModal";
import { getImageUrl } from "../../../../utils/imageUrl";
import Footer from "@/components/HomePage/Footer";

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

async function tryEndpoints(endpoints, options = {}) {
  let lastErr = null;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        lastErr = `HTTP ${res.status} ${res.statusText} — ${txt || url}`;
        continue;
      }
      const json = await res.json().catch(() => null);
      return { ok: true, url, json };
    } catch (err) {
      lastErr = err.message || String(err);
    }
  }
  return { ok: false, lastErr };
}

function unwrapDoctors(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.users)) return json.users;
  if (Array.isArray(json.data?.doctors)) return json.data.doctors;
  if (Array.isArray(json.data?.users)) return json.data.users;
  if (Array.isArray(json.data)) return json.data;
  if (json.status === "success" && Array.isArray(json.data?.doctors))
    return json.data.doctors;
  return [];
}

const SPECIALIZATIONS = [
  "Neurologist",
  "General Physician",
  "Clinical Psychologist",
];

export default function AdminDoctorsListPage() {
  const navigate = useNavigate();

  // raw data from backend (unfiltered)
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // filters + pagination
  const [search, setSearch] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [page, setPage] = useState(1);
  const limit = 12;
  const totalPagesRef = useRef(1); // optional, if you later add pagination UI

  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  // modal control for blocking schedule
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [blockDoctorId, setBlockDoctorId] = useState(null);
  const [blockDoctorName, setBlockDoctorName] = useState("");
  const [modalDoctor, setModalDoctor] = useState(null);

  function openBlockModalForDoctor(d) {
    setBlockDoctorId(d._id);
    setBlockDoctorName(d.name || "Doctor");
    setBlockModalOpen(true);
  }

  function closeBlockModal() {
    setBlockModalOpen(false);
    setBlockDoctorId(null);
    setBlockDoctorName("");
  }
  function openBlockModalForDoctor(d) {
    // stopPropagation is done at caller; here we just set state
    setModalDoctor({ id: d._id, name: d.name || d.raw?.name || "Doctor" });
    setBlockModalOpen(true);
  }

  // Fetch doctors (once on mount or when Refresh is clicked)
  useEffect(() => {
    fetchDoctors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchDoctors() {
    setLoading(true);
    setError(null);
    try {
      // 🔥 No filter params here – we fetch a broad list, then filter on frontend
      const candidates = [
        `${BACKEND}/api/admin/doctors?page=1&limit=500`,
        `${BACKEND}/api/admin/doctors?limit=500`,
        `${BACKEND}/api/patient/doctors`,
        `${BACKEND}/api/doctor?limit=500`,
        `${BACKEND}/api/doctor`,
      ];

      const res = await tryEndpoints(candidates, {
        headers: { "Content-Type": "application/json", ...authHeaders },
      });

      if (!res.ok) {
        setDoctors([]);
        setError(res.lastErr || "Failed to fetch doctors");
        totalPagesRef.current = 1;
        return;
      }

      const list = unwrapDoctors(res.json) || [];

      const normalized = (list || []).map((raw) => ({
        _id:
          raw._id ??
          raw.id ??
          raw.userId ??
          Math.random().toString(36).slice(2),
        name: raw.name ?? raw.fullName ?? raw.displayName ?? "Doctor",
        profileImage: raw.profileImage ?? raw.avatar ?? raw.image ?? "",
        specialization: raw.specialization ?? "",
        experience: raw.experience ?? raw.years ?? raw.exp ?? null,
        fees: raw.fees ?? raw.consultationFee ?? raw.fee ?? null,
        raw,
      }));

      setDoctors(normalized);
      // pagination count will be computed from filtered length
    } catch (err) {
      console.error("fetchDoctors error:", err);
      setDoctors([]);
      setError(err?.message || "Failed to load doctors");
      totalPagesRef.current = 1;
    } finally {
      setLoading(false);
    }
  }

  // When filters change, go back to first page
  useEffect(() => {
    setPage(1);
  }, [search, specialization]);

  // 🔥 Apply filters on frontend
  const filteredDoctors = useMemo(() => {
    const term = search.trim().toLowerCase();
    const spec = specialization.trim().toLowerCase();

    return doctors.filter((d) => {
      // Search across name, specialization
      if (term) {
        const haystack = [
          d.name,
          d.specialization,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(term)) return false;
      }

      if (spec) {
        const dSpec = String(d.specialization || "").toLowerCase();
        if (dSpec !== spec) return false;
      }

      return true;
    });
  }, [doctors, search, specialization]);

  // frontend pagination
  const totalPages = Math.max(
    1,
    Math.ceil(filteredDoctors.length / limit) || 1
  );
  totalPagesRef.current = totalPages;

  const pagedDoctors = useMemo(() => {
    const start = (page - 1) * limit;
    const end = start + limit;
    return filteredDoctors.slice(start, end);
  }, [filteredDoctors, page]);

  const headerSubtitle = useMemo(() => {
    const parts = [];
    if (search) parts.push(`“${search}”`);
    if (specialization) parts.push(specialization);
    return parts.length ? parts.join(" · ") : "Browse verified, active doctors";
  }, [search, specialization]);


  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-indigo-50 via-purple-50 to-sky-50 overflow-x-hidden">
      <header className="sticky top-0 z-40 bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 shadow">
        <div className="backdrop-blur-md bg-white/0 py-3 sm:py-4">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-1 sm:py-2">
            <div className="flex items-center justify-between">
              <button
                onClick={() => navigate(-1)}
                className="inline-flex items-center gap-2 px-2.5 py-1.5 text-xs sm:text-sm rounded-full bg-white/10 text-white hover:bg-white/20 border border-white/20 transition">
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
              <div className="absolute left-1/2 -translate-x-1/2 text-center">
                <h1 className="text-lg sm:text-2xl font-bold text-white truncate max-w-[200px] sm:max-w-none">
                  Doctors Appointments
                </h1>
              </div>
              <button
                onClick={fetchDoctors}
                className="inline-flex items-center gap-2 px-2.5 py-1.5 text-xs sm:text-sm rounded-full bg-white/10 text-white hover:bg-white/20 border border-white/20 transition">
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2">
                  <path d="M21 12a9 9 0 11-3.7-7.1" />
                  <path d="M21 3v6h-6" />
                </svg>
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Single Search Bar */}
          <div className="flex items-center w-full mb-6">
            <div className="relative w-full">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search doctors by name or specialization…"
                className="
          w-full h-10 pl-10 pr-3
          rounded-full bg-white/70 border border-slate-200 
          text-sm placeholder:text-slate-400
          focus:outline-none focus:ring-2 focus:ring-blue-500/30 
          shadow-sm
        "
              />

              {/* Search Icon */}
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                stroke="currentColor"
                fill="none"
                strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
            </div>
          </div>

          {/* list / grid */}
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 shadow-sm">
              {error}
            </div>
          )}

          {loading ? (
            <GridSkeleton />
          ) : pagedDoctors.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {pagedDoctors.map((d) => (
                  <DoctorCard
                    key={d._id}
                    d={d}
                    openBlockModalForDoctor={openBlockModalForDoctor}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      <Footer />

      {/* Block modal */}
      <BlockDateModal
        isOpen={blockModalOpen}
        onClose={() => {
          setBlockModalOpen(false);
          setModalDoctor(null);
        }}
        doctorId={modalDoctor?.id}
        doctorName={modalDoctor?.name}
        onSuccess={() => {
          // optional: refresh list or show toast
          fetchDoctors();
          setBlockModalOpen(false);
          setModalDoctor(null);
        }}
      />
    </div>
  );
}

/* ---------------------- subcomponents ---------------------- */

function DoctorCard({ d, openBlockModalForDoctor }) {
  const navigate = useNavigate();
  const imgSrc = getImageUrl(d.profileImage, d.name);
  const isCalendarConnected = !!(d.raw?.googleCalendar?.isConnected || d.raw?.googleCalendar?.connected);

  function goToDoctorAdmin() {
    if (!isCalendarConnected) return;
    navigate(`/admin/appointments/doctor/${d._id}`, {
      state: { doctorName: d.name },
    });
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={goToDoctorAdmin}
      onKeyDown={(e) => {
        if (e.key === "Enter") goToDoctorAdmin();
      }}
      className={`
        group relative overflow-hidden rounded-2xl border border-gray-300 bg-white
        shadow-[0_6px_20px_rgba(0,0,0,0.05)]
        transition-all duration-300 ease-out
        ${isCalendarConnected ? "hover:-translate-y-2 hover:shadow-[0_16px_40px_rgba(0,0,0,0.12)] hover:border-blue-300 cursor-pointer" : "opacity-90 cursor-default"}
      `}>
      <div className={`pointer-events-none absolute inset-0 rounded-2xl ring-0 transition-all duration-300 ${isCalendarConnected ? "group-hover:ring-2 group-hover:ring-blue-400/60" : ""}`} />

      {/* Mobile/Tab: image left + details right, Desktop: image top + details below */}
      <div className="relative flex gap-3 p-3 sm:p-4 md:block md:p-0">
        {/* IMAGE */}
        <div
          className="
            flex-shrink-0
            w-24 h-24 sm:w-28 sm:h-28
            md:w-full md:h-60
            bg-gray-100 rounded-lg overflow-hidden
          ">
          <img
            src={imgSrc}
            alt={d.name}
            className={`
              w-full h-full object-cover
              transition-all duration-300 ease-out
              ${isCalendarConnected ? "group-hover:scale-105" : ""}
            `}
          />
        </div>

        {/* DETAILS */}
        <div className="flex-1 md:p-4">
          <div className="mb-1 font-semibold text-gray-900 truncate">
            Dr. {d.name}
          </div>

          <div className="mb-2">
            <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200 px-2 py-0.5 text-xs">
              {d.specialization || "General"}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {d.experience != null && (
              <span className="rounded-full bg-gray-100 text-gray-700 ring-1 ring-gray-200 px-2 py-0.5">
                {d.experience} yrs
              </span>
            )}
            {d.fees != null && (
              <span className="rounded-full bg-sky-100 text-sky-800 ring-1 ring-sky-200 px-2 py-0.5">
                ₹{d.fees}
              </span>
            )}
          </div>
        </div>
      </div>

      {isCalendarConnected ? (
        /* BUTTONS – inside same container, below content, for all breakpoints */
        <div className="px-2 sm:px-2 pb-4 md:px-2 md:pb-4 flex items-center gap-2">
          <Link
            to={`/admin/appointments/doctor/${d._id}`}
            state={{ doctorName: d.name }}
            onClick={(e) => e.stopPropagation()}
            className="
              flex-1 px-1 py-2 rounded-full bg-white text-blue-900 ring-1 ring-blue-200 hover:bg-blue-50 transition-all duration-300 text-sm text-center
            ">
            View Appointments
          </Link>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openBlockModalForDoctor(d);
            }}
            className="
              flex-1 px-1 py-2 rounded-full text-white  transition-all duration-300 text-sm text-center
              bg-rose-500 text-white hover:bg-rose-600
            ">
            Block Slots
          </button>
        </div>
      ) : (
        /* Status notice – Calendar not connected */
        <div className="px-3 pb-4">
          <div className="flex items-center gap-2 justify-center rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800 font-medium">
            <svg
              className="w-4 h-4 text-amber-600 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span>Google Calendar not connected</span>
          </div>
        </div>
      )}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border border-gray-100 bg-white animate-pulse">
          <div className="aspect-[10/11] w-full bg-gray-100" />
          <div className="p-4">
            <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
            <div className="h-3 bg-gray-200 rounded w-1/2 mb-2" />
            <div className="h-3 bg-gray-200 rounded w-1/3" />
            <div className="h-8 bg-gray-200 rounded mt-4" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16 rounded-2xl bg-white border border-gray-200">
      <div className="w-20 h-20 mx-auto mb-3 rounded-full bg-gray-100 flex items-center justify-center">
        <svg
          className="w-10 h-10 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 00-2 2z"
          />
        </svg>
      </div>
      <h4 className="text-lg font-semibold text-blue-900">No doctors found</h4>
      <p className="text-gray-600 mt-1">
        Try changing the filters or search term.
      </p>
    </div>
  );
}
