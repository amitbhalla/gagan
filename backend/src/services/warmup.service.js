const { db } = require('../config/database');
const logger = require('../config/logger');

/**
 * Email Warmup Service
 * Manages gradual email volume increases to build sender reputation
 * Implements IP warmup schedule with daily volume limits
 */

class WarmupService {
  constructor() {
    this.warmupSchedule = [
      { day: 1, maxEmails: 50, description: 'Day 1: Initial warmup' },
      { day: 2, maxEmails: 100, description: 'Day 2: Doubling volume' },
      { day: 3, maxEmails: 200, description: 'Day 3: Steady increase' },
      { day: 4, maxEmails: 500, description: 'Day 4: Moderate volume' },
      { day: 5, maxEmails: 1000, description: 'Day 5: Higher volume' },
      { day: 6, maxEmails: 2000, description: 'Day 6: Scaling up' },
      { day: 7, maxEmails: 5000, description: 'Day 7: Near full volume' },
      { day: 8, maxEmails: 10000, description: 'Day 8: Full volume' },
      { day: 9, maxEmails: 20000, description: 'Day 9+: Unlimited' }
    ];

    this.initDatabase();
  }

  /**
   * Initialize warmup tracking table
   */
  initDatabase() {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS warmup_tracking (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          smtp_config_id INTEGER,
          start_date TEXT NOT NULL,
          current_day INTEGER DEFAULT 1,
          status TEXT DEFAULT 'active',
          daily_sent INTEGER DEFAULT 0,
          last_reset_date TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS warmup_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          warmup_id INTEGER,
          date TEXT NOT NULL,
          day_number INTEGER,
          emails_sent INTEGER,
          max_allowed INTEGER,
          compliance_rate REAL,
          bounce_rate REAL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (warmup_id) REFERENCES warmup_tracking(id)
        )
      `);

      logger.info('Warmup tracking tables initialized');
    } catch (error) {
      logger.error('Error initializing warmup tables:', error);
    }
  }

  /**
   * Start a new warmup period
   * @param {number} smtpConfigId - SMTP configuration ID (optional)
   * @returns {Object} - Warmup tracking record
   */
  startWarmup(smtpConfigId = null) {
    try {
      const stmt = db.prepare(`
        INSERT INTO warmup_tracking (smtp_config_id, start_date, current_day, status, last_reset_date)
        VALUES (?, DATE('now'), 1, 'active', DATE('now'))
      `);

      const result = stmt.run(smtpConfigId);

      logger.info(`Started warmup period (ID: ${result.lastInsertRowid})`);

      return this.getWarmupStatus(result.lastInsertRowid);
    } catch (error) {
      logger.error('Error starting warmup:', error);
      throw error;
    }
  }

  /**
   * Get current warmup status
   * @param {number} warmupId - Warmup tracking ID (optional, uses active if not provided)
   * @returns {Object} - Current warmup status
   */
  getWarmupStatus(warmupId = null) {
    try {
      let warmup;

      if (warmupId) {
        warmup = db.prepare('SELECT * FROM warmup_tracking WHERE id = ?').get(warmupId);
      } else {
        // Get active warmup
        warmup = db.prepare('SELECT * FROM warmup_tracking WHERE status = ? ORDER BY id DESC LIMIT 1')
          .get('active');
      }

      if (!warmup) {
        return {
          active: false,
          message: 'No active warmup period',
          recommendation: 'Start a warmup period before sending large volumes'
        };
      }

      // Calculate current day based on start date
      const startDate = new Date(warmup.start_date);
      const today = new Date();
      const daysSinceStart = Math.floor((today - startDate) / (1000 * 60 * 60 * 24)) + 1;

      // Find current schedule
      const schedule = this.warmupSchedule.find(s => s.day === Math.min(daysSinceStart, 9)) ||
                      this.warmupSchedule[this.warmupSchedule.length - 1];

      // Reset daily count if it's a new day
      const lastReset = new Date(warmup.last_reset_date);
      if (lastReset.toDateString() !== today.toDateString()) {
        this.resetDailyCount(warmup.id);
        warmup.daily_sent = 0;
        warmup.last_reset_date = today.toISOString().split('T')[0];
      }

      const remainingToday = Math.max(schedule.maxEmails - warmup.daily_sent, 0);
      const progressPercent = Math.min((warmup.daily_sent / schedule.maxEmails) * 100, 100);

      return {
        active: true,
        warmupId: warmup.id,
        startDate: warmup.start_date,
        currentDay: daysSinceStart,
        dailySent: warmup.daily_sent,
        dailyLimit: schedule.maxEmails,
        remainingToday,
        progressPercent: progressPercent.toFixed(1),
        scheduleDescription: schedule.description,
        status: warmup.status,
        canSend: remainingToday > 0,
        nextDayLimit: daysSinceStart < 9 ?
          this.warmupSchedule.find(s => s.day === daysSinceStart + 1)?.maxEmails :
          'unlimited'
      };
    } catch (error) {
      logger.error('Error getting warmup status:', error);
      throw error;
    }
  }

  /**
   * Check if sending is allowed based on warmup schedule
   * @param {number} emailCount - Number of emails to send
   * @returns {Object} - Allowance result
   */
  canSendEmails(emailCount = 1) {
    try {
      const status = this.getWarmupStatus();

      if (!status.active) {
        // No active warmup, allow sending (or enforce warmup in production)
        return {
          allowed: true,
          message: 'No active warmup period',
          warning: 'Consider starting a warmup period for better deliverability'
        };
      }

      const wouldExceed = (status.dailySent + emailCount) > status.dailyLimit;

      if (wouldExceed) {
        return {
          allowed: false,
          message: `Would exceed daily warmup limit (${status.dailyLimit})`,
          dailySent: status.dailySent,
          dailyLimit: status.dailyLimit,
          remainingToday: status.remainingToday,
          requestedCount: emailCount
        };
      }

      return {
        allowed: true,
        message: 'Within warmup limits',
        dailySent: status.dailySent,
        dailyLimit: status.dailyLimit,
        remainingToday: status.remainingToday - emailCount
      };
    } catch (error) {
      logger.error('Error checking warmup allowance:', error);
      // Allow sending if check fails (don't block)
      return { allowed: true, error: error.message };
    }
  }

  /**
   * Record emails sent during warmup
   * @param {number} count - Number of emails sent
   * @param {number} warmupId - Warmup tracking ID (optional)
   * @returns {Object} - Updated status
   */
  recordEmailsSent(count, warmupId = null) {
    try {
      const status = this.getWarmupStatus(warmupId);

      if (!status.active) {
        logger.warn('Attempted to record sends for inactive warmup');
        return status;
      }

      const stmt = db.prepare(`
        UPDATE warmup_tracking
        SET daily_sent = daily_sent + ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      stmt.run(count, status.warmupId);

      logger.info(`Recorded ${count} emails sent during warmup (ID: ${status.warmupId})`);

      return this.getWarmupStatus(status.warmupId);
    } catch (error) {
      logger.error('Error recording warmup sends:', error);
      throw error;
    }
  }

  /**
   * Reset daily send count (called automatically at midnight)
   * @param {number} warmupId - Warmup tracking ID
   */
  resetDailyCount(warmupId) {
    try {
      // Save yesterday's stats to history first
      const warmup = db.prepare('SELECT * FROM warmup_tracking WHERE id = ?').get(warmupId);

      if (warmup && warmup.daily_sent > 0) {
        const dayNumber = Math.floor(
          (new Date() - new Date(warmup.start_date)) / (1000 * 60 * 60 * 24)
        );

        const schedule = this.warmupSchedule.find(s => s.day === Math.min(dayNumber, 9)) ||
                        this.warmupSchedule[this.warmupSchedule.length - 1];

        db.prepare(`
          INSERT INTO warmup_history (warmup_id, date, day_number, emails_sent, max_allowed)
          VALUES (?, DATE('now', '-1 day'), ?, ?, ?)
        `).run(warmupId, dayNumber, warmup.daily_sent, schedule.maxEmails);
      }

      // Reset daily count
      db.prepare(`
        UPDATE warmup_tracking
        SET daily_sent = 0,
            last_reset_date = DATE('now'),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(warmupId);

      logger.info(`Reset daily count for warmup ID: ${warmupId}`);
    } catch (error) {
      logger.error('Error resetting daily count:', error);
    }
  }

  /**
   * Complete warmup period
   * @param {number} warmupId - Warmup tracking ID
   */
  completeWarmup(warmupId) {
    try {
      db.prepare(`
        UPDATE warmup_tracking
        SET status = 'completed',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(warmupId);

      logger.info(`Completed warmup period (ID: ${warmupId})`);

      return {
        success: true,
        message: 'Warmup period completed successfully',
        warmupId
      };
    } catch (error) {
      logger.error('Error completing warmup:', error);
      throw error;
    }
  }

  /**
   * Pause warmup period
   * @param {number} warmupId - Warmup tracking ID
   */
  pauseWarmup(warmupId) {
    try {
      db.prepare(`
        UPDATE warmup_tracking
        SET status = 'paused',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(warmupId);

      logger.info(`Paused warmup period (ID: ${warmupId})`);
    } catch (error) {
      logger.error('Error pausing warmup:', error);
      throw error;
    }
  }

  /**
   * Resume warmup period
   * @param {number} warmupId - Warmup tracking ID
   */
  resumeWarmup(warmupId) {
    try {
      db.prepare(`
        UPDATE warmup_tracking
        SET status = 'active',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(warmupId);

      logger.info(`Resumed warmup period (ID: ${warmupId})`);
    } catch (error) {
      logger.error('Error resuming warmup:', error);
      throw error;
    }
  }

  /**
   * Get warmup history
   * @param {number} warmupId - Warmup tracking ID
   * @returns {Array} - Historical data
   */
  getWarmupHistory(warmupId) {
    try {
      const history = db.prepare(`
        SELECT * FROM warmup_history
        WHERE warmup_id = ?
        ORDER BY date ASC
      `).all(warmupId);

      return history;
    } catch (error) {
      logger.error('Error getting warmup history:', error);
      throw error;
    }
  }

  /**
   * Get warmup recommendation based on current metrics
   * @param {Object} metrics - Current sending metrics
   * @returns {Object} - Recommendation
   */
  getRecommendation(metrics = {}) {
    const { bounceRate = 0, spamRate = 0, engagementRate = 0 } = metrics;

    const issues = [];
    const recommendations = [];

    if (bounceRate > 5) {
      issues.push(`High bounce rate: ${bounceRate.toFixed(1)}%`);
      recommendations.push('Pause sending and clean your email list');
    }

    if (spamRate > 0.3) {
      issues.push(`High spam complaint rate: ${spamRate.toFixed(2)}%`);
      recommendations.push('Review email content and ensure recipients opted in');
    }

    if (engagementRate < 10) {
      issues.push(`Low engagement rate: ${engagementRate.toFixed(1)}%`);
      recommendations.push('Improve content quality and relevance');
    }

    if (issues.length === 0) {
      return {
        status: 'healthy',
        message: 'Warmup progressing well',
        canProceed: true
      };
    }

    return {
      status: 'warning',
      issues,
      recommendations,
      canProceed: bounceRate < 10 && spamRate < 1
    };
  }

  /**
   * Get full warmup schedule
   * @returns {Array} - Complete warmup schedule
   */
  getSchedule() {
    return this.warmupSchedule;
  }

  /**
   * Adjust warmup speed (slower or faster)
   * @param {number} warmupId - Warmup tracking ID
   * @param {string} speed - 'slow', 'normal', or 'fast'
   */
  adjustWarmupSpeed(warmupId, speed = 'normal') {
    // This would modify the schedule multiplier
    // Implementation depends on specific needs
    logger.info(`Warmup speed adjusted to: ${speed}`);
  }
}

// Singleton instance
const warmupService = new WarmupService();

module.exports = warmupService;
