import api from './api';

export const settingsService = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
};
