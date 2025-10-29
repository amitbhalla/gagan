const logger = require('../config/logger');
const dnsValidator = require('../utils/dns-validator');
const contentValidator = require('../utils/content-validator');
const blacklistChecker = require('../utils/blacklist-checker');
const warmupService = require('../services/warmup.service');
const spamMonitorService = require('../services/spam-monitor.service');

/**
 * Compliance Controller
 * Handles all Gmail compliance and email authentication endpoints
 */

/**
 * Validate DNS records (SPF, DKIM, DMARC)
 * GET /api/compliance/dns/validate
 */
exports.validateDNS = async (req, res) => {
  try {
    const { domain, dkimSelector } = req.query;

    if (!domain) {
      return res.status(400).json({
        error: 'Domain parameter is required'
      });
    }

    const result = await dnsValidator.validateDomain(
      domain,
      dkimSelector || process.env.DKIM_SELECTOR || 'default'
    );

    res.json(result);
  } catch (error) {
    logger.error('DNS validation error:', error);
    res.status(500).json({
      error: 'Failed to validate DNS records',
      message: error.message
    });
  }
};

/**
 * Validate individual DNS record types
 * GET /api/compliance/dns/validate/:type
 */
exports.validateDNSRecord = async (req, res) => {
  try {
    const { type } = req.params;
    const { domain, selector } = req.query;

    if (!domain) {
      return res.status(400).json({
        error: 'Domain parameter is required'
      });
    }

    let result;

    switch (type.toLowerCase()) {
      case 'spf':
        result = await dnsValidator.validateSPF(domain);
        break;

      case 'dkim':
        result = await dnsValidator.validateDKIM(
          domain,
          selector || process.env.DKIM_SELECTOR || 'default'
        );
        break;

      case 'dmarc':
        result = await dnsValidator.validateDMARC(domain);
        break;

      default:
        return res.status(400).json({
          error: `Invalid DNS record type: ${type}. Use 'spf', 'dkim', or 'dmarc'`
        });
    }

    res.json(result);
  } catch (error) {
    logger.error(`DNS ${req.params.type} validation error:`, error);
    res.status(500).json({
      error: `Failed to validate ${req.params.type.toUpperCase()} record`,
      message: error.message
    });
  }
};

/**
 * Check DNS propagation
 * GET /api/compliance/dns/propagation
 */
exports.checkDNSPropagation = async (req, res) => {
  try {
    const { hostname, recordType } = req.query;

    if (!hostname) {
      return res.status(400).json({
        error: 'Hostname parameter is required'
      });
    }

    const result = await dnsValidator.checkDNSPropagation(
      hostname,
      recordType || 'TXT'
    );

    res.json(result);
  } catch (error) {
    logger.error('DNS propagation check error:', error);
    res.status(500).json({
      error: 'Failed to check DNS propagation',
      message: error.message
    });
  }
};

/**
 * Validate email content for spam compliance
 * POST /api/compliance/content/validate
 */
exports.validateContent = async (req, res) => {
  try {
    const { subject, html, plainText } = req.body;

    if (!subject || !html) {
      return res.status(400).json({
        error: 'Subject and HTML content are required'
      });
    }

    const result = contentValidator.validateEmailContent({
      subject,
      html,
      plainText: plainText || ''
    });

    res.json(result);
  } catch (error) {
    logger.error('Content validation error:', error);
    res.status(500).json({
      error: 'Failed to validate content',
      message: error.message
    });
  }
};

/**
 * Get content health score
 * POST /api/compliance/content/health-score
 */
exports.getContentHealthScore = async (req, res) => {
  try {
    const { subject, html, plainText } = req.body;

    if (!subject || !html) {
      return res.status(400).json({
        error: 'Subject and HTML content are required'
      });
    }

    const result = contentValidator.getContentHealthScore({
      subject,
      html,
      plainText: plainText || ''
    });

    res.json(result);
  } catch (error) {
    logger.error('Content health score error:', error);
    res.status(500).json({
      error: 'Failed to calculate content health score',
      message: error.message
    });
  }
};

/**
 * Check IP blacklist status
 * GET /api/compliance/blacklist/ip
 */
