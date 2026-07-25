import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import toast from 'react-hot-toast';
import axios from 'axios';
import { ticketService } from '../services/ticketService';

const QR_SCANNER_ID = 'qr-scanner';
const SCAN_COOLDOWN_MS = 5000;
const RESULT_DISPLAY_MS = 3000;
const POLL_INTERVAL_MS = 10000;
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

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
  const [showNamePrompt, setShowNamePrompt] = useState(
    () => !sessionStorage.getItem('scannerToken')
  );
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [scannerToken, setScannerToken] = useState(
    () => sessionStorage.getItem('scannerToken') || null
  );
  const [scannerInfo, setScannerInfo] = useState(
    () => {
      const saved = sessionStorage.getItem('scannerInfo');
      return saved ? JSON.parse(saved) : null;
    }
  );

  const scannerRef = useRef(null);
  const resumeTimerRef = useRef(null);
  const recentScansRef = useRef(new Map());
  const pollTimerRef = useRef(null);
  const onScanSuccessRef = useRef(null);

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

  // ── Get scanner's display name from the authenticated scanner account ──
  const getScannedBy = useCallback(() => {
    return scannerInfo?.display_name || 'Unknown Scanner';
  }, [scannerInfo]);

  // ── Atomic verify+approve handler ──
  const handleVerifyScan = useCallback(async (decodedText) => {
    try {
      const scannedBy = getScannedBy();
      const res = await ticketService.verify(decodedText, scannedBy);
      setResult(res.data);

      const action = res.data.action;
      if (action === 'approved') {
        playSound('success');
        vibrate(200);
        toast.success('Entry approved!');
        fetchCounter();
      } else if (action === 'already_used') {
        playSound('warn');
        vibrate([100, 100, 100]);
      } else {
        playSound('error');
        vibrate(300);
      }
    } catch (err) {
      const data = err.response?.data;
      setResult({
        valid: false,
        action: 'invalid',
        error: data?.error || 'Invalid QR code',
      });
      playSound('error');
      vibrate(300);
    } finally {
      setProcessing(false);
    }
  }, [playSound, vibrate, getScannedBy, fetchCounter]);

  // Keep ref updated with latest callback
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
  }, [result, searchMode]);

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

  const handleDismissResult = useCallback(() => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    setResult(null);
    if (!searchMode) startScanner();
  }, [searchMode, startScanner]);

  // ── Scanner account login ──
  const handleScannerLogin = async () => {
    if (!loginUsername.trim() || !loginPassword.trim()) return;
    setLoggingIn(true);
    try {
      const res = await axios.post(`${API_URL}/api/auth/scanner-login`, {
        username: loginUsername,
        password: loginPassword,
      });
      const { token, scanner } = res.data;
      sessionStorage.setItem('scannerToken', token);
      sessionStorage.setItem('scannerInfo', JSON.stringify(scanner));
      setScannerToken(token);
      setScannerInfo(scanner);
      setScannerName(scanner.display_name);
      setShowNamePrompt(false);
      toast.success(`Logged in as ${scanner.display_name}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Scanner login failed');
    } finally {
      setLoggingIn(false);
    }
  };

  // ── Logout scanner ──
  const handleLogout = () => {
    sessionStorage.removeItem('scannerToken');
    sessionStorage.removeItem('scannerInfo');
    setScannerToken(null);
    setScannerInfo(null);
    setScannerName('');
    setShowNamePrompt(true);
    stopScanner();
  };

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
      const scannedBy = getScannedBy();
      // Find matching ticket from search results to get the QR token (UUID), not the human-readable ticket ID
      const ticket = searchResults.find(t => t.ticket_id === ticketId);
      const qrToken = ticket?.qr_token || ticketId;
      const res = await ticketService.verify(qrToken, scannedBy);
      setResult(res.data);
      setSearchResults([]);
      setSearchQuery('');
      setSearchMode(false);
      if (res.data.action === 'approved') {
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
  //  SCANNER LOGIN (account-only — no free-text mode)
  // ═══════════════════════════════════════════════════════════════
  if (showNamePrompt) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-white rounded-2xl border border-gray-200 shadow-lg p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Scanner Login</h2>
            <p className="text-sm text-gray-500">Sign in with your assigned scanner account</p>
          </div>
          <div className="space-y-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Username</label>
              <input
                type="text"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !loggingIn && handleScannerLogin()}
                placeholder="e.g., gate_a"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Password</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !loggingIn && handleScannerLogin()}
                placeholder="Enter password"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
              />
            </div>
          </div>
          <button
            onClick={handleScannerLogin}
            disabled={loggingIn || !loginUsername.trim() || !loginPassword.trim()}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-200"
          >
            {loggingIn ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Logging in...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2m0 0H8m0 0H6m6 0h4m-4 0H8m0 0v-2m0 2v2m0-2H6m6 0h4" />
                </svg>
                Login & Start Scanning
              </span>
            )}
          </button>
          <p className="text-xs text-gray-400 text-center mt-4">
            Default accounts: gate_a, gate_b, vip / password: scan123
          </p>
          <p className="text-xs text-gray-400 text-center mt-1">
            Ask the event organizer for your assigned scanner credentials
          </p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  RESULT SCREEN (atomic verify result)
  // ═══════════════════════════════════════════════════════════════
  if (result) {
    const action = result.action;
    const isApproved = action === 'approved';
    const isUsed = action === 'already_used';
    const isCancelled = action === 'cancelled';
    const isInvalid = action === 'invalid';

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
          <div className={`bg-gradient-to-r ${bgColor} p-8 text-center`}>
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
              {icon}
            </div>
            <h2 className="text-2xl font-bold text-white">{title}</h2>
            <p className="text-sm text-white/80 mt-1">{subtitle}</p>
          </div>

          <div className="p-6 space-y-4">
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
                {isUsed && result.ticket.scanned_by && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 font-medium">Scanned By</span>
                    <span className="text-gray-900">{result.ticket.scanned_by}</span>
                  </div>
                )}
                {isApproved && (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 font-medium">Time</span>
                      <span className="text-gray-900">
                        {new Date().toLocaleTimeString('en-US', {
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 font-medium">Approved By</span>
                      <span className="text-gray-900">{getScannedBy()}</span>
                    </div>
                  </>
                )}
                {result.ticket.status === 'USED' && (
                  <div className="bg-amber-50 rounded-lg p-3 text-xs text-amber-700 text-center font-medium">
                    🟡 Already scanned — no further action needed
                  </div>
                )}
              </div>
            )}

            {isInvalid && (
              <p className="text-sm text-center text-gray-500">
                This QR code is not recognized in the system
              </p>
            )}

            <button
              onClick={handleDismissResult}
              className="w-full py-2.5 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
            >
              Scan Next Ticket
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
      {/* ── Scanner Info Bar ── */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-sm font-medium text-gray-700">Scanner: {getScannedBy()}</span>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs text-gray-400 hover:text-red-500 transition-colors"
        >
          Logout
        </button>
      </div>

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
        <p className="text-xs text-indigo-200 text-center mt-2">Auto-updates every 10s</p>
      </div>

      {/* ── Tab Toggle ── */}
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
              {searching ? 'Searching...' : 'Search'}
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
                    {ticket.scanned_by && (
                      <div className="text-xs text-gray-400 text-center">
                        Scanned by: {ticket.scanned_by}
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
          <div className="bg-gray-900 rounded-2xl overflow-hidden shadow-lg relative">
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

              {cameraReady && scanning && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-4 left-4 w-10 h-10 border-t-3 border-l-3 border-indigo-400 rounded-tl-lg" />
                  <div className="absolute top-4 right-4 w-10 h-10 border-t-3 border-r-3 border-indigo-400 rounded-tr-lg" />
                  <div className="absolute bottom-4 left-4 w-10 h-10 border-b-3 border-l-3 border-indigo-400 rounded-bl-lg" />
                  <div className="absolute bottom-4 right-4 w-10 h-10 border-b-3 border-r-3 border-indigo-400 rounded-br-lg" />
                  <div className="absolute left-6 right-6 h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent animate-scan" />
                </div>
              )}

              {processing && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <div className="text-center">
                    <svg className="animate-spin w-10 h-10 text-white mx-auto mb-3" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <p className="text-white text-sm">Verifying & Approving...</p>
                  </div>
                </div>
              )}
            </div>

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

          <div className="text-xs text-gray-500 text-center">
            ✓ Atomic verify & approve — one scan approves entry
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
        </div>
      </details>

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
