import { Bell, X } from 'lucide-react';
import { useToastStore } from '../../stores/toast';

/**
 * Fixed bottom-right stack of slide-in toasts that auto-dismiss. Rendered once
 * in the app shell; new real-time notifications push a toast here.
 */
export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-start gap-3 bg-white border border-gray-200 shadow-lg rounded-xl p-3 animate-[slideIn_0.2s_ease-out]"
          style={{ animation: 'slideIn 0.2s ease-out' }}
        >
          <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
            <Bell size={16} className="text-primary-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 line-clamp-1">{t.title}</p>
            {t.body && <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{t.body}</p>}
          </div>
          <button
            onClick={() => removeToast(t.id)}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      ))}
      <style>{`@keyframes slideIn { from { transform: translateX(100%); opacity: 0 } to { transform: translateX(0); opacity: 1 } }`}</style>
    </div>
  );
}
