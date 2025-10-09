import * as crypto from 'crypto';
import { CronTime } from 'cron';
import { BadRequestException } from '@nestjs/common';
import { RESERVED_KEYWORDS } from './constants';

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

export function validateTableName(tableName: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
    throw new BadRequestException(
      `Invalid table name "${tableName}". Only letters, numbers, and underscores are allowed, and it must start with a letter or underscore.`,
    );
  }

  if (tableName.length > 63) {
    throw new BadRequestException(`Invalid table name "${tableName}". Must not exceed 63 characters.`);
  }

  if (RESERVED_KEYWORDS.has(tableName.toLowerCase())) {
    throw new BadRequestException(`Invalid table name "${tableName}". It is a reserved SQL keyword.`);
  }
}

export function validateFileType(filePath: string): 'CSV' | 'TSV' | 'JSON' {
  const ext = filePath.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'csv':
      return 'CSV';
    case 'tsv':
      return 'TSV';
    case 'json':
      return 'JSON';
    default:
      throw new Error(`Invalid file type: ${ext}. Only CSV, TSV, or JSON are allowed.`);
  }
}

export function validateCronExpression(expression: string): boolean {
  try {
    new CronTime(expression);
    return true;
  } catch (error) {
    throw new BadRequestException(`Invalid Cron Expression : ${error.message}`);
  }
}

export function isValidText(text: string): boolean {
  return !/�{3,}/.test(text);
}
