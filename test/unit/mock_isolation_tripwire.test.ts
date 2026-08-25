/**
 * MOCK ISOLATION — `bun test` shares ONE process, so a module mock and a global
 * stub are not scoped to the file that installs them.
 *
 * WHY THIS EXISTS (measured 2026-08-21). Two files were quietly corrupting
 * every other file in the tier, and neither of the victims mocked anything:
 *
 *   - `client_upload_queue_render` replaced `globalThis.URL` with a plain
 *     object carrying `createObjectURL`/`revokeObjectURL`. A plain object is
 *     NOT a constructor, so every `new URL(...)` elsewhere in the process threw
 *     "Object is not a constructor". The visible symptom was
 *     `external_transport_native` reporting `bad_config` where it asserts
 *     `blocked_host` — a SECURITY gate naming the wrong reason for a refusal,
 *     in a file that touches no globals at all.
 *   - `client_tm_list_destroy_race` mocked `events.js` with only the one export
 *     it uses. `mock.module` is process-global, so the module was TRUNCATED for
 *     everyone: another file importing it died at import with "Export named
 *     'dd_request_idle_callback' not found", nowhere near the cause.
 *
 * Both were invisible in isolation and only appeared in certain file ORDERS,
 * which is the worst property a gate can have: the suite's own signal stops
 * being trustworthy, and a real regression can hide in the noise.
 *
 * ── THE TWO RULES ────────────────────────────────────────────────────────────
 *  1. A `mock.module` factory returning an object literal must not NARROW the
 *     module's export surface: it either spreads the real module (`...real`) or
 *     covers every one of its exports — or carries a named exemption.
 *  2. A file that installs a module mock must restore it (`mock.restore()`), or
 *     say why it does not need to.
 *
 * ── HOW RULE 1 IS MEASURED (rebuilt 2026-08-22) ───────────────────────────────
 * The scan used to match `mock.module\([^,]+,` — a module-id group that CANNOT
 * contain a comma, so every `mock.module(join(DIR, 'a', 'b'), …)` site was
 * INVISIBLE (10 of them, the whole client-module family). Both css.js
 * truncations lived in that blind spot and were reported as engine failures in
 * unrelated files. The site scanner now brace-walks the argument list instead of
 * regexing it, RESOLVES the module id (evaluating `join()` over string literals,
 * `import.meta.dir` and file-local consts) and compares the factory's top-level
 * keys against the REAL module's exports. That is strictly stronger than
 * "must contain `...`": a single-export module (ui.js exports only `ui`) is
 * whole without a spread, and a 5-export module stubbed with 1 key is caught
 * whether or not it spreads something else.
 *
 * ── HONEST LIMITATIONS ───────────────────────────────────────────────────────
 *  - It reads SOURCE, not behaviour: a factory that spreads the wrong module
 *    passes. The rules make the common accident impossible, not every accident.
 *  - A module id it cannot resolve statically, or one that names no file on
 *    disk (a VIRTUAL id), has no surface to compare — those fall back to the
 *    spread rule and are listed in the baseline with that reason.
 *  - GLOBAL STUBS ARE NOW COVERED (2026-08-24) — this limitation is retired.
 *    Three rules below scan every `globalThis.X =`, `(globalThis as T).X =` and
 *    alias form (`const globals = globalThis as …`), which is how the corpus is
 *    actually written. What they still CANNOT see, stated plainly:
 *      · a PARTIAL restore — `tool_transcription.test.ts` restores three of the
 *        six globals it assigns, and a file-level rule cannot tell that from a
 *        complete one. Per-key detection is not textually possible: the
 *        compliant files restore in a LOOP over a saved map, so demanding a
 *        per-key restore statement would redden correct teardown.
 *      · a computed-key write (`globals[name] = …`) or a write inside an
 *        imported helper. Neither shape exists in the tree today.
 *      · a stub of a global that is NOT a runtime constructor here (Bun has no
 *        DOM, so `Node`/`Option`/`XMLHttpRequest`/`DocumentFragment` are
 *        undefined and assigning them defines a shim rather than destroying a
 *        builtin) — those are allowed deliberately, not overlooked.
 *
 * ── SCOPE (widened 2026-08-25) ───────────────────────────────────────────────
 * The scan used to read `test/unit/` ONLY (`UNIT_DIR = import.meta.dir`), while
 * `bun test` runs test/unit, test/parity AND test/integration in the SAME
 * process — a mock installed by a parity or integration file was invisible to
 * this gate by construction. The scan now walks `test/**` for `*.test.ts`
 * (fixtures carry no `.test.ts` files, and the gate excludes itself), and file
 * identity is the path RELATIVE TO `test/` (`unit/foo.test.ts`), so two tiers
 * can never collide on a basename. Measured at the widening: the 82 files
 * outside test/unit install NO module mock and assign NO global — the only
 * occurrence of `mock.module(` outside unit/ is PROSE in
 * `integration/publication_api_v2_smoke.test.ts`'s header (it describes a mock
 * in the publication app's OWN suite, a separate Bun process), which is why the
 * restore rule now CONVICTS on comment-stripped source: a gate must not
 * baseline a file for MENTIONING the thing it bans. (Its acquittal side stays
 * raw — see `installsWithoutRestore` for the measured reason.)
 *
 * HERMETIC: filesystem reads of tracked test source. No DB, no network, no clock.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { Glob } from 'bun';
import { stripComments } from '../helpers/strip_comments.ts';

/** The scan root: all of `test/`, not just this gate's own tier. */
const TEST_DIR = join(import.meta.dir, '..');

