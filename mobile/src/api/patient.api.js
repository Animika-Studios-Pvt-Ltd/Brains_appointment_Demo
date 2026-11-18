import apiClient from './client';

export const patientApi = {
  getProfile: async () => {
    const response = await apiClient.get('/patient/me');
    return response.data;
  },

  getAppointments: async (status, { page = 1, limit = 50 } = {}) => {
    const params = { page, limit };
    if (status) params.status = status;
    const response = await apiClient.get('/patient/appointments', { params });
    return response.data;
  },

  getDoctors: async (search = '', specialization = '') => {
    const response = await apiClient.get('/patient/doctors', {
      params: { search, specialization },
    });
    return response.data;
  },

  getDoctorDetails: async (doctorId) => {
    const response = await apiClient.get(`/patient/doctors/${doctorId}`);
    return response.data;
  },

  getDoctorCalendar: async (doctorId, timeMin, timeMax) => {
    const response = await apiClient.get(`/patient/doctors/${doctorId}/calendar`, {
      params: {
        timeMin: timeMin instanceof Date ? timeMin.toISOString() : timeMin,
        timeMax: timeMax instanceof Date ? timeMax.toISOString() : timeMax,
      },
    });
    return response.data;
  },

  /** Same source as web booking calendar (`/api/blocked-slots/doctor/:id`). */
  getDoctorBlockedSlots: async (doctorId) => {
    const response = await apiClient.get(`/blocked-slots/doctor/${doctorId}`, {
      params: { futureOnly: true },
    });
    return response.data;
  },

  getMedicalRecords: async () => {
    const response = await apiClient.get('/patient/appointments');
    return response.data;
  },

  getMedicalDocuments: async () => {
    const response = await apiClient.get('/patient/medical-documents');
    return response.data;
  },

  uploadMedicalDocument: async (formData) => {
    const response = await apiClient.post('/patient/medical-documents', formData, {
      timeout: 90000,
    });
    return response.data;
  },

  deleteMedicalDocument: async (docId) => {
    const response = await apiClient.delete(`/patient/medical-documents/${docId}`);
    return response.data;
  },

  updateProfile: async (profileData) => {
    const response = await apiClient.put('/patient/profile', profileData);
    return response.data;
  },

  updateAvatar: async (formData) => {
    const response = await apiClient.put('/patient/profile/avatar', formData, {
      timeout: 90000,
    });
    return response.data;
  },
};

export const appointmentApi = {
  bookAppointment: async (bookingData) => {
    const response = await apiClient.post('/patient/appointments', bookingData, {
      timeout: 45000,
    });
    return response.data;
  },

  createPaymentOrder: async (payload) => {
    const response = await apiClient.post('/patient/payments/create-order', payload);
    return response.data;
  },

  cancelPaymentOrder: async (payload) => {
    const response = await apiClient.post('/patient/payments/cancel-order', payload);
    return response.data;
  },

  verifyPaymentAndBook: async (payload) => {
    const response = await apiClient.post('/patient/payments/verify-and-book', payload, {
      timeout: 45000,
    });
    return response.data;
  },

  cancelAppointment: async (id, reason) => {
    const response = await apiClient.put(`/patient/appointments/${id}/cancel`, {
      reason: reason || 'Patient requested cancellation',
    });
    return response.data;
  },

  getAvailableSlots: async (doctorId, date) => {
    const response = await apiClient.get(`/appointment/available-slots/${doctorId}/${date}`, {
      // Google Calendar free/busy can be slow; default 10s is too tight
      timeout: 30000,
    });
    return response.data;
  },

  rescheduleAppointment: async (appointmentId, payload) => {
    const response = await apiClient.put(
      `/patient/appointments/${appointmentId}/reschedule`,
      payload
    );
    return response.data;
  },

  getOnlineBookingStatus: async () => {
    const response = await apiClient.get('/system-settings/online-booking');
    return response.data;
  },
};

