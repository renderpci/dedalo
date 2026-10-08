/**
 * init/journal_format.ts — the journal's line grammar (spec §7): the closed, secret-free detail
 * set, the secret-file rule (a sha never sits beside v2.env / the v1 config / the token, nor
 * in an api_config.* record), the torn-tail tolerance (only the LAST line), and `unfinished`.
 * Pure: no filesystem.
 */
import { describe, expect, test } from 'bun:test';
import {
  assertDetail,
  DETAIL_KEYS,
  decodeJournal,
  encodeRecord,
  isSecretFile,
  JournalFormatError,
  nextSeq,
  SECRET_FILE_BASENAMES,
  TERMINAL_PHASES,
  unfinished,
} from '../src/provision/init/journal_format';
import type { JournalRecord } from '../src/provision/init/types';

const RUN = '0123456789abcdef';
const SHA = 'a'.repeat(64);

function record(seq: number, item: string, phase: JournalRecord['phase'], detail: Record<string, unknown> = {}): JournalRecord {
  return { v: 1, seq, at: '2026-10-08T12:00:00.000Z', run: RUN, item, phase, detail };
}

describe('encodeRecord', () => {
  test('one line, newline-terminated, keys in the spec order', () => {
    const line = encodeRecord(record(1, 'home.root', 'begin', { path: '/home/example.org', uid: 0, gid: 0, mode: 0o755 }));
    expect(line.endsWith('\n')).toBe(true);
    expect(line.slice(0, -1)).not.toContain('\n');
    expect(Object.keys(JSON.parse(line))).toEqual(['v', 'seq', 'at', 'run', 'item', 'phase', 'detail']);
  });

  test('the envelope is checked: version, seq, timestamp, run id, item grammar, phase', () => {
    const good = record(1, 'code.install', 'done');
    expect(() => encodeRecord({ ...good, v: 2 as 1 })).toThrow('version');
    expect(() => encodeRecord({ ...good, seq: 0 })).toThrow('seq');
    expect(() => encodeRecord({ ...good, at: 'yesterday' })).toThrow('ISO');
    expect(() => encodeRecord({ ...good, run: 'XYZ' })).toThrow('16 hex');
    expect(() => encodeRecord({ ...good, item: 'Bad Item' })).toThrow('item');
    expect(() => encodeRecord({ ...good, phase: 'maybe' as 'done' })).toThrow('not a journal phase');
  });
});

describe('the detail is a CLOSED, typed set', () => {
  test('an unknown key is refused, naming the key only', () => {
    expect(() => assertDetail('api_config.v2_env', { password: 'hunter2hunter2' })).toThrow("detail key 'password' is not journalable");
    try {
      assertDetail('x', { body: 'the secret content' });
    } catch (error) {
      expect((error as Error).message).not.toContain('secret content');
    }
  });

  test('each key carries exactly its shape', () => {
    expect(() => assertDetail('x', { path: 'relative' })).toThrow('path value');
    expect(() => assertDetail('x', { path: '/a\nb' })).toThrow('path value');
    expect(() => assertDetail('x', { sha: 'nothex' })).toThrow('sha value');
    expect(() => assertDetail('x', { uid: -1 })).toThrow('int value');
    expect(() => assertDetail('x', { mode: 1.5 })).toThrow('int value');
    expect(() => assertDetail('x', { exists: 'yes' })).toThrow('bool value');
    expect(() => assertDetail('x', { name: 'two words' })).toThrow('word value');
    expect(() => assertDetail('x', { mods: ['ssl', 'a b'] })).toThrow('words value');
    expect(() => assertDetail('x', { reason: 'line\nbreak' })).toThrow('text value');
    expect(() => assertDetail('x', { reason: 'x'.repeat(301) })).toThrow('text value');
    expect(() => assertDetail('x', { previous: { uid: 0, gid: 0 } })).toThrow('previous value');
    expect(() => assertDetail('x', { previous: 'on' })).toThrow('previous value');
    expect(() => assertDetail('x', { remove: [{ spec: '/a', type: 'usr_t', extra: 1 }] })).toThrow('specs value');
    expect(() => assertDetail('x', { lines: [1, -2] })).toThrow('ints value');
    expect(() => assertDetail('x', [] as unknown as Record<string, unknown>)).toThrow('must be an object');
  });

  test('the admitted shapes pass', () => {
    expect(() =>
      assertDetail('web.vhost.0a1b2c3d', {
        target: '/etc/apache2/sites-available/example.conf',
        backup: '/var/lib/dedalo_publication_host_init/test/backup/3-example.conf',
        beforeSha: SHA,
        afterSha: SHA,
        mods: ['rewrite', 'headers'],
        previous: { uid: 0, gid: 0, mode: 0o644 },
        lines: [12, 13],
        temps: ['/etc/x/.y.dedalo-init.tmp'],
        remove: [{ spec: '/home/example\\.org/dedalo(/.*)?', type: 'usr_t' }],
        previousBool: undefined,
      }),
    ).toThrow("'previousBool'"); // anti-vacuity: one unknown key among good ones is still red
    expect(() => assertDetail('selinux.proxy_connect', { name: 'httpd_can_network_relay', value: true, previous: false })).not.toThrow();
    expect(() => assertDetail('home.root', { path: '/home/example.org', previous: { uid: 1001, gid: 1001, mode: 0o700 } })).not.toThrow();
  });

  test('every DETAIL_KEYS shape has a check (no key is admitted unchecked)', () => {
    for (const [key, shape] of Object.entries(DETAIL_KEYS)) {
      expect(() => assertDetail('x', { [key]: Symbol('bad') as unknown })).toThrow(`must be a ${shape} value`);
    }
  });
});

