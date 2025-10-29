/**
 * Analytics Controller
 * Handles analytics and reporting endpoints
 */

const { db } = require('../config/database');
const {
  calculateCampaignMetrics,
  generateTimeSeries,
  getTopLinks,
  getDeviceBreakdown,
  compareCampaigns,
  calculateEngagementScore,
  formatMetricsForExport
} = require('../utils/analytics');
const logger = require('../config/logger');

/**
 * Get detailed analytics for a specific campaign
 * GET /api/analytics/campaigns/:id
 */
exports.getCampaignAnalytics = async (req, res) => {
  try {
    const { id } = req.params;

    // Get campaign
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Get all messages for this campaign
    const messages = db.prepare('SELECT * FROM messages WHERE campaign_id = ?').all(id);

    // Get all events for this campaign
    const events = db.prepare(`
      SELECT me.* FROM message_events me
      INNER JOIN messages m ON me.message_id = m.id
      WHERE m.campaign_id = ?
    `).all(id);

    // Calculate metrics
    const metrics = calculateCampaignMetrics(campaign, messages, events);

    res.json({
      campaignId: campaign.id,
      campaignName: campaign.name,
      status: campaign.status,
      createdAt: campaign.created_at,
      startedAt: campaign.started_at,
      completedAt: campaign.completed_at,
      ...metrics
    });
  } catch (error) {
    logger.error('Error getting campaign analytics:', error);
    res.status(500).json({ error: 'Failed to get campaign analytics' });
  }
};

/**
 * Get time-series data for campaign (opens/clicks over time)
 * GET /api/analytics/campaigns/:id/timeline?interval=hour|day
 */
exports.getCampaignTimeline = async (req, res) => {
  try {
    const { id } = req.params;
    const { interval = 'hour' } = req.query;

    // Validate interval
    if (!['hour', 'day'].includes(interval)) {
      return res.status(400).json({ error: 'Invalid interval. Use "hour" or "day"' });
    }

    // Get events for this campaign
    const events = db.prepare(`
      SELECT me.* FROM message_events me
      INNER JOIN messages m ON me.message_id = m.id
      WHERE m.campaign_id = ? AND me.event_type IN ('opened', 'clicked')
      ORDER BY me.created_at ASC
    `).all(id);

    const timeline = generateTimeSeries(events, interval);

    res.json({
      campaignId: id,
      interval,
      data: timeline
    });
  } catch (error) {
    logger.error('Error getting campaign timeline:', error);
    res.status(500).json({ error: 'Failed to get campaign timeline' });
  }
};

/**
 * Get top clicked links for a campaign
 * GET /api/analytics/campaigns/:id/top-links?limit=10
 */
exports.getTopClickedLinks = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 10 } = req.query;

    // Get all links for this campaign
    const links = db.prepare('SELECT * FROM links WHERE campaign_id = ?').all(id);

    // Get all click events for this campaign
    const clickEvents = db.prepare(`
      SELECT me.* FROM message_events me
      INNER JOIN messages m ON me.message_id = m.id
      WHERE m.campaign_id = ? AND me.event_type = 'clicked'
    `).all(id);

    const topLinks = getTopLinks(links, clickEvents, parseInt(limit));

    res.json({
      campaignId: id,
      links: topLinks
    });
  } catch (error) {
    logger.error('Error getting top clicked links:', error);
    res.status(500).json({ error: 'Failed to get top clicked links' });
  }
};

/**
 * Get device breakdown for campaign
 * GET /api/analytics/campaigns/:id/devices
 */
exports.getDeviceBreakdown = async (req, res) => {
  try {
    const { id } = req.params;

    // Get all events for this campaign with user agents
    const events = db.prepare(`
      SELECT me.* FROM message_events me
      INNER JOIN messages m ON me.message_id = m.id
      WHERE m.campaign_id = ? AND me.event_type = 'opened'
    `).all(id);

    const breakdown = getDeviceBreakdown(events);

    res.json({
      campaignId: id,
      ...breakdown
    });
  } catch (error) {
    logger.error('Error getting device breakdown:', error);
    res.status(500).json({ error: 'Failed to get device breakdown' });
  }
};

