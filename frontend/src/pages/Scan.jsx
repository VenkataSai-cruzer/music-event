import { useState, useEffect, useRef, useCallback, Component } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, CameraOff, ScanIcon, WifiOff, AlertTriangle, RefreshCw, LogOut, Ban, ShieldCheck, QrCode } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

const QR_SCANNER_ID = 'qr-scanner';
const RESULT_DISPLAY_MS = 2000;
const POLL_INTERVAL_MS = 10000;
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ═══════════════════════════════════════════════════
//  ERROR BOUNDARY
// ═══════════════════════════════════════════════════
class ScanErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
          <div className="max-w-sm w-full bg-white/10 backdrop-blur-xl rounded-3xl border border-white/10 p-8 text-center">
            <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-white mb-2">Scanner Crashed</h2>
            <p className="text-sm text-gray-400 mb-6">Something went wrong. Please refresh the page.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-all"
            >
              <RefreshCw className="w-4 h-4 inline mr-2" />Refresh Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ═══════════════════════════════════════════════════
//  MAIN SCAN COMPONENT
// ═══════════════════════════════════════════════════
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
      gain.gain.value = 0.12;
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

  // ── Auto-start scanner after login ──
  useEffect(() => {
    if (loggedIn && scannerRef.current === null && !scanning && cameraStatus === 'idle') {
      const timer = setTimeout(() => doStartScanner(), 100);
      return () => clearTimeout(timer);
    }
  }, [loggedIn]);

  const getScannedBy = useCallback(() => scannerInfo?.display_name || 'Scanner', [scannerInfo]);

  // ── Lazy scanner factory ──
  const getScanner = useCallback(() => {
    if (!scannerRef.current) {
      const el = document.getElementById(QR_SCANNER_ID);
      if (!el) {
        console.error('[Scan] #qr-scanner div not in DOM yet');
        return null;
      }
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
      if (err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
        setResult({ success: false, action: 'network_error', error: 'Unable to reach server. Check connection.' });
        playSound('error');
      } else {
        setResult({ success: false, action: 'invalid', error: 'Invalid QR code' });
        playSound('error');
      }
    } finally {
      setProcessing(false);
    }
  }, [playSound, getScannedBy, fetchCounter]);

  // ── Resume scanner after result display ──
  const resumeScanner = useCallback(() => {
    (async () => {
      const scanner = scannerRef.current;
      if (scanner) {
        try { await scanner.stop(); } catch (e) {}
      }
      scannerRef.current = null;
      setResult(null);
      await new Promise(r => setTimeout(r, 50));
      await doStartScanner();
    })().catch(() => {});
  }, []);

  // ── Core scanner start logic ──
  const doStartScanner = useCallback(async () => {
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
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 15, qrbox: { width: 260, height: 260 }, aspectRatio: 1 },
        (decodedText) => {
          try { scanner.pause(); } catch (e) { }
          setProcessing(true);
          handleVerifyScan(decodedText);
        },
        () => {}
      );
      setCameraStatus('ready');
    } catch (err) {
      try {
        await scanner.start(
          { facingMode: 'user' },
          { fps: 15, qrbox: { width: 260, height: 260 }, aspectRatio: 1 },
          (decodedText) => {
            try { scanner.pause(); } catch (e) {}
            setProcessing(true);
            handleVerifyScan(decodedText);
          },
          () => {}
        );
        setCameraStatus('ready');
        setCameraError('Using front camera');
      } catch (err2) {
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

  // Auto-resume after result timeout
  useEffect(() => {
    if (!result) return;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(resumeScanner, RESULT_DISPLAY_MS);
    return () => { if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current); };
  }, [result, resumeScanner]);

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

  // ── Cleanup on unmount ──
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

  // ═══════════════════════════════════════════════════
  //  DETERMINE WHICH VIEW TO SHOW
  // ═══════════════════════════════════════════════════

  const showLogin = !loggedIn;
  const showResult = !!result;
  const showPermissionError = cameraError === 'permission_denied';
  const showNoCamera = cameraError === 'no_camera';
  const showCameraError = cameraStatus === 'error' && cameraError && !showPermissionError && !showNoCamera;
  const showScanner = !showLogin && !showResult && !showPermissionError && !showNoCamera && !showCameraError;

  return (
    <ScanErrorBoundary>
      {/* ══════════════════════════════════════════ */}
      {/*  QR SCANNER ELEMENT — ALWAYS IN DOM      */}
      {/*  z-index 20 sits BEHIND the scanner view  */}
      {/*  at z-index 30 so camera shows through    */}
      {/* ══════════════════════════════════════════ */}
      <div
        id={QR_SCANNER_ID}
        style={showScanner ? {
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 30,
        } : {
          position: 'fixed',
          top: '-9999px',
          left: '-9999px',
          width: '1px',
          height: '1px',
          opacity: 0,
          pointerEvents: 'none',
        }}
      />

      {/* ══════════════════════════════════════════ */}
      {/*  SCANNER LOGIN VIEW — Premium Dark       */}
      {/* ══════════════════════════════════════════ */}
      {showLogin && (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
          <div className="w-full max-w-sm">
            {/* Logo Area */}
            <div className="text-center mb-8">
              <div className="relative inline-flex mb-4">
                <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-indigo-500/30">
                  <ScanIcon className="w-10 h-10 text-white" />
                </div>
                <div className="absolute -inset-1 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-3xl blur-xl opacity-40" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-1">Event Scanner</h1>
              <p className="text-sm text-gray-400">7 NOTES — Live Jamming Session</p>
            </div>

            {/* Login Card */}
            <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-6 space-y-5">
              <div className="text-center">
                <h2 className="text-lg font-semibold text-white">Scanner Login</h2>
                <p className="text-xs text-gray-400 mt-1">Sign in with your assigned account</p>
              </div>

              <div className="space-y-3">
                <div>
                  <input
                    type="text" value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !loggingIn && handleScannerLogin()}
                    placeholder="Username (e.g., gate_a)"
                    className="w-full px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                    autoFocus
                  />
                </div>
                <div>
                  <input
                    type="password" value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !loggingIn && handleScannerLogin()}
                    placeholder="Password"
                    className="w-full px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                  />
                </div>
              </div>

              <button
                onClick={handleScannerLogin}
                disabled={loggingIn || !loginUsername.trim() || !loginPassword.trim()}
                className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 transition-all shadow-lg shadow-indigo-500/20"
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
                    <QrCode className="w-4 h-4" />
                    Login & Start Scanning
                  </span>
                )}
              </button>

              <p className="text-xs text-gray-500 text-center">
                Default: gate_a, gate_b, vip / password: scan123
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/*  RESULT OVERLAY — Bottom Sheet Style     */}
      {/* ══════════════════════════════════════════ */}
      {showResult && <ScanResultOverlay result={result} getScannedBy={getScannedBy} resumeScanner={resumeScanner} />}

      {/* ══════════════════════════════════════════ */}
      {/*  CAMERA ERROR VIEWS                      */}
      {/* ══════════════════════════════════════════ */}
      {(showPermissionError || showNoCamera || showCameraError) && (
        <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
          {/* Top bar */}
          {loggedIn && (
            <div className="flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-400 rounded-full" />
                <span className="text-sm text-gray-300">{scannerInfo?.display_name || 'Scanner'}</span>
              </div>
              <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-red-400 transition-colors flex items-center gap-1">
                <LogOut className="w-3 h-3" /> Logout
              </button>
            </div>
          )}

          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center max-w-sm">
              {showPermissionError && (
                <>
                  <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <CameraOff className="w-10 h-10 text-red-400" />
                  </div>
                  <h2 className="text-xl font-bold text-white mb-2">Camera Access Needed</h2>
                  <p className="text-sm text-gray-400 mb-6">Allow camera access to scan tickets. Check browser settings and retry.</p>
                  <button onClick={doStartScanner}
                    className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-all flex items-center gap-2 mx-auto">
                    <RefreshCw className="w-4 h-4" /> Try Again
                  </button>
                </>
              )}
              {showNoCamera && (
                <>
                  <div className="w-20 h-20 bg-gray-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <CameraOff className="w-10 h-10 text-gray-500" />
                  </div>
                  <h2 className="text-xl font-bold text-white mb-2">No Camera Detected</h2>
                  <p className="text-sm text-gray-400">Use a mobile phone or connect a webcam to scan tickets.</p>
                </>
              )}
              {showCameraError && (
                <>
                  <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <AlertTriangle className="w-10 h-10 text-red-400" />
                  </div>
                  <h2 className="text-xl font-bold text-white mb-2">Camera Error</h2>
                  <p className="text-sm text-gray-400 mb-2">{cameraError}</p>
                  <button onClick={doStartScanner}
                    className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-all flex items-center gap-2 mx-auto">
                    <RefreshCw className="w-4 h-4" /> Retry
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/*  MAIN SCANNER VIEW — Full Screen Premium  */}
      {/*  NO background — camera feed from the      */}
      {/*  #qr-scanner sibling (z-index 30, BEHIND)  */}
      {/*  shows through transparent areas.           */}
      {/* ══════════════════════════════════════════ */}
      {showScanner && (
        <div className="fixed inset-0 z-30 flex flex-col overflow-hidden">
          {/* Top Bar — Glassmorphism */}
          <div className="relative z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
            <div className="flex items-center gap-2.5">
              <div className={`w-2 h-2 rounded-full ${
                cameraStatus === 'ready' ? 'bg-emerald-400 shadow-lg shadow-emerald-400/50 animate-pulse' :
                cameraStatus === 'loading' ? 'bg-amber-400 animate-pulse' : 'bg-gray-500'
              }`} />
              <span className="text-sm text-white/80 font-medium">{scannerInfo?.display_name || 'Scanner'}</span>
              <span className="text-xs text-white/40 hidden sm:inline">
                {cameraStatus === 'ready' ? '● Live' : cameraStatus === 'loading' ? '● Starting...' : ''}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {/* Counter Badge */}
              {counter.total > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/40 backdrop-blur-md rounded-full">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs font-medium text-white">{counter.used}</span>
                  <span className="text-xs text-white/40">/</span>
                  <span className="text-xs font-medium text-white">{counter.total}</span>
                </div>
              )}
              <button onClick={handleLogout} className="text-xs text-white/50 hover:text-red-400 transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Camera Area — transparent, camera feed from behind shows through */}
          <div className="flex-1 relative">
            {/* Dark vignette overlays for readability of UI on top */}
            <div className="absolute inset-0 pointer-events-none z-10">
              <div className="absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-black/50 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black/50 to-transparent" />
            </div>

            {/* Loading overlay — only visible when camera not ready */}
            {(!scanning || cameraStatus === 'loading') && (
              <div className="absolute inset-0 flex items-center justify-center z-20">
                <div className="text-center">
                  {cameraStatus === 'loading' ? (
                    <div className="bg-black/60 backdrop-blur-md rounded-2xl px-8 py-6">
                      <svg className="animate-spin w-10 h-10 text-indigo-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <p className="text-white/80 text-sm">Starting camera...</p>
                    </div>
                  ) : (
                    <div className="bg-black/60 backdrop-blur-md rounded-2xl px-8 py-6">
                      <Camera className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-400 text-sm">Camera is off</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Premium Scan Frame */}
            {cameraStatus === 'ready' && scanning && (
              <div className="absolute inset-0 pointer-events-none z-10">
                {/* Scan frame */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  <div className="relative w-64 h-64">
                    {/* Glow behind corners */}
                    <div className="absolute -inset-4 bg-indigo-500/20 rounded-3xl blur-2xl" />
                    
                    {/* Corner pieces with glow */}
                    <div className="absolute -top-1 -left-1 w-14 h-14">
                      <div className="absolute inset-0 border-t-[3px] border-l-[3px] border-indigo-400 rounded-tl-2xl shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
                    </div>
                    <div className="absolute -top-1 -right-1 w-14 h-14">
                      <div className="absolute inset-0 border-t-[3px] border-r-[3px] border-indigo-400 rounded-tr-2xl shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
                    </div>
                    <div className="absolute -bottom-1 -left-1 w-14 h-14">
                      <div className="absolute inset-0 border-b-[3px] border-l-[3px] border-indigo-400 rounded-bl-2xl shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-14 h-14">
                      <div className="absolute inset-0 border-b-[3px] border-r-[3px] border-indigo-400 rounded-br-2xl shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
                    </div>

                    {/* Scan line */}
                    <div className="absolute left-3 right-3 h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-[0_0_10px_rgba(99,102,241,0.5)] animate-scan-smooth" />
                  </div>
                </div>

                {/* Instruction */}
                <div className="absolute bottom-20 left-0 right-0 text-center px-8">
                  <p className="text-white/90 text-sm font-medium tracking-wide drop-shadow-lg">
                    Position QR code inside the frame
                  </p>
                  <p className="text-white/40 text-xs mt-1.5">Auto-scans when detected</p>
                </div>
              </div>
            )}

            {/* Processing overlay */}
            {processing && (
              <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20 backdrop-blur-sm">
                <div className="text-center">
                  <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="animate-spin w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                  <p className="text-white/90 text-sm font-medium">Verifying Entry...</p>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Controls — Glassmorphism */}
          <div className="relative z-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pt-8 pb-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/60">
                  {cameraError && cameraError !== 'permission_denied' && cameraError !== 'no_camera' ? (
                    <span className="text-amber-400">{cameraError}</span>
                  ) : cameraStatus === 'ready' ? (
                    'Ready to scan'
                  ) : cameraStatus === 'loading' ? (
                    'Initializing...'
                  ) : (
                    'Camera stopped'
                  )}
                </span>
              </div>
              <button
                onClick={scanning ? stopScanner : doStartScanner}
                className={`px-8 py-2.5 rounded-full text-sm font-semibold transition-all ${
                  scanning
                    ? 'bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30'
                    : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30'
                }`}
              >
                {scanning ? 'Stop' : 'Start'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline styles */}
      <style>{`
        @keyframes scanLineSmooth {
          0%, 100% { top: 8%; }
          50% { top: 88%; }
        }
        .animate-scan-smooth {
          animation: scanLineSmooth 2.5s ease-in-out infinite;
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-fade-slide {
          animation: fadeSlideUp 0.3s ease-out;
        }
        @keyframes shrinkWidth {
          from { width: 100%; }
          to { width: 0%; }
        }
        .animate-shrink { animation: shrinkWidth ${RESULT_DISPLAY_MS}ms linear forwards; }
        @keyframes successPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        .animate-success-pulse {
          animation: successPulse 0.4s ease-in-out 2;
        }
        /* Force html5-qrcode video to fill the viewport */
        #qr-scanner video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
        }
      `}</style>
    </ScanErrorBoundary>
  );
}

// ═══════════════════════════════════════════════════
//  SUB-COMPONENTS
// ═══════════════════════════════════════════════════

function ResultRow({ label, value, highlight }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs uppercase tracking-wider text-gray-400">{label}</span>
      <span className={`text-sm font-semibold text-right ${highlight ? 'text-indigo-600' : 'text-gray-900'}`}>{value}</span>
    </div>
  );
}

function ScanResultOverlay({ result, getScannedBy, resumeScanner }) {
  const { action, result: resultType } = result;
  const approved = action === 'approved';
  const used = action === 'already_used';
  const cancelled = action === 'cancelled' || resultType === 'CANCELLED';
  const invalid = action === 'invalid' || resultType === 'INVALID';
  const networkError = action === 'network_error';

  const d = result.data || {};

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className={`w-full max-w-sm mx-auto bg-white rounded-3xl overflow-hidden shadow-2xl animate-fade-slide ${approved ? 'animate-success-pulse' : ''}`}>
        {/* Header Section */}
        {approved && (
          <div className="bg-gradient-to-r from-emerald-500 to-green-600 px-6 py-8 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0.15),transparent_70%)]" />
            <div className="relative">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 ring-4 ring-white/20">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">ENTRY APPROVED</h2>
              <p className="text-emerald-100 text-sm mt-0.5">Welcome to 7 NOTES!</p>
            </div>
          </div>
        )}

        {used && (
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-8 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0.15),transparent_70%)]" />
            <div className="relative">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 ring-4 ring-white/20">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">ALREADY SCANNED</h2>
              <p className="text-amber-100 text-sm mt-0.5">Entry was already approved</p>
            </div>
          </div>
        )}

        {cancelled && (
          <div className="bg-gradient-to-r from-red-500 to-rose-600 px-6 py-8 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0.15),transparent_70%)]" />
            <div className="relative">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 ring-4 ring-white/20">
                <Ban className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">CANCELLED</h2>
              <p className="text-red-100 text-sm mt-0.5">Registration no longer valid</p>
            </div>
          </div>
        )}

        {invalid && (
          <div className="bg-gradient-to-r from-gray-600 to-gray-700 px-6 py-8 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0.1),transparent_70%)]" />
            <div className="relative">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 ring-4 ring-white/20">
                <AlertTriangle className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">INVALID QR</h2>
              <p className="text-gray-300 text-sm mt-0.5">Not recognized in system</p>
            </div>
          </div>
        )}

        {networkError && (
          <div className="bg-gradient-to-r from-red-500 to-rose-600 px-6 py-8 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0.15),transparent_70%)]" />
            <div className="relative">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 ring-4 ring-white/20">
                <WifiOff className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">CONNECTION ERROR</h2>
              <p className="text-red-100 text-sm mt-0.5">Unable to reach server</p>
            </div>
          </div>
        )}

        {/* Body Section */}
        <div className="px-6 py-5">
          {approved && (
            <div className="bg-emerald-50/80 rounded-2xl p-4 space-y-1 divide-y divide-emerald-100/50">
              <ResultRow label="Name" value={d.attendeeName} highlight />
              <ResultRow label="Ticket" value={d.ticketId} />
              <ResultRow label="Scanner" value={getScannedBy()} />
              <ResultRow label="Time" value={new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} />
            </div>
          )}

          {used && (
            <div className="bg-amber-50/80 rounded-2xl p-4 space-y-1 divide-y divide-amber-100/50">
              <ResultRow label="Name" value={d.attendeeName} highlight />
              <ResultRow label="Ticket" value={d.ticketId} />
              <ResultRow label="Original Scan" value={d.scannedBy} />
              <ResultRow label="Scanned At" value={d.scannedAt ? new Date(d.scannedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : null} />
            </div>
          )}

          {cancelled && (
            <p className="text-sm text-center text-gray-500 py-2">
              Please ask the attendee to contact the organizer.
            </p>
          )}

          {invalid && (
            <p className="text-sm text-center text-gray-500 py-2">
              Only official 7 NOTES tickets are accepted.
            </p>
          )}

          {networkError && (
            <div className="space-y-3">
              <p className="text-sm text-center text-gray-500">Check your internet connection and try again.</p>
              <button onClick={() => { resumeScanner(); }}
                className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4" /> Retry
              </button>
            </div>
          )}
        </div>

        {/* Auto-resume countdown bar */}
        <div className="h-1 bg-gray-100">
          <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 animate-shrink rounded-full" />
        </div>
      </div>
    </div>
  );
}
