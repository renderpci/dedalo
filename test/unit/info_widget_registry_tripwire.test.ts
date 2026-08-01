/**
 * component_info WIDGET REGISTRY tripwire — the framework invariants of
 * src/core/components/component_info/widgets/ (DEC-12: invariants are
 * tripwired or deleted).
 *
 * Guards:
 *  1. CLIENT-TREE BINDING — every registered descriptor's ontology `path`
 *     resolves to the byte-identical client module
 *     client/dedalo/core/widgets<path>/js/<name>.js (dispatch is by NAME
 *     through the registry, never by loading the path; the path is exactly
 *     this verification datum).
 *  2. GATE COVERAGE — every PORTED widget's name appears in a `test(` title
 *     of a parity/unit gate (no widget lands without an assertion naming it).
 *  3. UNPORTED HONESTY — every UNPORTED stub carries a SUBSTANTIVE
 *     `unported.reason` on its own descriptor (never-narrow law: silent [] was
 *     the pre-framework defect). Until 2026-07-11 the declaration lived in
 *     rewrite/LEDGER.md and was checked by substring; that file is internal
 *     process and left the repo, so the declaration moved to the stub itself —
 *     a strictly stronger gate (it sits next to the code it excuses, it cannot
 *     be satisfied by an unrelated mention elsewhere in a long document, and it
 *     survives any doc reshuffle).
 *  4. SINGLE DISPATCH — the registry map is built ONLY in widgets/registry.ts
 *     and no src/ file resurrects the pre-split shapes (a widget_name switch
 *     or the ASYNC_WIDGETS set).
 *  5. ONTOLOGY CENSUS (DB) — every properties.widgets[].widget_name declared
 *     in the shared dd_ontology is registered, so no section read can hit
 *     WidgetNotRegisteredError on this install's data.
 *  6. FLAT-ITEM WIRE CONTRACT (client) — no client widget renderer may read a
 *     widget DATA item through a `.value` envelope. computeInfoWidgets emits
 *     FLAT items ({widget, key, id, widget_id, column, type, value, lang,
 *     locator}); component_info.js reads them flat too. The state + oh
 *     descriptors renderers shipped in the initial TS commit dereferencing an
 *     extra level (`item.value.key`, `item.value.column`, …), so every filter
 *     matched nothing and the widget rendered BLANK with no console error —
 *     the oh28-on-oh1 report, fixed 2026-08-01. `self.datalist` entries ARE
 *     `.value`-wrapped ({value:{section_tipo,section_id}, label}); those keys
 *     are therefore excluded here.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { listInfoWidgets } from '../../src/core/components/component_info/widgets/registry.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(join(REPO_ROOT, dir))) {
		const rel = `${dir}/${entry}`;
		if (statSync(join(REPO_ROOT, rel)).isDirectory()) walk(rel, out);
		else if (entry.endsWith('.ts')) out.push(rel);
	}
	return out;
}

describe('info widget registry tripwire', () => {
	const widgets = listInfoWidgets();

	test('registry is non-empty and names are unique', () => {
		expect(widgets.length).toBeGreaterThanOrEqual(11); // PHP census 2026-07-10
		const names = widgets.map((widget) => widget.name);
		expect(new Set(names).size).toBe(names.length);
	});

	test('every descriptor path resolves to the client widget module (client-tree binding)', () => {
		const missing: string[] = [];
		for (const widget of widgets) {
			const clientModule = join(
				REPO_ROOT,
				'client/dedalo/core/widgets',
				`.${widget.path}`,
				'js',
				`${widget.name}.js`,
			);
			try {
				statSync(clientModule);
			} catch {
				missing.push(`${widget.name} → ${widget.path}`);
			}
		}
		expect(
			missing,
			`Registered widget paths with NO client module under client/dedalo/core/widgets/<path>/js/<name>.js — a path typo here means the client silently drops the widget slot: ${missing.join(', ')}`,
		).toEqual([]);
	});

	test('every PORTED widget name appears in a test() title of a gate', () => {
		const titles: string[] = [];
		const testFiles = [...walk('test/unit'), ...walk('test/parity')].filter((file) =>
			file.endsWith('.test.ts'),
		);
		for (const file of testFiles) {
			const content = readFileSync(join(REPO_ROOT, file), 'utf-8');
			for (const match of content.matchAll(/\btest(?:\.\w+)?\(\s*['"`]([^'"`]+)/g)) {
				titles.push(match[1] ?? '');
			}
		}
		const uncovered = widgets
			.filter((widget) => !('unported' in widget))
			.map((widget) => widget.name)
			.filter((name) => !titles.some((title) => title.includes(name)));
		expect(
			uncovered,
			`Ported widgets with no gate naming them in a test() title — add a differential/unit case before registering the port: ${uncovered.join(', ')}`,
		).toEqual([]);
	});

	test('every UNPORTED stub declares a substantive reason on its own descriptor', () => {
		// The type already demands `unported: { reason: string }` — but '' satisfies
		// the compiler. The never-narrow law wants a real explanation of the gap, so
		// require prose a human actually wrote, in the file that carries the stub.
		const MIN_REASON = 20;
		const undeclared: string[] = [];
		for (const widget of widgets) {
			if (!('unported' in widget)) continue; // `in` narrows the descriptor union
			if (widget.unported.reason.trim().length < MIN_REASON) undeclared.push(widget.name);
		}
		expect(
			undeclared,
			`Unported widget stubs with no substantive \`unported.reason\` (>= ${MIN_REASON} chars) — the never-narrow law requires each uncovered path to say WHY, next to the stub: ${undeclared.join(', ')}`,
		).toEqual([]);
	});

	test('single dispatch home — no widget_name switch or ASYNC set outside the registry', () => {
		const violations: string[] = [];
		for (const file of walk('src')) {
			const content = readFileSync(join(REPO_ROOT, file), 'utf-8');
			if (file !== 'src/core/components/component_info/widgets/registry.ts') {
				if (/INFO_WIDGETS\s*[:=]/.test(content)) violations.push(`${file}: INFO_WIDGETS map`);
			}
			if (/ASYNC_WIDGETS/.test(content)) violations.push(`${file}: ASYNC_WIDGETS set`);
			if (
				/switch\s*\(\s*(?:widget_?name|name)\s*\)\s*\{[\s\S]{0,400}case\s*'get_archive_weights'/.test(
					content,
				)
			) {
				violations.push(`${file}: widget_name switch`);
			}
		}
		expect(
			violations,
			`Widget dispatch outside widgets/registry.ts — the registry is the ONE home (pre-split shapes must not come back): ${violations.join(', ')}`,
		).toEqual([]);
	});

	test('ontology census (DB): every declared widget_name is registered', async () => {
		const { sql } = await import('../../src/core/db/postgres.ts');
		const rows = (await sql`
			SELECT DISTINCT widget->>'widget_name' AS name
			FROM dd_ontology, jsonb_array_elements(properties->'widgets') AS widget
			WHERE properties ? 'widgets' AND jsonb_typeof(properties->'widgets') = 'array'
		`) as { name: string | null }[];
		const registered = new Set(widgets.map((widget) => widget.name));
		const unknown = rows
			.map((row) => row.name)
			.filter((name): name is string => typeof name === 'string' && name !== '')
			.filter((name) => !registered.has(name));
		expect(
			unknown,
			`Ontology-declared widget_names with NO registry entry — a section read hitting these throws WidgetNotRegisteredError; register a widget module (or an unported stub + ledger row): ${unknown.join(', ')}`,
		).toEqual([]);
	});

	test('client passes only SUPPORTED text options to ui.create_dom_element', () => {
		// ui.create_dom_element (client/dedalo/core/common/js/ui.js) sets text from
		// exactly three keys, in this precedence: inner_html > text_node >
		// text_content. Any other `inner_*` key is SILENTLY IGNORED and the element
		// renders EMPTY — no error, no warning. The v7 state renderer invented
		// `inner_text` (v6 has zero occurrences of it), which is why the situation
		// column rendered as blank spans while the state column, still on
		// inner_html, rendered fine. Fixed 2026-08-01.
		const CLIENT_ROOT = 'client/dedalo';
		const badKey = /\binner_(?!html\b)[a-z_]+\s*:/;
		const offenders: string[] = [];
		const walkJs = (dir: string): void => {
			for (const entry of readdirSync(join(REPO_ROOT, dir))) {
				const rel = `${dir}/${entry}`;
				if (statSync(join(REPO_ROOT, rel)).isDirectory()) {
					walkJs(rel);
					continue;
				}
				if (!entry.endsWith('.js')) continue;
				for (const [index, line] of readFileSync(join(REPO_ROOT, rel), 'utf8')
					.split('\n')
					.entries()) {
					const code = line.trim();
					if (code.startsWith('*') || code.startsWith('//') || code.startsWith('/*')) continue;
					if (badKey.test(line)) offenders.push(`${rel}:${index + 1}: ${code}`);
				}
			}
		};
		walkJs(CLIENT_ROOT);

		expect(
			offenders,
			`Unsupported inner_* option passed to ui.create_dom_element — it is silently dropped and the element renders EMPTY. Use inner_html (parsed), text_node or text_content (plain text):\n${offenders.join('\n')}`,
		).toEqual([]);
	});

	test('client renderers read widget data items FLAT (no .value envelope)', () => {
		// Keys of an emitted widget item. section_tipo/section_id are OMITTED on
		// purpose: those are datalist keys, which ARE legitimately .value-wrapped.
		const ITEM_KEYS = ['key', 'id', 'widget_id', 'column', 'type', 'lang'];
		const envelope = new RegExp(`\\.value\\.(?:${ITEM_KEYS.join('|')})\\b`);
		const widgetsRoot = 'client/dedalo/core/widgets';

		const offenders: string[] = [];
		const walkJs = (dir: string): void => {
			for (const entry of readdirSync(join(REPO_ROOT, dir))) {
				const rel = `${dir}/${entry}`;
				if (statSync(join(REPO_ROOT, rel)).isDirectory()) {
					walkJs(rel);
					continue;
				}
				if (!entry.endsWith('.js')) continue;
				const lines = readFileSync(join(REPO_ROOT, rel), 'utf8').split('\n');
				for (const [index, line] of lines.entries()) {
					// Skip comments — prose may legitimately quote the broken shape.
					const code = line.trim();
					if (code.startsWith('*') || code.startsWith('//') || code.startsWith('/*')) continue;
					if (envelope.test(line)) offenders.push(`${rel}:${index + 1}: ${code}`);
				}
			}
		};
		walkJs(widgetsRoot);

		expect(
			offenders,
			`Client widget renderer reads a DATA item through a .value envelope. The server emits FLAT items — such a lookup silently matches nothing and the widget renders BLANK. Use item.<key>, not item.value.<key> (only self.datalist is .value-wrapped):\n${offenders.join('\n')}`,
		).toEqual([]);
	});
});
