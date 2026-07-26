import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, CameraOff, ScanIcon, WifiOff, AlertTriangle, RefreshCw, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
const QR_SCANNER_ID = 'qr-scanner';
const RESULT_DISPLAY_MS = 4000;
const POLL_INTERVAL_MS = 10000;
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function Scan() {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [cameraStatus, setCameraStatus] = useState('idle'); // idle | loading | ready | error
  const [cameraError, setCameraError] = useState(null);
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
      sessionStorage.removeItem('scannerInfo');
      return null;
    }
  });

  const scannerRef = useRef(null);
  const scanningRef = useRef(false);
  const resumeTimerRef = useRef(null);
  const pollTimerRef = useRef(null);

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

  // ── Counter polling (uses raw axios — bypasses admin auth interceptor) ──
  const fetchCounter = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/scanner/stats`);
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

  // ── Lazy scanner factory (single instance) ──
  const getScanner = useCallback(() => {
    if (!scannerRef.current) {
      try {
        scannerRef.current = new Html5Qrcode(QR_SCANNER_ID);
      } catch (e) {
        console.error('Failed to create scanner:', e);
        return null;
      }
    }
    return scannerRef.current;
  }, []);

  // ── Verify QR and show result ──
  const handleVerifyScan = useCallback(async (decodedText) => {
    try {
      const scannedBy = getScannedBy();
      // Use raw axios to bypass admin auth interceptor
      const res = await axios.post(`${API_URL}/api/tickets/verify`, {
        qr_token: decodedText, scanned_by: scannedBy
      });

      if (res.data.action === 'approved') {
        playSound('success');
        fetchCounter();
      } else if (res.data.action === 'already_used') {
        playSound('warn');
      } else {
        playSound('error');
      }
      setResult(res.data);
    } catch (err) {
      // Network error vs invalid QR
      if (err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
        setResult({ valid: false, action: 'network_error', error: 'Unable to reach server. Check connection.' });
        playSound('error');
      } else {
        setResult({ valid: false, action: 'invalid', error: 'Invalid QR code' });
        playSound('error');
      }
    } finally {
      setProcessing(false);
    }
  }, [playSound, getScannedBy, fetchCounter]);

  // ── Resume scanner after result display ──
  const resumeScanner = useCallback(() => {
    const scanner = scannerRef.current;
    if (scanner) {
      try { scanner.resume(); } catch (e) { /* not paused or stopped */ }
    }
    setResult(null);
    // scanning stays true throughout — camera never appears to stop
  }, []);

  // Auto-resume after result timeout
  useEffect(() => {
    if (!result) return;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(resumeScanner, RESULT_DISPLAY_MS);
    return () => { if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current); };
  }, [result, resumeScanner]);

  // ── Start scanner ──
  const startScanner = useCallback(async () => {
    const scanner = getScanner();
    if (!scanner) {
      setCameraError('Scanner initialization failed');
      setCameraStatus('error');
      return;
    }

    setScanning(true);
    scanningRef.current = true;
    setResult(null);
    setCameraStatus('loading');
    setCameraError(null);

    try {
      // Try rear camera first
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 15, qrbox: { width: 280, height: 280 }, aspectRatio: 1 },          (decodedText) => {
          // Pause QR processing while verifying — camera stays alive, no state change
          try { scanner.pause(); } catch (e) { /* not started */ }
          // DO NOT set scanning=false here — camera stays alive under result overlay
          setProcessing(true);
          handleVerifyScan(decodedText);
        },
        () => {} // ignore useless scan results
      );
      setCameraStatus('ready');
    } catch (err) {
      // Rear camera failed — try front camera
      try {
        await scanner.start(
          { facingMode: 'user' },
          { fps: 15, qrbox: { width: 280, height: 280 }, aspectRatio: 1 },
          (decodedText) => {
            try { scanner.pause(); } catch (e) {}
            // Keep scanning=true — camera stays alive under overlay
            setProcessing(true);
            handleVerifyScan(decodedText);
          },
          () => {}
        );
        setCameraStatus('ready');
        setCameraError('Using front camera — QR may be harder to scan');
      } catch (err2) {
        // Both cameras failed — determine reason
        const msg = err2?.message || '';
        if (msg.includes('permission') || msg.includes('NotAllowed')) {
          setCameraError('permission_denied');
        } else if (msg.includes('NotFound') || msg.includes('no camera')) {
          setCameraError('no_camera');
        } else {
          setCameraError(msg || 'Camera unavailable');
        }
        setCameraStatus('error');
        setScanning(false);
        scanningRef.current = false;
      }
    }
  }, [getScanner, handleVerifyScan]);

  // ── Stop scanner ──
  const stopScanner = useCallback(async () => {
    scanningRef.current = false;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    setScanning(false);
    setCameraStatus('idle');
    setCameraError(null);
    const scanner = scannerRef.current;
    if (scanner) {
      try { await scanner.stop(); } catch (e) {}
    }
  }, []);

  // ── Cleanup on unmount (await scanner.stop() before clear()) ──
  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      const scanner = scannerRef.current;
      if (scanner) {
        scanner.stop().then(() => scanner.clear()).catch(() => {});
      }
    };
  }, []);

  // ── Scanner Login ──
  const handleScannerLogin = async () => {
    if (!loginUsername.trim() || !loginPassword.trim()) return;
    setLoggingIn(true);
    try {
      const res = await axios.post(`${API_URL}/api/auth/scanner-login`, {
        username: loginUsername, password: loginPassword
      });
      const { token, scanner } = res.data;
      // Clear any existing admin token — scanner user must not access admin routes
      localStorage.removeItem('token');
      localStorage.removeItem('admin');
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

  const handleLogout = async () => {
    await stopScanner();
    sessionStorage.removeItem('scannerToken');
    sessionStorage.removeItem('scannerInfo');
    setScannerInfo(null);
    setLoggedIn(false);
  };

  // ═══════════════════════════════════
  //  RENDER: SCANNER LOGIN
  // ═══════════════════════════════════
  if (!loggedIn) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-white rounded-2xl border border-gray-200 shadow-lg p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ScanIcon className="w-8 h-8 text-indigo-600" />
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

  // ═══════════════════════════════════
  //  RENDER: RESULT SCREEN
  // ═══════════════════════════════════
  if (result) {
    const { action } = result;
    const approved = action === 'approved';
    const used = action === 'already_used';
    const invalid = action === 'invalid';
    const networkError = action === 'network_error';

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl animate-in">

          {/* ENTRY APPROVED */}
          {approved && (
            <>
              <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-8 text-center">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-white">ENTRY APPROVED</h2>
                <p className="text-sm text-green-100 mt-1">Welcome to 7 NOTES!</p>
              </div>
              <div className="p-6 space-y-3">
                <div className="bg-green-50 rounded-2xl p-4 space-y-2.5">
                  <ResultRow label="Name" value={result.ticket?.name} />
                  <ResultRow label="Ticket" value={result.ticket?.ticket_id} />
                  <ResultRow label="Scanner" value={getScannedBy()} />
                  <ResultRow label="Time" value={new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} />
                </div>
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
              </div>
            </>
          )}

          {/* INVALID QR */}
          {invalid && (
            <>
              <div className="bg-gradient-to-r from-gray-600 to-gray-700 p-8 text-center">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <AlertTriangle className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-xl font-bold text-white">INVALID QR</h2>
                <p className="text-sm text-gray-300 mt-1">Not recognized in system</p>
              </div>
              <div className="p-6 space-y-3">
                <p className="text-sm text-center text-gray-500">
                  Only official 7 NOTES tickets are accepted.
                </p>
              </div>
            </>
          )}

          {/* NETWORK ERROR */}
          {networkError && (
            <>
              <div className="bg-gradient-to-r from-red-500 to-red-600 p-8 text-center">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <WifiOff className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-xl font-bold text-white">CONNECTION ERROR</h2>
                <p className="text-sm text-red-100 mt-1">Unable to reach server</p>
              </div>
              <div className="p-6 space-y-3">
                <p className="text-sm text-center text-gray-500">
                  Check your internet connection and try again.
                </p>
                <button onClick={() => { setResult(null); resumeScanner(); }}
                  className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4" /> Retry
                </button>
              </div>
            </>
          )}

          {/* Auto-resume countdown bar */}
          <div className="h-1 bg-gray-100">
            <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 animate-shrink" />
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════
  //  RENDER: CAMERA PERMISSION DENIED
  // ═══════════════════════════════════
  if (cameraError === 'permission_denied') {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <ScannerStatusBar scannerInfo={scannerInfo} onLogout={handleLogout} />
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center shadow-sm">
          <CameraOff className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Camera Permission Required</h2>
          <p className="text-sm text-gray-500 mb-6">
            Allow camera access to scan tickets. Check your browser settings and refresh the page.
          </p>
          <button onClick={startScanner}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2 mx-auto">
            <RefreshCw className="w-4 h-4" /> Try Again
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════
  //  RENDER: NO CAMERA DETECTED
  // ═══════════════════════════════════
  if (cameraError === 'no_camera') {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <ScannerStatusBar scannerInfo={scannerInfo} onLogout={handleLogout} />
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center shadow-sm">
          <CameraOff className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">No Camera Detected</h2>
          <p className="text-sm text-gray-500">
            Use a mobile phone or connect a webcam to scan tickets.
          </p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════
  //  RENDER: CAMERA ERROR
  // ═══════════════════════════════════
  if (cameraStatus === 'error' && cameraError) {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <ScannerStatusBar scannerInfo={scannerInfo} onLogout={handleLogout} />
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center shadow-sm">
          <CameraOff className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Camera Error</h2>
          <p className="text-sm text-gray-500 mb-6">{cameraError}</p>
          <button onClick={startScanner}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2 mx-auto">
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════
  //  RENDER: MAIN SCANNER VIEW
  // ═══════════════════════════════════
  return (
    <div className="max-w-lg mx-auto space-y-4">
      <ScannerStatusBar scannerInfo={scannerInfo} onLogout={handleLogout} />

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
          {/* #qr-scanner div must always be present and EMPTY — 
              html5-qrcode injects a <video> element directly inside it.
              Never put children here, never conditionally render this div. */}
          <div id={QR_SCANNER_ID} className="absolute inset-0" />

          {/* Camera-off overlay (NOT inside #qr-scanner) */}
          {(!scanning || cameraStatus === 'loading') && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
              <div className="text-center p-8">
                {cameraStatus === 'loading' ? (
                  <>
                    <svg className="animate-spin w-12 h-12 text-indigo-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <p className="text-gray-400 text-sm">Starting camera...</p>
                  </>
                ) : (
                  <>
                    <Camera className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-500 text-sm">Camera is off</p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Scan overlay */}
          {cameraStatus === 'ready' && scanning && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-4 left-4 w-10 h-10 border-t-2 border-l-2 border-indigo-400 rounded-tl-lg" />
              <div className="absolute top-4 right-4 w-10 h-10 border-t-2 border-r-2 border-indigo-400 rounded-tr-lg" />
              <div className="absolute bottom-4 left-4 w-10 h-10 border-b-2 border-l-2 border-indigo-400 rounded-bl-lg" />
              <div className="absolute bottom-4 right-4 w-10 h-10 border-b-2 border-r-2 border-indigo-400 rounded-br-lg" />
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

        {/* Controls */}
        <div className="p-4 bg-gray-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${
              cameraStatus === 'ready' ? 'bg-green-400 animate-pulse' :
              cameraStatus === 'loading' ? 'bg-yellow-400 animate-pulse' :
              'bg-gray-500'
            }`} />
            <span className="text-xs text-gray-400">
              {cameraStatus === 'ready' ? 'Camera Ready' :
               cameraStatus === 'loading' ? 'Starting...' :
               'Stopped'}
            </span>
            {cameraError && cameraError !== 'permission_denied' && cameraError !== 'no_camera' && (
              <span className="text-xs text-amber-400 ml-2">{cameraError}</span>
            )}
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
        @keyframes shrinkWidth { from { width: 100%; } to { width: 0%; } }
        .animate-shrink { animation: shrinkWidth ${RESULT_DISPLAY_MS}ms linear forwards; }
      `}</style>
    </div>
  );
}

// ── Status bar component ──
function ScannerStatusBar({ scannerInfo, onLogout }) {
  return (
    <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        <span className="text-sm font-medium text-gray-700">
          {scannerInfo?.display_name || 'Scanner'}
        </span>
      </div>
      <button onClick={onLogout} className="text-xs text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1">
        <LogOut className="w-3 h-3" /> Logout
      </button>
    </div>
  );
}

// ── Result row component ──
function ResultRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500 font-medium">{label}</span>
      <span className="font-semibold text-gray-900">{value}</span>
    </div>
  );
}
