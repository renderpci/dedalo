/**
 * B4 (spec §6) — init/verify.ts against REAL listeners: a Bun.serve on a scratch unix socket,
 * and a Bun.serve with the provisioner's own mTLS material (tls.ts ensureTls, in memory) on
 * 127.0.0.1, reached through the global fetch exactly as production does. The unit state, the
 * root file reader and the sleep are injected (no systemd, no root, no waiting).
 *
 * Seam: the layout's listen.socketPath / listen.port are replaced by scratch values (macOS caps
 * a socket path at 104 bytes, so the socket lives under the OS temp dir, not .test-tmp/).
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  diagnosticCommands,
  fingerprintsEqual,
  HEALTH_BODY_CAP,
  type HealthFetch,
  healthRequest,
  readHealthBody,
  VERIFY_POLL_MS,
  VERIFY_TRIES,
  type VerifyPorts,
  type VerifyResult,
  verifyAgent,
  verifyPortResult,
} from '../src/provision/init/verify';
import type { AgentLayout } from '../src/provision/layout';
import { derive } from '../src/provision/layout';
import { AGENT_BASE_PATH } from '../src/provision/render/engine_fragment';
import { ensureTls, type TlsIo } from '../src/provision/tls';
import { instanceFingerprint } from '../src/security/pairing';
import { tlsDeclaration, unixDeclaration } from './fixtures/provision_declaration';

const TOKEN = 'verify-token-not-a-secret-0123456789abcdefghij';
const OTHER_TOKEN = 'verify-token-other-0123456789abcdefghijklmnopq';

type Health = { status: number; body: string };
const okHealth = (instance: string, token: string): Health => ({
  status: 200,
  body: JSON.stringify({ status: 'ok', service: 'dedalo-publication-host-agent', instance_fingerprint: instanceFingerprint(instance, token) }),
});

function ports(files: Record<string, string | null>, opts: { active?: boolean[]; fetch?: HealthFetch } = {}) {
  const sleeps: number[] = [];
  const states = [...(opts.active ?? [true])];
  let unitCalls = 0;
  const value: VerifyPorts = {
    io: { readRootFile: (path: string) => files[path] ?? null },
    exec: {
      unitState: () => {
        unitCalls += 1;
        return { enabled: true, active: (states.length > 1 ? states.shift() : states[0]) ?? false };
      },
    },
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
    ...(opts.fetch === undefined ? {} : { fetch: opts.fetch }),
  };
  return { ports: value, sleeps, unitCalls: () => unitCalls };
}

/** No secret ever reaches a result: not the token, not either fingerprint. */
function expectNoSecret(result: VerifyResult, ...secrets: string[]) {
  const text = JSON.stringify(result);
  for (const secret of secrets) expect(text).not.toContain(secret);
}

/* ── unix: a real socket ──────────────────────────────────────────────────────────── */

