/** Brand palette: Signal Blue + Porcelain */
export const BRAND = {
  signalBlue: '#0057FF',
  porcelain: '#F8F7F4',
};

export const LIGHT_COLORS = {
  primary: BRAND.signalBlue,
  primaryDark: '#0046CC',
  primaryLight: '#E8EEFF',
  accent: '#3380FF',

  background: BRAND.porcelain,
  cardBackground: '#FFFFFF',
  cardBorder: '#E6E4DF',
  inputBackground: '#F0EEE9',

  textPrimary: '#0A1628',
  textSecondary: '#5C6570',
  textMuted: '#6B7280',

  success: '#12B76A',
  warning: '#F79009',
  error: '#F04438',
  info: BRAND.signalBlue,

  statusConfirmed: '#12B76A',
  statusPending: '#F79009',
  statusCompleted: BRAND.signalBlue,
  statusCancelled: '#F04438',

  glassBorder: '#E6E4DF',
  headerBackground: '#FFFFFF',
  tabBarBackground: '#FFFFFF',
  surfaceMuted: '#F0EEE9',
  dangerSoft: 'rgba(240, 68, 56, 0.1)',
  dangerBorder: 'rgba(240, 68, 56, 0.3)',
};

export const DARK_COLORS = {
  primary: '#4D8AFF',
  primaryDark: '#80AAFF',
  primaryLight: '#152238',
  accent: '#6B9BFF',

  background: '#0B1220',
  cardBackground: '#151C2C',
  cardBorder: '#243044',
  inputBackground: '#1C2536',

  textPrimary: '#F3F4F6',
  textSecondary: '#9CA3AF',
  textMuted: '#A1A8B3',

  success: '#34D399',
  warning: '#FBBF24',
  error: '#F87171',
  info: '#4D8AFF',

  statusConfirmed: '#34D399',
  statusPending: '#FBBF24',
  statusCompleted: '#4D8AFF',
  statusCancelled: '#F87171',

  glassBorder: '#243044',
  headerBackground: '#111827',
  tabBarBackground: '#111827',
  surfaceMuted: '#1A2233',
  dangerSoft: 'rgba(248, 113, 113, 0.15)',
  dangerBorder: 'rgba(248, 113, 113, 0.35)',
};

/** Default light palette (fallback for modules that cannot use hooks). */
export const COLORS = LIGHT_COLORS;

export const getThemeColors = (isDark = false) => (isDark ? DARK_COLORS : LIGHT_COLORS);

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const RADIUS = {
  sm: 6,
  md: 12,
  lg: 18,
  full: 9999,
};

/** Manrope — loaded in App.js via @expo-google-fonts/manrope */
export const FONTS = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semiBold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extraBold: 'Manrope_800ExtraBold',
};
