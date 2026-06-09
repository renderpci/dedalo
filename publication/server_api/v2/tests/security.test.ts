import { describe, test, expect } from 'bun:test';
import { sanitizeString, validateLang } from '../src/security/sanitizer';
import { ValidationError } from '../src/errors';

describe('Sanitizer', () => {
  test('sanitizeString passes clean strings', () => {
    expect(sanitizeString('test')).toBe('test');
    expect(sanitizeString('hello world')).toBe('hello world');
  });

  test('sanitizeString strips angle brackets', () => {
    expect(sanitizeString('hello < world')).toBe('hello  world');
  });

  test('sanitizeString rejects XSS patterns', () => {
    expect(() => sanitizeString('<script>alert(1)</script>')).toThrow(ValidationError);
    expect(() => sanitizeString('javascript:alert(1)')).toThrow(ValidationError);
    expect(() => sanitizeString('onclick=alert(1)')).toThrow(ValidationError);
    expect(() => sanitizeString('data: text/html;base64,abc')).toThrow(ValidationError);
  });
});

describe('validateLang', () => {
  test('accepts valid language codes', () => {
    expect(validateLang('lg-eng')).toBe('lg-eng');
    expect(validateLang('lg-spa')).toBe('lg-spa');
    expect(validateLang('lg-cat')).toBe('lg-cat');
  });

  test('rejects invalid formats', () => {
    expect(() => validateLang('eng')).toThrow(ValidationError);
    expect(() => validateLang('lg-english')).toThrow(ValidationError);
    expect(() => validateLang('lg-1')).toThrow(ValidationError);
  });
});
