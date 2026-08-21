/**
 * READ_STREAM READER-RELEASE CONTRACT — client/dedalo/core/common/js/data_manager.js
 *
 * WHY THIS FILE EXISTS. `read_stream` pushes its reader into the shared
 * `page_globals.stream_readers` registry and nothing ever pruned it:
 *
 *  1. On `done` it logged, called `on_done(true)` and returned — the entry
 *     stayed forever, so the array grew by one per stream for the page's life.
 *  2. Its `.catch` only did `console.error(error)`. `on_done` NEVER fired, so a
 *     consumer waiting on it waited forever — `job_follow` calls `finish()` from
 *     `on_done`, so a dropped connection mid-job left the caller with no outcome
 *     and no error, indistinguishable from a job still running. The reader stayed
 *     registered too, holding one of the browser's six per-origin HTTP/1.1
 *     connections against a stream that was already over. The file's own doc
 *     warns that six of those starve the origin, `/health` included.
 *
 * WHAT IS PINNED (contract, not implementation):
 *  A. Normal completion releases the reader and fires on_done(true).
 *  B. A read FAILURE fires on_done exactly once (with false) and releases too.
 *  C. The registry does not grow across many sequential streams.
 *  D. Frames still reach on_read: the release must not truncate delivery.
 *  E. on_done fires exactly ONCE even when the consumer's own on_done throws.
 *     The .catch sits on the SAME promise chain as the success handler, so an
 *     unguarded implementation calls the consumer a second time — with a log
 *     blaming a transport failure that never happened.
 *  F. A cancel() that REJECTS (the spec behaviour on an errored stream) does not
 *     produce an unhandled rejection, and does not stop on_done.
 *  G. The reader is released BEFORE on_done fires, so a consumer starting another
 *     stream from its completion handler sees a clean registry.
 *
 * HARNESS. Bun has a native ReadableStream, so these are REAL streams carrying
 * real SSE framing (`data:\n<json>\n\n`) — no stream fake. ui.js is masked for
 * the same reason as the sibling client gates. No DB, no network, no creds.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { join } from 'node:path';

const CLIENT_COMMON = join(import.meta.dir, '..', '..', 'client', 'dedalo', 'core', 'common', 'js');
const DATA_MANAGER_PATH = join(CLIENT_COMMON, 'data_manager.js');

type DataManager = {
	read_stream: (
		stream: ReadableStream,
		on_read: (frame: unknown, reader?: unknown) => void,
		on_done: (ok?: boolean) => void,
	) => unknown;
};

const globals = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};
let data_manager: DataManager;
let real_console_log: typeof console.log;
let real_console_error: typeof console.error;

const encoder = new TextEncoder();
/** one complete SSE message, exactly as the server frames it */
const sse = (payload: unknown) => encoder.encode(`data:\n${JSON.stringify(payload)}\n\n`);

/** a real ReadableStream that emits the given frames then closes */
const stream_of = (frames: Uint8Array[]) =>
	new ReadableStream({
		start(controller) {
			for (const f of frames) controller.enqueue(f);
			controller.close();
		},
	});

/**
 * A stream whose reader delivers `frames` and then REJECTS — the exact seam
 * read_stream consumes (`stream.getReader()`, then `reader.read()`).
 *
 * Deliberately not a real ReadableStream: erroring one from inside `pull`
 * surfaces the rejection through the stream's own machinery before read_stream's
 * catch can see it, which tests Bun's plumbing rather than this contract. Failing
 * at `read()` is what a dropped connection actually looks like to this code.
 */
const stream_that_fails = (frames: Uint8Array[]) => {
	let i = 0;
	const reader = {
		read: () =>
			i < frames.length
				? Promise.resolve({ value: frames[i++], done: false })
				: Promise.reject(new Error('connection dropped mid-stream')),
		cancel: () => Promise.resolve(),
	};
	return { getReader: () => reader } as unknown as ReadableStream;
};

const registry = () => globals.page_globals as { stream_readers: unknown[] };

/** resolves when on_done fires, or rejects loudly — the pre-fix hang must not stall the suite */
const run_stream = (stream: ReadableStream, timeout_ms = 3000) =>
	new Promise<{ frames: unknown[]; ok: unknown }>((resolve, reject) => {
		const frames: unknown[] = [];
		const timer = setTimeout(
			() => reject(new Error(`TIMEOUT ${timeout_ms}ms: on_done never fired — the pre-fix hang`)),
			timeout_ms,
		);
		data_manager.read_stream(
			stream,
			(frame) => frames.push(frame),
			(ok) => {
				clearTimeout(timer);
				resolve({ frames, ok });
			},
		);
	});

beforeAll(async () => {
	for (const key of ['page_globals', 'SHOW_DEBUG', 'window', 'DEDALO_API_URL'])
		saved[key] = globals[key];

	globals.page_globals = { dedalo_data_lang: 'lg-eng', stream_readers: [] };
	globals.SHOW_DEBUG = false;
	globals.DEDALO_API_URL = '/api/v1/json/';
	globals.window = globalThis;

	mock.module(join(CLIENT_COMMON, 'ui.js'), () => ({
		ui: {
			create_dom_element: () => ({ classList: { add() {}, remove() {} }, addEventListener() {} }),
			show_message: () => {},
		},
	}));

	data_manager = ((await import(DATA_MANAGER_PATH)) as { data_manager: DataManager }).data_manager;

	real_console_log = console.log;
	real_console_error = console.error;
});

afterAll(() => {
	console.log = real_console_log;
	console.error = real_console_error;
	for (const key of Object.keys(saved)) {
		if (saved[key] === undefined) delete globals[key];
		else globals[key] = saved[key];
	}
	mock.restore();
});

