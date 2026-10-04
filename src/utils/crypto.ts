/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Cryptographic Utility for Field-Level Encryption at Rest
 * Uses AES-256-GCM authenticated cipher with random 96-bit (12-byte) initialization vectors (IVs).
 *
 * Not applied to any column yet: nothing calls encryptField outside the tests. The data export
 * passes stored emails through decryptField, which returns plain values unchanged, so it will
 * keep working once a column is encrypted. A column that is looked up by value (users.email at
 * sign-in) cannot simply be switched over, because every encryption of a value is different.
 */

import crypto from 'node:crypto';
import { env } from '../config/env.ts';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const PREFIX = 'enc:v1:';

// Derive 32-byte key from STORAGE_SIGNING_SECRET using SHA-256
function getEncryptionKey(overrideKey?: string): Buffer {
  const secret = overrideKey || env.STORAGE_SIGNING_SECRET;
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts a plaintext string into a versioned authenticated ciphertext string.
 * Output format: enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>
 */
export function encryptField(plaintext: string | null | undefined, customSecret?: string): string {
  if (plaintext === null || plaintext === undefined || plaintext === '') {
    return '';
  }

  // If already encrypted, return as-is
  if (plaintext.startsWith(PREFIX)) {
    return plaintext;
  }

  const key = getEncryptionKey(customSecret);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts a versioned authenticated ciphertext string back into plaintext.
 */
export function decryptField(ciphertext: string | null | undefined, customSecret?: string): string {
  if (!ciphertext || typeof ciphertext !== 'string') {
    return '';
  }

  // If not encrypted, return transparently (for backward compatibility during migration)
  if (!ciphertext.startsWith(PREFIX)) {
    return ciphertext;
  }

  const parts = ciphertext.slice(PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted field format.');
  }

  const [ivHex, tagHex, dataHex] = parts;
  const key = getEncryptionKey(customSecret);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(dataHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
