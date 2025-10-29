const { db } = require('../config/database');
const logger = require('../config/logger');

// SMTP bounce classification codes
const HARD_BOUNCE_CODES = ['550', '551', '553', '554'];
const SOFT_BOUNCE_CODES = ['421', '450', '451', '452'];

/**
 * Classify bounce type based on SMTP error code and message
 * @param {string} smtpCode - SMTP error code (e.g., '550')
 * @param {string} message - Error message
 * @returns {string} - 'hard' or 'soft'
 */
function classifyBounce(smtpCode, message) {
  // Check hard bounce codes
  if (HARD_BOUNCE_CODES.some(code => smtpCode.startsWith(code))) {
    return 'hard';
  }

  // Check soft bounce codes
  if (SOFT_BOUNCE_CODES.some(code => smtpCode.startsWith(code))) {
    return 'soft';
  }

  // Parse message for common patterns
  const lowerMessage = message.toLowerCase();

  // Hard bounce patterns
  const hardBouncePatterns = [
    'user unknown',
    'does not exist',
    'invalid recipient',
    'address rejected',
    'no such user',
    'recipient not found',
    'mailbox unavailable',
    'undeliverable',
    'permanent failure'
  ];

  if (hardBouncePatterns.some(pattern => lowerMessage.includes(pattern))) {
    return 'hard';
  }

  // Soft bounce patterns
  const softBouncePatterns = [
    'mailbox full',
    'quota exceeded',
    'temporarily',
    'try again later',
    'deferred',
    'greylisted',
    'rate limit'
  ];

  if (softBouncePatterns.some(pattern => lowerMessage.includes(pattern))) {
    return 'soft';
  }

  // Default to soft (allow retry)
  return 'soft';
}

/**
 * Extract SMTP code from error message
 * @param {Error} error - Error object from nodemailer
 * @returns {string} - SMTP code or '500'
 */
function extractSmtpCode(error) {
  if (error.responseCode) {
    return error.responseCode.toString();
  }

  // Try to extract from message
  const match = error.message.match(/\b([45]\d{2})\b/);
  if (match) {
    return match[1];
  }

  return '500'; // Generic error
}

/**
 * Extract bounce reason from error
 * @param {Error} error - Error object
 * @returns {string} - Bounce reason
 */
function extractBounceReason(error) {
  if (error.response) {
    return error.response;
  }
  return error.message || 'Unknown error';
}

/**
 * Record bounce in database
 * @param {number} contactId - Contact ID
 * @param {number} messageId - Message ID
 * @param {string} bounceType - 'hard' or 'soft'
 * @param {string} bounceReason - Error message
 * @param {string} bounceCode - SMTP code
 */
function recordBounce(contactId, messageId, bounceType, bounceReason, bounceCode) {
  try {
    const stmt = db.prepare(`
      INSERT INTO bounces (contact_id, message_id, bounce_type, bounce_reason, bounce_code, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);

    stmt.run(contactId, messageId, bounceType, bounceReason, bounceCode);

    logger.info(`Bounce recorded: Contact ${contactId}, Type: ${bounceType}, Code: ${bounceCode}`);
  } catch (error) {
    logger.error('Error recording bounce:', error);
  }
}

/**
 * Get bounce count for contact
 * @param {number} contactId - Contact ID
 * @returns {object} - Bounce counts { total, hard, soft, consecutive_soft }
 */
function getBounceCount(contactId) {
  try {
    // Get total and type counts
    const counts = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN bounce_type = 'hard' THEN 1 ELSE 0 END) as hard,
        SUM(CASE WHEN bounce_type = 'soft' THEN 1 ELSE 0 END) as soft
      FROM bounces
      WHERE contact_id = ?
    `).get(contactId);

    // Get consecutive soft bounces (most recent)
    const recentBounces = db.prepare(`
      SELECT bounce_type
      FROM bounces
      WHERE contact_id = ?
      ORDER BY created_at DESC
      LIMIT 3
    `).all(contactId);

    let consecutiveSoft = 0;
    for (const bounce of recentBounces) {
      if (bounce.bounce_type === 'soft') {
        consecutiveSoft++;
      } else {
        break; // Stop at first non-soft bounce
      }
    }

    return {
      total: counts.total || 0,
      hard: counts.hard || 0,
      soft: counts.soft || 0,
      consecutive_soft: consecutiveSoft
    };
  } catch (error) {
    logger.error('Error getting bounce count:', error);
    return { total: 0, hard: 0, soft: 0, consecutive_soft: 0 };
  }
}

