import { useState, useEffect, useCallback } from 'react';
import { History, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { ticketService } from '../services/ticketService';
import LoadingSpinner from '../components/LoadingSpinner';

export default function ScanLogs() {
  const [data, setData] = useState({ logs: [], pagination: { total: 0, page: 1, totalPages: 1 } });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ticketService.getScanLogs({ page, limit: 30 });
      setData(res.data);
    } catch (err) {
      toast.error('Failed to load scan logs');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <History className="w-6 h-6 text-indigo-600" />
          Scan Logs
        </h1>
        <p className="text-gray-500 mt-1">{data.pagination.total} entries scanned</p>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-20"><LoadingSpinner /></div>
      ) : data.logs.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
          <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">No scans yet</p>
          <p className="text-gray-300 text-sm mt-1">Scanned tickets will appear here</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Ticket ID</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Phone</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Scanned At</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Scanner</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.logs.map((log) => (
                    <tr key={log.ticket_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{log.ticket_id}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{log.name}</td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{log.mobile}</td>
                      <td className="px-4 py-3 text-gray-700 text-xs">
                        {log.scanned_at
                          ? new Date(log.scanned_at).toLocaleString('en-IN', {
                              day: '2-digit', month: 'short',
                              hour: '2-digit', minute: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                          {log.scanned_by || 'Unknown'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Page {data.pagination.page} of {data.pagination.totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                  disabled={page >= data.pagination.totalPages}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
