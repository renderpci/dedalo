/**
 * THE STAND-IN FOR PID 1 IS ITSELF GATED (LEAD-1b harness self-test).
 *
 * The LEAD-1b daemon gates (`lead1b_c4_lease.gate.ts`, `lead1b_c4_daemon.gate.ts`) run the
 * REAL `runConfined()` against `support/lead1b_host.ts`. A stand-in that silently stopped
 * enforcing MaxConnections=1, or reported a dead unit as alive, would turn those gates into
 * decoration — a lease gate passing because the host it was asked about cannot say no. So
 * the stand-in's own PID 1 semantics are asserted here, on every run, independent of the
 * daemon: this file is green on every HEAD, the pre-LEAD-1b one included.
 *
 * What it pins (spec §1 "Verified facts", §2.2): one live instance per socket, a connection
 * over the limit accepted and DROPPED, the slot released only when the instance is dead, the
 * `<nr>-<pid>-<uid>` instance form, a stubborn unit surviving `stop` until reaped, and the
 * frame order H → (S) → O/E → X.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import type { Socket } from 'node:net';
import { sweepScratch } from './support/lead1b_contract';
import { frame, type GatePolicy, json, lead1bPolicy, socketPathFor, type WireFrame, WireReader, waitUntil } from './support/lead1b_host';

const hosts: GatePolicy[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.standIn.close();
  sweepScratch();
});

async function hostOf(entries: Array<[string, number]>): Promise<GatePolicy> {
  const host = await lead1bPolicy({ identities: new Map(entries) });
  hosts.push(host);
  return host;
}

const SPEC = { v: 1, door: 'git', argv: ['git', 'status'], env: {}, hostNetns: 'net:[1]' };

/** Play the daemon's side once: connect, read H, send S. */
async function talk(host: GatePolicy, k: number, spec: object = SPEC): Promise<{ sock: Socket; frames: WireFrame[]; closed: Promise<void> }> {
  const sock = await host.standIn.connect(socketPathFor(host.agentSocketDir, k, 'git'));
  const reader = new WireReader();
  const frames: WireFrame[] = [];
  sock.on('data', chunk => frames.push(...reader.push(chunk as Buffer)));
  sock.on('error', () => {});
  const closed = new Promise<void>(resolve => sock.once('close', () => resolve()));
  await waitUntil(() => frames.length >= 1 || sock.destroyed, 2_000, 'a hello or a drop');
  if (frames.length > 0) sock.write(frame('S', spec));
  return { sock, frames, closed };
}

describe('the stand-in plays PID 1 and the shim faithfully', () => {
  test('H → S → O, E, X; the instance name is <nr>-<pid>-<uid>; the unit dies with its connection and the slot frees', async () => {
    const host = await hostOf([['alpha', 1]]);
    host.standIn.script = () => ({ kind: 'exit', code: 4, stdout: 'out', stderr: 'err' });
    const run = await talk(host, 1);
    await run.closed;
    expect(run.frames.map(each => each.type)).toEqual(['H', 'O', 'E', 'X']);
    expect(json(run.frames[0] as WireFrame).unit).toMatch(/^dedalo-site-test-agent-s1-git@\d+-\d+-\d+\.service$/);
    expect(json(run.frames[3] as WireFrame).code).toBe(4);
    await waitUntil(() => host.standIn.live(1, 'git').length === 0, 1_000, 'the unit to die');
    const show = await host.standIn.systemctl(['show', '-p', 'NConnections', '--value', 'dedalo-site-test-agent-s1-git.socket']);
    expect(show.stdout).toBe('0');
  });

  test('MaxConnections=1: a second connection while the first lives is dropped; list-units / show / stop answer as PID 1', async () => {
    const host = await hostOf([['alpha', 1]]);
    host.standIn.script = () => ({ kind: 'hang' });
    const first = await talk(host, 1);
    await waitUntil(() => host.standIn.specs.length === 1, 1_000, 'the first spec');
    const second = await talk(host, 1);
    await second.closed;
    expect({ frames: second.frames.length, dropped: host.standIn.log.some(line => line.startsWith('drop ')) }).toEqual({ frames: 0, dropped: true });
    const listed = await host.standIn.systemctl(['list-units', '--all', '--plain', '--no-legend', 'dedalo-site-test-agent-s1-*@*.service']);
    const names = listed.stdout.split('\n').filter(Boolean).map(line => line.split(' ')[0] as string);
    expect(names.length).toBe(1);
    const state = await host.standIn.systemctl(['show', '-p', 'ActiveState,LoadState', names[0] as string]);
    expect(state.stdout).toBe('ActiveState=active\nLoadState=loaded');
    await host.standIn.systemctl(['stop', names[0] as string]);
    await first.closed;
    expect(host.standIn.live(1, 'git').length).toBe(0);
    const unknown = await host.standIn.systemctl(['show', '-p', 'LoadState', 'dedalo-site-test-agent-s1-git@9-9-9.service']);
    expect(unknown.stdout).toBe('LoadState=not-found');
    const refused = await host.standIn.systemctl(['start', names[0] as string]);
    expect(refused.code).not.toBe(0);
  });

  test('a stubborn unit survives stop and its connection until reaped; a planted leftover holds its socket', async () => {
    const host = await hostOf([['alpha', 1]]);
    const planted = host.standIn.plantLive(1, 'build', { stubborn: true });
    await host.standIn.systemctl(['stop', planted.name]);
    expect(host.standIn.live(1, 'build').length).toBe(1);
    host.standIn.reap(planted);
    expect(host.standIn.live(1, 'build').length).toBe(0);
    host.standIn.stubborn = true;
    const run = await talk(host, 1);
    await run.closed;
    expect(host.standIn.live(1, 'git').length).toBe(1);
    host.standIn.reap();
    expect(host.standIn.live(1, 'git').length).toBe(0);
  });

  test('EOF before H (a unit that never started) and no X (a unit that died mid-run) are what they say', async () => {
    const host = await hostOf([['alpha', 1]]);
    host.standIn.script = () => ({ kind: 'refuse' });
    const refused = await talk(host, 1);
    await refused.closed;
    expect(refused.frames).toEqual([]);
    host.standIn.script = () => ({ kind: 'noExit', stdout: 'partial' });
    const cut = await talk(host, 1);
    await cut.closed;
    expect(cut.frames.map(each => each.type)).toEqual(['H', 'O']);
  });
});
