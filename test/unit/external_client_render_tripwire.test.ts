/**
 * external CLIENT RENDER tripwire — the two client-side rules a
 * `component_external` view must obey, and the one URL the portal concatenates
 * (2026-08-06; `WC-2026-08-06-external-client-render`).
 *
 * WHY A GATE. Both rules are one careless line away from being undone, and
 * neither failure is visible in a screenshot:
 *
 *  1. AN ENTRY IS NEVER PARSED AS HTML. An entry is a string a THIRD-PARTY
 *     service put in this record. Until 2026-08-06 all four views injected it
 *     with `inner_html` / `insertAdjacentHTML`, on a documented contract that
 *     said "the server is responsible for sanitising" — the server sanitised
 *     nothing, so it was live stored XSS against a curator's session. The
 *     contract now EXISTS (`entries_kind`, per entry, emitted only for values
 *     the subsystem's allowlist sanitizer produced), and exactly one site in
 *     the whole component may act on it.
 *
 *  2. A DEGRADED SOURCE IS VISIBLE. The server never emits a silent blank: it
 *     emits `entries: []` plus a `source_status` naming the state. A view that
 *     renders the empty array and drops the status puts the blank back, and
 *     "the source did not answer" then looks exactly like "this work has no
 *     author" — the difference a cataloguer acts on. The CSS half matters as
 *     much as the DOM half: `stale` (data shown, possibly old) and
 *     `unavailable` (no data) that render identically are one state, not two.
 *
 *  3. `ui_base_url` IS VETTED SERVER-SIDE, ONCE. `component_portal.js`
 *     concatenates it with a section_id into a window the curator opens on
 *     click, and `api_config` is cataloguing data anyone with ontology write
 *     access can edit — so a `javascript:` value was stored XSS. The vetting
 *     lives in `publishApiConfig` (src/external/config.ts, gated by
 *     external_secret_confinement_tripwire); this gate keeps the client from
 *     growing a SECOND, unvetted concatenation site.
 *
 * SCOPE. Source-level, comment-stripped, credless — it runs in every tier. The
 * behavioural half (a `<script>` entry rendering as characters, a marker
 * appearing for each state) lives in the browser gate,
 * client/dedalo/test/client/js/test_component_external.js, which needs a live
 * server and is therefore not a `bun test` file.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXTERNAL_STATE_LABEL_KEY } from '../../src/core/components/component_external/value.ts';
import { stripComments } from '../helpers/strip_comments.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const COMPONENT_DIR = join(REPO_ROOT, 'client/dedalo/core/component_external');
const JS_DIR = join(COMPONENT_DIR, 'js');
const LESS_FILE = join(COMPONENT_DIR, 'css/component_external.less');
const PORTAL_FILE = join(REPO_ROOT, 'client/dedalo/core/component_portal/js/component_portal.js');

/** The ONE module allowed to decide how an entry is rendered. */
const RENDER_HELPERS = 'external_render.js';

/** HTML-parsing sinks (the `inner_html` ui.js option maps to insertAdjacentHTML). */
const HTML_SINK = /\b(innerHTML|inner_html|insertAdjacentHTML|outerHTML|update_node_content)\b/g;

function readStripped(path: string): string {
	return stripComments(readFileSync(path, 'utf-8'));
}

/** Every client module of this component, by DIRECTORY LISTING (never a list). */
const componentFiles: readonly string[] = readdirSync(JS_DIR)
	.filter((name) => name.endsWith('.js'))
	.sort();

/**
 * The RENDERING modules: the four views plus the search renderer. Derived from
 * the directory, so a fifth view added tomorrow is covered without an edit here
 * — the point of a gate is that it fails for code nobody remembered to list.
 */
const renderFiles: readonly string[] = componentFiles.filter(
	(name) => name.startsWith('view_') || name.startsWith('render_search_'),
);

// ---------------------------------------------------------------------------
// Rule 1 — an entry is never parsed as HTML
// ---------------------------------------------------------------------------

