/**
 * CLIENT ERROR CONTRACT TRIPWIRE — the client half of envelope v2
 * (engineering/ERRORS_SPEC.md §3-4; error-taxonomy plan §5).
 *
 * ── WHAT IT GUARDS ───────────────────────────────────────────────────────────
 * The server made the wire converter-made (ONE producer of every failure body,
 * `error.code` the machine channel, HTTP status an error channel). The client
 * can throw all of that away in three places, and this gate pins each:
 *
 *  1. ONE TRANSPORT — `client/dedalo/core/common/js/data_manager.js` reaches
 *     the API only through `fetch_api` from `api_transport.js` (read-once
 *     body, JSON parse, envelope-first classification) and carries NO status
 *     allowlist: no `retryableStatuses`, no `!== 401` / `=== 401` carve-out.
 *     The pre-v2 fetch layer threw every non-401 status away UNPARSED, which is
 *     how a 403 became "Not retry-able HTTP error 403" over a blank panel
 *     (WC-2026-08-12-authorization-denial-token).
 *  2. NO FOURTH COPY — `worker_cache.js` and `sw.js` (the two non-page
 *     contexts that fetch the API) import `api_transport.js`; and no file under
 *     client/ or tools/*\/js defines a `request(` / `fetch_api(` function that
 *     wraps `fetch(` itself, other than api_transport.js. A second parse of the
 *     envelope is a second place for the contract to rot.
 *  4. THE EXEMPTION LIST — `NON_ENVELOPE_READS` (the census's named blind
 *     spots: an IDBRequest.result, a server-owned NESTED block spelled
 *     `{result,msg,errors}`, a client-only diagnostics list) is re-checked
 *     here: every entry must name a measured file and still MATCH a code line
 *     in it. An exemption that stops matching is a blanket waiting to happen.
 *  3. THE COMPAT-READ CENSUS — client reads of the compat mirror keys
 *     `.msg` / `.errors` / `.result` (ERRORS_SPEC §3.1) are counted by
 *     scripts/lib/client_compat_census.ts and frozen SHRINK-ONLY in
 *     engineering/client_compat_read_baseline.json (regressions red, stale
 *     entries red, new files capped at 0, anti-vacuity floor — the
 *     error_throw_ratchet rules). The census is the REMOVAL CONDITION of the
 *     server's compat block: when the baseline's `summary.total` is 0 this
 *     gate FLIPS (no edit) to asserting `ERROR_ENVELOPE_COMPAT` is gone from
 *     convert.ts and `compatFields` from schema.ts (P4). Both branches are
 *     real tests keyed on the baseline, not dead code.
 *
 * ── ONE IMPLEMENTATION OF THE COUNT ──────────────────────────────────────────
 * This gate computes nothing: it imports the census through the generator
 * (scripts/client_compat_baseline.ts), so the number it enforces is, by
 * construction, the number the generator wrote. Anti-vacuity: every rule has a
 * self-test in which a synthetic offender string FAILS the matcher.
 *
 * ── HONEST LIMITATIONS ───────────────────────────────────────────────────────
 *  - The census is a TOKEN count (`\.(msg|errors|result)\b`, comments and
 *    strings blanked, `page_globals` lines skipped): a write `.msg = …` counts,
 *    a computed `obj['msg']` does not; `client/dedalo/test/**` and `-min.js`
 *    twins are ungated by design.
 *  - The three words are also the names of non-envelope shapes the client MUST
 *    keep reading (FileReader.result, server job STREAM FRAMES, payload
 *    diagnostic lists, named failure extension keys). Those are excused one
 *    expression at a time by `NON_ENVELOPE_READS` (census, data + reason) — the
 *    gate PRINTS that allowlist and fails on an entry that matches nothing, so
 *    an excuse cannot outlive the read it covers.
 *  - Rule 2 finds a wrapper by NAME (`request` / `fetch_api`) — a differently
 *    named raw `fetch('/dedalo/core/api/…')` is outside it (a policy the
 *    client agent owns; see the api_transport header).
 *
 * HERMETIC: filesystem reads of tracked source only. No DB, no network, no
 * clock; imports nothing from src/.
 *
 * Registered in engineering/TRIPWIRES.md + scripts/verify.ts.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { Glob } from 'bun';
import {
	byPath,
	COMPAT_READ,
	census,
	countCompatReads,
	NON_ENVELOPE_READS,
	REPO_ROOT,
	summarize,
} from '../../scripts/lib/client_compat_census.ts';
import { stripComments } from '../helpers/strip_comments.ts';

// ---------------------------------------------------------------------------
// The pinned files.
// ---------------------------------------------------------------------------

const TRANSPORT = 'client/dedalo/core/common/js/api_transport.js';
const DATA_MANAGER = 'client/dedalo/core/common/js/data_manager.js';
/** The non-page contexts that reach the API: MUST import the shared transport. */
const TRANSPORT_CONSUMERS = [
	DATA_MANAGER,
	'client/dedalo/core/page/js/worker_cache.js',
	'client/dedalo/core/sw.js',
] as const;
/** The compat block's two homes on the server (the flip target of rule 3). */
const CONVERT_TS = 'src/core/errors/convert.ts';
const SCHEMA_TS = 'src/core/errors/schema.ts';

