/**
 * THE EGRESS GATE — the one door a confined run speaks to the outside through (LEAD-1).
 *
 * A confined turn or build lives in a private network namespace with `/run` masked; the
 * ONLY thing it can open is its own per-run directory, bound in at `/run/dedalo-egress`,
 * holding two unix sockets this daemon serves:
 *
 *   - `proxy.sock` — an HTTP CONNECT proxy that accepts `CONNECT <host>:443` for a host on
 *     the run's plan ONLY, resolves it ONCE, refuses the whole host if ANY answer is not a
 *     public address (rebinding, a CNAME into a private range), and dials exactly the vetted
 *     address. No IP literal, no other port, no other method.
 *   - `mcp.sock` (turn only) — a fixed reverse proxy to `${PUBLICATION_API_URL}/mcp`, which
 *     adds the museum's API key ON THE DAEMON'S SIDE: the key never enters the unit.
 *
 * Asserted on REAL unix sockets, with the resolver and the dialer injected (`seams`) so the
 * public internet is never touched: `dial(address, port)` is handed the vetted address and
 * returns a connected socket — here, to a local echo server — which is the observation
 * "dial receives exactly that address".
 *
 * CONTRACT under test (`src/egress/gate.ts`):
 *   openEgressGate({ dir, plan: { hosts, mcp }, publicationApiUrl, apiKey, sink,
 *                    seams?: { lookup(host) → Promise<{address,family}[]>,
 *                              dial(address, port) → Promise<net.Socket> } })
 *     → { close(): Promise<void> | void }      (sync or async; both awaited here)
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { connect, createServer, type Server, type Socket } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type Lookup = (host: string) => Promise<readonly { address: string; family: number }[]>;
type Dial = (address: string, port: number) => Promise<Socket>;
interface GateModule {
  MAX_PROXY_CLIENTS: number;
  openEgressGate(opts: {
    dir: string;
    plan: { hosts: string[]; mcp: boolean };
    publicationApiUrl: string;
    apiKey: string;
    sink: (line: string) => void;
    seams?: { lookup?: Lookup; dial?: Dial; beforeServe?: (socket: string) => void | Promise<void> };
  }): Promise<{ close(): Promise<void> | void }> | { close(): Promise<void> | void };
}

async function gateModule(): Promise<GateModule> {
  return (await import('../src/egress/gate' as string)) as GateModule;
}

const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});

/** A short scratch root: sun_path is 104 bytes on macOS. */
function scratchRoot(): string {
  const root = mkdtempSync(join(existsSync('/tmp') ? '/tmp' : tmpdir(), 'deg-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

/**
 * A TCP echo server on loopback — stands in for "the public host the gate dialled" — that
 * also RECORDS every byte it received: what reached upstream is the observation.
 */
async function echoServer(): Promise<{ port: number; server: Server; received: () => Buffer }> {
  const chunks: Buffer[] = [];
  const server = createServer(socket => {
    socket.on('data', chunk => chunks.push(Buffer.from(chunk)));
    socket.pipe(socket);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise<void>(resolve => server.close(() => resolve())));
  return { port: (server.address() as { port: number }).port, server, received: () => Buffer.concat(chunks) };
}

/**
 * A TLS 1.2/1.3-shaped ClientHello, built byte by byte: `sni` null = no server_name
 * extension (an array = one extension per name), `ech` adds an encrypted_client_hello extension, `records` splits the handshake
 * message over that many TLS records (a ClientHello may span records).
 */
function helloBytes(sni: string | readonly string[] | null, opts: { ech?: boolean; records?: number } = {}): Buffer {
  const u16 = (n: number) => Buffer.from([(n >> 8) & 0xff, n & 0xff]);
  const extensions: Buffer[] = [];
  // An array is one server_name EXTENSION per name, in order (a hostile hello's duplicate).
  for (const each of sni === null ? [] : typeof sni === 'string' ? [sni] : sni) {
    const name = Buffer.from(each, 'latin1');
    const entry = Buffer.concat([Buffer.from([0]), u16(name.length), name]);
    const list = Buffer.concat([u16(entry.length), entry]);
    extensions.push(Buffer.concat([u16(0x0000), u16(list.length), list]));
  }
  // supported_versions (TLS 1.3), so the hello is a modern one.
  extensions.push(Buffer.concat([u16(0x002b), u16(3), Buffer.from([2, 0x03, 0x04])]));
  if (opts.ech) extensions.push(Buffer.concat([u16(0xfe0d), u16(4), Buffer.from([0, 0, 1, 0])]));
  const extBlock = Buffer.concat(extensions);
  const body = Buffer.concat([
    Buffer.from([0x03, 0x03]),
    Buffer.alloc(32, 7),
    Buffer.from([0]), // session id
    u16(2),
    Buffer.from([0x13, 0x01]), // TLS_AES_128_GCM_SHA256
    Buffer.from([1, 0]), // null compression
    u16(extBlock.length),
    extBlock,
  ]);
  const message = Buffer.concat([Buffer.from([1, (body.length >> 16) & 0xff, (body.length >> 8) & 0xff, body.length & 0xff]), body]);
  const parts = opts.records ?? 1;
  const step = Math.ceil(message.length / parts);
  const records: Buffer[] = [];
  for (let at = 0; at < message.length; at += step) {
    const fragment = message.subarray(at, at + step);
    records.push(Buffer.concat([Buffer.from([0x16, 0x03, 0x01]), u16(fragment.length), fragment]));
  }
  return Buffer.concat(records);
}

interface Harness {
  dir: string;
  lookups: string[];
  dials: string[];
  sinkLines: string[];
  /** Every byte the dialled "upstream" received. */
  upstream: () => Buffer;
  gate: { close(): Promise<void> | void };
}

async function openGate(opts: {
  hosts: string[];
  mcp?: boolean;
  answers?: Record<string, string[]>;
  publicationApiUrl?: string;
  apiKey?: string;
  /** Addresses whose dial fails (ECONNREFUSED), to exercise the per-answer fallback. */
  deadAddresses?: string[];
  /** Every lookup is recorded and then NEVER answers — connections held pending. */
  holdLookups?: boolean;
}): Promise<Harness> {
  const { openEgressGate } = await gateModule();
  const echo = await echoServer();
  const root = scratchRoot();
  const dir = join(root, 'egress', 'run1');
  const lookups: string[] = [];
  const dials: string[] = [];
  const sinkLines: string[] = [];
  const lookup: Lookup = async host => {
    lookups.push(host);
    if (opts.holdLookups) return new Promise(() => {});
    return (opts.answers?.[host] ?? []).map(address => ({ address, family: address.includes(':') ? 6 : 4 }));
  };
  const dial: Dial = (address, port) => {
    dials.push(`${address}:${port}`);
    if (opts.deadAddresses?.includes(address)) return Promise.reject(new Error(`connect ECONNREFUSED ${address}:${port}`));
    return new Promise((resolve, reject) => {
      const socket = connect(echo.port, '127.0.0.1', () => resolve(socket));
      socket.once('error', reject);
    });
  };
  const gate = await openEgressGate({
    dir,
    plan: { hosts: opts.hosts, mcp: opts.mcp ?? false },
    publicationApiUrl: opts.publicationApiUrl ?? 'http://127.0.0.1:1/publication/server_api/v2',
    apiKey: opts.apiKey ?? 'daemon-key',
    sink: line => sinkLines.push(line),
    seams: { lookup, dial },
  });
  cleanups.push(() => gate.close());
  return { dir, lookups, dials, sinkLines, upstream: echo.received, gate };
}

/** Speak raw bytes to proxy.sock; return the status line and a socket still open after it. */
async function proxyRequest(
  socketPath: string,
  head: string,
): Promise<{ status: number; socket: Socket; rest: Buffer }> {
  return new Promise((resolve, reject) => {
    const socket = connect(socketPath);
    let buffer = Buffer.alloc(0);
    const timer = setTimeout(() => reject(new Error(`no reply to ${JSON.stringify(head.split('\r\n')[0])}`)), 5_000);
    socket.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on('data', function onData(chunk: Buffer) {
      buffer = Buffer.concat([buffer, chunk]);
      const end = buffer.indexOf('\r\n\r\n');
      if (end === -1) return;
      clearTimeout(timer);
      socket.off('data', onData);
      const statusLine = buffer.subarray(0, buffer.indexOf('\r\n')).toString('latin1');
      const status = Number(statusLine.split(' ')[1]);
      resolve({ status, socket, rest: buffer.subarray(end + 4) });
    });
    socket.write(head);
  });
}

const connectHead = (target: string) => `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`;

describe('proxy.sock: hostnames on the plan, public addresses only, dialled exactly', () => {
  test('a: a host NOT on the plan is 403, with no lookup and no dial', async () => {
    const h = await openGate({ hosts: ['api.anthropic.com'], answers: { 'evil.example.org': ['93.184.216.34'] } });
    const reply = await proxyRequest(join(h.dir, 'proxy.sock'), connectHead('evil.example.org:443'));
    reply.socket.destroy();
    expect(reply.status).toBe(403);
    expect(h.dials).toEqual([]);
    expect(h.lookups).toEqual([]);
    // The refusal is a fact in the run's own log, naming the destination.
    expect(h.sinkLines.join('\n')).toContain('evil.example.org');
  });

  test('b: a planned name that resolves to ANY non-public address is refused whole', async () => {
    const cases: Record<string, string[]> = {
      'loop.example.org': ['127.0.0.1'],
      'lan.example.org': ['10.0.0.5'],
      'mapped.example.org': ['::ffff:127.0.0.1'],
      'nat64.example.org': ['64:ff9b::a00:1'],
      'linklocal.example.org': ['fe80::1'],
      'metadata.example.org': ['169.254.169.254'],
      'mixed.example.org': ['93.184.216.34', '127.0.0.1'],
    };
    const h = await openGate({ hosts: Object.keys(cases), answers: cases });
    for (const host of Object.keys(cases)) {
      const reply = await proxyRequest(join(h.dir, 'proxy.sock'), connectHead(`${host}:443`));
      reply.socket.destroy();
      expect({ host, status: reply.status }).toEqual({ host, status: 403 });
    }
    expect(h.dials).toEqual([]);
  });

  test('c: an IP literal is refused, even a public one — and the log says it was a LITERAL', async () => {
    // A plan cannot hold a literal (the next row), so the membership check would refuse one
    // too; what this row pins is the NAMED refusal, the line a museum reads (M46).
    const h = await openGate({ hosts: ['api.anthropic.com'] });
    for (const target of ['1.2.3.4:443', '[2606:4700:4700::1111]:443', '127.0.0.1:443']) {
      const reply = await proxyRequest(join(h.dir, 'proxy.sock'), connectHead(target));
      reply.socket.destroy();
      expect({ target, status: reply.status }).toEqual({ target, status: 403 });
      const line = h.sinkLines.find(entry => entry.includes(target)) ?? '';
      expect({ target, named: line.includes('IP literal') }).toEqual({ target, named: true });
    }
    expect(h.lookups).toEqual([]);
    expect(h.dials).toEqual([]);
  });

  test('c2: a plan naming anything but a hostname is refused at OPEN — nothing created', async () => {
    // The plan is where egress takes effect, so it is held to the hostname grammar here too,
    // not trusted to have been built right by every producer.
    const { openEgressGate } = await gateModule();
    for (const bad of ['1.2.3.4', '127.0.0.1', '2606:4700:4700::1111', '[::1]', '*', 'localhost', 'db.internal']) {
      const root = scratchRoot();
      const dir = join(root, 'egress', 'run1');
      let error: unknown = null;
      try {
        const gate = await openEgressGate({
          dir,
          plan: { hosts: ['api.anthropic.com', bad], mcp: false },
          publicationApiUrl: 'http://127.0.0.1:1',
          apiKey: 'k',
          sink: () => {},
        });
        await gate.close();
      } catch (caught) {
        error = caught;
      }
      expect({ bad, refused: String(error).includes('hostnames only') }).toEqual({ bad, refused: true });
      expect({ bad, left: existsSync(join(root, 'egress')) }).toEqual({ bad, left: false });
    }
  });

  test('d: any port but 443 is refused', async () => {
    const h = await openGate({ hosts: ['api.anthropic.com'], answers: { 'api.anthropic.com': ['93.184.216.34'] } });
    for (const port of [22, 80, 5432, 8443]) {
      const reply = await proxyRequest(join(h.dir, 'proxy.sock'), connectHead(`api.anthropic.com:${port}`));
      reply.socket.destroy();
      expect({ port, status: reply.status }).toEqual({ port, status: 403 });
    }
    expect(h.dials).toEqual([]);
  });

  test('a method other than CONNECT is 405', async () => {
    const h = await openGate({ hosts: ['api.anthropic.com'], answers: { 'api.anthropic.com': ['93.184.216.34'] } });
    const reply = await proxyRequest(
      join(h.dir, 'proxy.sock'),
      'GET http://api.anthropic.com/ HTTP/1.1\r\nHost: api.anthropic.com\r\n\r\n',
    );
    reply.socket.destroy();
    expect(reply.status).toBe(405);
    expect(h.dials).toEqual([]);
  });

  test('e: a planned public name is resolved ONCE and the vetted address is dialled exactly', async () => {
    const h = await openGate({
      hosts: ['api.anthropic.com'],
      answers: { 'api.anthropic.com': ['93.184.216.34', '93.184.216.35'] },
    });
    const reply = await proxyRequest(join(h.dir, 'proxy.sock'), connectHead('api.anthropic.com:443'));
    expect(reply.status).toBe(200);
    expect(h.lookups).toEqual(['api.anthropic.com']);
    expect(h.dials).toEqual(['93.184.216.34:443']);
    // …and it is a real tunnel: a ClientHello naming the host round-trips through the echo
    // "upstream", byte for byte.
    const hello = helloBytes('api.anthropic.com');
    const echoed = await new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no echo through the tunnel')), 5_000);
      let got = Buffer.from(reply.rest);
      const check = () => {
        if (got.length >= hello.length) {
          clearTimeout(timer);
          resolve(got);
        }
      };
      reply.socket.on('data', (chunk: Buffer) => {
        got = Buffer.concat([got, chunk]);
        check();
      });
      reply.socket.write(hello);
      check();
    });
    reply.socket.destroy();
    expect(echoed.equals(hello)).toBe(true);
    expect(h.sinkLines.join('\n')).toContain('api.anthropic.com');
  });
});

/** Write `bytes` into an open tunnel; resolve when the gate closed it or `ms` passed. */
async function sendThrough(socket: Socket, bytes: Buffer | Buffer[], ms = 1_500): Promise<{ closed: boolean }> {
  const closed = endsWithin(socket, ms);
  for (const part of Array.isArray(bytes) ? bytes : [bytes]) {
    socket.write(part);
    await Bun.sleep(20);
  }
  return { closed: await closed };
}

describe('proxy.sock: the tunnel carries TLS to the CONNECT host, and nothing else upstream', () => {
  // The finding: a plan host on a shared CDN (registry.npmjs.org is behind one) was a CONNECT
  // to the CDN's edge, and the TLS inside could name ANY site behind it. Nothing goes
  // upstream until the first flight is a ClientHello whose SNI is the CONNECT host.
  const planned = { hosts: ['registry.npmjs.org'], answers: { 'registry.npmjs.org': ['104.16.0.34'] } };

  test('a REAL TLS client naming the CONNECT host: its ClientHello reaches upstream intact', async () => {
    const h = await openGate(planned);
    const reply = await proxyRequest(join(h.dir, 'proxy.sock'), connectHead('registry.npmjs.org:443'));
    expect(reply.status).toBe(200);
    const tls = tlsConnect({ socket: reply.socket, servername: 'registry.npmjs.org', rejectUnauthorized: false });
    tls.on('error', () => {}); // the echo answers with the hello itself — not a TLS server
    for (let waited = 0; h.upstream().length === 0 && waited < 3_000; waited += 20) await Bun.sleep(20);
    tls.destroy();
    const got = h.upstream();
    expect(got[0]).toBe(0x16);
    expect(got.includes(Buffer.from('registry.npmjs.org'))).toBe(true);
  });

  test('a REAL TLS client naming ANOTHER host through the same CONNECT: closed, nothing upstream', async () => {
    const h = await openGate(planned);
    const reply = await proxyRequest(join(h.dir, 'proxy.sock'), connectHead('registry.npmjs.org:443'));
    expect(reply.status).toBe(200);
    const closed = endsWithin(reply.socket, 3_000);
    const tls = tlsConnect({ socket: reply.socket, servername: 'evil.example.com', rejectUnauthorized: false });
    tls.on('error', () => {});
    expect(await closed).toBe(true);
    tls.destroy();
    expect(h.upstream().length).toBe(0);
    expect(h.sinkLines.join('\n')).toContain("names 'evil.example.com', not the CONNECT host");
  });

  test('refused first flights: plain HTTP, no SNI, ECH, another name — closed, zero bytes upstream', async () => {
    const rows: Array<{ name: string; bytes: Buffer; why: string }> = [
      {
        name: 'plain http',
        bytes: Buffer.from('GET / HTTP/1.1\r\nHost: evil.example.com\r\n\r\n'),
        why: 'not a TLS handshake',
      },
      { name: 'no sni', bytes: helloBytes(null), why: 'no SNI' },
      { name: 'ech', bytes: helloBytes('registry.npmjs.org', { ech: true }), why: 'Encrypted Client Hello' },
      { name: 'other name', bytes: helloBytes('evil.example.com'), why: 'not the CONNECT host' },
      { name: 'suffix trick', bytes: helloBytes('registry.npmjs.org.evil.example.com'), why: 'not the CONNECT host' },
      // Two server_name extensions, the CONNECT host in EITHER place: which one a TLS stack
      // routes on is its choice, so the gate refuses both orders — "last wins" or "first wins"
      // would each forward one of them.
      {
        name: 'two sni, connect host first',
        bytes: helloBytes(['registry.npmjs.org', 'evil.example.com']),
        why: 'more than one server_name',
      },
      {
        name: 'two sni, connect host last',
        bytes: helloBytes(['evil.example.com', 'registry.npmjs.org']),
        why: 'more than one server_name',
      },
    ];
    for (const row of rows) {
      const h = await openGate(planned);
      const reply = await proxyRequest(join(h.dir, 'proxy.sock'), connectHead('registry.npmjs.org:443'));
      expect({ row: row.name, status: reply.status }).toEqual({ row: row.name, status: 200 });
      const { closed } = await sendThrough(reply.socket, row.bytes);
      reply.socket.destroy();
      expect({ row: row.name, closed, upstream: h.upstream().length }).toEqual({ row: row.name, closed: true, upstream: 0 });
      expect({ row: row.name, why: h.sinkLines.join('\n').includes(row.why) }).toEqual({ row: row.name, why: true });
    }
  });

  test('a ClientHello split over records and over writes is read whole, and forwarded exactly', async () => {
    const h = await openGate(planned);
    const reply = await proxyRequest(join(h.dir, 'proxy.sock'), connectHead('registry.npmjs.org:443'));
    const hello = helloBytes('Registry.NPMJS.org', { records: 3 });
    const { closed } = await sendThrough(reply.socket, [hello.subarray(0, 3), hello.subarray(3, 40), hello.subarray(40)], 500);
    expect(closed).toBe(false);
    for (let waited = 0; h.upstream().length < hello.length && waited < 3_000; waited += 20) await Bun.sleep(20);
    reply.socket.destroy();
    expect(h.upstream().equals(hello)).toBe(true);
  });

  test('parseClientHello: every length is checked — a lie is a refusal, never a read past the buffer', async () => {
    const { parseClientHello } = (await import('../src/egress/gate' as string)) as {
      parseClientHello(bytes: Buffer): { kind: string; why?: string; serverName?: string };
    };
    const good = helloBytes('registry.npmjs.org');
    expect(parseClientHello(good)).toEqual({ kind: 'ok', serverName: 'registry.npmjs.org' });
    // The SNI the gate judges is the ONLY SNI: a second server_name extension is a refusal
    // whichever of the two names the planned host.
    for (const names of [
      ['registry.npmjs.org', 'evil.example.com'],
      ['evil.example.com', 'registry.npmjs.org'],
      ['registry.npmjs.org', 'registry.npmjs.org'],
    ]) {
      expect({ names, verdict: parseClientHello(helloBytes(names)) }).toEqual({
        names,
        verdict: { kind: 'refused', why: 'its ClientHello carries more than one server_name' },
      });
    }
    // Every strict prefix is "more", never a verdict on half a hello.
    for (let cut = 0; cut < good.length; cut++) {
      expect({ cut, kind: parseClientHello(good.subarray(0, cut)).kind }).toEqual({ cut, kind: 'more' });
    }
    // GT21: the RECORD type is judged, not only the handshake type inside it — an alert,
    // change_cipher_spec or application_data record wrapping these same bytes is not a hello.
    for (const recordType of [0x17, 0x15, 0x14]) {
      const wrapped = Buffer.from(good);
      wrapped[0] = recordType;
      expect({ recordType, kind: parseClientHello(wrapped).kind }).toEqual({ recordType, kind: 'refused' });
    }
    // …and a record version that is not TLS's (major 3).
    const sslv2 = Buffer.from(good);
    sslv2[1] = 2;
    expect(parseClientHello(sslv2).kind).toBe('refused');
    // Corrupt each byte in turn — the record header (0-4) as much as the hello body's length
    // fields: never a throw, never 'ok' with a name other than the real one.
    for (let at = 0; at < good.length; at++) {
      const bad = Buffer.from(good);
      bad[at] = (bad[at] as number) ^ 0xff;
      let verdict: { kind: string; serverName?: string };
      try {
        verdict = parseClientHello(bad);
      } catch (error) {
        throw new Error(`byte ${at}: parseClientHello threw ${String(error)}`);
      }
      if (verdict.kind === 'ok') {
        expect({ at, name: verdict.serverName?.includes('registry') || verdict.serverName?.length === 18 }).toEqual({
          at,
          name: true,
        });
      }
    }
    // A handshake that is not a ClientHello.
    const notHello = Buffer.from(good);
    notHello[5] = 2;
    expect(parseClientHello(notHello).kind).toBe('refused');
  });
});

/** Wait for `socket` to end or close; true when it did within `ms`. */
function endsWithin(socket: Socket, ms: number): Promise<boolean> {
  return new Promise(resolve => {
    if (socket.destroyed) return resolve(true);
    const timer = setTimeout(() => resolve(false), ms);
    const done = () => {
      clearTimeout(timer);
      resolve(true);
    };
    socket.once('end', done);
    socket.once('close', done);
  });
}

describe('proxy.sock: the edges its header claims', () => {
  test('G2: the first vetted address is dead, the second is dialled — every answer, in order', async () => {
    const h = await openGate({
      hosts: ['api.anthropic.com'],
      answers: { 'api.anthropic.com': ['2606:4700::1', '93.184.216.34'] },
      deadAddresses: ['2606:4700::1'],
    });
    const reply = await proxyRequest(join(h.dir, 'proxy.sock'), connectHead('api.anthropic.com:443'));
    reply.socket.destroy();
    expect(reply.status).toBe(200);
    // Still ONE lookup: the fallback walks the answers already vetted, it never re-resolves.
    expect(h.lookups).toEqual(['api.anthropic.com']);
    expect(h.dials).toEqual(['2606:4700::1:443', '93.184.216.34:443']);
  });

  test('G2: the per-run connection cap — the N+1th connection is a 503, refused at accept: no lookup, no dial', async () => {
    // Every accepted connection is the DAEMON's fd and buffers; a runaway build must not spend
    // the budget of the daemon that serves every other site.
    const { MAX_PROXY_CLIENTS } = await gateModule();
    expect(MAX_PROXY_CLIENTS).toBeGreaterThan(0);
    const h = await openGate({ hosts: ['api.anthropic.com'], answers: {}, holdLookups: true });
    const socketPath = join(h.dir, 'proxy.sock');
    const held: Socket[] = [];
    cleanups.push(() => {
      for (const socket of held) socket.destroy();
    });
    for (let i = 0; i < MAX_PROXY_CLIENTS; i++) {
      const socket = connect(socketPath);
      socket.on('error', () => {});
      socket.write(connectHead('api.anthropic.com:443'));
      held.push(socket);
    }
    // Every one of them is IN the gate — each reached its (held) lookup.
    for (let waited = 0; h.lookups.length < MAX_PROXY_CLIENTS && waited < 5_000; waited += 10) await Bun.sleep(10);
    expect(h.lookups.length).toBe(MAX_PROXY_CLIENTS);
    // The refusal is at ACCEPT, before any head is read — so this client writes none: a head
    // racing the gate's destroy would be an RST that discards the reply it came to observe.
    const over = connect(socketPath);
    over.on('error', () => {});
    let answer = Buffer.alloc(0);
    over.on('data', (chunk: Buffer) => {
      answer = Buffer.concat([answer, chunk]);
    });
    expect(await endsWithin(over, 2_000)).toBe(true);
    expect(answer.toString('latin1').split('\r\n')[0]).toBe('HTTP/1.1 503 Service Unavailable');
    expect(h.lookups.length).toBe(MAX_PROXY_CLIENTS);
    expect(h.dials).toEqual([]);
    expect(h.sinkLines.join('\n')).toContain("the gate's per-run cap");
    // The cap is a COUNT, not a latch: one held connection closes, and the next is admitted.
    (held.pop() as Socket).destroy();
    for (let waited = 0; waited < 2_000; waited += 10) {
      await Bun.sleep(10);
      const next = connect(socketPath);
      next.on('error', () => {});
      next.write(connectHead('api.anthropic.com:443'));
      held.push(next);
      await Bun.sleep(20);
      if (h.lookups.length > MAX_PROXY_CLIENTS) break;
    }
    expect(h.lookups.length).toBe(MAX_PROXY_CLIENTS + 1);
    expect(h.dials).toEqual([]);
  });

  test('every vetted address dead: 502, each one tried once, and the failure is a named line', async () => {
    const h = await openGate({
      hosts: ['api.anthropic.com'],
      answers: { 'api.anthropic.com': ['93.184.216.34', '93.184.216.35'] },
      deadAddresses: ['93.184.216.34', '93.184.216.35'],
    });
    const reply = await proxyRequest(join(h.dir, 'proxy.sock'), connectHead('api.anthropic.com:443'));
    reply.socket.destroy();
    expect(reply.status).toBe(502);
    expect(h.dials).toEqual(['93.184.216.34:443', '93.184.216.35:443']);
    expect(h.sinkLines.join('\n')).toContain('every vetted address');
  });

  test('an EMPTY answer is 403 with no dial — never an index into nothing', async () => {
    const h = await openGate({ hosts: ['api.anthropic.com'], answers: { 'api.anthropic.com': [] } });
    const reply = await proxyRequest(join(h.dir, 'proxy.sock'), connectHead('api.anthropic.com:443'));
    reply.socket.destroy();
    expect(reply.status).toBe(403);
    expect(h.dials).toEqual([]);
    expect(h.sinkLines.join('\n')).toContain('resolves to nothing');
  });

  test('a head larger than 8 KiB with no end is 431, and nothing is resolved', async () => {
    const h = await openGate({ hosts: ['api.anthropic.com'], answers: { 'api.anthropic.com': ['93.184.216.34'] } });
    const reply = await proxyRequest(
      join(h.dir, 'proxy.sock'),
      `CONNECT api.anthropic.com:443 HTTP/1.1\r\nX-Pad: ${'a'.repeat(9 * 1024)}`,
    );
    reply.socket.destroy();
    expect(reply.status).toBe(431);
    expect(h.lookups).toEqual([]);
    expect(h.dials).toEqual([]);
  });

  test('the run log: one line per distinct destination, capped at 200, printable only', async () => {
    const h = await openGate({ hosts: ['api.anthropic.com'] });
    const socketPath = join(h.dir, 'proxy.sock');
    // A client that retries the SAME refused destination does not grow the log.
    for (let i = 0; i < 3; i++) {
      const reply = await proxyRequest(socketPath, connectHead('evil.example.org:443'));
      reply.socket.destroy();
    }
    expect(h.sinkLines.filter(line => line.includes('evil.example.org')).length).toBe(1);
    // Agent-chosen bytes (a newline, an ANSI escape) reach the log as '?', on one line.
    const hostile = await proxyRequest(socketPath, 'CONNECT ev\nil\u001b[31m.example.org:443 HTTP/1.1\r\n\r\n');
    hostile.socket.destroy();
    const hostileLine = h.sinkLines.find(line => line.includes('il?[31m')) ?? '';
    expect(hostileLine).toContain('ev?il?[31m.example.org');
    // (The gate's own prose may carry an em dash; what must never reach the log is a control
    // byte — a newline forging a second line, an escape repainting the operator's terminal.)
    for (const line of h.sinkLines) {
      expect({ line, controlFree: !/[\u0000-\u001f\u007f]/.test(line) }).toEqual({ line, controlFree: true });
    }
    // A run that loops over DISTINCT refusals stops at the cap.
    for (let i = 0; i < 230; i++) {
      const reply = await proxyRequest(socketPath, connectHead(`h${i}.example.org:443`));
      reply.socket.destroy();
    }
    expect(h.sinkLines.length).toBe(200);
  });

  test('close() tears down a LIVE tunnel: the client socket ends', async () => {
    const h = await openGate({ hosts: ['api.anthropic.com'], answers: { 'api.anthropic.com': ['93.184.216.34'] } });
    const reply = await proxyRequest(join(h.dir, 'proxy.sock'), connectHead('api.anthropic.com:443'));
    expect(reply.status).toBe(200);
    const ended = endsWithin(reply.socket, 3_000);
    await h.gate.close();
    expect(await ended).toBe(true);
  });

  test('a gate that fails PART-WAY open leaves no directory and no socket behind', async () => {
    const { openEgressGate } = await gateModule();
    for (const stage of ['proxy.sock', 'mcp.sock']) {
      const root = scratchRoot();
      const dir = join(root, 'egress', 'run1');
      let error: unknown = null;
      try {
        const gate = await openEgressGate({
          dir,
          plan: { hosts: ['api.anthropic.com'], mcp: true },
          publicationApiUrl: 'http://127.0.0.1:1/v2',
          apiKey: 'k',
          sink: () => {},
          seams: {
            beforeServe: socket => {
              if (socket === stage) throw new Error(`fault before ${socket}`);
            },
          },
        });
        await gate.close();
      } catch (caught) {
        error = caught;
      }
      expect({ stage, threw: String(error) }).toEqual({ stage, threw: `Error: fault before ${stage}` });
      expect({ stage, left: existsSync(dir) }).toEqual({ stage, left: false });
    }
  });
});

/** A recording stand-in for the Publication API. */
async function fakeApi(handler?: (request: Request) => Response | Promise<Response>) {
  const seen: Array<{ path: string; headers: Record<string, string>; body: string }> = [];
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    async fetch(request) {
      const url = new URL(request.url);
      seen.push({
        path: url.pathname + url.search,
        headers: Object.fromEntries(request.headers.entries()),
        body: await request.text(),
      });
      return handler
        ? handler(request)
        : new Response('{"jsonrpc":"2.0","id":1,"result":{}}', {
            headers: {
              'content-type': 'application/json',
              'mcp-session-id': 'sess-1',
              'set-cookie': 'internal=1',
              'x-internal-host': 'db.lan',
            },
          });
    },
  });
  cleanups.push(() => server.stop(true));
  return { base: `http://127.0.0.1:${server.port}`, seen };
}

