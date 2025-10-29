const dns = require('dns').promises;
const logger = require('../config/logger');

/**
 * Blacklist Checker Utility
 * Checks if domain or IP is listed on common email blacklists (DNSBLs)
 */

// Common DNS-based blacklists (DNSBLs)
const BLACKLISTS = [
  {
    name: 'Spamhaus ZEN',
    host: 'zen.spamhaus.org',
    description: 'Combined list of Spamhaus blacklists',
    severity: 'high'
  },
  {
    name: 'Spamhaus SBL',
    host: 'sbl.spamhaus.org',
    description: 'Spamhaus Block List',
    severity: 'high'
  },
  {
    name: 'Spamhaus XBL',
    host: 'xbl.spamhaus.org',
    description: 'Spamhaus Exploits Block List',
    severity: 'high'
  },
  {
    name: 'Spamhaus PBL',
    host: 'pbl.spamhaus.org',
    description: 'Spamhaus Policy Block List',
    severity: 'medium'
  },
  {
    name: 'SpamCop',
    host: 'bl.spamcop.net',
    description: 'SpamCop Blocking List',
    severity: 'high'
  },
  {
    name: 'Barracuda',
    host: 'b.barracudacentral.org',
    description: 'Barracuda Reputation Block List',
    severity: 'high'
  },
  {
    name: 'SORBS',
    host: 'dnsbl.sorbs.net',
    description: 'Spam and Open Relay Blocking System',
    severity: 'medium'
  },
  {
    name: 'UCEPROTECT Level 1',
    host: 'dnsbl-1.uceprotect.net',
    description: 'UCEPROTECT Network',
    severity: 'medium'
  },
  {
    name: 'PSBL',
    host: 'psbl.surriel.com',
    description: 'Passive Spam Block List',
    severity: 'medium'
  },
  {
    name: 'Mailspike',
    host: 'bl.mailspike.net',
    description: 'Mailspike Blacklist',
    severity: 'medium'
  },
  {
    name: 'DNSWL (Whitelist)',
    host: 'list.dnswl.org',
    description: 'DNS Whitelist (good if found here)',
    severity: 'whitelist'
  }
];

// Domain blacklists (SURBL/URIBL)
const DOMAIN_BLACKLISTS = [
  {
    name: 'SURBL Multi',
    host: 'multi.surbl.org',
    description: 'SURBL Multi (checks domains in emails)',
    severity: 'high'
  },
  {
    name: 'URIBL Multi',
    host: 'multi.uribl.com',
    description: 'URIBL Multi',
    severity: 'high'
  }
];

/**
 * Reverse IP address for DNSBL lookup
 * @param {string} ip - IP address (e.g., "192.168.1.1")
 * @returns {string} - Reversed IP (e.g., "1.1.168.192")
 */
function reverseIP(ip) {
  return ip.split('.').reverse().join('.');
}

/**
 * Check single blacklist for IP
 * @param {string} ip - IP address to check
 * @param {Object} blacklist - Blacklist configuration
 * @returns {Promise<Object>} - Check result
 */
async function checkBlacklist(ip, blacklist) {
  try {
    const reversedIP = reverseIP(ip);
    const hostname = `${reversedIP}.${blacklist.host}`;

    // Try to resolve the hostname
    // If it resolves, the IP is listed (blacklisted)
    const addresses = await dns.resolve4(hostname);

    // IP is listed on this blacklist
    return {
      listed: true,
      blacklist: blacklist.name,
      host: blacklist.host,
      description: blacklist.description,
      severity: blacklist.severity,
      returnCode: addresses[0], // DNSBL often uses return codes for info
      message: `IP ${ip} is listed on ${blacklist.name}`
    };
  } catch (error) {
    // ENOTFOUND means IP is not listed (good!)
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      return {
        listed: false,
        blacklist: blacklist.name,
        host: blacklist.host,
        message: `IP ${ip} is not listed on ${blacklist.name}`
      };
    }

    // Other errors (timeout, etc.)
    return {
      listed: null,
      blacklist: blacklist.name,
      host: blacklist.host,
      error: error.code || error.message,
      message: `Could not check ${blacklist.name}: ${error.message}`
    };
  }
}

