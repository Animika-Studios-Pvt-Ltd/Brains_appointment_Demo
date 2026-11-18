import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Swal from "sweetalert2";
import { api, getUser, getAuthToken, performLogout } from "../../../../utils/api";
import { getImageUrl } from "../../../../utils/imageUrl";
import MassHolidayModal from '../MassHolidayModal';
import BulkRescheduleModal from '../../receptionist/BulkRescheduleModal';
import SetAvailabilityModal from '../../shared/SetAvailabilityModal';
import Footer from "@/components/HomePage/Footer";

import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import InsightsIcon from "@mui/icons-material/Insights";
import EventBusyIcon from "@mui/icons-material/EventBusy";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import ScheduleIcon from "@mui/icons-material/Schedule";
import LogoutIcon from '@mui/icons-material/Logout';
import PeopleIcon from '@mui/icons-material/People';
import SecurityIcon from '@mui/icons-material/Security';
import ListAltIcon from '@mui/icons-material/ListAlt';
import TerminalIcon from '@mui/icons-material/Terminal';

function isSuperAdminRole(role) {
  const r = String(role || '').toLowerCase();
  return r === 'super_admin' || r === 'superadmin' || r === 'super-admin';
}

function isAdminRole(role) {
  return String(role || '').toLowerCase() === 'admin' || isSuperAdminRole(role);
}

function unwrapData(json) {
  return json?.data ?? json?.result ?? json;
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
    return "bg-gray-700 text-white border border-gray-900";   // ⭐ NEW STATUS
  }

  if (s.includes("sched") || s.includes("confirm") || s.includes("book")) {
    return "bg-blue-50 text-blue-800 border border-blue-200";
  }

  return "bg-gray-50 text-gray-700 border border-gray-200";
}




/* ---------- UI helpers ---------- */
function GlassCard({ children, className = '' }) {
  // mobile-first smaller padding; expand on sm+
  return (
    <div className={`relative rounded-2xl bg-white/80 backdrop-blur-lg border border-white/50 shadow-md transition-shadow ${className}`}>
      <div className="p-4 sm:p-6">{children}</div>
    </div>
  );
}

// Replace your QuickAction with this version (no subtitle)
function QuickAction({ href, title, iconCircleClass, iconPath, iconElement, onClick }) {
  const inner = (
    <div className="group relative overflow-hidden rounded-2xl border border-white/60 bg-white/80 backdrop-blur-sm shadow-sm transition-transform transform hover:-translate-y-1 hover:scale-[1.02] hover:shadow-lg hover:ring-1 hover:ring-indigo-200 h-full">
      <div className="p-4 sm:p-5 flex flex-col items-center text-center h-full">
        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center ring-1 ring-black/5 flex-shrink-0" aria-hidden="true">
          <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br ${iconCircleClass || 'from-slate-400 to-slate-600'} flex items-center justify-center transition-transform group-hover:scale-105`}>
            {iconElement ? (
              <div className="w-5 h-5 sm:w-6 sm:h-6 text-white flex items-center justify-center">{iconElement}</div>
            ) : (
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
              </svg>
            )}
          </div>
        </div>

        <h3 className="mt-3 text-sm sm:text-[15px] font-semibold text-gray-900 leading-snug w-full">
          {title}
        </h3>

        <div className="opacity-0 group-hover:opacity-100 text-indigo-600 text-sm font-medium transition mt-auto pt-3">
          Open →
        </div>
      </div>
    </div>
  );

  // If onClick provided (e.g. open modal), render as button wrapper, else Link
  if (onClick) {
    return (
      <div onClick={onClick} className="block cursor-pointer">
        {inner}
      </div>
    );
  }

  return (
    <Link to={href || '#'} className="block">
      {inner}
    </Link>
  );
}

function formatFullDate(d) {
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function formatFullTime(d) {
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}


function StatCard({ title, value, subtitle, iconCircleClass, iconPath, loading }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white/80 backdrop-blur-sm border border-white/60 shadow-sm transition-shadow">
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs sm:text-sm font-medium text-gray-600">{title}</h3>
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-gray-200 to-gray-100 flex items-center justify-center ring-1 ring-black/5">
            <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-br ${iconCircleClass || 'from-slate-400 to-slate-600'} flex items-center justify-center`}>
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
              </svg>
            </div>
          </div>
        </div>
        {loading ? (
          <div className="h-7 w-20 bg-gray-100 rounded animate-pulse" />
        ) : (
          <p className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">{value}</p>
        )}
        {subtitle && <p className="text-[11px] sm:text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      <div className="pointer-events-none absolute -bottom-6 -right-6 w-24 h-24 rounded-full bg-gradient-to-br from-indigo-400/10 to-purple-400/10 blur-2xl" />
    </div>
  );
}

