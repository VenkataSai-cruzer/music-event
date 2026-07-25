import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import toast from 'react-hot-toast';
import { ticketService } from '../services/ticketService';
import { settingsService } from '../services/settingsService';

// ── Icons (inline SVG for zero dependency on full-screen layout) ──
const QR_SCANNER_ID = 'qr-scanner';
const SCAN_COOLDOWN_MS = 5000;
const RESULT_DISPLAY_MS = 2500;
const POLL_INTERVAL_MS = 10000;

export default function Scan() {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [counter, setCounter] = useState({ used: 0, remaining: 0, total: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [scannerName, setScannerName] = useState('');
  const [showNamePrompt, setShowNamePrompt] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const scannerRef = useRef(null);
  const resumeTimerRef = useRef(null);
  const recentScansRef = useRef(new Map());
  const pollTimerRef = useRef(null);
  const onScanSuccessRef = useRef(null); // Ref to prevent stale closures

  // ── Sound effects using Web Audio API ──
  const playSound = useCallback((type) => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.value = 0.15;

      if (type === 'success') {
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      } else if (type === 'error') {
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.setValueAtTime(200, ctx.currentTime + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
      } else if (type === 'warn') {
        osc.frequency.setValueAtTime(660, ctx.currentTime);
        osc.frequency.setValueAtTime(660, ctx.currentTime + 0.3);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
      }
    } catch (e) { /* silent fallback */ }
  }, [soundEnabled]);

  // ── Trigger vibration ──
  const vibrate = useCallback((pattern) => {
    try { navigator.vibrate?.(pattern); } catch (e) { /* silent */ }
  }, []);

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

  // ── Scanner initialization ──
  useEffect(() => {
    const scanner = new Html5Qrcode(QR_SCANNER_ID);
    scannerRef.current = scanner;
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      if (scanner && scanning) scanner.stop().catch(() => {});
    };
  }, []);

  // Keep ref updated with latest onScanSuccess callback
  useEffect(() => {
    onScanSuccessRef.current = (decodedText) => {
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
      scannerRef.current.stop().catch(() => {});
      setScanning(false);

      handleVerifyScan(decodedText);
    };
  });

  const handleVerifyScan = useCallback(async (decodedText) => {
    try {
      const res = await ticketService.verify(decodedText);
      setResult(res.data);
      if (res.data.valid && res.data.ticket?.status === 'VALID') {
        playSound('success');
        vibrate(200);
      } else if (res.data.ticket?.status === 'USED') {
        playSound('warn');
        vibrate([100, 100, 100]);
      } else {
        playSound('error');
        vibrate(300);
      }
    } catch (err) {
      const data = err.response?.data;
      setResult({ valid: false, error: data?.error || 'Invalid QR code' });
      playSound('error');
      vibrate(300);
    } finally {
      setProcessing(false);
    }
  }, [playSound, vibrate]);

  // Auto-resume scanner after result display
  useEffect(() => {
    if (!result) return;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      setResult(null);
      if (!searchMode) startScanner();
    }, RESULT_DISPLAY_MS);
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, [result, searchMode, startScanner]);

  const startScanner = useCallback(async () => {
    setScanning(true);
    setResult(null);
    setCameraReady(false);
    try {
      await scannerRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 15,
          qrbox: { width: 280, height: 280 },
          aspectRatio: 1,
        },
        (decodedText) => onScanSuccessRef.current?.(decodedText),
        () => {}
      );
      setCameraReady(true);
    } catch (err) {
      try {
        await scannerRef.current.start(
          { facingMode: 'user' },
          {
            fps: 15,
            qrbox: { width: 280, height: 280 },
            aspectRatio: 1,
          },
          (decodedText) => onScanSuccessRef.current?.(decodedText),
          () => {}
        );
        setCameraReady(true);
      } catch (err2) {
        toast.error('Unable to access camera. Check permissions.');
        setScanning(false);
      }
    }
  }, []);

  const stopScanner = useCallback(async () => {
    try { if (scannerRef.current) await scannerRef.current.stop(); } catch (e) {}
    setScanning(false);
    setCameraReady(false);
  }, []);

  // ── Auto-start scanner when name is provided ──
  useEffect(() => {
    if (!showNamePrompt && !scanning) {
      startScanner();
    }
  }, [showNamePrompt, startScanner, scanning]);

  const onScanSuccess = useCallback(async (decodedText) => {
    onScanSuccessRef.current?.(decodedText);
  }, []);

  const handleApproveEntry = async (ticketId) => {
    setProcessing(true);
    try {
      const res = await ticketService.useTicket(ticketId);
      setResult((prev) => ({
        ...prev,
        ticket: { ...prev.ticket, ...res.data.ticket },
      }));
      playSound('success');
      vibrate(200);
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

  const handleDismissResult = useCallback(() => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    setResult(null);
    if (!searchMode) startScanner();
  }, [searchMode, startScanner]);

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
      const ticket = searchResults.find((t) => t.ticket_id === ticketId);
      if (ticket) {
        setResult({ valid: true, ticket: { ...ticket, ...res.data.ticket } });
        setSearchResults([]);
        setSearchQuery('');
        setSearchMode(false);
        playSound('success');
        vibrate(200);
        toast.success('Entry approved!');
        fetchCounter();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to approve entry');
    } finally {
      setProcessing(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  //  SCANNER NAME PROMPT (first screen before scanning)
  // ═══════════════════════════════════════════════════════════════
  if (showNamePrompt) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="max-w-sm w-full bg-white rounded-2xl border border-gray-200 shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2m0 0H8m0 0H6m6 0h4m-4 0H8m0 0v-2m0 2v2m0-2H6m6 0h4" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Scanner Login</h2>
          <p className="text-sm text-gray-500 mb-6">Enter your name to start scanning tickets</p>
          <input
            type="text"
            value={scannerName}
            onChange={(e) => setScannerName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && scannerName.trim() && setShowNamePrompt(false)}
            placeholder="Your name (e.g., John at Gate A)"
            className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all mb-4"
            autoFocus
          />
          <button
            onClick={() => scannerName.trim() && setShowNamePrompt(false)}
            disabled={!scannerName.trim()}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 transition-all"
          >
            Start Scanning
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  RESULT SCREEN (overlay when ticket is scanned)
  // ═══════════════════════════════════════════════════════════════
  if (result) {
    const isInvalid = result.valid === false;
    const isUsed = result.ticket?.status === 'USED';
    const isCancelled = result.ticket?.status === 'CANCELLED';

    let bgColor, icon, title, subtitle;

    if (isInvalid) {
      bgColor = 'from-gray-600 to-gray-700';
      icon = (
        <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      );
      title = 'INVALID TICKET';
      subtitle = 'QR Code Not Found in System';
    } else if (isCancelled) {
      bgColor = 'from-orange-500 to-orange-600';
      icon = (
        <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      );
      title = 'CANCELLED';
      subtitle = 'This ticket has been cancelled';
    } else if (isUsed) {
      bgColor = 'from-amber-500 to-orange-500';
      icon = (
        <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
      title = 'ALREADY SCANNED';
      subtitle = 'Entry was already approved';
    } else {
      bgColor = 'from-green-500 to-emerald-600';
      icon = (
        <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
      title = 'ENTRY APPROVED';
      subtitle = 'Valid ticket — proceed to entry';
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in">
        <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl animate-in">
          {/* Color header */}
          <div className={`bg-gradient-to-r ${bgColor} p-8 text-center`}>
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
              {icon}
            </div>
            <h2 className="text-2xl font-bold text-white">{title}</h2>
            <p className="text-sm text-white/80 mt-1">{subtitle}</p>
          </div>

          {/* Details */}
          <div className="p-6 space-y-4">
            {/* Ticket info card */}
            {result.ticket && (
              <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 font-medium">Ticket ID</span>
                  <span className="font-mono font-bold text-gray-900">{result.ticket.ticket_id}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 font-medium">Name</span>
                  <span className="font-semibold text-gray-900">{result.ticket.name}</span>
                </div>
                {result.ticket.event_name && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 font-medium">Event</span>
                    <span className="text-gray-900">{result.ticket.event_name}</span>
                  </div>
                )}
                {isUsed && result.ticket.scanned_at && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 font-medium">Scanned At</span>
                    <span className="text-gray-900">
                      {new Date(result.ticket.scanned_at).toLocaleTimeString('en-US', {
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </span>
                  </div>
                )}
                {!isUsed && !isInvalid && !isCancelled && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 font-medium">Time</span>
                    <span className="text-gray-900">
                      {new Date().toLocaleTimeString('en-US', {
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </span>
                  </div>
                )}
                {scannerName && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 font-medium">Scanned By</span>
                    <span className="text-gray-900">{scannerName}</span>
                  </div>
                )}
              </div>
            )}

            {isInvalid && (
              <p className="text-sm text-center text-gray-500">
                This QR code is not recognized in the system
              </p>
            )}

            {/* Approve button for VALID tickets */}
            {result.valid && result.ticket?.status === 'VALID' && (
              <button
                onClick={() => handleApproveEntry(result.ticket.ticket_id)}
                disabled={processing}
                className="w-full py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:opacity-60 transition-all shadow-lg shadow-green-200"
              >
                {processing ? 'Approving...' : '✅  Approve Entry'}
              </button>
            )}

            <button
              onClick={handleDismissResult}
              className="w-full py-2.5 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
            >
              {!isInvalid && !isUsed && !isCancelled && !result.ticket?.status ? 'Dismiss' : 'Scan Next'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  MAIN SCANNER VIEW
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* ── Live Entry Counter ── */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-4 text-white shadow-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-indigo-100">Inside Venue</span>
          <span className="text-2xl font-bold">{counter.used}</span>
        </div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-indigo-100">Remaining</span>
          <span className="text-2xl font-bold">{counter.remaining}</span>
        </div>
        <div className="w-full bg-white/20 rounded-full h-2">
          <div
            className="bg-white h-2 rounded-full transition-all duration-500"
            style={{ width: `${counter.total > 0 ? (counter.used / counter.total) * 100 : 0}%` }}
          />
        </div>
        <p className="text-xs text-indigo-200 text-center mt-2">Updates every 10s</p>
      </div>

      {/* ── Tab Toggle: Scan QR / Search ── */}
      <div className="flex gap-1.5 bg-gray-100 rounded-xl p-1">
        <button
          onClick={() => {
            setSearchMode(false);
            setSearchResults([]);
            setSearchQuery('');
            setResult(null);
            if (!scanning) startScanner();
          }}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
            !searchMode ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <svg className="w-4 h-4 inline mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2m0 0H8m0 0H6m6 0h4m-4 0H8m0 0v-2m0 2v2m0-2H6m6 0h4" />
          </svg>
          Scan QR
        </button>
        <button
          onClick={() => {
            setSearchMode(true);
            setResult(null);
            setSearchResults([]);
            if (scanning) stopScanner();
          }}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
            searchMode ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <svg className="w-4 h-4 inline mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Search
        </button>
      </div>

      {/* ── Search Tab ── */}
      {searchMode && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 space-y-3">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search by name, phone, or ticket ID..."
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none text-sm"
                autoFocus
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {searching ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Searching...
                </span>
              ) : 'Search'}
            </button>

            {searchResults.length > 0 && (
              <div className="space-y-2 mt-2">
                <p className="text-sm text-gray-500">{searchResults.length} result(s)</p>
                {searchResults.map((ticket) => (
                  <div key={ticket.id} className="border border-gray-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-gray-900 text-sm">{ticket.ticket_id}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        ticket.status === 'VALID' ? 'bg-green-100 text-green-700'
                        : ticket.status === 'USED' ? 'bg-amber-100 text-amber-700'
                        : 'bg-red-100 text-red-700'
                      }`}>{ticket.status}</span>
                    </div>
                    <p className="font-semibold text-gray-900">{ticket.name}</p>
                    <p className="text-xs text-gray-500">{ticket.mobile} &middot; {ticket.email}</p>
                    {ticket.status === 'VALID' && (
                      <button
                        onClick={() => handleSearchApprove(ticket.ticket_id)}
                        disabled={processing}
                        className="w-full py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-60 transition-all"
                      >
                        {processing ? 'Processing...' : 'Approve Entry'}
                      </button>
                    )}
                    {ticket.status === 'USED' && (
                      <div className="bg-amber-50 rounded-lg px-3 py-2 text-xs text-amber-700 text-center">
                        Already scanned: {ticket.scanned_at ? new Date(ticket.scanned_at).toLocaleString() : 'Unknown'}
                      </div>
                    )}
                    {ticket.status === 'CANCELLED' && (
                      <div className="bg-red-50 rounded-lg px-3 py-2 text-xs text-red-700 text-center">
                        This ticket has been cancelled
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {searchResults.length === 0 && searchQuery && !searching && (
              <div className="text-center py-8">
                <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="text-gray-400 text-sm">No tickets found</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Scan Tab ── */}
      {!searchMode && (
        <>
          {/* Scanner box */}
          <div className="bg-gray-900 rounded-2xl overflow-hidden shadow-lg relative">
            {/* Scanner frame area */}
            <div className="relative aspect-square">
              <div id={QR_SCANNER_ID} className={`w-full h-full ${scanning ? '' : 'flex items-center justify-center bg-gray-900'}`}>
                {!scanning && (
                  <div className="text-center p-8">
                    <svg className="w-20 h-20 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2m0 0H8m0 0H6m6 0h4m-4 0H8m0 0v-2m0 2v2m0-2H6m6 0h4" />
                    </svg>
                    <p className="text-gray-500 text-sm">Camera is off</p>
                  </div>
                )}
              </div>

              {/* Scanner overlay animation */}
              {cameraReady && scanning && (
                <div className="absolute inset-0 pointer-events-none">
                  {/* Corner brackets */}
                  <div className="absolute top-4 left-4 w-10 h-10 border-t-3 border-l-3 border-indigo-400 rounded-tl-lg" />
                  <div className="absolute top-4 right-4 w-10 h-10 border-t-3 border-r-3 border-indigo-400 rounded-tr-lg" />
                  <div className="absolute bottom-4 left-4 w-10 h-10 border-b-3 border-l-3 border-indigo-400 rounded-bl-lg" />
                  <div className="absolute bottom-4 right-4 w-10 h-10 border-b-3 border-r-3 border-indigo-400 rounded-br-lg" />
                  {/* Scanning line animation */}
                  <div className="absolute left-6 right-6 h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent animate-scan" />
                </div>
              )}

              {/* Processing overlay */}
              {processing && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <div className="text-center">
                    <svg className="animate-spin w-10 h-10 text-white mx-auto mb-3" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <p className="text-white text-sm">Verifying...</p>
                  </div>
                </div>
              )}
            </div>

            {/* Controls bar */}
            <div className="p-4 bg-gray-900 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${cameraReady ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
                <span className="text-xs text-gray-400">{cameraReady ? 'Camera Ready' : 'Initializing...'}</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`p-2 rounded-lg transition-colors ${soundEnabled ? 'text-gray-300 hover:text-white' : 'text-gray-600'}`}
                  title={soundEnabled ? 'Mute sound' : 'Enable sound'}
                >
                  {soundEnabled ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={scanning ? stopScanner : startScanner}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    scanning
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {scanning ? 'Stop' : 'Start'}
                </button>
              </div>
            </div>
          </div>

          {/* Scanner info */}
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{scannerName && `Scanner: ${scannerName}`}</span>
            <span>Continuous scan mode</span>
          </div>
        </>
      )}

      {/* ── Offline Recovery Instructions ── */}
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

      {/* CSS for scan line animation */}
      <style>{`
        @keyframes scanLine {
          0%, 100% { top: 10%; }
          50% { top: 85%; }
        }
        .animate-scan {
          animation: scanLine 2.5s ease-in-out infinite;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-in {
          animation: fadeIn 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}
