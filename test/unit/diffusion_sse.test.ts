/**
 * Diffusion SSE wire — golden gates against the PINNED old-engine shapes
 * (test/parity/fixtures/diffusion/pinned.ts; DIFFUSION_PLAN D3-P0 gate).
 *
 * The fixtures carry INDEPENDENT literal copies of the old engine's constants
 * and payloads — these tests are the tripwire that a refactor of sse.ts moved
 * the wire instead of preserving it. Pure tests: no DB, no timers.
 */

import { describe, expect, test } from 'bun:test';
import type { DiffusionJobRow } from '../../src/diffusion/jobs/queue.ts';
import {
	encodeSseChunk,
	encodeSseCommentHeartbeat,
	formatElapsed,
	notFoundProgressData,
	progressDataFromJob,
	sseResponseHeaders,
} from '../../src/diffusion/jobs/sse.ts';
import {
	CANCELLED_MSG,
	PINNED_CANCEL_MISS,
	PINNED_CANCEL_OK,
	PINNED_FINISHED_CHUNK,
	PINNED_NOT_FOUND_CHUNK_SHAPE,
	PINNED_RUNNING_CHUNK,
	PINNED_TOTAL_TIME_CASES,
	PROGRESS_DATA_DATA_KEYS_REQUIRED,
	PROGRESS_DATA_KEYS,
	SSE_PAD_LENGTH,
} from '../parity/fixtures/diffusion/pinned.ts';

/** Build a job row as the queue returns it (jsonb parsed, dates as Date). */
function fakeJob(overrides: Partial<DiffusionJobRow>): DiffusionJobRow {
	return {
		job_id: '00000000-0000-4000-8000-000000000001',
		client_process_id: 'process_diffusion_8_test1_test3',
		owner_user_id: 8,
		kind: 'diffuse',
		spec: {
			diffusion_element_tipo: 'test1',
			section_tipo: 'test3',
			type: 'sql',
			sqo: {},
			estimated_total: 10,
			options: {},
		},
		state: 'running',
		checkpoint: {},
		totals: { counter: 0, total: 10, msg: 'Starting diffusion...' },
		errors: [],
		result: null,
		cancel_requested: false,
		attempt: 1,
		max_attempts: 3,
		runner: {},
		heartbeat_at: null,
		created_at: new Date(1751700000000),
		started_at: new Date(1751700000000),
		finished_at: null,
		...overrides,
	};
}

describe('SSE chunk framing (verbatim old engine)', () => {
	test('chunk = "data:\\n{json}" padded to 16384 + "\\n\\n"', () => {
		const chunk = encodeSseChunk(notFoundProgressData('x'));
		const text = new TextDecoder().decode(chunk);
		expect(text.startsWith('data:\n{')).toBe(true);
		expect(text.endsWith('\n\n')).toBe(true);
		// Padded body: exactly SSE_PAD_LENGTH before the terminator.
		expect(text.length).toBe(SSE_PAD_LENGTH + 2);
		// The JSON survives the trailing-space padding.
		const parsed = JSON.parse(text.slice('data:\n'.length));
		expect(parsed.data.msg).toBe('Process not found');
	});

	test('an oversized payload is NOT truncated (padding only applies below the boundary)', () => {
		const big = notFoundProgressData('x');
		big.data.msg = 'y'.repeat(SSE_PAD_LENGTH);
		const text = new TextDecoder().decode(encodeSseChunk(big));
		expect(text.length).toBeGreaterThan(SSE_PAD_LENGTH + 2);
		expect(JSON.parse(text.slice('data:\n'.length)).data.msg.length).toBe(SSE_PAD_LENGTH);
	});

	test('comment heartbeat and response headers match the pinned wire', () => {
		expect(new TextDecoder().decode(encodeSseCommentHeartbeat())).toBe(':\n');
		expect(sseResponseHeaders()).toEqual({
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, must-revalidate',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no',
		});
	});
});

