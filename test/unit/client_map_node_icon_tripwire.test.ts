/**
 * MAP NODE ICON TRIPWIRE — the System Map's node list is stated TWICE.
 *
 * ── WHAT IT GUARDS ───────────────────────────────────────────────────────────
 * `MAP_NODES` in render_area_maintenance.js declares which subsystem cards the
 * maintenance System Map renders. Each card's identifying icon is CSS-owned:
 * one `[data-node="<id>"] .n_icon { .fn_add_mask('<icon>.svg') }` rule per id in
 * area_maintenance.less. Nothing links the two lists but the author's memory —
 * so a node added to the JS alone renders with the generic `gear.svg` fallback
 * and NOTHING says it is wrong, and a renamed id leaves a dead LESS rule behind.
 *
 * This is the "tripwire or delete" law (DEC-12) applied to a cosmetic pairing:
 * the failure is visible on screen rather than corrupting data, but the rule is
 * stated in two files and must be enforced by a machine, not a habit.
 *
 * ── WHAT IT DOES NOT GUARD ───────────────────────────────────────────────────
 * That each id got the RIGHT icon (a semantic choice, not a mechanical one),
 * nor that the mask renders — `bun run css:check` proves the LESS compiles into
 * the committed main.css, and the browser suite proves the panel paints.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const JS_PATH = 'client/dedalo/core/area_maintenance/js/render_area_maintenance.js';
const LESS_PATH = 'client/dedalo/core/area_maintenance/css/area_maintenance.less';

const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), 'utf8');

/** ids declared in the MAP_NODES literal (that block only — `id:` is common). */
function mapNodeIds(source: string): string[] {
	const open = source.indexOf('const MAP_NODES = [');
	if (open === -1) throw new Error(`MAP_NODES literal not found in ${JS_PATH}`);
	const close = source.indexOf('\n\t]', open);
	if (close === -1) throw new Error(`MAP_NODES literal is unterminated in ${JS_PATH}`);
	const block = source.slice(open, close);
	return [...block.matchAll(/\bid\s*:\s*'([^']+)'/g)].map((m) => m[1] as string);
}

/** ids that carry an icon rule in the LESS. */
function iconRuleIds(source: string): string[] {
	return [...source.matchAll(/\[data-node="([^"]+)"\]\s*\.n_icon/g)].map((m) => m[1] as string);
}

describe('system map node icons', () => {
	const nodes = mapNodeIds(read(JS_PATH));
	const icons = iconRuleIds(read(LESS_PATH));

	// anti-vacuity: a regex that silently stops matching must not read as green
	test('both lists are non-empty censuses', () => {
		expect(nodes.length).toBeGreaterThanOrEqual(8);
		expect(icons.length).toBeGreaterThanOrEqual(8);
	});

	test('neither list repeats an id', () => {
		expect([...new Set(nodes)]).toEqual(nodes);
		expect([...new Set(icons)]).toEqual(icons);
	});

	test('every map node has an icon rule', () => {
		const missing = nodes.filter((id) => !icons.includes(id));
		expect(
			missing,
			`map node(s) with no .n_icon rule in ${LESS_PATH} (they would fall back to gear.svg)`,
		).toEqual([]);
	});

	test('every icon rule names a real map node', () => {
		const orphan = icons.filter((id) => !nodes.includes(id));
		expect(orphan, `dead .n_icon rule(s) in ${LESS_PATH} — no such id in MAP_NODES`).toEqual([]);
	});

	test('each icon rule masks an svg that exists', () => {
		const less = read(LESS_PATH);
		const rules = [
			...less.matchAll(/\[data-node="([^"]+)"\]\s*\.n_icon\s*\{[^}]*?\.fn_add_mask\('([^']+)'\)/g),
		];
		expect(rules.length).toBe(icons.length);
		for (const [, id, icon] of rules) {
			const file = join(REPO_ROOT, 'client/dedalo/core/themes/default/icons', icon as string);
			expect(() => readFileSync(file), `node '${id}' masks a missing icon: ${icon}`).not.toThrow();
		}
	});
});
