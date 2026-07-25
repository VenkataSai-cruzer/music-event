import { useState, useEffect } from 'react';
import { ticketService } from '../services/ticketService';
import { Clock, CheckCircle2, TicketPlus, Download, ScanLine, XCircle } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';

const eventConfig = {
  created: {
    icon: TicketPlus,
    label: 'Created',
    color: 'text-green-600',
    bg: 'bg-green-100',
    dot: 'bg-green-500',
  },
  entry_approved: {
    icon: CheckCircle2,
    label: 'Entry Approved',
    color: 'text-blue-600',
    bg: 'bg-blue-100',
    dot: 'bg-blue-500',
  },
  downloaded: {
    icon: Download,
    label: 'Downloaded',
    color: 'text-purple-600',
    bg: 'bg-purple-100',
    dot: 'bg-purple-500',
  },
  verified: {
    icon: ScanLine,
    label: 'Verified',
    color: 'text-indigo-600',
    bg: 'bg-indigo-100',
    dot: 'bg-indigo-500',
  },
  cancelled: {
    icon: XCircle,
    label: 'Cancelled',
    color: 'text-red-600',
    bg: 'bg-red-100',
    dot: 'bg-red-500',
  },
};

export default function TicketTimeline({ ticketId, onClose }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ticketId) return;
    setLoading(true);
    setError(null);

    ticketService.getTicketTimeline(ticketId)
      .then((res) => setEvents(res.data))
      .catch(() => setError('Failed to load timeline'))
      .finally(() => setLoading(false));
  }, [ticketId]);

  if (loading) {
    return (
      <div className="py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center">
        <p className="text-red-500 text-sm">{error}</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-gray-400 text-sm">No activity recorded for this ticket</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-gray-200" />

      <div className="space-y-0">
        {events.map((event, idx) => {
          const config = eventConfig[event.event] || {
            icon: Clock,
            label: event.event.replace(/_/g, ' '),
            color: 'text-gray-600',
            bg: 'bg-gray-100',
            dot: 'bg-gray-400',
          };
          const Icon = config.icon;
          const time = new Date(event.created_at);

          return (
            <div key={idx} className="relative flex items-start gap-4 pb-6 last:pb-0">
              {/* Dot */}
              <div className={`relative z-10 w-8 h-8 rounded-full ${config.bg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-4 h-4 ${config.color}`} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pt-0.5">
                <p className={`text-sm font-semibold ${config.color}`}>
                  {config.label}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Clock className="w-3 h-3 text-gray-400" />
                  <span className="text-xs text-gray-400">
                    {time.toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                    {' at '}
                    {time.toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                {/* Metadata if available */}
                {event.metadata && typeof event.metadata === 'object' && (
                  <div className="mt-1 text-xs text-gray-500">
                    {event.metadata.name && <span>{event.metadata.name}</span>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
