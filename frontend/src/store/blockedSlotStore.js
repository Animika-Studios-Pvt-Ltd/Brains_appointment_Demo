import { create } from 'zustand';
import { getApiOrigin } from '../utils/api';

const getBaseUrl = () => {
  try {
    return getApiOrigin();
  } catch {
    return (import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');
  }
};

export const useBlockedSlotStore = create((set, get) => ({
  blockedSlots: [],
  loading: false,

  fetchBlockedSlots: async (doctorId) => {
    set({ loading: true });
    try {
      const token = localStorage.getItem('token');
      const origin = getBaseUrl();
      const response = await fetch(`${origin}/api/blocked-slots/doctor/${doctorId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to fetch blocked slots (HTTP ${response.status}):`, errorText);
        set({ loading: false });
        return { success: false, message: `Server error (${response.status})` };
      }
      const data = await response.json();
      set({ blockedSlots: data.data || [], loading: false });
      return data;
    } catch (error) {
      console.error('Failed to fetch blocked slots:', error);
      set({ loading: false });
      return { success: false, message: error.message || 'Failed to fetch' };
    }
  },

  createBlockedSlot: async (slotData) => {
    set({ loading: true });
    try {
      const token = localStorage.getItem('token');
      const origin = getBaseUrl();
      const response = await fetch(`${origin}/api/blocked-slots`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(slotData)
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to create blocked slot (HTTP ${response.status}):`, errorText);
        set({ loading: false });
        return { success: false, message: `Server error (${response.status})` };
      }
      const data = await response.json();
      set({ loading: false });
      return data;
    } catch (error) {
      console.error('Failed to create blocked slot:', error);
      set({ loading: false });
      return { success: false, message: error.message || 'Create failed' };
    }
  },

  updateBlockedSlot: async (slotId, updateData) => {
    set({ loading: true });
    try {
      const token = localStorage.getItem('token');
      const origin = getBaseUrl();
      const res = await fetch(`${origin}/api/blocked-slots/${slotId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`Failed to update blocked slot (HTTP ${res.status}):`, errorText);
        set({ loading: false });
        return { success: false, message: `Server error (${res.status})` };
      }
      const data = await res.json();
      if (data && data.success) {
        const doctorId = (data.data && data.data.doctorId) || updateData.doctorId;
        if (doctorId) get().fetchBlockedSlots(doctorId);
      }
      set({ loading: false });
      return data;
    } catch (error) {
      console.error('Failed to update blocked slot:', error);
      set({ loading: false });
      return { success: false, message: error.message || 'Update failed' };
    }
  },

  deleteBlockedSlot: async (slotId) => {
    set({ loading: true });
    try {
      const token = localStorage.getItem('token');
      const origin = getBaseUrl();
      const res = await fetch(`${origin}/api/blocked-slots/${slotId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        }
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`Failed to delete blocked slot (HTTP ${res.status}):`, errorText);
        set({ loading: false });
        return { success: false, message: `Server error (${res.status})` };
      }
      const data = await res.json();
      if (data && data.success && data.data && data.data.doctorId) {
        get().fetchBlockedSlots(data.data.doctorId);
      } else {
        // If backend returns just the deleted object without doctorId, refresh current logged in doctor slots
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        if (user && user._id) get().fetchBlockedSlots(user._id);
      }
      set({ loading: false });
      return data;
    } catch (error) {
      console.error('Failed to delete blocked slot:', error);
      set({ loading: false });
      return { success: false, message: error.message || 'Delete failed' };
    }
  },

  getBlockedIntervalsForDate: (ymd, doctorWorkingHours) => {
    const slots = get().blockedSlots || [];
    const dayStart = new Date(`${ymd}T00:00:00`);
    const dayEnd = new Date(`${ymd}T23:59:59.999`);
    let totalBlockedMs = 0;

    const intervals = slots
      .map(slot => {
        const s = slot.startTime ? new Date(slot.startTime) : null;
        const e = slot.endTime ? new Date(slot.endTime) : null;
        if (!s || !e || Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
        if (e < dayStart || s > dayEnd) return null;
        const clippedStart = s < dayStart ? new Date(dayStart) : s;
        const clippedEnd = e > dayEnd ? new Date(dayEnd) : e;
        totalBlockedMs += clippedEnd - clippedStart;
        return {
          _id: slot._id,
          startTime: clippedStart.toISOString(),
          endTime: clippedEnd.toISOString(),
          reason: slot.reason || "Blocked"
        };
      })
      .filter(Boolean);

    let workingDurationMs = 0;
    if (doctorWorkingHours?.start && doctorWorkingHours?.end) {
      const workStart = new Date(`${ymd}T${doctorWorkingHours.start}`);
      const workEnd = new Date(`${ymd}T${doctorWorkingHours.end}`);
      if (!Number.isNaN(workStart.getTime()) && !Number.isNaN(workEnd.getTime()) && workEnd > workStart) {
        workingDurationMs = workEnd - workStart;
      }
    }

    if (workingDurationMs > 0 && totalBlockedMs >= workingDurationMs) {
      return [{
        startTime: dayStart.toISOString(),
        endTime: dayEnd.toISOString(),
        reason: "Blocked (Full day due to excessive blocked intervals)"
      }];
    } else {
      return intervals;
    }
  },

  createMassBlockedSlot: async ({ startTime, endTime, reason, doctorIds, autoReschedule = true, sendGoogleSync = true }) => {
    set({ loading: true });
    try {
      const token = localStorage.getItem('token');
      const origin = getBaseUrl();
      const res = await fetch(`${origin}/api/blocked-slots/mass`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ startTime, endTime, reason, doctorIds, autoReschedule, sendGoogleSync })
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`Mass create failed (HTTP ${res.status}):`, errorText);
        set({ loading: false });
        return { success: false, message: `Server error (${res.status})` };
      }
      const data = await res.json();
      set({ loading: false });
      return data;
    } catch (err) {
      console.error('Mass create failed', err);
      set({ loading: false });
      return { success: false, message: err.message || 'Mass create failed' };
    }
  },

}));
