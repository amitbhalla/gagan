const CampaignModel = require('../models/campaign.model');
const MessageModel = require('../models/message.model');
const ListModel = require('../models/list.model');
const ContactModel = require('../models/contact.model');
const TemplateModel = require('../models/template.model');
const unsubscribeModel = require('../models/unsubscribe.model');
const queueService = require('./queue.service');
const { personalizeContent } = require('../utils/personalize');
const logger = require('../config/logger');

class CampaignService {
  /**
   * Send a campaign immediately
   * @param {number} campaignId - Campaign ID
   * @returns {Object} Send result
   */
  async sendCampaign(campaignId) {
    try {
      logger.info(`Starting campaign send: ${campaignId}`);

      // Validate campaign
      const validation = CampaignModel.validate(campaignId);
      if (!validation.valid) {
        throw new Error(`Campaign validation failed: ${validation.errors.join(', ')}`);
      }

      // Get campaign with full details
      const campaign = CampaignModel.getById(campaignId);

      if (!campaign) {
        throw new Error(`Campaign ${campaignId} not found`);
      }

      // Update campaign status to 'sending'
      CampaignModel.updateStatus(campaignId, 'sending');

      // Get all active subscribers from the list
      const subscribers = ListModel.getSubscribers(campaign.list_id);

      if (subscribers.length === 0) {
        throw new Error('No active subscribers found in list');
      }

      logger.info(`Found ${subscribers.length} subscribers for campaign ${campaignId}`);

      // Create message records for all subscribers
      const contactIds = subscribers.map(sub => sub.contact_id);
      MessageModel.bulkCreate(campaignId, contactIds);

      // Get all pending messages with full data
      const messages = MessageModel.getByCampaign(campaignId, { status: 'pending', limit: 10000 });

      logger.info(`Created ${messages.length} messages for campaign ${campaignId}`);

      // Prepare email jobs for each message
      const emailJobs = messages.map(message => {
        // Get subscriber's custom field values
        const subscriber = subscribers.find(sub => sub.contact_id === message.contact_id);
        const customFieldValues = this.parseCustomFieldValues(subscriber?.custom_field_values);

        // Personalize subject and body
        const personalizedSubject = personalizeContent(
          campaign.template_subject,
          {
            email: message.contact_email,
            first_name: message.first_name,
            last_name: message.last_name
          },
          customFieldValues
        );

        const personalizedBody = personalizeContent(
          campaign.template_body,
          {
            email: message.contact_email,
            first_name: message.first_name,
            last_name: message.last_name
          },
          customFieldValues
        );

        // Generate unsubscribe token for this contact/list/campaign
        const unsubscribeToken = unsubscribeModel.createToken(
          message.contact_id,
          campaign.list_id,
          campaignId
        );

        return {
          messageId: message.id,
          email: message.contact_email,
          subject: personalizedSubject,
          html: personalizedBody,
          from: campaign.from_email,
          fromName: campaign.from_name,
          replyTo: campaign.reply_to,
          headers: {
            'X-Campaign-ID': campaignId.toString(),
            'X-Message-ID': message.id.toString()
          },
          // Add tracking configuration
          tracking: {
            campaignId: campaignId,
            listId: campaign.list_id,
            trackingToken: message.tracking_token,
            unsubscribeToken: unsubscribeToken
          }
        };
      });

      // Bulk enqueue all email jobs
      const jobsCreated = queueService.bulkEnqueueEmails(emailJobs);

      logger.info(`Enqueued ${jobsCreated} email jobs for campaign ${campaignId}`);

      return {
        success: true,
        campaignId,
        messagesCreated: messages.length,
        jobsEnqueued: jobsCreated,
        subscribers: subscribers.length
      };
    } catch (error) {
      logger.error(`Error sending campaign ${campaignId}:`, error);

      // Update campaign status to failed
      try {
        CampaignModel.updateStatus(campaignId, 'draft');
      } catch (e) {
        logger.error('Failed to revert campaign status:', e);
      }

      throw error;
    }
  }

