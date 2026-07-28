import api from './api';

export const ticketService = {
  getDashboard: () => api.get('/tickets/dashboard'),

  getAll: (params = {}) => api.get('/tickets', { params }),

  getById: (id) => api.get(`/tickets/${id}`),

  create: (data) => api.post('/tickets', data),

  download: (ticketId) =>
    api.get(`/tickets/download/${ticketId}`, { responseType: 'blob' }),

  preview: (ticketId) =>
    api.get(`/tickets/preview/${ticketId}`, { responseType: 'blob' }),

  regeneratePDF: (ticketId) =>
    api.post(`/tickets/${ticketId}/regenerate-pdf`),

  cancel: (ticketId) =>
    api.patch(`/tickets/${ticketId}/cancel`),

  exportCSV: () =>
    api.get('/tickets/export/csv', { responseType: 'blob' }),

  verify: (qrToken, scannedBy) =>
    api.post('/tickets/verify', { qr_token: qrToken, scanned_by: scannedBy }),

  useTicket: (ticketId) => api.put(`/tickets/use/${ticketId}`),

  delete: (ticketId) => api.delete(`/tickets/${ticketId}`),

  getScanLogs: (params = {}) => api.get('/tickets/scan-logs', { params }),

  getEventSettings: () => api.get('/tickets/event-settings'),

  updateEventSettings: (data) => api.put('/tickets/event-settings', data),
};
