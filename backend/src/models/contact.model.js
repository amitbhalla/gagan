const { db } = require('../config/database');

class ContactModel {
  static getAll(filters = {}) {
    let query = 'SELECT * FROM contacts';
    const conditions = [];
    const params = [];

    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }

    if (filters.search) {
      conditions.push('(email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)');
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  static getById(id) {
    const stmt = db.prepare('SELECT * FROM contacts WHERE id = ?');
    return stmt.get(id);
  }

  static getByEmail(email) {
    const stmt = db.prepare('SELECT * FROM contacts WHERE email = ?');
    return stmt.get(email);
  }

  static create(data) {
    const { email, first_name, last_name, status = 'active' } = data;
    const stmt = db.prepare(`
      INSERT INTO contacts (email, first_name, last_name, status)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(email, first_name, last_name, status);
    return this.getById(result.lastInsertRowid);
  }

  static update(id, data) {
    const { email, first_name, last_name, status } = data;
    const stmt = db.prepare(`
      UPDATE contacts
      SET email = ?, first_name = ?, last_name = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(email, first_name, last_name, status, id);
    return this.getById(id);
  }

  static updateStatus(id, status) {
    const stmt = db.prepare(`
      UPDATE contacts
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(status, id);
    return this.getById(id);
  }

  static delete(id) {
    const stmt = db.prepare('DELETE FROM contacts WHERE id = ?');
    return stmt.run(id);
  }

  static bulkCreate(contacts) {
    const stmt = db.prepare(`
      INSERT INTO contacts (email, first_name, last_name, status)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        updated_at = CURRENT_TIMESTAMP
    `);

    const insertMany = db.transaction((contacts) => {
      const results = [];
      for (const contact of contacts) {
        const result = stmt.run(
          contact.email,
          contact.first_name || null,
          contact.last_name || null,
          contact.status || 'active'
        );
        results.push(result.lastInsertRowid);
      }
      return results;
    });

    return insertMany(contacts);
  }

  static count(filters = {}) {
    let query = 'SELECT COUNT(*) as count FROM contacts';
    const params = [];

    if (filters.status) {
      query += ' WHERE status = ?';
      params.push(filters.status);
    }

    const stmt = db.prepare(query);
    return stmt.get(...params).count;
  }

  static getLists(contactId) {
    const stmt = db.prepare(`
      SELECT l.*, ls.subscribed_at, ls.status as subscription_status
      FROM lists l
      JOIN list_subscribers ls ON l.id = ls.list_id
      WHERE ls.contact_id = ? AND ls.status = 'subscribed'
      ORDER BY ls.subscribed_at DESC
    `);
    return stmt.all(contactId);
  }

  /**
   * Calculate engagement score for a contact (0-100)
   * Based on opens, clicks, and recency
   */
  static calculateEngagementScore(contactId) {
    try {
      // Get engagement metrics
      const metrics = db.prepare(`
        SELECT
          COUNT(DISTINCT CASE WHEN me.event_type = 'opened' THEN me.id END) as opens,
          COUNT(DISTINCT CASE WHEN me.event_type = 'clicked' THEN me.id END) as clicks,
          MAX(me.created_at) as last_activity
        FROM message_events me
        JOIN messages m ON me.message_id = m.id
        WHERE m.contact_id = ?
      `).get(contactId);

      const contact = this.getById(contactId);

      if (!contact || contact.status === 'unsubscribed' || contact.status === 'bounced') {
        return 0;
      }

      let score = 0;

      // Base score from engagement
      score += metrics.opens * 2; // 2 points per open
      score += metrics.clicks * 5; // 5 points per click

      // Recency modifier
      if (metrics.last_activity) {
        const lastActivity = new Date(metrics.last_activity);
        const daysSinceActivity = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSinceActivity <= 7) {
          score *= 1.2; // 20% bonus for recent activity
        } else if (daysSinceActivity <= 30) {
          score *= 1.1; // 10% bonus
        } else if (daysSinceActivity > 90) {
          score *= 0.5; // 50% penalty for inactive
        }
      }

      // Cap at 100
      return Math.min(Math.round(score), 100);
    } catch (error) {
      console.error('Error calculating engagement score:', error);
      return 0;
    }
  }

  /**
   * Get contacts with engagement scores
   */
  static getWithEngagementScores(limit = 100, minScore = 0) {
    const contacts = this.getAll({ limit: 10000 }); // Get all contacts

    const contactsWithScores = contacts.map(contact => ({
      ...contact,
      engagement_score: this.calculateEngagementScore(contact.id)
    }));

    // Filter by minimum score
    const filtered = contactsWithScores.filter(c => c.engagement_score >= minScore);

    // Sort by score descending
    filtered.sort((a, b) => b.engagement_score - a.engagement_score);

    // Limit results
    return filtered.slice(0, limit);
  }

  /**
   * Find duplicate contacts (same email)
   * Since email is UNIQUE, this checks for similar emails (typos)
   */
  static findDuplicates() {
    // Find exact duplicates by normalized email
    const stmt = db.prepare(`
      SELECT email, COUNT(*) as count, GROUP_CONCAT(id) as ids
      FROM contacts
      GROUP BY LOWER(TRIM(email))
      HAVING count > 1
    `);

    return stmt.all();
  }

  /**
   * Merge duplicate contacts (keep first, delete others)
   */
  static mergeDuplicates(keepId, deleteIds) {
    const transaction = db.transaction(() => {
      // Update all references to deleted contacts to point to kept contact
      const updateStmt = db.prepare(`
        UPDATE list_subscribers
        SET contact_id = ?
        WHERE contact_id = ?
      `);

      for (const deleteId of deleteIds) {
        updateStmt.run(keepId, deleteId);
      }

      // Delete duplicate contacts
      const deleteStmt = db.prepare(`
        DELETE FROM contacts WHERE id = ?
      `);

      for (const deleteId of deleteIds) {
        deleteStmt.run(deleteId);
      }
    });

    transaction();

    return this.getById(keepId);
  }

  /**
   * Validate email syntax
   */
  static validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Check if email is role-based (generic)
   */
  static isRoleBased(email) {
    const roleBasedPrefixes = [
      'noreply', 'no-reply', 'donotreply',
      'admin', 'administrator', 'info', 'support',
      'sales', 'marketing', 'help', 'contact',
      'webmaster', 'postmaster', 'hostmaster',
      'abuse', 'security', 'privacy',
      'billing', 'accounts', 'reception'
    ];

    const prefix = email.split('@')[0].toLowerCase();
    return roleBasedPrefixes.includes(prefix);
  }

  /**
   * Clean invalid and role-based emails
   */
  static cleanInvalidEmails(dryRun = true) {
    const invalidEmails = [];
    const roleBasedEmails = [];

    const allContacts = this.getAll({});

    for (const contact of allContacts) {
      if (!this.validateEmail(contact.email)) {
        invalidEmails.push(contact);
      } else if (this.isRoleBased(contact.email)) {
        roleBasedEmails.push(contact);
      }
    }

    if (!dryRun) {
      // Mark as bounced instead of deleting
      const stmt = db.prepare(`
        UPDATE contacts SET status = 'bounced' WHERE id = ?
      `);

      for (const contact of [...invalidEmails, ...roleBasedEmails]) {
        stmt.run(contact.id);
      }
    }

    return {
      invalid: invalidEmails,
      roleBased: roleBasedEmails,
      total: invalidEmails.length + roleBasedEmails.length,
      dryRun
    };
  }

  /**
   * Remove hard bounced contacts
   */
  static removeHardBounces() {
    const stmt = db.prepare(`
      UPDATE contacts
      SET status = 'bounced'
      WHERE id IN (
        SELECT DISTINCT contact_id
        FROM bounces
        WHERE bounce_type = 'hard'
      )
      AND status != 'bounced'
    `);

    const result = stmt.run();
    return result.changes;
  }

  /**
   * Auto-sunset inactive contacts (no activity in X days)
   */
  static sunsetInactiveContacts(inactiveDays = 180) {
    const stmt = db.prepare(`
      UPDATE contacts
      SET status = 'unsubscribed'
      WHERE id NOT IN (
        SELECT DISTINCT m.contact_id
        FROM messages m
        JOIN message_events me ON m.id = me.message_id
        WHERE me.created_at >= datetime('now', '-' || ? || ' days')
      )
      AND status = 'active'
      AND created_at < datetime('now', '-' || ? || ' days')
    `);

    const result = stmt.run(inactiveDays, inactiveDays);
    return result.changes;
  }

  /**
   * Get hygiene statistics
   */
  static getHygieneStats() {
    const stats = {
      total: this.count(),
      active: this.count({ status: 'active' }),
      bounced: this.count({ status: 'bounced' }),
      unsubscribed: this.count({ status: 'unsubscribed' }),
      duplicates: 0,
      invalid: 0,
      roleBased: 0
    };

    // Count duplicates
    const duplicates = this.findDuplicates();
    stats.duplicates = duplicates.length;

    // Count invalid and role-based
    const allContacts = this.getAll({});
    for (const contact of allContacts) {
      if (!this.validateEmail(contact.email)) {
        stats.invalid++;
      } else if (this.isRoleBased(contact.email)) {
        stats.roleBased++;
      }
    }

    return stats;
  }
}

module.exports = ContactModel;