/**
 * A SHRINK-ONLY BASELINE, not an approval list.
 *
 * Two of these were proved to corrupt other files (see the header) and are
 * fixed; the rest are UNVETTED — they may be harmless, and asserting otherwise
 * without measuring would be a claim this gate cannot support. So the rule is
 * the honest one: these exist, and NO MORE may appear. Removing a name is a
 * one-line change in the commit that fixes it; adding one is refused.
 *
 * Three entries are known-good by inspection and noted as such: they capture
 * the REAL module up front and re-mock it back, which is a restore by another
 * name.
 */
const PARTIAL_MOCK_BASELINE: readonly string[] = [
	// Both capture the REAL module up front and re-mock it back (a restore by
	// another name), but the stub is narrower than record_scope.ts while active.
	'unit/record_scope_gates.test.ts',
	'unit/tools_record_tipo_permission.test.ts',
	// A VIRTUAL module id ('/virtual/…'): there is no file on disk to spread.
	'unit/transcription_status_panel.test.ts',
	// (The css.js truncations in client_render_queue_deadlock and
	// client_show_interface_ownership were FIXED, not baselined, in the same
	// change that gave this gate its eyes — they were the two the old
	// comma-blind regex could not see. The ui.js family left the list without
	// any edit: ui.js has exactly ONE export, so `{ ui: … }` never narrowed it.)
];

/** Same shape: files that install a module mock and never call `mock.restore()`. */
const NO_RESTORE_BASELINE: readonly string[] = [
	'unit/client_open_window_guard.test.ts',
	'unit/client_show_interface_ownership.test.ts',
	'unit/media_master_qualities_config.test.ts',
	'unit/tm_bulk_revert.test.ts',
];

interface Site {
	file: string;
	/** The mocking file's own directory — the base a RELATIVE module id resolves from. */
	fileDir: string;
	body: string;
	/** Absolute module id, or null when it could not be resolved statically. */
	moduleId: string | null;
}

// ── GLOBAL STUBS (2026-08-24) ─────────────────────────────────────────────────
//
// The header's stated blind spot — "It cannot see a global stub at all" — closed.
// The originating incident: replacing `globalThis.URL` with a PLAIN OBJECT broke
// `new URL(...)` process-wide and made a security gate report `bad_config` where
// it asserts `blocked_host`. One process, so a global is everyone's.
//
// WHAT COUNTS AS DANGEROUS, measured rather than assumed. Only a global that is
// a REAL CONSTRUCTOR IN THIS RUNTIME can be clobbered; Bun has no DOM, so
// `Node`, `DocumentFragment`, `Option` and `XMLHttpRequest` are undefined here
// and a test assigning them is DEFINING a shim, not destroying a builtin. The
// list below is therefore the runtime-real set, verified with `typeof` under the
// Bun this suite runs on — not a textbook list of "browser constructors".
const RUNTIME_CONSTRUCTOR_GLOBALS: readonly string[] = [
	'URL',
	'Date',
	'Response',
	'Request',
	'Headers',
	'FormData',
	'WebSocket',
	'Blob',
	'AbortController',
];

