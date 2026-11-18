// frontend/src/utils/api.js

const stripTrailingSlash = (value) => String(value || '').replace(/\/$/, '');

const isLocalHostname = (hostname) =>
  !hostname || hostname === 'localhost' || hostname === '127.0.0.1';

/**
 * When the site is opened from a phone/LAN IP (e.g. http://192.168.x.x:5173),
 * rewrite baked-in localhost backend URLs to the same host on port 8000.
 * Never rewrite for public domains (app.brainshospital.com, etc.).
 */
const isLanHostname = (hostname) =>
  /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);

const resolveLanAwareOrigin = (configuredOrigin) => {
  let origin = stripTrailingSlash(configuredOrigin) || 'http://localhost:8000';

  if (typeof window === 'undefined') return origin;

  const pageHost = window.location.hostname;
  if (isLocalHostname(pageHost)) return origin;
  // Production / staging public hosts must keep the configured API origin (Railway, etc.)
  if (!isLanHostname(pageHost)) return origin;

  try {
    const url = new URL(origin);
    if (isLocalHostname(url.hostname)) {
      url.hostname = pageHost;
      url.protocol = window.location.protocol;
      if (!url.port || url.port === '5173') {
        url.port = '8000';
      }
      origin = stripTrailingSlash(url.origin);
    }
  } catch {
    // keep configured origin
  }

  return origin;
};

/** Origin only (no /api suffix) — matches Login / ProtectedRoute */
export const getApiOrigin = () => {
  // Mobile WebView can inject this so API calls never hit phone-localhost
  if (typeof window !== 'undefined' && window.__BRAINS_API_ORIGIN__) {
    return stripTrailingSlash(window.__BRAINS_API_ORIGIN__);
  }

  // LAN + mobile Website Login only: use PC IP :8000.
  // Do NOT do this on production (app.brainshospital.com) — Google OAuth returns
  // with ?token=... and that used to wrongly force https://app…:8000 (breaks verify).
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search || '');
    const pageHost = window.location.hostname;
    const mobileFlow = params.get('mobile') === '1';
    if (mobileFlow && pageHost && isLanHostname(pageHost)) {
      return `${window.location.protocol}//${pageHost}:8000`;
    }
  }

  const backend = import.meta.env.VITE_BACKEND_URL;
  if (backend) return resolveLanAwareOrigin(backend);

  const apiUrl = import.meta.env.VITE_API_URL || '';
  if (apiUrl.endsWith('/api') || apiUrl.endsWith('/api/')) {
    return resolveLanAwareOrigin(String(apiUrl).replace(/\/?api\/?$/, ''));
  }
  return resolveLanAwareOrigin(apiUrl || 'http://localhost:8000');
};

/** True when the site is running inside the Brains patient mobile WebView. */
export const isMobileAppWebView = () => {
  try {
    return typeof window !== 'undefined' && !!window.ReactNativeWebView;
  } catch {
    return false;
  }
};

/** Prefer staying on login handoff for app WebView (also ?mobile=1). */
export const isMobileAppLoginFlow = () => {
  try {
    if (isMobileAppWebView()) return true;
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search || '').get('mobile') === '1';
  } catch {
    return false;
  }
};

/** Notify React Native WebView after a successful website login/signup. */
export const notifyMobileAppAuth = (token, user) => {
  try {
    if (typeof window !== 'undefined' && window.ReactNativeWebView && token && user) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: 'AUTH_SUCCESS', token, user })
      );
    }
  } catch {
    // ignore on normal browsers
  }
};

/** Signal React Native WebView to close login modal and return to native mobile Home */
export const closeMobileAppWebView = () => {
  try {
    if (typeof window !== 'undefined' && window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: 'CLOSE_WEBVIEW' })
      );
    }
  } catch {
    // ignore on normal browsers
  }
};

/**
 * Validates the stored JWT with our backend (Mongo user, active flag, signature).
 * Refreshes `user` in localStorage from the server on success.
 */
export const verifyAuthToken = async () => {
  const token = localStorage.getItem('token');
  if (!token) {
    return { success: false, reason: 'no_token' };
  }
  const origin = getApiOrigin();
  let res;
  try {
    res = await fetch(`${origin}/api/auth/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Network error (e.g. backend not running → ERR_CONNECTION_REFUSED)
    return { success: false, reason: 'network_error' };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    // User deleted from Mongo / invalid / expired → drop stale client session
    if (res.status !== 0) {
      clearAuth();
    }
    return { success: false, reason: 'invalid_session', ...data };
  }
  localStorage.setItem('user', JSON.stringify(data.user));
  return { success: true, user: data.user };
};

/**
 * Get the backend JWT token from localStorage
 */
export const getAuthToken = () => {
  const token = localStorage.getItem('token');
  if (!token) {
    console.warn('⚠️ No auth token found in localStorage');
  }
  return token;
};

/**
 * Get user data from localStorage
 */
export const getUser = () => {
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = () => {
  return !!getAuthToken() && !!getUser();
};

/** External site users land on after logout */
export const POST_LOGOUT_REDIRECT_URL = 'https://brainshospital.com/';

/**
 * Clear authentication data
 */
export const clearAuth = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  console.log('🧹 Auth data cleared');
};

/**
 * Call backend logout (best-effort), clear session, redirect to Brains Hospital site.
 */
export async function performLogout() {
  try {
    const token = localStorage.getItem('token');
    if (token) {
      await fetch(`${getApiOrigin()}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }).catch(() => {});
    }
  } catch {
    /* ignore */
  }
  clearAuth();
  window.location.replace(POST_LOGOUT_REDIRECT_URL);
}

/**
 * Make an authenticated API request with backend JWT
 */
export const apiRequest = async (endpoint, options = {}) => {
  const token = getAuthToken();

  const defaultHeaders = {
    'Content-Type': 'application/json',
  };

  // Add Authorization header if token exists
  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  // Handle full URLs or relative paths
  const url = endpoint.startsWith('http')
    ? endpoint
    : `${getApiOrigin()}${endpoint}`;

  console.log(`🌐 API Request: ${options.method || 'GET'} ${url}`);

  try {
    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      console.error(`❌ API Error [${response.status}]:`, data);

      // If 401, token is invalid - clear and redirect to login
      if (response.status === 401) {
        console.error('🚫 Token expired or invalid - clearing auth data');
        clearAuth();
        window.location.href = '/';
      }

      throw new Error(data.message || `Request failed with status ${response.status}`);
    }

    console.log(`✅ API Success: ${url}`);
    return data;
  } catch (error) {
    console.error(`❌ API Request Failed: ${url}`, error);
    throw error;
  }
};

/**
 * Convenience methods for common HTTP verbs
 */
export const api = {
  get: (endpoint) => apiRequest(endpoint, { method: 'GET' }),

  post: (endpoint, body) =>
    apiRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  put: (endpoint, body) =>
    apiRequest(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  patch: (endpoint, body) =>
    apiRequest(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  delete: (endpoint) =>
    apiRequest(endpoint, { method: 'DELETE' }),
};

export default api;