/**
 * Update contact status based on bounce
 * @param {number} contactId - Contact ID
 * @param {string} bounceType - 'hard' or 'soft'
 */
function updateContactStatus(contactId, bounceType) {
  try {
    const bounceCounts = getBounceCount(contactId);

    // Hard bounce: Immediately mark as bounced
    if (bounceType === 'hard') {
      const stmt = db.prepare(`
        UPDATE contacts
        SET status = 'bounced', updated_at = datetime('now')
        WHERE id = ?
      `);
      stmt.run(contactId);
      logger.info(`Contact ${contactId} marked as bounced (hard bounce)`);
      return;
    }

    // Soft bounce: Mark as bounced after 3 consecutive soft bounces
    if (bounceType === 'soft' && bounceCounts.consecutive_soft >= 3) {
      const stmt = db.prepare(`
        UPDATE contacts
        SET status = 'bounced', updated_at = datetime('now')
        WHERE id = ?
      `);
      stmt.run(contactId);
      logger.info(`Contact ${contactId} marked as bounced (3 consecutive soft bounces)`);
    }
  } catch (error) {
    logger.error('Error updating contact status:', error);
  }
}

/**
 * Process email bounce
 * @param {number} contactId - Contact ID
 * @param {number} messageId - Message ID
 * @param {Error} error - Error object from nodemailer
 */
function processBounce(contactId, messageId, error) {
  try {
    const smtpCode = extractSmtpCode(error);
    const bounceReason = extractBounceReason(error);
    const bounceType = classifyBounce(smtpCode, bounceReason);

    // Record the bounce
    recordBounce(contactId, messageId, bounceType, bounceReason, smtpCode);

    // Update contact status
    updateContactStatus(contactId, bounceType);

    return { bounceType, smtpCode, bounceReason };
  } catch (error) {
    logger.error('Error processing bounce:', error);
    return null;
  }
}

/**
 * Check if contact should be skipped due to bounce status
 * @param {number} contactId - Contact ID
 * @returns {boolean} - True if should skip
 */
function shouldSkipContact(contactId) {
  try {
    const contact = db.prepare('SELECT status FROM contacts WHERE id = ?').get(contactId);

    if (!contact) {
      return true; // Skip if contact doesn't exist
    }

    // Skip bounced and unsubscribed contacts
    return contact.status === 'bounced' || contact.status === 'unsubscribed';
  } catch (error) {
    logger.error('Error checking contact status:', error);
    return true; // Skip on error to be safe
  }
}

/**
 * Get bounce statistics
 * @returns {object} - Bounce statistics
 */
function getBounceStats() {
  try {
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_bounces,
        SUM(CASE WHEN bounce_type = 'hard' THEN 1 ELSE 0 END) as hard_bounces,
        SUM(CASE WHEN bounce_type = 'soft' THEN 1 ELSE 0 END) as soft_bounces,
        COUNT(DISTINCT contact_id) as bounced_contacts
      FROM bounces
      WHERE created_at >= datetime('now', '-30 days')
    `).get();

    return stats;
  } catch (error) {
    logger.error('Error getting bounce stats:', error);
    return null;
  }
}

/**
 * Clean up old bounces (optional maintenance task)
 * @param {number} daysToKeep - Days to keep bounce records
 */
function cleanOldBounces(daysToKeep = 90) {
  try {
    const stmt = db.prepare(`
      DELETE FROM bounces
      WHERE created_at < datetime('now', '-' || ? || ' days')
    `);

    const result = stmt.run(daysToKeep);
    logger.info(`Cleaned up ${result.changes} old bounce records`);
    return result.changes;
  } catch (error) {
    logger.error('Error cleaning old bounces:', error);
    return 0;
  }
}

module.exports = {
  classifyBounce,
  processBounce,
  shouldSkipContact,
  getBounceCount,
  getBounceStats,
  recordBounce,
  updateContactStatus,
  cleanOldBounces
};
