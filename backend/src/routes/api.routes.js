const express = require('express');
const { body } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const AuthController = require('../controllers/auth.controller');
const TemplateController = require('../controllers/template.controller');
const ListController = require('../controllers/list.controller');
const ContactController = require('../controllers/contact.controller');
const CampaignController = require('../controllers/campaign.controller');
const TrackingController = require('../controllers/tracking.controller');
const AnalyticsController = require('../controllers/analytics.controller');
const SmtpController = require('../controllers/smtp.controller');
const SegmentController = require('../controllers/segment.controller');
const HealthController = require('../controllers/health.controller');
const { generateCsrfToken, getRateLimiterStats, authLimiter, campaignLimiter, importLimiter } = require('../middleware/security');

const router = express.Router();

// Health check routes (public - no authentication required)
router.get('/health', HealthController.getHealth);
router.get('/health/detailed', HealthController.getDetailedHealth);
router.get('/health/metrics', HealthController.getMetrics);
router.get('/health/database', HealthController.getDatabaseHealth);
router.get('/health/queue', HealthController.getQueueHealth);
router.get('/health/smtp', HealthController.getSmtpHealth);

// Security routes
router.get('/csrf-token', authenticateToken, generateCsrfToken);
router.get('/rate-limiter/stats', authenticateToken, (req, res) => {
  res.json(getRateLimiterStats());
});