/**
 * Files that assign a global and never restore it. SHRINK-ONLY.
 *
 * Seeded with the one real offender rather than empty: an earlier plan asserted
 * "all of them already restore", which was false and would have landed this gate
 * red on its first commit.
 */
const GLOBAL_NO_RESTORE_BASELINE: readonly string[] = [
	// Assigns SHOW_DEBUG in `beforeAll`; its `afterAll` restores console.warn /
	// console.error only, so the flag leaks to every later file in the process.
	'unit/component_change_value_refresh.test.ts',
];

/** `const x = globalThis;` / `const x = globalThis as …;` — an ALIAS, not a save. */
const GLOBAL_ALIAS =
	/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*globalThis\s*(?:as\b[^;=]*)?\s*;/g;

/** Assignments through `globalThis.X =` and `(globalThis as T).X =`. */
const DIRECT_ASSIGN = /\bglobalThis\s*\.\s*([A-Za-z_$][\w$]*)\s*=(?!=)/g;
const PAREN_ASSIGN = /\(\s*globalThis\s+as[^)]*\)\s*\.\s*([A-Za-z_$][\w$]*)\s*=(?!=)/g;

type GlobalSite = { file: string; key: string; rhs: string; line: number };

/** Every global assignment in a unit test, through any alias spelling. */
function globalAssignments(): GlobalSite[] {
	const sites: GlobalSite[] = [];
	for (const file of testFiles()) {
		const source = readFileSync(join(TEST_DIR, file), 'utf8');
		const targets = new Set<string>(['globalThis']);
		for (const m of source.matchAll(GLOBAL_ALIAS)) targets.add(m[1] as string);

		const patterns = [DIRECT_ASSIGN, PAREN_ASSIGN].map((re) => new RegExp(re.source, 'g'));
		for (const alias of targets) {
			if (alias === 'globalThis') continue;
			patterns.push(new RegExp(`\\b${alias}\\s*\\.\\s*([A-Za-z_$][\\w$]*)\\s*=(?!=)`, 'g'));
		}
		for (const re of patterns) {
			for (const m of source.matchAll(re)) {
				const at = m.index ?? 0;
				const rhs = source.slice(at + m[0].length, source.indexOf('\n', at) + 1 || undefined);
				sites.push({
					file,
					key: m[1] as string,
					rhs: rhs.trim(),
					line: source.slice(0, at).split('\n').length,
				});
			}
		}
	}
	return sites;
}

