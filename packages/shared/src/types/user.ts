export type UserRole = 'superadmin' | 'admin' | 'agent' | 'viewer';

export type Permission =
  | 'tickets:create'
  | 'tickets:read'
  | 'tickets:update'
  | 'tickets:delete'
  | 'tickets:assign'
  | 'messages:create'
  | 'messages:read'
  | 'agents:read'
  | 'agents:invite'
  | 'agents:remove'
  | 'agents:update_role'
  | 'analytics:read'
  | 'settings:read'
  | 'settings:update'
  | 'api_keys:manage'
  | 'webhooks:manage'
  | 'audit_logs:read';

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  superadmin: [
    'tickets:create', 'tickets:read', 'tickets:update', 'tickets:delete', 'tickets:assign',
    'messages:create', 'messages:read',
    'agents:read', 'agents:invite', 'agents:remove', 'agents:update_role',
    'analytics:read', 'settings:read', 'settings:update',
    'api_keys:manage', 'webhooks:manage', 'audit_logs:read',
  ],
  admin: [
    'tickets:create', 'tickets:read', 'tickets:update', 'tickets:delete', 'tickets:assign',
    'messages:create', 'messages:read',
    'agents:read', 'agents:invite', 'agents:remove', 'agents:update_role',
    'analytics:read', 'settings:read', 'settings:update',
    'api_keys:manage', 'webhooks:manage', 'audit_logs:read',
  ],
  agent: [
    'tickets:create', 'tickets:read', 'tickets:update', 'tickets:assign',
    'messages:create', 'messages:read',
    'agents:read',
    'analytics:read', 'settings:read',
  ],
  viewer: [
    'tickets:read', 'messages:read', 'agents:read', 'analytics:read', 'settings:read',
  ],
};

export interface User {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  avatarUrl: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithTenant extends User {
  tenant: {
    id: string;
    name: string;
    slug: string;
    plan: string;
  };
}

export interface PublicUser {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  avatarUrl: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}
