export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type MessageType = 'text' | 'system' | 'file' | 'note';

export type TicketEventType =
  | 'created'
  | 'status_changed'
  | 'priority_changed'
  | 'assigned'
  | 'unassigned'
  | 'tag_added'
  | 'tag_removed'
  | 'message_added'
  | 'closed'
  | 'reopened';

// Allowed status transitions
export const TICKET_STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open: ['in_progress', 'closed'],
  in_progress: ['open', 'resolved', 'closed'],
  resolved: ['closed', 'open'],
  closed: ['open'],
};

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
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TicketWithDetails extends Ticket {
  assignee: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatarUrl: string | null;
  } | null;
  messageCount: number;
  lastMessageAt: Date | null;
}

export interface Message {
  id: string;
  ticketId: string;
  senderId: string | null;
  body: string;
  messageType: MessageType;
  isRead: boolean;
  attachments: MessageAttachment[];
  createdAt: Date;
}

export interface MessageAttachment {
  filename: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
}

export interface MessageWithSender extends Message {
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
  eventType: TicketEventType;
  oldValue: string | null;
  newValue: string | null;
  createdAt: Date;
}

export interface TicketEventWithUser extends TicketEvent {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  } | null;
}

export interface CreateTicketInput {
  title: string;
  description: string;
  priority?: TicketPriority;
  assignedTo?: string;
  tags?: string[];
  customerId?: string;
}

export interface UpdateTicketInput {
  title?: string;
  description?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedTo?: string | null;
  tags?: string[];
}

export interface PaginatedTickets {
  tickets: TicketWithDetails[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface TicketFilters {
  status?: TicketStatus | TicketStatus[];
  priority?: TicketPriority | TicketPriority[];
  assignedTo?: string;
  customerId?: string;
  tags?: string[];
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
  sortBy?: 'created_at' | 'updated_at' | 'priority';
  sortOrder?: 'asc' | 'desc';
}
