import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const userAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      loading: false,
      error: null,

      // Set user directly (after login / verify)
      setUser: (userData) => {
        console.log('📝 Setting user in store:', userData?.email);
        set({ user: userData, loading: false, error: null });
      },

      // Set loading state
      setLoading: (loading) => {
        console.log('⏳ Setting loading state:', loading);
        set({ loading });
      },

      // Check auth status
      checkAuth: async () => {
        try {
          set({ loading: true });
          const token = localStorage.getItem('token');
          console.log('🔍 Checking auth... Token exists:', !!token);

          if (!token) {
            console.log('❌ No token found');
            localStorage.removeItem('user');
            set({ user: null, loading: false });
            return null; // ✅ Return null instead of undefined
          }

          console.log('📡 Fetching user from /api/auth/me...');
          const response = await fetch(
            `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/auth/me`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );

          // ✅ Add explicit checks
          if (!response) {
            throw new Error('No response from server');
          }

          if (response.ok) {
            const data = await response.json();

            // ✅ Validate data structure before accessing
            const role = data.user?.type || data.user?.userType || data.user?.role;
            if (data && data.success && data.user && role) {
              const user = {
                ...data.user,
                type: data.user.type || data.user.userType || data.user.role,
              };
              console.log('✅ User loaded from /me:', user.email, 'as', user.type);
              localStorage.setItem('user', JSON.stringify(user));
              set({ user, loading: false, error: null });
              return user;
            } else {
              console.error('❌ Invalid response structure:', data);
              throw new Error('Invalid user data structure');
            }
          } else {
            const errorData = await response.json().catch(() => ({ 
              message: 'Failed to parse error response' 
            }));
            console.error('❌ Auth check failed:', errorData.message);
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            set({ user: null, loading: false, error: errorData.message });
            return null;
          }
        } catch (error) {
          console.error('❌ Auth check error:', error);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          set({ user: null, loading: false, error: error.message });
          return null;
        }
      },

      // Initialize auth
      initAuth: async () => {
        const state = get();
        
        if (state.user) {
          console.log('👤 User found in persisted state:', state.user.email);
          const token = localStorage.getItem('token');
          if (token) {
            console.log('✅ Token exists, user should be authenticated');
            set({ loading: false });
            return state.user;
          } else {
            console.log('⚠️ User in state but no token, clearing user');
            set({ user: null, loading: false });
            return null;
          }
        }

        const token = localStorage.getItem('token');
        if (token) {
          console.log('🔑 Token found but no user in state, fetching user...');
          return await get().checkAuth();
        }

        console.log('❌ No user and no token');
        set({ loading: false });
        return null;
      },

      // Login with email + password (backend JWT)
      login: async (authData) => {
        try {
          set({ loading: true, error: null });
          const response = await fetch(
            `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/auth/login`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                email: authData.email,
                password: authData.password,
              }),
            }
          );

          const data = await response.json();

          if (data.success) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            set({ user: data.user, loading: false, error: null });
            console.log('✅ Login successful:', data.user.email);
            return { success: true, user: data.user };
          } else {
            set({ user: null, loading: false, error: data.message });
            return { success: false, error: data.message };
          }
        } catch (error) {
          console.error('❌ Login error:', error);
          set({ user: null, loading: false, error: error.message });
          return { success: false, error: error.message };
        }
      },

      // Logout
      logout: async () => {
        try {
          const token = localStorage.getItem('token');
          if (token) {
            await fetch(
              `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/auth/logout`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );
          }
        } catch (error) {
          console.error('❌ Logout error:', error);
        } finally {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          set({ user: null, loading: false, error: null });
          console.log('✅ Logged out successfully');
        }
      },

      // Refresh token
      refreshToken: async () => {
        try {
          const token = localStorage.getItem('token');
          if (!token) return false;

          const response = await fetch(
            `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/auth/refresh`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );

          const data = await response.json();

          if (data.success) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            set({ user: data.user, loading: false, error: null });
            console.log('✅ Token refreshed successfully');
            return true;
          } else {
            return false;
          }
        } catch (error) {
          console.error('❌ Token refresh error:', error);
          return false;
        }
      },

      // Clear error
      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user }),
      onRehydrateStorage: () => (state) => {
        console.log('🔄 Store rehydrated, user:', state?.user?.email || 'none');
        if (state) {
          state.loading = false;
        }
      },
    }
  )
);
