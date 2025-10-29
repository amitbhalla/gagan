const logger = require('../config/logger');

/**
 * Content Validation Utility for Email Compliance
 * Detects spam triggers, validates content, checks compliance
 */

// Spam trigger words (common spam indicators)
const SPAM_WORDS = [
  // Money/Financial
  'free', 'winner', 'cash', 'prize', 'urgent', 'act now',
  'limited time', 'click here', '100% free', 'make money',
  'earn extra cash', 'million dollars', 'double your income',
  'no investment', 'risk-free', 'get paid', 'credit card',
  'consolidate debt', 'eliminate debt', 'lowest price',

  // Urgency/Pressure
  'act immediately', 'apply now', 'call now', 'don\'t hesitate',
  'order now', 'buy now', 'subscribe now', 'sign up free',
  'offer expires', 'limited time offer', 'one time', 'once in lifetime',

  // Excessive Claims
  'guarantee', 'guaranteed', 'no questions asked', '100% satisfied',
  'completely satisfied', 'save big', 'additional income',
  'amazing', 'incredible deal', 'best price', 'cheapest',

  // Deceptive Content
  'hidden', 'undisclosed', 'not spam', 'this isn\'t spam',
  'confidential', 'legal', 'requires immediate response',

  // All caps words are checked separately
];

// Role-based email patterns (typically unresponsive)
const ROLE_BASED_PATTERNS = [
  /^noreply@/i,
  /^no-reply@/i,
  /^donotreply@/i,
  /^info@/i,
  /^admin@/i,
  /^support@/i,
  /^sales@/i,
  /^marketing@/i,
  /^postmaster@/i,
  /^webmaster@/i,
  /^hostmaster@/i,
  /^abuse@/i
];

/**
 * Count spam trigger words in text
 * @param {string} text - Text to analyze
 * @returns {Object} - Spam word analysis
 */
function countSpamWords(text) {
  const lowerText = text.toLowerCase();
  const foundWords = [];
  let count = 0;

  for (const word of SPAM_WORDS) {
    if (lowerText.includes(word.toLowerCase())) {
      foundWords.push(word);
      count++;
    }
  }

  return { count, words: foundWords };
}

/**
 * Calculate link to text ratio
 * @param {string} html - HTML content
 * @returns {number} - Ratio (0-1)
 */
function calculateLinkRatio(html) {
  // Remove HTML tags except links
  const textOnly = html.replace(/<(?!a\s)[^>]+>/gi, '');
  const totalLength = textOnly.length;

  if (totalLength === 0) return 1;

  // Extract all link text
  const linkMatches = html.match(/<a[^>]*>(.*?)<\/a>/gi) || [];
  const linkLength = linkMatches.reduce((sum, link) => {
    const text = link.replace(/<[^>]+>/g, '');
    return sum + text.length;
  }, 0);

  return totalLength > 0 ? linkLength / totalLength : 0;
}

/**
 * Calculate image to text ratio
 * @param {string} html - HTML content
 * @returns {number} - Ratio (0-1)
 */
function calculateImageRatio(html) {
  // Count images
  const imageMatches = html.match(/<img[^>]*>/gi) || [];
  const imageCount = imageMatches.length;

  // Count text length (excluding tags)
  const textOnly = html.replace(/<[^>]+>/g, '').trim();
  const textLength = textOnly.length;

  if (textLength === 0 && imageCount > 0) return 1;
  if (textLength === 0) return 0;

  // Rough calculation: assume each image represents 100 characters
  const imageEquivalent = imageCount * 100;
  return imageEquivalent / (imageEquivalent + textLength);
}

/**
 * Check if subject line has issues
 * @param {string} subject - Email subject line
 * @returns {Array} - List of issues
 */