describe('external client render — an entry is text, not HTML', () => {
	test('the component has render modules to police (non-vacuity)', () => {
		// The four views the 2026-08-06 change covered, by name: if one is renamed
		// or deleted the directory-derived list above silently shrinks, and every
		// per-file assertion below would pass by not running.
		expect(renderFiles).toEqual([
			'render_search_component_external.js',
			'view_default_edit_component_external.js',
			'view_default_list_component_external.js',
			'view_mini_list_external.js',
			'view_text_list_component_external.js',
		]);
		expect(componentFiles).toContain(RENDER_HELPERS);
	});

	for (const file of componentFiles.filter((name) => name !== RENDER_HELPERS)) {
		test(`${file} reaches no HTML-parsing sink`, () => {
			const found = readStripped(join(JS_DIR, file)).match(HTML_SINK);
			expect(
				found,
				`${file} must render remote values through external_render.js (textContent, or the ONE server-declared markup branch) — found HTML sink(s) ${found?.join(', ')}.`,
			).toBeNull();
		});
	}

	test(`${RENDER_HELPERS} holds exactly ONE HTML sink, and it is the declared-markup branch`, () => {
		const code = readStripped(join(JS_DIR, RENDER_HELPERS));
		const sinks = code.match(HTML_SINK) ?? [];
		expect(
			sinks,
			'the markup branch is the single exception to rule 1; a second sink means an entry can be parsed on a path nobody reviewed',
		).toEqual(['inner_html']);
		// The branch must be CONDITIONAL on the server's per-entry declaration.
		expect(code).toMatch(/kind\s*===\s*'markup'\s*\?\s*\{\s*inner_html/);
	});

	test("the kind fails CLOSED — anything not exactly 'markup' is text", () => {
		const code = readStripped(join(JS_DIR, RENDER_HELPERS));
		// Only an EXACT match may widen rendering: a truthiness test, a !== 'text'
		// test, or a default of 'markup' would each turn a malformed or absent
		// entries_kind into permission to parse a remote service's string.
		expect(code).toMatch(/kinds\[i\]\s*===\s*'markup'/);
		expect(code).not.toMatch(/!==\s*'text'/);
		expect(code).not.toMatch(/entries_kind\s*(\|\||\?\?)\s*\[?\s*'markup'/);
	});

	test('every render module routes entries through the shared helpers', () => {
		// view_* render values; the search renderer renders inputs, not values.
		const valueViews = renderFiles.filter((name) => name.startsWith('view_'));
		for (const file of valueViews) {
			const code = readStripped(join(JS_DIR, file));
			expect(code, `${file} must import ${RENDER_HELPERS}`).toContain(`./${RENDER_HELPERS}`);
			expect(
				/\b(append_entries|build_entry_node)\s*\(/.test(code),
				`${file} must build entry nodes through append_entries / build_entry_node`,
			).toBe(true);
			// The old shape: a joined string handed to an HTML-parsing wrapper option.
			expect(code, `${file} must not re-join entries into one string`).not.toMatch(
				/entries\.join\(/,
			);
		}
	});
});

// ---------------------------------------------------------------------------
// Rule 2 — a degraded source is visible
// ---------------------------------------------------------------------------

describe('external client render — a degraded source is visible', () => {
	for (const file of renderFiles) {
		test(`${file} renders the source_status marker`, () => {
			const code = readStripped(join(JS_DIR, file));
			expect(
				/\bappend_source_status\s*\(/.test(code),
				`${file} must append the degradation marker — an empty component with no marker is indistinguishable from a record with no value, which is the exact ambiguity the server's source_status exists to remove.`,
			).toBe(true);
		});
	}

	test('the search renderer GUARDS its entries read', () => {
		// `data.entries[0]` on a component that degraded (server emits the status
		// and no entries) threw a TypeError that took the whole search inspector's
		// render down: one dead remote service made the search bar unusable.
		const code = readStripped(join(JS_DIR, 'render_search_component_external.js'));
		expect(code, 'read entries through a guarded local, never off data directly').not.toMatch(
			/data\.entries\s*\[/,
		);
		expect(code).toMatch(/Array\.isArray\(\s*data\.entries\s*\)/);
	});

	test('the marker carries the label KEY the server chose, never client prose', () => {
		const code = readStripped(join(JS_DIR, RENDER_HELPERS));
		// The server does not know the reader's application language, so it emits a
		// catalog key; hard-coding a message here would ship one language.
		expect(code).toMatch(/get_label\[\s*status\.label_key\s*\]/);
	});
});

// ---------------------------------------------------------------------------
// Rule 2, the visual half — every state, and no two that look the same
// ---------------------------------------------------------------------------

/** `&.state_x, &.state_y { … }` → declarations, per state. */
function parseStateRules(less: string): Map<string, string> {
	const rules = new Map<string, string>();
	const blocks = less.matchAll(/((?:\s*&\.state_[a-z_]+\s*,?)+)\{([^}]*)\}/g);
	for (const block of blocks) {
		const declarations = (block[2] ?? '')
			.split(';')
			.map((line) => line.replace(/\/\/.*$/, '').trim())
			.filter((line) => line.length > 0)
			.sort()
			.join(';');
		for (const selector of (block[1] ?? '').matchAll(/&\.state_([a-z_]+)/g)) {
			rules.set(selector[1] as string, declarations);
		}
	}
	return rules;
}

describe('external client render — each source state looks different', () => {
	const stateRules = parseStateRules(readFileSync(LESS_FILE, 'utf-8'));

	test('every server-emittable state has a rule', () => {
		// Totality against the SERVER's closed set, imported rather than copied:
		// a state added to value.ts with no style renders as unstyled text that
		// reads as part of the value.
		const missing = Object.keys(EXTERNAL_STATE_LABEL_KEY).filter((state) => !stateRules.has(state));
		expect(
			missing,
			`component_external.less needs a .state_<state> rule for each: ${missing.join(', ')}`,
		).toEqual([]);
		// Plus the client-only fallback for a state a NEWER server may emit —
		// rendered anyway, because dropping it restores the silent blank.
		expect(stateRules.has('unknown')).toBe(true);
	});

	test('no two states share a look', () => {
		const byDeclarations = new Map<string, string[]>();
		for (const [state, declarations] of stateRules) {
			byDeclarations.set(declarations, [...(byDeclarations.get(declarations) ?? []), state]);
		}
		const collisions = [...byDeclarations.values()].filter((states) => states.length > 1);
		expect(
			collisions,
			`states that render identically are one state to the user: ${collisions.map((s) => s.join('/')).join(', ')}`,
		).toEqual([]);
	});

	test("'stale' and 'unavailable' differ in more than colour", () => {
		// The pair the whole marker exists for: stale shows data that may be out of
		// date, unavailable shows none at all. Asserting the border differs keeps
		// the distinction alive in monochrome and for a colour-blind reader.
		const border = (state: string) =>
			(stateRules.get(state) ?? '')
				.split(';')
				.filter((declaration) => declaration.startsWith('border-style'))
				.join('');
		expect(border('stale')).not.toBe(border('unavailable'));
		expect(border('stale').length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// Rule 3 — one ui_base_url site, and it is the vetted one
// ---------------------------------------------------------------------------

describe('external client render — ui_base_url has ONE consumer', () => {
	test('component_portal.js is the only client file reading ui_base_url', () => {
		const offenders: string[] = [];
		const walk = (dir: string): void => {
			for (const entry of readdirSync(dir, { withFileTypes: true })) {
				const path = join(dir, entry.name);
				if (entry.isDirectory()) {
					walk(path);
					continue;
				}
				if (!entry.name.endsWith('.js')) continue;
				if (path === PORTAL_FILE) continue;
				if (readStripped(path).includes('ui_base_url')) offenders.push(path);
			}
		};
		walk(join(REPO_ROOT, 'client'));
		expect(
			offenders,
			'a second concatenation site would be a second place to forget that the value is operator-editable cataloguing data',
		).toEqual([]);
	});

	test('the portal site is guarded and names the server-side vetting', () => {
		const raw = readFileSync(PORTAL_FILE, 'utf-8');
		// The COMMENT is part of the contract here: it is what stops the guard from
		// being "simplified" back into a raw concatenation by a future reader who
		// cannot see where the value was checked.
		expect(raw).toContain('publishApiConfig');
		const code = stripComments(raw);
		// A refused binding is DROPPED from the published config, so the read must
		// survive its absence rather than throw inside a click handler.
		expect(code).toMatch(/if\s*\(\s*!ui_base_url\s*\)/);
		expect(code).toMatch(/const\s+url\s*=\s*ui_base_url\s*\+\s*section_id/);
	});
});
