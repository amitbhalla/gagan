/**
 * Unsubscribe Model
 * Manages unsubscribe tokens and operations
 */

const { db } = require('../config/database');
const { nanoid } = require('nanoid');

const unsubscribeModel = {
  /**
   * Create an unsubscribe token
   */
  createToken: (contactId, listId, campaignId) => {
    const token = nanoid(32);
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1); // Token valid for 1 year

    const stmt = db.prepare(`
      INSERT INTO unsubscribe_tokens (token, contact_id, list_id, campaign_id, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(token, contactId, listId, campaignId, expiresAt.toISOString());

    return token;
  },

  /**
   * Find token details
   */
  findByToken: (token) => {
    const stmt = db.prepare(`
      SELECT
        ut.*,
        c.email,
        c.first_name,
        c.last_name,
        l.name as list_name,
        cam.name as campaign_name
      FROM unsubscribe_tokens ut
      JOIN contacts c ON ut.contact_id = c.id
      LEFT JOIN lists l ON ut.list_id = l.id
      LEFT JOIN campaigns cam ON ut.campaign_id = cam.id
      WHERE ut.token = ?
    `);

    return stmt.get(token);
  },

  /**
   * Mark token as used
   */
  markAsUsed: (token) => {
    const stmt = db.prepare(`
      UPDATE unsubscribe_tokens
      SET used_at = datetime('now')
      WHERE token = ?
    `);

    return stmt.run(token);
  },

  /**
   * Unsubscribe a contact from a list
   */
  unsubscribeFromList: (contactId, listId) => {
    const stmt = db.prepare(`
      UPDATE list_subscribers
      SET status = 'unsubscribed'
      WHERE contact_id = ? AND list_id = ?
    `);

    return stmt.run(contactId, listId);
  },

  /**
   * Unsubscribe a contact globally (from all lists)
   */
  unsubscribeGlobally: (contactId) => {
    // Update contact status
    const updateContact = db.prepare(`
      UPDATE contacts
      SET status = 'unsubscribed'
      WHERE id = ?
    `);

    // Update all list subscriptions
    const updateSubscriptions = db.prepare(`
      UPDATE list_subscribers
      SET status = 'unsubscribed'
      WHERE contact_id = ?
    `);

    updateContact.run(contactId);
    updateSubscriptions.run(contactId);

    return { success: true };
  },

  /**
   * Check if token is valid
   */
  isValidToken: (token) => {
    const tokenData = unsubscribeModel.findByToken(token);

    if (!tokenData) {
      return { valid: false, reason: 'Token not found' };
    }

    if (tokenData.used_at) {
      return { valid: false, reason: 'Token already used' };
    }

    const expiresAt = new Date(tokenData.expires_at);
    if (expiresAt < new Date()) {
      return { valid: false, reason: 'Token expired' };
    }

    return { valid: true, data: tokenData };
  },

  /**
   * Clean up expired tokens (run periodically)
   */
  cleanupExpiredTokens: () => {
    const stmt = db.prepare(`
      DELETE FROM unsubscribe_tokens
      WHERE expires_at < datetime('now')
        AND used_at IS NOT NULL
    `);

    const result = stmt.run();
    return result.changes;
  }
};

module.exports = unsubscribeModel;
