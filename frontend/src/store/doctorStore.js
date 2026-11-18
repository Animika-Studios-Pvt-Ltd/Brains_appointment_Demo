import { create } from 'zustand';
import { getApiOrigin } from '../utils/api';

export const useDoctorStore = create((set) => ({
  dashboardData: null,
  loading: false,
  
  fetchDashboard: async (userType) => {
    set({ loading: true });
    try {
      const token = localStorage.getItem('token');
      const origin = getApiOrigin();
      const response = await fetch(`${origin}/api/doctor/dashboard`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to fetch dashboard (HTTP ${response.status}):`, errorText);
        set({ loading: false });
        return;
      }
      const data = await response.json();
      set({ dashboardData: data.data, loading: false });
    } catch (error) {
      console.error('Failed to fetch dashboard:', error);
      set({ loading: false });
    }
  },
}));
