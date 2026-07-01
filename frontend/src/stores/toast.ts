import { create } from 'zustand';

export interface Toast {
  id: string;
  title: string;
  body?: string;
}

interface ToastState {
  toasts: Toast[];
  addToast: (t: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (t) => {
    const id = (globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random()));
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    // Auto-dismiss after 5s.
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
    }, 5000);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));
