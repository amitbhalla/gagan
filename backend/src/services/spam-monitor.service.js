const { db } = require('../config/database');
const logger = require('../config/logger');
const alertService = require('./alert.service');

/**
 * Spam Rate Monitoring Service
 * Monitors spam complaints, engagement metrics, and sender reputation
 * Auto-pauses campaigns if thresholds are exceeded
 */

class SpamMonitorService {
  constructor() {
    // Threshold configuration (Gmail standards)
    this.thresholds = {
      spamRate: 0.3,      // 0.3% - Gmail threshold
      bounceRate: 5.0,    // 5% hard bounce rate
      complaintRate: 0.1, // 0.1% complaint rate
      unsubscribeRate: 2.0, // 2% unsubscribe rate (warning)
      openRate: 10.0      // Minimum 10% open rate
    };

    this.checkInterval = 60 * 60 * 1000; // Check every hour
    this.isRunning = false;
  }

  /**
   * Start monitoring service
   */
  start() {
    if (this.isRunning) {
      logger.warn('Spam monitor already running');
      return;
    }

    this.isRunning = true;
    logger.info('Spam monitor service started');

    // Run initial check
    this.performCheck();

    // Schedule periodic checks
    this.intervalId = setInterval(() => {
      this.performCheck();
    }, this.checkInterval);
  }

  /**
   * Stop monitoring service
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info('Spam monitor service stopped');
  }

  /**
   * Perform comprehensive spam check
   */
  async performCheck() {
    try {
      logger.info('Running spam rate check...');

      const metrics = this.calculateMetrics();
      const violations = this.checkThresholds(metrics);

      if (violations.length > 0) {
        await this.handleViolations(violations, metrics);
      } else {
        logger.info('All spam metrics within acceptable limits');
      }

      // Store metrics history
      this.storeMetrics(metrics);

      return { metrics, violations };
    } catch (error) {
      logger.error('Error performing spam check:', error);
    }
  }

