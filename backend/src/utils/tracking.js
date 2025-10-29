/**
 * Tracking Utilities
 * Functions for URL rewriting, pixel injection, and tracking setup
 */

const linkModel = require('../models/link.model');
const config = require('../config/database');

const TRACKING_DOMAIN = process.env.TRACKING_DOMAIN || process.env.APP_URL || 'localhost:3001';

/**
 * Inject tracking pixel into HTML email
 */
function injectTrackingPixel(htmlContent, trackingToken) {
  const trackingUrl = `https://${TRACKING_DOMAIN}/track/open/${trackingToken}.png`;

  // Create tracking pixel HTML
  const trackingPixel = `<img src="${trackingUrl}" width="1" height="1" alt="" style="display:block;border:0;" />`;

  // Try to insert before closing body tag
  if (htmlContent.includes('</body>')) {
    return htmlContent.replace('</body>', `${trackingPixel}</body>`);
  }

  // If no body tag, append to end
  return htmlContent + trackingPixel;
}

/**
 * Rewrite all links in HTML to use tracking URLs
 */
function rewriteLinks(htmlContent, campaignId, trackingToken) {
  // Regular expression to match href attributes
  const hrefRegex = /href=["']([^"']+)["']/gi;

  const rewrittenHtml = htmlContent.replace(hrefRegex, (match, url) => {
    // Skip anchor links, mailto, tel, etc.
    if (url.startsWith('#') || url.startsWith('mailto:') || url.startsWith('tel:')) {
      return match;
    }

    // Skip unsubscribe links (they're added separately)
    if (url.includes('/track/unsubscribe/')) {
      return match;
    }

    // Create or find tracking link
    const link = linkModel.findOrCreate(campaignId, url);

    // Create tracking URL
    const trackingUrl = `https://${TRACKING_DOMAIN}/track/click/${link.short_code}/${trackingToken}`;

    return `href="${trackingUrl}"`;
  });

  return rewrittenHtml;
}

/**
 * Add unsubscribe footer to email
 */
function addUnsubscribeFooter(htmlContent, unsubscribeToken) {
  const unsubscribeUrl = `https://${TRACKING_DOMAIN}/track/unsubscribe/${unsubscribeToken}`;

  const footer = `
    <div style="font-size: 12px; color: #999; text-align: center; margin-top: 40px; padding: 20px; border-top: 1px solid #eee;">
      <p style="margin: 0 0 10px 0;">
        Don't want to receive these emails?
        <a href="${unsubscribeUrl}" style="color: #666; text-decoration: underline;">Unsubscribe</a>
      </p>
      <p style="margin: 0; font-size: 11px; color: #aaa;">
        This email was sent to you as part of a marketing campaign.
      </p>
    </div>
  `;

  // Try to insert before closing body tag
  if (htmlContent.includes('</body>')) {
    return htmlContent.replace('</body>', `${footer}</body>`);
  }

  // If no body tag, append to end
  return htmlContent + footer;
}

/**
 * Process email HTML with all tracking features
 */
function processEmailHtml(htmlContent, campaignId, trackingToken, unsubscribeToken) {
  let processedHtml = htmlContent;

  // 1. Rewrite links for click tracking
  processedHtml = rewriteLinks(processedHtml, campaignId, trackingToken);

  // 2. Add unsubscribe footer
  processedHtml = addUnsubscribeFooter(processedHtml, unsubscribeToken);

  // 3. Inject tracking pixel
  processedHtml = injectTrackingPixel(processedHtml, trackingToken);

  return processedHtml;
}

/**
 * Generate email headers for compliance and tracking
 */
function generateTrackingHeaders(campaignId, listId, unsubscribeToken) {
  const unsubscribeUrl = `https://${TRACKING_DOMAIN}/track/unsubscribe/${unsubscribeToken}`;

  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    'Precedence': 'bulk',
    'Feedback-ID': `${campaignId}:${listId}:${TRACKING_DOMAIN.split('.')[0]}`,
    'List-ID': `<list${listId}.${TRACKING_DOMAIN}>`
  };
}

/**
 * Detect if user agent is a bot/prefetch
 */
function isBot(userAgent) {
  if (!userAgent) return true;

  const botPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /yahoo/i,       // Yahoo prefetch
    /google/i,      // Google prefetch
    /imageproxy/i,  // Email client image proxy
    /preview/i,     // Email preview pane
    /prefetch/i
  ];

  return botPatterns.some(pattern => pattern.test(userAgent));
}

/**
 * Parse IP address from request (handling proxies)
 */
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
         req.headers['x-real-ip'] ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         null;
}

/**
 * Create 1x1 transparent GIF
 */
function createTrackingPixel() {
  // Base64 encoded 1x1 transparent GIF
  const pixel = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  );

  return pixel;
}

module.exports = {
  injectTrackingPixel,
  rewriteLinks,
  addUnsubscribeFooter,
  processEmailHtml,
  generateTrackingHeaders,
  isBot,
  getClientIp,
  createTrackingPixel
};
