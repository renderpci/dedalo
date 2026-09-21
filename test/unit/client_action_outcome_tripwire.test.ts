/**
 * TRIPWIRE — a client action reads its OWN OUTCOME before committing
 * (P2-2 / CLI-04, CLI-16, CLI-17, CLI-18).
 *
 * `ts_object.swap_parent` fired `update_parent_data` WITHOUT awaiting it, then
 * committed the re-parent locally regardless: instance reassignment, rekey,
 * destroy-cascade move between `ar_instances`, `appendChild`, `virtual_order`
 * recompute. The `.then()` it attached showed an error notification and
 * REVERTED NOTHING. So on a server failure a curator saw an error toast AND a
 * thesaurus tree showing the term under its new parent — the client and the
 * database disagreeing about where a heritage record sits, with the screen
 * asserting the version that did not happen (CLI-04).
 *
 * The same shape, three more times. `service_autocomplete`'s default pick
 * fired `link_record` with the comment "Don't wait here" and played the visual
 * grammar of success while the door's own contract says nothing is dropped
 * silently (CLI-16). `ui.load_item_with_spinner` swallowed a callback throw
 * AFTER it had emptied the container — a blank pane, no message, inside the
 * helper that renders the page's top-level elements (CLI-17). And the 'big'
 * modal restored the page scroll from a GLOBAL one-shot `modal_close`
 * subscription that whichever modal closed first consumed — a nested confirm's
 * Cancel scrolled the page back under the still-open modal (CLI-18).
 *
 * The audit's diagnosis was exact each time: the server side is atomic and
 * correct, so the divergence is entirely the client's refusal to wait and read.
 *
 * THE CENSUS IS TOTAL, derived from the tree. Every `data_manager.request(`
 * call site and every call of a relation door (`link_record`, `link_records`,
 * `unlink_record`, `update_parent_data`, `delete_locator`) in client/ + tools/
 * must READ its answer: assigned, returned, passed as an argument, tested, or
 * `.then`-chained. `data_manager.request` RESOLVES a failure (the envelope
 * carries `error`; it never rejects on one), so a bare `await` reads nothing —
 * a refused save is reported as done. The exemptions are ENUMERATED with a
 * reason each and are shrink-only; an entry is keyed by file + the statement
 * text, never a line number, and a stale entry (statement gone) is itself red.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { discoverFiles } from '../../scripts/lib/client_compat_census.ts';
import { stripComments } from '../helpers/strip_comments.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const TS_OBJECT = 'client/dedalo/core/ts_object/js/ts_object.js';
const UI = 'client/dedalo/core/common/js/ui.js';
const API_ERROR = 'client/dedalo/core/common/js/api_error.js';
const AUTOCOMPLETE_VIEW =
	'client/dedalo/core/services/service_autocomplete/js/view_default_autocomplete.js';
const MASTER_LABELS = 'src/core/labels/master.json';

const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), 'utf8');
/** Comments AND string literals blanked: the fixes QUOTE the old shapes to record what changed. */
const code = (rel: string): string => stripComments(read(rel), { blankStrings: true });
/** Comments stripped, strings KEPT — for assertions on a channel name or a size literal. */
const codeWithStrings = (rel: string): string => stripComments(read(rel));

/**
 * The brace-balanced body of `opening`'s function (comments already stripped,
 * so a brace in a comment cannot fool the walk; strings blanked or kept by the
 * reader, either way a brace inside a string is the reader's problem — the
 * blanking reader is used wherever a string could hold one). Slicing to
 * end-of-file is how a gate gets fooled by an extract-the-helper refactor.
 */
const functionBody = (source: string, opening: string): string => {
	const start = source.indexOf(opening);
	expect(start, `not found: ${opening}`).toBeGreaterThan(-1);
	const from = source.indexOf('{', start);
	let depth = 0;
	for (let i = from; i < source.length; i++) {
		if (source[i] === '{') depth++;
		else if (source[i] === '}') {
			depth--;
			if (depth === 0) return source.slice(from, i);
		}
	}
	throw new Error(`unterminated: ${opening}`);
};

/** The body of swap_parent, bounded to its own function. */
function swapParentBody(source: string): string {
	// THE DEFINITION, not the first mention. `swap_parent` is named in five JSDoc
	// blocks before it is defined, so indexOf() started the slice ~1500 lines
	// early and the ordering assertions below compared against unrelated code.
	const start = source.indexOf('ts_object.prototype.swap_parent = async function');
	expect(start, 'swap_parent not found — the gate is reading nothing').toBeGreaterThan(-1);
	const end = source.indexOf('//end swap_parent', start);
	return source.slice(start, end === -1 ? start + 8000 : end);
}

