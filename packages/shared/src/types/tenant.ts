export type TenantPlan = 'free' | 'starter' | 'growth' | 'enterprise';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: TenantPlan;
  maxAgents: number;
  maxTicketsPerMonth: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTenantInput {
  name: string;
  slug: string;
  plan?: TenantPlan;
}
