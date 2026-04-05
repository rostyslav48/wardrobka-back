import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const AUTH_TAG_LENGTH = 16;
const IV_LENGTH = 12;

const buildKey = (secret: string): Buffer =>
  createHash('sha256').update(secret).digest();

export const encryptProtectedData = (
  data: Record<string, unknown>,
  secret: string,
): string => {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, buildKey(secret), iv);
  const payload = Buffer.from(JSON.stringify(data), 'utf8');
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
};

export const decryptProtectedData = <T = Record<string, unknown>>(
  encrypted: string | null | undefined,
  secret: string,
): T | null => {
  if (!encrypted) {
    return null;
  }

  const buffer = Buffer.from(encrypted, 'base64');
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const content = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, buildKey(secret), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(content), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8')) as T;
};
