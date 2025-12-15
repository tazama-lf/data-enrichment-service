import * as crypto from 'node:crypto';

const { ENCRYPTION_KEY } = process.env;

const buffer = Buffer.from(ENCRYPTION_KEY!, 'utf8');

if (buffer.length !== 32) {
  throw new Error('ENCRYPTION_KEY must be 32 bytes for aes-256-cbc');
}

export function decrypt(text: string): string {
  const parts = text.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted payload format');
  }

  const [ivHex, encrypted] = parts;

  try {
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', buffer, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted = decipher.final('utf8');
    return decrypted;
  } catch (error) {
    throw new Error('Failed to decrypt payload');
  }
}

export function isValidText(text: string): boolean {
  return !/�{3,}/.test(text);
}

export function getJobKey(jobId: string, scheduleId: string): string {
  return `job-${jobId}-schedule-${scheduleId}`;
}
