import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getThemeColors } from '../constants/theme';

const SETTINGS_KEY = '@brains_app_settings';

const defaultSettings = {
  darkMode: false,
  notificationsEnabled: true,
  appointmentReminders: true,
  bookingUpdates: true,
};

const SettingsContext = createContext({
  ...defaultSettings,
  colors: getThemeColors(false),
  isDark: false,
  setDarkMode: () => {},
  setNotificationsEnabled: () => {},
  setAppointmentReminders: () => {},
  setBookingUpdates: () => {},
  ready: false,
});

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(defaultSettings);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SETTINGS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setSettings((prev) => ({ ...prev, ...parsed }));
        }
      } catch (err) {
        console.warn('Failed loading settings:', err?.message || err);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const persist = async (next) => {
    setSettings(next);
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch (err) {
      console.warn('Failed saving settings:', err?.message || err);
    }
  };

  const colors = useMemo(
    () => getThemeColors(!!settings.darkMode),
    [settings.darkMode]
  );

  const value = useMemo(
    () => ({
      ...settings,
      colors,
      isDark: !!settings.darkMode,
      ready,
      setDarkMode: (darkMode) => persist({ ...settings, darkMode: !!darkMode }),
      setNotificationsEnabled: (notificationsEnabled) =>
        persist({ ...settings, notificationsEnabled: !!notificationsEnabled }),
      setAppointmentReminders: (appointmentReminders) =>
        persist({ ...settings, appointmentReminders: !!appointmentReminders }),
      setBookingUpdates: (bookingUpdates) =>
        persist({ ...settings, bookingUpdates: !!bookingUpdates }),
    }),
    [settings, colors, ready]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

export const useSettings = () => useContext(SettingsContext);

/** Theme-aware colors for UI. */
export const useAppTheme = () => {
  const { colors, isDark, darkMode } = useSettings();
  return { colors, isDark, darkMode };
};
