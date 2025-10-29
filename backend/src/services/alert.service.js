/**
 * Alert Service
 *
 * Provides alerting and notification functionality for critical system events:
 * - Email alerts for critical errors
 * - System health monitoring
 * - Performance degradation detection
 * - Disk space monitoring
 * - Queue failure alerts
 * - SMTP failure alerts
 *
 * Phase 6: Production Optimization
 */

const nodemailer = require('nodemailer');
const logger = require('../config/logger');
const { db } = require('../config/database');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Alert configuration
 */
const config = {
  enabled: process.env.ALERTS_ENABLED === 'true',
  adminEmail: process.env.ADMIN_EMAIL || process.env.SMTP_FROM_EMAIL,
  smtpHost: process.env.SMTP_HOST,
  smtpPort: process.env.SMTP_PORT,
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpFrom: process.env.SMTP_FROM_EMAIL,
  alertCooldown: parseInt(process.env.ALERT_COOLDOWN_MINUTES) || 60, // minutes
  thresholds: {
    diskSpacePercent: 90,
    memoryPercent: 90,
    queueFailureRate: 20, // percent
    emailFailureRate: 15, // percent
    responseTimeMs: 5000
  }
};

/**
 * Alert cooldown tracker
 * Prevents sending duplicate alerts within cooldown period
 */
const alertHistory = new Map();

/**
 * Check if alert is in cooldown period
 */
const isInCooldown = (alertType) => {
  const lastAlert = alertHistory.get(alertType);
  if (!lastAlert) return false;

  const cooldownMs = config.alertCooldown * 60 * 1000;
  const timeSinceLastAlert = Date.now() - lastAlert;

  return timeSinceLastAlert < cooldownMs;
};

/**
 * Record alert sent
 */
const recordAlert = (alertType) => {
  alertHistory.set(alertType, Date.now());
};

/**
 * Create SMTP transporter for alerts
 */
const createTransporter = () => {
  if (!config.smtpHost) {
    logger.warn('SMTP not configured, alerts will be logged only');
    return null;
  }

  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: config.smtpFrom && config.smtpFrom.includes('@')
      ? undefined // IP-based auth
      : {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD
        }
  });
};

/**
 * Send alert email
 */
const sendAlertEmail = async (subject, htmlBody, textBody) => {
  if (!config.enabled) {
    logger.info('Alerts disabled, skipping email send');
    return false;
  }

  if (!config.adminEmail) {
    logger.warn('Admin email not configured, cannot send alert');
    return false;
  }

  try {
    const transporter = createTransporter();

    if (!transporter) {
      logger.warn('SMTP not configured, logging alert instead');
      logger.error('ALERT: ' + subject, { text: textBody });
      return false;
    }

    await transporter.sendMail({
      from: `"Email Marketing Alerts" <${config.smtpFrom}>`,
      to: config.adminEmail,
      subject: `[ALERT] ${subject}`,
      text: textBody,
      html: htmlBody,
      priority: 'high',
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high'
      }
    });

    logger.info('Alert email sent', { subject, to: config.adminEmail });
    return true;

  } catch (error) {
    logger.error('Failed to send alert email', {
      error: error.message,
      subject
    });
    return false;
  }
};

/**
 * Alert: Critical Error
 */
exports.alertCriticalError = async (error, context = {}) => {
  const alertType = 'critical_error';

  if (isInCooldown(alertType)) {
    logger.info('Critical error alert in cooldown, skipping');
    return;
  }

  const subject = 'Critical Error in Email Marketing System';
  const timestamp = new Date().toISOString();

  const textBody = `
Critical Error Detected

Time: ${timestamp}
Error: ${error.message}
Stack: ${error.stack}

Context:
${JSON.stringify(context, null, 2)}

Please investigate immediately.
  `.trim();

  const htmlBody = `
    <h2 style="color: #d32f2f;">🚨 Critical Error Detected</h2>
    <p><strong>Time:</strong> ${timestamp}</p>
    <p><strong>Error:</strong> ${error.message}</p>
    <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px;">${error.stack}</pre>
    <h3>Context:</h3>
    <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px;">${JSON.stringify(context, null, 2)}</pre>
    <p style="color: #d32f2f;"><strong>Please investigate immediately.</strong></p>
  `;

  logger.error('Critical error alert', { error: error.message, context });

  await sendAlertEmail(subject, htmlBody, textBody);
  recordAlert(alertType);
};

