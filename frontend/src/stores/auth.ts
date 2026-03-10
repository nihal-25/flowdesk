import { create } from 'zustand';
import { api, setApiToken, setLogoutCallback } from '../lib/api';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAccessToken: (token: string, expiresIn: number) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
}

interface RegisterData {
  tenantName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export const useAuthStore = create<AuthState>((set, get) => {
  // Register logout callback with api module
  setLogoutCallback(() => {
    if (refreshTimer) clearTimeout(refreshTimer);
    set({ user: null, accessToken: null, isAuthenticated: false });
    window.location.href = '/login';
  });

  return {
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isLoading: true,

    setAccessToken: (token, expiresIn) => {
      setApiToken(token);
      set({ accessToken: token, isAuthenticated: true });
      // Schedule silent refresh 1 minute before expiry
      if (refreshTimer) clearTimeout(refreshTimer);
      const refreshInMs = (expiresIn - 60) * 1000;
      if (refreshInMs > 0) {
        refreshTimer = setTimeout(async () => {
          try {
            const { data } = await api.post<{ success: boolean; data?: { accessToken: string; expiresIn: number } }>('/auth/refresh');
            if (data.success && data.data) {
              get().setAccessToken(data.data.accessToken, data.data.expiresIn);
            }
          } catch {
            await get().logout();
          }
        }, refreshInMs);
      }
    },

    login: async (email, password) => {
      const { data } = await api.post<{ success: boolean; data?: { accessToken: string; expiresIn: number } }>('/auth/login', { email, password });
      if (data.success && data.data) {
        get().setAccessToken(data.data.accessToken, data.data.expiresIn);
        await get().fetchMe();
      }
    },

    register: async (input) => {
      const { data } = await api.post<{ success: boolean; data?: { accessToken: string; expiresIn: number } }>('/auth/register', input);
      if (data.success && data.data) {
        get().setAccessToken(data.data.accessToken, data.data.expiresIn);
        await get().fetchMe();
      }
    },

    logout: async () => {
      try {
        await api.post('/auth/logout');
      } catch { /* ignore */ }
      if (refreshTimer) clearTimeout(refreshTimer);
      setApiToken(null);
      set({ user: null, accessToken: null, isAuthenticated: false });
    },

    fetchMe: async () => {
      try {
        const { data } = await api.get<{ success: boolean; data?: User }>('/auth/me');
        if (data.success && data.data) {
          set({ user: data.data, isAuthenticated: true, isLoading: false });
        } else {
          set({ isLoading: false });
        }
      } catch {
        set({ isLoading: false });
      }
    },
  };
});
