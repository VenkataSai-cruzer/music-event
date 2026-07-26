import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import toast from 'react-hot-toast';
import axios from 'axios';
import { ticketService } from '../services/ticketService';

const QR_SCANNER_ID = 'qr-scanner';
const RESULT_DISPLAY_MS = 5000;
const POLL_INTERVAL_MS = 10000;
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function Scan() {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [counter, setCounter] = useState({ used: 0, remaining: 0, total: 0 });
  const [loggedIn, setLoggedIn] = useState(() => !!sessionStorage.getItem('scannerToken'));
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [scannerInfo, setScannerInfo] = useState(() => {
    try {
      const saved = sessionStorage.getItem('scannerInfo');
      return saved ? JSON.parse(saved) : null;
    } catch {
      // Previous version may have stored non-JSON data — clean it up
      sessionStorage.removeItem('scannerInfo');
      return null;
    }
  });

  const scannerRef = useRef(null);
  const scanningRef = useRef(false);
  const resumeTimerRef = useRef(null);
  const pollTimerRef = useRef(null);
  const onScanSuccessRef = useRef(null);

  // ── Lazy scanner — only creates Html5Qrcode when Start is clicked ──
  const getScanner = useCallback(() => {
    if (!scannerRef.current) {
      try {
        scannerRef.current = new Html5Qrcode(QR_SCANNER_ID);
      } catch (e) {
        console.error('Failed to create scanner:', e);
      }
    }
    return scannerRef.current;
  }, []);

  // ── Sound effects ──
  const playSound = useCallback((type) => {
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
      } else if (type === 'warn') {
        osc.frequency.setValueAtTime(660, ctx.currentTime);
        osc.frequency.setValueAtTime(660, ctx.currentTime + 0.3);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
      } else {
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.setValueAtTime(200, ctx.currentTime + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
      }
    } catch (e) { /* silent */ }
  }, []);

  // ── Counter polling ──
  const fetchCounter = useCallback(async () => {
    try {
      const res = await ticketService.getDashboard();
      setCounter({ used: res.data.used || 0, remaining: res.data.remaining || 0, total: res.data.total || 0 });
    } catch (e) { /* silent */ }
  }, []);

  useEffect(() => {
    if (loggedIn) {
      fetchCounter();
      pollTimerRef.current = setInterval(fetchCounter, POLL_INTERVAL_MS);
    }
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, [loggedIn, fetchCounter]);

  const getScannedBy = useCallback(() => scannerInfo?.display_name || 'Scanner', [scannerInfo]);

  // ── Atomic verify+approve ──
  const handleVerifyScan = useCallback(async (decodedText) => {
    try {
      const scannedBy = getScannedBy();
      const res = await ticketService.verify(decodedText, scannedBy);
      setResult(res.data);
      if (res.data.action === 'approved') {
        playSound('success');
        fetchCounter();
      } else if (res.data.action === 'already_used') {
        playSound('warn');
      } else {
        playSound('error');
      }
    } catch (err) {
      setResult({ valid: false, action: 'invalid', error: 'Invalid QR code' });
      playSound('error');
    } finally {
      setProcessing(false);
    }
  }, [playSound, getScannedBy, fetchCounter]);

  useEffect(() => {
    onScanSuccessRef.current = (decodedText) => {
      setProcessing(true);
      const s = scannerRef.current;
      if (s) s.stop().catch(() => {});
      setScanning(false);
      handleVerifyScan(decodedText);
    };
  });

  // Auto-resume scanner after result
  useEffect(() => {
    if (!result) return;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      setResult(null);
      startScanner();
    }, RESULT_DISPLAY_MS);
    return () => { if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current); };
  }, [result, startScanner]);

  const startScanner = useCallback(async () => {
    const scanner = getScanner();
    if (!scanner) {
      toast.error('Scanner initialization failed');
      setScanning(false);
      return;
    }
    setScanning(true);
    scanningRef.current = true;
    setResult(null);
    setCameraReady(false);
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 15, qrbox: { width: 280, height: 280 }, aspectRatio: 1 },
        (decodedText) => onScanSuccessRef.current?.(decodedText),
        () => {}
      );
      setCameraReady(true);
    } catch (err) {
      try {
        await scanner.start(
          { facingMode: 'user' },
          { fps: 15, qrbox: { width: 280, height: 280 }, aspectRatio: 1 },
          (decodedText) => onScanSuccessRef.current?.(decodedText),
          () => {}
        );
        setCameraReady(true);
      } catch (err2) {
        toast.error('Unable to access camera. Check permissions.');
        setScanning(false);
      }
    }
  }, [getScanner]);

  const stopScanner = useCallback(async () => {
    scanningRef.current = false;
    try { if (scannerRef.current) await scannerRef.current.stop(); } catch (e) {}
    setScanning(false);
    setCameraReady(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      if (scannerRef.current && scanningRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  // ── Scanner Login ──
  const handleScannerLogin = async () => {
    if (!loginUsername.trim() || !loginPassword.trim()) return;
    setLoggingIn(true);
    try {
      const res = await axios.post(`${API_URL}/api/auth/scanner-login`, { username: loginUsername, password: loginPassword });
      const { token, scanner } = res.data;
      sessionStorage.setItem('scannerToken', token);
      sessionStorage.setItem('scannerInfo', JSON.stringify(scanner));
      setScannerInfo(scanner);
      setLoggedIn(true);
      toast.success(`Logged in as ${scanner.display_name}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Scanner login failed');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('scannerToken');
    sessionStorage.removeItem('scannerInfo');
    setScannerInfo(null);
    setLoggedIn(false);
    stopScanner();
  };

  // ═══ SCANNER LOGIN ═══
  if (!loggedIn) {
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
            <input type="text" value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loggingIn && handleScannerLogin()}
              placeholder="e.g., gate_a"
              className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all" autoFocus />
            <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loggingIn && handleScannerLogin()}
              placeholder="Enter password"
              className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all" />
          </div>
          <button onClick={handleScannerLogin} disabled={loggingIn || !loginUsername.trim() || !loginPassword.trim()}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-200">
            {loggingIn ? 'Logging in...' : 'Login & Start Scanning'}
          </button>
          <p className="text-xs text-gray-400 text-center mt-4">
            Default accounts: gate_a, gate_b, vip / password: scan123
          </p>
        </div>
      </div>
    );
  }

  // ═══ RESULT SCREEN ═══
  if (result) {
    const { action } = result;
    const approved = action === 'approved';
    const used = action === 'already_used';
    const invalid = action === 'invalid';

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl animate-in">

          {/* APPROVED */}
          {approved && (
            <>
              <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-8 text-center">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-white">ENTRY APPROVED</h2>
                <p className="text-sm text-green-100 mt-1">Welcome to 7 NOTES! Enjoy the event!</p>
              </div>
              <div className="p-6 space-y-3">
                <div className="bg-green-50 rounded-2xl p-4 space-y-2.5">
                  <ResultRow label="Name" value={result.ticket?.name} />
                  <ResultRow label="Ticket" value={result.ticket?.ticket_id} />
                  <ResultRow label="Scanner" value={getScannedBy()} />
                  <ResultRow label="Time" value={new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} />
                </div>
                <button onClick={() => { setResult(null); startScanner(); }}
                  className="w-full py-2.5 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors">
                  Scan Next Ticket
                </button>
              </div>
            </>
          )}

          {/* ALREADY SCANNED */}
          {used && (
            <>
              <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-8 text-center">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-white">ALREADY SCANNED</h2>
                <p className="text-sm text-amber-100 mt-1">Entry was already approved</p>
              </div>
              <div className="p-6 space-y-3">
                <div className="bg-amber-50 rounded-2xl p-4 space-y-2.5">
                  <ResultRow label="Name" value={result.ticket?.name} />
                  <ResultRow label="Ticket" value={result.ticket?.ticket_id} />
                  {result.ticket?.scanned_by && <ResultRow label="Original Scan" value={result.ticket.scanned_by} />}
                  {result.ticket?.scanned_at && (
                    <ResultRow label="Time" value={new Date(result.ticket.scanned_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} />
                  )}
                </div>
                <button onClick={() => { setResult(null); startScanner(); }}
                  className="w-full py-2.5 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors">
                  Scan Next Ticket
                </button>
              </div>
            </>
          )}

          {/* INVALID */}
          {invalid && (
            <>
              <div className="bg-gradient-to-r from-gray-600 to-gray-700 p-8 text-center">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-white">INVALID QR</h2>
                <p className="text-sm text-gray-300 mt-1">QR Code Not Found in System</p>
              </div>
              <div className="p-6 space-y-3">
                <p className="text-sm text-center text-gray-500">This QR code is not recognized. Only 7 NOTES tickets are accepted.</p>
                <button onClick={() => { setResult(null); startScanner(); }}
                  className="w-full py-2.5 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors">
                  Scan Next Ticket
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ═══ MAIN SCANNER VIEW ═══
  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* Info Bar */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-sm font-medium text-gray-700">{scannerInfo?.display_name || 'Scanner'}</span>
        </div>
        <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Logout</button>
      </div>

      {/* Entry Counter */}
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
          <div className="bg-white h-2 rounded-full transition-all duration-500"
            style={{ width: `${counter.total > 0 ? (counter.used / counter.total) * 100 : 0}%` }} />
        </div>
      </div>

      {/* Scanner */}
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
              <div className="absolute top-4 left-4 w-10 h-10 border-t-2 border-l-2 border-indigo-400 rounded-tl-lg" />
              <div className="absolute top-4 right-4 w-10 h-10 border-t-2 border-r-2 border-indigo-400 rounded-tr-lg" />
              <div className="absolute bottom-4 left-4 w-10 h-10 border-b-2 border-l-2 border-indigo-400 rounded-bl-lg" />
              <div className="absolute bottom-4 right-4 w-10 h-10 border-b-2 border-r-2 border-indigo-400 rounded-br-lg" />
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
                <p className="text-white text-sm">Verifying...</p>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 bg-gray-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${cameraReady ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
            <span className="text-xs text-gray-400">{cameraReady ? 'Camera Ready' : 'Initializing...'}</span>
          </div>
          <button
            onClick={scanning ? stopScanner : startScanner}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              scanning ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {scanning ? 'Stop' : 'Start'}
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-500 text-center">Scan QR to approve entry — one scan per ticket</p>

      <style>{`
        @keyframes scanLine { 0%, 100% { top: 10%; } 50% { top: 85%; } }
        .animate-scan { animation: scanLine 2.5s ease-in-out infinite; }
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
        .animate-in { animation: fadeIn 0.2s ease-out; }
      `}</style>
    </div>
  );
}

function ResultRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500 font-medium">{label}</span>
      <span className="font-semibold text-gray-900">{value}</span>
    </div>
  );
}
