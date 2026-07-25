import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Music, Eye, EyeOff, LogIn } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  // If already logged in, redirect
  if (isAuthenticated) {
    navigate('/dashboard', { replace: true });
    return null;
  }

  const onSubmit = async (data) => {
    setSubmitting(true);
    try {
      await login(data.username, data.password);
      toast.success('Welcome back!');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const message = err.response?.data?.error || 'Login failed. Check your credentials.';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 backdrop-blur rounded-2xl mb-4">
            <Music className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Music Event</h1>
          <p className="text-indigo-200 mt-1">Admin Portal</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            Sign in to your account
          </h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Username
              </label>
              <input
                type="text"
                {...register('username', { required: 'Username is required' })}
                className={`w-full px-4 py-2.5 rounded-lg border ${
                  errors.username ? 'border-red-400 ring-2 ring-red-100' : 'border-gray-300'
                } focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all`}
                placeholder="Enter username"
              />
              {errors.username && (
                <p className="text-red-500 text-xs mt-1">{errors.username.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  {...register('password', { required: 'Password is required' })}
                  className={`w-full px-4 py-2.5 pr-11 rounded-lg border ${
                    errors.password ? 'border-red-400 ring-2 ring-red-100' : 'border-gray-300'
                  } focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all`}
                  placeholder="Enter password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-100 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Sign In
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-indigo-200 text-sm mt-6">
          Music Event Ticket Management System
        </p>
      </div>
    </div>
  );
}