/**
 * Check domain against domain blacklists
 * @param {string} domain - Domain to check
 * @param {Object} blacklist - Blacklist configuration
 * @returns {Promise<Object>} - Check result
 */
async function checkDomainBlacklist(domain, blacklist) {
  try {
    const hostname = `${domain}.${blacklist.host}`;
    const addresses = await dns.resolve4(hostname);

    return {
      listed: true,
      blacklist: blacklist.name,
      host: blacklist.host,
      description: blacklist.description,
      severity: blacklist.severity,
      message: `Domain ${domain} is listed on ${blacklist.name}`
    };
  } catch (error) {
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      return {
        listed: false,
        blacklist: blacklist.name,
        host: blacklist.host,
        message: `Domain ${domain} is not listed on ${blacklist.name}`
      };
    }

    return {
      listed: null,
      blacklist: blacklist.name,
      host: blacklist.host,
        error: error.code || error.message,
      message: `Could not check ${blacklist.name}: ${error.message}`
    };
  }
}

/**
 * Check IP address against all blacklists
 * @param {string} ip - IP address to check
 * @param {Array} blacklistsToCheck - Blacklists to check (default: all)
 * @returns {Promise<Object>} - Complete check result
 */
async function checkIP(ip, blacklistsToCheck = BLACKLISTS) {
  try {
    logger.info(`Checking IP ${ip} against ${blacklistsToCheck.length} blacklists...`);

    // Check all blacklists in parallel
    const checks = blacklistsToCheck.map(bl => checkBlacklist(ip, bl));
    const results = await Promise.all(checks);

    // Categorize results
    const listed = results.filter(r => r.listed === true);
    const notListed = results.filter(r => r.listed === false);
    const errors = results.filter(r => r.listed === null);

    // Find if on whitelist
    const whitelisted = listed.find(r => r.severity === 'whitelist');

    // Calculate reputation score
    let score = 100;
    const highSeverityListings = listed.filter(r => r.severity === 'high').length;
    const mediumSeverityListings = listed.filter(r => r.severity === 'medium').length;

    score -= highSeverityListings * 30;
    score -= mediumSeverityListings * 15;
    score = Math.max(score, 0);

    // If whitelisted, boost score
    if (whitelisted) {
      score = Math.min(score + 20, 100);
    }

    let status;
    if (score >= 90) status = 'excellent';
    else if (score >= 70) status = 'good';
    else if (score >= 50) status = 'fair';
    else status = 'poor';

    return {
      ip,
      checked: blacklistsToCheck.length,
      listed: listed.length,
      clean: notListed.length,
      errors: errors.length,
      score,
      status,
      whitelisted: whitelisted ? true : false,
      details: {
        listed: listed,
        notListed: notListed,
        errors: errors
      },
      timestamp: new Date().toISOString(),
      message: listed.length > 0 ?
        `IP is listed on ${listed.length} blacklist(s)` :
        'IP is not listed on any checked blacklists'
    };
  } catch (error) {
    logger.error('Error checking IP blacklist:', error);
    throw error;
  }
}

/**
 * Check domain against domain blacklists
 * @param {string} domain - Domain to check
 * @returns {Promise<Object>} - Check result
 */
