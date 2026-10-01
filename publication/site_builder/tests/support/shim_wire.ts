/**
 * THE DAEMON'S SIDE OF ONE SHIM RUN, over a REAL unix connection (LEAD-1b).
 *
 * The shim (`src/drivers/egress_shim.ts`) no longer reads its argv off its own command line:
 * PID 1 hands it the accepted connection, it says hello (H), reads one spec (S), and relays
 * its child's output as O/E frames ending in one X. This helper plays the daemon: it accepts
 * the H, sends the spec it is given, and collects every frame until the shim hangs up — using
 * the stand-in's OWN codec (`lead1b_host.ts`, written from the spec, never the daemon's), so a
 * codec bug the two ends of the daemon share cannot pass as agreement.
 */

import { createServer, connect as netConnect, type Socket } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { frame, json, type WireFrame, WireReader } from './lead1b_host';

export const HOST_NETNS = 'net:[4026531840]';
export const OTHER_NETNS = 'net:[4026532999]';

export interface ShimRunOptions {
  readonly argv: readonly string[];
  /** The unit's door (its `DEDALO_DOOR`). */
  readonly door?: 'turn' | 'build' | 'git';
  /** The unit's `DEDALO_UNIT_WORKDIR`. */
  readonly workdir: string;
  /** The spec's environment (default: a PATH). */
  readonly env?: Record<string, string>;
  /** The daemon's namespace identity the spec carries (default HOST_NETNS; null = omitted). */
  readonly hostNetns?: string | null;
  /** Extra seams for `main()` (interfaces, ownNetns, socketDir, ports, stderr…). */
  readonly seams?: Record<string, unknown>;
  /** The unit's fixed environment beyond the door and workdir (default: none). */
  readonly unitEnv?: Record<string, string>;
}

export interface ShimRunResult {
  readonly code: number;
  readonly frames: WireFrame[];
  readonly stdout: string;
  readonly stderr: string;
  readonly exit: { code: number | null; signal: string | null } | null;
}

/** Start the shim over a real connection, play the daemon, and wait for both ends to finish. */
export async function runShim(options: ShimRunOptions): Promise<ShimRunResult> {
  const shim = (await import('../../src/drivers/egress_shim')) as {
    main(argv: string[], seams: Record<string, unknown>): Promise<number>;
  };
  const dir = mkdtempSync(join('/tmp', 'shw-'));
  try {
    const path = join(dir, 'c.sock');
    const accepted = new Promise<Socket>(resolve => {
      const server = createServer(socket => {
        server.close();
        resolve(socket);
      });
      server.listen(path);
    });
    await new Promise(resolve => setTimeout(resolve, 10));
    const daemon = netConnect(path);
    const unitSide = await accepted;
    daemon.on('error', () => {});
    const frames: WireFrame[] = [];
    const reader = new WireReader();
    let specSent = false;
    const door = options.door ?? 'git';
    const closed = new Promise<void>(resolve => daemon.once('close', () => resolve()));
    daemon.on('data', chunk => {
      frames.push(...reader.push(chunk as Buffer));
      if (!specSent && frames.some(each => each.type === 'H')) {
        specSent = true;
        const spec: Record<string, unknown> = {
          v: 1,
          door,
          argv: [...options.argv],
          env: options.env ?? { PATH: process.env.PATH ?? '/usr/bin:/bin' },
        };
        if (options.hostNetns !== null) spec.hostNetns = options.hostNetns ?? HOST_NETNS;
        daemon.write(frame('S', spec));
      }
    });
    const code = await shim.main([], {
      io: unitSide,
      env: { DEDALO_DOOR: door, DEDALO_UNIT_WORKDIR: options.workdir, ...(options.unitEnv ?? {}) },
      unit: () => `dedalo-site-test-agent-s1-${door}@1-4001-4000000000.service`,
      stderr: () => {},
      ...(options.seams ?? {}),
    });
    await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 500))]);
    daemon.destroy();
    const text = (type: string) => Buffer.concat(frames.filter(each => each.type === type).map(each => each.payload)).toString('utf8');
    const x = frames.find(each => each.type === 'X');
    return { code, frames, stdout: text('O'), stderr: text('E'), exit: x ? json(x) : null };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
