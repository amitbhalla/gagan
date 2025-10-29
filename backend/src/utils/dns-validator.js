const dns = require('dns').promises;
const logger = require('../config/logger');

/**
 * DNS Validation Utility for Email Authentication
 * Validates SPF, DKIM, and DMARC DNS records
 */

/**
 * Parse SPF record
 * @param {string} record - SPF TXT record
 * @returns {Object} - Parsed SPF information
 */
function parseSPF(record) {
  const result = {
    valid: false,
    version: null,
    mechanisms: [],
    qualifier: null,
    includesGoogle: false,
    issues: []
  };

  if (!record.startsWith('v=spf1')) {
    result.issues.push('SPF record must start with v=spf1');
    return result;
  }

  result.valid = true;
  result.version = 'spf1';

  const parts = record.split(' ');
  for (const part of parts) {
    if (part === 'v=spf1') continue;

    // Check for Google include
    if (part.includes('_spf.google.com')) {
      result.includesGoogle = true;
    }

    // Extract mechanisms
    if (part.startsWith('include:') || part.startsWith('a:') ||
        part.startsWith('mx:') || part.startsWith('ip4:') ||
        part.startsWith('ip6:')) {
      result.mechanisms.push(part);
    }

    // Extract qualifier (all)
    if (part.match(/^[~\-\+\?]all$/)) {
      result.qualifier = part;
    }
  }

  // Validate qualifier
  if (!result.qualifier) {
    result.issues.push('SPF record should end with a qualifier (~all, -all, +all, or ?all)');
  } else if (result.qualifier === '+all') {
    result.issues.push('Using +all is insecure and allows anyone to send email');
  }

  // Check for too many DNS lookups (SPF limit is 10)
  const dnsLookups = result.mechanisms.filter(m =>
    m.startsWith('include:') || m.startsWith('a:') || m.startsWith('mx:')
  ).length;

  if (dnsLookups > 10) {
    result.issues.push(`Too many DNS lookups (${dnsLookups}/10). This may cause SPF to fail.`);
  }

  return result;
}

/**
 * Parse DKIM record
 * @param {string} record - DKIM TXT record
 * @returns {Object} - Parsed DKIM information
 */
function parseDKIM(record) {
  const result = {
    valid: false,
    version: null,
    keyType: null,
    publicKey: null,
    testMode: false,
    issues: []
  };

  if (!record.includes('v=DKIM1')) {
    result.issues.push('DKIM record must contain v=DKIM1');
    return result;
  }

  result.valid = true;
  result.version = 'DKIM1';

  // Extract key type
  const kMatch = record.match(/k=([a-z0-9]+)/i);
  if (kMatch) {
    result.keyType = kMatch[1];
    if (result.keyType !== 'rsa') {
      result.issues.push(`Unusual key type: ${result.keyType}. RSA is recommended.`);
    }
  } else {
    result.keyType = 'rsa'; // Default
  }

  // Extract public key
  const pMatch = record.match(/p=([A-Za-z0-9+/=]+)/);
  if (pMatch) {
    result.publicKey = pMatch[1];
    if (result.publicKey.length < 200) {
      result.issues.push('Public key seems short. 2048-bit keys are recommended.');
    }
  } else {
    result.issues.push('No public key found in DKIM record');
    result.valid = false;
  }

  // Check for test mode
  if (record.includes('t=y')) {
    result.testMode = true;
    result.issues.push('DKIM is in test mode (t=y). Remove this in production.');
  }

  return result;
}

/**
 * Parse DMARC record
 * @param {string} record - DMARC TXT record
 * @returns {Object} - Parsed DMARC information
 */
