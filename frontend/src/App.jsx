import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { Layout, message } from 'antd'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Templates from './pages/Templates'
import Lists from './pages/Lists'
import Contacts from './pages/Contacts'
import Campaigns from './pages/Campaigns'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import Unsubscribe from './pages/Unsubscribe'
import AppLayout from './components/Layout/AppLayout'
import { getToken } from './utils/auth'

message.config({
  top: 24,
  duration: 3,
  maxCount: 3,
})

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!getToken())
  const navigate = useNavigate()

  useEffect(() => {
    setIsAuthenticated(!!getToken())
  }, [])

  const handleLogin = () => {
    setIsAuthenticated(true)
    navigate('/dashboard')
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    setIsAuthenticated(false)
    navigate('/login')
    message.success('Logged out successfully')
  }

  // Public routes (accessible without authentication)
  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<Login onLogin={handleLogin} />} />
        <Route path="/unsubscribe" element={<Unsubscribe />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  // Protected routes (require authentication)
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/unsubscribe" element={<Unsubscribe />} />

      {/* Protected routes */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={
        <AppLayout onLogout={handleLogout}>
          <Dashboard />
        </AppLayout>
      } />
      <Route path="/templates" element={
        <AppLayout onLogout={handleLogout}>
          <Templates />
        </AppLayout>
      } />
      <Route path="/lists" element={
        <AppLayout onLogout={handleLogout}>
          <Lists />
        </AppLayout>
      } />
      <Route path="/contacts" element={
        <AppLayout onLogout={handleLogout}>
          <Contacts />
        </AppLayout>
      } />
      <Route path="/campaigns" element={
        <AppLayout onLogout={handleLogout}>
          <Campaigns />
        </AppLayout>
      } />
      <Route path="/analytics" element={
        <AppLayout onLogout={handleLogout}>
          <Analytics />
        </AppLayout>
      } />
      <Route path="/settings" element={
        <AppLayout onLogout={handleLogout}>
          <Settings />
        </AppLayout>
      } />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
