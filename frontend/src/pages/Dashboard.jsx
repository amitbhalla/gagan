import { useState, useEffect } from 'react'
import { Row, Col, Card, Statistic, Spin, Typography, Table, Tag, Progress } from 'antd'
import {
  MailOutlined,
  TeamOutlined,
  SendOutlined,
  FileTextOutlined,
  EyeOutlined,
  LinkOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

const { Title } = Typography

const Dashboard = () => {
  const navigate = useNavigate()
  const [stats, setStats] = useState({
    templates: 0,
    lists: 0,
    contacts: 0,
    campaigns: 0,
  })
  const [analytics, setAnalytics] = useState(null)
  const [recentCampaigns, setRecentCampaigns] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
    loadAnalytics()
  }, [])

  const loadStats = async () => {
    setLoading(true)
    try {
      const [templatesRes, listsRes, contactsRes, campaignsRes] = await Promise.all([
        api.get('/templates'),
        api.get('/lists'),
        api.get('/contacts/stats'),
        api.get('/campaigns'),
      ])

      setStats({
        templates: templatesRes.data.total || 0,
        lists: listsRes.data.total || 0,
        contacts: contactsRes.data.total || 0,
        campaigns: campaignsRes.data.total || 0,
      })
    } catch (error) {
      console.error('Failed to load stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadAnalytics = async () => {
    try {
      const response = await api.get('/analytics/overview')
      setAnalytics(response.data.summary)
      setRecentCampaigns(response.data.recentCampaigns || [])
    } catch (error) {
      console.error('Failed to load analytics:', error)
    }
  }

  const statCards = [
    {
      title: 'Templates',
      value: stats.templates,
      icon: <FileTextOutlined style={{ fontSize: 32, color: '#1890ff' }} />,
      color: '#e6f7ff',
    },
    {
      title: 'Lists',
      value: stats.lists,
      icon: <TeamOutlined style={{ fontSize: 32, color: '#52c41a' }} />,
      color: '#f6ffed',
    },
    {
      title: 'Contacts',
      value: stats.contacts,
      icon: <MailOutlined style={{ fontSize: 32, color: '#faad14' }} />,
      color: '#fffbe6',
    },
    {
      title: 'Campaigns',
      value: stats.campaigns,
      icon: <SendOutlined style={{ fontSize: 32, color: '#722ed1' }} />,
      color: '#f9f0ff',
    },
  ]

  const engagementCards = analytics ? [
    {
      title: 'Total Sent',
      value: analytics.totalSent || 0,
      icon: <SendOutlined style={{ fontSize: 24, color: '#1890ff' }} />,
    },
    {
      title: 'Total Delivered',
      value: analytics.totalDelivered || 0,
      suffix: `${analytics.totalSent > 0 ? ((analytics.totalDelivered / analytics.totalSent) * 100).toFixed(1) : 0}%`,
      icon: <CheckCircleOutlined style={{ fontSize: 24, color: '#52c41a' }} />,
    },
    {
      title: 'Overall Open Rate',
      value: `${analytics.overallOpenRate || 0}%`,
      icon: <EyeOutlined style={{ fontSize: 24, color: '#722ed1' }} />,
    },
    {
      title: 'Overall Click Rate',
      value: `${analytics.overallClickRate || 0}%`,
      icon: <LinkOutlined style={{ fontSize: 24, color: '#13c2c2' }} />,
    },
  ] : []

  const campaignColumns = [
    {
      title: 'Campaign',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <div>
          <div>{text}</div>
          <small style={{ color: '#888' }}>
            {dayjs(record.createdAt).fromNow()}
          </small>
        </div>
      )
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const colors = {
          draft: 'default',
          scheduled: 'blue',
          sending: 'processing',
          sent: 'success',
          paused: 'warning'
        }
        return <Tag color={colors[status]}>{status.toUpperCase()}</Tag>
      }
    },
    {
      title: 'Recipients',
      dataIndex: 'total',
      key: 'total',
    },
    {
      title: 'Delivered',
      dataIndex: 'delivered',
      key: 'delivered',
      render: (delivered, record) => (
        <span>
          {delivered} <small style={{ color: '#888' }}>({record.total > 0 ? ((delivered / record.total) * 100).toFixed(0) : 0}%)</small>
        </span>
      )
    },
    {
      title: 'Open Rate',
      dataIndex: 'openRate',
      key: 'openRate',
      render: (rate) => (
        <div>
          <Progress
            percent={parseFloat(rate)}
            size="small"
            strokeColor="#722ed1"
            format={percent => `${percent.toFixed(1)}%`}
          />
        </div>
      )
    },
    {
      title: 'Click Rate',
      dataIndex: 'clickRate',
      key: 'clickRate',
      render: (rate) => (
        <div>
          <Progress
            percent={parseFloat(rate)}
            size="small"
            strokeColor="#13c2c2"
            format={percent => `${percent.toFixed(1)}%`}
          />
        </div>
      )
    }
  ]

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div>
      <Title level={2} style={{ marginBottom: 24 }}>Dashboard</Title>

      {/* Basic Stats */}
      <Row gutter={[16, 16]}>
        {statCards.map((stat, index) => (
          <Col xs={24} sm={12} lg={6} key={index}>
            <Card
              hoverable
              style={{ background: stat.color, borderColor: 'transparent' }}
            >
              <Statistic
                title={stat.title}
                value={stat.value}
                prefix={stat.icon}
                valueStyle={{ fontSize: 28 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Lifetime Engagement Stats */}
      {analytics && (
        <div style={{ marginTop: 24 }}>
          <Title level={4}>Lifetime Performance</Title>
          <Row gutter={[16, 16]}>
            {engagementCards.map((stat, index) => (
              <Col xs={24} sm={12} lg={6} key={index}>
                <Card>
                  <Statistic
                    title={stat.title}
                    value={stat.value}
                    suffix={stat.suffix}
                    prefix={stat.icon}
                  />
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      )}

      {/* Recent Campaigns */}
      {recentCampaigns.length > 0 && (
        <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
          <Col span={24}>
            <Card
              title="Recent Campaigns"
              extra={
                <a onClick={() => navigate('/campaigns')}>View All</a>
              }
            >
              <Table
                columns={campaignColumns}
                dataSource={recentCampaigns}
                rowKey="id"
                pagination={false}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Quick Actions */}
      {stats.campaigns === 0 && (
        <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
          <Col span={24}>
            <Card title="Getting Started">
              <p>Welcome to the Email Marketing Tool!</p>
              <p>Get started by:</p>
              <ul>
                <li>Creating email templates</li>
                <li>Building contact lists</li>
                <li>Adding contacts</li>
                <li>Launching your first campaign</li>
              </ul>
            </Card>
          </Col>
        </Row>
      )}
    </div>
  )
}

export default Dashboard
