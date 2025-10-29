import { useState, useEffect } from 'react';
import {
  Typography,
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Steps,
  message,
  Tag,
  Popconfirm,
  Row,
  Col,
  Statistic,
  Progress,
  Tooltip,
  Tabs,
  Divider,
  DatePicker
} from 'antd';
import {
  SendOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  MailOutlined,
  EyeOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  LineChartOutlined,
  LinkOutlined,
  StopOutlined,
  CalendarOutlined
} from '@ant-design/icons';
import api from '../utils/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Step } = Steps;
const { Option } = Select;

const Campaigns = () => {
  const [campaigns, setCampaigns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [form] = Form.useForm();
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [testEmailModal, setTestEmailModal] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [statsModal, setStatsModal] = useState(false);
  const [campaignStats, setCampaignStats] = useState(null);
  const [campaignEvents, setCampaignEvents] = useState([]);
  const [campaignLinks, setCampaignLinks] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [scheduleForm] = Form.useForm();

  useEffect(() => {
    fetchCampaigns();
    fetchTemplates();
    fetchLists();
  }, []);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const response = await api.get('/campaigns');
      setCampaigns(response.data.campaigns);
    } catch (error) {
      message.error('Failed to fetch campaigns');
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const response = await api.get('/templates');
      setTemplates(response.data.templates);
    } catch (error) {
      message.error('Failed to fetch templates');
    }
  };

  const fetchLists = async () => {
    try {
      const response = await api.get('/lists');
      setLists(response.data.lists);
    } catch (error) {
      message.error('Failed to fetch lists');
    }
  };

  const showModal = (campaign = null) => {
    if (campaign) {
      setEditingCampaign(campaign);
      form.setFieldsValue({
        name: campaign.name,
        template_id: campaign.template_id,
        list_id: campaign.list_id,
        from_name: campaign.from_name,
        from_email: campaign.from_email,
        reply_to: campaign.reply_to
      });
    } else {
      setEditingCampaign(null);
      form.resetFields();
    }
    setCurrentStep(0);
    setIsModalVisible(true);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    setEditingCampaign(null);
    form.resetFields();
    setCurrentStep(0);
  };

  const handleNext = async () => {
    try {
      await form.validateFields();
      setCurrentStep(currentStep + 1);
    } catch (error) {
      // Validation failed
    }
  };

  const handlePrev = () => {
    setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      if (editingCampaign) {
        await api.put(`/campaigns/${editingCampaign.id}`, values);
        message.success('Campaign updated successfully');
      } else {
        await api.post('/campaigns', values);
        message.success('Campaign created successfully');
      }

      fetchCampaigns();
      handleCancel();
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to save campaign');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/campaigns/${id}`);
      message.success('Campaign deleted successfully');
      fetchCampaigns();
    } catch (error) {
      message.error('Failed to delete campaign');
    }
  };

  const handleSendCampaign = async (id) => {
    try {
      setLoading(true);
      await api.post(`/campaigns/${id}/send`);
      message.success('Campaign is being sent! Emails are being queued.');
      fetchCampaigns();
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to send campaign');
    } finally {
      setLoading(false);
    }
  };

  const showScheduleModal = (campaign) => {
    setSelectedCampaign(campaign);
    scheduleForm.resetFields();
    setScheduleModalVisible(true);
  };

  const handleScheduleCampaign = async (values) => {
    try {
      const scheduledAt = values.scheduled_at.toISOString();
      await api.post(`/campaigns/${selectedCampaign.id}/schedule`, { scheduled_at: scheduledAt });
      message.success('Campaign scheduled successfully!');
      setScheduleModalVisible(false);
      fetchCampaigns();
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to schedule campaign');
    }
  };

  const handleCancelSchedule = async (id) => {
    try {
      await api.post(`/campaigns/${id}/cancel`);
      message.success('Campaign schedule cancelled');
      fetchCampaigns();
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to cancel schedule');
    }
  };

  const showTestEmailModal = (campaign) => {
    setSelectedCampaign(campaign);
    setTestEmailModal(true);
  };

  const handleSendTestEmail = async (values) => {
    try {
      await api.post(`/campaigns/${selectedCampaign.id}/test`, {
        test_email: values.test_email
      });
      message.success('Test email sent successfully');
      setTestEmailModal(false);
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to send test email');
    }
  };

  const showStatsModal = async (campaign) => {
    try {
      setSelectedCampaign(campaign);
      setStatsModal(true);
      setEventsLoading(true);

      // Fetch campaign stats
      const statsResponse = await api.get(`/campaigns/${campaign.id}/stats`);
      setCampaignStats(statsResponse.data);

      // Fetch tracking events
      const eventsResponse = await api.get(`/campaigns/${campaign.id}/events?limit=50`);
      setCampaignEvents(eventsResponse.data.events || []);

      // Fetch link statistics
      const linksResponse = await api.get(`/campaigns/${campaign.id}/links`);
      setCampaignLinks(linksResponse.data.links || []);

      setEventsLoading(false);
    } catch (error) {
      message.error('Failed to fetch campaign statistics');
      setEventsLoading(false);
    }
  };

  const getStatusTag = (status) => {
    const statusConfig = {
      draft: { color: 'default', text: 'Draft' },
      scheduled: { color: 'blue', text: 'Scheduled' },
      sending: { color: 'processing', text: 'Sending' },
      sent: { color: 'success', text: 'Sent' },
      paused: { color: 'warning', text: 'Paused' }
    };

    const config = statusConfig[status] || statusConfig.draft;
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Space direction="vertical" size="small">
          <Text strong>{text}</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {record.template_name} → {record.list_name}
          </Text>
        </Space>
      )
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => getStatusTag(status)
    },
    {
      title: 'Progress',
      key: 'progress',
      render: (_, record) => {
        const total = record.total_messages || 0;
        const sent = record.sent_count || 0;
        const failed = record.failed_count || 0;
        const percentage = total > 0 ? ((sent / total) * 100).toFixed(1) : 0;

        return (
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Progress
              percent={parseFloat(percentage)}
              size="small"
              status={failed > 0 ? 'exception' : 'active'}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {sent}/{total} sent {failed > 0 && `(${failed} failed)`}
            </Text>
          </Space>
        );
      }
    },
    {
      title: 'From',
      key: 'from',
      render: (_, record) => (
        <Space direction="vertical" size="small">
          <Text>{record.from_name}</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {record.from_email}
          </Text>
        </Space>
      )
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => new Date(date).toLocaleDateString()
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          {record.status === 'draft' && (
            <>
              <Tooltip title="Edit Campaign">
                <Button
                  icon={<EditOutlined />}
                  size="small"
                  onClick={() => showModal(record)}
                />
              </Tooltip>
              <Tooltip title="Send Test Email">
                <Button
                  icon={<MailOutlined />}
                  size="small"
                  onClick={() => showTestEmailModal(record)}
                />
              </Tooltip>
              <Tooltip title="Schedule Campaign">
                <Button
                  icon={<CalendarOutlined />}
                  size="small"
                  onClick={() => showScheduleModal(record)}
                />
              </Tooltip>
              <Popconfirm
                title="Send this campaign now?"
                description="This will queue emails for all subscribers in the list."
                onConfirm={() => handleSendCampaign(record.id)}
                okText="Yes, Send"
                cancelText="Cancel"
              >
                <Tooltip title="Send Campaign">
                  <Button
                    icon={<SendOutlined />}
                    type="primary"
                    size="small"
                  />
                </Tooltip>
              </Popconfirm>
            </>
          )}
          {record.status === 'scheduled' && (
            <>
              <Tooltip title={`Scheduled for ${new Date(record.scheduled_at).toLocaleString()}`}>
                <Tag icon={<ClockCircleOutlined />} color="blue">
                  Scheduled
                </Tag>
              </Tooltip>
              <Popconfirm
                title="Cancel this schedule?"
                onConfirm={() => handleCancelSchedule(record.id)}
                okText="Yes"
                cancelText="No"
              >
                <Tooltip title="Cancel Schedule">
                  <Button
                    icon={<StopOutlined />}
                    danger
                    size="small"
                  />
                </Tooltip>
              </Popconfirm>
            </>
          )}
          {(record.status === 'sending' || record.status === 'sent') && (
            <Tooltip title="View Statistics">
              <Button
                icon={<EyeOutlined />}
                size="small"
                onClick={() => showStatsModal(record)}
              />
            </Tooltip>
          )}
          {record.status === 'draft' && (
            <Popconfirm
              title="Delete this campaign?"
              onConfirm={() => handleDelete(record.id)}
              okText="Yes"
              cancelText="No"
            >
              <Tooltip title="Delete Campaign">
                <Button
                  icon={<DeleteOutlined />}
                  danger
                  size="small"
                />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      )
    }
  ];

  const wizardSteps = [
    {
      title: 'Campaign Details',
      content: (
        <Form.Item
          name="name"
          label="Campaign Name"
          rules={[{ required: true, message: 'Please enter campaign name' }]}
        >
          <Input placeholder="e.g., November Newsletter" />
        </Form.Item>
      )
    },
    {
      title: 'Select Template',
      content: (
        <Form.Item
          name="template_id"
          label="Email Template"
          rules={[{ required: true, message: 'Please select a template' }]}
        >
          <Select
            placeholder="Select a template"
            showSearch
            optionFilterProp="children"
          >
            {templates.map((template) => (
              <Option key={template.id} value={template.id}>
                {template.name}
              </Option>
            ))}
          </Select>
        </Form.Item>
      )
    },
    {
      title: 'Select List',
      content: (
        <Form.Item
          name="list_id"
          label="Recipient List"
          rules={[{ required: true, message: 'Please select a list' }]}
        >
          <Select
            placeholder="Select a list"
            showSearch
            optionFilterProp="children"
          >
            {lists.map((list) => (
              <Option key={list.id} value={list.id}>
                {list.name} ({list.subscriber_count || 0} subscribers)
              </Option>
            ))}
          </Select>
        </Form.Item>
      )
    },
    {
      title: 'Sender Info',
      content: (
        <>
          <Form.Item
            name="from_name"
            label="From Name"
            rules={[{ required: true, message: 'Please enter from name' }]}
          >
            <Input placeholder="e.g., Mynd Solution" />
          </Form.Item>
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
            name="reply_to"
            label="Reply-To Email"
            rules={[{ type: 'email', message: 'Please enter a valid email' }]}
          >
            <Input placeholder="Optional (defaults to from email)" />
          </Form.Item>
        </>
      )
    }
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={2}>Campaigns</Title>
        </Col>
        <Col>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => showModal()}
          >
            Create Campaign
          </Button>
        </Col>
      </Row>

      <Table
        columns={columns}
        dataSource={campaigns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />

      {/* Create/Edit Campaign Modal */}
      <Modal
        title={editingCampaign ? 'Edit Campaign' : 'Create New Campaign'}
        open={isModalVisible}
        onCancel={handleCancel}
        width={700}
        footer={[
          <Button key="cancel" onClick={handleCancel}>
            Cancel
          </Button>,
          currentStep > 0 && (
            <Button key="prev" onClick={handlePrev}>
              Previous
            </Button>
          ),
          currentStep < wizardSteps.length - 1 && (
            <Button key="next" type="primary" onClick={handleNext}>
              Next
            </Button>
          ),
          currentStep === wizardSteps.length - 1 && (
            <Button key="submit" type="primary" onClick={handleSubmit}>
              {editingCampaign ? 'Update Campaign' : 'Create Campaign'}
            </Button>
          )
        ]}
      >
        <Steps current={currentStep} style={{ marginBottom: 24 }}>
          {wizardSteps.map((step) => (
            <Step key={step.title} title={step.title} />
          ))}
        </Steps>

        <Form form={form} layout="vertical">
          {wizardSteps[currentStep].content}
        </Form>
      </Modal>

      {/* Test Email Modal */}
      <Modal
        title="Send Test Email"
        open={testEmailModal}
        onCancel={() => setTestEmailModal(false)}
        footer={null}
      >
        <Form onFinish={handleSendTestEmail}>
          <Form.Item
            name="test_email"
            label="Test Email Address"
            rules={[
              { required: true, message: 'Please enter test email' },
              { type: 'email', message: 'Please enter a valid email' }
            ]}
          >
            <Input placeholder="your@email.com" />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SendOutlined />}>
                Send Test
              </Button>
              <Button onClick={() => setTestEmailModal(false)}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Statistics Modal with Tracking */}
      <Modal
        title={`Campaign Statistics - ${selectedCampaign?.name}`}
        open={statsModal}
        onCancel={() => setStatsModal(false)}
        footer={[
          <Button key="close" onClick={() => setStatsModal(false)}>
            Close
          </Button>
        ]}
        width={900}
      >
        {campaignStats && (
          <Tabs defaultActiveKey="1">
            <Tabs.TabPane tab="Overview" key="1">
              <Title level={5}>Delivery Statistics</Title>
              <Row gutter={[16, 16]}>
                <Col span={8}>
                  <Card>
                    <Statistic
                      title="Total Messages"
                      value={campaignStats.stats.total}
                      prefix={<MailOutlined />}
                    />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card>
                    <Statistic
                      title="Sent"
                      value={campaignStats.stats.sent}
                      valueStyle={{ color: '#3f8600' }}
                      prefix={<CheckCircleOutlined />}
                      suffix={`/ ${campaignStats.stats.sentPercentage}%`}
                    />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card>
                    <Statistic
                      title="Pending"
                      value={campaignStats.stats.pending}
                      valueStyle={{ color: '#faad14' }}
                      prefix={<ClockCircleOutlined />}
                    />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card>
                    <Statistic
                      title="Delivered"
                      value={campaignStats.stats.delivered}
                      valueStyle={{ color: '#52c41a' }}
                      suffix={`/ ${campaignStats.stats.deliveredPercentage}%`}
                    />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card>
                    <Statistic
                      title="Failed"
                      value={campaignStats.stats.failed}
                      valueStyle={{ color: '#cf1322' }}
                      prefix={<ExclamationCircleOutlined />}
                      suffix={`/ ${campaignStats.stats.failedPercentage}%`}
                    />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card>
                    <Statistic
                      title="Bounced"
                      value={campaignStats.stats.bounced}
                      valueStyle={{ color: '#d48806' }}
                      suffix={`/ ${campaignStats.stats.bouncedPercentage}%`}
                    />
                  </Card>
                </Col>
              </Row>

              <Divider />

              <Title level={5}>Engagement Metrics</Title>
              <Row gutter={[16, 16]}>
                <Col span={8}>
                  <Card>
                    <Statistic
                      title="Opens"
                      value={campaignEvents.filter(e => e.event_type === 'opened').length}
                      prefix={<EyeOutlined />}
                      valueStyle={{ color: '#1890ff' }}
                      suffix={campaignStats.stats.delivered > 0 ?
                        `/ ${((campaignEvents.filter(e => e.event_type === 'opened').length / campaignStats.stats.delivered) * 100).toFixed(1)}%` : ''
                      }
                    />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card>
                    <Statistic
                      title="Clicks"
                      value={campaignEvents.filter(e => e.event_type === 'clicked').length}
                      prefix={<LinkOutlined />}
                      valueStyle={{ color: '#722ed1' }}
                      suffix={campaignStats.stats.delivered > 0 ?
                        `/ ${((campaignEvents.filter(e => e.event_type === 'clicked').length / campaignStats.stats.delivered) * 100).toFixed(1)}%` : ''
                      }
                    />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card>
                    <Statistic
                      title="Unsubscribes"
                      value={campaignEvents.filter(e => e.event_type === 'unsubscribed').length}
                      prefix={<StopOutlined />}
                      valueStyle={{ color: '#fa8c16' }}
                      suffix={campaignStats.stats.delivered > 0 ?
                        `/ ${((campaignEvents.filter(e => e.event_type === 'unsubscribed').length / campaignStats.stats.delivered) * 100).toFixed(1)}%` : ''
                      }
                    />
                  </Card>
                </Col>
              </Row>
            </Tabs.TabPane>

            <Tabs.TabPane tab="Events" key="2">
              <Table
                dataSource={campaignEvents}
                rowKey="id"
                loading={eventsLoading}
                size="small"
                pagination={{ pageSize: 10 }}
                columns={[
                  {
                    title: 'Event',
                    dataIndex: 'event_type',
                    key: 'event_type',
                    render: (type) => {
                      const config = {
                        opened: { color: 'blue', text: 'Opened' },
                        clicked: { color: 'purple', text: 'Clicked' },
                        unsubscribed: { color: 'orange', text: 'Unsubscribed' }
                      };
                      const { color, text } = config[type] || { color: 'default', text: type };
                      return <Tag color={color}>{text}</Tag>;
                    }
                  },
                  {
                    title: 'Recipient',
                    key: 'recipient',
                    render: (_, record) => (
                      <Space direction="vertical" size="small">
                        <Text>{record.first_name} {record.last_name}</Text>
                        <Text type="secondary" style={{ fontSize: '12px' }}>{record.email}</Text>
                      </Space>
                    )
                  },
                  {
                    title: 'Time',
                    dataIndex: 'created_at',
                    key: 'created_at',
                    render: (date) => new Date(date).toLocaleString()
                  },
                  {
                    title: 'Details',
                    key: 'details',
                    render: (_, record) => {
                      try {
                        const data = JSON.parse(record.event_data || '{}');
                        if (record.event_type === 'clicked' && data.original_url) {
                          return <Text style={{ fontSize: '12px' }}>{data.original_url}</Text>;
                        }
                      } catch (e) {
                        // Ignore parse errors
                      }
                      return '-';
                    }
                  }
                ]}
              />
            </Tabs.TabPane>

            <Tabs.TabPane tab="Link Performance" key="3">
              <Table
                dataSource={campaignLinks}
                rowKey="id"
                loading={eventsLoading}
                size="small"
                pagination={{ pageSize: 10 }}
                columns={[
                  {
                    title: 'URL',
                    dataIndex: 'original_url',
                    key: 'original_url',
                    ellipsis: true,
                    render: (url) => (
                      <Tooltip title={url}>
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          {url}
                        </a>
                      </Tooltip>
                    )
                  },
                  {
                    title: 'Total Clicks',
                    dataIndex: 'total_clicks',
                    key: 'total_clicks',
                    sorter: (a, b) => (a.total_clicks || 0) - (b.total_clicks || 0),
                    defaultSortOrder: 'descend'
                  },
                  {
                    title: 'Unique Clicks',
                    dataIndex: 'unique_clicks',
                    key: 'unique_clicks',
                    sorter: (a, b) => (a.unique_clicks || 0) - (b.unique_clicks || 0)
                  }
                ]}
              />
            </Tabs.TabPane>
          </Tabs>
        )}
      </Modal>

      {/* Schedule Campaign Modal */}
      <Modal
        title={`Schedule Campaign - ${selectedCampaign?.name}`}
        open={scheduleModalVisible}
        onCancel={() => setScheduleModalVisible(false)}
        footer={null}
        width={500}
      >
        <Form
          form={scheduleForm}
          onFinish={handleScheduleCampaign}
          layout="vertical"
        >
          <Form.Item
            name="scheduled_at"
            label="Schedule Date and Time"
            rules={[
              { required: true, message: 'Please select a date and time' },
              {
                validator: (_, value) => {
                  if (!value || value.isAfter(dayjs())) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('Please select a future date and time'));
                }
              }
            ]}
          >
            <DatePicker
              showTime
              format="YYYY-MM-DD HH:mm"
              placeholder="Select date and time"
              style={{ width: '100%' }}
              disabledDate={(current) => current && current < dayjs().startOf('day')}
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<CalendarOutlined />}>
                Schedule Campaign
              </Button>
              <Button onClick={() => setScheduleModalVisible(false)}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Campaigns;
