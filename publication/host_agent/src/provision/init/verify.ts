/**
 * B4 — PROVE THE AGENT INIT JUST PROVISIONED ANSWERS AS ITSELF (spec §6, item `verify.agent`).
 *
 *   1. `unitState(<agent unit>).active`, polled every VERIFY_POLL_MS, at most VERIFY_TRIES times.
 *   2. `GET <AGENT_BASE_PATH>/health` over the DECLARED listener only:
 *        unix — `http://localhost…` through `layout.listen.socketPath` (Bun's `unix` option);
 *        tls  — `https://<listen.host>:<listen.port>…`, the engine bundle's client certificate,
 *               key and CA split IN MEMORY from the root-only bundle (tls.ts parseEngineBundle):
 *               the very channel the engine will use, mTLS and the CA pin included.
 *      A connection error is retried on the same schedule (a `Type=simple` unit is active before
 *      it binds); an answer is never retried.
 *   3. `status === 'ok'` AND `instance_fingerprint` equal, in constant time, to
 *      instanceFingerprint(instance, token) — the token read as root from the credential file.
 *
 * WHAT NEVER LEAVES THIS FILE: the token, the expected and the published fingerprint, the key.
 * A failure names what failed (inactive, unreachable, HTTP status, not ok, mismatch) and the
 * commands the operator runs to see why — `journalctl …` and, on an SELinux host, `ausearch …`.
 * init runs neither (spec §8 "Output": init never runs journalctl or ausearch).
 *
 * EGRESS: this is the agent package's one fetch outside releases/install.ts
 * (tests/egress_census.test.ts). Its only URL is built here from AGENT_BASE_PATH and the
 * declared listener; there is no other host it can be pointed at.
 *
 * I/O module (spec §2.1): not zero-dep. Imports no src/config.ts (init never does).
 */

import { timingSafeEqual } from 'node:crypto';
import { instanceFingerprint } from '../../security/pairing';
import type { ProvisionExec } from '../exec_contract';
import type { AgentLayout } from '../layout';
import { AGENT_BASE_PATH } from '../render/engine_fragment';
import { parseEngineBundle } from '../tls';
import type { InitIo } from './types';

/** Spec §6 B4 step 1: every 500 ms, up to 10 tries. */
export const VERIFY_POLL_MS = 500;
export const VERIFY_TRIES = 10;
/** One health request's ceiling. */
export const HEALTH_TIMEOUT_MS = 5_000;
/**
 * The agent's /health body is three short fields; anything larger is not that body. A CEILING ON
 * THE READ, not a check after it: the body is read as a stream and cancelled past it, so whatever
 * answers on the listener cannot make root's installer buffer more (readHealthBody).
 */
export const HEALTH_BODY_CAP = 4096;
const FINGERPRINT_SHAPE = /^[0-9a-f]{64}$/;
const MIN_TOKEN_LENGTH = 32;

/** The TLS material of one request (fetch's `tls` option). */
export interface HealthTls {
  readonly ca: string;
  readonly cert: string;
  readonly key: string;
}

/** The one request B4 sends; production is the global fetch, a test injects a stand-in (a Response). */
export type HealthFetch = (
  url: string,
  init: { readonly unix?: string; readonly tls?: HealthTls; readonly signal: AbortSignal },
) => Promise<{ readonly status: number; readonly body: ReadableStream<Uint8Array> | null }>;

/**
 * The body, read chunk by chunk and CANCELLED as soon as it passes `cap` bytes (null: over the
 * cap, or not UTF-8). The size is never trusted from a header: only the bytes read count.
 */
export async function readHealthBody(body: ReadableStream<Uint8Array> | null, cap: number = HEALTH_BODY_CAP): Promise<string | null> {
  if (body === null) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > cap) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** What B4 needs from init's world (InitPorts satisfies it structurally). */
