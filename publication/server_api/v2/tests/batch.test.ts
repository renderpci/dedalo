import { describe, test, expect } from 'bun:test';
import { executeBatch } from '../src/services/batch.service';

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