/**
 * Alert: High Queue Failure Rate
 */
exports.alertQueueFailure = async (stats) => {
  const alertType = 'queue_failure';

  if (isInCooldown(alertType)) {
    return;
  }

  const subject = 'High Email Queue Failure Rate';
  const timestamp = new Date().toISOString();

  const textBody = `
High Email Queue Failure Rate Detected

Time: ${timestamp}
Failure Rate: ${stats.failureRate}%
Failed Jobs: ${stats.failed}
Total Jobs (24h): ${stats.total}

Threshold: ${config.thresholds.queueFailureRate}%

Action Required:
1. Check SMTP configuration
2. Review failed job errors in database
3. Verify server connectivity

Dashboard: ${process.env.APP_URL}/admin/queue
  `.trim();

  const htmlBody = `
    <h2 style="color: #f57c00;">⚠️ High Email Queue Failure Rate</h2>
    <p><strong>Time:</strong> ${timestamp}</p>
    <table style="border-collapse: collapse; margin: 20px 0;">
      <tr><td style="padding: 8px;"><strong>Failure Rate:</strong></td><td style="padding: 8px; color: #d32f2f;">${stats.failureRate}%</td></tr>
      <tr><td style="padding: 8px;"><strong>Failed Jobs:</strong></td><td style="padding: 8px;">${stats.failed}</td></tr>
      <tr><td style="padding: 8px;"><strong>Total Jobs (24h):</strong></td><td style="padding: 8px;">${stats.total}</td></tr>
      <tr><td style="padding: 8px;"><strong>Threshold:</strong></td><td style="padding: 8px;">${config.thresholds.queueFailureRate}%</td></tr>
    </table>
    <h3>Action Required:</h3>
    <ol>
      <li>Check SMTP configuration</li>
      <li>Review failed job errors in database</li>
      <li>Verify server connectivity</li>
    </ol>
    <p><a href="${process.env.APP_URL}/admin/queue" style="color: #1976d2;">View Queue Dashboard</a></p>
  `;

  logger.warn('Queue failure alert', stats);

  await sendAlertEmail(subject, htmlBody, textBody);
  recordAlert(alertType);
};

/**
 * Alert: Disk Space Low
 */
exports.alertDiskSpace = async (stats) => {
  const alertType = 'disk_space';

  if (isInCooldown(alertType)) {
    return;
  }

  const subject = 'Low Disk Space Warning';
  const timestamp = new Date().toISOString();

  const textBody = `
Low Disk Space Warning

Time: ${timestamp}
Usage: ${stats.usagePercent}%
Free Space: ${stats.freeGB} GB
Total Space: ${stats.totalGB} GB

Threshold: ${config.thresholds.diskSpacePercent}%

Action Required:
1. Clean up old backups
2. Archive old campaign data
3. Run database VACUUM
4. Check for large log files

Server: ${os.hostname()}
  `.trim();

  const htmlBody = `
    <h2 style="color: #f57c00;">⚠️ Low Disk Space Warning</h2>
    <p><strong>Time:</strong> ${timestamp}</p>
    <table style="border-collapse: collapse; margin: 20px 0;">
      <tr><td style="padding: 8px;"><strong>Usage:</strong></td><td style="padding: 8px; color: #d32f2f;">${stats.usagePercent}%</td></tr>
      <tr><td style="padding: 8px;"><strong>Free Space:</strong></td><td style="padding: 8px;">${stats.freeGB} GB</td></tr>
      <tr><td style="padding: 8px;"><strong>Total Space:</strong></td><td style="padding: 8px;">${stats.totalGB} GB</td></tr>
      <tr><td style="padding: 8px;"><strong>Threshold:</strong></td><td style="padding: 8px;">${config.thresholds.diskSpacePercent}%</td></tr>
    </table>
    <h3>Action Required:</h3>
    <ol>
      <li>Clean up old backups</li>
      <li>Archive old campaign data</li>
      <li>Run database VACUUM</li>
      <li>Check for large log files</li>
    </ol>
    <p><strong>Server:</strong> ${os.hostname()}</p>
  `;

  logger.warn('Disk space alert', stats);

  await sendAlertEmail(subject, htmlBody, textBody);
  recordAlert(alertType);
};

