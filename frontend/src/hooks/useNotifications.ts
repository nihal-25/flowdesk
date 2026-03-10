import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import type { Notification, PaginatedResponse } from '../types';

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ success: boolean; data?: PaginatedResponse<Notification> }>('/notifications?pageSize=20');
      if (data.success && data.data) {
        setNotifications(data.data.items);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const { data } = await api.get<{ success: boolean; data?: { count: number } }>('/notifications/unread-count');
      if (data.success && data.data) setUnreadCount(data.data.count);
    } catch { /* ignore */ }
  }, []);

  const markRead = useCallback(async (id: string) => {
    await api.patch(`/notifications/${id}/read`);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await api.patch('/notifications/read-all');
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }, []);

  useEffect(() => {
    void fetchNotifications();
    void fetchUnreadCount();
  }, [fetchNotifications, fetchUnreadCount]);

  return { notifications, unreadCount, loading, fetchNotifications, markRead, markAllRead };
}