// Database optimization routes (admin only)
const dbOptimizer = require('../utils/database-optimizer');
router.get('/database/stats', authenticateToken, (req, res) => {
  try {
    const stats = dbOptimizer.getPerformanceStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/database/optimize', authenticateToken, (req, res) => {
  try {
    const result = dbOptimizer.optimizeFull();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/database/maintenance', authenticateToken, (req, res) => {
  try {
    const result = dbOptimizer.scheduledMaintenance();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Auth routes (public) - with stricter rate limiting
router.post('/auth/login',
  authLimiter.middleware(),
  [
    body('username').notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
    validate
  ],
  AuthController.login
);

// Auth routes (protected)
router.post('/auth/change-password',
  authenticateToken,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
    validate
  ],
  AuthController.changePassword
);

// Template routes
router.get('/templates', authenticateToken, TemplateController.getAll);
router.get('/templates/:id', authenticateToken, TemplateController.getById);
router.post('/templates',
  authenticateToken,
  [
    body('name').notEmpty().withMessage('Template name is required'),
    body('subject').notEmpty().withMessage('Subject is required'),
    body('body').notEmpty().withMessage('Body is required'),
    body('type').optional().isIn(['html', 'text']).withMessage('Type must be html or text'),
    validate
  ],
  TemplateController.create
);
router.put('/templates/:id',
  authenticateToken,
  [
    body('name').notEmpty().withMessage('Template name is required'),
    body('subject').notEmpty().withMessage('Subject is required'),
    body('body').notEmpty().withMessage('Body is required'),
    body('type').optional().isIn(['html', 'text']).withMessage('Type must be html or text'),
    validate
  ],
  TemplateController.update
);
router.delete('/templates/:id', authenticateToken, TemplateController.delete);

// List routes
router.get('/lists', authenticateToken, ListController.getAll);
router.get('/lists/:id', authenticateToken, ListController.getById);
router.post('/lists',
  authenticateToken,
  [
    body('name').notEmpty().withMessage('List name is required'),
    body('description').optional(),
    body('custom_fields').optional().isObject().withMessage('Custom fields must be an object'),
    validate
  ],
  ListController.create
);
router.put('/lists/:id',
  authenticateToken,
  [
    body('name').notEmpty().withMessage('List name is required'),
    body('description').optional(),
    body('custom_fields').optional().isObject().withMessage('Custom fields must be an object'),
    validate
  ],
  ListController.update
);
router.delete('/lists/:id', authenticateToken, ListController.delete);

// List subscriber routes
router.get('/lists/:id/subscribers', authenticateToken, ListController.getSubscribers);
router.post('/lists/:id/subscribers',
  authenticateToken,
  [
    body('contact_id').isInt().withMessage('Valid contact ID is required'),
    body('custom_field_values').optional().isObject(),
    validate
  ],
  ListController.addSubscriber
);
router.delete('/lists/:id/subscribers/:contactId', authenticateToken, ListController.removeSubscriber);

// Contact routes
router.get('/contacts', authenticateToken, ContactController.getAll);
router.get('/contacts/stats', authenticateToken, ContactController.getStats);
router.get('/contacts/:id', authenticateToken, ContactController.getById);
router.post('/contacts',
  authenticateToken,
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('first_name').optional(),
    body('last_name').optional(),
    body('status').optional().isIn(['active', 'bounced', 'unsubscribed']),
    validate
  ],
  ContactController.create
);
router.put('/contacts/:id',
  authenticateToken,
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('first_name').optional(),
    body('last_name').optional(),
    body('status').optional().isIn(['active', 'bounced', 'unsubscribed']),
    validate
  ],
  ContactController.update
);
router.delete('/contacts/:id', authenticateToken, ContactController.delete);
router.post('/contacts/bulk-import',
  authenticateToken,
  importLimiter.middleware(),
  [
    body('contacts').isArray().withMessage('Contacts must be an array'),
    validate
  ],
  ContactController.bulkImport
);

// Campaign routes
router.get('/campaigns', authenticateToken, CampaignController.getCampaigns);
router.get('/campaigns/:id', authenticateToken, CampaignController.getCampaignById);
router.post('/campaigns',
  authenticateToken,
  [
    body('name').notEmpty().withMessage('Campaign name is required'),
    body('template_id').isInt().withMessage('Valid template ID is required'),
    body('list_id').isInt().withMessage('Valid list ID is required'),
    body('from_email').isEmail().withMessage('Valid from email is required'),
    body('from_name').notEmpty().withMessage('From name is required'),
    body('reply_to').optional().isEmail().withMessage('Reply-to must be a valid email'),
    validate
  ],
  CampaignController.createCampaign
);
router.put('/campaigns/:id',
  authenticateToken,
  [
    body('name').optional().notEmpty().withMessage('Campaign name cannot be empty'),
    body('template_id').optional().isInt().withMessage('Template ID must be valid'),
    body('list_id').optional().isInt().withMessage('List ID must be valid'),
    body('from_email').optional().isEmail().withMessage('From email must be valid'),
    body('from_name').optional().notEmpty().withMessage('From name cannot be empty'),
    body('reply_to').optional().isEmail().withMessage('Reply-to must be a valid email'),
    validate
  ],
  CampaignController.updateCampaign
);
router.delete('/campaigns/:id', authenticateToken, CampaignController.deleteCampaign);

// Campaign actions - with rate limiting
router.post('/campaigns/:id/send', authenticateToken, campaignLimiter.middleware(), CampaignController.sendCampaign);
router.post('/campaigns/:id/test',
  authenticateToken,
  [
    body('test_email').isEmail().withMessage('Valid test email is required'),
    validate
  ],
  CampaignController.sendTestEmail
);
router.post('/campaigns/:id/schedule',
  authenticateToken,
  [
    body('scheduled_at').notEmpty().withMessage('Scheduled time is required'),
    validate
  ],
  CampaignController.scheduleCampaign
);
router.post('/campaigns/:id/cancel', authenticateToken, CampaignController.cancelSchedule);

// Campaign stats and preview
router.get('/campaigns/:id/stats', authenticateToken, CampaignController.getCampaignStats);
router.post('/campaigns/:id/preview', authenticateToken, CampaignController.previewCampaign);

// Campaign events and tracking
router.get('/campaigns/:id/events', authenticateToken, CampaignController.getCampaignEvents);
router.get('/campaigns/:id/links', authenticateToken, CampaignController.getCampaignLinks);
router.get('/messages/:id/events', authenticateToken, CampaignController.getMessageEvents);

// Queue status
router.get('/queue/status', authenticateToken, CampaignController.getQueueStatus);

// Tracking routes (public - no authentication required)
router.get('/track/open/:token.png', TrackingController.trackOpen);
router.get('/track/click/:shortCode/:token', TrackingController.trackClick);
router.post('/track/unsubscribe/:token', TrackingController.unsubscribeOneClick);
router.get('/track/unsubscribe/:token', TrackingController.unsubscribePage);

// Unsubscribe confirmation (authenticated)
router.post('/unsubscribe/confirm',
  [
    body('token').notEmpty().withMessage('Token is required'),
    validate
  ],
  TrackingController.confirmUnsubscribe
);

// Analytics routes (authenticated)
router.get('/analytics/overview', authenticateToken, AnalyticsController.getOverviewAnalytics);
router.get('/analytics/campaigns/:id', authenticateToken, AnalyticsController.getCampaignAnalytics);
router.get('/analytics/campaigns/:id/timeline', authenticateToken, AnalyticsController.getCampaignTimeline);
router.get('/analytics/campaigns/:id/top-links', authenticateToken, AnalyticsController.getTopClickedLinks);
router.get('/analytics/campaigns/:id/devices', authenticateToken, AnalyticsController.getDeviceBreakdown);
router.get('/analytics/campaigns/compare', authenticateToken, AnalyticsController.compareCampaigns);

// Analytics export routes
router.get('/analytics/campaigns/:id/export', authenticateToken, AnalyticsController.exportCampaignAnalytics);
router.get('/analytics/campaigns/:id/export-events', authenticateToken, AnalyticsController.exportCampaignEvents);
router.get('/analytics/contacts/engagement', authenticateToken, AnalyticsController.getContactEngagement);
router.get('/analytics/contacts/engagement/export', authenticateToken, AnalyticsController.exportContactEngagement);

// ============ PHASE 5 ROUTES ============

// SMTP Configuration routes (authenticated)
router.get('/smtp-configs', authenticateToken, SmtpController.getAllConfigs);
router.get('/smtp-configs/active', authenticateToken, SmtpController.getActiveConfig);
router.get('/smtp-configs/:id', authenticateToken, SmtpController.getConfigById);
router.post('/smtp-configs',
  authenticateToken,
  [
    body('name').notEmpty().withMessage('Configuration name is required'),
    body('host').notEmpty().withMessage('SMTP host is required'),
    body('port').isInt({ min: 1, max: 65535 }).withMessage('Valid port is required'),
    body('secure').optional().isBoolean().withMessage('Secure must be boolean'),
    body('auth_type').optional().isIn(['login', 'oauth2', 'none']).withMessage('Invalid auth type'),
    body('from_email').isEmail().withMessage('Valid from email is required'),
    body('from_name').notEmpty().withMessage('From name is required'),
    body('max_rate').optional().isInt({ min: 1 }).withMessage('Max rate must be positive integer'),
    validate
  ],
  SmtpController.createConfig
);
router.put('/smtp-configs/:id',
  authenticateToken,
  [
    body('name').optional().notEmpty().withMessage('Name cannot be empty'),
    body('host').optional().notEmpty().withMessage('Host cannot be empty'),
    body('port').optional().isInt({ min: 1, max: 65535 }).withMessage('Valid port is required'),
    body('from_email').optional().isEmail().withMessage('Valid from email is required'),
    body('from_name').optional().notEmpty().withMessage('From name cannot be empty'),
    validate
  ],
  SmtpController.updateConfig
);
router.delete('/smtp-configs/:id', authenticateToken, SmtpController.deleteConfig);
router.post('/smtp-configs/:id/activate', authenticateToken, SmtpController.setActive);
router.post('/smtp-configs/:id/test', authenticateToken, SmtpController.testConnection);

// List Segmentation routes (authenticated)
router.post('/lists/:id/segment',
  authenticateToken,
  [
    body('filters').isArray().withMessage('Filters must be an array'),
    validate
  ],
  SegmentController.segmentList
);
router.post('/lists/:id/segment/count',
  authenticateToken,
  [
    body('filters').isArray().withMessage('Filters must be an array'),
    validate
  ],
  SegmentController.getSegmentCount
);
router.post('/contacts/segment',
  authenticateToken,
  [
    body('filters').isArray().withMessage('Filters must be an array'),
    validate
  ],
  SegmentController.segmentContacts
);

// Contact Hygiene routes (authenticated)
router.get('/contacts/hygiene/stats', authenticateToken, (req, res) => {
  try {
    const ContactModel = require('../models/contact.model');
    const stats = ContactModel.getHygieneStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get hygiene stats' });
  }
});

router.get('/contacts/hygiene/duplicates', authenticateToken, (req, res) => {
  try {
    const ContactModel = require('../models/contact.model');
    const duplicates = ContactModel.findDuplicates();
    res.json({ duplicates });
  } catch (error) {
    res.status(500).json({ error: 'Failed to find duplicates' });
  }
});

router.post('/contacts/hygiene/clean-invalid',
  authenticateToken,
  [
    body('dryRun').optional().isBoolean(),
    validate
  ],
  (req, res) => {
    try {
      const ContactModel = require('../models/contact.model');
      const { dryRun = true } = req.body;
      const result = ContactModel.cleanInvalidEmails(dryRun);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to clean invalid emails' });
    }
  }
);

router.post('/contacts/hygiene/merge-duplicates',
  authenticateToken,
  [
    body('keepId').isInt().withMessage('Keep ID must be valid'),
    body('deleteIds').isArray().withMessage('Delete IDs must be an array'),
    validate
  ],
  (req, res) => {
    try {
      const ContactModel = require('../models/contact.model');
      const { keepId, deleteIds } = req.body;
      const result = ContactModel.mergeDuplicates(keepId, deleteIds);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to merge duplicates' });
    }
  }
);

router.post('/contacts/hygiene/remove-hard-bounces', authenticateToken, (req, res) => {
  try {
    const ContactModel = require('../models/contact.model');
    const count = ContactModel.removeHardBounces();
    res.json({ message: `${count} contacts marked as bounced`, count });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove hard bounces' });
  }
});

router.post('/contacts/hygiene/sunset-inactive',
  authenticateToken,
  [
    body('inactiveDays').optional().isInt({ min: 1 }).withMessage('Inactive days must be positive'),
    validate
  ],
  (req, res) => {
    try {
      const ContactModel = require('../models/contact.model');
      const { inactiveDays = 180 } = req.body;
      const count = ContactModel.sunsetInactiveContacts(inactiveDays);
      res.json({ message: `${count} contacts marked as unsubscribed`, count });
    } catch (error) {
      res.status(500).json({ error: 'Failed to sunset inactive contacts' });
    }
  }
);

// Engagement Scores (authenticated)
router.get('/contacts/engagement-scores', authenticateToken, (req, res) => {
  try {
    const ContactModel = require('../models/contact.model');
    const limit = parseInt(req.query.limit) || 100;
    const minScore = parseInt(req.query.minScore) || 0;
    const contacts = ContactModel.getWithEngagementScores(limit, minScore);
    res.json({ contacts, count: contacts.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get engagement scores' });
  }
});

router.get('/contacts/:id/engagement-score', authenticateToken, (req, res) => {
  try {
    const ContactModel = require('../models/contact.model');
    const { id } = req.params;
    const score = ContactModel.calculateEngagementScore(id);
    res.json({ contactId: id, engagement_score: score });
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate engagement score' });
  }
});

// Scheduler status (authenticated)
router.get('/scheduler/status', authenticateToken, (req, res) => {
  try {
    const schedulerService = require('../services/scheduler.service');
    const status = schedulerService.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get scheduler status' });
  }
});

router.get('/scheduler/upcoming', authenticateToken, (req, res) => {
  try {
    const schedulerService = require('../services/scheduler.service');
    const limit = parseInt(req.query.limit) || 10;
    const campaigns = schedulerService.getUpcomingCampaigns(limit);
    res.json({ campaigns, count: campaigns.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get upcoming campaigns' });
  }
});

// Bounce statistics (authenticated)
router.get('/bounces/stats', authenticateToken, (req, res) => {
  try {
    const bounceService = require('../services/bounce.service');
    const stats = bounceService.getBounceStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get bounce stats' });
  }
});

// ===================================
// PHASE 7: GMAIL COMPLIANCE & AUTHENTICATION ROUTES
// ===================================

const ComplianceController = require('../controllers/compliance.controller');

// DNS Validation Routes
router.get('/compliance/dns/validate', authenticateToken, ComplianceController.validateDNS);
router.get('/compliance/dns/validate/:type', authenticateToken, ComplianceController.validateDNSRecord);
router.get('/compliance/dns/propagation', authenticateToken, ComplianceController.checkDNSPropagation);

// Content Validation Routes
router.post('/compliance/content/validate', authenticateToken, ComplianceController.validateContent);
router.post('/compliance/content/health-score', authenticateToken, ComplianceController.getContentHealthScore);

// Blacklist Check Routes
router.get('/compliance/blacklist/ip', authenticateToken, ComplianceController.checkIPBlacklist);
router.get('/compliance/blacklist/domain', authenticateToken, ComplianceController.checkDomainBlacklist);
router.get('/compliance/blacklist/comprehensive', authenticateToken, ComplianceController.comprehensiveBlacklistCheck);

// Warmup Management Routes
router.get('/compliance/warmup/status', authenticateToken, ComplianceController.getWarmupStatus);
router.get('/compliance/warmup/schedule', authenticateToken, ComplianceController.getWarmupSchedule);
router.post('/compliance/warmup/start', authenticateToken, ComplianceController.startWarmup);
router.post('/compliance/warmup/:id/complete', authenticateToken, ComplianceController.completeWarmup);
router.post('/compliance/warmup/:id/pause', authenticateToken, ComplianceController.pauseWarmup);
router.post('/compliance/warmup/:id/resume', authenticateToken, ComplianceController.resumeWarmup);
router.get('/compliance/warmup/:id/history', authenticateToken, ComplianceController.getWarmupHistory);

// Spam Monitoring Routes
router.get('/compliance/spam/metrics', authenticateToken, ComplianceController.getSpamMetrics);
router.post('/compliance/spam/check', authenticateToken, ComplianceController.performSpamCheck);
router.get('/compliance/spam/history', authenticateToken, ComplianceController.getSpamMetricsHistory);
router.put('/compliance/spam/thresholds', authenticateToken, ComplianceController.updateSpamThresholds);

// Sender Reputation Routes
router.get('/compliance/reputation', authenticateToken, ComplianceController.getReputationScore);

// Compliance Dashboard Route
router.get('/compliance/dashboard', authenticateToken, ComplianceController.getComplianceDashboard);

module.exports = router;
