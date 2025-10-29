import { useState, useEffect } from 'react'
import {
  Table, Button, Modal, Form, Input, Space, Typography, Popconfirm, message, Tag, Card, Row, Col, Select, DatePicker, Divider
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, TeamOutlined, SettingOutlined, FilterOutlined } from '@ant-design/icons'
import api from '../utils/api'

const { Title } = Typography
const { TextArea } = Input

const Lists = () => {
  const [lists, setLists] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [fieldsModalVisible, setFieldsModalVisible] = useState(false)
  const [segmentModalVisible, setSegmentModalVisible] = useState(false)
  const [subscribersModalVisible, setSubscribersModalVisible] = useState(false)
  const [editingList, setEditingList] = useState(null)
  const [customFields, setCustomFields] = useState([])
  const [filters, setFilters] = useState([])
  const [segmentResults, setSegmentResults] = useState([])
  const [segmentCount, setSegmentCount] = useState(0)
  const [segmentLoading, setSegmentLoading] = useState(false)
  const [subscribers, setSubscribers] = useState([])
  const [allContacts, setAllContacts] = useState([])
  const [subscribersLoading, setSubscribersLoading] = useState(false)
  const [selectedContacts, setSelectedContacts] = useState([])
  const [form] = Form.useForm()

  useEffect(() => {
    loadLists()
  }, [])

  const loadLists = async () => {
    setLoading(true)
    try {
      const response = await api.get('/lists')
      setLists(response.data.lists)
    } catch (error) {
      message.error('Failed to load lists')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingList(null)
    setCustomFields([])
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (list) => {
    setEditingList(list)
    form.setFieldsValue({
      name: list.name,
      description: list.description,
    })
    setCustomFields(
      Object.entries(list.custom_fields || {}).map(([key, value]) => ({
        field_name: key,
        field_type: value,
      }))
    )
    setModalVisible(true)
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/lists/${id}`)
      message.success('List deleted successfully')
      loadLists()
    } catch (error) {
      message.error('Failed to delete list')
    }
  }

  const handleManageFields = (list) => {
    setEditingList(list)
    setCustomFields(
      Object.entries(list.custom_fields || {}).map(([key, value]) => ({
        field_name: key,
        field_type: value,
      }))
    )
    setFieldsModalVisible(true)
  }

  const handleAddField = () => {
    setCustomFields([...customFields, { field_name: '', field_type: 'text' }])
  }

  const handleRemoveField = (index) => {
    const newFields = customFields.filter((_, i) => i !== index)
    setCustomFields(newFields)
  }

  const handleFieldChange = (index, key, value) => {
    const newFields = [...customFields]
    newFields[index][key] = value
    setCustomFields(newFields)
  }

  const handleSubmit = async (values) => {
    try {
      const customFieldsObj = {}
      customFields.forEach((field) => {
        if (field.field_name) {
          customFieldsObj[field.field_name] = field.field_type
        }
      })

      const payload = {
        ...values,
        custom_fields: customFieldsObj,
      }

      if (editingList) {
        await api.put(`/lists/${editingList.id}`, payload)
        message.success('List updated successfully')
      } else {
        await api.post('/lists', payload)
        message.success('List created successfully')
      }
      setModalVisible(false)
      loadLists()
    } catch (error) {
      message.error('Failed to save list')
    }
  }

  const handleSaveFields = async () => {
    try {
      const customFieldsObj = {}
      customFields.forEach((field) => {
        if (field.field_name) {
          customFieldsObj[field.field_name] = field.field_type
        }
      })

      await api.put(`/lists/${editingList.id}`, {
        name: editingList.name,
        description: editingList.description,
        custom_fields: customFieldsObj,
      })
      message.success('Custom fields updated successfully')
      setFieldsModalVisible(false)
      loadLists()
    } catch (error) {
      message.error('Failed to update custom fields')
    }
  }

  const handleSegment = (list) => {
    setEditingList(list)
    setFilters([{ field: 'status', operator: 'equals', value: 'active' }])
    setSegmentResults([])
    setSegmentCount(0)
    setSegmentModalVisible(true)
  }

  const handleAddFilter = () => {
    setFilters([...filters, { field: '', operator: 'equals', value: '' }])
  }

  const handleRemoveFilter = (index) => {
    const newFilters = filters.filter((_, i) => i !== index)
    setFilters(newFilters)
  }

  const handleFilterChange = (index, key, value) => {
    const newFilters = [...filters]
    newFilters[index][key] = value
    setFilters(newFilters)
  }

  const handlePreviewSegment = async () => {
    try {
      setSegmentLoading(true)
      const response = await api.post(`/lists/${editingList.id}/segment`, {
        filters: filters.filter(f => f.field && f.operator)
      })
      setSegmentResults(response.data.contacts || [])
      setSegmentCount(response.data.count || 0)
      message.success(`Found ${response.data.count} contacts matching filters`)
    } catch (error) {
      message.error('Failed to preview segment')
    } finally {
      setSegmentLoading(false)
    }
  }

  const handleManageSubscribers = async (list) => {
    setEditingList(list)
    setSubscribersLoading(true)
    setSubscribersModalVisible(true)
    try {
      const [subsRes, contactsRes] = await Promise.all([
        api.get(`/lists/${list.id}/subscribers`),
        api.get('/contacts')
      ])
      setSubscribers(subsRes.data.subscribers || [])
      setAllContacts(contactsRes.data.contacts || [])
    } catch (error) {
      message.error('Failed to load subscribers')
    } finally {
      setSubscribersLoading(false)
    }
  }

  const handleAddSubscribers = async () => {
    if (selectedContacts.length === 0) {
      message.warning('Please select contacts to add')
      return
    }

    try {
      setSubscribersLoading(true)
      await Promise.all(
        selectedContacts.map(contactId =>
          api.post(`/lists/${editingList.id}/subscribers`, { contact_id: contactId })
        )
      )
      message.success(`Added ${selectedContacts.length} contact(s) to list`)
      setSelectedContacts([])
      // Reload subscribers
      const response = await api.get(`/lists/${editingList.id}/subscribers`)
      setSubscribers(response.data.subscribers || [])
      loadLists() // Refresh subscriber counts
    } catch (error) {
      message.error('Failed to add subscribers')
    } finally {
      setSubscribersLoading(false)
    }
  }

  const handleRemoveSubscriber = async (contactId) => {
    try {
      await api.delete(`/lists/${editingList.id}/subscribers/${contactId}`)
      message.success('Contact removed from list')
      // Reload subscribers
      const response = await api.get(`/lists/${editingList.id}/subscribers`)
      setSubscribers(response.data.subscribers || [])
      loadLists() // Refresh subscriber counts
    } catch (error) {
      message.error('Failed to remove subscriber')
    }
  }

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'Subscribers',
      dataIndex: 'subscriber_count',
      key: 'subscriber_count',
      render: (count) => (
        <Tag color="blue">
          <TeamOutlined /> {count}
        </Tag>
      ),
    },
    {
      title: 'Custom Fields',
      dataIndex: 'custom_fields',
      key: 'custom_fields',
      render: (fields) => Object.keys(fields || {}).length,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<TeamOutlined />}
            onClick={() => handleManageSubscribers(record)}
          >
            Subscribers
          </Button>
          <Button
            type="link"
            icon={<FilterOutlined />}
            onClick={() => handleSegment(record)}
          >
            Segment
          </Button>
          <Button
            type="link"
            icon={<SettingOutlined />}
            onClick={() => handleManageFields(record)}
          >
            Fields
          </Button>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            Edit
          </Button>
          <Popconfirm
            title="Are you sure you want to delete this list?"
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
        <Title level={2}>Email Lists</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          New List
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={lists}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingList ? 'Edit List' : 'New List'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        width={700}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="name"
            label="List Name"
            rules={[{ required: true, message: 'Please enter list name' }]}
          >
            <Input placeholder="My Email List" />
          </Form.Item>

          <Form.Item
            name="description"
            label="Description"
          >
            <TextArea rows={3} placeholder="Description of this email list" />
          </Form.Item>

          <Card title="Custom Fields" size="small" style={{ marginBottom: 16 }}>
            {customFields.map((field, index) => (
              <Row gutter={8} key={index} style={{ marginBottom: 8 }}>
                <Col span={10}>
                  <Input
                    placeholder="Field name"
                    value={field.field_name}
                    onChange={(e) => handleFieldChange(index, 'field_name', e.target.value)}
                  />
                </Col>
                <Col span={10}>
                  <Input
                    placeholder="Field type"
                    value={field.field_type}
                    onChange={(e) => handleFieldChange(index, 'field_type', e.target.value)}
                  />
                </Col>
                <Col span={4}>
                  <Button danger onClick={() => handleRemoveField(index)}>
                    Remove
                  </Button>
                </Col>
              </Row>
            ))}
            <Button type="dashed" onClick={handleAddField} block>
              + Add Custom Field
            </Button>
          </Card>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingList ? 'Update' : 'Create'}
              </Button>
              <Button onClick={() => setModalVisible(false)}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Manage Custom Fields"
        open={fieldsModalVisible}
        onCancel={() => setFieldsModalVisible(false)}
        onOk={handleSaveFields}
        width={600}
      >
        {customFields.map((field, index) => (
          <Row gutter={8} key={index} style={{ marginBottom: 8 }}>
            <Col span={10}>
              <Input
                placeholder="Field name"
                value={field.field_name}
                onChange={(e) => handleFieldChange(index, 'field_name', e.target.value)}
              />
            </Col>
            <Col span={10}>
              <Input
                placeholder="Field type"
                value={field.field_type}
                onChange={(e) => handleFieldChange(index, 'field_type', e.target.value)}
              />
            </Col>
            <Col span={4}>
              <Button danger onClick={() => handleRemoveField(index)}>
                Remove
              </Button>
            </Col>
          </Row>
        ))}
        <Button type="dashed" onClick={handleAddField} block style={{ marginTop: 16 }}>
          + Add Custom Field
        </Button>
      </Modal>

      <Modal
        title={`Segment List: ${editingList?.name || ''}`}
        open={segmentModalVisible}
        onCancel={() => setSegmentModalVisible(false)}
        width={900}
        footer={[
          <Button key="cancel" onClick={() => setSegmentModalVisible(false)}>
            Close
          </Button>,
          <Button key="preview" type="primary" onClick={handlePreviewSegment} loading={segmentLoading}>
            Preview Segment ({segmentCount})
          </Button>
        ]}
      >
        <Card title="Filter Builder" size="small" style={{ marginBottom: 16 }}>
          {filters.map((filter, index) => (
            <Row gutter={8} key={index} style={{ marginBottom: 8 }}>
              <Col span={7}>
                <Select
                  placeholder="Field"
                  value={filter.field}
                  onChange={(value) => handleFilterChange(index, 'field', value)}
                  style={{ width: '100%' }}
                >
                  <Select.Option value="status">Status</Select.Option>
                  <Select.Option value="email">Email</Select.Option>
                  <Select.Option value="first_name">First Name</Select.Option>
                  <Select.Option value="last_name">Last Name</Select.Option>
                  <Select.Option value="subscribed_at">Subscription Date</Select.Option>
                  <Select.Option value="created_at">Created Date</Select.Option>
                  {editingList && Object.keys(editingList.custom_fields || {}).map(field => (
                    <Select.Option key={field} value={field}>{field}</Select.Option>
                  ))}
                </Select>
              </Col>
              <Col span={6}>
                <Select
                  placeholder="Operator"
                  value={filter.operator}
                  onChange={(value) => handleFilterChange(index, 'operator', value)}
                  style={{ width: '100%' }}
                >
                  <Select.Option value="equals">Equals</Select.Option>
                  <Select.Option value="not_equals">Not Equals</Select.Option>
                  <Select.Option value="contains">Contains</Select.Option>
                  <Select.Option value="not_contains">Not Contains</Select.Option>
                  <Select.Option value="starts_with">Starts With</Select.Option>
                  <Select.Option value="ends_with">Ends With</Select.Option>
                  <Select.Option value="is_empty">Is Empty</Select.Option>
                  <Select.Option value="is_not_empty">Is Not Empty</Select.Option>
                  <Select.Option value="before">Before (Date)</Select.Option>
                  <Select.Option value="after">After (Date)</Select.Option>
                  <Select.Option value="last_days">Last N Days</Select.Option>
                </Select>
              </Col>
              <Col span={7}>
                {filter.operator !== 'is_empty' && filter.operator !== 'is_not_empty' && (
                  filter.field === 'status' ? (
                    <Select
                      placeholder="Value"
                      value={filter.value}
                      onChange={(value) => handleFilterChange(index, 'value', value)}
                      style={{ width: '100%' }}
                    >
                      <Select.Option value="active">Active</Select.Option>
                      <Select.Option value="bounced">Bounced</Select.Option>
                      <Select.Option value="unsubscribed">Unsubscribed</Select.Option>
                    </Select>
                  ) : (
                    <Input
                      placeholder="Value"
                      value={filter.value}
                      onChange={(e) => handleFilterChange(index, 'value', e.target.value)}
                    />
                  )
                )}
              </Col>
              <Col span={4}>
                <Button danger onClick={() => handleRemoveFilter(index)} block>
                  Remove
                </Button>
              </Col>
            </Row>
          ))}
          <Button type="dashed" onClick={handleAddFilter} block style={{ marginTop: 8 }}>
            + Add Filter
          </Button>
        </Card>

        {segmentResults.length > 0 && (
          <Card title={`Results (${segmentCount} contacts)`} size="small">
            <Table
              dataSource={segmentResults}
              rowKey="id"
              pagination={{ pageSize: 5 }}
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
                    <Tag color={status === 'active' ? 'green' : status === 'bounced' ? 'red' : 'default'}>
                      {status}
                    </Tag>
                  )
                },
                {
                  title: 'Subscribed',
                  dataIndex: 'subscribed_at',
                  key: 'subscribed_at',
                  render: (date) => date ? new Date(date).toLocaleDateString() : '-'
                }
              ]}
            />
          </Card>
        )}
      </Modal>

      <Modal
        title={`Manage Subscribers: ${editingList?.name || ''}`}
        open={subscribersModalVisible}
        onCancel={() => {
          setSubscribersModalVisible(false)
          setSelectedContacts([])
        }}
        width={1000}
        footer={null}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {/* Current Subscribers */}
          <Card
            title={`Current Subscribers (${subscribers.length})`}
            size="small"
            style={{ marginBottom: 16 }}
          >
            <Table
              dataSource={subscribers}
              rowKey="id"
              loading={subscribersLoading}
              pagination={{ pageSize: 5 }}
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
                    <Tag color={status === 'active' ? 'green' : status === 'bounced' ? 'red' : 'default'}>
                      {status}
                    </Tag>
                  )
                },
                {
                  title: 'Subscribed',
                  dataIndex: 'subscribed_at',
                  key: 'subscribed_at',
                  render: (date) => date ? new Date(date).toLocaleDateString() : '-'
                },
                {
                  title: 'Action',
                  key: 'action',
                  render: (_, record) => (
                    <Popconfirm
                      title="Remove this contact from the list?"
                      onConfirm={() => handleRemoveSubscriber(record.id)}
                      okText="Yes"
                      cancelText="No"
                    >
                      <Button type="link" danger size="small">
                        Remove
                      </Button>
                    </Popconfirm>
                  )
                }
              ]}
            />
          </Card>

          {/* Add Subscribers */}
          <Card
            title="Add Contacts to List"
            size="small"
            extra={
              <Button
                type="primary"
                onClick={handleAddSubscribers}
                disabled={selectedContacts.length === 0}
                loading={subscribersLoading}
              >
                Add Selected ({selectedContacts.length})
              </Button>
            }
          >
            <Table
              dataSource={allContacts.filter(contact =>
                !subscribers.some(sub => sub.id === contact.id)
              )}
              rowKey="id"
              loading={subscribersLoading}
              pagination={{ pageSize: 5 }}
              size="small"
              rowSelection={{
                selectedRowKeys: selectedContacts,
                onChange: (selectedRowKeys) => {
                  setSelectedContacts(selectedRowKeys)
                }
              }}
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
                    <Tag color={status === 'active' ? 'green' : status === 'bounced' ? 'red' : 'default'}>
                      {status}
                    </Tag>
                  )
                }
              ]}
            />
          </Card>
        </Space>
      </Modal>
    </div>
  )
}

export default Lists
