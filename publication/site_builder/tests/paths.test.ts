import { describe, test, expect } from 'bun:test';
import { isWithin, confinedPath } from '../src/util/paths';

describe('path confinement', () => {
  test('isWithin recognises a path inside its root and rejects escapes', () => {
    expect(isWithin('/var/lib/sites', '/var/lib/sites/foo')).toBe(true);
    expect(isWithin('/var/lib/sites', '/var/lib/sites')).toBe(true);
    expect(isWithin('/var/lib/sites', '/var/lib/sites-evil')).toBe(false);
    expect(isWithin('/var/lib/sites', '/var/lib')).toBe(false);
    expect(isWithin('/var/lib/sites', '/etc/passwd')).toBe(false);
  });

  test('confinedPath resolves within root but throws on traversal', () => {
    expect(confinedPath('/var/lib/sites', 'foo', 'site.json')).toBe('/var/lib/sites/foo/site.json');
    expect(() => confinedPath('/var/lib/sites', '..', '..', 'etc', 'passwd')).toThrow();
    expect(() => confinedPath('/var/lib/sites', 'foo/../../bar')).toThrow();
  });

  test('confinedPath demands an absolute root', () => {
    expect(() => confinedPath('relative/root', 'x')).toThrow();
  });
});
