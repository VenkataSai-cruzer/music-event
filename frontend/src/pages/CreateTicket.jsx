import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { TicketPlus, ArrowLeft } from 'lucide-react';
import { ticketService } from '../services/ticketService';

export default function CreateTicket() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm();

  const onSubmit = async (data) => {
    setSubmitting(true);
    try {
      const res = await ticketService.create(data);
      toast.success(`Ticket ${res.data.ticket.ticket_id} created!`);
      reset();
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to create ticket';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = (fieldError) =>
    `w-full px-4 py-2.5 rounded-lg border text-sm outline-none transition-all ${
      fieldError
        ? 'border-red-400 ring-2 ring-red-100'
        : 'border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
    }`;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/tickets')}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Ticket</h1>
          <p className="text-gray-500 text-sm">Generate a new event ticket</p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                {...register('name', { required: 'Name is required' })}
                className={inputClass(errors.name)}
                placeholder="John Doe"
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
            </div>

            {/* Gender */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Gender <span className="text-red-500">*</span>
              </label>
              <select
                {...register('gender', { required: 'Gender is required' })}
                className={inputClass(errors.gender)}
              >
                <option value="">Select gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
              {errors.gender && <p className="text-red-500 text-xs mt-1">{errors.gender.message}</p>}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                {...register('email', {
                  required: 'Email is required',
                  pattern: { value: /^\S+@\S+$/i, message: 'Invalid email' },
                })}
                className={inputClass(errors.email)}
                placeholder="john@example.com"
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>

            {/* Mobile */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Mobile Number <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                {...register('mobile', {
                  required: 'Mobile number is required',
                  pattern: { value: /^\+?[\d\s\-()]{7,20}$/, message: 'Invalid mobile number' },
                })}
                className={inputClass(errors.mobile)}
                placeholder="+91 98765 43210"
              />
              {errors.mobile && <p className="text-red-500 text-xs mt-1">{errors.mobile.message}</p>}
            </div>

            {/* Event Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Event Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                {...register('event_date', { required: 'Event date is required' })}
                className={inputClass(errors.event_date)}
              />
              {errors.event_date && <p className="text-red-500 text-xs mt-1">{errors.event_date.message}</p>}
            </div>

            {/* Event Address */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Event Address / Venue <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={2}
                {...register('event_address', { required: 'Event address is required' })}
                className={inputClass(errors.event_address)}
                placeholder="123 Music Avenue, City, State"
              />
              {errors.event_address && <p className="text-red-500 text-xs mt-1">{errors.event_address.message}</p>}
            </div>
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate('/tickets')}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {submitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <TicketPlus className="w-4 h-4" />
                  Generate Ticket
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
