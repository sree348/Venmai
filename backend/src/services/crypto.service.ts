import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function getKey() {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY || 'placeholder';
  return createHash('sha256').update(secret).digest();
}

export function encryptJson(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);

  return {
    encryptedCredentials: encrypted.toString('base64'),
    credentialIv: iv.toString('base64'),
    credentialTag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptJson<T>(encryptedCredentials: string, credentialIv: string, credentialTag: string): T {
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(credentialIv, 'base64'));
  decipher.setAuthTag(Buffer.from(credentialTag, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedCredentials, 'base64')),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString('utf8')) as T;
}