/**
 * Compare multiple campaigns
 * GET /api/analytics/campaigns/compare?ids=1,2,3
 */
exports.compareCampaigns = async (req, res) => {
  try {
    const { ids } = req.query;

    if (!ids) {
      return res.status(400).json({ error: 'Campaign IDs are required' });
    }

    const campaignIds = ids.split(',').map(id => id.trim());

    if (campaignIds.length < 2) {
      return res.status(400).json({ error: 'At least 2 campaign IDs are required for comparison' });
    }

    if (campaignIds.length > 10) {
      return res.status(400).json({ error: 'Maximum 10 campaigns can be compared at once' });
    }

    const campaignsData = [];

    for (const id of campaignIds) {
      const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
      if (!campaign) {
        logger.warn(`Campaign ${id} not found, skipping`);
        continue;
      }

      const messages = db.prepare('SELECT * FROM messages WHERE campaign_id = ?').all(id);
      const events = db.prepare(`
        SELECT me.* FROM message_events me
        INNER JOIN messages m ON me.message_id = m.id
        WHERE m.campaign_id = ?
      `).all(id);

      campaignsData.push({ campaign, messages, events });
    }

    const comparison = compareCampaigns(campaignsData);

    res.json({
      campaigns: comparison
    });
  } catch (error) {
    logger.error('Error comparing campaigns:', error);
    res.status(500).json({ error: 'Failed to compare campaigns' });
  }
};

/**
 * Export campaign analytics to CSV
 * GET /api/analytics/campaigns/:id/export
 */
exports.exportCampaignAnalytics = async (req, res) => {
  try {
    const { id } = req.params;

    // Get campaign
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Get messages and events
    const messages = db.prepare('SELECT * FROM messages WHERE campaign_id = ?').all(id);
    const events = db.prepare(`
      SELECT me.* FROM message_events me
      INNER JOIN messages m ON me.message_id = m.id
      WHERE m.campaign_id = ?
    `).all(id);

    // Calculate metrics
    const metrics = calculateCampaignMetrics(campaign, messages, events);
    const csvData = formatMetricsForExport(metrics);

    // Build CSV content
    let csv = 'Campaign Analytics Report\n\n';
    csv += `Campaign: ${campaign.name}\n`;
    csv += `Status: ${campaign.status}\n`;
    csv += `Created: ${new Date(campaign.created_at).toLocaleString()}\n`;
    csv += `Started: ${campaign.started_at ? new Date(campaign.started_at).toLocaleString() : 'N/A'}\n`;
    csv += `Completed: ${campaign.completed_at ? new Date(campaign.completed_at).toLocaleString() : 'N/A'}\n\n`;

    csv += 'Metric,Value\n';
    Object.entries(csvData).forEach(([key, value]) => {
      csv += `"${key}","${value}"\n`;
    });

    // Set headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="campaign-${id}-analytics.csv"`);
    res.send(csv);
  } catch (error) {
    logger.error('Error exporting campaign analytics:', error);
    res.status(500).json({ error: 'Failed to export campaign analytics' });
  }
};

/**
 * Export campaign events to CSV
 * GET /api/analytics/campaigns/:id/export-events
 */
exports.exportCampaignEvents = async (req, res) => {
  try {
    const { id } = req.params;

    // Get campaign
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Get all events with contact info
    const events = db.prepare(`
      SELECT
        me.event_type,
        me.created_at,
        me.ip_address,
        me.user_agent,
        me.event_data,
        c.email,
        c.first_name,
        c.last_name,
        m.message_id
      FROM message_events me
      INNER JOIN messages m ON me.message_id = m.id
      INNER JOIN contacts c ON m.contact_id = c.id
      WHERE m.campaign_id = ?
      ORDER BY me.created_at ASC
    `).all(id);

    // Build CSV
    let csv = 'Event Type,Timestamp,Email,First Name,Last Name,IP Address,User Agent,Event Data,Message ID\n';

    events.forEach(event => {
      const eventData = typeof event.event_data === 'string'
        ? event.event_data
        : JSON.stringify(event.event_data);

      csv += `"${event.event_type}",`;
      csv += `"${new Date(event.created_at).toISOString()}",`;
      csv += `"${event.email}",`;
      csv += `"${event.first_name || ''}",`;
      csv += `"${event.last_name || ''}",`;
      csv += `"${event.ip_address || ''}",`;
      csv += `"${event.user_agent || ''}",`;
      csv += `"${eventData}",`;
      csv += `"${event.message_id}"\n`;
    });

    // Set headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="campaign-${id}-events.csv"`);
    res.send(csv);
  } catch (error) {
    logger.error('Error exporting campaign events:', error);
    res.status(500).json({ error: 'Failed to export campaign events' });
  }
};

