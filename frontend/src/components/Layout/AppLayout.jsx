import { useState } from 'react'
import { Layout, Menu, Button, Dropdown, Avatar } from 'antd'
import { Link, useLocation } from 'react-router-dom'
import {
  DashboardOutlined,
  FileTextOutlined,
  TeamOutlined,
  MailOutlined,
  SendOutlined,
  BarChartOutlined,
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons'

const { Header, Sider, Content } = Layout

const AppLayout = ({ children, onLogout }) => {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: <Link to="/dashboard">Dashboard</Link>,
    },
    {
      key: '/templates',
      icon: <FileTextOutlined />,
      label: <Link to="/templates">Templates</Link>,
    },
    {
      key: '/lists',
      icon: <TeamOutlined />,
      label: <Link to="/lists">Lists</Link>,
    },
    {
      key: '/contacts',
      icon: <MailOutlined />,
      label: <Link to="/contacts">Contacts</Link>,
    },
    {
      key: '/campaigns',
      icon: <SendOutlined />,
      label: <Link to="/campaigns">Campaigns</Link>,
    },
    {
      key: '/analytics',
      icon: <BarChartOutlined />,
      label: <Link to="/analytics">Analytics</Link>,
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: <Link to="/settings">Settings</Link>,
    },
  ]

  const userMenuItems = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      onClick: onLogout,
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
        }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: collapsed ? 18 : 20,
            fontWeight: 'bold',
            transition: 'all 0.2s',
          }}
        >
          {collapsed ? 'EM' : 'Email Marketing'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
        />
      </Sider>

      <Layout style={{ marginLeft: collapsed ? 80 : 200, transition: 'all 0.2s' }}>
        <Header
          style={{
            padding: '0 24px',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 1,
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: 16 }}
          />

          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar icon={<UserOutlined />} />
              <span>Admin</span>
            </div>
          </Dropdown>
        </Header>

        <Content style={{ margin: '24px', padding: 24, background: '#fff', minHeight: 280 }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}

export default AppLayout
