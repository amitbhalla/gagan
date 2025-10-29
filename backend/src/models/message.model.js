const { db } = require('../config/database');
const logger = require('../config/logger');
const crypto = require('crypto');

class MessageModel {
  /**
   * Create a new message
   * @param {Object} data - Message data
   * @returns {Object} Created message
   */
  static create(data) {
    try {
      const trackingToken = crypto.randomBytes(32).toString('hex').substring(0, 32); // Generate unique tracking token
      const messageId = this.generateMessageId(data.campaign_id);

      const query = `
        INSERT INTO messages (
          campaign_id, contact_id, message_id, tracking_token,
          status, created_at
        ) VALUES (?, ?, ?, ?, ?, datetime('now'))
      `;

      const result = db.prepare(query).run(
        data.campaign_id,
        data.contact_id,
        messageId,
        trackingToken,
        data.status || 'pending'
      );

      logger.info(`Message created: ${result.lastInsertRowid}`);
      return this.getById(result.lastInsertRowid);
    } catch (error) {
      logger.error('Error creating message:', error);
      throw error;
    }
  }

  /**
   * Bulk create messages for campaign
   * @param {number} campaignId - Campaign ID
   * @param {Array<number>} contactIds - Array of contact IDs
   * @returns {number} Number of messages created
   */
  static bulkCreate(campaignId, contactIds) {
    try {
      const insert = db.prepare(`
        INSERT INTO messages (
          campaign_id, contact_id, message_id, tracking_token,
          status, created_at
        ) VALUES (?, ?, ?, ?, 'pending', datetime('now'))
      `);

      const insertMany = db.transaction((ids) => {
        for (const contactId of ids) {
          const messageId = this.generateMessageId(campaignId);
          const trackingToken = crypto.randomBytes(32).toString('hex').substring(0, 32);
          insert.run(campaignId, contactId, messageId, trackingToken);
        }
      });

      insertMany(contactIds);
      logger.info(`Bulk created ${contactIds.length} messages for campaign ${campaignId}`);

      return contactIds.length;
    } catch (error) {
      logger.error(`Error bulk creating messages for campaign ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Get message by ID
   * @param {number} id - Message ID
   * @returns {Object|null} Message object
   */
  static getById(id) {
    try {
      const query = `
        SELECT
          m.*,
          c.email as contact_email,
          c.first_name,
          c.last_name,
          cp.name as campaign_name
        FROM messages m
        LEFT JOIN contacts c ON m.contact_id = c.id
        LEFT JOIN campaigns cp ON m.campaign_id = cp.id
        WHERE m.id = ?
      `;

      return db.prepare(query).get(id);
    } catch (error) {
      logger.error(`Error getting message ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get message by tracking token
   * @param {string} token - Tracking token
   * @returns {Object|null} Message object
   */
  static getByToken(token) {
    try {
      const query = `
        SELECT
          m.*,
          c.email as contact_email,
          c.first_name,
          c.last_name
        FROM messages m
        LEFT JOIN contacts c ON m.contact_id = c.id
        WHERE m.tracking_token = ?
      `;

      return db.prepare(query).get(token);
    } catch (error) {
      logger.error(`Error getting message by token:`, error);
      throw error;
    }
  }

  /**
   * Get messages for campaign
   * @param {number} campaignId - Campaign ID
   * @param {Object} options - Query options (status, limit, offset)
   * @returns {Array<Object>} Array of messages
   */
  static getByCampaign(campaignId, options = {}) {
    try {
      const { status, limit = 100, offset = 0 } = options;

      let query = `
        SELECT
          m.*,
          c.email as contact_email,
          c.first_name,
          c.last_name
        FROM messages m
        LEFT JOIN contacts c ON m.contact_id = c.id
        WHERE m.campaign_id = ?
      `;

      const params = [campaignId];

      if (status) {
        query += ' AND m.status = ?';
        params.push(status);
      }

      query += ' ORDER BY m.created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      return db.prepare(query).all(...params);
    } catch (error) {
      logger.error(`Error getting messages for campaign ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Update message status
   * @param {number} id - Message ID
   * @param {string} status - New status
   * @param {Object} additionalData - Additional fields to update
   * @returns {Object} Updated message
   */
  static updateStatus(id, status, additionalData = {}) {
    try {
      const updates = ['status = ?', 'updated_at = datetime(\'now\')'];
      const values = [status];

      // Auto-set timestamps based on status
      if (status === 'sent' && !additionalData.sent_at) {
        updates.push('sent_at = datetime(\'now\')');
      }

      if (status === 'delivered' && !additionalData.delivered_at) {
        updates.push('delivered_at = datetime(\'now\')');
      }

      // Add error message if status is failed or bounced
      if (additionalData.error_message) {
        updates.push('error_message = ?');
        values.push(additionalData.error_message);
      }

      values.push(id);

      const query = `
        UPDATE messages
        SET ${updates.join(', ')}
        WHERE id = ?
      `;

      db.prepare(query).run(...values);
      logger.info(`Message ${id} status updated to: ${status}`);

      return this.getById(id);
    } catch (error) {
      logger.error(`Error updating message ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get pending messages (ready to send)
   * @param {number} limit - Max number of messages to retrieve
   * @returns {Array<Object>} Pending messages with contact details
   */
  static getPending(limit = 100) {
    try {
      const query = `
        SELECT
          m.*,
          c.email as contact_email,
          c.first_name,
          c.last_name,
          c.status as contact_status,
          cp.from_email,
          cp.from_name,
          cp.reply_to,
          t.subject as template_subject,
          t.body as template_body,
          ls.custom_field_values
        FROM messages m
        INNER JOIN contacts c ON m.contact_id = c.id
        INNER JOIN campaigns cp ON m.campaign_id = cp.id
        INNER JOIN templates t ON cp.template_id = t.id
        LEFT JOIN list_subscribers ls ON ls.contact_id = c.id AND ls.list_id = cp.list_id
        WHERE m.status = 'pending'
          AND c.status = 'active'
        ORDER BY m.created_at ASC
        LIMIT ?
      `;

      return db.prepare(query).all(limit);
    } catch (error) {
      logger.error('Error getting pending messages:', error);
      throw error;
    }
  }

  /**
   * Count messages by status for campaign
   * @param {number} campaignId - Campaign ID
   * @returns {Object} Status counts
   */
  static countByStatus(campaignId) {
    try {
      const query = `
        SELECT
          status,
          COUNT(*) as count
        FROM messages
        WHERE campaign_id = ?
        GROUP BY status
      `;

      const results = db.prepare(query).all(campaignId);

      // Convert to object
      const counts = {
        pending: 0,
        sent: 0,
        delivered: 0,
        failed: 0,
        bounced: 0
      };

      results.forEach(row => {
        counts[row.status] = row.count;
      });

      return counts;
    } catch (error) {
      logger.error(`Error counting messages for campaign ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Delete messages for campaign
   * @param {number} campaignId - Campaign ID
   * @returns {number} Number of deleted messages
   */
  static deleteByCampaign(campaignId) {
    try {
      const query = 'DELETE FROM messages WHERE campaign_id = ?';
      const result = db.prepare(query).run(campaignId);

      logger.info(`Deleted ${result.changes} messages for campaign ${campaignId}`);
      return result.changes;
    } catch (error) {
      logger.error(`Error deleting messages for campaign ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Generate RFC 5322 compliant message ID
   * @param {number} campaignId - Campaign ID
   * @returns {string} Message ID
   */
  static generateMessageId(campaignId) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const domain = process.env.DKIM_DOMAIN || 'myndsolution.com';
    return `<${campaignId}.${timestamp}.${random}@${domain}>`;
  }

  /**
   * Get failed messages for retry
   * @param {number} campaignId - Campaign ID (optional)
   * @param {number} limit - Max messages to return
   * @returns {Array<Object>} Failed messages
   */
  static getFailedForRetry(campaignId = null, limit = 50) {
    try {
      let query = `
        SELECT
          m.*,
          c.email as contact_email,
          c.first_name,
          c.last_name
        FROM messages m
        INNER JOIN contacts c ON m.contact_id = c.id
        WHERE m.status = 'failed'
      `;

      const params = [];

      if (campaignId) {
        query += ' AND m.campaign_id = ?';
        params.push(campaignId);
      }

      query += ' ORDER BY m.created_at DESC LIMIT ?';
      params.push(limit);

      return db.prepare(query).all(...params);
    } catch (error) {
      logger.error('Error getting failed messages:', error);
      throw error;
    }
  }
}

module.exports = MessageModel;
