import clsx from 'clsx';
import type { TicketStatus, TicketPriority } from '../../types';

const statusColors: Record<TicketStatus, string> = {
  open: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  resolved: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-600',
};

const priorityColors: Record<TicketPriority, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

interface StatusBadgeProps { status: TicketStatus; }
interface PriorityBadgeProps { priority: TicketPriority; }

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize', statusColors[status])}>
      {status.replace('_', ' ')}
    </span>
  );
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize', priorityColors[priority])}>
      {priority}
    </span>
  );
}