function parseDMARC(record) {
  const result = {
    valid: false,
    version: null,
    policy: null,
    subdomainPolicy: null,
    percentage: 100,
    alignment: {
      dkim: 'r', // relaxed
      spf: 'r'   // relaxed
    },
    reporting: {
      aggregate: [],
      forensic: []
    },
    issues: []
  };

  if (!record.startsWith('v=DMARC1')) {
    result.issues.push('DMARC record must start with v=DMARC1');
    return result;
  }

  result.valid = true;
  result.version = 'DMARC1';

  // Extract policy
  const pMatch = record.match(/p=(none|quarantine|reject)/);
  if (pMatch) {
    result.policy = pMatch[1];
    if (result.policy === 'none') {
      result.issues.push('DMARC policy is "none". Consider "quarantine" or "reject" for better protection.');
    }
  } else {
    result.issues.push('No policy (p=) found in DMARC record');
    result.valid = false;
  }

  // Extract subdomain policy
  const spMatch = record.match(/sp=(none|quarantine|reject)/);
  if (spMatch) {
    result.subdomainPolicy = spMatch[1];
  }

  // Extract percentage
  const pctMatch = record.match(/pct=(\d+)/);
  if (pctMatch) {
    result.percentage = parseInt(pctMatch[1]);
    if (result.percentage < 100) {
      result.issues.push(`Only ${result.percentage}% of emails are subject to DMARC policy`);
    }
  }

  // Extract DKIM alignment
  const adkimMatch = record.match(/adkim=([rs])/);
  if (adkimMatch) {
    result.alignment.dkim = adkimMatch[1];
  }

  // Extract SPF alignment
  const aspfMatch = record.match(/aspf=([rs])/);
  if (aspfMatch) {
    result.alignment.spf = aspfMatch[1];
  }

  // Extract aggregate reporting addresses
  const ruaMatch = record.match(/rua=mailto:([^;]+)/);
  if (ruaMatch) {
    result.reporting.aggregate = ruaMatch[1].split(',').map(e => e.trim());
  } else {
    result.issues.push('No aggregate reporting email (rua=) configured');
  }

  // Extract forensic reporting addresses
  const rufMatch = record.match(/ruf=mailto:([^;]+)/);
  if (rufMatch) {
    result.reporting.forensic = rufMatch[1].split(',').map(e => e.trim());
  }

  return result;
}

/**
 * Validate SPF record for domain
 * @param {string} domain - Domain to check
 * @returns {Promise<Object>} - Validation result
 */
async function validateSPF(domain) {
  try {
    const records = await dns.resolveTxt(domain);
    const spfRecords = records.filter(r => r.join('').startsWith('v=spf1'));

    if (spfRecords.length === 0) {
      return {
        found: false,
        message: 'No SPF record found',
        recommendation: `Add SPF record: v=spf1 include:_spf.google.com ~all`
      };
    }

    if (spfRecords.length > 1) {
      return {
        found: true,
        error: true,
        message: 'Multiple SPF records found (only one allowed)',
        records: spfRecords.map(r => r.join(''))
      };
    }

    const spfRecord = spfRecords[0].join('');
    const parsed = parseSPF(spfRecord);

    return {
      found: true,
      record: spfRecord,
      valid: parsed.valid,
      parsed,
      message: parsed.valid ? 'SPF record is valid' : 'SPF record has issues'
    };
  } catch (error) {
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      return {
        found: false,
        message: 'No SPF record found',
        recommendation: `Add SPF record: v=spf1 include:_spf.google.com ~all`
      };
    }
    logger.error('SPF validation error:', error);
    throw error;
  }
}

/**
 * Validate DKIM record for domain
 * @param {string} domain - Domain to check
 * @param {string} selector - DKIM selector (default: 'default')
 * @returns {Promise<Object>} - Validation result
 */
async function validateDKIM(domain, selector = 'default') {
  try {
    const dkimDomain = `${selector}._domainkey.${domain}`;
    const records = await dns.resolveTxt(dkimDomain);

    if (records.length === 0) {
      return {
        found: false,
        message: `No DKIM record found for selector "${selector}"`,
        recommendation: `Add DKIM TXT record at ${dkimDomain}`
      };
    }

    const dkimRecord = records[0].join('');
    const parsed = parseDKIM(dkimRecord);

    return {
      found: true,
      selector,
      record: dkimRecord,
      valid: parsed.valid,
      parsed,
      message: parsed.valid ? 'DKIM record is valid' : 'DKIM record has issues'
    };
  } catch (error) {
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      return {
        found: false,
        message: `No DKIM record found for selector "${selector}"`,
        recommendation: `Add DKIM TXT record at ${selector}._domainkey.${domain}`
      };
    }
    logger.error('DKIM validation error:', error);
    throw error;
  }
}

