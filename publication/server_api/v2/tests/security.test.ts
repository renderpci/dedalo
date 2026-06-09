import { describe, test, expect } from 'bun:test';
import { sanitizeString, validatePaginationParams, validateSectionId, validateLang } from '../src/security/sanitizer';
import { HttpError } from '../src/middleware/error-handler';

describe('Sanitizer', () => {
  test('sanitizeString removes dangerous characters', () => {
    expect(() => sanitizeString('<script>alert(1)</script>')).toThrow();
    expect(sanitizeString('test')).toBe('test');
    expect(sanitizeString('hello < world')).toBe('hello  world');
  });

  test('sanitizeString rejects XSS patterns', () => {
    expect(() => sanitizeString('<script>alert(1)</script>')).toThrow();
    expect(() => sanitizeString('javascript:alert(1)')).toThrow();
    expect(() => sanitizeString('onclick=alert(1)')).toThrow();
  });

  test('validatePaginationParams returns valid values', () => {
    const params = new URLSearchParams('limit=50&offset=10');
    const result = validatePaginationParams(params);
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(10);
  });

  test('validatePaginationParams uses defaults', () => {
    const params = new URLSearchParams('');
    const result = validatePaginationParams(params);
    expect(result.limit).toBe(100);
    expect(result.offset).toBe(0);
  });

  test('validatePaginationParams rejects invalid values', () => {
    expect(() => validatePaginationParams(new URLSearchParams('limit=0'))).toThrow();
    expect(() => validatePaginationParams(new URLSearchParams('limit=2000'))).toThrow();
    expect(() => validatePaginationParams(new URLSearchParams('offset=-1'))).toThrow();
  });

  test('validateSectionId parses comma-separated IDs', () => {
    const result = validateSectionId('1,2,3');
    expect(result).toEqual([1, 2, 3]);
  });

  test('validateSectionId rejects invalid IDs', () => {
    expect(() => validateSectionId('1,abc,3')).toThrow();
    expect(() => validateSectionId('0')).toThrow();
  });

  test('validateLang accepts valid language codes', () => {
    expect(validateLang('lg-eng')).toBe('lg-eng');
    expect(validateLang('lg-spa')).toBe('lg-spa');
    expect(validateLang('lg-cat')).toBe('lg-cat');
  });

  test('validateLang rejects invalid formats', () => {
    expect(() => validateLang('eng')).toThrow();
    expect(() => validateLang('lg-english')).toThrow();
    expect(() => validateLang('lg-1')).toThrow();
  });
});
