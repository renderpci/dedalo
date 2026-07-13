/**
 * SW CACHE-KEY gate (core/api/dedalo_files.ts + client sw.js).
 *
 * The service worker serves JS cache-first, naming its cache after the manifest's
 * `dedalo_version`. PHP sent DEDALO_VERSION there — a string that only moves on a
 * release — so a client file edited between releases stayed cached FOREVER: the
 * browser kept running the old JS against the new server, and only a fresh login
 * ever refreshed it. That is a stale-bundle bug in dev AND after any deploy.
 *
 * The invariant, and why it is gated here: THE CACHE KEY MUST TRACK THE SERVED
 * BYTES. Edit a client file and the key must move, or the browser never sees it.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync, utimesSync } from 'node:fs';
import { buildDedaloFilesResponse } from '../../src/core/api/dedalo_files.ts';

const A_MANIFESTED_CLIENT_FILE = 'tools/tool_import_dedalo_csv/js/render_tool_import_dedalo_csv.js';
const SW = 'client/dedalo/core/sw.js';

describe('the SW cache key tracks the served client code', () => {
	test('editing a manifested client file MOVES the key (the file list does not)', () => {
		const before = buildDedaloFilesResponse();

		// The edit a developer makes, or a deploy performs.
		const now = new Date();
		utimesSync(A_MANIFESTED_CLIENT_FILE, now, now);

		const after = buildDedaloFilesResponse();

		expect(after.dedalo_version).not.toBe(before.dedalo_version);
		// Only the KEY moved — the manifest is the same set of files.
		expect(after.result.length).toBe(before.result.length);
	});

	test('the key is stable when nothing changed (no needless re-cache on every poll)', () => {
		expect(buildDedaloFilesResponse().dedalo_version).toBe(
			buildDedaloFilesResponse().dedalo_version,
		);
	});

	test('the key still carries the engine version (a release alone busts the cache)', () => {
		expect(buildDedaloFilesResponse().dedalo_version).toMatch(/^\d+\.\d+\.\d+/);
	});
});

describe('sw.js consumes the key (a server-only change would be inert)', () => {
	const sw = readFileSync(SW, 'utf-8');

	test('the cache is NAMED after the manifest version, never a fixed string', () => {
		expect(sw).toContain("cache_name = cache_prefix + '_' + (api_response.dedalo_version");
		// The old bug: a hardcoded cache name that nothing could ever invalidate.
		expect(sw).not.toContain("const cache_name = 'dedalo_files'");
	});

	test('cache reads are SCOPED to the current cache', () => {
		// caches.match() searches EVERY cache in the origin, so a superseded one
		// would keep answering with the stale file even after the key moved.
		expect(sw).toContain('const cache = await caches.open(cache_name)');
		expect(sw).not.toContain('await caches.match(request)');
	});

	test('superseded caches are PURGED (delete_old_caches is actually called)', () => {
		expect(sw).toContain('await delete_old_caches( cache_name )');
	});
});
