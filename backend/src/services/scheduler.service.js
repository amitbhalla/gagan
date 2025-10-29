const { db } = require('../config/database');
const campaignService = require('./campaign.service');
const logger = require('../config/logger');

class SchedulerService {
  constructor() {
    this.isRunning = false;
    this.interval = null;
    this.checkInterval = parseInt(process.env.SCHEDULER_CHECK_INTERVAL) || 60000; // 1 minute
    this.processedCampaigns = new Set(); // Track processed campaigns to prevent duplicates
  }

  /**
   * Start the scheduler
   */
  start() {
    if (this.interval) {
      logger.warn('Scheduler already running');
      return;
    }

    logger.info(`Starting campaign scheduler (checking every ${this.checkInterval / 1000}s)`);

    this.interval = setInterval(() => {
      this.checkScheduledCampaigns();
    }, this.checkInterval);

    // Check immediately on start
    this.checkScheduledCampaigns();
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.isRunning = false;
      logger.info('Campaign scheduler stopped');
    }
  }

  /**
   * Check for scheduled campaigns that are due to be sent
   */
  async checkScheduledCampaigns() {
    if (this.isRunning) {
      return; // Prevent concurrent checks
    }

    try {
      this.isRunning = true;

      // Find campaigns that are scheduled and due to be sent
      const dueCampaigns = db.prepare(`
        SELECT * FROM campaigns
        WHERE status = 'scheduled'
        AND scheduled_at IS NOT NULL
        AND datetime(scheduled_at) <= datetime('now')
        ORDER BY scheduled_at ASC
      `).all();

      if (dueCampaigns.length === 0) {
        return;
      }

      logger.info(`Found ${dueCampaigns.length} scheduled campaigns due for sending`);

      for (const campaign of dueCampaigns) {
        // Skip if already processed in this session (prevent duplicates)
        if (this.processedCampaigns.has(campaign.id)) {
          continue;
        }

        try {
          await this.sendScheduledCampaign(campaign);
          this.processedCampaigns.add(campaign.id);
        } catch (error) {
          logger.error(`Error sending scheduled campaign ${campaign.id}:`, error);
          // Mark campaign as failed
          this.markCampaignFailed(campaign.id, error.message);
        }
      }

      // Clean up processed campaigns set (keep last 1000)
      if (this.processedCampaigns.size > 1000) {
        const arr = Array.from(this.processedCampaigns);
        this.processedCampaigns = new Set(arr.slice(-1000));
      }
    } catch (error) {
      logger.error('Error checking scheduled campaigns:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Send a scheduled campaign
   * @param {Object} campaign - Campaign object
   */
  async sendScheduledCampaign(campaign) {
    try {
      logger.info(`Sending scheduled campaign: ${campaign.id} - ${campaign.name}`);

      // Update status to sending
      db.prepare(`
        UPDATE campaigns
        SET status = 'sending', started_at = datetime('now')
        WHERE id = ?
      `).run(campaign.id);

      // Send campaign using campaign service
      const result = await campaignService.sendCampaign(campaign.id);

      logger.info(`Scheduled campaign ${campaign.id} queued successfully: ${result.messagesQueued} emails`);
    } catch (error) {
      logger.error(`Error sending scheduled campaign ${campaign.id}:`, error);
      throw error;
    }
  }

  /**
   * Mark campaign as failed
   * @param {number} campaignId - Campaign ID
   * @param {string} errorMessage - Error message
   */
  markCampaignFailed(campaignId, errorMessage) {
    try {
      db.prepare(`
        UPDATE campaigns
        SET status = 'failed', updated_at = datetime('now')
        WHERE id = ?
      `).run(campaignId);

      logger.error(`Campaign ${campaignId} marked as failed: ${errorMessage}`);
    } catch (error) {
      logger.error(`Error marking campaign ${campaignId} as failed:`, error);
    }
  }

  /**
   * Schedule a campaign
   * @param {number} campaignId - Campaign ID
   * @param {string} scheduledAt - ISO 8601 datetime string
   * @returns {boolean} Success status
   */
  scheduleCampaign(campaignId, scheduledAt) {
    try {
      // Validate scheduled time is in the future
      const scheduledDate = new Date(scheduledAt);
      const now = new Date();

      if (scheduledDate <= now) {
        throw new Error('Scheduled time must be in the future');
      }

      // Update campaign
      const stmt = db.prepare(`
        UPDATE campaigns
        SET status = 'scheduled', scheduled_at = ?, updated_at = datetime('now')
        WHERE id = ? AND status = 'draft'
      `);

      const result = stmt.run(scheduledAt, campaignId);

      if (result.changes === 0) {
        throw new Error('Campaign not found or not in draft status');
      }

      logger.info(`Campaign ${campaignId} scheduled for ${scheduledAt}`);
      return true;
    } catch (error) {
      logger.error(`Error scheduling campaign ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Cancel a scheduled campaign
   * @param {number} campaignId - Campaign ID
   * @returns {boolean} Success status
   */
  cancelScheduledCampaign(campaignId) {
    try {
      const stmt = db.prepare(`
        UPDATE campaigns
        SET status = 'draft', scheduled_at = NULL, updated_at = datetime('now')
        WHERE id = ? AND status = 'scheduled'
      `);

      const result = stmt.run(campaignId);

      if (result.changes === 0) {
        throw new Error('Campaign not found or not scheduled');
      }

      // Remove from processed set if present
      this.processedCampaigns.delete(campaignId);

      logger.info(`Scheduled campaign ${campaignId} cancelled`);
      return true;
    } catch (error) {
      logger.error(`Error cancelling scheduled campaign ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Reschedule a campaign
   * @param {number} campaignId - Campaign ID
   * @param {string} newScheduledAt - New ISO 8601 datetime string
   * @returns {boolean} Success status
   */
  rescheduleCampaign(campaignId, newScheduledAt) {
    try {
      // Validate new scheduled time is in the future
      const scheduledDate = new Date(newScheduledAt);
      const now = new Date();

      if (scheduledDate <= now) {
        throw new Error('Scheduled time must be in the future');
      }

      const stmt = db.prepare(`
        UPDATE campaigns
        SET scheduled_at = ?, updated_at = datetime('now')
        WHERE id = ? AND status = 'scheduled'
      `);

      const result = stmt.run(newScheduledAt, campaignId);

      if (result.changes === 0) {
        throw new Error('Campaign not found or not scheduled');
      }

      // Remove from processed set to allow re-processing
      this.processedCampaigns.delete(campaignId);

      logger.info(`Campaign ${campaignId} rescheduled to ${newScheduledAt}`);
      return true;
    } catch (error) {
      logger.error(`Error rescheduling campaign ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Get upcoming scheduled campaigns
   * @param {number} limit - Number of campaigns to return
   * @returns {Array} Scheduled campaigns
   */
  getUpcomingCampaigns(limit = 10) {
    try {
      const campaigns = db.prepare(`
        SELECT
          c.*,
          t.name as template_name,
          l.name as list_name
        FROM campaigns c
        LEFT JOIN templates t ON c.template_id = t.id
        LEFT JOIN lists l ON c.list_id = l.id
        WHERE c.status = 'scheduled'
        AND c.scheduled_at > datetime('now')
        ORDER BY c.scheduled_at ASC
        LIMIT ?
      `).all(limit);

      return campaigns;
    } catch (error) {
      logger.error('Error getting upcoming campaigns:', error);
      return [];
    }
  }

  /**
   * Get scheduler status
   * @returns {Object} Scheduler status
   */
  getStatus() {
    try {
      const scheduledCount = db.prepare(`
        SELECT COUNT(*) as count FROM campaigns WHERE status = 'scheduled'
      `).get().count;

      const upcomingCount = db.prepare(`
        SELECT COUNT(*) as count FROM campaigns
        WHERE status = 'scheduled' AND datetime(scheduled_at) > datetime('now')
      `).get().count;

      const overdueCount = db.prepare(`
        SELECT COUNT(*) as count FROM campaigns
        WHERE status = 'scheduled' AND datetime(scheduled_at) <= datetime('now')
      `).get().count;

      return {
        isRunning: this.interval !== null,
        isProcessing: this.isRunning,
        checkInterval: this.checkInterval,
        totalScheduled: scheduledCount,
        upcomingCampaigns: upcomingCount,
        overdueCampaigns: overdueCount,
        processedInSession: this.processedCampaigns.size
      };
    } catch (error) {
      logger.error('Error getting scheduler status:', error);
      return {
        isRunning: this.interval !== null,
        error: error.message
      };
    }
  }
}

// Export singleton instance
module.exports = new SchedulerService();
