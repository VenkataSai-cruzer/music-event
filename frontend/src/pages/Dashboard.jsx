import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Ticket,
  CheckCircle,
  XCircle,
  Clock,
  CalendarDays,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { ticketService } from '../services/ticketService';
import StatCard from '../components/StatCard';
import LoadingSpinner from '../components/LoadingSpinner';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ticketService.getDashboard();
      setStats(res.data);
    } catch (err) {
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  if (loading) return <LoadingSpinner fullScreen />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-red-500 mb-4">{error}</p>
        <button
          onClick={fetchDashboard}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  const cards = [
    { icon: Ticket, label: 'Total Tickets', value: stats?.total, color: 'indigo' },
    { icon: CheckCircle, label: 'Valid Tickets', value: stats?.valid, color: 'green' },
    { icon: Clock, label: 'Used Tickets', value: stats?.used, color: 'amber' },
    { icon: XCircle, label: 'Cancelled', value: stats?.cancelled, color: 'red' },
    { icon: CalendarDays, label: "Today's Entries", value: stats?.todayEntries, color: 'purple' },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {cards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Latest Tickets */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Latest Tickets</h3>
            <Link
              to="/tickets"
              className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {stats?.latestTickets?.length > 0 ? (
              stats.latestTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{ticket.name}</p>
                    <p className="text-xs text-gray-500">{ticket.ticket_id}</p>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      ticket.status === 'VALID'
                        ? 'bg-green-100 text-green-700'
                        : ticket.status === 'USED'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {ticket.status}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">No tickets yet</p>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {stats?.recentActivity?.length > 0 ? (
              stats.recentActivity.map((activity, idx) => (
                <div
                  key={`${activity.ticket_id}-${idx}`}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{activity.name}</p>
                    <p className="text-xs text-gray-500">{activity.ticket_id}</p>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(activity.updated_at).toLocaleTimeString()}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">No recent activity</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
