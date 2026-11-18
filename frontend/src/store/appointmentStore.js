import { create } from 'zustand';

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

export const useAppointmentStore = create((set, get) => ({
  // State
  appointments: [],
  currentAppointment: null,
  loading: false,
  error: null,

  // ========== BOOK APPOINTMENT (MISSING FUNCTION - ADDED) ==========
  bookAppointment: async (appointmentData) => {
    set({ loading: true, error: null });
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error("No authentication token found");
      }

      console.log('📅 Booking appointment:', appointmentData);

      const response = await fetch(`${BACKEND}/api/appointment/book`, {
        method: 'POST', // ← CRITICAL: Must be POST
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(appointmentData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Failed to book appointment: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ Appointment booked:', data);

      // Add new appointment to state
      set((state) => ({
        appointments: [...state.appointments, data.data],
        loading: false,
        error: null
      }));

      return data;
    } catch (error) {
      console.error('❌ Error booking appointment:', error);
      set({
        error: error.message,
        loading: false
      });
      throw error;
    }
  },

  // Fetch appointments for doctor/patient with filter (upcoming/past)
  fetchAppointments: async (userType, filter = "upcoming") => {
    set({ loading: true, error: null });
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error("No authentication token found");
      }

      const response = await fetch(
        `${BACKEND}/api/appointment/${userType}/appointments?filter=${filter}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch appointments: ${response.statusText}`);
      }

      const data = await response.json();
      // Handle different response structures
      const appointmentsList = data.data || data.appointments || [];
      
      set({
        appointments: appointmentsList,
        loading: false,
        error: null
      });
    } catch (error) {
      console.error('Error fetching appointments:', error);
      set({
        error: error.message,
        loading: false,
        appointments: []
      });
    }
  },

  // Fetch single appointment by ID
  fetchAppointmentById: async (id) => {
    set({ loading: true, error: null });
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error("No authentication token found");
      }

      const response = await fetch(`${BACKEND}/api/appointment/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch appointment: ${response.statusText}`);
      }

      const data = await response.json();
      set({
        currentAppointment: data.data,
        loading: false,
        error: null
      });
    } catch (error) {
      console.error('Failed to fetch appointment:', error);
      set({
        error: error.message,
        loading: false
      });
    }
  },

  // Update appointment status (e.g., Cancelled, Completed, In Progress)
  updateAppointmentStatus: async (appointmentId, status) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error("No authentication token found");
      }

      const response = await fetch(
        `${BACKEND}/api/appointment/${appointmentId}/status`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status })
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to update appointment status: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Update the appointment in local state
      set((state) => ({
        appointments: state.appointments.map((apt) =>
          apt._id === appointmentId ? { ...apt, status } : apt
        ),
      }));

      // If current appointment is being updated, update it too
      if (get().currentAppointment?._id === appointmentId) {
        set((state) => ({
          currentAppointment: { ...state.currentAppointment, status }
        }));
      }

      return data;
    } catch (error) {
      console.error('Error updating appointment status:', error);
      throw error;
    }
  },

  // Cancel appointment
  cancelAppointment: async (appointmentId, reason) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error("No authentication token found");
      }

      const response = await fetch(
        `${BACKEND}/api/appointment/${appointmentId}/cancel`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ reason })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to cancel appointment');
      }

      const data = await response.json();

      // Update appointment in state
      set((state) => ({
        appointments: state.appointments.map((apt) =>
          apt._id === appointmentId 
            ? { ...apt, status: 'Cancelled', cancelReason: reason } 
            : apt
        )
      }));

      return data;
    } catch (error) {
      console.error('Error canceling appointment:', error);
      throw error;
    }
  },

  // Reschedule appointment
  rescheduleAppointment: async (appointmentId, newDateTime) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error("No authentication token found");
      }

      const response = await fetch(
        `${BACKEND}/api/appointment/reschedule/${appointmentId}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(newDateTime)
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to reschedule appointment');
      }

      const data = await response.json();

      // Update appointment in state
      set((state) => ({
        appointments: state.appointments.map((apt) =>
          apt._id === appointmentId ? data.data : apt
        )
      }));

      return data;
    } catch (error) {
      console.error('Error rescheduling appointment:', error);
      throw error;
    }
  },

  // End consultation (complete appointment with prescription)
  endConsultation: async (id, prescription, notes) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error("No authentication token found");
      }

      const response = await fetch(`${BACKEND}/api/appointment/${id}/complete`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prescription, notes })
      });

      if (!response.ok) {
        throw new Error(`Failed to complete consultation: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Update appointment status to Completed in local state
      set((state) => ({
        appointments: state.appointments.map((apt) =>
          apt._id === id ? { ...apt, status: 'Completed', prescription, notes } : apt
        ),
      }));

      return data;
    } catch (error) {
      console.error('Error ending consultation:', error);
      throw error;
    }
  },

  // Get booked slots for a doctor on a specific date
  getBookedSlots: async (doctorId, date) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error("No authentication token found");
      }

      const response = await fetch(
        `${BACKEND}/api/appointment/booked-slots/${doctorId}/${date}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch booked slots');
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error('Error fetching booked slots:', error);
      return [];
    }
  },

  // Clear appointments (useful for logout or reset)
  clearAppointments: () => set({
    appointments: [],
    currentAppointment: null,
    error: null,
    loading: false
  }),

  // Set current appointment manually
  setCurrentAppointment: (appointment) => set({ currentAppointment: appointment }),
}));
