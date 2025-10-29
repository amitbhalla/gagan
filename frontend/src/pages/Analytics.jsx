import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Select,
  Button,
  Tabs,
  Table,
  Space,
  Typography,
  message,
  Spin,
  Empty,
  Tag
} from 'antd';
import { ReloadOutlined, LinkOutlined } from '@ant-design/icons';
import api from '../utils/api';
import MetricsCards from '../components/analytics/MetricsCards';
import TimeSeriesChart from '../components/analytics/TimeSeriesChart';
import CampaignComparison from '../components/analytics/CampaignComparison';
import DeviceBreakdown from '../components/analytics/DeviceBreakdown';
import ExportButton from '../components/analytics/ExportButton';

const { Title } = Typography;
const { Option } = Select;

/**
 * Analytics Page
 * Comprehensive analytics dashboard for campaign performance
 */
const Analytics = () => {
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [campaignAnalytics, setCampaignAnalytics] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [topLinks, setTopLinks] = useState([]);
  const [deviceData, setDeviceData] = useState(null);
  const [comparisonCampaigns, setComparisonCampaigns] = useState([]);
  const [selectedForComparison, setSelectedForComparison] = useState([]);
  const [timelineInterval, setTimelineInterval] = useState('hour');
  const [loading, setLoading] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Fetch all campaigns on mount
  useEffect(() => {
    fetchCampaigns();
  }, []);

  // Fetch campaign analytics when selection changes
  useEffect(() => {
    if (selectedCampaign) {
      fetchCampaignAnalytics();
      fetchTimeline();
      fetchTopLinks();
      fetchDeviceBreakdown();
    }
  }, [selectedCampaign]);

  // Fetch timeline when interval changes
  useEffect(() => {
    if (selectedCampaign) {
      fetchTimeline();
    }
  }, [timelineInterval]);

  const fetchCampaigns = async () => {
    try {
      const response = await api.get('/campaigns');
      const sentCampaigns = response.data.campaigns.filter(
        c => c.status === 'sent' || c.status === 'sending'
      );
      setCampaigns(sentCampaigns);

      // Auto-select first campaign
      if (sentCampaigns.length > 0 && !selectedCampaign) {
        setSelectedCampaign(sentCampaigns[0].id);
      }
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      message.error('Failed to load campaigns');
    }
  };

  const fetchCampaignAnalytics = async () => {
    if (!selectedCampaign) return;

    setLoading(true);
    try {
      const response = await api.get(`/analytics/campaigns/${selectedCampaign}`);
      setCampaignAnalytics(response.data);
    } catch (error) {
      console.error('Error fetching analytics:', error);
      message.error('Failed to load campaign analytics');
    } finally {
      setLoading(false);
    }
  };

  const fetchTimeline = async () => {
    if (!selectedCampaign) return;

    setTimelineLoading(true);
    try {
      const response = await api.get(
        `/analytics/campaigns/${selectedCampaign}/timeline?interval=${timelineInterval}`
      );
      setTimeline(response.data.data);
    } catch (error) {
      console.error('Error fetching timeline:', error);
      message.error('Failed to load timeline data');
    } finally {
      setTimelineLoading(false);
    }
  };

  const fetchTopLinks = async () => {
    if (!selectedCampaign) return;

    try {
      const response = await api.get(
        `/analytics/campaigns/${selectedCampaign}/top-links?limit=10`
      );
      setTopLinks(response.data.links);
    } catch (error) {
      console.error('Error fetching top links:', error);
    }
  };

  const fetchDeviceBreakdown = async () => {
    if (!selectedCampaign) return;

    try {
      const response = await api.get(`/analytics/campaigns/${selectedCampaign}/devices`);
      setDeviceData({
        devices: response.data.devices,
        browsers: response.data.browsers,
        operatingSystems: response.data.operatingSystems
      });
    } catch (error) {
      console.error('Error fetching device data:', error);
    }
  };

  const handleCompare = async () => {
    if (selectedForComparison.length < 2) {
      message.warning('Please select at least 2 campaigns to compare');
      return;
    }

    try {
      const ids = selectedForComparison.join(',');
      const response = await api.get(`/analytics/campaigns/compare?ids=${ids}`);
      setComparisonCampaigns(response.data.campaigns);
    } catch (error) {
      console.error('Error comparing campaigns:', error);
      message.error('Failed to compare campaigns');
    }
  };

  const handleRefresh = () => {
    fetchCampaignAnalytics();
    fetchTimeline();
    fetchTopLinks();
    fetchDeviceBreakdown();
  };

  // Link performance table columns
  const linkColumns = [
    {
      title: 'URL',
      dataIndex: 'url',
      key: 'url',
      render: (url) => (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <LinkOutlined /> {url.length > 50 ? url.substring(0, 50) + '...' : url}
        </a>
      )
    },
    {
      title: 'Total Clicks',
      dataIndex: 'totalClicks',
      key: 'totalClicks',
      sorter: (a, b) => b.totalClicks - a.totalClicks,
      defaultSortOrder: 'descend'
    },
    {
      title: 'Unique Clicks',
      dataIndex: 'uniqueClicks',
      key: 'uniqueClicks',
      sorter: (a, b) => b.uniqueClicks - a.uniqueClicks
    },
    {
      title: 'Click Rate',
      key: 'rate',
      render: (_, record) => {
        const rate = record.totalClicks > 0
          ? ((record.uniqueClicks / record.totalClicks) * 100).toFixed(1)
          : 0;
        return `${rate}% unique`;
      }
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={2}>Campaign Analytics</Title>
        <Space>
          {selectedCampaign && (
            <ExportButton campaignId={selectedCampaign} type="campaign" />
          )}
          <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
            Refresh
          </Button>
        </Space>
      </div>

      {/* Campaign Selector */}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Select
              style={{ width: '100%' }}
              placeholder="Select a campaign to analyze"
              value={selectedCampaign}
              onChange={setSelectedCampaign}
              loading={!campaigns.length}
            >
              {campaigns.map(campaign => (
                <Option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                  <Tag color={campaign.status === 'sent' ? 'green' : 'blue'} style={{ marginLeft: 8 }}>
                    {campaign.status}
                  </Tag>
                </Option>
              ))}
            </Select>
          </Col>
        </Row>
      </Card>

      {selectedCampaign ? (
        <Tabs
          defaultActiveKey="overview"
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <Space direction="vertical" style={{ width: '100%' }} size="large">
                  {/* Metrics Cards */}
                  <MetricsCards metrics={campaignAnalytics} loading={loading} />

                  {/* Timeline Chart */}
                  <Card
                    title="Engagement Timeline"
                    extra={
                      <Select
                        value={timelineInterval}
                        onChange={setTimelineInterval}
                        style={{ width: 120 }}
                      >
                        <Option value="hour">Hourly</Option>
                        <Option value="day">Daily</Option>
                      </Select>
                    }
                  >
                    <TimeSeriesChart
                      data={timeline}
                      loading={timelineLoading}
                      interval={timelineInterval}
                    />
                  </Card>

                  {/* Device Breakdown */}
                  <DeviceBreakdown data={deviceData} loading={loading} />
                </Space>
              )
            },
            {
              key: 'links',
              label: 'Link Performance',
              children: (
                <Card title="Top Clicked Links">
                  {topLinks.length > 0 ? (
                    <Table
                      columns={linkColumns}
                      dataSource={topLinks}
                      rowKey="shortCode"
                      pagination={{ pageSize: 10 }}
                    />
                  ) : (
                    <Empty description="No link clicks yet" />
                  )}
                </Card>
              )
            },
            {
              key: 'comparison',
              label: 'Campaign Comparison',
              children: (
                <Space direction="vertical" style={{ width: '100%' }} size="large">
                  <Card>
                    <Row gutter={16}>
                      <Col flex="auto">
                        <Select
                          mode="multiple"
                          style={{ width: '100%' }}
                          placeholder="Select campaigns to compare"
                          value={selectedForComparison}
                          onChange={setSelectedForComparison}
                          maxTagCount={5}
                        >
                          {campaigns.map(campaign => (
                            <Option key={campaign.id} value={campaign.id}>
                              {campaign.name}
                            </Option>
                          ))}
                        </Select>
                      </Col>
                      <Col>
                        <Button
                          type="primary"
                          onClick={handleCompare}
                          disabled={selectedForComparison.length < 2}
                        >
                          Compare
                        </Button>
                      </Col>
                    </Row>
                  </Card>

                  {comparisonCampaigns.length > 0 && (
                    <CampaignComparison campaigns={comparisonCampaigns} />
                  )}
                </Space>
              )
            }
          ]}
        />
      ) : (
        <Card>
          <Empty description="Please select a campaign to view analytics" />
        </Card>
      )}
    </div>
  );
};

export default Analytics;
