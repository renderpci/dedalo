import { describe, expect, test } from 'bun:test';
import {
  ConflictError,
  HostActionFailedError,
  MethodNotAllowedError,
  PROBLEM_TYPE_BASE,
  REASON_CODES,
  RefusedError,
  ValidationError,
} from '../src/errors';
import { SCRUBBED_DETAIL, json, problem, renderProblem } from '../src/util/response';

describe('problem envelope', () => {
  test('every problem is problem+json, no-store, under the agent type base', async () => {
    const res = problem(new ValidationError('bad actor', 'actor_missing'));
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toBe('application/problem+json; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({
      type: `${PROBLEM_TYPE_BASE}validation-error`,
      title: 'Validation Error',
      status: 400,
      detail: 'bad actor',
      reason: 'actor_missing',
    });
    expect(PROBLEM_TYPE_BASE).toBe('https://dedalo.dev/publication-host/problems/');
  });

  test('405 carries Allow', () => {
    const res = problem(new MethodNotAllowedError('PUT', ['GET']));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });

  test('409 / 422 / 503 carry their reason', async () => {
    expect(((await problem(new ConflictError('x', 'busy')).json()) as { reason: string }).reason).toBe('busy');
    const refused = problem(new RefusedError('x', 'bundle_refused', { bundle_reason: 'dot_segment' }));
    expect(refused.status).toBe(422);
    expect(await refused.json()).toMatchObject({ reason: 'bundle_refused', bundle_reason: 'dot_segment' });
    const failed = problem(new HostActionFailedError('apachectl said no', 'configtest_failed'));
    expect(failed.status).toBe(503);
  });

  test('an unrecognised throw is a 500 whose detail survives only under NODE_ENV=test', async () => {
    const inTest = (await renderProblem(new Error('/srv/secret/path'), 'test').json()) as Record<string, unknown>;
    expect(inTest.status).toBe(500);
    expect(inTest.detail).toBe('/srv/secret/path');
    const inProd = (await renderProblem(new Error('/srv/secret/path'), 'production').json()) as Record<string, unknown>;
    expect(inProd.detail).toBe(SCRUBBED_DETAIL);
  });

  test('every 5xx is scrubbed in production, and its reason survives the scrub', async () => {
    const body = (await renderProblem(new HostActionFailedError('stderr: /etc/x', 'reload_failed'), 'production').json()) as Record<string, unknown>;
    expect(body.detail).toBe(SCRUBBED_DETAIL);
    expect(body.reason).toBe('reload_failed');
  });

  test('extension keys never override type/title/status/detail (the 5xx scrub cannot be bypassed)', async () => {
    const hostile = {
      type: 'https://evil.example/x',
      title: 'Spoofed',
      status: 200,
      detail: 'stderr: /srv/secret/path',
      bundle_reason: 'kept',
    };
    const res = renderProblem(new HostActionFailedError('stderr: /etc/x', 'reload_failed', hostile), 'production');
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.type).toBe(`${PROBLEM_TYPE_BASE}host-action-failed`);
    expect(body.title).toBe('Host Action Failed');
    expect(body.status).toBe(503);
    expect(body.detail).toBe(SCRUBBED_DETAIL);
    expect(body.reason).toBe('reload_failed');
    expect(body.bundle_reason).toBe('kept');
    const refused = (await renderProblem(new RefusedError('real', 'bundle_refused', hostile), 'production').json()) as Record<string, unknown>;
    expect(refused).toMatchObject({ type: `${PROBLEM_TYPE_BASE}refused`, title: 'Refused', status: 422, detail: 'real' });
  });

  test('a 4xx detail is never scrubbed', async () => {
    const body = (await renderProblem(new ValidationError('bad'), 'production').json()) as Record<string, unknown>;
    expect(body.detail).toBe('bad');
  });

  test('the reason list is closed and unique', () => {
    expect(new Set(REASON_CODES).size).toBe(REASON_CODES.length);
    expect(Object.isFrozen(REASON_CODES)).toBe(true);
  });

  test('json() is no-store JSON', async () => {
    const res = json({ a: 1 }, 201);
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ a: 1 });
  });
});
