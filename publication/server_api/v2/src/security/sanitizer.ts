import { z } from 'zod';
import { HttpError } from '../middleware/error-handler';

const FORBIDDEN_PATTERNS = [
  /<script/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /data:\s*text\/html/i,
];

export function sanitizeString(value: string): string {
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(value)) {
      throw new HttpError(400, 'Forbidden pattern detected in input');
    }
  }

  return value.replace(/[<>]/g, '').trim();
}

export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const sanitized = { ...obj };

  for (const key in sanitized) {
    const value = sanitized[key];
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value) as any;
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    }
  }

  return sanitized;
}

export function validatePaginationParams(params: URLSearchParams): { limit: number; offset: number } {
  const limit = params.get('limit');
  const offset = params.get('offset');

  const limitNum = limit ? parseInt(limit, 10) : 100;
  const offsetNum = offset ? parseInt(offset, 10) : 0;

  if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
    throw new HttpError(400, 'Invalid limit parameter. Must be between 1 and 1000.');
  }

  if (isNaN(offsetNum) || offsetNum < 0) {
    throw new HttpError(400, 'Invalid offset parameter. Must be non-negative.');
  }

  return { limit: limitNum, offset: offsetNum };
}

export function validateSectionId(sectionId: string): number[] {
  const ids = sectionId.split(',').map(id => {
    const num = parseInt(id.trim(), 10);
    if (isNaN(num) || num < 1) {
      throw new HttpError(400, `Invalid section_id: ${id}`);
    }
    return num;
  });

  return ids;
}

export function validateLang(lang: string): string {
  const langPattern = /^lg-[a-z]{2,5}$/;
  if (!langPattern.test(lang)) {
    throw new HttpError(400, `Invalid lang format. Expected: lg-xx (e.g., lg-eng)`);
  }
  return lang;
}
