import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Save, Settings as SettingsIcon } from 'lucide-react';
import { settingsService } from '../services/settingsService';
import LoadingSpinner from '../components/LoadingSpinner';

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await settingsService.get();
        if (res.data && res.data.id) {
          reset(res.data);
        }
      } catch (err) {
        toast.error('Failed to load settings');
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [reset]);

  const onSubmit = async (data) => {
    setSaving(true);
    try {
      // Clean empty strings to null for optional fields
      const cleaned = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, v === '' ? null : v])
      );
      await settingsService.update(cleaned);
      toast.success('Settings saved');
    } catch (err) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = (fieldError) =>
    `w-full px-4 py-2.5 rounded-lg border text-sm outline-none transition-all ${
      fieldError ? 'border-red-400 ring-2 ring-red-100' : 'border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
    }`;

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-indigo-50 rounded-lg">
          <SettingsIcon className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Event Settings</h1>
          <p className="text-gray-500 text-sm">Configure your event details</p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Event Info */}
          <div>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Event Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Event Name</label>
                <input type="text" {...register('event_name')} className={inputClass(errors.event_name)} placeholder="Music Event 2026" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Event Date</label>
                <input type="date" {...register('event_date')} className={inputClass(errors.event_date)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Event Time</label>
                <input type="time" {...register('event_time')} className={inputClass(errors.event_time)} />
              </div>
            </div>
          </div>

          {/* Venue */}
          <div>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Venue</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Venue Name</label>
                <input type="text" {...register('venue_name')} className={inputClass(errors.venue_name)} placeholder="Grand Arena" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Venue Address</label>
                <textarea rows={2} {...register('venue_address')} className={inputClass(errors.venue_address)} placeholder="123 Music Avenue, City" />
              </div>
            </div>
          </div>

          {/* Organizer */}
          <div>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Organizer</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Organizer Name</label>
                <input type="text" {...register('organizer_name')} className={inputClass(errors.organizer_name)} placeholder="Event Team" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Contact Number</label>
                <input type="text" {...register('contact_number')} className={inputClass(errors.contact_number)} placeholder="+91 98765 43210" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Support Email</label>
                <input type="email" {...register('support_email')} className={inputClass(errors.support_email)} placeholder="support@event.com" />
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end pt-2 border-t border-gray-100">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {saving ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <><Save className="w-4 h-4" /> Save Settings</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
