import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { TicketPlus, Eye, ArrowLeft, AlertTriangle, Download } from 'lucide-react';
import { ticketService } from '../services/ticketService';
import { settingsService } from '../services/settingsService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function CreateTicket() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [settings, setSettings] = useState(null);
  const [preview, setPreview] = useState(null); // Ticket preview data
  const [showPreview, setShowPreview] = useState(false);
  const [duplicate, setDuplicate] = useState(null); // Existing duplicate ticket
  const [downloading, setDownloading] = useState(false);

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm();
  const watchedValues = watch();

  useEffect(() => {
    settingsService.get().then((res) => {
      if (res.data && res.data.id) setSettings(res.data);
    }).catch(() => {});
  }, []);

  const onSubmit = async (data) => {
    // Check duplicate first
    setSubmitting(true);
    try {
      const res = await ticketService.create(data);
      setPreview(res.data.ticket);
      setShowPreview(true);
      setDuplicate(null);
      toast.success(`Ticket ${res.data.ticket.ticket_id} created!`);
    } catch (err) {
      const errorData = err.response?.data;
      if (err.response?.status === 409 && errorData?.duplicate) {
        // Duplicate found — show warning
        setDuplicate(errorData.duplicate);
        return;
      }
      toast.error(errorData?.error || 'Failed to create ticket');
    } finally {
      setSubmitting(false);
    }
  };

  const forceCreate = async () => {
    setDuplicate(null);
    setSubmitting(true);
    try {
      const data = { ...watch(), force: true };
      const res = await ticketService.create(data);
      setPreview(res.data.ticket);
      setShowPreview(true);
      toast.success(`Ticket ${res.data.ticket.ticket_id} created!`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create ticket');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async () => {
    if (!preview?.ticket_id) return;
    setDownloading(true);
    try {
      const res = await ticketService.download(preview.ticket_id);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${preview.ticket_id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch (err) {
      toast.error('Failed to download PDF');
    } finally {
      setDownloading(false);
    }
  };

  const createAnother = () => {
    setShowPreview(false);
    setPreview(null);
    setDuplicate(null);
    reset();
  };

  const inputClass = (fieldError) =>
    `w-full px-4 py-2.5 rounded-lg border text-sm outline-none transition-all ${
      fieldError ? 'border-red-400 ring-2 ring-red-100' : 'border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
    }`;

  // ── Preview Mode ──
  if (showPreview && preview) {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={createAnother} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Ticket Created</h1>
            <p className="text-gray-500 text-sm">Review and download</p>
          </div>
        </div>

        {/* Ticket Card Preview */}
        <div className="bg-white rounded-xl border-2 border-indigo-100 overflow-hidden">
          {/* Decorative top bar */}
          <div className="h-2 bg-gradient-to-r from-indigo-600 to-purple-600" />

          <div className="p-6 space-y-4">
            <div className="text-center">
              <p className="text-xs text-gray-400 uppercase tracking-wider">Ticket ID</p>
              <p className="text-xl font-bold text-indigo-600 font-mono">{preview.ticket_id}</p>
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Name</span>
                <span className="font-medium text-gray-900">{preview.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Gender</span>
                <span className="font-medium text-gray-900">{preview.gender}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Email</span>
                <span className="font-medium text-gray-900">{preview.email}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Mobile</span>
                <span className="font-medium text-gray-900">{preview.mobile}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Event Date</span>
                <span className="font-medium text-gray-900">
                  {new Date(preview.event_date).toLocaleDateString('en-US', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                  })}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Venue</span>
                <span className="font-medium text-gray-900 text-right max-w-[200px]">{preview.event_address}</span>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4 flex justify-center">
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                {preview.status}
              </span>
            </div>

            {/* QR Code Preview */}
            {preview.qr_token && (
              <div className="flex justify-center pt-2">
                <img
                  src={`${API_URL}/qrcodes/${preview.qr_token}.png`}
                  alt="QR Code"
                  className="w-24 h-24"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={createAnother} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            Create Another
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {downloading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <><Download className="w-4 h-4" /> Download PDF</>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── Creation Form ──
  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/tickets')} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Ticket</h1>
          <p className="text-gray-500 text-sm">
            {settings ? `For: ${settings.event_name || 'Music Event'}` : 'Generate a new event ticket'}
          </p>
        </div>
      </div>

      {/* Duplicate Warning */}
      {duplicate && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-amber-800">Ticket already exists</p>
              <p className="text-sm text-amber-700 mt-1">
                A ticket with this email or mobile was found: <strong>{duplicate.ticket_id}</strong> ({duplicate.name})
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setDuplicate(null)}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={forceCreate}
                  className="px-3 py-1.5 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
                >
                  Generate Anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name <span className="text-red-500">*</span></label>
              <input type="text" {...register('name', { required: 'Name is required' })} className={inputClass(errors.name)} placeholder="John Doe" />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
            </div>

            {/* Gender */}
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

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email <span className="text-red-500">*</span></label>
              <input type="email" {...register('email', { required: 'Email is required', pattern: { value: /^\S+@\S+$/i, message: 'Invalid email' } })} className={inputClass(errors.email)} placeholder="john@example.com" />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>

            {/* Mobile */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Mobile Number <span className="text-red-500">*</span></label>
              <input type="tel" {...register('mobile', { required: 'Mobile is required', pattern: { value: /^\+?[\d\s\-()]{7,20}$/, message: 'Invalid number' } })} className={inputClass(errors.mobile)} placeholder="+91 98765 43210" />
              {errors.mobile && <p className="text-red-500 text-xs mt-1">{errors.mobile.message}</p>}
            </div>
          </div>

          {/* Current event summary */}
          {settings && (
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
              {settings.event_name && <p><span className="font-medium">Event:</span> {settings.event_name}</p>}
              {settings.event_date && <p><span className="font-medium">Date:</span> {new Date(settings.event_date).toLocaleDateString()}</p>}
              {settings.venue_name && <p><span className="font-medium">Venue:</span> {settings.venue_name}</p>}
            </div>
          )}

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => navigate('/tickets')} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {submitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <><Eye className="w-4 h-4" /> Preview & Generate</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
