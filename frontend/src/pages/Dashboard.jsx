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
  ScanLine,
  UserCheck,
  Music,
  LogIn,
  Activity,
  TrendingUp,
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
    { icon: ScanLine, label: "Today's Scans", value: stats?.todayScanned, color: 'blue' },
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

      {/* Event Info Bar */}
      {stats?.currentEvent?.event_name && (
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-5 text-white">
          <div className="flex items-center gap-3 mb-2">
            <Music className="w-5 h-5" />
            <span className="text-sm font-medium uppercase tracking-wider opacity-80">Current Event</span>
          </div>
          <h2 className="text-xl font-bold">{stats.currentEvent.event_name}</h2>
          <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-sm text-white/80">
            {stats.currentEvent.event_date && (
              <span>📅 {new Date(stats.currentEvent.event_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
            )}
            {stats.currentEvent.event_time && <span>⏰ {stats.currentEvent.event_time}</span>}
            {stats.currentEvent.venue_name && <span>📍 {stats.currentEvent.venue_name}</span>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Latest Tickets */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Latest Tickets</h3>
            <Link to="/tickets" className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {stats?.latestTickets?.length > 0 ? (
              stats.latestTickets.map((ticket) => (
                <div key={ticket.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{ticket.name}</p>
                    <p className="text-xs text-gray-500">{ticket.ticket_id}</p>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    ticket.status === 'VALID' ? 'bg-green-100 text-green-700'
                    : ticket.status === 'USED' ? 'bg-amber-100 text-amber-700'
                    : 'bg-red-100 text-red-700'
                  }`}>
                    {ticket.status}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">No tickets yet</p>
            )}
          </div>
        </div>

        {/* Status Column */}
        <div className="space-y-4">
          {/* Latest Scan */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <ScanLine className="w-4 h-4 text-blue-500" />
              Latest Scan
            </div>
            {stats?.latestScan ? (
              <>
                <p className="text-lg font-semibold text-gray-900">{stats.latestScan.name}</p>
                <p className="text-xs text-gray-500">{stats.latestScan.ticket_id}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(stats.latestScan.scanned_at).toLocaleTimeString()}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-400">No scans yet</p>
            )}
          </div>

          {/* Last Generated */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <UserCheck className="w-4 h-4 text-green-500" />
              Last Generated
            </div>
            {stats?.lastGenerated ? (
              <>
                <p className="text-lg font-semibold text-gray-900">{stats.lastGenerated.name}</p>
                <p className="text-xs text-gray-500">{stats.lastGenerated.ticket_id}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(stats.lastGenerated.created_at).toLocaleTimeString()}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-400">No tickets yet</p>
            )}
          </div>

          {/* Last Login */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <LogIn className="w-4 h-4 text-purple-500" />
              Last Login
            </div>
            {stats?.lastLoginAt ? (
              <p className="text-sm text-gray-900">
                {new Date(stats.lastLoginAt).toLocaleString()}
              </p>
            ) : (
              <p className="text-sm text-gray-400">First login not recorded</p>
            )}
          </div>

          {/* Scanner Stats Summary */}
          {stats?.todayScanned > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                <TrendingUp className="w-4 h-4 text-indigo-500" />
                Scanner Summary
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Scanned Today</span>
                  <span className="font-semibold text-gray-900">{stats.todayScanned}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Inside Venue</span>
                  <span className="font-semibold text-gray-900">{stats.used}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Remaining</span>
                  <span className="font-semibold text-gray-900">{stats.remaining}</span>
                </div>
                <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
                  <div className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${stats.total > 0 ? (stats.used / stats.total) * 100 : 0}%` }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Usage Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-indigo-500" />
            <h3 className="font-semibold text-gray-900">Usage Overview</h3>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Used', value: stats?.used || 0, color: 'bg-amber-400', max: Math.max(stats?.total || 1, 1) },
              { label: 'Valid', value: stats?.valid || 0, color: 'bg-green-400', max: Math.max(stats?.total || 1, 1) },
              { label: 'Remaining', value: stats?.remaining || 0, color: 'bg-indigo-400', max: Math.max(stats?.total || 1, 1) },
            ].map((bar) => (
              <div key={bar.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{bar.label}</span>
                  <span className="font-medium text-gray-900">{bar.value}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div
                    className={`${bar.color} h-2.5 rounded-full transition-all duration-500`}
                    style={{ width: `${(bar.value / bar.max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Hourly Entries */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-indigo-500" />
            <h3 className="font-semibold text-gray-900">Hourly Entries (Last 12h)</h3>
          </div>
          {stats?.hourlyEntries?.length > 0 ? (
            <div className="flex items-end gap-2 h-32">
              {stats.hourlyEntries.map((h, i) => {
                const maxCount = Math.max(...stats.hourlyEntries.map((x) => parseInt(x.count, 10)), 1);
                const height = (parseInt(h.count, 10) / maxCount) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs font-medium text-gray-700">{h.count}</span>
                    <div
                      className="w-full bg-indigo-500 rounded-t-md transition-all duration-500"
                      style={{ height: `${height}%`, minHeight: '4px' }}
                    />
                    <span className="text-xs text-gray-400">{h.hour}:00</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">No entry data yet</p>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-indigo-500" />
          <h3 className="font-semibold text-gray-900">Recent Activity</h3>
        </div>
        <div className="space-y-2">
          {stats?.recentActivity?.length > 0 ? (
            stats.recentActivity.map((act, idx) => (
              <div key={idx} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg text-sm">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    act.event === 'created' ? 'bg-green-500'
                    : act.event === 'entry_approved' ? 'bg-blue-500'
                    : 'bg-gray-400'
                  }`} />
                  <span className="font-mono text-xs text-gray-500">{act.ticket_id}</span>
                  <span className="text-gray-700">{act.event.replace(/_/g, ' ')}</span>
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(act.created_at).toLocaleTimeString()}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">No recent activity</p>
          )}
        </div>
      </div>
    </div>
  );
}
