/**
 * The web-config transaction (src/rules/txn.ts), driven directly — the module rules.apply and
 * root's host-map renderer share. Seam: a scratch directory under .test-tmp/ and a scripted
 * TxnExec that records the ORDER of calls and the live file's bytes at configtest time, so
 * "configtest ran against the new file" and "a failed configtest never reloads" are observed.
 * tests/rules_apply.test.ts keeps its cases through the same module.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExecResult } from '../src/provision/exec_contract';
import { configtestLine, RELOAD_ACTIVE_POLL, runTxn, type TxnExec, type TxnOptions, txnOutput, txnPaths } from '../src/rules/txn';
import { scratchPath } from './fixtures/instance';

const DIR = scratchPath('rules_txn');
const LIVE = join(DIR, 'live.conf');
const paths = txnPaths(DIR, LIVE);
const OPTIONS: TxnOptions = { fileMode: 0o644, dirMode: 0o755, marker: 'h1' };
const A = Buffer.from('a\n');
const B = Buffer.from('b\n');
const C = Buffer.from('c\n');

interface Fake extends TxnExec {
  calls: string[];
  seen: (string | null)[];
}

function fake(script: { configtest?: number[]; reload?: number[]; active?: boolean[]; throws?: boolean; poll?: boolean } = {}): Fake {
  const configtest = [...(script.configtest ?? [])];
  const reload = [...(script.reload ?? [])];
  const active = [...(script.active ?? [])];
  const state: Fake = {
    calls: [],
    seen: [],
    async webConfigtest(): Promise<ExecResult> {
      state.calls.push('configtest');
      state.seen.push(existsSync(LIVE) ? readFileSync(LIVE, 'utf8') : null);
      if (script.throws) throw new Error('spawn ENOENT');
      const code = configtest.shift() ?? 0;
      return { code, stdout: '', stderr: code === 0 ? 'ok' : `nginx: [emerg] bad in ${LIVE}:3` };
    },
    async webReload(): Promise<ExecResult> {
      state.calls.push('reload');
      return { code: reload.shift() ?? 0, stdout: '', stderr: '' };
    },
  };
  if (script.poll !== false && script.active !== undefined) {
    state.webActive = async () => {
      state.calls.push('active');
      return active.shift() ?? true;
    };
  }
  return state;
}

const text = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : null);

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
});
afterEach(() => rmSync(DIR, { recursive: true, force: true }));

describe('runTxn', () => {
  test('creates the directory, writes the exact mode, configtests the NEW file, reloads, clears the marker', async () => {
    const exec = fake();
    expect(await runTxn(paths, A, exec, OPTIONS)).toEqual({ result: 'applied', replaced: false });
    expect(exec.calls).toEqual(['configtest', 'reload']);
    expect(exec.seen).toEqual(['a\n']);
    expect(statSync(DIR).isDirectory()).toBe(true);
    expect(statSync(LIVE).mode & 0o777).toBe(0o644);
    for (const companion of [paths.next, paths.prev, paths.pending, paths.restore]) expect(existsSync(companion)).toBe(false);
  });

  test('the file mode is the caller\'s (the agent include 0640)', async () => {
    await runTxn(paths, A, fake(), { ...OPTIONS, fileMode: 0o640 });
    expect(statSync(LIVE).mode & 0o777).toBe(0o640);
  });

  test('a replacing run keeps the loaded file as .prev', async () => {
    await runTxn(paths, A, fake(), OPTIONS);
    expect(await runTxn(paths, B, fake(), OPTIONS)).toEqual({ result: 'applied', replaced: true });
    expect(text(LIVE)).toBe('b\n');
    expect(text(paths.prev)).toBe('a\n');
  });

  test('identical bytes and no marker: unchanged, no configtest, no write', async () => {
    await runTxn(paths, A, fake(), OPTIONS);
    const mtime = statSync(LIVE).mtimeMs;
    const exec = fake();
    expect(await runTxn(paths, A, exec, OPTIONS)).toEqual({ result: 'unchanged' });
    expect(exec.calls).toEqual([]);
    expect(statSync(LIVE).mtimeMs).toBe(mtime);
  });

  test('configtest failure with a previous file: restored byte for byte, re-tested, never reloaded', async () => {
    await runTxn(paths, A, fake(), OPTIONS);
    const exec = fake({ configtest: [1, 0] });
    const outcome = await runTxn(paths, B, exec, OPTIONS);
    expect(outcome).toMatchObject({ result: 'configtest_failed', restored: 'previous', configtest: { code: 1 }, after: { code: 0 } });
    expect(exec.calls).toEqual(['configtest', 'configtest']);
    expect(exec.seen).toEqual(['b\n', 'a\n']);
    expect(text(LIVE)).toBe('a\n');
    expect(existsSync(paths.pending)).toBe(false);
  });

  test('configtest failure without a previous file removes it', async () => {
    const outcome = await runTxn(paths, A, fake({ configtest: [1, 0] }), OPTIONS);
    expect(outcome).toMatchObject({ result: 'configtest_failed', restored: 'removed' });
    expect(existsSync(LIVE)).toBe(false);
  });

  test('a configtest that cannot spawn is exit -1 and still restores', async () => {
    const outcome = await runTxn(paths, A, fake({ throws: true }), OPTIONS);
    expect(outcome).toMatchObject({ result: 'configtest_failed', restored: 'removed', configtest: { code: -1 } });
    expect(existsSync(LIVE)).toBe(false);
  });

  test('reload failure keeps the new file and the marker; a later identical run completes without a write', async () => {
    await runTxn(paths, A, fake(), OPTIONS);
    const outcome = await runTxn(paths, B, fake({ reload: [1] }), OPTIONS);
    expect(outcome).toMatchObject({ result: 'reload_failed', reload: { code: 1 }, active: null });
    expect(text(LIVE)).toBe('b\n');
    expect(text(paths.pending)).toBe('h1\n');
    const mtime = statSync(LIVE).mtimeMs;
    const retry = fake();
    expect(await runTxn(paths, B, retry, OPTIONS)).toEqual({ result: 'applied', replaced: true });
    expect(retry.calls).toEqual(['configtest', 'reload']);
    expect(statSync(LIVE).mtimeMs).toBe(mtime);
    expect(text(paths.prev)).toBe('a\n'); // the LOADED file, not the never-loaded B
  });

  test('after a failed reload, a different failing run restores the LOADED file, not the pending one', async () => {
    await runTxn(paths, A, fake(), OPTIONS);
    await runTxn(paths, B, fake({ reload: [1] }), OPTIONS);
    const outcome = await runTxn(paths, C, fake({ configtest: [1, 0] }), OPTIONS);
    expect(outcome).toMatchObject({ result: 'configtest_failed', restored: 'previous' });
    expect(text(LIVE)).toBe('a\n');
  });

  test('the active poll: a server down after a reload that returned 0 is reload_failed (active false), marker kept', async () => {
    const exec = fake({ active: [false] });
    const outcome = await runTxn(paths, A, exec, OPTIONS);
    expect(outcome).toMatchObject({ result: 'reload_failed', reload: { code: 0 }, active: false });
    expect(exec.calls).toEqual(['configtest', 'reload', 'active']);
    expect(existsSync(paths.pending)).toBe(true);
    const up = fake({ active: [true] });
    expect(await runTxn(paths, A, up, OPTIONS)).toEqual({ result: 'applied', replaced: false });
    expect(up.calls).toEqual(['configtest', 'reload', 'active']);
  });

  /** A renderer-shaped exec: the poll sleeps (RELOAD_ACTIVE_POLL) and nginx can be restarted. */
  const rendererShaped = (script: { configtest?: number[]; active?: boolean[]; restart?: number[] }): Fake & { slept: number } => {
    const exec = fake({ configtest: script.configtest, active: script.active ?? [] }) as Fake & { slept: number };
    const restart = [...(script.restart ?? [])];
    exec.slept = 0;
    exec.sleep = async (ms: number) => {
      exec.slept += ms;
    };
    exec.webRestart = async () => {
      exec.calls.push('restart');
      exec.seen.push(text(LIVE));
      return { code: restart.shift() ?? 0, stdout: '', stderr: '' };
    };
    return exec;
  };

  test('B2: the poll watches the whole RELOAD_ACTIVE_POLL window when the caller can sleep', async () => {
    const exec = rendererShaped({});
    expect(await runTxn(paths, A, exec, OPTIONS)).toEqual({ result: 'applied', replaced: false });
    expect(exec.calls.filter(c => c === 'active').length).toBe(RELOAD_ACTIVE_POLL.count + 1);
    expect(exec.slept).toBe(RELOAD_ACTIVE_POLL.count * RELOAD_ACTIVE_POLL.intervalMs);
    // A master that dies a moment AFTER the reload returned is caught on a later check.
    const late = rendererShaped({ active: [true, true, true, false] });
    await runTxn(paths, B, late, OPTIONS);
    expect(late.calls.filter(c => c === 'active').length).toBeGreaterThanOrEqual(4);
    expect(late.calls).toContain('restart');
  });

  test('B2: nginx down after a reload that returned 0 → restore the LOADED file, configtest, restart, confirm, marker cleared', async () => {
    await runTxn(paths, A, fake(), OPTIONS);
    const exec = rendererShaped({ active: [false] });
    const outcome = await runTxn(paths, B, exec, OPTIONS);
    expect(outcome).toMatchObject({
      result: 'reload_failed',
      active: false,
      rollback: { restored: 'previous', configtest: { code: 0 }, restart: { code: 0 }, active: true },
    });
    expect(exec.calls).toEqual(['configtest', 'reload', 'active', 'configtest', 'restart', 'active']);
    // configtest and restart ran on the restored bytes, not the ones that killed the master.
    expect(exec.seen).toEqual(['b\n', 'a\n', 'a\n']);
    expect(text(LIVE)).toBe('a\n');
    expect(existsSync(paths.pending)).toBe(false);
    expect(existsSync(paths.restore)).toBe(false);
  });

  test('B2: a first file (nothing loaded before) is removed; a failed restart or a restored file failing configtest keeps the marker', async () => {
    const first = rendererShaped({ active: [false] });
    expect(await runTxn(paths, A, first, OPTIONS)).toMatchObject({ rollback: { restored: 'removed', active: true } });
    expect(existsSync(LIVE)).toBe(false);
    await runTxn(paths, A, fake(), OPTIONS);
    const noRestart = rendererShaped({ active: [false], restart: [1] });
    expect(await runTxn(paths, B, noRestart, OPTIONS)).toMatchObject({ rollback: { restored: 'previous', restart: { code: 1 }, active: false } });
    expect(existsSync(paths.pending)).toBe(true);
    expect(text(LIVE)).toBe('a\n');
    rmSync(DIR, { recursive: true, force: true });
    await runTxn(paths, A, fake(), OPTIONS);
    const badRestore = rendererShaped({ configtest: [0, 1], active: [false] });
    expect(await runTxn(paths, C, badRestore, OPTIONS)).toMatchObject({ rollback: { configtest: { code: 1 }, restart: null, active: false } });
    expect(badRestore.calls).not.toContain('restart');
    expect(existsSync(paths.pending)).toBe(true);
  });

  test('B2: without webRestart (the agent) a server found down keeps the new file and the marker, as before', async () => {
    await runTxn(paths, A, fake(), OPTIONS);
    const outcome = await runTxn(paths, B, fake({ active: [false] }), OPTIONS);
    expect(outcome).toEqual({ result: 'reload_failed', configtest: expect.anything(), reload: expect.anything(), active: false });
    expect(text(LIVE)).toBe('b\n');
  });

  test('a pre-existing stale .new or a foreign-mode file is replaced at the exact mode', async () => {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(paths.next, 'stale', { mode: 0o666 });
    writeFileSync(LIVE, 'old', { mode: 0o666 });
    await runTxn(paths, A, fake(), OPTIONS);
    expect(statSync(LIVE).mode & 0o777).toBe(0o644);
    expect(statSync(paths.prev).mode & 0o777).toBe(0o644);
    expect(text(paths.prev)).toBe('old');
  });
});

describe('configtestLine / txnOutput', () => {
  test('reads the line only when the message names the live file', () => {
    expect(configtestLine({ code: 1, stdout: '', stderr: `AH00526: Syntax error on line 7 of ${LIVE}:` }, LIVE)).toBe(7);
    expect(configtestLine({ code: 1, stdout: '', stderr: `nginx: [emerg] x in ${LIVE}:12` }, LIVE)).toBe(12);
    expect(configtestLine({ code: 1, stdout: '', stderr: 'nginx: [emerg] x in /etc/nginx/other.conf:12' }, LIVE)).toBeNull();
  });
  test('output keeps the tail', () => {
    expect(txnOutput({ code: 0, stdout: 'ab', stderr: 'cd' }, 3)).toBe('bcd');
  });
});
