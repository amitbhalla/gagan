require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { initializeDatabase } = require('./config/database');
const logger = require('./config/logger');
const apiRoutes = require('./routes/api.routes');
const AuthController = require('./controllers/auth.controller');
const queueService = require('./services/queue.service');
const schedulerService = require('./services/scheduler.service');
const alertService = require('./services/alert.service');
const {
  apiLimiter,
  sanitizeInput,
  securityHeaders,
  csrfProtection
} = require('./middleware/security');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database
try {
  initializeDatabase();
  logger.info('Database initialized successfully');

  // Initialize database optimization
  const dbOptimizer = require('./utils/database-optimizer');
  dbOptimizer.initialize();
  logger.info('Database optimization initialized');
} catch (error) {
  logger.error('Database initialization failed', { error: error.message });
  process.exit(1);
}

// Initialize admin user
AuthController.initializeAdmin();

// Security middleware (applied first)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  }
}));
app.use(securityHeaders);

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Input sanitization
app.use(sanitizeInput);

// IP-based rate limiting (applied to all API routes)
app.use('/api/', apiLimiter.middleware());

// CSRF protection (applied to state-changing requests)
if (process.env.NODE_ENV === 'production') {
  app.use(csrfProtection);
  logger.info('CSRF protection enabled');
}

// Request logging
app.use((req, res, next) => {
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    ip: req.ip
  });
  next();
});

// API Routes
app.use('/api', apiRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Email Marketing Tool API',
    version: '1.0.0',
    status: 'running'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: req.url
  });

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Email Marketing API Server`);
  console.log(`   Running on: http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   API Documentation: http://localhost:${PORT}/api/health`);
  console.log(`\n📧 SMTP Configuration:`);
  console.log(`   Host: ${process.env.SMTP_HOST}`);
  console.log(`   Port: ${process.env.SMTP_PORT}`);
  console.log(`   From: ${process.env.SMTP_FROM_EMAIL}`);
  console.log(`\n⚙️  Queue Processor:`);
  console.log(`   Status: Starting...`);
  console.log(`   Rate Limit: ${process.env.EMAIL_RATE_LIMIT || 100} emails/hour`);
  console.log(`\n📅 Campaign Scheduler:`);
  console.log(`   Status: Starting...`);
  console.log(`   Check Interval: ${process.env.SCHEDULER_CHECK_INTERVAL || 60000}ms`);
  console.log(`\n🔔 Alert System:`);
  console.log(`   Status: ${process.env.ALERTS_ENABLED === 'true' ? 'Enabled' : 'Disabled'}`);
  console.log(`   Admin Email: ${process.env.ADMIN_EMAIL || process.env.SMTP_FROM_EMAIL || 'Not configured'}`);
  console.log(`\n`);

  logger.info('Server started', { port: PORT });

  // Start queue processor
  queueService.start();
  logger.info('Queue processor started');

  // Start campaign scheduler
  schedulerService.start();
  logger.info('Campaign scheduler started');

  // Start system monitoring
  alertService.startMonitoring();
  logger.info('System monitoring started');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  queueService.stop();
  schedulerService.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  queueService.stop();
  schedulerService.stop();
  process.exit(0);
});

module.exports = app;
