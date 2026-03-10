import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { format } from 'date-fns';
import {
  Ticket, CheckCircle, Clock, Users, TrendingUp, Play,
} from 'lucide-react';
import { api } from '../lib/api';
import { loadDemoData } from '../lib/demo';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge, PriorityBadge } from '../components/ui/Badge';
import type {
  AnalyticsOverview,
  TicketVolumePoint,
  Ticket as TicketType,
  PaginatedResponse,
} from '../types';

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '—';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}

function StatCard({ title, value, icon, color, subtitle }: StatCardProps) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
          {icon}
        </div>
      </div>
    </Card>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [volumeData, setVolumeData] = useState<TicketVolumePoint[]>([]);
  const [recentTickets, setRecentTickets] = useState<TicketType[]>([]);
  const [loading, setLoading] = useState(true);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoMessage, setDemoMessage] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [overviewRes, volumeRes, ticketsRes] = await Promise.allSettled([
        api.get<{ success: boolean; data?: AnalyticsOverview }>('/analytics/overview'),
        api.get<{ success: boolean; data?: TicketVolumePoint[] }>('/analytics/tickets?period=7d'),
        api.get<{ success: boolean; data?: PaginatedResponse<TicketType> }>('/tickets?pageSize=10&sortBy=createdAt&sortOrder=desc'),
      ]);

      if (overviewRes.status === 'fulfilled' && overviewRes.value.data.success) {
        setOverview(overviewRes.value.data.data ?? null);
      }
      if (volumeRes.status === 'fulfilled' && volumeRes.value.data.success) {
        setVolumeData(volumeRes.value.data.data ?? []);
      }
      if (ticketsRes.status === 'fulfilled' && ticketsRes.value.data.success) {
        setRecentTickets(ticketsRes.value.data.data?.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const handleLoadDemo = async () => {
    setDemoLoading(true);
    setDemoMessage('');
    const result = await loadDemoData();
    setDemoMessage(result.message);
    setDemoLoading(false);
    if (result.success) {
      await fetchData();
    }
  };

  const chartData = volumeData.map((point) => ({
    ...point,
    date: (() => {
      try {
        return format(new Date(point.date), 'MMM d');
      } catch {
        return point.date;
      }
    })(),
  }));

  if (loading) {
    return (
      <div className="p-6 lg:p-8">
        <div className="animate-pulse space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 bg-gray-200 rounded-xl" />
            ))}
          </div>
          <div className="h-64 bg-gray-200 rounded-xl" />
          <div className="h-48 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Your support overview at a glance</p>
        </div>
        <div className="flex items-center gap-3">
          {demoMessage && (
            <p className="text-xs text-gray-500 max-w-xs truncate">{demoMessage}</p>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleLoadDemo()}
            isLoading={demoLoading}
          >
            <Play size={14} />
            Load Demo Data
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Open Tickets"
          value={overview?.openTickets ?? '—'}
          icon={<Ticket size={22} className="text-blue-600" />}
          color="bg-blue-50"
          subtitle="Awaiting resolution"
        />
        <StatCard
          title="Resolved Today"
          value={overview?.resolvedToday ?? '—'}
          icon={<CheckCircle size={22} className="text-green-600" />}
          color="bg-green-50"
          subtitle="Great work!"
        />
        <StatCard
          title="Avg Resolution Time"
          value={overview ? formatDuration(overview.avgResolutionTimeMs) : '—'}
          icon={<Clock size={22} className="text-amber-600" />}
          color="bg-amber-50"
          subtitle="Per ticket"
        />
        <StatCard
          title="Active Agents"
          value={overview ? `${overview.activeAgents} / ${overview.totalAgents}` : '—'}
          icon={<Users size={22} className="text-purple-600" />}
          color="bg-purple-50"
          subtitle="Currently online"
        />
      </div>

      {/* Ticket Volume Chart */}
      <Card>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Ticket Volume</h2>
            <p className="text-xs text-gray-500 mt-0.5">Last 7 days</p>
          </div>
          <TrendingUp size={18} className="text-gray-400" />
        </div>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-gray-400">
            <p className="text-sm">No data yet — try loading demo data</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line
                type="monotone"
                dataKey="created"
                name="Created"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="resolved"
                name="Resolved"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="closed"
                name="Closed"
                stroke="#94a3b8"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Recent Tickets */}
      <Card padding={false}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Recent Tickets</h2>
          <Button variant="ghost" size="sm" onClick={() => navigate('/tickets')}>
            View all
          </Button>
        </div>
        {recentTickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Ticket size={32} className="mb-3 opacity-40" />
            <p className="text-sm font-medium">No tickets yet</p>
            <p className="text-xs mt-1">Load demo data or create your first ticket</p>
          </div>
        ) : (
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
                {recentTickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => navigate(`/tickets/${ticket.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-3 text-xs text-gray-400 font-mono">{ticket.id.slice(0, 8)}</td>
                    <td className="px-3 py-3 text-sm text-gray-900 max-w-xs truncate">{ticket.title}</td>
                    <td className="px-3 py-3"><StatusBadge status={ticket.status} /></td>
                    <td className="px-3 py-3"><PriorityBadge priority={ticket.priority} /></td>
                    <td className="px-3 py-3 text-sm text-gray-500">
                      {ticket.assignee
                        ? `${ticket.assignee.firstName} ${ticket.assignee.lastName}`
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
        )}
      </Card>
    </div>
  );
}
