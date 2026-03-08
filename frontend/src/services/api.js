import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Request Interceptor: Add JWT ──────────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Response Interceptor: Token Refresh ──────────────────────────────────────
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (error.response.data?.code === 'TOKEN_EXPIRED') {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          }).then(token => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          }).catch(err => Promise.reject(err));
        }

        originalRequest._retry = true;
        isRefreshing = true;

        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
          localStorage.clear();
          window.location.href = '/login';
          return Promise.reject(error);
        }

        try {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
          const { accessToken, refreshToken: newRefreshToken } = response.data;

          localStorage.setItem('accessToken', accessToken);
          localStorage.setItem('refreshToken', newRefreshToken);

          api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
          processQueue(null, accessToken);
          isRefreshing = false;

          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError, null);
          isRefreshing = false;
          localStorage.clear();
          window.location.href = '/login';
          return Promise.reject(refreshError);
        }
      }
    }

    return Promise.reject(error);
  }
);

// ─── Auth API ─────────────────────────────────────────────────────────────────
export const authAPI = {
  signup: (data) => api.post('/auth/signup', data),
  login: (data) => api.post('/auth/login', data),
  logout: (refreshToken) => api.post('/auth/logout', { refreshToken }),
  me: () => api.get('/auth/me'),
};

// ─── Users API ────────────────────────────────────────────────────────────────
export const usersAPI = {
  search: (q) => api.get('/users/search', { params: { q } }),
  getContacts: () => api.get('/users/contacts'),
  addContact: (contactId) => api.post('/users/contacts', { contactId }),
  removeContact: (contactId) => api.delete(`/users/contacts/${contactId}`),
  getProfile: (userId) => api.get(`/users/${userId}/profile`),
};

// ─── Calls API ────────────────────────────────────────────────────────────────
export const callsAPI = {
  getHistory: (params) => api.get('/calls/history', { params }),
  recordCall: (data) => api.post('/calls/record', data),
  getMissedCalls: () => api.get('/calls/missed'),
};

export default api;
