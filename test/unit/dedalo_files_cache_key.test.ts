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

/**
 * MANIFEST SHAPE (WC-006, 2026-08-16). tool_common's client machinery moved
 * INSIDE the core tree on disk (client/dedalo/core/tools_common/) but keeps its
 * OWN manifest block: that block holds the PHP entry ORDER — after the core js,
 * before the tools — and applies the TOOLS filter rule PHP applied to it (which
 * admits css; the core rule would not, and would list it elsewhere). The core
 * walk therefore SKIPS /tools_common/ (TOOLS_COMMON_REL in dedalo_files.ts).
 *
 * Drop that skip and every tools_common file is manifested TWICE — the service
 * worker then pre-caches a duplicated list. The only other assertion that would
 * notice is the parity set-compare, which is credentialed AND currently red for
 * unrelated client drift, so a duplicate would arrive inside an already-failing
 * diff and read as "the usual". Hence this hermetic, credless gate.
 */
describe('the manifest lists tool_common exactly once, in the PHP position', () => {
	const urls = buildDedaloFilesResponse().result.map((entry) => entry.url);
	const toolsCommon = urls.filter((url) => url.startsWith('/dedalo/core/tools_common/'));

	test('no duplicate url anywhere in the manifest', () => {
		const seen = new Set<string>();
		const duplicates = urls.filter((url) => (seen.has(url) ? true : (seen.add(url), false)));
		expect(
			[...new Set(duplicates)],
			'Duplicated manifest entries. The most likely cause: the core walk in dedalo_files.ts stopped skipping TOOLS_COMMON_REL, so the tools_common block emits every file a second time.',
		).toEqual([]);
	});

	test('tool_common IS manifested (the block did not silently vanish)', () => {
		expect(toolsCommon.length).toBeGreaterThan(0);
		expect(toolsCommon).toContain('/dedalo/core/tools_common/js/tool_common.js');
	});

	test('its entries sit AFTER the core js and BEFORE the tools (PHP order)', () => {
		const firstToolsCommon = urls.findIndex((url) => url.startsWith('/dedalo/core/tools_common/'));
		// findLastIndex is es2023; the repo's lib target is older, so walk it.
		let lastToolsCommon = -1;
		for (let i = urls.length - 1; i >= 0; i--) {
			if (urls[i]?.startsWith('/dedalo/core/tools_common/') === true) {
				lastToolsCommon = i;
				break;
			}
		}
		const firstTool = urls.findIndex((url) => url.startsWith('/dedalo/tools/'));
		const firstCore = urls.findIndex(
			(url) => url.startsWith('/dedalo/core/') && !url.startsWith('/dedalo/core/tools_common/'),
		);
		expect(firstCore).toBeLessThan(firstToolsCommon);
		expect(lastToolsCommon).toBeLessThan(firstTool);
		// contiguous: one block, not scattered through the core walk
		expect(lastToolsCommon - firstToolsCommon + 1).toBe(toolsCommon.length);
	});
});
