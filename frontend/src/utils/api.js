import axios from 'axios'
import { getToken, removeToken } from './auth'
import { message } from 'antd'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// CSRF token management
let csrfToken = null

export const fetchCsrfToken = async () => {
  try {
    const response = await axios.get('/api/csrf-token', {
      headers: {
        Authorization: `Bearer ${getToken()}`
      }
    })
    csrfToken = response.data.csrfToken
    return csrfToken
  } catch (error) {
    console.error('Failed to fetch CSRF token:', error)
    return null
  }
}

export const getCsrfToken = () => csrfToken

// Request interceptor
api.interceptors.request.use(
  async (config) => {
    const token = getToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    // Add CSRF token for non-GET requests
    if (config.method && config.method.toLowerCase() !== 'get') {
      if (!csrfToken) {
        await fetchCsrfToken()
      }
      if (csrfToken) {
        config.headers['X-CSRF-Token'] = csrfToken
      }
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
  async (error) => {
    if (error.response) {
      const { status, data } = error.response
      const method = error.config?.method?.toUpperCase()

      switch (status) {
        case 401:
          removeToken()
          csrfToken = null
          window.location.href = '/login'
          message.error('Session expired. Please login again.')
          break
        case 403:
          // Check if it's a CSRF token error
          if (data.error === 'CSRF token missing' || data.error === 'Invalid CSRF token') {
            // Refetch CSRF token and retry the request once
            csrfToken = null
            await fetchCsrfToken()
            if (csrfToken && error.config && !error.config._retry) {
              error.config._retry = true
              error.config.headers['X-CSRF-Token'] = csrfToken
              return api.request(error.config)
            }
          }
          message.error(data.message || 'You do not have permission to perform this action')
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
