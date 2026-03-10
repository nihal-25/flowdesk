import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft, Send, Tag, User, Clock,
  AlertCircle, StickyNote,
} from 'lucide-react';
import { api } from '../lib/api';
import { useSocketStore } from '../stores/socket';
import { useAuthStore } from '../stores/auth';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { StatusBadge, PriorityBadge } from '../components/ui/Badge';
import type {
  Ticket, Message, TicketEvent,
  Agent, PaginatedResponse,
} from '../types';

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

function formatEventLabel(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { joinTicket, leaveTicket, onMessage, onTicketUpdated, onTyping, onStoppedTyping, sendTypingStart, sendTypingStop } = useSocketStore();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyBody, setReplyBody] = useState('');
  const [messageType, setMessageType] = useState<'text' | 'note'>('text');
  const [sendLoading, setSendLoading] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const fetchTicket = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await api.get<{ success: boolean; data?: Ticket }>(`/tickets/${id}`);
      if (data.success && data.data) setTicket(data.data);
    } catch { /* ignore */ }
  }, [id]);

  const fetchMessages = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await api.get<{ success: boolean; data?: PaginatedResponse<Message> }>(
        `/tickets/${id}/messages?pageSize=100&sortOrder=asc`
      );
      if (data.success && data.data) setMessages(data.data.items);
    } catch { /* ignore */ }
  }, [id]);

  const fetchEvents = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await api.get<{ success: boolean; data?: TicketEvent[] }>(
        `/tickets/${id}/events`
      );
      if (data.success && data.data) setEvents(data.data);
    } catch { /* ignore */ }
  }, [id]);

  const fetchAgents = useCallback(async () => {
    try {
      const { data } = await api.get<{ success: boolean; data?: PaginatedResponse<Agent> }>('/agents?pageSize=100');
      if (data.success && data.data) setAgents(data.data.items);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchTicket(), fetchMessages(), fetchEvents(), fetchAgents()]);
      setLoading(false);
    };
    void load();
  }, [fetchTicket, fetchMessages, fetchEvents, fetchAgents]);

  // Scroll to bottom when messages load
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Socket real-time
  useEffect(() => {
    if (!id) return;
    joinTicket(id);

    const unsubMsg = onMessage((msg) => {
      if (msg.ticketId === id) {
        setMessages((prev) => [...prev, msg]);
      }
    });

    const unsubTicket = onTicketUpdated((updated) => {
      if (updated.id === id) {
        setTicket((prev) => prev ? { ...prev, ...updated } : prev);
      }
    });

    const unsubTyping = onTyping((data) => {
      if (data.ticketId === id && data.userId !== user?.id) {
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.set(data.userId, `${data.firstName} ${data.lastName}`);
          return next;
        });
      }
    });

    const unsubStopped = onStoppedTyping((data) => {
      if (data.ticketId === id) {
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.delete(data.userId);
          return next;
        });
      }
    });

    return () => {
      leaveTicket(id);
      unsubMsg();
      unsubTicket();
      unsubTyping();
      unsubStopped();
    };
  }, [id, joinTicket, leaveTicket, onMessage, onTicketUpdated, onTyping, onStoppedTyping, user?.id]);

  const handleTypingInput = (val: string) => {
    setReplyBody(val);
    if (!id) return;
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      sendTypingStart(id);
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      sendTypingStop(id);
    }, 1500);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !replyBody.trim()) return;
    setSendLoading(true);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      sendTypingStop(id);
    }
    try {
      const { data } = await api.post<{ success: boolean; data?: Message }>(
        `/tickets/${id}/messages`,
        { body: replyBody.trim(), messageType }
      );
      if (data.success && data.data) {
        setMessages((prev) => [...prev, data.data!]);
        setReplyBody('');
      }
    } catch { /* ignore */ } finally {
      setSendLoading(false);
    }
  };

  const handleUpdateStatus = async (status: string) => {
    if (!id || !ticket) return;
    try {
      const { data } = await api.patch<{ success: boolean; data?: Ticket }>(
        `/tickets/${id}`, { status }
      );
      if (data.success && data.data) {
        setTicket(data.data);
        await fetchEvents();
      }
    } catch { /* ignore */ }
  };

  const handleUpdatePriority = async (priority: string) => {
    if (!id || !ticket) return;
    try {
      const { data } = await api.patch<{ success: boolean; data?: Ticket }>(
        `/tickets/${id}`, { priority }
      );
      if (data.success && data.data) {
        setTicket(data.data);
        await fetchEvents();
      }
    } catch { /* ignore */ }
  };

  const handleAssign = async (agentId: string) => {
    if (!id || !ticket) return;
    try {
      const { data } = await api.patch<{ success: boolean; data?: Ticket }>(
        `/tickets/${id}`, { assignedTo: agentId || null }
      );
      if (data.success && data.data) {
        setTicket(data.data);
        await fetchEvents();
      }
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="h-96 bg-gray-200 rounded-xl" />
            <div className="lg:col-span-2 h-96 bg-gray-200 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="p-6 lg:p-8 flex flex-col items-center justify-center min-h-96">
        <AlertCircle size={40} className="text-gray-300 mb-3" />
        <p className="text-gray-500">Ticket not found</p>
        <Button variant="secondary" size="sm" className="mt-4" onClick={() => navigate('/tickets')}>
          Back to tickets
        </Button>
      </div>
    );
  }

  const agentSelectOptions = [
    { value: '', label: 'Unassigned' },
    ...agents.map((a) => ({ value: a.id, label: `${a.firstName} ${a.lastName}` })),
  ];

  const typingList = Array.from(typingUsers.values());

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Back + Title */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/tickets')}>
          <ArrowLeft size={16} />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 truncate">{ticket.title}</h1>
          <p className="text-xs text-gray-400 mt-0.5 font-mono">#{ticket.id.slice(0, 8)}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Left: Ticket Info */}
        <div className="space-y-4">
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Details</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 font-medium">Status</label>
                <Select
                  options={STATUS_OPTIONS}
                  value={ticket.status}
                  onChange={(e) => void handleUpdateStatus(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Priority</label>
                <Select
                  options={PRIORITY_OPTIONS}
                  value={ticket.priority}
                  onChange={(e) => void handleUpdatePriority(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Assignee</label>
                <Select
                  options={agentSelectOptions}
                  value={ticket.assignedTo ?? ''}
                  onChange={(e) => void handleAssign(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
              <Tag size={14} />
              Tags
            </h3>
            {ticket.tags.length === 0 ? (
              <p className="text-xs text-gray-400">No tags</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {ticket.tags.map((tag) => (
                  <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
              <Clock size={14} />
              Timeline
            </h3>
            <div className="space-y-1.5 text-xs text-gray-500">
              <div className="flex items-center gap-1.5">
                <User size={12} />
                <span>Created {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}</span>
              </div>
              {ticket.resolvedAt && (
                <div className="flex items-center gap-1.5 text-green-600">
                  <Clock size={12} />
                  <span>Resolved {formatDistanceToNow(new Date(ticket.resolvedAt), { addSuffix: true })}</span>
                </div>
              )}
            </div>
          </Card>

          {/* Description */}
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Description</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{ticket.description || <span className="text-gray-300">No description</span>}</p>
          </Card>
        </div>

        {/* Middle: Messages */}
        <div className="lg:col-span-2 flex flex-col">
          <Card padding={false} className="flex flex-col" style={{ height: '72vh' }}>
            <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
              <h3 className="text-sm font-semibold text-gray-900">
                Conversation ({messages.length})
              </h3>
            </div>
            {/* Messages list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <p className="text-sm">No messages yet</p>
                  <p className="text-xs mt-1">Send the first message below</p>
                </div>
              ) : (
                messages.map((msg) => {
                  if (msg.messageType === 'system') {
                    return (
                      <div key={msg.id} className="flex items-center gap-2 justify-center">
                        <div className="h-px flex-1 bg-gray-100" />
                        <p className="text-xs text-gray-400 px-2">{msg.body}</p>
                        <div className="h-px flex-1 bg-gray-100" />
                      </div>
                    );
                  }
                  if (msg.messageType === 'note') {
                    return (
                      <div key={msg.id} className="flex gap-2">
                        <div className="w-7 h-7 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <StickyNote size={12} className="text-amber-600" />
                        </div>
                        <div className="flex-1 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-amber-800">
                              {msg.sender ? `${msg.sender.firstName} ${msg.sender.lastName}` : 'System'} · Note
                            </span>
                            <span className="text-xs text-amber-600">
                              {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                          <p className="text-sm text-amber-900 whitespace-pre-wrap">{msg.body}</p>
                        </div>
                      </div>
                    );
                  }
                  const isMe = msg.senderId === user?.id;
                  return (
                    <div key={msg.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold ${isMe ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'}`}>
                        {msg.sender ? `${msg.sender.firstName[0]}${msg.sender.lastName[0]}` : '?'}
                      </div>
                      <div className={`flex-1 max-w-xs ${isMe ? 'items-end' : ''}`}>
                        <div className={`rounded-lg px-3 py-2 ${isMe ? 'bg-primary-600 text-white ml-auto' : 'bg-gray-100 text-gray-900'}`}>
                          <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                        </div>
                        <div className={`flex items-center gap-1 mt-0.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                          <span className="text-xs text-gray-400">
                            {msg.sender ? `${msg.sender.firstName} ${msg.sender.lastName}` : 'Unknown'}
                          </span>
                          <span className="text-xs text-gray-300">·</span>
                          <span className="text-xs text-gray-400">
                            {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              {typingList.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-gray-400">
                    {typingList.join(', ')} {typingList.length === 1 ? 'is' : 'are'} typing…
                  </span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            {/* Reply box */}
            <div className="border-t border-gray-100 p-3 flex-shrink-0">
              <form onSubmit={(e) => void handleSendMessage(e)}>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setMessageType('text')}
                    className={`text-xs px-2 py-1 rounded transition-colors ${messageType === 'text' ? 'bg-primary-100 text-primary-700 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Reply
                  </button>
                  <button
                    type="button"
                    onClick={() => setMessageType('note')}
                    className={`text-xs px-2 py-1 rounded transition-colors ${messageType === 'note' ? 'bg-amber-100 text-amber-700 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Internal Note
                  </button>
                </div>
                <div className="flex gap-2">
                  <textarea
                    value={replyBody}
                    onChange={(e) => handleTypingInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        void handleSendMessage(e as unknown as React.FormEvent);
                      }
                    }}
                    placeholder={messageType === 'note' ? 'Add an internal note...' : 'Type a reply... (Ctrl+Enter to send)'}
                    rows={3}
                    className={`flex-1 resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${messageType === 'note' ? 'border-amber-300 bg-amber-50' : 'border-gray-300 bg-white'}`}
                  />
                  <Button type="submit" isLoading={sendLoading} disabled={!replyBody.trim()} className="self-end">
                    <Send size={15} />
                  </Button>
                </div>
              </form>
            </div>
          </Card>
        </div>

        {/* Right: Events Timeline */}
        <div>
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Activity</h3>
            {events.length === 0 ? (
              <p className="text-xs text-gray-400">No activity yet</p>
            ) : (
              <div className="space-y-3">
                {events.slice().reverse().map((event) => (
                  <div key={event.id} className="flex gap-2.5">
                    <div className="w-1.5 h-1.5 bg-primary-400 rounded-full mt-1.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700">{formatEventLabel(event.eventType)}</p>
                      {event.oldValue && event.newValue && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {event.oldValue} → {event.newValue}
                        </p>
                      )}
                      {event.user && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          by {event.user.firstName} {event.user.lastName}
                        </p>
                      )}
                      <p className="text-xs text-gray-300 mt-0.5">
                        {(() => {
                          try { return format(new Date(event.createdAt), 'MMM d, HH:mm'); }
                          catch { return event.createdAt; }
                        })()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