beforeEach(() => {
	registry().stream_readers.length = 0;
	// read_stream is chatty by design; keep the suite output readable
	console.log = () => {};
	console.error = () => {};
});

describe('read_stream — normal completion releases the reader (A, D)', () => {
	test('on_done fires and page_globals.stream_readers is left empty', async () => {
		const { frames, ok } = await run_stream(
			stream_of([sse({ msg: 'one', is_running: true }), sse({ msg: 'two', is_running: false })]),
		);

		expect(ok).toBe(true);
		// the synthetic 'Preparing data...' frame plus the two real ones
		expect(frames.length).toBe(3);

		// pre-fix: 1 — the reader stayed registered forever
		expect(registry().stream_readers.length).toBe(0);
	});
});

describe('read_stream — a failed read still ends the stream (B)', () => {
	test('on_done fires exactly once with false, and the reader is released', async () => {
		let done_calls = 0;

		const result = await new Promise<unknown>((resolve, reject) => {
			const timer = setTimeout(
				() =>
					reject(new Error('TIMEOUT: on_done never fired after a read failure — the pre-fix hang')),
				3000,
			);
			data_manager.read_stream(
				stream_that_fails([sse({ msg: 'first', is_running: true })]),
				() => {},
				(ok) => {
					done_calls++;
					clearTimeout(timer);
					resolve(ok);
				},
			);
		});

		// pre-fix the catch only console.error'd: on_done never ran and job_follow's
		// finish() was never called — the caller hung with no outcome
		expect(result).toBe(false);
		expect(registry().stream_readers.length).toBe(0);

		// give any stray continuation a chance to double-fire
		await new Promise((r) => setTimeout(r, 20));
		expect(done_calls).toBe(1);
	});
});

describe('read_stream — the registry does not grow (C)', () => {
	test('after several sequential streams the shared registry is still empty', async () => {
		for (let i = 0; i < 5; i++) {
			await run_stream(stream_of([sse({ msg: `run_${i}`, is_running: false })]));
		}

		// pre-fix: 5 leaked readers, each holding a per-origin connection slot
		expect(registry().stream_readers.length).toBe(0);
	});

	test('a foreign reader in the registry is left alone', async () => {
		const foreign = { cancel: () => {} };
		registry().stream_readers.push(foreign);

		await run_stream(stream_of([sse({ msg: 'x', is_running: false })]));

		// release_stream_reader splices by IDENTITY: other consumers' readers
		// (make_backup, unit_test, the move_* widgets, tool_diffusion, job_follow)
		// must survive another stream finishing
		expect(registry().stream_readers).toEqual([foreign]);
	});
});

describe('read_stream — a throwing consumer callback cannot double-end the stream (E, G)', () => {
	test('on_done that throws is reported once, never re-entered', async () => {
		let done_calls = 0;
		const registry_sizes: number[] = [];

		data_manager.read_stream(
			stream_of([sse({ msg: 'only', is_running: false })]),
			() => {},
			() => {
				done_calls++;
				// (G) the release must already have happened when we are called
				registry_sizes.push(registry().stream_readers.length);
				throw new Error('consumer render blew up');
			},
		);

		await new Promise((r) => setTimeout(r, 50));

		// unguarded, the throw rejects the chain, the .catch runs and calls
		// on_done(false) — a second completion plus a bogus "read failed" log
		expect(done_calls).toBe(1);
		expect(registry_sizes).toEqual([0]);
		expect(registry().stream_readers.length).toBe(0);
	});

	test('a throwing on_read ends the stream once, through the abnormal path', async () => {
		let done_calls = 0;
		let done_arg: unknown = 'unset';

		data_manager.read_stream(
			stream_of([sse({ msg: 'boom', is_running: true })]),
			(frame) => {
				// the synthetic 'Preparing data...' frame arrives first; throw on the real one
				if ((frame as { data?: { msg?: string } })?.data?.msg === undefined) {
					throw new Error('consumer on_read blew up');
				}
			},
			(ok) => {
				done_calls++;
				done_arg = ok;
			},
		);

		await new Promise((r) => setTimeout(r, 50));

		expect(done_calls).toBe(1);
		expect(done_arg).toBe(false);
		expect(registry().stream_readers.length).toBe(0);
	});
});

describe('read_stream — a rejecting cancel() is handled (F)', () => {
	test('no unhandled rejection escapes, and on_done still fires once', async () => {
		const unhandled: unknown[] = [];
		const on_unhandled = (reason: unknown) => unhandled.push(reason);
		process.on('unhandledRejection', on_unhandled);

		let done_calls = 0;
		try {
			// spec: cancel() on an ERRORED stream returns a promise rejected with the
			// stored error. release_stream_reader must not leave that dangling.
			let i = 0;
			const frames = [sse({ msg: 'first', is_running: true })];
			const reader = {
				read: () =>
					i < frames.length
						? Promise.resolve({ value: frames[i++], done: false })
						: Promise.reject(new Error('connection dropped mid-stream')),
				cancel: () => Promise.reject(new Error('cancel on an errored stream')),
			};

			data_manager.read_stream(
				{ getReader: () => reader } as unknown as ReadableStream,
				() => {},
				() => {
					done_calls++;
				},
			);

			await new Promise((r) => setTimeout(r, 80));
		} finally {
			process.off('unhandledRejection', on_unhandled);
		}

		expect(done_calls).toBe(1);
		expect(unhandled).toEqual([]);
		expect(registry().stream_readers.length).toBe(0);
	});
});