describe('mcp.sock: one fixed upstream, the key added on the daemon side', () => {
  test('f: the client’s key, auth, path, query and Host are ignored; only the daemon key goes up', async () => {
    const api = await fakeApi();
    const h = await openGate({ hosts: [], mcp: true, publicationApiUrl: `${api.base}/publication/server_api/v2`, apiKey: 'daemon-key' });
    const response = await fetch('http://evil.example.org/mcp?x=1', {
      unix: join(h.dir, 'mcp.sock'),
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-06-18',
        'x-api-key': 'attacker',
        authorization: 'Bearer stolen',
        cookie: 'a=b',
        'x-forwarded-for': '10.0.0.5',
        host: 'evil.example.org',
      },
      body: '{"jsonrpc":"2.0","id":1,"method":"initialize"}',
    } as RequestInit);
    expect(response.status).toBe(200);
    expect(api.seen.length).toBe(1);
    const up = api.seen[0] as (typeof api.seen)[number];
    expect(up.path).toBe('/publication/server_api/v2/mcp');
    expect(up.headers['x-api-key']).toBe('daemon-key');
    expect(up.headers.authorization).toBeUndefined();
    expect(up.headers.cookie).toBeUndefined();
    expect(up.headers['x-forwarded-for']).toBeUndefined();
    expect(up.headers.host).toBe(new URL(api.base).host);
    expect(up.body).toBe('{"jsonrpc":"2.0","id":1,"method":"initialize"}');
    // Response headers are allowlisted too: the daemon's upstream is not the agent's business.
    expect(response.headers.get('mcp-session-id')).toBe('sess-1');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('x-internal-host')).toBeNull();
  });

  test('g: any path but /mcp is 404 and never forwarded', async () => {
    const api = await fakeApi();
    const h = await openGate({ hosts: [], mcp: true, publicationApiUrl: `${api.base}/publication/server_api/v2` });
    for (const path of ['/other', '/mcp/../admin', '/', '/mcpx']) {
      const response = await fetch(`http://x${path}`, { unix: join(h.dir, 'mcp.sock') } as RequestInit);
      await response.arrayBuffer();
      expect({ path, status: response.status }).toEqual({ path, status: 404 });
    }
    expect(api.seen).toEqual([]);
  });

  test('h: an upstream redirect is a 502, never followed', async () => {
    const decoy = await fakeApi();
    const api = await fakeApi(
      () => new Response(null, { status: 302, headers: { location: `${decoy.base}/steal` } }),
    );
    const h = await openGate({ hosts: [], mcp: true, publicationApiUrl: `${api.base}/v2` });
    const response = await fetch('http://x/mcp', {
      unix: join(h.dir, 'mcp.sock'),
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
      redirect: 'manual',
    } as RequestInit);
    await response.arrayBuffer();
    expect(response.status).toBe(502);
    expect(decoy.seen).toEqual([]);
  });

  test('i: an SSE body is STREAMED — the first event arrives while the upstream still holds', async () => {
    let release: () => void = () => {};
    const held = new Promise<void>(resolve => {
      release = resolve;
    });
    let released = false;
    const api = await fakeApi(
      () =>
        new Response(
          new ReadableStream({
            async start(controller) {
              controller.enqueue(new TextEncoder().encode('event: message\ndata: 1\n\n'));
              await Promise.race([held, Bun.sleep(4_000)]);
              controller.enqueue(new TextEncoder().encode('event: message\ndata: 2\n\n'));
              controller.close();
            },
          }),
          { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } },
        ),
    );
    const h = await openGate({ hosts: [], mcp: true, publicationApiUrl: `${api.base}/v2` });
    const response = await fetch('http://x/mcp', {
      unix: join(h.dir, 'mcp.sock'),
      method: 'GET',
      headers: { accept: 'text/event-stream' },
    } as RequestInit);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const first = await reader.read();
    const firstWhileHeld = !released;
    released = true;
    release();
    expect(new TextDecoder().decode(first.value)).toContain('data: 1');
    expect(firstWhileHeld).toBe(true);
    let rest = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      rest += new TextDecoder().decode(value);
    }
    expect(rest).toContain('data: 2');
  });

  test('a build gate (mcp:false) serves no mcp.sock at all', async () => {
    const h = await openGate({ hosts: ['registry.npmjs.org'], mcp: false });
    expect(existsSync(join(h.dir, 'proxy.sock'))).toBe(true);
    expect(existsSync(join(h.dir, 'mcp.sock'))).toBe(false);
  });
});

