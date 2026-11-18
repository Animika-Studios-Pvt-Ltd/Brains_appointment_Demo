import React, { useState, useEffect, useRef } from "react";
import { X, Clock, Plus, Trash2, Save, Video, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "../../ui/button";
import Swal from "sweetalert2";

const AvailabilityModal = ({ isOpen, onClose, doctorId, currentAvailability, onSuccess, saveUrl, doctorName, showVipFields = true }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [appointmentDuration, setAppointmentDuration] = useState(30);
  const [availabilityMode, setAvailabilityMode] = useState("default");
  const [consultationType, setConsultationType] = useState("inPerson"); // "inPerson" | "online"
  const [expandedDays, setExpandedDays] = useState({ 1: true }); // Mon expanded by default

  const toggleDayExpanded = (dayValue) => {
    setExpandedDays(prev => ({
      ...prev,
      [dayValue]: !prev[dayValue]
    }));
  };

  // 💻 Online Consultation Timing Picker Popup State
  const [onlinePickerModal, setOnlinePickerModal] = useState({
    isOpen: false,
    dayValue: null,
    dayLabel: "",
    clinicStart: "10:00",
    clinicEnd: "17:00",
    startTime: "14:00",
    endTime: "16:00"
  });

  const [dailyTimeRanges, setDailyTimeRanges] = useState([
    { start: "09:00", end: "17:00", vipSlots: 0, vipTimings: [] }
  ]);

  const [availabilityRange, setAvailabilityRange] = useState({
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
    excludedWeekdays: []
  });

  const [customDailySchedule, setCustomDailySchedule] = useState({
    0: [],
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: []
  });

  const hasInitialized = useRef(false);
  const skipSync = useRef(false); // ✅ Prevent unwanted syncs during load

  const weekdays = [
    { value: 0, label: "Sun" },
    { value: 1, label: "Mon" },
    { value: 2, label: "Tue" },
    { value: 3, label: "Wed" },
    { value: 4, label: "Thu" },
    { value: 5, label: "Fri" },
    { value: 6, label: "Sat" }
  ];

  const durationOptions = [15, 30, 45, 60];

function parseVipTimings(vipTimings) {
  if (Array.isArray(vipTimings)) return vipTimings;
  if (typeof vipTimings === "string") {
    return vipTimings.split(",").map((t) => t.trim()).filter(Boolean);
  }
  return [];
}

  // ✅ LOAD DATA FROM DB - FIXED VERSION
  useEffect(() => {
    if (!isOpen) {
      hasInitialized.current = false;
      skipSync.current = false;
      return;
    }

    if (hasInitialized.current) {
      console.log('⚠️ Already initialized, skipping reload');
      return;
    }

    hasInitialized.current = true;
    skipSync.current = true; // Disable sync during initialization

    console.log("🔍 ===== AVAILABILITY MODAL OPENED =====");
    console.log("📦 Raw currentAvailability:", JSON.stringify(currentAvailability, null, 2));

    const cav = currentAvailability || {};

    // STEP 1: Set mode from DB
    const mode = cav.availabilityMode || "default";
    setAvailabilityMode(mode);
    console.log("🔄 Mode from DB:", mode);

    // STEP 2: Appointment duration
    setAppointmentDuration(cav.appointmentDuration || 30);

    // STEP 3: Availability range
    const ar = cav.availabilityRange || {};
    const excludedDays = Array.isArray(ar.excludedWeekdays) ? [...ar.excludedWeekdays] : [];

    setAvailabilityRange({
      startDate: ar.startDate
        ? new Date(ar.startDate).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      endDate: ar.endDate
        ? new Date(ar.endDate).toISOString().split("T")[0]
        : "",
      excludedWeekdays: excludedDays
    });

    // STEP 4: Load time ranges based on mode
    if (Array.isArray(cav.dailyTimeRanges) && cav.dailyTimeRanges.length > 0) {
      console.log("📊 Raw dailyTimeRanges from DB:", cav.dailyTimeRanges);

      if (mode === "custom") {
        // ✅ Custom mode: Build schedule from DB
        console.log("📊 Loading CUSTOM schedule from DB");
        const parsedSchedule = {
          0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: []
        };

        // ✅ Parse each range with day field
        cav.dailyTimeRanges.forEach(r => {
          if (r.day !== undefined && r.day >= 0 && r.day <= 6) {
            parsedSchedule[r.day].push({
              start: r.start || "09:00",
              end: r.end || "17:00",
              isOnline: Boolean(r.isOnline),
              vipSlots: r.vipSlots !== undefined ? r.vipSlots : 0,
              vipTimings: r.vipTimings || []
            });
            console.log(`✅ Added range to day ${r.day}:`, r.start, '-', r.end, 'isOnline:', Boolean(r.isOnline));
          }
        });

        console.log("✅ Final parsed custom schedule:", parsedSchedule);
        setCustomDailySchedule(parsedSchedule);

        // ✅ Set default ranges from first available day (for mode switching)
        const firstDayWithRanges = Object.values(parsedSchedule).find(arr => arr.length > 0);
        if (firstDayWithRanges && firstDayWithRanges.length > 0) {
          setDailyTimeRanges(firstDayWithRanges.map(r => ({ ...r })));
          console.log("✅ Set default ranges from first working day:", firstDayWithRanges);
        } else {
          setDailyTimeRanges([{ start: "09:00", end: "17:00", isOnline: false, vipSlots: 0, vipTimings: [] }]);
        }

      } else {
        // ✅ Default mode: Load ranges without day field
        console.log("📅 Loading DEFAULT mode from DB");
        const ranges = cav.dailyTimeRanges
          .filter(r => r.day === undefined)
          .map(r => ({
            start: r.start || "09:00",
            end: r.end || "17:00",
            isOnline: Boolean(r.isOnline),
            vipSlots: r.vipSlots !== undefined ? r.vipSlots : 0,
            vipTimings: r.vipTimings || []
          }));

        if (ranges.length > 0) {
          setDailyTimeRanges(ranges);
          console.log("✅ Default ranges loaded:", ranges);
        } else {
          setDailyTimeRanges([{ start: "09:00", end: "17:00", isOnline: false, vipSlots: 0, vipTimings: [] }]);
        }

        // ✅ Build custom schedule from default + excludedWeekdays
        const newCustomSchedule = {};
        weekdays.forEach(day => {
          if (excludedDays.includes(day.value)) {
            newCustomSchedule[day.value] = [];
          } else {
            newCustomSchedule[day.value] = ranges.length > 0
              ? ranges.map(r => ({ ...r }))
              : [{ start: "09:00", end: "17:00", isOnline: false, vipSlots: 0, vipTimings: [] }];
          }
        });
        setCustomDailySchedule(newCustomSchedule);
        console.log("✅ Built custom schedule from default:", newCustomSchedule);
      }
    } else {
      // No data in DB - set defaults
      console.log("⚠️ No dailyTimeRanges in DB, using defaults");
      setDailyTimeRanges([{ start: "09:00", end: "17:00", isOnline: false, vipSlots: 0, vipTimings: [] }]);

      const defaultSchedule = {};
      weekdays.forEach(day => {
        if (excludedDays.includes(day.value)) {
          defaultSchedule[day.value] = [];
        } else {
          defaultSchedule[day.value] = [{ start: "09:00", end: "17:00", isOnline: false, vipSlots: 0, vipTimings: [] }];
        }
      });
      setCustomDailySchedule(defaultSchedule);
    }

    setError("");
    console.log("✅ Modal initialized - enabling sync");

    // ✅ Re-enable sync after a short delay to ensure all state is set
    setTimeout(() => {
      skipSync.current = false;
    }, 100);

  }, [isOpen, currentAvailability]);

  // ✅ SYNC: When dailyTimeRanges change in default mode, update custom schedule
  useEffect(() => {
    if (!hasInitialized.current || skipSync.current) return;
    if (availabilityMode !== "default") return;

    console.log("🔄 Syncing default → custom");
    const newCustomSchedule = {};
    weekdays.forEach(day => {
      if (availabilityRange.excludedWeekdays.includes(day.value)) {
        newCustomSchedule[day.value] = [];
      } else {
        newCustomSchedule[day.value] = dailyTimeRanges.map(r => ({ ...r }));
      }
    });
    setCustomDailySchedule(newCustomSchedule);
  }, [dailyTimeRanges, availabilityMode]);

  // ✅ SYNC: When excludedWeekdays change in default mode, update custom schedule
  useEffect(() => {
    if (!hasInitialized.current || skipSync.current) return;
    if (availabilityMode !== "default") return;

    console.log("🔄 Syncing excludedWeekdays → custom");
    setCustomDailySchedule(prev => {
      const updated = { ...prev };
      weekdays.forEach(day => {
        if (availabilityRange.excludedWeekdays.includes(day.value)) {
          updated[day.value] = [];
        } else if (updated[day.value].length === 0) {
          updated[day.value] = dailyTimeRanges.map(r => ({ ...r }));
        }
      });
      return updated;
    });
  }, [availabilityRange.excludedWeekdays, availabilityMode]);

  // ✅ SYNC: When custom schedule changes, update excludedWeekdays
  useEffect(() => {
    if (!hasInitialized.current || skipSync.current) return;
    if (availabilityMode !== "custom") return;

    console.log("🔄 Syncing custom → excludedWeekdays");
    const newExcluded = [];
    weekdays.forEach(day => {
      const ranges = customDailySchedule[day.value] || [];
      if (ranges.length === 0) {
        newExcluded.push(day.value);
      }
    });
    setAvailabilityRange(prev => ({
      ...prev,
      excludedWeekdays: newExcluded.sort((a, b) => a - b)
    }));
  }, [customDailySchedule, availabilityMode]);

  const handleModeSwitch = (newMode) => {
    if (newMode === availabilityMode) {
      return;
    }

    console.log(`🔄 Switching: ${availabilityMode} → ${newMode}`);
    setAvailabilityMode(newMode);

    if (newMode === "default") {
      const mondayRanges = customDailySchedule[1];
      if (mondayRanges && mondayRanges.length > 0) {
        setDailyTimeRanges(mondayRanges.map(r => ({ ...r })));
      } else {
        let foundRanges = null;
        for (let day of weekdays) {
          const ranges = customDailySchedule[day.value];
          if (ranges && ranges.length > 0) {
            foundRanges = ranges;
            break;
          }
        }
        if (foundRanges) {
          setDailyTimeRanges(foundRanges.map(r => ({ ...r })));
        }
      }
    }
  };

  const formatTime12h = (timeStr) => {
    if (!timeStr) return "";
    const [hStr, mStr] = timeStr.split(":");
    let h = parseInt(hStr, 10);
    if (isNaN(h)) return timeStr;
    const m = mStr || "00";
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h.toString().padStart(2, "0")}:${m} ${ampm}`;
  };

  const generateClinicSlots = (startStr, endStr, duration = appointmentDuration) => {
    if (!startStr || !endStr) return [];
    const step = Number(duration) || 30;
    const [sH, sM] = startStr.split(":").map(Number);
    const [eH, eM] = endStr.split(":").map(Number);

    const startMins = sH * 60 + (sM || 0);
    let endMins = eH * 60 + (eM || 0);
    if (endMins <= startMins) endMins = startMins + 240;

    const slots = [];
    let current = startMins;

    // Limit calendar slots strictly to clinic hours using configured appointment duration
    while (current < endMins) {
      let next = Math.min(current + step, endMins);
      if (next === current) break;

      const curH = Math.floor(current / 60).toString().padStart(2, "0");
      const curM = (current % 60).toString().padStart(2, "0");
      const nxtH = Math.floor(next / 60).toString().padStart(2, "0");
      const nxtM = (next % 60).toString().padStart(2, "0");

      const timeStart = `${curH}:${curM}`;
      const timeEnd = `${nxtH}:${nxtM}`;

      slots.push({
        start: timeStart,
        end: timeEnd,
        label: `${formatTime12h(timeStart)} - ${formatTime12h(timeEnd)}`
      });

      current = next;
    }

    return slots;
  };

  const openOnlinePicker = (dayValue = null, dayLabel = "Daily") => {
    let clinicStart = "09:00";
    let clinicEnd = "17:00";

    const targetRanges = dayValue === null
      ? dailyTimeRanges
      : (customDailySchedule[dayValue] || []);

    const inPerson = targetRanges.filter(r => !r.isOnline);
    if (inPerson.length > 0) {
      const starts = inPerson.map(r => r.start).sort();
      const ends = inPerson.map(r => r.end).sort();
      clinicStart = starts[0];
      clinicEnd = ends[ends.length - 1];
    } else {
      const defaultInPerson = dailyTimeRanges.filter(r => !r.isOnline);
      if (defaultInPerson.length > 0) {
        const starts = defaultInPerson.map(r => r.start).sort();
        const ends = defaultInPerson.map(r => r.end).sort();
        clinicStart = starts[0];
        clinicEnd = ends[ends.length - 1];
      }
    }

    const allSlots = generateClinicSlots(clinicStart, clinicEnd, appointmentDuration);
    const onlineRanges = targetRanges.filter(r => r.isOnline);

    const preselectedKeys = [];
    allSlots.forEach(slot => {
      const isOnline = onlineRanges.some(r => slot.start >= r.start && slot.end <= r.end);
      if (isOnline) {
        preselectedKeys.push(slot.start);
      }
    });

    const initialStartTime = preselectedKeys.length > 0 ? preselectedKeys[0] : clinicStart;
    const lastKey = preselectedKeys.length > 0 ? preselectedKeys[preselectedKeys.length - 1] : null;
    const initialEndTime = lastKey
      ? (allSlots.find(s => s.start === lastKey)?.end || clinicEnd)
      : clinicEnd;

    if (dayValue !== null) {
      setExpandedDays(prev => ({ ...prev, [dayValue]: true }));
    }

    setOnlinePickerModal({
      isOpen: true,
      dayValue,
      dayLabel,
      clinicStart,
      clinicEnd,
      startTime: initialStartTime,
      endTime: initialEndTime,
      selectedSlotKeys: preselectedKeys
    });
  };

  const updateScheduleFromPicker = (pickerState) => {
    const { dayValue, selectedSlotKeys, startTime, endTime } = pickerState;

    let newOnlineRanges = [];
    if (selectedSlotKeys && selectedSlotKeys.length > 0) {
      newOnlineRanges = mergeSlotKeysToRanges(selectedSlotKeys, appointmentDuration);
    } else if (startTime && endTime && startTime < endTime) {
      newOnlineRanges = [{ start: startTime, end: endTime, isOnline: true, vipSlots: 0, vipTimings: [] }];
    }

    if (dayValue === null) {
      setDailyTimeRanges(prev => {
        const filtered = prev.filter(r => !r.isOnline);
        return [...filtered, ...newOnlineRanges];
      });
    } else {
      setCustomDailySchedule(prev => {
        const dayRanges = prev[dayValue] || [];
        const filtered = dayRanges.filter(r => !r.isOnline);
        return {
          ...prev,
          [dayValue]: [...filtered, ...newOnlineRanges]
        };
      });
    }
  };

  const handleOnlinePickerSlotClick = (slotKey) => {
    setOnlinePickerModal(prev => {
      const currentKeys = new Set(prev.selectedSlotKeys || []);
      if (currentKeys.has(slotKey)) {
        currentKeys.delete(slotKey);
      } else {
        currentKeys.add(slotKey);
      }
      const updatedKeys = Array.from(currentKeys).sort();

      const allSlots = generateClinicSlots(prev.clinicStart, prev.clinicEnd, appointmentDuration);
      const firstSlot = updatedKeys.length > 0 ? updatedKeys[0] : prev.clinicStart;
      const lastKey = updatedKeys.length > 0 ? updatedKeys[updatedKeys.length - 1] : prev.clinicEnd;
      const lastSlotEnd = allSlots.find(s => s.start === lastKey)?.end || lastKey;

      const nextState = {
        ...prev,
        selectedSlotKeys: updatedKeys,
        startTime: firstSlot,
        endTime: lastSlotEnd
      };

      updateScheduleFromPicker(nextState);
      return nextState;
    });
  };

  const mergeSlotKeysToRanges = (selectedKeys, duration = appointmentDuration) => {
    if (!selectedKeys || selectedKeys.length === 0) return [];

    const step = Number(duration) || 15;

    const slotMins = selectedKeys
      .map(t => {
        const [h, m] = t.split(":").map(Number);
        return h * 60 + (m || 0);
      })
      .sort((a, b) => a - b);

    return slotMins.map(startMins => {
      const endMins = startMins + step;
      const sH = Math.floor(startMins / 60).toString().padStart(2, "0");
      const sM = (startMins % 60).toString().padStart(2, "0");
      const eH = Math.floor(endMins / 60).toString().padStart(2, "0");
      const eM = (endMins % 60).toString().padStart(2, "0");
      return {
        start: `${sH}:${sM}`,
        end: `${eH}:${eM}`,
        isOnline: true,
        vipSlots: 0,
        vipTimings: []
      };
    });
  };

  const confirmOnlineShift = () => {
    updateScheduleFromPicker(onlinePickerModal);
    setOnlinePickerModal(prev => ({ ...prev, isOpen: false }));
  };

  const addTimeRange = (isOnline = false) => {
    setDailyTimeRanges(prev => [...prev, { start: "09:00", end: "17:00", isOnline: Boolean(isOnline), vipSlots: 0, vipTimings: [] }]);
  };

  const removeTimeRange = (index) => {
    setDailyTimeRanges(prev => prev.filter((_, i) => i !== index));
  };

  const updateTimeRange = (index, field, value) => {
    setDailyTimeRanges(prev =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  };

  const addCustomTimeRange = (day, isOnline = false) => {
    setCustomDailySchedule(prev => ({
      ...prev,
      [day]: [...(prev[day] || []), { start: "09:00", end: "17:00", isOnline: Boolean(isOnline), vipSlots: 0, vipTimings: [] }]
    }));
  };

  const removeCustomTimeRange = (day, idx) => {
    setCustomDailySchedule(prev => ({
      ...prev,
      [day]: prev[day].filter((_, i) => i !== idx)
    }));
  };

  const updateCustomTimeRange = (day, idx, field, value) => {
    setCustomDailySchedule(prev => ({
      ...prev,
      [day]: prev[day].map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    }));
  };

  const toggleWeekday = (day) => {
    setAvailabilityRange(prev => {
      const excluded = [...(prev.excludedWeekdays || [])];
      const idx = excluded.indexOf(day);
      if (idx > -1) {
        excluded.splice(idx, 1);
      } else {
        excluded.push(day);
      }
      excluded.sort((a, b) => a - b);
      return { ...prev, excludedWeekdays: excluded };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setError("Authentication required");
        setLoading(false);
        return;
      }

      let ranges = [];

      if (availabilityMode === "default") {
        ranges = dailyTimeRanges.map(r => ({
          start: r.start,
          end: r.end,
          isOnline: Boolean(r.isOnline),
          vipSlots: r.vipSlots !== undefined ? Number(r.vipSlots) : 0,
          vipTimings: parseVipTimings(r.vipTimings)
        }));
      } else {
        for (let day = 0; day <= 6; day++) {
          const dayRanges = customDailySchedule[day] || [];
          dayRanges.forEach(r => {
            ranges.push({
              day: day,
              start: r.start,
              end: r.end,
              isOnline: Boolean(r.isOnline),
              vipSlots: r.vipSlots !== undefined ? Number(r.vipSlots) : 0,
              vipTimings: parseVipTimings(r.vipTimings)
            });
          });
        }
      }

      const payload = {
        availabilityMode,
        dailyTimeRanges: ranges,
        availabilityRange: {
          startDate: availabilityRange.startDate || null,
          endDate: availabilityRange.endDate || null,
          excludedWeekdays: availabilityRange.excludedWeekdays || []
        },
        appointmentDuration: Number(appointmentDuration)
      };

      console.log("📤 Submitting payload:", JSON.stringify(payload, null, 2));

      const apiBase = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
      const endpoint = saveUrl || `${apiBase}/api/doctor/availability`;

      const response = await fetch(endpoint, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to update availability");
      }

      console.log("✅ Server response:", data);

      await Swal.fire({
        icon: "success",
        title: "Availability Updated!",
        text: doctorName
          ? `Dr. ${doctorName}'s availability settings have been saved successfully.`
          : "Your availability settings have been saved successfully.",
        iconColor: "#10b981",
        customClass: {
          popup: "rounded-3xl border border-[#134e97]/10 shadow-2xl p-6 sm:p-8 font-body",
          title: "text-lg sm:text-xl font-heading font-extrabold text-slate-800 tracking-tight mb-2",
          htmlContainer: "text-xs sm:text-sm text-slate-500 font-body leading-relaxed mb-6",
          confirmButton: "bg-gradient-to-r from-[#134e97] to-[#013473] text-white font-body text-xs font-bold rounded-full px-6 py-3 border-0 transition-all duration-300 hover:scale-102 cursor-pointer shadow-md shadow-[#134e97]/10 outline-none",
        },
        buttonsStyling: false,
        backdrop: "rgba(19, 78, 151, 0.15)",
      });

      onClose();
      if (onSuccess) onSuccess();

    } catch (err) {
      console.error("❌ Error:", err);
      setError(err.message || "Failed to update availability");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-3 sm:p-6 overflow-y-auto animate-fadeIn">
      <div
        className={`w-full transition-all duration-300 flex flex-col lg:flex-row items-center lg:items-stretch justify-center gap-5 my-auto ${
          onlinePickerModal.isOpen ? "max-w-6xl" : "max-w-3xl"
        }`}
      >
        {/* Left Window: Main Update Availability Form */}
        <div
          role="dialog"
          aria-modal="true"
          className="bg-white rounded-3xl border border-white/20 shadow-2xl shadow-[#134e97]/10 w-full flex-1 max-h-[90vh] overflow-hidden flex flex-col transition-all duration-300"
        >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#134e97]/10 rounded-2xl flex items-center justify-center text-[#134e97] shadow-inner">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-heading text-[#134e97] tracking-tight leading-tight font-normal">
                {doctorName ? `Dr. ${doctorName} — Availability` : "Update Availability"}
              </h2>
              <p className="text-xxs sm:text-xs text-slate-500 font-body mt-0.5 font-normal">
                {doctorName
                  ? "Set clinical shifts and appointment times for this doctor"
                  : "Establish clinical shifts and appointment times"}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center hover:bg-red-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-red-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 overflow-auto" style={{ maxHeight: "calc(90vh - 76px)" }}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-2xl text-xs sm:text-sm mb-4 font-body font-normal">
              {error}
            </div>
          )}

          {/* Appointment Duration */}
          <div className="mb-5 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
            <label className="block text-xs font-body uppercase tracking-wider text-slate-500 mb-2.5 font-normal">
              Appointment Duration
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {durationOptions.map((duration) => (
                <button
                  key={duration}
                  type="button"
                  onClick={() => setAppointmentDuration(duration)}
                  className={`py-2.5 px-3 rounded-full text-xs font-body transition-all text-center border cursor-pointer font-normal ${appointmentDuration === duration
                    ? "bg-gradient-to-r from-[#134e97] to-[#013473] text-white border-transparent shadow-sm shadow-[#134e97]/25"
                    : "bg-white text-slate-600 border-slate-200 hover:border-[#134e97]/40 hover:bg-slate-50"
                    }`}
                >
                  {duration} min
                </button>
              ))}
            </div>
          </div>


          {/* Mode Toggle */}
          <div className="mb-5 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
            <label className="block text-xs font-body uppercase tracking-wider text-slate-500 mb-2.5 font-normal">
              Availability Type
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleModeSwitch("default")}
                className={`py-2.5 px-3 rounded-full text-xs font-body transition-all text-center border cursor-pointer font-normal ${availabilityMode === "default"
                  ? "bg-gradient-to-r from-[#134e97] to-[#013473] text-white border-transparent shadow-sm shadow-[#134e97]/25"
                  : "bg-white text-slate-600 border-slate-200 hover:border-[#134e97]/40 hover:bg-slate-50"
                  }`}
              >
                Default (Same every day)
              </button>
              <button
                type="button"
                onClick={() => handleModeSwitch("custom")}
                className={`py-2.5 px-3 rounded-full text-xs font-body transition-all text-center border cursor-pointer font-normal ${availabilityMode === "custom"
                  ? "bg-gradient-to-r from-[#134e97] to-[#013473] text-white border-transparent shadow-sm shadow-[#134e97]/25"
                  : "bg-white text-slate-600 border-slate-200 hover:border-[#134e97]/40 hover:bg-slate-50"
                  }`}
              >
                Custom (Per day)
              </button>
            </div>
          </div>

          {/* Consultation Mode Selector (In-Person vs Online) */}
          <div className="mb-5 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/80 font-body">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-body uppercase tracking-wider text-slate-500 font-normal">
                Consultation Mode
              </label>
              <span className="text-[11px] text-slate-400 font-body">Switch mode to configure schedule timings</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setConsultationType("inPerson")}
                className={`py-2.5 px-3 rounded-xl text-xs font-body font-medium transition-all flex items-center justify-center gap-2 border cursor-pointer ${
                  consultationType === "inPerson"
                    ? "bg-[#134e97] text-white border-[#134e97] shadow-sm shadow-[#134e97]/25"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span className="text-sm">🏥</span>
                <span>In-Person Clinic</span>
                {dailyTimeRanges.filter(r => !r.isOnline).length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-bold">
                    {dailyTimeRanges.filter(r => !r.isOnline).length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setConsultationType("online")}
                className={`py-2.5 px-3 rounded-xl text-xs font-body font-medium transition-all flex items-center justify-center gap-2 border cursor-pointer ${
                  consultationType === "online"
                    ? "bg-purple-600 text-white border-purple-600 shadow-sm shadow-purple-500/25"
                    : "bg-white text-purple-700 border-slate-200 hover:bg-purple-50/50"
                }`}
              >
                <Video className="w-3.5 h-3.5" />
                <span>Online Consultation</span>
                {dailyTimeRanges.filter(r => r.isOnline).length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-bold">
                    {dailyTimeRanges.filter(r => r.isOnline).length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Default Mode Shift Hours */}
          {availabilityMode === "default" && (
            <div className="space-y-4 mb-5 font-body">
              <div className="flex items-center justify-between gap-2 pb-1">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                    {consultationType === "inPerson" ? (
                      <><span>🏥</span> In-Person Clinic Hours</>
                    ) : (
                      <><Video className="w-3.5 h-3.5 text-purple-600" /> Online Consultation Hours</>
                    )}
                  </h4>
                  <p className="text-[11px] text-slate-500 font-normal">
                    {consultationType === "inPerson"
                      ? "Shifts applied to all active weekdays for clinic visits"
                      : "Shifts applied to all active weekdays for video meetings"}
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => {
                    if (consultationType === "online") {
                      openOnlinePicker(null, "Daily");
                    } else {
                      addTimeRange(false);
                    }
                  }}
                  size="sm"
                  className={`rounded-full text-xs px-3.5 cursor-pointer font-body font-normal text-white ${
                    consultationType === "inPerson"
                      ? "bg-[#134e97] hover:bg-[#0b5c9b]"
                      : "bg-purple-600 hover:bg-purple-700"
                  }`}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add Shift
                </Button>
              </div>

              <div className="space-y-3">
                {dailyTimeRanges.filter(r => (consultationType === "online" ? r.isOnline : !r.isOnline)).length === 0 ? (
                  <p className="text-xs text-slate-400 italic bg-slate-50/80 p-4 rounded-2xl border border-dashed border-slate-200 text-center font-normal">
                    {consultationType === "inPerson"
                      ? 'No in-person clinic shifts configured. Click "+ Add Shift" to set hours.'
                      : 'No online consultation shifts configured. Click "+ Add Shift" to set hours.'}
                  </p>
                ) : (
                  dailyTimeRanges.map((range, index) => {
                    const isTargetType = consultationType === "online" ? range.isOnline : !range.isOnline;
                    if (!isTargetType) return null;

                    return (
                      <div
                        key={index}
                        className={`p-4 rounded-2xl border transition-all flex flex-col gap-3.5 relative group ${
                          range.isOnline
                            ? "bg-gradient-to-br from-purple-50/50 via-white to-indigo-50/30 border-purple-200/90 shadow-xs"
                            : "bg-gradient-to-br from-slate-50/60 via-white to-sky-50/30 border-slate-200 shadow-xs"
                        }`}
                      >
                        {/* Shift Header Badge */}
                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                          {range.isOnline ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xxs font-bold bg-purple-100 text-purple-700 border border-purple-200">
                              <Video className="w-3 h-3" /> 💻 Online Consultation Shift
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xxs font-bold bg-sky-100 text-[#134e97] border border-sky-200">
                              🏥 In-Person Clinic Shift
                            </span>
                          )}
                        </div>

                        {/* Time Inputs */}
                        <div className="flex gap-3 items-end">
                          <div className="grid grid-cols-2 gap-3 flex-1">
                            <div>
                              <label className="text-xs font-body uppercase tracking-wide text-slate-400 mb-1 block font-normal">
                                Start Time
                              </label>
                              <input
                                type="time"
                                value={range.start}
                                onChange={(e) => updateTimeRange(index, "start", e.target.value)}
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal"
                                required
                              />
                            </div>
                            <div>
                              <label className="text-xs font-body uppercase tracking-wide text-slate-400 mb-1 block font-normal">
                                End Time
                              </label>
                              <input
                                type="time"
                                value={range.end}
                                onChange={(e) => updateTimeRange(index, "end", e.target.value)}
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal"
                                required
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeTimeRange(index)}
                            className="w-9 h-9 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl flex items-center justify-center transition-colors cursor-pointer shrink-0"
                            title="Remove Shift"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* VIP Fields */}
                        {showVipFields && (
                          <>
                            <div className="flex gap-3 items-end pt-1">
                              <div className="w-28">
                                <label className="text-xs font-body uppercase tracking-wide text-slate-400 mb-1 block font-normal whitespace-nowrap">
                                  VIP Slots Count
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  max="20"
                                  value={range.vipSlots !== undefined ? range.vipSlots : 0}
                                  onChange={(e) => updateTimeRange(index, "vipSlots", Math.max(0, parseInt(e.target.value, 10) || 0))}
                                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal"
                                />
                              </div>
                              <div className="flex-1">
                                <label className="text-xs font-body uppercase tracking-wide text-slate-400 mb-1 block font-normal">
                                  Specific VIP Timings (e.g. 10:30, 14:00)
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g. 10:30, 14:00"
                                  value={Array.isArray(range.vipTimings) ? range.vipTimings.join(", ") : (range.vipTimings || "")}
                                  onChange={(e) => updateTimeRange(index, "vipTimings", e.target.value)}
                                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal"
                                />
                              </div>
                            </div>
                            <p className="text-slate-400 font-body -mt-1 leading-normal" style={{ fontSize: '9px' }}>
                              * Use <strong>VIP Slots Count</strong> to distribute slots evenly, OR specify exact times in <strong>Specific VIP Timings</strong>. If both are set, they combine.
                            </p>
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Custom Mode Shift Hours */}
          {availabilityMode === "custom" && (
            <div className="mb-5 space-y-4 font-body">
              <label className="block text-xs font-body uppercase tracking-wider text-slate-500 mb-1 font-normal">
                Custom Working Hours ({consultationType === "inPerson" ? "In-Person Clinic" : "Online Consultation"})
              </label>
              {weekdays.map((day) => {
                const ranges = customDailySchedule[day.value] || [];
                const filteredRanges = ranges.map((r, i) => ({ ...r, originalIndex: i })).filter(r => (consultationType === "online" ? r.isOnline : !r.isOnline));
                const isExpanded = Boolean(expandedDays[day.value]);

                return (
                  <div key={day.value} className="border border-slate-200/90 rounded-2xl bg-white shadow-2xs overflow-hidden transition-all duration-200">
                    {/* Day Header Accordion */}
                    <div
                      onClick={() => toggleDayExpanded(day.value)}
                      className="flex items-center justify-between p-3.5 sm:p-4 bg-slate-50/70 hover:bg-slate-100/80 transition-colors cursor-pointer select-none gap-2"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`p-1.5 rounded-lg text-slate-600 transition-transform duration-200 ${isExpanded ? "bg-slate-200 text-slate-800" : "bg-slate-100"}`}>
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                            📅 {day.label} {consultationType === "inPerson" ? "In-Person" : "Online"} Schedule
                          </span>
                          <span className={`text-xxs font-semibold px-2 py-0.5 rounded-full font-body ${
                            filteredRanges.length === 0 
                              ? "bg-slate-100 text-slate-500" 
                              : consultationType === "online" ? "bg-purple-100 text-purple-700 font-bold" : "bg-sky-100 text-[#134e97] font-bold"
                          }`}>
                            {filteredRanges.length === 0 ? "No shifts" : `${filteredRanges.length} shift(s)`}
                          </span>
                        </div>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={`text-xxs rounded-full px-3 cursor-pointer font-body ${
                          consultationType === "inPerson"
                            ? "border-sky-200 text-[#134e97] hover:bg-sky-50"
                            : "border-purple-200 text-purple-700 bg-purple-50/50 hover:bg-purple-100"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedDays(prev => ({ ...prev, [day.value]: true }));
                          if (consultationType === "online") {
                            openOnlinePicker(day.value, day.label);
                          } else {
                            addCustomTimeRange(day.value, false);
                          }
                        }}
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Add Shift
                      </Button>
                    </div>

                    {/* Shifts List for Day */}
                    {isExpanded && (
                      <div className="p-3.5 sm:p-4 pt-2 border-t border-slate-100 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                        {filteredRanges.length === 0 ? (
                          <p className="text-xs text-slate-400 italic bg-slate-50/70 p-3 rounded-xl border border-dashed border-slate-200 text-center font-normal">
                            No {consultationType === "inPerson" ? "in-person" : "online"} shifts configured for {day.label}
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {filteredRanges.map(({ originalIndex, ...range }) => (
                              <div
                                key={originalIndex}
                                className={`p-3.5 rounded-xl border transition-all flex flex-col gap-3 font-body ${
                                  range.isOnline
                                    ? "bg-gradient-to-br from-purple-50/50 via-white to-indigo-50/30 border-purple-200/90 shadow-xs"
                                    : "bg-gradient-to-br from-slate-50/60 via-white to-sky-50/30 border-slate-200 shadow-xs"
                                }`}
                              >
                                {/* Type Header Badge */}
                                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                                  {range.isOnline ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xxs font-bold bg-purple-100 text-purple-700 border border-purple-200">
                                      <Video className="w-3 h-3" /> 💻 Online Consultation
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xxs font-bold bg-sky-100 text-[#134e97] border border-sky-200">
                                      🏥 In-Person Clinic
                                    </span>
                                  )}
                                </div>

                                {/* Inputs */}
                                <div className="flex gap-3 items-end">
                                  <div className="grid grid-cols-2 gap-3 flex-1">
                                    <div>
                                      <label className="text-xs font-body uppercase tracking-wide text-slate-400 mb-1 block font-normal">
                                        Start Time
                                      </label>
                                      <input
                                        type="time"
                                        value={range.start}
                                        onChange={(e) => updateCustomTimeRange(day.value, originalIndex, "start", e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal"
                                        required
                                      />
                                    </div>
                                    <div>
                                      <label className="text-xs font-body uppercase tracking-wide text-slate-400 mb-1 block font-normal">
                                        End Time
                                      </label>
                                      <input
                                        type="time"
                                        value={range.end}
                                        onChange={(e) => updateCustomTimeRange(day.value, originalIndex, "end", e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal"
                                        required
                                      />
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeCustomTimeRange(day.value, originalIndex)}
                                    className="w-9 h-9 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl flex items-center justify-center transition-colors cursor-pointer shrink-0"
                                    title="Remove Shift"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>

                                {/* VIP Fields */}
                                {showVipFields && (
                                  <div className="flex gap-3 items-end pt-1">
                                    <div className="w-28">
                                      <label className="text-xs font-body uppercase tracking-wide text-slate-400 mb-1 block font-normal whitespace-nowrap">
                                        VIP Slots Count
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        max="20"
                                        value={range.vipSlots !== undefined ? range.vipSlots : 0}
                                        onChange={(e) => updateCustomTimeRange(day.value, originalIndex, "vipSlots", Math.max(0, parseInt(e.target.value, 10) || 0))}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal"
                                      />
                                    </div>
                                    <div className="flex-1">
                                      <label className="text-xs font-body uppercase tracking-wide text-slate-400 mb-1 block font-normal">
                                        Specific VIP Timings
                                      </label>
                                      <input
                                        type="text"
                                        placeholder="e.g. 10:30, 14:00"
                                        value={Array.isArray(range.vipTimings) ? range.vipTimings.join(", ") : (range.vipTimings || "")}
                                        onChange={(e) => updateCustomTimeRange(day.value, originalIndex, "vipTimings", e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Availability Period */}
          <div className="mb-5 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
            <label className="block text-xs font-body uppercase tracking-wider text-slate-500 mb-2.5 font-normal">
              Availability Period
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-body uppercase tracking-wide text-slate-400 mb-1 block font-normal font-normal">Start Date</label>
                <input
                  type="date"
                  value={availabilityRange.startDate}
                  onChange={(e) => setAvailabilityRange(prev => ({ ...prev, startDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-body uppercase tracking-wide text-slate-400 mb-1 block font-normal font-normal font-normal">End Date (Optional)</label>
                <input
                  type="date"
                  value={availabilityRange.endDate}
                  onChange={(e) => setAvailabilityRange(prev => ({ ...prev, endDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal"
                />
              </div>
            </div>
          </div>

          {/* Working Days - Always visible */}
          <div className="mb-5 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
            <label className="block text-xs font-body uppercase tracking-wider text-slate-500 mb-2.5 font-normal">
              Working Days {availabilityMode === "custom" && <span className="text-xxs text-slate-400 capitalize font-body font-normal">(Auto-synced)</span>}
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {weekdays.map((day) => {
                const isExcluded = availabilityRange.excludedWeekdays.includes(day.value);
                const isDisabled = availabilityMode === "custom";

                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => !isDisabled && toggleWeekday(day.value)}
                    disabled={isDisabled}
                    className={`py-2.5 px-2 rounded-xl text-xs font-body transition-all shadow-xs font-normal ${isExcluded
                      ? "bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-red-500/10"
                      : "bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-emerald-500/10"
                      } ${isDisabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:scale-103"}`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 font-body mt-2.5 font-normal">
              Green = Working • Red = Day Off
            </p>
          </div>

          {/* Actions */}
          <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
              className="w-full sm:w-1/2 border-slate-200 text-slate-700 hover:bg-slate-50 rounded-full font-body text-xs py-3 cursor-pointer transition-all duration-300 hover:scale-102 font-normal"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="w-full sm:w-1/2 bg-gradient-to-r from-[#134e97] to-[#013473] hover:from-[#0b5c9b] hover:to-[#134e97] text-white rounded-full font-body text-xs py-3 shadow-md shadow-[#134e97]/25 cursor-pointer transition-all duration-300 hover:scale-102 flex items-center justify-center font-normal"
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Availability
                </>
              )}
            </Button>
          </div>
        </form>
        </div>

        {/* 💻 Visual Day Calendar & Slot Grid Side Panel (Side by Side) */}
        {onlinePickerModal.isOpen && (
          <div className="bg-white rounded-3xl p-5 sm:p-6 w-full lg:w-[480px] shrink-0 shadow-2xl border border-purple-200/80 space-y-4 max-h-[90vh] overflow-y-auto slide-in-side-panel">
            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-purple-100/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-purple-500/20 ring-4 ring-purple-100">
                  <Video className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-heading font-bold text-slate-900 text-sm sm:text-base tracking-tight">
                    📅 {onlinePickerModal.dayLabel} Video Call Calendar
                  </h4>
                  <p className="text-xxs text-purple-700 font-body mt-0.5 font-medium">
                    Select 15-min slots ({formatTime12h(onlinePickerModal.clinicStart)} – {formatTime12h(onlinePickerModal.clinicEnd)})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOnlinePickerModal(prev => ({ ...prev, isOpen: false }))}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Selection Toolbar */}
            <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-purple-50 via-indigo-50/50 to-purple-50 p-3 rounded-2xl border border-purple-100 text-xs font-body shadow-xs">
              <span className="text-slate-700 font-medium">
                Selected: <strong className="text-purple-700 font-extrabold px-2 py-0.5 bg-purple-100 rounded-md">{(onlinePickerModal.selectedSlotKeys || []).length} slot(s)</strong>
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const allSlots = generateClinicSlots(onlinePickerModal.clinicStart, onlinePickerModal.clinicEnd, appointmentDuration);
                    const allKeys = allSlots.map(s => s.start);
                    const nextState = {
                      ...onlinePickerModal,
                      selectedSlotKeys: allKeys,
                      startTime: allSlots[0]?.start || onlinePickerModal.clinicStart,
                      endTime: allSlots[allSlots.length - 1]?.end || onlinePickerModal.clinicEnd
                    };
                    setOnlinePickerModal(nextState);
                    updateScheduleFromPicker(nextState);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xxs transition-all duration-200 hover:scale-102 active:scale-95 shadow-xs cursor-pointer"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const nextState = {
                      ...onlinePickerModal,
                      selectedSlotKeys: [],
                      startTime: onlinePickerModal.clinicStart,
                      endTime: onlinePickerModal.clinicStart
                    };
                    setOnlinePickerModal(nextState);
                    updateScheduleFromPicker(nextState);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xxs transition-all duration-200 hover:scale-102 active:scale-95 cursor-pointer"
                >
                  Deselect All
                </button>
              </div>
            </div>

            {/* Visual Time Slot Calendar Grid */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/80 max-h-72 overflow-y-auto shadow-inner">
                {generateClinicSlots(onlinePickerModal.clinicStart, onlinePickerModal.clinicEnd, appointmentDuration).map((slot) => {
                  const isSelectedOnline = (onlinePickerModal.selectedSlotKeys || []).includes(slot.start);

                  return (
                    <button
                      key={slot.start}
                      type="button"
                      onClick={() => handleOnlinePickerSlotClick(slot.start)}
                      className={`p-3 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between hover:scale-[1.03] active:scale-95 ${
                        isSelectedOnline
                          ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-purple-600 shadow-md shadow-purple-600/20"
                          : "bg-emerald-100/90 text-emerald-900 border-emerald-300 hover:bg-emerald-200/90 hover:border-emerald-400"
                      }`}
                    >
                      <span className="text-xs font-bold font-body">{slot.label}</span>
                      <span className={`text-[10px] font-semibold font-body mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${
                        isSelectedOnline ? "bg-white/20 text-white" : "bg-emerald-200/80 text-emerald-900"
                      }`}>
                        {isSelectedOnline ? <>📹 Video Call</> : <>🏥 Present Slot</>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Time Readout & Range Inputs */}
            <div className="bg-purple-50/80 p-3.5 rounded-2xl border border-purple-100/80 space-y-3 font-body shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xxs font-bold text-purple-900 uppercase tracking-wider">
                  Selected Video Window
                </span>
                <span className="text-xs font-extrabold text-purple-700 bg-white px-2.5 py-1 rounded-xl border border-purple-200/80 shadow-2xs">
                  {(() => {
                    const keys = onlinePickerModal.selectedSlotKeys || [];
                    if (keys.length === 0) return "No slots selected";
                    const ranges = mergeSlotKeysToRanges(keys, appointmentDuration);
                    if (ranges.length === 1) {
                      return `${formatTime12h(ranges[0].start)} – ${formatTime12h(ranges[0].end)} (${keys.length} slots)`;
                    }
                    return `${ranges.length} shifts: ${ranges.map(r => `${formatTime12h(r.start)}–${formatTime12h(r.end)}`).join(", ")}`;
                  })()}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-xxs font-medium text-slate-600 block mb-1">Start Time</label>
                  <input
                    type="time"
                    value={onlinePickerModal.startTime}
                    onChange={(e) => {
                      const nextState = { ...onlinePickerModal, startTime: e.target.value };
                      setOnlinePickerModal(nextState);
                      updateScheduleFromPicker(nextState);
                    }}
                    className="w-full text-xs font-body p-2 rounded-xl border border-purple-200 bg-white text-slate-800 outline-none focus:ring-2 focus:ring-purple-500/20 transition-all"
                  />
                </div>
                <div>
                  <label className="text-xxs font-medium text-slate-600 block mb-1">End Time</label>
                  <input
                    type="time"
                    value={onlinePickerModal.endTime}
                    onChange={(e) => {
                      const nextState = { ...onlinePickerModal, endTime: e.target.value };
                      setOnlinePickerModal(nextState);
                      updateScheduleFromPicker(nextState);
                    }}
                    className="w-full text-xs font-body p-2 rounded-xl border border-purple-200 bg-white text-slate-800 outline-none focus:ring-2 focus:ring-purple-500/20 transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                onClick={() => setOnlinePickerModal(prev => ({ ...prev, isOpen: false }))}
                variant="outline"
                className="w-1/2 rounded-full border-slate-200 text-slate-700 hover:bg-slate-100 text-xs py-3 font-body font-semibold cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={confirmOnlineShift}
                className="w-1/2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-full text-xs py-3 font-body font-semibold shadow-lg shadow-purple-600/25 hover:shadow-purple-600/40 cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95"
              >
                Confirm & Add Shift
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AvailabilityModal;