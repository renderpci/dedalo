import { describe, test, expect } from 'bun:test';
import { json, noContent, html, yaml } from '../src/utils/response';

describe('Response utilities', () => {
  test('json creates JSON response with correct headers', async () => {
    const res = json({ hello: 'world' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    const body = await res.json();
    expect(body).toEqual({ hello: 'world' });
  });

  test('json accepts custom status', async () => {
    const res = json({ error: 'not found' }, 404);
    expect(res.status).toBe(404);
  });

  test('noContent creates 204 response', () => {
    const res = noContent();
    expect(res.status).toBe(204);
  });

  test('html creates HTML response', () => {
    const res = html('<h1>Hello</h1>');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
  });

  test('yaml creates YAML response', () => {
    const res = yaml('openapi: 3.1.0');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/yaml');
  });
});
