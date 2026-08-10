import crypto from 'crypto';

export function generateApiKey(): { fullKey: string; keyPrefix: string; hashedKey: string } {
  const randomBytes = crypto.randomBytes(24).toString('hex');
  const fullKey = `aiw_live_${randomBytes}`;
  const keyPrefix = fullKey.substring(0, 16);
  const hashedKey = hashApiKey(fullKey);

  return { fullKey, keyPrefix, hashedKey };
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}