function validateSubject(subject) {
  const issues = [];

  if (!subject || subject.trim().length === 0) {
    issues.push('Subject line is empty');
    return issues;
  }

  // Too long
  if (subject.length > 60) {
    issues.push(`Subject line too long (${subject.length}/60 chars recommended)`);
  }

  // Too short
  if (subject.length < 10) {
    issues.push(`Subject line too short (${subject.length} chars). Aim for 10-60 chars.`);
  }

  // All caps
  if (subject === subject.toUpperCase() && subject.length > 5) {
    issues.push('Subject line is all caps (looks like spam)');
  }

  // Looks like reply/forward
  if (/^(RE:|FW:|FWD:)/i.test(subject)) {
    issues.push('Subject looks like a reply/forward (may be flagged)');
  }

  // Excessive exclamation marks
  const exclamationCount = (subject.match(/!/g) || []).length;
  if (exclamationCount > 1) {
    issues.push(`Too many exclamation marks (${exclamationCount}). Use sparingly.`);
  }

  // Excessive question marks
  const questionCount = (subject.match(/\?/g) || []).length;
  if (questionCount > 2) {
    issues.push(`Too many question marks (${questionCount})`);
  }

  // Spam trigger words in subject
  const { count, words } = countSpamWords(subject);
  if (count > 0) {
    issues.push(`Spam trigger words in subject: ${words.join(', ')}`);
  }

  return issues;
}

/**
 * Validate HTML content structure
 * @param {string} html - HTML content
 * @returns {Array} - List of issues
 */
function validateHTMLStructure(html) {
  const issues = [];

  // Check if HTML is too short
  if (html.length < 100) {
    issues.push('Email content is very short');
  }

  // Check for DOCTYPE (not required but good practice)
  if (!html.includes('<!DOCTYPE') && !html.includes('<!doctype')) {
    // Not critical, just a note
  }

  // Check for basic structure
  if (!html.includes('<html') && !html.includes('<body')) {
    issues.push('Missing basic HTML structure (<html>, <body>)');
  }

  // Check for excessive HTML comments
  const commentMatches = html.match(/<!--[\s\S]*?-->/g) || [];
  if (commentMatches.length > 5) {
    issues.push(`Many HTML comments found (${commentMatches.length}). Remove unnecessary comments.`);
  }

  // Check for forms (suspicious in emails)
  if (/<form[^>]*>/i.test(html)) {
    issues.push('Email contains a form (may be flagged as phishing)');
  }

  // Check for JavaScript (not allowed in emails)
  if (/<script[^>]*>/i.test(html) || /javascript:/i.test(html)) {
    issues.push('Email contains JavaScript (will be stripped by email clients)');
  }

  // Check for suspicious attributes
  if (/on(click|load|error|mouse)/i.test(html)) {
    issues.push('Email contains event handlers (onclick, onload, etc.). Remove them.');
  }

  return issues;
}

/**
 * Validate plain text version
 * @param {string} plainText - Plain text content
 * @param {string} html - HTML content
 * @returns {Object} - Validation result
 */
function validatePlainText(plainText, html) {
  const result = {
    valid: true,
    issues: []
  };

  if (!plainText || plainText.trim().length === 0) {
    result.valid = false;
    result.issues.push('Missing plain text version. Always include both HTML and plain text.');
    return result;
  }

  // Check if plain text is too different from HTML
  const htmlText = html.replace(/<[^>]+>/g, '').trim();
  const similarity = calculateSimilarity(plainText, htmlText);

  if (similarity < 0.5) {
    result.issues.push('Plain text version differs significantly from HTML version');
  }

  return result;
}

/**
 * Calculate text similarity (simple Jaccard index)
 * @param {string} text1 - First text
 * @param {string} text2 - Second text
 * @returns {number} - Similarity score (0-1)
 */
