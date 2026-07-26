import { Menu, User } from 'lucide-react';

export default function Navbar({ onToggleSidebar, admin }) {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 lg:px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSidebar}
            className="p-2 rounded-lg hover:bg-gray-100 lg:hidden transition-colors"
          >
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
          <div className="hidden lg:block">
            <h2 className="text-lg font-semibold text-gray-900">
              7 NOTES
            </h2>
            <p className="text-sm text-gray-500">
              Live Jamming Session &middot; 08 Aug 2026
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-indigo-600" />
            </div>
            <span className="text-sm font-medium text-gray-700 hidden sm:block">
              {admin?.username || 'Admin'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
