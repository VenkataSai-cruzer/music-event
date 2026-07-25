import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

export function useAuth() {
  const [admin, setAdmin] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedAdmin = localStorage.getItem('admin');
    if (savedToken && savedAdmin) {
      setToken(savedToken);
      setAdmin(JSON.parse(savedAdmin));
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    const { token: newToken, admin: adminData } = res.data;
    localStorage.setItem('token', newToken);
    localStorage.setItem('admin', JSON.stringify(adminData));
    setToken(newToken);
    setAdmin(adminData);
    return res.data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('admin');
    setToken(null);
    setAdmin(null);
  }, []);

  return { admin, token, loading, isAuthenticated: !!token, login, logout };
}