/**
 * Get overall statistics across all campaigns
 * GET /api/analytics/overview
 */
exports.getOverviewAnalytics = async (req, res) => {
  try {
    // Get all campaigns
    const campaigns = db.prepare('SELECT * FROM campaigns').all();
    const totalCampaigns = campaigns.length;
    const activeCampaigns = campaigns.filter(c => c.status === 'sending').length;
    const completedCampaigns = campaigns.filter(c => c.status === 'sent').length;

    // Get all messages
    const allMessages = db.prepare('SELECT * FROM messages').all();
    const totalSent = allMessages.filter(m => ['sent', 'delivered'].includes(m.status)).length;
    const totalDelivered = allMessages.filter(m => m.status === 'delivered').length;
    const totalBounced = allMessages.filter(m => m.status === 'bounced').length;

    // Get all events
    const allEvents = db.prepare('SELECT * FROM message_events').all();
    const totalOpens = allEvents.filter(e => e.event_type === 'opened').length;
    const totalClicks = allEvents.filter(e => e.event_type === 'clicked').length;
    const totalUnsubscribes = allEvents.filter(e => e.event_type === 'unsubscribed').length;

    // Get unique stats
    const uniqueOpens = new Set(allEvents.filter(e => e.event_type === 'opened').map(e => e.message_id)).size;
    const uniqueClicks = new Set(allEvents.filter(e => e.event_type === 'clicked').map(e => e.message_id)).size;

    // Calculate overall rates
    const overallOpenRate = totalDelivered > 0 ? ((uniqueOpens / totalDelivered) * 100).toFixed(2) : 0;
    const overallClickRate = totalDelivered > 0 ? ((uniqueClicks / totalDelivered) * 100).toFixed(2) : 0;
    const overallBounceRate = totalSent > 0 ? ((totalBounced / totalSent) * 100).toFixed(2) : 0;

    // Get recent campaigns (last 5)
    const recentCampaigns = db.prepare(`
      SELECT * FROM campaigns
      ORDER BY created_at DESC
      LIMIT 5
    `).all();

    const recentCampaignsData = [];
    for (const campaign of recentCampaigns) {
      const messages = db.prepare('SELECT * FROM messages WHERE campaign_id = ?').all(campaign.id);
      const events = db.prepare(`
        SELECT me.* FROM message_events me
        INNER JOIN messages m ON me.message_id = m.id
        WHERE m.campaign_id = ?
      `).all(campaign.id);

      const metrics = calculateCampaignMetrics(campaign, messages, events);
      recentCampaignsData.push({
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        createdAt: campaign.created_at,
        ...metrics
      });
    }

    res.json({
      summary: {
        totalCampaigns,
        activeCampaigns,
        completedCampaigns,
        totalSent,
        totalDelivered,
        totalBounced,
        totalOpens,
        uniqueOpens,
        totalClicks,
        uniqueClicks,
        totalUnsubscribes,
        overallOpenRate: parseFloat(overallOpenRate),
        overallClickRate: parseFloat(overallClickRate),
        overallBounceRate: parseFloat(overallBounceRate)
      },
      recentCampaigns: recentCampaignsData
    });
  } catch (error) {
    logger.error('Error getting overview analytics:', error);
    res.status(500).json({ error: 'Failed to get overview analytics' });
  }
};

/**
 * Get contact engagement scores
 * GET /api/analytics/contacts/engagement
 */