function calculateSimilarity(text1, text2) {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Check for excessive capitalization
 * @param {string} text - Text to check
 * @returns {Object} - Capitalization analysis
 */
function checkCapitalization(text) {
  const words = text.match(/[A-Z]{2,}/g) || [];
  const capsCount = words.length;
  const totalWords = text.split(/\s+/).length;
  const capsPercentage = (capsCount / totalWords) * 100;

  return {
    allCapsWords: words,
    count: capsCount,
    percentage: capsPercentage,
    excessive: capsPercentage > 10 // More than 10% is excessive
  };
}

/**
 * Validate email content for spam compliance
 * @param {Object} content - Email content { subject, html, plainText }
 * @returns {Object} - Validation result with score and issues
 */
function validateEmailContent(content) {
  const { subject, html, plainText } = content;

  const result = {
    valid: true,
    score: 100, // Start with perfect score, deduct points for issues
    issues: [],
    warnings: [],
    recommendations: []
  };

  // Validate subject
  const subjectIssues = validateSubject(subject);
  if (subjectIssues.length > 0) {
    result.issues.push(...subjectIssues);
    result.score -= subjectIssues.length * 5;
  }

  // Count spam words in full content
  const fullText = subject + ' ' + html;
  const spamAnalysis = countSpamWords(fullText);
  if (spamAnalysis.count > 3) {
    result.issues.push(`${spamAnalysis.count} spam trigger words found: ${spamAnalysis.words.slice(0, 5).join(', ')}${spamAnalysis.count > 5 ? '...' : ''}`);
    result.score -= Math.min(spamAnalysis.count * 3, 30);
  } else if (spamAnalysis.count > 0) {
    result.warnings.push(`${spamAnalysis.count} spam trigger word(s) found: ${spamAnalysis.words.join(', ')}`);
    result.score -= spamAnalysis.count * 2;
  }

  // Check link ratio
  const linkRatio = calculateLinkRatio(html);
  if (linkRatio > 0.5) {
    result.issues.push(`High link-to-text ratio (${(linkRatio * 100).toFixed(1)}%). Add more text content.`);
    result.score -= 15;
  } else if (linkRatio > 0.3) {
    result.warnings.push(`Moderate link-to-text ratio (${(linkRatio * 100).toFixed(1)}%)`);
    result.score -= 5;
  }

  // Check image ratio
  const imageRatio = calculateImageRatio(html);
  if (imageRatio > 0.6) {
    result.issues.push(`High image-to-text ratio (${(imageRatio * 100).toFixed(1)}%). Add more text content.`);
    result.score -= 15;
  } else if (imageRatio > 0.4) {
    result.warnings.push(`Moderate image-to-text ratio (${(imageRatio * 100).toFixed(1)}%)`);
    result.score -= 5;
  }

  // Validate HTML structure
  const htmlIssues = validateHTMLStructure(html);
  if (htmlIssues.length > 0) {
    result.issues.push(...htmlIssues);
    result.score -= htmlIssues.length * 5;
  }

  // Validate plain text
  const plainTextResult = validatePlainText(plainText || '', html);
  if (!plainTextResult.valid) {
    result.issues.push(...plainTextResult.issues);
    result.score -= 20;
  } else if (plainTextResult.issues.length > 0) {
    result.warnings.push(...plainTextResult.issues);
    result.score -= 5;
  }

  // Check capitalization
  const capsAnalysis = checkCapitalization(fullText);
  if (capsAnalysis.excessive) {
    result.warnings.push(`Excessive capitalization (${capsAnalysis.percentage.toFixed(1)}% all-caps words)`);
    result.score -= 10;
  }

  // Ensure score doesn't go below 0
  result.score = Math.max(result.score, 0);

  // Determine overall validity
  result.valid = result.score >= 60;

  // Add recommendations
  if (result.score < 60) {
    result.recommendations.push('Content has significant spam indicators. Please review and improve.');
  }
  if (spamAnalysis.count > 0) {
    result.recommendations.push('Remove or replace spam trigger words with more natural language.');
  }
  if (linkRatio > 0.3) {
    result.recommendations.push('Add more descriptive text to balance the link content.');
  }
  if (imageRatio > 0.4) {
    result.recommendations.push('Add more text content to balance the images.');
  }
  if (!plainText || plainText.trim().length === 0) {
    result.recommendations.push('Always include a plain text version of your email.');
  }

  return result;
}

/**
 * Check if email address is role-based
 * @param {string} email - Email address to check
 * @returns {boolean} - True if role-based
 */
function isRoleBasedEmail(email) {
  return ROLE_BASED_PATTERNS.some(pattern => pattern.test(email));
}

/**
 * Get content health score
 * @param {Object} content - Email content
 * @returns {Object} - Health score and status
 */
function getContentHealthScore(content) {
  const validation = validateEmailContent(content);

  let status;
  if (validation.score >= 90) {
    status = 'excellent';
  } else if (validation.score >= 75) {
    status = 'good';
  } else if (validation.score >= 60) {
    status = 'fair';
  } else {
    status = 'poor';
  }

  return {
    score: validation.score,
    status,
    issues: validation.issues.length,
    warnings: validation.warnings.length
  };
}

module.exports = {
  validateEmailContent,
  validateSubject,
  countSpamWords,
  calculateLinkRatio,
  calculateImageRatio,
  isRoleBasedEmail,
  getContentHealthScore,
  SPAM_WORDS,
  ROLE_BASED_PATTERNS
};
