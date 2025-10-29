import React from 'react';
import { Card, Empty, Spin } from 'antd';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

/**
 * CampaignComparison Component
 * Compares metrics across multiple campaigns
 */
const CampaignComparison = ({ campaigns, loading = false }) => {
  if (loading) {
    return (
      <Card title="Campaign Comparison">
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  if (!campaigns || campaigns.length === 0) {
    return (
      <Card title="Campaign Comparison">
        <Empty description="No campaigns to compare" />
      </Card>
    );
  }

  // Format data for chart
  const chartData = campaigns.map(campaign => ({
    name: campaign.name.length > 20
      ? campaign.name.substring(0, 20) + '...'
      : campaign.name,
    'Open Rate': campaign.openRate || 0,
    'Click Rate': campaign.clickRate || 0,
    'Bounce Rate': campaign.bounceRate || 0
  }));

  return (
    <Card title="Campaign Comparison">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="name"
            angle={-45}
            textAnchor="end"
            height={100}
          />
          <YAxis label={{ value: 'Rate (%)', angle: -90, position: 'insideLeft' }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="Open Rate" fill="#722ed1" />
          <Bar dataKey="Click Rate" fill="#13c2c2" />
          <Bar dataKey="Bounce Rate" fill="#fa8c16" />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
};

export default CampaignComparison;
