import * as crypto from 'crypto';
import { CronTime } from 'cron';

const IV_LENGTH = 16;

export function encrypt(text: string) {
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    Buffer.from(process.env.ENCRYPTION_KEY, 'utf8'), // or 'hex' if using hex key
    iv,
  );

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(text: string) {
  const [ivHex, encrypted] = text.split(':');

  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'utf8'); // must match encrypt
  if (key.length !== 32) {
    throw new Error(`ENCRYPTION_KEY must be 32 bytes, got ${key.length}`);
  }

  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function getNextTime(cronExp: string) {
  const cronTime = new CronTime(cronExp);
  const nextDate = cronTime.sendAt();
  return nextDate.toISO();
}
