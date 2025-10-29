const QueueModel = require('../models/queue.model');
const MessageModel = require('../models/message.model');
const emailService = require('./email.service');
const bounceService = require('./bounce.service');
const { personalizeContent } = require('../utils/personalize');
const logger = require('../config/logger');

class QueueService {
  constructor() {
    this.isProcessing = false;
    this.processingInterval = null;
    this.config = {
      pollInterval: parseInt(process.env.QUEUE_POLL_INTERVAL) || 5000, // 5 seconds
      batchSize: parseInt(process.env.QUEUE_BATCH_SIZE) || 10,
      rateLimit: parseInt(process.env.EMAIL_RATE_LIMIT) || 100, // emails per hour
      rateLimitWindow: parseInt(process.env.EMAIL_RATE_WINDOW) || 3600000 // 1 hour in ms
    };
    this.emailsSentInWindow = 0;
    this.windowStartTime = Date.now();
  }

  /**
   * Start the queue processor
   */
  start() {
    if (this.processingInterval) {
      logger.warn('Queue processor already running');
      return;
    }

    logger.info('Starting queue processor', this.config);

    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, this.config.pollInterval);

    // Process immediately on start
    this.processQueue();
  }

  /**
   * Stop the queue processor
   */
  stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      logger.info('Queue processor stopped');
    }
  }

  /**
   * Process pending jobs from queue
   */
  async processQueue() {
    // Prevent concurrent processing
    if (this.isProcessing) {
      return;
    }

    try {
      this.isProcessing = true;

      // Check rate limit
      if (!this.canSendMore()) {
        logger.debug('Rate limit reached, waiting...');
        return;
      }

      // Get next batch of pending jobs
      const jobs = QueueModel.getNextPending(this.config.batchSize, 'send_email');

      if (jobs.length === 0) {
        return; // No jobs to process
      }

      logger.info(`Processing ${jobs.length} jobs from queue`);

      // Process each job
      for (const job of jobs) {
        // Check rate limit again before each email
        if (!this.canSendMore()) {
          logger.info('Rate limit reached during batch processing');
          break;
        }

        await this.processJob(job);
      }
    } catch (error) {
      logger.error('Error processing queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single job
   * @param {Object} job - Job object
   */
  async processJob(job) {
    try {
      // Mark job as processing
      QueueModel.markProcessing(job.id);

      switch (job.job_type) {
        case 'send_email':
          await this.processSendEmailJob(job);
          break;

        case 'send_campaign':
          await this.processSendCampaignJob(job);
          break;

        default:
          logger.warn(`Unknown job type: ${job.job_type}`);
          QueueModel.markFailed(job.id, `Unknown job type: ${job.job_type}`);
      }
    } catch (error) {
      logger.error(`Error processing job ${job.id}:`, error);
      QueueModel.markFailed(job.id, error.message, true); // Retry on failure
    }
  }

  /**
   * Process send_email job
   * @param {Object} job - Job object
   */
  async processSendEmailJob(job) {
    const { messageId, email, subject, html, text, from, fromName, replyTo, headers, tracking, contactId } = job.job_data;

    try {
      // Get message from database
      const message = MessageModel.getById(messageId);

      if (!message) {
        throw new Error(`Message ${messageId} not found`);
      }

      // Skip if already sent
      if (message.status === 'sent' || message.status === 'delivered') {
        logger.info(`Message ${messageId} already sent, skipping`);
        QueueModel.markCompleted(job.id);
        return;
      }

      // Check if contact should be skipped (bounced/unsubscribed)
      if (contactId && bounceService.shouldSkipContact(contactId)) {
        logger.info(`Skipping message ${messageId} - contact ${contactId} is bounced or unsubscribed`);
        MessageModel.updateStatus(messageId, 'failed', {
          error_message: 'Contact is bounced or unsubscribed'
        });
        QueueModel.markCompleted(job.id);
        return;
      }

      // Send email with tracking if provided
      const result = await emailService.sendEmail({
        to: email,
        subject,
        html,
        text,
        from,
        fromName,
        replyTo,
        headers,
        messageId: message.message_id,
        tracking: tracking || null // Pass tracking info if available
      });

      // Update message status based on result
      if (result.success) {
        MessageModel.updateStatus(messageId, 'sent');
        QueueModel.markCompleted(job.id);
        this.incrementEmailCount();

        logger.info(`Email sent successfully: ${messageId} to ${email}`);
      } else {
        // Process bounce using bounce service
        const errorObj = {
          responseCode: result.code,
          message: result.error,
          response: result.error
        };

        const bounceInfo = bounceService.processBounce(contactId || message.contact_id, messageId, errorObj);

        if (bounceInfo && bounceInfo.bounceType === 'hard') {
          MessageModel.updateStatus(messageId, 'bounced', {
            error_message: result.error
          });
          QueueModel.markFailed(job.id, result.error, false); // Don't retry hard bounces
          logger.error(`Hard bounce: ${messageId} to ${email} - ${result.error}`);
        } else {
          MessageModel.updateStatus(messageId, 'failed', {
            error_message: result.error
          });
          // Retry soft bounces up to max_retries
          const shouldRetry = job.retry_count < (job.max_retries || 3);
          QueueModel.markFailed(job.id, result.error, shouldRetry);
          logger.error(`Soft bounce/failure: ${messageId} to ${email} - ${result.error} (retry: ${shouldRetry})`);
        }
      }
    } catch (error) {
      logger.error(`Error in send_email job ${job.id}:`, error);
      MessageModel.updateStatus(messageId, 'failed', {
        error_message: error.message
      });
      throw error; // Re-throw to mark job as failed
    }
  }

  /**
   * Process send_campaign job (meta job that creates individual email jobs)
   * @param {Object} job - Job object
   */
  async processSendCampaignJob(job) {
    // This job type would be used for creating individual email jobs for a campaign
    // For now, we handle campaign sending directly in campaign.service.js
    logger.info(`Processing send_campaign job ${job.id}`);
    QueueModel.markCompleted(job.id);
  }

  /**
   * Check if we can send more emails based on rate limit
   * @returns {boolean}
   */
  canSendMore() {
    const now = Date.now();
    const windowElapsed = now - this.windowStartTime;

    // Reset window if elapsed
    if (windowElapsed >= this.config.rateLimitWindow) {
      this.windowStartTime = now;
      this.emailsSentInWindow = 0;
      return true;
    }

    // Check if we're under the limit
    return this.emailsSentInWindow < this.config.rateLimit;
  }

  /**
   * Increment email count for rate limiting
   */
  incrementEmailCount() {
    this.emailsSentInWindow++;
  }

  /**
   * Get current rate limit status
   * @returns {Object} Rate limit info
   */
  getRateLimitStatus() {
    const now = Date.now();
    const windowElapsed = now - this.windowStartTime;
    const windowRemaining = Math.max(0, this.config.rateLimitWindow - windowElapsed);

    return {
      emailsSent: this.emailsSentInWindow,
      limit: this.config.rateLimit,
      remaining: Math.max(0, this.config.rateLimit - this.emailsSentInWindow),
      windowRemaining: Math.ceil(windowRemaining / 1000), // seconds
      canSendMore: this.canSendMore()
    };
  }

  /**
   * Get queue processor status
   * @returns {Object} Processor status
   */
  getStatus() {
    const queueStats = QueueModel.getStats();
    const rateLimitStatus = this.getRateLimitStatus();

    return {
      isRunning: this.processingInterval !== null,
      isProcessing: this.isProcessing,
      config: this.config,
      queueStats,
      rateLimitStatus
    };
  }

  /**
   * Enqueue an email for sending
   * @param {Object} emailData - Email data
   * @returns {Object} Created job
   */
  enqueueEmail(emailData) {
    return QueueModel.enqueue({
      job_type: 'send_email',
      job_data: emailData,
      priority: emailData.priority || 0
    });
  }

  /**
   * Bulk enqueue emails for sending
   * @param {Array<Object>} emails - Array of email data
   * @returns {number} Number of jobs created
   */
  bulkEnqueueEmails(emails) {
    const jobs = emails.map(email => ({
      job_type: 'send_email',
      job_data: email,
      priority: email.priority || 0
    }));

    return QueueModel.bulkEnqueue(jobs);
  }
}

// Export singleton instance
module.exports = new QueueService();
