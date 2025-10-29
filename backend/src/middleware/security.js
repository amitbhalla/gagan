/**
 * Security Middleware
 *
 * Provides security features including:
 * - CSRF (Cross-Site Request Forgery) protection
 * - IP-based rate limiting
 * - Request sanitization
 * - Security headers
 *
 * Phase 6: Production Optimization
 */

const crypto = require('crypto');
const logger = require('../config/logger');

/**
 * CSRF Token Store
 * In-memory store for CSRF tokens
 * For production with multiple servers, use Redis instead
 */
const csrfTokens = new Map();

// Clean up expired tokens every hour
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of csrfTokens.entries()) {
    if (now - data.createdAt > 3600000) { // 1 hour
      csrfTokens.delete(token);
    }
  }
}, 3600000);

/**
 * Generate CSRF Token
 * Creates a secure random token and stores it
 */
const generateCsrfToken = (userId) => {
  const token = crypto.randomBytes(32).toString('hex');
  csrfTokens.set(token, {
    userId,
    createdAt: Date.now()
  });
  return token;
};

/**
 * CSRF Token Generation Endpoint Handler
 * Call this from your auth controller after login
 */
exports.generateCsrfToken = (req, res) => {
  const userId = req.user?.id || 'anonymous';
  const token = generateCsrfToken(userId);

  res.json({
    csrfToken: token,
    expiresIn: 3600 // seconds
  });
};

/**
 * CSRF Protection Middleware
 * Validates CSRF token for state-changing requests (POST, PUT, DELETE)
 *
 * Token can be provided in:
 * - Request header: X-CSRF-Token
 * - Request body: _csrf
 * - Query parameter: _csrf
 *
 * Exemptions:
 * - GET, HEAD, OPTIONS requests
 * - Public tracking endpoints (/track/*)
 * - Health check endpoints (/health/*)
 * - Authentication endpoints (login)
 */
exports.csrfProtection = (req, res, next) => {
  // Skip CSRF for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip CSRF for public endpoints
  const publicPaths = [
    '/api/auth/login',
    '/track/',
    '/health/'
  ];

  const isPublicPath = publicPaths.some(path => req.path.includes(path));
  if (isPublicPath) {
    return next();
  }

  // Get CSRF token from request
  const token = req.headers['x-csrf-token'] ||
                req.body._csrf ||
                req.query._csrf;

  if (!token) {
    logger.warn('CSRF token missing', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });

    return res.status(403).json({
      error: 'CSRF token missing',
      message: 'CSRF token is required for this request'
    });
  }

  // Validate CSRF token
  const tokenData = csrfTokens.get(token);

  if (!tokenData) {
    logger.warn('Invalid CSRF token', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      token: token.substring(0, 10) + '...'
    });

    return res.status(403).json({
      error: 'Invalid CSRF token',
      message: 'CSRF token is invalid or expired'
    });
  }

  // Check token age (1 hour)
  const tokenAge = Date.now() - tokenData.createdAt;
  if (tokenAge > 3600000) {
    csrfTokens.delete(token);
    return res.status(403).json({
      error: 'CSRF token expired',
      message: 'CSRF token has expired, please refresh'
    });
  }

  // Token is valid, proceed
  next();
};

/**
 * IP-based Rate Limiter
 * Tracks request counts per IP address
 */
class RateLimiter {
  constructor(options = {}) {
    this.requests = new Map();
    this.maxRequests = options.maxRequests || 100;
    this.windowMs = options.windowMs || 60000; // 1 minute
    this.message = options.message || 'Too many requests, please try again later';
    this.skipSuccessfulRequests = options.skipSuccessfulRequests || false;

    // Clean up old entries every minute
    setInterval(() => {
      const now = Date.now();
      for (const [ip, data] of this.requests.entries()) {
        if (now - data.resetTime > this.windowMs) {
          this.requests.delete(ip);
        }
      }
    }, 60000);
  }

  middleware() {
    return (req, res, next) => {
      // Skip rate limiting for health checks
      if (req.path.includes('/health/')) {
        return next();
      }

      const ip = this.getClientIp(req);
      const now = Date.now();

      let requestData = this.requests.get(ip);

      // Initialize or reset if window expired
      if (!requestData || now - requestData.resetTime > this.windowMs) {
        requestData = {
          count: 0,
          resetTime: now,
          firstRequest: now
        };
        this.requests.set(ip, requestData);
      }

      // Increment request count
      requestData.count++;

      // Check if limit exceeded
      if (requestData.count > this.maxRequests) {
        const retryAfter = Math.ceil((requestData.resetTime + this.windowMs - now) / 1000);

        logger.warn('Rate limit exceeded', {
          ip,
          path: req.path,
          count: requestData.count,
          limit: this.maxRequests,
          retryAfter
        });

        res.set('Retry-After', retryAfter);
        res.set('X-RateLimit-Limit', this.maxRequests);
        res.set('X-RateLimit-Remaining', 0);
        res.set('X-RateLimit-Reset', new Date(requestData.resetTime + this.windowMs).toISOString());

        return res.status(429).json({
          error: 'Too Many Requests',
          message: this.message,
          retryAfter: retryAfter,
          limit: this.maxRequests
        });
      }

      // Add rate limit headers
      res.set('X-RateLimit-Limit', this.maxRequests);
      res.set('X-RateLimit-Remaining', Math.max(0, this.maxRequests - requestData.count));
      res.set('X-RateLimit-Reset', new Date(requestData.resetTime + this.windowMs).toISOString());

      // If skipSuccessfulRequests is true, decrement on successful response
      if (this.skipSuccessfulRequests) {
        const originalEnd = res.end;
        res.end = function (...args) {
          if (res.statusCode < 400) {
            requestData.count = Math.max(0, requestData.count - 1);
          }
          originalEnd.apply(res, args);
        };
      }

      next();
    };
  }