exports.checkIPBlacklist = async (req, res) => {
  try {
    const { ip } = req.query;

    let ipToCheck = ip;

    // If no IP provided, try to detect
    if (!ipToCheck) {
      try {
        ipToCheck = await blacklistChecker.getExternalIP();
      } catch (error) {
        return res.status(400).json({
          error: 'Could not detect IP address. Please provide IP parameter.',
          message: error.message
        });
      }
    }

    const result = await blacklistChecker.checkIP(ipToCheck);

    res.json(result);
  } catch (error) {
    logger.error('IP blacklist check error:', error);
    res.status(500).json({
      error: 'Failed to check IP blacklist',
      message: error.message
    });
  }
};

/**
 * Check domain blacklist status
 * GET /api/compliance/blacklist/domain
 */
exports.checkDomainBlacklist = async (req, res) => {
  try {
    const { domain } = req.query;

    if (!domain) {
      return res.status(400).json({
        error: 'Domain parameter is required'
      });
    }

    const result = await blacklistChecker.checkDomain(domain);

    res.json(result);
  } catch (error) {
    logger.error('Domain blacklist check error:', error);
    res.status(500).json({
      error: 'Failed to check domain blacklist',
      message: error.message
    });
  }
};

/**
 * Comprehensive blacklist check (IP + domain)
 * GET /api/compliance/blacklist/comprehensive
 */
exports.comprehensiveBlacklistCheck = async (req, res) => {
  try {
    const { ip, domain } = req.query;

    const result = await blacklistChecker.comprehensiveCheck(
      ip || null,
      domain || process.env.DKIM_DOMAIN || null
    );

    res.json(result);
  } catch (error) {
    logger.error('Comprehensive blacklist check error:', error);
    res.status(500).json({
      error: 'Failed to perform comprehensive blacklist check',
      message: error.message
    });
  }
};

/**
 * Get warmup status
 * GET /api/compliance/warmup/status
 */
exports.getWarmupStatus = async (req, res) => {
  try {
    const { warmupId } = req.query;

    const status = warmupService.getWarmupStatus(
      warmupId ? parseInt(warmupId) : null
    );

    res.json(status);
  } catch (error) {
    logger.error('Get warmup status error:', error);
    res.status(500).json({
      error: 'Failed to get warmup status',
      message: error.message
    });
  }
};

/**
 * Start new warmup period
 * POST /api/compliance/warmup/start
 */
exports.startWarmup = async (req, res) => {
  try {
    const { smtpConfigId } = req.body;

    const warmup = warmupService.startWarmup(smtpConfigId || null);

    res.json({
      success: true,
      message: 'Warmup period started successfully',
      warmup
    });
  } catch (error) {
    logger.error('Start warmup error:', error);
    res.status(500).json({
      error: 'Failed to start warmup period',
      message: error.message
    });
  }
};

/**
 * Complete warmup period
 * POST /api/compliance/warmup/:id/complete
 */
exports.completeWarmup = async (req, res) => {
  try {
    const { id } = req.params;

    const result = warmupService.completeWarmup(parseInt(id));

    res.json(result);
  } catch (error) {
    logger.error('Complete warmup error:', error);
    res.status(500).json({
      error: 'Failed to complete warmup period',
      message: error.message
    });
  }
};

/**
 * Pause warmup period
 * POST /api/compliance/warmup/:id/pause
 */
exports.pauseWarmup = async (req, res) => {
  try {
    const { id } = req.params;

    warmupService.pauseWarmup(parseInt(id));

    res.json({
      success: true,
      message: 'Warmup period paused'
    });
  } catch (error) {
    logger.error('Pause warmup error:', error);
    res.status(500).json({
      error: 'Failed to pause warmup period',
      message: error.message
    });
  }
};

/**
 * Resume warmup period
 * POST /api/compliance/warmup/:id/resume
 */
exports.resumeWarmup = async (req, res) => {
  try {
    const { id } = req.params;

    warmupService.resumeWarmup(parseInt(id));

    res.json({
      success: true,
      message: 'Warmup period resumed'
    });
  } catch (error) {
    logger.error('Resume warmup error:', error);
    res.status(500).json({
      error: 'Failed to resume warmup period',
      message: error.message
    });
  }
};

/**
 * Get warmup schedule
 * GET /api/compliance/warmup/schedule
 */
exports.getWarmupSchedule = async (req, res) => {
  try {
    const schedule = warmupService.getSchedule();

    res.json({
      schedule,
      description: 'Recommended warmup schedule for new IPs'
    });
  } catch (error) {
    logger.error('Get warmup schedule error:', error);
    res.status(500).json({
      error: 'Failed to get warmup schedule',
      message: error.message
    });
  }
};

