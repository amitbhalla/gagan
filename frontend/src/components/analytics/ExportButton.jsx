import React, { useState } from 'react';
import { Button, message, Dropdown } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import api from '../../utils/api';

/**
 * ExportButton Component
 * Provides export functionality for analytics data
 */
const ExportButton = ({ campaignId, type = 'analytics' }) => {
  const [loading, setLoading] = useState(false);

  const handleExport = async (exportType) => {
    setLoading(true);
    try {
      let endpoint = '';
      let filename = '';

      switch (exportType) {
        case 'analytics':
          endpoint = `/analytics/campaigns/${campaignId}/export`;
          filename = `campaign-${campaignId}-analytics.csv`;
          break;
        case 'events':
          endpoint = `/analytics/campaigns/${campaignId}/export-events`;
          filename = `campaign-${campaignId}-events.csv`;
          break;
        case 'engagement':
          endpoint = '/analytics/contacts/engagement/export';
          filename = 'contact-engagement.csv';
          break;
        default:
          throw new Error('Invalid export type');
      }

      const response = await api.get(endpoint, {
        responseType: 'blob'
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      message.success('Export completed successfully');
    } catch (error) {
      console.error('Export error:', error);
      message.error('Failed to export data');
    } finally {
      setLoading(false);
    }
  };

  // Menu items for dropdown
  const menuItems = type === 'campaign' ? [
    {
      key: 'analytics',
      label: 'Export Analytics Report',
      onClick: () => handleExport('analytics')
    },
    {
      key: 'events',
      label: 'Export Event Details',
      onClick: () => handleExport('events')
    }
  ] : [
    {
      key: 'engagement',
      label: 'Export Engagement Scores',
      onClick: () => handleExport('engagement')
    }
  ];

  if (type === 'simple') {
    return (
      <Button
        icon={<DownloadOutlined />}
        onClick={() => handleExport('analytics')}
        loading={loading}
      >
        Export CSV
      </Button>
    );
  }

  return (
    <Dropdown menu={{ items: menuItems }} placement="bottomRight">
      <Button icon={<DownloadOutlined />} loading={loading}>
        Export
      </Button>
    </Dropdown>
  );
};

export default ExportButton;
