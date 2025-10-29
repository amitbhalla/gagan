/**
 * Database Optimizer
 *
 * Provides database optimization utilities for SQLite:
 * - Query optimization and indexing
 * - Database maintenance operations (VACUUM, ANALYZE)
 * - Performance monitoring
 * - Automatic optimization scheduling
 *
 * Phase 6: Production Optimization
 */

const { db } = require('../config/database');
const logger = require('../config/logger');
const fs = require('fs');
const path = require('path');

/**
 * Database Performance Statistics
 */
exports.getPerformanceStats = () => {
  try {
    const stats = {};

    // Database file size
    const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/email-marketing.db');
    const fileStats = fs.statSync(dbPath);
    stats.fileSizeBytes = fileStats.size;
    stats.fileSizeMB = (fileStats.size / 1024 / 1024).toFixed(2);

    // Page statistics
    const pageCount = db.prepare('PRAGMA page_count').get();
    const pageSize = db.prepare('PRAGMA page_size').get();
    const freelistCount = db.prepare('PRAGMA freelist_count').get();
    const cacheSize = db.prepare('PRAGMA cache_size').get();

    stats.pageCount = pageCount.page_count;
    stats.pageSize = pageSize.page_size;
    stats.freelistCount = freelistCount.freelist_count;
    stats.cacheSize = cacheSize.cache_size;
    stats.fragmentation = ((freelistCount.freelist_count / pageCount.page_count) * 100).toFixed(2) + '%';

    // Table row counts
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    stats.tables = {};

    tables.forEach(table => {
      const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
      stats.tables[table.name] = count.count;
    });

    // Index statistics
    const indexes = db.prepare("SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'").all();
    stats.indexes = indexes.map(idx => ({
      name: idx.name,
      table: idx.tbl_name
    }));

    // Query performance (last compilation)
    const compilationTime = db.prepare('PRAGMA compile_options').all();
    stats.sqliteVersion = db.prepare('SELECT sqlite_version() as version').get().version;

    return stats;

  } catch (error) {
    logger.error('Failed to get database performance stats', { error: error.message });
    throw error;
  }
};

/**
 * Optimize Database - VACUUM
 * Rebuilds database file, repacking it into a minimal amount of disk space
 * WARNING: This locks the database and can take time for large databases
 */
exports.vacuum = () => {
  try {
    logger.info('Starting database VACUUM operation');
    const startTime = Date.now();

    db.exec('VACUUM');

    const duration = Date.now() - startTime;
    logger.info('Database VACUUM completed', { durationMs: duration });

    return {
      success: true,
      durationMs: duration
    };

  } catch (error) {
    logger.error('Database VACUUM failed', { error: error.message });
    throw error;
  }
};

/**
 * Analyze Database
 * Gathers statistics about tables and indexes to help query optimizer
 */
exports.analyze = () => {
  try {
    logger.info('Starting database ANALYZE operation');
    const startTime = Date.now();

    db.exec('ANALYZE');

    const duration = Date.now() - startTime;
    logger.info('Database ANALYZE completed', { durationMs: duration });

    return {
      success: true,
      durationMs: duration
    };

  } catch (error) {
    logger.error('Database ANALYZE failed', { error: error.message });
    throw error;
  }
};

/**
 * Optimize Database - Full Optimization
 * Runs both VACUUM and ANALYZE
 */
exports.optimizeFull = () => {
  try {
    logger.info('Starting full database optimization');
    const startTime = Date.now();

    const statsBefore = exports.getPerformanceStats();

    // Run VACUUM
    db.exec('VACUUM');
    logger.info('VACUUM completed');

    // Run ANALYZE
    db.exec('ANALYZE');
    logger.info('ANALYZE completed');

    // Run integrity check
    const integrity = db.prepare('PRAGMA integrity_check').get();
    if (integrity.integrity_check !== 'ok') {
      throw new Error('Database integrity check failed: ' + integrity.integrity_check);
    }

    const statsAfter = exports.getPerformanceStats();
    const duration = Date.now() - startTime;

    logger.info('Full database optimization completed', {
      durationMs: duration,
      sizeBefore: statsBefore.fileSizeMB + ' MB',
      sizeAfter: statsAfter.fileSizeMB + ' MB',
      savedMB: (statsBefore.fileSizeMB - statsAfter.fileSizeMB).toFixed(2)
    });

    return {
      success: true,
      durationMs: duration,
      statsBefore,
      statsAfter,
      spaceSavedMB: (statsBefore.fileSizeMB - statsAfter.fileSizeMB).toFixed(2)
    };

  } catch (error) {
    logger.error('Full database optimization failed', { error: error.message });
    throw error;
  }
};

