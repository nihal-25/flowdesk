export interface OverviewStats {
  openTickets: number;
  resolvedToday: number;
  avgResolutionTimeMs: number;
  totalAgents: number;
  activeAgents: number;
  totalTicketsThisMonth: number;
}

export interface TicketVolumeDataPoint {
  date: string; // ISO date string YYYY-MM-DD
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

export interface ResponseTimeHistogramBucket {
  rangeLabel: string; // e.g., "< 1h", "1-4h", "4-24h", "> 24h"
  count: number;
  percentage: number;
}

export interface AnalyticsOverviewResponse {
  stats: OverviewStats;
  updatedAt: string;
}

export interface TicketVolumeResponse {
  period: string;
  dataPoints: TicketVolumeDataPoint[];
}

export interface AgentsPerformanceResponse {
  agents: AgentPerformance[];
  updatedAt: string;
}

export interface ResponseTimesResponse {
  buckets: ResponseTimeHistogramBucket[];
  totalTickets: number;
  updatedAt: string;
}
