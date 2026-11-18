import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { api } from "../../../utils/api";
import { getUser } from "../../../utils/api";
import { Button } from "@/components/ui/button";
import {
    X,
    CheckCircle2,
    Edit2,
    Ban,
    Trash2,
    Calendar,
    Clock,
    AlertTriangle,
} from "lucide-react";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";

export default function MassHolidayModal({ open, onClose, defaultDoctorIds = [], userRole = 'guest' }) {
    const [viewMode, setViewMode] = useState("list"); // 'list' | 'form'
    const [mode, setMode] = useState("create"); // 'create' | 'edit'
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);

    // form state
    const [formMode, setFormMode] = useState("day"); // 'day' or 'range'
    const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [startDateTime, setStartDateTime] = useState("");
    const [endDateTime, setEndDateTime] = useState("");
    const [reason, setReason] = useState("");
    const [doctorFilterAll, setDoctorFilterAll] = useState(true);
    const [selectedDoctors, setSelectedDoctors] = useState(defaultDoctorIds || []);
    const [doctorsList, setDoctorsList] = useState([]);
    const [autoReschedule, setAutoReschedule] = useState(true);
    const [sendGoogleSync, setSendGoogleSync] = useState(true);

    // batches & editing
    const [batches, setBatches] = useState([]);
    const [searchDate, setSearchDate] = useState("");
    const [selectedBatchId, setSelectedBatchId] = useState(null);
    const [deletingBatchId, setDeletingBatchId] = useState(null);
    const [editStartIso, setEditStartIso] = useState("");
    const [editEndIso, setEditEndIso] = useState("");
    const [editReason, setEditReason] = useState("");

    // preview duration states
    const [previewDuration, setPreviewDuration] = useState("");
    const [editDurationPreview, setEditDurationPreview] = useState("");

    // NOTE: keep lastPayload only if you need internally. We do NOT render it.
    const [lastPayload, setLastPayload] = useState(null);

    useEffect(() => {
        if (!open) return undefined;

        let alive = true;
        (async () => {
            try {
                setLoading(true);

                // --- determine role robustly (prop -> stored user -> fallback) ---
                const stored = typeof getUser === "function" ? getUser() : null;
                const propRole = userRole && String(userRole).toLowerCase().trim() !== "guest"
                    ? String(userRole)
                    : "";
                const candidate =
                    propRole ||
                    (stored && (stored.type || stored.role || stored.userType)) ||
                    "";
                const role = String(candidate).toLowerCase().trim();

                // choose endpoint (no bare /api/doctors route exists on the backend)
                let endpoint;
                if (role === "receptionist" || role === "call_center") {
                    endpoint = "/api/receptionist/doctors?page=1&limit=200";
                } else if (role === "doctor") {
                    endpoint = "/api/patient/doctors?page=1&limit=200";
                } else if (role === "admin" || role === "super_admin" || role === "superadmin" || role === "super-admin") {
                    endpoint = "/api/admin/doctors?page=1&limit=200";
                } else {
                    endpoint = "/api/patient/doctors?page=1&limit=200";
                }

                console.debug("[MassHolidayModal] fetching doctors; role:", role, "endpoint:", endpoint);

                const res = await api.get(endpoint).catch((err) => {
                    const status = err?.response?.status;
                    const text = err?.response?.data ?? err?.message ?? String(err);
                    throw new Error(`Request failed (status: ${status || "unknown"}): ${JSON.stringify(text)}`);
                });

                if (!alive) return;

                const list =
                    res?.data?.doctors ??
                    res?.data?.data?.doctors ??
                    res?.data?.data ??
                    res?.data ??
                    res?.doctors ??
                    [];

                let doctorsArr = [];
                if (Array.isArray(list)) doctorsArr = list;
                else if (Array.isArray(list.doctors)) doctorsArr = list.doctors;
                else doctorsArr = [];

                setDoctorsList(doctorsArr);
            } catch (err) {
                console.warn("[MassHolidayModal] Failed to fetch doctors:", err);
                setDoctorsList([]);
                setError(err?.message || "Failed to fetch doctors");
            } finally {
                if (alive) setLoading(false);
            }
        })();

        return () => { alive = false; };
    }, [userRole, open]);


    useEffect(() => {
        if (!open) {
            resetAll();
        } else {
            fetchBatches().catch(() => { });
            setMode("create");
            setViewMode("list");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // calculate preview duration for create mode
    useEffect(() => {
        if (formMode === "range" && startDateTime && endDateTime) {
            const start = new Date(startDateTime);
            const end = new Date(endDateTime);
            if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
                const diffMs = end - start;
                const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
                const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                const days = Math.floor(totalHours / 24);
                const hours = totalHours % 24;
                if (days > 0) {
                    setPreviewDuration(`${days} day${days > 1 ? "s" : ""} ${hours > 0 ? hours + "h" : ""} ${minutes > 0 ? minutes + "m" : ""}`.trim());
                } else {
                    setPreviewDuration(`${hours}h ${minutes}m`);
                }
            } else {
                setPreviewDuration("");
            }
        } else if (formMode === "day" && date) {
            setPreviewDuration("24 hours (Full Day Block)");
        } else {
            setPreviewDuration("");
        }
    }, [formMode, date, startDateTime, endDateTime]);

    // calculate preview duration for edit mode
    useEffect(() => {
        if (editStartIso && editEndIso) {
            const start = new Date(editStartIso);
            const end = new Date(editEndIso);
            if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
                const diffMs = end - start;
                const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
                const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                const days = Math.floor(totalHours / 24);
                const hours = totalHours % 24;
                if (days > 0) {
                    setEditDurationPreview(`${days} day${days > 1 ? "s" : ""} ${hours > 0 ? hours + "h" : ""} ${minutes > 0 ? minutes + "m" : ""}`.trim());
                } else {
                    setEditDurationPreview(`${hours}h ${minutes}m`);
                }
            } else {
                setEditDurationPreview("");
            }
        } else {
            setEditDurationPreview("");
        }
    }, [editStartIso, editEndIso]);

    function resetAll() {
        setViewMode("list");
        setMode("create");
        setFormMode("day");
        setDate(new Date().toISOString().slice(0, 10));
        setStartDateTime("");
        setEndDateTime("");
        setDoctorFilterAll(true);
        setSelectedDoctors(defaultDoctorIds || []);
        setReason("");
        setAutoReschedule(true);
        setSendGoogleSync(true);
        setBatches([]);
        setSearchDate("");
        setSelectedBatchId(null);
        setEditStartIso("");
        setEditEndIso("");
        setEditReason("");
        setLastPayload(null);
        setError("");
        setSubmitting(false);
        setShowSuccessAnimation(false);
        setPreviewDuration("");
        setEditDurationPreview("");
    }

    const isoForDateStart = (d) => {
        const x = new Date(d);
        x.setHours(0, 0, 0, 0);
        return x.toISOString();
    };
    const isoForDateEnd = (d) => {
        const x = new Date(d);
        x.setHours(23, 59, 59, 999);
        return x.toISOString();
    };

    // small helper
    const pad = (n) => String(n).padStart(2, "0");

    // produce local "YYYY-MM-DDTHH:MM" for datetime-local inputs
    const toLocalDatetimeLocalString = (input) => {
        if (!input) return "";
        const d = new Date(input);
        if (Number.isNaN(d.getTime())) return "";
        const year = d.getFullYear();
        const month = pad(d.getMonth() + 1);
        const day = pad(d.getDate());
        const hours = pad(d.getHours());
        const minutes = pad(d.getMinutes());
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };


    async function fetchBatches() {
        try {
            setLoading(true);
            const res = await api.get("/api/blocked-slots/mass");
            const arr = res?.data?.batches ?? res?.data ?? res?.batches ?? res ?? [];
            setBatches(Array.isArray(arr) ? arr : []);
        } catch (err) {
            console.warn("Failed to fetch mass batches:", err);
            setBatches([]);
        } finally {
            setLoading(false);
        }
    }

    const now = new Date();
    const futureBatches = useMemo(() => {
        return (batches || [])
            .filter((b) => {
                try {
                    const end = new Date(b.endTime || b.end || b.endsAt || b.to);
                    return !Number.isNaN(end.getTime()) && end >= now;
                } catch {
                    return false;
                }
            })
            .sort((a, b) => new Date(a.startTime || a.start || a.from) - new Date(b.startTime || b.start || b.from));
    }, [batches]);

    const selectableBatches = useMemo(() => {
        if (!searchDate) return futureBatches;
        return futureBatches.filter((s) => {
            try {
                const dt = new Date(s.startTime || s.start || s.from);
                const y = dt.getFullYear();
                const m = String(dt.getMonth() + 1).padStart(2, "0");
                const d = String(dt.getDate()).padStart(2, "0");
                return `${y}-${m}-${d}` === searchDate;
            } catch {
                return false;
            }
        });
    }, [futureBatches, searchDate]);

    useEffect(() => {
        if (!selectedBatchId) {
            setEditStartIso("");
            setEditEndIso("");
            setEditReason("");
            return;
        }

        const batch = (batches || []).find((b) => String(b.batchId || b._id || b.id) === String(selectedBatchId));
        if (!batch) {
            return;
        }
        const rawStart = batch.startTime ?? batch.start ?? batch.from;
        const rawEnd = batch.endTime ?? batch.end ?? batch.to;
        const localStart = toLocalDatetimeLocalString(rawStart);
        const localEnd = toLocalDatetimeLocalString(rawEnd);

        setEditStartIso(localStart);
        setEditEndIso(localEnd);
        setEditReason(batch.reason ?? "");
        setViewMode("form");
        setMode("edit");
    }, [selectedBatchId, batches]);


    const validateAndBuildPayload = () => {
        if (formMode === "day") {
            if (!date) throw new Error("Please pick a date");
            return {
                startTime: isoForDateStart(date),
                endTime: isoForDateEnd(date),
                reason,
                doctorIds: doctorFilterAll ? undefined : (selectedDoctors || []),
                autoReschedule,
                sendGoogleSync,
            };
        } else {
            if (!startDateTime || !endDateTime) throw new Error("Please provide start and end date/time");
            const s = new Date(startDateTime);
            const e = new Date(endDateTime);
            if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) throw new Error("Invalid start or end time");
            if (s >= e) throw new Error("End time must be after start time");
            return {
                startTime: s.toISOString(),
                endTime: e.toISOString(),
                reason,
                doctorIds: doctorFilterAll ? undefined : (selectedDoctors || []),
                autoReschedule,
                sendGoogleSync,
            };
        }
    };

    const handleSubmit = async (ev) => {
        ev && ev.preventDefault();
        setError("");
        setSubmitting(true);

        let payload;
        try {
            payload = validateAndBuildPayload();
        } catch (e) {
            setError(e.message || "Validation failed");
            setSubmitting(false);
            return;
        }

        try {
            const resp = await api.post("/api/blocked-slots/mass", payload);
            const success = resp && (resp.success || resp.status === "success" || resp.status === 201 || resp.status === 200);

            if (!success) {
                const msg = resp?.message || JSON.stringify(resp);
                setError(msg);
                await Swal.fire({ icon: "error", title: "Failed", text: msg });
                setSubmitting(false);
                return;
            }

            await Swal.fire({ position: "center", icon: "success", title: "Mass block created", showConfirmButton: false, timer: 900 });
            setShowSuccessAnimation(true);
            await fetchBatches();
            setTimeout(() => {
                setShowSuccessAnimation(false);
                setSubmitting(false);
                setViewMode("list");
                setMode("create");
            }, 500);
        } catch (err) {
            console.error("Mass block failed:", err);
            setError(err?.message || "Mass block failed");
            await Swal.fire({ icon: "error", title: "Error", text: err?.message || "Operation failed" });
            setSubmitting(false);
        }
    };

    const handleUpdateBatch = async () => {
        setError("");
        if (!selectedBatchId) { setError("No batch selected"); return; }
        if (!editStartIso || !editEndIso) { setError("Provide start and end"); return; }
        const s = new Date(editStartIso), e = new Date(editEndIso);
        if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || s >= e) { setError("Invalid start/end"); return; }

        try {
            setSubmitting(true);
            const payload = { startTime: s.toISOString(), endTime: e.toISOString(), reason: editReason || "" };
            const res = await api.put(`/api/blocked-slots/mass/${selectedBatchId}`, payload);
            const ok = res && (res.success || res.status === "success" || res.status === 200);
            if (!ok) throw new Error(res?.message || "Update failed");

            await Swal.fire({ position: "center", icon: "success", title: "Updated", showConfirmButton: false, timer: 900 });
            setShowSuccessAnimation(true);
            await fetchBatches();
            setTimeout(() => {
                setShowSuccessAnimation(false);
                setSubmitting(false);
                setViewMode("list");
                setMode("create");
                setSelectedBatchId(null);
            }, 400);
        } catch (err) {
            console.error("Update failed", err);
            setError(err?.message || "Update failed");
            await Swal.fire({ icon: "error", title: "Update failed", text: err?.message || "Could not update" });
            setSubmitting(false);
        }
    };

    const handleDeleteBatch = async (batchIdArg) => {
        let batchIdToDelete = batchIdArg;
        if (!batchIdToDelete && typeof batchIdArg === 'object' && batchIdArg !== null) {
            batchIdToDelete = batchIdArg.batchId || batchIdArg._id || batchIdArg.id;
        }
        if (!batchIdToDelete) batchIdToDelete = selectedBatchId;
        if (!batchIdToDelete) { setError("No batch selected to delete"); return; }

        setDeletingBatchId(batchIdToDelete);

        try {
            const confirmed = await Swal.fire({
                title: "Unblocked this blocked date range?",
                icon: "warning",
                showCancelButton: true,
                confirmButtonText: "Yes, Unblock",
                cancelButtonText: "Cancel",
                reverseButtons: true,
                focusCancel: true,
            });

            if (!confirmed.isConfirmed) {
                setDeletingBatchId(null);
                return;
            }

            setSubmitting(true);
            const r = await api.delete(`/api/blocked-slots/mass/${batchIdToDelete}`);
            const ok = r && (r.success || r.status === "success" || r.status === 200);
            if (!ok) throw new Error(r?.message || "Unblocked failed");

            await Swal.fire({ position: "center", icon: "success", title: "Unblocked", showConfirmButton: false, timer: 900 });
            await fetchBatches();
            setSelectedBatchId(null);
            setViewMode("list");
        } catch (err) {
            console.error("Unblocked failed", err);
            setError(err?.message || "Unblocked failed");
            await Swal.fire({ icon: "error", title: "Unblocked failed", text: err?.message || "Could not Unblocked" });
        } finally {
            setSubmitting(false);
            setDeletingBatchId(null);
        }
    };


    // Local-safe date display in DD-MM-YYYY for list and UI
    const formatDateOnly = (iso) => {
        try {
            const d = new Date(iso);
            const day = String(d.getDate()).padStart(2, "0");
            const month = String(d.getMonth() + 1).padStart(2, "0");
            const year = d.getFullYear();
            return `${day}-${month}-${year}`; // e.g. 12-12-2025
        } catch {
            return iso;
        }
    };

    // Local-aware time in 12-hour "hh:mm AM/PM" for list display
    const formatTimeOnly = (iso) => {
        try {
            const d = new Date(iso);
            const parts = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
            return parts.replace(/\u200E/g, "").replace(/\s+/g, " ").trim().toUpperCase();
        } catch {
            return iso;
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-3 sm:p-6 animate-fadeIn">
            {/* BACKDROP */}
            <div
                className="absolute inset-0 cursor-pointer"
                onClick={() => {
                    if (!submitting) onClose();
                }}
            />

            {/* MODAL BOX */}
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Calendar Block Management"
                className="relative w-full max-w-xl bg-white rounded-3xl border border-white/20 shadow-2xl shadow-[#134e97]/10 max-h-[90vh] overflow-hidden flex flex-col transition-all duration-300 scale-100"
            >
                {/* HEADER */}
                <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-50 rounded-2xl flex items-center justify-center text-red-500 shadow-inner">
                            <Ban className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-xl sm:text-2xl font-heading text-[#134e97] tracking-tight leading-tight font-normal" style={{ fontFamily: "'mirador-medium', 'Outfit', sans-serif" }}>
                                Calendar Block Management
                            </h2>
                            <p className="text-xxs sm:text-xs text-slate-500 font-body mt-0.5 font-normal">
                                Manage global calendar blocks and mass holiday slots
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            if (!submitting) {
                                onClose();
                                resetAll();
                            }
                        }}
                        disabled={submitting || showSuccessAnimation}
                        className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center hover:bg-red-100 transition-colors cursor-pointer disabled:opacity-50"
                    >
                        <X className="w-4 h-4 text-red-500" />
                    </button>
                </div>

                {/* View Mode Switching Tab Bar */}
                <div className="px-5 py-4 bg-slate-50/30 border-b border-slate-100/50">
                    <div className="grid grid-cols-2 gap-2.5 max-w-md mx-auto">
                        <button
                            type="button"
                            onClick={() => {
                                setMode("create");
                                setViewMode("list");
                                setSelectedBatchId(null);
                                fetchBatches().catch(() => { });
                            }}
                            className={`py-2.5 px-3 rounded-full text-xs font-body transition-all text-center border cursor-pointer font-normal ${
                                viewMode === "list"
                                    ? "bg-gradient-to-r from-[#134e97] to-[#013473] text-white border-transparent shadow-sm shadow-[#134e97]/25"
                                    : "bg-white text-slate-600 border-slate-200 hover:border-[#134e97]/40 hover:bg-slate-50"
                            }`}
                        >
                            View Active Blocks
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setMode("create");
                                setViewMode("form");
                                setSelectedBatchId(null);
                            }}
                            className={`py-2.5 px-3 rounded-full text-xs font-body transition-all text-center border cursor-pointer font-normal ${
                                viewMode === "form"
                                    ? "bg-gradient-to-r from-[#134e97] to-[#013473] text-white border-transparent shadow-sm shadow-[#134e97]/25"
                                    : "bg-white text-slate-600 border-slate-200 hover:border-[#134e97]/40 hover:bg-slate-50"
                            }`}
                        >
                            {mode === "edit" && selectedBatchId ? "Edit Block Settings" : "Block New Dates"}
                        </button>
                    </div>
                </div>

                {/* Body Form/List */}
                <div className="p-5 sm:p-6 overflow-auto flex-1" style={{ maxHeight: "calc(90vh - 150px)" }}>
                    {/* Success info block */}
                    {showSuccessAnimation && (
                        <div className="mb-4 rounded-2xl p-4 bg-emerald-50 border border-emerald-100 flex items-start gap-3">
                            <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 animate-bounce" />
                            <div className="text-xs text-emerald-800 font-body font-normal">
                                Operation succeeded. Syncing changes with your connected schedules.
                            </div>
                        </div>
                    )}

                    {/* Error Alert */}
                    {error && !showSuccessAnimation && (
                        <div className="mb-4 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 justify-between">
                            <div className="flex gap-3">
                                <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
                                <div className="text-xs text-red-800 font-body font-normal">{error}</div>
                            </div>
                            <button onClick={() => setError("")} className="text-red-400 cursor-pointer">
                                <X size={16} />
                            </button>
                        </div>
                    )}

                    {/* ---------- FORM MODE ---------- */}
                    {viewMode === "form" && (
                        mode === "edit" && selectedBatchId ? (
                            /* EDIT MODE FORM */
                            <div className="space-y-5">
                                {/* Start DateTime Card */}
                                <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                    <label className="text-xs font-body uppercase tracking-wider text-slate-500 mb-2.5 block font-normal flex items-center gap-2">
                                        <Calendar className="w-4 h-4 text-slate-400" /> Start Date & Time
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={editStartIso}
                                        onChange={(e) => setEditStartIso(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal"
                                    />
                                </div>

                                {/* End DateTime Card */}
                                <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                    <label className="text-xs font-body uppercase tracking-wider text-slate-500 mb-2.5 block font-normal flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-slate-400" /> End Date & Time
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={editEndIso}
                                        onChange={(e) => setEditEndIso(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal"
                                    />
                                </div>

                                {/* Edit Duration Preview */}
                                {editDurationPreview && (
                                    <div className="p-3 bg-[#134e97]/5 border border-[#134e97]/10 rounded-2xl text-xs text-[#134e97] flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-[#134e97]" />
                                        <div className="font-body font-normal">
                                            <span className="font-normal block">Duration Preview: {editDurationPreview}</span>
                                            <span className="text-xxs text-slate-500 mt-0.5 block">Updating this period will adjust the blocked slot details across all targeted doctors.</span>
                                        </div>
                                    </div>
                                )}

                                {/* Edit Reason Card */}
                                <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                    <label className="block text-xs font-body uppercase tracking-wider text-slate-500 mb-2 font-normal">
                                        Reason for block (Optional)
                                    </label>
                                    <textarea
                                        value={editReason}
                                        onChange={(e) => setEditReason(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal resize-none"
                                        rows={3}
                                        placeholder="E.g., Clinical rounds, personal vacation, family engagement..."
                                        maxLength={200}
                                    />
                                    <div className="text-[10px] text-slate-400 text-right mt-1 font-body font-normal">{editReason.length}/200</div>
                                </div>

                                {/* Edit Actions Footer */}
                                <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
                                    <Button
                                        variant="outline"
                                        type="button"
                                        onClick={() => {
                                            setSelectedBatchId(null);
                                            setViewMode("list");
                                            setMode("create");
                                        }}
                                        className="w-full sm:w-1/2 border-slate-200 text-slate-700 hover:bg-slate-50 rounded-full font-body text-xs py-3 cursor-pointer transition-all duration-300 hover:scale-102 font-normal"
                                        disabled={submitting}
                                    >
                                        Cancel
                                    </Button>

                                    <Button
                                        type="button"
                                        onClick={handleUpdateBatch}
                                        disabled={submitting}
                                        className="w-full sm:w-1/2 bg-gradient-to-r from-[#134e97] to-[#013473] hover:from-[#0b5c9b] hover:to-[#134e97] text-white rounded-full font-body text-xs py-3 shadow-md shadow-[#134e97]/25 cursor-pointer transition-all duration-300 hover:scale-102 flex items-center justify-center font-normal"
                                    >
                                        {submitting ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                                                Saving...
                                            </>
                                        ) : (
                                            "Save Changes"
                                        )}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            /* CREATE MODE FORM */
                            <form onSubmit={handleSubmit} className="space-y-5">
                                {/* Mode toggle */}
                                <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                    <label className="text-xs font-body uppercase tracking-wider text-slate-500 mb-2.5 block font-normal">
                                        Mode
                                    </label>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setFormMode("day")}
                                            className={`py-1.5 px-4 rounded-full text-xs font-body transition-all border cursor-pointer font-normal ${
                                                formMode === "day"
                                                    ? "bg-gradient-to-r from-[#134e97] to-[#013473] text-white border-transparent shadow-sm shadow-[#134e97]/25"
                                                    : "bg-white text-slate-600 border-slate-200 hover:border-[#134e97]/40 hover:bg-slate-50"
                                            }`}
                                        >
                                            Full Day
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormMode("range")}
                                            className={`py-1.5 px-4 rounded-full text-xs font-body transition-all border cursor-pointer font-normal ${
                                                formMode === "range"
                                                    ? "bg-gradient-to-r from-[#134e97] to-[#013473] text-white border-transparent shadow-sm shadow-[#134e97]/25"
                                                    : "bg-white text-slate-600 border-slate-200 hover:border-[#134e97]/40 hover:bg-slate-50"
                                            }`}
                                        >
                                            Custom Range
                                        </button>
                                    </div>
                                </div>

                                {/* Date inputs */}
                                {formMode === "day" ? (
                                    <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                        <label className="text-xs font-body uppercase tracking-wider text-slate-500 mb-2.5 block font-normal flex items-center gap-2">
                                            <Calendar className="w-4 h-4 text-slate-400" /> Date
                                        </label>
                                        <input
                                            type="date"
                                            value={date}
                                            onChange={(e) => setDate(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal"
                                        />
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                            <label className="text-xs font-body uppercase tracking-wider text-slate-500 mb-2.5 block font-normal flex items-center gap-2">
                                                <Calendar className="w-4 h-4 text-slate-400" /> Start Date & Time
                                            </label>
                                            <input
                                                type="datetime-local"
                                                value={startDateTime}
                                                onChange={(e) => setStartDateTime(e.target.value)}
                                                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal"
                                            />
                                        </div>
                                        <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                            <label className="text-xs font-body uppercase tracking-wider text-slate-500 mb-2.5 block font-normal flex items-center gap-2">
                                                <Clock className="w-4 h-4 text-slate-400" /> End Date & Time
                                            </label>
                                            <input
                                                type="datetime-local"
                                                value={endDateTime}
                                                onChange={(e) => setEndDateTime(e.target.value)}
                                                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Create Duration Preview */}
                                {previewDuration && (
                                    <div className="p-3 bg-[#134e97]/5 border border-[#134e97]/10 rounded-2xl text-xs text-[#134e97] flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-[#134e97]" />
                                        <div className="font-body font-normal">
                                            <span className="font-normal block">Duration Preview: {previewDuration}</span>
                                            <span className="text-xxs text-slate-500 mt-0.5 block">This period will be temporarily marked as busy and unavailable for online booking.</span>
                                        </div>
                                    </div>
                                )}

                                {/* Reason Input */}
                                <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                    <label className="block text-xs font-body uppercase tracking-wider text-slate-500 mb-2 font-normal">
                                        Reason for block (Optional)
                                    </label>
                                    <textarea
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal resize-none"
                                        rows={3}
                                        placeholder="E.g., Diwali Holiday, personal leave..."
                                        maxLength={200}
                                    />
                                    <div className="text-[10px] text-slate-400 text-right mt-1 font-body font-normal">{reason.length}/200</div>
                                </div>

                                {/* DOCTORS SECTION */}
                                <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                    <label className="text-xs font-body uppercase tracking-wider text-slate-500 mb-2.5 block font-normal">
                                        Target Doctors
                                    </label>

                                    <div className="flex gap-4 mb-3">
                                        <label className="flex items-center gap-2 text-xs font-body text-slate-700 cursor-pointer font-normal">
                                            <input
                                                type="radio"
                                                name="target"
                                                checked={doctorFilterAll}
                                                onChange={() => setDoctorFilterAll(true)}
                                                className="w-4 h-4 text-[#134e97] focus:ring-[#134e97]/20 border-slate-300 accent-[#134e97]"
                                            />
                                            All Doctors
                                        </label>

                                        <label className="flex items-center gap-2 text-xs font-body text-slate-700 cursor-pointer font-normal">
                                            <input
                                                type="radio"
                                                name="target"
                                                checked={!doctorFilterAll}
                                                onChange={() => setDoctorFilterAll(false)}
                                                className="w-4 h-4 text-[#134e97] focus:ring-[#134e97]/20 border-slate-300 accent-[#134e97]"
                                            />
                                            Select Doctors
                                        </label>
                                    </div>

                                    {!doctorFilterAll && (
                                        <div className="border border-slate-200 rounded-xl p-3 bg-white max-h-48 overflow-y-auto">
                                            {loading ? (
                                                <div className="text-xs text-slate-400 italic font-body font-normal">Loading doctors...</div>
                                            ) : doctorsList.length === 0 ? (
                                                <div className="text-xs text-slate-400 italic font-body font-normal">No doctors available</div>
                                            ) : (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                                    {doctorsList.map((d) => (
                                                        <label
                                                            key={d._id || d.id}
                                                            className="flex items-center gap-2 text-xs font-body text-slate-700 cursor-pointer hover:text-slate-900 transition-colors font-normal"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                className="rounded text-[#134e97] focus:ring-[#134e97]/20 w-4 h-4 border-slate-300 accent-[#134e97]"
                                                                checked={selectedDoctors.some(
                                                                    (x) => String(x) === String(d._id || d.id)
                                                                )}
                                                                onChange={() => {
                                                                    const id = d._id || d.id;
                                                                    setSelectedDoctors((prev) =>
                                                                        prev.includes(id)
                                                                            ? prev.filter((x) => String(x) !== String(id))
                                                                            : [...prev, id]
                                                                    );
                                                                }}
                                                            />
                                                            {d.name || d.displayName}
                                                        </label>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Additional Checkboxes */}
                                <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 flex flex-col gap-2.5">
                                    <label className="flex items-center gap-2 text-xs font-body text-slate-700 cursor-pointer font-normal">
                                        <input
                                            type="checkbox"
                                            checked={autoReschedule}
                                            onChange={() => setAutoReschedule((v) => !v)}
                                            className="rounded text-[#134e97] focus:ring-[#134e97]/20 w-4 h-4 border-slate-300 accent-[#134e97]"
                                        />
                                        Auto-reschedule conflicts
                                    </label>
                                    <label className="flex items-center gap-2 text-xs font-body text-slate-700 cursor-pointer font-normal">
                                        <input
                                            type="checkbox"
                                            checked={sendGoogleSync}
                                            onChange={() => setSendGoogleSync((v) => !v)}
                                            className="rounded text-[#134e97] focus:ring-[#134e97]/20 w-4 h-4 border-slate-300 accent-[#134e97]"
                                        />
                                        Sync with Google Calendar
                                    </label>
                                </div>

                                {/* Create Actions Footer */}
                                <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
                                    <Button
                                        variant="outline"
                                        type="button"
                                        onClick={() => {
                                            onClose();
                                            resetAll();
                                        }}
                                        disabled={submitting}
                                        className="w-full sm:w-1/2 border-slate-200 text-slate-700 hover:bg-slate-50 rounded-full font-body text-xs py-3 cursor-pointer transition-all duration-300 hover:scale-102 font-normal"
                                    >
                                        Cancel
                                    </Button>

                                    <Button
                                        type="submit"
                                        disabled={submitting}
                                        className="w-full sm:w-1/2 bg-gradient-to-r from-[#134e97] to-[#013473] hover:from-[#0b5c9b] hover:to-[#134e97] text-white rounded-full font-body text-xs py-3 shadow-md shadow-[#134e97]/25 cursor-pointer transition-all duration-300 hover:scale-102 flex items-center justify-center font-normal"
                                    >
                                        {submitting ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                                                Blocking…
                                            </>
                                        ) : (
                                            <>
                                                <Ban className="w-4 h-4 mr-2" />
                                                Block Dates
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </form>
                        )
                    )}

                    {/* ---------- LIST MODE ---------- */}
                    {viewMode === "list" && (
                        <div className="space-y-4">
                            <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                <label className="block text-xs font-body uppercase tracking-wider text-slate-500 mb-2 font-normal">
                                    Search by specific date
                                </label>
                                <input
                                    type="date"
                                    value={searchDate}
                                    onChange={(e) => setSearchDate(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal"
                                />
                            </div>

                            <div className="space-y-3">
                                {(selectableBatches?.length ?? 0) === 0 ? (
                                    <div className="text-xs text-slate-400 italic bg-white p-6 border border-dashed border-slate-150 rounded-2xl text-center font-body font-normal">
                                        No ongoing or upcoming blocks found.
                                    </div>
                                ) : (
                                    selectableBatches.map((s) => {
                                        const id = s.batchId || s._id || s.id;

                                        return (
                                            <div
                                                key={id}
                                                className="bg-gradient-to-br from-white via-white to-slate-50 p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center justify-between gap-3 font-body font-normal"
                                            >
                                                <div className="text-slate-800 flex-1 min-w-0 font-body font-normal">
                                                    {/* Date display */}
                                                    <div className="text-xs sm:text-sm font-body text-slate-700 font-normal">
                                                        {formatDateOnly(s.startTime)}
                                                        {s.startTime !== s.endTime ? ` → ${formatDateOnly(s.endTime)}` : ""}
                                                    </div>

                                                    {/* Hours info */}
                                                    <div className="text-xxs sm:text-xs text-slate-400 mt-1 font-body font-normal flex items-center gap-1.5">
                                                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                                                        {formatTimeOnly(s.startTime)} – {formatTimeOnly(s.endTime)}
                                                    </div>

                                                    {/* Reason */}
                                                    <div className="text-xxs text-slate-500 mt-1 truncate font-body font-normal max-w-xs">
                                                        {s.reason || "Blocked Slot"}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedBatchId(id)}
                                                        className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-center transition-colors cursor-pointer text-slate-500"
                                                        title="Edit"
                                                    >
                                                        <Edit2 className="w-3.5 h-3.5" />
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteBatch(id)}
                                                        className="w-8 h-8 rounded-full bg-red-50 hover:bg-red-100 border border-red-100 flex items-center justify-center transition-colors cursor-pointer text-red-500"
                                                        disabled={submitting || deletingBatchId === id}
                                                        title="Unblock"
                                                    >
                                                        {deletingBatchId === id && submitting ? (
                                                            <div className="w-3.5 h-3.5 border border-red-500 border-t-transparent rounded-full animate-spin" />
                                                        ) : (
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

MassHolidayModal.propTypes = {
    open: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    defaultDoctorIds: PropTypes.array,
    userRole: PropTypes.string, // 'admin' | 'super_admin' | 'receptionist' | 'doctor' | etc.
};

MassHolidayModal.defaultProps = {
    defaultDoctorIds: [],
    userRole: "guest",
};
