import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { TicketPlus, ArrowLeft, Download, Eye, CheckCircle, RefreshCw } from 'lucide-react';
import { ticketService } from '../services/ticketService';

export default function CreateTicket() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [createdTicket, setCreatedTicket] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  // Idempotency key — generated once per form session (using browser crypto)
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const doDownload = async (ticketId) => {
    setDownloading(true);
    try {
      const res = await ticketService.download(ticketId);
      if (res.data.type === 'application/json') {
        const text = await new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsText(res.data);
        });
        const errData = JSON.parse(text);
        throw new Error(errData.message || errData.error || 'PDF generation failed');
      }
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `registration-${ticketId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setDownloadStarted(true);
      toast.success('PDF downloaded automatically');
    } catch (err) {
      toast.error(err.message || 'Failed to download PDF');
    } finally {
      setDownloading(false);
    }
  };

  const doPreview = async (ticketId) => {
    setPreviewing(true);
    try {
      const res = await ticketService.preview(ticketId);
      if (res.data.type === 'application/json') {
        const text = await new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsText(res.data);
        });
        const errData = JSON.parse(text);
        throw new Error(errData.message || 'PDF preview failed');
      }
      const url = window.URL.createObjectURL(new Blob([res.data]));
      window.open(url, '_blank');
    } catch (err) {
      toast.error(err.message || 'Failed to preview PDF');
    } finally {
      setPreviewing(false);
    }
  };

  const onSubmit = async (data) => {
    if (submitting) return; // Prevent double submission
    setSubmitting(true);
    setPdfFailed(false);

    // Attach idempotency key to prevent duplicate registrations
    const payload = { ...data, clientRequestId: idempotencyKeyRef.current };

    try {
      const res = await ticketService.create(payload);
      const ticket = res.data.data || res.data;

      setCreatedTicket(ticket);

      if (res.data.success === false && ticket) {
        // Registration exists but PDF failed
        setPdfFailed(true);
        setDownloadStarted(true);
        toast.success(`Registration ${ticket.ticketId || ticket.ticket_id} created!`);
        toast('PDF generation failed — click Regenerate to create it', { icon: '⚠️' });
      } else {
        toast.success(`Registration ${ticket.ticketId} created!`);

        // Auto-download PDF if generation succeeded
        if (ticket.hasPdf || ticket.pdf_data) {
          await doDownload(ticket.ticketId);
        } else {
          setDownloadStarted(true);
          toast('PDF is being generated — use Download to retrieve it', { icon: '⏳' });
        }
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to create registration';
      toast.error(msg);
      // Keep form data — user can retry
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegenerate = async () => {
    if (!createdTicket) return;
    setRegenerating(true);
    try {
      const ticketId = createdTicket.ticketId || createdTicket.ticket_id;
      await ticketService.regeneratePDF(ticketId);
      toast.success('PDF regenerated successfully');
      setPdfFailed(false);
      await doDownload(ticketId);
    } catch (err) {
      toast.error('Failed to regenerate PDF');
    } finally {
      setRegenerating(false);
    }
  };

  const createAnother = () => {
    setCreatedTicket(null);
    setDownloadStarted(false);
    setPdfFailed(false);
    idempotencyKeyRef.current = crypto.randomUUID(); // New key for next form session
    reset();
  };

  const inputClass = (fieldError) =>
    `w-full px-4 py-2.5 rounded-lg border text-sm outline-none transition-all ${
      fieldError ? 'border-red-400 ring-2 ring-red-100' : 'border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
    }`;

  // ── Success State ──
  if (createdTicket && downloadStarted) {
    return (
      <div className="max-w-md mx-auto text-center space-y-6 py-8">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Registration Created</h1>
          <p className="text-gray-500 text-sm mt-1">{createdTicket.ticketId}</p>
          <p className="text-gray-400 text-xs mt-1">PDF downloaded automatically</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-left space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Name</span><span className="font-medium">{createdTicket.attendee?.fullName}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Mobile</span><span className="font-medium">{createdTicket.attendee?.mobile}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Status</span><span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">{createdTicket.status}</span></div>
        </div>
        <div className="flex gap-3">
          <button onClick={createAnother} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            Create Another
          </button>
          <button
            onClick={() => doPreview(createdTicket.ticketId)}
            disabled={previewing}
            className="flex items-center justify-center gap-2 px-4 py-2.5 border border-indigo-300 text-indigo-700 rounded-lg font-medium hover:bg-indigo-50 disabled:opacity-60 transition-colors"
          >
            <Eye className="w-4 h-4" /> Preview
          </button>
          <button
            onClick={() => doDownload(createdTicket.ticketId)}
            disabled={downloading}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {downloading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <><Download className="w-4 h-4" /> Download</>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── Form ──
  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/tickets')} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Registration</h1>
          <p className="text-gray-500 text-sm">7 NOTES – Live Jamming Session</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name <span className="text-red-500">*</span></label>
              <input type="text" {...register('name', { required: 'Name is required' })} className={inputClass(errors.name)} placeholder="John Doe" />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Gender <span className="text-red-500">*</span></label>
              <select {...register('gender', { required: 'Gender is required' })} className={inputClass(errors.gender)}>
                <option value="">Select gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
              {errors.gender && <p className="text-red-500 text-xs mt-1">{errors.gender.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Mobile <span className="text-red-500">*</span></label>
              <input type="tel" {...register('mobile', { required: 'Mobile is required', pattern: { value: /^\+?[\d\s\-()]{7,20}$/, message: 'Invalid number' } })} className={inputClass(errors.mobile)} placeholder="+91 98765 43210" />
              {errors.mobile && <p className="text-red-500 text-xs mt-1">{errors.mobile.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email <span className="text-red-500">*</span></label>
              <input type="email" {...register('email', { required: 'Email is required', pattern: { value: /^\S+@\S+$/i, message: 'Invalid email' } })} className={inputClass(errors.email)} placeholder="john@example.com" />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {submitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating Registration & PDF...
              </>
            ) : (
              <><TicketPlus className="w-4 h-4" /> Create Registration</>
            )}
          </button>
        </form>
      </div>

      <p className="text-xs text-gray-400 text-center mt-4">
        PDF will download automatically after generation
      </p>
    </div>
  );
}
