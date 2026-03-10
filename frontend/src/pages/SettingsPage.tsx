import { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import {
  User, Key, Webhook, Users, Eye, EyeOff,
  Copy, Check, Trash2, Plus, UserPlus,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import type { ApiKey, WebhookEndpoint, Agent, PaginatedResponse, UserRole } from '../types';

type Tab = 'profile' | 'apikeys' | 'webhooks' | 'team';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'profile', label: 'Profile', icon: <User size={16} /> },
  { id: 'apikeys', label: 'API Keys', icon: <Key size={16} /> },
  { id: 'webhooks', label: 'Webhooks', icon: <Webhook size={16} /> },
  { id: 'team', label: 'Team', icon: <Users size={16} /> },
];

const WEBHOOK_EVENTS = [
  'ticket.created',
  'ticket.updated',
  'ticket.resolved',
  'ticket.closed',
  'ticket.assigned',
  'message.created',
  'agent.invited',
];

const ROLE_OPTIONS = [
  { value: 'agent', label: 'Agent' },
  { value: 'admin', label: 'Admin' },
  { value: 'viewer', label: 'Viewer' },
];

// ---- Profile Tab ----
function ProfileTab() {
  const { user, fetchMe } = useAuthStore();
  const [form, setForm] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    email: user?.email ?? '',
  });
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [profileLoading, setProfileLoading] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwError, setPwError] = useState('');
  const [showPw, setShowPw] = useState(false);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg('');
    setProfileLoading(true);
    try {
      await api.patch('/auth/me', { firstName: form.firstName, lastName: form.lastName });
      await fetchMe();
      setProfileMsg('Profile updated successfully');
    } catch { /* ignore */ } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg('');
    setPwError('');
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError('Passwords do not match');
      return;
    }
    if (pwForm.newPassword.length < 8) {
      setPwError('Password must be at least 8 characters');
      return;
    }
    setPwLoading(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      setPwMsg('Password changed successfully');
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: { message?: string } } } };
      setPwError(axErr?.response?.data?.error?.message ?? 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <Card>
        <h3 className="text-base font-semibold text-gray-900 mb-4">Personal Information</h3>
        <form onSubmit={(e) => void handleProfileSave(e)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="First name"
              value={form.firstName}
              onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
            />
            <Input
              label="Last name"
              value={form.lastName}
              onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
            />
          </div>
          <Input
            label="Email"
            type="email"
            value={form.email}
            disabled
            helperText="Email cannot be changed"
          />
          {profileMsg && <p className="text-sm text-green-600">{profileMsg}</p>}
          <div className="flex justify-end">
            <Button type="submit" isLoading={profileLoading}>Save changes</Button>
          </div>
        </form>
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-gray-900 mb-4">Change Password</h3>
        <form onSubmit={(e) => void handlePasswordChange(e)} className="space-y-4">
          <div className="relative">
            <Input
              label="Current password"
              type={showPw ? 'text' : 'password'}
              value={pwForm.currentPassword}
              onChange={(e) => setPwForm((p) => ({ ...p, currentPassword: e.target.value }))}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-8 text-gray-400 hover:text-gray-600"
            >
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <Input
            label="New password"
            type="password"
            value={pwForm.newPassword}
            onChange={(e) => setPwForm((p) => ({ ...p, newPassword: e.target.value }))}
            autoComplete="new-password"
          />
          <Input
            label="Confirm new password"
            type="password"
            value={pwForm.confirmPassword}
            onChange={(e) => setPwForm((p) => ({ ...p, confirmPassword: e.target.value }))}
            autoComplete="new-password"
          />
          {pwError && <p className="text-sm text-red-600">{pwError}</p>}
          {pwMsg && <p className="text-sm text-green-600">{pwMsg}</p>}
          <div className="flex justify-end">
            <Button type="submit" isLoading={pwLoading}>Change password</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

// ---- API Keys Tab ----
function ApiKeysTab() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [rawKey, setRawKey] = useState('');
  const [rawKeyModalOpen, setRawKeyModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ success: boolean; data?: ApiKey[] }>('/settings/api-keys');
      if (data.success && data.data) setApiKeys(data.data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchKeys(); }, [fetchKeys]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    if (!newKeyName.trim()) { setCreateError('Name is required'); return; }
    setCreateLoading(true);
    try {
      const { data } = await api.post<{ success: boolean; data?: { key: string; apiKey: ApiKey } }>(
        '/settings/api-keys',
        { name: newKeyName.trim() }
      );
      if (data.success && data.data) {
        setRawKey(data.data.key);
        setCreateModalOpen(false);
        setNewKeyName('');
        setRawKeyModalOpen(true);
        await fetchKeys();
      }
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: { message?: string } } } };
      setCreateError(axErr?.response?.data?.error?.message ?? 'Failed to create key');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await api.delete(`/settings/api-keys/${id}`);
      setApiKeys((prev) => prev.filter((k) => k.id !== id));
    } catch { /* ignore */ }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(rawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex justify-end">
        <Button onClick={() => setCreateModalOpen(true)}>
          <Plus size={14} />
          Create API Key
        </Button>
      </div>

      <Card padding={false}>
        {loading ? (
          <div className="p-4 space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}</div>
        ) : apiKeys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Key size={32} className="mb-3 opacity-30" />
            <p className="text-sm">No API keys yet</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-500 px-6 py-3">Name</th>
                <th className="text-left text-xs font-medium text-gray-500 px-3 py-3">Key Prefix</th>
                <th className="text-left text-xs font-medium text-gray-500 px-3 py-3">Created</th>
                <th className="text-left text-xs font-medium text-gray-500 px-3 py-3">Last Used</th>
                <th className="px-3 py-3 pr-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {apiKeys.map((key) => (
                <tr key={key.id}>
                  <td className="px-6 py-3 text-sm font-medium text-gray-900">{key.name}</td>
                  <td className="px-3 py-3 text-xs font-mono text-gray-500">{key.keyPrefix}…</td>
                  <td className="px-3 py-3 text-xs text-gray-400">
                    {(() => { try { return format(new Date(key.createdAt), 'MMM d, yyyy'); } catch { return '—'; } })()}
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-400">
                    {key.lastUsedAt
                      ? (() => { try { return format(new Date(key.lastUsedAt), 'MMM d, yyyy'); } catch { return '—'; } })()
                      : <span className="text-gray-300">Never</span>}
                  </td>
                  <td className="px-3 py-3 pr-6 text-right">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => void handleRevoke(key.id)}
                    >
                      <Trash2 size={12} />
                      Revoke
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Create Key Modal */}
      <Modal isOpen={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Create API Key">
        <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
          <Input
            label="Key name"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="e.g. Production Integration"
            helperText="A descriptive name to identify this key"
          />
          {createError && <p className="text-sm text-red-600">{createError}</p>}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => setCreateModalOpen(false)}>Cancel</Button>
            <Button type="submit" isLoading={createLoading}>Create Key</Button>
          </div>
        </form>
      </Modal>

      {/* Show Raw Key Modal */}
      <Modal isOpen={rawKeyModalOpen} onClose={() => setRawKeyModalOpen(false)} title="API Key Created">
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
            Copy this key now — you won't be able to see it again.
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-gray-100 px-3 py-2 rounded-lg break-all font-mono">{rawKey}</code>
            <Button variant="secondary" size="sm" onClick={() => void handleCopy()}>
              {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
            </Button>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setRawKeyModalOpen(false)}>Done</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---- Webhooks Tab ----
