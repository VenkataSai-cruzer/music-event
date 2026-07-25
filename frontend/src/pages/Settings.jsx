import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Save, Settings as SettingsIcon, Upload, X, Image as ImageIcon, Link as LinkIcon, Globe, Hash, Phone, Tag, AlertTriangle, MapPin } from 'lucide-react';
import { settingsService } from '../services/settingsService';
import LoadingSpinner from '../components/LoadingSpinner';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const LOGO_TYPES = [
  { key: 'organizer', label: 'Organizer Logo' },
  { key: 'partner1', label: 'Partner 1 Logo' },
  { key: 'partner2', label: 'Partner 2 Logo' },
  { key: 'sponsor1', label: 'Sponsor 1 Logo' },
  { key: 'sponsor2', label: 'Sponsor 2 Logo' },
  { key: 'community1', label: 'Community Partner Logo' },
  { key: 'media1', label: 'Media Partner Logo' },
];

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [additionalLogos, setAdditionalLogos] = useState({});
  const fileInputRef = useRef(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await settingsService.get();
        if (res.data && res.data.id) {
          reset(res.data);
          if (res.data.event_logo) {
            setLogoPreview(`${API_URL}${res.data.event_logo}`);
          }
          if (res.data.additional_logos) {
            const logos = {};
            for (const [key, path] of Object.entries(res.data.additional_logos)) {
              logos[key] = `${API_URL}${path}`;
            }
            setAdditionalLogos(logos);
          }
        }
      } catch (err) {
        toast.error('Failed to load settings');
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [reset]);

  const handleLogoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!allowed.includes(file.type)) {
      toast.error('Only PNG, JPEG, WebP, and SVG images are allowed');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Logo must be less than 5MB');
      return;
    }

    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleUploadLogo = async () => {
    if (!logoFile) return;
    setUploading('main');
    try {
      const res = await settingsService.uploadLogo(logoFile);
      setLogoPreview(`${API_URL}${res.data.logo_url}`);
      setLogoFile(null);
      toast.success('Logo uploaded');
    } catch (err) {
      toast.error('Failed to upload logo');
    } finally {
      setUploading(null);
    }
  };

  const clearLogo = () => {
    setLogoPreview(null);
    setLogoFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAdditionalLogoUpload = async (logoKey, file) => {
    setUploading(logoKey);
    try {
      const res = await settingsService.uploadAdditionalLogo(file, logoKey);
      setAdditionalLogos((prev) => ({
        ...prev,
        [logoKey]: `${API_URL}${res.data.logo_url}`,
      }));
      toast.success(`${LOGO_TYPES.find((l) => l.key === logoKey)?.label || logoKey} uploaded`);
    } catch (err) {
      toast.error('Failed to upload logo');
    } finally {
      setUploading(null);
    }
  };

  const clearAdditionalLogo = (logoKey) => {
    setAdditionalLogos((prev) => {
      const next = { ...prev };
      delete next[logoKey];
      return next;
    });
  };

  const onSubmit = async (data) => {
    setSaving(true);
    try {
      const cleaned = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, v === '' ? null : v])
      );
      // Also persist additional_logos paths back
      const paths = {};
      for (const [key, url] of Object.entries(additionalLogos)) {
        paths[key] = url.replace(API_URL, '');
      }
      cleaned.additional_logos = paths;
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
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-indigo-50 rounded-lg">
          <SettingsIcon className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Event Settings</h1>
          <p className="text-gray-500 text-sm">Configure your event details, branding, and contact info</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {/* ── EVENT LOGO ── */}
          <section>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-indigo-500" /> Event Logo
            </h2>
            <div className="flex items-start gap-5">
              <div className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden shrink-0 bg-gray-50">
                {logoPreview ? (
                  <img src={logoPreview} alt="Event Logo" className="w-full h-full object-contain p-1" />
                ) : (
                  <ImageIcon className="w-8 h-8 text-gray-300" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleLogoSelect} className="hidden" id="logo-upload" />
                <label htmlFor="logo-upload" className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 cursor-pointer transition-colors">
                  <Upload className="w-4 h-4" /> Choose Image
                </label>
                <p className="text-xs text-gray-400">PNG, JPEG, WebP or SVG. Max 5MB.</p>
                {logoFile && (
                  <div className="flex gap-2">
                    <button type="button" onClick={handleUploadLogo} disabled={uploading === 'main'}
                      className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors">
                      {uploading === 'main' ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Upload className="w-3 h-3" /> Upload</>}
                    </button>
                    <button type="button" onClick={clearLogo} className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors">
                      <X className="w-3 h-3" /> Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ── EVENT INFORMATION ── */}
          <section>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Tag className="w-4 h-4 text-indigo-500" /> Event Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Event Name</label>
                <input type="text" {...register('event_name')} className={inputClass(errors.event_name)} placeholder="Music Event 2026" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Event Tagline</label>
                <input type="text" {...register('event_tagline')} className={inputClass(errors.event_tagline)} placeholder="e.g. The Ultimate Music Experience" />
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
          </section>

          {/* ── VENUE ── */}
          <section>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-indigo-500" /> Venue
            </h2>
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
          </section>

          {/* ── ORGANIZER & CONTACT ── */}
          <section>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Phone className="w-4 h-4 text-indigo-500" /> Organizer & Contact
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Organizer Name</label>
                <input type="text" {...register('organizer_name')} className={inputClass(errors.organizer_name)} placeholder="Event Team" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Contact Number</label>
                <input type="text" {...register('contact_number')} className={inputClass(errors.contact_number)} placeholder="+91 98765 43210" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Emergency Contact</label>
                <input type="text" {...register('emergency_contact')} className={inputClass(errors.emergency_contact)} placeholder="+91 98765 43211" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Support Email</label>
                <input type="email" {...register('support_email')} className={inputClass(errors.support_email)} placeholder="support@event.com" />
              </div>
            </div>
          </section>

          {/* ── ONLINE PRESENCE ── */}
          <section>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Globe className="w-4 h-4 text-indigo-500" /> Online Presence
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Website URL</label>
                <input type="url" {...register('website')} className={inputClass(errors.website)} placeholder="https://musicevent.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Instagram Handle</label>
                <input type="text" {...register('instagram')} className={inputClass(errors.instagram)} placeholder="@musicevent" />
              </div>
            </div>
          </section>

          {/* ── ADDITIONAL LOGOS ── */}
          <section>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-indigo-500" /> Partner & Sponsor Logos
            </h2>
            <p className="text-xs text-gray-500 mb-4">These logos will appear in the footer of every ticket PDF.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {LOGO_TYPES.map(({ key, label }) => (
                <div key={key} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-lg border border-dashed border-gray-300 flex items-center justify-center overflow-hidden shrink-0 bg-gray-50">
                      {additionalLogos[key] ? (
                        <img src={additionalLogos[key]} alt={label} className="w-full h-full object-contain p-0.5" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-gray-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{label}</p>
                      <p className="text-xs text-gray-400">{additionalLogos[key] ? 'Uploaded' : 'Not uploaded'}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <label className={`flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 hover:bg-gray-50 cursor-pointer transition-colors ${uploading === key ? 'opacity-60' : ''}`}>
                      {uploading === key ? (
                        <div className="w-3 h-3 border-2 border-gray-400 border-t-gray-600 rounded-full animate-spin" />
                      ) : (
                        <><Upload className="w-3 h-3" /> Upload</>
                      )}
                      <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleAdditionalLogoUpload(key, file);
                        }} />
                    </label>
                    {additionalLogos[key] && (
                      <button type="button" onClick={() => clearAdditionalLogo(key)}
                        className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── SUBMIT ── */}
          <div className="flex justify-end pt-4 border-t border-gray-100">
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors shadow-sm">
              {saving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save className="w-4 h-4" /> Save Settings</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