/**
 * Alert: High Memory Usage
 */
exports.alertMemoryUsage = async (stats) => {
  const alertType = 'memory_usage';

  if (isInCooldown(alertType)) {
    return;
  }

  const subject = 'High Memory Usage Warning';
  const timestamp = new Date().toISOString();

  const textBody = `
High Memory Usage Warning

Time: ${timestamp}
Memory Usage: ${stats.usagePercent}%
Used Memory: ${stats.usedMB} MB
Total Memory: ${stats.totalMB} MB
Heap Used: ${stats.heapUsedMB} MB

Threshold: ${config.thresholds.memoryPercent}%

Action Required:
1. Review application for memory leaks
2. Check for long-running processes
3. Consider restarting the application
4. Monitor for continued high usage

Server: ${os.hostname()}
PID: ${process.pid}
  `.trim();

  const htmlBody = `
    <h2 style="color: #f57c00;">⚠️ High Memory Usage Warning</h2>
    <p><strong>Time:</strong> ${timestamp}</p>
    <table style="border-collapse: collapse; margin: 20px 0;">
      <tr><td style="padding: 8px;"><strong>Memory Usage:</strong></td><td style="padding: 8px; color: #d32f2f;">${stats.usagePercent}%</td></tr>
      <tr><td style="padding: 8px;"><strong>Used Memory:</strong></td><td style="padding: 8px;">${stats.usedMB} MB</td></tr>
      <tr><td style="padding: 8px;"><strong>Total Memory:</strong></td><td style="padding: 8px;">${stats.totalMB} MB</td></tr>
      <tr><td style="padding: 8px;"><strong>Heap Used:</strong></td><td style="padding: 8px;">${stats.heapUsedMB} MB</td></tr>
      <tr><td style="padding: 8px;"><strong>Threshold:</strong></td><td style="padding: 8px;">${config.thresholds.memoryPercent}%</td></tr>
    </table>
    <h3>Action Required:</h3>
    <ol>
      <li>Review application for memory leaks</li>
      <li>Check for long-running processes</li>
      <li>Consider restarting the application</li>
      <li>Monitor for continued high usage</li>
    </ol>
    <p><strong>Server:</strong> ${os.hostname()} (PID: ${process.pid})</p>
  `;

  logger.warn('Memory usage alert', stats);

  await sendAlertEmail(subject, htmlBody, textBody);
  recordAlert(alertType);
};

/**
 * Alert: SMTP Connection Failure
 */