function read(file: string): string {
	return readFileSync(join(REPO_ROOT, file), 'utf8');
}

/** Code only: comments AND string contents blanked (a doc line is not a violation). */
function codeOf(file: string): string {
	return stripComments(read(file), { blankStrings: true });
}

/** Every measured client JS file (mirrors the census roots; the test suite excluded). */
function clientJsFiles(): string[] {
	const files: string[] = [];
	const roots: Array<[string, string]> = [
		['client/dedalo', '**/*.js'],
		['tools', '*/js/**/*.js'],
	];
	for (const [root, glob] of roots) {
		for (const match of new Glob(glob).scanSync({
			cwd: join(REPO_ROOT, root),
			dot: true,
			followSymlinks: true,
			throwErrorOnBrokenSymlink: true,
		})) {
			const file = `${root}/${match.split(sep).join('/')}`;
			if (file.startsWith('client/dedalo/test/')) continue;
			files.push(file);
		}
	}
	return files.sort();
}

// ---------------------------------------------------------------------------
// Rule 1 — one transport, no status allowlist.
// ---------------------------------------------------------------------------

/** The status-allowlist shapes the pre-v2 fetch layer used to carry. */
const STATUS_ALLOWLIST = /\bretryableStatuses\b|[!=]==?\s*401\b|\b401\s*[!=]==?/;
/** `fetch_api` imported from the shared transport (either import spelling). */
const IMPORTS_FETCH_API =
	/import\s*\{[^}]*\bfetch_api\b[^}]*\}\s*from\s*['"][^'"]*api_transport\.js['"]/;

