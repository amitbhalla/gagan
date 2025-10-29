const { db } = require('../config/database');
const logger = require('../config/logger');

class CampaignModel {
  /**
   * Get all campaigns with pagination
   * @param {number} limit - Number of records to return
   * @param {number} offset - Number of records to skip
   * @param {string} status - Filter by status (optional)
   * @returns {Array<Object>} Array of campaigns
   */
  static getAll(limit = 100, offset = 0, status = null) {
    try {
      let query = `
        SELECT
          c.*,
          t.name as template_name,
          l.name as list_name,
          COUNT(DISTINCT m.id) as total_messages,
          COUNT(DISTINCT CASE WHEN m.status = 'sent' THEN m.id END) as sent_count,
          COUNT(DISTINCT CASE WHEN m.status = 'failed' THEN m.id END) as failed_count
        FROM campaigns c
        LEFT JOIN templates t ON c.template_id = t.id
        LEFT JOIN lists l ON c.list_id = l.id
        LEFT JOIN messages m ON c.id = m.campaign_id
      `;

      const params = [];

      if (status) {
        query += ' WHERE c.status = ?';
        params.push(status);
      }

      query += `
        GROUP BY c.id
        ORDER BY c.created_at DESC
        LIMIT ? OFFSET ?
      `;
      params.push(limit, offset);

      return db.prepare(query).all(...params);
    } catch (error) {
      logger.error('Error getting campaigns:', error);
      throw error;
    }
  }