/** Files with teardown (`afterAll`/`afterEach`/`finally`) that touches a global. */
function filesRestoringGlobals(): Set<string> {
	const restoring = new Set<string>();
	for (const file of testFiles()) {
		const source = readFileSync(join(TEST_DIR, file), 'utf8');
		const targets = new Set<string>(['globalThis']);
		for (const m of source.matchAll(GLOBAL_ALIAS)) targets.add(m[1] as string);

		// Teardown bodies, brace-matched. `finally` is included deliberately: two
		// files restore per-test in a finally rather than in afterEach, and a rule
		// demanding the restore sit lexically inside afterAll reddens correct code.
		const bodies: string[] = [];
		for (const m of source.matchAll(/\b(?:afterAll|afterEach)\s*\(|\bfinally\s*\{/g)) {
			const open = source.indexOf('{', (m.index ?? 0) + m[0].length - 1);
			if (open === -1) continue;
			let depth = 0;
			let end = open;
			while (end < source.length) {
				if (source[end] === '{') depth += 1;
				else if (source[end] === '}') {
					depth -= 1;
					if (depth === 0) break;
				}
				end += 1;
			}
			bodies.push(source.slice(open, end));
		}
		if (bodies.some((body) => [...targets].some((t) => body.includes(t)))) restoring.add(file);
	}
	return restoring;
}

/** This file NAMES `mock.module(` in its prose and its regex; it never calls it. */
const SELF = 'unit/mock_isolation_tripwire.test.ts';

function testFiles(): string[] {
	return [...new Glob('**/*.test.ts').scanSync({ cwd: TEST_DIR })]
		.filter((name) => name !== SELF)
		.sort();
}

/** Split a call's argument source on TOP-LEVEL commas. */
function splitArguments(source: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let current = '';
	for (const char of source) {
		if ('([{'.includes(char)) depth++;
		else if (')]}'.includes(char)) depth--;
		if (char === ',' && depth === 0) {
			out.push(current);
			current = '';
			continue;
		}
		current += char;
	}
	if (current.trim() !== '') out.push(current);
	return out;
}

/**
 * Evaluate the tiny expression language module ids are written in: string
 * literals, `import.meta.dir`, file-local consts and `join(...)` over those.
 * Anything else ⇒ null (unresolvable, handled as its own class).
 */
function evaluatePath(
	expression: string,
	consts: Map<string, string>,
	fileDir: string,
): string | null {
	const text = expression.trim();
	if (/^'[^']*'$/.test(text)) return text.slice(1, -1);
	if (/^`[^`$]*`$/.test(text)) return text.slice(1, -1);
	// `import.meta.dir` is the MOCKING FILE's directory, not this gate's: with the
	// scan spanning tiers the two are no longer the same path, so the caller hands
	// the file's own directory in.
	if (text === 'import.meta.dir') return fileDir;
	const known = consts.get(text);
	if (known !== undefined) return known;
	const call = text.match(/^join\(([\s\S]*)\)$/);
	if (call === null) return null;
	const parts: string[] = [];
	for (const argument of splitArguments(call[1] ?? '')) {
		const value = evaluatePath(argument, consts, fileDir);
		if (value === null) return null;
		parts.push(value);
	}
	return parts.length === 0 ? null : join(...parts);
}

/** File-local `const X = <path expression>` table, in source order. */
function pathConsts(source: string, fileDir: string): Map<string, string> {
	const consts = new Map<string, string>();
	for (const match of source.matchAll(
		/const\s+([A-Za-z_$][\w$]*)\s*=\s*(join\([^;]*?\)|'[^']*'|`[^`$]*`)\s*;/g,
	)) {
		const value = evaluatePath(match[2] ?? '', consts, fileDir);
		if (value !== null) consts.set(match[1] as string, value);
	}
	return consts;
}

/** The factory object literal's TOP-LEVEL keys (nested stub shapes ignored). */
function topLevelKeys(body: string): Set<string> {
	const keys = new Set<string>();
	let depth = 0;
	for (let index = 0; index < body.length; index++) {
		const char = body[index] as string;
		if ('([{'.includes(char)) {
			depth++;
			continue;
		}
		if (')]}'.includes(char)) {
			depth--;
			continue;
		}
		if (depth !== 0) continue;
		const previous = index === 0 ? ',' : (body[index - 1] as string);
		if (!/[\s,{]/.test(previous)) continue;
		const key = /^([A-Za-z_$][\w$]*)\s*[:,(]/.exec(body.slice(index));
		if (key !== null) {
			keys.add(key[1] as string);
			index += (key[1] as string).length;
		}
	}
	return keys;
}

/** Named exports of a real module (const/let/var/function/class + `export {}`). */
function moduleExports(path: string): Set<string> {
	const source = readFileSync(path, 'utf8');
	const names = new Set<string>();
	for (const match of source.matchAll(
		/^export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm,
	)) {
		names.add(match[1] as string);
	}
	for (const match of source.matchAll(/^export\s*\{([^}]*)\}/gm)) {
		for (const part of (match[1] ?? '').split(',')) {
			const name = part
				.trim()
				.split(/\s+as\s+/)
				.pop();
			if (name !== undefined && name !== '') names.add(name);
		}
	}
	return names;
}

/** Every `mock.module(<id>, () => ({ … }))` site — the REPLACEMENT shape. */
function objectLiteralMockSites(): Site[] {
	const sites: Site[] = [];
	for (const file of testFiles()) {
		const source = readFileSync(join(TEST_DIR, file), 'utf8');
		const fileDir = dirname(join(TEST_DIR, file));
		const consts = pathConsts(source, fileDir);
		let cursor = 0;
		while (true) {
			const start = source.indexOf('mock.module(', cursor);
			if (start < 0) break;
			const argsStart = start + 'mock.module('.length;
			let depth = 1;
			let index = argsStart;
			while (index < source.length) {
				const char = source[index] as string;
				if ('([{'.includes(char)) depth++;
				else if (')]}'.includes(char)) depth--;
				else if (char === ',' && depth === 1) break;
				index++;
			}
			cursor = argsStart;
			if (source[index] !== ',') continue;
			const factory = /^\s*(?:async\s*)?\(\)\s*=>\s*\(\{([\s\S]*?)\}\)\s*,?\s*\)/.exec(
				source.slice(index + 1),
			);
			if (factory === null) continue;
			sites.push({
				file,
				fileDir,
				body: factory[1] ?? '',
				moduleId: evaluatePath(source.slice(argsStart, index), consts, fileDir),
			});
		}
	}
	return sites;
}