export interface VerifyPorts {
  readonly io: Pick<InitIo, 'readRootFile'>;
  readonly exec: Pick<ProvisionExec, 'unitState'>;
  /** Default: the global fetch. */
  readonly fetch?: HealthFetch;
  /** Default: Bun.sleep. */
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface VerifyOptions {
  /** SELinux enabled (permissive/enforcing): the failure also prints the AVC search. */
  readonly selinux?: boolean;
}

export type VerifyFailure = 'inactive' | 'credential' | 'bundle' | 'unreachable' | 'http_status' | 'not_ok' | 'mismatch';

export type VerifyResult =
  | { readonly ok: true; readonly facts: readonly string[] }
  | {
      readonly ok: false;
      readonly failure: VerifyFailure;
      /** One sentence; never the token, a fingerprint or key material. */
      readonly reason: string;
      readonly facts: readonly string[];
      /** What the operator runs to see why (init runs none of them). */
      readonly commands: readonly string[];
    };

/** The health URL and options for the declared listener — the only URL B4 can build. */
export function healthRequest(layout: AgentLayout, tls: HealthTls | null): { url: string; unix?: string; tls?: HealthTls } {
  if (layout.listen.kind === 'unix') {
    return { url: `http://localhost${AGENT_BASE_PATH}/health`, unix: layout.listen.socketPath };
  }
  if (tls === null) throw new Error('verify: a tls listener needs the engine bundle');
  const host = layout.listen.host.includes(':') ? `[${layout.listen.host}]` : layout.listen.host;
  return { url: `https://${host}:${layout.listen.port}${AGENT_BASE_PATH}/health`, tls };
}

/** The commands a failed B4 prints (spec §6 B4 step 4). */
export function diagnosticCommands(layout: AgentLayout, options: VerifyOptions = {}): string[] {
  const commands = [`journalctl -u ${layout.agentUnitName} --since -2min -o cat`];
  if (options.selinux === true) commands.push('ausearch -m AVC,USER_AVC -ts recent');
  return commands;
}

/** Constant-time equality of two 64-hex fingerprints (false for any other shape). */
export function fingerprintsEqual(published: unknown, expected: string): boolean {
  if (typeof published !== 'string' || !FINGERPRINT_SHAPE.test(published) || !FINGERPRINT_SHAPE.test(expected)) return false;
  return timingSafeEqual(Buffer.from(published, 'utf8'), Buffer.from(expected, 'utf8'));
}

const defaultFetch: HealthFetch = (url, init) =>
  fetch(url, {
    signal: init.signal,
    redirect: 'error',
    ...(init.unix === undefined ? {} : { unix: init.unix }),
    ...(init.tls === undefined ? {} : { tls: { ca: init.tls.ca, cert: init.tls.cert, key: init.tls.key, rejectUnauthorized: true } }),
  } as RequestInit);

/** B4. Never throws for an operator-visible condition: every outcome is a VerifyResult. */
export async function verifyAgent(layout: AgentLayout, ports: VerifyPorts, options: VerifyOptions = {}): Promise<VerifyResult> {
  const sleep = ports.sleep ?? ((ms: number) => Bun.sleep(ms));
  const send = ports.fetch ?? defaultFetch;
  const unit = layout.agentUnitName;
  const commands = diagnosticCommands(layout, options);
  const fail = (failure: VerifyFailure, reason: string, facts: string[] = []): VerifyResult => ({
    ok: false,
    failure,
    reason,
    facts,
    commands,
  });

  // 1. the unit is active
  let active = false;
  for (let attempt = 1; attempt <= VERIFY_TRIES; attempt += 1) {
    if (ports.exec.unitState(unit).active) {
      active = true;
      break;
    }
    if (attempt < VERIFY_TRIES) await sleep(VERIFY_POLL_MS);
  }
  if (!active) {
    return fail('inactive', `the agent unit ${unit}.service is not active after ${VERIFY_TRIES} checks ${VERIFY_POLL_MS} ms apart`);
  }

  // 3 (inputs first, so a missing credential never sends a request)
  const token = ports.io.readRootFile(layout.serviceTokenPath)?.trim() ?? '';
  if (token.length < MIN_TOKEN_LENGTH) {
    return fail('credential', `the service token at ${layout.serviceTokenPath} is missing or shorter than ${MIN_TOKEN_LENGTH} characters`);
  }
  const expected = instanceFingerprint(layout.instance, token);
  let tls: HealthTls | null = null;
  if (layout.listen.kind === 'tls') {
    const bundle = parseEngineBundle(ports.io.readRootFile(layout.engineBundlePath));
    if (bundle === null) {
      return fail('bundle', `the engine bundle ${layout.engineBundlePath} is missing or not a certificate, a key and a CA`);
    }
    tls = { ca: bundle.caPem, cert: bundle.certPem, key: bundle.keyPem };
  }

  // 2. the health request, on the declared listener only
  const request = healthRequest(layout, tls);
  const where = request.unix === undefined ? request.url : `${request.url} through ${request.unix}`;
  let answer: { status: number; body: string | null } | null = null;
  let lastError = '';
  for (let attempt = 1; attempt <= VERIFY_TRIES && answer === null; attempt += 1) {
    try {
      const response = await send(request.url, {
        ...(request.unix === undefined ? {} : { unix: request.unix }),
        ...(request.tls === undefined ? {} : { tls: request.tls }),
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      answer = { status: response.status, body: await readHealthBody(response.body) };
    } catch (error) {
      // The error's code or class only: its message is not ours to print.
      const code = (error as { code?: unknown } | null)?.code;
      lastError = typeof code === 'string' && /^[A-Za-z_]{1,40}$/.test(code) ? code : error instanceof Error ? error.name : 'error';
      if (attempt < VERIFY_TRIES) await sleep(VERIFY_POLL_MS);
    }
  }
  if (answer === null) {
    return fail('unreachable', `no answer from ${where} after ${VERIFY_TRIES} tries (${lastError})`);
  }
  if (answer.status !== 200) return fail('http_status', `${where} answered HTTP ${answer.status}, not 200`);

  let body: unknown = null;
  if (answer.body !== null) {
    try {
      body = JSON.parse(answer.body);
    } catch {
      body = null;
    }
  }
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;
  if (record === null || record.status !== 'ok') return fail('not_ok', `${where} did not answer {"status":"ok", …}`);
  if (!fingerprintsEqual(record.instance_fingerprint, expected)) {
    return fail(
      'mismatch',
      `${where} publishes another pairing fingerprint than instance '${layout.instance}' and its token give: ` +
        'another agent answers there, or this one runs with an older token (restart it)',
    );
  }
  return { ok: true, facts: [`the agent answers on ${where} with the expected pairing fingerprint`] };
}

/** act.ts ActPorts.verifyAgent's result shape (structural: this file does not import act.ts). */
export interface VerifyPortResult {
  readonly outcome: 'done' | 'failed';
  readonly reason?: string;
}

/** A VerifyResult as the act loop records it: the reason plus the commands to run. */
export function verifyPortResult(result: VerifyResult): VerifyPortResult {
  if (result.ok) return { outcome: 'done' };
  return { outcome: 'failed', reason: `${result.reason}; see: ${result.commands.join(' ; ')}` };
}
