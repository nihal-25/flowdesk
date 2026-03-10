import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Plus, Search, Ticket as TicketIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { StatusBadge, PriorityBadge } from '../components/ui/Badge';
import { useDebounce } from '../hooks/useDebounce';
import type { Ticket, TicketPriority, PaginatedResponse, Agent } from '../types';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'All priorities' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

interface NewTicketForm {
  title: string;
  description: string;
  priority: TicketPriority;
  assignedTo: string;
  tags: string;
}

export function TicketsPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [modalOpen, setModalOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [formData, setFormData] = useState<NewTicketForm>({
    title: '',
    description: '',
    priority: 'medium',
    assignedTo: '',
    tags: '',
  });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      if (statusFilter) params.set('status', statusFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);

      const { data } = await api.get<{ success: boolean; data?: PaginatedResponse<Ticket> }>(
        `/tickets?${params.toString()}`
      );
      if (data.success && data.data) {
        setTickets(data.data.items);
        setTotal(data.data.pagination.total);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, priorityFilter, debouncedSearch]);

  const fetchAgents = useCallback(async () => {
    try {
      const { data } = await api.get<{ success: boolean; data?: PaginatedResponse<Agent> }>('/agents?pageSize=100');
      if (data.success && data.data) setAgents(data.data.items);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    if (modalOpen) void fetchAgents();
  }, [modalOpen, fetchAgents]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, priorityFilter, debouncedSearch]);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!formData.title.trim()) {
      setFormError('Title is required');
      return;
    }
    setFormLoading(true);
    try {
      const payload: Record<string, unknown> = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        priority: formData.priority,
      };
      if (formData.assignedTo) payload['assignedTo'] = formData.assignedTo;
      if (formData.tags) {
        payload['tags'] = formData.tags.split(',').map((t) => t.trim()).filter(Boolean);
      }
      const { data } = await api.post<{ success: boolean; data?: Ticket }>('/tickets', payload);
      if (data.success && data.data) {
        setModalOpen(false);
        setFormData({ title: '', description: '', priority: 'medium', assignedTo: '', tags: '' });
        navigate(`/tickets/${data.data.id}`);
      }
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: { message?: string } } } };
      setFormError(axErr?.response?.data?.error?.message ?? 'Failed to create ticket');
    } finally {
      setFormLoading(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  const agentOptions = [
    { value: '', label: 'Unassigned' },
    ...agents.map((a) => ({ value: a.id, label: `${a.firstName} ${a.lastName}` })),
  ];

  return (
    <div className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tickets</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} total tickets</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus size={16} />
          New Ticket
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tickets..."
              className="block w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <Select
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="sm:w-44"
          />
          <Select
            options={PRIORITY_OPTIONS}
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="sm:w-44"
          />
        </div>
      </Card>

      {/* Table */}
      <Card padding={false}>
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <TicketIcon size={36} className="mb-3 opacity-30" />
            <p className="text-sm font-medium">No tickets found</p>
            <p className="text-xs mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-medium text-gray-500 px-6 py-3">ID</th>
                    <th className="text-left text-xs font-medium text-gray-500 px-3 py-3">Title</th>
                    <th className="text-left text-xs font-medium text-gray-500 px-3 py-3">Status</th>
                    <th className="text-left text-xs font-medium text-gray-500 px-3 py-3">Priority</th>
                    <th className="text-left text-xs font-medium text-gray-500 px-3 py-3">Assignee</th>
                    <th className="text-left text-xs font-medium text-gray-500 px-3 py-3 pr-6">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {tickets.map((ticket) => (
                    <tr
                      key={ticket.id}
                      onClick={() => navigate(`/tickets/${ticket.id}`)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-3 text-xs text-gray-400 font-mono">{ticket.id.slice(0, 8)}</td>
                      <td className="px-3 py-3">
                        <p className="text-sm text-gray-900 font-medium truncate max-w-xs">{ticket.title}</p>
                        {ticket.tags.length > 0 && (
                          <div className="flex gap-1 mt-0.5 flex-wrap">
                            {ticket.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3"><StatusBadge status={ticket.status} /></td>
                      <td className="px-3 py-3"><PriorityBadge priority={ticket.priority} /></td>
                      <td className="px-3 py-3 text-sm text-gray-500">
                        {ticket.assignee
                          ? (
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 text-xs font-bold">
                                {ticket.assignee.firstName[0]}{ticket.assignee.lastName[0]}
                              </div>
                              <span>{ticket.assignee.firstName} {ticket.assignee.lastName}</span>
                            </div>
                          )
                          : <span className="text-gray-300">Unassigned</span>}
                      </td>
                      <td className="px-3 py-3 pr-6 text-xs text-gray-400">
                        {(() => {
                          try { return format(new Date(ticket.createdAt), 'MMM d, HH:mm'); }
                          catch { return ticket.createdAt; }
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPage((p) => p - 1)}
                    disabled={page === 1}
                  >
                    <ChevronLeft size={14} />
                  </Button>
                  <span className="text-xs text-gray-600">{page} / {totalPages}</span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page === totalPages}
                  >
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* New Ticket Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Create New Ticket" size="lg">
        <form onSubmit={(e) => void handleCreateTicket(e)} className="space-y-4">
          <Input
            label="Title"
            value={formData.title}
            onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
            placeholder="Brief description of the issue"
            required
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
              placeholder="Detailed explanation of the issue..."
              rows={4}
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Priority"
              value={formData.priority}
              onChange={(e) => setFormData((p) => ({ ...p, priority: e.target.value as TicketPriority }))}
              options={PRIORITY_OPTIONS.slice(1)}
            />
            <Select
              label="Assign to"
              value={formData.assignedTo}
              onChange={(e) => setFormData((p) => ({ ...p, assignedTo: e.target.value }))}
              options={agentOptions}
            />
          </div>
          <Input
            label="Tags"
            value={formData.tags}
            onChange={(e) => setFormData((p) => ({ ...p, tags: e.target.value }))}
            placeholder="bug, billing, feature-request (comma separated)"
            helperText="Separate tags with commas"
          />
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{formError}</div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={formLoading}>
              Create Ticket
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
