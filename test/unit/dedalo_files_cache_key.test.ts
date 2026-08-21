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

/**
 * Source-level helpers. These gates read CLIENT js (excluded from the TS build and
 * from biome), so they assert on text — but never on text inside a comment: the
 * first version of this suite counted a docblock that merely DOCUMENTED the message
 * shape and would have passed with a real posting site deleted.
 */
function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** The body of the `fetch` event listener. */
function fetchListenerBody(source: string): string {
	const code = stripComments(source);
	const start = code.indexOf("self.addEventListener('fetch'");
	expect(start, 'the fetch listener vanished').toBeGreaterThan(-1);
	// Bounded, not sliced to EOF: the listener is the last construct today, so an
	// unbounded slice would false-fail the moment anything is appended after it.
	const end = code.indexOf('});', start);
	expect(end).toBeGreaterThan(start);
	return code.slice(start, end);
}

/** The body of the cache pass (run_cache_pass), where the commit ORDER lives. */
function passBody(source: string): string {
	const code = stripComments(source);
	const start = code.indexOf('const run_cache_pass');
	const end = code.indexOf('}//end run_cache_pass', start);
	expect(start, 'run_cache_pass vanished — the commit-order gate has nothing to read').toBeGreaterThan(-1);
	expect(end).toBeGreaterThan(start);
	return code.slice(start, end);
}

/**
 * The KEY SET of every `status:'finish'` object literal actually posted (comments
 * excluded). Scans from each match to the closing brace of its literal.
 */
