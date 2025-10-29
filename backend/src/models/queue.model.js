const { db } = require('../config/database');
const logger = require('../config/logger');

class QueueModel {
  /**
   * Add a job to the queue
   * @param {Object} data - Job data
   * @returns {Object} Created job
   */
  static enqueue(data) {
    try {
      const query = `
        INSERT INTO job_queue (
          job_type, job_data, status, priority,
          scheduled_at, max_retries, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `;

      const jobData = typeof data.job_data === 'string'
        ? data.job_data
        : JSON.stringify(data.job_data);

      const result = db.prepare(query).run(
        data.job_type,
        jobData,
        data.status || 'pending',
        data.priority || 0,
        data.scheduled_at || new Date().toISOString(),
        data.max_retries || 3
      );

      logger.info(`Job enqueued: ${result.lastInsertRowid} (${data.job_type})`);
      return this.getById(result.lastInsertRowid);
    } catch (error) {
      logger.error('Error enqueueing job:', error);
      throw error;
    }
  }

  /**
   * Bulk enqueue jobs
   * @param {Array<Object>} jobs - Array of job data
   * @returns {number} Number of jobs enqueued
   */
  static bulkEnqueue(jobs) {
    try {
      const insert = db.prepare(`
        INSERT INTO job_queue (
          job_type, job_data, status, priority,
          scheduled_at, max_retries, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      const insertMany = db.transaction((jobList) => {
        for (const job of jobList) {
          const jobData = typeof job.job_data === 'string'
            ? job.job_data
            : JSON.stringify(job.job_data);

          insert.run(
            job.job_type,
            jobData,
            job.status || 'pending',
            job.priority || 0,
            job.scheduled_at || new Date().toISOString(),
            job.max_retries || 3
          );
        }
      });

      insertMany(jobs);
      logger.info(`Bulk enqueued ${jobs.length} jobs`);

      return jobs.length;
    } catch (error) {
      logger.error('Error bulk enqueueing jobs:', error);
      throw error;
    }
  }

  /**
   * Get job by ID
   * @param {number} id - Job ID
   * @returns {Object|null} Job object
   */
  static getById(id) {
    try {
      const query = 'SELECT * FROM job_queue WHERE id = ?';
      const job = db.prepare(query).get(id);

      if (job && job.job_data) {
        try {
          job.job_data = JSON.parse(job.job_data);
        } catch (e) {
          // Keep as string if not valid JSON
        }
      }

      return job;
    } catch (error) {
      logger.error(`Error getting job ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get next pending jobs to process
   * @param {number} limit - Max jobs to retrieve
   * @param {string} jobType - Filter by job type (optional)
   * @returns {Array<Object>} Pending jobs
   */
  static getNextPending(limit = 10, jobType = null) {
    try {
      let query = `
        SELECT * FROM job_queue
        WHERE status = 'pending'
          AND scheduled_at <= datetime('now')
      `;

      const params = [];

      if (jobType) {
        query += ' AND job_type = ?';
        params.push(jobType);
      }

      query += `
        ORDER BY priority DESC, scheduled_at ASC
        LIMIT ?
      `;
      params.push(limit);

      const jobs = db.prepare(query).all(...params);

      // Parse job_data for each job
      return jobs.map(job => ({
        ...job,
        job_data: this.parseJobData(job.job_data)
      }));
    } catch (error) {
      logger.error('Error getting next pending jobs:', error);
      throw error;
    }
  }

  /**
   * Update job status
   * @param {number} id - Job ID
   * @param {string} status - New status
   * @param {Object} additionalData - Additional data to update
   * @returns {Object} Updated job
   */
  static updateStatus(id, status, additionalData = {}) {
    try {
      const updates = ['status = ?'];
      const values = [status];

      // Auto-set timestamps based on status
      if (status === 'processing' && !additionalData.started_at) {
        updates.push('started_at = datetime(\'now\')');
      }

      if ((status === 'completed' || status === 'failed') && !additionalData.completed_at) {
        updates.push('completed_at = datetime(\'now\')');
      }

      // Add error message for failed jobs
      if (status === 'failed' && additionalData.error_message) {
        updates.push('error_message = ?');
        values.push(additionalData.error_message);
      }

      // Increment retry count if retrying
      if (additionalData.incrementRetry) {
        updates.push('retry_count = retry_count + 1');
      }

      values.push(id);

      const query = `
        UPDATE job_queue
        SET ${updates.join(', ')}
        WHERE id = ?
      `;

      db.prepare(query).run(...values);
      return this.getById(id);
    } catch (error) {
      logger.error(`Error updating job ${id}:`, error);
      throw error;
    }
  }

  /**
   * Mark job as processing
   * @param {number} id - Job ID
   * @returns {Object} Updated job
   */
  static markProcessing(id) {
    return this.updateStatus(id, 'processing');
  }

  /**
   * Mark job as completed
   * @param {number} id - Job ID
   * @returns {Object} Updated job
   */
  static markCompleted(id) {
    return this.updateStatus(id, 'completed');
  }

  /**
   * Mark job as failed
   * @param {number} id - Job ID
   * @param {string} errorMessage - Error message
   * @param {boolean} retry - Whether to retry
   * @returns {Object} Updated job
   */
  static markFailed(id, errorMessage, retry = false) {
    try {
      const job = this.getById(id);

      if (!job) {
        throw new Error(`Job ${id} not found`);
      }

      const newRetryCount = (job.retry_count || 0) + 1;
      const shouldRetry = retry && newRetryCount < job.max_retries;

      if (shouldRetry) {
        // Requeue for retry with exponential backoff
        const backoffMinutes = Math.pow(2, newRetryCount); // 2, 4, 8 minutes
        const scheduledAt = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();

        const query = `
          UPDATE job_queue
          SET status = 'pending',
              retry_count = ?,
              error_message = ?,
              scheduled_at = ?
          WHERE id = ?
        `;

        db.prepare(query).run(newRetryCount, errorMessage, scheduledAt, id);
        logger.info(`Job ${id} scheduled for retry ${newRetryCount}/${job.max_retries}`);
      } else {
        // Mark as permanently failed
        this.updateStatus(id, 'failed', { error_message: errorMessage });
        logger.error(`Job ${id} permanently failed: ${errorMessage}`);
      }

      return this.getById(id);
    } catch (error) {
      logger.error(`Error marking job ${id} as failed:`, error);
      throw error;
    }
  }

  /**
   * Delete job
   * @param {number} id - Job ID
   * @returns {boolean} Success status
   */
  static delete(id) {
    try {
      const query = 'DELETE FROM job_queue WHERE id = ?';
      const result = db.prepare(query).run(id);

      logger.info(`Job deleted: ${id}`);
      return result.changes > 0;
    } catch (error) {
      logger.error(`Error deleting job ${id}:`, error);
      throw error;
    }
  }

  /**
   * Clean up old completed/failed jobs
   * @param {number} daysOld - Delete jobs older than this many days
   * @returns {number} Number of deleted jobs
   */
  static cleanup(daysOld = 7) {
    try {
      const query = `
        DELETE FROM job_queue
        WHERE (status = 'completed' OR status = 'failed')
          AND completed_at < datetime('now', '-' || ? || ' days')
      `;

      const result = db.prepare(query).run(daysOld);
      logger.info(`Cleaned up ${result.changes} old jobs`);

      return result.changes;
    } catch (error) {
      logger.error('Error cleaning up jobs:', error);
      throw error;
    }
  }

  /**
   * Get queue statistics
   * @returns {Object} Queue stats
   */
  static getStats() {
    try {
      const query = `
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
        FROM job_queue
      `;

      return db.prepare(query).get();
    } catch (error) {
      logger.error('Error getting queue stats:', error);
      throw error;
    }
  }

  /**
   * Get jobs by type
   * @param {string} jobType - Job type
   * @param {Object} options - Query options
   * @returns {Array<Object>} Jobs
   */
  static getByType(jobType, options = {}) {
    try {
      const { status, limit = 100, offset = 0 } = options;

      let query = 'SELECT * FROM job_queue WHERE job_type = ?';
      const params = [jobType];

      if (status) {
        query += ' AND status = ?';
        params.push(status);
      }

      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const jobs = db.prepare(query).all(...params);

      return jobs.map(job => ({
        ...job,
        job_data: this.parseJobData(job.job_data)
      }));
    } catch (error) {
      logger.error(`Error getting jobs by type ${jobType}:`, error);
      throw error;
    }
  }

  /**
   * Parse job data JSON
   * @param {string} jobData - JSON string
   * @returns {Object} Parsed data
   */
  static parseJobData(jobData) {
    if (!jobData) return {};

    try {
      return typeof jobData === 'string' ? JSON.parse(jobData) : jobData;
    } catch (e) {
      return { raw: jobData };
    }
  }

  /**
   * Count jobs by status
   * @param {string} jobType - Filter by job type (optional)
   * @returns {Object} Status counts
   */
  static countByStatus(jobType = null) {
    try {
      let query = `
        SELECT status, COUNT(*) as count
        FROM job_queue
      `;

      const params = [];

      if (jobType) {
        query += ' WHERE job_type = ?';
        params.push(jobType);
      }

      query += ' GROUP BY status';

      const results = db.prepare(query).all(...params);

      const counts = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0
      };

      results.forEach(row => {
        counts[row.status] = row.count;
      });

      return counts;
    } catch (error) {
      logger.error('Error counting jobs by status:', error);
      throw error;
    }
  }
}

module.exports = QueueModel;
