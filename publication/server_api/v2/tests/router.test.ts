import { describe, test, expect } from 'bun:test';
import { findRoute } from '../src/router';
import { NotFoundError, MethodNotAllowedError } from '../src/errors';

describe('findRoute', () => {
  test('matches static routes', () => {
    expect(findRoute('GET', '/databases')).toBeTruthy();
    expect(findRoute('GET', '/health')).toBeTruthy();
    expect(findRoute('POST', '/batch')).toBeTruthy();
    expect(findRoute('GET', '/')).toBeTruthy();
  });

  test('captures path parameters', () => {
    const { params } = findRoute('GET', '/dedalo_web/tables/interview/records/42');
    expect(params).toEqual({ db: 'dedalo_web', table: 'interview', id: '42' });
  });

  test('matches nested fragment routes', () => {
    const { params } = findRoute('GET', '/mydb/tables/publications/records/7/fragments');
    expect(params.table).toBe('publications');
    expect(params.id).toBe('7');

    const av = findRoute('GET', '/mydb/tables/interview/records/7/av-fragments');
    expect(av.params.id).toBe('7');
  });

  test('matches table search route', () => {
    const { params } = findRoute('GET', '/mydb/tables/interview/search');
    expect(params).toEqual({ db: 'mydb', table: 'interview' });
  });

  test('decodes URL-encoded segments', () => {
    const { params } = findRoute('GET', '/my%20db/tables/inter%C3%A9s');
    expect(params.db).toBe('my db');
    expect(params.table).toBe('interés');
  });

  test('static routes are not shadowed by :db routes', () => {
    // /databases is one segment; /:db/tables is two — but /health/... etc must not collide
    const { params } = findRoute('GET', '/health');
    expect(params).toEqual({});
  });

  test('trailing slashes are tolerated', () => {
    const { params } = findRoute('GET', '/dedalo_web/tables/');
    expect(params.db).toBe('dedalo_web');
  });

  test('throws 404 for unknown paths', () => {
    expect(() => findRoute('GET', '/nope')).toThrow(NotFoundError);
    expect(() => findRoute('GET', '/db/unknown/path/here')).toThrow(NotFoundError);
  });

  test('throws 405 with allowed methods for wrong method', () => {
    try {
      findRoute('GET', '/batch');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(MethodNotAllowedError);
      expect((error as MethodNotAllowedError).allow).toEqual(['POST']);
    }
  });

  test('throws 405 for POST on a GET route', () => {
    expect(() => findRoute('POST', '/databases')).toThrow(MethodNotAllowedError);
  });
});
