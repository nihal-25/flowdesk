export type UserRole = 'superadmin' | 'admin' | 'agent' | 'viewer';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type NotificationType = 'ticket_created' | 'ticket_assigned' | 'ticket_resolved' | 'ticket_updated' | 'message_received' | 'agent_invited' | 'system';

export interface User {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  avatarUrl: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
    plan: string;
  };
  permissions: string[];
}

export interface Ticket {
  id: string;
  tenantId: string;
  customerId: string | null;
  assignedTo: string | null;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  tags: string[];
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignee: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatarUrl: string | null;
  } | null;
  messageCount: number;
  lastMessageAt: string | null;
}

export interface Message {
  id: string;
  ticketId: string;
  senderId: string | null;
  body: string;
  messageType: 'text' | 'system' | 'note' | 'file';
  isRead: boolean;
  createdAt: string;
  sender: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
    avatarUrl: string | null;
  } | null;
}

export interface TicketEvent {
  id: string;
  ticketId: string;
  userId: string | null;
  eventType: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  } | null;
}

export interface Agent {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  avatarUrl: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  ticketCount?: number;
  isOnline: boolean;
}

export interface Notification {
  id: string;
  userId: string;
  tenantId: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface WebhookEndpoint {
  id: string;
  tenantId: string;
  url: string;
  events: string[];
  isActive: boolean;
  consecutiveFailures: number;
  lastTriggeredAt: string | null;
  createdAt: string;
}

export interface AnalyticsOverview {
  openTickets: number;
  resolvedToday: number;
  avgResolutionTimeMs: number;
  totalAgents: number;
  activeAgents: number;
  totalTicketsThisMonth: number;
}

export interface TicketVolumePoint {
  date: string;
  created: number;
  resolved: number;
  closed: number;
}

export interface AgentPerformance {
  agentId: string;
  firstName: string;
  lastName: string;
  email: string;
  assignedCount: number;
  resolvedCount: number;
  avgResponseTimeMs: number;
  avgResolutionTimeMs: number;
  isOnline: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
  timestamp: string;
}
