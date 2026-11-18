// frontend/src/components/Dashboard/receptionist/ReceptionistAppointmentsTable.jsx
import React, { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { ArrowLeft, RefreshCcw, X } from "lucide-react";
import Swal from "sweetalert2";
import ReceptionistDashboardHeader from "./ReceptionistDashboardHeader";
import Footer from "@/components/HomePage/Footer";


const API = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

function isMissedStatus(status) {
  const s = String(status || "").toLowerCase().trim();
  const compact = s.replace(/\s+/g, "");
  return (
    compact === "noshow" ||
    s.includes("no show") ||
    s.includes("no-show") ||
    s === "missed" ||
    s === "expired"
  );
}

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

const CustomSelect = ({ value, onChange, options, placeholder, disabled, className, triggerClassName }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const selectedOption = options.find((opt) => String(opt.value) === String(value));
  const displayLabel = selectedOption ? selectedOption.label : (placeholder || "Select...");

  return (
    <div className={`relative inline-block w-full ${className || ""}`} ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-1 text-left transition-all duration-200 outline-none focus:ring-2 focus:ring-[#134e97]/20 disabled:opacity-50 disabled:cursor-not-allowed ${triggerClassName || ""}`}
      >
        <span className="truncate">{displayLabel}</span>
        <svg
          className={`w-4 h-4 ml-1 transition-transform duration-200 flex-shrink-0 ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && !disabled && (
        <div className="absolute left-0 w-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-1.5 max-h-60 overflow-y-auto space-y-0.5 animate-in fade-in duration-100">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3.5 py-2 text-xs md:text-sm rounded-xl hover:bg-[#134e97]/5 transition-colors ${
                String(value) === String(opt.value)
                  ? "bg-[#134e97]/10 font-semibold text-[#134e97]"
                  : "text-slate-700 hover:text-[#134e97]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const StatusSelectDropdown = ({ appointment, dropdown, handleStatusChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  if (dropdown.disabled) {
    const s = String(appointment.status || "").toLowerCase();
    let btnClasses = "border-slate-200 bg-slate-50 text-slate-400 opacity-60";
    if (s.includes("comp") || s === "completed") {
      btnClasses = "border-emerald-300 bg-emerald-50 text-emerald-800 font-semibold";
    } else if (s.includes("cancel")) {
      btnClasses = "border-red-300 bg-red-50 text-red-800 font-semibold";
    } else if (isMissedStatus(appointment.status)) {
      btnClasses = "border-orange-300 bg-orange-50 text-orange-800 font-semibold";
    }

    return (
      <div className={`rounded-full border shadow-sm w-full sm:w-full md:w-auto h-8 text-[11px] md:text-[12px] lg:text-sm px-4 cursor-not-allowed flex items-center justify-center ${btnClasses}`}>
        <span>{appointment.status}</span>
      </div>
    );
  }

  const isMissed = isMissedStatus(appointment.status);
  const isInProgress = dropdown.placeholder === "In-Progress";
  const isCompleted = String(appointment.status || "").toLowerCase().includes("comp");

  let triggerClasses = "border-[#134e97] text-[#134e97] bg-white hover:bg-[#134e97]/5";
  let arrowColor = "text-[#134e97]";

  if (isMissed) {
    triggerClasses = "border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 font-semibold";
    arrowColor = "text-orange-600";
  } else if (isInProgress) {
    triggerClasses = "border-purple-300 text-purple-700 bg-purple-50 hover:bg-purple-100 font-semibold";
    arrowColor = "text-purple-600";
  } else if (isCompleted) {
    triggerClasses = "border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-semibold";
    arrowColor = "text-emerald-600";
  }

  return (
    <div className="relative inline-block w-full sm:w-full md:w-auto" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`rounded-full border font-medium shadow-sm w-full sm:w-full md:w-auto h-8 text-[11px] md:text-[12px] lg:text-sm px-3 transition focus:outline-none focus:ring-2 focus:ring-[#134e97]/20 flex items-center justify-center gap-1 ${triggerClasses}`}
      >
        <span>{dropdown.placeholder}</span>
        <svg
          className={`w-3 h-3 ml-1 ${arrowColor} transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-full sm:w-full md:w-[130px] bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-1.5 space-y-0.5 animate-in fade-in duration-100">
          {dropdown.options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                handleStatusChange(appointment, opt);
                setIsOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-xs md:text-sm rounded-xl text-slate-700 hover:bg-[#134e97]/5 hover:text-[#134e97] transition-colors"
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const ReceptionistAppointmentsTable = () => {
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState([]);
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10); // 10, 25, 50, 100, 'all'
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({
    status: "",
    date: "",
    search: "",
    doctorId: "",
    patientId: "",
  });

  const [showFilters, setShowFilters] = useState(true);
  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);

  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);

  const [dateRange, setDateRange] = useState("today");
  const [specificDay, setSpecificDay] = useState("");
  const [isOnlineOnly, setIsOnlineOnly] = useState(false);
  const [isOfflineOnly, setIsOfflineOnly] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  const [reassigning, setReassigning] = useState(null);

  const [cancelModal, setCancelModal] = useState({
    open: false,
    apptId: null,
    reason: "",
    submitting: false,
    error: null,
  });

  const [allAppointments, setAllAppointments] = useState([]);

  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  async function load() {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      // keep any client filters that should go to server
      if (filters.search) params.append("search", filters.search);
      if (filters.date) params.append("date", filters.date);
      if (filters.status) params.append("status", filters.status);

      // DO NOT append doctorId/patientId here unless you want server to filter them
      // We'll keep doctor/patient filtering on the client (so "All Doctors" returns everything)
      // if (filters.doctorId) params.append("doctorId", filters.doctorId);
      // if (filters.patientId) params.append("patientId", filters.patientId);

      if (!params.has("limit")) params.append("limit", "1000");

      const qs = params.toString() ? `?${params.toString()}` : "";

      const candidates = [
        `${API}/api/receptionist/appointments${qs}`,
        `${API}/api/appointment/list${qs}`,
        `${API}/api/admin/appointments${qs}`,
        `${API}/api/appointment${qs}`,
      ];

      const res = await tryEndpoints(candidates, {
        headers: { "Content-Type": "application/json", ...authHeaders },
      });

      if (!res.ok) {
        throw new Error(res.lastErr || "Failed to fetch appointments");
      }

      const payload = res.json || {};
      let listAll = [];

      if (Array.isArray(payload)) listAll = payload;
      else if (Array.isArray(payload.appointments))
        listAll = payload.appointments;
      else if (Array.isArray(payload.data?.appointments))
        listAll = payload.data.appointments;
      else if (Array.isArray(payload.data)) listAll = payload.data;
      else listAll = [];

      // ---------- 1. base list ----------
      let finalAll = listAll || [];

      // ---------- 2. extra frontend filters for patient/doctor ----------
      if (filters.patientId) {
        finalAll = finalAll.filter((appt) => {
          const pid =
            appt?.patientId?._id ??
            appt?.patientId ??
            appt?.patient?._id ??
            appt?.patient ??
            null;
          return String(pid) === String(filters.patientId);
        });
      }

      if (filters.doctorId) {
        finalAll = finalAll.filter((appt) => {
          const did =
            appt?.doctorId?._id ??
            appt?.doctorId ??
            appt?.doctor?._id ??
            appt?.doctor ??
            null;
          return String(did) === String(filters.doctorId);
        });
      }

      // ---------- 3. dateRange (today/week/month/nextmonth/specific) ----------
      if (dateRange) {
        const nowDate = new Date();

        const startOf = (d) => {
          const x = new Date(d);
          x.setHours(0, 0, 0, 0);
          return x;
        };
        const endOf = (d) => {
          const x = new Date(d);
          x.setHours(23, 59, 59, 999);
          return x;
        };

        let rangeStart = null;
        let rangeEnd = null;

        if (dateRange === "today") {
          rangeStart = startOf(nowDate);
          rangeEnd = endOf(nowDate);
        } else if (dateRange === "tomorrow") {
          const tomorrow = new Date(nowDate);
          tomorrow.setDate(nowDate.getDate() + 1);
          rangeStart = startOf(tomorrow);
          rangeEnd = endOf(tomorrow);
        } else if (dateRange === "week") {
          const sunday = new Date(nowDate);
          sunday.setDate(nowDate.getDate() - nowDate.getDay());
          rangeStart = startOf(sunday);
          const saturday = new Date(sunday);
          saturday.setDate(sunday.getDate() + 6);
          rangeEnd = endOf(saturday);
        } else if (dateRange === "month") {
          const first = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1);
          const last = new Date(
            nowDate.getFullYear(),
            nowDate.getMonth() + 1,
            0
          );
          rangeStart = startOf(first);
          rangeEnd = endOf(last);
        } else if (dateRange === "nextmonth") {
          const nextFirst = new Date(
            nowDate.getFullYear(),
            nowDate.getMonth() + 1,
            1
          );
          const nextLast = new Date(
            nowDate.getFullYear(),
            nowDate.getMonth() + 2,
            0
          );
          rangeStart = startOf(nextFirst);
          rangeEnd = endOf(nextLast);
        } else if (dateRange === "specific") {
          const dayStr = filters.date || specificDay || "";
          if (dayStr) {
            const d = new Date(dayStr + "T00:00:00");
            rangeStart = startOf(d);
            rangeEnd = endOf(d);
          }
        }

        if (rangeStart && rangeEnd) {
          finalAll = finalAll.filter((appt) => {
            const rawDate =
              appt?.slotStartIso ??
              appt?.date ??
              appt?.start ??
              appt?.slotDate ??
              null;
            if (!rawDate) return false;
            const apptDate = new Date(rawDate);
            return apptDate >= rangeStart && apptDate <= rangeEnd;
          });
        }
      }

      // Filter by paymentMode if isOnlineOnly is active
      if (isOnlineOnly) {
        finalAll = finalAll.filter((appt) => {
          const mode = String(appt?.paymentMode || appt?.raw?.paymentMode || "").toLowerCase();
          return mode === "online";
        });
      }

      // Filter by paymentMode if isOfflineOnly is active
      if (isOfflineOnly) {
        finalAll = finalAll.filter((appt) => {
          const mode = String(appt?.paymentMode || appt?.raw?.paymentMode || "").toLowerCase();
          return mode !== "online";
        });
      }

      // ---------- 4. Sort by start time so page 1 is “recent first” ----------
      finalAll.sort((a, b) => {
        const aDate = new Date(
          a?.slotStartIso ?? a?.date ?? a?.start ?? a?.slotDate ?? 0
        );
        const bDate = new Date(
          b?.slotStartIso ?? b?.date ?? b?.start ?? b?.slotDate ?? 0
        );
        return bDate - aDate;
      });

      // ---------- 5. store full filtered list for summary counts ----------
      setAllAppointments(finalAll);

      // ---------- 6. client-side pagination ----------
      const totalCount = finalAll.length;
      setTotal(totalCount);

      if (itemsPerPage === 'all') {
        setAppointments(finalAll);
      } else {
        const numLimit = Number(itemsPerPage);
        const startIndex = (page - 1) * numLimit;
        const endIndex = startIndex + numLimit;
        const pageItems = finalAll.slice(startIndex, endIndex);
        setAppointments(pageItems);
      }
    } catch (err) {
      console.error("Failed to load appointments", err);
      setAppointments([]);
      setAllAppointments([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  function getStatusClasses(status) {
    const s = String(status || "").toLowerCase();
    if (isMissedStatus(status)) {
      return "bg-orange-100 text-orange-700";
    }
    if (s.includes("cancel")) {
      return "bg-red-100 text-red-700";
    }
    if (
      s.includes("reassign") ||
      s.includes("reassigned") ||
      s.includes("reassigning")
    ) {
      return "bg-indigo-100 text-indigo-700";
    }
    if (s.includes("comp") || s === "completed") {
      return "bg-emerald-100 text-emerald-700";
    }
    if (s.includes("sched") && !s.includes("resched")) {
      return "bg-blue-100 text-blue-700";
    }
    if (s.includes("resched") || s.includes("reschedule")) {
      return "bg-yellow-100 text-yellow-700";
    }
    if (
      s.includes("check") ||
      s.includes("in progress") ||
      s.includes("progress")
    ) {
      return "bg-purple-100 text-purple-700";
    }
    return "bg-gray-100 text-gray-700";
  }

  function getStatusAvatarClasses(status) {
    const s = String(status || "").toLowerCase();
    if (isMissedStatus(status)) {
      return "bg-orange-100 border-orange-300 text-orange-700";
    }
    if (s.includes("cancel")) {
      return "bg-red-100 border-red-300 text-red-700";
    }
    if (
      s.includes("reassign") ||
      s.includes("reassigned") ||
      s.includes("reassigning")
    ) {
      return "bg-indigo-100 border-indigo-300 text-indigo-700";
    }
    if (s.includes("comp") || s === "completed") {
      return "bg-emerald-100 border-emerald-300 text-emerald-700";
    }
    if (s.includes("sched") && !s.includes("resched")) {
      return "bg-blue-100 border-blue-300 text-blue-700";
    }
    if (s.includes("resched") || s.includes("reschedule")) {
      return "bg-yellow-100 border-yellow-300 text-yellow-700";
    }
    if (
      s.includes("check") ||
      s.includes("in progress") ||
      s.includes("progress")
    ) {
      return "bg-purple-100 border-purple-300 text-purple-700";
    }
    return "bg-gray-100 border-gray-300 text-gray-700";
  }

  function formatSlotRange(appt) {
    const startIso = appt?.slotStartIso ?? appt?.date ?? null;
    const endIso = appt?.slotEndIso ?? appt?.slotEnd ?? appt?.end ?? null;

    if (!startIso) return { dateStr: "—", timeStr: "" };

    const start = new Date(startIso);
    const end = endIso ? new Date(endIso) : null;

    const dateStr = start.toLocaleDateString();

    const timeOpts = {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    };

    const startTime = start.toLocaleTimeString([], timeOpts);
    const endTime = end ? end.toLocaleTimeString([], timeOpts) : null;
    const timeStr = endTime ? `${startTime} - ${endTime}` : startTime;

    return { dateStr, timeStr };
  }


  useEffect(() => {
    setPage(1);
  }, [filters, dateRange, itemsPerPage, isOnlineOnly, isOfflineOnly]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filters, dateRange, specificDay, itemsPerPage, isOnlineOnly, isOfflineOnly]);

  useEffect(() => {
    async function loadFiltersData() {
      try {
        const docCandidates = [
          `${API}/api/receptionist/doctors`,
          `${API}/api/admin/users?role=doctor&limit=200`,
          `${API}/api/admin/doctors?page=1&limit=200`,
          `${API}/api/doctor?page=1&limit=200`,
          `${API}/api/patient/doctors?page=1&limit=200`,
        ];
        const docRes = await tryEndpoints(docCandidates, {
          headers: { "Content-Type": "application/json", ...authHeaders },
        });
        const docJson = docRes.ok ? docRes.json : null;
        let docList = [];
        if (Array.isArray(docJson)) docList = docJson;
        else if (Array.isArray(docJson.data?.doctors))
          docList = docJson.data.doctors;
        else if (Array.isArray(docJson.users)) docList = docJson.users;
        else if (Array.isArray(docJson.data)) docList = docJson.data;
        else docList = [];

        const normalizedDocs = (docList || []).map((d) => {
          const raw = d || {};
          return {
            _id:
              raw._id ??
              raw.id ??
              raw.userId ??
              Math.random().toString(36).slice(2),
            name: raw.name ?? raw.fullName ?? raw.displayName ?? "Doctor",
            specialization: raw.specialization ?? "",
            raw,
          };
        });
        setDoctors(normalizedDocs);

        const patCandidates = [
          `${API}/api/receptionist/patients`,
          `${API}/api/patient/list`,
          `${API}/api/patients`,
        ];
        const patRes = await tryEndpoints(patCandidates, {
          headers: { "Content-Type": "application/json", ...authHeaders },
        });
        const patJson = patRes.ok ? patRes.json : null;
        let patList = [];
        if (Array.isArray(patJson)) patList = patJson;
        else if (Array.isArray(patJson.data?.patients))
          patList = patJson.data.patients;
        else if (Array.isArray(patJson.data)) patList = patJson.data;
        else patList = [];

        const normalizedPatients = (patList || []).map((p) => {
          const raw = p || {};
          return {
            _id:
              raw._id ??
              raw.id ??
              raw.userId ??
              raw.patientId ??
              Math.random().toString(36).slice(2),
            name:
              raw.name ??
              raw.fullName ??
              raw.displayName ??
              raw.patientName ??
              raw.user?.name ??
              "Patient",
            raw,
          };
        });

        setPatients(normalizedPatients);
      } catch (err) {
        console.error("Error loading doctors/patients", err);
      }
    }

    loadFiltersData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------ REASSIGN ------------------ */
  function openReassign(appt) {
    setReassigning({
      open: true,
      appointmentId: appt._id ?? appt.id,
      newDoctorId: "",
      submitting: false,
      originalAppt: appt,
    });

    if (!doctors || doctors.length === 0) {
      (async () => {
        try {
          const docCandidates = [
            `${API}/api/admin/users?role=doctor&limit=200`,
            `${API}/api/admin/doctors?page=1&limit=200`,
            `${API}/api/doctor?page=1&limit=200`,
            `${API}/api/receptionist/doctors`,
          ];
          const docRes = await tryEndpoints(docCandidates, {
            headers: { "Content-Type": "application/json", ...authHeaders },
          });
          const docJson = docRes.ok ? docRes.json : null;
          const docList =
            docJson?.data?.doctors ?? docJson?.users ?? docJson?.data ?? [];
          const normalizedDocs = (docList || []).map((d) => {
            const raw = d || {};
            return {
              _id:
                raw._id ??
                raw.id ??
                raw.userId ??
                Math.random().toString(36).slice(2),
              name: raw.name ?? raw.fullName ?? raw.displayName ?? "Doctor",
              specialization: raw.specialization ?? "",
              raw,
            };
          });
          setDoctors(normalizedDocs);
        } catch (e) {
          console.error("fetch doctors failed", e);
        }
      })();
    }
  }

  /* ------------------ RESCHEDULE ------------------ */
  function openRescheduleModal(appt) {
    const apptId = appt._id ?? appt.id;
    const doctorId = appt.doctorId?._id ?? appt.doctorId ?? appt.doctor?.id;

    if (!doctorId) {
      Swal.fire({
        icon: "error",
        title: "No doctor found",
        text: "Cannot open doctor's calendar for this appointment.",
      });
      return;
    }

    navigate(`/receptionist/doctor-calendar/${doctorId}`, {
      state: {
        mode: "reschedule",
        apptId,
        currentSlotStart: appt.slotStartIso || appt.date,
        currentSlotEnd: appt.slotEndIso || null,
        from: location?.pathname || "/receptionist/appointments",
      },
    });
  }

  /* ------------------ CANCEL ------------------ */
  function openCancelModal(appt) {
    setCancelModal({
      open: true,
      apptId: appt._id ?? appt.id,
      reason: "",
      submitting: false,
      error: null,
    });
  }

  async function submitCancel() {
    const { apptId, reason } = cancelModal;
    if (!apptId) return;
    if (!reason || !reason.trim()) {
      setCancelModal((s) => ({
        ...s,
        error: "Cancellation reason is required",
      }));
      return;
    }

    setCancelModal((s) => ({ ...s, submitting: true, error: null }));

    try {
      const url = `${API}/api/appointment/cancel/${apptId}`;
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ reason: reason.trim() }),
      });

      const txt = await res.text().catch(() => "");
      let payload;
      try {
        payload = txt ? JSON.parse(txt) : null;
      } catch (e) {
        payload = txt;
      }

      if (!res.ok) {
        const msg =
          (payload && (payload.message || payload.error)) ||
          (typeof payload === "string" ? payload : txt) ||
          `HTTP ${res.status} ${res.statusText}`;
        throw new Error(msg);
      }

      const updated = payload?.data ?? payload?.appointment ?? payload;

      if (updated) {
        setAppointments((prev) =>
          prev.map((a) => (String(a._id) === String(apptId) ? updated : a))
        );
      } else {
        await load();
      }

      setCancelModal({
        open: false,
        apptId: null,
        reason: "",
        submitting: false,
        error: null,
      });

      Swal.fire({
        icon: "success",
        title: "Cancelled",
        text: "Appointment cancelled successfully",
        timer: 1600,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error("submitCancel error:", err);
      setCancelModal((s) => ({
        ...s,
        submitting: false,
        error: err.message || "Cancel failed",
      }));
      Swal.fire({
        icon: "error",
        title: "Cancel failed",
        text: (err?.message || String(err)) + "\n(see console for details)",
      });
    }
  }

  /* ------------------ Status helpers  ------------------ */
  const handleCheckIn = async (id) => {
    if (!id) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API}/api/receptionist/appointments/${id}/checkin`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await res.json().catch(() => null);
      if (data?.status === "success") {
        await Swal.fire({
          icon: "success",
          title: "Checked in",
          text: "Patient checked in successfully",
          timer: 1400,
          showConfirmButton: false,
        });
        await load();
      } else {
        await Swal.fire({
          icon: "error",
          title: "Check-in failed",
          text: data?.message || "Failed to check-in",
        });
      }
    } catch (err) {
      console.error("handleCheckIn error:", err);
      await Swal.fire({
        icon: "error",
        title: "Error",
        text: err?.message || "Error checking in",
      });
    }
  };

  const handleComplete = async (id) => {
    if (!id) return;

    const result = await Swal.fire({
      title: "Mark as Completed?",
      text: "Are you sure you want to mark this appointment as completed?",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, complete",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API}/api/receptionist/appointments/${id}/complete`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json().catch(() => null);
      if (data?.status === "success") {
        await Swal.fire({
          icon: "success",
          title: "Completed",
          text: "Appointment marked completed",
          timer: 1400,
          showConfirmButton: false,
        });
        await load();
      } else {
        await Swal.fire({
          icon: "error",
          title: "Failed",
          text: data?.message || "Failed to complete",
        });
      }
    } catch (err) {
      console.error("handleComplete error:", err);
      await Swal.fire({
        icon: "error",
        title: "Error",
        text: err?.message || "Error completing appointment",
      });
    }
  };

  const handleStatusChange = async (appointment, newStatus) => {
    if (!appointment || !newStatus) return;
    if (appointment.status === newStatus) return;

    const prevStatus = appointment.status || "";
    const isFromCompleted = String(prevStatus).toLowerCase().includes("comp");
    const isFromInProgress =
      String(prevStatus).toLowerCase().includes("progress") ||
      String(prevStatus).toLowerCase().includes("check");
    const normalized = String(newStatus || "").toLowerCase();

    if (isFromCompleted) {
      const confirmResult = await Swal.fire({
        title: "Revert Status?",
        text: `Are you sure you want to change status from Completed back to "${newStatus}"?`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#134e97",
        confirmButtonText: `Yes, change to ${newStatus}`,
        cancelButtonText: "Cancel",
      });
      if (!confirmResult.isConfirmed) return;
    } else if (isFromInProgress && normalized === "scheduled") {
      const confirmResult = await Swal.fire({
        title: "Revert Check-In?",
        text: `Are you sure you want to revert this appointment back to "Scheduled"?`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#134e97",
        confirmButtonText: "Yes, revert to Scheduled",
        cancelButtonText: "Cancel",
      });
      if (!confirmResult.isConfirmed) return;
    }
    if (normalized === "cancelled" || normalized === "cancel") {
      openCancelModal(appointment);
      return;
    }
    if (
      normalized === "check-in" ||
      normalized === "checked-in" ||
      normalized === "checked in"
    ) {
      await handleCheckIn(appointment._id);
      return;
    }
    if (normalized === "rescheduled") {
      openRescheduleModal(appointment);
      return;
    }
    if (normalized === "completed") {
      await handleComplete(appointment._id);
      return;
    }

    // fallback: send status update to API (Scheduled, In-Progress, Missed, etc.)
    try {
      const res = await fetch(
        `${API}/api/receptionist/appointments/${appointment._id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ status: newStatus }),
        }
      );
      const json = await res.json().catch(() => null);
      if (json?.status === "success") {
        await Swal.fire({
          icon: "success",
          title: "Status updated",
          text: `Appointment marked as ${newStatus}`,
          timer: 1400,
          showConfirmButton: false,
        });
        await load();
      } else {
        Swal.fire({
          icon: "error",
          title: "Failed to update status",
          text: json?.message || "",
        });
      }
    } catch (err) {
      console.error("Status update error:", err);
      Swal.fire({ icon: "error", title: "Failed to update status" });
    }
  };

  /* ---------- STATUS OPTIONS ----------*/
  const getDropdownState = (currentStatus) => {
    const s = String(currentStatus || "")
      .toLowerCase()
      .trim();
    const compact = s.replace(/\s+/g, "");
    if (s.includes("comp") || s === "completed") {
      return {
        disabled: false,
        placeholder: "Completed",
        options: ["Scheduled", "In-Progress", "Missed", "Cancelled"],
      };
    }
    if (s.includes("cancel")) {
      return { disabled: true, placeholder: "Cancelled", options: [] };
    }
    if (
      s.includes("check") ||
      s.includes("in progress") ||
      compact === "inprogress"
    ) {
      return {
        disabled: false,
        placeholder: "In-Progress",
        options: ["Completed", "Scheduled"],
      };
    }
    if (isMissedStatus(currentStatus)) {
      return {
        disabled: false,
        placeholder: "Missed",
        options: ["Check-In", "Completed"],
      };
    }
    return {
      disabled: false,
      placeholder: "Status",
      options: ["Check-In", "Missed", "Completed"],
    };
  };

  /* --------- STATUS COUNTS --------- */
  const statusCounts = useMemo(() => {
    const source =
      allAppointments && allAppointments.length > 0
        ? allAppointments
        : appointments;
    const counts = {
      total: source.length,
      scheduled: 0,
      rescheduled: 0,
      reassigned: 0,
      cancelled: 0,
      inProgress: 0,
      noShow: 0,
      completed: 0,
    };

    (source || []).forEach((a) => {
      const raw = String(a.status || "")
        .toLowerCase()
        .trim();
      const compact = raw.replace(/\s+/g, "");

      if (!raw) return;

      if (
        compact === "noshow" ||
        raw.includes("no show") ||
        raw.includes("no-show") ||
        raw === "missed" ||
        raw === "expired"
      ) {
        counts.noShow += 1;
      } else if (raw.includes("cancel")) {
        counts.cancelled += 1;
      } else if (raw.includes("reassign")) {
        counts.reassigned += 1;
      } else if (raw.includes("resched")) {
        counts.rescheduled += 1;
      } else if (raw.includes("comp") || raw === "completed") {
        counts.completed += 1;
      } else if (
        raw.includes("check") ||
        raw.includes("in progress") ||
        raw.includes("progress")
      ) {
        counts.inProgress += 1;
      } else if (raw.includes("sched")) {
        counts.scheduled += 1;
      }
    });

    return counts;
  }, [allAppointments, appointments]);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-[#134e97]/5 to-[#06adc6]/5" style={{ fontFamily: "'roboto-regular', 'Roboto', sans-serif" }}>
      <ReceptionistDashboardHeader />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 mt-6">
        {/* Heading */}
        <Card className="p-4 sm:p-6 bg-white rounded-2xl shadow-md mb-6 border-0">
          <div className="flex items-center justify-between gap-3">
            {/* LEFT: Back button */}
            <div className="flex items-center">
              <Button
                onClick={() => navigate("/receptionist/dashboard")}
                variant="outline"
                className="flex items-center gap-2 bg-white text-gray-700 border border-slate-200 hover:border-[#134e97]/30 hover:bg-[#134e97]/5 transition duration-200 rounded-full px-3 py-1.5 sm:px-5 sm:py-2"
                aria-label="Back to dashboard">
                <ArrowLeft size={18} />
                <span className="hidden sm:inline">Back</span>
              </Button>
            </div>

            {/* CENTER: Page title */}
            <div className="flex-1 text-center">
              <h2 className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-800" style={{ fontFamily: "'mirador-medium', 'Outfit', sans-serif" }}>
                Appointments
              </h2>
            </div>

            {/* RIGHT: per-page select */}
            <div className="flex items-center gap-1.5 shrink-0">
              <label htmlFor="receptionistPerPageSelect" className="text-xs font-semibold text-slate-500 hidden sm:inline">
                Show:
              </label>
              <select
                id="receptionistPerPageSelect"
                value={itemsPerPage}
                onChange={(e) => {
                  const val = e.target.value === "all" ? "all" : Number(e.target.value);
                  setItemsPerPage(val);
                  setPage(1);
                }}
                className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-full text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] transition-all cursor-pointer shadow-sm"
              >
                <option value={10}>10 per page</option>
                <option value={25}>25 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
                <option value="all">All entries</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Filters card (hidden by default) */}
        {showFilters && (
          <Card className="p-3 sm:p-4 md:p-5 lg:p-6 rounded-3xl shadow-xl bg-white/95 backdrop-blur-xl border border-slate-200 border-t-4 border-t-[#134e97] mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 md:gap-4 lg:gap-6 xl:gap-8">
              <div className="flex flex-col gap-1 lg:col-span-1">
                <CustomSelect
                  value={filters.doctorId}
                  onChange={(val) =>
                    setFilters((f) => ({
                      ...f,
                      doctorId: val,
                      patientId: "",
                    }))
                  }
                  options={[
                    { value: "", label: "All Doctors" },
                    ...doctors.map((d) => ({ value: d._id, label: d.name })),
                  ]}
                  triggerClassName="w-full px-4 py-2 border border-slate-200 rounded-full bg-gray-50 shadow-sm text-gray-700 text-sm focus:border-[#134e97]"
                />
              </div>

              {/* Patient search (no label) */}
              <div className="flex flex-col gap-1 lg:col-span-2 relative">
                <div className="flex items-center border border-slate-200 focus-within:ring-2 focus-within:ring-[#134e97]/20 focus-within:border-[#134e97] rounded-full overflow-hidden bg-white shadow-sm transition">
                  <input
                    className="flex-grow min-w-0 px-4 py-2 bg-transparent outline-none"
                    placeholder="Search Patient by Name, Email or Mobile Number"
                    value={patientSearch}
                    onChange={(e) => {
                      setPatientSearch(e.target.value);
                      if (selectedPatient) {
                        setSelectedPatient(null);
                        setFilters((f) => ({ ...f, patientId: "" }));
                      }
                    }}
                  />
                  {(patientSearch || selectedPatient) && (
                    <button
                      onClick={() => {
                        setPatientSearch("");
                        setSelectedPatient(null);
                        setFilters((f) => ({ ...f, patientId: "" }));
                      }}
                      className="px-3 text-sm text-gray-500 hover:text-red-500 font-medium transition"
                      type="button">
                      Clear
                    </button>
                  )}
                </div>

                {patientSearch ? (
                  <div className="absolute left-0 right-0 top-full mt-1.5 border border-slate-200 rounded-2xl bg-white shadow-xl max-h-56 overflow-y-auto p-1.5 space-y-0.5 z-50 animate-in fade-in duration-100">
                    {patients
                      .filter((p) => {
                        const name = String(p.raw?.name ?? p.name ?? "")
                          .toLowerCase()
                          .replace(/\s+/g, "");
                        const email = String(
                          p.raw?.email ?? p.raw?.user?.email ?? ""
                        )
                          .toLowerCase()
                          .replace(/\s+/g, "");
                        const phone = String(
                          p.raw?.phone ?? p.raw?.user?.phone ?? ""
                        )
                          .toLowerCase()
                          .replace(/\s+/g, "");

                        const combined = `${name} ${email} ${phone}`;
                        const term = patientSearch
                          .toLowerCase()
                          .replace(/\s+/g, "");

                        return combined.includes(term);
                      })
                      .map((p) => (
                        <div
                          key={p._id}
                          onClick={() => {
                            setSelectedPatient(p);
                            setPatientSearch("");
                            setFilters((f) => ({
                              ...f,
                              patientId: p._id,
                              doctorId: "",
                            }));
                          }}
                          className="p-3 cursor-pointer hover:bg-[#134e97]/5 rounded-xl transition flex justify-between items-center">
                          <div>
                            <p className="font-semibold text-gray-800">
                              {p.name}
                            </p>
                            <p className="text-sm text-gray-600">
                              {p.raw?.phone ?? ""}
                            </p>
                            <p className="text-xs text-gray-500">
                              {p.raw?.email ?? ""}
                            </p>
                          </div>
                        </div>
                      ))}

                    {patients.filter((p) => {
                      const name = String(p.raw?.name ?? p.name ?? "")
                        .toLowerCase()
                        .replace(/\s+/g, "");
                      const email = String(
                        p.raw?.email ?? p.raw?.user?.email ?? ""
                      )
                        .toLowerCase()
                        .replace(/\s+/g, "");
                      const phone = String(
                        p.raw?.phone ?? p.raw?.user?.phone ?? ""
                      )
                        .toLowerCase()
                        .replace(/\s+/g, "");

                      const combined = `${name} ${email} ${phone}`;
                      const term = patientSearch
                        .toLowerCase()
                        .replace(/\s+/g, "");

                      return combined.includes(term);
                    }).length === 0 && (
                      <p className="p-3 text-gray-500 text-sm">
                        No results found
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    {selectedPatient && (
                      <div className="px-4 py-2 rounded-full bg-[#134e97]/5 border border-[#134e97]/15">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-[#134e97]">
                              {selectedPatient.name}
                            </p>
                            <p className="text-sm text-gray-600">
                              {selectedPatient.raw?.phone ?? ""}
                            </p>
                          </div>

                          <button
                            onClick={() => {
                              setSelectedPatient(null);
                              setFilters((f) => ({ ...f, patientId: "" }));
                            }}
                            className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-50 hover:bg-red-100 text-red-600 transition">
                            Remove
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Date range */}
              <div className="flex flex-col gap-1 lg:col-span-1">
                <CustomSelect
                  value={dateRange}
                  onChange={(val) => {
                    setDateRange(val);
                    if (val !== "specific") {
                      setSpecificDay("");
                      setFilters((f) => ({ ...f, date: "" }));
                    }
                  }}
                  options={[
                    { value: "all", label: "All" },
                    { value: "today", label: "Today" },
                    { value: "tomorrow", label: "Tomorrow" },
                    { value: "week", label: "This Week" },
                    { value: "month", label: "This Month" },
                    { value: "nextmonth", label: "Next Month" },
                    { value: "specific", label: "Specific Day" },
                  ]}
                  triggerClassName="w-full px-4 py-2 border border-slate-200 rounded-full bg-gray-50 shadow-sm text-gray-700 text-sm focus:border-[#134e97]"
                />
              </div>

              {/* Online / Offline Filter Buttons */}
              <div className="lg:col-span-1 flex items-end h-[38px]">
                <div className="grid grid-cols-2 gap-2 w-full">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isOnlineOnly;
                      setIsOnlineOnly(next);
                      setIsOfflineOnly(false);
                      if (next) {
                        setDateRange("all");
                      } else {
                        setDateRange("today");
                      }
                    }}
                    className={`px-3 py-2 border rounded-full text-xs md:text-sm font-semibold transition-all duration-200 shadow-sm flex items-center justify-center gap-1.5 h-[38px] ${
                      isOnlineOnly
                        ? "bg-[#134e97] text-white border-[#134e97] hover:bg-[#013473]"
                        : "bg-gray-50 text-gray-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${isOnlineOnly ? "bg-white animate-pulse" : "bg-[#06adc6]"}`}></span>
                    Online
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isOfflineOnly;
                      setIsOfflineOnly(next);
                      setIsOnlineOnly(false);
                      if (next) {
                        setDateRange("all");
                      } else {
                        setDateRange("today");
                      }
                    }}
                    className={`px-3 py-2 border rounded-full text-xs md:text-sm font-semibold transition-all duration-200 shadow-sm flex items-center justify-center gap-1.5 h-[38px] ${
                      isOfflineOnly
                        ? "bg-[#134e97] text-white border-[#134e97] hover:bg-[#013473]"
                        : "bg-gray-50 text-gray-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${isOfflineOnly ? "bg-white animate-pulse" : "bg-orange-500"}`}></span>
                    Offline
                  </button>
                </div>
              </div>

              {/* Specific Day Field */}
              <div className="flex flex-col gap-1 lg:col-span-1">
                {dateRange === "specific" && (
                  <input
                    type="date"
                    value={specificDay}
                    onChange={(e) => {
                      setSpecificDay(e.target.value);
                      setFilters((f) => ({ ...f, date: e.target.value }));
                    }}
                    className="px-4 py-2 border border-slate-200 rounded-full bg-white shadow-sm outline-none focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] transition"
                  />
                )}
              </div>
            </div>
            {/* STATUS SUMMARY INSIDE FILTERS — TOP */}
            <div className="mb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 mt-4 gap-3 text-sm">
                <div className="flex items-center justify-center text-center px-3 py-2 rounded-full bg-slate-50/50 border border-slate-200 shadow-xs">
                  <span className="text-sm font-semibold text-slate-800">
                    Total: {statusCounts.total}
                  </span>
                </div>

                <div className="flex items-center justify-center text-center px-3 py-2 rounded-full bg-blue-50/30 border border-blue-200 shadow-xs">
                  <span className="text-sm font-semibold text-blue-800">
                    Scheduled: {statusCounts.scheduled}
                  </span>
                </div>

                <div className="flex items-center justify-center text-center px-3 py-2 rounded-full bg-yellow-50/30 border border-yellow-200 shadow-xs">
                  <span className="text-sm font-semibold text-yellow-800">
                    Rescheduled: {statusCounts.rescheduled}
                  </span>
                </div>

                <div className="flex items-center justify-center text-center px-3 py-2 rounded-full bg-indigo-50/30 border border-indigo-200 shadow-xs">
                  <span className="text-sm font-semibold text-indigo-800">
                    Reassigned: {statusCounts.reassigned}
                  </span>
                </div>

                <div className="flex items-center justify-center text-center px-3 py-2 rounded-full bg-red-50/30 border border-red-200 shadow-xs">
                  <span className="text-sm font-semibold text-red-800">
                    Cancelled: {statusCounts.cancelled}
                  </span>
                </div>

                <div className="flex items-center justify-center text-center px-3 py-2 rounded-full bg-purple-50/30 border border-purple-200 shadow-xs">
                  <span className="text-sm font-semibold text-purple-800">
                    In-Progress: {statusCounts.inProgress}
                  </span>
                </div>

                <div className="flex items-center justify-center text-center px-3 py-2 rounded-full bg-orange-50/30 border border-orange-200 shadow-xs">
                  <span className="text-sm font-semibold text-orange-800">
                    Missed: {statusCounts.noShow}
                  </span>
                </div>

                <div className="flex items-center justify-center text-center px-3 py-2 rounded-full bg-emerald-50/30 border border-emerald-200 shadow-xs">
                  <span className="text-sm font-semibold text-emerald-800">
                    Completed: {statusCounts.completed}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Appointments list */}
        <Card className="p-3 md:p-4 lg:p-6 rounded-3xl shadow-xl bg-white border-0">
          {loading ? (
            <div className="py-20 text-center text-gray-500 text-lg">
              Loading appointments...
            </div>
          ) : appointments.length === 0 ? (
            <div className="py-14 text-center text-gray-500 text-lg">
              No appointments found
            </div>
          ) : (
            <div className="space-y-4">
              {appointments.map((a) => {
                const dropdown = getDropdownState(a.status);
                return (
                  <div
                    key={a._id ?? a.id}
                    className="rounded-2xl border border-slate-100 p-3 md:p-4 lg:p-5 bg-gradient-to-br from-white to-gray-50 hover:shadow-xl transition-all shadow-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:flex md:flex-row md:items-center gap-2 md:gap-5 lg:gap-6">
                      {/* LEFT: avatar + details + date/time + badge */}
                      <div className="order-1 sm:order-1 md:order-1 flex flex-col md:flex-1 md:flex-row md:items-center gap-2 md:gap-4">
                        <div className="flex-shrink-0 mx-auto md:mx-0">
                          <div
                            className={`rounded-full flex items-center justify-center shadow-md
                              w-14 h-14 md:w-12 md:h-12 lg:w-16 lg:h-16
                              text-base md:text-base lg:text-xl font-bold ${getStatusAvatarClasses(
                                a.status
                              )}`}>
                            {a.patientId?.name?.charAt(0)?.toUpperCase() || "?"}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 text-center md:text-left">
                          <div className="flex flex-col md:flex-row md:justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="font-semibold text-gray-900 truncate text-lg md:text-base lg:text-lg">
                                {a.patientId?.name || a.patientName}
                              </h3>

                              <p className="truncate text-gray-500 text-sm md:text-xs lg:text-sm text-center md:text-left mt-1">
                                {a.reason || "No Symptoms Given"}
                              </p>

                              <p className="truncate text-[#134e97] mt-1 text-sm md:text-[11px] lg:text-sm text-center md:text-left">
                                Dr. {a.doctorId?.name}
                              </p>
                            </div>
                            {(() => {
                              const { dateStr, timeStr } = formatSlotRange(a);
                              return (
                                <div className="flex items-center justify-center mt-2 md:mt-5 lg:mt-6 min-w-0">
                                  <div className="flex flex-col items-center justify-center leading-tight">
                                    <span className="block text-[10px] sm:text-[11px] md:text-xs lg:text-sm font-semibold text-slate-800 text-center">
                                      {dateStr}
                                    </span>
                                    <span className="block text-[9px] sm:text-[10px] md:text-[11px] lg:text-xs text-gray-500 text-center mt-0.5">
                                      {timeStr}
                                    </span>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>

                          {/* STATUS BADGE */}
                          <div className="mt-2 md:mt-3 text-center md:text-left">
                            <Badge
                              variant="outline"
                              className={`rounded-xl border-transparent text-sm md:text-xs lg:text-sm px-3 py-1 md:px-2.5 md:py-1 ${getStatusClasses(
                                a.status
                              )}`}>
                              {a.status}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      {/* RIGHT: actions + status dropdown */}
                      <div className="order-2 sm:order-2 md:order-2 flex items-center justify-center md:justify-end md:items-center">
                        <div className="flex flex-col gap-2 items-center md:flex-row md:items-center md:gap-3">
                          <div className="flex flex-col gap-2 w-full sm:w-auto md:flex-row md:w-auto md:items-center">
                            {(() => {
                              const s = String(a.status || "").toLowerCase();
                              if (
                                ["cancelled", "completed"].includes(s)
                              ) {
                                return null;
                              }

                              return (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() => openRescheduleModal(a)}
                                    className="text-[#134e97] border border-[#134e97] bg-white hover:bg-[#134e97]/5 shadow-sm w-full sm:w-full md:w-auto h-8 px-3 text-[11px] md:text-[12px] lg:text-sm rounded-full transition-all duration-200 flex items-center justify-center">
                                    Reschedule
                                  </Button>

                                  <Button
                                    size="sm"
                                    onClick={() => openCancelModal(a)}
                                    className="text-red-500 border border-red-500 bg-white hover:bg-red-50 shadow-sm w-full sm:w-full md:w-auto h-8 px-3 text-[11px] md:text-[12px] lg:text-sm rounded-full transition-all duration-200 flex items-center justify-center">
                                    Cancel
                                  </Button>

                                  <Button
                                    size="sm"
                                    onClick={() => openReassign(a)}
                                    className="text-purple-600 border border-purple-600 bg-white hover:bg-purple-50 shadow-sm w-full sm:w-full md:w-auto h-8 px-3 text-[11px] md:text-[12px] lg:text-sm rounded-full transition-all duration-200 flex items-center justify-center">
                                    Reassign
                                  </Button>
                                </>
                              );
                            })()}
                          </div>

                          {/* STATUS DROPDOWN */}
                          <StatusSelectDropdown
                            appointment={a}
                            dropdown={dropdown}
                            handleStatusChange={handleStatusChange}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Pagination */}
        {total > (itemsPerPage === 'all' ? Infinity : Number(itemsPerPage)) && (
          <div className="mt-6 mb-12 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-semibold text-slate-500 bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div>
              {itemsPerPage === 'all' ? (
                `Showing all ${total} appointments`
              ) : (
                `Showing ${((page - 1) * Number(itemsPerPage)) + 1} to ${Math.min(total, page * Number(itemsPerPage))} of ${total} appointments`
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  if (page > 1) setPage((p) => p - 1);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                disabled={page <= 1}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                Previous
              </button>

              {(() => {
                const totalPages = Math.max(1, Math.ceil(total / Number(itemsPerPage)));
                const range = [];
                const delta = 1;
                for (let i = 1; i <= totalPages; i++) {
                  if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
                    range.push(i);
                  } else if (range[range.length - 1] !== "...") {
                    range.push("...");
                  }
                }
                return range.map((pageNum, idx) => {
                  if (pageNum === "...") {
                    return <span key={`ellipsis-${idx}`} className="px-1.5 text-slate-400">...</span>;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => {
                        setPage(pageNum);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className={`px-3 py-1.5 rounded-lg border transition-all shadow-sm ${page === pageNum ? "bg-[#134e97] text-white border-[#134e97]" : "border-slate-200 bg-white hover:bg-slate-50 text-slate-600"}`}
                    >
                      {pageNum}
                    </button>
                  );
                });
              })()}

              <button
                onClick={() => {
                  const totalPages = Math.max(1, Math.ceil(total / Number(itemsPerPage)));
                  if (page < totalPages) setPage((p) => p + 1);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                disabled={page >= Math.ceil(total / Number(itemsPerPage))}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Reassign modal */}
        {reassigning && reassigning.open && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 transition-all duration-300">
            <div className="relative bg-white rounded-3xl border border-slate-100 shadow-2xl shadow-[#134e97]/10 w-full max-w-lg mx-auto p-5 sm:p-7 max-h-[90vh] overflow-y-auto">
              {/* Close icon (top-right, red, inside modal) */}
              <button
                onClick={() => setReassigning(null)}
                aria-label="Close reassign modal"
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-red-50 flex items-center justify-center hover:bg-red-100 text-red-500 shadow-sm transition-colors focus:outline-none">
                <X size={16} />
              </button>

              <div className="mb-4">
                <h3 className="text-lg sm:text-xl font-semibold text-slate-800 font-display">
                  Reassign Appointment
                </h3>
              </div>

              <div className="space-y-3">
                {(() => {
                  const currentDoctorId =
                    reassigning.originalAppt?.doctorId?._id ??
                    reassigning.originalAppt?.doctorId ??
                    reassigning.originalAppt?.doctor?.id ??
                    null;

                  const otherDoctors = (doctors || []).filter(
                    (d) =>
                      String(d._id) !== String(currentDoctorId) &&
                      (d.raw?.googleCalendar?.isConnected || d.raw?.googleCalendar?.connected)
                  );

                  const options = otherDoctors.map((d) => ({
                    value: d._id,
                    label: `${d.name}${d.specialization ? ` — ${d.specialization}` : ""}`,
                  }));

                  return (
                    <CustomSelect
                      value={reassigning.newDoctorId}
                      onChange={(val) =>
                        setReassigning((p) => ({
                          ...p,
                          newDoctorId: val,
                        }))
                      }
                      placeholder={otherDoctors.length ? "Select Doctor" : "No other doctors available"}
                      disabled={!otherDoctors.length}
                      options={options}
                      triggerClassName="w-full mt-2 px-3 py-2.5 border border-slate-200 rounded-full bg-white text-sm focus:border-[#134e97]"
                    />
                  );
                })()}

                {reassigning.error && (
                  <div className="text-sm text-red-600 font-medium">
                    {reassigning.error}
                  </div>
                )}

                {reassigning.newDoctorId && (
                  <div className="mt-4">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        onClick={() => {
                          const appt = reassigning.originalAppt || {};
                          const currentSlotStart =
                            appt.slotStartIso || appt.date || null;
                          const currentSlotEnd = appt.slotEndIso || null;

                          navigate(
                            `/receptionist/doctor-calendar/${reassigning.newDoctorId}`,
                            {
                              state: {
                                mode: "reassign",
                                apptId: reassigning.appointmentId,
                                currentSlotStart,
                                currentSlotEnd,
                                from:
                                  location?.pathname ||
                                  "/receptionist/appointments",
                              },
                            }
                          );
                          setReassigning(null);
                        }}
                        className="w-full sm:w-auto px-5 py-2.5 rounded-full bg-[#134e97] text-white hover:bg-[#013473] font-medium text-sm transition-all duration-300 hover:scale-[1.02] shadow-md shadow-[#134e97]/10 focus:outline-none">
                        Check Availability
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Cancel modal */}
        {cancelModal.open && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 transition-all duration-300">
            <div className="relative bg-white rounded-3xl border border-slate-100 shadow-2xl shadow-red-950/5 w-full max-w-md mx-auto p-5 sm:p-7 max-h-[90vh] overflow-y-auto">
              {/* Close Icon (replaces back button) */}
              <button
                onClick={() =>
                  setCancelModal({
                    open: false,
                    apptId: null,
                    reason: "",
                    submitting: false,
                    error: null,
                  })
                }
                aria-label="Close cancel modal"
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-red-50 flex items-center justify-center hover:bg-red-100 text-red-500 shadow-sm transition-colors focus:outline-none">
                <X size={16} />
              </button>

              <h3 className="text-lg sm:text-xl font-semibold text-slate-800 font-display mb-2">Cancel Appointment</h3>

              <div className="space-y-3">
                <textarea
                  value={cancelModal.reason}
                  onChange={(e) =>
                    setCancelModal((s) => ({ ...s, reason: e.target.value }))
                  }
                  placeholder="Enter reason for cancellation..."
                  className="w-full mt-2 p-3 border border-slate-200 rounded-xl resize-y min-h-[80px] text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition"
                  rows={4}
                />

                {cancelModal.error && (
                  <div className="text-sm text-red-600 font-medium">
                    {cancelModal.error}
                  </div>
                )}
              </div>

              <div className="mt-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3">
                <button
                  disabled={cancelModal.submitting}
                  onClick={submitCancel}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-full bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-all duration-300 hover:scale-[1.02] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-md shadow-red-600/10 focus:outline-none">
                  {cancelModal.submitting ? "Cancelling..." : "Cancel"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default ReceptionistAppointmentsTable;
