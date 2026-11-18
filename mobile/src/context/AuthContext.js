import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONFIG } from '../constants/config';
import { authApi } from '../api/auth.api';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  const clearLocalSession = async () => {
    await AsyncStorage.multiRemove([
      CONFIG.STORAGE_KEYS.AUTH_TOKEN,
      CONFIG.STORAGE_KEYS.USER_DATA,
    ]);
    setToken(null);
    setUser(null);
  };

  const loadStoredAuth = async () => {
    try {
      const storedToken = await AsyncStorage.getItem(CONFIG.STORAGE_KEYS.AUTH_TOKEN);
      const storedUser = await AsyncStorage.getItem(CONFIG.STORAGE_KEYS.USER_DATA);

      if (!storedToken || !storedUser) {
        return;
      }

      // Re-check with API so deleted Mongo users cannot stay "logged in"
      try {
        const data = await authApi.verify(storedToken);
        if (!data?.success || !data?.user) {
          await clearLocalSession();
          return;
        }
        const userRole = data.user?.role || data.user?.type || data.user?.userType;
        if (userRole && userRole !== 'patient') {
          await clearLocalSession();
          return;
        }
        setToken(storedToken);
        setUser(data.user);
        await AsyncStorage.setItem(
          CONFIG.STORAGE_KEYS.USER_DATA,
          JSON.stringify(data.user)
        );
      } catch (err) {
        const status = err?.response?.status;
        const isNetwork =
          !err?.response &&
          (err?.message === 'Network Error' ||
            err?.code === 'ECONNABORTED' ||
            err?.code === 'ERR_NETWORK');

        // Offline / backend down — keep local session; do not force logout
        if (isNetwork || !status) {
          console.warn(
            'Auth verify skipped (offline/unreachable). Keeping stored session:',
            err?.message || err
          );
          setToken(storedToken);
          try {
            setUser(JSON.parse(storedUser));
          } catch {
            setUser(null);
          }
          return;
        }

        // Only clear when server rejects the token (expired / deleted / forbidden)
        if (status === 401 || status === 403 || status === 404) {
          console.warn('Stored session invalid — clearing local auth:', status);
          await clearLocalSession();
          return;
        }

        console.warn('Auth verify failed — keeping stored session:', err?.message || err);
        setToken(storedToken);
        try {
          setUser(JSON.parse(storedUser));
        } catch {
          setUser(null);
        }
      }
    } catch (error) {
      console.error('Failed loading stored auth token:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const persistSession = async (authToken, userData) => {
    const userRole = userData?.role || userData?.type || userData?.userType;
    if (userRole && userRole !== 'patient') {
      throw new Error('This app is reserved for Patient access only.');
    }

    const isGoogle = !!userData?.googleId || userData?.authProvider === 'google';
    const safeUser = {
      ...userData,
      hasPassword:
        userData?.hasPassword !== undefined
          ? Boolean(userData.hasPassword)
          : !isGoogle,
      authProvider: userData?.authProvider || (isGoogle ? 'google' : 'password'),
    };

    console.log('📱 AuthContext persisting safe session user:', {
      id: safeUser.id || safeUser._id,
      email: safeUser.email,
      authProvider: safeUser.authProvider,
      googleId: !!safeUser.googleId,
      hasPassword: safeUser.hasPassword,
    });

    await AsyncStorage.setItem(CONFIG.STORAGE_KEYS.AUTH_TOKEN, authToken);
    await AsyncStorage.setItem(CONFIG.STORAGE_KEYS.USER_DATA, JSON.stringify(safeUser));

    setToken(authToken);
    setUser(safeUser);
  };

  const login = async (email, password) => {
    const data = await authApi.login({ email, password });
    await persistSession(data.token, data.user);
    return data;
  };

  /** Complete login using a token/user session from the website WebView. */
  const loginWithToken = async (authToken, userData, options = {}) => {
    if (!authToken || !userData) {
      throw new Error('Missing website login session.');
    }

    // Google mobile OAuth may already be verified against the HTTPS OAuth API
    if (options.alreadyVerified) {
      await persistSession(authToken, userData);
      return { token: authToken, user: userData };
    }

    // Always verify against backend (user may have been deleted from MongoDB)
    const data = await authApi.verify(authToken);
    if (!data?.success || !data?.user) {
      await clearLocalSession();
      throw new Error('Session expired or account no longer exists. Please sign in again.');
    }

    await persistSession(authToken, data.user);
    return { token: authToken, user: data.user };
  };

  const register = async (patientData) => {
    const data = await authApi.register(patientData);
    if (data.token && data.user) {
      await persistSession(data.token, data.user);
    }
    return data;
  };

  const logout = async () => {
    await clearLocalSession();
  };

  const updateUserData = (updatedUser) => {
    if (!updatedUser) return;
    setUser((prev) => {
      const merged = {
        ...(prev || {}),
        ...updatedUser,
        id: updatedUser.id || updatedUser._id || prev?.id || prev?._id,
        _id: updatedUser._id || updatedUser.id || prev?._id || prev?.id,
        type: updatedUser.type || updatedUser.userType || updatedUser.role || prev?.type || 'patient',
        role: updatedUser.role || updatedUser.userType || updatedUser.type || prev?.role || 'patient',
        userType:
          updatedUser.userType || updatedUser.type || updatedUser.role || prev?.userType || 'patient',
        hasPassword:
          updatedUser.hasPassword !== undefined
            ? Boolean(updatedUser.hasPassword)
            : prev?.hasPassword !== undefined
            ? Boolean(prev.hasPassword)
            : !(updatedUser.googleId || prev?.googleId || updatedUser.authProvider === 'google'),
        authProvider: updatedUser.authProvider || prev?.authProvider || (updatedUser.googleId || prev?.googleId ? 'google' : 'password'),
      };

      console.log('📱 AuthContext updateUserData safe merged user:', {
        id: merged.id || merged._id,
        email: merged.email,
        authProvider: merged.authProvider,
        googleId: !!merged.googleId,
        hasPassword: merged.hasPassword,
      });

      AsyncStorage.setItem(CONFIG.STORAGE_KEYS.USER_DATA, JSON.stringify(merged));
      return merged;
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!token,
        login,
        loginWithToken,
        register,
        logout,
        updateUserData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
