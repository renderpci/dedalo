/**
 * THE FRAME PROTOCOL between the daemon and a confined unit's shim (LEAD-1b, spec §2.3).
 *
 * A confined run is a socket-activated unit root rendered for (site k, door d). The daemon
 * starts nothing: it connect()s ONCE to the site's socket, PID 1 accepts the connection into
 * a fresh instance of the unit (`User=` the site's identity), and the unit's ExecStart — the
 * shim (`egress_shim.ts`) — speaks this protocol over it. The run's argv, its environment and
 * its secrets travel over that connection and nowhere else: no file is written for PID 1 to
 * read, no property carries them (a unit's properties are readable by every uid).
 *
 * A FRAME is 1 type byte, a u32 big-endian payload length, then the payload:
 *
 *   H  shim → daemon, first:  {v:1, door, unit}          the instance PID 1 started
 *   S  daemon → shim, once:   {v:1, door, argv, env, hostNetns}   CLOSED schema, ≤ 1 MiB
 *   O  shim → daemon:         child stdout bytes, ≤ 64 KiB per frame
 *   E  shim → daemon:         child stderr bytes, ≤ 64 KiB per frame
 *   X  shim → daemon, last:   {code, signal}              the status of record
 *
 * THE DECODER REFUSES BEFORE IT BUFFERS: an unknown type or a declared length over its type's
 * cap is refused at the 5-byte header, so a peer cannot make either side hold megabytes it
 * never intended to accept. A stream that ends inside a frame is refused too (`end()`).
 *
 * THE CHILD NEVER HOLDS THE CONNECTION (the shim runs it with piped stdio), so the bytes it
 * writes arrive INSIDE O frames: a child that prints something shaped like an X frame forges
 * nothing. A connection that ends WITHOUT an X is a failed run, never exit 0 (the daemon's
 * rule, `confinement.ts`).
 *
 * BUILTINS ONLY: the shim imports it inside the unit, and the repo tripwire directly.
 */

import { DOORS, type ConfinementDoor } from './network_profile';

export const FRAME_TYPES = ['H', 'S', 'O', 'E', 'X'] as const;
export type FrameType = (typeof FRAME_TYPES)[number];

/** The spec frame's cap: argv + env + the rest, as JSON. */
export const MAX_SPEC_BYTES = 1024 * 1024;
/** One output chunk's cap (O and E). */
export const MAX_CHUNK_BYTES = 64 * 1024;
/** H and X are a few dozen bytes of JSON; the cap is generous and still a bound. */
export const MAX_CONTROL_BYTES = 64 * 1024;

const HEADER_BYTES = 5;

/** The cap each type is refused above, AT THE HEADER. */
export const FRAME_CAPS: Readonly<Record<FrameType, number>> = Object.freeze({
  H: MAX_CONTROL_BYTES,
  S: MAX_SPEC_BYTES,
  O: MAX_CHUNK_BYTES,
  E: MAX_CHUNK_BYTES,
  X: MAX_CONTROL_BYTES,
});

export interface Frame {
  readonly type: FrameType;
  readonly payload: Uint8Array;
}

/** A refusal of the wire itself: the peer is not speaking this protocol. */
export class FrameError extends Error {
  constructor(message: string) {
    super(`unit frames: ${message}`);
    this.name = 'FrameError';
  }
}

function isFrameType(value: string): value is FrameType {
  return (FRAME_TYPES as readonly string[]).includes(value);
}

/** One frame's bytes. Refuses a type it does not know and a payload over its type's cap. */
export function encodeFrame(type: string, payload: Uint8Array | string): Uint8Array {
  if (!isFrameType(type)) throw new FrameError(`unknown frame type '${type}'`);
  const body = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
  if (body.length > FRAME_CAPS[type]) {
    throw new FrameError(`a '${type}' frame of ${body.length} bytes is over its ${FRAME_CAPS[type]}-byte cap`);
  }
  const out = new Uint8Array(HEADER_BYTES + body.length);
  out[0] = type.charCodeAt(0);
  new DataView(out.buffer).setUint32(1, body.length, false);
  out.set(body, HEADER_BYTES);
  return out;
}

/** A JSON frame (H, S, X). */
export function encodeJsonFrame(type: 'H' | 'S' | 'X', value: unknown): Uint8Array {
  return encodeFrame(type, JSON.stringify(value));
}

/**
 * THE INCREMENTAL DECODER. `push()` returns every frame the bytes so far complete, and
 * THROWS (FrameError) on an unknown type or an over-cap length as soon as the 5-byte header
 * is in — never after buffering the payload. `end()` throws when the stream stopped inside a
 * frame.
 */
export class FrameDecoder {
  private buffer: Uint8Array = new Uint8Array(0);
  private failed = false;

  push(chunk: Uint8Array): Frame[] {
    if (this.failed) throw new FrameError('the stream was already refused');
    const next = new Uint8Array(this.buffer.length + chunk.length);
    next.set(this.buffer, 0);
    next.set(chunk, this.buffer.length);
    this.buffer = next;
    const out: Frame[] = [];
    for (;;) {
      if (this.buffer.length < 1) return out;
      const type = String.fromCharCode(this.buffer[0] as number);
      if (!isFrameType(type)) {
        this.failed = true;
        throw new FrameError(`unknown frame type 0x${(this.buffer[0] as number).toString(16)}`);
      }
      if (this.buffer.length < HEADER_BYTES) return out;
      const length = new DataView(this.buffer.buffer, this.buffer.byteOffset, HEADER_BYTES).getUint32(1, false);
      if (length > FRAME_CAPS[type]) {
        this.failed = true;
        throw new FrameError(`a '${type}' frame declares ${length} bytes, over its ${FRAME_CAPS[type]}-byte cap`);
      }
      if (this.buffer.length < HEADER_BYTES + length) return out;
      out.push({ type, payload: this.buffer.slice(HEADER_BYTES, HEADER_BYTES + length) });
      this.buffer = this.buffer.slice(HEADER_BYTES + length);
    }
  }

