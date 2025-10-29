const crypto = require('crypto');
const logger = require('../config/logger');

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // For AES, this is always 16
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const TAG_POSITION = SALT_LENGTH + IV_LENGTH;
const ENCRYPTED_POSITION = TAG_POSITION + TAG_LENGTH;

/**
 * Get encryption key from environment variable
 * Falls back to a default key if not set (NOT RECOMMENDED for production)
 */
function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    logger.warn('ENCRYPTION_KEY not set in environment, using default key (NOT SECURE)');
    // Default key for development only - MUST be changed in production
    return crypto.scryptSync('default-development-key-change-me', 'salt', 32);
  }

  // Derive a 32-byte key from the environment variable
  return crypto.scryptSync(key, 'salt', 32);
}

/**
 * Encrypt a string value
 * @param {string} text - Text to encrypt
 * @returns {string} - Encrypted text in hex format
 */
function encrypt(text) {
  try {
    if (!text) {
      return '';
    }

    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([
      cipher.update(String(text), 'utf8'),
      cipher.final()
    ]);

    const tag = cipher.getAuthTag();

    // Combine salt, iv, tag, and encrypted data
    const result = Buffer.concat([salt, iv, tag, encrypted]);

    return result.toString('hex');
  } catch (error) {
    logger.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt an encrypted string
 * @param {string} encryptedHex - Encrypted text in hex format
 * @returns {string} - Decrypted text
 */
function decrypt(encryptedHex) {
  try {
    if (!encryptedHex) {
      return '';
    }

    const key = getEncryptionKey();
    const data = Buffer.from(encryptedHex, 'hex');

    // Extract components
    const salt = data.subarray(0, SALT_LENGTH);
    const iv = data.subarray(SALT_LENGTH, TAG_POSITION);
    const tag = data.subarray(TAG_POSITION, ENCRYPTED_POSITION);
    const encrypted = data.subarray(ENCRYPTED_POSITION);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);

    return decrypted.toString('utf8');
  } catch (error) {
    logger.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Hash a password (one-way)
 * @param {string} password - Password to hash
 * @returns {string} - Hashed password
 */
function hash(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Generate a random encryption key
 * @returns {string} - Random 64-character hex string
 */
function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Encrypt an object (converts to JSON first)
 * @param {Object} obj - Object to encrypt
 * @returns {string} - Encrypted JSON
 */
function encryptObject(obj) {
  try {
    const json = JSON.stringify(obj);
    return encrypt(json);
  } catch (error) {
    logger.error('Object encryption error:', error);
    throw new Error('Failed to encrypt object');
  }
}

/**
 * Decrypt an encrypted object
 * @param {string} encryptedHex - Encrypted JSON
 * @returns {Object} - Decrypted object
 */
function decryptObject(encryptedHex) {
  try {
    const json = decrypt(encryptedHex);
    return JSON.parse(json);
  } catch (error) {
    logger.error('Object decryption error:', error);
    throw new Error('Failed to decrypt object');
  }
}

module.exports = {
  encrypt,
  decrypt,
  hash,
  generateEncryptionKey,
  encryptObject,
  decryptObject
};
