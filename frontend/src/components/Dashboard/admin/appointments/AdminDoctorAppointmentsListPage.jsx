import React, { useEffect, useState, useMemo, useRef } from "react";
import { Link, useParams, useLocation, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { X } from "lucide-react";
import { getImageUrl } from "@/utils/imageUrl";
import Footer from "@/components/HomePage/Footer";

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

/* --- helper functions (unchanged) --- */
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

function unwrapAppointments(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.appointments)) return json.appointments;
  if (Array.isArray(json.data?.appointments)) return json.data.appointments;
  if (Array.isArray(json.data)) return json.data;
  if (json.status === "success" && Array.isArray(json.data?.appointments))
    return json.data.appointments;
  return [];
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

function badgeClass(status) {
  const s = (status || "").toLowerCase();

  if (s.includes("resched")) {
    return "bg-purple-50 text-purple-700 border border-purple-200";
  }
  if (s.includes("reassign")) {
    return "bg-indigo-50 text-indigo-700 border border-indigo-200";
  }
  if (s.includes("progress")) {
    return "bg-orange-50 text-orange-700 border border-orange-200";
  }
  if (s.includes("pend")) {
    return "bg-yellow-50 text-yellow-800 border border-yellow-200";
  }
  if (s.includes("comp")) {
    return "bg-green-50 text-green-700 border border-green-200";
  }
  if (s.includes("cancel")) {
    return "bg-rose-50 text-rose-700 border border-rose-200";
  }
  if (s.includes("no show") || s.includes("noshow")) {
    return "bg-gray-700 text-white border border-gray-900";
  }
  if (s.includes("sched") || s.includes("confirm") || s.includes("book")) {
    return "bg-blue-50 text-blue-800 border border-blue-200";
  }
  return "bg-gray-50 text-gray-700 border border-gray-200";
}