function finishPayloads(source: string): string[][] {
	const code = stripComments(source);
	const payloads: string[][] = [];
	const re = /status\s*:\s*'finish'/g;
	let match: RegExpExecArray | null = re.exec(code);
	while (match !== null) {
		// walk back to the '{' that opens this literal, then forward to its '}'
		const open = code.lastIndexOf('{', match.index);
		let depth = 0;
		let close = open;
		for (let i = open; i < code.length; i++) {
			if (code[i] === '{') depth++;
			else if (code[i] === '}') {
				depth--;
				if (depth === 0) {
					close = i;
					break;
				}
			}
		}
		const literal = code.slice(open + 1, close);
		payloads.push(
			literal
				.split(',')
				.map((part) => /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(part)?.[1])
				.filter((key): key is string => key !== undefined),
		);
		match = re.exec(code);
	}
	return payloads;
}

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
		expect(sw).toContain("cache_prefix + '_' + (api_response.dedalo_version");
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
		expect(sw).toMatch(/await\s+delete_old_caches\(\s*target_cache_name\s*\)/);
	});

	/**
	 * The purge is SCOPED. It used to delete every key `caches.keys()` returned,
	 * i.e. every Cache Storage user on the origin, not just this worker's.
	 */
	test('the purge only touches keys this worker owns', () => {
		expect(sw).toContain('is_dedalo_cache_key(key) && key!==keep_name');
	});

	/**
	 * The cache used to be UNREADABLE outside a login: cache_name/files_set live in
	 * the worker's module scope, which dies with every idle kill, and `update_files`
	 * is posted ONLY by login.js. A revived worker therefore fell through to the
	 * network for every request — the cache was written once and never read.
	 * restore_state() rebuilds that state from the cache itself, with no network.
	 */
	test('a revived worker RESTORES its state from the cache (no login needed)', () => {
		expect(sw).toContain('const restore_state = async () => {');
		expect(sw).toContain('await restore_state()');
	});

	/**
	 * COMMIT ORDER: the manifest record is the marker that says "this cache is
	 * whole". Written after the files AND after the purge, so a worker killed
	 * mid-pass leaves an unmarked cache that restore_state ignores, and the previous
	 * complete cache keeps serving. Move the write earlier and a half-built cache
	 * becomes eligible — silently serving a truncated bundle.
	 */
	test('the commit marker is written AFTER the files and BEFORE the purge', () => {
		const body = passBody(sw);
		const files = body.search(/await\s+Promise\.all\(\s*ar_promises\s*\)/);
		const marker = body.search(/await\s+cache\.put\(\s*\n?\s*manifest_record_url\(\)/);
		const purge = body.search(/await\s+delete_old_caches\(/);
		const commit = body.search(/\bcommit_state\(/);
		expect(files, 'the file-fetch step vanished from the pass').toBeGreaterThan(-1);
		expect(marker, 'the commit marker write vanished from the pass').toBeGreaterThan(-1);
		expect(purge).toBeGreaterThan(-1);
		expect(commit).toBeGreaterThan(-1);
		// files -> marker -> purge -> state swap
		expect(marker).toBeGreaterThan(files);
		expect(
			purge,
			'The purge must come AFTER the marker. Purging first opens a window with ZERO marked caches (old deleted, new not yet marked): a worker revived inside it can restore nothing, and since revalidate is the only path that ever asks the server outside update_files, that state must stay recoverable by inspection.',
		).toBeGreaterThan(marker);
		expect(commit).toBeGreaterThan(purge);
	});

	/**
	 * A worker that cannot restore is the one that most needs to re-fetch. Gating
	 * the rebuild behind a successful restore made every unrestorable state
	 * permanent until a full logout+login.
	 */
	test('revalidation is NOT gated on a successful restore', () => {
		// Positive, not a single-syntax negative: read the fetch listener and require
		// that the path scheduling revalidation does not consult restore_state at all.
		// (`const ok = await restore_state(); if (ok) …` reintroduces the deadlock and
		// no negative regex for one spelling would catch it.)
		const body = fetchListenerBody(sw);
		expect(body).toMatch(/should_revalidate\(\)/);
		expect(body).toMatch(/revalidate\(\)/);
		expect(
			body,
			'The fetch handler must schedule revalidate() without consulting restore_state. A worker that cannot restore is exactly the one that needs to re-fetch: gating the rebuild on a successful restore makes every unrestorable state permanent until a full logout+login, since revalidate is the only path that ever asks the server outside update_files.',
		).not.toContain('restore_state');
	});

	/**
	 * Two passes overlapping is not merely wasteful: each ends by deleting every
	 * OTHER dedalo cache, so the slower one can delete what the faster just
	 * committed. A timestamp throttles STARTS; it cannot serialize a pass that
	 * outlives the interval.
	 */
	test('cache passes are single-flight, not merely throttled', () => {
		expect(sw).toContain('pass_promise');
		const code = stripComments(sw);
		expect(code).toMatch(/const run_cache_pass\s*=/);
		// the pass body is reachable through the lock holder and nowhere else
		expect(code.match(/run_cache_pass\(/g)?.length ?? 0).toBe(1);
	});

	/**
	 * The two most delicate lines in the file, and the easiest to "simplify":
	 * a queued pass must WAIT for the running one, and must release the lock only
	 * if nobody queued behind it. Release unconditionally and a chained pass runs
	 * with the lock free — two passes overlap again, each purging the other's cache.
	 */
	test('a queued pass waits, and only the LAST holder releases the lock', () => {
		const code = stripComments(sw);
		const lock = code.slice(
			code.indexOf('const add_resources_to_cache'),
			code.indexOf('}//end add_resources_to_cache'),
		);
		expect(lock.length).toBeGreaterThan(0);
		// chains onto whatever is in flight, and a rejection must not break the chain
		expect(lock).toMatch(/await\s+previous\s*\.catch\(/);
		// conditional release
		expect(
			lock,
			'The lock must be released only by the LAST scheduled pass (if (pass_promise===current)). An unconditional `pass_promise = null` frees the lock while a chained pass is still running.',
		).toMatch(/if\s*\(\s*pass_promise\s*===\s*current\s*\)/);
		expect(lock).not.toMatch(/finally\s*{\s*pass_promise\s*=\s*null/);
	});

	/**
	 * The commit marker means "this cache is WHOLE", and writing it is what makes a
	 * pass destructive: the purge then deletes the previous WORKING cache, and the
	 * new key is the one the server's version agrees with — so revalidate() never
	 * rebuilds it (the key matches, only the contents are missing). A login on a dead
	 * link turned a good cache into a permanently empty one that survived every
	 * restart and defeated every self-heal path built into this file.
	 */
	test('a pass that stored too little REFUSES to commit', () => {
		const body = passBody(sw);
		const refusal = body.search(/if\s*\(\s*cached_count\s*</);
		const marker = body.search(/await\s+cache\.put\(\s*\n?\s*manifest_record_url\(\)/);
		expect(
			refusal,
			'Nothing checks how many files were actually stored. custom_cache_add never rejects — it catches and fulfils with false — so a pass in which every file failed still reached the marker.',
		).toBeGreaterThan(-1);
		expect(refusal).toBeLessThan(marker);
		expect(body).toMatch(/return false/);
	});

	/**
	 * custom_cache_add fulfils with `false` on failure, so counting FULFILMENTS drove
	 * the login's progress ring to 100% for a pass in which nothing was stored.
	 */
	test('progress counts files actually STORED', () => {
		expect(passBody(sw)).toMatch(/if\s*\(\s*stored===true\s*\)/);
	});

	/**
	 * A bare fetch has no timeout. One stalled connection leaves Promise.all pending
	 * forever, which holds the single-flight lock for the worker's whole life:
	 * no revalidation ever again, and every later caller queued behind a dead pass.
	 */
	test('cached file fetches have a timeout', () => {
		const code = stripComments(sw);
		expect(code).toMatch(/signal\s*:[\s\S]{0,120}AbortSignal\.timeout\(/);
		// feature-detected: AbortSignal.timeout lands in Chromium 103 and this file's
		// floor is the module-SW floor (Chromium 91). Calling it where it is absent
		// throws per file — every file fails, and before the refusal check that meant
		// an empty cache committed over a good one.
		expect(code).toMatch(/typeof AbortSignal\.timeout==='function'/);
	});
});

/**
 * THE 'finish' MESSAGE IS THE ONLY WAY OUT OF THE LOGIN.
 * login.js navigates from finish_handler and from nowhere else, so any cache path
 * that can end without posting 'finish' hangs the login on the progress ring
 * forever — the failure mode WC-002 warns about. Both producers must always post
 * it, with the same keys, and the client must survive silence anyway.
 */
describe('the files-cache finish contract', () => {
	const sw = readFileSync(SW, 'utf-8');
	const worker = readFileSync('client/dedalo/core/page/js/worker_cache.js', 'utf-8');
	const login = readFileSync('client/dedalo/core/login/js/login.js', 'utf-8');

	test('worker_cache.js posts finish on BOTH its success and failure exits', () => {
		// comments stripped: a docblock listing the message shape used to satisfy
		// a naive count, so deleting a real posting site went unnoticed
		expect(finishPayloads(worker).length).toBe(2);
	});

	test('sw.js posts finish exactly once, outside any success branch', () => {
		const payloads = finishPayloads(sw);
		expect(payloads.length).toBe(1);
		// the outcome rides ON the message instead of deciding whether to send it
		expect(payloads[0]).toContain('error');
	});

	test('both producers send the SAME finish keys (one client handler reads both)', () => {
		const shapes = [...finishPayloads(sw), ...finishPayloads(worker)].map((keys) =>
			[...keys].sort().join(','),
		);
		expect(shapes.length).toBe(3);
		expect(
			new Set(shapes).size,
			`Divergent 'finish' shapes: ${JSON.stringify(shapes)}. login.js has ONE handler for both cache paths and navigates on this message (WC-2026-08-21-files-cache-finish-message).`,
		).toBe(1);
		expect(shapes[0]).toBe('error,status,time,total_files');
	});

	test('the login survives a cache path that never answers at all', () => {
		const code = stripComments(login);
		// re-armed on every message: the worker posts 'ready' BEFORE its network
		// call, so a first-message-only guard would never catch the real stall
		expect(code).toMatch(/const arm_watchdog\s*=/);
		// armed once up front AND from the message handler
		expect(code.match(/\barm_watchdog\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
		expect(code).toMatch(/clearTimeout\(\s*watchdog_timer\s*\)/);
		// and it is the FINISH path that disarms it, not the first sign of life
		expect(code).toMatch(/finished\s*=\s*true[\s\S]{0,120}clearTimeout/);
	});

	test('navigation happens at most once (both paths can report finish)', () => {
		const code = stripComments(login);
		expect(code).toMatch(/let finished\s*=\s*false/);
		// the guard must RETURN before load_finish, not merely record the fact
		expect(code).toMatch(/if\s*\(\s*finished\s*\)\s*{\s*return/);
		// exactly one navigation site, and it sits behind the guard
		expect(code.match(/load_finish\(\)/g)?.length ?? 0).toBe(1);
	});

	/**
	 * The heartbeat is the ONE message that can defeat the login's watchdog (it
	 * re-arms it). A leaked interval therefore does not degrade the login — it hangs
	 * it forever on a 'finish' that is never coming.
	 */
	test('the heartbeat is cleared in a finally, and the client knows the status', () => {
		const code = stripComments(sw);
		expect(code).toMatch(/setInterval\(/);
		expect(code).toMatch(/finally\s*{\s*clearInterval\(\s*heartbeat\s*\)/);
		// both ends name the same status string
		expect(code).toMatch(/status\s*:\s*'waiting'/);
		expect(stripComments(login)).toMatch(/case 'waiting'/);
	});

	test('the SW path falls back only when no worker became ACTIVE', () => {
		const code = stripComments(login);
		expect(code).toContain('navigator.serviceWorker.ready');
		expect(code).toContain('SERVICE_WORKER_READY_TIMEOUT_MS');
		// returning true before knowing a worker is active is what stalled the login
		expect(code).toMatch(/if\s*\(!ready_registration\s*\|\|\s*!ready_registration\.active\)\s*{[\s\S]{0,200}return false/);
	});
});

/**
 * The cache purge is keyed by PREFIX, not by the long-dead fixed name.
 * `caches.delete('dedalo_files')` was a no-op from the day the key became
 * versioned: logout left the whole file cache on disk with no worker registered to
 * ever collect it.
 */
describe('logout purges the versioned caches', () => {
	const login = readFileSync('client/dedalo/core/login/js/login.js', 'utf-8');

	test('the sweep is by prefix', () => {
		expect(login).toContain('key.startsWith(DEDALO_CACHE_PREFIX');
	});

	test('nothing deletes the dead fixed name any more', () => {
		// (the string still appears in the comment that explains why it was wrong)
		expect(login).not.toContain("await caches.delete('dedalo_files')");
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
 * notice is the parity set-compare, and that compare is CREDENTIALED: it does not
 * run on the hermetic tier, so on a credless checkout or in hermetic CI nothing
 * notices the duplication at all. A gate that only fires where credentials happen
 * to exist is not a gate. Hence this hermetic, credless one.
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
