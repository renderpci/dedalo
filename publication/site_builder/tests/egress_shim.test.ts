/**
 * THE EGRESS SHIM — the confined unit's ExecStart (LEAD-1).
 *
 * `PrivateNetwork=yes` is a request, not a guarantee: a host that cannot create a network
 * namespace (a container without CAP_SYS_ADMIN, an old kernel) silently runs the unit on
 * the HOST's network, where the `IPAddressAllow=localhost` backstop means the host's own
 * loopback — Postgres, the engine, every museum's daemon. So the unit does not start the
 * agent directly: it starts this shim, which
 *
 *   1. REFUSES (exit 78, `[confinement] network namespace not in effect` on stderr) unless
 *      its namespace identity PROVABLY differs from the daemon's (`DEDALO_HOST_NETNS`; absent
 *      or unreadable is a refusal) and every interface it can see is internal — the child is
 *      never spawned;
 *   2. forwards 127.0.0.1:PROXY_PORT → /run/dedalo-egress/proxy.sock and MCP_PORT →
 *      mcp.sock (only if present), bytes only, so the agent's ordinary HTTP_PROXY / http
 *      MCP configuration keeps working inside the namespace;
 *   3. runs the argv after `--` with inherited stdio and relays its exit code.
 *
 * CONTRACT under test (`src/drivers/egress_shim.ts`):
 *   checkNamespace(interfaces = os.networkInterfaces()) → boolean
 *   main(argv, seams?: { interfaces?, socketDir?, ports?: {proxy, mcp}, stderr?(text), workdir?,
 *                        hostNetns?, ownNetns?() })
 *     → Promise<number>   (the entrypoint exits with it)
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { connect, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type Interfaces = Record<string, Array<{ internal: boolean; address: string; family: string }>>;
interface ShimModule {
  checkNamespace(interfaces?: Interfaces): boolean;
  main(
    argv: string[],
    seams?: {
      interfaces?: () => Interfaces;
      socketDir?: string;
      ports?: { proxy: number; mcp: number };
      stderr?: (text: string) => void;
      workdir?: string;
      hostNetns?: string;
      ownNetns?: () => string;
    },
  ): Promise<number>;
}

async function shim(): Promise<ShimModule> {
  return (await import('../src/drivers/egress_shim' as string)) as ShimModule;
}

const LO: Interfaces = { lo: [{ internal: true, address: '127.0.0.1', family: 'IPv4' }] };
/** A unit PROVABLY elsewhere: the daemon's identity stated, and its own a different one. */
const ELSEWHERE = { hostNetns: 'net:[4026531840]', ownNetns: () => 'net:[4026532999]' } as const;
const HOST: Interfaces = { ...LO, eth0: [{ internal: false, address: '10.0.0.5', family: 'IPv4' }] };

const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});