/**
 * Get warmup history
 * GET /api/compliance/warmup/:id/history
 */
exports.getWarmupHistory = async (req, res) => {
  try {
    const { id } = req.params;

    const history = warmupService.getWarmupHistory(parseInt(id));

    res.json({ history });
  } catch (error) {
    logger.error('Get warmup history error:', error);
    res.status(500).json({
      error: 'Failed to get warmup history',
      message: error.message
    });
  }
};

/**
 * Get spam rate metrics
 * GET /api/compliance/spam/metrics
 */
exports.getSpamMetrics = async (req, res) => {
  try {
    const metrics = spamMonitorService.calculateMetrics();

    res.json(metrics);
  } catch (error) {
    logger.error('Get spam metrics error:', error);
    res.status(500).json({
      error: 'Failed to get spam metrics',
      message: error.message
    });
  }
};

/**
 * Perform spam rate check manually
 * POST /api/compliance/spam/check
 */
exports.performSpamCheck = async (req, res) => {
  try {
    const result = await spamMonitorService.performCheck();

    res.json(result);
  } catch (error) {
    logger.error('Spam check error:', error);
    res.status(500).json({
      error: 'Failed to perform spam check',
      message: error.message
    });
  }
};

/**
 * Get spam metrics history
 * GET /api/compliance/spam/history
 */
exports.getSpamMetricsHistory = async (req, res) => {
  try {
    const { days } = req.query;

    const history = spamMonitorService.getMetricsHistory(
      days ? parseInt(days) : 30
    );

    res.json({ history });
  } catch (error) {
    logger.error('Get spam metrics history error:', error);
    res.status(500).json({
      error: 'Failed to get spam metrics history',
      message: error.message
    });
  }
};

/**
 * Get sender reputation score
 * GET /api/compliance/reputation
 */
exports.getReputationScore = async (req, res) => {
  try {
    const reputation = spamMonitorService.getReputationScore();

    res.json(reputation);
  } catch (error) {
    logger.error('Get reputation score error:', error);
    res.status(500).json({
      error: 'Failed to get reputation score',
      message: error.message
    });
  }
};

/**
 * Update spam thresholds
 * PUT /api/compliance/spam/thresholds
 */
exports.updateSpamThresholds = async (req, res) => {
  try {
    const { spamRate, bounceRate, complaintRate, unsubscribeRate, openRate } = req.body;

    const thresholds = {};
    if (spamRate !== undefined) thresholds.spamRate = parseFloat(spamRate);
    if (bounceRate !== undefined) thresholds.bounceRate = parseFloat(bounceRate);
    if (complaintRate !== undefined) thresholds.complaintRate = parseFloat(complaintRate);
    if (unsubscribeRate !== undefined) thresholds.unsubscribeRate = parseFloat(unsubscribeRate);
    if (openRate !== undefined) thresholds.openRate = parseFloat(openRate);

    spamMonitorService.updateThresholds(thresholds);

    res.json({
      success: true,
      message: 'Spam thresholds updated successfully',
      thresholds
    });
  } catch (error) {
    logger.error('Update spam thresholds error:', error);
    res.status(500).json({
      error: 'Failed to update spam thresholds',
      message: error.message
    });
  }
};

/**
 * Get comprehensive compliance dashboard data
 * GET /api/compliance/dashboard
 */
