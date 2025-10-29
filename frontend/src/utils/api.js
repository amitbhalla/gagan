import axios from 'axios'
import { getToken, removeToken } from './auth'
import { message } from 'antd'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = getToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    if (error.response) {
      const { status, data } = error.response
      const method = error.config?.method?.toUpperCase()

      switch (status) {
        case 401:
          removeToken()
          window.location.href = '/login'
          message.error('Session expired. Please login again.')
          break
        case 403:
          message.error('You do not have permission to perform this action')
          break
        case 404:
          // Only show 404 errors for non-GET requests or if explicitly requested
          // GET requests returning 404 are often just empty states
          if (method !== 'GET') {
            message.error(data.error || 'Resource not found')
          }
          break
        case 500:
          message.error('Server error. Please try again later.')
          break
        default:
          // Only show errors for status codes >= 400 and not 404
          if (status >= 400 && status !== 404) {
            message.error(data.error || 'An error occurred')
          }
      }
    } else if (error.request) {
      message.error('Network error. Please check your connection.')
    } else {
      message.error('An error occurred. Please try again.')
    }

    return Promise.reject(error)
  }
)

export default api