  /**
   * Send a test email for campaign
   * @param {number} campaignId - Campaign ID
   * @param {string} testEmail - Test recipient email
   * @returns {Object} Send result
   */
  async sendTestEmail(campaignId, testEmail) {
    try {
      logger.info(`Sending test email for campaign ${campaignId} to ${testEmail}`);

      const campaign = CampaignModel.getById(campaignId);

      if (!campaign) {
        throw new Error(`Campaign ${campaignId} not found`);
      }

      // Use sample data for personalization
      const sampleContact = {
        email: testEmail,
        first_name: 'John',
        last_name: 'Doe'
      };

      const sampleCustomFields = {
        company: 'Acme Corp',
        industry: 'Technology'
      };

      const personalizedSubject = personalizeContent(
        campaign.template_subject,
        sampleContact,
        sampleCustomFields
      );

      const personalizedBody = personalizeContent(
        campaign.template_body,
        sampleContact,
        sampleCustomFields
      );

      // Add test email banner
      const testBanner = `
        <div style="background: #ff9800; color: white; padding: 10px; text-align: center; font-family: Arial, sans-serif;">
          <strong>⚠️ TEST EMAIL</strong> - This is a preview of your campaign
        </div>
      `;

      const testBody = testBanner + personalizedBody;

      // Send directly without queueing
      const emailService = require('./email.service');
      const result = await emailService.sendEmail({
        to: testEmail,
        subject: `[TEST] ${personalizedSubject}`,
        html: testBody,
        from: campaign.from_email,
        fromName: campaign.from_name,
        replyTo: campaign.reply_to,
        headers: {
          'X-Campaign-ID': campaignId.toString(),
          'X-Test-Email': 'true'
        }
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      logger.info(`Test email sent successfully for campaign ${campaignId}`);

      return {
        success: true,
        campaignId,
        testEmail,
        messageId: result.messageId
      };
    } catch (error) {
      logger.error(`Error sending test email for campaign ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Schedule a campaign for later
   * @param {number} campaignId - Campaign ID
   * @param {string} scheduledAt - ISO 8601 datetime
   * @returns {Object} Scheduled campaign
   */
  async scheduleCampaign(campaignId, scheduledAt) {
    try {
      // Validate campaign
      const validation = CampaignModel.validate(campaignId);
      if (!validation.valid) {
        throw new Error(`Campaign validation failed: ${validation.errors.join(', ')}`);
      }

      // Validate scheduled time is in future
      const scheduledDate = new Date(scheduledAt);
      if (scheduledDate <= new Date()) {
        throw new Error('Scheduled time must be in the future');
      }

      // Update campaign status and scheduled_at
      const campaign = CampaignModel.updateStatus(campaignId, 'scheduled', {
        scheduled_at: scheduledAt
      });

      logger.info(`Campaign ${campaignId} scheduled for ${scheduledAt}`);

      return {
        success: true,
        campaign
      };
    } catch (error) {
      logger.error(`Error scheduling campaign ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Cancel a scheduled campaign
   * @param {number} campaignId - Campaign ID
   * @returns {Object} Updated campaign
   */
  async cancelScheduledCampaign(campaignId) {
    try {
      const campaign = CampaignModel.getById(campaignId);

      if (!campaign) {
        throw new Error(`Campaign ${campaignId} not found`);
      }

      if (campaign.status !== 'scheduled') {
        throw new Error('Only scheduled campaigns can be cancelled');
      }

      // Revert to draft status
      const updated = CampaignModel.updateStatus(campaignId, 'draft', {
        scheduled_at: null
      });

      logger.info(`Campaign ${campaignId} schedule cancelled`);

      return {
        success: true,
        campaign: updated
      };
    } catch (error) {
      logger.error(`Error cancelling campaign ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Get campaign statistics and progress
   * @param {number} campaignId - Campaign ID
   * @returns {Object} Campaign stats
   */
  getCampaignStats(campaignId) {
    try {
      const stats = CampaignModel.getStats(campaignId);
      const campaign = CampaignModel.getById(campaignId);

      // Calculate percentages
      const total = stats.total || 1; // Avoid division by zero
      const progress = {
        ...stats,
        sentPercentage: ((stats.sent / total) * 100).toFixed(2),
        deliveredPercentage: ((stats.delivered / total) * 100).toFixed(2),
        failedPercentage: ((stats.failed / total) * 100).toFixed(2),
        bouncedPercentage: ((stats.bounced / total) * 100).toFixed(2),
        pendingPercentage: ((stats.pending / total) * 100).toFixed(2)
      };

      return {
        campaign: {
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          started_at: campaign.started_at,
          completed_at: campaign.completed_at
        },
        stats: progress
      };
    } catch (error) {
      logger.error(`Error getting campaign stats ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Check and update completed campaigns
   * Updates campaign status to 'sent' when all messages are processed
   * @param {number} campaignId - Campaign ID
   */
  checkCampaignCompletion(campaignId) {
    try {
      const campaign = CampaignModel.getById(campaignId);

      if (!campaign || campaign.status !== 'sending') {
        return;
      }

      const stats = CampaignModel.getStats(campaignId);

      // Check if all messages are processed (no pending)
      if (stats.pending === 0 && stats.total > 0) {
        CampaignModel.updateStatus(campaignId, 'sent');
        logger.info(`Campaign ${campaignId} completed: ${stats.sent}/${stats.total} sent`);
      }
    } catch (error) {
      logger.error(`Error checking campaign completion ${campaignId}:`, error);
    }
  }

  /**
   * Parse custom field values from JSON string
   * @param {string|Object} customFieldValues - Custom field values
   * @returns {Object} Parsed values
   */
  parseCustomFieldValues(customFieldValues) {
    if (!customFieldValues) return {};

    if (typeof customFieldValues === 'string') {
      try {
        return JSON.parse(customFieldValues);
      } catch (e) {
        return {};
      }
    }

    return customFieldValues;
  }

  /**
   * Preview personalization for campaign
   * @param {number} campaignId - Campaign ID
   * @param {Object} sampleData - Sample contact and custom field data
   * @returns {Object} Preview data
   */
  previewCampaign(campaignId, sampleData = {}) {
    try {
      const campaign = CampaignModel.getById(campaignId);

      if (!campaign) {
        throw new Error(`Campaign ${campaignId} not found`);
      }

      const defaultContact = {
        email: sampleData.email || 'john.doe@example.com',
        first_name: sampleData.first_name || 'John',
        last_name: sampleData.last_name || 'Doe'
      };

      const defaultCustomFields = sampleData.customFields || {};

      const personalizedSubject = personalizeContent(
        campaign.template_subject,
        defaultContact,
        defaultCustomFields
      );

      const personalizedBody = personalizeContent(
        campaign.template_body,
        defaultContact,
        defaultCustomFields
      );

      return {
        campaign: {
          id: campaign.id,
          name: campaign.name,
          from: `${campaign.from_name} <${campaign.from_email}>`
        },
        preview: {
          subject: personalizedSubject,
          body: personalizedBody,
          sampleData: {
            contact: defaultContact,
            customFields: defaultCustomFields
          }
        }
      };
    } catch (error) {
      logger.error(`Error previewing campaign ${campaignId}:`, error);
      throw error;
    }
  }
}

module.exports = new CampaignService();
