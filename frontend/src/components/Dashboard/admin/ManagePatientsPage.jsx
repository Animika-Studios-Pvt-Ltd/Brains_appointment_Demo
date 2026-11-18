import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { api, getAuthToken } from "../../../utils/api";
import Footer from "@/components/HomePage/Footer";
import {
  RefreshCw,
  Search,
  User,
  Phone,
  Mail,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  X,
  ShieldAlert,
  UserX,
  UserCheck,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";

// Typography Font Constants matching custom.css & index.css
const HEADING_FONT = "'mirador-medium', 'Outfit', sans-serif";
const BODY_FONT = "'roboto-regular', 'Roboto', sans-serif";

const PATIENT_CANCEL_THRESHOLD = 3;
const PATIENT_RESCHEDULE_THRESHOLD = 3;
const PATIENT_NO_SHOW_THRESHOLD = 3;

export default function ManagePatientsPage({ hideHeader = false, hideFooter = false }) {
  const navigate = useNavigate();

  const storedUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  }, []);

  const token = useMemo(
    () => getAuthToken?.() || localStorage.getItem("token"),
    []
  );

  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [query, setQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10); // 10, 25, 50, 100, 'all'

  const paginatedPatients = useMemo(() => {
    if (itemsPerPage === 'all') return patients;
    const limit = Number(itemsPerPage);
    const startIndex = (currentPage - 1) * limit;
    return patients.slice(startIndex, startIndex + limit);
  }, [patients, currentPage, itemsPerPage]);

  const totalPages = useMemo(() => {
    if (itemsPerPage === 'all') return 1;
    return Math.ceil(patients.length / Number(itemsPerPage));
  }, [patients, itemsPerPage]);

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailPatient, setDetailPatient] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [detailActionLoading, setDetailActionLoading] = useState(false);

  useEffect(() => {
    if (!token || !storedUser) {
      navigate("/", { replace: true });
      return;
    }

    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const url = `/api/admin/patients?limit=200${query ? `&search=${encodeURIComponent(query)}` : ""
          }`;

        const res = await api.get(url);
        const list =
          res?.data?.patients ??
          res?.data ??
          res?.patients ??
          (Array.isArray(res) ? res : []);

        if (!alive) return;
        setPatients(Array.isArray(list) ? list : []);
      } catch (err) {
        console.error("Failed to load patients:", err);

        const msg =
          err?.response?.status === 403
            ? "Access denied by server (admin or receptionist only)."
            : err?.message || "Failed to load patients";
        if (alive) setError(msg);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [token, storedUser, query, refreshKey, navigate]);

  function isBlockedPatient(p) {
    const cancelCount = Number(p?.cancelCount ?? p?.cancels ?? 0);
    const rescheduleCount = Number(p?.rescheduleCount ?? p?.reschedules ?? 0);
    const noShowCount = Number(p?.noShowCount ?? 0);

    if (p?.isBlocked) return true;

    return (
      cancelCount >= PATIENT_CANCEL_THRESHOLD ||
      rescheduleCount >= PATIENT_RESCHEDULE_THRESHOLD ||
      noShowCount >= PATIENT_NO_SHOW_THRESHOLD
    );
  }

  function refresh() {
    setRefreshKey((k) => k + 1);
  }

  async function handleBlock(patient) {
    const confirm = await Swal.fire({
      title: `Block ${patient.name || patient.email || "patient"}?`,
      text: "Are you sure you want to block this patient?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Block",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#e11d48", // Rose 600
      cancelButtonColor: "#64748b", // Slate 500
    });

    if (!confirm.isConfirmed) return;

    const { value: reason } = await Swal.fire({
      title: "Enter block reason",
      input: "textarea",
      inputPlaceholder: "Reason for blocking…",
      showCancelButton: true,
      confirmButtonText: "Save Reason & Block",
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
    });

    if (reason === undefined) return;

    try {
      Swal.fire({
        title: "Blocking…",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const res = await api.patch(`/api/admin/patients/${patient._id}/block`, {
        reason,
      });

      const updated = res?.data ?? res;

      Swal.fire({
        icon: "success",
        title: "Blocked",
        text: "Patient has been blocked.",
        confirmButtonColor: "#134e97",
      });

      setPatients((prev) =>
        prev.map((p) =>
          p._id === patient._id
            ? {
              ...p,
              ...updated,
            }
            : p
        )
      );
      refresh();
    } catch (err) {
      Swal.fire({ icon: "error", title: "Error", text: err?.message, confirmButtonColor: "#134e97" });
    }
  }

  async function handleUnblockAndReset(patient) {
    const confirm = await Swal.fire({
      title: `Unblock ${patient.name || patient.email || "patient"}?`,
      text: "This will unblock and reset all counts.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Unblock & Reset",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#16a34a", // Green 600
      cancelButtonColor: "#64748b",
    });

    if (!confirm.isConfirmed) return;

    try {
      Swal.fire({
        title: "Unblocking…",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const res = await api.patch(
        `/api/admin/patients/${patient._id}/unblock`,
        {
          resetCounts: true,
        }
      );

      const updated = res?.data ?? res;

      setPatients((prev) =>
        prev.map((p) => (p._id === patient._id ? { ...p, ...updated } : p))
      );

      Swal.fire({
        icon: "success",
        title: "Unblocked",
        text: "Patient is now active.",
        confirmButtonColor: "#134e97",
      });
      refresh();
    } catch (err) {
      Swal.fire({ icon: "error", title: "Failed", text: err?.message, confirmButtonColor: "#134e97" });
    }
  }

  async function handleResetCounts(patient) {
    const confirm = await Swal.fire({
      title: `Reset counts for ${patient.name || patient.email || "patient"}?`,
      text: "Cancel count, reschedule count, and missed-appointment count will all become 0.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Reset",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#134e97",
      cancelButtonColor: "#64748b",
    });

    if (!confirm.isConfirmed) return;

    try {
      Swal.fire({
        title: "Resetting…",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const res = await api.patch(
        `/api/admin/patients/${patient._id}/reset-counts`
      );

      Swal.fire({ icon: "success", title: "Counts Reset", confirmButtonColor: "#134e97" });

      const updated = res?.data ?? {};
      setPatients((prev) =>
        prev.map((p) =>
          p._id === patient._id
            ? {
              ...p,
              cancelCount: 0,
              rescheduleCount: 0,
              noShowCount: 0,
              ...updated,
            }
            : p
        )
      );
    } catch (err) {
      Swal.fire({ icon: "error", title: "Failed", text: err?.message, confirmButtonColor: "#134e97" });
    }
  }

  function parseBlockedReason(raw) {
    if (!raw) return "";
    try {
      const rx = /\s*\(blocked by [^)]+\)$/i;
      return String(raw).replace(rx, "").trim();
    } catch {
      return String(raw);
    }
  }

  async function openDetailsModal(patientId) {
    setDetailError(null);
    setDetailPatient(null);
    setDetailLoading(true);
    setDetailModalOpen(true);

    try {
      const res = await api.get(`/api/admin/patients/${patientId}`);
      const data = res?.data ?? res;
      let patient = data?.data ?? data?.patient ?? data;

      patient = patient ? { ...patient } : patient;

      patient._blockedReasonClean = parseBlockedReason(patient.blockedReason);
      patient._blockerName = patient.blockedByName || null;

      if (!patient._blockerName && typeof patient.blockedReason === "string") {
        try {
          const rxActor = /\(blocked by\s+([^\s)]+)(?:\s+id:[^)]+)?\)/i;
          const m = patient.blockedReason.match(rxActor);
          if (m && m[1]) {
            patient._blockerName = m[1];
          }
        } catch {
          // ignore
        }
      }

      setDetailPatient(patient);
    } catch (err) {
      console.error("Failed to fetch patient details:", err);
      setDetailError(err?.message || "Failed to fetch patient details");
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetailsModal() {
    setDetailModalOpen(false);
    setDetailPatient(null);
    setDetailError(null);
    setDetailLoading(false);
  }

  function displayCount(n) {
    return typeof n === "number" ? n : Number(n || 0);
  }

  function formatDateToKolkata(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    } catch {
      return String(iso);
    }
  }

  function blockedSource(patient) {
    if (!patient) return null;
    if (patient.isBlocked && patient.blockedReason) {
      return "Manual block";
    }
    const cancelCount = Number(patient?.cancelCount ?? 0);
    const rescheduleCount = Number(patient?.rescheduleCount ?? 0);
    const noShowCount = Number(patient?.noShowCount ?? 0);

    if (cancelCount >= PATIENT_CANCEL_THRESHOLD) return "Automatic (cancel threshold)";
    if (rescheduleCount >= PATIENT_RESCHEDULE_THRESHOLD) return "Automatic (reschedule threshold)";
    if (noShowCount >= PATIENT_NO_SHOW_THRESHOLD) return "Automatic (missed appointment threshold)";

    return patient?.isBlocked ? "Blocked" : null;
  }

  async function handleModalBlockToggle() {
    if (!detailPatient) return;
    try {
      setDetailActionLoading(true);

      const currentlyBlocked =
        detailPatient.isBlocked || isBlockedPatient(detailPatient);

      if (currentlyBlocked) {
        const doReset = await Swal.fire({
          title: `Unblock ${detailPatient.name || detailPatient.email || "patient"}?`,
          text: "Unblock and reset cancel & reschedule counts to 0?",
          icon: "question",
          showCancelButton: true,
          confirmButtonText: "Unblock & Reset Counts",
          cancelButtonText: "Unblock Only",
          confirmButtonColor: "#16a34a",
          cancelButtonColor: "#134e97",
        });

        if (doReset.isConfirmed) {
          await handleUnblockAndReset(detailPatient);
        } else {
          try {
            const res = await api.patch(
              `/api/admin/patients/${detailPatient._id}/unblock`
            );
            const updated = res?.data ?? res;
            setPatients((prev) =>
              prev.map((p) =>
                p._id === detailPatient._id ? { ...p, ...updated } : p
              )
            );
            refresh();
          } catch (e) {
            console.warn("unblock fallback failed:", e);
            Swal.fire({
              icon: "error",
              title: "Failed to unblock",
              text: e?.message || "Operation failed",
              confirmButtonColor: "#134e97"
            });
          }
        }
      } else {
        await handleBlock(detailPatient);
      }
    } finally {
      setDetailActionLoading(false);
      closeDetailsModal();
    }
  }

  // Summary Metrics calculations
  const statsSummary = useMemo(() => {
    const total = patients.length;
    const blocked = patients.filter(isBlockedPatient).length;
    const active = total - blocked;
    return { total, blocked, active };
  }, [patients]);

  // Initials generator for premium directory avatars
  function getInitials(name) {
    if (!name) return "?";
    return name
      .trim()
      .split(/\s+/)
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  return (
    <div
      className="min-h-screen flex flex-col bg-gradient-to-br from-indigo-50/50 via-purple-50/50 to-sky-50/50"
      style={{ fontFamily: BODY_FONT }}
    >
      {/* HEADER: premium matching clinic branding */}
      {!hideHeader && (
        <header className="sticky top-0 z-40 bg-gradient-to-r from-[#134e97] via-[#0d72aa] to-[#013473] shadow-md border-b border-[#134e97]/10">
          <div className="backdrop-blur-md bg-white/0 py-3 sm:py-4">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1 sm:py-2">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => navigate(-1)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-white hover:bg-white/20 border border-white/10 transition-all duration-300 text-xs sm:text-sm font-semibold hover:scale-102"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Back</span>
                </button>

                <div className="absolute left-1/2 -translate-x-1/2 text-center">
                  <h1
                    className="text-lg sm:text-2xl font-bold text-white tracking-tight truncate max-w-[220px] sm:max-w-none"
                    style={{ fontFamily: HEADING_FONT }}
                  >
                    Manage Patients
                  </h1>
                </div>

                <button
                  onClick={refresh}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-white hover:bg-white/20 border border-white/10 transition-all duration-300 text-xs sm:text-sm font-semibold hover:scale-102"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
              </div>
            </div>
          </div>
        </header>
      )}

      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 flex-1 flex flex-col gap-6">

        {/* STATS QUICK-SUMMARY GRID - Premium Clinic Aesthetics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">

          <div className="bg-white/90 backdrop-blur-md border border-slate-200 hover:border-indigo-300 shadow-sm rounded-2xl p-5 flex items-center justify-between transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Patients</p>
              <h3 className="text-2xl font-bold text-[#134e97] mt-1" style={{ fontFamily: HEADING_FONT }}>
                {loading ? "..." : statsSummary.total}
              </h3>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-[#134e97]">
              <User className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white/90 backdrop-blur-md border border-slate-200 hover:border-emerald-300 shadow-sm rounded-2xl p-5 flex items-center justify-between transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Status</p>
              <h3 className="text-2xl font-bold text-emerald-600 mt-1" style={{ fontFamily: HEADING_FONT }}>
                {loading ? "..." : statsSummary.active}
              </h3>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <UserCheck className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white/90 backdrop-blur-md border border-slate-200 hover:border-rose-300 shadow-sm rounded-2xl p-5 flex items-center justify-between hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Blocked / Flagged</p>
              <h3 className="text-2xl font-bold text-rose-600 mt-1" style={{ fontFamily: HEADING_FONT }}>
                {loading ? "..." : statsSummary.blocked}
              </h3>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
              <UserX className="w-6 h-6 animate-pulse" />
            </div>
          </div>

        </div>

        {/* SEARCH BAR AREA & PER PAGE SELECT */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 w-full">
          <div className="relative w-full sm:flex-1 shadow-sm rounded-full">
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search patients by name, email, or phone number…"
              className="w-full h-12 pl-12 pr-4 rounded-full bg-white/85 border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#134e97]/30 focus:border-[#134e97]/70 transition-all duration-300 bg-white/70 backdrop-blur-md"
            />
            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <label htmlFor="patientsPerPageSelect" className="text-xs font-semibold text-slate-600">
              Show:
            </label>
            <select
              id="patientsPerPageSelect"
              value={itemsPerPage}
              onChange={(e) => {
                const val = e.target.value === "all" ? "all" : Number(e.target.value);
                setItemsPerPage(val);
                setCurrentPage(1);
              }}
              className="px-3 py-2 bg-white/90 border border-slate-200 rounded-full text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] transition-all cursor-pointer shadow-sm"
            >
              <option value={10}>10 per page</option>
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
              <option value="all">All entries</option>
            </select>
          </div>
        </div>

        {/* LIST / GRID SECTION */}
        <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm flex-1 flex flex-col">
          {loading ? (
            <div className="py-20 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-8 h-8 text-[#134e97] animate-spin" />
              <span className="text-sm font-medium">Fetching patient database…</span>
            </div>
          ) : error ? (
            <div className="py-16 text-center text-rose-600 flex flex-col items-center justify-center gap-2">
              <AlertCircle className="w-10 h-10 text-rose-500" />
              <span className="font-semibold text-base">{error}</span>
            </div>
          ) : patients.length === 0 ? (
            <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <UserX className="w-12 h-12 text-slate-300" />
              <span className="font-medium text-slate-500">No patients match your search criteria.</span>
            </div>
          ) : (
            <>
              {/* DESKTOP TABLE VIEW */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full table-auto border-collapse min-w-[900px]">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-[#134e97]/30">
                      <th className="px-6 py-4.5">Patient Details</th>
                      <th className="px-4 py-4.5 text-center">Cancels</th>
                      <th className="px-4 py-4.5 text-center">Reschedules</th>
                      <th className="px-4 py-4.5 text-center">Missed</th>
                      <th className="px-6 py-4.5 text-center">Status</th>
                      <th className="px-6 py-4.5 text-right">Actions</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[#134e97]/30">
                    {paginatedPatients.map((p) => {
                      const cancelCount = displayCount(p.cancelCount ?? p.cancels ?? 0);
                      const rescheduleCount = displayCount(p.rescheduleCount ?? p.reschedules ?? 0);
                      const noShowCount = displayCount(p.noShowCount ?? 0);
                      const blocked = isBlockedPatient(p);

                      return (
                        <tr
                          key={p._id}
                          className="hover:bg-slate-50/50 transition-colors duration-200 group"
                        >
                          {/* Name + Email + Phone */}
                          <td className="px-6 py-4">
                            <div className="flex items-center">
                              <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-tr from-[#134e97]/10 to-[#07adc5]/10 border border-[#134e97]/10 text-[#134e97] font-semibold text-sm mr-3 flex-shrink-0">
                                {getInitials(p.name)}
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-800 truncate text-sm">
                                  {p.name || "—"}
                                </div>
                                <div className="text-xs text-slate-400 truncate flex items-center gap-1.5 mt-0.5">
                                  <Mail className="w-3.5 h-3.5 flex-shrink-0 text-slate-300" />
                                  <span>{p.email || "—"}</span>
                                  {p.phone && (
                                    <>
                                      <span className="text-slate-300">•</span>
                                      <Phone className="w-3.5 h-3.5 flex-shrink-0 text-slate-300" />
                                      <span>{p.phone}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* cancel count */}
                          <td className="px-4 py-4 text-center">
                            <span
                              className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${cancelCount >= PATIENT_CANCEL_THRESHOLD ? "bg-red-50 text-red-600 border border-red-100" : "bg-slate-50 text-slate-700"
                                }`}
                            >
                              {cancelCount}
                            </span>
                          </td>

                          {/* reschedule count */}
                          <td className="px-4 py-4 text-center">
                            <span
                              className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${rescheduleCount >= PATIENT_RESCHEDULE_THRESHOLD ? "bg-amber-50 text-amber-600 border border-amber-100" : "bg-slate-50 text-slate-700"
                                }`}
                            >
                              {rescheduleCount}
                            </span>
                          </td>

                          {/* noShow count */}
                          <td className="px-4 py-4 text-center">
                            <span
                              className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${noShowCount >= PATIENT_NO_SHOW_THRESHOLD ? "bg-red-50 text-red-600 border border-red-100" : "bg-slate-50 text-slate-700"
                                }`}
                            >
                              {noShowCount}
                            </span>
                          </td>

                          {/* Blocked/Active Status */}
                          <td className="px-6 py-4 text-center">
                            {blocked ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-rose-200 text-rose-700 bg-rose-50/70 text-xs font-semibold shadow-sm">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                                Blocked
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-emerald-200 text-emerald-700 bg-emerald-50/70 text-xs font-semibold shadow-sm">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                Active
                              </span>
                            )}
                          </td>

                          {/* Action Buttons */}
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => openDetailsModal(p._id)}
                                className="px-3 py-1.5 text-xs font-semibold rounded-full bg-white border border-slate-200 text-slate-600 hover:text-[#134e97] hover:border-[#134e97]/30 hover:bg-slate-50 transition-all shadow-sm"
                              >
                                Details
                              </button>

                              <button
                                onClick={() => handleResetCounts(p)}
                                className="px-3 py-1.5 text-xs font-semibold rounded-full bg-white border border-slate-200 text-slate-600 hover:text-indigo-700 hover:border-indigo-300 hover:bg-slate-50 transition-all shadow-sm"
                                title="Reset count variables to zero"
                              >
                                Reset Counts
                              </button>

                              {blocked ? (
                                <button
                                  onClick={() => handleUnblockAndReset(p)}
                                  className="px-3 py-1.5 text-xs font-semibold rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all shadow-sm"
                                >
                                  Unblock
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleBlock(p)}
                                  className="px-3 py-1.5 text-xs font-semibold rounded-full border border-rose-200 bg-rose-50/60 text-rose-700 hover:bg-rose-100 transition-all shadow-sm"
                                >
                                  Block
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* MOBILE RESPONSIVE CARD VIEW */}
              <div className="lg:hidden space-y-4">
                {paginatedPatients.map((p) => {
                  const cancelCount = displayCount(p.cancelCount ?? p.cancels ?? 0);
                  const rescheduleCount = displayCount(p.rescheduleCount ?? p.reschedules ?? 0);
                  const noShowCount = displayCount(p.noShowCount ?? 0);
                  const blocked = isBlockedPatient(p);

                  return (
                    <div
                      key={p._id}
                      className={`p-5 rounded-2xl border bg-white shadow-sm relative transition-all duration-300 hover:shadow-md ${blocked ? "border-rose-100" : "border-[#134e97]/15"
                        }`}
                    >
                      <div className="absolute right-4 top-4">
                        {blocked ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-rose-500 animate-pulse"></span>
                            Blocked
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-5 text-emerald-700 border border-emerald-200 shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-emerald-500"></span>
                            Active
                          </span>
                        )}
                      </div>

                      {/* Header Section */}
                      <div className="flex items-center mb-4 pr-20">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-tr from-[#134e97]/10 to-[#07adc5]/10 border border-[#134e97]/10 text-[#134e97] font-semibold text-sm mr-3 flex-shrink-0">
                          {getInitials(p.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-slate-800 truncate">
                            {p.name || "—"}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5 truncate max-w-full">
                            {p.email || "—"}
                          </div>
                        </div>
                      </div>

                      {/* Stat Metrics Grid */}
                      <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50/70 rounded-xl mb-4 text-center border border-[#134e97]/10">
                        <div>
                          <div className="text-xs text-slate-400">Cancels</div>
                          <div className={`text-sm font-bold mt-0.5 ${cancelCount >= PATIENT_CANCEL_THRESHOLD ? "text-red-600" : "text-slate-700"}`}>
                            {cancelCount}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">Reschedules</div>
                          <div className={`text-sm font-bold mt-0.5 ${rescheduleCount >= PATIENT_RESCHEDULE_THRESHOLD ? "text-amber-600" : "text-slate-700"}`}>
                            {rescheduleCount}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">Missed</div>
                          <div className={`text-sm font-bold mt-0.5 ${noShowCount >= PATIENT_NO_SHOW_THRESHOLD ? "text-red-600" : "text-slate-700"}`}>
                            {noShowCount}
                          </div>
                        </div>
                      </div>

                      {/* Card Contact details if available */}
                      {p.phone && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-4 bg-slate-50/30 px-3 py-1.5 rounded-lg border border-[#134e97]/10">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span>{p.phone}</span>
                        </div>
                      )}

                      {/* Action buttons footer */}
                      <div className="flex flex-wrap gap-2 pt-1 border-t border-[#134e97]/30">
                        <button
                          onClick={() => openDetailsModal(p._id)}
                          className="flex-1 px-3 py-2 rounded-full bg-white text-slate-700 text-xs font-semibold border border-slate-200 hover:bg-slate-50 transition-all shadow-sm"
                        >
                          Details
                        </button>

                        <button
                          onClick={() => handleResetCounts(p)}
                          className="flex-1 px-3 py-2 rounded-full text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
                        >
                          Reset
                        </button>

                        {blocked ? (
                          <button
                            onClick={() => handleUnblockAndReset(p)}
                            className="flex-1 px-3 py-2 rounded-full text-xs font-semibold bg-emerald-5 border border-emerald-500 text-emerald-700 hover:bg-emerald-100/70 transition-all shadow-sm"
                          >
                            Unblock
                          </button>
                        ) : (
                          <button
                            onClick={() => handleBlock(p)}
                            className="flex-1 px-3 py-2 rounded-full text-xs font-semibold bg-rose-50 border border-rose-500 text-rose-700 hover:bg-rose-100/70 transition-all shadow-sm"
                          >
                            Block
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* PAGINATION FOOTER CONTROLS */}
              {totalPages > 1 && (
                <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-semibold text-slate-500">
                  <div>
                    {itemsPerPage === 'all' ? (
                      `Showing all ${patients.length} patients`
                    ) : (
                      `Showing ${((currentPage - 1) * Number(itemsPerPage)) + 1} to ${Math.min(patients.length, currentPage * Number(itemsPerPage))} of ${patients.length} patients`
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                    >
                      Previous
                    </button>

                    {(() => {
                      const range = [];
                      const delta = 1;
                      for (let i = 1; i <= totalPages; i++) {
                        if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
                          range.push(i);
                        } else if (range[range.length - 1] !== "...") {
                          range.push("...");
                        }
                      }
                      return range;
                    })().map((pageNum, idx) => {
                      if (pageNum === "...") {
                        return <span key={`ellipsis-${idx}`} className="px-1.5 text-slate-400">...</span>;
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`px-3 py-1.5 rounded-lg border transition-all shadow-sm ${currentPage === pageNum ? "bg-[#134e97] text-white border-[#134e97]" : "border-slate-200 bg-white hover:bg-slate-50 text-slate-600"}`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}

                    <button
                      onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* ULTRA-PREMIUM GLASSMORPHIC DETAILS MODAL */}
      {detailModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          aria-modal="true"
          role="dialog"
        >
          {/* Blur backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300"
            onClick={closeDetailsModal}
          />

          <div className="relative w-full max-w-xl bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">

            {/* Modal header with gradient branding */}
            <div className="flex items-center justify-between px-6 py-4.5 bg-gradient-to-r from-[#134e97] to-[#013473] text-white">
              <h3 className="text-lg font-bold tracking-tight" style={{ fontFamily: HEADING_FONT }}>
                Patient Medical Record
              </h3>
              <button
                onClick={closeDetailsModal}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                disabled={detailActionLoading}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {detailLoading ? (
                <div className="py-16 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
                  <RefreshCw className="w-8 h-8 text-[#134e97] animate-spin" />
                  <span className="text-sm font-semibold">Retrieving secure dossier…</span>
                </div>
              ) : detailError ? (
                <div className="py-12 text-center text-rose-600 flex flex-col items-center justify-center gap-2">
                  <AlertTriangle className="w-10 h-10 text-rose-500" />
                  <span className="font-semibold">{detailError}</span>
                </div>
              ) : !detailPatient ? (
                <div className="py-12 text-center text-slate-400">
                  No records found.
                </div>
              ) : (
                <>
                  {/* Brief Header Card */}
                  <div className="flex items-center p-4 bg-slate-50 rounded-2xl border border-slate-100/50">
                    <div className="w-14 h-14 rounded-full flex items-center justify-center bg-gradient-to-tr from-[#134e97]/20 to-[#07adc5]/20 border border-[#134e97]/15 text-[#134e97] font-bold text-lg mr-4 flex-shrink-0 shadow-inner">
                      {getInitials(detailPatient.name)}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-base font-bold text-slate-800 truncate" style={{ fontFamily: HEADING_FONT }}>
                        {detailPatient.name || "—"}
                      </h4>
                      <p className="text-xs text-slate-400 truncate mt-0.5">{detailPatient.email || "—"}</p>
                    </div>
                  </div>

                  {/* Core Details Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4.5">

                    <div className="p-3.5 bg-slate-50/50 rounded-xl border border-slate-100 flex items-center gap-3">
                      <Phone className="w-4 h-4 text-slate-400" />
                      <div>
                        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Phone</div>
                        <div className="text-sm font-bold text-slate-700">{detailPatient.phone || "—"}</div>
                      </div>
                    </div>

                    <div className="p-3.5 bg-slate-50/50 rounded-xl border border-slate-100 flex items-center gap-3">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      <div>
                        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Age / DOB</div>
                        <div className="text-sm font-bold text-slate-700">
                          {detailPatient.age ?? "—"}
                          {detailPatient.dob
                            ? ` / ${new Date(detailPatient.dob).toLocaleDateString("en-IN")}`
                            : ""}
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Metrics Statistics row */}
                  <div>
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                      Operational Flags
                    </h5>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 text-center">
                        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Cancels</div>
                        <div className="text-lg font-bold text-slate-800 mt-1">
                          {displayCount(detailPatient.cancelCount ?? 0)}
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 text-center">
                        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Reschedules</div>
                        <div className="text-lg font-bold text-slate-800 mt-1">
                          {displayCount(detailPatient.rescheduleCount ?? 0)}
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 text-center">
                        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Missed</div>
                        <div className="text-lg font-bold text-slate-800 mt-1">
                          {displayCount(detailPatient.noShowCount ?? 0)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Blocked Status Block */}
                  <div className="pt-2">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                      System Status
                    </h5>

                    {detailPatient.isBlocked || isBlockedPatient(detailPatient) ? (
                      <div className="rounded-2xl p-4.5 border border-rose-200 bg-rose-50/40 text-rose-800 space-y-3">
                        <div className="flex items-center gap-2">
                          <ShieldAlert className="w-5 h-5 text-rose-600 flex-shrink-0" />
                          <span className="font-bold text-sm">Access Suspended</span>
                        </div>

                        <div className="text-xs text-rose-700 bg-rose-50 p-2 rounded-lg border border-rose-100">
                          <strong>Block Category:</strong> {blockedSource(detailPatient)}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1 border-t border-rose-100/50 text-rose-600">
                          <div>
                            <strong>Suspension Timestamp:</strong><br />
                            <span className="text-[11px] text-slate-500">
                              {detailPatient.blockedAt ? formatDateToKolkata(detailPatient.blockedAt) : "—"}
                            </span>
                          </div>
                          <div>
                            <strong>Enforcing Personnel:</strong><br />
                            <span className="text-[11px] text-slate-500">
                              {detailPatient.blockedByType ? `${detailPatient.blockedByType}` : "—"}
                              {detailPatient._blockerName ? ` (${detailPatient._blockerName})` : ""}
                            </span>
                          </div>
                        </div>

                        {(detailPatient._blockedReasonClean || detailPatient.blockedReason) && (
                          <div className="text-xs pt-2 border-t border-rose-100/50">
                            <strong>Reason:</strong>
                            <p className="mt-1 bg-white p-2.5 rounded-xl border border-rose-100 text-slate-600 italic whitespace-pre-wrap leading-relaxed shadow-sm">
                              {detailPatient._blockedReasonClean || detailPatient.blockedReason}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-2xl p-4 border border-emerald-200 bg-emerald-50/40 text-emerald-800 flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                        <div>
                          <span className="font-bold text-sm">Account Active</span>
                          <p className="text-[11px] text-emerald-600/80 mt-0.5">This patient possesses normal appointment booking privileges.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100 flex-wrap">
              <span className="text-[11px] text-slate-400 font-medium">Secure Connection Active</span>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleModalBlockToggle}
                  disabled={detailActionLoading || detailLoading}
                  className={`px-4 py-2 text-xs font-semibold rounded-full shadow-sm flex items-center gap-1.5 transition-all duration-300 hover:scale-102 disabled:opacity-50 ${detailPatient?.isBlocked || isBlockedPatient(detailPatient)
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-rose-600 hover:bg-rose-700 text-white"
                    }`}
                >
                  {detailActionLoading && (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  )}
                  {detailPatient?.isBlocked || isBlockedPatient(detailPatient)
                    ? "Unblock & Reset Access"
                    : "Suspend Privileges"}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {!hideFooter && <Footer />}
    </div>
  );
}