describe('progress_data projection (job row → pinned client shape)', () => {
	test('a mid-run job serializes exactly like the pinned running chunk', () => {
		const projected = progressDataFromJob(
			fakeJob({
				totals: {
					counter: 3,
					total: 10,
					msg: 'Processing records 3 of 10...',
					current: { section_id: 3, time: 120 },
					total_ms: 3600,
				},
			}),
		);
		// Key order is part of the pin (the old engine serialized declaration order).
		expect(Object.keys(projected)).toEqual([...PROGRESS_DATA_KEYS]);
		expect(projected.process_id).toBe(PINNED_RUNNING_CHUNK.process_id);
		expect(projected.is_running).toBe(true);
		expect(projected.started_at).toBe(PINNED_RUNNING_CHUNK.started_at);
		expect(projected.data.msg).toBe(PINNED_RUNNING_CHUNK.data.msg);
		expect(projected.data.counter).toBe(3);
		expect(projected.data.total).toBe(10);
		expect(projected.data.current).toEqual({ section_id: 3, time: 120 });
		expect(projected.data.total_ms).toBe(3600);
		expect(projected.errors).toEqual([]);
		expect(projected.result).toBeUndefined();
		for (const key of PROGRESS_DATA_DATA_KEYS_REQUIRED) {
			expect(projected.data).toHaveProperty(key);
		}
	});

	test('a completed job carries the embedded result like the pinned finished chunk', () => {
		const projected = progressDataFromJob(
			fakeJob({
				state: 'completed',
				totals: { counter: 10, total: 10, msg: 'OK. Diffusion done' },
				result: PINNED_FINISHED_CHUNK.result as unknown as Record<string, unknown>,
				finished_at: new Date(1751700012000),
			}),
		);
		expect(projected.is_running).toBe(false);
		expect(projected.total_time).toBe('12 sec');
		expect(projected.result).toEqual(
			PINNED_FINISHED_CHUNK.result as unknown as Record<string, unknown>,
		);
		expect(projected.data.msg).toBe('OK. Diffusion done');
	});

	test('a file-producing result surfaces diffusion_data inside data (finish_process parity)', () => {
		const projected = progressDataFromJob(
			fakeJob({
				state: 'completed',
				finished_at: new Date(1751700012000),
				result: {
					result: true,
					msg: 'OK',
					diffusion_data: [{ file_url: '/media/rdf/x_1.rdf' }],
					consolidated_files: { merged_url: '/m.rdf', zip_url: '/m.zip' },
				},
			}),
		);
		expect(projected.data.diffusion_data).toEqual([{ file_url: '/media/rdf/x_1.rdf' }]);
		expect(projected.data.consolidated_files).toEqual({
			merged_url: '/m.rdf',
			zip_url: '/m.zip',
		});
		expect(projected.data.last_update_record_response).toEqual({
			result: true,
			msg: ['OK'],
			errors: [],
			class: 'diffusion_rdf',
			diffusion_data: [{ file_url: '/media/rdf/x_1.rdf' }],
		});
	});

	test('a cancelled job reads as the pinned cancellation surfaces', () => {
		const projected = progressDataFromJob(
			fakeJob({
				state: 'cancelled',
				totals: { counter: 2, total: 10, msg: CANCELLED_MSG },
				errors: [CANCELLED_MSG],
				result: { result: false, msg: CANCELLED_MSG },
				finished_at: new Date(1751700002000),
			}),
		);
		expect(projected.is_running).toBe(false);
		expect(projected.data.msg).toBe(CANCELLED_MSG);
		expect(projected.errors).toContain(CANCELLED_MSG);
	});

	test('not-found chunk matches the pinned terminal shape', () => {
		const chunk = notFoundProgressData('process_diffusion_8_x_y');
		expect(chunk.is_running).toBe(PINNED_NOT_FOUND_CHUNK_SHAPE.is_running);
		expect(chunk.data).toEqual({ ...PINNED_NOT_FOUND_CHUNK_SHAPE.data });
		expect(chunk.total_time).toBe(PINNED_NOT_FOUND_CHUNK_SHAPE.total_time);
		expect(chunk.errors).toEqual([...PINNED_NOT_FOUND_CHUNK_SHAPE.errors]);
	});
});

describe('format_elapsed parity', () => {
	test('all pinned branches', () => {
		for (const [ms, expected] of PINNED_TOTAL_TIME_CASES) {
			expect(formatElapsed(ms)).toBe(expected);
		}
	});
});

describe('cancel_process message shapes', () => {
	test('pinned ok / miss messages', () => {
		expect(PINNED_CANCEL_OK('p1')).toEqual({ result: true, msg: 'Process p1 cancelled' });
		expect(PINNED_CANCEL_MISS('p1')).toEqual({
			result: false,
			msg: 'Process p1 not found or not running',
		});
	});
});
