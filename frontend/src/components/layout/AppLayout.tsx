import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Ticket, Users, BarChart2, Settings,
  Bell, LogOut, ChevronDown, Menu, X, Zap,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '../../stores/auth';
import { useNotifications } from '../../hooks/useNotifications';
import { NotificationDropdown } from '../notifications/NotificationDropdown';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/tickets', icon: Ticket, label: 'Tickets' },
  { to: '/agents', icon: Users, label: 'Agents' },
  { to: '/analytics', icon: BarChart2, label: 'Analytics' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

function SidebarContent({ mobile, onClose, user }: { mobile?: boolean; onClose?: () => void; user: { firstName: string; lastName: string; role: string } | null }) {
  return (
    <div className={clsx('flex flex-col h-full', mobile ? 'w-72' : 'w-64')}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-200">
        <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
          <Zap size={18} className="text-white" />
        </div>
        <span className="text-xl font-bold text-gray-900">FlowDesk</span>
        {mobile && onClose && (
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        )}
      </div>
      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary-50 text-primary-700'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
            )}
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
      {/* User info at bottom */}
      <div className="px-4 py-4 border-t border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 text-sm font-bold">
            {user?.firstName[0]}{user?.lastName[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user?.firstName} {user?.lastName}</p>
            <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col bg-white border-r border-gray-200 flex-shrink-0">
        <SidebarContent user={user} />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <aside className="relative flex flex-col bg-white h-full shadow-xl">
            <SidebarContent mobile user={user} onClose={() => setSidebarOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top navbar */}
        <header className="bg-white border-b border-gray-200 px-4 lg:px-6 h-16 flex items-center gap-4 flex-shrink-0">
          <button
            className="lg:hidden text-gray-500 hover:text-gray-700"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="flex-1" />
          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => { setNotifOpen((v) => !v); setUserMenuOpen(false); }}
              className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {notifOpen && (
              <NotificationDropdown
                notifications={notifications}
                onClose={() => setNotifOpen(false)}
                onMarkRead={markRead}
                onMarkAllRead={markAllRead}
              />
            )}
          </div>
          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => { setUserMenuOpen((v) => !v); setNotifOpen(false); }}
              className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="w-7 h-7 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 text-xs font-bold">
                {user?.firstName[0]}{user?.lastName[0]}
              </div>
              <span className="hidden sm:block font-medium">{user?.firstName}</span>
              <ChevronDown size={14} />
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                <button
                  onClick={() => void handleLogout()}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut size={16} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>
        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