  /** Bytes held that do not yet make a frame. */
  get pending(): number {
    return this.buffer.length;
  }

  /** The stream ended: anything still held is a truncated frame, and a refusal. */
  end(): void {
    if (this.buffer.length > 0) {
      this.failed = true;
      throw new FrameError(`the stream ended inside a frame (${this.buffer.length} bytes held)`);
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The payloads — closed schemas
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * THE KEYS A UNIT FIXES — `render/agent_units.ts` renders them as `Environment=` and the spec
 * may not set them (the shim refuses a spec that does). `DEDALO_*` stands for the whole
 * namespace: every key the shim reads for itself is one.
 */
export const FIXED_ENV_KEYS: readonly string[] = Object.freeze([
  'HOME',
  'BUN_RUNTIME_TRANSPILER_CACHE_PATH',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_NOSYSTEM',
  'DEDALO_*',
]);

/** Is `key` one the unit fixes? */
export function isFixedEnvKey(key: string): boolean {
  return key.startsWith('DEDALO_') || FIXED_ENV_KEYS.includes(key);
}

export interface RunSpec {
  readonly v: 1;
  readonly door: ConfinementDoor;
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  /** The DAEMON's network namespace identity; the shim refuses to run anything inside it. */
  readonly hostNetns: string;
}

export interface Hello {
  readonly v: 1;
  readonly door: ConfinementDoor;
  /** The instance PID 1 started (`<prefix>s<k>-<d>@<nr>-<pid>-<uid>.service`). */
  readonly unit: string;
}

export interface ExitRecord {
  readonly code: number | null;
  readonly signal: string | null;
}

const SPEC_KEYS = ['argv', 'door', 'env', 'hostNetns', 'v'];

function parseJson(payload: Uint8Array, what: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payload));
  } catch (error) {
    throw new FrameError(`the ${what} frame is not JSON (${(error as Error).message})`);
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new FrameError(`the ${what} frame is not a JSON object`);
  }
  return value as Record<string, unknown>;
}

function isDoor(value: unknown): value is ConfinementDoor {
  return typeof value === 'string' && (DOORS as readonly string[]).includes(value);
}

/**
 * THE SPEC, closed: exactly `{v, door, argv, env, hostNetns}`, `v === 1`, a known door, a
 * non-empty argv of strings, an env of string values, a non-empty hostNetns — and nothing
 * else, in at most MAX_SPEC_BYTES. Anything else throws.
 */
export function parseSpec(payload: Uint8Array): RunSpec {
  if (payload.length > MAX_SPEC_BYTES) throw new FrameError(`the spec is ${payload.length} bytes, over ${MAX_SPEC_BYTES}`);
  const value = parseJson(payload, 'spec');
  const keys = Object.keys(value).sort();
  if (keys.length !== SPEC_KEYS.length || keys.some((key, index) => key !== SPEC_KEYS[index])) {
    throw new FrameError(`the spec's keys are [${keys.join(', ')}]; the schema is exactly [${SPEC_KEYS.join(', ')}]`);
  }
  if (value.v !== 1) throw new FrameError(`spec version ${String(value.v)} is not 1`);
  if (!isDoor(value.door)) throw new FrameError(`'${String(value.door)}' is not a door`);
  const argv = value.argv;
  if (!Array.isArray(argv) || argv.length === 0 || argv.some(entry => typeof entry !== 'string' || entry === '')) {
    throw new FrameError('argv must be a non-empty array of non-empty strings');
  }
  const env = value.env;
  if (env === null || typeof env !== 'object' || Array.isArray(env)) throw new FrameError('env must be an object');
  for (const [key, entry] of Object.entries(env as Record<string, unknown>)) {
    if (typeof entry !== 'string') throw new FrameError(`env '${key}' is not a string`);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new FrameError(`env key '${key}' is not an environment name`);
  }
  if (typeof value.hostNetns !== 'string' || value.hostNetns === '') throw new FrameError('hostNetns is missing');
  return Object.freeze({
    v: 1,
    door: value.door,
    argv: Object.freeze([...(argv as string[])]),
    env: Object.freeze({ ...(env as Record<string, string>) }),
    hostNetns: value.hostNetns,
  });
}

/** H, closed: `{v:1, door, unit}`. */
export function parseHello(payload: Uint8Array): Hello {
  const value = parseJson(payload, 'hello');
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== 'door,unit,v') throw new FrameError(`the hello's keys are [${keys.join(', ')}]`);
  if (value.v !== 1) throw new FrameError(`hello version ${String(value.v)} is not 1`);
  if (!isDoor(value.door)) throw new FrameError(`'${String(value.door)}' is not a door`);
  if (typeof value.unit !== 'string' || value.unit === '') throw new FrameError('the hello names no unit');
  return Object.freeze({ v: 1, door: value.door, unit: value.unit });
}

/** X, closed: `{code, signal}`. */
export function parseExit(payload: Uint8Array): ExitRecord {
  const value = parseJson(payload, 'exit');
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== 'code,signal') throw new FrameError(`the exit record's keys are [${keys.join(', ')}]`);
  const code = value.code;
  const signal = value.signal;
  if (!(code === null || (typeof code === 'number' && Number.isInteger(code)))) throw new FrameError('exit code is not an integer');
  if (!(signal === null || typeof signal === 'string')) throw new FrameError('exit signal is not a string');
  return Object.freeze({ code, signal });
}
