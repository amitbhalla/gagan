import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Button, Result, Spin, Alert } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import api from '../utils/api';

const Unsubscribe = () => {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [unsubscribed, setUnsubscribed] = useState(false);
  const [error, setError] = useState(null);
  const [contactInfo, setContactInfo] = useState(null);

  const token = searchParams.get('token');
  const errorParam = searchParams.get('error');

  useEffect(() => {
    if (errorParam) {
      setError(errorParam);
    }
  }, [errorParam]);

  const handleUnsubscribe = async () => {
    if (!token) {
      setError('Invalid unsubscribe link');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.post('/unsubscribe/confirm', { token });

      if (response.data.success) {
        setUnsubscribed(true);
        setContactInfo(response.data.data);
      } else {
        setError(response.data.message || 'Failed to unsubscribe');
      }
    } catch (err) {
      console.error('Unsubscribe error:', err);
      setError(
        err.response?.data?.message ||
        'An error occurred while processing your request. The link may be invalid or expired.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (!token && !errorParam) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f0f2f5',
        padding: '20px'
      }}>
        <Card style={{ maxWidth: 600, width: '100%' }}>
          <Result
            status="error"
            title="Invalid Unsubscribe Link"
            subTitle="The unsubscribe link you followed appears to be invalid or incomplete."
          />
        </Card>
      </div>
    );
  }

  if (unsubscribed) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f0f2f5',
        padding: '20px'
      }}>
        <Card style={{ maxWidth: 600, width: '100%' }}>
          <Result
            icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
            status="success"
            title="Successfully Unsubscribed"
            subTitle={
              <>
                <p>You have been successfully unsubscribed from our mailing list.</p>
                {contactInfo?.email && (
                  <p style={{ marginTop: 16, color: '#666' }}>
                    Email: <strong>{contactInfo.email}</strong>
                  </p>
                )}
                {contactInfo?.list_name && (
                  <p style={{ color: '#666' }}>
                    List: <strong>{contactInfo.list_name}</strong>
                  </p>
                )}
                <p style={{ marginTop: 16, fontSize: '14px', color: '#999' }}>
                  You will no longer receive emails from this list.
                  We're sorry to see you go!
                </p>
              </>
            }
          />
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f0f2f5',
        padding: '20px'
      }}>
        <Card style={{ maxWidth: 600, width: '100%' }}>
          <Result
            icon={<CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
            status="error"
            title="Unsubscribe Failed"
            subTitle={error}
          />
        </Card>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f0f2f5',
      padding: '20px'
    }}>
      <Card
        style={{ maxWidth: 600, width: '100%' }}
        title={
          <div style={{ textAlign: 'center', fontSize: '24px', fontWeight: 'bold' }}>
            Unsubscribe from Mailing List
          </div>
        }
      >
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          {loading ? (
            <>
              <Spin size="large" />
              <p style={{ marginTop: 20, color: '#666' }}>
                Processing your request...
              </p>
            </>
          ) : (
            <>
              <p style={{ fontSize: '16px', color: '#666', marginBottom: 30 }}>
                Are you sure you want to unsubscribe from our mailing list?
              </p>

              <Alert
                message="What happens when you unsubscribe?"
                description="You will no longer receive marketing emails from this list. You can always resubscribe in the future if you change your mind."
                type="info"
                showIcon
                style={{ marginBottom: 30, textAlign: 'left' }}
              />

              <Button
                type="primary"
                danger
                size="large"
                onClick={handleUnsubscribe}
                style={{ minWidth: 200 }}
              >
                Yes, Unsubscribe Me
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
};

export default Unsubscribe;
