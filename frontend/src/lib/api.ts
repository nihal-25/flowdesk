import axios from 'axios';

const BASE_URL = import.meta.env['VITE_API_URL'] ?? '';

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Module-level token store (avoids circular imports)
let _accessToken: string | null = null;
let _onLogout: (() => void) | null = null;

export function setApiToken(token: string | null): void {
  _accessToken = token;
}

export function setLogoutCallback(cb: () => void): void {
  _onLogout = cb;
}

api.interceptors.request.use((config) => {
  if (_accessToken) {
    config.headers.Authorization = `Bearer ${_accessToken}`;
  }
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{ resolve: (value: unknown) => void; reject: (reason?: unknown) => void }> = [];

const processQueue = (error: unknown, token: string | null = null): void => {
  failedQueue.forEach((p) => {
    if (error) p.reject(error);
    else p.resolve(token);
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (res) => res,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) return Promise.reject(error);
    const originalRequest = error.config as typeof error.config & { _retry?: boolean };
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => api(originalRequest));
      }
      originalRequest._retry = true;
      isRefreshing = true;
      try {
        const { data } = await axios.post<{
          success: boolean;
          data?: { accessToken: string; expiresIn: number };
        }>(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true });
        if (data.success && data.data) {
          _accessToken = data.data.accessToken;
          processQueue(null, data.data.accessToken);
          return api(originalRequest);
        }
        throw new Error('Refresh failed');
      } catch (refreshError) {
        processQueue(refreshError);
        _onLogout?.();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);
