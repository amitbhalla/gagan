/**
 * Analytics Utility Functions
 * Provides calculations for campaign analytics metrics
 */

const UAParser = require('ua-parser-js');

/**
 * Calculate campaign aggregate metrics
 * @param {Object} campaign - Campaign object
 * @param {Array} messages - Array of message records
 * @param {Array} events - Array of event records
 * @returns {Object} Aggregate metrics
 */
function calculateCampaignMetrics(campaign, messages, events) {
  const total = messages.length;
  const sent = messages.filter(m => ['sent', 'delivered'].includes(m.status)).length;
  const delivered = messages.filter(m => m.status === 'delivered').length;
  const bounced = messages.filter(m => m.status === 'bounced').length;
  const failed = messages.filter(m => m.status === 'failed').length;
  const pending = messages.filter(m => m.status === 'pending').length;

  // Get unique opens, clicks, unsubscribes
  const openEvents = events.filter(e => e.event_type === 'opened');
  const clickEvents = events.filter(e => e.event_type === 'clicked');
  const unsubscribeEvents = events.filter(e => e.event_type === 'unsubscribed');

  const uniqueOpens = new Set(openEvents.map(e => e.message_id)).size;
  const totalOpens = openEvents.length;

  const uniqueClicks = new Set(clickEvents.map(e => e.message_id)).size;
  const totalClicks = clickEvents.length;

  const unsubscribes = new Set(unsubscribeEvents.map(e => e.message_id)).size;

  // Calculate rates (avoid division by zero)
  const openRate = delivered > 0 ? (uniqueOpens / delivered) * 100 : 0;
  const clickRate = delivered > 0 ? (uniqueClicks / delivered) * 100 : 0;
  const ctor = uniqueOpens > 0 ? (uniqueClicks / uniqueOpens) * 100 : 0;
  const unsubscribeRate = delivered > 0 ? (unsubscribes / delivered) * 100 : 0;
  const bounceRate = sent > 0 ? (bounced / sent) * 100 : 0;

  return {
    total,
    sent,
    delivered,
    bounced,
    failed,
    pending,
    uniqueOpens,
    totalOpens,
    openRate: parseFloat(openRate.toFixed(2)),
    uniqueClicks,
    totalClicks,
    clickRate: parseFloat(clickRate.toFixed(2)),
    ctor: parseFloat(ctor.toFixed(2)),
    unsubscribes,
    unsubscribeRate: parseFloat(unsubscribeRate.toFixed(2)),
    bounceRate: parseFloat(bounceRate.toFixed(2))
  };
}

/**
 * Generate time-series data for opens and clicks
 * @param {Array} events - Array of event records
 * @param {string} interval - 'hour' or 'day'
 * @returns {Array} Time-series data
 */
function generateTimeSeries(events, interval = 'hour') {
  const timeMap = new Map();

  events.forEach(event => {
    const date = new Date(event.created_at);
    let key;

    if (interval === 'hour') {
      // Group by hour
      key = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()).toISOString();
    } else {
      // Group by day
      key = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
    }

    if (!timeMap.has(key)) {
      timeMap.set(key, { timestamp: key, opens: 0, clicks: 0 });
    }

    const data = timeMap.get(key);
    if (event.event_type === 'opened') {
      data.opens++;
    } else if (event.event_type === 'clicked') {
      data.clicks++;
    }
  });

  return Array.from(timeMap.values()).sort((a, b) =>
    new Date(a.timestamp) - new Date(b.timestamp)
  );
}

/**
 * Get top clicked links with statistics
 * @param {Array} links - Array of link records with click counts
 * @param {Array} clickEvents - Array of click events
 * @param {number} limit - Number of top links to return
 * @returns {Array} Top links with stats
 */
function getTopLinks(links, clickEvents, limit = 10) {
  const linkStats = links.map(link => {
    const linkClicks = clickEvents.filter(e => {
      const eventData = typeof e.event_data === 'string'
        ? JSON.parse(e.event_data)
        : e.event_data;
      return eventData.short_code === link.short_code;
    });

    const totalClicks = linkClicks.length;
    const uniqueClicks = new Set(linkClicks.map(e => e.message_id)).size;

    return {
      url: link.original_url,
      shortCode: link.short_code,
      totalClicks,
      uniqueClicks
    };
  });

  return linkStats
    .sort((a, b) => b.totalClicks - a.totalClicks)
    .slice(0, limit);
}

/**
 * Parse user agent to get device type and browser
 * @param {string} userAgent - User agent string
 * @returns {Object} Device and browser info
 */
