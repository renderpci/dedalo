/**
 * S2-34 streaming gate: the export NDJSON response must emit bytes AS each
 * protocol line is produced — never buffer the whole export before the first
 * byte leaves. Both export writers (legacy tool_export + unified diffusion
 * grid) now share ndjsonStream(); this pins its PULL-BASED contract directly,
 * DB-free and deterministic.
 *
 * Determinism note: a ReadableStream with the default count queuing strategy
 * has highWaterMark 1, so it pulls exactly one line ahead of the consumer.
 * After reading the first chunk, the generator has produced at most 2 lines —
 * proving it did NOT run to completion (buffer-whole) before the first byte.
 */

import { describe, expect, test } from 'bun:test';
import { ndjsonStream } from '../../src/diffusion/export/ndjson_stream.ts';

/** A generator that records each line as it is produced. */
function countingLines(count: number, produced: number[]): AsyncGenerator<Record<string, unknown>> {
	async function* gen(): AsyncGenerator<Record<string, unknown>> {
		for (let i = 0; i < count; i++) {
			produced.push(i);
			yield { t: i === 0 ? 'meta' : 'row', i };
		}
	}
	return gen();
}

describe('ndjsonStream (S2-34 incremental emission)', () => {
	test('emits the first line before the whole export is produced (not buffered)', async () => {
		const produced: number[] = [];
		const reader = ndjsonStream(countingLines(50, produced), 'test').getReader();
		const decoder = new TextDecoder();

		const first = await reader.read();
		expect(first.done).toBe(false);
		expect(JSON.parse(decoder.decode(first.value))).toEqual({ t: 'meta', i: 0 });
		// The keystone: only a bounded lead (<= highWaterMark ahead) was produced —
		// a buffer-whole implementation would show produced.length === 50 here.
		expect(produced.length).toBeLessThanOrEqual(2);

		await reader.cancel();
	});

	test('drains line-by-line to completion, in order', async () => {
		const produced: number[] = [];
		const reader = ndjsonStream(countingLines(5, produced), 'test').getReader();
		const decoder = new TextDecoder();
		const seen: number[] = [];
		for (;;) {
			const next = await reader.read();
			if (next.done) break;
			seen.push((JSON.parse(decoder.decode(next.value)) as { i: number }).i);
		}
		expect(seen).toEqual([0, 1, 2, 3, 4]);
	});

	test('a generator that throws mid-stream errors the stream (abort signal, no end line)', async () => {
		async function* boom(): AsyncGenerator<Record<string, unknown>> {
			yield { t: 'meta' };
			throw new Error('resolution failed');
		}
		const reader = ndjsonStream(boom(), 'test').getReader();
		const first = await reader.read();
		expect(first.done).toBe(false); // meta line delivered before the error
		await expect(reader.read()).rejects.toThrow('resolution failed');
	});

	test('cancel() returns the generator (releases resources)', async () => {
		let returned = false;
		async function* gen(): AsyncGenerator<Record<string, unknown>> {
			try {
				yield { t: 'meta' };
				yield { t: 'row' };
			} finally {
				returned = true;
			}
		}
		const reader = ndjsonStream(gen(), 'test').getReader();
		await reader.read();
		await reader.cancel();
		expect(returned).toBe(true);
	});
});