describe('the per-run directory', () => {
  test('its modes: 0750 dir, 0660 sockets', async () => {
    const h = await openGate({ hosts: [], mcp: true });
    // eslint-disable-next-line no-bitwise -- the permission word is the assertion
    expect(statSync(h.dir).mode & 0o777).toBe(0o750);
    for (const name of ['proxy.sock', 'mcp.sock']) {
      // eslint-disable-next-line no-bitwise -- the permission word is the assertion
      expect({ name, mode: statSync(join(h.dir, name)).mode & 0o777 }).toEqual({ name, mode: 0o660 });
    }
  });

  test('it must be a per-run dir under egress/, never the runtime root nor turns/', async () => {
    const { openEgressGate } = await gateModule();
    const root = scratchRoot();
    for (const dir of [root, join(root, 'turns'), join(root, 'turns', 'x')]) {
      let refused = false;
      try {
        const gate = await openEgressGate({
          dir,
          plan: { hosts: [], mcp: false },
          publicationApiUrl: 'http://127.0.0.1:1',
          apiKey: 'k',
          sink: () => {},
        });
        await gate.close();
      } catch {
        refused = true;
      }
      expect({ dir, refused }).toEqual({ dir, refused: true });
    }
  });

  test('j: close() removes the sockets and the dir, refuses new connections, and is idempotent', async () => {
    const h = await openGate({ hosts: [], mcp: true });
    const proxy = join(h.dir, 'proxy.sock');
    expect(existsSync(proxy)).toBe(true);
    await h.gate.close();
    await h.gate.close();
    expect(existsSync(proxy)).toBe(false);
    expect(existsSync(join(h.dir, 'mcp.sock'))).toBe(false);
    expect(existsSync(h.dir)).toBe(false);
    const refused = await new Promise<boolean>(resolve => {
      const socket = connect(proxy);
      socket.once('connect', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('error', () => resolve(true));
    });
    expect(refused).toBe(true);
  });
});

describe('the chain composes: a process behind the shim reaches the world only through the gate', () => {
  test('CONNECT through the shim is tunnelled by the gate; MCP through the shim carries the daemon key', async () => {
    const api = await fakeApi();
    const h = await openGate({
      hosts: ['api.anthropic.com'],
      mcp: true,
      answers: { 'api.anthropic.com': ['93.184.216.34'] },
      publicationApiUrl: `${api.base}/publication/server_api/v2`,
      apiKey: 'daemon-key',
    });
    const { main } = (await import('../src/drivers/egress_shim' as string)) as {
      main(argv: string[], seams: Record<string, unknown>): Promise<number>;
    };
    const free = async () => {
      const server = (await import('node:net')).createServer();
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      const port = (server.address() as { port: number }).port;
      await new Promise<void>(resolve => server.close(() => resolve()));
      return port;
    };
    const ports = { proxy: await free(), mcp: await free() };
    const root = scratchRoot();
    const out = join(root, 'result.json');
    const script = join(root, 'agent.ts');
    // The "agent": knows only its loopback ports, and tries to smuggle its own key.
    writeFileSync(
      script,
      `import { connect } from 'node:net';
const tunnel = await new Promise<string>((resolve) => {
  const s = connect(${ports.proxy}, '127.0.0.1');
  let got = '';
  s.on('data', (c) => { got += c.toString('latin1'); if (got.includes('\\r\\n\\r\\n') && !got.includes('api.anthropic.com')) s.write(Buffer.from(${JSON.stringify(helloBytes('api.anthropic.com').toString('hex'))}, 'hex')); if (got.includes('api.anthropic.com')) { s.destroy(); resolve(got); } });
  s.on('error', (e) => resolve('error ' + e.message));
  s.write('CONNECT api.anthropic.com:443 HTTP/1.1\\r\\nHost: api.anthropic.com:443\\r\\n\\r\\n');
});
const mcp = await fetch('http://127.0.0.1:${ports.mcp}/mcp', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'agent-key' }, body: '{"jsonrpc":"2.0","id":1,"method":"ping"}' });
await Bun.write(${JSON.stringify(out)}, JSON.stringify({ tunnel, mcpStatus: mcp.status, mcpBody: await mcp.text() }));
`,
    );
    const code = await main(['--', process.execPath, script], {
      interfaces: () => ({ lo: [{ internal: true, address: '127.0.0.1', family: 'IPv4' }] }),
      socketDir: h.dir,
      ports,
      hostNetns: 'net:[4026531840]',
      ownNetns: () => 'net:[4026532999]',
    });
    expect(code).toBe(0);
    const result = JSON.parse(readFileSync(out, 'utf8')) as { tunnel: string; mcpStatus: number; mcpBody: string };
    expect(result.tunnel).toContain('200 Connection Established');
    // The agent's ClientHello came back through the echo "upstream": the tunnel carried it.
    expect(result.tunnel).toContain('api.anthropic.com');
    expect(h.dials).toEqual(['93.184.216.34:443']);
    expect(result.mcpStatus).toBe(200);
    expect(api.seen.length).toBe(1);
    expect(api.seen[0]?.headers['x-api-key']).toBe('daemon-key');
  });
});
