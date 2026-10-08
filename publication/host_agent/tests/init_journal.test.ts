/**
 * init/journal.ts on a REAL directory (seam: scratch under .test-tmp is the trust root, this
 * uid is "root"). Appends are whole lines through O_APPEND + fsync; the file is 0600; a reopen
 * continues the sequence and sees the open begins; a torn tail (the writer died mid-line) is
 * dropped by rewriting the file whole on the next append; the closed detail grammar refuses a
 * secret before a byte is written.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { appendFileSync, chmodSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProvisionExec } from '../src/provision/exec_contract';
import { initHostIo } from '../src/provision/init/host_io';
import { JOURNAL_NAME, newRunId, openJournal } from '../src/provision/init/journal';
import { decodeJournal } from '../src/provision/init/journal_format';
import type { InitIo } from '../src/provision/init/types';
import { freshScratch } from './fixtures/instance';

const UID = process.getuid?.() ?? 0;
const GID = process.getgid?.() ?? 0;
const exec = { userId: () => UID } as unknown as ProvisionExec;
const NOW = () => new Date('2026-10-08T12:00:00.000Z');

let dir = '';
let io: InitIo;
beforeEach(async () => {
  dir = await freshScratch('ijrn');
  chmodSync(dir, 0o700);
  io = initHostIo(exec, { trustRoot: dir, rootUid: UID });
});

describe('openJournal', () => {
  test('appends begin/terminal records, 0600, readable back by the format', () => {
    const journal = openJournal(dir, io, { now: NOW, run: '00000000000000aa', uid: UID, gid: GID });
    expect(journal.path).toBe(join(dir, JOURNAL_NAME));
    expect(journal.peekSeq()).toBe(1);
    journal.append('home.root', 'begin', { path: '/home/example.org', uid: 0, gid: 0, mode: 0o755 });
    journal.append('home.root', 'done', { path: '/home/example.org', previous: { uid: 1001, gid: 1001, mode: 0o700 } });
    journal.append('code.install', 'begin', { dst: '/home/example.org/host_agent' });
    expect(statSync(journal.path).mode & 0o777).toBe(0o600);
    const decoded = decodeJournal(readFileSync(journal.path, 'utf8'));
    expect(decoded.records.map(r => `${r.seq}:${r.item}:${r.phase}`)).toEqual(['1:home.root:begin', '2:home.root:done', '3:code.install:begin']);
    expect(journal.unfinished().map(r => r.item)).toEqual(['code.install']);
    expect(journal.records()).toHaveLength(3);
    expect(journal.openUnfinished).toEqual([]);
  });

  test('a reopen continues the sequence under a new run id and sees what was left open', () => {
    const first = openJournal(dir, io, { now: NOW, run: '00000000000000aa', uid: UID, gid: GID });
    first.append('code.install', 'begin', { dst: '/opt/x' });
    const second = openJournal(dir, io, { now: NOW, uid: UID, gid: GID });
    expect(second.run).toMatch(/^[0-9a-f]{16}$/);
    expect(second.run).not.toBe(first.run);
    expect(second.openUnfinished.map(r => r.item)).toEqual(['code.install']);
    const closed = second.append('code.install', 'rolled_back', { resumed: true });
    expect(closed.seq).toBe(2);
    expect(second.unfinished()).toEqual([]);
    expect(newRunId()).toMatch(/^[0-9a-f]{16}$/);
  });

  test('a torn tail is dropped: the next append rewrites the file whole, atomically', () => {
    const journal = openJournal(dir, io, { now: NOW, run: '00000000000000aa', uid: UID, gid: GID });
    journal.append('a', 'begin');
    appendFileSync(journal.path, '{"v":1,"seq":2,"at"'); // the writer died mid-line
    const reopened = openJournal(dir, io, { now: NOW, run: '00000000000000bb', uid: UID, gid: GID });
    expect(reopened.tornTail).toBe(true);
    reopened.append('a', 'failed', { reason: 'resumed after a crash' });
    reopened.append('b', 'begin');
    const text = readFileSync(journal.path, 'utf8');
    const decoded = decodeJournal(text);
    expect(decoded.tornTail).toBe(false);
    expect(decoded.records.map(r => r.seq)).toEqual([1, 2, 3]);
    expect(statSync(journal.path).mode & 0o777).toBe(0o600);
  });

  test('a corrupt middle line is a refusal — someone else wrote root’s file', () => {
    writeFileSync(join(dir, JOURNAL_NAME), 'garbage\n{"v":1}\n');
    expect(() => openJournal(dir, io, { now: NOW })).toThrow('line 1 is not JSON');
  });

  test('MUTATION: a secret-bearing detail is refused before anything is appended', () => {
    const journal = openJournal(dir, io, { now: NOW, run: '00000000000000aa', uid: UID, gid: GID });
    journal.append('api_config.v2_env', 'begin', { path: '/srv/x/v2/shared/v2.env', exists: false });
    expect(() => journal.append('api_config.v2_env', 'done', { path: '/srv/x/v2/shared/v2.env', sha: 'a'.repeat(64) })).toThrow('metadata only');
    expect(() => journal.append('api_config.v2_env', 'done', { password: 'x' })).toThrow('not journalable');
    expect(readFileSync(journal.path, 'utf8').trim().split('\n')).toHaveLength(1);
    expect(journal.records()).toHaveLength(1);
  });
});