function parseUserAgent(userAgent) {
  if (!userAgent) {
    return { device: 'Unknown', browser: 'Unknown', os: 'Unknown' };
  }

  const parser = new UAParser(userAgent);
  const result = parser.getResult();

  const device = result.device.type || 'desktop';
  const browser = result.browser.name || 'Unknown';
  const os = result.os.name || 'Unknown';

  return {
    device: device.charAt(0).toUpperCase() + device.slice(1),
    browser,
    os
  };
}

/**
 * Get device breakdown from events
 * @param {Array} events - Array of event records
 * @returns {Object} Device statistics
 */
function getDeviceBreakdown(events) {
  const deviceCounts = { Desktop: 0, Mobile: 0, Tablet: 0, Unknown: 0 };
  const browserCounts = {};
  const osCounts = {};

  events.forEach(event => {
    const { device, browser, os } = parseUserAgent(event.user_agent);

    deviceCounts[device] = (deviceCounts[device] || 0) + 1;
    browserCounts[browser] = (browserCounts[browser] || 0) + 1;
    osCounts[os] = (osCounts[os] || 0) + 1;
  });

  // Convert to percentage
  const total = events.length;
  const devicePercentages = {};
  Object.keys(deviceCounts).forEach(key => {
    devicePercentages[key] = total > 0
      ? parseFloat(((deviceCounts[key] / total) * 100).toFixed(2))
      : 0;
  });

  // Get top browsers and OS
  const topBrowsers = Object.entries(browserCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({
      name,
      count,
      percentage: total > 0 ? parseFloat(((count / total) * 100).toFixed(2)) : 0
    }));

  const topOS = Object.entries(osCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({
      name,
      count,
      percentage: total > 0 ? parseFloat(((count / total) * 100).toFixed(2)) : 0
    }));

  return {
    devices: devicePercentages,
    browsers: topBrowsers,
    operatingSystems: topOS
  };
}

/**
 * Compare multiple campaigns
 * @param {Array} campaignsData - Array of { campaign, messages, events }
 * @returns {Array} Comparison data
 */
function compareCampaigns(campaignsData) {
  return campaignsData.map(({ campaign, messages, events }) => {
    const metrics = calculateCampaignMetrics(campaign, messages, events);
    return {
      id: campaign.id,
      name: campaign.name,
      createdAt: campaign.created_at,
      status: campaign.status,
      ...metrics
    };
  });
}

/**
 * Calculate engagement score for a contact
 * @param {Array} contactEvents - Events for a specific contact
 * @param {number} daysSinceLastCampaign - Days since contact received last campaign
 * @returns {number} Engagement score (0-100)
 */
function calculateEngagementScore(contactEvents, daysSinceLastCampaign = 0) {
  let score = 0;

  const opens = contactEvents.filter(e => e.event_type === 'opened').length;
  const clicks = contactEvents.filter(e => e.event_type === 'clicked').length;
  const unsubscribes = contactEvents.filter(e => e.event_type === 'unsubscribed').length;

  // Points for engagement
  score += opens * 2; // 2 points per open
  score += clicks * 5; // 5 points per click

  // Penalty for unsubscribe
  if (unsubscribes > 0) {
    score = 0;
  }

  // Recency bonus/penalty
  if (daysSinceLastCampaign <= 7) {
    score *= 1.2; // 20% bonus for recent activity
  } else if (daysSinceLastCampaign > 90) {
    score *= 0.5; // 50% penalty for inactive
  }

  // Cap at 100
  return Math.min(Math.round(score), 100);
}

/**
 * Format metrics for CSV export
 * @param {Object} metrics - Campaign metrics
 * @returns {Object} CSV-friendly format
 */
function formatMetricsForExport(metrics) {
  return {
    'Total Recipients': metrics.total,
    'Sent': metrics.sent,
    'Delivered': metrics.delivered,
    'Bounced': metrics.bounced,
    'Failed': metrics.failed,
    'Pending': metrics.pending,
    'Unique Opens': metrics.uniqueOpens,
    'Total Opens': metrics.totalOpens,
    'Open Rate (%)': metrics.openRate,
    'Unique Clicks': metrics.uniqueClicks,
    'Total Clicks': metrics.totalClicks,
    'Click Rate (%)': metrics.clickRate,
    'Click-to-Open Rate (%)': metrics.ctor,
    'Unsubscribes': metrics.unsubscribes,
    'Unsubscribe Rate (%)': metrics.unsubscribeRate,
    'Bounce Rate (%)': metrics.bounceRate
  };
}

module.exports = {
  calculateCampaignMetrics,
  generateTimeSeries,
  getTopLinks,
  parseUserAgent,
  getDeviceBreakdown,
  compareCampaigns,
  calculateEngagementScore,
  formatMetricsForExport
};