exports.alertSmtpFailure = async (error) => {
  const alertType = 'smtp_failure';

  if (isInCooldown(alertType)) {
    return;
  }

  const subject = 'SMTP Connection Failure';
  const timestamp = new Date().toISOString();

  const textBody = `
SMTP Connection Failure

Time: ${timestamp}
Error: ${error.message}

SMTP Configuration:
Host: ${config.smtpHost}
Port: ${config.smtpPort}
Secure: ${config.smtpSecure}

Action Required:
1. Verify SMTP server is online
2. Check SMTP credentials
3. Verify IP whitelist (if using Gmail Relay)
4. Check firewall rules
5. Review SMTP logs

All email sending is currently affected.
  `.trim();

  const htmlBody = `
    <h2 style="color: #d32f2f;">🚨 SMTP Connection Failure</h2>
    <p><strong>Time:</strong> ${timestamp}</p>
    <p><strong>Error:</strong> ${error.message}</p>
    <h3>SMTP Configuration:</h3>
    <ul>
      <li><strong>Host:</strong> ${config.smtpHost}</li>
      <li><strong>Port:</strong> ${config.smtpPort}</li>
      <li><strong>Secure:</strong> ${config.smtpSecure}</li>
    </ul>
    <h3>Action Required:</h3>
    <ol>
      <li>Verify SMTP server is online</li>
      <li>Check SMTP credentials</li>
      <li>Verify IP whitelist (if using Gmail Relay)</li>
      <li>Check firewall rules</li>
      <li>Review SMTP logs</li>
    </ol>
    <p style="color: #d32f2f;"><strong>All email sending is currently affected.</strong></p>
  `;

  logger.error('SMTP failure alert', { error: error.message });

  await sendAlertEmail(subject, htmlBody, textBody);
  recordAlert(alertType);
};

/**
 * Monitor system health and send alerts
 * Call this periodically (e.g., every 5 minutes)
 */
exports.monitorSystemHealth = async () => {
  if (!config.enabled) {
    return;
  }

  try {
    // Check disk space
    const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/email-marketing.db');
    const dataDir = path.dirname(dbPath);

    // Note: This is a basic check. For production, use a library like 'check-disk-space'
    try {
      const stats = fs.statSync(dbPath);
      const fileSizeGB = stats.size / (1024 * 1024 * 1024);

      // Check if database is growing too large (>1GB warrants attention)
      if (fileSizeGB > 1) {
        logger.warn('Database size exceeds 1GB', { sizeGB: fileSizeGB.toFixed(2) });
      }
    } catch (error) {
      logger.error('Disk space check failed', { error: error.message });
    }

    // Check memory usage
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memoryPercent = (usedMem / totalMem) * 100;

    if (memoryPercent > config.thresholds.memoryPercent) {
      await exports.alertMemoryUsage({
        usagePercent: memoryPercent.toFixed(2),
        usedMB: (usedMem / 1024 / 1024).toFixed(2),
        totalMB: (totalMem / 1024 / 1024).toFixed(2),
        heapUsedMB: (memUsage.heapUsed / 1024 / 1024).toFixed(2)
      });
    }

    // Check queue failure rate
    const queueStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM job_queue
      WHERE created_at > datetime('now', '-24 hours')
    `).get();

    if (queueStats.total > 10) { // Only check if we have meaningful data
      const failureRate = (queueStats.failed / queueStats.total) * 100;

      if (failureRate > config.thresholds.queueFailureRate) {
        await exports.alertQueueFailure({
          failureRate: failureRate.toFixed(2),
          failed: queueStats.failed,
          total: queueStats.total
        });
      }
    }

    logger.debug('System health check completed');

  } catch (error) {
    logger.error('System health monitoring failed', { error: error.message });
  }
};

/**
 * Start periodic health monitoring
 * Runs every 5 minutes
 */
exports.startMonitoring = () => {
  if (!config.enabled) {
    logger.info('System monitoring disabled (ALERTS_ENABLED=false)');
    return;
  }

  logger.info('Starting system health monitoring', {
    interval: '5 minutes',
    adminEmail: config.adminEmail,
    cooldown: `${config.alertCooldown} minutes`
  });

  // Run immediately
  exports.monitorSystemHealth();

  // Then run every 5 minutes
  const interval = setInterval(exports.monitorSystemHealth, 5 * 60 * 1000);

  return interval;
};

/**
 * Get alert configuration for debugging
 */
exports.getAlertConfig = () => {
  return {
    ...config,
    alertHistory: Array.from(alertHistory.entries()).map(([type, timestamp]) => ({
      type,
      lastAlert: new Date(timestamp).toISOString(),
      cooldownRemaining: Math.max(0, config.alertCooldown * 60 * 1000 - (Date.now() - timestamp))
    }))
  };
};
