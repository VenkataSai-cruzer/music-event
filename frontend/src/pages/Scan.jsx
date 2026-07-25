import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import toast from 'react-hot-toast';
import { CheckCircle2, XCircle, AlertTriangle, Camera, CameraOff, ScanQrCode, Clock, User, Hash, MapPin, Calendar } from 'lucide-react';
import { ticketService } from '../services/ticketService';

const QR_SCANNER_ID = 'qr-scanner';
const SCAN_COOLDOWN_MS = 5000;

export default function Scan() {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [processing, setProcessing] = useState(false);
  const scannerRef = useRef(null);
  const recentScansRef = useRef(new Map());

  useEffect(() => {
    const scanner = new Html5Qrcode(QR_SCANNER_ID);
    scannerRef.current = scanner;
    return () => {
      if (scanner && scanning) {
        scanner.stop().catch(() => {});
      }
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
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
      }
    } catch (e) {}
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
    } catch (err) {
      const data = err.response?.data;
      setResult({ valid: false, error: data?.error || 'Invalid QR code' });
    } finally {
      setProcessing(false);
    }
  };

  const handleApproveEntry = async () => {
    if (!result?.ticket?.ticket_id) return;
    setProcessing(true);
    try {
      const res = await ticketService.useTicket(result.ticket.ticket_id);
      setResult((prev) => ({
        ...prev,
        ticket: { ...prev.ticket, ...res.data.ticket },
      }));
      toast.success('Entry approved!');
    } catch (err) {
      const data = err.response?.data;
      toast.error(data?.error || 'Failed to approve entry');
      if (data?.ticket) {
        setResult((prev) => ({
          ...prev,
          ticket: { ...prev.ticket, ...data.ticket },
        }));
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleResetScanner = useCallback(() => {
    setResult(null);
    if (!scanning) {
      startScanner();
    }
  }, [scanning]);

  // ── Professional Result Card ──
  const renderResult = () => {
    if (!result) return null;

    // Invalid QR
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
          <div className="p-5">
            <button
              onClick={handleResetScanner}
              className="w-full py-3 bg-red-50 text-red-700 rounded-xl font-medium hover:bg-red-100 transition-colors"
            >
              Scan Next
            </button>
          </div>
        </div>
      );
    }

    // Already Used
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
              <span>
                Scanned at{' '}
                {result.ticket.scanned_at
                  ? new Date(result.ticket.scanned_at).toLocaleTimeString('en-US', {
                      hour: '2-digit', minute: '2-digit',
                    })
                  : 'Unknown'}
              </span>
            </div>
            <p className="text-amber-100 text-xs mt-1">
              {result.ticket.scanned_at
                ? new Date(result.ticket.scanned_at).toLocaleDateString('en-US', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                  })
                : ''}
            </p>
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
            <button
              onClick={handleResetScanner}
              className="w-full py-3 bg-amber-50 text-amber-700 rounded-xl font-medium hover:bg-amber-100 transition-colors"
            >
              Scan Next
            </button>
          </div>
        </div>
      );
    }

    // Valid Ticket — ENTRY APPROVED
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
              <span className="ml-auto text-gray-900">
                {new Date(result.ticket.event_date).toLocaleDateString()}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-green-500" />
              <span className="text-gray-500">Venue</span>
              <span className="ml-auto text-gray-900 text-right max-w-[180px]">{result.ticket.event_address}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleResetScanner}
              className="flex-1 py-3 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Scan Next
            </button>
            <button
              onClick={handleApproveEntry}
              disabled={processing}
              className="flex-1 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
            >
              {processing ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Approve Entry
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">QR Verification</h1>
        <p className="text-gray-500 text-sm">Scan tickets at the venue entrance</p>
      </div>

      {/* Scanner Card */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="relative bg-gray-900">
          <div
            id={QR_SCANNER_ID}
            className={`w-full aspect-square ${scanning ? '' : 'flex items-center justify-center'}`}
          >
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
            <button
              onClick={startScanner}
              className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <Camera className="w-4 h-4" />
              Start Scanning
            </button>
          ) : (
            <button
              onClick={stopScanner}
              className="w-full flex items-center justify-center gap-2 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors shadow-sm"
            >
              <CameraOff className="w-4 h-4" />
              Stop Camera
            </button>
          )}
        </div>
      </div>

      {/* Result */}
      {result && renderResult()}
    </div>
  );
}
