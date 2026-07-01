import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useSocketStore } from '../stores/socket';
import { useToastStore } from '../stores/toast';
import type { Notification, NotificationListResponse } from '../types';

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ success: boolean; data?: NotificationListResponse }>('/notifications?pageSize=20');
      if (data.success && data.data) {
        setNotifications(Array.isArray(data.data.notifications) ? data.data.notifications : []);
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

  // Real-time: prepend live notifications, bump the badge, and pop a toast.
  const socket = useSocketStore((s) => s.socket);
  const onNotification = useSocketStore((s) => s.onNotification);
  const addToast = useToastStore((s) => s.addToast);
  useEffect(() => {
    const unsub = onNotification((n) => {
      setNotifications((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev]));
      setUnreadCount((c) => c + 1);
      addToast({ title: n.title, body: n.body });
    });
    return unsub;
  }, [socket, onNotification, addToast]);

  return { notifications, unreadCount, loading, fetchNotifications, markRead, markAllRead };
}
