import { useState, useEffect, useRef, useCallback, Component } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { CameraOff, ScanIcon, AlertTriangle, RefreshCw, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

const QR_SCANNER_ID = 'qr-scanner';
const RESULT_DISPLAY_MS = 2000;
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
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-950">
          <div className="max-w-sm w-full bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
            <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-white mb-2">Scanner Unavailable</h2>
            <p className="text-sm text-gray-400 mb-6">An unexpected error occurred. Please refresh the page.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5 inline mr-2" />Refresh
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
  const [cameraStatus, setCameraStatus] = useState('idle');
  const [cameraError, setCameraError] = useState(null);
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

  // ── Sound effects ──
  const playSound = useCallback((type) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.value = 0.1;
      if (type === 'success') {
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      } else if (type === 'warn') {
        osc.frequency.setValueAtTime(660, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      } else {
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.setValueAtTime(200, ctx.currentTime + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      }
    } catch (e) { /* silent */ }
  }, []);

  useEffect(() => {
    if (loggedIn && scannerRef.current === null && !scanning && cameraStatus === 'idle') {
      const timer = setTimeout(() => doStartScanner(), 100);
      return () => clearTimeout(timer);
    }
  }, [loggedIn]);

  const getScannedBy = useCallback(() => scannerInfo?.display_name || 'Scanner', [scannerInfo]);

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

  const handleVerifyScan = useCallback(async (decodedText) => {
    try {
      const scannedBy = getScannedBy();
      const res = await axios.post(`${API_URL}/api/tickets/verify`, {
        qr_token: decodedText, scanned_by: scannedBy
      });

      if (res.data.action === 'approved') {
        playSound('success');
      } else if (res.data.action === 'already_used') {
        playSound('warn');
      } else {
        playSound('error');
      }
      setResult(res.data);
    } catch (err) {
      if (err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
        setResult({ success: false, action: 'network_error', error: 'Unable to reach server.' });
        playSound('error');
      } else {
        setResult({ success: false, action: 'invalid', error: 'Invalid QR code' });
        playSound('error');
      }
    } finally {
      setProcessing(false);
    }
  }, [playSound, getScannedBy]);

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
        { fps: 15, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
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
          { fps: 15, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
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

  useEffect(() => {
    if (!result) return;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(resumeScanner, RESULT_DISPLAY_MS);
    return () => { if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current); };
  }, [result, resumeScanner]);

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

  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      const scanner = scannerRef.current;
      if (scanner) {
        scanner.stop().then(() => scanner.clear()).catch(() => {});
      }
    };
  }, []);

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

  const showLogin = !loggedIn;
  const showResult = !!result;
  const showPermissionError = cameraError === 'permission_denied';
  const showNoCamera = cameraError === 'no_camera';
  const showCameraError = cameraStatus === 'error' && cameraError && !showPermissionError && !showNoCamera;
  const showScanner = !showLogin && !showResult && !showPermissionError && !showNoCamera && !showCameraError;

  return (
    <ScanErrorBoundary>
      {/* QR Scanner Element */}
      <div
        id={QR_SCANNER_ID}
        style={showScanner ? {
          position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex: 30,
        } : {
          position: 'fixed', top: '-9999px', left: '-9999px', width: '1px', height: '1px',
          opacity: 0, pointerEvents: 'none',
        }}
      />

      {/* ════════════════════════════════════ */}
      {/*  LOGIN VIEW                        */}
      {/* ════════════════════════════════════ */}
      {showLogin && (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-950">
          <div className="w-full max-w-sm">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <ScanIcon className="w-8 h-8 text-gray-300" />
              </div>
              <h1 className="text-xl font-semibold text-white">Scanner Login</h1>
              <p className="text-sm text-gray-500 mt-1">Sign in with your assigned account</p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
              <input
                type="text" value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !loggingIn && handleScannerLogin()}
                placeholder="Username"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-sm text-white placeholder-gray-500 focus:border-gray-500 focus:ring-1 focus:ring-gray-500 outline-none transition-all"
                autoFocus
              />
              <input
                type="password" value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !loggingIn && handleScannerLogin()}
                placeholder="Password"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-sm text-white placeholder-gray-500 focus:border-gray-500 focus:ring-1 focus:ring-gray-500 outline-none transition-all"
              />
              <button
                onClick={handleScannerLogin}
                disabled={loggingIn || !loginUsername.trim() || !loginPassword.trim()}
                className="w-full py-3 bg-white text-gray-950 rounded-xl font-medium hover:bg-gray-200 disabled:opacity-40 transition-all text-sm"
              >
                {loggingIn ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Signing in...
                  </span>
                ) : (
                  'Sign In'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════ */}
      {/*  RESULT OVERLAY                    */}
      {/* ════════════════════════════════════ */}
      {showResult && <ScanResultOverlay result={result} getScannedBy={getScannedBy} resumeScanner={resumeScanner} />}

      {/* ════════════════════════════════════ */}
      {/*  CAMERA ERROR VIEWS                */}
      {/* ════════════════════════════════════ */}
      {(showPermissionError || showNoCamera || showCameraError) && (
        <div className="min-h-screen flex flex-col bg-gray-950">
          {loggedIn && (
            <div className="flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-400 rounded-full" />
                <span className="text-sm text-gray-400">{scannerInfo?.display_name || 'Scanner'}</span>
              </div>
              <button onClick={handleLogout} className="text-xs text-gray-500 hover:text-red-400 transition-colors">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center max-w-sm">
              {showPermissionError && (
                <>
                  <CameraOff className="w-10 h-10 text-red-400 mx-auto mb-4" />
                  <h2 className="text-lg font-semibold text-white mb-2">Camera Access Required</h2>
                  <p className="text-sm text-gray-500 mb-6">Allow camera access in your browser settings, then retry.</p>
                  <button onClick={doStartScanner}
                    className="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm transition-all">
                    <RefreshCw className="w-3.5 h-3.5 inline mr-2" /> Try Again
                  </button>
                </>
              )}
              {showNoCamera && (
                <>
                  <CameraOff className="w-10 h-10 text-gray-500 mx-auto mb-4" />
                  <h2 className="text-lg font-semibold text-white mb-2">No Camera Found</h2>
                  <p className="text-sm text-gray-500">Connect a camera or use a mobile device.</p>
                </>
              )}
              {showCameraError && (
                <>
                  <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-4" />
                  <h2 className="text-lg font-semibold text-white mb-2">Camera Error</h2>
                  <p className="text-sm text-gray-400 mb-2">{cameraError}</p>
                  <button onClick={doStartScanner}
                    className="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm transition-all">
                    <RefreshCw className="w-3.5 h-3.5 inline mr-2" /> Retry
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════ */}
      {/*  MAIN SCANNER VIEW                 */}
      {/* ════════════════════════════════════ */}
      {showScanner && (
        <div className="fixed inset-0 z-30 flex flex-col overflow-hidden">
          {/* Minimal Top Bar */}
          <div className="relative z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                cameraStatus === 'ready' ? 'bg-green-400 animate-pulse' :
                cameraStatus === 'loading' ? 'bg-yellow-400 animate-pulse' : 'bg-gray-500'
              }`} />
              <span className="text-sm text-white/70">{scannerInfo?.display_name || 'Scanner'}</span>
            </div>
            <button onClick={handleLogout} className="text-white/40 hover:text-red-400 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* Camera Feed Area */}
          <div className="flex-1 relative">
            {/* Vignette */}
            <div className="absolute inset-0 pointer-events-none z-10">
              <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-black/40 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent" />
            </div>

            {/* Loading */}
            {cameraStatus === 'loading' && (
              <div className="absolute inset-0 flex items-center justify-center z-20">
                <div className="bg-black/50 backdrop-blur-sm rounded-lg px-6 py-4">
                  <svg className="animate-spin w-6 h-6 text-gray-400 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-white/60 text-xs">Starting camera...</p>
                </div>
              </div>
            )}

            {/* Scan Frame */}
            {cameraStatus === 'ready' && scanning && (
              <div className="absolute inset-0 pointer-events-none z-10">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  <div className="relative w-60 h-60">
                    {/* Corner brackets */}
                    <div className="absolute top-0 left-0 w-10 h-10 border-t-2 border-l-2 border-white/70 rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-10 h-10 border-t-2 border-r-2 border-white/70 rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-10 h-10 border-b-2 border-l-2 border-white/70 rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-10 h-10 border-b-2 border-r-2 border-white/70 rounded-br-lg" />
                    {/* Scan line */}
                    <div className="absolute left-4 right-4 h-px bg-white/60 animate-scan" />
                  </div>
                </div>
                <div className="absolute bottom-24 left-0 right-0 text-center">
                  <p className="text-white/70 text-xs tracking-widest uppercase">Align QR Code</p>
                </div>
              </div>
            )}

            {/* Processing */}
            {processing && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20 backdrop-blur-sm">
                <div className="text-center">
                  <svg className="animate-spin w-7 h-7 text-white/70 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-white/60 text-xs">Verifying...</p>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Controls */}
          <div className="relative z-20 bg-gradient-to-t from-black/60 via-black/30 to-transparent px-4 pt-12 pb-6">
            <button
              onClick={scanning ? stopScanner : doStartScanner}
              className={`w-full py-3 rounded-xl text-sm font-medium transition-all ${
                scanning
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
                  : 'bg-white/10 text-white/70 border border-white/10 hover:bg-white/20'
              }`}
            >
              {scanning ? 'Stop Scanning' : 'Start Scanning'}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes scanLine {
          0%, 100% { top: 10%; }
          50% { top: 88%; }
        }
        .animate-scan {
          animation: scanLine 2.5s ease-in-out infinite;
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-slide {
          animation: fadeSlideUp 0.25s ease-out;
        }
        @keyframes shrinkWidth {
          from { width: 100%; }
          to { width: 0%; }
        }
        .animate-shrink { animation: shrinkWidth ${RESULT_DISPLAY_MS}ms linear forwards; }
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
//  RESULT OVERLAY
// ═══════════════════════════════════════════════════
function ScanResultOverlay({ result, getScannedBy, resumeScanner }) {
  const { action, result: resultType } = result;
  const approved = action === 'approved';
  const used = action === 'already_used';
  const cancelled = action === 'cancelled' || resultType === 'CANCELLED';
  const invalid = action === 'invalid' || resultType === 'INVALID';
  const networkError = action === 'network_error';

  const d = result.data || {};

  const getStatusConfig = () => {
    if (approved) return { icon: (
      <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ), bg: 'bg-green-500', label: 'Approved', accent: 'green' };
    if (used) return { icon: (
      <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ), bg: 'bg-amber-500', label: 'Already Scanned', accent: 'amber' };
    if (cancelled) return { icon: (
      <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ), bg: 'bg-red-500', label: 'Cancelled', accent: 'red' };
    if (invalid) return { icon: (
      <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ), bg: 'bg-gray-600', label: 'Invalid QR', accent: 'gray' };
    if (networkError) return { icon: (
      <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728M8.464 15.536a5 5 0 010-7.072m7.072 0a5 5 0 010 7.072" />
      </svg>
    ), bg: 'bg-red-500', label: 'Connection Error', accent: 'red' };
    return { icon: null, bg: 'bg-gray-600', label: '', accent: 'gray' };
  };

  const config = getStatusConfig();

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm mx-auto bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden animate-fade-slide">
        {/* Status Header */}
        <div className={`${config.bg} px-5 py-5 text-center`}>
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2">
            {config.icon}
          </div>
          <p className="text-white font-semibold text-base">{config.label}</p>
        </div>

        {/* Details */}
        <div className="px-5 py-4 space-y-3">
          {approved && (
            <div className="space-y-2">
              <DetailRow label="Name" value={d.attendeeName} />
              <DetailRow label="Ticket" value={d.ticketId} />
              <DetailRow label="Scanned by" value={getScannedBy()} />
            </div>
          )}
          {used && (
            <div className="space-y-2">
              <DetailRow label="Name" value={d.attendeeName} />
              <DetailRow label="Ticket" value={d.ticketId} />
              <DetailRow label="Original scan" value={d.scannedBy} />
              <DetailRow label="Time" value={d.scannedAt ? new Date(d.scannedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : null} />
            </div>
          )}
          {cancelled && (
            <p className="text-sm text-gray-400 text-center">This ticket has been cancelled.</p>
          )}
          {invalid && (
            <p className="text-sm text-gray-400 text-center">QR code not recognized.</p>
          )}
          {networkError && (
            <button onClick={() => { resumeScanner(); }}
              className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-sm transition-all flex items-center justify-center gap-2">
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </button>
          )}
        </div>

        {/* Countdown bar */}
        {!networkError && (
          <div className="h-0.5 bg-gray-800">
            <div className="h-full bg-white/30 animate-shrink rounded-full" />
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      <span className="text-sm font-medium text-white text-right">{value}</span>
    </div>
  );
}
