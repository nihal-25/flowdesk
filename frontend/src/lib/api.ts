import axios from 'axios';

// .trim() guards against a stray newline/whitespace in the VITE_API_URL env var,
// which would otherwise corrupt every request URL and hang the app on load.
const BASE_URL = (import.meta.env['VITE_API_URL'] ?? '').trim();

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Module-level token store (avoids circular imports)
let _accessToken: string | null = null;
let _onLogout: (() => void) | null = null;
let _onTokenRefresh: ((token: string, expiresIn: number) => void) | null = null;

export function setApiToken(token: string | null): void {
  _accessToken = token;
}

export function setLogoutCallback(cb: () => void): void {
  _onLogout = cb;
}

// Notified whenever the interceptor silently refreshes the access token (e.g.
// after a page reload / deep link). Lets the auth store update its accessToken
// so dependent effects (like the WebSocket connection) re-run.
export function setTokenRefreshCallback(cb: (token: string, expiresIn: number) => void): void {
  _onTokenRefresh = cb;
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
      // Only attempt refresh if we had a token (i.e. the user was authenticated).
      // Without this guard, every unauthenticated page load triggers a logout redirect.
      const hadToken = _accessToken !== null;
      try {
        const { data } = await axios.post<{
          success: boolean;
          data?: { accessToken: string; expiresIn: number };
        }>(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true });
        if (data.success && data.data) {
          _accessToken = data.data.accessToken;
          _onTokenRefresh?.(data.data.accessToken, data.data.expiresIn);
          processQueue(null, data.data.accessToken);
          return api(originalRequest);
        }
        throw new Error('Refresh failed');
      } catch (refreshError) {
        processQueue(refreshError);
        _accessToken = null;
        // Only fire logout (redirect to /login) when the user was actively logged in
        if (hadToken) _onLogout?.();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);
