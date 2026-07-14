import { describe, test, expect } from 'bun:test';
import {
  ApiError,
  ValidationError,
  UnauthorizedError,
  NotFoundError,
  MethodNotAllowedError,
  RateLimitError,
  ServiceError,
  TimeoutError,
  PROBLEM_TYPE_BASE,
} from '../src/errors';

describe('Error classes', () => {
  test('ApiError exposes problem details fields', () => {
    const err = new ApiError(418, 'https://example.org/teapot', 'Teapot', 'short and stout', { extra: 1 });
    expect(err.status).toBe(418);
    expect(err.type).toBe('https://example.org/teapot');
    expect(err.title).toBe('Teapot');
    expect(err.detail).toBe('short and stout');
    expect(err.message).toBe('short and stout');
    expect(err.extensions).toEqual({ extra: 1 });
    expect(err instanceof Error).toBe(true);
  });

  test('ApiError detail defaults to title', () => {
    const err = new ApiError(500, 'about:blank', 'Internal Server Error');
    expect(err.detail).toBe('Internal Server Error');
  });

  test('ValidationError is 400 with extensions support', () => {
    const err = new ValidationError('bad input', { errors: [{ pointer: 'limit', message: 'too big' }] });
    expect(err.status).toBe(400);
    expect(err.type).toBe(`${PROBLEM_TYPE_BASE}validation-error`);
    expect(err.title).toBe('Validation Error');
    expect(err.detail).toBe('bad input');
    expect(err.extensions).toEqual({ errors: [{ pointer: 'limit', message: 'too big' }] });
    expect(err.name).toBe('ValidationError');
    expect(err instanceof ApiError).toBe(true);
  });

  test('UnauthorizedError is 401', () => {
    const err = new UnauthorizedError('Missing API key');
    expect(err.status).toBe(401);
    expect(err.type).toBe(`${PROBLEM_TYPE_BASE}unauthorized`);
    expect(err.name).toBe('UnauthorizedError');
  });

  test('NotFoundError is 404', () => {
    const err = new NotFoundError('not found');
    expect(err.status).toBe(404);
    expect(err.type).toBe(`${PROBLEM_TYPE_BASE}not-found`);
    expect(err.name).toBe('NotFoundError');
  });

  test('MethodNotAllowedError is 405 and carries allowed methods', () => {
    const err = new MethodNotAllowedError('POST', ['GET']);
    expect(err.status).toBe(405);
    expect(err.allow).toEqual(['GET']);
    expect(err.detail).toContain('POST');
    expect(err.detail).toContain('GET');
    expect(err.name).toBe('MethodNotAllowedError');
  });

  test('RateLimitError is 429', () => {
    const err = new RateLimitError('slow down');
    expect(err.status).toBe(429);
    expect(err.type).toBe(`${PROBLEM_TYPE_BASE}rate-limit-exceeded`);
    expect(err.name).toBe('RateLimitError');
  });

  test('ServiceError is 500', () => {
    const err = new ServiceError('boom');
    expect(err.status).toBe(500);
    expect(err.type).toBe(`${PROBLEM_TYPE_BASE}internal-error`);
    expect(err.name).toBe('ServiceError');
  });

  test('TimeoutError is 504 with default detail', () => {
    const err = new TimeoutError();
    expect(err.status).toBe(504);
    expect(err.type).toBe(`${PROBLEM_TYPE_BASE}timeout`);
    expect(err.detail).toBeTruthy();
    expect(err.name).toBe('TimeoutError');
  });
});
