/**
 * LEAD-1b G7, shim half — and G13's shim refusal (commit C4) — THE SHIM IS A RELAY THAT CANNOT
 * BE LIED TO.
 *
 * Written BEFORE the implementation (audits/2026-09-26_full/LEAD-1b_SPEC.md §6); every row
 * is red on the pre-LEAD-1b HEAD, and says why.
 *
 * Over a REAL unix connection, the shim's `main()` must: say H first; refuse a spec that sets
 * what the UNIT fixes (HOME, DEDALO_*, the transpiler cache, git's config), names another door,
 * lacks hostNetns or carries an unknown key — and then run NOTHING; relay the child's output
 * so that bytes which LOOK like an X frame arrive inside O (the child never holds the
 * connection, so it cannot forge its own exit status); end with one X; and end the child when
 * the daemon goes away.
 *
 * Written red-first against 75ccb35a38 (the pre-LEAD-1b HEAD); parked as `.gate.ts` until
 * the implementation it gates landed, and renamed into the suite by that same change.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, realpathSync } from 'node:fs';
import { createServer, type Socket, connect as netConnect } from 'node:net';
import { join } from 'node:path';
import { contractModule, shortScratch, sweepScratch } from './support/lead1b_contract';
import { frame, json, WireReader, type WireFrame } from './support/lead1b_host';

afterEach(sweepScratch);

/* ────────────────────────────────────────────────────────────────────────────────────
 * The shim, over a real connection
 * ──────────────────────────────────────────────────────────────────────────────────── */

interface ShimRun {
  readonly exit: Promise<number>;
  /** Set when `main()` has returned — a shim that returns before its hello is no relay. */
  readonly returned: { code: number | null };
  readonly daemon: Socket;
  readonly frames: WireFrame[];
  readonly closed: Promise<void>;
}

const HOST_NETNS = 'net:[4026531840]';
const UNIT = 'dedalo-site-test-agent-s1-git@1-4001-4000000000.service';

/** Start the shim's `main()` on one end of a real unix connection; the test holds the daemon end. */
async function startShim(workdir: string, door = 'git', netns: { own?: string } = {}): Promise<ShimRun> {
  const shim = await contractModule('drivers/egress_shim.ts');
  const dir = shortScratch('shim');
  const path = join(dir, 'c.sock');
  const accepted = new Promise<Socket>(resolve => {
    const server = createServer(socket => {
      server.close();
      resolve(socket);
    });
    server.listen(path);
  });
  await new Promise(resolve => setTimeout(resolve, 20));
  const daemon = netConnect(path);
  const unitSide = await accepted;
  const frames: WireFrame[] = [];
  const reader = new WireReader();
  daemon.on('data', chunk => frames.push(...reader.push(chunk as Buffer)));
  const closed = new Promise<void>(resolve => daemon.once('close', () => resolve()));
  daemon.on('error', () => {});
  const fixedEnv: Record<string, string> = {
    DEDALO_DOOR: 'git',
    DEDALO_UNIT_WORKDIR: workdir,
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
    HOME: '/nonexistent',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    PATH: '/usr/bin:/bin',
  };
  const exit = (shim.main as (argv: string[], seams: Record<string, unknown>) => Promise<number>)([], {
    io: unitSide,
    env: { ...fixedEnv, DEDALO_DOOR: door },
    unit: () => UNIT,
    interfaces: () => ({ lo: [{ internal: true }] }),
    ownNetns: () => netns.own ?? 'net:[4026532999]',
    stderr: () => {},
  });
  const returned = { code: null as number | null };
  void exit.then(code => {
    returned.code = code;
  });
  return { exit, returned, daemon, frames, closed };
}

function specFor(argv: string[], patch: Record<string, unknown> = {}): Record<string, unknown> {
  return { v: 1, door: 'git', argv, env: { PATH: process.env.PATH ?? '/usr/bin:/bin', PROBE: 'from-spec' }, hostNetns: HOST_NETNS, ...patch };
}