describe('client error contract — rule 1: data_manager.js uses the ONE transport, no status allowlist', () => {
	test('data_manager.js imports fetch_api from api_transport.js and calls it', () => {
		const source = read(DATA_MANAGER);
		expect(
			IMPORTS_FETCH_API.test(source),
			`${DATA_MANAGER} must import { fetch_api } from './api_transport.js' — the ONE read-once, envelope-first transport (ERRORS_SPEC §4 client half).`,
		).toBe(true);
		expect(
			/\bfetch_api\s*\(/.test(codeOf(DATA_MANAGER)),
			`${DATA_MANAGER} imports fetch_api but never calls it — the request path bypasses the shared transport.`,
		).toBe(true);
	});

	test('data_manager.js carries no status allowlist (retryableStatuses / 401 carve-outs)', () => {
		const code = codeOf(DATA_MANAGER);
		const offenders = code
			.split('\n')
			.map((line, index) => ({ line: index + 1, text: line }))
			.filter(({ text }) => STATUS_ALLOWLIST.test(text));
		expect(
			offenders,
			`${DATA_MANAGER} decides parseability by HTTP status again. Envelope v2: EVERY body is parsed first (fetch_api), the status is an error CHANNEL — a status list is how a 403 became "Not retry-able HTTP error 403" over a blank panel. Offenders:\n${offenders.map((o) => `  ${o.line}: ${o.text.trim()}`).join('\n')}`,
		).toEqual([]);
	});

	test('anti-vacuity: the allowlist matcher fires on the pre-v2 shapes', () => {
		for (const offender of [
			'const retryableStatuses = [500, 502]',
			'if (response.status !== 401) throw err',
			'if (401 === response.status) relogin()',
			'if (response.status === 401) {',
		]) {
			expect(STATUS_ALLOWLIST.test(offender), offender).toBe(true);
		}
		expect(STATUS_ALLOWLIST.test('const timeout = 5401')).toBe(false);
		expect(
			IMPORTS_FETCH_API.test("import {fetch_api, check_health} from './api_transport.js'"),
		).toBe(true);
		expect(IMPORTS_FETCH_API.test("import {check_health} from './api_transport.js'")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Rule 2 — no fourth copy of the transport.
// ---------------------------------------------------------------------------

const IMPORTS_TRANSPORT = /import\s*\{[^}]*\}\s*from\s*['"][^'"]*api_transport\.js['"]/;

/**
 * Definitions of a function literally named `request` or `fetch_api`, in every
 * shape the client uses: `x.request = async function(`, `x.prototype.request =`,
 * `request: async (` / `request(…) {` (method), `function request(`,
 * `const request = (`/`async (`/`function`.
 */
const WRAPPER_DEF =
	/(?:^|[\s.{,;])(?:(?:async\s+)?function\s+(request|fetch_api)\s*\(|(request|fetch_api)\s*(?::|=)\s*(?:async\s*)?(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>)|(?:async\s+)?(request|fetch_api)\s*\([^)]*\)\s*\{)/g;

/** Index just past the balanced group opened at `open` (`(`/`{`), or code.length. */
function balancedEnd(code: string, open: number, pair: '()' | '{}'): number {
	let depth = 0;
	for (let i = open; i < code.length; i++) {
		const ch = code[i];
		if (ch === pair[0]) depth++;
		else if (ch === pair[1]) {
			depth--;
			if (depth === 0) return i + 1;
		}
	}
	return code.length;
}

/**
 * The body text of the function whose definition starts at `from`: the
 * parameter list `(…)` (default values may hold `{}`) is skipped first, then
 * the first `{…}` block is brace-matched over blanked code.
 */
function blockAfter(code: string, from: number): string {
	const paren = code.indexOf('(', from);
	let cursor = from;
	if (paren !== -1 && (code.indexOf('{', from) === -1 || paren < code.indexOf('{', from))) {
		cursor = balancedEnd(code, paren, '()');
	}
	const open = code.indexOf('{', cursor);
	if (open === -1) return '';
	let depth = 0;
	for (let i = open; i < code.length; i++) {
		const ch = code[i];
		if (ch === '{') depth++;
		else if (ch === '}') {
			depth--;
			if (depth === 0) return code.slice(open, i + 1);
		}
	}
	return code.slice(open);
}

/** Wrapper definitions in `code` whose body calls `fetch(`. */
function fetchWrappingDefinitions(code: string): string[] {
	const found: string[] = [];
	for (const match of code.matchAll(WRAPPER_DEF)) {
		const name = match[1] ?? match[2] ?? match[3] ?? '?';
		const body = blockAfter(code, match.index ?? 0);
		if (/\bfetch\s*\(/.test(body)) found.push(name);
	}
	return found;
}

describe('client error contract — rule 2: worker_cache/sw import the transport; no fourth fetch wrapper', () => {
	test('the pinned consumers import api_transport.js', () => {
		for (const file of TRANSPORT_CONSUMERS) {
			expect(
				IMPORTS_TRANSPORT.test(read(file)),
				`${file} must import from api_transport.js — it fetches the API from a non-page context (worker/service-worker) and must not carry its own envelope parse.`,
			).toBe(true);
		}
	});

	test('no file other than api_transport.js defines a request()/fetch_api() that wraps fetch(', () => {
		const offenders: string[] = [];
		for (const file of clientJsFiles()) {
			if (file === TRANSPORT) continue;
			const names = fetchWrappingDefinitions(codeOf(file));
			if (names.length > 0) offenders.push(`${file}: ${names.join(', ')}`);
		}
		expect(
			offenders,
			`A fetch wrapper named request()/fetch_api() outside ${TRANSPORT} — a fourth copy of the transport is a second place for the envelope contract to rot. Route it through fetch_api. Offenders:\n  ${offenders.join('\n  ')}`,
		).toEqual([]);
	});

	test('the transport itself IS a fetch wrapper (the pin is not vacuous)', () => {
		expect(fetchWrappingDefinitions(codeOf(TRANSPORT))).toContain('fetch_api');
	});

	test('anti-vacuity: the wrapper matcher fires on every definition shape', () => {
		const shapes = [
			'data_manager.request = async function(options) { const r = await fetch(url) }',
			'x.prototype.request = function(a) { return fetch(a) }',
			'const o = { request: async (a) => { fetch(a) } }',
			'class C { async request(a) { return fetch(a) } }',
			'export async function fetch_api(url, init) { const r = await fetch(url, init) }',
			'const request = (u) => { fetch(u) }',
			'export const fetch_api = async (url, init = {}, options = {}) => { const r = await fetch(url, init) }',
		];
		for (const shape of shapes) {
			expect(fetchWrappingDefinitions(shape), shape).not.toEqual([]);
		}
		// a request() that delegates (no fetch) is NOT an offender; a plain call is not a definition
		expect(
			fetchWrappingDefinitions(
				'x.request = async function(a) { return self.tool.tool_request(a) }',
			),
		).toEqual([]);
		expect(
			fetchWrappingDefinitions('const r = await data_manager.request({url}); fetch(u)'),
		).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Rule 3 — the compat-read census is ZERO and the server compat block is GONE.
// ---------------------------------------------------------------------------

const RESULTS = census();
const TOTALS = summarize(RESULTS);
/** Far below the measured corpus (~650 files); proves the glob saw a tree, not a stub. */
const CORPUS_FLOOR = 300;
const FIX_COMMAND = 'bun run scripts/client_compat_census.ts';

describe('client error contract — rule 3: compat-read census is 0 and the compat block is ABSENT (P4, 2026-08-16)', () => {
	test('no client file reads `.msg` / `.errors` / `.result` off an API body', () => {
		const offenders = RESULTS.filter((result) => result.reads > 0)
			.sort((a, b) => b.reads - a.reads || byPath(a, b))
			.map(
				(result) =>
					`${result.file}: ${result.reads} (msg ${result.byKey.msg}, errors ${result.byKey.errors}, result ${result.byKey.result})`,
			);
		expect(
			offenders,
			`COMPAT READS in the client. The server stopped emitting \`result\`/\`msg\`/\`errors\` on the envelope on 2026-08-16 (WC-2026-08-16-error-envelope-compat-removal): such a read is undefined at runtime. Read \`data\` / \`error.code\` / \`error.label_key\` — or, for a NON-envelope shape (browser API, server stream frame, payload key, named failure extension key), add a NON_ENVELOPE_READS entry WITH ITS REASON in scripts/lib/client_compat_census.ts. Report: \`${FIX_COMMAND}\`.\n  ${offenders.join('\n  ')}`,
		).toEqual([]);
		expect(TOTALS.total).toBe(0);
	});

	test('the server compat block is DELETED: no ERROR_ENVELOPE_COMPAT, no compatFields, no `result:` written by convert.ts', () => {
		expect(
			codeOf(CONVERT_TS),
			`${CONVERT_TS} carries ERROR_ENVELOPE_COMPAT again — the compat block was removed on 2026-08-16 (ERRORS_SPEC §3.1) and no client reads the keys.`,
		).not.toMatch(/\bERROR_ENVELOPE_COMPAT\b/);
		// no top-level `result` key written by the converter (`result:` or `{ result }` shorthand)
		expect(codeOf(CONVERT_TS)).not.toMatch(/(?<![\w$.])result\s*[:}]/);
		expect(codeOf(SCHEMA_TS)).not.toMatch(/\bcompatFields\b/);
		expect(codeOf(SCHEMA_TS)).not.toMatch(/\b(msg|errors|result):\s*z\./);
		// the schema names `result` as FORBIDDEN (a converter regression fails every parse) — raw
		// source: codeOf() blanks string contents
		expect(read(SCHEMA_TS)).toMatch(/ENVELOPE_FORBIDDEN_KEYS[^=]*=\s*\[\s*'result'\s*\]/);
	});

	test('the scan is not vacuous', () => {
		expect(
			TOTALS.scanned,
			`Vacuous scan: only ${TOTALS.scanned} client files scanned (floor ${CORPUS_FLOOR}). Fix the scanner, never the floor.`,
		).toBeGreaterThanOrEqual(CORPUS_FLOOR);
		// the pinned transport consumers are in the census (the glob reaches them)
		const seen = new Set(RESULTS.map((result) => result.file));
		for (const file of TRANSPORT_CONSUMERS)
			expect(seen.has(file), `${file} not in the census`).toBe(true);
	});

	test('the non-envelope allowlist is printed: every entry, its hit count and its reason', () => {
		// The allowlist is DATA and is printed, so a reviewer sees every excuse
		// (rule 4 below fails on a stale one).
		const table = NON_ENVELOPE_READS.map((entry) => {
			const hits = codeOf(entry.file).match(new RegExp(entry.pattern.source, 'g'))?.length ?? 0;
			return `${entry.file} · /${entry.pattern.source}/ ×${hits} — ${entry.reason}`;
		});
		console.info(
			`non-envelope read allowlist (${NON_ENVELOPE_READS.length}):\n  ${table.join('\n  ')}`,
		);
		expect(table.length).toBe(NON_ENVELOPE_READS.length);
	});

	test('anti-vacuity: an allowlisted expression is the ONLY thing it blanks', () => {
		// tools/tool_diffusion/js/report_model.js excuses `sse.result` (a persisted job
		// record) — the neighbouring ENVELOPE read on the same line survives and is counted.
		const file = 'tools/tool_diffusion/js/report_model.js';
		const source = 'const a = sse.result; const b = api_response.result;';
		expect(countCompatReads(source, file).reads).toBe(1);
		expect(countCompatReads(source).reads).toBe(2);
		// `literal()` escapes: `sse.result` never matches `sseXresult`
		expect(countCompatReads('const a = sseXresult.result;', file).reads).toBe(1);
	});

	test('the counter is exact on the shapes it must and must not count (self-test)', () => {
		const source = [
			'const a = res.msg;', // 1 msg
			'const b = res.errors[0];', // 1 errors
			'const c = res.result;', // 1 result
			'const d = res.result_options;', // NOT: `_` continues the word
			'const e = res.results;', // NOT: `results` ≠ `result`
			'const f = page_globals.result;', // NOT: page_globals line
			"const g = 'x.msg y.result';", // NOT: string content blanked
			'// h.msg', // NOT: comment
			'/* i.errors */', // NOT: comment
			'const j = `${k.result}`;', // NOT: template content blanked
			'res.msg = "w";', // 1 msg (a write still lives on the name)
			'const l = obj.error.code;', // NOT: v2 field
		].join('\n');
		expect(countCompatReads(source)).toEqual({ reads: 4, byKey: { msg: 2, errors: 1, result: 1 } });
		expect(countCompatReads('')).toEqual({ reads: 0, byKey: { msg: 0, errors: 0, result: 0 } });
		// the regex itself: word boundary excludes the `_`-suffixed identifiers
		expect('.result_options'.match(COMPAT_READ)).toBeNull();
		expect('.result'.match(COMPAT_READ)).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Rule 4 — the exemption list stays honest.
// ---------------------------------------------------------------------------

describe('client error contract — rule 4: NON_ENVELOPE_READS is named, live and minimal', () => {
	test('every exemption names a measured file, carries a reason and still matches', () => {
		const measured = new Set(RESULTS.map((result) => result.file));
		const dead: string[] = [];
		for (const entry of NON_ENVELOPE_READS) {
			if (!measured.has(entry.file)) {
				dead.push(`${entry.file}: not a measured file (moved or deleted?)`);
				continue;
			}
			expect(
				entry.reason.length,
				`${entry.file}: an exemption without a reason is a blanket`,
			).toBeGreaterThan(20);
			const code = codeOf(entry.file);
			const matcher = new RegExp(entry.pattern.source, 'g');
			if (!matcher.test(code)) {
				dead.push(`${entry.file}: /${entry.pattern.source}/ matches nothing any more`);
			}
		}
		expect(
			dead,
			`STALE EXEMPTIONS in NON_ENVELOPE_READS (scripts/lib/client_compat_census.ts). An exemption that no longer matches is dead cover: delete it. Current list:\n${NON_ENVELOPE_READS.map((entry) => `  ${entry.file} /${entry.pattern.source}/ — ${entry.reason}`).join('\n')}\nDead:\n  ${dead.join('\n  ')}`,
		).toEqual([]);
	});

	test('an exemption blanks ONLY its own expression (self-test)', () => {
		// the counter with no file exempts nothing…
		expect(countCompatReads('const a = event.target.result;').reads).toBe(1);
		// …and with the file it does — while a real envelope read on the SAME line still counts
		expect(
			countCompatReads(
				'const a = event.target.result;',
				'client/dedalo/core/common/js/data_manager.js',
			).reads,
		).toBe(0);
		expect(
			countCompatReads(
				'const a = event.target.result + api_response.result;',
				'client/dedalo/core/common/js/data_manager.js',
			).reads,
		).toBe(1);
	});
});
