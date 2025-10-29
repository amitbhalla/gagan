const nodemailer = require('nodemailer');
const logger = require('../config/logger');
const fs = require('fs');
const path = require('path');
const {
  processEmailHtml,
  generateTrackingHeaders
} = require('../utils/tracking');
const contentValidator = require('../utils/content-validator');

class EmailService {
  constructor() {
    this.transporter = null;
    this.dkimConfig = null;
    this.initialize();
  }

  /**
   * Initialize Nodemailer transporter with SMTP configuration
   */
  initialize() {
    try {
      const config = {
        host: process.env.SMTP_HOST || 'smtp-relay.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true', // false for STARTTLS
        auth: process.env.SMTP_USERNAME ? {
          user: process.env.SMTP_USERNAME,
          pass: process.env.SMTP_PASSWORD
        } : undefined, // Gmail relay uses IP-based auth
        tls: {
          rejectUnauthorized: true
        }
      };

      // Load DKIM configuration if available
      if (process.env.DKIM_PRIVATE_KEY_PATH) {
        const dkimPath = process.env.DKIM_PRIVATE_KEY_PATH;
        if (fs.existsSync(dkimPath)) {
          this.dkimConfig = {
            domainName: process.env.DKIM_DOMAIN || 'myndsolution.com',
            keySelector: process.env.DKIM_SELECTOR || 'default',
            privateKey: fs.readFileSync(dkimPath, 'utf8')
          };
          config.dkim = this.dkimConfig;
          logger.info('DKIM configuration loaded successfully');
        } else {
          logger.warn(`DKIM private key not found at ${dkimPath}`);
        }
      }

      this.transporter = nodemailer.createTransport(config);
      logger.info('Email transporter initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize email transporter:', error);
      throw error;
    }
  }

  /**
   * Verify SMTP connection
   * @returns {Promise<boolean>}
   */
  async verifyConnection() {
    try {
      await this.transporter.verify();
      logger.info('SMTP connection verified successfully');
      return true;
    } catch (error) {
      logger.error('SMTP connection verification failed:', error);
      return false;
    }
  }

