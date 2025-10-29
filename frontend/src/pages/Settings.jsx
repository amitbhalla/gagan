import { useState, useEffect } from 'react';
import {
  Card,
  Tabs,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  Select,
  message,
  Space,
  Tag,
  Popconfirm,
  Divider,
  Alert,
  Typography
} from 'antd';
import {
  MailOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
  SettingOutlined
} from '@ant-design/icons';
import api from '../utils/api';

const { TabPane } = Tabs;
const { Title } = Typography;

function Settings() {
  const [smtpConfigs, setSmtpConfigs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [testingConfig, setTestingConfig] = useState(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchSmtpConfigs();
  }, []);

  const fetchSmtpConfigs = async () => {
    try {
      setLoading(true);
      const response = await api.get('/smtp-configs');
      setSmtpConfigs(response.data.configs || []);
    } catch (error) {
      message.error('Failed to load SMTP configurations');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingConfig(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (config) => {
    setEditingConfig(config);
    form.setFieldsValue({
      ...config,
      password: '' // Don't show encrypted password
    });
    setModalVisible(true);
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/smtp-configs/${id}`);
      message.success('SMTP configuration deleted');
      fetchSmtpConfigs();
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to delete SMTP configuration');
    }
  };

  const handleActivate = async (id) => {
    try {
      await api.post(`/smtp-configs/${id}/activate`);
      message.success('SMTP configuration activated');
      fetchSmtpConfigs();
    } catch (error) {
      message.error('Failed to activate SMTP configuration');
    }
  };

  const handleTest = async (id) => {
    try {
      setTestingConfig(id);
      const response = await api.post(`/smtp-configs/${id}/test`);
      if (response.data.success) {
        message.success('SMTP connection successful!');
      }
    } catch (error) {
      message.error(error.response?.data?.error || 'SMTP connection failed');
    } finally {
      setTestingConfig(null);
    }
  };

  const handleSubmit = async (values) => {
    try {
      setLoading(true);

      // Don't send password if it's empty (when editing and not changing password)
      if (!values.password && editingConfig) {
        delete values.password;
      }

      if (editingConfig) {
        await api.put(`/smtp-configs/${editingConfig.id}`, values);
        message.success('SMTP configuration updated');
      } else {
        await api.post('/smtp-configs', values);
        message.success('SMTP configuration created');
      }

      setModalVisible(false);
      form.resetFields();
      fetchSmtpConfigs();
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to save SMTP configuration');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Space>
          {record.is_active ? (
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
          ) : null}
          <strong>{text}</strong>
        </Space>
      )
    },
    {
      title: 'Host',
      dataIndex: 'host',
      key: 'host'
    },
    {
      title: 'Port',
      dataIndex: 'port',
      key: 'port',
      width: 80
    },
    {
      title: 'Secure',
      dataIndex: 'secure',
      key: 'secure',
      width: 80,
      render: (secure) => (
        <Tag color={secure ? 'green' : 'default'}>
          {secure ? 'TLS' : 'Plain'}
        </Tag>
      )
    },
    {
      title: 'From Email',
      dataIndex: 'from_email',
      key: 'from_email'
    },
    {
      title: 'Rate Limit',
      dataIndex: 'max_rate',
      key: 'max_rate',
      width: 100,
      render: (rate) => `${rate}/hour`
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (isActive) => (
        <Tag color={isActive ? 'success' : 'default'}>
          {isActive ? 'Active' : 'Inactive'}
        </Tag>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 220,
      render: (_, record) => (
        <Space size="small">
          {!record.is_active && (
            <Button
              size="small"
              type="primary"
              onClick={() => handleActivate(record.id)}
            >
              Activate
            </Button>
          )}
          <Button
            size="small"
            icon={<ThunderboltOutlined />}
            onClick={() => handleTest(record.id)}
            loading={testingConfig === record.id}
          >
            Test
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          />
          <Popconfirm
            title="Delete this SMTP configuration?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
            />
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div>
      <Title level={2}>
        <SettingOutlined /> Settings
      </Title>

      <Tabs defaultActiveKey="smtp">
        <TabPane tab="SMTP Configuration" key="smtp">
          <div style={{ marginBottom: 16 }}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleCreate}
            >
              Add SMTP Configuration
            </Button>
          </div>

          <Alert
            message="SMTP Configuration"
            description="Configure email sending servers. Only one configuration can be active at a time. Use Test to verify connection before activating."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Table
            columns={columns}
            dataSource={smtpConfigs}
            rowKey="id"
            loading={loading}
            pagination={false}
          />
        </TabPane>

        <TabPane tab="General" key="general">
          <Card>
            <Alert
              message="General Settings"
              description="General settings will be available in future updates."
              type="info"
              showIcon
            />
          </Card>
        </TabPane>
      </Tabs>

      <Modal
        title={editingConfig ? 'Edit SMTP Configuration' : 'Add SMTP Configuration'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={loading}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            port: 587,
            secure: false,
            auth_type: 'login',
            max_rate: 100,
            is_active: false
          }}
        >
          <Form.Item
            name="name"
            label="Configuration Name"
            rules={[{ required: true, message: 'Please enter a name' }]}
          >
            <Input placeholder="e.g., Gmail Relay" />
          </Form.Item>

          <Divider plain>Server Settings</Divider>

          <Form.Item
            name="host"
            label="SMTP Host"
            rules={[{ required: true, message: 'Please enter SMTP host' }]}
          >
            <Input placeholder="e.g., smtp-relay.gmail.com" />
          </Form.Item>

          <Form.Item
            name="port"
            label="SMTP Port"
            rules={[{ required: true, message: 'Please enter port' }]}
          >
            <InputNumber min={1} max={65535} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="secure"
            label="Use TLS/SSL"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Divider plain>Authentication</Divider>

          <Form.Item
            name="auth_type"
            label="Authentication Type"
          >
            <Select>
              <Select.Option value="login">Username/Password</Select.Option>
              <Select.Option value="none">None (IP-based)</Select.Option>
              <Select.Option value="oauth2">OAuth2</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) =>
              prevValues.auth_type !== currentValues.auth_type
            }
          >
            {({ getFieldValue }) =>
              getFieldValue('auth_type') === 'login' ? (
                <>
                  <Form.Item
                    name="username"
                    label="Username"
                  >
                    <Input placeholder="SMTP username" />
                  </Form.Item>

                  <Form.Item
                    name="password"
                    label="Password"
                    extra={editingConfig ? 'Leave blank to keep existing password' : ''}
                  >
                    <Input.Password placeholder="SMTP password" />
                  </Form.Item>
                </>
              ) : null
            }
          </Form.Item>

          <Divider plain>Sender Information</Divider>

          <Form.Item
            name="from_email"
            label="From Email"
            rules={[
              { required: true, message: 'Please enter from email' },
              { type: 'email', message: 'Please enter a valid email' }
            ]}
          >
            <Input placeholder="e.g., info@myndsol.com" />
          </Form.Item>

          <Form.Item
            name="from_name"
            label="From Name"
            rules={[{ required: true, message: 'Please enter from name' }]}
          >
            <Input placeholder="e.g., Mynd Solution" />
          </Form.Item>

          <Divider plain>Rate Limiting</Divider>

          <Form.Item
            name="max_rate"
            label="Max Emails per Hour"
            rules={[{ required: true, message: 'Please enter max rate' }]}
          >
            <InputNumber min={1} max={10000} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="is_active"
            label="Set as Active"
            valuePropName="checked"
            extra="Deactivates all other configurations"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default Settings;