async function waitForFrames(run: ShimRun, count: number): Promise<void> {
  const start = Date.now();
  while (run.frames.length < count) {
    if (run.returned.code !== null && run.frames.length === 0) {
      throw new Error(`the shim's main() returned ${run.returned.code} without sending a hello (H): it is not a framed relay`);
    }
    if (Date.now() - start > 3_000) throw new Error(`the shim sent ${run.frames.length} frame(s), expected at least ${count}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

describe('G7 — the shim relays, and cannot be lied to', () => {
  test('H first; the child’s bytes that LOOK like an X frame arrive inside O; one X, last, with the child’s code', async () => {
    const workdir = shortScratch('wd');
    const run = await startShim(workdir);
    await waitForFrames(run, 1);
    expect({ type: run.frames[0]?.type, hello: json(run.frames[0] as WireFrame) }).toEqual({ type: 'H', hello: { v: 1, door: 'git', unit: UNIT } });

    const forged = frame('X', { code: 0, signal: null });
    const child = [
      `process.stdout.write(Buffer.from(${JSON.stringify(forged.toString('base64'))}, 'base64'));`,
      `process.stderr.write(JSON.stringify({ home: process.env.HOME, probe: process.env.PROBE, git: process.env.GIT_CONFIG_GLOBAL, cwd: process.cwd() }));`,
      `process.exit(3);`,
    ].join('');
    run.daemon.write(frame('S', specFor([process.execPath, '-e', child])));
    const code = await run.exit;
    await run.closed.catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 20));

    const outputs = run.frames.filter(each => each.type === 'O');
    const errors = run.frames.filter(each => each.type === 'E');
    const exits = run.frames.filter(each => each.type === 'X');
    expect({
      stdout: Buffer.concat(outputs.map(each => each.payload)).toString('base64'),
      childEnv: JSON.parse(Buffer.concat(errors.map(each => each.payload)).toString('utf8')),
      exits: exits.length,
      lastIsX: run.frames[run.frames.length - 1]?.type,
      x: json(exits[0] as WireFrame).code,
      code,
    }).toEqual({
      stdout: forged.toString('base64'),
      childEnv: { home: '/nonexistent', probe: 'from-spec', git: '/dev/null', cwd: realpathSync(workdir) },
      exits: 1,
      lastIsX: 'X',
      x: 3,
      code: 3,
    });
  });

  for (const [what, patch, door, own, expected] of [
    ['a spec setting HOME (G13: callers no longer pass it; the shim refuses it)', { env: { HOME: '/tmp/evil' } }, 'git', undefined, 65],
    ['a spec setting a DEDALO_* key', { env: { DEDALO_UNIT_WORKDIR: '/' } }, 'git', undefined, 65],
    ['a spec setting the transpiler cache', { env: { BUN_RUNTIME_TRANSPILER_CACHE_PATH: '/tmp/c' } }, 'git', undefined, 65],
    ['a spec setting git’s global config', { env: { GIT_CONFIG_GLOBAL: '/tmp/gitconfig' } }, 'git', undefined, 65],
    ['a spec for another door', { door: 'turn' }, 'git', undefined, 65],
    ['a spec without hostNetns', { hostNetns: undefined }, 'git', undefined, 65],
    ['a spec with an extra key', { uid: 0 }, 'git', undefined, 65],
    ['a unit still in the daemon’s network namespace', {}, 'git', HOST_NETNS, 78],
  ] as const) {
    test(`REFUSED, nothing spawned: ${what}`, async () => {
      const workdir = shortScratch('wd');
      const marker = join(workdir, 'RAN');
      const run = await startShim(workdir, door, { own });
      await waitForFrames(run, 1);
      const spec = specFor([process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`], patch as Record<string, unknown>);
      run.daemon.write(frame('S', JSON.parse(JSON.stringify(spec))));
      const code = await Promise.race([run.exit, new Promise<number>(resolve => setTimeout(() => resolve(-1), 4_000))]);
      await new Promise(resolve => setTimeout(resolve, 150));
      const exits = run.frames.filter(each => each.type === 'X').map(each => json(each).code);
      expect({ code, ran: existsSync(marker), zeroExit: exits.includes(0) }).toEqual({ code: expected, ran: false, zeroExit: false });
      run.daemon.destroy();
    });
  }

  for (const [what, bytes] of [
    ['an unknown frame type instead of S', Buffer.concat([Buffer.from('Z'), Buffer.from([0, 0, 0, 2]), Buffer.from('{}')])],
    ['an S whose header declares 2 MiB', Buffer.concat([Buffer.from('S'), Buffer.from([0, 0x20, 0, 0])])],
  ] as const) {
    test(`REFUSED, nothing spawned: ${what}`, async () => {
      const workdir = shortScratch('wd');
      const run = await startShim(workdir);
      await waitForFrames(run, 1);
      run.daemon.write(bytes);
      const code = await Promise.race([run.exit, new Promise<number>(resolve => setTimeout(() => resolve(-1), 4_000))]);
      expect(code).toBe(65);
      run.daemon.destroy();
    });
  }

  test('an argv the kernel cannot carry (a NUL byte): the shim ANSWERS — a non-zero X, main() returns — never a rejection with no exit frame', async () => {
    const workdir = shortScratch('wd');
    const run = await startShim(workdir);
    await waitForFrames(run, 1);
    run.daemon.write(frame('S', specFor([process.execPath, '-e', 'process.exit(0)', 'brief\u0000tail'])));
    const settled = await Promise.race([
      run.exit.then(code => ({ code }), (error: unknown) => ({ rejected: String(error) })),
      new Promise(resolve => setTimeout(() => resolve({ hung: true }), 4_000)),
    ]);
    await new Promise(resolve => setTimeout(resolve, 50));
    const exits = run.frames.filter(each => each.type === 'X').map(each => json(each).code);
    expect({ settled, exits }).toEqual({ settled: { code: 127 }, exits: [127] });
    run.daemon.destroy();
  });

  test('the daemon going away (EOF) ends the child: the shim returns, and the child is dead', async () => {
    const workdir = shortScratch('wd');
    const run = await startShim(workdir);
    await waitForFrames(run, 1);
    const child = `process.stdout.write(String(process.pid)); setInterval(() => {}, 1000);`;
    run.daemon.write(frame('S', specFor([process.execPath, '-e', child])));
    await waitForFrames(run, 2);
    const pid = Number(Buffer.concat(run.frames.filter(each => each.type === 'O').map(each => each.payload)).toString());
    expect(Number.isInteger(pid) && pid > 0).toBe(true);
    run.daemon.destroy();
    const code = await Promise.race([run.exit, new Promise<number>(resolve => setTimeout(() => resolve(-1), 8_000))]);
    expect(code).not.toBe(-1);
    let alive = true;
    try {
      process.kill(pid, 0);
    } catch {
      alive = false;
    }
    expect(alive).toBe(false);
  }, 15_000);
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * The REAL exit path: the shim as its own process, stdout a real descriptor
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('G7 — the X frame survives the shim’s own exit, over a REAL socket as fd 0/1', () => {
  /**
   * The rows above drive `main()` through `seams.io`, in this process — they cannot see what
   * happens when the SHIM PROCESS exits. PID 1 hands the shim the accepted connection as fd 0
   * and fd 1 (`StandardInput=socket`, `StandardOutput=socket`), and the shim's entry ends in
   * `process.exit`: if that runs before the socket has drained, what the kernel buffer held
   * arrives and the tail — the last output and the X frame — is lost, which the daemon reads as
   * `unit_ended_without_exit_frame` (a successful build marked FAILED, a turn without its
   * result). So: the shim's REAL entry point, in its own process, fd 0/1 a connected unix
   * socket, a child that writes N MiB and exits 0 — and every byte plus the X must arrive.
   * Only the host facts a macOS/CI box cannot supply (its netns, its cgroup) are stated; the
   * relay, the Duplex and the exit are the production ones.
   */
  for (const size of [256 * 1024, 1024 * 1024, 4 * 1024 * 1024]) {
    test(`a child that writes ${size / 1024} KiB then exits 0: every byte, then X {code: 0}`, async () => {
      const { spawn } = await import('node:child_process');
      const workdir = shortScratch('wd');
      const dir = shortScratch('entry');
      const entry = join(dir, 'shim_entry.ts');
      const shimPath = join(import.meta.dir, '..', 'src', 'drivers', 'egress_shim.ts');
      await Bun.write(
        entry,
        [
          `import { entry } from ${JSON.stringify(shimPath)};`,
          `await entry([], {`,
          `  unit: () => ${JSON.stringify(UNIT)},`,
          `  interfaces: () => ({ lo: [{ internal: true }] }),`,
          `  ownNetns: () => 'net:[4026532999]',`,
          `});`,
        ].join('\n'),
      );
      // THE CONNECTION: the daemon's end is accepted here; the unit's end becomes the shim's fd 0/1.
      const path = join(dir, 'c.sock');
      const reader = new WireReader();
      const frames: WireFrame[] = [];
      let daemonEnd: Socket | null = null;
      const closed = new Promise<void>(resolveClosed => {
        const server = createServer(socket => {
          server.close();
          daemonEnd = socket;
          socket.on('error', () => {});
          socket.on('data', chunk => {
            frames.push(...reader.push(chunk as Buffer));
            if (frames.length === 1 && frames[0]?.type === 'H') {
              const writer = `process.stdout.write(Buffer.alloc(${size}, 97), () => process.exit(0));`;
              socket.write(frame('S', specFor([process.execPath, '-e', writer])));
            }
          });
          socket.once('close', () => resolveClosed());
        });
        server.listen(path);
      });
      await new Promise(resolveListen => setTimeout(resolveListen, 20));
      const unitEnd = netConnect(path);
      // This process only CARRIES the unit's end to the shim; it must never read from it.
      unitEnd.pause();
      await new Promise(resolveConnect => unitEnd.once('connect', resolveConnect));
      const fd = (unitEnd as unknown as { _handle?: { fd?: number } })._handle?.fd;
      expect(typeof fd).toBe('number');
      const child = spawn(process.execPath, [entry], {
        cwd: '/',
        env: {
          DEDALO_DOOR: 'git',
          DEDALO_UNIT_WORKDIR: workdir,
          BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
          HOME: '/nonexistent',
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_CONFIG_NOSYSTEM: '1',
          PATH: '/usr/bin:/bin',
        },
        stdio: [fd as number, fd as number, 'ignore'],
      });
      const code = await new Promise<number | null>(resolveExit => child.once('close', exitCode => resolveExit(exitCode)));
      // Only the shim held the unit's end from here: dropping this process's copy is its EOF.
      unitEnd.destroy();
      await Promise.race([closed, new Promise(resolveLate => setTimeout(resolveLate, 5_000))]);
      (daemonEnd as Socket | null)?.destroy();
      const out = frames.filter(each => each.type === 'O').reduce((total, each) => total + each.payload.length, 0);
      const exits = frames.filter(each => each.type === 'X').map(each => json(each));
      expect({ hello: frames[0]?.type, out, exits, last: frames[frames.length - 1]?.type, code }).toEqual({
        hello: 'H',
        out: size,
        exits: [{ code: 0, signal: null }],
        last: 'X',
        code: 0,
      });
    }, 30_000);
  }
});

