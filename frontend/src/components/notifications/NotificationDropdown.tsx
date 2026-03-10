import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Bell } from 'lucide-react';
import type { Notification } from '../../types';

interface Props {
  notifications: Notification[];
  onClose: () => void;
  onMarkRead: (id: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
}

export function NotificationDropdown({ notifications, onClose, onMarkRead, onMarkAllRead }: Props) {
  const navigate = useNavigate();

  const handleNotifClick = async (notif: Notification) => {
    if (!notif.isRead) await onMarkRead(notif.id);
    if (notif.entityType === 'ticket' && notif.entityId) {
      navigate(`/tickets/${notif.entityId}`);
    }
    onClose();
  };

  return (
    <div className="absolute right-0 top-full mt-1 w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">Notifications</h3>
        <button onClick={() => void onMarkAllRead()} className="text-xs text-primary-600 hover:underline">
          Mark all read
        </button>
      </div>
      <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400">
            <Bell size={28} className="mb-2" />
            <p className="text-sm">No notifications</p>
          </div>
        ) : (
          notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => void handleNotifClick(n)}
              className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${!n.isRead ? 'bg-primary-50/50' : ''}`}
            >
              <div className="flex items-start gap-2">
                {!n.isRead && <div className="w-2 h-2 bg-primary-500 rounded-full mt-1.5 flex-shrink-0" />}
                {n.isRead && <div className="w-2 h-2 mt-1.5 flex-shrink-0" />}
                <div>
                  <p className="text-sm font-medium text-gray-900 line-clamp-1">{n.title}</p>
                  <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{n.body}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                  </p>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
