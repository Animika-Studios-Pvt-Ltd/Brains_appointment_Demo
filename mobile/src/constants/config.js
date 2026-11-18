import Constants from 'expo-constants';

/**
 * Why the IP “keeps changing”:
 * Windows Ethernet still has DHCP Enabled — a static IP was never applied.
 * The router reassigns (e.g. .2 one day, .8 another), so a hardcoded IP breaks.
 *
 * Fix below: in Expo, derive the LAN host from Metro (same IP Expo uses).
 * Fallback is only used if Expo host is unavailable.
 *
 * Optional — truly lock the PC IP (Admin PowerShell):
 *   netsh interface ip set address name="Ethernet" static 192.168.1.8 255.255.255.0 192.168.1.1
 *   netsh interface ip set dns name="Ethernet" static 192.168.1.1 primary
 * Then verify with: ipconfig  →  DHCP Enabled should be No
 */
const FALLBACK_LAN_IP = '192.168.1.3';

function resolveDevHost() {
  const candidates = [
    Constants.expoConfig?.hostUri,
    Constants.manifest2?.extra?.expoGo?.debuggerHost,
    Constants.manifest?.debuggerHost,
  ].filter(Boolean);

  for (const raw of candidates) {
    const host = String(raw)
      .replace(/^[a-z]+:\/\//i, '')
      .split('/')[0]
      .split(':')[0]
      .trim();
    if (
      host &&
      host !== 'localhost' &&
      host !== '127.0.0.1' &&
      /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
    ) {
      return host;
    }
  }
  return FALLBACK_LAN_IP;
}

const LOCAL_IP = resolveDevHost();
const DEV_API_URL = `http://${LOCAL_IP}:8000/api`;
const DEV_WEB_URL = `http://${LOCAL_IP}:5173`;

// Google OAuth uses HTTPS Railway (LAN http redirect URIs are blocked by Google).
const PROD_API_ORIGIN = 'https://brainsappointment-production.up.railway.app';
const PROD_WEB_ORIGIN = 'https://app.brainshospital.com';

if (__DEV__) {
  console.log(`[config] API → ${DEV_API_URL} (host from Expo/Metro or fallback)`);
}

export const CONFIG = {
  // Keep backend running on :8000 or the app will show Network Error / ~10s delays.
  API_BASE_URL: process.env.EXPO_PUBLIC_API_URL || `${PROD_API_ORIGIN}/api`,
  WEB_BASE_URL: process.env.EXPO_PUBLIC_WEB_URL || (__DEV__ ? DEV_WEB_URL : PROD_WEB_ORIGIN),
  WEB_LOGIN_URL: process.env.EXPO_PUBLIC_WEB_URL
    ? `${process.env.EXPO_PUBLIC_WEB_URL}/login?mobile=1`
    : __DEV__
    ? `${DEV_WEB_URL}/login?mobile=1`
    : `${PROD_WEB_ORIGIN}/login?mobile=1`,
  /** HTTPS backend for Google OAuth only. JWT_SECRET must match local for API calls. */
  OAUTH_API_ORIGIN:
    process.env.EXPO_PUBLIC_OAUTH_API_URL || PROD_API_ORIGIN,
  STORAGE_KEYS: {
    AUTH_TOKEN: '@brains_patient_token',
    USER_DATA: '@brains_patient_user',
    HAS_SEEN_GET_STARTED: '@brains_has_seen_get_started',
  },
};