function scratch(): string {
  const root = mkdtempSync(join(existsSync('/tmp') ? '/tmp' : tmpdir(), 'dsh-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}

describe('the shim refuses a unit whose network namespace is not in effect', () => {
  test('checkNamespace: loopback-only is in effect; a host interface is not', async () => {
    const { checkNamespace } = await shim();
    expect(checkNamespace(LO)).toBe(true);
    expect(checkNamespace(HOST)).toBe(false);
    // An interface with ONE external address among internal ones is still the host's.
    expect(
      checkNamespace({
        lo: LO.lo as Interfaces[string],
        wg0: [
          { internal: true, address: '::1', family: 'IPv6' },
          { internal: false, address: 'fd00::5', family: 'IPv6' },
        ],
      }),
    ).toBe(false);
  });

  test('on the host network: exit 78, the named line, and the child never runs', async () => {
    const { main } = await shim();
    const dir = scratch();
    const marker = join(dir, 'child-ran');
    const errors: string[] = [];
    // The namespace IDENTITY proves "elsewhere", so the only thing left to refuse on is the
    // visible eth0 — the interface proof itself, not the identity refusal before it.
    const code = await main(['--', '/bin/sh', '-c', `touch ${marker}`], {
      interfaces: () => HOST,
      stderr: text => errors.push(text),
      ...ELSEWHERE,
    });
    expect(code).toBe(78);
    expect(errors.join('')).toContain('[confinement] network namespace not in effect');
    expect(errors.join('')).toContain('can see a host interface');
    expect(existsSync(marker)).toBe(false);
  });

  test('inside a namespace: the child runs and its exit code is relayed', async () => {
    const { main } = await shim();
    const dir = scratch();
    const marker = join(dir, 'child-ran');
    const code = await main(['--', '/bin/sh', '-c', `touch ${marker}; exit 3`], { interfaces: () => LO, ...ELSEWHERE });
    expect(existsSync(marker)).toBe(true);
    expect(code).toBe(3);
  });
});

describe('a proof that cannot be taken, or a namespace shared with the daemon, is a refusal', () => {
  test('no interfaces at all, or an enumeration that throws, is not proof', async () => {
    const { checkNamespace, main } = await shim();
    // A namespace always has its lo; "nothing" is what a failed getifaddrs looks like.
    expect(checkNamespace({})).toBe(false);
    for (const interfaces of [() => ({}) as Interfaces, () => { throw new Error('EAFNOSUPPORT'); }]) {
      const dir = scratch();
      const marker = join(dir, 'child-ran');
      const code = await main(['--', '/bin/sh', '-c', `touch ${marker}`], { interfaces, stderr: () => {}, ...ELSEWHERE });
      expect(code).toBe(78);
      expect(existsSync(marker)).toBe(false);
    }
  });

  test('the SAME namespace identity as the daemon refuses, even with loopback-only interfaces', async () => {
    const { main } = await shim();
    // A host whose only interface is lo still has Postgres on it: interfaces alone cannot
    // tell "my own netns" from "the host's, which happens to have no NIC".
    const dir = scratch();
    const marker = join(dir, 'child-ran');
    const errors: string[] = [];
    const same = await main(['--', '/bin/sh', '-c', `touch ${marker}`], {
      interfaces: () => LO,
      hostNetns: 'net:[4026531840]',
      ownNetns: () => 'net:[4026531840]',
      stderr: text => errors.push(text),
    });
    expect(same).toBe(78);
    expect(errors.join('')).toContain('shares the daemon');
    expect(existsSync(marker)).toBe(false);
    // An identity that cannot be read is not a different one.
    const unreadable = await main(['--', '/bin/sh', '-c', `touch ${marker}`], {
      interfaces: () => LO,
      hostNetns: 'net:[4026531840]',
      ownNetns: () => {
        throw new Error('ENOENT');
      },
      stderr: () => {},
    });
    expect(unreadable).toBe(78);
    expect(existsSync(marker)).toBe(false);
    // Control: a different identity runs.
    const other = await main(['--', '/bin/sh', '-c', `touch ${marker}`], {
      interfaces: () => LO,
      hostNetns: 'net:[4026531840]',
      ownNetns: () => 'net:[4026532999]',
    });
    expect(other).toBe(0);
    expect(existsSync(marker)).toBe(true);
  });

  test('NO identity to compare against is a refusal, not a skipped check', async () => {
    // The fail-open this closes: the identity proof ran only `if (hostNetns)`, so an env file
    // that lost the key (a daemon whose readlink failed) fell back to the interface proof
    // alone — which a host whose only interface is lo passes, on the host's own loopback.
    const { main } = await shim();
    const saved = process.env.DEDALO_HOST_NETNS;
    delete process.env.DEDALO_HOST_NETNS;
    try {
      for (const [row, seams] of [
        ['absent', {}],
        ['empty', { hostNetns: '' }],
      ] as const) {
        const dir = scratch();
        const marker = join(dir, 'child-ran');
        const errors: string[] = [];
        const code = await main(['--', '/bin/sh', '-c', `touch ${marker}`], {
          interfaces: () => LO,
          ownNetns: () => 'net:[4026532999]',
          stderr: text => errors.push(text),
          ...seams,
        });
        expect({ row, code, ran: existsSync(marker) }).toEqual({ row, code: 78, ran: false });
        expect(errors.join('')).toContain('DEDALO_HOST_NETNS');
      }
    } finally {
      if (saved !== undefined) process.env.DEDALO_HOST_NETNS = saved;
    }
  });

  test('the child runs in the workdir it is told, and never sees the confinement’s own keys', async () => {
    const { main } = await shim();
    const dir = scratch();
    const out = join(dir, 'out.txt');
    process.env.DEDALO_UNIT_WORKDIR = '/nonexistent-should-be-overridden';
    process.env.DEDALO_HOST_NETNS = 'net:[1]';
    try {
      const code = await main(
        ['--', '/bin/sh', '-c', `pwd > ${out}; echo "w=\${DEDALO_UNIT_WORKDIR-unset} n=\${DEDALO_HOST_NETNS-unset}" >> ${out}`],
        { interfaces: () => LO, workdir: dir, hostNetns: 'net:[1]', ownNetns: () => 'net:[2]' },
      );
      expect(code).toBe(0);
    } finally {
      delete process.env.DEDALO_UNIT_WORKDIR;
      delete process.env.DEDALO_HOST_NETNS;
    }
    const [cwd, keys] = readFileSync(out, 'utf8').trim().split('\n');
    expect(realpathSync(cwd as string)).toBe(realpathSync(dir));
    expect(keys).toBe('w=unset n=unset');
  });
});

describe('the shim forwards the unit loopback to the bound egress sockets, bytes only', () => {
  /** A unix echo server at `path` (where the gate would serve), closed after the test. */
  async function echoAt(path: string): Promise<void> {
    const server = createServer(socket => socket.pipe(socket));
    await new Promise<void>(resolve => server.listen(path, resolve));
    cleanups.push(() => new Promise<void>(resolve => server.close(() => resolve())));
  }

  /** What `port` echoes of `text` — retried while the shim is still coming up. */
  async function roundTrip(port: number, text: string): Promise<string> {
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        return await new Promise<string>((resolve, reject) => {
          const socket = connect(port, '127.0.0.1');
          let got = '';
          socket.once('error', reject);
          socket.on('data', chunk => {
            got += chunk.toString();
            if (got.includes(text)) {
              socket.destroy();
              resolve(got);
            }
          });
          socket.once('connect', () => socket.write(text));
        });
      } catch {
        await Bun.sleep(50);
      }
    }
    return '';
  }

  /** The error code a connect to `port` ends in, or 'connected'. */
  function connectOutcome(port: number): Promise<string> {
    return new Promise(resolve => {
      const socket = connect(port, '127.0.0.1');
      socket.once('connect', () => {
        socket.destroy();
        resolve('connected');
      });
      socket.once('error', (error: NodeJS.ErrnoException) => resolve(error.code ?? String(error)));
    });
  }

  test('127.0.0.1:PROXY_PORT round-trips to proxy.sock — and with no mcp.sock, MCP_PORT is not listened on', async () => {
    const { main } = await shim();
    const dir = join(scratch(), 'egress');
    mkdirSync(dir);
    await echoAt(join(dir, 'proxy.sock'));
    const ports = { proxy: await freePort(), mcp: await freePort() };
    // The child holds the unit open long enough for this test to speak through the forward.
    const running = main(['--', '/bin/sh', '-c', 'sleep 2'], { interfaces: () => LO, socketDir: dir, ports, ...ELSEWHERE });
    expect(await roundTrip(ports.proxy, 'through-the-shim')).toContain('through-the-shim');
    // SH07: the build door, and a turn with no upstream, have no mcp.sock — and the shim must
    // then open no MCP listener at all (a forward to nothing is still a door a client finds).
    expect(await connectOutcome(ports.mcp)).toBe('ECONNREFUSED');
    expect(await running).toBe(0);
  });

  test('with an mcp.sock present, MCP_PORT round-trips to it (positive control)', async () => {
    const { main } = await shim();
    const dir = join(scratch(), 'egress');
    mkdirSync(dir);
    await echoAt(join(dir, 'proxy.sock'));
    await echoAt(join(dir, 'mcp.sock'));
    const ports = { proxy: await freePort(), mcp: await freePort() };
    const running = main(['--', '/bin/sh', '-c', 'sleep 2'], { interfaces: () => LO, socketDir: dir, ports, ...ELSEWHERE });
    expect(await roundTrip(ports.mcp, 'mcp-through-the-shim')).toContain('mcp-through-the-shim');
    expect(await roundTrip(ports.proxy, 'proxy-too')).toContain('proxy-too');
    expect(await running).toBe(0);
  });
});