/**
 * Check Database Integrity
 */
exports.checkIntegrity = () => {
  try {
    logger.info('Checking database integrity');

    const result = db.prepare('PRAGMA integrity_check').get();

    if (result.integrity_check === 'ok') {
      logger.info('Database integrity check passed');
      return { success: true, message: 'Database integrity is OK' };
    } else {
      logger.error('Database integrity check failed', { result: result.integrity_check });
      return { success: false, message: result.integrity_check };
    }

  } catch (error) {
    logger.error('Database integrity check failed', { error: error.message });
    throw error;
  }
};

/**
 * Optimize SQLite Pragmas
 * Sets optimal PRAGMA settings for production use
 */
exports.setPragmas = () => {
  try {
    logger.info('Setting optimized database pragmas');

    // WAL mode for better concurrency (Write-Ahead Logging)
    db.pragma('journal_mode = WAL');

    // Synchronous mode: NORMAL for balance of safety and performance
    // FULL = safest but slowest, NORMAL = good balance, OFF = fastest but risky
    db.pragma('synchronous = NORMAL');

    // Cache size: 64MB (negative value = KB)
    db.pragma('cache_size = -64000');

    // Memory-mapped I/O: 256MB
    db.pragma('mmap_size = 268435456');

    // Temp store in memory
    db.pragma('temp_store = MEMORY');

    // Increase page size for better performance with large BLOBs/text
    // Note: This can only be changed when database is empty or with VACUUM
    // db.pragma('page_size = 4096');

    // Optimize for faster reads
    db.pragma('optimize');

    // Auto vacuum: INCREMENTAL (reclaim space gradually)
    db.pragma('auto_vacuum = INCREMENTAL');

    logger.info('Database pragmas optimized');

    // Return current pragma values
    return {
      journal_mode: db.pragma('journal_mode', { simple: true }),
      synchronous: db.pragma('synchronous', { simple: true }),
      cache_size: db.pragma('cache_size', { simple: true }),
      mmap_size: db.pragma('mmap_size', { simple: true }),
      temp_store: db.pragma('temp_store', { simple: true }),
      page_size: db.pragma('page_size', { simple: true }),
      auto_vacuum: db.pragma('auto_vacuum', { simple: true })
    };

  } catch (error) {
    logger.error('Failed to set database pragmas', { error: error.message });
    throw error;
  }
};

/**
 * Create Missing Indexes
 * Adds indexes that improve query performance
 */
