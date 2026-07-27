import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { TicketPlus, ArrowLeft, Download, CheckCircle } from 'lucide-react';
import { ticketService } from '../services/ticketService';

export default function CreateTicket() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [createdTicket, setCreatedTicket] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadStarted, setDownloadStarted] = useState(false);

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
        throw new Error(errData.error || 'PDF generation failed');
      }
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${ticketId}.pdf`);
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

  const onSubmit = async (data) => {
    setSubmitting(true);
    try {
      const res = await ticketService.create(data);
      const ticket = res.data.ticket;
      setCreatedTicket(ticket);
      toast.success(`Ticket ${ticket.ticket_id} created!`);

      // Auto-download PDF only if generation succeeded (pdf_path exists)
      if (ticket.pdf_path) {
        await doDownload(ticket.ticket_id);
      } else {
        // PDF is still generating or failed — show success with download button
        setDownloadStarted(true);
        toast('PDF is being generated — click Download to retrieve it', { icon: '⏳' });
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create ticket');
    } finally {
      setSubmitting(false);
    }
  };

  const createAnother = () => {
    setCreatedTicket(null);
    setDownloadStarted(false);
    reset();
  };

  const handleDownloadAgain = () => {
    if (createdTicket?.ticket_id) doDownload(createdTicket.ticket_id);
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
          <h1 className="text-2xl font-bold text-gray-900">Ticket Generated</h1>
          <p className="text-gray-500 text-sm mt-1">{createdTicket.ticket_id}</p>
          <p className="text-gray-500 text-xs mt-1">PDF downloaded automatically</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-left space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Name</span><span className="font-medium">{createdTicket.name}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Mobile</span><span className="font-medium">{createdTicket.mobile}</span></div>
        </div>
        <div className="flex gap-3">
          <button onClick={createAnother} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            Create Another
          </button>
          <button
            onClick={handleDownloadAgain}
            disabled={downloading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {downloading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <><Download className="w-4 h-4" /> Download Again</>
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
          <h1 className="text-2xl font-bold text-gray-900">Create Ticket</h1>
          <p className="text-gray-500 text-sm">7 NOTES Live Jamming Session</p>
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
                Generating Ticket & PDF...
              </>
            ) : (
              <><TicketPlus className="w-4 h-4" /> Generate Ticket</>
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