async function checkDomain(domain) {
  try {
    logger.info(`Checking domain ${domain} against ${DOMAIN_BLACKLISTS.length} domain blacklists...`);

    const checks = DOMAIN_BLACKLISTS.map(bl => checkDomainBlacklist(domain, bl));
    const results = await Promise.all(checks);

    const listed = results.filter(r => r.listed === true);
    const notListed = results.filter(r => r.listed === false);
    const errors = results.filter(r => r.listed === null);

    let score = 100;
    score -= listed.length * 40;
    score = Math.max(score, 0);

    let status;
    if (score >= 80) status = 'excellent';
    else if (score >= 60) status = 'good';
    else if (score >= 40) status = 'fair';
    else status = 'poor';

    return {
      domain,
      checked: DOMAIN_BLACKLISTS.length,
      listed: listed.length,
      clean: notListed.length,
      errors: errors.length,
      score,
      status,
      details: {
        listed,
        notListed,
        errors
      },
      timestamp: new Date().toISOString(),
      message: listed.length > 0 ?
        `Domain is listed on ${listed.length} blacklist(s)` :
        'Domain is not listed on any checked blacklists'
    };
  } catch (error) {
    logger.error('Error checking domain blacklist:', error);
    throw error;
  }
}

/**
 * Get current server's external IP address
 * @returns {Promise<string>} - External IP address
 */
async function getExternalIP() {
  try {
    // Try to get from environment variable first
    if (process.env.SERVER_IP) {
      return process.env.SERVER_IP;
    }

    // Try to resolve from a public DNS lookup service
    // In production, you might want to use a more reliable method
    const https = require('https');

    return new Promise((resolve, reject) => {
      https.get('https://api.ipify.org?format=json', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json.ip);
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });
  } catch (error) {
    logger.error('Error getting external IP:', error);
    throw new Error('Could not determine external IP address');
  }
}

/**
 * Comprehensive blacklist check (IP + domain)
 * @param {string} ip - IP address (optional, will auto-detect)
 * @param {string} domain - Domain to check
 * @returns {Promise<Object>} - Complete check result
 */
async function comprehensiveCheck(ip = null, domain = null) {
  try {
    const results = {
      timestamp: new Date().toISOString(),
      ip: null,
      domain: null,
      overallScore: 0,
      overallStatus: 'unknown'
    };

    // Check IP
    if (ip) {
      results.ip = await checkIP(ip);
      results.overallScore += results.ip.score * 0.6; // IP is 60% of score
    } else {
      try {
        const detectedIP = await getExternalIP();
        results.ip = await checkIP(detectedIP);
        results.overallScore += results.ip.score * 0.6;
      } catch (error) {
        logger.warn('Could not detect IP for blacklist check:', error.message);
      }
    }

    // Check domain
    if (domain) {
      results.domain = await checkDomain(domain);
      results.overallScore += results.domain.score * 0.4; // Domain is 40% of score
    }

    // Calculate overall status
    if (results.overallScore >= 85) results.overallStatus = 'excellent';
    else if (results.overallScore >= 70) results.overallStatus = 'good';
    else if (results.overallScore >= 50) results.overallStatus = 'fair';
    else results.overallStatus = 'poor';

    // Add recommendations
    results.recommendations = [];
    if (results.ip && results.ip.listed > 0) {
      results.recommendations.push('Request delisting from blacklists where listed');
      results.recommendations.push('Review recent email sending practices');
      results.recommendations.push('Check for compromised accounts or servers');
    }
    if (results.domain && results.domain.listed > 0) {
      results.recommendations.push('Domain is blacklisted - review domain reputation');
      results.recommendations.push('Check domain history and previous owners');
    }
    if (results.overallScore < 70) {
      results.recommendations.push('Consider using a different IP or domain for sending');
      results.recommendations.push('Implement proper email authentication (SPF, DKIM, DMARC)');
      results.recommendations.push('Follow email best practices to rebuild reputation');
    }

    return results;
  } catch (error) {
    logger.error('Error in comprehensive blacklist check:', error);
    throw error;
  }
}

/**
 * Get list of available blacklists
 * @returns {Array} - Array of blacklist configurations
 */
function getBlacklists() {
  return {
    ip: BLACKLISTS,
    domain: DOMAIN_BLACKLISTS
  };
}

module.exports = {
  checkIP,
  checkDomain,
  comprehensiveCheck,
  getExternalIP,
  getBlacklists,
  BLACKLISTS,
  DOMAIN_BLACKLISTS
};