describe('B4 over a real unix socket', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ddv-'));
  const socket = join(dir, 'agent.sock');
  const base = derive(unixDeclaration());
  const layout: AgentLayout = { ...base, listen: { ...(base.listen as Extract<AgentLayout['listen'], { kind: 'unix' }>), socketPath: socket } };
  let answer: Health = okHealth(layout.instance, TOKEN);
  const seen: string[] = [];
  let server: ReturnType<typeof Bun.serve> | null = null;
  const files = { [layout.serviceTokenPath]: `${TOKEN}\n` };

  beforeAll(() => {
    server = Bun.serve({
      unix: socket,
      fetch: request => {
        seen.push(new URL(request.url).pathname);
        return new Response(answer.body, { status: answer.status, headers: { 'content-type': 'application/json' } });
      },
    });
  });
  afterAll(() => {
    server?.stop(true);
    rmSync(dir, { recursive: true, force: true });
  });

  test('the agent answers with the expected fingerprint: ok, at AGENT_BASE_PATH/health', async () => {
    answer = okHealth(layout.instance, TOKEN);
    const p = ports(files);
    const result = await verifyAgent(layout, p.ports);
    expect(result.ok).toBe(true);
    expect(seen.at(-1)).toBe(`${AGENT_BASE_PATH}/health`);
    expect(p.sleeps).toEqual([]);
    expectNoSecret(result, TOKEN, instanceFingerprint(layout.instance, TOKEN));
  });

  test('another token behind the socket is a mismatch, and neither fingerprint is printed', async () => {
    answer = okHealth(layout.instance, OTHER_TOKEN);
    const result = await verifyAgent(layout, ports(files).ports, { selinux: true });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe('mismatch');
    expect(result.commands).toEqual([`journalctl -u ${layout.agentUnitName} --since -2min -o cat`, 'ausearch -m AVC,USER_AVC -ts recent']);
    expectNoSecret(result, TOKEN, OTHER_TOKEN, instanceFingerprint(layout.instance, TOKEN), instanceFingerprint(layout.instance, OTHER_TOKEN));
  });

  test('another INSTANCE with the same token is a mismatch too', async () => {
    answer = okHealth('other_instance', TOKEN);
    const result = await verifyAgent(layout, ports(files).ports);
    expect(result.ok ? 'ok' : result.failure).toBe('mismatch');
  });

  test('HTTP 503 is http_status; a body without status ok is not_ok; an oversize body is not_ok', async () => {
    answer = { status: 503, body: '{}' };
    let result = await verifyAgent(layout, ports(files).ports);
    expect(result.ok ? 'ok' : result.failure).toBe('http_status');
    answer = { status: 200, body: JSON.stringify({ status: 'starting', instance_fingerprint: instanceFingerprint(layout.instance, TOKEN) }) };
    result = await verifyAgent(layout, ports(files).ports);
    expect(result.ok ? 'ok' : result.failure).toBe('not_ok');
    answer = { status: 200, body: 'not json' };
    result = await verifyAgent(layout, ports(files).ports);
    expect(result.ok ? 'ok' : result.failure).toBe('not_ok');
    const padded = { ...JSON.parse(okHealth(layout.instance, TOKEN).body), pad: 'x'.repeat(HEALTH_BODY_CAP) };
    answer = { status: 200, body: JSON.stringify(padded) };
    result = await verifyAgent(layout, ports(files).ports);
    expect(result.ok ? 'ok' : result.failure).toBe('not_ok');
  });
});

/* ── tls: the provisioner's own mTLS material on a real handshake ─────────────────── */

function memoryTls(layout: AgentLayout) {
  const files = new Map<string, string>();
  const io: TlsIo = { readFile: path => files.get(path) ?? null, writeFile: (path, body) => void files.set(path, body) };
  ensureTls(layout, io, new Date());
  return files;
}

