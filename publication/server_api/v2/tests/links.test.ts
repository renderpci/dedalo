import { describe, test, expect } from 'bun:test';
import { buildLinkHeader } from '../src/utils/links';

const url = (qs: string) =>
  new URL(`http://localhost:3100/publication/server_api/v2/db/tables/interview/records${qs}`);

describe('buildLinkHeader', () => {
  test('emits next when a full page was returned (no total)', () => {
    const link = buildLinkHeader(url('?limit=10'), 10, 0, 10);
    expect(link).toContain('rel="next"');
    expect(link).toContain('offset=10');
    expect(link).not.toContain('rel="prev"');
  });

  test('no next when the page was short', () => {
    const link = buildLinkHeader(url('?limit=10'), 10, 0, 5);
    expect(link).toBeUndefined();
  });

  test('uses total when available', () => {
    const withMore = buildLinkHeader(url('?limit=10&count=true'), 10, 0, 10, 25);
    expect(withMore).toContain('rel="next"');

    const lastPage = buildLinkHeader(url('?limit=10&offset=20&count=true'), 10, 20, 5, 25);
    expect(lastPage).not.toContain('rel="next"');
    expect(lastPage).toContain('rel="prev"');
  });

  test('emits prev with clamped offset', () => {
    const link = buildLinkHeader(url('?limit=10&offset=5'), 10, 5, 10);
    expect(link).toContain('rel="prev"');
    expect(link).toContain('offset=0');
  });

  test('preserves base path, filters and sort in links', () => {
    const link = buildLinkHeader(url('?filter%5Bcode%5D%5Blike%5D=OH-%25&sort=-date&limit=10'), 10, 0, 10);
    expect(link).toContain('/publication/server_api/v2/');
    expect(link).toContain('filter%5Bcode%5D%5Blike%5D=OH-%25');
    expect(link).toContain('sort=-date');
  });

  test('returns undefined for limit=0', () => {
    expect(buildLinkHeader(url('?limit=0'), 0, 0, 0, 100)).toBeUndefined();
  });
});