describe('secret-bearing files are journaled as metadata only', () => {
  test('a sha beside v2.env, the v1 config, the token or their temps is refused', () => {
    for (const path of [
      '/home/example.org/dedalo/publication_api/v2/shared/v2.env',
      '/home/example.org/dedalo/publication_api/v1/shared/server_config_api.php',
      '/etc/dedalo_publication_host/test/credentials/SERVICE_TOKEN',
      '/home/example.org/dedalo/publication_api/v2/shared/.v2.env.dedalo-init.tmp',
    ]) {
      expect(isSecretFile(path)).toBe(true);
      expect(() => assertDetail('provision.apply', { path, sha: SHA })).toThrow('secret-bearing');
      expect(() => assertDetail('provision.apply', { temps: [path], digest: SHA })).toThrow('secret-bearing');
    }
  });

  test('an api_config.* record never carries a sha, whatever the path', () => {
    expect(() => assertDetail('api_config.v2_env', { path: '/elsewhere/file', afterSha: SHA })).toThrow('metadata only');
    expect(() => assertDetail('api_config.v1_config', { path: '/x/server_config_api.php', exists: true, uid: 33, gid: 0, mode: 0o400 })).not.toThrow();
  });

  test('a non-secret file may be digested', () => {
    expect(isSecretFile('/etc/apache2/sites-available/example.conf')).toBe(false);
    expect(() => assertDetail('web.vhost.x', { target: '/etc/apache2/sites-available/example.conf', beforeSha: SHA })).not.toThrow();
    expect(SECRET_FILE_BASENAMES).toEqual(['v2.env', 'server_config_api.php', 'SERVICE_TOKEN']);
  });
});

describe('decodeJournal', () => {
  const lines = [record(1, 'a', 'begin'), record(2, 'a', 'done'), record(3, 'b', 'begin')].map(encodeRecord).join('');

  test('round-trips what encodeRecord wrote', () => {
    const decoded = decodeJournal(lines);
    expect(decoded.tornTail).toBe(false);
    expect(decoded.records.map(r => `${r.seq}${r.item}${r.phase}`)).toEqual(['1abegin', '2adone', '3bbegin']);
    expect(decodeJournal('')).toEqual({ records: [], tornTail: false });
  });

  test('a torn LAST line (died mid-write) is dropped and reported', () => {
    const decoded = decodeJournal(`${lines}{"v":1,"seq":4,"at`);
    expect(decoded.tornTail).toBe(true);
    expect(decoded.records).toHaveLength(3);
  });

  test('a damaged middle line, a foreign key set, a bad record or a backwards seq is a refusal', () => {
    const [one, two] = lines.split('\n');
    expect(() => decodeJournal(`${one}\nnot json\n${two}\n`)).toThrow('line 2 is not JSON');
    expect(() => decodeJournal('[1]\n')).toThrow('not an object');
    expect(() => decodeJournal('{"v":1}\n')).toThrow('has keys');
    expect(() => decodeJournal(`${JSON.stringify({ ...record(1, 'a', 'done'), detail: { secret: 'x' } })}\n`)).toThrow(JournalFormatError);
    expect(() => decodeJournal(`${two}\n${one}\n`)).toThrow('does not follow');
  });
});

describe('unfinished', () => {
  test('per item, a last record that is a begin; a later run closes an earlier begin', () => {
    const records = [
      record(1, 'code.install', 'begin'),
      record(2, 'home.root', 'begin'),
      record(3, 'home.root', 'done'),
      record(4, 'web.vhost.x', 'begin'),
      { ...record(5, 'code.install', 'rolled_back'), run: 'fedcba9876543210' },
      record(6, 'web.vhost.x', 'begin'),
    ];
    expect(unfinished(records).map(r => r.seq)).toEqual([6]);
    expect(unfinished(records.slice(0, 2)).map(r => r.item)).toEqual(['code.install', 'home.root']);
    expect(nextSeq(records)).toBe(7);
    expect(nextSeq([])).toBe(1);
    expect(TERMINAL_PHASES).not.toContain('begin');
  });
});