/**
 * Does this site NARROW its module? Spread ⇒ never. Resolvable + on disk ⇒
 * compare against the real export surface. Otherwise fall back to the spread
 * rule, because there is no surface to compare against.
 */
function narrowsItsModule(site: Site): boolean {
	if (site.body.includes('...')) return false;
	if (site.moduleId === null) return true;
	const absolute = isAbsolute(site.moduleId) ? site.moduleId : resolve(site.fileDir, site.moduleId);
	if (!existsSync(absolute)) return true; // virtual id: nothing to spread
	const real = moduleExports(absolute);
	if (real.size === 0) return false; // no named exports to lose
	const stubbed = topLevelKeys(site.body);
	return [...real].some((name) => !stubbed.has(name));
}

/** Files whose mock narrows a module (the shrink-only offender set). */
function narrowingFiles(): string[] {
	return [
		...new Set(
			objectLiteralMockSites()
				.filter(narrowsItsModule)
				.map((s) => s.file),
		),
	].sort();
}

/**
 * Does this file install a module mock and never restore it? ASYMMETRIC on
 * purpose, measured 2026-08-25 at the test/** widening:
 *
 *  - CONVICTION reads comment-stripped source. The only `mock.module(` outside
 *    unit/ is PROSE in `integration/publication_api_v2_smoke.test.ts`'s header
 *    (it describes a mock inside the publication app's OWN 253-test suite — a
 *    separate Bun process this gate's process-isolation law does not reach). A
 *    raw read would have baselined a file for MENTIONING the thing the rule bans.
 *  - ACQUITTAL reads RAW source, and that is load-bearing, not sloppiness:
 *    stripping comments here convicted 12 COMPLIANT files. They restore by the
 *    only means that works — `mock.restore()` does NOT revert `mock.module` in
 *    bun, so they snapshot the real module and re-mock it back in teardown —
 *    and each states that fact in a comment naming `mock.restore()`. The raw
 *    match keeps honoring that documented pattern exactly as the rule always
 *    has; a textual per-site "re-mocked the real module back" detector would be
 *    a rebuild of RULE 1's resolver for no new protection. The header's honest
 *    limitation stands: this reads SOURCE, not behaviour.
 */
function installsWithoutRestore(file: string): boolean {
	const raw = readFileSync(join(TEST_DIR, file), 'utf8');
	return stripComments(raw).includes('mock.module(') && !raw.includes('mock.restore()');
}

