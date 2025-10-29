const CampaignModel = require('../models/campaign.model');
const campaignService = require('../services/campaign.service');
const queueService = require('../services/queue.service');
const linkModel = require('../models/link.model');
const { db } = require('../config/database');
const logger = require('../config/logger');

/**
 * Get all campaigns
 */
exports.getCampaigns = (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const status = req.query.status;

    const campaigns = CampaignModel.getAll(limit, offset, status);
    const total = CampaignModel.count(status);

    res.json({
      campaigns,
      total,
      limit,
      offset
    });
  } catch (error) {
    logger.error('Error getting campaigns:', error);
    res.status(500).json({ error: 'Failed to retrieve campaigns' });
  }
};

/**
 * Get campaign by ID
 */
exports.getCampaignById = (req, res) => {
  try {
    const { id } = req.params;
    const campaign = CampaignModel.getById(id);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json(campaign);
  } catch (error) {
    logger.error(`Error getting campaign ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to retrieve campaign' });
  }
};

/**
 * Create new campaign
 */
exports.createCampaign = (req, res) => {
  try {
    const { name, template_id, list_id, from_email, from_name, reply_to } = req.body;

    // Validation
    if (!name || !template_id || !list_id || !from_email || !from_name) {
      return res.status(400).json({
        error: 'Missing required fields: name, template_id, list_id, from_email, from_name'
      });
    }

    const campaign = CampaignModel.create({
      name,
      template_id,
      list_id,
      from_email,
      from_name,
      reply_to: reply_to || from_email,
      status: 'draft'
    });

    logger.info(`Campaign created: ${campaign.id}`);
    res.status(201).json(campaign);
  } catch (error) {
    logger.error('Error creating campaign:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
};

/**
 * Update campaign
 */
exports.updateCampaign = (req, res) => {
  try {
    const { id } = req.params;
    const campaign = CampaignModel.getById(id);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Prevent updating sent campaigns
    if (campaign.status === 'sent' || campaign.status === 'sending') {
      return res.status(400).json({
        error: 'Cannot update campaign that is being sent or has been sent'
      });
    }

    const updated = CampaignModel.update(id, req.body);
    logger.info(`Campaign updated: ${id}`);

    res.json(updated);
  } catch (error) {
    logger.error(`Error updating campaign ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to update campaign' });
  }
};

/**
 * Delete campaign
 */
exports.deleteCampaign = (req, res) => {
  try {
    const { id } = req.params;
    const campaign = CampaignModel.getById(id);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Prevent deleting active campaigns
    if (campaign.status === 'sending') {
      return res.status(400).json({
        error: 'Cannot delete campaign that is currently being sent'
      });
    }

    CampaignModel.delete(id);
    logger.info(`Campaign deleted: ${id}`);

    res.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    logger.error(`Error deleting campaign ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
};

/**
 * Send campaign immediately
 */
exports.sendCampaign = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await campaignService.sendCampaign(id);

    res.json({
      message: 'Campaign sending started',
      ...result
    });
  } catch (error) {
    logger.error(`Error sending campaign ${req.params.id}:`, error);
    res.status(500).json({ error: error.message || 'Failed to send campaign' });
  }
};

/**
 * Send test email
 */
exports.sendTestEmail = async (req, res) => {
  try {
    const { id } = req.params;
    const { test_email } = req.body;

    if (!test_email) {
      return res.status(400).json({ error: 'test_email is required' });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(test_email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const result = await campaignService.sendTestEmail(id, test_email);

    res.json({
      message: 'Test email sent successfully',
      ...result
    });
  } catch (error) {
    logger.error(`Error sending test email for campaign ${req.params.id}:`, error);
    res.status(500).json({ error: error.message || 'Failed to send test email' });
  }
};

/**
 * Schedule campaign
 */
exports.scheduleCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const { scheduled_at } = req.body;

    if (!scheduled_at) {
      return res.status(400).json({ error: 'scheduled_at is required (ISO 8601 format)' });
    }

    const result = await campaignService.scheduleCampaign(id, scheduled_at);

    res.json({
      message: 'Campaign scheduled successfully',
      ...result
    });
  } catch (error) {
    logger.error(`Error scheduling campaign ${req.params.id}:`, error);
    res.status(500).json({ error: error.message || 'Failed to schedule campaign' });
  }
};

/**
 * Cancel scheduled campaign
 */
exports.cancelSchedule = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await campaignService.cancelScheduledCampaign(id);

    res.json({
      message: 'Campaign schedule cancelled',
      ...result
    });
  } catch (error) {
    logger.error(`Error cancelling campaign schedule ${req.params.id}:`, error);
    res.status(500).json({ error: error.message || 'Failed to cancel schedule' });
  }
};

/**
 * Get campaign statistics
 */
exports.getCampaignStats = (req, res) => {
  try {
    const { id } = req.params;

    const stats = campaignService.getCampaignStats(id);

    res.json(stats);
  } catch (error) {
    logger.error(`Error getting campaign stats ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to retrieve campaign statistics' });
  }
};

/**
 * Preview campaign with sample data
 */
exports.previewCampaign = (req, res) => {
  try {
    const { id } = req.params;
    const sampleData = req.body;

    const preview = campaignService.previewCampaign(id, sampleData);

    res.json(preview);
  } catch (error) {
    logger.error(`Error previewing campaign ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to preview campaign' });
  }
};

/**
 * Get queue status
 */
exports.getQueueStatus = (req, res) => {
  try {
    const status = queueService.getStatus();
    res.json(status);
  } catch (error) {
    logger.error('Error getting queue status:', error);
    res.status(500).json({ error: 'Failed to retrieve queue status' });
  }
};

/**
 * Get events for a campaign
 */
exports.getCampaignEvents = (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const eventType = req.query.event_type; // Filter by event type: opened, clicked, unsubscribed

    let query = `
      SELECT
        me.*,
        m.contact_id,
        c.email,
        c.first_name,
        c.last_name
      FROM message_events me
      JOIN messages m ON me.message_id = m.id
      JOIN contacts c ON m.contact_id = c.id
      WHERE m.campaign_id = ?
    `;

    const params = [id];

    if (eventType) {
      query += ` AND me.event_type = ?`;
      params.push(eventType);
    }

    query += ` ORDER BY me.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const stmt = db.prepare(query);
    const events = stmt.all(...params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM message_events me
      JOIN messages m ON me.message_id = m.id
      WHERE m.campaign_id = ?
    `;

    const countParams = [id];
    if (eventType) {
      countQuery += ` AND me.event_type = ?`;
      countParams.push(eventType);
    }

    const countStmt = db.prepare(countQuery);
    const { total } = countStmt.get(...countParams);

    res.json({
      events,
      total,
      limit,
      offset
    });
  } catch (error) {
    logger.error(`Error getting campaign events ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to retrieve campaign events' });
  }
};

/**
 * Get events for a specific message
 */
exports.getMessageEvents = (req, res) => {
  try {
    const { id } = req.params; // message ID

    const stmt = db.prepare(`
      SELECT *
      FROM message_events
      WHERE message_id = ?
      ORDER BY created_at DESC
    `);

    const events = stmt.all(id);

    res.json({ events });
  } catch (error) {
    logger.error(`Error getting message events ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to retrieve message events' });
  }
};

/**
 * Get link statistics for a campaign
 */
exports.getCampaignLinks = (req, res) => {
  try {
    const { id } = req.params;

    const links = linkModel.findByCampaignId(id);

    res.json({ links });
  } catch (error) {
    logger.error(`Error getting campaign links ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to retrieve campaign links' });
  }
};
