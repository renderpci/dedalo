import { describe, test, expect } from 'bun:test';
import { ServiceError, ValidationError, NotFoundError, HttpError } from '../src/errors';

describe('Error classes', () => {
  test('ServiceError has correct properties', () => {
    const err = new ServiceError('something failed', 'INTERNAL_ERROR', 500);
    expect(err.message).toBe('something failed');
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.statusCode).toBe(500);
    expect(err.name).toBe('ServiceError');
    expect(err instanceof Error).toBe(true);
  });

  test('ValidationError defaults to 400', () => {
    const err = new ValidationError('bad input');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.name).toBe('ValidationError');
  });

  test('NotFoundError defaults to 404', () => {
    const err = new NotFoundError('not found');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.name).toBe('NotFoundError');
  });

  test('HttpError has correct properties', () => {
    const err = new HttpError(429, 'rate limited');
    expect(err.status).toBe(429);
    expect(err.message).toBe('rate limited');
    expect(err.name).toBe('HttpError');
  });
});
