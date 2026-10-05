/**
 * The stamp: round trip, the stamp line outside the hash, drift detected, foreign files
 * parse to null (never a throw).
 */
import { describe, expect, test } from 'bun:test';
import { STAMP_TOKEN, bodyHash, hasDrifted, parseStamp, stamp } from '../src/provision/hash';

const BODY = ['[Service]', 'User=dedalo-pubhost', '# Museu — publicació', ''].join('\n');

describe('bodyHash', () => {
  test('is sha256 over utf8, lowercase hex', () => {
    expect(bodyHash('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(bodyHash('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('stamp / parseStamp', () => {
  test('first line is `# dedalo-provision: <instance> <kind> <sha>`, body verbatim', () => {
    const text = stamp('env', 'test', BODY);
    const cut = text.indexOf('\n');
    expect(text.slice(0, cut)).toBe(`# ${STAMP_TOKEN} test env ${bodyHash(BODY)}`);
    expect(text.slice(cut + 1)).toBe(BODY);
  });

  test('round trip', () => {
    const parsed = parseStamp(stamp('unit_agent', 'test_2', BODY, '//'));
    expect(parsed).toEqual({ kind: 'unit_agent', instance: 'test_2', hash: bodyHash(BODY), body: BODY });
  });

  test('refuses a bad kind, instance or comment prefix', () => {
    expect(() => stamp('Env', 'test', BODY)).toThrow(/kind/);
    expect(() => stamp('env', 'Test', BODY)).toThrow(/instance/);
    expect(() => stamp('env', 'test', BODY, '# ')).toThrow(/comment prefix/);
  });

  test('a foreign or corrupt file parses to null', () => {
    expect(parseStamp('')).toBeNull();
    expect(parseStamp('ServerName example.org\n')).toBeNull();
    expect(parseStamp(`# ${STAMP_TOKEN} test env deadbeef\nx`)).toBeNull();
    expect(parseStamp(`# ${STAMP_TOKEN} Test env ${bodyHash('x')}\nx`)).toBeNull();
  });
});

describe('hasDrifted', () => {
  test('false for our own bytes, true for a body edit, a forged hash or a foreign file', () => {
    const text = stamp('env', 'test', BODY);
    expect(hasDrifted(text)).toBe(false);
    expect(hasDrifted(`${text}EXTRA=1\n`)).toBe(true);
    expect(hasDrifted(text.replace(bodyHash(BODY), bodyHash('other')))).toBe(true);
    expect(hasDrifted('no stamp\n')).toBe(true);
  });
});
