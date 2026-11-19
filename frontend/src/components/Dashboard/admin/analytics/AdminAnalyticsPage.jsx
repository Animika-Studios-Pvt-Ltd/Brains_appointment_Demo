// src/components/Dashboard/admin/analytics/AdminAnalyticsPage.jsx
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Footer from "@/components/HomePage/Footer";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  Users,
  Calendar,
  Award,
  Sparkles,
  Clock,
  RefreshCw,
  FileDown,
  HelpCircle,
  Stethoscope,
  ChevronDown,
  Percent,
  CheckCircle,
  AlertTriangle,
  HeartPulse,
  Activity,
  ArrowLeft,
} from 'lucide-react';
import {
  getAppointmentStatusChartColor,
  formatAppointmentStatusLabel,
  CHART_CATEGORY_COLORS,
} from '@/lib/constant';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

// Typography Font Constants matching custom.css & index.css
const HEADING_FONT = "'mirador-medium', 'Outfit', sans-serif";
const BODY_FONT = "'roboto-regular', 'Roboto', sans-serif";
const LIGHT_BODY_FONT = "'roboto-light', 'Roboto', sans-serif";


// Custom Tooltip component for a premium light clinic look
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div
        className="bg-white/95 text-slate-800 backdrop-blur-md border border-slate-200/80 p-3 rounded-2xl shadow-xl text-xs font-sans"
        style={{ fontFamily: BODY_FONT }}
      >
        <p className="font-semibold mb-1.5 text-slate-900">{label}</p>
        {payload.map((pld, index) => (
          <div key={index} className="flex items-center gap-2 mt-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: pld.color || pld.fill }} />
            <span className="text-slate-500">{pld.name}:</span>
            <span className="font-bold text-slate-900">{pld.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function AdminAnalyticsPage() {
  const navigate = useNavigate();
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  // States
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(''); // Empty = All Time initially, then defaults to current month
  const [isNonTechMode, setIsNonTechMode] = useState(false);
  const [activeTab, setActiveTab] = useState('overview'); // overview, clinicians, specialties, tables, appointments_list

  // Detailed Appointments List, Filter & Pagination state
  const [appointmentsList, setAppointmentsList] = useState([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [channelFilter, setChannelFilter] = useState('all'); // 'all', 'self', 'receptionist', 'call center', 'admin'
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10); // 10, 25, 50, 100, 'all'

  const filteredAppointments = useMemo(() => {
    if (channelFilter === 'all') return appointmentsList;
    return appointmentsList.filter((appt) => {
      const bBy = (appt.bookedBy || 'self').toLowerCase();
      if (channelFilter === 'self') return bBy === 'self';
      if (channelFilter === 'receptionist') return bBy === 'receptionist';
      if (channelFilter === 'call center') return bBy.includes('call');
      if (channelFilter === 'admin') return bBy === 'admin';
      return true;
    });
  }, [appointmentsList, channelFilter]);

  const paginatedAppointments = useMemo(() => {
    if (itemsPerPage === 'all') return filteredAppointments;
    const limit = Number(itemsPerPage);
    const startIndex = (currentPage - 1) * limit;
    return filteredAppointments.slice(startIndex, startIndex + limit);
  }, [filteredAppointments, currentPage, itemsPerPage]);

  const totalPages = useMemo(() => {
    if (itemsPerPage === 'all') return 1;
    return Math.ceil(filteredAppointments.length / Number(itemsPerPage));
  }, [filteredAppointments, itemsPerPage]);

  const sourceCountsMap = useMemo(() => {
    const counts = {
      self: 0,
      receptionist: 0,
      'call center': 0,
      admin: 0
    };
    if (stats?.appointments?.bySource) {
      stats.appointments.bySource.forEach(src => {
        const nameLower = src.name.toLowerCase();
        if (nameLower.includes('self')) counts.self = src.value;
        else if (nameLower.includes('receptionist')) counts.receptionist = src.value;
        else if (nameLower.includes('call')) counts['call center'] = src.value;
        else if (nameLower.includes('admin')) counts.admin = src.value;
      });
    }
    return counts;
  }, [stats]);

  // Responsive screen state
  const [smallScreen, setSmallScreen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setSmallScreen(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Generate the last 12 months dynamically for the selector
  const monthsList = useMemo(() => {
    const list = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      list.push({ ym, label });
    }
    return list;
  }, []);

  // Set default selected month to current month on mount
  useEffect(() => {
    if (monthsList.length > 0 && !selectedMonth) {
      setSelectedMonth(monthsList[0].ym);
    }
  }, [monthsList, selectedMonth]);

  // Fetch function
  const fetchJson = useCallback(async (url) => {
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText} — ${text}`);
    }
    return res.json();
  }, [token]);

  // Load analytics stats
  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParam = selectedMonth && selectedMonth !== 'all' ? `?month=${selectedMonth}` : '';
      const resp = await fetchJson(`${BACKEND}/api/admin/analytics/stats${queryParam}`);
      if (resp?.success) {
        setStats(resp.data);
      } else {
        throw new Error(resp?.message || 'Failed to parse response');
      }
    } catch (e) {
      console.error('Error fetching analytics stats:', e);
      setError(e?.message || 'Failed to fetch clinical analytics records.');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, fetchJson]);

  // Load detailed appointments list
  const loadAppointmentsList = useCallback(async () => {
    setAppointmentsLoading(true);
    try {
      const queryParam = selectedMonth && selectedMonth !== 'all' ? `?month=${selectedMonth}` : '';
      const resp = await fetchJson(`${BACKEND}/api/admin/analytics/appointments${queryParam}`);
      if (resp?.success) {
        setAppointmentsList(resp.data || []);
      }
    } catch (e) {
      console.error('Error fetching analytics appointments:', e);
    } finally {
      setAppointmentsLoading(false);
    }
  }, [selectedMonth, fetchJson]);

  // Fetch when selected month changes
  useEffect(() => {
    if (selectedMonth) {
      loadAnalytics();
      loadAppointmentsList();
      setCurrentPage(1);
    }
  }, [selectedMonth, loadAnalytics, loadAppointmentsList]);

  // AI-Style Insights Generator for Non-Tech Users
  const executiveInsights = useMemo(() => {
    if (!stats) return null;
    const appts = stats.appointments || {};
    const total = appts.total || 0;
    const completed = appts.completed || 0;
    const pending = appts.pending || 0;
    const cancelled = appts.cancelled || 0;
    const noShows = appts.noShow || 0;
    const noShowRate = appts.noShowPercent || 0;
    const load = appts.avgPerDoctorMonth || 0;
    const leaderboard = appts.doctorLeaderboard || [];
    const specialties = appts.specialtyData || [];

    const completionRate = total ? Math.round((completed / total) * 100) : 0;

    // Doctor load insights
    let loadStatus = "Balanced Load";
    let loadDesc = "Clinicians have healthy calendars to address more patients.";
    let loadColor = "text-emerald-600 bg-emerald-50 border-emerald-100";
    if (load > 15) {
      loadStatus = "High Capacity Load";
      loadDesc = "Clinicians are heavily booked. Consider opening more slots or onboarding additional clinicians.";
      loadColor = "text-amber-600 bg-amber-50 border-amber-100";
    } else if (load >= 6) {
      loadStatus = "Optimal Workload";
      loadDesc = "Clinicians are maintaining a steady, productive pace with sufficient breathing room.";
      loadColor = "text-blue-600 bg-blue-50 border-blue-100";
    }

    // Attendance insights
    let attendanceStatus = "High Attendance Rate";
    let attendanceDesc = "Almost all patients are arriving for their slots. Slot wastage is extremely low.";
    let attendanceColor = "text-emerald-600 bg-emerald-50 border-emerald-100";
    if (noShowRate > 10) {
      attendanceStatus = "High Slot Wastage";
      attendanceDesc = "A high percentage of slots are wasted due to missed appointments. Consider activating automated SMS/email reminders.";
      attendanceColor = "text-rose-600 bg-rose-50 border-rose-100";
    } else if (noShowRate > 4) {
      attendanceStatus = "Moderate Attendance";
      attendanceDesc = "A few scheduled slots are being missed. Keep an eye on patient booking behavior.";
      attendanceColor = "text-amber-600 bg-amber-50 border-amber-100";
    }

    // Specialty demand
    let topSpecialty = "General Care";
    let topSpecialtyCount = 0;
    if (specialties.length > 0) {
      topSpecialty = specialties[0].name;
      topSpecialtyCount = specialties[0].value;
    }

    // Clinician volume
    let busiestDoc = "N/A";
    let busiestDocCount = 0;
    if (leaderboard.length > 0) {
      busiestDoc = leaderboard[0].name;
      busiestDocCount = leaderboard[0].appointments;
    }

    // Score calculations
    const score = total ? Math.min(100, Math.max(0, Math.round(completionRate * 0.7 + (100 - noShowRate) * 0.3))) : 0;

    return {
      completionRate,
      loadStatus,
      loadDesc,
      loadColor,
      attendanceStatus,
      attendanceDesc,
      attendanceColor,
      topSpecialty,
      topSpecialtyCount,
      busiestDoc,
      busiestDocCount,
      healthScore: score,
      healthStatus: score >= 85 ? 'Outstanding' : score >= 70 ? 'Good' : 'Needs Optimization'
    };
  }, [stats]);

  // CSV Report Generator
  const downloadCSVReport = () => {
    if (!stats) return;
    const appts = stats.appointments || {};
    const users = stats.users || {};
    const leaderboard = appts.doctorLeaderboard || [];
    const specialties = appts.specialtyData || [];

    let csvContent = "data:text/csv;charset=utf-8,";

    // Header Info
    csvContent += `CLINICAL APPOINTMENTS & ANALYTICS REPORT\r\n`;
    csvContent += `Report Period,${selectedMonth === 'all' ? 'All Time' : selectedMonth}\r\n`;
    csvContent += `Generated On,${new Date().toLocaleString()}\r\n\r\n`;

    // High Level Numbers
    csvContent += `KEY HOSPITAL METRICS\r\n`;
    csvContent += `Metric,Value,Explanation\r\n`;
    csvContent += `Total Doctors,${users.totalDoctors || 0},Active registered clinicians in the database\r\n`;
    csvContent += `Total Patients,${users.totalPatients || 0},Total patients in hospital records\r\n`;
    csvContent += `Total Bookings,${appts.total || 0},Total appointments booked\r\n`;
    csvContent += `Completed Visits,${appts.completed || 0},Visits successfully completed\r\n`;
    csvContent += `Pending Visits,${appts.pending || 0},Bookings currently scheduled or pending\r\n`;
    csvContent += `Missed Appointments,${appts.noShow || 0},Patients who missed their scheduled slots\r\n`;
    csvContent += `Missed Rate (%),${appts.noShowPercent || 0}%,Percentage of total missed slots\r\n`;
    csvContent += `Avg Load Per Doctor,${appts.avgPerDoctorMonth || 0},Average patient count seen by each doctor\r\n\r\n`;

    // Department breakdown
    csvContent += `DEPARTMENT / SPECIALIZATION DEMAND\r\n`;
    csvContent += `Specialization,Bookings Count\r\n`;
    specialties.forEach(s => {
      csvContent += `"${s.name}",${s.value}\r\n`;
    });
    csvContent += `\r\n`;

    // Clinician Leaderboard
    csvContent += `CLINICIAN LEADERBOARD (MOST ACTIVE)\r\n`;
    csvContent += `Clinician Name,Specialization,Appointments Booked,Completed Appointments\r\n`;
    leaderboard.forEach(d => {
      csvContent += `"${d.name}","${d.specialization}",${d.appointments},${d.completed}\r\n`;
    });
    csvContent += `\r\n`;

    // Booking Channel breakdown
    const sources = appts.bySource || [];
    csvContent += `BOOKING CHANNELS / SOURCES\r\n`;
    csvContent += `Channel,Bookings Count\r\n`;
    sources.forEach(s => {
      csvContent += `"${s.name}",${s.value}\r\n`;
    });
    csvContent += `\r\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Hospital_Analytics_${selectedMonth || 'Report'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-50 via-[#134e97]/5 to-[#06adc6]/5 text-slate-800 flex flex-col font-sans selection:bg-[#134e97]/10 selection:text-[#134e97] antialiased"
      style={{ fontFamily: BODY_FONT }}
    >

      {/* Background glowing decorations */}
      <div className="absolute top-20 left-10 w-96 h-96 bg-[#134e97]/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-[#06adc6]/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Header Panel */}
      <header className="relative z-10 border-b-4 border-[#134e97] bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">

            {/* Logo / Back Button */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="p-2.5 rounded-xl bg-slate-50 text-[#134e97] hover:bg-[#134e97] hover:text-white transition-all border border-slate-200 flex items-center justify-center"
                title="Back to Dashboard"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1
                  className="text-xl sm:text-2xl font-bold tracking-tight text-[#134e97] mt-0.5 flex items-center gap-2"
                  style={{ fontFamily: HEADING_FONT }}
                >
                  Clinical Performance Analytics
                </h1>
              </div>
            </div>

            {/* Global Controls Grid */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Month Dropdown Selector */}
              <div className="relative">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="appearance-none bg-white border border-slate-200 text-slate-800 pl-4 pr-10 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#134e97]/50 cursor-pointer text-sm font-medium transition-all"
                  style={{ fontFamily: BODY_FONT }}
                >
                  <option value="all">All Time (Aggregated)</option>
                  {monthsList.map((m) => (
                    <option key={m.ym} value={m.ym}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3.5 top-3.5 pointer-events-none" />
              </div>

              {/* CSV Export */}
              <button
                onClick={downloadCSVReport}
                disabled={!stats}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#134e97] text-white font-semibold text-sm hover:bg-[#134e97]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-[#134e97]/10 border border-[#134e97]/25"
                style={{ fontFamily: BODY_FONT }}
              >
                <FileDown className="w-4 h-4" />
                <span>Export CSV</span>
              </button>

              {/* Refresh Button */}
              <button
                onClick={() => {
                  loadAnalytics();
                  loadAppointmentsList();
                }}
                className="p-2.5 rounded-xl bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all hover:text-[#134e97]"
                title="Refresh stats"
              >
                <RefreshCw className={`w-4 h-4 ${loading || appointmentsLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

          </div>
        </div>
      </header>

      {/* Main Dashboard Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">

        {error && (
          <div
            className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3 shadow-sm font-sans"
            style={{ fontFamily: BODY_FONT }}
          >
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-rose-900">Retrieval Error</h4>
              <p className="text-xs text-rose-700 mt-1">{error}</p>
              <button
                onClick={loadAnalytics}
                className="mt-2 text-xs font-bold text-[#134e97] hover:underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Loading Overlay Skeleton */}
        {loading ? (
          <div className="space-y-8 animate-pulse">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-28 bg-white border border-slate-100 rounded-3xl shadow-sm" />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="h-80 bg-white border border-slate-100 rounded-3xl shadow-sm lg:col-span-2" />
              <div className="h-80 bg-white border border-slate-100 rounded-3xl shadow-sm" />
            </div>
          </div>
        ) : (
          <div className="space-y-8">

            {/* Non-Tech Explanation Alert Banner */}
            {isNonTechMode && (
              <div
                className="p-4 bg-amber-50 border border-amber-200/80 rounded-2xl shadow-sm flex gap-3 text-sm text-amber-900 font-sans"
                style={{ fontFamily: BODY_FONT }}
              >
                <Sparkles className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-amber-800 font-bold block mb-0.5">Simplify Mode Active</strong>
                  All hospital graphs and performance stats are translated into simple, plain English terms. We have highlighted what is working well and where adjustments are needed so anyone can easily audit clinic health!
                </div>
              </div>
            )}            {/* High Level KPI Metrics Grid */}
            <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">

              {/* Doctor Metric Card */}
              <div className="bg-white border border-slate-100 hover:border-[#134e97]/30 p-5 rounded-3xl hover:shadow-md hover:-translate-y-0.5 transition-all group flex flex-col justify-between shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <h3
                      className="text-xs font-bold text-slate-400 uppercase tracking-wider"
                      style={{ fontFamily: BODY_FONT }}
                    >
                      {isNonTechMode ? 'Active Physicians' : 'Total Clinicians'}
                    </h3>
                    <p
                      className="text-2xl font-black text-[#134e97] mt-1"
                      style={{ fontFamily: HEADING_FONT }}
                    >
                      {stats?.users?.totalDoctors ?? '0'}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#134e97]/10 text-[#134e97] group-hover:bg-[#134e97] group-hover:text-white transition-all">
                    <Stethoscope className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-3 text-[11px] text-slate-500 leading-relaxed">
                  {isNonTechMode ? (
                    <span>Licensed medical practitioners available for patient appointments.</span>
                  ) : (
                    <span>Doctors registered in system database.</span>
                  )}
                </div>
              </div>

              {/* Patient Metric Card */}
              <div className="bg-white border border-slate-100 hover:border-[#07adc5]/30 p-5 rounded-3xl hover:shadow-md hover:-translate-y-0.5 transition-all group flex flex-col justify-between shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <h3
                      className="text-xs font-bold text-slate-400 uppercase tracking-wider"
                      style={{ fontFamily: BODY_FONT }}
                    >
                      {isNonTechMode ? 'Registered Patients' : 'Total Patients'}
                    </h3>
                    <p
                      className="text-2xl font-black text-[#07adc5] mt-1"
                      style={{ fontFamily: HEADING_FONT }}
                    >
                      {stats?.users?.totalPatients ?? '0'}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#07adc5]/10 text-[#07adc5] group-hover:bg-[#07adc5] group-hover:text-white transition-all">
                    <Users className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-3 text-[11px] text-slate-500 leading-relaxed">
                  {isNonTechMode ? (
                    <span>Total unique users who have signed up to book consultations.</span>
                  ) : (
                    <span>Registered patients record count.</span>
                  )}
                </div>
              </div>

              {/* Bookings Card */}
              <div className="bg-white border border-slate-100 hover:border-[#134e97]/30 p-5 rounded-3xl hover:shadow-md hover:-translate-y-0.5 transition-all group flex flex-col justify-between shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <h3
                      className="text-xs font-bold text-slate-400 uppercase tracking-wider"
                      style={{ fontFamily: BODY_FONT }}
                    >
                      {isNonTechMode ? 'Visits Booked' : 'Total Appointments'}
                    </h3>
                    <p
                      className="text-2xl font-black text-[#134e97] mt-1"
                      style={{ fontFamily: HEADING_FONT }}
                    >
                      {stats?.appointments?.total ?? '0'}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#134e97]/10 text-[#134e97] group-hover:bg-[#134e97] group-hover:text-white transition-all">
                    <Calendar className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-3 text-[11px] text-slate-500 leading-relaxed">
                  {isNonTechMode ? (
                    <span>Scheduled clinic appointments requested in this timeframe.</span>
                  ) : (
                    <span>Appointments scoped in the query window.</span>
                  )}
                </div>
              </div>

              {/* No-Shows Card */}
              <div className="bg-white border border-slate-100 hover:border-rose-500/30 p-5 rounded-3xl hover:shadow-md hover:-translate-y-0.5 transition-all group flex flex-col justify-between shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <h3
                      className="text-xs font-bold text-slate-400 uppercase tracking-wider"
                      style={{ fontFamily: BODY_FONT }}
                    >
                      {isNonTechMode ? 'Missed Appointments' : 'Missed Rate (%)'}
                    </h3>
                    <p
                      className="text-2xl font-black text-rose-500 mt-1"
                      style={{ fontFamily: HEADING_FONT }}
                    >
                      {stats?.appointments?.noShowPercent ?? '0'}%
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-rose-50 text-rose-500 group-hover:bg-rose-500 group-hover:text-white transition-all">
                    <Percent className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-3 text-[11px] text-slate-500 leading-relaxed">
                  {isNonTechMode ? (
                    <span>Booked slots where patient didn't show up. Lower is better!</span>
                  ) : (
                    <span>Average missed rate. Total: {stats?.appointments?.noShow || 0} slots.</span>
                  )}
                </div>
              </div>

            </section>

            {/* Tabbed view for secondary controls */}
            <div className="flex border-b border-slate-200 gap-2 overflow-x-auto">
              {[
                { id: 'overview', label: 'Dashboard Overview' },
                { id: 'clinicians', label: 'Clinician Performance' },
                { id: 'specialties', label: 'Department Demand' },
                { id: 'tables', label: 'Analytical Table' },
                { id: 'appointments_list', label: 'Total Appointments List' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap transition-all ${activeTab === tab.id
                    ? 'border-[#134e97] text-[#134e97]'
                    : 'border-transparent text-slate-400 hover:text-slate-700 hover:border-slate-300'
                    }`}
                  style={{ fontFamily: BODY_FONT }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* TAB CONTENTS */}
            {activeTab === 'overview' && (
              <div className="space-y-6">

                {/* Visual Charts Layout Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                  {/* Daily Trend line/area chart (2/3 width) */}
                  <div className="bg-white border border-slate-100 shadow-sm rounded-3xl p-5 hover:shadow-md transition-all duration-300 text-slate-800 lg:col-span-2 overflow-hidden flex flex-col">
                    <div>
                      <h3
                        className="text-base font-bold text-[#134e97] flex items-center gap-2"
                        style={{ fontFamily: HEADING_FONT }}
                      >
                        <TrendingUp className="w-4 h-4 text-[#07adc5]" />
                        Daily Booking Volumes
                      </h3>
                      {isNonTechMode ? (
                        <p
                          className="text-xs text-slate-500 mt-1"
                          style={{ fontFamily: BODY_FONT }}
                        >
                          This graph shows day-by-day appointment activity. Use this to audit which days have high clinic footfall.
                        </p>
                      ) : (
                        <p
                          className="text-xs text-slate-500 mt-1"
                          style={{ fontFamily: BODY_FONT }}
                        >
                          Daily timeline tracking of requested, completed and pending appointments.
                        </p>
                      )}
                    </div>

                    <div className="h-72 mt-6 relative w-full flex-1 min-h-[250px]">
                      {stats?.appointments?.byDay?.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={stats.appointments.byDay} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                              <linearGradient id="gradientAppts" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#134e97" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#134e97" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="gradientComp" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#07adc5" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#07adc5" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 10, fontFamily: BODY_FONT }} />
                            <YAxis stroke="#94a3b8" tick={{ fontSize: 10, fontFamily: BODY_FONT }} allowDecimals={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 11, fontFamily: BODY_FONT }} />
                            <Area type="monotone" dataKey="appointments" stroke="#134e97" strokeWidth={2.5} fillOpacity={1} fill="url(#gradientAppts)" name="Appointments Booked" />
                            <Area type="monotone" dataKey="completed" stroke="#07adc5" strokeWidth={2} fillOpacity={1} fill="url(#gradientComp)" name="Visits Completed" />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-slate-400 text-xs font-sans" style={{ fontFamily: BODY_FONT }}>
                          No daily historical timeline data available for this range.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status outcome Pie chart (1/3 width) */}
                  <div className="bg-white border border-slate-100 shadow-sm rounded-3xl p-5 hover:shadow-md transition-all duration-300 text-slate-800 flex flex-col justify-between">
                    <div>
                      <h3
                        className="text-base font-bold text-[#134e97] flex items-center gap-2"
                        style={{ fontFamily: HEADING_FONT }}
                      >
                        <Clock className="w-4 h-4 text-[#07adc5]" />
                        Booking Status Outcomes
                      </h3>
                      {isNonTechMode ? (
                        <p
                          className="text-xs text-slate-500 mt-1"
                          style={{ fontFamily: BODY_FONT }}
                        >
                          Where did the bookings go? This slices your slots by outcome to audit clinic efficiency.
                        </p>
                      ) : (
                        <p
                          className="text-xs text-slate-500 mt-1"
                          style={{ fontFamily: BODY_FONT }}
                        >
                          Distribution of appointments across status categories.
                        </p>
                      )}
                    </div>

                    <div className="h-56 mt-4 relative w-full flex items-center justify-center min-h-[200px]">
                      {stats?.appointments?.byStatus?.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={stats.appointments.byStatus}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={4}
                            >
                              {stats.appointments.byStatus.map((entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={getAppointmentStatusChartColor(entry.name)}
                                />
                              ))}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="text-slate-400 text-xs font-sans" style={{ fontFamily: BODY_FONT }}>No status breakdowns compiled.</div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-4 text-[11px] text-slate-500 max-h-24 overflow-y-auto px-1" style={{ fontFamily: BODY_FONT }}>
                      {stats?.appointments?.byStatus?.map((entry) => (
                        <div key={entry.name} className="flex items-center gap-1.5 truncate">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: getAppointmentStatusChartColor(entry.name) }}
                          />
                          <span className="truncate text-slate-650">{formatAppointmentStatusLabel(entry.name)}: <strong className="text-slate-800 font-bold">{entry.value}</strong></span>
                        </div>
                      ))}
                    </div>

                  </div>

                </div>

                {/* Sub KPI Stats Panel */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* KPI card 1 */}
                  <div className="bg-white border border-slate-100 shadow-sm rounded-3xl p-5 hover:shadow-md transition-all duration-300 flex items-center gap-4 text-slate-800">
                    <div className="w-12 h-12 rounded-2xl bg-[#134e97]/10 text-[#134e97] flex items-center justify-center shrink-0">
                      <Clock className="w-6 h-6" />
                    </div>
                    <div>
                      <h4
                        className="text-xs uppercase font-bold tracking-wider text-slate-400"
                        style={{ fontFamily: BODY_FONT }}
                      >
                        Average Appointments per Physician
                      </h4>
                      <p
                        className="text-xl font-black text-[#134e97] mt-1"
                        style={{ fontFamily: HEADING_FONT }}
                      >
                        {stats?.appointments?.avgPerDoctorMonth ?? '0'} visits
                      </p>
                      <p
                        className="text-[11px] text-slate-500 mt-0.5"
                        style={{ fontFamily: LIGHT_BODY_FONT }}
                      >
                        {isNonTechMode ? (
                          <span>This represents the volume of patients handled by a single medical clinician in this period.</span>
                        ) : (
                          <span>Reflects overall staff utilization count.</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* KPI card 2 */}
                  <div className="bg-white border border-slate-100 shadow-sm rounded-3xl p-5 hover:shadow-md transition-all duration-300 flex items-center gap-4 text-slate-800">
                    <div className="w-12 h-12 rounded-2xl bg-[#07adc5]/10 text-[#07adc5] flex items-center justify-center shrink-0">
                      <CheckCircle className="w-6 h-6" />
                    </div>
                    <div>
                      <h4
                        className="text-xs uppercase font-bold tracking-wider text-slate-400"
                        style={{ fontFamily: BODY_FONT }}
                      >
                        Total Visits Handled
                      </h4>
                      <p
                        className="text-xl font-black text-[#07adc5] mt-1"
                        style={{ fontFamily: HEADING_FONT }}
                      >
                        {stats?.appointments?.completed ?? '0'} completed
                      </p>
                      <p
                        className="text-[11px] text-slate-500 mt-0.5"
                        style={{ fontFamily: LIGHT_BODY_FONT }}
                      >
                        {isNonTechMode ? (
                          <span>The number of consultation sessions successfully delivered.</span>
                        ) : (
                          <span>Visits in Completed state.</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* TAB: Clinician Performance */}
            {activeTab === 'clinicians' && (
              <div className="bg-white border border-slate-100 shadow-sm rounded-3xl p-6 space-y-6 text-slate-800 hover:shadow-md transition-all duration-300">
                <div>
                  <h3
                    className="text-base font-bold text-[#134e97] flex items-center gap-2"
                    style={{ fontFamily: HEADING_FONT }}
                  >
                    <Award className="w-5 h-5 text-[#07adc5]" />
                    Clinician Workload & Volume Leaderboard
                  </h3>
                  {isNonTechMode ? (
                    <p
                      className="text-xs text-slate-500 mt-1"
                      style={{ fontFamily: BODY_FONT }}
                    >
                      This tracks which doctors are handling the highest number of patients. Hover or review the bars to inspect how many appointments are scheduled vs completed.
                    </p>
                  ) : (
                    <p
                      className="text-xs text-slate-500 mt-1"
                      style={{ fontFamily: BODY_FONT }}
                    >
                      Quantitative comparison of appointments booked under each physician.
                    </p>
                  )}
                </div>

                {stats?.appointments?.doctorLeaderboard?.length > 0 ? (
                  <div className="space-y-4">
                    {stats.appointments.doctorLeaderboard.map((doc, idx) => {
                      const maxAppts = Math.max(...stats.appointments.doctorLeaderboard.map(d => d.appointments));
                      const percent = maxAppts > 0 ? (doc.appointments / maxAppts) * 100 : 0;
                      const completionPct = doc.appointments > 0 ? Math.round((doc.completed / doc.appointments) * 100) : 0;

                      return (
                        <div
                          key={doc.id || idx}
                          className="bg-slate-50 border border-slate-100 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-sm hover:border-[#134e97]/25 transition-all"
                        >

                          {/* Doctor meta */}
                          <div className="flex items-center gap-3 w-64 shrink-0">
                            <div
                              className="w-10 h-10 rounded-xl bg-[#134e97]/10 border border-[#134e97]/20 overflow-hidden flex items-center justify-center text-xs font-bold text-[#134e97]"
                              style={{ fontFamily: BODY_FONT }}
                            >
                              {doc.profileImage ? (
                                <img src={doc.profileImage} alt={doc.name} className="w-full h-full object-cover" />
                              ) : (
                                <span>{doc.name ? doc.name[0] : 'D'}</span>
                              )}
                            </div>
                            <div>
                              <div
                                className="font-bold text-slate-800 text-sm"
                                style={{ fontFamily: BODY_FONT }}
                              >
                                {doc.name}
                              </div>
                              <div
                                className="text-[10px] text-slate-500"
                                style={{ fontFamily: LIGHT_BODY_FONT }}
                              >
                                {doc.specialization}
                              </div>
                            </div>
                          </div>

                          {/* Progress slider bar */}
                          <div className="flex-1 space-y-1">
                            <div
                              className="flex justify-between text-xs font-semibold text-slate-500"
                              style={{ fontFamily: BODY_FONT }}
                            >
                              <span>Volume: {doc.appointments} bookings</span>
                              <span>Completion: {completionPct}%</span>
                            </div>
                            <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden flex">
                              {/* Completed portion */}
                              <div
                                style={{ width: `${percent * (doc.completed / (doc.appointments || 1))}%` }}
                                className="h-full bg-[#07adc5]"
                                title="Completed"
                              />
                              {/* Remaining portion */}
                              <div
                                style={{ width: `${percent * ((doc.appointments - doc.completed) / (doc.appointments || 1))}%` }}
                                className="h-full bg-[#134e97]"
                                title="Scheduled / Pending"
                              />
                            </div>
                          </div>

                          {/* Action Stats */}
                          <div className="flex gap-4 text-xs font-bold text-center shrink-0 w-32 justify-end">
                            <div>
                              <span className="text-[10px] uppercase text-slate-400 block">Completed</span>
                              <span
                                className="text-[#07adc5] text-sm font-black"
                                style={{ fontFamily: HEADING_FONT }}
                              >
                                {doc.completed}
                              </span>
                            </div>
                            <div className="border-l border-slate-200 pl-3">
                              <span className="text-[10px] uppercase text-slate-400 block">Total</span>
                              <span
                                className="text-[#134e97] text-sm font-black"
                                style={{ fontFamily: HEADING_FONT }}
                              >
                                {doc.appointments}
                              </span>
                            </div>
                          </div>

                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div
                    className="py-12 text-center text-slate-400 text-sm font-sans"
                    style={{ fontFamily: BODY_FONT }}
                  >
                    No clinician analytics records mapped for this selected month.
                  </div>
                )}
              </div>
            )}

            {/* TAB: Specialty Demand */}
            {activeTab === 'specialties' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Chart representation */}
                <div className="bg-white border border-slate-100 shadow-sm rounded-3xl p-6 overflow-hidden flex flex-col justify-between hover:shadow-md transition-all duration-300 text-slate-800 lg:col-span-2">
                  <div>
                    <h3
                      className="text-base font-bold text-[#134e97] flex items-center gap-2"
                      style={{ fontFamily: HEADING_FONT }}
                    >
                      <Stethoscope className="w-5 h-5 text-[#07adc5]" />
                      Specialty Performance breakdown
                    </h3>
                    {isNonTechMode ? (
                      <p
                        className="text-xs text-slate-500 mt-1"
                        style={{ fontFamily: BODY_FONT }}
                      >
                        Which medical clinics are patients booking? Higher bars mean higher public patient demand for that type of clinical specialty.
                      </p>
                    ) : (
                      <p
                        className="text-xs text-slate-500 mt-1"
                        style={{ fontFamily: BODY_FONT }}
                      >
                        Comparative bar analysis of appointment bookings mapped to medical categories.
                      </p>
                    )}
                  </div>

                  <div className="h-72 mt-6 relative w-full flex-1 min-h-[250px]">
                    {stats?.appointments?.specialtyData?.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.appointments.specialtyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 10, fontFamily: BODY_FONT }} />
                          <YAxis stroke="#94a3b8" tick={{ fontSize: 10, fontFamily: BODY_FONT }} allowDecimals={false} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="value" fill="#134e97" radius={[4, 4, 0, 0]} name="Bookings Count">
                            {stats.appointments.specialtyData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={CHART_CATEGORY_COLORS[index % CHART_CATEGORY_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-slate-400 text-xs font-sans" style={{ fontFamily: BODY_FONT }}>
                        No specializations captured in this window.
                      </div>
                    )}
                  </div>
                </div>

                {/* Text summary list */}
                <div className="bg-white border border-slate-100 shadow-sm rounded-3xl p-6 flex flex-col justify-between hover:shadow-md transition-all duration-300 text-slate-800">
                  <div>
                    <h3
                      className="text-base font-bold text-[#134e97]"
                      style={{ fontFamily: HEADING_FONT }}
                    >
                      Clinical Specialization Ratios
                    </h3>
                    <p
                      className="text-xs text-slate-500 mt-1"
                      style={{ fontFamily: BODY_FONT }}
                    >
                      Breakdown ratios for departmental resources.
                    </p>
                  </div>

                  <div className="flex-1 mt-6 overflow-y-auto max-h-80 space-y-4 px-1">
                    {stats?.appointments?.specialtyData?.length > 0 ? (
                      stats.appointments.specialtyData.map((spec, index) => {
                        const totalSpec = stats.appointments.specialtyData.reduce((acc, x) => acc + x.value, 0);
                        const ratio = totalSpec > 0 ? Math.round((spec.value / totalSpec) * 100) : 0;

                        return (
                          <div key={spec.name} className="space-y-1">
                            <div
                              className="flex justify-between text-xs font-semibold text-slate-500"
                              style={{ fontFamily: BODY_FONT }}
                            >
                              <span className="truncate flex items-center gap-1.5 text-xs text-slate-700">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_CATEGORY_COLORS[index % CHART_CATEGORY_COLORS.length] }} />
                                {spec.name}
                              </span>
                              <span className="text-xs text-slate-800 font-bold">{spec.value} visits ({ratio}%)</span>
                            </div>
                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${ratio}%`,
                                  backgroundColor: CHART_CATEGORY_COLORS[index % CHART_CATEGORY_COLORS.length]
                                }}
                              />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-slate-400 text-xs text-center py-10 font-sans" style={{ fontFamily: BODY_FONT }}>No categories found.</div>
                    )}
                  </div>

                </div>

              </div>
            )}

            {/* TAB: Analytical Tables */}
            {activeTab === 'tables' && (
              <div className="bg-white border border-slate-100 shadow-sm rounded-3xl overflow-hidden hover:shadow-md transition-all duration-300 text-slate-800">
                <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                  <h3
                    className="text-base font-bold text-[#134e97]"
                    style={{ fontFamily: HEADING_FONT }}
                  >
                    Full Metric Audit Sheets
                  </h3>
                  <p
                    className="text-xs text-slate-500 mt-1"
                    style={{ fontFamily: BODY_FONT }}
                  >
                    Consolidated tabular listing of raw numerical metrics for accounting and audits.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr
                        className="border-b border-slate-200 text-xs font-bold text-slate-500 uppercase bg-slate-50/80"
                        style={{ fontFamily: BODY_FONT }}
                      >
                        <th className="px-6 py-4">Metric Title</th>
                        <th className="px-6 py-4">Calculated Value</th>
                        <th className="px-6 py-4">Functional System Area</th>
                        <th className="px-6 py-4">Audit Description Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">

                      {/* Doctor total */}
                      <tr className="hover:bg-slate-50/60 transition-all duration-150">
                        <td
                          className="px-6 py-4 font-bold text-slate-800"
                          style={{ fontFamily: BODY_FONT }}
                        >
                          Active Physicians
                        </td>
                        <td
                          className="px-6 py-4 font-black text-[#134e97] text-base"
                          style={{ fontFamily: HEADING_FONT }}
                        >
                          {stats?.users?.totalDoctors ?? '0'}
                        </td>
                        <td
                          className="px-6 py-4 text-xs font-medium text-slate-500"
                          style={{ fontFamily: BODY_FONT }}
                        >
                          Accounts / Staffing
                        </td>
                        <td
                          className="px-6 py-4 text-xs text-slate-500"
                          style={{ fontFamily: LIGHT_BODY_FONT }}
                        >
                          Total licensed physicians verified active in system database.
                        </td>
                      </tr>

                      {/* Patient total */}
                      <tr className="hover:bg-slate-50/60 transition-all duration-150">
                        <td
                          className="px-6 py-4 font-bold text-slate-800"
                          style={{ fontFamily: BODY_FONT }}
                        >
                          Registered Patients
                        </td>
                        <td
                          className="px-6 py-4 font-black text-[#07adc5] text-base"
                          style={{ fontFamily: HEADING_FONT }}
                        >
                          {stats?.users?.totalPatients ?? '0'}
                        </td>
                        <td
                          className="px-6 py-4 text-xs font-medium text-slate-500"
                          style={{ fontFamily: BODY_FONT }}
                        >
                          Accounts / Public Users
                        </td>
                        <td
                          className="px-6 py-4 text-xs text-slate-500"
                          style={{ fontFamily: LIGHT_BODY_FONT }}
                        >
                          Total patients registered in system records.
                        </td>
                      </tr>

                      {/* Bookings total */}
                      <tr className="hover:bg-slate-50/60 transition-all duration-150">
                        <td
                          className="px-6 py-4 font-bold text-slate-800"
                          style={{ fontFamily: BODY_FONT }}
                        >
                          Total Bookings Scoped
                        </td>
                        <td
                          className="px-6 py-4 font-black text-[#134e97] text-base"
                          style={{ fontFamily: HEADING_FONT }}
                        >
                          {stats?.appointments?.total ?? '0'}
                        </td>
                        <td
                          className="px-6 py-4 text-xs font-medium text-slate-500"
                          style={{ fontFamily: BODY_FONT }}
                        >
                          Booking Engine
                        </td>
                        <td
                          className="px-6 py-4 text-xs text-slate-500"
                          style={{ fontFamily: LIGHT_BODY_FONT }}
                        >
                          Total scheduled, completed, cancelled, or reassigned bookings.
                        </td>
                      </tr>

                      {/* Completed */}
                      <tr className="hover:bg-slate-50/60 transition-all duration-150">
                        <td
                          className="px-6 py-4 font-bold text-slate-800"
                          style={{ fontFamily: BODY_FONT }}
                        >
                          Fulfilled Visits
                        </td>
                        <td
                          className="px-6 py-4 font-black text-[#07adc5] text-base"
                          style={{ fontFamily: HEADING_FONT }}
                        >
                          {stats?.appointments?.completed ?? '0'}
                        </td>
                        <td
                          className="px-6 py-4 text-xs font-medium text-slate-500"
                          style={{ fontFamily: BODY_FONT }}
                        >
                          Clinical Pipeline
                        </td>
                        <td
                          className="px-6 py-4 text-xs text-slate-500"
                          style={{ fontFamily: LIGHT_BODY_FONT }}
                        >
                          Visits successfully attended and finalized by clinician notes.
                        </td>
                      </tr>

                      {/* Pending */}
                      <tr className="hover:bg-slate-50/60 transition-all duration-150">
                        <td
                          className="px-6 py-4 font-bold text-slate-800"
                          style={{ fontFamily: BODY_FONT }}
                        >
                          Pending Schedules
                        </td>
                        <td
                          className="px-6 py-4 font-black text-[#134e97] text-base"
                          style={{ fontFamily: HEADING_FONT }}
                        >
                          {stats?.appointments?.pending ?? '0'}
                        </td>
                        <td
                          className="px-6 py-4 text-xs font-medium text-slate-500"
                          style={{ fontFamily: BODY_FONT }}
                        >
                          Booking Pipeline
                        </td>
                        <td
                          className="px-6 py-4 text-xs text-slate-500"
                          style={{ fontFamily: LIGHT_BODY_FONT }}
                        >
                          Schedules currently waiting, postponed, or actively in progress.
                        </td>
                      </tr>

                      {/* No-Shows */}
                      <tr className="hover:bg-slate-50/60 transition-all duration-150">
                        <td
                          className="px-6 py-4 font-bold text-slate-800"
                          style={{ fontFamily: BODY_FONT }}
                        >
                          Missed Sessions
                        </td>
                        <td
                          className="px-6 py-4 font-black text-rose-500 text-base"
                          style={{ fontFamily: HEADING_FONT }}
                        >
                          {stats?.appointments?.noShow ?? '0'}
                        </td>
                        <td
                          className="px-6 py-4 text-xs font-medium text-slate-500"
                          style={{ fontFamily: BODY_FONT }}
                        >
                          Operational Loss
                        </td>
                        <td
                          className="px-6 py-4 text-xs text-slate-500"
                          style={{ fontFamily: LIGHT_BODY_FONT }}
                        >
                          Slots where patient failed to appear for consultation.
                        </td>
                      </tr>

                      {/* Cancelled */}
                      <tr className="hover:bg-slate-50/60 transition-all duration-150">
                        <td
                          className="px-6 py-4 font-bold text-slate-800"
                          style={{ fontFamily: BODY_FONT }}
                        >
                          Cancelled Bookings
                        </td>
                        <td
                          className="px-6 py-4 font-black text-slate-400 text-base"
                          style={{ fontFamily: HEADING_FONT }}
                        >
                          {stats?.appointments?.cancelled ?? '0'}
                        </td>
                        <td
                          className="px-6 py-4 text-xs font-medium text-slate-500"
                          style={{ fontFamily: BODY_FONT }}
                        >
                          Booking Engine
                        </td>
                        <td
                          className="px-6 py-4 text-xs text-slate-500"
                          style={{ fontFamily: LIGHT_BODY_FONT }}
                        >
                          Bookings terminated by patient, receptionist, or doctor before execution.
                        </td>
                      </tr>

                      {/* Avg Load */}
                      <tr className="hover:bg-slate-50/60 transition-all duration-150">
                        <td
                          className="px-6 py-4 font-bold text-slate-800"
                          style={{ fontFamily: BODY_FONT }}
                        >
                          Clinician Session Load
                        </td>
                        <td
                          className="px-6 py-4 font-black text-[#134e97] text-base"
                          style={{ fontFamily: HEADING_FONT }}
                        >
                          {stats?.appointments?.avgPerDoctorMonth ?? '0'}
                        </td>
                        <td
                          className="px-6 py-4 text-xs font-medium text-slate-500"
                          style={{ fontFamily: BODY_FONT }}
                        >
                          Staff Utilization
                        </td>
                        <td
                          className="px-6 py-4 text-xs text-slate-500"
                          style={{ fontFamily: LIGHT_BODY_FONT }}
                        >
                          Total appointments divided by active physicians list.
                        </td>
                      </tr>

                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB: Total Appointments List */}
            {activeTab === 'appointments_list' && (
              <div className="space-y-6">
                {/* Mini Cards Summary row */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <button
                    type="button"
                    onClick={() => { setChannelFilter('all'); setCurrentPage(1); }}
                    className={`p-3 rounded-2xl flex flex-col justify-center shadow-sm text-left transition-all border border-l-4 cursor-pointer ${
                      channelFilter === 'all'
                        ? 'bg-slate-200/80 border-slate-400 border-l-slate-700 ring-2 ring-slate-400/50'
                        : 'bg-slate-50 border-slate-200 border-l-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-[9px] uppercase font-bold text-slate-500">Total Bookings</span>
                    <span className="text-lg font-black text-slate-800 mt-0.5" style={{ fontFamily: HEADING_FONT }}>
                      {appointmentsList.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setChannelFilter('self'); setCurrentPage(1); }}
                    className={`p-3 rounded-2xl flex flex-col justify-center shadow-sm text-left transition-all border border-l-4 cursor-pointer ${
                      channelFilter === 'self'
                        ? 'bg-emerald-100/80 border-emerald-300 border-l-emerald-700 ring-2 ring-emerald-500/50'
                        : 'bg-emerald-50 border-emerald-200 border-l-emerald-500 hover:bg-emerald-100/60'
                    }`}
                  >
                    <span className="text-[9px] uppercase font-bold text-emerald-600">Self Booked</span>
                    <span className="text-lg font-black text-emerald-700 mt-0.5" style={{ fontFamily: HEADING_FONT }}>
                      {sourceCountsMap.self}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setChannelFilter('receptionist'); setCurrentPage(1); }}
                    className={`p-3 rounded-2xl flex flex-col justify-center shadow-sm text-left transition-all border border-l-4 cursor-pointer ${
                      channelFilter === 'receptionist'
                        ? 'bg-purple-100/80 border-purple-300 border-l-purple-700 ring-2 ring-purple-500/50'
                        : 'bg-purple-50 border-purple-200 border-l-purple-500 hover:bg-purple-100/60'
                    }`}
                  >
                    <span className="text-[9px] uppercase font-bold text-purple-600">Receptionist</span>
                    <span className="text-lg font-black text-purple-700 mt-0.5" style={{ fontFamily: HEADING_FONT }}>
                      {sourceCountsMap.receptionist}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setChannelFilter('call center'); setCurrentPage(1); }}
                    className={`p-3 rounded-2xl flex flex-col justify-center shadow-sm text-left transition-all border border-l-4 cursor-pointer ${
                      channelFilter === 'call center'
                        ? 'bg-amber-100/80 border-amber-300 border-l-amber-700 ring-2 ring-amber-500/50'
                        : 'bg-amber-50 border-amber-200 border-l-amber-500 hover:bg-amber-100/60'
                    }`}
                  >
                    <span className="text-[9px] uppercase font-bold text-amber-600">Call Center</span>
                    <span className="text-lg font-black text-amber-700 mt-0.5" style={{ fontFamily: HEADING_FONT }}>
                      {sourceCountsMap['call center']}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setChannelFilter('admin'); setCurrentPage(1); }}
                    className={`p-3 rounded-2xl flex flex-col justify-center shadow-sm text-left transition-all border border-l-4 cursor-pointer ${
                      channelFilter === 'admin'
                        ? 'bg-indigo-100/80 border-indigo-300 border-l-indigo-700 ring-2 ring-indigo-500/50'
                        : 'bg-indigo-50 border-indigo-200 border-l-indigo-500 hover:bg-indigo-100/60'
                    }`}
                  >
                    <span className="text-[9px] uppercase font-bold text-indigo-600">Admin Booked</span>
                    <span className="text-lg font-black text-indigo-700 mt-0.5" style={{ fontFamily: HEADING_FONT }}>
                      {sourceCountsMap.admin}
                    </span>
                  </button>
                </div>
                <div className="space-y-6">
                  {/* Booking Source Breakdown - Separate Full-Width Section above Table */}
                  <div className="bg-white border border-slate-100 shadow-sm rounded-3xl p-6 hover:shadow-md transition-all duration-300 text-slate-800 w-full">
                    <div>
                      <h3
                        className="text-base font-bold text-[#134e97]"
                        style={{ fontFamily: HEADING_FONT }}
                      >
                        Booking Channels
                      </h3>
                      <p
                        className="text-xs text-slate-500 mt-1"
                        style={{ fontFamily: BODY_FONT }}
                      >
                        Audit how patients book their appointments.
                      </p>
                    </div>

                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {stats?.appointments?.bySource?.length > 0 ? (
                        stats.appointments.bySource.map((src, index) => {
                          const totalSrc = stats.appointments.bySource.reduce((acc, x) => acc + x.value, 0);
                          const ratio = totalSrc > 0 ? Math.round((src.value / totalSrc) * 100) : 0;

                          return (
                            <button
                              type="button"
                              key={src.name}
                              onClick={() => {
                                const nameLower = src.name.toLowerCase();
                                if (nameLower.includes('self')) setChannelFilter('self');
                                else if (nameLower.includes('receptionist')) setChannelFilter('receptionist');
                                else if (nameLower.includes('call')) setChannelFilter('call center');
                                else if (nameLower.includes('admin')) setChannelFilter('admin');
                                else setChannelFilter('all');
                                setCurrentPage(1);
                              }}
                              className="w-full text-left space-y-2 p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-slate-100/60 hover:border-slate-200 transition-all cursor-pointer shadow-sm hover:shadow"
                            >
                              <div
                                className="flex justify-between items-center text-xs font-semibold text-slate-500"
                                style={{ fontFamily: BODY_FONT }}
                              >
                                <span className="truncate flex items-center gap-1.5 text-xs text-slate-755 font-bold font-sans">
                                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_CATEGORY_COLORS[(index + 3) % CHART_CATEGORY_COLORS.length] }} />
                                  {src.name}
                                </span>
                                <span className="text-xs text-slate-800 font-bold">{src.value} ({ratio}%)</span>
                              </div>
                              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${ratio}%`,
                                    backgroundColor: CHART_CATEGORY_COLORS[(index + 3) % CHART_CATEGORY_COLORS.length]
                                  }}
                                />
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="text-slate-400 text-xs text-center py-10 font-sans col-span-full" style={{ fontFamily: BODY_FONT }}>
                          No booking channel data found.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Detailed Table Column - Full Width */}
                  <div className="w-full bg-white border border-slate-100 shadow-sm rounded-3xl overflow-hidden hover:shadow-md transition-all duration-300 text-slate-800">
                    <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3
                            className="text-base font-bold text-[#134e97]"
                            style={{ fontFamily: HEADING_FONT }}
                          >
                            Total Appointments List
                          </h3>
                          {channelFilter !== 'all' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#134e97]/10 text-[#134e97] border border-[#134e97]/20">
                              Filtered by: <strong className="capitalize">{channelFilter}</strong>
                              <button
                                type="button"
                                onClick={() => { setChannelFilter('all'); setCurrentPage(1); }}
                                className="hover:text-red-500 font-bold ml-1"
                                title="Clear filter"
                              >
                                ✕
                              </button>
                            </span>
                          )}
                        </div>
                        <p
                          className="text-xs text-slate-500 mt-1"
                          style={{ fontFamily: BODY_FONT }}
                        >
                          Detailed listing of all scheduled, completed, and cancelled appointments for the selected period.
                        </p>
                      </div>

                      {/* Items per page dropdown */}
                      <div className="flex items-center gap-2 shrink-0">
                        <label htmlFor="itemsPerPageSelect" className="text-xs font-semibold text-slate-500" style={{ fontFamily: BODY_FONT }}>
                          Show:
                        </label>
                        <select
                          id="itemsPerPageSelect"
                          value={itemsPerPage}
                          onChange={(e) => {
                            const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                            setItemsPerPage(val);
                            setCurrentPage(1);
                          }}
                          className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] transition-all cursor-pointer"
                          style={{ fontFamily: BODY_FONT }}
                        >
                          <option value={10}>10 per page</option>
                          <option value={25}>25 per page</option>
                          <option value={50}>50 per page</option>
                          <option value={100}>100 per page</option>
                          <option value="all">All entries</option>
                        </select>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      {appointmentsLoading ? (
                        <div className="py-12 text-center text-slate-400 text-sm font-sans" style={{ fontFamily: BODY_FONT }}>
                          Loading appointments list...
                        </div>
                      ) : appointmentsList.length > 0 ? (
                        <>
                          <table className="w-full text-sm text-left border-collapse">
                            <thead>
                              <tr
                                className="border-b border-slate-200 text-sm font-bold text-slate-500 uppercase bg-slate-50/80"
                                style={{ fontFamily: BODY_FONT }}
                              >
                                <th className="px-6 py-4">Patient</th>
                                <th className="px-6 py-4">Doctor</th>
                                <th className="px-6 py-4">Date, Time & Channel</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Symptoms / Notes</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-700">
                              {paginatedAppointments.map((appt) => {
                                const patient = appt.patientId || {};
                                const doctor = appt.doctorId || {};
                                const formattedDate = appt.slotStartIso
                                  ? new Date(appt.slotStartIso).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                    })
                                  : appt.date || 'N/A';
                                
                                const formattedTime = appt.slotStartIso
                                  ? new Date(appt.slotStartIso).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : 'N/A';

                                const channel = appt.bookedBy || 'self';
                                const channelLabels = {
                                  self: 'Self Booking',
                                  receptionist: 'Receptionist',
                                  'call center': 'Call Center',
                                  admin: 'Admin',
                                };
                                const channelStyles = {
                                  self: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                                  receptionist: 'bg-purple-50 text-purple-700 border-purple-200',
                                  'call center': 'bg-amber-50 text-amber-700 border-amber-200',
                                  admin: 'bg-indigo-50 text-indigo-700 border-indigo-200',
                                };

                                const getStatusBadgeStyleLocal = (status) => {
                                  const s = String(status || '').toLowerCase();
                                  if (s.includes('complete')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
                                  if (s.includes('cancel')) return 'bg-rose-50 text-rose-700 border-rose-200';
                                  if (s.includes('progress')) return 'bg-blue-50 text-blue-700 border-blue-200';
                                  if (s.includes('miss') || s.includes('show')) return 'bg-amber-50 text-amber-700 border-amber-200';
                                  return 'bg-slate-50 text-slate-700 border-slate-200';
                                };

                                return (
                                  <tr key={appt._id} className="hover:bg-slate-50/60 transition-all duration-150">
                                    {/* Patient Column */}
                                    <td className="px-6 py-4">
                                      <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-[#134e97] overflow-hidden shrink-0">
                                          {patient.profileImage ? (
                                            <img src={patient.profileImage} alt={patient.name} className="w-full h-full object-cover" />
                                          ) : (
                                            <span>{patient.name ? patient.name[0].toUpperCase() : 'P'}</span>
                                          )}
                                        </div>
                                        <div>
                                          <div className="font-bold text-slate-800 text-sm">{patient.name || 'Unknown Patient'}</div>
                                          <div className="text-xs text-slate-500">{patient.phone || patient.email || ''}</div>
                                        </div>
                                      </div>
                                    </td>

                                    {/* Doctor Column */}
                                    <td className="px-6 py-4">
                                      <div>
                                        <div className="font-bold text-slate-800 text-sm">{doctor.name || 'Unknown Doctor'}</div>
                                        <div className="text-xs text-slate-500">{doctor.specialization || ''}</div>
                                      </div>
                                    </td>

                                    {/* Date, Time & Channel Column (Stacked) */}
                                    <td className="px-6 py-4 text-sm font-medium text-slate-650">
                                      <div className="space-y-1">
                                        <div className="font-bold text-slate-800">{formattedDate}</div>
                                        <div className="text-xs text-slate-500">{formattedTime}</div>
                                        <div>
                                          <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold border ${channelStyles[channel] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                                            {channelLabels[channel] || channel}
                                          </span>
                                        </div>
                                      </div>
                                    </td>

                                    {/* Status Column */}
                                    <td className="px-6 py-4">
                                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${getStatusBadgeStyleLocal(appt.status)}`}>
                                        {appt.status || 'Scheduled'}
                                      </span>
                                    </td>

                                    {/* Symptoms Column */}
                                    <td className="px-6 py-4 text-sm text-slate-500 min-w-[180px] max-w-xs whitespace-normal break-words" title={appt.symptoms || appt.notes || ''}>
                                      {appt.symptoms || appt.notes || <span className="text-slate-300 italic">None</span>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>

                          {/* Pagination Controls */}
                          {totalPages > 1 && (
                            <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-semibold text-slate-500 bg-slate-50/50">
                              <div>
                                {itemsPerPage === 'all' ? (
                                  `Showing all ${filteredAppointments.length} entries`
                                ) : (
                                  `Showing ${((currentPage - 1) * Number(itemsPerPage)) + 1} to ${Math.min(filteredAppointments.length, currentPage * Number(itemsPerPage))} of ${filteredAppointments.length} entries`
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                  disabled={currentPage === 1}
                                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                >
                                  Previous
                                </button>
                                
                                {(() => {
                                  const range = [];
                                  const delta = 1;
                                  for (let i = 1; i <= totalPages; i++) {
                                    if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
                                      range.push(i);
                                    } else if (range[range.length - 1] !== '...') {
                                      range.push('...');
                                    }
                                  }
                                  return range;
                                })().map((pageNum, idx) => {
                                  if (pageNum === '...') {
                                    return <span key={`ellipsis-${idx}`} className="px-1.5 text-slate-400">...</span>;
                                  }
                                  return (
                                    <button
                                      key={pageNum}
                                      onClick={() => setCurrentPage(pageNum)}
                                      className={`px-3 py-1.5 rounded-lg border transition-all ${currentPage === pageNum ? 'bg-[#134e97] text-white border-[#134e97]' : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'}`}
                                    >
                                      {pageNum}
                                    </button>
                                  );
                                })}

                                <button
                                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                  disabled={currentPage === totalPages}
                                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                >
                                  Next
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="py-12 text-center text-slate-400 text-sm font-sans" style={{ fontFamily: BODY_FONT }}>
                          No appointments recorded for this timeframe.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

      </main>

      <Footer />

    </div>
  );
}
