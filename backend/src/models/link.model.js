/**
 * Link Model
 * Manages click tracking links for campaigns
 */

const { db } = require('../config/database');
const { nanoid } = require('nanoid');

const linkModel = {
  /**
   * Create a new tracking link
   */
  create: (campaignId, originalUrl) => {
    const shortCode = nanoid(10);

    const stmt = db.prepare(`
      INSERT INTO links (campaign_id, original_url, short_code, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `);

    const result = stmt.run(campaignId, originalUrl, shortCode);

    return {
      id: result.lastInsertRowid,
      campaign_id: campaignId,
      original_url: originalUrl,
      short_code: shortCode
    };
  },

  /**
   * Find link by short code
   */
  findByShortCode: (shortCode) => {
    const stmt = db.prepare(`
      SELECT * FROM links WHERE short_code = ?
    `);

    return stmt.get(shortCode);
  },

  /**
   * Find or create link for a URL in a campaign
   */
  findOrCreate: (campaignId, originalUrl) => {
    // First, try to find existing link
    const stmt = db.prepare(`
      SELECT * FROM links
      WHERE campaign_id = ? AND original_url = ?
    `);

    const existing = stmt.get(campaignId, originalUrl);

    if (existing) {
      return existing;
    }

    // Create new link if not found
    return linkModel.create(campaignId, originalUrl);
  },

  /**
   * Get all links for a campaign
   */
  findByCampaignId: (campaignId) => {
    const stmt = db.prepare(`
      SELECT
        l.*,
        COUNT(DISTINCT me.id) as total_clicks,
        COUNT(DISTINCT me.message_id) as unique_clicks
      FROM links l
      LEFT JOIN message_events me ON me.event_type = 'clicked'
        AND json_extract(me.event_data, '$.short_code') = l.short_code
      WHERE l.campaign_id = ?
      GROUP BY l.id
      ORDER BY unique_clicks DESC
    `);

    return stmt.all(campaignId);
  },

  /**
   * Get link statistics
   */
  getStats: (linkId) => {
    const stmt = db.prepare(`
      SELECT
        l.*,
        COUNT(DISTINCT me.id) as total_clicks,
        COUNT(DISTINCT me.message_id) as unique_clicks
      FROM links l
      LEFT JOIN message_events me ON me.event_type = 'clicked'
        AND json_extract(me.event_data, '$.link_id') = l.id
      WHERE l.id = ?
      GROUP BY l.id
    `);

    return stmt.get(linkId);
  }
};

module.exports = linkModel;
