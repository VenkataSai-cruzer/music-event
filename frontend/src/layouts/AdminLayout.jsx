import { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import { useAuth } from '../hooks/useAuth';
import LoadingSpinner from '../components/LoadingSpinner';

export default function AdminLayout() {
  const { admin, loading, isAuthenticated, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  // If not an admin, check if the user is a scanner (has scanner session)
  if (!isAuthenticated) {
    const scannerToken = sessionStorage.getItem('scannerToken');
    if (scannerToken) {
      // Scanner user tried to access admin route — send to standalone scanner page
      return <Navigate to="/scanner" replace />;
    }
    // No auth at all — send to admin login
    return <Navigate to="/login" replace />;
  }

  // Scanner users should use the standalone /scanner page — no sidebar
  if (admin?.role === 'scanner') {
    return <Navigate to="/scanner" replace />;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        onLogout={logout}
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar
          onToggleSidebar={() => setSidebarOpen(true)}
          admin={admin}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
