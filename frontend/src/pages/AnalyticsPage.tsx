import { useEffect, useState, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, BarChart, Bar,
} from 'recharts';
import { format } from 'date-fns';
import { TrendingUp, Clock, Users, Ticket, Circle } from 'lucide-react';
import { api } from '../lib/api';
import { Card } from '../components/ui/Card';
import type { AnalyticsOverview, TicketVolumePoint, AgentPerformance } from '../types';

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '—';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.floor(ms / 1000)}s`;
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

export function AnalyticsPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [volumeData, setVolumeData] = useState<TicketVolumePoint[]>([]);
  const [agentPerformance, setAgentPerformance] = useState<AgentPerformance[]>([]);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('7d');
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewRes, volumeRes, agentRes] = await Promise.allSettled([
        api.get<{ success: boolean; data?: AnalyticsOverview }>('/analytics/overview'),
        api.get<{ success: boolean; data?: TicketVolumePoint[] }>(`/analytics/tickets?period=${period}`),
        api.get<{ success: boolean; data?: AgentPerformance[] }>('/analytics/agents'),
      ]);

      if (overviewRes.status === 'fulfilled' && overviewRes.value.data.success) {
        setOverview(overviewRes.value.data.data ?? null);
      }
      if (volumeRes.status === 'fulfilled' && volumeRes.value.data.success) {
        setVolumeData(volumeRes.value.data.data ?? []);
      }
      if (agentRes.status === 'fulfilled' && agentRes.value.data.success) {
        setAgentPerformance(agentRes.value.data.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const chartData = volumeData.map((point) => ({
    ...point,
    date: (() => {
      try {
        return format(new Date(point.date), period === '7d' ? 'MMM d' : 'MMM d');
      } catch {
        return point.date;
      }
    })(),
  }));

  const agentBarData = agentPerformance.map((a) => ({
    name: `${a.firstName} ${a.lastName}`.split(' ')[0],
    resolved: a.resolvedCount,
    assigned: a.assignedCount,
    avgResponse: Math.floor(a.avgResponseTimeMs / 60000),
  }));

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">Support performance metrics</p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {(['7d', '30d', '90d'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                period === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p === '7d' ? '7 days' : p === '30d' ? '30 days' : '90 days'}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Stats */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-gray-200 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Open Tickets"
            value={overview?.openTickets ?? '—'}
            icon={<Ticket size={22} className="text-blue-600" />}
            color="bg-blue-50"
            subtitle="Currently open"
          />
          <StatCard
            title="Resolved Today"
            value={overview?.resolvedToday ?? '—'}
            icon={<TrendingUp size={22} className="text-green-600" />}
            color="bg-green-50"
            subtitle="Closed today"
          />
          <StatCard
            title="Avg Resolution"
            value={overview ? formatDuration(overview.avgResolutionTimeMs) : '—'}
            icon={<Clock size={22} className="text-amber-600" />}
            color="bg-amber-50"
            subtitle="Time to resolve"
          />
          <StatCard
            title="Active Agents"
            value={overview ? `${overview.activeAgents} / ${overview.totalAgents}` : '—'}
            icon={<Users size={22} className="text-purple-600" />}
            color="bg-purple-50"
            subtitle="Online now"
          />
        </div>
      )}

      {/* Ticket Volume Chart */}
      <Card>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Ticket Volume</h2>
            <p className="text-xs text-gray-500 mt-0.5">Created, resolved, and closed over time</p>
          </div>
          <TrendingUp size={18} className="text-gray-400" />
        </div>
        {loading ? (
          <div className="h-56 bg-gray-100 rounded-lg animate-pulse" />
        ) : chartData.length === 0 ? (
          <div className="flex items-center justify-center h-56 text-gray-400">
            <p className="text-sm">No data available for this period</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line type="monotone" dataKey="created" name="Created" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="resolved" name="Resolved" stroke="#22c55e" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="closed" name="Closed" stroke="#94a3b8" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Agent Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bar chart */}
        <Card>
          <div className="mb-4">
            <h2 className="text-base font-semibold text-gray-900">Agent Resolved Tickets</h2>
            <p className="text-xs text-gray-500 mt-0.5">Assigned vs resolved per agent</p>
          </div>
          {loading ? (
            <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />
          ) : agentBarData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400">
              <p className="text-sm">No agent data available</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={agentBarData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="assigned" name="Assigned" fill="#e0e7ff" radius={[4, 4, 0, 0]} />
                <Bar dataKey="resolved" name="Resolved" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Agent table */}
        <Card padding={false}>
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Agent Performance</h2>
          </div>
          {loading ? (
            <div className="p-4 space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
            </div>
          ) : agentPerformance.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <p className="text-sm">No agent data</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-50">
                    <th className="text-left text-xs font-medium text-gray-500 px-6 py-2">Agent</th>
                    <th className="text-right text-xs font-medium text-gray-500 px-3 py-2">Assigned</th>
                    <th className="text-right text-xs font-medium text-gray-500 px-3 py-2">Resolved</th>
                    <th className="text-right text-xs font-medium text-gray-500 px-3 py-2 pr-6">Avg Resp.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {agentPerformance.map((agent) => (
                    <tr key={agent.agentId}>
                      <td className="px-6 py-2.5">
                        <div className="flex items-center gap-2">
                          <Circle
                            size={8}
                            className={agent.isOnline ? 'fill-green-500 text-green-500' : 'fill-gray-300 text-gray-300'}
                          />
                          <div>
                            <p className="text-sm font-medium text-gray-900 truncate max-w-32">
                              {agent.firstName} {agent.lastName}
                            </p>
                            <p className="text-xs text-gray-400 truncate max-w-32">{agent.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm text-gray-600">{agent.assignedCount}</td>
                      <td className="px-3 py-2.5 text-right text-sm text-gray-600">{agent.resolvedCount}</td>
                      <td className="px-3 py-2.5 pr-6 text-right text-sm text-gray-600">
                        {formatDuration(agent.avgResponseTimeMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
