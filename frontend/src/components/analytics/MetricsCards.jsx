import React from 'react';
import { Card, Row, Col, Statistic } from 'antd';
import {
  MailOutlined,
  CheckCircleOutlined,
  EyeOutlined,
  LinkOutlined,
  StopOutlined,
  CloseCircleOutlined
} from '@ant-design/icons';

/**
 * MetricsCards Component
 * Displays key campaign metrics in card format
 */
const MetricsCards = ({ metrics, loading = false }) => {
  const cards = [
    {
      title: 'Total Recipients',
      value: metrics?.total || 0,
      icon: <MailOutlined style={{ fontSize: 24, color: '#1890ff' }} />,
      color: '#1890ff'
    },
    {
      title: 'Delivered',
      value: metrics?.delivered || 0,
      suffix: metrics?.total > 0 ? `(${((metrics?.delivered / metrics?.total) * 100).toFixed(1)}%)` : '',
      icon: <CheckCircleOutlined style={{ fontSize: 24, color: '#52c41a' }} />,
      color: '#52c41a'
    },
    {
      title: 'Unique Opens',
      value: metrics?.uniqueOpens || 0,
      suffix: `${metrics?.openRate || 0}%`,
      icon: <EyeOutlined style={{ fontSize: 24, color: '#722ed1' }} />,
      color: '#722ed1'
    },
    {
      title: 'Unique Clicks',
      value: metrics?.uniqueClicks || 0,
      suffix: `${metrics?.clickRate || 0}%`,
      icon: <LinkOutlined style={{ fontSize: 24, color: '#13c2c2' }} />,
      color: '#13c2c2'
    },
    {
      title: 'Bounced',
      value: metrics?.bounced || 0,
      suffix: `${metrics?.bounceRate || 0}%`,
      icon: <StopOutlined style={{ fontSize: 24, color: '#fa8c16' }} />,
      color: '#fa8c16'
    },
    {
      title: 'Failed',
      value: metrics?.failed || 0,
      icon: <CloseCircleOutlined style={{ fontSize: 24, color: '#f5222d' }} />,
      color: '#f5222d'
    }
  ];

  return (
    <Row gutter={[16, 16]}>
      {cards.map((card, index) => (
        <Col xs={24} sm={12} lg={8} key={index}>
          <Card loading={loading}>
            <Statistic
              title={card.title}
              value={card.value}
              suffix={card.suffix}
              prefix={card.icon}
              valueStyle={{ color: card.color }}
            />
          </Card>
        </Col>
      ))}
    </Row>
  );
};

export default MetricsCards;
