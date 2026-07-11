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
 *  3. LEDGER HONESTY — every UNPORTED stub is ledgered in rewrite/LEDGER.md
 *     by name (never-narrow law: silent [] was the pre-framework defect).
 *  4. SINGLE DISPATCH — the registry map is built ONLY in widgets/registry.ts
 *     and no src/ file resurrects the pre-split shapes (a widget_name switch
 *     or the ASYNC_WIDGETS set).
 *  5. ONTOLOGY CENSUS (DB) — every properties.widgets[].widget_name declared
 *     in the shared dd_ontology is registered, so no section read can hit
 *     WidgetNotRegisteredError on this install's data.
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

	test('every UNPORTED stub is ledgered by name in rewrite/LEDGER.md', () => {
		const ledger = readFileSync(join(REPO_ROOT, 'rewrite/LEDGER.md'), 'utf-8');
		const unledgered = widgets
			.filter((widget) => 'unported' in widget)
			.map((widget) => widget.name)
			.filter((name) => !ledger.includes(name));
		expect(
			unledgered,
			`Unported widget stubs with no rewrite/LEDGER.md row — the never-narrow law requires a ledger line per uncovered path: ${unledgered.join(', ')}`,
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
});
