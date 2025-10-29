/**
 * Health Check and Monitoring Controller
 *
 * Provides endpoints for application health monitoring, system metrics,
 * and operational status. Used for load balancer health checks, monitoring
 * systems, and operational dashboards.
 *
 * Endpoints:
 * - GET /api/health - Basic health check
 * - GET /api/health/detailed - Detailed health with dependencies
 * - GET /api/health/metrics - Performance and operational metrics
 * - GET /api/health/database - Database health and statistics
 * - GET /api/health/queue - Email queue status
 * - GET /api/health/smtp - SMTP connection status
 */

const { db } = require('../config/database');
const logger = require('../config/logger');
const os = require('os');
const fs = require('fs');
const path = require('path');

/**
 * Basic health check endpoint
 * Returns 200 if application is running
 * Used by load balancers and monitoring systems
 */
exports.getHealth = (req, res) => {
  try {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'email-marketing-api'
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
};

/**
 * Detailed health check with all dependencies
 * Checks: Database, filesystem, SMTP, queue processor
 */
exports.getDetailedHealth = async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'email-marketing-api',
    version: process.env.npm_package_version || '1.0.0',
    checks: {
      database: { status: 'unknown' },
      filesystem: { status: 'unknown' },
      memory: { status: 'unknown' },
      queue: { status: 'unknown' }
    }
  };

  let allHealthy = true;

  try {
    // Check database connectivity
    try {
      const dbCheck = db.prepare('SELECT 1 as health').get();
      const tableCount = db.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'").get();

      health.checks.database = {
        status: 'healthy',
        tables: tableCount.count,
        responsive: true
      };
    } catch (error) {
      health.checks.database = {
        status: 'unhealthy',
        error: error.message
      };
      allHealthy = false;
    }

    // Check filesystem access
    try {
      const dataPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data');
      const dataDir = path.dirname(dataPath);

      // Check if data directory is writable
      fs.accessSync(dataDir, fs.constants.W_OK);

      // Check disk space
      const stats = fs.statSync(dataPath);
      const fileSizeInMB = stats.size / (1024 * 1024);

      health.checks.filesystem = {
        status: 'healthy',
        writable: true,
        databaseSize: `${fileSizeInMB.toFixed(2)} MB`
      };
    } catch (error) {
      health.checks.filesystem = {
        status: 'unhealthy',
        error: error.message
      };
      allHealthy = false;
    }

    // Check memory usage
    try {
      const memUsage = process.memoryUsage();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const memoryUsagePercent = (usedMem / totalMem) * 100;

      health.checks.memory = {
        status: memoryUsagePercent > 90 ? 'warning' : 'healthy',
        heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`,
        systemMemoryUsage: `${memoryUsagePercent.toFixed(2)}%`
      };

      if (memoryUsagePercent > 90) {
        allHealthy = false;
      }
    } catch (error) {
      health.checks.memory = {
        status: 'unhealthy',
        error: error.message
      };
      allHealthy = false;
    }

    // Check email queue status
    try {
      const queueStats = db.prepare(`
        SELECT
          status,
          COUNT(*) as count
        FROM job_queue
        WHERE created_at > datetime('now', '-24 hours')
        GROUP BY status
      `).all();

      const queueByStatus = {};
      queueStats.forEach(stat => {
        queueByStatus[stat.status] = stat.count;
      });

      const failedCount = queueByStatus.failed || 0;
      const totalCount = Object.values(queueByStatus).reduce((a, b) => a + b, 0);
      const failureRate = totalCount > 0 ? (failedCount / totalCount) * 100 : 0;

      health.checks.queue = {
        status: failureRate > 10 ? 'warning' : 'healthy',
        stats: queueByStatus,
        failureRate: `${failureRate.toFixed(2)}%`,
        last24Hours: totalCount
      };

      if (failureRate > 20) {
        allHealthy = false;
      }
    } catch (error) {
      health.checks.queue = {
        status: 'unhealthy',
        error: error.message
      };
      allHealthy = false;
    }

    // Set overall status
    health.status = allHealthy ? 'healthy' : 'degraded';

    // Return appropriate HTTP status code
    const statusCode = allHealthy ? 200 : 503;
    res.status(statusCode).json(health);

  } catch (error) {
    logger.error('Detailed health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Performance and operational metrics
 * Returns detailed metrics for monitoring systems
 */
exports.getMetrics = async (req, res) => {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      system: {
        uptime: process.uptime(),
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        cpus: os.cpus().length,
        loadAverage: os.loadavg()
      },
      memory: {
        heapUsed: process.memoryUsage().heapUsed,
        heapTotal: process.memoryUsage().heapTotal,
        rss: process.memoryUsage().rss,
        external: process.memoryUsage().external,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem()
      },
      database: {},
      email: {},
      campaigns: {}
    };

    // Database metrics
    try {
      const contactCount = db.prepare('SELECT COUNT(*) as count FROM contacts').get();
      const campaignCount = db.prepare('SELECT COUNT(*) as count FROM campaigns').get();
      const messageCount = db.prepare('SELECT COUNT(*) as count FROM messages').get();
      const dbSize = fs.statSync(process.env.DATABASE_PATH || path.join(__dirname, '../../data/email-marketing.db')).size;

      metrics.database = {
        contacts: contactCount.count,
        campaigns: campaignCount.count,
        messages: messageCount.count,
        sizeBytes: dbSize,
        sizeMB: (dbSize / 1024 / 1024).toFixed(2)
      };
    } catch (error) {
      logger.error('Database metrics error:', error);
      metrics.database.error = error.message;
    }

    // Email metrics (last 24 hours)
    try {
      const emailStats = db.prepare(`
        SELECT
          status,
          COUNT(*) as count
        FROM messages
        WHERE created_at > datetime('now', '-24 hours')
        GROUP BY status
      `).all();

      const statsByStatus = {};
      emailStats.forEach(stat => {
        statsByStatus[stat.status] = stat.count;
      });

      metrics.email = {
        last24Hours: statsByStatus,
        total: Object.values(statsByStatus).reduce((a, b) => a + b, 0)
      };
    } catch (error) {
      logger.error('Email metrics error:', error);
      metrics.email.error = error.message;
    }

    // Campaign metrics
    try {
      const campaignStats = db.prepare(`
        SELECT
          status,
          COUNT(*) as count
        FROM campaigns
        GROUP BY status
      `).all();

      const campaignsByStatus = {};
      campaignStats.forEach(stat => {
        campaignsByStatus[stat.status] = stat.count;
      });

      metrics.campaigns = {
        byStatus: campaignsByStatus,
        total: Object.values(campaignsByStatus).reduce((a, b) => a + b, 0)
      };
    } catch (error) {
      logger.error('Campaign metrics error:', error);
      metrics.campaigns.error = error.message;
    }

    res.status(200).json(metrics);

  } catch (error) {
    logger.error('Metrics endpoint error:', error);
    res.status(500).json({
      error: 'Failed to retrieve metrics',
      message: error.message
    });
  }
};

/**
 * Database health and statistics
 * Returns detailed database information
 */
exports.getDatabaseHealth = async (req, res) => {
  try {
    const dbHealth = {
      status: 'healthy',
      timestamp: new Date().toISOString()
    };

    // Database connectivity
    try {
      db.prepare('SELECT 1').get();
      dbHealth.connected = true;
    } catch (error) {
      dbHealth.connected = false;
      dbHealth.status = 'unhealthy';
      dbHealth.error = error.message;
    }

    // Database statistics
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
      dbHealth.tables = {};

      tables.forEach(table => {
        const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
        dbHealth.tables[table.name] = count.count;
      });

      // Database size
      const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/email-marketing.db');
      const stats = fs.statSync(dbPath);
      dbHealth.sizeBytes = stats.size;
      dbHealth.sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      dbHealth.lastModified = stats.mtime;

      // Check for database fragmentation
      const pageCount = db.prepare('PRAGMA page_count').get();
      const pageSize = db.prepare('PRAGMA page_size').get();
      const freelistCount = db.prepare('PRAGMA freelist_count').get();

      dbHealth.pages = {
        total: pageCount.page_count,
        size: pageSize.page_size,
        freelist: freelistCount.freelist_count,
        fragmentation: `${((freelistCount.freelist_count / pageCount.page_count) * 100).toFixed(2)}%`
      };

    } catch (error) {
      logger.error('Database statistics error:', error);
      dbHealth.statisticsError = error.message;
    }

    res.status(dbHealth.status === 'healthy' ? 200 : 503).json(dbHealth);

  } catch (error) {
    logger.error('Database health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
};

/**
 * Email queue status
 * Returns job queue statistics and health
 */
exports.getQueueHealth = async (req, res) => {
  try {
    const queueHealth = {
      status: 'healthy',
      timestamp: new Date().toISOString()
    };

    // Overall queue stats
    const allStats = db.prepare(`
      SELECT
        status,
        COUNT(*) as count
      FROM job_queue
      GROUP BY status
    `).all();

    queueHealth.overall = {};
    allStats.forEach(stat => {
      queueHealth.overall[stat.status] = stat.count;
    });

    // Recent stats (last 24 hours)
    const recentStats = db.prepare(`
      SELECT
        status,
        COUNT(*) as count
      FROM job_queue
      WHERE created_at > datetime('now', '-24 hours')
      GROUP BY status
    `).all();

    queueHealth.last24Hours = {};
    recentStats.forEach(stat => {
      queueHealth.last24Hours[stat.status] = stat.count;
    });

    // Pending jobs
    const pendingJobs = db.prepare(`
      SELECT COUNT(*) as count
      FROM job_queue
      WHERE status = 'pending'
      AND scheduled_at <= datetime('now')
    `).get();

    queueHealth.pending = pendingJobs.count;

    // Failed jobs that need attention
    const failedJobs = db.prepare(`
      SELECT COUNT(*) as count
      FROM job_queue
      WHERE status = 'failed'
      AND retry_count >= max_retries
      AND created_at > datetime('now', '-7 days')
    `).get();

    queueHealth.failedNeedsAttention = failedJobs.count;

    // Calculate failure rate
    const totalRecent = Object.values(queueHealth.last24Hours).reduce((a, b) => a + b, 0);
    const failedRecent = queueHealth.last24Hours.failed || 0;
    const failureRate = totalRecent > 0 ? (failedRecent / totalRecent) * 100 : 0;

    queueHealth.failureRate = `${failureRate.toFixed(2)}%`;

    // Set status based on metrics
    if (failureRate > 20) {
      queueHealth.status = 'unhealthy';
    } else if (failureRate > 10 || queueHealth.pending > 1000) {
      queueHealth.status = 'warning';
    }

    // Processing rate (last hour)
    const processedLastHour = db.prepare(`
      SELECT COUNT(*) as count
      FROM job_queue
      WHERE status = 'completed'
      AND completed_at > datetime('now', '-1 hour')
    `).get();

    queueHealth.processingRate = {
      lastHour: processedLastHour.count,
      perMinute: (processedLastHour.count / 60).toFixed(2)
    };

    const statusCode = queueHealth.status === 'healthy' ? 200 : queueHealth.status === 'warning' ? 200 : 503;
    res.status(statusCode).json(queueHealth);

  } catch (error) {
    logger.error('Queue health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
};

/**
 * SMTP connection status
 * Returns active SMTP configuration health
 */
exports.getSmtpHealth = async (req, res) => {
  try {
    const smtpHealth = {
      status: 'unknown',
      timestamp: new Date().toISOString()
    };

    // Get active SMTP configuration
    const activeSmtp = db.prepare('SELECT id, name, host, port, is_active FROM smtp_configs WHERE is_active = 1').get();

    if (!activeSmtp) {
      smtpHealth.status = 'no_config';
      smtpHealth.message = 'No active SMTP configuration found';
      return res.status(200).json(smtpHealth);
    }

    smtpHealth.active = {
      id: activeSmtp.id,
      name: activeSmtp.name,
      host: activeSmtp.host,
      port: activeSmtp.port
    };

    // Check recent email send success rate
    const recentSends = db.prepare(`
      SELECT
        status,
        COUNT(*) as count
      FROM messages
      WHERE created_at > datetime('now', '-1 hour')
      GROUP BY status
    `).all();

    smtpHealth.recentSends = {};
    let totalSends = 0;
    let successfulSends = 0;

    recentSends.forEach(stat => {
      smtpHealth.recentSends[stat.status] = stat.count;
      totalSends += stat.count;
      if (stat.status === 'sent' || stat.status === 'delivered') {
        successfulSends += stat.count;
      }
    });

    const successRate = totalSends > 0 ? (successfulSends / totalSends) * 100 : 100;
    smtpHealth.successRate = `${successRate.toFixed(2)}%`;

    // Set status based on success rate
    if (totalSends === 0) {
      smtpHealth.status = 'idle';
    } else if (successRate >= 90) {
      smtpHealth.status = 'healthy';
    } else if (successRate >= 70) {
      smtpHealth.status = 'warning';
    } else {
      smtpHealth.status = 'unhealthy';
    }

    const statusCode = smtpHealth.status === 'unhealthy' ? 503 : 200;
    res.status(statusCode).json(smtpHealth);

  } catch (error) {
    logger.error('SMTP health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
};
