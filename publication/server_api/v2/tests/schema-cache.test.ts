import { describe, test, expect } from 'bun:test';
import { TTLCache } from '../src/db/schema-cache';

describe('TTLCache', () => {
  test('stores and retrieves values', () => {
    const cache = new TTLCache<string>(60);
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  test('returns undefined for missing keys', () => {
    const cache = new TTLCache<string>(60);
    expect(cache.get('missing')).toBeUndefined();
  });

  test('expires entries after TTL', async () => {
    const cache = new TTLCache<string>(0.001);
    cache.set('key1', 'value1');
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(cache.get('key1')).toBeUndefined();
  });

  test('invalidate clears specific key', () => {
    const cache = new TTLCache<string>(60);
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.invalidate('key1');
    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key2')).toBe('value2');
  });

  test('invalidate clears all keys when no key provided', () => {
    const cache = new TTLCache<string>(60);
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.invalidate();
    expect(cache.size).toBe(0);
  });

  test('reports correct size', () => {
    const cache = new TTLCache<string>(60);
    expect(cache.size).toBe(0);
    cache.set('key1', 'value1');
    expect(cache.size).toBe(1);
    cache.set('key2', 'value2');
    expect(cache.size).toBe(2);
  });
});
