import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import toast from 'react-hot-toast';
import {
  CheckCircle2, XCircle, AlertTriangle, Camera, CameraOff, ScanQrCode,
  Clock, User, Hash, MapPin, Calendar, Search, Users, DoorOpen,
} from 'lucide-react';
import { ticketService } from '../services/ticketService';

const QR_SCANNER_ID = 'qr-scanner';
const SCAN_COOLDOWN_MS = 5000;
const POLL_INTERVAL_MS = 10000; // Live counter refresh

export default function Scan() {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [counter, setCounter] = useState({ used: 0, remaining: 0, total: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const scannerRef = useRef(null);
  const recentScansRef = useRef(new Map());
  const pollTimerRef = useRef(null);

  // ── Live Counter Polling ──
  const fetchCounter = useCallback(async () => {
    try {
      const res = await ticketService.getDashboard();
      setCounter({
        used: res.data.used || 0,
        remaining: res.data.remaining || 0,
        total: res.data.total || 0,
      });
    } catch (e) { /* silent */ }
  }, []);

  useEffect(() => {
    fetchCounter();
    pollTimerRef.current = setInterval(fetchCounter, POLL_INTERVAL_MS);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [fetchCounter]);

  // ── Scanner ──
  useEffect(() => {
    const scanner = new Html5Qrcode(QR_SCANNER_ID);
    scannerRef.current = scanner;
    return () => {
      if (scanner && scanning) scanner.stop().catch(() => {});
    };
  }, []);

  const startScanner = async () => {
    setScanning(true);
    setResult(null);
    try {
      await scannerRef.current.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        onScanSuccess,
        () => {}
      );
    } catch (err) {
      toast.error('Unable to access camera. Please check permissions.');
      setScanning(false);
    }
  };

  const stopScanner = async () => {
    try { if (scannerRef.current) await scannerRef.current.stop(); } catch (e) {}
    setScanning(false);
  };

  const onScanSuccess = async (decodedText) => {
    const now = Date.now();
    const lastScan = recentScansRef.current.get(decodedText);
    if (lastScan && now - lastScan < SCAN_COOLDOWN_MS) return;
    recentScansRef.current.set(decodedText, now);
    if (recentScansRef.current.size > 50) {
      const cutoff = now - SCAN_COOLDOWN_MS;
      for (const [token, time] of recentScansRef.current) {
        if (time < cutoff) recentScansRef.current.delete(token);
      }
    }
    setProcessing(true);
    try {
      const res = await ticketService.verify(decodedText);
      setResult(res.data);
      fetchCounter();
    } catch (err) {
      const data = err.response?.data;
      setResult({ valid: false, error: data?.error || 'Invalid QR code' });
    } finally {
      setProcessing(false);
    }
  };

  const handleApproveEntry = async (ticketId) => {
    setProcessing(true);
    try {
      const res = await ticketService.useTicket(ticketId);
      setResult((prev) => ({
        ...prev,
        ticket: { ...prev.ticket, ...res.data.ticket },
      }));
      toast.success('Entry approved!');
      fetchCounter();
    } catch (err) {
      const data = err.response?.data;
      toast.error(data?.error || 'Failed to approve entry');
      if (data?.ticket) {
        setResult((prev) => ({ ...prev, ticket: { ...prev.ticket, ...data.ticket } }));
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleResetScanner = useCallback(() => {
    setResult(null);
    if (!scanning) startScanner();
  }, [scanning]);

  // ── Search During Scanning ──
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await ticketService.getAll({ search: searchQuery, limit: 10 });
      setSearchResults(res.data.tickets || []);
    } catch (err) {
      toast.error('Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleSearchApprove = async (ticketId) => {
    setProcessing(true);
    try {
      const res = await ticketService.useTicket(ticketId);
      // Find the ticket in search results and show as result
      const ticket = searchResults.find((t) => t.ticket_id === ticketId);
      if (ticket) {
        setResult({
          valid: true,
          ticket: { ...ticket, ...res.data.ticket },
        });
        setSearchResults([]);
        setSearchQuery('');
        setSearchMode(false);
        toast.success('Entry approved!');
        fetchCounter();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to approve entry');
    } finally {
      setProcessing(false);
    }
  };

  // ── Result Screen ──
  const renderResult = () => {
    if (!result) return null;

    if (result.valid === false) {
      return (
        <div className="bg-white rounded-2xl border-2 border-red-200 overflow-hidden shadow-lg animate-in">
          <div className="bg-gradient-to-r from-red-500 to-red-600 p-6 text-center">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
              <XCircle className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white">INVALID QR</h2>
            <p className="text-red-100 text-sm mt-1">{result.error || 'This QR code is not recognized'}</p>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-sm text-center text-gray-500">
              Try searching by name or ticket ID below
            </p>
            <button onClick={handleResetScanner} className="w-full py-3 bg-red-50 text-red-700 rounded-xl font-medium hover:bg-red-100 transition-colors">
              Scan Next
            </button>
          </div>
        </div>
      );
    }

    if (result.ticket?.status === 'USED') {
      return (
        <div className="bg-white rounded-2xl border-2 border-amber-200 overflow-hidden shadow-lg animate-in">
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-6 text-center">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white">ALREADY SCANNED</h2>
            <div className="flex items-center justify-center gap-2 text-amber-100 text-sm mt-2">
              <Clock className="w-4 h-4" />
              <span>Scanned at {result.ticket.scanned_at ? new Date(result.ticket.scanned_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'Unknown'}</span>
            </div>
          </div>
          <div className="p-5 space-y-3">
            <div className="bg-amber-50 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Hash className="w-4 h-4 text-amber-500" />
                <span className="text-gray-500">Ticket:</span>
                <span className="font-mono font-medium text-gray-900">{result.ticket.ticket_id}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-amber-500" />
                <span className="text-gray-500">Name:</span>
                <span className="font-medium text-gray-900">{result.ticket.name}</span>
              </div>
            </div>
            <button onClick={handleResetScanner} className="w-full py-3 bg-amber-50 text-amber-700 rounded-xl font-medium hover:bg-amber-100 transition-colors">
              Scan Next
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-2xl border-2 border-green-200 overflow-hidden shadow-lg animate-in">
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-6 text-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white">ENTRY APPROVED</h2>
          <p className="text-green-100 text-sm mt-1">Valid ticket — ready for entry</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-green-50 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Hash className="w-4 h-4 text-green-500" />
              <span className="text-gray-500">Ticket ID</span>
              <span className="ml-auto font-mono font-bold text-gray-900">{result.ticket.ticket_id}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-green-500" />
              <span className="text-gray-500">Name</span>
              <span className="ml-auto font-semibold text-gray-900">{result.ticket.name}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-green-500" />
              <span className="text-gray-500">Event Date</span>
              <span className="ml-auto text-gray-900">{new Date(result.ticket.event_date).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-green-500" />
              <span className="text-gray-500">Venue</span>
              <span className="ml-auto text-gray-900 text-right max-w-[180px]">{result.ticket.event_address}</span>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleResetScanner} className="flex-1 py-3 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
              Scan Next
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* ── Live Entry Counter ── */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-4 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DoorOpen className="w-5 h-5 text-indigo-200" />
            <span className="text-sm font-medium text-indigo-100">Inside Venue</span>
          </div>
          <span className="text-3xl font-bold">{counter.used}</span>
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-200" />
            <span className="text-sm font-medium text-indigo-100">Remaining</span>
          </div>
          <span className="text-3xl font-bold">{counter.remaining}</span>
        </div>
        {/* Progress bar */}
        <div className="mt-3 w-full bg-white/20 rounded-full h-2">
          <div
            className="bg-white h-2 rounded-full transition-all duration-500"
            style={{ width: `${counter.total > 0 ? (counter.used / counter.total) * 100 : 0}%` }}
          />
        </div>
        <p className="text-xs text-indigo-200 text-center mt-2">Updates every 10 seconds</p>
      </div>

      {/* ── Header ── */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">QR Verification</h1>
        <p className="text-gray-500 text-sm">Scan tickets at the venue entrance</p>
      </div>

      {/* ── Toggle between Scan & Search ── */}
      <div className="flex gap-2">
        <button
          onClick={() => { setSearchMode(false); setSearchResults([]); setSearchQuery(''); }}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${!searchMode ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          <Camera className="w-4 h-4 inline mr-1" /> Scan QR
        </button>
        <button
          onClick={() => { setSearchMode(true); setResult(null); setSearchResults([]); if (scanning) stopScanner(); }}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${searchMode ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          <Search className="w-4 h-4 inline mr-1" /> Search
        </button>
      </div>

      {/* ── Search Mode ── */}
      {searchMode && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="p-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search by name, phone, or ticket ID..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none text-sm"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
              className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {searching ? 'Searching...' : 'Search'}
            </button>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="space-y-2 mt-2">
                <p className="text-sm text-gray-500">{searchResults.length} result(s) found</p>
                {searchResults.map((ticket) => (
                  <div key={ticket.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-mono font-medium text-gray-900">{ticket.ticket_id}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        ticket.status === 'VALID' ? 'bg-green-100 text-green-700'
                        : ticket.status === 'USED' ? 'bg-amber-100 text-amber-700'
                        : 'bg-red-100 text-red-700'
                      }`}>{ticket.status}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-900">{ticket.name}</p>
                    <p className="text-xs text-gray-500">{ticket.mobile} • {ticket.email}</p>
                    {ticket.status === 'VALID' && (
                      <button
                        onClick={() => handleSearchApprove(ticket.ticket_id)}
                        disabled={processing}
                        className="w-full py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60 transition-colors"
                      >
                        {processing ? 'Processing...' : 'Approve Entry'}
                      </button>
                    )}
                    {ticket.status === 'USED' && (
                      <p className="text-xs text-amber-600 text-center">
                        Already scanned at {ticket.scanned_at ? new Date(ticket.scanned_at).toLocaleString() : 'Unknown'}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {searchResults.length === 0 && searchQuery && !searching && (
              <p className="text-sm text-gray-400 text-center py-4">No tickets found</p>
            )}
          </div>
        </div>
      )}

      {/* ── Scan Mode ── */}
      {!searchMode && (
        <>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="relative bg-gray-900">
              <div id={QR_SCANNER_ID} className={`w-full aspect-square ${scanning ? '' : 'flex items-center justify-center'}`}>
                {!scanning && (
                  <div className="text-center p-8">
                    <ScanQrCode className="w-16 h-16 text-gray-500 mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">Camera is off</p>
                  </div>
                )}
              </div>
              {processing && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <div className="w-12 h-12 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                </div>
              )}
            </div>
            <div className="p-4">
              {!scanning ? (
                <button onClick={startScanner} className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors shadow-sm">
                  <Camera className="w-4 h-4" /> Start Scanning
                </button>
              ) : (
                <button onClick={stopScanner} className="w-full flex items-center justify-center gap-2 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors shadow-sm">
                  <CameraOff className="w-4 h-4" /> Stop Camera
                </button>
              )}
            </div>
          </div>

          {result && renderResult()}
        </>
      )}

      {/* ── Offline Instructions ── */}
      <details className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <summary className="p-4 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-50 transition-colors">
          📋 Offline Recovery Instructions
        </summary>
        <div className="px-4 pb-4 space-y-2 text-sm text-gray-600">
          <p><strong>Before the event:</strong></p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Go to <strong>Tickets → Export CSV</strong> to download all tickets</li>
            <li>Keep the CSV file on your phone/laptop as backup</li>
          </ol>
          <p className="mt-2"><strong>If internet fails during scanning:</strong></p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Use the <strong>Search</strong> tab above to find tickets by name or ID</li>
            <li>Manually verify the attendee's details</li>
            <li>Click <strong>Approve Entry</strong> to mark them as entered</li>
            <li>When internet returns, all approvals will sync automatically</li>
          </ol>
          <p className="mt-2 text-xs text-amber-600">
            ⚠️ Note: The Search & Approve flow still requires an active internet connection. If completely offline, use the CSV as a reference to verify attendees manually by matching their name and ID.
          </p>
        </div>
      </details>
    </div>
  );
}
