const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { db } = require('../config/database');
const logger = require('../config/logger');

class AuthController {
  static async login(req, res) {
    try {
      const { username, password } = req.body;

      // Get admin user
      const stmt = db.prepare('SELECT * FROM admin_users WHERE username = ?');
      const user = stmt.get(username);

      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Verify password
      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Update last login
      const updateStmt = db.prepare('UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?');
      updateStmt.run(user.id);

      // Generate JWT token
      const token = jwt.sign(
        { id: user.id, username: user.username },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      logger.info('User logged in', { username });

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username
        }
      });
    } catch (error) {
      logger.error('Login error', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;

      // Get current user
      const stmt = db.prepare('SELECT * FROM admin_users WHERE id = ?');
      const user = stmt.get(userId);

      // Verify current password
      const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update password
      const updateStmt = db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?');
      updateStmt.run(hashedPassword, userId);

      logger.info('Password changed', { username: user.username });

      res.json({ message: 'Password updated successfully' });
    } catch (error) {
      logger.error('Change password error', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async initializeAdmin() {
    try {
      // Check if admin exists
      const stmt = db.prepare('SELECT COUNT(*) as count FROM admin_users');
      const { count } = stmt.get();

      if (count === 0) {
        // Create default admin
        const username = 'admin';
        const password = process.env.ADMIN_PASSWORD || 'changeme123';
        const hashedPassword = await bcrypt.hash(password, 10);

        const insertStmt = db.prepare(`
          INSERT INTO admin_users (username, password_hash)
          VALUES (?, ?)
        `);
        insertStmt.run(username, hashedPassword);

        logger.info('Default admin user created', { username });
        console.log(`\n🔐 Default admin created:`);
        console.log(`   Username: ${username}`);
        console.log(`   Password: ${password}`);
        console.log(`   ⚠️  Please change the password after first login!\n`);
      }
    } catch (error) {
      logger.error('Initialize admin error', { error: error.message });
    }
  }
}

module.exports = AuthController;