/**
 * Validate DMARC record for domain
 * @param {string} domain - Domain to check
 * @returns {Promise<Object>} - Validation result
 */
async function validateDMARC(domain) {
  try {
    const dmarcDomain = `_dmarc.${domain}`;
    const records = await dns.resolveTxt(dmarcDomain);

    if (records.length === 0) {
      return {
        found: false,
        message: 'No DMARC record found',
        recommendation: `Add DMARC TXT record at ${dmarcDomain}: v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}; ruf=mailto:dmarc@${domain}; fo=1; adkim=s; aspf=s; pct=100; ri=86400`
      };
    }

    const dmarcRecord = records[0].join('');
    const parsed = parseDMARC(dmarcRecord);

    return {
      found: true,
      record: dmarcRecord,
      valid: parsed.valid,
      parsed,
      message: parsed.valid ? 'DMARC record is valid' : 'DMARC record has issues'
    };
  } catch (error) {
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      return {
        found: false,
        message: 'No DMARC record found',
        recommendation: `Add DMARC TXT record at _dmarc.${domain}`
      };
    }
    logger.error('DMARC validation error:', error);
    throw error;
  }
}

/**
 * Validate all email authentication records for domain
 * @param {string} domain - Domain to check
 * @param {string} dkimSelector - DKIM selector
 * @returns {Promise<Object>} - Complete validation result
 */
async function validateDomain(domain, dkimSelector = 'default') {
  const results = {
    domain,
    timestamp: new Date().toISOString(),
    spf: null,
    dkim: null,
    dmarc: null,
    score: 0,
    maxScore: 100,
    status: 'fail'
  };

  try {
    // Validate SPF
    results.spf = await validateSPF(domain);
    if (results.spf.found && results.spf.valid) {
      results.score += 30;
    } else if (results.spf.found) {
      results.score += 15;
    }

    // Validate DKIM
    results.dkim = await validateDKIM(domain, dkimSelector);
    if (results.dkim.found && results.dkim.valid) {
      results.score += 40;
    } else if (results.dkim.found) {
      results.score += 20;
    }

    // Validate DMARC
    results.dmarc = await validateDMARC(domain);
    if (results.dmarc.found && results.dmarc.valid) {
      results.score += 30;
    } else if (results.dmarc.found) {
      results.score += 15;
    }

    // Determine status
    if (results.score >= 90) {
      results.status = 'excellent';
    } else if (results.score >= 70) {
      results.status = 'good';
    } else if (results.score >= 50) {
      results.status = 'fair';
    } else {
      results.status = 'fail';
    }

    return results;
  } catch (error) {
    logger.error('Domain validation error:', error);
    throw error;
  }
}

/**
 * Check DNS propagation status
 * @param {string} hostname - Hostname to check
 * @param {string} recordType - Record type (TXT, A, MX, etc.)
 * @returns {Promise<Object>} - Propagation status
 */
async function checkDNSPropagation(hostname, recordType = 'TXT') {
  try {
    let records;
    switch (recordType.toUpperCase()) {
      case 'TXT':
        records = await dns.resolveTxt(hostname);
        break;
      case 'A':
        records = await dns.resolve4(hostname);
        break;
      case 'MX':
        records = await dns.resolveMx(hostname);
        break;
      default:
        throw new Error(`Unsupported record type: ${recordType}`);
    }

    return {
      propagated: true,
      hostname,
      recordType,
      records,
      message: 'DNS record found and propagated'
    };
  } catch (error) {
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      return {
        propagated: false,
        hostname,
        recordType,
        message: 'DNS record not found or not yet propagated',
        note: 'DNS propagation can take up to 48 hours'
      };
    }
    throw error;
  }
}

module.exports = {
  validateSPF,
  validateDKIM,
  validateDMARC,
  validateDomain,
  checkDNSPropagation,
  parseSPF,
  parseDKIM,
  parseDMARC
};
