import api from './api';

export const ticketService = {
  getDashboard: () => api.get('/tickets/dashboard'),

  getAll: (params = {}) => api.get('/tickets', { params }),

  getById: (id) => api.get(`/tickets/${id}`),

  create: (data) => api.post('/tickets', data),

  download: (ticketId) =>
    api.get(`/tickets/download/${ticketId}`, { responseType: 'blob' }),

  verify: (qrToken) => api.post('/tickets/verify', { qr_token: qrToken }),

  useTicket: (ticketId) => api.put(`/tickets/use/${ticketId}`),

  delete: (ticketId) => api.delete(`/tickets/${ticketId}`),

  getScanHistory: (page = 1) => api.get(`/tickets/scan-history?page=${page}`),

  getTicketTimeline: (ticketId) => api.get(`/tickets/${ticketId}/timeline`),

  exportCsv: () => api.get('/tickets/export/csv', { responseType: 'blob' }),

  regeneratePDF: (ticketId) => api.post(`/tickets/regenerate/${ticketId}`),
};
