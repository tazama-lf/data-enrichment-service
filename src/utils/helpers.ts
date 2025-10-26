import * as crypto from 'crypto';
import { CronTime } from 'cron';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const buffer = Buffer.from(`${ENCRYPTION_KEY}`, 'utf8');

export function decrypt(text: string) {
  const [ivHex, encrypted] = text.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', buffer, iv);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function getNextTime(cronExp: string) {
  const cronTime = new CronTime(cronExp);
  const nextDate = cronTime.sendAt();
  return nextDate.toISO();
}

export function isValidText(text: string): boolean {
  return !/�{3,}/.test(text);
}
