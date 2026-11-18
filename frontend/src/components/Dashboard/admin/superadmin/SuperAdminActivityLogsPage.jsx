import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, getUser, getAuthToken, getApiOrigin } from "@/utils/api";
import Footer from "@/components/HomePage/Footer";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SearchIcon from "@mui/icons-material/Search";
import RefreshIcon from "@mui/icons-material/Refresh";
import SecurityIcon from "@mui/icons-material/Security";
import ListAltIcon from "@mui/icons-material/ListAlt";
import HistoryIcon from "@mui/icons-material/History";
import DownloadIcon from "@mui/icons-material/Download";
import EmailIcon from "@mui/icons-material/Email";
import Swal from "sweetalert2";

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

function isSuperAdminRole(role) {
  const r = String(role || "").toLowerCase();
  return r === "super_admin" || r === "superadmin" || r === "super-admin";
}

function userTypeBadge(type) {
  const t = String(type || "").toLowerCase();
  switch (t) {
    case "super_admin":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "admin":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "doctor":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "receptionist":
    case "call_center":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "patient":
      return "bg-teal-100 text-teal-800 border-teal-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}

export default function SuperAdminActivityLogsPage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState(null);

  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10); // 10, 25, 50, 100, 'all'
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState("");
  const [userTypeFilter, setUserTypeFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Summary
  const [summary, setSummary] = useState(null);

  // Selected Log Modal
  const [selectedLog, setSelectedLog] = useState(null);

  useEffect(() => {
    const u = getUser();
    const t = getAuthToken();
    if (!u || !t) {
      navigate("/login", { replace: true });
      return;
    }
    if (!isSuperAdminRole(u.role || u.type)) {
      setError("Access Denied: Super Admin permissions required.");
      setLoading(false);
      return;
    }
    setCurrentUser(u);
    setToken(t);
  }, [navigate]);

  const fetchLogs = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(itemsPerPage === 'all' ? 1000 : itemsPerPage),
      });

      if (search.trim()) params.append("search", search.trim());
      if (userTypeFilter !== "all") params.append("userType", userTypeFilter);
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);

      const res = await api.get(`/api/super-admin/activity-logs?${params.toString()}`);
      if (res?.success) {
        setLogs(res.logs || []);
        setTotal(res.total || 0);
        setTotalPages(itemsPerPage === 'all' ? 1 : (res.totalPages || 1));
      } else {
        setError(res?.message || "Failed to load activity logs");
      }

      // Fetch summary
      const sumRes = await api.get("/api/super-admin/logs-summary");
      if (sumRes?.success) {
        setSummary(sumRes.summary);
      }
    } catch (err) {
      setError(err?.message || "Failed to load activity logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchLogs();
    }
  }, [token, page, userTypeFilter, itemsPerPage]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const handleExportCSV = async () => {
    try {
      const t = getAuthToken();
      const origin = getApiOrigin();
      const response = await fetch(`${origin}/api/super-admin/activity-logs/export-csv?days=40`, {
        headers: {
          Authorization: `Bearer ${t}`,
        },
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to export CSV");
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `activity_logs_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      Swal.fire("Export Failed", err.message || "Failed to download CSV", "error");
    }
  };

  const handleSendMonthlyEmail = async () => {
    try {
      Swal.fire({
        title: "Sending Monthly Report...",
        text: "Generating 30-day activity log CSV and emailing Super Admins.",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const res = await api.post("/api/super-admin/activity-logs/send-monthly-email");
      if (res?.success) {
        Swal.fire("Report Sent!", res.message || "Monthly activity logs emailed to Super Admins.", "success");
      } else {
        Swal.fire("Error", res?.message || "Failed to send monthly report email", "error");
      }
    } catch (err) {
      Swal.fire("Error", err?.message || "Failed to send monthly report email", "error");
    }
  };

  if (!currentUser && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error && !token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full text-center bg-white p-8 rounded-2xl shadow-lg border border-red-100">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <SecurityIcon style={{ fontSize: 32 }} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link
            to="/admin/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition"
          >
            <ArrowBackIcon fontSize="small" /> Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shadow-lg border-b border-indigo-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link
                to="/admin/dashboard"
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition border border-white/10"
                title="Back to Dashboard"
              >
                <ArrowBackIcon fontSize="small" />
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30">
                    SUPER ADMIN ONLY
                  </span>
                </div>
                <h1 className="text-2xl font-bold text-white tracking-tight mt-1 flex items-center gap-2">
                  <ListAltIcon className="text-indigo-400" /> User Activity Logs
                </h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleExportCSV}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-medium transition border border-emerald-500/30 shadow-sm"
                title="Export past 40 days logs to CSV"
              >
                <DownloadIcon fontSize="small" /> Export CSV
              </button>

              <button
                onClick={handleSendMonthlyEmail}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs sm:text-sm font-medium transition border border-purple-500/30 shadow-sm"
                title="Email CSV report to Super Admins"
              >
                <EmailIcon fontSize="small" /> Email Report
              </button>

              <button
                onClick={() => fetchLogs()}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600/80 hover:bg-indigo-600 text-white text-xs sm:text-sm font-medium transition border border-indigo-500/30"
              >
                <RefreshIcon fontSize="small" /> Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Activities Today</p>
              <h3 className="text-2xl font-bold text-indigo-600 mt-1">{summary?.totalActivitiesToday ?? "—"}</h3>
            </div>
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
              <HistoryIcon />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Activity Logs Recorded</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{summary?.totalActivityEntries ?? total}</h3>
            </div>
            <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center">
              <ListAltIcon />
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm mb-6">
          <form onSubmit={handleSearchSubmit} className="flex flex-col lg:flex-row gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fontSize="small" />
              <input
                type="text"
                placeholder="Search user, action, description, IP address..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
              />
            </div>

            {/* User Type Filter */}
            <div className="w-full lg:w-44">
              <select
                value={userTypeFilter}
                onChange={(e) => { setUserTypeFilter(e.target.value); setPage(1); }}
                className="w-full py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700"
              >
                <option value="all">All Staff Types</option>
                <option value="super_admin">Super Admin</option>
                <option value="admin">Admin</option>
                <option value="doctor">Doctor</option>
                <option value="receptionist">Receptionist</option>
                <option value="call_center">Call Center</option>
              </select>
            </div>

            {/* Dates */}
            <div className="flex gap-2 w-full lg:w-auto">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-700"
                title="Start Date"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-700"
                title="End Date"
              />
            </div>

            {/* Items Per Page Select */}
            <div className="w-full lg:w-36">
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  const val = e.target.value === "all" ? "all" : Number(e.target.value);
                  setItemsPerPage(val);
                  setPage(1);
                }}
                className="w-full py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-700 cursor-pointer"
              >
                <option value={10}>10 / page</option>
                <option value={20}>20 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
                <option value="all">All entries</option>
              </select>
            </div>

            <button
              type="submit"
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition shadow-sm"
            >
              Filter
            </button>
          </form>
        </div>

        {/* Activity Logs Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-slate-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-3"></div>
              Loading activity logs...
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <p className="text-base font-semibold text-slate-700 mb-1">No Activity Logs Found</p>
              <p className="text-sm">Try adjusting your filters or search query.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                    <th className="py-3.5 px-4 sm:px-6">User</th>
                    <th className="py-3.5 px-4">Type</th>
                    <th className="py-3.5 px-4">Action</th>
                    <th className="py-3.5 px-4">Description</th>
                    <th className="py-3.5 px-4 sm:px-6">Timestamp (IST)</th>
                    <th className="py-3.5 px-4 text-right">Metadata</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {logs.map((log) => (
                    <tr key={log._id} className="hover:bg-slate-50/80 transition">
                      <td className="py-4 px-4 sm:px-6">
                        <div className="font-semibold text-slate-900">{log.userName || "—"}</div>
                        <div className="text-xs text-slate-500">{log.userEmail || "—"}</div>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${userTypeBadge(log.userType)}`}>
                          {log.userType}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-mono text-xs font-medium text-indigo-700">
                        {log.action}
                      </td>
                      <td className="py-4 px-4 text-xs text-slate-700 max-w-xs truncate" title={log.description}>
                        {log.description || log.action}
                      </td>
                      <td className="py-4 px-4 sm:px-6 text-xs text-slate-600 whitespace-nowrap">
                        {log.timestampIST || new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="py-4 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {!loading && (totalPages > 1 || itemsPerPage === 'all') && (
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-semibold text-slate-500">
              <div>
                {itemsPerPage === 'all' ? (
                  `Showing all ${total} entries`
                ) : (
                  `Showing ${((page - 1) * Number(itemsPerPage)) + 1} to ${Math.min(total, page * Number(itemsPerPage))} of ${total} entries`
                )}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
                  >
                    Previous
                  </button>

                  {(() => {
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
                          onClick={() => setPage(pageNum)}
                          className={`px-3 py-1.5 rounded-lg border transition shadow-sm ${page === pageNum ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 bg-white hover:bg-slate-50 text-slate-600"}`}
                        >
                          {pageNum}
                        </button>
                      );
                    });
                  })()}

                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Log Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <h3 className="text-lg font-bold text-slate-900 px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <span>Activity Log Details</span>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                ×
              </button>
            </h3>

            <div className="p-6 space-y-3 text-sm text-slate-700 overflow-y-auto flex-1">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-xs font-semibold text-slate-400 uppercase">User</p>
                <p className="font-medium text-slate-900 mt-0.5">{selectedLog.userName}</p>
                <p className="text-xs text-slate-600">{selectedLog.userEmail} ({selectedLog.userType})</p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-xs font-semibold text-slate-400 uppercase">Action & Description</p>
                <p className="font-mono text-xs font-bold text-indigo-700 mt-0.5">{selectedLog.action}</p>
                <p className="text-xs text-slate-800 mt-1">{selectedLog.description}</p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-xs font-semibold text-slate-400 uppercase">Network Info</p>
                <p className="font-mono text-xs text-slate-800 mt-1">IP: {selectedLog.ipAddress || "—"}</p>
                <p className="font-mono text-xs text-slate-600 mt-1 break-all">{selectedLog.userAgent || "—"}</p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-xs font-semibold text-slate-400 uppercase">Timestamp (IST)</p>
                <p className="font-mono text-xs text-slate-900 mt-0.5">{selectedLog.timestampIST || selectedLog.timestamp}</p>
              </div>

              {selectedLog.metadata && (
                <div className="p-3 bg-slate-900 text-slate-100 rounded-xl font-mono text-xs overflow-x-auto max-h-48">
                  <p className="text-[10px] uppercase text-indigo-400 font-sans font-semibold mb-1">Metadata</p>
                  <pre>{JSON.stringify(selectedLog.metadata, null, 2)}</pre>
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 text-right shrink-0">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-medium transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
