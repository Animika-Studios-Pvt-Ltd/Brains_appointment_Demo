import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { X, CalendarClock, AlertTriangle, CheckCircle2 } from "lucide-react";
import Swal from "sweetalert2";
import { api, getUser } from "../../../utils/api";

function resolveRole(userRole) {
  const stored = getUser();
  const candidate =
    (userRole && userRole !== "guest" ? userRole : null) ||
    stored?.type ||
    stored?.role ||
    stored?.userType ||
    "receptionist";
  return String(candidate).toLowerCase().trim();
}

function getDoctorsEndpoint(role) {
  if (
    role === "admin" ||
    role === "super_admin" ||
    role === "superadmin" ||
    role === "super-admin"
  ) {
    return "/api/admin/doctors?page=1&limit=200";
  }
  return "/api/receptionist/doctors?page=1&limit=200";
}

function getBulkRescheduleEndpoint(role) {
  if (
    role === "admin" ||
    role === "super_admin" ||
    role === "superadmin" ||
    role === "super-admin"
  ) {
    return "/api/admin/appointments/bulk-reschedule";
  }
  return "/api/receptionist/appointments/bulk-reschedule";
}

function formatSlot(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export default function BulkRescheduleModal({ open, onClose, userRole = "receptionist" }) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [doctorsList, setDoctorsList] = useState([]);
  const [doctorFilterAll, setDoctorFilterAll] = useState(true);
  const [selectedDoctors, setSelectedDoctors] = useState([]);
  const [sourceDate, setSourceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState("shift");
  const [shiftDays, setShiftDays] = useState(1);
  const [targetDate, setTargetDate] = useState("");
  const [note, setNote] = useState("");
  const [sendNotifications, setSendNotifications] = useState(true);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!open) return undefined;

    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const role = resolveRole(userRole);
        const res = await api.get(getDoctorsEndpoint(role));
        if (!alive) return;

        const list =
          res?.data?.doctors ??
          res?.data?.data?.doctors ??
          res?.data?.data ??
          res?.data ??
          [];

        setDoctorsList(Array.isArray(list) ? list : []);
      } catch (err) {
        console.warn("[BulkRescheduleModal] Failed to load doctors:", err);
        setDoctorsList([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [open, userRole]);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setNote("");
      setMode("shift");
      setShiftDays(1);
      setTargetDate("");
      setDoctorFilterAll(true);
      setSelectedDoctors([]);
    }
  }, [open]);

  const buildPayload = (dryRun) => ({
    sourceDate,
    mode,
    shiftDays: Number(shiftDays) || 1,
    ...(mode === "target" && targetDate ? { targetDate } : {}),
    doctorIds: doctorFilterAll ? [] : selectedDoctors,
    note: note.trim(),
    dryRun,
    sendNotifications,
  });

  const handlePreview = async () => {
    if (!sourceDate) {
      Swal.fire({ icon: "warning", title: "Select source date" });
      return;
    }
    if (mode === "target" && !targetDate) {
      Swal.fire({ icon: "warning", title: "Select target date" });
      return;
    }

    try {
      setSubmitting(true);
      const role = resolveRole(userRole);
      const res = await api.post(getBulkRescheduleEndpoint(role), buildPayload(true));
      setPreview(res?.data || res);
      Swal.fire({
        icon: "info",
        title: "Preview ready",
        text: res?.message || "Review the proposed changes below.",
        timer: 1800,
        showConfirmButton: false,
      });
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Preview failed",
        text: err?.message || "Could not preview bulk reschedule",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!sourceDate) {
      Swal.fire({ icon: "warning", title: "Select source date" });
      return;
    }
    if (mode === "target" && !targetDate) {
      Swal.fire({ icon: "warning", title: "Select target date" });
      return;
    }

    const confirm = await Swal.fire({
      icon: "question",
      title: "Confirm bulk reschedule?",
      text: "This will move all matching appointments on the selected date.",
      showCancelButton: true,
      confirmButtonText: "Yes, reschedule",
      cancelButtonText: "Cancel",
    });
    if (!confirm.isConfirmed) return;

    try {
      setSubmitting(true);
      const role = resolveRole(userRole);
      const res = await api.post(getBulkRescheduleEndpoint(role), buildPayload(false));
      setPreview(res?.data || res);
      await Swal.fire({
        icon: "success",
        title: "Bulk reschedule done",
        text: res?.message || "Appointments updated.",
      });
      onClose?.();
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Bulk reschedule failed",
        text: err?.message || "Something went wrong",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const previewResults = preview?.results || [];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-[#134e97]" />
            <h2 className="text-lg font-semibold text-[#134e97]" style={{ fontFamily: "'mirador-medium', 'Outfit', sans-serif" }}>
              Bulk Reschedule
            </h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-full hover:bg-slate-100">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          <p className="text-sm text-slate-600">
            Move all scheduled appointments on a selected date to new slots. Use preview before applying.
          </p>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Source date *</label>
            <input
              type="date"
              value={sourceDate}
              onChange={(e) => setSourceDate(e.target.value)}
              className="w-full p-2 border rounded-lg border-[#134e97]/30 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Doctors</label>
            <label className="flex items-center gap-2 text-sm mb-2">
              <input
                type="checkbox"
                checked={doctorFilterAll}
                onChange={(e) => setDoctorFilterAll(e.target.checked)}
              />
              All doctors
            </label>
            {!doctorFilterAll && (
              <div className="max-h-32 overflow-y-auto border rounded-lg p-2 space-y-1">
                {loading ? (
                  <p className="text-sm text-slate-500">Loading doctors...</p>
                ) : (
                  doctorsList.map((d) => (
                    <label key={d._id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedDoctors.includes(d._id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedDoctors((prev) => [...prev, d._id]);
                          } else {
                            setSelectedDoctors((prev) => prev.filter((id) => id !== d._id));
                          }
                        }}
                      />
                      Dr. {d.name}
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reschedule mode *</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="w-full p-2 border rounded-lg border-[#134e97]/30 text-sm">
              <option value="shift">Shift by number of days</option>
              <option value="target">Move to a specific date (same time)</option>
              <option value="auto">Auto-find next available slot</option>
            </select>
          </div>

          {mode === "shift" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Shift by (days) *</label>
              <input
                type="number"
                min={1}
                max={90}
                value={shiftDays}
                onChange={(e) => setShiftDays(e.target.value)}
                className="w-full p-2 border rounded-lg border-[#134e97]/30 text-sm"
              />
            </div>
          )}

          {mode === "target" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Target date *</label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full p-2 border rounded-lg border-[#134e97]/30 text-sm"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Note (optional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason for bulk reschedule"
              className="w-full p-2 border rounded-lg border-[#134e97]/30 text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sendNotifications}
              onChange={(e) => setSendNotifications(e.target.checked)}
            />
            Send reschedule email notifications to patients
          </label>

          {preview && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                {preview.dryRun ? "Preview" : "Result"}: {preview.rescheduled ?? 0} ready, {preview.failed ?? 0} failed
                {preview.total != null ? ` (of ${preview.total})` : ""}
              </div>
              {previewResults.length > 0 ? (
                <ul className="max-h-40 overflow-y-auto space-y-2 text-xs">
                  {previewResults.map((r) => (
                    <li key={r.appointmentId} className="bg-white rounded-lg p-2 border border-slate-100">
                      <div className="font-medium text-slate-800">
                        {r.patientName} — Dr. {r.doctorName}
                      </div>
                      <div className="text-slate-600">{formatSlot(r.oldStart)} → {formatSlot(r.newStart)}</div>
                      {r.reason && (
                        <div className="text-red-600 flex items-center gap-1 mt-1">
                          <AlertTriangle className="w-3 h-3" />
                          {r.reason}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No appointments found on the selected date.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200">
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handlePreview}
            className="px-4 py-2 rounded-full border border-[#134e97] text-[#134e97] text-sm font-medium hover:bg-[#134e97]/5 disabled:opacity-50">
            Preview
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="px-4 py-2 rounded-full bg-[#134e97] text-white text-sm font-medium hover:bg-[#013473] disabled:opacity-50">
            {submitting ? "Processing..." : "Apply Reschedule"}
          </button>
        </div>
      </div>
    </div>
  );
}

BulkRescheduleModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  userRole: PropTypes.string,
};
