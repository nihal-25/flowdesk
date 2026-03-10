import { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { UserPlus, Users, Circle, Mail, Shield } from 'lucide-react';
import { api } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import type { Agent, PaginatedResponse, UserRole } from '../types';

const ROLE_OPTIONS = [
  { value: 'agent', label: 'Agent' },
  { value: 'admin', label: 'Admin' },
  { value: 'viewer', label: 'Viewer' },
];

const ROLE_COLORS: Record<UserRole, string> = {
  superadmin: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
  agent: 'bg-green-100 text-green-700',
  viewer: 'bg-gray-100 text-gray-600',
};

interface InviteForm {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteForm>({
    email: '',
    firstName: '',
    lastName: '',
    role: 'agent',
  });
  const [inviteError, setInviteError] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState('');

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ success: boolean; data?: PaginatedResponse<Agent> }>(
        '/agents?pageSize=100&sortBy=createdAt&sortOrder=desc'
      );
      if (data.success && data.data) {
        setAgents(data.data.items);
        setTotal(data.data.pagination.total);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    setInviteLoading(true);
    try {
      const { data } = await api.post<{ success: boolean; data?: { message?: string } }>(
        '/auth/invite',
        inviteForm
      );
      if (data.success) {
        setInviteSuccess(`Invitation sent to ${inviteForm.email}`);
        setInviteForm({ email: '', firstName: '', lastName: '', role: 'agent' });
        await fetchAgents();
        setTimeout(() => {
          setModalOpen(false);
          setInviteSuccess('');
        }, 2000);
      }
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: { message?: string } } } };
      setInviteError(axErr?.response?.data?.error?.message ?? 'Failed to send invitation');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRoleChange = async (agentId: string, role: UserRole) => {
    try {
      await api.patch(`/agents/${agentId}`, { role });
      setAgents((prev) => prev.map((a) => a.id === agentId ? { ...a, role } : a));
    } catch { /* ignore */ }
  };

  const handleToggleActive = async (agentId: string, isActive: boolean) => {
    try {
      await api.patch(`/agents/${agentId}`, { isActive: !isActive });
      setAgents((prev) => prev.map((a) => a.id === agentId ? { ...a, isActive: !isActive } : a));
    } catch { /* ignore */ }
  };

  return (
    <div className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agents</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} team members</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <UserPlus size={16} />
          Invite Agent
        </Button>
      </div>

      {/* Agents Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-36 bg-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Users size={36} className="mb-3 opacity-30" />
            <p className="text-sm font-medium">No agents yet</p>
            <p className="text-xs mt-1">Invite your first team member</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <Card key={agent.id} className="relative">
              {/* Online indicator */}
              <div className="absolute top-4 right-4">
                <Circle
                  size={10}
                  className={agent.isOnline ? 'fill-green-500 text-green-500' : 'fill-gray-300 text-gray-300'}
                />
              </div>
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 font-bold text-sm flex-shrink-0">
                  {agent.firstName[0]}{agent.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {agent.firstName} {agent.lastName}
                    </p>
                    {!agent.isActive && (
                      <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded">Inactive</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Mail size={11} className="text-gray-400" />
                    <p className="text-xs text-gray-500 truncate">{agent.email}</p>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <Shield size={11} className="text-gray-400" />
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium capitalize ${ROLE_COLORS[agent.role]}`}>
                      {agent.role}
                    </span>
                  </div>
                  {typeof agent.ticketCount === 'number' && (
                    <p className="text-xs text-gray-400 mt-1">{agent.ticketCount} assigned tickets</p>
                  )}
                  {agent.lastLoginAt && (
                    <p className="text-xs text-gray-300 mt-1">
                      Last seen {(() => { try { return format(new Date(agent.lastLoginAt!), 'MMM d'); } catch { return ''; } })()}
                    </p>
                  )}
                </div>
              </div>
              {/* Actions */}
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                <select
                  value={agent.role}
                  onChange={(e) => void handleRoleChange(agent.id, e.target.value as UserRole)}
                  className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <Button
                  variant={agent.isActive ? 'danger' : 'secondary'}
                  size="sm"
                  onClick={() => void handleToggleActive(agent.id, agent.isActive)}
                >
                  {agent.isActive ? 'Deactivate' : 'Activate'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Invite Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Invite Agent">
        <form onSubmit={(e) => void handleInvite(e)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="First name"
              value={inviteForm.firstName}
              onChange={(e) => setInviteForm((p) => ({ ...p, firstName: e.target.value }))}
              placeholder="Jane"
              required
            />
            <Input
              label="Last name"
              value={inviteForm.lastName}
              onChange={(e) => setInviteForm((p) => ({ ...p, lastName: e.target.value }))}
              placeholder="Smith"
              required
            />
          </div>
          <Input
            label="Email address"
            type="email"
            value={inviteForm.email}
            onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))}
            placeholder="jane@company.com"
            required
          />
          <Select
            label="Role"
            value={inviteForm.role}
            onChange={(e) => setInviteForm((p) => ({ ...p, role: e.target.value as UserRole }))}
            options={ROLE_OPTIONS}
          />
          {inviteError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{inviteError}</div>
          )}
          {inviteSuccess && (
            <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">{inviteSuccess}</div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={inviteLoading}>
              <UserPlus size={14} />
              Send Invitation
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
