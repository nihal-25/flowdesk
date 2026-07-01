import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';
import type { Message, Ticket, Notification } from '../types';

interface PresenceUpdate { userId: string; status: 'online' | 'offline' }

interface SocketState {
  socket: Socket | null;
  connect: (token: string) => void;
  disconnect: () => void;
  joinTicket: (ticketId: string) => void;
  leaveTicket: (ticketId: string) => void;
  sendTypingStart: (ticketId: string) => void;
  sendTypingStop: (ticketId: string) => void;
  onMessage: (handler: (msg: Message) => void) => () => void;
  onTicketUpdated: (handler: (ticket: Partial<Ticket>) => void) => () => void;
  onTyping: (handler: (data: { userId: string; firstName: string; lastName: string; ticketId: string }) => void) => () => void;
  onStoppedTyping: (handler: (data: { userId: string; ticketId: string }) => void) => () => void;
  onNotification: (handler: (n: Notification) => void) => () => void;
  onPresence: (handler: (p: PresenceUpdate) => void) => () => void;
}

// Connect DIRECTLY to the chat service (its own public domain), NOT through the
// gateway — Socket.IO uses the default /socket.io/ path which the gateway does
// not proxy. VITE_CHAT_URL points at the chat service; falls back to the API URL.
const CHAT_URL = (import.meta.env['VITE_CHAT_URL'] ?? import.meta.env['VITE_API_URL'] ?? '').trim();

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,

  connect: (token) => {
    const existing = get().socket;
    // Reuse an existing socket that is connected OR still in the process of
    // connecting — never create a second socket (that caused connect/disconnect
    // churn where each new socket orphaned the previous one).
    if (existing) return;

    const socket = io(CHAT_URL, {
      auth: { token },
      // Polling first, then upgrade to websocket — robust through Railway's proxy.
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => console.info('[socket] Connected:', socket.id));
    socket.on('disconnect', (reason) => console.warn('[socket] Disconnected:', reason));
    socket.on('connect_error', (err) => console.error('[socket] Connection error:', err.message));
    socket.onAny((event: string) => console.info('[socket] event:', event));
    if (typeof window !== 'undefined') {
      (window as unknown as { __sc?: number }).__sc = ((window as unknown as { __sc?: number }).__sc ?? 0) + 1;
    }

    set({ socket });
  },

  disconnect: () => {
    get().socket?.disconnect();
    set({ socket: null });
  },

  joinTicket: (ticketId) => get().socket?.emit('join:ticket', { ticketId }),
  leaveTicket: (ticketId) => get().socket?.emit('leave:ticket', { ticketId }),
  sendTypingStart: (ticketId) => get().socket?.emit('typing:start', { ticketId }),
  sendTypingStop: (ticketId) => get().socket?.emit('typing:stop', { ticketId }),

  onMessage: (handler) => {
    const { socket } = get();
    if (!socket) return () => {};
    socket.on('message:new', handler);
    return () => socket.off('message:new', handler);
  },

  onTicketUpdated: (handler) => {
    const { socket } = get();
    if (!socket) return () => {};
    socket.on('ticket:updated', handler);
    return () => socket.off('ticket:updated', handler);
  },

  onTyping: (handler) => {
    const { socket } = get();
    if (!socket) return () => {};
    socket.on('agent:typing', handler);
    return () => socket.off('agent:typing', handler);
  },

  onStoppedTyping: (handler) => {
    const { socket } = get();
    if (!socket) return () => {};
    socket.on('agent:stopped-typing', handler);
    return () => socket.off('agent:stopped-typing', handler);
  },

  onNotification: (handler) => {
    const { socket } = get();
    if (!socket) return () => {};
    socket.on('notification:new', handler);
    return () => socket.off('notification:new', handler);
  },

  onPresence: (handler) => {
    const { socket } = get();
    if (!socket) return () => {};
    socket.on('presence:update', handler);
    return () => socket.off('presence:update', handler);
  },
}));