  getClientIp(req) {
    // Check for IP in various headers (for proxies/load balancers)
    return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
           req.headers['x-real-ip'] ||
           req.connection.remoteAddress ||
           req.socket.remoteAddress ||
           req.ip;
  }

  // Get stats for monitoring
  getStats() {
    const stats = {
      totalIps: this.requests.size,
      rateLimitedIps: 0,
      topIps: []
    };

    const ipArray = Array.from(this.requests.entries());

    // Count rate-limited IPs
    stats.rateLimitedIps = ipArray.filter(([ip, data]) => data.count > this.maxRequests).length;

    // Get top 10 IPs by request count
    stats.topIps = ipArray
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([ip, data]) => ({
        ip,
        count: data.count,
        firstRequest: new Date(data.firstRequest).toISOString()
      }));

    return stats;
  }

  // Manual reset for an IP (for testing or admin override)
  reset(ip) {
    this.requests.delete(ip);
    logger.info(`Rate limit reset for IP: ${ip}`);
  }

  // Block an IP temporarily
  block(ip, durationMs = 3600000) {
    const requestData = this.requests.get(ip) || {
      count: 0,
      resetTime: Date.now(),
      firstRequest: Date.now()
    };

    requestData.count = this.maxRequests + 1000; // Well over limit
    requestData.resetTime = Date.now() + durationMs - this.windowMs;
    this.requests.set(ip, requestData);

    logger.warn(`IP blocked: ${ip} for ${durationMs}ms`);
  }
}

// Create rate limiter instances for different endpoints

/**
 * General API rate limiter
 * 100 requests per minute per IP
 */
exports.apiLimiter = new RateLimiter({
  maxRequests: parseInt(process.env.API_RATE_LIMIT) || 100,
  windowMs: 60000, // 1 minute
  message: 'Too many API requests, please try again in a minute',
  skipSuccessfulRequests: false
});

/**
 * Authentication rate limiter (stricter)
 * 5 login attempts per minute per IP
 */
exports.authLimiter = new RateLimiter({
  maxRequests: parseInt(process.env.AUTH_RATE_LIMIT) || 5,
  windowMs: 60000, // 1 minute
  message: 'Too many login attempts, please try again in a minute',
  skipSuccessfulRequests: true
});

/**
 * Campaign send rate limiter
 * 10 campaign sends per hour per IP
 */
exports.campaignLimiter = new RateLimiter({
  maxRequests: parseInt(process.env.CAMPAIGN_RATE_LIMIT) || 10,
  windowMs: 3600000, // 1 hour
  message: 'Too many campaign sends, please try again later',
  skipSuccessfulRequests: false
});

/**
 * Contact import rate limiter
 * 5 imports per hour per IP
 */
exports.importLimiter = new RateLimiter({
  maxRequests: parseInt(process.env.IMPORT_RATE_LIMIT) || 5,
  windowMs: 3600000, // 1 hour
  message: 'Too many import requests, please try again later',
  skipSuccessfulRequests: false
});

/**
 * Input Sanitization Middleware
 * Sanitizes user input to prevent XSS and injection attacks
 */
exports.sanitizeInput = (req, res, next) => {
  // Sanitize query parameters
  if (req.query) {
    for (const key in req.query) {
      if (typeof req.query[key] === 'string') {
        req.query[key] = req.query[key].trim();
      }
    }
  }

  // Sanitize body parameters
  if (req.body) {
    sanitizeObject(req.body);
  }

  next();
};

/**
 * Recursively sanitize an object
 */
function sanitizeObject(obj) {
  for (const key in obj) {
    if (typeof obj[key] === 'string') {
      // Trim whitespace
      obj[key] = obj[key].trim();

      // Remove null bytes
      obj[key] = obj[key].replace(/\0/g, '');

      // Note: We don't HTML-escape here because React does that automatically
      // and we need to store original content for email templates
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeObject(obj[key]);
    }
  }
}

/**
 * Security Headers Middleware
 * Adds security-related HTTP headers
 */
exports.securityHeaders = (req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Enable XSS filter in browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Control referrer information
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Content Security Policy (adjust as needed)
  res.setHeader('Content-Security-Policy', "default-src 'self'");

  // Permissions Policy (formerly Feature-Policy)
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  next();
};

/**
 * Get rate limiter statistics
 * Use this in a monitoring endpoint
 */
exports.getRateLimiterStats = () => {
  return {
    api: exports.apiLimiter.getStats(),
    auth: exports.authLimiter.getStats(),
    campaign: exports.campaignLimiter.getStats(),
    import: exports.importLimiter.getStats()
  };
};