describe('mock isolation — one process, so a mock is everyone’s', () => {
	test('NO NEW partial module mock (shrink-only)', () => {
		const added = narrowingFiles().filter((file) => !PARTIAL_MOCK_BASELINE.includes(file));
		expect(
			added,
			'A partial `mock.module` TRUNCATES that module for every other file in the tier — they fail at import with "Export named \'x\' not found", nowhere near this file. Spread the real module and override only what you stub.',
		).toEqual([]);
	});

	test('NO NEW unrestored module mock (shrink-only)', () => {
		const unrestored = testFiles().filter(installsWithoutRestore);
		const added = unrestored.filter((file) => !NO_RESTORE_BASELINE.includes(file));
		expect(
			added,
			'`mock.module` is process-global: a file that never restores hands its stub to every later file importing the same module.',
		).toEqual([]);
	});

	test('the baselines are LIVE — a stale entry is a finding, because it hides a regression', () => {
		const partial = new Set(narrowingFiles());
		expect(
			PARTIAL_MOCK_BASELINE.filter((file) => !partial.has(file)),
			'fixed — delete these names in the same change that fixed them',
		).toEqual([]);
		const unrestored = new Set(testFiles().filter(installsWithoutRestore));
		expect(
			NO_RESTORE_BASELINE.filter((file) => !unrestored.has(file)),
			'fixed — delete these names in the same change that fixed them',
		).toEqual([]);
	});

	test('ANTI-VACUITY: the scan actually finds mock sites', () => {
		const mockers = testFiles().filter((file) =>
			stripComments(readFileSync(join(TEST_DIR, file), 'utf8')).includes('mock.module('),
		);
		// 40+ files mock a module today; a scan that found none would pass every
		// rule above while measuring nothing.
		expect(mockers.length).toBeGreaterThan(20);
		const sites = objectLiteralMockSites();
		expect(sites.length).toBeGreaterThan(5);
		// THE BLIND SPOT THAT EXISTED UNTIL 2026-08-22: the old `[^,]+` module-id
		// group could not match a call expression, so every `mock.module(join(D,
		// 'a', 'b'), …)` site was unseen — and both real truncations lived there.
		// The scan must keep seeing that form, and must keep RESOLVING ids.
		expect(sites.filter((site) => site.moduleId !== null).length).toBeGreaterThan(10);
	});
	// ── global stubs ─────────────────────────────────────────────────────────
	test('no NON-CONSTRUCTOR is assigned over a real runtime constructor global', () => {
		const offenders = globalAssignments()
			.filter((site) => RUNTIME_CONSTRUCTOR_GLOBALS.includes(site.key))
			.filter((site) => {
				// A constructor RHS: a class expression, or an identifier declared
				// `class` in the same file. The one legitimate shape in the tree is
				// `class StubURL extends (globals.URL as typeof URL)` — it SUBCLASSES
				// the real constructor instead of replacing it, and that is the
				// pattern to copy.
				if (/^class\b/.test(site.rhs)) return false;
				const id = site.rhs.match(/^([A-Za-z_$][\w$]*)/)?.[1];
				if (id === undefined) return true;
				const source = readFileSync(join(TEST_DIR, site.file), 'utf8');
				return !new RegExp(`class\\s+${id}\\b`).test(source);
			});
		expect(
			offenders.map((o) => `${o.file}:${o.line} ${o.key} = ${o.rhs}`),
			'a plain object over a real constructor breaks `new X()` for the whole ' +
				'process — subclass it (`class Stub extends (globals.X as typeof X)`) instead',
		).toEqual([]);
	});

	test('every file that assigns a global restores it in teardown', () => {
		const restoring = filesRestoringGlobals();
		const assigning = new Set(globalAssignments().map((s) => s.file));
		const unrestored = [...assigning].filter((f) => !restoring.has(f)).sort();
		expect(
			unrestored.filter((f) => !GLOBAL_NO_RESTORE_BASELINE.includes(f)),
			'a global assigned and never restored leaks into every later file in the process',
		).toEqual([]);
		// Stale baseline entries are red too.
		expect(
			GLOBAL_NO_RESTORE_BASELINE.filter((f) => !unrestored.includes(f)),
			'fixed — delete these names in the same change that fixed them',
		).toEqual([]);
	});

	test('ANTI-VACUITY: the global scan actually finds stub sites', () => {
		const sites = globalAssignments();
		const files = new Set(sites.map((s) => s.file));
		// Measured 2026-08-24: 21 files, across three alias spellings
		// (`globalThis.X`, `const globals = globalThis as …`, `const g = …`).
		// A scan that found none would pass both rules above while measuring nothing.
		expect(files.size).toBeGreaterThanOrEqual(18);
		expect(sites.length).toBeGreaterThan(40);
		// The alias forms must keep being seen: an earlier corpus counted only two
		// spellings and missed three files, two of which were real offenders.
		// File identity is tier-prefixed since the 2026-08-25 widening — a bare
		// /^client_/ would match nothing and make this count vacuous.
		expect([...files].filter((f) => !/^unit\/client_/.test(f)).length).toBeGreaterThan(2);
	});
});
