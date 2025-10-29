import { useState, useEffect } from 'react'
import {
  Table, Button, Modal, Form, Input, Select, Space, Typography, Popconfirm, message, Tag, Upload, Dropdown, Card, Statistic, Row, Col, Progress
} from 'antd'
import {
  PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined, DownloadOutlined, ToolOutlined, StarOutlined, ClearOutlined
} from '@ant-design/icons'
import api from '../utils/api'

const { Title } = Typography

const Contacts = () => {
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [importModalVisible, setImportModalVisible] = useState(false)
  const [hygieneModalVisible, setHygieneModalVisible] = useState(false)
  const [engagementModalVisible, setEngagementModalVisible] = useState(false)
  const [editingContact, setEditingContact] = useState(null)
  const [hygieneStats, setHygieneStats] = useState(null)
  const [engagementScores, setEngagementScores] = useState([])
  const [form] = Form.useForm()

  useEffect(() => {
    loadContacts()
  }, [])

  const loadContacts = async () => {
    setLoading(true)
    try {
      const response = await api.get('/contacts')
      setContacts(response.data.contacts)
    } catch (error) {
      message.error('Failed to load contacts')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingContact(null)
    form.resetFields()
    form.setFieldsValue({ status: 'active' })
    setModalVisible(true)
  }

  const handleEdit = (contact) => {
    setEditingContact(contact)
    form.setFieldsValue(contact)
    setModalVisible(true)
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/contacts/${id}`)
      message.success('Contact deleted successfully')
      loadContacts()
    } catch (error) {
      message.error('Failed to delete contact')
    }
  }

  const handleSubmit = async (values) => {
    try {
      if (editingContact) {
        await api.put(`/contacts/${editingContact.id}`, values)
        message.success('Contact updated successfully')
      } else {
        await api.post('/contacts', values)
        message.success('Contact created successfully')
      }
      setModalVisible(false)
      loadContacts()
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to save contact')
    }
  }

  const handleImport = () => {
    setImportModalVisible(true)
  }

  const handleFileUpload = async (file) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const text = e.target.result
        const lines = text.split('\n')
        const headers = lines[0].split(',').map(h => h.trim())

        const contacts = []
        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue

          const values = lines[i].split(',').map(v => v.trim())
          const contact = {}
          headers.forEach((header, index) => {
            contact[header] = values[index]
          })

          if (contact.email) {
            contacts.push(contact)
          }
        }

        await api.post('/contacts/bulk-import', { contacts })
        message.success(`Imported ${contacts.length} contacts successfully`)
        setImportModalVisible(false)
        loadContacts()
      } catch (error) {
        message.error('Failed to import contacts')
      }
    }
    reader.readAsText(file)
    return false // Prevent default upload behavior
  }

  const handleExport = () => {
    try {
      const csv = []
      csv.push('email,first_name,last_name,status')

      contacts.forEach(contact => {
        csv.push(`${contact.email},${contact.first_name || ''},${contact.last_name || ''},${contact.status}`)
      })

      const blob = new Blob([csv.join('\n')], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'contacts.csv'
      a.click()

      message.success('Contacts exported successfully')
    } catch (error) {
      message.error('Failed to export contacts')
    }
  }

  const handleHygieneTools = async () => {
    try {
      setLoading(true)
      const response = await api.get('/contacts/hygiene/stats')
      setHygieneStats(response.data)
      setHygieneModalVisible(true)
    } catch (error) {
      message.error('Failed to load hygiene stats')
    } finally {
      setLoading(false)
    }
  }

  const handleCleanInvalid = async (dryRun = true) => {
    try {
      setLoading(true)
      const response = await api.post('/contacts/hygiene/clean-invalid', { dryRun })
      if (dryRun) {
        message.info(`Found ${response.data.total} invalid/role-based emails (dry run)`)
      } else {
        message.success(`Marked ${response.data.total} contacts as bounced`)
        loadContacts()
        handleHygieneTools()
      }
    } catch (error) {
      message.error('Failed to clean invalid emails')
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveHardBounces = async () => {
    try {
      setLoading(true)
      const response = await api.post('/contacts/hygiene/remove-hard-bounces')
      message.success(response.data.message)
      loadContacts()
      handleHygieneTools()
    } catch (error) {
      message.error('Failed to remove hard bounces')
    } finally {
      setLoading(false)
    }
  }

  const handleSunsetInactive = async (days = 180) => {
    try {
      setLoading(true)
      const response = await api.post('/contacts/hygiene/sunset-inactive', { inactiveDays: days })
      message.success(response.data.message)
      loadContacts()
      handleHygieneTools()
    } catch (error) {
      message.error('Failed to sunset inactive contacts')
    } finally {
      setLoading(false)
    }
  }

  const handleViewEngagement = async () => {
    try {
      setLoading(true)
      const response = await api.get('/contacts/engagement-scores?limit=100')
      setEngagementScores(response.data.contacts || [])
      setEngagementModalVisible(true)
    } catch (error) {
      message.error('Failed to load engagement scores')
    } finally {
      setLoading(false)
    }
  }

  const hygieneMenuItems = [
    {
      key: 'stats',
      label: 'View Hygiene Stats',
      icon: <ToolOutlined />,
      onClick: handleHygieneTools
    },
    {
      key: 'clean',
      label: 'Clean Invalid Emails',
      icon: <ClearOutlined />,
      onClick: () => handleCleanInvalid(false)
    },
    {
      key: 'bounces',
      label: 'Remove Hard Bounces',
      onClick: handleRemoveHardBounces
    },
    {
      key: 'sunset',
      label: 'Sunset Inactive (180 days)',
      onClick: () => handleSunsetInactive(180)
    },
    {
      key: 'engagement',
      label: 'View Engagement Scores',
      icon: <StarOutlined />,
      onClick: handleViewEngagement
    }
  ]

  const columns = [
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'First Name',
      dataIndex: 'first_name',
      key: 'first_name',
    },
    {
      title: 'Last Name',
      dataIndex: 'last_name',
      key: 'last_name',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const colors = {
          active: 'green',
          bounced: 'red',
          unsubscribed: 'orange',
        }
        return <Tag color={colors[status]}>{status.toUpperCase()}</Tag>
      },
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => new Date(date).toLocaleDateString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            Edit
          </Button>
          <Popconfirm
            title="Are you sure you want to delete this contact?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={2}>Contacts</Title>
        <Space>
          <Dropdown menu={{ items: hygieneMenuItems }} placement="bottomRight">
            <Button icon={<ToolOutlined />}>
              Hygiene Tools
            </Button>
          </Dropdown>
          <Button icon={<UploadOutlined />} onClick={handleImport}>
            Import CSV
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            Export CSV
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            New Contact
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={contacts}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingContact ? 'Edit Contact' : 'New Contact'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Please enter email' },
              { type: 'email', message: 'Please enter valid email' },
            ]}
          >
            <Input placeholder="contact@example.com" />
          </Form.Item>

          <Form.Item
            name="first_name"
            label="First Name"
          >
            <Input placeholder="John" />
          </Form.Item>

          <Form.Item
            name="last_name"
            label="Last Name"
          >
            <Input placeholder="Doe" />
          </Form.Item>

          <Form.Item
            name="status"
            label="Status"
            rules={[{ required: true }]}
          >
            <Select>
              <Select.Option value="active">Active</Select.Option>
              <Select.Option value="bounced">Bounced</Select.Option>
              <Select.Option value="unsubscribed">Unsubscribed</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingContact ? 'Update' : 'Create'}
              </Button>
              <Button onClick={() => setModalVisible(false)}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Import Contacts from CSV"
        open={importModalVisible}
        onCancel={() => setImportModalVisible(false)}
        footer={null}
      >
        <div style={{ marginBottom: 16 }}>
          <p>CSV file should have headers: email, first_name, last_name, status</p>
          <p><strong>Example:</strong></p>
          <pre style={{ background: '#f5f5f5', padding: 8 }}>
            email,first_name,last_name,status{'\n'}
            john@example.com,John,Doe,active{'\n'}
            jane@example.com,Jane,Smith,active
          </pre>
        </div>

        <Upload
          beforeUpload={handleFileUpload}
          accept=".csv"
          maxCount={1}
        >
          <Button icon={<UploadOutlined />}>Select CSV File</Button>
        </Upload>
      </Modal>

      <Modal
        title="Contact Hygiene Statistics"
        open={hygieneModalVisible}
        onCancel={() => setHygieneModalVisible(false)}
        width={800}
        footer={[
          <Button key="close" onClick={() => setHygieneModalVisible(false)}>
            Close
          </Button>
        ]}
      >
        {hygieneStats && (
          <div>
            <Row gutter={16} style={{ marginBottom: 24 }}>
              <Col span={8}>
                <Card>
                  <Statistic title="Total Contacts" value={hygieneStats.total} />
                </Card>
              </Col>
              <Col span={8}>
                <Card>
                  <Statistic title="Active" value={hygieneStats.active} valueStyle={{ color: '#52c41a' }} />
                </Card>
              </Col>
              <Col span={8}>
                <Card>
                  <Statistic title="Bounced" value={hygieneStats.bounced} valueStyle={{ color: '#f5222d' }} />
                </Card>
              </Col>
            </Row>
            <Row gutter={16} style={{ marginBottom: 24 }}>
              <Col span={8}>
                <Card>
                  <Statistic title="Unsubscribed" value={hygieneStats.unsubscribed} valueStyle={{ color: '#fa8c16' }} />
                </Card>
              </Col>
              <Col span={8}>
                <Card>
                  <Statistic title="Duplicates" value={hygieneStats.duplicates} valueStyle={{ color: '#1890ff' }} />
                </Card>
              </Col>
              <Col span={8}>
                <Card>
                  <Statistic title="Invalid/Role-based" value={hygieneStats.invalid + hygieneStats.roleBased} valueStyle={{ color: '#722ed1' }} />
                </Card>
              </Col>
            </Row>
            <Card title="Health Score" size="small">
              <Progress
                percent={Math.round((hygieneStats.active / hygieneStats.total) * 100)}
                status="active"
                strokeColor={{
                  '0%': '#108ee9',
                  '100%': '#87d068',
                }}
              />
              <p style={{ marginTop: 16, color: '#666' }}>
                Based on active contacts vs total contacts. Higher is better.
              </p>
            </Card>
          </div>
        )}
      </Modal>

      <Modal
        title="Contact Engagement Scores"
        open={engagementModalVisible}
        onCancel={() => setEngagementModalVisible(false)}
        width={900}
        footer={[
          <Button key="close" onClick={() => setEngagementModalVisible(false)}>
            Close
          </Button>
        ]}
      >
        <Table
          dataSource={engagementScores}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          size="small"
          columns={[
            {
              title: 'Email',
              dataIndex: 'email',
              key: 'email'
            },
            {
              title: 'Name',
              key: 'name',
              render: (_, record) => `${record.first_name || ''} ${record.last_name || ''}`.trim() || '-'
            },
            {
              title: 'Status',
              dataIndex: 'status',
              key: 'status',
              render: (status) => (
                <Tag color={status === 'active' ? 'green' : status === 'bounced' ? 'red' : 'orange'}>
                  {status}
                </Tag>
              )
            },
            {
              title: 'Engagement Score',
              dataIndex: 'engagement_score',
              key: 'engagement_score',
              sorter: (a, b) => a.engagement_score - b.engagement_score,
              defaultSortOrder: 'descend',
              render: (score) => (
                <div>
                  <Progress
                    percent={score}
                    size="small"
                    strokeColor={{
                      '0%': '#ff4d4f',
                      '50%': '#faad14',
                      '100%': '#52c41a',
                    }}
                    format={(percent) => `${percent}/100`}
                  />
                </div>
              )
            }
          ]}
        />
      </Modal>
    </div>
  )
}

export default Contacts