/* ---------------------- Component ---------------------- */
export default function AdminDoctorAppointmentsListPage() {
  const { doctorId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  const [doctors, setDoctors] = useState([]);
  const currentDoctor = useMemo(() => {
    if (!doctorId || !doctors || doctors.length === 0) return null;
    return doctors.find((d) => String(d._id) === String(doctorId)) || null;
  }, [doctors, doctorId]);

  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDateOption, setFilterDateOption] = useState("today");
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10); // 10, 25, 50, 100, 'all'

  const [doctorProfile, setDoctorProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const isGoogleCalendarConnected = useMemo(() => {
    const doc = doctorProfile || currentDoctor?.raw || currentDoctor;
    return !!(doc?.googleCalendar?.isConnected || doc?.googleCalendar?.connected);
  }, [doctorProfile, currentDoctor]);

  useEffect(() => {
    if (!doctorId) return;
    
    let active = true;
    (async () => {
      try {
        setLoadingProfile(true);
        const candidates = [
          `${BACKEND}/api/receptionist/doctors/${doctorId}`,
          `${BACKEND}/api/doctor/${doctorId}`,
          `${BACKEND}/api/patient/doctors/${doctorId}`
        ];
        
        const res = await tryEndpoints(candidates, {
          headers: { "Content-Type": "application/json", ...authHeaders },
        });
        
        if (res.ok && active) {
          const doc = res.json?.data ?? res.json;
          setDoctorProfile(doc);
        }
      } catch (err) {
        console.error("Failed to fetch doctor profile:", err);
      } finally {
        if (active) setLoadingProfile(false);
      }
    })();
    
    return () => {
      active = false;
    };
  }, [doctorId, token]);

  const [reassignModal, setReassignModal] = useState({
    open: false,
    appt: null,
    selectedDoctorId: "",
    loadingDoctors: false,
  });
  const [rescheduleModal, setRescheduleModal] = useState({
    open: false,
    apptId: null,
    date: "",
    startTime: "",
    endTime: "",
    submitting: false,
    error: null,
  });
  const [cancelModal, setCancelModal] = useState({
    open: false,
    apptId: null,
    reason: "",
    submitting: false,
    error: null,
  });
  const [detailsModal, setDetailsModal] = useState({
    open: false,
    apptId: null,
    loading: false,
    data: null,
    error: null,
  });

  const [statusSavingId, setStatusSavingId] = useState(null);

  useEffect(() => {
    if (!doctorId) return;
    fetchAppointments();
    fetchDoctors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId, filterStatus, filterDateOption]);

  /* --- formatting helpers (unchanged) --- */
  function formatDateOnly(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    const month = d.toLocaleString("en-US", { month: "short" });
    const day = d.getDate();
    const year = d.getFullYear();
    return `${month},${day} ${year}`;
  }

  function formatTimeShort(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  function formatTimeRange(a) {
    if (!a) return "—";
    if (a.time) return a.time;
    if (a.slotStartIso && a.slotEndIso) {
      return `${formatTimeShort(a.slotStartIso)} - ${formatTimeShort(
        a.slotEndIso
      )}`;
    }
    if (a.slotStartIso) return formatTimeShort(a.slotStartIso);
    if (a.slotEndIso) return formatTimeShort(a.slotEndIso);
    return "—";
  }

  /* --- fetching doctors/appointments (unchanged) --- */
  async function fetchDoctors() {
    try {
      setDoctors([]);
      const candidates = [
        `${BACKEND}/api/admin/users?role=doctor&limit=200`,
        `${BACKEND}/api/admin/doctors?page=1&limit=200`,
        `${BACKEND}/api/doctor?page=1&limit=200`,
        `${BACKEND}/api/patient/doctors?page=1&limit=200`,
      ];
      const res = await tryEndpoints(candidates, {
        headers: { "Content-Type": "application/json", ...authHeaders },
      });
      if (!res.ok) {
        console.warn("Could not fetch doctors:", res.lastErr);
        setDoctors([]);
        return;
      }
      const list = unwrapDoctors(res.json);
      const normalized = (list || []).map((d) => {
        const raw = d || {};
        return {
          _id:
            raw._id ??
            raw.id ??
            raw.userId ??
            Math.random().toString(36).slice(2),
          name: raw.name ?? raw.fullName ?? raw.displayName ?? "Doctor",
          profileImage: raw.profileImage ?? raw.avatar ?? "",
          specialization: raw.specialization ?? "",
          raw,
        };
      });
      setDoctors(normalized);
    } catch (err) {
      console.error("fetchDoctors error:", err);
      setDoctors([]);
    }
  }

  async function fetchAppointments() {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (filterStatus) q.set("status", filterStatus);

      const range = computeDateRange(filterDateOption);
      if (range) {
        q.set("startDate", new Date(range.start).toISOString());
        q.set("endDate", new Date(range.end).toISOString());
      }

      const qs = q.toString() ? `&${q.toString()}` : "";
      const candidates = [
        `${BACKEND}/api/appointment/list?doctorId=${doctorId}${qs}`,
        `${BACKEND}/api/admin/appointments?doctorId=${doctorId}${qs}`,
        `${BACKEND}/api/appointment?doctorId=${doctorId}${qs}`,
        `${BACKEND}/api/doctor/appointments?doctorId=${doctorId}${qs}`,
      ];

      const res = await tryEndpoints(candidates, {
        headers: { "Content-Type": "application/json", ...authHeaders },
      });

      if (!res.ok)
        throw new Error(res.lastErr || "Failed to fetch appointments");

      const list = unwrapAppointments(res.json);
      setAppointments(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("fetchAppointments error:", err);
      setError(err.message || "Error fetching appointments");
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }

  /* --- status change + modals flows (unchanged, kept as-is) --- */
  async function confirmAndChangeStatus(appt, value) {
    if (!appt || !value) return;
    const patientName =
      appt.patientId?.name ?? appt.patient?.name ?? appt.patientName ?? "Patient";
    const doctorName =
      appt.doctorId?.name ?? appt.doctor?.name ?? appt.doctorName ?? (currentDoctor?.name ?? "Doctor");

    const datePart =
      appt.date || appt.slotStartIso
        ? ` on ${formatDateOnly(appt.date ?? appt.slotStartIso)}`
        : "";

    const timePart =
      appt.slotStartIso || appt.time
        ? ` at ${formatTimeRange(appt)}`
        : "";

    if (value === "Cancelled") {
      const result = await Swal.fire({
        title: "Confirm",
        text: `Cancel ${patientName}'s appointment with Dr. ${doctorName}${datePart}${timePart}?`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Yes, cancel",
        cancelButtonText: "No",
        reverseButtons: true,
        width: 420,
        customClass: { popup: "rounded-xl", title: "font-semibold" },
      });

      if (result.isConfirmed) {
        openCancelModal(appt);
      }
      return;
    }

    const currentStatus = String(appt.status || "");
    const isFromCompleted = currentStatus.toLowerCase().includes("comp");

    const sentence = isFromCompleted
      ? `Revert ${patientName}'s appointment with Dr. ${doctorName}${datePart}${timePart} from Completed back to ${value}?`
      : `Mark ${patientName}'s appointment with Dr. ${doctorName}${datePart}${timePart} as ${value}?`;

    const result = await Swal.fire({
      title: isFromCompleted ? "Revert Status?" : "Confirm status change",
      text: sentence,
      icon: isFromCompleted ? "warning" : "question",
      showCancelButton: true,
      confirmButtonColor: "#134e97",
      confirmButtonText: isFromCompleted ? `Yes, change to ${value}` : "Yes, update",
      cancelButtonText: "Cancel",
      reverseButtons: true,
      width: 420,
      customClass: { popup: "rounded-xl", title: "font-semibold" },
    });

    if (result.isConfirmed) {
      handleStatusChange(appt, value);
    }
  }

  async function confirmCancel(appt) {
    if (!appt) return;
    const patientName =
      appt.patientId?.name ?? appt.patient?.name ?? appt.patientName ?? "Patient";
    const doctorName =
      appt.doctorId?.name ?? appt.doctor?.name ?? appt.doctorName ?? (currentDoctor?.name ?? "Doctor");

    const result = await Swal.fire({
      title: "Confirm cancel",
      text: `Cancel ${patientName}'s appointment with Dr. ${doctorName}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, cancel",
      cancelButtonText: "No",
      reverseButtons: true,
      width: 420,
      customClass: { popup: "rounded-xl", title: "font-semibold" },
    });

    if (result.isConfirmed) {
      openCancelModal(appt);
    }
  }

  async function openDetails(apptId) {
    setDetailsModal({
      open: true,
      apptId,
      loading: true,
      data: null,
      error: null,
    });
    try {
      const candidates = [
        `${BACKEND}/api/admin/appointments/${apptId}`,
        `${BACKEND}/api/appointment/${apptId}`,
        `${BACKEND}/api/appointment/${apptId}/details`,
      ];
      const res = await tryEndpoints(candidates, {
        headers: { "Content-Type": "application/json", ...authHeaders },
      });
      if (!res.ok)
        throw new Error(res.lastErr || "Failed to fetch appointment details");
      const payload = res.json || {};
      const appt =
        payload.data?.appointment ??
        payload.data ??
        payload.appointment ??
        payload;
      setDetailsModal({
        open: true,
        apptId,
        loading: false,
        data: appt,
        error: null,
      });
    } catch (err) {
      console.error("openDetails error:", err);
      setDetailsModal({
        open: true,
        apptId,
        loading: false,
        data: null,
        error: err.message || "Could not load details",
      });
      Swal.fire({
        icon: "error",
        title: "Error",
        text: err.message || "Could not load details",
      });
    }
  }

  function openReassign(appt) {
    setReassignModal({
      open: true,
      appt,
      selectedDoctorId: "",
      loadingDoctors: doctors.length === 0,
    });
    if (!doctors || doctors.length === 0) {
      fetchDoctors()
        .then(() =>
          setReassignModal((r) => ({
            ...(r || {}),
            loadingDoctors: false,
          }))
        )
        .catch(() =>
          setReassignModal((r) => ({
            ...(r || {}),
            loadingDoctors: false,
          }))
        );
    }
  }
  function closeReassignModal() {
    setReassignModal({
      open: false,
      appt: null,
      selectedDoctorId: "",
      loadingDoctors: false,
    });
  }
  function goToDoctorCalendarForReassign() {
    if (!reassignModal.appt) {
      return Swal.fire({
        icon: "warning",
        title: "No appointment",
        text: "No appointment to reassign.",
      });
    }
    if (!reassignModal.selectedDoctorId) {
      return Swal.fire({
        icon: "info",
        title: "Select doctor",
        text: "Please select a doctor to reassign to.",
      });
    }
    navigate(`/admin/doctor/${reassignModal.selectedDoctorId}/reschedule`, {
      state: { reassignAppointment: reassignModal.appt, adminReassign: true },
    });
    closeReassignModal();
  }

  function openRescheduleModal(appt) {
    const did =
      appt.doctorId?._id ??
      appt.doctorId ??
      appt.doctor?._id ??
      appt.doctor ??
      null;
    if (!did) {
      return Swal.fire({
        icon: "error",
        title: "Cannot reschedule",
        text: "Appointment doesn't have a doctor id.",
      });
    }
    navigate(`/admin/doctor/${did}/reschedule`, {
      state: { rescheduleAppointment: appt, adminReschedule: true },
    });
  }

  async function submitReschedule() {
    const { apptId, date, startTime, endTime } = rescheduleModal;
    if (!apptId || !date || !startTime || !endTime) {
      setRescheduleModal((s) => ({
        ...s,
        error: "Date, start time and end time are required",
      }));
      return;
    }
    const slotStartIso = new Date(`${date}T${startTime}:00`);
    const slotEndIso = new Date(`${date}T${endTime}:00`);
    if (slotEndIso <= slotStartIso) {
      setRescheduleModal((s) => ({
        ...s,
        error: "End time must be after start time",
      }));
      return;
    }
    setRescheduleModal((s) => ({ ...s, submitting: true, error: null }));
    try {
      const url = `${BACKEND}/api/appointment/reschedule/${rescheduleModal.apptId}`;
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          date: new Date(date).toISOString(),
          slotStartIso: slotStartIso.toISOString(),
          slotEndIso: slotEndIso.toISOString(),
        }),
      });
      const text = await res.text().catch(() => "");
      let payload = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch (e) {
        payload = text;
      }
      if (!res.ok) {
        const errMsg =
          payload && payload.message
            ? `${payload.message}`
            : `HTTP ${res.status} ${res.statusText} — ${text}`;
        throw new Error(errMsg);
      }
      const updatedAppt =
        payload?.data?.newAppointment ?? payload?.data ?? payload ?? null;
      if (updatedAppt) {
        setAppointments((prev) => {
          const replaced = prev.map((a) =>
            String(a._id) === String(rescheduleModal.apptId)
              ? updatedAppt
              : a
          );
          if (
            !replaced.some((r) => String(r._id) === String(updatedAppt._id))
          ) {
            return prev
              .filter((a) => String(a._id) !== String(rescheduleModal.apptId))
              .concat([updatedAppt]);
          }
          return replaced;
        });
      } else {
        await fetchAppointments();
      }
      setRescheduleModal({
        open: false,
        apptId: null,
        date: "",
        startTime: "",
        endTime: "",
        submitting: false,
        error: null,
      });
      Swal.fire({
        icon: "success",
        title: "Rescheduled",
        text: "Appointment rescheduled.",
      });
    } catch (err) {
      console.error("submitReschedule error:", err);
      setRescheduleModal((s) => ({
        ...s,
        submitting: false,
        error: err.message || "Reschedule failed",
      }));
      Swal.fire({
        icon: "error",
        title: "Reschedule failed",
        text: err.message || String(err),
      });
    }
  }

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
      const res = await fetch(`${BACKEND}/api/appointment/cancel/${apptId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(authHeaders || {}) },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const txt = await res.text();
      let payload;
      try {
        payload = JSON.parse(txt);
      } catch (e) {
        payload = txt;
      }
      if (!res.ok) {
        throw new Error(
          `HTTP ${res.status} ${res.statusText} — ${JSON.stringify(payload)}`
        );
      }
      const updated =
        payload?.data ?? payload?.appointment ?? payload;
      if (updated) {
        setAppointments((prev) =>
          prev.map((a) =>
            String(a._id) === String(apptId) ? updated : a
          )
        );
      } else {
        await fetchAppointments();
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
        text: "Appointment cancelled.",
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
        text: err.message || String(err),
      });
    }
  }

  async function handleStatusChange(appt, newStatus) {
    const apptId = appt._id ?? appt.id;
    if (!apptId) return;

    const current = String(appt.status || "");
    if (current === newStatus) return;

    if (newStatus === "Rescheduled") {
      Swal.fire({
        icon: "info",
        title: "Use reschedule",
        text: "Please use the Reschedule button to reschedule an appointment.",
      });
      return;
    }

    setStatusSavingId(apptId);
    try {
      const res = await fetch(`${BACKEND}/api/appointment/status/${apptId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ status: newStatus }),
      });

      const txt = await res.text().catch(() => "");
      let payload = null;
      try {
        payload = txt ? JSON.parse(txt) : null;
      } catch (e) {
        payload = txt;
      }

      if (!res.ok) {
        const msg =
          payload?.message ||
          `HTTP ${res.status} ${res.statusText} — ${txt || ""}`;
        throw new Error(msg);
      }

      const updated =
        payload?.data?.appointment ??
        payload?.data ??
        payload?.appointment ??
        payload;

      if (updated) {
        setAppointments((prev) =>
          prev.map((a) =>
            String(a._id ?? a.id) === String(apptId) ? updated : a
          )
        );
      } else {
        await fetchAppointments();
      }

      Swal.fire({
        icon: "success",
        title: "Status updated",
        text: `Appointment marked as ${newStatus}.`,
      });
    } catch (err) {
      console.error("handleStatusChange error:", err);
      Swal.fire({
        icon: "error",
        title: "Failed to update status",
        text: err.message || String(err),
      });
    } finally {
      setStatusSavingId(null);
    }
  }

  function computeDateRange(option) {
    if (!option) return null;
    const now = new Date();
    let start = new Date(now);
    let end = new Date(now);
    switch ((option || "").toLowerCase()) {
      case "today":
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case "tomorrow":
        start.setDate(start.getDate() + 1);
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setHours(23, 59, 59, 999);
        break;
      case "thisweek": {
        const day = (start.getDay() + 6) % 7;
        start.setDate(start.getDate() - day);
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        break;
      }
      case "thismonth":
        start = new Date(
          start.getFullYear(),
          start.getMonth(),
          1,
          0,
          0,
          0,
          0
        );
        end = new Date(
          start.getFullYear(),
          start.getMonth() + 1,
          0,
          23,
          59,
          59,
          999
        );
        break;
      case "nextmonth":
        start = new Date(
          start.getFullYear(),
          start.getMonth() + 1,
          1,
          0,
          0,
          0,
          0
        );
        end = new Date(
          start.getFullYear(),
          start.getMonth() + 1,
          0,
          23,
          59,
          59,
          999
        );
        break;
      default:
        return null;
    }
    return { start, end };
  }

  function appointmentInRange(appt, option) {
    if (!option) return true;
    const range = computeDateRange(option);
    if (!range) return true;
    const cand = appt.slotStartIso ?? appt.date ?? appt.createdAt ?? null;
    if (!cand) return false;
    const apptDate = new Date(cand);
    return apptDate >= range.start && apptDate <= range.end;
  }

  /* --- debounced search (you had this) --- */
  const searchRef = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(
      () => setDebouncedSearch(searchTerm.trim().toLowerCase()),
      250
    );
    return () => {
      if (searchRef.current) clearTimeout(searchRef.current);
    };
  }, [searchTerm]);

  const filteredAppointments = useMemo(() => {
    return (appointments || []).filter((a) => {
      if (filterStatus) {
        const s = String(a.status || "").toLowerCase();
        if (!s.includes(String(filterStatus || "").toLowerCase())) return false;
      }
      if (!appointmentInRange(a, filterDateOption)) return false;
      if (debouncedSearch) {
        const needle = debouncedSearch;
        const fields = [
          a.patientId?.name,
          a.patient?.name,
          a.patientName,
          a.patientId?.phone,
          a.patient?.phone,
          a.patientId?.email,
          a.patient?.email,
          a._id,
          a.id,
        ]
          .filter(Boolean)
          .map((x) => String(x).toLowerCase());
        const matched = fields.some((f) => f.includes(needle));
        if (!matched) return false;
      }
      return true;
    });
  }, [appointments, filterStatus, filterDateOption, debouncedSearch]);

  const paginatedAppointments = useMemo(() => {
    if (itemsPerPage === "all") return filteredAppointments;
    const limit = Number(itemsPerPage);
    const startIndex = (currentPage - 1) * limit;
    return filteredAppointments.slice(startIndex, startIndex + limit);
  }, [filteredAppointments, currentPage, itemsPerPage]);

  const totalPages = useMemo(() => {
    if (itemsPerPage === "all") return 1;
    return Math.ceil(filteredAppointments.length / Number(itemsPerPage));
  }, [filteredAppointments, itemsPerPage]);

  const modalOuterClass =
    "fixed inset-0 z-50 flex items-center justify-center p-3 overflow-auto";
  const modalInnerClass =
    "w-full max-w-[320px] sm:max-w-md md:max-w-lg p-4 sm:p-6 rounded-2xl bg-white shadow-xl border border-blue-500 ring-1 ring-blue-50 max-h-[95vh] overflow-auto";
  const actionBtnClass =
    "inline-flex items-center gap-2 px-3 py-2 rounded-2xl text-sm font-medium shadow-sm transition";

  /* ------------------------- RENDER ------------------------- */
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-indigo-50 via-purple-50 to-sky-50">
      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 shadow">
        <div className="backdrop-blur-md bg-white/0 py-3 sm:py-4">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-1 sm:py-2">
            <div className="flex items-center justify-between">
              {/* LEFT: Back */}
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

              {/* CENTER */}
              <div className="absolute left-1/2 -translate-x-1/2 text-center pointer-events-none">
                <h1 className="text-base sm:text-2xl font-bold text-white truncate max-w-[220px] sm:max-w-none">
                  Dr. {location.state?.doctorName ?? "Doctor"} Appointments
                </h1>
                {location.state?.specialization && (
                  <p className="text-[9px] sm:text-xs text-blue-100 mt-0.5 truncate max-w-[220px] sm:max-w-none">
                    {location.state.specialization}
                  </p>
                )}
              </div>

              {/* RIGHT: Book Appointment (admin/super-admin) */}
              {isGoogleCalendarConnected && (
                <button
                  onClick={() =>
                    navigate(`/receptionist/doctor-calendar/${doctorId}`, {
                      state: {
                        fromAdmin: true,
                        doctorName: location.state?.doctorName ?? "Doctor",
                        specialization: location.state?.specialization ?? "",
                      },
                    })
                  }
                  className="inline-flex items-center gap-2 px-2.5 py-1.5 text-xs sm:text-sm rounded-full bg-white/10 text-white hover:bg-white/20 border border-white/20 transition"
                  aria-label="Book appointment"
                >
                  {/* calendar icon */}
                  <svg
                    viewBox="0 0 24 24"
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span className="hidden sm:inline">Book Appointment</span>
                </button>
              )}

            </div>
          </div>
        </div>
      </header>

      {/* Page content */}
      <div className="p-4 sm:p-6 max-w-7xl mx-auto flex-1 w-full">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Search (auto; debounced) */}
          <div className="flex items-center w-full mb-0">
            <div className="relative w-full">
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name or email"
                className="w-full h-10 pl-10 pr-3 rounded-full bg-white/70 border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 shadow-sm"
              />
              {/* Search Icon */}
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                stroke="currentColor"
                fill="none"
                strokeWidth="2"
              ></svg>
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
            </div>
          </div>

          {/* Filters (keeps to the right on wide screens) */}
          <div className="flex gap-2 items-center ml-auto">
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 border rounded-2xl bg-white text-sm"
            >
              <option value="">All statuses</option>
              <option value="Scheduled">Scheduled</option>
              <option value="Rescheduled">Rescheduled</option>
              <option value="Reassigned">Reassigned</option>
              <option value="In Progress">In Progress</option>
              <option value="Missed">Missed</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>

            <select
              value={filterDateOption}
              onChange={(e) => {
                setFilterDateOption(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 border rounded-2xl bg-white text-sm"
            >
              <option value="">All dates</option>
              <option value="today">Today's</option>
              <option value="tomorrow">Tomorrow</option>
              <option value="thisweek">This week</option>
              <option value="thismonth">This month</option>
              <option value="nextmonth">Next month</option>
            </select>

            <select
              value={itemsPerPage}
              onChange={(e) => {
                const val = e.target.value === "all" ? "all" : Number(e.target.value);
                setItemsPerPage(val);
                setCurrentPage(1);
              }}
              className="px-3 py-2 border rounded-2xl bg-white text-sm font-semibold text-gray-700 cursor-pointer shadow-sm"
            >
              <option value={10}>10 per page</option>
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
              <option value="all">All entries</option>
            </select>
          </div>
        </div>

        {/* Main list container (unchanged) */}
        <div className="bg-white rounded-2xl p-3 sm:p-4 shadow">
          {loading ? (
            <div className="text-center py-8 text-sm">Loading…</div>
          ) : error ? (
            <div className="text-red-500 text-sm">{error}</div>
          ) : filteredAppointments.length === 0 ? (
            <div className="text-gray-600 py-8 text-sm">
              No appointments match the selected filters.
            </div>
          ) : (
            <>
              {/* Desktop/table view for large screens */}
              <div className="hidden lg:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-left table-auto">
                    <thead className="text-sm text-gray-500 border-b">
                      <tr>
                        <th className="py-3 px-3">Date</th>
                        <th className="py-3 px-3">Time</th>
                        <th className="py-3 px-3">Patient</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedAppointments.map((a) => {
                        const apptId = a._id ?? a.id;
                        const currentStatus = a.status || "Scheduled";

                        return (
                          <tr key={apptId} className="border-b hover:bg-gray-50">
                            <td className="py-3 px-3 text-sm">
                              {formatDateOnly(a.date ?? a.slotStartIso ?? Date.now())}
                            </td>
                            <td className="py-3 px-3 text-sm">{formatTimeRange(a)}</td>
                            <td className="py-3 px-3 text-sm">
                              <div className="flex items-center gap-3">
                                <img
                                  src={getImageUrl(
                                    a.patientId?.profileImage ?? a.patient?.profileImage ?? a.patientId?.avatar ?? a.patient?.avatar,
                                    a.patientId?.name ?? a.patient?.name ?? a.patientName ?? "Patient"
                                  )}
                                  alt={a.patientId?.name ?? a.patient?.name ?? a.patientName ?? "Patient"}
                                  className="w-10 h-10 rounded-full object-cover border border-gray-200 shadow-sm flex-shrink-0"
                                />
                                <div className="flex flex-col">
                                  <span className="font-medium">{a.patientId?.name ?? a.patient?.name ?? a.patientName ?? "—"}</span>
                                  <span className="text-xs text-gray-500">{a.patientId?.phone ?? a.patient?.phone ?? a.patientId?.email ?? a.patient?.email ?? ""}</span>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <div className="relative inline-block w-40">
                                {(() => {
                                  const displayStatus = String(currentStatus).toLowerCase().includes("resched")
                                    ? "Rescheduled"
                                    : currentStatus === "Reassigned"
                                      ? "Reassigned"
                                      : currentStatus;

                                  const sLower = String(currentStatus || "").toLowerCase();
                                  const isFinal = sLower.includes("cancel");

                                  return (
                                    <>
                                      <select
                                        value={displayStatus}
                                        disabled={statusSavingId === apptId || isFinal}
                                        onChange={(e) => {
                                          const value = e.target.value;
                                          if (statusSavingId === apptId || isFinal) {
                                            e.target.value = displayStatus;
                                            return;
                                          }
                                          confirmAndChangeStatus(a, value);
                                          e.target.value = displayStatus;
                                        }}
                                        className={`text-xs pl-3 pr-4 py-1 rounded-full appearance-none cursor-pointer w-full focus:outline-none focus:ring-2 focus:ring-blue-300 ${badgeClass(currentStatus)}`}
                                        title={isFinal ? `${displayStatus} — actions disabled` : undefined}
                                      >
                                        <option value="Scheduled">Scheduled</option>
                                        <option value="In Progress">In Progress</option>
                                        <option value="Missed">Missed</option>
                                        <option value="Completed">Completed</option>
                                        <option value="Cancelled">Cancelled</option>
                                        {String(currentStatus).toLowerCase().includes("resched") && (
                                          <option value="Rescheduled" disabled>
                                            Rescheduled (auto)
                                          </option>
                                        )}
                                        {currentStatus === "Reassigned" && (
                                          <option value="Reassigned" disabled>
                                            Reassigned (auto)
                                          </option>
                                        )}
                                      </select>
                                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-700">▼</span>
                                    </>
                                  );
                                })()}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <div className="flex gap-2 justify-end flex-wrap">
                                <button onClick={() => openDetails(apptId)} className="text-sm px-3 py-1.5 rounded-full bg-white ring-1 ring-indigo-500 text-indigo-700 hover:shadow">View</button>
                                {(() => {
                                  const isBtnDisabled = String(currentStatus).toLowerCase().includes("cancel") || String(currentStatus).toLowerCase().includes("complete") || String(currentStatus).toLowerCase().includes("no show");
                                  return (
                                    <>
                                      <button disabled={isBtnDisabled}
                                        onClick={() => openRescheduleModal(a)}
                                        className={`text-sm px-3 py-1.5 rounded-full ring-1 ring-green-500 ${isBtnDisabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-green-50 text-green-700 hover:shadow'}`}>
                                        Reschedule
                                      </button>
                                      <button disabled={isBtnDisabled}
                                        onClick={() => confirmCancel(a)}
                                        className={`text-sm px-3 py-1.5 rounded-full ring-1 ring-red-500 ${isBtnDisabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-red-50 text-red-700 hover:shadow'}`}>
                                        Cancel
                                      </button>
                                      <button disabled={isBtnDisabled}
                                        onClick={() => openReassign(a)}
                                        className={`text-sm px-3 py-1.5 rounded-full ring-1 ring-blue-500 ${isBtnDisabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-50 text-blue-700 hover:shadow'}`}>
                                        Reassign
                                      </button>
                                    </>
                                  );
                                })()}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* MOBILE / SMALL VIEW: stacked cards - visible under lg */}
              <div className="lg:hidden space-y-3">
                {paginatedAppointments.map((a) => {
                  const apptId = a._id ?? a.id;
                  const currentStatus = a.status || "Scheduled";
                  const s = String(currentStatus).toLowerCase();
                  const isFinal = s.includes("cancel");
                  const isActionDisabled =
                    isFinal ||
                    s.includes("complete") ||
                    s.includes("no show") ||
                    s.includes("noshow");
                  // displayStatus same logic as desktop
                  const displayStatus = String(currentStatus).toLowerCase().includes("resched")
                    ? "Rescheduled"
                    : currentStatus === "Reassigned"
                      ? "Reassigned"
                      : currentStatus;

                  return (
                    <div key={apptId} className="p-3 rounded-xl border bg-white shadow-sm relative">
                      {/* TOP-RIGHT: status select (visible/tappable on mobile) */}
                      <div className="absolute right-3 top-3">
                        {isFinal ? (
                          // show pill when final (non-interactive)
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${badgeClass(currentStatus)}`}>
                            {displayStatus}
                          </span>
                        ) : (
                          <div className="relative">
                            <select
                              value={displayStatus}
                              disabled={statusSavingId === apptId}
                              onChange={(e) => {
                                const value = e.target.value;
                                // prevent immediate selection change before confirmation
                                if (statusSavingId === apptId) {
                                  e.target.value = displayStatus;
                                  return;
                                }
                                // call your confirm flow (this will open confirm modal then call handleStatusChange)
                                confirmAndChangeStatus(a, value);
                                // reset select visually to displayStatus (actual change happens after API)
                                e.target.value = displayStatus;
                              }}
                              className={`text-xs pl-2 pr-6 py-1 rounded-full appearance-none cursor-pointer w-max border ${badgeClass(currentStatus)} bg-white`}
                              aria-label="Change status"
                            >
                              <option value="Scheduled">Scheduled</option>
                              <option value="In Progress">In Progress</option>
                              <option value="Missed">Missed</option>
                              <option value="Completed">Completed</option>
                              <option value="Cancelled">Cancelled</option>
                              {String(currentStatus).toLowerCase().includes("resched") && (
                                <option value="Rescheduled" disabled>
                                  Rescheduled (auto)
                                </option>
                              )}
                              {currentStatus === "Reassigned" && (
                                <option value="Reassigned" disabled>
                                  Reassigned (auto)
                                </option>
                              )}
                            </select>

                            {/* small caret - purely decorative */}
                            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-700">▼</span>
                          </div>
                        )}
                      </div>

                      {/* CARD CONTENT */}
                      <div className="flex items-start gap-3">
                        <img
                          src={getImageUrl(
                            a.patientId?.profileImage ?? a.patient?.profileImage ?? a.patientId?.avatar ?? a.patient?.avatar,
                            a.patientId?.name ?? a.patient?.name ?? a.patientName ?? "Patient"
                          )}
                          alt={a.patientId?.name ?? a.patient?.name ?? a.patientName ?? "Patient"}
                          className="w-12 h-12 rounded-full object-cover border border-gray-200 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            {/* Name + Date + Time */}
                            <div className="min-w-0 pr-12"> {/* space so text doesn't go under dropdown */}

                              {/* NAME */}
                              <span className="text-sm font-semibold truncate block">
                                {a.patientId?.name ?? a.patient?.name ?? a.patientName ?? "—"}
                              </span>

                              {/* DATE (under name) */}
                              <span className="text-xs text-gray-500 mt-1 block">
                                {formatDateOnly(a.date ?? a.slotStartIso ?? Date.now())}
                              </span>

                              {/* TIME (below date) */}
                              <span className="text-xs text-gray-500 mt-1 block">
                                {formatTimeRange(a)}
                              </span>

                              {/* PHONE / EMAIL */}
                              <span className="text-[11px] text-gray-500 mt-1 truncate block">
                                {a.patientId?.phone ??
                                  a.patient?.phone ??
                                  a.patientId?.email ??
                                  a.patient?.email ??
                                  ""}
                              </span>
                            </div>
                          </div>

                          {/* ACTION BUTTONS */}
                          <div className="mt-3 flex items-center gap-2 flex-wrap">
                            {/* VIEW */}
                            <button
                              onClick={() => openDetails(apptId)}
                              className="px-3 py-1.5 rounded-full bg-white text-indigo-700 text-xs border border-indigo-500 hover:shadow"
                            >
                              View
                            </button>

                            {/* RESCHEDULE */}
                            <button
                              disabled={isActionDisabled}
                              onClick={() => openRescheduleModal(a)}
                              className={`px-3 py-1.5 rounded-full text-xs bg-white border ${isActionDisabled
                                ? "border-gray-300 text-gray-400 cursor-not-allowed"
                                : "border-green-500 text-green-700 hover:shadow"
                                }`}
                            >
                              Reschedule
                            </button>

                            {/* CANCEL */}
                            <button
                              disabled={isActionDisabled}
                              onClick={() => confirmCancel(a)}
                              className={`px-3 py-1.5 rounded-full text-xs bg-white border ${isActionDisabled
                                ? "border-gray-300 text-gray-400 cursor-not-allowed"
                                : "border-red-500 text-red-700 hover:shadow"
                                }`}
                            >
                              Cancel
                            </button>

                            {/* REASSIGN */}
                            <button
                              disabled={isActionDisabled}
                              onClick={() => openReassign(a)}
                              className={`px-3 py-1.5 rounded-full text-xs bg-white border ${isActionDisabled
                                ? "border-gray-300 text-gray-400 cursor-not-allowed"
                                : "border-blue-500 text-blue-700 hover:shadow"
                                }`}
                            >
                              Reassign
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* PAGINATION FOOTER CONTROLS */}
              {totalPages > 1 && (
                <div className="mt-6 pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-semibold text-gray-500">
                  <div>
                    {itemsPerPage === 'all' ? (
                      `Showing all ${filteredAppointments.length} appointments`
                    ) : (
                      `Showing ${((currentPage - 1) * Number(itemsPerPage)) + 1} to ${Math.min(filteredAppointments.length, currentPage * Number(itemsPerPage))} of ${filteredAppointments.length} appointments`
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
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
                        return <span key={`ellipsis-${idx}`} className="px-1.5 text-gray-400">...</span>;
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`px-3 py-1.5 rounded-lg border transition-all shadow-sm ${currentPage === pageNum ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 bg-white hover:bg-gray-50 text-gray-600"}`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}

                    <button
                      onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* REASSIGN / RESCHEDULE / CANCEL / DETAILS MODALS (kept unchanged) */}
        {reassignModal.open && (
          <div className={modalOuterClass}>
            <div className={modalInnerClass}>
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-semibold">Reassign Appointment</h3>
                <button onClick={closeReassignModal} className="px-2 py-1 rounded-full bg-gray-100">✕</button>
              </div>

              <div className="mb-3 text-sm text-gray-700">
                <div><strong>Patient:</strong> {reassignModal.appt?.patientId?.name ?? reassignModal.appt?.patient?.name ?? reassignModal.appt?.patientName ?? "—"}</div>
                <div><strong>Date:</strong> {reassignModal.appt?.date ? formatDateOnly(reassignModal.appt.date) : reassignModal.appt?.slotStartIso ? formatDateOnly(reassignModal.appt.slotStartIso) : "—"}</div>
                <div><strong>Time:</strong> {reassignModal.appt?.slotStartIso ? `${formatTimeShort(reassignModal.appt.slotStartIso)} - ${formatTimeShort(reassignModal.appt.slotEndIso)}` : reassignModal.appt?.time ?? "—"}</div>
              </div>

              <div className="space-y-3">
                <label className="block text-sm">
                  Select doctor to reassign to
                  <select
                    value={reassignModal.selectedDoctorId}
                    onChange={(e) =>
                      setReassignModal((r) => ({
                        ...(r || {}),
                        selectedDoctorId: e.target.value,
                      }))
                    }
                    className="w-full mt-2 p-2 border rounded-md bg-white text-sm"
                  >
                    <option value="">Select doctor</option>
                    {(() => {
                      const apptDocId =
                        reassignModal.appt?.doctorId?._id ??
                        reassignModal.appt?.doctorId ??
                        reassignModal.appt?.doctor?._id ??
                        reassignModal.appt?.doctor ??
                        null;
                      const list = (doctors || []).filter((d) => {
                        const isConnected = d.raw?.googleCalendar?.isConnected || d.raw?.googleCalendar?.connected;
                        if (!isConnected) return false;
                        if (!apptDocId) return true;
                        return String(d._id) !== String(apptDocId);
                      });
                      if (!list || list.length === 0) {
                        return (
                          <option disabled>No other doctors available</option>
                        );
                      }
                      return list.map((d) => (
                        <option key={d._id} value={d._id}>
                          {d.name}
                          {d.specialization ? ` - (${d.specialization})` : ""}
                        </option>
                      ));
                    })()}
                  </select>
                </label>

                {reassignModal.loadingDoctors && <div className="text-sm text-gray-500">Loading doctors…</div>}
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button onClick={closeReassignModal} className="px-3 py-2 rounded-2xl bg-gray-100">Cancel</button>
                <button onClick={goToDoctorCalendarForReassign} className="px-3 py-2 rounded-2xl bg-blue-600 text-white">Go to calendar</button>
              </div>
            </div>
          </div>
        )}

        {rescheduleModal.open && (
          <div className={modalOuterClass}>
            <div className={modalInnerClass}>
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-semibold">Reschedule Appointment</h3>
                <button onClick={() => setRescheduleModal({ open: false, apptId: null, date: "", startTime: "", endTime: "", submitting: false, error: null })} className="px-2 py-1 rounded-full bg-gray-100">✕</button>
              </div>

              <div className="space-y-2">
                <label className="text-sm block">
                  Date
                  <input type="date" value={rescheduleModal.date} onChange={(e) => setRescheduleModal((s) => ({ ...s, date: e.target.value }))} className="w-full mt-1 p-2 border rounded-md" />
                </label>
                <label className="text-sm block">
                  Start time
                  <input type="time" value={rescheduleModal.startTime} onChange={(e) => setRescheduleModal((s) => ({ ...s, startTime: e.target.value }))} className="w-full mt-1 p-2 border rounded-md" />
                </label>
                <label className="text-sm block">
                  End time
                  <input type="time" value={rescheduleModal.endTime} onChange={(e) => setRescheduleModal((s) => ({ ...s, endTime: e.target.value }))} className="w-full mt-1 p-2 border rounded-md" />
                </label>
                {rescheduleModal.error && <div className="text-sm text-red-600">{rescheduleModal.error}</div>}
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setRescheduleModal({ open: false, apptId: null, date: "", startTime: "", endTime: "", submitting: false, error: null })} className="px-3 py-2 rounded-2xl bg-gray-100">Cancel</button>
                <button disabled={rescheduleModal.submitting} onClick={submitReschedule} className="px-3 py-2 rounded-2xl bg-green-600 text-white">{rescheduleModal.submitting ? "Saving..." : "Save"}</button>
              </div>
            </div>
          </div>
        )}

        {cancelModal.open && (
          <div className={modalOuterClass}>
            <div className={modalInnerClass}>
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-semibold">Cancel Appointment</h3>
                <button onClick={() => setCancelModal({ open: false, apptId: null, reason: "", submitting: false, error: null })} className="px-2 py-1 rounded-full bg-gray-100">✕</button>
              </div>

              <div className="space-y-2">
                <label className="text-sm block">
                  Reason (required)
                  <textarea value={cancelModal.reason} onChange={(e) => setCancelModal((s) => ({ ...s, reason: e.target.value }))} className="w-full mt-1 p-2 border rounded-md" rows={4} />
                </label>
                {cancelModal.error && <div className="text-sm text-red-600">{cancelModal.error}</div>}
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setCancelModal({ open: false, apptId: null, reason: "", submitting: false, error: null })} className="px-3 py-2 rounded-2xl bg-gray-100">Back</button>
                <button disabled={cancelModal.submitting} onClick={submitCancel} className="px-3 py-2 rounded-2xl bg-red-600 text-white">{cancelModal.submitting ? "Cancelling..." : "Confirm Cancel"}</button>
              </div>
            </div>
          </div>
        )}

        {detailsModal.open && (
          <div className={modalOuterClass}>
            <div className="w-full max-w-[360px] sm:max-w-2xl p-4 sm:p-6 rounded-2xl bg-white shadow-xl border border-blue-500 ring-1 ring-blue-50 max-h-[95vh] overflow-auto">
              <div className="grid grid-cols-3 items-start gap-4">
                <div />
                <h3 className="text-lg font-semibold text-center">Appointment details</h3>

                <div className="flex justify-end">
                  <button
                    onClick={() =>
                      setDetailsModal({
                        open: false,
                        apptId: null,
                        loading: false,
                        data: null,
                        error: null,
                      })
                    }
                    className="p-1.5 rounded-full bg-red-100 text-red-600 hover:bg-red-200 hover:text-red-700 transition"
                    aria-label="Close appointment details"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {detailsModal.loading ? (
                <div className="py-10 text-center text-gray-500">Loading details…</div>
              ) : detailsModal.error ? (
                <div className="py-6 text-red-500">{detailsModal.error}</div>
              ) : !detailsModal.data ? (
                <div className="py-6 text-gray-500">No details available.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                  <div className="p-3 rounded-lg border bg-white/60">
                    <h4 className="font-semibold mb-2">Patient</h4>
                    <div className="text-sm text-gray-700 space-y-2">
                      <div><strong>Name:</strong> {detailsModal.data.patientId?.name ?? detailsModal.data.patient?.name ?? detailsModal.data.patientName ?? "—"}</div>
                      <div><strong>Email:</strong> {detailsModal.data.patientId?.email ?? detailsModal.data.patient?.email ?? "—"}</div>
                      <div><strong>Phone:</strong> {detailsModal.data.patientId?.phone ?? detailsModal.data.patient?.phone ?? "—"}</div>
                      {(() => {
                        const img = detailsModal.data.patientId?.profileImage ?? detailsModal.data.patient?.profileImage ?? detailsModal.data.patientId?.avatar ?? detailsModal.data.patient?.avatar ?? null;
                        const name = detailsModal.data.patientId?.name ?? detailsModal.data.patient?.name ?? detailsModal.data.patientName ?? "Patient";
                        return <img src={getImageUrl(img, name)} alt="patient" className="w-28 h-28 object-cover rounded mt-2 border shadow-sm" />;
                      })()}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border bg-white/60">
                    <h4 className="font-semibold mb-2">Doctor</h4>
                    <div className="text-sm text-gray-700 space-y-2">
                      <div><strong>Name:</strong> {detailsModal.data.doctorId?.name ?? detailsModal.data.doctor?.name ?? detailsModal.data.doctorName ?? "—"}</div>
                      <div><strong>Specialization:</strong> {detailsModal.data.doctorId?.specialization ?? detailsModal.data.doctor?.specialization ?? "—"}</div>
                      <div><strong>Fees:</strong> {detailsModal.data.doctorId?.fees ?? detailsModal.data.doctor?.fees ?? "—"}</div>
                      {(() => {
                        const img = detailsModal.data.doctorId?.profileImage ?? detailsModal.data.doctor?.profileImage ?? detailsModal.data.doctorId?.avatar ?? detailsModal.data.doctor?.avatar ?? null;
                        const name = detailsModal.data.doctorId?.name ?? detailsModal.data.doctor?.name ?? detailsModal.data.doctorName ?? "Doctor";
                        return <img src={getImageUrl(img, name)} alt="doctor" className="w-28 h-28 object-cover rounded mt-2 border shadow-sm" />;
                      })()}
                    </div>
                  </div>

                  <div className="md:col-span-2 p-3 rounded-lg border bg-white/60">
                    <h4 className="font-semibold mb-2">Appointment</h4>
                    <div className="text-sm text-gray-700 space-y-2">
                      <div><strong>Date:</strong> {detailsModal.data.date ? formatDateOnly(detailsModal.data.date) : detailsModal.data.slotStartIso ? formatDateOnly(detailsModal.data.slotStartIso) : "—"}</div>
                      <div><strong>Time:</strong> {detailsModal.data.slotStartIso ? `${formatTimeShort(detailsModal.data.slotStartIso)} - ${formatTimeShort(detailsModal.data.slotEndIso)}` : detailsModal.data.time ?? "—"}</div>
                      <div><strong>Status:</strong> <span className={`inline-block px-2 py-1 rounded ${badgeClass(detailsModal.data.status)}`}>{detailsModal.data.status ?? "—"}</span></div>
                      <div><strong>Symptoms:</strong> {detailsModal.data.symptoms ?? "—"}</div>
                      <div><strong>Notes / Prescription:</strong> {detailsModal.data.notes ?? detailsModal.data.prescription ?? "—"}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
