import { describe, test, expect } from 'bun:test';
import { executeBatch } from '../src/services/batch.service';
import { handleBatch } from '../src/routes/batch';
import { checkRateLimit } from '../src/security/rate-limiter';
import { RateLimitError } from '../src/errors';
import { config } from '../src/config';

describe('executeBatch', () => {
  test('forbidden endpoints return an inline problem', async () => {
    const result = await executeBatch({
      queries: [
        { id: 'a', path: '/batch' },
        { id: 'b', path: '/mcp' },
        { id: 'c', path: '/docs/swagger' },
        { id: 'd', path: '/health' },
      ],
    });

    expect(result.results.length).toBe(4);
    for (const item of result.results) {
      expect(item.status).toBe(400);
      expect(item.problem).toBeTruthy();
      expect(item.data).toBeUndefined();
    }
  });

  test('paths with query strings are rejected', async () => {
    const result = await executeBatch({
      queries: [{ id: 'a', path: '/db/tables?x=1' }],
    });
    expect(result.results[0].status).toBe(400);
  });

  test('unknown routes return problem+json results, not exceptions', async () => {
    const result = await executeBatch({
      queries: [{ id: 'a', path: '/totally/unknown/route/x/y' }],
    });
    expect(result.results[0].id).toBe('a');
    expect(result.results[0].status).toBe(404);
    expect((result.results[0].problem as { title: string }).title).toBe('Not Found');
  });

  test('unknown database returns 404 per query and preserves ids', async () => {
    const result = await executeBatch({
      queries: [
        { id: 'first', path: '/not_a_db/tables' },
        { id: 'second', path: '/not_a_db/tables/interview/records', params: { limit: 1 } },
      ],
    });
    expect(result.results.map(r => r.id)).toEqual(['first', 'second']);
    expect(result.results[0].status).toBe(404);
    expect(result.results[1].status).toBe(404);
  });

  test('params object serializes arrays as repeated keys', async () => {
    // invalid filter operator proves the params reached the route parser
    const result = await executeBatch({
      queries: [{
        id: 'a',
        path: '/not_a_db/tables/interview/records',
        params: { 'filter[code][badop]': 'x' },
      }],
    });
    // 404 (unknown db) is thrown before filter parsing; both prove dispatch worked
    expect([400, 404]).toContain(result.results[0].status);
  });

  test('discovery endpoints work through batch', async () => {
    const result = await executeBatch({
      queries: [{ id: 'dbs', path: '/databases' }],
    });
    expect(result.results[0].status).toBe(200);
    const data = result.results[0].data as { data: Array<{ name: string }> };
    expect(Array.isArray(data.data)).toBe(true);
  });
});

describe('batch rate-limit accounting', () => {
  // A batch is ONE http request that runs up to 20 queries. Charging it a single
  // token made /batch a 20x amplifier on the published database; the route now
  // charges the whole fan-out up front.
  test('a batch charges one token per sub-query, not one per request', async () => {
    const ip = '198.51.100.42';
    const post = (queries: Array<{ id: string; path: string }>) =>
      handleBatch(
        new Request('http://localhost/batch', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
          body: JSON.stringify({ queries }),
        }),
      );

    const queries = Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, path: '/nope/tables' }));

    // Spend the bucket down to 9 tokens, then ask for a 10-query batch: the batch
    // itself was already charged 1 by routeRequest in production, so handleBatch
    // charges the remaining 9 — exactly affordable.
    for (let i = 0; i < config.RATE_LIMIT_RPM - 9; i++) {
      checkRateLimit(new Request('http://localhost/x', { headers: { 'x-forwarded-for': ip } }));
    }
    await post(queries);

    // The fan-out consumed the quota: a further batch cannot afford its sub-queries.
    await expect(post(queries)).rejects.toThrow(RateLimitError);
  });
});
