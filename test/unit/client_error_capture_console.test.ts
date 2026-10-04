/**
 * error_capture.js records console.error calls (type 'console') under a COST
 * CONTRACT (see the module header): repeats collapse before any stack or
 * serialization, new entries are rate-limited, args are never deep-stringified,
 * and console entries never raise the page-wide error signal.
 *
 * Also gates the wire: the client type whitelist (tool_error_report.js) and
 * the server's strict schema enum must accept the same set, or every report
 * carrying a console entry is rejected.
 *
 * Runs the real module against a minimal window shim. DB-less → hermetic.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const CAPTURE = join(REPO_ROOT, 'client/dedalo/core/common/js/error_capture.js');

type Entry = { type: string; msg: string | null; stack: string | null; count: number };
type Win = EventTarget & { dedalo_js_errors?: Entry[]; dedalo_js_errors_dropped?: number };

const g = globalThis as unknown as { window?: Win };
const savedWindow = g.window;
const savedConsoleError = console.error;
let win: Win;
let signals = 0;

beforeAll(async () => {
	win = new EventTarget() as Win;
	g.window = win;
	win.addEventListener('dedalo_error_signal', () => signals++);
	console.error = () => {}; // silence: the wrapper calls the original first
	await import(`${CAPTURE}?console_capture_test`);
});

afterAll(() => {
	console.error = savedConsoleError;
	g.window = savedWindow;
});

describe('error_capture console.error recording', () => {
	test('records a console entry without raising the signal', () => {
		console.error('boom one', { a: 1 }, new Error('inner'));
		const entry = (win.dedalo_js_errors ?? []).find((e) => e.type === 'console');
		expect(entry).toBeDefined();
		expect(entry?.msg).toBe('boom one [object Object] Error: inner');
		expect(entry?.stack).toContain('inner');
		expect(signals).toBe(0);
	});

	test('a storm of identical calls collapses to one entry, stack computed once', () => {
		const original = Error.stackTraceLimit;
		let stackReads = 0;
		Object.defineProperty(Error, 'stackTraceLimit', {
			configurable: true,
			get: () => original,
			set: () => {
				stackReads++;
			},
		});
		try {
			for (let i = 0; i < 10_000; i++) console.error('storm');
		} finally {
			Object.defineProperty(Error, 'stackTraceLimit', {
				configurable: true,
				writable: true,
				value: original,
			});
		}
		const storm = (win.dedalo_js_errors ?? []).filter((e) => e.msg === 'storm');
		expect(storm.length).toBe(1);
		expect(storm[0]?.count).toBe(10_000);
		expect(stackReads).toBe(2); // set + restore, once
	});

	test('circular args are described, never stringified', () => {
		const circ: Record<string, unknown> = {};
		circ.self = circ;
		expect(() => console.error(circ)).not.toThrow();
	});

	test('new distinct entries are rate-limited', () => {
		for (let i = 0; i < 100; i++) console.error(`distinct ${i}`);
		expect(win.dedalo_js_errors_dropped ?? 0).toBeGreaterThan(0);
		expect((win.dedalo_js_errors ?? []).length).toBeLessThanOrEqual(50);
	});
});

describe('console type is accepted on both sides of the wire', () => {
	test('client whitelist and server enum agree', () => {
		const tool = readFileSync(
			join(REPO_ROOT, 'tools/tool_error_report/js/tool_error_report.js'),
			'utf8',
		);
		const schema = readFileSync(join(REPO_ROOT, 'src/core/error_report/schema.ts'), 'utf8');
		expect(tool).toContain("el.type==='console'");
		expect(schema).toMatch(/type: z\.enum\(\[[^\]]*'console'[^\]]*\]\)/);
	});
});