describe('B4 over real mTLS', () => {
  const issued = derive({ ...tlsDeclaration(), listen: { kind: 'tls', host: '127.0.0.1', port: 7443 } });
  const material = memoryTls(issued);
  const rogue = memoryTls(issued);
  const tlsPaths = issued.tls!;
  let server: ReturnType<typeof Bun.serve> | null = null;
  let layout: AgentLayout = issued;

  beforeAll(() => {
    server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      tls: {
        cert: material.get(tlsPaths.serverCert)!,
        key: material.get(tlsPaths.serverKey)!,
        ca: material.get(tlsPaths.caCert)!,
        requestCert: true,
        rejectUnauthorized: true,
      },
      fetch: () => new Response(okHealth(issued.instance, TOKEN).body),
    });
    layout = { ...issued, listen: { kind: 'tls', host: '127.0.0.1', port: server.port as number } };
  });
  afterAll(() => server?.stop(true));

  test('the engine bundle the provisioner wrote proves the agent: ok', async () => {
    const files = { [layout.serviceTokenPath]: TOKEN, [layout.engineBundlePath]: material.get(issued.engineBundlePath)! };
    const result = await verifyAgent(layout, ports(files).ports);
    expect(result).toEqual({ ok: true, facts: [expect.stringContaining(`https://127.0.0.1:${layout.listen.kind === 'tls' ? layout.listen.port : 0}${AGENT_BASE_PATH}/health`)] });
  });

  test("another CA's bundle never completes the handshake: unreachable, after the full schedule", async () => {
    const files = { [layout.serviceTokenPath]: TOKEN, [layout.engineBundlePath]: rogue.get(issued.engineBundlePath)! };
    const p = ports(files);
    const result = await verifyAgent(layout, p.ports);
    expect(result.ok ? 'ok' : result.failure).toBe('unreachable');
    expect(p.sleeps).toEqual(Array(VERIFY_TRIES - 1).fill(VERIFY_POLL_MS));
  });

  test('a server certificate another CA issued is refused (the CA pin), even with our client bundle', async () => {
    const impostor = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      tls: {
        cert: rogue.get(tlsPaths.serverCert)!,
        key: rogue.get(tlsPaths.serverKey)!,
        ca: material.get(tlsPaths.caCert)!,
        requestCert: true,
        rejectUnauthorized: true,
      },
      fetch: () => new Response(okHealth(issued.instance, TOKEN).body),
    });
    try {
      const at: AgentLayout = { ...issued, listen: { kind: 'tls', host: '127.0.0.1', port: impostor.port as number } };
      const files = { [at.serviceTokenPath]: TOKEN, [at.engineBundlePath]: material.get(issued.engineBundlePath)! };
      const result = await verifyAgent(at, ports(files).ports);
      expect(result.ok ? 'ok' : result.failure).toBe('unreachable');
    } finally {
      impostor.stop(true);
    }
  });

  test('a missing or malformed bundle sends nothing (bundle)', async () => {
    let sent = 0;
    const fetch: HealthFetch = async () => {
      sent += 1;
      return new Response('', { status: 200 });
    };
    for (const bundle of [null, 'not a pem']) {
      const result = await verifyAgent(layout, ports({ [layout.serviceTokenPath]: TOKEN, [layout.engineBundlePath]: bundle }, { fetch }).ports);
      expect(result.ok ? 'ok' : result.failure).toBe('bundle');
    }
    expect(sent).toBe(0);
  });
});

/* ── the schedule, with an injected request ───────────────────────────────────────── */