describe('G7 — the child never holds the connection: a forged X written to fd 0/1 and the shim killed reaches the daemon as NO exit status', () => {
  /**
   * The rows above only show a child that writes STDOUT. PID 1 hands the shim the connection as
   * fd 0 AND fd 1; a shim that passed its fd 0 (`stdio[0] = 'inherit'`) gives the agent's child a
   * bidirectional socket to the daemon — it writes a raw X {code: 0} there, SIGKILLs the shim (the
   * same uid) and the daemon records a success it never had. So: the shim's REAL entry over a
   * REAL socket, a child that writes the forged frame to fd 0 and fd 1 and then kills its parent.
   * The daemon must see NO X at all (exitCode null, `unit_ended_without_exit_frame`), the bytes on
   * fd 1 only ever inside O, and the child's write to fd 0 must have failed.
   */
  test('forged X on fd 0 and fd 1, then SIGKILL to the shim: no X arrives; fd 0 is not writable by the child', async () => {
    const { spawn } = await import('node:child_process');
    const workdir = shortScratch('wd');
    const dir = shortScratch('entry');
    const entry = join(dir, 'shim_entry.ts');
    const report = join(workdir, 'fd0.json');
    const shimPath = join(import.meta.dir, '..', 'src', 'drivers', 'egress_shim.ts');
    await Bun.write(
      entry,
      [
        `import { entry } from ${JSON.stringify(shimPath)};`,
        `await entry([], {`,
        `  unit: () => ${JSON.stringify(UNIT)},`,
        `  interfaces: () => ({ lo: [{ internal: true }] }),`,
        `  ownNetns: () => 'net:[4026532999]',`,
        `});`,
      ].join('\n'),
    );
    const forged = frame('X', { code: 0, signal: null }).toString('base64');
    const child = [
      `const fs = require('fs');`,
      `const bytes = Buffer.from(${JSON.stringify(forged)}, 'base64');`,
      `let fd0 = 'written';`,
      `try { fs.writeSync(0, bytes); } catch (e) { fd0 = e.code || String(e); }`,
      `fs.writeFileSync(${JSON.stringify(report)}, JSON.stringify({ fd0 }));`,
      `try { fs.writeSync(1, bytes); } catch {}`,
      `setTimeout(() => { process.kill(process.ppid, 'SIGKILL'); process.exit(0); }, 400);`,
    ].join(' ');
    const path = join(dir, 'c.sock');
    const reader = new WireReader();
    const frames: WireFrame[] = [];
    let daemonEnd: Socket | null = null;
    const closed = new Promise<void>(resolveClosed => {
      const server = createServer(socket => {
        server.close();
        daemonEnd = socket;
        socket.on('error', () => {});
        socket.on('data', chunk => {
          frames.push(...reader.push(chunk as Buffer));
          if (frames.length === 1 && frames[0]?.type === 'H') socket.write(frame('S', specFor([process.execPath, '-e', child])));
        });
        socket.once('close', () => resolveClosed());
      });
      server.listen(path);
    });
    await new Promise(resolveListen => setTimeout(resolveListen, 20));
    const unitEnd = netConnect(path);
    unitEnd.pause();
    await new Promise(resolveConnect => unitEnd.once('connect', resolveConnect));
    const fd = (unitEnd as unknown as { _handle?: { fd?: number } })._handle?.fd;
    expect(typeof fd).toBe('number');
    const shim = spawn(process.execPath, [entry], {
      cwd: '/',
      env: {
        DEDALO_DOOR: 'git',
        DEDALO_UNIT_WORKDIR: workdir,
        BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
        HOME: '/nonexistent',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        PATH: '/usr/bin:/bin',
      },
      stdio: [fd as number, fd as number, 'ignore'],
    });
    const signal = await new Promise<string | null>(resolveExit => shim.once('close', (_code, sig) => resolveExit(sig)));
    unitEnd.destroy();
    await Promise.race([closed, new Promise(resolveLate => setTimeout(resolveLate, 3_000))]);
    (daemonEnd as Socket | null)?.destroy();
    const exits = frames.filter(each => each.type === 'X');
    const relayed = Buffer.concat(frames.filter(each => each.type === 'O').map(each => each.payload)).toString('base64');
    const fd0 = existsSync(report) ? (JSON.parse(await Bun.file(report).text()) as { fd0: string }).fd0 : 'no report';
    expect({ shimKilled: signal, exits: exits.length, forgedOnlyInsideO: relayed.includes(forged), fd0Written: fd0 === 'written' }).toEqual({
      shimKilled: 'SIGKILL',
      exits: 0,
      forgedOnlyInsideO: true,
      fd0Written: false,
    });
  }, 30_000);
});