exports.getContactEngagement = async (req, res) => {
  try {
    const { limit = 100, minScore = 0 } = req.query;

    // Get all contacts
    const contacts = db.prepare(`
      SELECT * FROM contacts
      WHERE status = 'active'
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(parseInt(limit));

    const engagementData = contacts.map(contact => {
      // Get all events for this contact
      const events = db.prepare(`
        SELECT me.* FROM message_events me
        INNER JOIN messages m ON me.message_id = m.id
        WHERE m.contact_id = ?
      `).all(contact.id);

      // Get last message date
      const lastMessage = db.prepare(`
        SELECT sent_at FROM messages
        WHERE contact_id = ? AND sent_at IS NOT NULL
        ORDER BY sent_at DESC
        LIMIT 1
      `).get(contact.id);

      const daysSinceLastCampaign = lastMessage
        ? Math.floor((Date.now() - new Date(lastMessage.sent_at)) / (1000 * 60 * 60 * 24))
        : 999;

      const score = calculateEngagementScore(events, daysSinceLastCampaign);

      return {
        id: contact.id,
        email: contact.email,
        firstName: contact.first_name,
        lastName: contact.last_name,
        engagementScore: score,
        totalOpens: events.filter(e => e.event_type === 'opened').length,
        totalClicks: events.filter(e => e.event_type === 'clicked').length,
        lastActivity: events.length > 0
          ? events.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0].created_at
          : null,
        daysSinceLastCampaign
      };
    });

    // Filter by minimum score
    const filtered = engagementData
      .filter(c => c.engagementScore >= parseInt(minScore))
      .sort((a, b) => b.engagementScore - a.engagementScore);

    res.json({
      contacts: filtered,
      total: filtered.length
    });
  } catch (error) {
    logger.error('Error getting contact engagement:', error);
    res.status(500).json({ error: 'Failed to get contact engagement' });
  }
};

/**
 * Export contact engagement scores to CSV
 * GET /api/analytics/contacts/engagement/export
 */
exports.exportContactEngagement = async (req, res) => {
  try {
    // Get all active contacts
    const contacts = db.prepare(`
      SELECT * FROM contacts
      WHERE status = 'active'
      ORDER BY updated_at DESC
    `).all();

    // Build CSV
    let csv = 'Email,First Name,Last Name,Engagement Score,Total Opens,Total Clicks,Last Activity,Days Since Last Campaign\n';

    contacts.forEach(contact => {
      // Get all events for this contact
      const events = db.prepare(`
        SELECT me.* FROM message_events me
        INNER JOIN messages m ON me.message_id = m.id
        WHERE m.contact_id = ?
      `).all(contact.id);

      // Get last message date
      const lastMessage = db.prepare(`
        SELECT sent_at FROM messages
        WHERE contact_id = ? AND sent_at IS NOT NULL
        ORDER BY sent_at DESC
        LIMIT 1
      `).get(contact.id);

      const daysSinceLastCampaign = lastMessage
        ? Math.floor((Date.now() - new Date(lastMessage.sent_at)) / (1000 * 60 * 60 * 24))
        : 999;

      const score = calculateEngagementScore(events, daysSinceLastCampaign);
      const totalOpens = events.filter(e => e.event_type === 'opened').length;
      const totalClicks = events.filter(e => e.event_type === 'clicked').length;
      const lastActivity = events.length > 0
        ? new Date(events.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0].created_at).toISOString()
        : 'Never';

      csv += `"${contact.email}",`;
      csv += `"${contact.first_name || ''}",`;
      csv += `"${contact.last_name || ''}",`;
      csv += `"${score}",`;
      csv += `"${totalOpens}",`;
      csv += `"${totalClicks}",`;
      csv += `"${lastActivity}",`;
      csv += `"${daysSinceLastCampaign}"\n`;
    });

    // Set headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="contact-engagement.csv"');
    res.send(csv);
  } catch (error) {
    logger.error('Error exporting contact engagement:', error);
    res.status(500).json({ error: 'Failed to export contact engagement' });
  }
};

module.exports = exports;