describe('B4 schedule and inputs', () => {
  const layout = derive(unixDeclaration());
  const files = { [layout.serviceTokenPath]: TOKEN };
  const answering = (h: Health): HealthFetch => async () => new Response(h.body, { status: h.status });

  test('an inactive unit: VERIFY_TRIES checks, VERIFY_POLL_MS apart, and no request', async () => {
    let sent = 0;
    const p = ports(files, { active: [false], fetch: async () => (sent++, new Response('', { status: 200 })) });
    const result = await verifyAgent(layout, p.ports);
    expect(result.ok ? 'ok' : result.failure).toBe('inactive');
    expect(p.unitCalls()).toBe(VERIFY_TRIES);
    expect(p.sleeps).toEqual(Array(VERIFY_TRIES - 1).fill(VERIFY_POLL_MS));
    expect(sent).toBe(0);
    if (!result.ok) expect(result.commands).toEqual([`journalctl -u ${layout.agentUnitName} --since -2min -o cat`]);
    expect(diagnosticCommands(layout, { selinux: false })).toHaveLength(1);
  });

  test('a unit that becomes active on the 3rd check proceeds', async () => {
    const p = ports(files, { active: [false, false, true], fetch: answering(okHealth(layout.instance, TOKEN)) });
    expect((await verifyAgent(layout, p.ports)).ok).toBe(true);
    expect(p.unitCalls()).toBe(3);
  });

  test('a missing or short token sends nothing (credential)', async () => {
    let sent = 0;
    const fetch: HealthFetch = async () => (sent++, new Response('', { status: 200 }));
    for (const token of [null, 'short']) {
      const result = await verifyAgent(layout, ports({ [layout.serviceTokenPath]: token }, { fetch }).ports);
      expect(result.ok ? 'ok' : result.failure).toBe('credential');
    }
    expect(sent).toBe(0);
  });

  test('connection errors are retried, an answer is not', async () => {
    let calls = 0;
    const flaky: HealthFetch = async () => {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error('connect ECONNREFUSED /run/x token=nope'), { code: 'ECONNREFUSED' });
      return new Response(okHealth(layout.instance, TOKEN).body, { status: 200 });
    };
    const p = ports(files, { fetch: flaky });
    expect((await verifyAgent(layout, p.ports)).ok).toBe(true);
    expect(calls).toBe(3);
    let answered = 0;
    const once: HealthFetch = async () => (answered++, new Response('', { status: 500 }));
    expect((await verifyAgent(layout, ports(files, { fetch: once }).ports)).ok).toBe(false);
    expect(answered).toBe(1);
  });

  test('a body past HEALTH_BODY_CAP is cancelled mid-read (never buffered whole): not_ok', async () => {
    let pulled = 0;
    let cancelled = false;
    const endless: HealthFetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            pulled += 1;
            controller.enqueue(new Uint8Array(1024).fill(0x20));
          },
          cancel() {
            cancelled = true;
          },
        }),
        { status: 200 },
      );
    const result = await verifyAgent(layout, ports(files, { fetch: endless }).ports);
    expect(result.ok ? 'ok' : result.failure).toBe('not_ok');
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThanOrEqual(HEALTH_BODY_CAP / 1024 + 2);
    // at the cap exactly it is read; one byte more is not; not UTF-8 is not a body
    const text = (n: number) => new Response('x'.repeat(n)).body;
    expect(await readHealthBody(text(HEALTH_BODY_CAP))).toHaveLength(HEALTH_BODY_CAP);
    expect(await readHealthBody(text(HEALTH_BODY_CAP + 1))).toBeNull();
    expect(await readHealthBody(new Response(new Uint8Array([0xff, 0xfe])).body)).toBeNull();
    expect(await readHealthBody(null)).toBe('');
  });

  test('unreachable names the error code, never its message', async () => {
    const down: HealthFetch = async () => {
      throw Object.assign(new Error('secret-looking message'), { code: 'ECONNREFUSED' });
    };
    const result = await verifyAgent(layout, ports(files, { fetch: down }).ports);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('ECONNREFUSED');
    expect(result.reason).not.toContain('secret-looking');
    const plain = await verifyAgent(layout, ports(files, { fetch: async () => { throw new TypeError('x'); } }).ports);
    expect(plain.ok ? '' : plain.reason).toContain('TypeError');
  });

  test('the only URLs: AGENT_BASE_PATH on the declared listener (unix socket, or listen host:port)', () => {
    expect(healthRequest(layout, null)).toEqual({ url: `http://localhost${AGENT_BASE_PATH}/health`, unix: layout.listen.kind === 'unix' ? layout.listen.socketPath : '' });
    const tls = derive(tlsDeclaration());
    const parts = { ca: 'c', cert: 'e', key: 'k' };
    expect(healthRequest(tls, parts)).toEqual({ url: `https://10.8.0.2:7443${AGENT_BASE_PATH}/health`, tls: parts });
    expect(() => healthRequest(tls, null)).toThrow('engine bundle');
    const v6 = { ...tls, listen: { kind: 'tls' as const, host: 'fd00::2', port: 7443 } };
    expect(healthRequest(v6, parts).url).toBe(`https://[fd00::2]:7443${AGENT_BASE_PATH}/health`);
  });

  test('fingerprintsEqual: equal 64-hex only', () => {
    const fp = instanceFingerprint('test', TOKEN);
    expect(fingerprintsEqual(fp, fp)).toBe(true);
    expect(fingerprintsEqual(instanceFingerprint('test', OTHER_TOKEN), fp)).toBe(false);
    expect(fingerprintsEqual(fp.toUpperCase(), fp)).toBe(false);
    expect(fingerprintsEqual(42, fp)).toBe(false);
    expect(fingerprintsEqual(fp, 'short')).toBe(false);
  });
});

describe('verifyPortResult', () => {
  test('ok is done; a failure carries its reason and the commands to run', () => {
    expect(verifyPortResult({ ok: true, facts: [] })).toEqual({ outcome: 'done' });
    expect(verifyPortResult({ ok: false, failure: 'inactive', reason: 'down', facts: [], commands: ['journalctl -u x', 'ausearch'] })).toEqual({
      outcome: 'failed',
      reason: 'down; see: journalctl -u x ; ausearch',
    });
  });
});