  /**
   * Calculate current spam and engagement metrics
   * @returns {Object} - Metrics object
   */
  calculateMetrics() {
    try {
      // Get metrics from last 7 days
      const daysPeriod = 7;

      // Total messages sent in period
      const totalSent = db.prepare(`
        SELECT COUNT(*) as count
        FROM messages
        WHERE sent_at >= datetime('now', '-${daysPeriod} days')
      `).get().count;

      // Spam complaints (from unsubscribe events)
      const spamComplaints = db.prepare(`
        SELECT COUNT(DISTINCT me.message_id) as count
        FROM message_events me
        JOIN messages m ON m.id = me.message_id
        WHERE me.event_type = 'unsubscribed'
          AND m.sent_at >= datetime('now', '-${daysPeriod} days')
      `).get().count;

      // Hard bounces
      const hardBounces = db.prepare(`
        SELECT COUNT(*) as count
        FROM bounces
        WHERE bounce_type = 'hard'
          AND created_at >= datetime('now', '-${daysPeriod} days')
      `).get().count;

      // Soft bounces
      const softBounces = db.prepare(`
        SELECT COUNT(*) as count
        FROM bounces
        WHERE bounce_type = 'soft'
          AND created_at >= datetime('now', '-${daysPeriod} days')
      `).get().count;

      // Unique opens
      const uniqueOpens = db.prepare(`
        SELECT COUNT(DISTINCT message_id) as count
        FROM message_events
        WHERE event_type = 'opened'
          AND created_at >= datetime('now', '-${daysPeriod} days')
      `).get().count;

      // Unique clicks
      const uniqueClicks = db.prepare(`
        SELECT COUNT(DISTINCT message_id) as count
        FROM message_events
        WHERE event_type = 'clicked'
          AND created_at >= datetime('now', '-${daysPeriod} days')
      `).get().count;

      // Delivered messages (sent - bounced)
      const delivered = totalSent - hardBounces - softBounces;

      // Calculate rates
      const spamRate = delivered > 0 ? (spamComplaints / delivered) * 100 : 0;
      const bounceRate = totalSent > 0 ? (hardBounces / totalSent) * 100 : 0;
      const complaintRate = delivered > 0 ? (spamComplaints / delivered) * 100 : 0;
      const openRate = delivered > 0 ? (uniqueOpens / delivered) * 100 : 0;
      const clickRate = delivered > 0 ? (uniqueClicks / delivered) * 100 : 0;
      const unsubscribeRate = delivered > 0 ? (spamComplaints / delivered) * 100 : 0;

      return {
        period: `${daysPeriod} days`,
        totalSent,
        delivered,
        spamComplaints,
        hardBounces,
        softBounces,
        uniqueOpens,
        uniqueClicks,
        rates: {
          spam: parseFloat(spamRate.toFixed(2)),
          bounce: parseFloat(bounceRate.toFixed(2)),
          complaint: parseFloat(complaintRate.toFixed(2)),
          open: parseFloat(openRate.toFixed(2)),
          click: parseFloat(clickRate.toFixed(2)),
          unsubscribe: parseFloat(unsubscribeRate.toFixed(2))
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error calculating metrics:', error);
      throw error;
    }
  }

  /**
   * Check if any thresholds are violated
   * @param {Object} metrics - Current metrics
   * @returns {Array} - Array of violations
   */
  checkThresholds(metrics) {
    const violations = [];

    if (metrics.rates.spam > this.thresholds.spamRate) {
      violations.push({
        type: 'spam_rate',
        severity: 'critical',
        current: metrics.rates.spam,
        threshold: this.thresholds.spamRate,
        message: `Spam rate ${metrics.rates.spam}% exceeds threshold ${this.thresholds.spamRate}%`
      });
    }

    if (metrics.rates.bounce > this.thresholds.bounceRate) {
      violations.push({
        type: 'bounce_rate',
        severity: 'high',
        current: metrics.rates.bounce,
        threshold: this.thresholds.bounceRate,
        message: `Bounce rate ${metrics.rates.bounce}% exceeds threshold ${this.thresholds.bounceRate}%`
      });
    }

    if (metrics.rates.complaint > this.thresholds.complaintRate) {
      violations.push({
        type: 'complaint_rate',
        severity: 'critical',
        current: metrics.rates.complaint,
        threshold: this.thresholds.complaintRate,
        message: `Complaint rate ${metrics.rates.complaint}% exceeds threshold ${this.thresholds.complaintRate}%`
      });
    }

    if (metrics.rates.unsubscribe > this.thresholds.unsubscribeRate) {
      violations.push({
        type: 'unsubscribe_rate',
        severity: 'medium',
        current: metrics.rates.unsubscribe,
        threshold: this.thresholds.unsubscribeRate,
        message: `Unsubscribe rate ${metrics.rates.unsubscribe}% exceeds threshold ${this.thresholds.unsubscribeRate}%`
      });
    }

    if (metrics.totalSent > 100 && metrics.rates.open < this.thresholds.openRate) {
      violations.push({
        type: 'low_engagement',
        severity: 'medium',
        current: metrics.rates.open,
        threshold: this.thresholds.openRate,
        message: `Open rate ${metrics.rates.open}% is below minimum ${this.thresholds.openRate}%`
      });
    }

    return violations;
  }

  /**
   * Handle threshold violations
   * @param {Array} violations - Array of violations
   * @param {Object} metrics - Current metrics
   */
  async handleViolations(violations, metrics) {
    try {
      // Check for critical violations
      const criticalViolations = violations.filter(v => v.severity === 'critical');

      if (criticalViolations.length > 0) {
        logger.error('CRITICAL: Spam thresholds violated!', { violations: criticalViolations });

        // Auto-pause all active campaigns
        const pausedCount = this.pauseActiveCampaigns();

        // Send alert email
        if (alertService.sendAlert) {
          await alertService.sendAlert({
            type: 'spam_threshold_violation',
            severity: 'critical',
            subject: '🚨 CRITICAL: Spam Rate Threshold Exceeded - Campaigns Paused',
            message: this.generateViolationReport(violations, metrics, pausedCount)
          });
        }
      } else {
        // Log warnings
        logger.warn('Spam thresholds warning:', { violations });

        // Send warning email for high/medium severity
        if (alertService.sendAlert) {
          await alertService.sendAlert({
            type: 'spam_threshold_warning',
            severity: 'medium',
            subject: '⚠️  WARNING: Email Metrics Threshold Warning',
            message: this.generateViolationReport(violations, metrics, 0)
          });
        }
      }
    } catch (error) {
      logger.error('Error handling violations:', error);
    }
  }

  /**
   * Pause all active campaigns
   * @returns {number} - Number of campaigns paused
   */
  pauseActiveCampaigns() {
    try {
      const result = db.prepare(`
        UPDATE campaigns
        SET status = 'paused'
        WHERE status IN ('sending', 'scheduled')
      `).run();

      logger.info(`Paused ${result.changes} active campaigns due to spam threshold violation`);

      return result.changes;
    } catch (error) {
      logger.error('Error pausing campaigns:', error);
      return 0;
    }
  }

  /**
   * Generate violation report for email alert
   * @param {Array} violations - Violations array
   * @param {Object} metrics - Current metrics
   * @param {number} pausedCount - Number of campaigns paused
   * @returns {string} - HTML report
   */
  generateViolationReport(violations, metrics, pausedCount) {
    let html = `
      <h2>Email Compliance Alert</h2>
      <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>

      <h3>Current Metrics (${metrics.period})</h3>
      <table border="1" cellpadding="5" style="border-collapse: collapse;">
        <tr><th>Metric</th><th>Value</th><th>Threshold</th><th>Status</th></tr>
        <tr>
          <td>Spam Rate</td>
          <td>${metrics.rates.spam}%</td>
          <td>${this.thresholds.spamRate}%</td>
          <td style="color: ${metrics.rates.spam > this.thresholds.spamRate ? 'red' : 'green'}">${metrics.rates.spam > this.thresholds.spamRate ? '❌ EXCEEDED' : '✅ OK'}</td>
        </tr>
        <tr>
          <td>Bounce Rate</td>
          <td>${metrics.rates.bounce}%</td>
          <td>${this.thresholds.bounceRate}%</td>
          <td style="color: ${metrics.rates.bounce > this.thresholds.bounceRate ? 'red' : 'green'}">${metrics.rates.bounce > this.thresholds.bounceRate ? '❌ EXCEEDED' : '✅ OK'}</td>
        </tr>
        <tr>
          <td>Complaint Rate</td>
          <td>${metrics.rates.complaint}%</td>
          <td>${this.thresholds.complaintRate}%</td>
          <td style="color: ${metrics.rates.complaint > this.thresholds.complaintRate ? 'red' : 'green'}">${metrics.rates.complaint > this.thresholds.complaintRate ? '❌ EXCEEDED' : '✅ OK'}</td>
        </tr>
        <tr>
          <td>Open Rate</td>
          <td>${metrics.rates.open}%</td>
          <td>${this.thresholds.openRate}%</td>
          <td style="color: ${metrics.rates.open < this.thresholds.openRate ? 'orange' : 'green'}">${metrics.rates.open < this.thresholds.openRate ? '⚠️  LOW' : '✅ OK'}</td>
        </tr>
      </table>

      <h3>Violations Detected</h3>
      <ul>
        ${violations.map(v => `<li><strong>${v.type}:</strong> ${v.message} (Severity: ${v.severity})</li>`).join('')}
      </ul>

      ${pausedCount > 0 ? `
        <h3 style="color: red;">⚠️  Action Taken</h3>
        <p><strong>${pausedCount} active campaign(s) have been automatically paused</strong> to prevent further reputation damage.</p>
      ` : ''}

      <h3>Recommended Actions</h3>
      <ol>
        <li>Review recent campaign content for spam triggers</li>
        <li>Clean your email list (remove bounced/invalid addresses)</li>
        <li>Verify all recipients have opted in</li>
        <li>Check DNS records (SPF, DKIM, DMARC)</li>
        <li>Review engagement metrics and content quality</li>
        <li>Consider reducing send volume temporarily</li>
      </ol>

      <p><em>This is an automated alert from the Email Marketing Platform Compliance Monitor.</em></p>
    `;

    return html;
  }

  /**
   * Store metrics history for tracking
   * @param {Object} metrics - Metrics to store
   */
  storeMetrics(metrics) {
    try {
      db.prepare(`
        INSERT INTO spam_metrics_history (
          period_days,
          total_sent,
          delivered,
          spam_rate,
          bounce_rate,
          complaint_rate,
          open_rate,
          click_rate,
          recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        7, // 7-day period
        metrics.totalSent,
        metrics.delivered,
        metrics.rates.spam,
        metrics.rates.bounce,
        metrics.rates.complaint,
        metrics.rates.open,
        metrics.rates.click
      );
    } catch (error) {
      // Table might not exist yet, create it
      if (error.message.includes('no such table')) {
        this.initMetricsTable();
        this.storeMetrics(metrics); // Retry
      } else {
        logger.error('Error storing metrics:', error);
      }
    }
  }

  /**
   * Initialize metrics history table
   */
  initMetricsTable() {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS spam_metrics_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          period_days INTEGER,
          total_sent INTEGER,
          delivered INTEGER,
          spam_rate REAL,
          bounce_rate REAL,
          complaint_rate REAL,
          open_rate REAL,
          click_rate REAL,
          recorded_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);
      logger.info('Spam metrics history table initialized');
    } catch (error) {
      logger.error('Error initializing metrics table:', error);
    }
  }

  /**
   * Get metrics history
   * @param {number} days - Number of days to retrieve
   * @returns {Array} - Historical metrics
   */
  getMetricsHistory(days = 30) {
    try {
      this.initMetricsTable(); // Ensure table exists

      const history = db.prepare(`
        SELECT * FROM spam_metrics_history
        WHERE recorded_at >= datetime('now', '-${days} days')
        ORDER BY recorded_at DESC
      `).all();

      return history;
    } catch (error) {
      logger.error('Error getting metrics history:', error);
      return [];
    }
  }

  /**
   * Get sender reputation score
   * @returns {Object} - Reputation score and details
   */
  getReputationScore() {
    const metrics = this.calculateMetrics();

    let score = 100;

    // Deduct points for violations
    if (metrics.rates.spam > 0.1) score -= Math.min(metrics.rates.spam * 10, 30);
    if (metrics.rates.bounce > 2) score -= Math.min(metrics.rates.bounce * 2, 20);
    if (metrics.rates.complaint > 0.05) score -= Math.min(metrics.rates.complaint * 20, 25);
    if (metrics.rates.open < 15) score -= Math.min((15 - metrics.rates.open), 15);

    score = Math.max(score, 0);

    let status;
    if (score >= 90) status = 'excellent';
    else if (score >= 75) status = 'good';
    else if (score >= 60) status = 'fair';
    else if (score >= 40) status = 'poor';
    else status = 'critical';

    return {
      score: Math.round(score),
      status,
      metrics: metrics.rates,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Update thresholds
   * @param {Object} newThresholds - New threshold values
   */
  updateThresholds(newThresholds) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    logger.info('Spam thresholds updated:', this.thresholds);
  }
}

// Singleton instance
const spamMonitorService = new SpamMonitorService();

module.exports = spamMonitorService;
