const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'email-marketing.db');

// Initialize database connection
const db = new Database(dbPath, {
  verbose: process.env.NODE_ENV === 'development' ? console.log : null
});

// Enable foreign keys
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Create tables
function initializeDatabase() {
  // Templates Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(255) NOT NULL,
      subject VARCHAR(500) NOT NULL,
      body TEXT NOT NULL,
      type VARCHAR(10) DEFAULT 'html',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Lists Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      custom_fields TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Contacts Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email VARCHAR(255) NOT NULL UNIQUE,
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      status VARCHAR(20) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // List Subscribers (many-to-many)
  db.exec(`
    CREATE TABLE IF NOT EXISTS list_subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id INTEGER NOT NULL,
      contact_id INTEGER NOT NULL,
      custom_field_values TEXT,
      subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      status VARCHAR(20) DEFAULT 'subscribed',
      FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
      UNIQUE(list_id, contact_id)
    )
  `);

  // Campaigns Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(255) NOT NULL,
      template_id INTEGER NOT NULL,
      list_id INTEGER NOT NULL,
      from_email VARCHAR(255) NOT NULL,
      from_name VARCHAR(255),
      reply_to VARCHAR(255),
      status VARCHAR(20) DEFAULT 'draft',
      scheduled_at TIMESTAMP,
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (template_id) REFERENCES templates(id),
      FOREIGN KEY (list_id) REFERENCES lists(id)
    )
  `);

  // Messages (individual emails sent)
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      contact_id INTEGER NOT NULL,
      message_id VARCHAR(255),
      tracking_token VARCHAR(255) UNIQUE,
      status VARCHAR(20) DEFAULT 'pending',
      sent_at TIMESTAMP,
      delivered_at TIMESTAMP,
      error_message TEXT,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    )
  `);

  // Message Events (tracking)
  db.exec(`
    CREATE TABLE IF NOT EXISTS message_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      event_type VARCHAR(20) NOT NULL,
      event_data TEXT,
      ip_address VARCHAR(45),
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    )
  `);

  // Bounces Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS bounces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL,
      message_id INTEGER,
      bounce_type VARCHAR(10) NOT NULL,
      bounce_reason TEXT,
      bounce_code VARCHAR(10),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
    )
  `);

  // Links Table (for click tracking)
  db.exec(`
    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      original_url TEXT NOT NULL,
      short_code VARCHAR(20) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    )
  `);

  // SMTP Configuration
  db.exec(`
    CREATE TABLE IF NOT EXISTS smtp_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(255) NOT NULL,
      host VARCHAR(255) NOT NULL,
      port INTEGER DEFAULT 587,
      secure INTEGER DEFAULT 0,
      auth_type VARCHAR(20) DEFAULT 'none',
      username VARCHAR(255),
      password VARCHAR(255),
      from_email VARCHAR(255),
      from_name VARCHAR(255),
      max_rate INTEGER DEFAULT 100,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Unsubscribe Tokens (RFC 8058)
  db.exec(`
    CREATE TABLE IF NOT EXISTS unsubscribe_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token VARCHAR(255) UNIQUE NOT NULL,
      contact_id INTEGER NOT NULL,
      list_id INTEGER,
      campaign_id INTEGER,
      expires_at TIMESTAMP,
      used_at TIMESTAMP,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
      FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE SET NULL,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
    )
  `);

  // Job Queue Table (SQLite-based queue)
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_type VARCHAR(50) NOT NULL,
      job_data TEXT NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      priority INTEGER DEFAULT 0,
      scheduled_at TIMESTAMP NOT NULL,
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Admin Users Table (single admin for now)
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username VARCHAR(100) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP
    )
  `);

  // Create indexes for performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
    CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
    CREATE INDEX IF NOT EXISTS idx_list_subscribers_list ON list_subscribers(list_id);
    CREATE INDEX IF NOT EXISTS idx_list_subscribers_contact ON list_subscribers(contact_id);
    CREATE INDEX IF NOT EXISTS idx_messages_campaign ON messages(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_messages_contact ON messages(contact_id);
    CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
    CREATE INDEX IF NOT EXISTS idx_messages_tracking_token ON messages(tracking_token);
    CREATE INDEX IF NOT EXISTS idx_message_events_message ON message_events(message_id);
    CREATE INDEX IF NOT EXISTS idx_message_events_type ON message_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_bounces_contact ON bounces(contact_id);
    CREATE INDEX IF NOT EXISTS idx_links_campaign ON links(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_links_short_code ON links(short_code);
    CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status, scheduled_at);
  `);

  console.log('Database initialized successfully');
}

module.exports = {
  db,
  initializeDatabase
};
