import { useState, useEffect, useCallback } from 'react';
import { History, ChevronLeft, ChevronRight, RefreshCw, Search, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { ticketService } from '../services/ticketService';
import LoadingSpinner from '../components/LoadingSpinner';

export default function ScanHistory() {
  const [data, setData] = useState({ scans: [], pagination: { total: 0, page: 1, totalPages: 1 } });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const fetchScans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ticketService.getScanHistory(page);
      setData(res.data);
    } catch (err) {
      toast.error('Failed to load scan history');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchScans();
  }, [fetchScans]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <History className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Scan History</h1>
            <p className="text-gray-500 text-sm">{data.pagination.total} entries scanned</p>
          </div>
        </div>
        <button
          onClick={fetchScans}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-20"><LoadingSpinner /></div>
      ) : data.scans.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
          <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">No scans recorded yet</p>
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
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Gender</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Scan Time</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Approved By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.scans.map((scan) => (
                    <tr key={scan.ticket_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{scan.ticket_id}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{scan.name}</td>
                      <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{scan.gender}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {scan.scanned_at
                          ? new Date(scan.scanned_at).toLocaleString()
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                          USED
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell">Admin</td>
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
                  className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                  disabled={page >= data.pagination.totalPages}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-40 transition-colors"
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