/* ---------- Admin Dashboard component ---------- */
export default function AdminDashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState(null);

  const [todaysAppointments, setTodaysAppointments] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [topDoctors, setTopDoctors] = useState([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [listsError, setListsError] = useState(null);

  const isSuperAdmin = useMemo(() => isSuperAdminRole(user?.type), [user]);
  const isAdmin = useMemo(() => isAdminRole(user?.type), [user]);
  const [massModalOpen, setMassModalOpen] = useState(false);
  const [bulkRescheduleModalOpen, setBulkRescheduleModalOpen] = useState(false);
  const [setAvailabilityModalOpen, setSetAvailabilityModalOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [onlineLive, setOnlineLive] = useState(true);
  const [updatingLive, setUpdatingLive] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    async function fetchOnlineStatus() {
      try {
        const storedToken = getAuthToken();
        const headers = {};
        if (storedToken) headers["Authorization"] = `Bearer ${storedToken}`;
        
        const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || "http://localhost:8000"}/api/system-settings/online-booking`, {
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
  }, [token]);

  const handleToggleOnlineLive = async () => {
    if (updatingLive) return;

    const targetState = !onlineLive;
    const result = await Swal.fire({
      icon: "question",
      title: targetState ? "Enable Online Booking?" : "Disable Online Booking?",
      text: targetState
        ? "Note: Mobile app has offline mode enabled for testing. Do you want to enable global online booking?"
        : "Are you sure you want to disable global online booking?",
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
      const storedToken = getAuthToken();
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || "http://localhost:8000"}/api/system-settings/online-booking`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${storedToken}`
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
      }
    } catch (err) {
      console.error("Failed to toggle online booking status:", err);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "Failed to update online booking status.",
        confirmButtonText: "OK",
        customClass: {
          confirmButton: "swal-round-btn",
        },
        buttonsStyling: false,
      });
    } finally {
      setUpdatingLive(false);
    }
  };

  useEffect(() => {
    const storedToken = getAuthToken();
    const storedUser = getUser();

    if (!storedToken || !storedUser) {
      navigate('/', { replace: true });
      return;
    }

    if (!isAdminRole(storedUser.type) && !isSuperAdminRole(storedUser.type)) {
      navigate('/', { replace: true });
      return;
    }

    setUser(storedUser);
    setToken(storedToken);
  }, [navigate]);

  useEffect(() => {
    if (!token) return;
    let alive = true;

    (async () => {
      setLoadingStats(true);
      setStatsError(null);
      try {
        const data = await api.get('/api/admin/dashboard/stats');
        if (!alive) return;
        if (data?.status === 'success') {
          const statsData = unwrapData(data);
          setStats({
            users: {
              totalDoctors: statsData?.users?.totalDoctors ?? 0,
              totalPatients: statsData?.users?.totalPatients ?? 0,
              totalAdmins: statsData?.users?.totalAdmins ?? 0,
            },
            appointments: {
              today: statsData?.appointments?.today ?? 0,
              thisWeek: statsData?.appointments?.thisWeek ?? 0,
              thisMonth: statsData?.appointments?.thisMonth ?? 0,
              pending: statsData?.appointments?.pending ?? 0,
              completed: statsData?.appointments?.completed ?? 0,
            },
          });
        } else {
          setStatsError('Failed to load stats');
        }
      } catch (err) {
        if (alive) setStatsError(err.message || 'Failed to load stats');
      } finally {
        if (alive) setLoadingStats(false);
      }
    })();

    return () => { alive = false; };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let alive = true;

    (async () => {
      setLoadingLists(true);
      setListsError(null);

      try {
        const today = new Date();
        const startDay = new Date(today); startDay.setHours(0, 0, 0, 0);
        const endDay = new Date(today); endDay.setHours(23, 59, 59, 999);

        const apptsRes = await api.get('/api/appointment/list?page=1&limit=500').catch(() => null);
        const pendingRes = await api.get('/api/admin/pending-approvals?limit=5').catch(() => null);
        const doctorsRes = await api.get('/api/admin/doctors?page=1&limit=5').catch(() => null);

        if (!alive) return;

        let rawList = [];
        if (apptsRes) {
          if (Array.isArray(apptsRes)) rawList = apptsRes;
          else if (Array.isArray(apptsRes?.data?.appointments)) rawList = apptsRes.data.appointments;
          else if (Array.isArray(apptsRes?.data)) rawList = apptsRes.data;
          else if (Array.isArray(apptsRes?.appointments)) rawList = apptsRes.appointments;
        }

        const todays = (rawList || [])
          .filter((a) => {
            const iso = a?.slotStartIso ?? a?.slotStart ?? a?.date ?? null;
            if (!iso) return false;
            const dt = new Date(iso);
            if (Number.isNaN(dt.getTime())) return false;
            const status = String(a?.status || '').toLowerCase();
            if (status === 'cancelled') return false;
            return dt >= startDay && dt <= endDay;
          })
          .map((a) => {
            const pat = a.patientId || {};
            const doc = a.doctorId || {};
            return {
              _id: a._id ?? a.id ?? Math.random().toString(36).slice(2),
              patientName: pat.name ?? a.patientName ?? 'Patient',
              doctorName: doc.name ?? a.doctorName ?? 'Doctor',
              slotStartIso: a.slotStartIso ?? a.slotStart ?? a.date ?? null,
              slotEndIso: a.slotEndIso ?? a.slotEnd ?? null,
              date: a.date ?? null,
              status: a.status ?? 'Scheduled',
            };
          });

        todays.sort((x, y) => {
          const sx = x.slotStartIso ? new Date(x.slotStartIso).getTime() : 0;
          const sy = y.slotStartIso ? new Date(y.slotStartIso).getTime() : 0;
          return sx - sy;
        });

        setTodaysAppointments(todays.slice(0, 5));

        if (pendingRes && pendingRes?.status === 'success') {
          const list = pendingRes.data?.users ?? [];
          const normalized = (list || []).map((u) => ({
            _id: u?._id ?? Math.random().toString(36).slice(2),
            name: u?.name ?? '—',
            role: u?.role ?? 'staff',
            email: u?.email ?? '',
            isActive: !!u?.isActive,
          }));
          setPendingApprovals(normalized.filter((u) => !u.isActive).slice(0, 5));
        } else {
          setPendingApprovals([]);
        }

        if (doctorsRes && doctorsRes?.status === 'success') {
          const list = doctorsRes.data?.doctors ?? [];
          setTopDoctors(
            (list || []).slice(0, 5).map((d) => ({
              _id: d?._id ?? Math.random().toString(36).slice(2),
              name: d?.name ?? '—',
              specialization: d?.specialization ?? '',
              email: d?.email ?? '',
              profileImage: d?.profileImage ?? '',
            }))
          );
        } else {
          setTopDoctors([]);
        }
      } catch (err) {
        if (alive) {
          console.error('[AdminDashboard] Load lists error:', err);
          setListsError(err.message || 'Failed to load lists');
          setTodaysAppointments([]);
          setPendingApprovals([]);
          setTopDoctors([]);
        }
      } finally {
        if (alive) setLoadingLists(false);
      }
    })();

    return () => { alive = false; };
  }, [token]);

  async function activateOnly(target) {
    try {
      if (isSuperAdminRole(target.role)) { alert('Cannot modify Super Admin'); return; }
      if (isAdminRole(target.role) && !isSuperAdmin) { alert('Only Super Admin can modify Admins'); return; }
      const role = String(target.role || '').toLowerCase();
      if (role === 'doctor') await api.patch(`/api/admin/doctors/${target._id}/activate`);
      else if (role === 'receptionist') await api.patch(`/api/admin/receptionists/${target._id}/toggle-status`);
      else if (role === 'admin') await api.patch(`/api/admin/admins/${target._id}/toggle-status`);
      setPendingApprovals((prev) => prev.filter((p) => p._id !== target._id));
    } catch (err) {
      alert(err?.message || 'Could not activate user');
    }
  }

  function handleLogout() {
    performLogout();
  }

  if (!user || !token) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-600">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <p className="text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-600">
        <div className="text-center px-4">
          <p className="text-lg text-red-600 mb-3">Access Denied</p>
          <p className="text-sm">You don't have admin permissions</p>
        </div>
      </div>
    );
  }

  function formatDate(iso) {
    try {
      if (!iso) return '—';
      const d = new Date(iso);
      const options = { year: 'numeric', month: 'short', day: '2-digit' };
      return d.toLocaleDateString('en-US', options);
    } catch { return '—'; }
  }

  function formatTimeRange(startIso, endIso) {
    try {
      if (!startIso) return '—';
      const s = new Date(startIso);
      if (!endIso) return s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const e = new Date(endIso);
      return `${s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch { return '—'; }
  }

  function DashboardHeader({ user, isSuperAdmin, onLogout, onlineLive, updatingLive, handleToggleOnlineLive }) {
    const titleText = isSuperAdmin ? "Super Admin" : "Admin";

    return (
      <header className="bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 shadow">
        <div className="backdrop-blur-md bg-white/0 py-2 sm:py-4">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">

            <div className="flex items-center justify-between sm:justify-between lg:hidden">
              <div className="text-left">
                <h1 className="text-sm sm:text-base md:text-xl font-semibold text-white tracking-tight truncate">
                  {titleText} Dashboard
                </h1>
                <p className="text-[11px] sm:text-xs text-blue-100 truncate mt-0.5">
                  {user?.email}
                </p>
              </div>

              <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleToggleOnlineLive}
                    disabled={updatingLive}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border transition text-[10px] sm:text-xs font-bold whitespace-nowrap flex-shrink-0 ${
                      onlineLive
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                        : "bg-rose-500/20 text-rose-300 border-rose-500/30"
                    }`}
                    title={onlineLive ? "Online booking is live. Click to disable." : "Online booking is disabled. Click to make live."}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${onlineLive ? "bg-emerald-300 animate-pulse" : "bg-rose-300"}`} />
                    <span className="whitespace-nowrap">Online: {onlineLive ? "Live" : "Off"}</span>
                  </button>

                <Link
                  to="/admin/manage-patients"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-white hover:bg-white/20 border border-white/20 transition text-xs sm:text-sm"
                >
                  <ManageAccountsIcon fontSize="small" />
                </Link>
                <button
                  onClick={onLogout}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-white hover:bg-white/20 border border-white/20 transition text-xs sm:text-sm"
                >
                  <LogoutIcon fontSize="small" />
                </button>
              </div>
            </div>

            <div className="lg:hidden flex justify-center mt-2">
              <div className="text-center" role="status" aria-live="polite">
                <p className="text-lg sm:text-xl font-bold text-white tracking-wide">
                  {formatFullTime(now)}
                </p>
                <p className="text-[10px] sm:text-xs text-blue-200 mt-0.5">
                  {formatFullDate(now)}
                </p>
              </div>
            </div>

            <div className="hidden lg:grid lg:grid-cols-3 lg:items-center">
              {/* Left text */}
              <div className="text-left">
                <h1 className="text-2xl font-semibold text-white tracking-tight truncate">
                  {titleText} Dashboard
                </h1>
                <p className="text-sm text-blue-100 truncate mt-0.5">
                  {user?.email}
                </p>
              </div>

              {/* Center clock */}
              <div className="flex justify-center">
                <div className="text-center" role="status" aria-live="polite">
                  <p className="text-2xl font-bold text-white tracking-wide">
                    {formatFullTime(now)}
                  </p>
                  <p className="text-sm text-blue-200 mt-0.5">
                    {formatFullDate(now)}
                  </p>
                </div>
              </div>

              {/* Right buttons */}
              <div className="flex justify-end items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleOnlineLive}
                  disabled={updatingLive}
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border transition text-xs md:text-sm font-semibold whitespace-nowrap flex-shrink-0 ${
                    onlineLive
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/30"
                      : "bg-rose-500/20 text-rose-300 border-rose-500/30 hover:bg-rose-500/30"
                  }`}
                  title={onlineLive ? "Online booking is live. Click to disable." : "Online booking is disabled. Click to make live."}
                >
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${onlineLive ? "bg-emerald-300 animate-pulse" : "bg-rose-300"}`} />
                  <span className="whitespace-nowrap">Online Booking: {onlineLive ? "Live" : "Off"}</span>
                </button>

                <Link
                  to="/admin/manage-patients"
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 text-white hover:bg-white/20 border border-white/20 transition text-xs sm:text-sm whitespace-nowrap flex-shrink-0"
                >
                  <ManageAccountsIcon fontSize="small" />
                  <span className="whitespace-nowrap">Manage patients</span>
                </Link>
                <button
                  onClick={onLogout}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 text-white hover:bg-white/20 border border-white/20 transition text-xs sm:text-sm whitespace-nowrap flex-shrink-0"
                >
                  <LogoutIcon fontSize="small" />
                  <span className="whitespace-nowrap">Logout</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      </header>
    );
  }


  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-indigo-50 via-purple-50 to-sky-50 overflow-x-hidden">
      <DashboardHeader
        user={user}
        isSuperAdmin={isSuperAdmin}
        onLogout={handleLogout}
        onlineLive={onlineLive}
        updatingLive={updatingLive}
        handleToggleOnlineLive={handleToggleOnlineLive}
      />
      <main className="relative">
        <div className="relative max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
          {statsError && <div className="mb-4 p-2 rounded bg-yellow-50 text-yellow-800 text-sm border border-yellow-200">{statsError}</div>}
          {listsError && <div className="mb-4 p-2 rounded bg-yellow-50 text-yellow-800 text-sm border border-yellow-200">{listsError}</div>}

          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4 sm:gap-6 mb-8">
            {/* Manage Users */}
            <QuickAction
              href="/admin/users"
              title="Manage Users"
              iconCircleClass="from-indigo-500 to-blue-500"
              iconElement={<PeopleIcon style={{ fontSize: 20 }} />}
            />
            {/* Doctors Appointments */}
            <QuickAction
              href="/admin/appointments"
              title="Doctors Appointments"
              iconCircleClass="from-emerald-500 to-teal-500"
              iconElement={<CalendarMonthIcon style={{ fontSize: 20 }} />}
            />
            {/* Calendar Management / Mass Blocking */}
            <QuickAction
              onClick={() => setMassModalOpen(true)}
              title="Calendar Management"
              iconCircleClass="from-rose-400 to-rose-600"
              iconElement={<EventBusyIcon style={{ fontSize: 20 }} />}
            />
            {/* Bulk Reschedule */}
            <QuickAction
              onClick={() => setBulkRescheduleModalOpen(true)}
              title="Bulk Reschedule"
              iconCircleClass="from-teal-500 to-cyan-600"
              iconElement={<EventRepeatIcon style={{ fontSize: 20 }} />}
            />
            {/* Set Availability */}
            <QuickAction
              onClick={() => setSetAvailabilityModalOpen(true)}
              title="Set Availability"
              iconCircleClass="from-amber-500 to-orange-500"
              iconElement={<ScheduleIcon style={{ fontSize: 20 }} />}
            />
            {/* Analytics */}
            <QuickAction
              href="/admin/analytics"
              title="Analytics"
              iconCircleClass="from-violet-500 to-fuchsia-500"
              iconElement={<InsightsIcon style={{ fontSize: 20 }} />}
            />
            {/* System API Tester */}
            <QuickAction
              href="/admin/system-api-tester"
              title="System API Tester"
              iconCircleClass="from-slate-700 to-slate-900"
              iconElement={<TerminalIcon style={{ fontSize: 20 }} />}
            />
          </section>

          {/* mount modal */}
          {/* mount modal */}
          <MassHolidayModal
            open={massModalOpen}
            onClose={() => setMassModalOpen(false)}
            userRole={user?.type || user?.role || "admin"}
          />

          <BulkRescheduleModal
            open={bulkRescheduleModalOpen}
            onClose={() => setBulkRescheduleModalOpen(false)}
            userRole={user?.type || user?.role || "admin"}
          />

          <SetAvailabilityModal
            open={setAvailabilityModalOpen}
            onClose={() => setSetAvailabilityModalOpen(false)}
            userRole={user?.type || user?.role || "admin"}
          />


          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            <GlassCard>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm sm:text-base font-semibold text-gray-900">Today's Appointments</h3>
                <Link to="/admin/appointments" className="text-xs sm:text-sm text-indigo-600 hover:text-indigo-700">View all</Link>
              </div>

              {loadingLists ? (
                <div className="py-6 text-gray-500 text-center">Loading…</div>
              ) : todaysAppointments.length === 0 ? (
                <div className="py-6 text-gray-500 text-center text-sm">
                  <p>No appointments for today</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-200/60">
                  {todaysAppointments.map((a) => (
                    <li key={a._id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-gray-900 truncate">{a.patientName}</div>
                        <div className="text-[11px] text-gray-500 truncate">with Dr. {a.doctorName}</div>
                        <div className="text-[11px] text-gray-400 mt-1">
                          {formatDate(a.slotStartIso || a.date)} · <span className="font-medium">{formatTimeRange(a.slotStartIso, a.slotEndIso)}</span>
                        </div>
                      </div>
                      <span className={`text-[10px] sm:text-xs px-2 py-1 rounded-full shadow-sm ${badgeClass(a.status)}`}>
                        {a.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </GlassCard>

            <GlassCard>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm sm:text-base font-semibold text-gray-900">Pending Approvals</h3>
                <Link to="/admin/users" className="text-xs sm:text-sm text-indigo-600 hover:text-indigo-700">Manage</Link>
              </div>

              {loadingLists ? (
                <div className="py-6 text-gray-500 text-center">Loading…</div>
              ) : pendingApprovals.length === 0 ? (
                <div className="py-6 text-gray-500 text-center text-sm">
                  <p>Nothing pending Approvals</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-200/60">
                  {pendingApprovals.slice(0, 5).map((u) => {
                    const isSuper = isSuperAdminRole(u.role);
                    const adminBlocked = isAdminRole(u.role) && !isSuperAdmin;
                    const disabled = isSuper || adminBlocked;
                    return (
                      <li key={u._id} className="py-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{u.name}</div>
                            <div className="text-[11px] text-gray-500 truncate">{u.email}</div>
                            <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-gray-100 text-gray-700 capitalize">
                              {String(u.role)}
                            </div>
                          </div>

                          <div className="flex gap-2 w-full sm:w-auto">
                            <button
                              onClick={() => { if (!disabled) activateOnly(u); }}
                              className={`w-full sm:w-auto px-3 py-1 text-xs rounded-md border shadow-sm transition ${disabled ? 'opacity-50 cursor-not-allowed border-gray-200 bg-white' : 'border-indigo-200 bg-white/70 hover:bg-white'}`}
                              disabled={disabled}
                              aria-disabled={disabled}
                            >
                              Activate
                            </button>
                            <Link to="/admin/users" className="w-full sm:w-auto text-center px-3 py-1 text-xs rounded-md border border-gray-200 bg-white/70 hover:bg-white shadow-sm transition">
                              Details
                            </Link>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </GlassCard>

            <GlassCard>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm sm:text-base font-semibold text-gray-900">Top Doctors</h3>
                <Link to="/admin/users" className="text-xs sm:text-sm text-indigo-600 hover:text-indigo-700">View doctors</Link>
              </div>

              {loadingLists ? (
                <div className="py-6 text-gray-500 text-center">Loading…</div>
              ) : topDoctors.length === 0 ? (
                <div className="py-6 text-gray-500 text-center text-sm">
                  <p>No doctors available</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-200/60">
                  {topDoctors.slice(0, 5).map((d) => (
                    <li key={d._id} className="py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full overflow-hidden border bg-white/60 flex-shrink-0">
                          <img
                            src={getImageUrl(d.profileImage, d.name)}
                            alt={d.name}
                            className="w-full h-full object-cover"
                            onError={(e) => { e.target.src = getImageUrl("", d.name); }}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{d.name}</div>
                          {d.email && <div className="text-[11px] text-gray-500 truncate">{d.email}</div>}
                          <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-gray-100 text-gray-700 capitalize">
                            {d.specialization || '—'}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </GlassCard>
          </section>

          {/* SUPER ADMIN EXCLUSIVE CONTROLS (Right above Footer) */}
          {isSuperAdmin && (
            <section className="mt-8">
              <GlassCard className="!p-2 sm:!p-3">
                <div className="flex items-center gap-2.5 mb-5">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                    SUPER ADMIN CONTROLS
                  </span>
                  <h2 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight">
                    Security & Activity Audit Logs
                  </h2>
                </div>

                {/* Master Online Booking Toggle */}
                <div className="mb-6 p-4 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg flex-shrink-0 ${onlineLive ? "bg-gradient-to-br from-emerald-500 to-teal-600" : "bg-gradient-to-br from-rose-500 to-red-600"}`}>
                      💻
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-base font-semibold text-gray-900">
                        Online Consultation Bookings
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Global master switch to enable or disable the online booking flow across the entire platform.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleOnlineLive}
                    disabled={updatingLive}
                    className={`px-4 py-2 rounded-full border text-sm font-semibold transition flex items-center gap-2 self-start sm:self-center whitespace-nowrap flex-shrink-0 ${
                      onlineLive
                        ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/20"
                        : "bg-rose-500/10 text-rose-700 border-rose-500/30 hover:bg-rose-500/20"
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${onlineLive ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                    <span className="whitespace-nowrap">Online Booking: {onlineLive ? "Active / Live" : "Inactive / Off"}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Link
                    to="/super-admin/login-history"
                    className="group relative overflow-hidden rounded-2xl border border-slate-200 hover:border-indigo-300 bg-white p-4 sm:p-5 shadow-sm transition-all transform hover:-translate-y-1 hover:scale-[1.01] hover:shadow-md flex items-center gap-4"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white shadow-md flex-shrink-0 group-hover:scale-105 transition-transform">
                      <SecurityIcon />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm sm:text-base font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                          User Login History
                        </h3>
                        <span className="text-xs font-semibold text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
                          Open →
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                        Track all logins, logouts, and failed authentication attempt records for all users.
                      </p>
                    </div>
                  </Link>

                  <Link
                    to="/super-admin/activity-logs"
                    className="group relative overflow-hidden rounded-2xl border border-slate-200 hover:border-teal-300 bg-white p-4 sm:p-5 shadow-sm transition-all transform hover:-translate-y-1 hover:scale-[1.01] hover:shadow-md flex items-center gap-4"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md flex-shrink-0 group-hover:scale-105 transition-transform">
                      <ListAltIcon />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm sm:text-base font-semibold text-gray-900 group-hover:text-teal-600 transition-colors">
                          User Activity Logs
                        </h3>
                        <span className="text-xs font-semibold text-teal-600 opacity-0 group-hover:opacity-100 transition-opacity">
                          Open →
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                        Audit system operations, appointment updates, user modifications, and administrative events.
                      </p>
                    </div>
                  </Link>

                  <Link
                    to="/admin/system-api-tester"
                    className="group relative overflow-hidden rounded-2xl border border-slate-200 hover:border-slate-400 bg-white p-4 sm:p-5 shadow-sm transition-all transform hover:-translate-y-1 hover:scale-[1.01] hover:shadow-md flex items-center gap-4"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-800 to-slate-950 flex items-center justify-center text-white shadow-md flex-shrink-0 group-hover:scale-105 transition-transform">
                      <TerminalIcon />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm sm:text-base font-semibold text-gray-900 group-hover:text-slate-800 transition-colors">
                          System API Tester
                        </h3>
                        <span className="text-xs font-semibold text-slate-800 opacity-0 group-hover:opacity-100 transition-opacity">
                          Open →
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                        Live API request debugger, response latency inspector, pre-configured endpoint presets, and headers testing console.
                      </p>
                    </div>
                  </Link>
                </div>
              </GlassCard>
            </section>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
