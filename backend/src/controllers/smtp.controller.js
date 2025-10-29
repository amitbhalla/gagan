const { db } = require('../config/database');
const { encrypt, decrypt } = require('../utils/encryption');
const nodemailer = require('nodemailer');
const logger = require('../config/logger');

/**
 * Get all SMTP configurations (passwords decrypted)
 */
exports.getAllConfigs = (req, res) => {
  try {
    const configs = db.prepare(`
      SELECT * FROM smtp_configs ORDER BY is_active DESC, created_at DESC
    `).all();

    // Decrypt passwords before sending
    const decryptedConfigs = configs.map(config => ({
      ...config,
      password: config.password ? '***ENCRYPTED***' : null, // Never send actual password
      auth_type: config.auth_type || 'login'
    }));

    res.json({ configs: decryptedConfigs });
  } catch (error) {
    logger.error('Error getting SMTP configs:', error);
    res.status(500).json({ error: 'Failed to retrieve SMTP configurations' });
  }
};

/**
 * Get SMTP configuration by ID
 */
exports.getConfigById = (req, res) => {
  try {
    const { id } = req.params;

    const config = db.prepare('SELECT * FROM smtp_configs WHERE id = ?').get(id);

    if (!config) {
      return res.status(404).json({ error: 'SMTP configuration not found' });
    }

    // Don't send password in response
    const sanitizedConfig = {
      ...config,
      password: config.password ? '***ENCRYPTED***' : null
    };

    res.json(sanitizedConfig);
  } catch (error) {
    logger.error(`Error getting SMTP config ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to retrieve SMTP configuration' });
  }
};

/**
 * Create new SMTP configuration
 */
exports.createConfig = (req, res) => {
  try {
    const {
      name,
      host,
      port,
      secure,
      auth_type,
      username,
      password,
      from_email,
      from_name,
      max_rate,
      is_active
    } = req.body;

    // Validation
    if (!name || !host || !port || !from_email || !from_name) {
      return res.status(400).json({
        error: 'Missing required fields: name, host, port, from_email, from_name'
      });
    }

    // Encrypt password if provided
    const encryptedPassword = password ? encrypt(password) : null;

    // If setting as active, deactivate all other configs
    if (is_active) {
      db.prepare('UPDATE smtp_configs SET is_active = 0').run();
    }

    const stmt = db.prepare(`
      INSERT INTO smtp_configs (
        name, host, port, secure, auth_type, username, password,
        from_email, from_name, max_rate, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    const result = stmt.run(
      name,
      host,
      parseInt(port),
      secure ? 1 : 0,
      auth_type || 'login',
      username || null,
      encryptedPassword,
      from_email,
      from_name,
      max_rate || 100,
      is_active ? 1 : 0
    );

    const createdConfig = db.prepare('SELECT * FROM smtp_configs WHERE id = ?').get(result.lastInsertRowid);

    logger.info(`SMTP config created: ${result.lastInsertRowid}`);

    res.status(201).json({
      ...createdConfig,
      password: createdConfig.password ? '***ENCRYPTED***' : null
    });
  } catch (error) {
    logger.error('Error creating SMTP config:', error);
    res.status(500).json({ error: 'Failed to create SMTP configuration' });
  }
};

/**
 * Update SMTP configuration
 */
exports.updateConfig = (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const config = db.prepare('SELECT * FROM smtp_configs WHERE id = ?').get(id);

    if (!config) {
      return res.status(404).json({ error: 'SMTP configuration not found' });
    }

    // Build update query dynamically
    const allowedFields = ['name', 'host', 'port', 'secure', 'auth_type', 'username', 'password', 'from_email', 'from_name', 'max_rate', 'is_active'];
    const updateFields = [];
    const values = [];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        if (field === 'password' && updates[field]) {
          // Encrypt password
          updateFields.push('password = ?');
          values.push(encrypt(updates[field]));
        } else if (field === 'secure' || field === 'is_active') {
          updateFields.push(`${field} = ?`);
          values.push(updates[field] ? 1 : 0);
        } else if (field === 'port' || field === 'max_rate') {
          updateFields.push(`${field} = ?`);
          values.push(parseInt(updates[field]));
        } else {
          updateFields.push(`${field} = ?`);
          values.push(updates[field]);
        }
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // If setting as active, deactivate all other configs
    if (updates.is_active) {
      db.prepare('UPDATE smtp_configs SET is_active = 0').run();
    }

    updateFields.push('updated_at = datetime(\'now\')');
    values.push(id);

    const stmt = db.prepare(`
      UPDATE smtp_configs SET ${updateFields.join(', ')} WHERE id = ?
    `);

    stmt.run(...values);

    const updatedConfig = db.prepare('SELECT * FROM smtp_configs WHERE id = ?').get(id);

    logger.info(`SMTP config updated: ${id}`);

    res.json({
      ...updatedConfig,
      password: updatedConfig.password ? '***ENCRYPTED***' : null
    });
  } catch (error) {
    logger.error(`Error updating SMTP config ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to update SMTP configuration' });
  }
};

/**
 * Delete SMTP configuration
 */
exports.deleteConfig = (req, res) => {
  try {
    const { id } = req.params;

    const config = db.prepare('SELECT * FROM smtp_configs WHERE id = ?').get(id);

    if (!config) {
      return res.status(404).json({ error: 'SMTP configuration not found' });
    }

    // Prevent deleting active config if it's the only one
    if (config.is_active) {
      const totalConfigs = db.prepare('SELECT COUNT(*) as count FROM smtp_configs').get().count;
      if (totalConfigs === 1) {
        return res.status(400).json({
          error: 'Cannot delete the only SMTP configuration'
        });
      }
    }

    db.prepare('DELETE FROM smtp_configs WHERE id = ?').run(id);

    logger.info(`SMTP config deleted: ${id}`);

    res.json({ message: 'SMTP configuration deleted successfully' });
  } catch (error) {
    logger.error(`Error deleting SMTP config ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to delete SMTP configuration' });
  }
};

/**
 * Set SMTP configuration as active
 */
exports.setActive = (req, res) => {
  try {
    const { id } = req.params;

    const config = db.prepare('SELECT * FROM smtp_configs WHERE id = ?').get(id);

    if (!config) {
      return res.status(404).json({ error: 'SMTP configuration not found' });
    }

    // Deactivate all configs
    db.prepare('UPDATE smtp_configs SET is_active = 0').run();

    // Activate this one
    db.prepare('UPDATE smtp_configs SET is_active = 1, updated_at = datetime(\'now\') WHERE id = ?').run(id);

    logger.info(`SMTP config ${id} set as active`);

    res.json({ message: 'SMTP configuration activated successfully' });
  } catch (error) {
    logger.error(`Error activating SMTP config ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to activate SMTP configuration' });
  }
};

/**
 * Test SMTP connection
 */
exports.testConnection = async (req, res) => {
  try {
    const { id } = req.params;

    const config = db.prepare('SELECT * FROM smtp_configs WHERE id = ?').get(id);

    if (!config) {
      return res.status(404).json({ error: 'SMTP configuration not found' });
    }

    // Decrypt password
    const password = config.password ? decrypt(config.password) : null;

    // Create transporter
    const transportConfig = {
      host: config.host,
      port: config.port,
      secure: config.secure === 1
    };

    // Add auth if username/password provided
    if (config.username && password) {
      transportConfig.auth = {
        user: config.username,
        pass: password
      };
    }

    const transporter = nodemailer.createTransporter(transportConfig);

    // Verify connection
    await transporter.verify();

    logger.info(`SMTP connection test successful for config ${id}`);

    res.json({
      success: true,
      message: 'SMTP connection successful'
    });
  } catch (error) {
    logger.error(`SMTP connection test failed for config ${req.params.id}:`, error);
    res.status(400).json({
      success: false,
      error: error.message || 'SMTP connection failed'
    });
  }
};

/**
 * Get active SMTP configuration
 */
exports.getActiveConfig = (req, res) => {
  try {
    const config = db.prepare('SELECT * FROM smtp_configs WHERE is_active = 1').get();

    if (!config) {
      return res.status(404).json({ error: 'No active SMTP configuration found' });
    }

    res.json({
      ...config,
      password: config.password ? '***ENCRYPTED***' : null
    });
  } catch (error) {
    logger.error('Error getting active SMTP config:', error);
    res.status(500).json({ error: 'Failed to retrieve active SMTP configuration' });
  }
};

/**
 * Get decrypted SMTP config for internal use
 * @param {number} id - Config ID (optional, uses active if not specified)
 * @returns {Object} Decrypted SMTP config
 */
exports.getDecryptedConfig = (id = null) => {
  try {
    let config;

    if (id) {
      config = db.prepare('SELECT * FROM smtp_configs WHERE id = ?').get(id);
    } else {
      config = db.prepare('SELECT * FROM smtp_configs WHERE is_active = 1').get();
    }

    if (!config) {
      return null;
    }

    // Decrypt password
    const password = config.password ? decrypt(config.password) : null;

    return {
      ...config,
      password,
      secure: config.secure === 1,
      is_active: config.is_active === 1
    };
  } catch (error) {
    logger.error('Error getting decrypted SMTP config:', error);
    return null;
  }
};