exports.getComplianceDashboard = async (req, res) => {
  try {
    const domain = req.query.domain || process.env.DKIM_DOMAIN;
    const dkimSelector = req.query.dkimSelector || process.env.DKIM_SELECTOR || 'default';

    // Gather all compliance data in parallel
    const [
      dnsValidation,
      blacklistCheck,
      spamMetrics,
      reputationScore,
      warmupStatus
    ] = await Promise.all([
      dnsValidator.validateDomain(domain, dkimSelector).catch(e => ({ error: e.message })),
      blacklistChecker.comprehensiveCheck(null, domain).catch(e => ({ error: e.message })),
      Promise.resolve(spamMonitorService.calculateMetrics()),
      Promise.resolve(spamMonitorService.getReputationScore()),
      Promise.resolve(warmupService.getWarmupStatus())
    ]);

    // Calculate overall compliance score
    let overallScore = 0;
    let maxScore = 0;

    // DNS validation (30 points)
    if (dnsValidation.score) {
      overallScore += (dnsValidation.score / 100) * 30;
    }
    maxScore += 30;

    // Blacklist status (25 points)
    if (blacklistCheck.overallScore) {
      overallScore += (blacklistCheck.overallScore / 100) * 25;
    }
    maxScore += 25;

    // Reputation score (25 points)
    if (reputationScore.score) {
      overallScore += (reputationScore.score / 100) * 25;
    }
    maxScore += 25;

    // Spam metrics (20 points)
    const spamScore = 100 - (spamMetrics.rates.spam * 10) - (spamMetrics.rates.bounce * 2);
    overallScore += Math.max(spamScore / 100, 0) * 20;
    maxScore += 20;

    const finalScore = Math.round((overallScore / maxScore) * 100);

    let status;
    if (finalScore >= 90) status = 'excellent';
    else if (finalScore >= 75) status = 'good';
    else if (finalScore >= 60) status = 'fair';
    else status = 'poor';

    res.json({
      overallScore: finalScore,
      status,
      timestamp: new Date().toISOString(),
      dnsValidation,
      blacklistCheck,
      spamMetrics,
      reputationScore,
      warmupStatus,
      recommendations: generateRecommendations({
        dnsValidation,
        blacklistCheck,
        spamMetrics,
        reputationScore
      })
    });
  } catch (error) {
    logger.error('Get compliance dashboard error:', error);
    res.status(500).json({
      error: 'Failed to get compliance dashboard',
      message: error.message
    });
  }
};

/**
 * Generate recommendations based on compliance data
 * @param {Object} data - Compliance data
 * @returns {Array} - Array of recommendations
 */
function generateRecommendations(data) {
  const recommendations = [];

  // DNS recommendations
  if (data.dnsValidation) {
    if (!data.dnsValidation.spf?.found) {
      recommendations.push({
        priority: 'high',
        category: 'DNS',
        message: 'Add SPF record to your DNS',
        action: 'Configure SPF record'
      });
    }
    if (!data.dnsValidation.dkim?.found) {
      recommendations.push({
        priority: 'high',
        category: 'DNS',
        message: 'Add DKIM record to your DNS',
        action: 'Configure DKIM record'
      });
    }
    if (!data.dnsValidation.dmarc?.found) {
      recommendations.push({
        priority: 'high',
        category: 'DNS',
        message: 'Add DMARC record to your DNS',
        action: 'Configure DMARC record'
      });
    }
  }

  // Blacklist recommendations
  if (data.blacklistCheck) {
    if (data.blacklistCheck.ip?.listed > 0) {
      recommendations.push({
        priority: 'critical',
        category: 'Blacklist',
        message: `Your IP is listed on ${data.blacklistCheck.ip.listed} blacklist(s)`,
        action: 'Request delisting and review sending practices'
      });
    }
    if (data.blacklistCheck.domain?.listed > 0) {
      recommendations.push({
        priority: 'critical',
        category: 'Blacklist',
        message: `Your domain is listed on ${data.blacklistCheck.domain.listed} blacklist(s)`,
        action: 'Request delisting and review domain reputation'
      });
    }
  }

  // Spam metrics recommendations
  if (data.spamMetrics) {
    if (data.spamMetrics.rates.spam > 0.3) {
      recommendations.push({
        priority: 'critical',
        category: 'Spam Rate',
        message: `Spam rate is ${data.spamMetrics.rates.spam}% (threshold: 0.3%)`,
        action: 'Pause campaigns and review email content'
      });
    }
    if (data.spamMetrics.rates.bounce > 5) {
      recommendations.push({
        priority: 'high',
        category: 'Bounce Rate',
        message: `Bounce rate is ${data.spamMetrics.rates.bounce}% (threshold: 5%)`,
        action: 'Clean your email list'
      });
    }
    if (data.spamMetrics.rates.open < 10) {
      recommendations.push({
        priority: 'medium',
        category: 'Engagement',
        message: `Low open rate: ${data.spamMetrics.rates.open}%`,
        action: 'Improve email content and subject lines'
      });
    }
  }

  // Reputation recommendations
  if (data.reputationScore) {
    if (data.reputationScore.score < 70) {
      recommendations.push({
        priority: 'high',
        category: 'Reputation',
        message: `Sender reputation is ${data.reputationScore.status} (${data.reputationScore.score}/100)`,
        action: 'Follow email best practices to improve reputation'
      });
    }
  }

  return recommendations;
}

module.exports = exports;
