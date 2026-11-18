import React, { useState, useEffect, useMemo } from "react";
import { useBlockedSlotStore } from "@/store/blockedSlotStore";
import { userAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import {
  X,
  Ban,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Edit2,
  Trash2,
} from "lucide-react";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";

export default function BlockDateModal({
  isOpen,
  onClose,
  doctorId: propDoctorId,
  doctorName: propDoctorName,
  onSuccess,
}) {
  const {
    createBlockedSlot,
    updateBlockedSlot,
    deleteBlockedSlot,
    loading,
    fetchBlockedSlots,
    blockedSlots,
  } = useBlockedSlotStore();
  const { user } = userAuthStore();
  const doctorId = propDoctorId || user?._id;
  // prefer prop doctorName, fallback to logged-in user name
  const resolvedDoctorName = propDoctorName || user?.name || "Doctor";

  const [viewMode, setViewMode] = useState("list"); // show list first by default
  const [mode, setMode] = useState("create"); // "create" | "edit"
  const [isEditMode, setIsEditMode] = useState(true);
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [error, setError] = useState("");
  const [previewDuration, setPreviewDuration] = useState("");

  const [searchDate, setSearchDate] = useState("");
  const [formData, setFormData] = useState({
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    reason: "",
  });

  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (isOpen && doctorId) {
      console.log('fetchBlockedSlots called with doctorId=', doctorId);
      fetchBlockedSlots(doctorId).then(r => {
        console.log('fetchBlockedSlots response:', r);
      }).catch(e => {
        console.error('fetchBlockedSlots error:', e);
      });
    }
    if (!isOpen) resetAll();
  }, [isOpen, doctorId]);

  const resetAll = () => {
    setSelectedSlotId(null);
    setMode("create");
    setViewMode("list");
    setIsEditMode(true);
    setError("");
    setShowSuccessAnimation(false);
    setPreviewDuration("");
    setSearchDate("");
    setFormData({
      startDate: "",
      startTime: "",
      endDate: "",
      endTime: "",
      reason: "",
    });
    setDeletingId(null);
  };

  // show only ongoing or upcoming slots: endTime >= now
  const futureSlots = useMemo(() => {
    const now = new Date();
    return (blockedSlots || [])
      .filter((s) => {
        try {
          return new Date(s.endTime) >= now;
        } catch {
          return false;
        }
      })
      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  }, [blockedSlots]);

  // filter by searchDate (YYYY-MM-DD)
  const selectableSlots = useMemo(() => {
    if (!searchDate) return futureSlots;
    return futureSlots.filter((s) => {
      try {
        const dt = new Date(s.startTime);
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, "0");
        const d = String(dt.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}` === searchDate;
      } catch {
        return false;
      }
    });
  }, [futureSlots, searchDate]);

  // when selected slot changes -> populate form and open form (edit)
  useEffect(() => {
    if (selectedSlotId) {
      const slot = (blockedSlots || []).find((s) => String(s._id) === String(selectedSlotId));
      if (slot) {
        const s = new Date(slot.startTime);
        const e = new Date(slot.endTime);
        const toDateInput = (iso) => {
          const d = new Date(iso);
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          return `${year}-${month}-${day}`;
        };

        const toTimeInput = (iso) => {
          const d = new Date(iso);
          return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
        };

        setFormData({
          startDate: toDateInput(s),
          startTime: toTimeInput(s),
          endDate: toDateInput(e),
          endTime: toTimeInput(e),
          reason: slot.reason || "",
        });
        setIsEditMode(true);
        setError("");
        setViewMode("form");
        setMode("edit");
      } else {
        setSelectedSlotId(null);
        setIsEditMode(true);
      }
    } else {
      setFormData({
        startDate: "",
        startTime: "",
        endDate: "",
        endTime: "",
        reason: "",
      });
      setIsEditMode(true);
      setError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlotId, blockedSlots]);

  // duration preview
  useEffect(() => {
    if (formData.startDate && formData.startTime && formData.endDate && formData.endTime) {
      const start = new Date(`${formData.startDate}T${formData.startTime}`);
      const end = new Date(`${formData.endDate}T${formData.endTime}`);
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
    } else {
      setPreviewDuration("");
    }
  }, [formData.startDate, formData.startTime, formData.endDate, formData.endTime]);

  const localToday = (() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  })();

  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5);

  const formatDateOnly = (iso) => {
    try {
      const d = new Date(iso);
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    } catch {
      return iso;
    }
  };

  const formatTimeOnly = (iso) => {
    try {
      const d = new Date(iso);
      const parts = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
      return parts.replace(/\u200E/g, "").replace(/\s+/g, " ").trim().toUpperCase();
    } catch {
      return iso;
    }
  };

  /* ---------- Submit (create / update) with swal ---------- */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!doctorId) {
      setError("Doctor ID missing. Refresh the page.");
      return;
    }

    const start = new Date(`${formData.startDate}T${formData.startTime}`);
    const end = new Date(`${formData.endDate}T${formData.endTime}`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setError("Please select valid start and end date/time.");
      return;
    }
    if (start >= end) {
      setError("End time must be after start time.");
      return;
    }
    if (start < new Date()) {
      setError("Cannot block past times.");
      return;
    }
    const durationDays = (end - start) / (1000 * 60 * 60 * 24);
    if (durationDays > 30) {
      setError("Maximum single block length is 30 days.");
      return;
    }

    try {
      if (selectedSlotId && isEditMode) {
        const payload = {
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          reason: formData.reason || "Blocked for personal use",
        };
        const res = await updateBlockedSlot(selectedSlotId, payload);
        if (!res || !res.success) throw new Error(res?.message || "Update failed");

        // success swal
        await Swal.fire({
          icon: "success",
          title: "Block Updated!",
          text: "The blocked schedule has been updated successfully.",
          iconColor: "#10b981",
          showConfirmButton: false,
          timer: 1500,
          customClass: {
            popup: "rounded-3xl border border-[#134e97]/10 shadow-2xl p-6 sm:p-8 font-body",
            title: "text-lg sm:text-xl font-heading text-slate-800 tracking-tight mb-2 font-normal",
            htmlContainer: "text-xs sm:text-sm text-slate-500 font-body leading-relaxed mb-6 font-normal",
          },
          backdrop: "rgba(19, 78, 151, 0.15)",
        });

        setShowSuccessAnimation(true);
        await fetchBlockedSlots(doctorId);
        setTimeout(() => {
          setShowSuccessAnimation(false);
          if (onSuccess) onSuccess();
          onClose();
          resetAll();
        }, 300);
        return;
      }

      // create new
      const res = await createBlockedSlot({
        doctorId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        reason: formData.reason || "Blocked for personal use",
      });
      if (!res || !res.success) throw new Error(res?.message || "Create failed");

      await Swal.fire({
        icon: "success",
        title: "Dates Blocked!",
        text: "The selected period has been blocked successfully.",
        iconColor: "#10b981",
        showConfirmButton: false,
        timer: 1500,
        customClass: {
          popup: "rounded-3xl border border-[#134e97]/10 shadow-2xl p-6 sm:p-8 font-body",
          title: "text-lg sm:text-xl font-heading text-slate-800 tracking-tight mb-2 font-normal",
          htmlContainer: "text-xs sm:text-sm text-slate-500 font-body leading-relaxed mb-6 font-normal",
        },
        backdrop: "rgba(19, 78, 151, 0.15)",
      });

      setShowSuccessAnimation(true);
      await fetchBlockedSlots(doctorId);
      setTimeout(() => {
        setShowSuccessAnimation(false);
        if (onSuccess) onSuccess();
        onClose();
        resetAll();
      }, 300);
    } catch (err) {
      console.error("Block date error:", err);
      setError(err?.message || "Operation failed. Try again.");
      Swal.fire({
        icon: "error",
        title: "Block Failed",
        text: err?.message || "Operation failed. Try again.",
        confirmButtonText: "OK",
        customClass: {
          popup: "rounded-3xl border border-[#134e97]/10 shadow-2xl p-6 sm:p-8 font-body",
          title: "text-lg sm:text-xl font-heading text-slate-800 tracking-tight mb-2 font-normal",
          htmlContainer: "text-xs sm:text-sm text-slate-500 font-body leading-relaxed mb-6 font-normal",
          confirmButton: "bg-gradient-to-r from-[#134e97] to-[#013473] text-white font-body text-xs rounded-full px-6 py-3 border-0 transition-all duration-300 hover:scale-102 cursor-pointer shadow-md shadow-[#134e97]/10 outline-none font-normal",
        },
        buttonsStyling: false,
        backdrop: "rgba(19, 78, 151, 0.15)",
      });
    }
  };

  /* ---------- Delete (per-row) with swal confirmation ---------- */
  const handleDeleteRow = async (id) => {
    if (!id) return;

    const result = await Swal.fire({
      title: "Unblock this slot?",
      text: "This will remove the blocked period and allow bookings again.",
      icon: "warning",
      iconColor: "#ef4444",
      showCancelButton: true,
      confirmButtonText: "Yes, unblock",
      cancelButtonText: "Cancel",
      reverseButtons: true,
      customClass: {
        popup: "rounded-3xl border border-[#134e97]/10 shadow-2xl p-6 sm:p-8 font-body",
        title: "text-lg sm:text-xl font-heading text-slate-800 tracking-tight mb-2 font-normal",
        htmlContainer: "text-xs sm:text-sm text-slate-500 font-body leading-relaxed mb-6 font-normal",
        confirmButton: "bg-gradient-to-r from-red-500 to-rose-600 text-white font-body text-xs rounded-full px-6 py-3 border-0 transition-all duration-300 hover:scale-102 cursor-pointer shadow-md shadow-red-500/10 outline-none font-normal mr-2",
        cancelButton: "bg-white border border-slate-200 text-slate-700 font-body text-xs rounded-full px-6 py-3 transition-all duration-300 hover:scale-102 cursor-pointer outline-none font-normal",
      },
      buttonsStyling: false,
      backdrop: "rgba(19, 78, 151, 0.15)",
    });

    if (!result.isConfirmed) return;

    try {
      setDeletingId(id);
      const res = await deleteBlockedSlot(id);
      setDeletingId(null);
      if (!res || !res.success) throw new Error(res?.message || "Delete failed");

      await Swal.fire({
        icon: "success",
        title: "Slot Unblocked!",
        text: "The slot was unblocked successfully.",
        iconColor: "#10b981",
        timer: 1500,
        showConfirmButton: false,
        customClass: {
          popup: "rounded-3xl border border-[#134e97]/10 shadow-2xl p-6 sm:p-8 font-body",
          title: "text-lg sm:text-xl font-heading text-slate-800 tracking-tight mb-2 font-normal",
          htmlContainer: "text-xs sm:text-sm text-slate-500 font-body leading-relaxed mb-6 font-normal",
        },
        backdrop: "rgba(19, 78, 151, 0.15)",
      });

      await fetchBlockedSlots(doctorId);
      if (String(selectedSlotId) === String(id)) {
        setSelectedSlotId(null);
        setViewMode("list");
        setMode("edit");
      }
    } catch (err) {
      console.error("Delete blocked slot error:", err);
      setDeletingId(null);
      setError(err?.message || "Delete failed. Try again.");

      Swal.fire({
        icon: "error",
        title: "Unblock Failed",
        text: err?.message || "Could not delete the slot. Try again.",
        confirmButtonText: "OK",
        customClass: {
          popup: "rounded-3xl border border-[#134e97]/10 shadow-2xl p-6 sm:p-8 font-body",
          title: "text-lg sm:text-xl font-heading text-slate-800 tracking-tight mb-2 font-normal",
          htmlContainer: "text-xs sm:text-sm text-slate-500 font-body leading-relaxed mb-6 font-normal",
          confirmButton: "bg-gradient-to-r from-[#134e97] to-[#013473] text-white font-body text-xs rounded-full px-6 py-3 border-0 transition-all duration-300 hover:scale-102 cursor-pointer shadow-md shadow-[#134e97]/10 outline-none font-normal",
        },
        buttonsStyling: false,
        backdrop: "rgba(19, 78, 151, 0.15)",
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-3 sm:p-6 animate-fadeIn">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Block Calendar Dates"
        className="bg-white rounded-3xl border border-white/20 shadow-2xl shadow-[#134e97]/10 w-full max-w-xl mx-auto max-h-[90vh] overflow-hidden flex flex-col transition-all duration-300 scale-100"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-50 rounded-2xl flex items-center justify-center text-red-500 shadow-inner">
              <Ban className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-heading text-[#134e97] tracking-tight leading-tight font-normal">
                Block Calendar Dates
              </h2>
              <p className="text-xxs sm:text-xs text-slate-500 font-body mt-0.5 font-normal">
                Dr. {resolvedDoctorName} • Block time slot bookings
              </p>
            </div>
          </div>

          <button
            onClick={() => { onClose(); resetAll(); }}
            disabled={loading || showSuccessAnimation}
            className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center hover:bg-red-100 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4 text-red-500" />
          </button>
        </div>

        {/* View Mode Switching Tab Bar */}
        <div className="px-5 py-4 bg-slate-50/30 border-b border-slate-100/50">
          <div className="grid grid-cols-2 gap-2.5 max-w-md mx-auto">
            <button
              onClick={() => {
                setMode("edit");
                setViewMode("list");
                setSelectedSlotId(null);
                setIsEditMode(true);
                fetchBlockedSlots(doctorId).catch(() => { });
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
              onClick={() => {
                setMode("create");
                setViewMode("form");
                setSelectedSlotId(null);
                setIsEditMode(true);
              }}
              className={`py-2.5 px-3 rounded-full text-xs font-body transition-all text-center border cursor-pointer font-normal ${
                viewMode === "form"
                  ? "bg-gradient-to-r from-[#134e97] to-[#013473] text-white border-transparent shadow-sm shadow-[#134e97]/25"
                  : "bg-white text-slate-600 border-slate-200 hover:border-[#134e97]/40 hover:bg-slate-50"
              }`}
            >
              {mode === "edit" && selectedSlotId ? "Edit Block Settings" : "Block New Dates"}
            </button>
          </div>
        </div>

        {/* Body Form/List */}
        <div className="p-5 sm:p-6 overflow-auto" style={{ maxHeight: "calc(90vh - 150px)" }}>
          {/* Success Info block */}
          {showSuccessAnimation && (
            <div className="mb-4 rounded-2xl p-4 bg-emerald-50 border border-emerald-100 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5" />
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
                {selectableSlots.length === 0 ? (
                  <div className="text-xs text-slate-400 italic bg-white p-6 border border-dashed border-slate-150 rounded-2xl text-center font-body font-normal">
                    No ongoing or upcoming blocked dates found.
                  </div>
                ) : (
                  selectableSlots.map((s) => (
                    <div
                      key={s._id}
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
                          onClick={() => setSelectedSlotId(s._id)}
                          className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-center transition-colors cursor-pointer"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                        </button>

                        <button
                          onClick={() => handleDeleteRow(s._id)}
                          className="w-8 h-8 rounded-full bg-red-50 hover:bg-red-100 border border-red-100 flex items-center justify-center transition-colors cursor-pointer text-red-500"
                          disabled={deletingId === s._id}
                          title="Unblock"
                        >
                          {deletingId === s._id ? (
                            <div className="w-3.5 h-3.5 border border-red-500 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ---------- FORM MODE ---------- */}
          {viewMode === "form" && (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Start Date & Time */}
              <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                <label className="text-xs font-body uppercase tracking-wider text-slate-500 mb-2.5 block font-normal flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-400" /> Start Date & Time
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="date"
                    required
                    min={localToday}
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal"
                  />
                  <input
                    type="time"
                    required
                    min={formData.startDate === localToday ? currentTime : undefined}
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal"
                  />
                </div>
              </div>

              {/* End Date & Time */}
              <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                <label className="text-xs font-body uppercase tracking-wider text-slate-500 mb-2.5 block font-normal flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400" /> End Date & Time
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="date"
                    required
                    min={formData.startDate || localToday}
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal"
                  />
                  <input
                    type="time"
                    required
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal"
                  />
                </div>
              </div>

              {/* Duration Preview Label */}
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
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal resize-none"
                  rows={3}
                  placeholder="E.g., Clinical rounds, personal vacation, family engagement..."
                  maxLength={200}
                />
                <div className="text-[10px] text-slate-400 text-right mt-1 font-body font-normal">{formData.reason.length}/200</div>
              </div>

              {/* Actions Footer */}
              <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => { onClose(); resetAll(); }}
                  disabled={loading || showSuccessAnimation}
                  className="w-full sm:w-1/2 border-slate-200 text-slate-700 hover:bg-slate-50 rounded-full font-body text-xs py-3 cursor-pointer transition-all duration-300 hover:scale-102 font-normal"
                >
                  Cancel
                </Button>

                <Button
                  type="submit"
                  disabled={loading || showSuccessAnimation}
                  className="w-full sm:w-1/2 bg-gradient-to-r from-[#134e97] to-[#013473] hover:from-[#0b5c9b] hover:to-[#134e97] text-white rounded-full font-body text-xs py-3 shadow-md shadow-[#134e97]/25 cursor-pointer transition-all duration-300 hover:scale-102 flex items-center justify-center font-normal"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Ban className="w-4 h-4 mr-2" />
                      {selectedSlotId ? "Save Changes" : "Block Selected Dates"}
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
