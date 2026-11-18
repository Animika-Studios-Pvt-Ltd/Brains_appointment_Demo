import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONFIG } from '../constants/config';

const apiClient = axios.create({
  baseURL: CONFIG.API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: 10000,
});

const isFormData = (data) => {
  if (!data) return false;
  if (typeof FormData !== 'undefined' && data instanceof FormData) return true;
  // React Native FormData is not always an instanceof FormData across Hermes builds
  return typeof data.append === 'function' && Array.isArray(data._parts);
};

const clearContentType = (headers) => {
  if (!headers) return;
  if (typeof headers.delete === 'function') {
    headers.delete('Content-Type');
    headers.delete('content-type');
    return;
  }
  delete headers['Content-Type'];
  delete headers['content-type'];
};

apiClient.interceptors.request.use(
  async (config) => {
    try {
      const token = asyncStorageGetToken();
      const resolvedToken = token instanceof Promise ? await token : token;
      if (resolvedToken) {
        config.headers.Authorization = `Bearer ${resolvedToken}`;
      }
    } catch (e) {
      console.warn('Error reading token for request header', e);
    }

    // Let RN set multipart/form-data + boundary (required for multer / Cloudinary uploads)
    if (isFormData(config.data)) {
      clearContentType(config.headers);
      config.transformRequest = [(data) => data];
    }

    return config;
  },
  (error) => Promise.reject(error)
);

const asyncStorageGetToken = async () => {
  return await AsyncStorage.getItem(CONFIG.STORAGE_KEYS.AUTH_TOKEN);
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const url = String(error.config?.url || '');
    const isAuthRoute = url.includes('/auth/');
    // Stale JWT after user deleted/deactivated/expired — only clear on auth endpoints
    if (isAuthRoute && (status === 401 || status === 403 || status === 404)) {
      try {
        await AsyncStorage.multiRemove([
          CONFIG.STORAGE_KEYS.AUTH_TOKEN,
          CONFIG.STORAGE_KEYS.USER_DATA,
        ]);
      } catch {
        // ignore storage errors
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
