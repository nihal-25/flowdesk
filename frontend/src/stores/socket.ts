import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';
import type { Message, Ticket } from '../types';

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
}

const SOCKET_URL = import.meta.env['VITE_API_URL'] ?? '';

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,

  connect: (token) => {
    const existing = get().socket;
    if (existing?.connected) return;

    const socket = io(`${SOCKET_URL}/chat`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => console.info('[socket] Connected:', socket.id));
    socket.on('disconnect', (reason) => console.warn('[socket] Disconnected:', reason));
    socket.on('connect_error', (err) => console.error('[socket] Connection error:', err.message));

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
}));
