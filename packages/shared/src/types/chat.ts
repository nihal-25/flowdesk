export type PresenceStatus = 'online' | 'away' | 'offline';

export interface Presence {
  id: string;
  userId: string;
  tenantId: string;
  status: PresenceStatus;
  lastSeenAt: Date;
}

export interface TypingIndicator {
  userId: string;
  firstName: string;
  lastName: string;
  ticketId: string;
  timestamp: number;
}

export interface ChatRoom {
  id: string;
  ticketId: string;
  tenantId: string;
  participantIds: string[];
  createdAt: Date;
}

// WebSocket event names — client to server
export type ClientToServerEvent =
  | 'join:ticket'
  | 'leave:ticket'
  | 'typing:start'
  | 'typing:stop'
  | 'message:read';

// WebSocket event names — server to client
export type ServerToClientEvent =
  | 'message:new'
  | 'ticket:updated'
  | 'agent:typing'
  | 'agent:stopped-typing'
  | 'presence:update'
  | 'notification:new'
  | 'analytics:update'
  | 'error';

export interface SocketAuth {
  token: string;
}

export interface PresenceUpdatePayload {
  userId: string;
  status: PresenceStatus;
  firstName: string;
  lastName: string;
}