  /**
   * Send a single email
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email
   * @param {string} options.subject - Email subject
   * @param {string} options.html - HTML body
   * @param {string} options.text - Plain text body
   * @param {string} options.from - Sender email (optional)
   * @param {string} options.fromName - Sender name (optional)
   * @param {string} options.replyTo - Reply-to email (optional)
   * @param {Object} options.headers - Additional headers (optional)
   * @param {string} options.messageId - Custom message ID (optional)
   * @param {Object} options.tracking - Tracking configuration (optional)
   * @param {number} options.tracking.campaignId - Campaign ID for tracking
   * @param {number} options.tracking.listId - List ID for tracking
   * @param {string} options.tracking.trackingToken - Tracking token for opens/clicks
   * @param {string} options.tracking.unsubscribeToken - Unsubscribe token
   * @returns {Promise<Object>} Send result with messageId
   */
  async sendEmail(options) {
    try {
      const fromEmail = options.from || process.env.SMTP_FROM_EMAIL || 'info@myndsol.com';
      const fromName = options.fromName || process.env.SMTP_FROM_NAME || 'Mynd Solution';

      let htmlContent = options.html;

      // Enhanced compliance headers for Phase 7
      let emailHeaders = {
        'X-Mailer': 'Mynd Solution Email Marketing v1.0',
        'Precedence': 'bulk',
        'X-Entity-Ref-ID': options.messageId || `msg-${Date.now()}`,
        'Return-Path': options.returnPath || fromEmail,
        ...options.headers
      };

      // Validate content if validation is enabled (default: true in production)
      if (options.validateContent !== false && process.env.ENABLE_CONTENT_VALIDATION !== 'false') {
        const validation = contentValidator.validateEmailContent({
          subject: options.subject,
          html: options.html,
          plainText: options.text || ''
        });

        if (!validation.valid && validation.score < 50) {
          logger.warn(`Email content validation failed (score: ${validation.score})`, {
            to: options.to,
            issues: validation.issues
          });

          // Optionally block sending if score is too low
          if (process.env.BLOCK_LOW_SCORE_EMAILS === 'true') {
            return {
              success: false,
              error: 'Email content validation failed',
              validation,
              message: 'Content has too many spam indicators'
            };
          }
        } else if (validation.warnings.length > 0) {
          logger.info(`Email content has warnings (score: ${validation.score})`, {
            to: options.to,
            warnings: validation.warnings
          });
        }
      }

      // Process HTML with tracking if tracking is enabled
      if (options.tracking && options.tracking.campaignId) {
        const { campaignId, listId, trackingToken, unsubscribeToken } = options.tracking;

        // Process HTML: inject pixel, rewrite links, add unsubscribe footer
        htmlContent = processEmailHtml(
          htmlContent,
          campaignId,
          trackingToken,
          unsubscribeToken
        );

        // Add tracking headers
        const trackingHeaders = generateTrackingHeaders(
          campaignId,
          listId,
          unsubscribeToken
        );

        emailHeaders = {
          ...emailHeaders,
          ...trackingHeaders
        };
      }

      const mailOptions = {
        from: `"${fromName}" <${fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: htmlContent,
        text: options.text || this.stripHtml(htmlContent),
        replyTo: options.replyTo || fromEmail,
        headers: emailHeaders
      };

      // Add custom message ID if provided
      if (options.messageId) {
        mailOptions.messageId = options.messageId;
      }

      const info = await this.transporter.sendMail(mailOptions);

      logger.info(`Email sent successfully to ${options.to}`, {
        messageId: info.messageId,
        response: info.response
      });

      return {
        success: true,
        messageId: info.messageId,
        response: info.response
      };
    } catch (error) {
      logger.error(`Failed to send email to ${options.to}:`, error);

      return {
        success: false,
        error: error.message,
        code: error.code,
        response: error.response
      };
    }
  }

  /**
   * Send bulk emails with rate limiting
   * @param {Array<Object>} emails - Array of email options
   * @param {number} rateLimit - Max emails per hour (default: 100)
   * @returns {Promise<Object>} Results summary
   */
  async sendBulk(emails, rateLimit = 100) {
    const results = {
      total: emails.length,
      sent: 0,
      failed: 0,
      errors: []
    };

    const delayMs = (3600 * 1000) / rateLimit; // Calculate delay between emails

    logger.info(`Starting bulk send: ${emails.length} emails at ${rateLimit}/hour`);

    for (const emailOptions of emails) {
      const result = await this.sendEmail(emailOptions);

      if (result.success) {
        results.sent++;
      } else {
        results.failed++;
        results.errors.push({
          to: emailOptions.to,
          error: result.error
        });
      }

      // Rate limiting delay (skip delay for last email)
      if (results.sent + results.failed < emails.length) {
        await this.delay(delayMs);
      }
    }

    logger.info(`Bulk send completed: ${results.sent}/${results.total} sent, ${results.failed} failed`);
    return results;
  }

  /**
   * Strip HTML tags from text (simple implementation)
   * @param {string} html - HTML content
   * @returns {string} Plain text
   */
  stripHtml(html) {
    if (!html) return '';
    return html
      .replace(/<style[^>]*>.*<\/style>/gmi, '')
      .replace(/<script[^>]*>.*<\/script>/gmi, '')
      .replace(/<[^>]+>/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Delay helper for rate limiting
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Parse SMTP error to classify bounce type
   * @param {Error} error - SMTP error
   * @returns {Object} Bounce classification
   */
  classifyBounce(error) {
    const code = error.code || '';
    const message = error.message || '';
    const responseCode = error.responseCode || 0;

    // Hard bounce codes (5xx)
    const hardBounceCodes = ['550', '551', '553', '554'];
    const isHardBounce = hardBounceCodes.some(c => code.startsWith(c) || responseCode.toString().startsWith(c));

    // Soft bounce codes (4xx)
    const softBounceCodes = ['421', '450', '451', '452'];
    const isSoftBounce = softBounceCodes.some(c => code.startsWith(c) || responseCode.toString().startsWith(c));

    // Message-based classification
    const hardBouncePatterns = /user unknown|does not exist|invalid|no such user|undeliverable/i;
    const softBouncePatterns = /mailbox full|quota exceeded|temporarily|try again later/i;

    let type = 'unknown';
    let reason = message;

    if (isHardBounce || hardBouncePatterns.test(message)) {
      type = 'hard';
      reason = 'Invalid or non-existent email address';
    } else if (isSoftBounce || softBouncePatterns.test(message)) {
      type = 'soft';
      reason = 'Temporary delivery failure';
    }

    return {
      type,
      reason,
      code: code || responseCode.toString(),
      originalMessage: message
    };
  }
}

// Export singleton instance
module.exports = new EmailService();
