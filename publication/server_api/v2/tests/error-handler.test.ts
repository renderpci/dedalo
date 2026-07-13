import { describe, test, expect } from 'bun:test';
import { z } from 'zod';
import { handleError } from '../src/middleware/error-handler';
import { ValidationError, NotFoundError, MethodNotAllowedError, PROBLEM_TYPE_BASE } from '../src/errors';

const req = (path = '/dedalo_web/tables/interview/records?limit=5') =>
  new Request(`http://localhost:3100${path}`);

async function problemBody(res: Response): Promise<Record<string, unknown>> {
  expect(res.headers.get('Content-Type')).toBe('application/problem+json');
  return await res.json() as Record<string, unknown>;
}

describe('handleError', () => {
  test('ApiError maps to problem+json with instance', async () => {
    const res = handleError(new NotFoundError('Unknown table: nope'), req('/dedalo_web/tables/nope'));
    expect(res.status).toBe(404);
    const body = await problemBody(res);
    expect(body.type).toBe(`${PROBLEM_TYPE_BASE}not-found`);
    expect(body.title).toBe('Not Found');
    expect(body.status).toBe(404);
    expect(body.detail).toBe('Unknown table: nope');
    expect(body.instance).toBe('/dedalo_web/tables/nope');
  });

  test('instance includes query string', async () => {
    const res = handleError(new ValidationError('bad'), req());
    const body = await problemBody(res);
    expect(body.instance).toBe('/dedalo_web/tables/interview/records?limit=5');
  });

  test('ValidationError extensions are merged into the body', async () => {
    const res = handleError(new ValidationError('bad', { errors: [{ pointer: 'limit', message: 'too big' }] }), req());
    const body = await problemBody(res);
    expect(body.errors).toEqual([{ pointer: 'limit', message: 'too big' }]);
  });

  test('MethodNotAllowedError sets Allow header', async () => {
    const res = handleError(new MethodNotAllowedError('POST', ['GET']), req());
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('GET');
  });

  test('ZodError maps to 400 with pointer list', async () => {
    const schema = z.object({ limit: z.number().max(10) });
    const parsed = schema.safeParse({ limit: 100 });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const res = handleError(parsed.error, req());
    expect(res.status).toBe(400);
    const body = await problemBody(res);
    expect(body.type).toBe(`${PROBLEM_TYPE_BASE}validation-error`);
    const errors = body.errors as Array<{ pointer: string; message: string }>;
    expect(errors.length).toBe(1);
    expect(errors[0].pointer).toBe('limit');
  });

  test('unknown Error maps to 500 internal-error without leaking detail in production', async () => {
    const res = handleError(new Error('secret stack info'), req());
    expect(res.status).toBe(500);
    const body = await problemBody(res);
    expect(body.type).toBe(`${PROBLEM_TYPE_BASE}internal-error`);
    // NODE_ENV defaults to production in tests unless overridden
    if (process.env.NODE_ENV !== 'development') {
      expect(body.detail).not.toContain('secret stack info');
    }
  });

  test('non-Error value maps to 500', async () => {
    const res = handleError('boom', req());
    expect(res.status).toBe(500);
  });
});