function WebhooksTab() {
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  const fetchWebhooks = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ success: boolean; data?: WebhookEndpoint[] }>('/settings/webhooks');
      if (data.success && data.data) setWebhooks(data.data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchWebhooks(); }, [fetchWebhooks]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    if (!webhookUrl.trim()) { setCreateError('URL is required'); return; }
    if (selectedEvents.length === 0) { setCreateError('Select at least one event'); return; }
    setCreateLoading(true);
    try {
      const { data } = await api.post<{ success: boolean; data?: WebhookEndpoint }>(
        '/settings/webhooks',
        { url: webhookUrl.trim(), events: selectedEvents }
      );
      if (data.success) {
        setModalOpen(false);
        setWebhookUrl('');
        setSelectedEvents([]);
        await fetchWebhooks();
      }
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: { message?: string } } } };
      setCreateError(axErr?.response?.data?.error?.message ?? 'Failed to create webhook');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/settings/webhooks/${id}`);
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
    } catch { /* ignore */ }
  };

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex justify-end">
        <Button onClick={() => setModalOpen(true)}>
          <Plus size={14} />
          Add Webhook
        </Button>
      </div>

      <Card padding={false}>
        {loading ? (
          <div className="p-4 space-y-3">{[...Array(2)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />)}</div>
        ) : webhooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Webhook size={32} className="mb-3 opacity-30" />
            <p className="text-sm">No webhooks configured</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {webhooks.map((webhook) => (
              <div key={webhook.id} className="px-6 py-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono text-gray-900 truncate">{webhook.url}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {webhook.events.map((evt) => (
                      <span key={evt} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{evt}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className={`text-xs font-medium ${webhook.isActive ? 'text-green-600' : 'text-gray-400'}`}>
                      {webhook.isActive ? 'Active' : 'Inactive'}
                    </span>
                    {webhook.consecutiveFailures > 0 && (
                      <span className="text-xs text-red-500">{webhook.consecutiveFailures} failures</span>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => void handleDelete(webhook.id)}>
                  <Trash2 size={14} className="text-red-500" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Create Webhook Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Add Webhook Endpoint" size="lg">
        <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
          <Input
            label="Endpoint URL"
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://your-server.com/webhook"
            required
          />
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Events to subscribe</label>
            <div className="grid grid-cols-2 gap-2">
              {WEBHOOK_EVENTS.map((event) => (
                <label key={event} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedEvents.includes(event)}
                    onChange={() => toggleEvent(event)}
                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  {event}
                </label>
              ))}
            </div>
          </div>
          {createError && <p className="text-sm text-red-600">{createError}</p>}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" isLoading={createLoading}>Add Webhook</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ---- Team Tab ----
function TeamTab() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: '', firstName: '', lastName: '', role: 'agent' as UserRole,
  });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ success: boolean; data?: PaginatedResponse<Agent> }>('/agents?pageSize=100');
      if (data.success && data.data) setAgents(data.data.items);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchAgents(); }, [fetchAgents]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    setInviteLoading(true);
    try {
      await api.post('/auth/invite', inviteForm);
      setInviteSuccess(`Invitation sent to ${inviteForm.email}`);
      setInviteForm({ email: '', firstName: '', lastName: '', role: 'agent' });
      await fetchAgents();
      setTimeout(() => { setInviteModalOpen(false); setInviteSuccess(''); }, 1500);
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

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex justify-end">
        <Button onClick={() => setInviteModalOpen(true)}>
          <UserPlus size={14} />
          Invite Member
        </Button>
      </div>

      <Card padding={false}>
        {loading ? (
          <div className="p-4 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}</div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Users size={32} className="mb-3 opacity-30" />
            <p className="text-sm">No team members</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-500 px-6 py-3">Member</th>
                <th className="text-left text-xs font-medium text-gray-500 px-3 py-3">Role</th>
                <th className="text-left text-xs font-medium text-gray-500 px-3 py-3">Status</th>
                <th className="text-left text-xs font-medium text-gray-500 px-3 py-3 pr-6">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {agents.map((agent) => (
                <tr key={agent.id}>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 text-xs font-bold flex-shrink-0">
                        {agent.firstName[0]}{agent.lastName[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{agent.firstName} {agent.lastName}</p>
                        <p className="text-xs text-gray-400">{agent.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={agent.role}
                      onChange={(e) => void handleRoleChange(agent.id, e.target.value as UserRole)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                    >
                      {ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${agent.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {agent.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-3 py-3 pr-6 text-xs text-gray-400">
                    {(() => { try { return format(new Date(agent.createdAt), 'MMM d, yyyy'); } catch { return '—'; } })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Invite Modal */}
      <Modal isOpen={inviteModalOpen} onClose={() => setInviteModalOpen(false)} title="Invite Team Member">
        <form onSubmit={(e) => void handleInvite(e)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="First name"
              value={inviteForm.firstName}
              onChange={(e) => setInviteForm((p) => ({ ...p, firstName: e.target.value }))}
              required
            />
            <Input
              label="Last name"
              value={inviteForm.lastName}
              onChange={(e) => setInviteForm((p) => ({ ...p, lastName: e.target.value }))}
              required
            />
          </div>
          <Input
            label="Email address"
            type="email"
            value={inviteForm.email}
            onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))}
            required
          />
          <Select
            label="Role"
            value={inviteForm.role}
            onChange={(e) => setInviteForm((p) => ({ ...p, role: e.target.value as UserRole }))}
            options={ROLE_OPTIONS}
          />
          {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
          {inviteSuccess && <p className="text-sm text-green-600">{inviteSuccess}</p>}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => setInviteModalOpen(false)}>Cancel</Button>
            <Button type="submit" isLoading={inviteLoading}>Send Invitation</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ---- Main SettingsPage ----
export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your account and workspace</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'profile' && <ProfileTab />}
      {activeTab === 'apikeys' && <ApiKeysTab />}
      {activeTab === 'webhooks' && <WebhooksTab />}
      {activeTab === 'team' && <TeamTab />}
    </div>
  );
}
