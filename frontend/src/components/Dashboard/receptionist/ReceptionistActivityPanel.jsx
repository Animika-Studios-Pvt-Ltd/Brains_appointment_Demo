import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  X,
  RefreshCw,
  CalendarCheck,
  UserPlus,
  CheckCircle2,
  ClipboardList,
  RotateCcw,
  UserCog,
  Eye,
  Activity,
  Loader2,
} from "lucide-react";
import { api } from "../../../utils/api";

const PAGE_SIZE = 40;

function actionIcon(action) {
  const a = String(action || "").toLowerCase();
  if (a.includes("book")) return CalendarCheck;
  if (a.includes("check-in") || a.includes("checkin")) return ClipboardList;
  if (a.includes("complete")) return CheckCircle2;
  if (a.includes("reschedule") || a.includes("bulk")) return RotateCcw;
  if (a.includes("reassign")) return UserCog;
  if (a.includes("create patient") || a.includes("patient")) return UserPlus;
  if (a.includes("block") || a.includes("unblock")) return CalendarCheck;
  if (a.includes("availability")) return ClipboardList;
  if (a.includes("view") || a.includes("list") || a.includes("search")) return Eye;
  return Activity;
}

function formatWhen(log) {
  if (log?.timestampIST) return log.timestampIST;
  if (!log?.timestamp) return "";
  try {
    return new Date(log.timestamp).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

function metaSummary(metadata) {
  if (!metadata || typeof metadata !== "object") return "";
  const bits = [];
  if (metadata.appointmentId) bits.push(`Appt ${String(metadata.appointmentId).slice(-6)}`);
  if (metadata.status) bits.push(`Status: ${metadata.status}`);
  if (metadata.patientName) bits.push(metadata.patientName);
  if (metadata.doctorName) bits.push(`Dr. ${metadata.doctorName}`);
  if (metadata.count != null) bits.push(`Count: ${metadata.count}`);
  return bits.slice(0, 3).join(" · ");
}

export default function ReceptionistActivityPanel({ open, onClose, roleLabel = "Call Center" }) {
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const title = useMemo(
    () => `${roleLabel} Activity`,
    [roleLabel]
  );

  const fetchLogs = useCallback(
    async ({ pageNum = 1, append = false } = {}) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError("");
      try {
        const res = await api.get(
          `/api/receptionist/activity-logs?page=${pageNum}&limit=${PAGE_SIZE}`
        );
        const payload = res?.data || res || {};
        const nextLogs = Array.isArray(payload.logs) ? payload.logs : [];
        const pagination = payload.pagination || {};
        setLogs((prev) => (append ? [...prev, ...nextLogs] : nextLogs));
        setPage(pagination.page || pageNum);
        setTotalPages(pagination.totalPages || 1);
        setTotal(pagination.total || nextLogs.length);
      } catch (err) {
        setError(err?.message || "Failed to load activity");
        if (!append) setLogs([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!open) return;
    fetchLogs({ pageNum: 1, append: false });
  }, [open, fetchLogs]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
        aria-label="Close activity panel"
        onClick={onClose}
      />

      <aside
        className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl border-l border-slate-200 flex flex-col animate-in slide-in-from-right duration-300"
        style={{ animation: "receptionistActivitySlide 220ms ease-out" }}
      >
        <style>{`
          @keyframes receptionistActivitySlide {
            from { transform: translateX(100%); opacity: 0.85; }
            to { transform: translateX(0); opacity: 1; }
          }
        `}</style>

        <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-200 bg-gradient-to-r from-[#134e97] to-[#06adc6] text-white">
          <div className="h-10 w-10 rounded-full bg-white/15 flex items-center justify-center">
            <Bell className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold leading-tight truncate">{title}</h2>
            <p className="text-xs text-blue-100 mt-0.5">
              {total ? `${total} recorded action${total === 1 ? "" : "s"}` : "Your recent actions"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => fetchLogs({ pageNum: 1, append: false })}
            className="p-2 rounded-full hover:bg-white/15 transition"
            aria-label="Refresh activity"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/15 transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 bg-slate-50">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-[#134e97]" />
              <p className="text-sm">Loading activity…</p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 px-4 py-3 text-sm">
              {error}
              <button
                type="button"
                className="mt-2 block text-[#134e97] font-semibold underline"
                onClick={() => fetchLogs({ pageNum: 1, append: false })}
              >
                Try again
              </button>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-2 px-6 text-center">
              <Activity className="w-8 h-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">No activity yet</p>
              <p className="text-xs text-slate-400">
                Check-ins, bookings, status updates and other actions will appear here.
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {logs.map((log) => {
                const Icon = actionIcon(log.action);
                const detail = log.description && log.description !== log.action
                  ? log.description
                  : metaSummary(log.metadata);
                return (
                  <li
                    key={log._id || `${log.action}-${log.timestamp}`}
                    className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    <div className="flex gap-3">
                      <div className="mt-0.5 h-9 w-9 shrink-0 rounded-full bg-[#e8f2ff] text-[#134e97] flex items-center justify-center">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 leading-snug">
                          {log.action || "Activity"}
                        </p>
                        {detail ? (
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed break-words">
                            {detail}
                          </p>
                        ) : null}
                        <p className="text-[11px] text-slate-400 mt-2 tabular-nums">
                          {formatWhen(log)}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {!loading && !error && page < totalPages ? (
            <div className="pt-4 pb-2 flex justify-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => fetchLogs({ pageNum: page + 1, append: true })}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 bg-white text-sm font-semibold text-[#134e97] hover:bg-slate-50 disabled:opacity-60"
              >
                {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Load more
              </button>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
