/**
 * The stamp: round trip, the stamp line outside the hash, drift detected, foreign files
 * parse to null (never a throw).
 */
import { describe, expect, test } from 'bun:test';
import { HOST_STAMP_INSTANCE, HOST_WIDE_KINDS, STAMP_TOKEN, bodyHash, hasDrifted, parseStamp, stamp } from '../src/provision/hash';
import { INSTANCE_PATTERN, derive } from '../src/provision/layout';
import { ARTIFACT_KINDS, artifact } from '../src/provision/render/types';
import { unixDeclaration } from './fixtures/provision_declaration';

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

describe('host-wide stamps (spec §2.2): `_host` only for HOST_WIDE_KINDS, never an instance on them', () => {
  test('the host stamp round-trips for every host-wide kind', () => {
    for (const kind of HOST_WIDE_KINDS) {
      const text = stamp(kind, HOST_STAMP_INSTANCE, BODY);
      expect(text.split('\n')[0]).toBe(`# ${STAMP_TOKEN} _host ${kind} ${bodyHash(BODY)}`);
      expect(parseStamp(text)).toEqual({ kind, instance: '_host', hash: bodyHash(BODY), body: BODY });
      expect(hasDrifted(text)).toBe(false);
    }
  });

  test('`_host` on an instance kind, and an instance on a host-wide kind, are refused both ways', () => {
    expect(() => stamp('env', HOST_STAMP_INSTANCE, BODY)).toThrow(/stamps only the host-wide kinds/);
    expect(() => stamp('nginx_map_include', 'test', BODY)).toThrow(/stamped '_host', never an instance/);
    expect(parseStamp(`# ${STAMP_TOKEN} _host env ${bodyHash(BODY)}\n${BODY}`)).toBeNull();
    expect(parseStamp(`# ${STAMP_TOKEN} test host_map_unit ${bodyHash(BODY)}\n${BODY}`)).toBeNull();
    expect(hasDrifted(`# ${STAMP_TOKEN} _host unit_agent ${bodyHash(BODY)}\n${BODY}`)).toBe(true);
  });

  test('`_host` can never be an instance name, and every host-wide kind is an artifact kind', () => {
    expect(INSTANCE_PATTERN.test(HOST_STAMP_INSTANCE)).toBe(false);
    for (const kind of HOST_WIDE_KINDS) expect(ARTIFACT_KINDS as readonly string[]).toContain(kind);
  });

  test("artifact(): hostWide stamps `_host` exactly for a host-wide kind, and refuses the mismatch", () => {
    const layout = derive(unixDeclaration());
    const host = artifact(layout, { kind: 'nginx_map_include', path: '/etc/nginx/conf.d/x.conf', mode: 'nginxMapInclude', body: BODY, hostWide: true });
    expect(host.hostWide).toBe(true);
    expect(parseStamp(host.body)?.instance).toBe('_host');
    const own = artifact(layout, { kind: 'env', path: layout.envFile, mode: 'envFile', body: BODY });
    expect(own.hostWide).toBe(false);
    expect(parseStamp(own.body)?.instance).toBe('test');
    expect(() => artifact(layout, { kind: 'env', path: layout.envFile, mode: 'envFile', body: BODY, hostWide: true })).toThrow(/not a host-wide kind/);
    expect(() => artifact(layout, { kind: 'host_map_unit', path: '/etc/systemd/system/x.service', mode: 'unitFile', body: BODY })).toThrow(
      /is a host-wide kind/,
    );
  });
});
