#!/usr/bin/env node

/**
 * DKIM Key Generation Script
 *
 * Generates RSA-2048 key pair for DKIM email signing
 *
 * Usage:
 *   node src/scripts/generate-dkim.js
 *
 * Output:
 *   - Private key: backend/config/dkim/private.key
 *   - Public key: backend/config/dkim/public.key
 *   - DNS TXT record instruction
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Configuration
const DKIM_DIR = path.join(__dirname, '../../config/dkim');
const PRIVATE_KEY_PATH = path.join(DKIM_DIR, 'private.key');
const PUBLIC_KEY_PATH = path.join(DKIM_DIR, 'public.key');
const KEY_SIZE = 2048; // RSA key size (2048 recommended for DKIM)

// Domain configuration (from environment or defaults)
const DKIM_DOMAIN = process.env.DKIM_DOMAIN || 'myndsolution.com';
const DKIM_SELECTOR = process.env.DKIM_SELECTOR || 'default';

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║          DKIM Key Generation Script                       ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

/**
 * Create directory if it doesn't exist
 */
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`✓ Created directory: ${dirPath}`);
  }
}

/**
 * Generate RSA key pair
 */
function generateKeyPair() {
  console.log(`Generating ${KEY_SIZE}-bit RSA key pair...`);

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: KEY_SIZE,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  console.log('✓ Key pair generated successfully\n');
  return { publicKey, privateKey };
}

/**
 * Save keys to files
 */
function saveKeys(publicKey, privateKey) {
  // Ensure directory exists
  ensureDirectoryExists(DKIM_DIR);

  // Save private key
  fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 });
  console.log(`✓ Private key saved: ${PRIVATE_KEY_PATH}`);

  // Save public key
  fs.writeFileSync(PUBLIC_KEY_PATH, publicKey, { mode: 0o644 });
  console.log(`✓ Public key saved: ${PUBLIC_KEY_PATH}\n`);
}

/**
 * Extract public key for DNS record
 */
function extractPublicKeyForDNS(publicKey) {
  // Remove header, footer, and newlines
  return publicKey
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s+/g, '');
}

/**
 * Display DNS configuration instructions
 */
function displayDNSInstructions(publicKey) {
  const publicKeyDNS = extractPublicKeyForDNS(publicKey);

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          DNS Configuration Required                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('Add the following TXT record to your DNS:');
  console.log('\n─────────────────────────────────────────────────────────────');
  console.log(`Host/Name: ${DKIM_SELECTOR}._domainkey.${DKIM_DOMAIN}`);
  console.log(`Type:      TXT`);
  console.log(`Value:     v=DKIM1; k=rsa; p=${publicKeyDNS}`);
  console.log('TTL:       3600 (or default)');
  console.log('─────────────────────────────────────────────────────────────\n');

  console.log('Alternative format for some DNS providers:');
  console.log('\n─────────────────────────────────────────────────────────────');
  console.log(`Host:      ${DKIM_SELECTOR}._domainkey`);
  console.log(`Value:     "v=DKIM1; k=rsa; p=${publicKeyDNS}"`);
  console.log('─────────────────────────────────────────────────────────────\n');

  console.log('📝 Note: Some DNS providers may require you to split the public key');
  console.log('         into multiple strings if it exceeds 255 characters.\n');
}

/**
 * Display environment configuration
 */
function displayEnvConfiguration() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          Environment Configuration                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('Add these variables to your backend/.env file:\n');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`DKIM_DOMAIN=${DKIM_DOMAIN}`);
  console.log(`DKIM_SELECTOR=${DKIM_SELECTOR}`);
  console.log(`DKIM_PRIVATE_KEY_PATH=/app/config/dkim/private.key`);
  console.log('─────────────────────────────────────────────────────────────\n');
}

/**
 * Verify DNS record (helper function)
 */
function displayVerificationInstructions() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          Verification Steps                                ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('After adding the DNS record, verify it with:\n');
  console.log(`  dig TXT ${DKIM_SELECTOR}._domainkey.${DKIM_DOMAIN}`);
  console.log(`  nslookup -type=TXT ${DKIM_SELECTOR}._domainkey.${DKIM_DOMAIN}`);
  console.log('\nOr use online tools:');
  console.log('  • https://mxtoolbox.com/dkim.aspx');
  console.log('  • https://dkimvalidator.com/');
  console.log('  • https://www.mail-tester.com/\n');

  console.log('⏱️  DNS propagation may take 5-60 minutes.\n');
}

/**
 * Main execution
 */
function main() {
  try {
    // Generate keys
    const { publicKey, privateKey } = generateKeyPair();

    // Save to files
    saveKeys(publicKey, privateKey);

    // Display DNS instructions
    displayDNSInstructions(publicKey);

    // Display environment configuration
    displayEnvConfiguration();

    // Display verification instructions
    displayVerificationInstructions();

    console.log('✅ DKIM setup complete! Follow the DNS instructions above.\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error generating DKIM keys:', error.message);
    process.exit(1);
  }
}

// Run script
main();