  /**
   * Get campaign by ID with details
   * @param {number} id - Campaign ID
   * @returns {Object|null} Campaign object or null
   */
  static getById(id) {
    try {
      const query = `
        SELECT
          c.*,
          t.name as template_name,
          t.subject as template_subject,
          t.body as template_body,
          l.name as list_name,
          l.custom_fields as list_custom_fields,
          COUNT(DISTINCT m.id) as total_messages,
          COUNT(DISTINCT CASE WHEN m.status = 'sent' THEN m.id END) as sent_count,
          COUNT(DISTINCT CASE WHEN m.status = 'delivered' THEN m.id END) as delivered_count,
          COUNT(DISTINCT CASE WHEN m.status = 'failed' THEN m.id END) as failed_count,
          COUNT(DISTINCT CASE WHEN m.status = 'bounced' THEN m.id END) as bounced_count
        FROM campaigns c
        LEFT JOIN templates t ON c.template_id = t.id
        LEFT JOIN lists l ON c.list_id = l.id
        LEFT JOIN messages m ON c.id = m.campaign_id
        WHERE c.id = ?
        GROUP BY c.id
      `;

      return db.prepare(query).get(id);
    } catch (error) {
      logger.error(`Error getting campaign ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create new campaign
   * @param {Object} data - Campaign data
   * @returns {Object} Created campaign
   */
  static create(data) {
    try {
      const query = `
        INSERT INTO campaigns (
          name, template_id, list_id,
          from_email, from_name, reply_to,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `;

      const result = db.prepare(query).run(
        data.name,
        data.template_id,
        data.list_id,
        data.from_email,
        data.from_name,
        data.reply_to || data.from_email,
        data.status || 'draft'
      );

      logger.info(`Campaign created: ${result.lastInsertRowid}`);
      return this.getById(result.lastInsertRowid);
    } catch (error) {
      logger.error('Error creating campaign:', error);
      throw error;
    }
  }

  /**
   * Update campaign
   * @param {number} id - Campaign ID
   * @param {Object} data - Fields to update
   * @returns {Object} Updated campaign
   */
  static update(id, data) {
    try {
      const allowedFields = [
        'name', 'template_id', 'list_id',
        'from_email', 'from_name', 'reply_to', 'status',
        'scheduled_at', 'started_at', 'completed_at'
      ];

      const updates = [];
      const values = [];

      Object.keys(data).forEach(key => {
        if (allowedFields.includes(key)) {
          updates.push(`${key} = ?`);
          values.push(data[key]);
        }
      });

      if (updates.length === 0) {
        throw new Error('No valid fields to update');
      }

      updates.push(`updated_at = datetime('now')`);
      values.push(id);

      const query = `
        UPDATE campaigns
        SET ${updates.join(', ')}
        WHERE id = ?
      `;

      db.prepare(query).run(...values);
      logger.info(`Campaign updated: ${id}`);

      return this.getById(id);
    } catch (error) {
      logger.error(`Error updating campaign ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete campaign
   * @param {number} id - Campaign ID
   * @returns {boolean} Success status
   */
  static delete(id) {
    try {
      // Note: Messages will be cascade deleted if foreign key is set up
      // Otherwise, we should delete messages first
      const deleteMessages = db.prepare('DELETE FROM messages WHERE campaign_id = ?');
      deleteMessages.run(id);

      const query = 'DELETE FROM campaigns WHERE id = ?';
      const result = db.prepare(query).run(id);

      logger.info(`Campaign deleted: ${id}`);
      return result.changes > 0;
    } catch (error) {
      logger.error(`Error deleting campaign ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get campaign statistics
   * @param {number} id - Campaign ID
   * @returns {Object} Campaign statistics
   */
  static getStats(id) {
    try {
      const query = `
        SELECT
          COUNT(DISTINCT m.id) as total,
          COUNT(DISTINCT CASE WHEN m.status = 'pending' THEN m.id END) as pending,
          COUNT(DISTINCT CASE WHEN m.status = 'sent' THEN m.id END) as sent,
          COUNT(DISTINCT CASE WHEN m.status = 'delivered' THEN m.id END) as delivered,
          COUNT(DISTINCT CASE WHEN m.status = 'failed' THEN m.id END) as failed,
          COUNT(DISTINCT CASE WHEN m.status = 'bounced' THEN m.id END) as bounced
        FROM messages m
        WHERE m.campaign_id = ?
      `;

      return db.prepare(query).get(id) || {
        total: 0,
        pending: 0,
        sent: 0,
        delivered: 0,
        failed: 0,
        bounced: 0
      };
    } catch (error) {
      logger.error(`Error getting campaign stats ${id}:`, error);
      throw error;
    }
  }

  /**
   * Update campaign status
   * @param {number} id - Campaign ID
   * @param {string} status - New status
   * @param {Object} additionalFields - Additional fields to update (optional)
   * @returns {Object} Updated campaign
   */
  static updateStatus(id, status, additionalFields = {}) {
    try {
      const updateData = { status, ...additionalFields };

      // Auto-set timestamps based on status
      if (status === 'sending' && !additionalFields.started_at) {
        updateData.started_at = new Date().toISOString();
      }

      if (status === 'sent' && !additionalFields.completed_at) {
        updateData.completed_at = new Date().toISOString();
      }

      return this.update(id, updateData);
    } catch (error) {
      logger.error(`Error updating campaign status ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get scheduled campaigns that are ready to send
   * @returns {Array<Object>} Campaigns ready to send
   */
  static getScheduledReady() {
    try {
      const query = `
        SELECT *
        FROM campaigns
        WHERE status = 'scheduled'
          AND scheduled_at <= datetime('now')
        ORDER BY scheduled_at ASC
      `;

      return db.prepare(query).all();
    } catch (error) {
      logger.error('Error getting scheduled campaigns:', error);
      throw error;
    }
  }

  /**
   * Count total campaigns
   * @param {string} status - Filter by status (optional)
   * @returns {number} Total count
   */
  static count(status = null) {
    try {
      let query = 'SELECT COUNT(*) as count FROM campaigns';
      const params = [];

      if (status) {
        query += ' WHERE status = ?';
        params.push(status);
      }

      const result = db.prepare(query).get(...params);
      return result.count;
    } catch (error) {
      logger.error('Error counting campaigns:', error);
      throw error;
    }
  }

  /**
   * Validate campaign before sending
   * @param {number} id - Campaign ID
   * @returns {Object} Validation result
   */
  static validate(id) {
    try {
      const campaign = this.getById(id);

      if (!campaign) {
        return { valid: false, errors: ['Campaign not found'] };
      }

      const errors = [];

      if (!campaign.template_id) {
        errors.push('Template is required');
      }

      if (!campaign.list_id) {
        errors.push('List is required');
      }

      if (!campaign.from_email) {
        errors.push('From email is required');
      }

      if (!campaign.from_name) {
        errors.push('From name is required');
      }

      if (campaign.status === 'sending' || campaign.status === 'sent') {
        errors.push('Campaign has already been sent');
      }

      return {
        valid: errors.length === 0,
        errors
      };
    } catch (error) {
      logger.error(`Error validating campaign ${id}:`, error);
      throw error;
    }
  }
}

module.exports = CampaignModel;
