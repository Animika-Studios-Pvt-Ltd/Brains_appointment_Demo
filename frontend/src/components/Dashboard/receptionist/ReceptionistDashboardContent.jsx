// frontend/src/components/Dashboard/receptionist/ReceptionistDashboardContent.jsx
import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarPlus,
  ClipboardList,
  ArrowRight,
  Users,
  CalendarDays,
  CalendarClock,
  Clock,
  ChevronRight,
  Stethoscope,
  Calendar,
} from "lucide-react";
import MassHolidayModal from "../admin/MassHolidayModal";
import BulkRescheduleModal from "./BulkRescheduleModal";
import SetAvailabilityModal from "../shared/SetAvailabilityModal";
import ReceptionistDashboardHeader from "./ReceptionistDashboardHeader";
import Footer from "@/components/HomePage/Footer";

const API = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
const UPCOMING_APPOINTMENTS_DASHBOARD_LIMIT = 4;

function getImageUrl(path) {
  if (!path) return "/avatar-placeholder.png";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return path.startsWith("/") ? `${API}${path}` : `${API}/${path}`;
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

function statusBadgeClass(status) {
  const s = String(status || "").toLowerCase();
  if (s.replace(/\s+/g, "") === "noshow")
    return "bg-orange-50 text-orange-700 border border-orange-200";
  if (s.includes("cancel"))
    return "bg-rose-50 text-rose-700 border border-rose-200";
  if (s.includes("reassign"))
    return "bg-indigo-50 text-indigo-700 border border-indigo-200";
  if (s.includes("comp") || s === "completed")
    return "bg-emerald-50 text-emerald-700 border border-emerald-200";
  if (s.includes("resched"))
    return "bg-amber-50 text-amber-700 border border-amber-200";
  if (s.includes("sched") || s.includes("confirm"))
    return "bg-blue-50 text-blue-700 border border-blue-200";
  if (s.includes("check") || s.includes("progress"))
    return "bg-purple-50 text-purple-700 border border-purple-200";
  return "bg-slate-50 text-slate-600 border border-slate-200";
}

function formatStatusLabel(status) {
  const s = String(status || "Scheduled").trim();
  return s.replace(/_/g, " ").toUpperCase();
}

function formatApptDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const date = d.toLocaleDateString([], { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${date} - ${time}`;
}

function formatApptTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function QuickActionCard({
  title,
  description,
  icon: Icon,
  iconWrapClass,
  iconClass,
  accentBorderClass = "group-hover:border-[#134e97]/25",
  accentRingClass = "group-hover:ring-[#134e97]/10",
  onClick,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative w-full text-center overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 backdrop-blur-sm shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_rgba(15,23,42,0.03)] hover:shadow-[0_4px_16px_rgba(15,23,42,0.08)] hover:-translate-y-0.5 ${accentBorderClass} ring-1 ring-transparent ${accentRingClass} transition-all duration-300 p-4 sm:p-5 flex flex-col items-center h-full min-h-[160px] active:scale-[0.99]`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-200/80 to-transparent" />
      <div
        className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center flex-shrink-0 border border-white/80 shadow-sm ring-1 ring-black/[0.04] ${iconWrapClass}`}>
        <Icon className={`w-5 h-5 sm:w-[22px] sm:h-[22px] ${iconClass}`} />
      </div>
      <h3
        className="mt-3.5 text-sm sm:text-[15px] font-semibold text-slate-900 leading-snug w-full tracking-tight"
        style={{ fontFamily: "'mirador-medium', 'Outfit', sans-serif" }}>
        {title}
      </h3>
      <p className="mt-1.5 text-[11px] sm:text-xs text-slate-500 leading-relaxed flex-1 w-full px-0.5">
        {description}
      </p>
      <div className="mt-4 w-full flex justify-end">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-slate-200/90 bg-gradient-to-b from-white to-slate-50 text-slate-400 shadow-sm group-hover:border-[#134e97]/35 group-hover:bg-[#134e97]/[0.06] group-hover:text-[#134e97] group-hover:shadow-md transition-all duration-300">
          <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-300" />
        </span>
      </div>
    </button>
  );
}

function PanelCard({
  title,
  icon: Icon,
  viewLabel,
  onViewAll,
  accentClass = "from-[#134e97] to-[#06adc6]",
  children,
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 backdrop-blur-sm shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.04)] flex flex-col h-full">
      <div className={`h-1 w-full bg-gradient-to-r ${accentClass}`} />
      <div className="p-4 sm:p-5 flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#134e97]/8 border border-[#134e97]/10 flex items-center justify-center flex-shrink-0">
              <Icon className="w-[18px] h-[18px] text-[#134e97]" />
            </div>
            <h3
              className="text-sm sm:text-base font-semibold text-slate-900 truncate tracking-tight"
              style={{ fontFamily: "'mirador-medium', 'Outfit', sans-serif" }}>
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onViewAll}
            className="text-[11px] sm:text-xs text-[#134e97] font-semibold hover:text-[#06adc6] whitespace-nowrap flex items-center gap-0.5 flex-shrink-0 px-2.5 py-1 rounded-full border border-[#134e97]/15 bg-[#134e97]/[0.04] hover:bg-[#134e97]/[0.08] hover:border-[#134e97]/25 transition-all duration-200">
            {viewLabel}
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex-1 min-h-0">{children}</div>
      </div>
    </div>
  );
}

function PanelEmpty({ children }) {
  return (
    <div className="py-8 px-4 text-center text-slate-500 text-sm rounded-xl border border-dashed border-slate-200/90 bg-slate-50/50">
      {children}
    </div>
  );
}

function PanelListItem({ children, className = "" }) {
  return (
    <li
      className={`py-3 px-2.5 -mx-2.5 rounded-xl border border-transparent hover:border-slate-200/80 hover:bg-slate-50/80 transition-all duration-200 ${className}`}>
      {children}
    </li>
  );
}

const ReceptionistDashboardContent = () => {
  const navigate = useNavigate();

  const [openHolidayModal, setOpenHolidayModal] = useState(false);
  const [openBulkRescheduleModal, setOpenBulkRescheduleModal] = useState(false);
  const [openSetAvailabilityModal, setOpenSetAvailabilityModal] = useState(false);

  const receptionistFromStorage = useMemo(() => {
    try {
      const raw = localStorage.getItem("user");
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, []);

  const goToManagePatients = () => navigate("/receptionist/manage-patients");
  const goToAppointmentsPage = () => navigate("/receptionist/appointments");
  const goToBookAppointmentPage = () =>
    navigate("/receptionist/book-appointment");

  const [availDoctors, setAvailDoctors] = useState([]);
  const [availDoctorsLoading, setAvailDoctorsLoading] = useState(true);
  const [availDoctorsError, setAvailDoctorsError] = useState(null);

  const [upcomingAppointments, setUpcomingAppointments] = useState([]);
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  const [upcomingError, setUpcomingError] = useState(null);

  const [allUpcomingAppointments, setAllUpcomingAppointments] = useState([]);

  const userRole =
    receptionistFromStorage?.type ||
    receptionistFromStorage?.userType ||
    receptionistFromStorage?.role ||
    "receptionist";

  const todaysPending = useMemo(() => {
    const today = new Date();
    return allUpcomingAppointments
      .filter((a) => {
        if (!a.slotStart) return false;
        const start = new Date(a.slotStart);
        if (start.toDateString() !== today.toDateString()) return false;
        const status = String(a.status || "").toLowerCase();
        return (
          status === "scheduled" ||
          status.includes("resched") ||
          status.includes("reassign") ||
          status.includes("check") ||
          status.includes("progress")
        );
      })
      .slice(0, 5);
  }, [allUpcomingAppointments]);

  useEffect(() => {
    let mounted = true;
    const token = localStorage.getItem("token");
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

    (async () => {
      setAvailDoctorsLoading(true);
      setAvailDoctorsError(null);
      try {
        const candidates = [
          `${API}/api/receptionist/doctors?page=1&limit=8`,
          `${API}/api/admin/users?role=doctor&limit=8`,
          `${API}/api/admin/doctors?page=1&limit=8`,
          `${API}/api/doctor?page=1&limit=8`,
          `${API}/api/patient/doctors?page=1&limit=8`,
        ];

        const res = await tryEndpoints(candidates, {
          headers: { "Content-Type": "application/json", ...authHeaders },
        });

        if (!res.ok) throw new Error(res.lastErr || "Failed to load doctors");

        const docJson = res.json || {};
        let docList = [];
        if (Array.isArray(docJson)) docList = docJson;
        else if (Array.isArray(docJson.data?.doctors))
          docList = docJson.data.doctors;
        else if (Array.isArray(docJson.users)) docList = docJson.users;
        else if (Array.isArray(docJson.data)) docList = docJson.data;
        else docList = [];

        const normalized = (docList || []).map((d) => {
          const raw = d || {};
          return {
            _id:
              raw._id ??
              raw.id ??
              raw.userId ??
              Math.random().toString(36).slice(2),
            name: raw.name ?? raw.fullName ?? raw.displayName ?? "Doctor",
            specialization: raw.specialization ?? raw.speciality ?? "",
            profileImage: raw.profileImage ?? raw.avatar ?? raw.photo ?? null,
            raw,
          };
        });

        if (!mounted) return;
        setAvailDoctors(normalized);
      } catch (e) {
        if (!mounted) return;
        setAvailDoctorsError(e.message || "Failed to load doctors");
        setAvailDoctors([]);
      } finally {
        if (mounted) {
          setAvailDoctorsLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const token = localStorage.getItem("token");
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

    (async () => {
      setUpcomingLoading(true);
      setUpcomingError(null);

      try {
        const params = new URLSearchParams();
        params.set("page", "1");
        params.set("limit", "200");

        const candidates = [
          `${API}/api/receptionist/appointments?${params.toString()}`,
          `${API}/api/appointment/list?${params.toString()}`,
          `${API}/api/admin/appointments?${params.toString()}`,
          `${API}/api/appointment?${params.toString()}`,
        ];

        const res = await tryEndpoints(candidates, {
          headers: { "Content-Type": "application/json", ...authHeaders },
        });

        if (!res.ok)
          throw new Error(res.lastErr || "Failed to load appointments");

        const payload = res.json || {};
        let list = [];
        if (Array.isArray(payload)) list = payload;
        else if (Array.isArray(payload.appointments))
          list = payload.appointments;
        else if (Array.isArray(payload.data?.appointments))
          list = payload.data.appointments;
        else if (Array.isArray(payload.data)) list = payload.data;
        else list = [];

        const normalized = (list || []).map((a) => {
          const slotStart =
            a.slotStartIso ?? a.date ?? a.start ?? a.slotDate ?? null;
          const slotEnd = a.slotEndIso ?? a.slotEnd ?? a.end ?? null;
          return {
            _id: a._id ?? a.id ?? Math.random().toString(36).slice(2),
            patientName:
              a.patientId?.name ??
              a.patientName ??
              a.patient?.name ??
              a.patientId?.patientName ??
              "Patient",
            doctorName:
              a.doctorId?.name ??
              a.doctor?.name ??
              a.doctorId?.fullName ??
              "Doctor",
            slotStart,
            slotEnd,
            status: a.status ?? a.state ?? "Scheduled",
            raw: a,
          };
        });

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const future = normalized
          .filter((a) => {
            if (!a.slotStart) return false;
            const d = new Date(a.slotStart);
            return d >= startOfToday;
          })
          .sort((x, y) => new Date(x.slotStart) - new Date(y.slotStart));

        if (!mounted) return;

        setAllUpcomingAppointments(future);
        setUpcomingAppointments(
          future.slice(0, UPCOMING_APPOINTMENTS_DASHBOARD_LIMIT)
        );
      } catch (err) {
        if (!mounted) return;
        console.error("Upcoming load error:", err);
        setUpcomingError(err.message || "Failed to load upcoming appointments");
        setUpcomingAppointments([]);
        setAllUpcomingAppointments([]);
      } finally {
        if (mounted) {
          setUpcomingLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col bg-gradient-to-br from-slate-100/80 via-white to-sky-50/60"
      style={{ fontFamily: "'roboto-regular', 'Roboto', sans-serif" }}>
      <ReceptionistDashboardHeader />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 mb-8">
        {/* Quick actions */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 sm:gap-5 mb-6 sm:mb-8">
          <QuickActionCard
            title="Book Appointment"
            description="Schedule a new appointment"
            icon={CalendarPlus}
            iconWrapClass="bg-blue-50"
            iconClass="text-blue-600"
            accentBorderClass="group-hover:border-blue-200"
            accentRingClass="group-hover:ring-blue-100"
            onClick={goToBookAppointmentPage}
          />
          <QuickActionCard
            title="View Appointments"
            description="View and manage all appointments"
            icon={ClipboardList}
            iconWrapClass="bg-emerald-50"
            iconClass="text-emerald-600"
            accentBorderClass="group-hover:border-emerald-200"
            accentRingClass="group-hover:ring-emerald-100"
            onClick={goToAppointmentsPage}
          />
          <QuickActionCard
            title="Manage Patients"
            description="Add, edit and manage patient records"
            icon={Users}
            iconWrapClass="bg-orange-50"
            iconClass="text-orange-600"
            accentBorderClass="group-hover:border-orange-200"
            accentRingClass="group-hover:ring-orange-100"
            onClick={goToManagePatients}
          />
          <QuickActionCard
            title="Calendar Management"
            description="Manage calendar and time slots"
            icon={CalendarDays}
            iconWrapClass="bg-purple-50"
            iconClass="text-purple-600"
            accentBorderClass="group-hover:border-purple-200"
            accentRingClass="group-hover:ring-purple-100"
            onClick={() => setOpenHolidayModal(true)}
          />
          <QuickActionCard
            title="Bulk Reschedule"
            description="Reschedule multiple appointments"
            icon={CalendarClock}
            iconWrapClass="bg-teal-50"
            iconClass="text-teal-600"
            accentBorderClass="group-hover:border-teal-200"
            accentRingClass="group-hover:ring-teal-100"
            onClick={() => setOpenBulkRescheduleModal(true)}
          />
          <QuickActionCard
            title="Set Availability"
            description="Set your availability and working hours"
            icon={Clock}
            iconWrapClass="bg-amber-50"
            iconClass="text-amber-600"
            accentBorderClass="group-hover:border-amber-200"
            accentRingClass="group-hover:ring-amber-100"
            onClick={() => setOpenSetAvailabilityModal(true)}
          />
        </section>

        {/* Modals */}
        {openHolidayModal && (
          <MassHolidayModal
            open={openHolidayModal}
            onClose={() => setOpenHolidayModal(false)}
            userRole={userRole}
          />
        )}

        <BulkRescheduleModal
          open={openBulkRescheduleModal}
          onClose={() => setOpenBulkRescheduleModal(false)}
          userRole={userRole}
        />

        <SetAvailabilityModal
          open={openSetAvailabilityModal}
          onClose={() => setOpenSetAvailabilityModal(false)}
          userRole={userRole}
        />

        {/* Info panels */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <PanelCard
            title="Available Doctors"
            icon={Stethoscope}
            viewLabel="View All Doctors"
            onViewAll={goToBookAppointmentPage}>
            {availDoctorsLoading ? (
              <PanelEmpty>Loading doctors...</PanelEmpty>
            ) : availDoctorsError ? (
              <PanelEmpty>
                <span className="text-rose-600">{availDoctorsError}</span>
              </PanelEmpty>
            ) : availDoctors.length === 0 ? (
              <PanelEmpty>No doctors available</PanelEmpty>
            ) : (
              <ul className="space-y-1">
                {availDoctors.slice(0, 5).map((d) => (
                  <PanelListItem key={d._id}>
                    <div className="flex items-center gap-3">
                      <img
                        src={getImageUrl(d.profileImage)}
                        alt={d.name}
                        className="w-11 h-11 rounded-full object-cover border-2 border-white ring-1 ring-slate-200/80 shadow-sm flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          Dr. {d.name}
                        </div>
                        <div className="text-xs text-[#06adc6] font-medium truncate mt-0.5">
                          {d.specialization || "General Medicine"}
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/90 shadow-sm flex-shrink-0">
                        Available
                      </span>
                    </div>
                  </PanelListItem>
                ))}
              </ul>
            )}
          </PanelCard>

          <PanelCard
            title="Upcoming Appointments"
            icon={Calendar}
            viewLabel="View All Appointments"
            onViewAll={goToAppointmentsPage}>
            {upcomingLoading ? (
              <PanelEmpty>Loading appointments...</PanelEmpty>
            ) : upcomingError ? (
              <PanelEmpty>
                <span className="text-rose-600">{upcomingError}</span>
              </PanelEmpty>
            ) : upcomingAppointments.length === 0 ? (
              <PanelEmpty>No upcoming appointments</PanelEmpty>
            ) : (
              <ul className="space-y-1">
                {upcomingAppointments.map((a) => (
                  <PanelListItem key={a._id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {a.patientName}
                        </div>
                        <div className="text-xs text-slate-500 truncate mt-0.5">
                          Dr. {a.doctorName}
                        </div>
                        <div className="text-xs text-slate-500 mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100/80 border border-slate-200/60">
                          <Calendar className="w-3 h-3 text-[#134e97] flex-shrink-0" />
                          {formatApptDateTime(a.slotStart)}
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 shadow-sm ${statusBadgeClass(a.status)}`}>
                        {formatStatusLabel(a.status)}
                      </span>
                    </div>
                  </PanelListItem>
                ))}
              </ul>
            )}
          </PanelCard>

          <PanelCard
            title="Today's Pending Appointments"
            icon={Clock}
            viewLabel="View All"
            onViewAll={goToAppointmentsPage}>
            {upcomingLoading ? (
              <PanelEmpty>Loading...</PanelEmpty>
            ) : upcomingError ? (
              <PanelEmpty>
                <span className="text-rose-600">{upcomingError}</span>
              </PanelEmpty>
            ) : todaysPending.length === 0 ? (
              <PanelEmpty>No pending appointments today</PanelEmpty>
            ) : (
              <ul className="space-y-1">
                {todaysPending.map((a) => (
                  <PanelListItem key={a._id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {a.patientName}
                        </div>
                        <div className="text-xs text-slate-500 truncate mt-0.5">
                          Dr. {a.doctorName}
                        </div>
                        <div className="text-xs text-[#134e97] font-semibold mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#134e97]/[0.06] border border-[#134e97]/15">
                          <Clock className="w-3 h-3 flex-shrink-0" />
                          {formatApptTime(a.slotStart)}
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 shadow-sm ${statusBadgeClass(a.status)}`}>
                        {formatStatusLabel(a.status)}
                      </span>
                    </div>
                  </PanelListItem>
                ))}
              </ul>
            )}
          </PanelCard>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default ReceptionistDashboardContent;
