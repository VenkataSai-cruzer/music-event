import { useState, useEffect } from 'react';
import { RefreshCw, Ticket, ScanLine, Users, CalendarDays, Clock } from 'lucide-react';
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
        <button onClick={fetchDashboard} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Top Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Ticket} label="Tickets Generated" value={stats?.total} color="indigo" />
        <StatCard icon={ScanLine} label="Tickets Used" value={stats?.used} color="green" />
        <StatCard icon={Users} label="Remaining" value={stats?.remaining} color="amber" />
        <StatCard icon={CalendarDays} label="Today's Entries" value={stats?.todayScanned} color="blue" />
      </div>

      {/* Event Info */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-5 text-white">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xl">&#9835;</span>
          <span className="text-xs font-medium uppercase tracking-wider opacity-80">7 NOTES Live Jamming Session</span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-white/80">
          <span>&#128205; CAFOOZE, Vizianagaram</span>
          <span>&#128197; 08 Aug 2026</span>
          <span>&#9200; 5:30 PM - 9:00 PM</span>
        </div>
      </div>

      {/* Latest Activity + Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Latest Scan */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <ScanLine className="w-4 h-4 text-green-500" />
            <h3 className="font-semibold text-gray-900 text-sm">Latest Scan</h3>
          </div>
          {stats?.latestScan ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">{stats.latestScan.name}</span>
                <span className="text-xs text-gray-400">{stats.latestScan.ticket_id}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Gate: {stats.latestScan.scanned_by || '—'}</span>
                <span>{new Date(stats.latestScan.scanned_at).toLocaleTimeString()}</span>
              </div>
              <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                Approved
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-2">No scans yet</p>
          )}
        </div>

        {/* Latest Ticket */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Ticket className="w-4 h-4 text-indigo-500" />
            <h3 className="font-semibold text-gray-900 text-sm">Latest Ticket</h3>
          </div>
          {stats?.lastGenerated ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">{stats.lastGenerated.name}</span>
                <span className="text-xs text-gray-400">{stats.lastGenerated.ticket_id}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Status: Generated</span>
                <span>{new Date(stats.lastGenerated.created_at).toLocaleTimeString()}</span>
              </div>
              <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">
                Generated
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-2">No tickets yet</p>
          )}
        </div>

      </div>

      {/* Progress Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900 text-sm">Entry Progress</h3>
          <span className="text-sm text-gray-500">{stats?.used || 0} / {stats?.total || 0}</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3">
          <div
            className="bg-gradient-to-r from-indigo-500 to-purple-500 h-3 rounded-full transition-all duration-500"
            style={{ width: `${stats?.total > 0 ? (stats.used / stats.total) * 100 : 0}%` }}
          />
        </div>
      </div>

    </div>
  );
}
