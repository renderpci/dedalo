/**
 * THE CLIENT-ASSET MANIFEST IS COMPUTED ONCE, AT BOOT (audit PERF-13).
 *
 * `get_dedalo_files` is the service worker's pre-cache list. Building it walks
 * the whole client tree with `readdirSync` and then `statSync`s every
 * manifested file — thousands of synchronous syscalls. It ran on an
 * AUTHENTICATED REQUEST PATH, so every logged-in browser arriving after a
 * deploy bought the entire walk, and Bun serves every request from ONE event
 * loop: that walk stalls the whole installation, not just its own request.
 *
 * The finding's own remedy — "memoise on the mtime signature" — is circular,
 * because computing that signature IS the walk. So the walk happens once, at
 * boot, and the served answer is the frozen result.
 *
 * WHAT THIS GATE MEASURES IS WORK DONE, NOT SPELLING: `dedaloFilesManifestBuilds()`
 * counts how many times the DISK WALK ran, so "computed once" is an assertion
 * about the process, not about how the code reads. The corpus is the manifest
 * itself — every leg asserts how many entries it covered, because "one walk"
 * over an empty manifest would be satisfied by a broken walker.
 *
 * DEV MODE IS THE ONE RECOMPUTING POSTURE, and it has to be: client files DO
 * change under a running dev server, and `dedalo_version` is the SW cache key —
 * a frozen key there would keep a developer's browser on stale JS until
 * restart. That leg flips the real env key and restores it.
 */

import { afterEach, expect, test } from 'bun:test';
import {
	buildDedaloFilesResponse,
	dedaloFilesManifestBuilds,
	prewarmDedaloFilesManifest,
	resetDedaloFilesManifest,
} from '../../src/core/api/dedalo_files.ts';

/** Floor on the manifest — a "one walk" claim over nothing measures nothing. */
const MANIFEST_FLOOR = 100;

/** How many served requests each leg simulates. */
const REQUESTS = 25;

/**
 * The PRODUCTION posture, set explicitly rather than by unsetting the key: the
 * developer machine this suite runs on carries DEDALO_DEV_MODE=true in
 * ../private/.env, so deleting the process variable would leave dev mode ON
 * through the file half of readEnv's precedence — and every leg below would
 * measure the recomputing path while claiming to measure the frozen one.
 */
function withoutDevMode<T>(work: () => T): T {
	const saved = process.env.DEDALO_DEV_MODE;
	process.env.DEDALO_DEV_MODE = 'false';
	try {
		return work();
	} finally {
		if (saved === undefined) delete process.env.DEDALO_DEV_MODE;
		else process.env.DEDALO_DEV_MODE = saved;
	}
}

afterEach(() => {
	resetDedaloFilesManifest();
});

test('25 requests walk the disk ONCE (and the manifest is real)', () => {
	withoutDevMode(() => {
		resetDedaloFilesManifest();
		expect(dedaloFilesManifestBuilds()).toBe(0);

		let entries = 0;
		for (let i = 0; i < REQUESTS; i++) entries = buildDedaloFilesResponse().result.length;

		expect(entries, 'the manifest is empty — the walk is broken, not fast').toBeGreaterThan(
			MANIFEST_FLOOR,
		);
		expect(
			dedaloFilesManifestBuilds(),
			`the client tree was walked once per request (${REQUESTS} requests) — the manifest is not frozen`,
		).toBe(1);
	});
});

test('the frozen manifest is the SAME object, and it cannot be mutated by a caller', () => {
	withoutDevMode(() => {
		resetDedaloFilesManifest();
		const first = buildDedaloFilesResponse();
		const second = buildDedaloFilesResponse();
		expect(second).toBe(first); // identity: one shared answer
		expect(Object.isFrozen(first)).toBe(true);
		expect(Object.isFrozen(first.result)).toBe(true);
		// A handler that pushed into the shared list would corrupt every later
		// response; frozen means it throws or no-ops instead.
		expect(() => (first.result as unknown as { push: (x: unknown) => void }).push({})).toThrow();
		expect(buildDedaloFilesResponse().result.length).toBe(first.result.length);
	});
});

test('BOOT prewarm means the first request pays nothing', () => {
	withoutDevMode(() => {
		resetDedaloFilesManifest();
		prewarmDedaloFilesManifest();
		expect(dedaloFilesManifestBuilds()).toBe(1);
		// The request that arrives after boot adds no walk.
		buildDedaloFilesResponse();
		expect(dedaloFilesManifestBuilds()).toBe(1);
		// Prewarming twice (a double boot path) is idempotent.
		prewarmDedaloFilesManifest();
		expect(dedaloFilesManifestBuilds()).toBe(1);
	});
});

test('DEV MODE recomputes per call — the SW cache key must follow an edited file', () => {
	const saved = process.env.DEDALO_DEV_MODE;
	process.env.DEDALO_DEV_MODE = 'true';
	try {
		resetDedaloFilesManifest();
		const manifest = buildDedaloFilesResponse();
		expect(manifest.result.length).toBeGreaterThan(MANIFEST_FLOOR);
		for (let i = 0; i < 3; i++) buildDedaloFilesResponse();
		expect(
			dedaloFilesManifestBuilds(),
			'dev mode stopped recomputing — an edited client file would keep serving a stale cache key',
		).toBe(4);
	} finally {
		if (saved === undefined) delete process.env.DEDALO_DEV_MODE;
		else process.env.DEDALO_DEV_MODE = saved;
	}
});

test('the flag is read PER CALL, never captured at module load', () => {
	// The posture must be the one the server is running under. A module-load
	// capture would make this leg impossible — and would freeze a dev server.
	const saved = process.env.DEDALO_DEV_MODE;
	try {
		process.env.DEDALO_DEV_MODE = 'false';
		resetDedaloFilesManifest();
		buildDedaloFilesResponse();
		buildDedaloFilesResponse();
		expect(dedaloFilesManifestBuilds()).toBe(1); // frozen

		process.env.DEDALO_DEV_MODE = 'true';
		buildDedaloFilesResponse();
		expect(dedaloFilesManifestBuilds()).toBe(2); // recomputed, same process
	} finally {
		if (saved === undefined) delete process.env.DEDALO_DEV_MODE;
		else process.env.DEDALO_DEV_MODE = saved;
	}
});
