/**
 * LEAD-1b G7, codec half (commit C1) — THE FRAME CODEC ROUND-TRIPS, AND REFUSES BEFORE IT BUFFERS.
 *
 * Written BEFORE the implementation (audits/2026-09-26_full/LEAD-1b_SPEC.md §6); every row
 * is red on the pre-LEAD-1b HEAD, and says why.
 *
 * The run's spec travels over the accepted connection (spec §2.3): 1 type byte, u32 BE length,
 * payload; H {v, door, unit} · S {v, door, argv, env, hostNetns} · O / E · X {code, signal}.
 * The reference byte format the codec is checked against is `support/lead1b_host.ts`'s own,
 * written from the spec — never the daemon's codec checking itself.
 *
 * Written red-first against 75ccb35a38 (the pre-LEAD-1b HEAD); parked as `.gate.ts` until
 * the implementation it gates landed, and renamed into the suite by that same change.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { contractExport, sweepScratch } from './support/lead1b_contract';
import { frame, MAX_CHUNK_BYTES } from './support/lead1b_host';

afterEach(sweepScratch);

const FRAMES = 'drivers/unit_frames.ts';

type Decoded = { type: string; payload: Uint8Array };

/** The daemon codec's frames, normalised (a type may be a char or a byte). */
async function codec(): Promise<{
  encode: (type: string, payload: Uint8Array) => Uint8Array;
  decodeAll: (chunks: readonly Uint8Array[]) => Decoded[];
}> {
  const encodeFrame = await contractExport<(type: string, payload: Uint8Array) => Uint8Array>(FRAMES, 'encodeFrame');
  const FrameDecoder = await contractExport<new () => { push(chunk: Uint8Array): Array<{ type: string | number; payload: Uint8Array }>; end(): void }>(
    FRAMES,
    'FrameDecoder',
  );
  return {
    encode: (type, payload) => encodeFrame(type, payload),
    decodeAll: chunks => {
      const decoder = new FrameDecoder();
      const out: Decoded[] = [];
      for (const chunk of chunks) {
        for (const decoded of decoder.push(chunk)) {
          out.push({ type: typeof decoded.type === 'number' ? String.fromCharCode(decoded.type) : decoded.type, payload: new Uint8Array(decoded.payload) });
        }
      }
      decoder.end();
      return out;
    },
  };
}

/** A deterministic PRNG, so a red fuzz row is reproducible. */
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

describe('G7 — the frame codec', () => {
  test('encodeFrame is exactly: 1 type byte, u32 big-endian length, payload', async () => {
    const { encode } = await codec();
    for (const [type, payload] of [
      ['O', Buffer.from('hello')],
      ['E', Buffer.alloc(0)],
      ['X', Buffer.from(JSON.stringify({ code: 0, signal: null }))],
      ['O', Buffer.alloc(MAX_CHUNK_BYTES, 7)],
    ] as const) {
      expect(Buffer.from(encode(type, payload)).equals(frame(type, payload))).toBe(true);
    }
  });

  test('round trip, fuzzed: random frames, split at random boundaries (one byte at a time included)', async () => {
    const { encode, decodeAll } = await codec();
    const random = prng(0x1b1b);
    for (let round = 0; round < 60; round++) {
      const sent: Decoded[] = [];
      for (let i = 0; i < 1 + Math.floor(random() * 8); i++) {
        const type = (['O', 'E', 'X', 'H', 'S'] as const)[Math.floor(random() * 5)] as string;
        const size = type === 'O' || type === 'E' ? Math.floor(random() * 3000) : Math.floor(random() * 200);
        const payload = new Uint8Array(size).map(() => Math.floor(random() * 256));
        sent.push({ type, payload });
      }
      const wire = Buffer.concat(sent.map(({ type, payload }) => Buffer.from(encode(type, payload))));
      const chunks: Uint8Array[] = [];
      for (let at = 0; at < wire.length; ) {
        const step = round % 7 === 0 ? 1 : 1 + Math.floor(random() * 700);
        chunks.push(wire.subarray(at, at + step));
        at += step;
      }
      const got = decodeAll(chunks);
      expect(got.map(({ type, payload }) => [type, Buffer.from(payload).toString('hex')])).toEqual(
        sent.map(({ type, payload }) => [type, Buffer.from(payload).toString('hex')]),
      );
    }
  });

  test('refused: an unknown type, a length over the cap (at the HEADER), a truncated frame', async () => {
    const { decodeAll } = await codec();
    const unknown = Buffer.concat([Buffer.from('Z'), Buffer.from([0, 0, 0, 1]), Buffer.from('x')]);
    expect(() => decodeAll([unknown])).toThrow();
    // Only the 5-byte header is sent: a decoder that waited for 2 MiB before refusing would
    // have let the peer make it buffer them.
    const oversizeHeader = Buffer.concat([Buffer.from('S'), Buffer.from([0, 0x20, 0, 0])]);
    expect(() => decodeAll([oversizeHeader])).toThrow();
    // An output chunk over its own (smaller) cap is refused at the header too.
    const oversizeOutput = Buffer.concat([Buffer.from('O'), Buffer.alloc(4)]);
    oversizeOutput.writeUInt32BE(MAX_CHUNK_BYTES + 1, 1);
    expect(() => decodeAll([oversizeOutput])).toThrow();
    const truncated = frame('O', Buffer.from('hello')).subarray(0, 7);
    expect(() => decodeAll([truncated])).toThrow();
  });

  test('parseSpec is a CLOSED schema: v1, a door, argv, env (strings), hostNetns — nothing else, ≤ 1 MiB', async () => {
    const parseSpec = await contractExport<(payload: Uint8Array) => unknown>(FRAMES, 'parseSpec');
    const good = { v: 1, door: 'git', argv: ['git', 'status'], env: { PATH: '/usr/bin' }, hostNetns: 'net:[4026531840]' };
    const bytes = (value: unknown) => Buffer.from(JSON.stringify(value));
    expect(() => parseSpec(bytes(good))).not.toThrow();
    for (const [what, bad] of [
      ['an extra key', { ...good, uid: 0 }],
      ['v 2', { ...good, v: 2 }],
      ['an unknown door', { ...good, door: 'root' }],
      ['argv empty', { ...good, argv: [] }],
      ['argv not strings', { ...good, argv: ['git', 1] }],
      ['env not strings', { ...good, env: { PATH: 1 } }],
      ['no hostNetns', { v: 1, door: 'git', argv: ['git'], env: {} }],
      ['not JSON', null],
    ] as const) {
      const payload = bad === null ? Buffer.from('{not json') : bytes(bad);
      const threw = (() => {
        try {
          parseSpec(payload);
          return false;
        } catch {
          return true;
        }
      })();
      expect({ what, threw }).toEqual({ what, threw: true });
    }
    const huge = { ...good, env: { BIG: 'x'.repeat(1024 * 1024) } };
    expect(() => parseSpec(bytes(huge))).toThrow();
  });

  test('FIXED_ENV_KEYS names what the unit fixes', async () => {
    const fixed = await contractExport<Iterable<string>>(FRAMES, 'FIXED_ENV_KEYS');
    const list = [...fixed];
    for (const key of ['HOME', 'BUN_RUNTIME_TRANSPILER_CACHE_PATH', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM']) expect(list).toContain(key);
    expect(list.some(key => key === 'DEDALO_*' || key.startsWith('DEDALO_'))).toBe(true);
  });
});