describe('a re-parent commits only after the server agrees', () => {
	test('the server call is AWAITED, not fired and forgotten', () => {
		const body = swapParentBody(read(TS_OBJECT));
		expect(body.length).toBeGreaterThan(500);
		expect(
			body,
			'update_parent_data is called without await — the local commit runs regardless of ' +
				'whether the server accepted the move',
		).toMatch(/await self\.update_parent_data\(/);
	});

	test('a failure returns BEFORE any local mutation', () => {
		// The ordering is the whole invariant. Every local mutation must come
		// after the refusal, or a failed move still half-lands on screen.
		const body = swapParentBody(read(TS_OBJECT));
		const awaited = body.indexOf('await self.update_parent_data(');
		// The refusal that FOLLOWS the await, not the function's early guards —
		// swap_parent opens with several `return false` validity checks, and
		// indexOf() found the first of those instead (measured: index 281 against
		// an await at 2729, so this assertion failed on correct code).
		const refusal = body.indexOf('return false', awaited);
		expect(awaited).toBeGreaterThan(-1);
		for (const mutation of [
			'moving_instance.caller',
			'moving_instance.rekey()',
			'ar_instances.splice',
		]) {
			const at = body.indexOf(mutation);
			expect(at, `${mutation} not found — swap_parent changed shape`).toBeGreaterThan(-1);
			expect(
				at,
				`${mutation} runs BEFORE the awaited server call — a rejected move would still ` +
					'commit locally',
			).toBeGreaterThan(awaited);
		}
		expect(refusal).toBeGreaterThan(awaited);
	});

	test('the failure path still tells the curator', () => {
		// Refusing silently would trade one wrong screen for another.
		const body = swapParentBody(read(TS_OBJECT));
		const failure = body.slice(body.indexOf('await self.update_parent_data('));
		expect(failure.slice(0, 1800)).toMatch(/response_data\(api_response\)/);
		expect(failure.slice(0, 1800)).toMatch(/type\s*:\s*'error'/);
	});

	test('the doc states the contract the code now keeps', () => {
		// The old block said "(!) Note: the await is intentionally omitted … the
		// caller attaches a .then() handler" — accurate about the mechanism, wrong
		// about it being safe, and a stale comment is how the next reader restores
		// the defect. Matched on the ORIGINAL PHRASING, not on the words, because
		// the replacement quotes the old text to record what changed: an
		// unanchored search finds the quotation and reports the defect present.
		const source = read(TS_OBJECT);
		expect(source).not.toMatch(/\(!\) Note: the await is intentionally omitted/);
		expect(source, 'the doc must say the caller awaits').toMatch(/The caller AWAITS this/);
	});
});

// ---------------------------------------------------------------------------
// THE TOTAL CENSUS: every API call site reads its answer
// ---------------------------------------------------------------------------

/**
 * The browser corpus: the REGISTERED lister (scripts/lib/client_compat_census.ts
 * SCAN_ROOTS — client/dedalo + tools, whole trees, minus the browser test harness
 * and vendored/minified twins). No root is chosen here.
 */
const browserSources = (): string[] => discoverFiles();

/** Index of the `)` closing the `(` at `open`, or -1. */
const closingParen = (src: string, open: number): number => {
	let depth = 0;
	for (let i = open; i < src.length; i++) {
		if (src[i] === '(') depth++;
		else if (src[i] === ')') {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
};

type CallSite = { file: string; line: number; statement: string; read: boolean };

/**
 * Every call matching `pattern` in the browser trees, with whether its value is
 * READ. Read means: the call is the right-hand side of an assignment, returned
 * (`return` / arrow body), an argument, an operand of a test (`!`, `?`, `&&`,
 * `||`, `:`), or `.then`-chained on its closing paren. A bare statement —
 * `await x(...)` or `x(...)` alone on its line — reads nothing.
 *
 * `pattern` must start at the call's receiver dot for member calls (`\.name\(`)
 * or at the receiver identifier for a fixed receiver (`data_manager.request(`).
 */
function callSites(pattern: RegExp, files: string[]): CallSite[] {
	const sites: CallSite[] = [];
	for (const file of files) sites.push(...scanSource(code(file), pattern, file));
	return sites;
}

/** The scanner itself, over one source (also fed synthetic sources as a positive control). */
function scanSource(src: string, pattern: RegExp, file: string): CallSite[] {
	const sites: CallSite[] = [];
	for (const match of src.matchAll(pattern)) {
		const at = match.index as number;
		// walk back over the receiver chain (`self.caller?.`, `component_tags_draw.`)
		let receiver = at;
		if (src[at] === '.') {
			while (receiver > 0 && /[\w$.?\][]/.test(src[receiver - 1] as string)) receiver--;
		}
		const open = src.indexOf('(', at);
		const close = closingParen(src, open);
		const before = src.slice(Math.max(0, receiver - 200), receiver);
		const after = src.slice(close + 1, close + 40);
		const statement = (before.split(/[\n;{}]/).pop() as string).trim();
		const read =
			/(=|return|=>|\(|,|\?|:|\|\||&&|!)\s*(await\s*)?$/.test(statement) ||
			/^\s*\.then\s*\(/.test(after);
		sites.push({
			file,
			line: src.slice(0, at).split('\n').length,
			statement: read ? statement : src.slice(receiver, close + 1).replace(/\s+/g, ' '),
			read,
		});
	}
	return sites;
}

/**
 * A SHRINK-ONLY exemption: keyed by file + the exact call text (whitespace
 * collapsed), never a line number, so a refactor around it does not silently
 * re-key it and a removed statement makes the entry stale — and red.
 */
type Exemption = { file: string; call: string; reason: string };

const REQUEST_EXEMPTIONS: Exemption[] = [
	{
		file: 'client/dedalo/core/page/js/page.js',
		call: 'prevent_lock : true, options : { component_tipo : null,',
		reason:
			'the lock RELEASE of the previous component after a record answered in_use: best-effort ' +
			'housekeeping, corrected by the lock TTL; nothing on screen depends on the answer.',
	},
	{
		file: 'client/dedalo/core/page/js/page.js',
		call: 'prevent_lock : true, options : { component_tipo : ca.tipo,',
		reason:
			'the 45 s lock HEARTBEAT: best-effort housekeeping. A toast every 45 s on a network blip ' +
			'would be wrong; a lost refresh is corrected by the next beat or the lock TTL.',
	},
];

const DOOR_EXEMPTIONS: Exemption[] = [];

/** An exemption matches ONE unread site by file + a substring of its call text (strings blanked). */
const exempted = (site: CallSite, exemptions: Exemption[]): Exemption | undefined =>
	exemptions.find((e) => e.file === site.file && site.statement.includes(e.call));

function assertCensus(
	name: string,
	pattern: RegExp,
	exemptions: Exemption[],
	floor: number,
	maxExemptions: number,
): CallSite[] {
	const files = browserSources();
	expect(files.length, 'the browser census found almost no files').toBeGreaterThan(400);
	const sites = callSites(pattern, files);
	expect(sites.length, `${name}: the census found almost no call sites`).toBeGreaterThan(floor);

	// every exemption is LIVE (its statement still exists, unread) and matches
	// EXACTLY ONE site — a stale one is red, and so is one wide enough to cover two
	expect(exemptions.length, `${name}: the exemption list is shrink-only`).toBeLessThanOrEqual(
		maxExemptions,
	);
	for (const e of exemptions) {
		const covered = sites.filter((s) => !s.read && exempted(s, [e]) === e);
		expect(
			covered.length,
			`${name}: exemption for ${e.file} "${e.call}" covers ${covered.length} unread sites — ` +
				'one entry per site: a stale entry is removed, a wide one is narrowed',
		).toBe(1);
	}

	const offenders = sites
		.filter((s) => !s.read && !exempted(s, exemptions))
		.map((s) => `${s.file}:${s.line}  ${s.statement}`);
	expect(
		offenders,
		`${name}: an API call whose answer nobody reads — a refused action reported as done. ` +
			'Read the outcome (assign / return / test / .then) and act on it; never exempt it here ' +
			'without a reason that names what is lost.',
	).toEqual([]);
	return sites;
}

describe('census: every API call reads its answer', () => {
	test('every data_manager.request site reads the envelope (TOTAL, client/ + tools/)', () => {
		// Measured: 225 sites; 2 exempted, both the portal lock's best-effort
		// housekeeping. The two render_*.js entries this list used to carry (the
		// login change_lang and the tool_import_rdf default-lang selector) were
		// FIXED, not re-reasoned: their only justification was a file lock that no
		// longer exists.
		assertCensus('data_manager.request', /\bdata_manager\.request\(/g, REQUEST_EXEMPTIONS, 150, 2);
	});

	test('every relation-door call reads the outcome (TOTAL, client/ + tools/)', () => {
		// link_record/unlink_record answer a boolean; link_records / update_parent_data
		// / delete_locator answer an outcome object with a named refusal set.
		// Measured: 18 sites; ZERO exempted. The four render_*.js sites this list
		// used to carry now read their outcome, so the list is empty and — being
		// shrink-only, capped at 0 — can never grow again.
		const sites = assertCensus(
			'relation doors',
			/\.(?:link_record|link_records|unlink_record|update_parent_data|delete_locator)\(/g,
			DOOR_EXEMPTIONS,
			10,
			4,
		);
		// the positive controls: the sites this row fixed are in the census AND read
		for (const fixed of [
			`${AUTOCOMPLETE_VIEW}`,
			'client/dedalo/core/component_dataframe/js/view_default_list_dataframe.js',
			'client/dedalo/core/component_portal/js/drag_and_drop.js',
			'client/dedalo/core/component_common/js/dataframe.js',
		]) {
			const own = sites.filter((s) => s.file === fixed);
			expect(own.length, `${fixed} left the census`).toBeGreaterThan(0);
			expect(
				own.every((s) => s.read),
				`${fixed} dropped an outcome again`,
			).toBe(true);
		}
	});

	test('the scanner sees an unread call (positive control)', () => {
		// A census that can only ever report [] proves nothing. Feed it the shapes
		// it must catch and the shapes it must accept.
		const probe = (src: string): boolean => {
			const site = scanSource(src, /\bdata_manager\.request\(/g, '<probe>');
			expect(site.length).toBe(1);
			return (site[0] as CallSite).read;
		};
		expect(probe('async function f() {\n\tawait data_manager.request({a:1})\n}')).toBe(false);
		expect(probe('function f() {\n\tdata_manager.request({a:1})\n}')).toBe(false);
		expect(probe('function f() {\n\tif (x) { data_manager.request({a:1}) }\n}')).toBe(false);
		expect(probe('async function f() {\n\tconst r = await data_manager.request({a:1})\n}')).toBe(
			true,
		);
		expect(probe('function f() {\n\treturn data_manager.request({a:1})\n}')).toBe(true);
		expect(probe('function f() {\n\tdata_manager.request({a:1}).then(r => r)\n}')).toBe(true);
		expect(probe('function f() {\n\tif (!data_manager.request({a:1})) {}\n}')).toBe(true);
		const door = scanSource(
			'async function f() {\n\tself.caller?.link_record(value)\n}',
			/\.(?:link_record)\(/g,
			'<probe>',
		);
		expect((door[0] as CallSite).read).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// CLI-16 — the autocomplete's default pick
// ---------------------------------------------------------------------------

describe('the autocomplete pick reads the door it fires (CLI-16)', () => {
	test('the default selection awaits commit_selection before the grammar of success', () => {
		const source = code(AUTOCOMPLETE_VIEW);
		const handler = source.slice(
			source.indexOf('const selection_handler = async'),
			source.indexOf('//end selection_handler'),
		);
		expect(handler.length).toBeGreaterThan(300);
		const commit = handler.indexOf('await commit_selection(self, value)');
		expect(commit, 'the default pick no longer awaits the door').toBeGreaterThan(-1);
		// the old shape, by mechanism not by comment: a link_record on the caller
		expect(handler, 'link_record fired directly again — its answer is dropped').not.toMatch(
			/\.link_record\(/,
		);
		// and the widget hides only AFTER the answer
		expect(handler.indexOf('self.hide()', commit), 'hide() runs before the answer').toBeGreaterThan(
			commit,
		);
	});

	test('commit_selection calls link_records and surfaces every refusal', () => {
		const body = functionBody(codeWithStrings(AUTOCOMPLETE_VIEW), 'export const commit_selection');
		expect(body).toMatch(/const outcome\s*=\s*await caller\.link_records\(\s*\[locator\]\s*\)/);
		expect(body, 'a refusal is not surfaced').toMatch(/refused\.length\s*>\s*0/);
		const refusalBranch = body.slice(body.indexOf('refused.length'));
		expect(refusalBranch, 'the refusal never reaches the cataloguer').toMatch(
			/event_manager\.publish\(\s*'notification'/,
		);
		expect(body).toMatch(/return outcome/);
	});
});

// ---------------------------------------------------------------------------
// CLI-17 — a throwing loader renders the engine's failure surface
// ---------------------------------------------------------------------------

describe('a throwing loader produces a visible failure, not an empty node (CLI-17)', () => {
	test('the catch renders the error panel where the node would go, and returns it', () => {
		const body = functionBody(code(UI), 'load_item_with_spinner : async function');
		const catchAt = body.indexOf('} catch (error)');
		expect(catchAt, 'no catch in load_item_with_spinner').toBeGreaterThan(-1);
		const catchBody = body.slice(catchAt);
		expect(catchBody, 'the catch does not build the engine panel').toMatch(
			/render_error_panel\(api_error\)/,
		);
		expect(catchBody, 'the catch still returns null — a blank pane').not.toMatch(/return null/);
		// BOTH placements, each named: measured on the first draft, a single
		// /replaceWith\(error_node\)/ stayed green when the placeholder branch was
		// turned back into a bare remove() — the container branch still matched.
		expect(catchBody, "the panel never takes the placeholder's place").toMatch(
			/container_placeholder\.replaceWith\(error_node\)/,
		);
		expect(catchBody, 'the replace_container branch drops the panel').toMatch(
			/\bcontainer\.replaceWith\(error_node\)/,
		);
		expect(catchBody).toMatch(/return error_node/);
	});

	test('a thrown non-ApiError is minted as client.render_failed; an ApiError travels as it is', () => {
		const body = functionBody(code(UI), 'load_item_with_spinner : async function');
		const catchBody = body.slice(body.indexOf('} catch (error)'));
		expect(catchBody).toMatch(/is_api_error\(error\)/);
		expect(catchBody).toMatch(/new ApiError\(/);
		expect(catchBody).toMatch(/CLIENT_ERROR\.RENDER_FAILED/);
		// the code exists in the closed client registry, with its label key and fallback text
		const registry = read(API_ERROR);
		expect(registry).toMatch(/RENDER_FAILED\s*:\s*'client\.render_failed'/);
		expect(registry).toMatch(/\[CLIENT_ERROR\.RENDER_FAILED\]\s*:\s*'error_client_render_failed'/);
		const messages = registry.slice(registry.indexOf('const CLIENT_ERROR_MESSAGE'));
		expect(messages.slice(0, 1200)).toMatch(/\[CLIENT_ERROR\.RENDER_FAILED\]\s*:\s*'/);
		// …and the label ships in master.json (labels_tripwire owns the catalogs)
		const labels = JSON.parse(read(MASTER_LABELS)) as Record<string, string>;
		expect(labels.error_client_render_failed).toBeString();
		expect((labels.error_client_render_failed as string).length).toBeGreaterThan(10);
	});
});

// ---------------------------------------------------------------------------
// CLI-18 — the big modal's scroll restore is keyed to ITS close
// ---------------------------------------------------------------------------

describe("the big modal's scroll restore is element-scoped (CLI-18)", () => {
	test('no subscriber to the global modal_close channel exists anywhere', () => {
		const files = browserSources();
		expect(files.length).toBeGreaterThan(400);
		const subscribers: string[] = [];
		for (const file of files) {
			// comments stripped, strings KEPT: the channel name is the string
			const raw = stripComments(read(file));
			for (const m of raw.matchAll(/subscribe(?:_once)?\(\s*['"]modal_close['"]/g)) {
				subscribers.push(`${file}:${raw.slice(0, m.index).split('\n').length}`);
			}
		}
		expect(
			subscribers,
			'a subscription to the global modal_close channel: modals nest, so it fires on the ' +
				"wrong modal's close — bind to the element's dd-modal-close instead",
		).toEqual([]);
	});

	test('the scroll offset is restored inside the element-scoped teardown, for size big', () => {
		const body = functionBody(codeWithStrings(UI), 'attach_to_modal : (options) =>');
		const teardown = body.slice(body.indexOf('const teardown = () =>'));
		expect(teardown.length).toBeGreaterThan(100);
		const scroll = /window\.scrollTo\(\s*\{\s*top\s*:\s*page_y_offset/.exec(teardown);
		expect(scroll, 'the teardown does not restore the scroll offset').not.toBeNull();
		// bound to THIS element's close event
		expect(teardown).toMatch(
			/modal_container\.addEventListener\(\s*'dd-modal-close'\s*,\s*teardown\s*\)/,
		);
		// guarded by the size, so a normal modal does not scroll the page
		const guard = teardown.slice(0, (scroll as RegExpExecArray).index);
		expect(guard).toMatch(/size\s*===\s*'big'/);
		// and only ONE scrollTo in attach_to_modal — the old handler is gone
		expect((body.match(/window\.scrollTo\(/g) ?? []).length).toBe(1);
		// the channel has no publisher from here any more
		expect(body).not.toMatch(/publish\(\s*'modal_close'/);
	});
});
