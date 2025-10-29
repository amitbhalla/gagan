import { useState, useEffect } from 'react'
import {
  Table, Button, Modal, Form, Input, Select, Space, Typography, Popconfirm, message, Tag
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons'
import ReactQuill from 'react-quill'
import 'react-quill/dist/quill.snow.css'
import api from '../utils/api'

const { Title } = Typography
const { TextArea } = Input

const Templates = () => {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [previewVisible, setPreviewVisible] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [previewContent, setPreviewContent] = useState('')
  const [form] = Form.useForm()

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    setLoading(true)
    try {
      const response = await api.get('/templates')
      setTemplates(response.data.templates)
    } catch (error) {
      message.error('Failed to load templates')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingTemplate(null)
    form.resetFields()
    form.setFieldsValue({ type: 'html' })
    setModalVisible(true)
  }

  const handleEdit = (template) => {
    setEditingTemplate(template)
    form.setFieldsValue(template)
    setModalVisible(true)
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/templates/${id}`)
      message.success('Template deleted successfully')
      loadTemplates()
    } catch (error) {
      message.error('Failed to delete template')
    }
  }

  const handlePreview = (template) => {
    setPreviewContent(template.body)
    setPreviewVisible(true)
  }

  const handleSubmit = async (values) => {
    try {
      if (editingTemplate) {
        await api.put(`/templates/${editingTemplate.id}`, values)
        message.success('Template updated successfully')
      } else {
        await api.post('/templates', values)
        message.success('Template created successfully')
      }
      setModalVisible(false)
      loadTemplates()
    } catch (error) {
      message.error('Failed to save template')
    }
  }

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Subject',
      dataIndex: 'subject',
      key: 'subject',
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (type) => (
        <Tag color={type === 'html' ? 'blue' : 'green'}>
          {type.toUpperCase()}
        </Tag>
      ),
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
            icon={<EyeOutlined />}
            onClick={() => handlePreview(record)}
          >
            Preview
          </Button>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            Edit
          </Button>
          <Popconfirm
            title="Are you sure you want to delete this template?"
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

  const quillModules = {
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      [{ color: [] }, { background: [] }],
      ['link', 'image'],
      ['clean'],
    ],
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={2}>Email Templates</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          New Template
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={templates}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingTemplate ? 'Edit Template' : 'New Template'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        width={800}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="name"
            label="Template Name"
            rules={[{ required: true, message: 'Please enter template name' }]}
          >
            <Input placeholder="My Template" />
          </Form.Item>

          <Form.Item
            name="subject"
            label="Email Subject"
            rules={[{ required: true, message: 'Please enter email subject' }]}
          >
            <Input placeholder="Welcome to our newsletter!" />
          </Form.Item>

          <Form.Item
            name="type"
            label="Template Type"
            rules={[{ required: true }]}
          >
            <Select>
              <Select.Option value="html">HTML</Select.Option>
              <Select.Option value="text">Plain Text</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.type !== curr.type}>
            {({ getFieldValue }) =>
              getFieldValue('type') === 'html' ? (
                <Form.Item
                  name="body"
                  label="Email Body"
                  rules={[{ required: true, message: 'Please enter email body' }]}
                >
                  <ReactQuill theme="snow" modules={quillModules} style={{ height: 300, marginBottom: 50 }} />
                </Form.Item>
              ) : (
                <Form.Item
                  name="body"
                  label="Email Body"
                  rules={[{ required: true, message: 'Please enter email body' }]}
                >
                  <TextArea rows={10} placeholder="Plain text email content..." />
                </Form.Item>
              )
            }
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingTemplate ? 'Update' : 'Create'}
              </Button>
              <Button onClick={() => setModalVisible(false)}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Template Preview"
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        width={800}
        footer={[
          <Button key="close" onClick={() => setPreviewVisible(false)}>
            Close
          </Button>,
        ]}
      >
        <div dangerouslySetInnerHTML={{ __html: previewContent }} />
      </Modal>
    </div>
  )
}

export default Templates
