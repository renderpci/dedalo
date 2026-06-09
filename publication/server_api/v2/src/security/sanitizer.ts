import { ValidationError } from '../errors';

const FORBIDDEN_PATTERNS = [
  /<script/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /data:\s*text\/html/i,
];

export function sanitizeString(value: string): string {
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(value)) {
      throw new ValidationError('Forbidden pattern detected in input');
    }
  }
  return value.replace(/[<>]/g, '').trim();
}

export function validateLang(lang: string): string {
  if (!/^lg-[a-z]{2,5}$/.test(lang)) {
    throw new ValidationError(`Invalid lang format. Expected: lg-xx (e.g., lg-eng)`);
  }
  return lang;
}