exports.createOptimalIndexes = () => {
  try {
    logger.info('Creating optimal database indexes');

    const indexes = [
      // Messages table indexes
      { name: 'idx_messages_campaign_id', sql: 'CREATE INDEX IF NOT EXISTS idx_messages_campaign_id ON messages(campaign_id)' },
      { name: 'idx_messages_contact_id', sql: 'CREATE INDEX IF NOT EXISTS idx_messages_contact_id ON messages(contact_id)' },
      { name: 'idx_messages_status', sql: 'CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status)' },
      { name: 'idx_messages_created_at', sql: 'CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)' },
      { name: 'idx_messages_tracking_token', sql: 'CREATE INDEX IF NOT EXISTS idx_messages_tracking_token ON messages(tracking_token)' },

      // Message events indexes
      { name: 'idx_message_events_message_id', sql: 'CREATE INDEX IF NOT EXISTS idx_message_events_message_id ON message_events(message_id)' },
      { name: 'idx_message_events_event_type', sql: 'CREATE INDEX IF NOT EXISTS idx_message_events_event_type ON message_events(event_type)' },
      { name: 'idx_message_events_created_at', sql: 'CREATE INDEX IF NOT EXISTS idx_message_events_created_at ON message_events(created_at)' },

      // Campaigns indexes
      { name: 'idx_campaigns_status', sql: 'CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status)' },
      { name: 'idx_campaigns_scheduled_at', sql: 'CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled_at ON campaigns(scheduled_at)' },
      { name: 'idx_campaigns_created_at', sql: 'CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at)' },

      // Job queue indexes
      { name: 'idx_job_queue_status', sql: 'CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status)' },
      { name: 'idx_job_queue_scheduled_at', sql: 'CREATE INDEX IF NOT EXISTS idx_job_queue_scheduled_at ON job_queue(scheduled_at)' },
      { name: 'idx_job_queue_created_at', sql: 'CREATE INDEX IF NOT EXISTS idx_job_queue_created_at ON job_queue(created_at)' },

      // Contacts indexes
      { name: 'idx_contacts_email', sql: 'CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email)' },
      { name: 'idx_contacts_status', sql: 'CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status)' },

      // List subscribers indexes
      { name: 'idx_list_subscribers_list_id', sql: 'CREATE INDEX IF NOT EXISTS idx_list_subscribers_list_id ON list_subscribers(list_id)' },
      { name: 'idx_list_subscribers_contact_id', sql: 'CREATE INDEX IF NOT EXISTS idx_list_subscribers_contact_id ON list_subscribers(contact_id)' },

      // Links indexes
      { name: 'idx_links_campaign_id', sql: 'CREATE INDEX IF NOT EXISTS idx_links_campaign_id ON links(campaign_id)' },
      { name: 'idx_links_short_code', sql: 'CREATE INDEX IF NOT EXISTS idx_links_short_code ON links(short_code)' },

      // Unsubscribe tokens indexes
      { name: 'idx_unsubscribe_tokens_token', sql: 'CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_token ON unsubscribe_tokens(token)' },
      { name: 'idx_unsubscribe_tokens_contact_id', sql: 'CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_contact_id ON unsubscribe_tokens(contact_id)' },

      // Bounces indexes
      { name: 'idx_bounces_contact_id', sql: 'CREATE INDEX IF NOT EXISTS idx_bounces_contact_id ON bounces(contact_id)' },
      { name: 'idx_bounces_message_id', sql: 'CREATE INDEX IF NOT EXISTS idx_bounces_message_id ON bounces(message_id)' }
    ];

    let created = 0;
    indexes.forEach(index => {
      try {
        db.exec(index.sql);
        created++;
        logger.debug('Index created or already exists', { index: index.name });
      } catch (error) {
        logger.warn('Failed to create index', { index: index.name, error: error.message });
      }
    });

    logger.info('Index creation completed', { total: indexes.length, created });

    return {
      success: true,
      totalIndexes: indexes.length,
      created
    };

  } catch (error) {
    logger.error('Failed to create indexes', { error: error.message });
    throw error;
  }
};

/**
 * Query Performance Analyzer
 * Analyzes a query and returns execution plan
 */
exports.explainQuery = (query) => {
  try {
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${query}`).all();
    return plan;
  } catch (error) {
    logger.error('Failed to explain query', { error: error.message, query });
    throw error;
  }
};

/**
 * Scheduled Maintenance
 * Runs periodic database maintenance
 * Should be called daily or weekly via cron
 */
exports.scheduledMaintenance = () => {
  try {
    logger.info('Starting scheduled database maintenance');
    const startTime = Date.now();

    // Check integrity
    const integrity = exports.checkIntegrity();
    if (!integrity.success) {
      throw new Error('Database integrity check failed: ' + integrity.message);
    }

    // Run ANALYZE (quick operation)
    exports.analyze();

    // Check if VACUUM is needed (>10% fragmentation)
    const stats = exports.getPerformanceStats();
    const fragmentationPercent = parseFloat(stats.fragmentation);

    if (fragmentationPercent > 10) {
      logger.info('High fragmentation detected, running VACUUM', { fragmentation: stats.fragmentation });
      exports.vacuum();
    }

    // Incremental auto-vacuum
    db.exec('PRAGMA incremental_vacuum');

    const duration = Date.now() - startTime;
    logger.info('Scheduled database maintenance completed', { durationMs: duration });

    return {
      success: true,
      durationMs: duration,
      integrityCheck: integrity.success,
      vacuumRun: fragmentationPercent > 10
    };

  } catch (error) {
    logger.error('Scheduled database maintenance failed', { error: error.message });
    throw error;
  }
};

/**
 * Initialize database optimization
 * Called on server startup
 */
exports.initialize = () => {
  try {
    logger.info('Initializing database optimization');

    // Set optimal pragmas
    const pragmas = exports.setPragmas();
    logger.info('Pragmas configured', pragmas);

    // Create optimal indexes
    exports.createOptimalIndexes();

    // Get initial stats
    const stats = exports.getPerformanceStats();
    logger.info('Database optimization initialized', {
      size: stats.fileSizeMB + ' MB',
      fragmentation: stats.fragmentation,
      tables: Object.keys(stats.tables).length,
      indexes: stats.indexes.length
    });

    return {
      success: true,
      pragmas,
      stats
    };

  } catch (error) {
    logger.error('Database optimization initialization failed', { error: error.message });
    throw error;
  }
};
