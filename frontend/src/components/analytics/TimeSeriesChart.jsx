import React from 'react';
import { Card, Empty, Spin } from 'antd';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import dayjs from 'dayjs';

/**
 * TimeSeriesChart Component
 * Displays opens and clicks over time
 */
const TimeSeriesChart = ({ data, loading = false, interval = 'hour' }) => {
  if (loading) {
    return (
      <Card title="Opens & Clicks Over Time">
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card title="Opens & Clicks Over Time">
        <Empty description="No data available yet" />
      </Card>
    );
  }

  // Format data for chart
  const chartData = data.map(item => ({
    ...item,
    time: interval === 'hour'
      ? dayjs(item.timestamp).format('MMM D, HH:mm')
      : dayjs(item.timestamp).format('MMM D')
  }));

  return (
    <Card title="Opens & Clicks Over Time">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="time"
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="opens"
            stroke="#722ed1"
            strokeWidth={2}
            name="Opens"
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="clicks"
            stroke="#13c2c2"
            strokeWidth={2}
            name="Clicks"
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
};

export default TimeSeriesChart;
