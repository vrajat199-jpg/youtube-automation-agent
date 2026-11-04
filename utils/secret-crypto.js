const crypto = require('crypto');

function getEncryptionKey(env = process.env) {
  const value = String(env.TOKEN_ENCRYPTION_KEY || '');
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes)');
  }
  return Buffer.from(value, 'hex');
}

function encryptJson(value, env = process.env) {
  const key = getEncryptionKey(env);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

function decryptJson(payload, env = process.env) {
  const key = getEncryptionKey(env);
  const parts = String(payload || '').split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Unsupported or malformed encrypted secret payload');
  }

  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const ciphertext = Buffer.from(parts[3], 'base64url');
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
      throw new Error('Invalid encrypted secret payload dimensions');
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8'));
  } catch (error) {
    throw new Error('Unable to decrypt stored secret; verify TOKEN_ENCRYPTION_KEY and payload integrity', { cause: error });
  }
}

module.exports = { encryptJson, decryptJson, getEncryptionKey };
