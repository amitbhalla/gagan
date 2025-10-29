/**
 * Tracking Controller
 * Handles email open tracking, click tracking, and unsubscribe requests
 */

const messageModel = require('../models/message.model');
const linkModel = require('../models/link.model');
const unsubscribeModel = require('../models/unsubscribe.model');
const { db } = require('../config/database');
const logger = require('../config/logger');
const {
  isBot,
  getClientIp,
  createTrackingPixel
} = require('../utils/tracking');

const trackingController = {
  /**
   * Track email open
   * GET /track/open/:token.png
   */
  trackOpen: async (req, res) => {
    try {
      const { token } = req.params;
      const userAgent = req.headers['user-agent'];
      const ipAddress = getClientIp(req);

      // Find message by tracking token
      const message = messageModel.findByTrackingToken(token);

      if (!message) {
        logger.warn(`Open tracking: Message not found for token ${token}`);
        // Still return pixel to avoid breaking email display
        return res.set('Content-Type', 'image/gif').send(createTrackingPixel());
      }

      // Check if this is a bot (skip logging if true)
      const isBotRequest = isBot(userAgent);

      if (!isBotRequest) {
        // Log the open event
        const stmt = db.prepare(`
          INSERT INTO message_events (message_id, event_type, event_data, ip_address, user_agent, created_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
        `);

        const eventData = JSON.stringify({
          tracking_token: token,
          is_bot: false
        });

        stmt.run(message.id, 'opened', eventData, ipAddress, userAgent);

        // Update message delivered status if not already set
        if (message.status === 'sent' && !message.delivered_at) {
          const updateStmt = db.prepare(`
            UPDATE messages
            SET status = 'delivered', delivered_at = datetime('now')
            WHERE id = ?
          `);
          updateStmt.run(message.id);
        }

        logger.info(`Open tracked: Message ${message.id}, Campaign ${message.campaign_id}`);
      } else {
        logger.debug(`Bot detected, skipping open tracking for message ${message.id}`);
      }

      // Always return tracking pixel
      res.set('Content-Type', 'image/gif');
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.send(createTrackingPixel());

    } catch (error) {
      logger.error('Error tracking open:', error);
      // Return pixel even on error to avoid breaking email
      res.set('Content-Type', 'image/gif').send(createTrackingPixel());
    }
  },

  /**
   * Track link click
   * GET /track/click/:shortCode/:token
   */
  trackClick: async (req, res) => {
    try {
      const { shortCode, token } = req.params;
      const userAgent = req.headers['user-agent'];
      const ipAddress = getClientIp(req);

      // Find the link
      const link = linkModel.findByShortCode(shortCode);

      if (!link) {
        logger.warn(`Click tracking: Link not found for shortCode ${shortCode}`);
        return res.status(404).send('Link not found');
      }

      // Find message by tracking token
      const message = messageModel.findByTrackingToken(token);

      if (!message) {
        logger.warn(`Click tracking: Message not found for token ${token}`);
        // Still redirect to the original URL
        return res.redirect(302, link.original_url);
      }

      // Log the click event (even for bots, as clicks are more intentional)
      const stmt = db.prepare(`
        INSERT INTO message_events (message_id, event_type, event_data, ip_address, user_agent, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `);

      const eventData = JSON.stringify({
        link_id: link.id,
        short_code: shortCode,
        original_url: link.original_url,
        is_bot: isBot(userAgent)
      });

      stmt.run(message.id, 'clicked', eventData, ipAddress, userAgent);

      logger.info(`Click tracked: Message ${message.id}, Link ${link.id}, URL ${link.original_url}`);

      // Redirect to original URL
      res.redirect(302, link.original_url);

    } catch (error) {
      logger.error('Error tracking click:', error);
      res.status(500).send('Error processing click');
    }
  },

  /**
   * One-click unsubscribe (RFC 8058)
   * POST /track/unsubscribe/:token
   */
  unsubscribeOneClick: async (req, res) => {
    try {
      const { token } = req.params;

      // Validate token
      const validation = unsubscribeModel.isValidToken(token);

      if (!validation.valid) {
        logger.warn(`Unsubscribe failed: ${validation.reason} for token ${token}`);
        return res.status(400).json({
          success: false,
          message: validation.reason
        });
      }

      const tokenData = validation.data;

      // Mark token as used
      unsubscribeModel.markAsUsed(token);

      // Unsubscribe from the specific list or globally
      if (tokenData.list_id) {
        unsubscribeModel.unsubscribeFromList(tokenData.contact_id, tokenData.list_id);
        logger.info(`Contact ${tokenData.contact_id} unsubscribed from list ${tokenData.list_id}`);
      } else {
        unsubscribeModel.unsubscribeGlobally(tokenData.contact_id);
        logger.info(`Contact ${tokenData.contact_id} unsubscribed globally`);
      }

      // Log unsubscribe event
      if (tokenData.campaign_id) {
        // Find any message from this campaign to this contact
        const messageStmt = db.prepare(`
          SELECT id FROM messages
          WHERE campaign_id = ? AND contact_id = ?
          LIMIT 1
        `);

        const message = messageStmt.get(tokenData.campaign_id, tokenData.contact_id);

        if (message) {
          const eventStmt = db.prepare(`
            INSERT INTO message_events (message_id, event_type, event_data, ip_address, user_agent, created_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
          `);

          const eventData = JSON.stringify({
            token: token,
            list_id: tokenData.list_id,
            method: 'one-click'
          });

          eventStmt.run(
            message.id,
            'unsubscribed',
            eventData,
            getClientIp(req),
            req.headers['user-agent']
          );
        }
      }

      res.status(200).json({
        success: true,
        message: 'Successfully unsubscribed'
      });

    } catch (error) {
      logger.error('Error processing unsubscribe:', error);
      res.status(500).json({
        success: false,
        message: 'Error processing unsubscribe request'
      });
    }
  },

  /**
   * Unsubscribe confirmation page
   * GET /track/unsubscribe/:token
   */
  unsubscribePage: async (req, res) => {
    try {
      const { token } = req.params;

      // Validate token
      const validation = unsubscribeModel.isValidToken(token);

      if (!validation.valid) {
        // Render error page (we'll handle this in the frontend)
        return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/unsubscribe?token=${token}&error=${encodeURIComponent(validation.reason)}`);
      }

      // Redirect to frontend unsubscribe page with token
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/unsubscribe?token=${token}`);

    } catch (error) {
      logger.error('Error loading unsubscribe page:', error);
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/unsubscribe?error=An+error+occurred`);
    }
  },

  /**
   * Confirm unsubscribe (from web page)
   * POST /api/unsubscribe/confirm
   */
  confirmUnsubscribe: async (req, res) => {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({
          success: false,
          message: 'Token is required'
        });
      }

      // Validate token
      const validation = unsubscribeModel.isValidToken(token);

      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.reason
        });
      }

      const tokenData = validation.data;

      // Mark token as used
      unsubscribeModel.markAsUsed(token);

      // Unsubscribe
      if (tokenData.list_id) {
        unsubscribeModel.unsubscribeFromList(tokenData.contact_id, tokenData.list_id);
      } else {
        unsubscribeModel.unsubscribeGlobally(tokenData.contact_id);
      }

      // Log event
      if (tokenData.campaign_id) {
        const messageStmt = db.prepare(`
          SELECT id FROM messages
          WHERE campaign_id = ? AND contact_id = ?
          LIMIT 1
        `);

        const message = messageStmt.get(tokenData.campaign_id, tokenData.contact_id);

        if (message) {
          const eventStmt = db.prepare(`
            INSERT INTO message_events (message_id, event_type, event_data, ip_address, user_agent, created_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
          `);

          const eventData = JSON.stringify({
            token: token,
            list_id: tokenData.list_id,
            method: 'web-form'
          });

          eventStmt.run(
            message.id,
            'unsubscribed',
            eventData,
            getClientIp(req),
            req.headers['user-agent']
          );
        }
      }

      logger.info(`Contact ${tokenData.contact_id} confirmed unsubscribe via web`);

      res.json({
        success: true,
        message: 'Successfully unsubscribed',
        data: {
          email: tokenData.email,
          list_name: tokenData.list_name
        }
      });

    } catch (error) {
      logger.error('Error confirming unsubscribe:', error);
      res.status(500).json({
        success: false,
        message: 'Error processing unsubscribe'
      });
    }
  }
};

module.exports = trackingController;
