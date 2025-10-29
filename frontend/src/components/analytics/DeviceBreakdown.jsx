import React from 'react';
import { Card, Row, Col, Empty, Spin, Table } from 'antd';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip
} from 'recharts';

/**
 * DeviceBreakdown Component
 * Shows device, browser, and OS statistics
 */
const DeviceBreakdown = ({ data, loading = false }) => {
  if (loading) {
    return (
      <Card title="Device & Browser Statistics">
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card title="Device & Browser Statistics">
        <Empty description="No device data available" />
      </Card>
    );
  }

  const COLORS = ['#1890ff', '#52c41a', '#fa8c16', '#f5222d'];

  // Format device data for pie chart
  const deviceData = data.devices
    ? Object.entries(data.devices)
        .filter(([key, value]) => value > 0)
        .map(([name, value]) => ({ name, value }))
    : [];

  // Browser columns
  const browserColumns = [
    {
      title: 'Browser',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: 'Count',
      dataIndex: 'count',
      key: 'count',
      sorter: (a, b) => b.count - a.count
    },
    {
      title: 'Percentage',
      dataIndex: 'percentage',
      key: 'percentage',
      render: (value) => `${value}%`
    }
  ];

  // OS columns
  const osColumns = [
    {
      title: 'Operating System',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: 'Count',
      dataIndex: 'count',
      key: 'count',
      sorter: (a, b) => b.count - a.count
    },
    {
      title: 'Percentage',
      dataIndex: 'percentage',
      key: 'percentage',
      render: (value) => `${value}%`
    }
  ];

  return (
    <Card title="Device & Browser Statistics">
      <Row gutter={[16, 16]}>
        {/* Device Pie Chart */}
        <Col xs={24} md={12}>
          <h4>Devices</h4>
          {deviceData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={deviceData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {deviceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${value}%`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <Empty description="No device data" />
          )}
        </Col>

        {/* Browser & OS Tables */}
        <Col xs={24} md={12}>
          <h4>Top Browsers</h4>
          {data.browsers && data.browsers.length > 0 ? (
            <Table
              columns={browserColumns}
              dataSource={data.browsers}
              rowKey="name"
              pagination={false}
              size="small"
              style={{ marginBottom: 16 }}
            />
          ) : (
            <Empty description="No browser data" />
          )}

          <h4 style={{ marginTop: 16 }}>Top Operating Systems</h4>
          {data.operatingSystems && data.operatingSystems.length > 0 ? (
            <Table
              columns={osColumns}
              dataSource={data.operatingSystems}
              rowKey="name"
              pagination={false}
              size="small"
            />
          ) : (
            <Empty description="No OS data" />
          )}
        </Col>
      </Row>
    </Card>
  );
};

export default DeviceBreakdown;
