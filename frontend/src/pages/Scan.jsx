import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import toast from 'react-hot-toast';
import { CheckCircle, XCircle, AlertTriangle, Camera, CameraOff, ScanQrCode } from 'lucide-react';
import { ticketService } from '../services/ticketService';

const QR_SCANNER_ID = 'qr-scanner';
const SCAN_COOLDOWN_MS = 5000; // Prevent re-scanning same code within 5 seconds

export default function Scan() {
  const [scanning, setScanning] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [result, setResult] = useState(null);
  const [processing, setProcessing] = useState(false);
  const scannerRef = useRef(null);
  const recentScansRef = useRef(new Map()); // token -> timestamp

  // Initialize scanner
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
      setCameraReady(true);
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
    setCameraReady(false);
  };

  const onScanSuccess = async (decodedText) => {
    // Prevent re-scanning the same code within cooldown period
    const now = Date.now();
    const lastScan = recentScansRef.current.get(decodedText);
    if (lastScan && now - lastScan < SCAN_COOLDOWN_MS) return;
    recentScansRef.current.set(decodedText, now);

    // Clean up old entries to prevent memory leak
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
      setResult({
        valid: false,
        error: data?.error || 'Invalid ticket',
      });
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

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">QR Verification</h1>
        <p className="text-gray-500 text-sm">Scan tickets at the venue entrance</p>
      </div>

      {/* Scanner Card */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Camera Viewport */}
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

          {/* Status overlay */}
          {processing && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="w-10 h-10 border-3 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="p-4 flex gap-3">
          {!scanning ? (
            <button
              onClick={startScanner}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
            >
              <Camera className="w-4 h-4" />
              Start Scanning
            </button>
          ) : (
            <button
              onClick={stopScanner}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
            >
              <CameraOff className="w-4 h-4" />
              Stop Camera
            </button>
          )}
        </div>
      </div>

      {/* Scan Result */}
      {result && (
        <div
          className={`rounded-xl border-2 p-5 ${
            result.valid === false
              ? 'border-red-200 bg-red-50'
              : result.ticket?.status === 'USED'
              ? 'border-amber-200 bg-amber-50'
              : 'border-green-200 bg-green-50'
          }`}
        >
          {/* Status header */}
          <div className="flex items-center gap-3 mb-4">
            {result.valid === false ? (
              <>
                <XCircle className="w-8 h-8 text-red-500" />
                <div>
                  <h3 className="font-semibold text-red-800">Invalid Ticket</h3>
                  <p className="text-sm text-red-600">{result.error}</p>
                </div>
              </>
            ) : result.ticket?.status === 'USED' ? (
              <>
                <AlertTriangle className="w-8 h-8 text-amber-500" />
                <div>
                  <h3 className="font-semibold text-amber-800">Already Used</h3>
                  <p className="text-sm text-amber-600">
                    Previously scanned at:{' '}
                    {result.ticket.scanned_at
                      ? new Date(result.ticket.scanned_at).toLocaleString()
                      : 'Unknown'}
                  </p>
                </div>
              </>
            ) : (
              <>
                <CheckCircle className="w-8 h-8 text-green-500" />
                <div>
                  <h3 className="font-semibold text-green-800">Valid Ticket</h3>
                  <p className="text-sm text-green-600">Ready for entry</p>
                </div>
              </>
            )}
          </div>

          {/* Ticket details */}
          {result.ticket && (
            <div className="bg-white rounded-lg p-4 space-y-2 text-sm mb-4">
              <div className="flex justify-between">
                <span className="text-gray-500">Ticket ID</span>
                <span className="font-mono font-medium">{result.ticket.ticket_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Name</span>
                <span className="font-medium">{result.ticket.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    result.ticket.status === 'VALID'
                      ? 'bg-green-100 text-green-700'
                      : result.ticket.status === 'USED'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {result.ticket.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Event Date</span>
                <span>
                  {new Date(result.ticket.event_date).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Venue</span>
                <span className="text-right max-w-[200px]">{result.ticket.event_address}</span>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleResetScanner}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-white transition-colors"
            >
              Scan Next
            </button>
            {result.valid !== false && result.ticket?.status === 'VALID' && (
              <button
                onClick={handleApproveEntry}
                disabled={processing}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60 transition-colors"
              >
                {processing ? 'Processing...' : 'Approve Entry'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
