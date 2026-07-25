import api from './api';

export const settingsService = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),

  uploadLogo: (file) => {
    const formData = new FormData();
    formData.append('logo', file);
    return api.post('/settings/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  uploadAdditionalLogo: (file, logoKey) => {
    const formData = new FormData();
    formData.append('logo', file);
    formData.append('logoKey', logoKey);
    return api.post('/settings/logo/additional', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};
