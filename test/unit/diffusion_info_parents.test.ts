/**
 * WC-066 GATE — `get_diffusion_info` node `parents[]` carries label + type.
 *
 * WHY THIS EXISTS. The accordion panel header text IS
 * `diffusion_element_parent.label` (render_tool_diffusion.js:493) and the
 * group key IS `diffusion_group_parent.label` (:462). `info.ts` emitted only
 * `{tipo, model}`, so `ui.create_dom_element` got `text_content: undefined`,
 * whose setter is guarded by `else if(options.text_content)` (ui.js:1863) —
 * the header rendered EMPTY (the blank bar above the panel grid), silently.
 *
 * The oracle put the whole path item on the wire (`$item->parents =
 * $vnode->parents`, class.diffusion_utils.php:265) and built it as
 * `{tipo, model, label}` + `type` ONLY on diffusion_element(_alias), with the
 * `?? 'unknown'` fallback (:345-352). `realTipo` is a TS-only alias memo the
 * oracle never had and must NOT reach the client.
 */
// BINDS INSTALL TLDs: mdcat — install-specific fixtures, grandfathered in
// engineering/generic_tld_baseline.json (generic_tld_tripwire, shrink-only). This test
// is meaningful only on a database holding those installs' records. Migrate it to a
// built situation (src/core/test_data/situations) or the generic `test` TLD, then
// regenerate the baseline (`bun run scripts/generic_tld_baseline.ts`).

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toWirePathItem } from '../../src/diffusion/api/info.ts';
import type { VirtualPathItem } from '../../src/diffusion/plan/virtual_tree.ts';

const ROOT = join(import.meta.dir, '..', '..');
const read = (relative: string): string => readFileSync(join(ROOT, relative), 'utf8');

const groupItem: VirtualPathItem = {
	tipo: 'mdcat595',
	model: 'diffusion_group',
	label: 'Web',
	realTipo: null,
};
const elementItem: VirtualPathItem = {
	tipo: 'mdcat353',
	model: 'diffusion_element',
	label: 'Image',
	realTipo: null,
	type: 'sql',
};

describe('get_diffusion_info parents[] — the path item the client reads', () => {
	test('a non-element item carries tipo, model and label (no type key)', () => {
		const wire = toWirePathItem(groupItem);
		expect(Object.keys(wire).sort()).toEqual(['label', 'model', 'tipo']);
		expect(wire.label).toBe('Web');
	});

	test('an element item ALSO carries type (the panel header + type switch)', () => {
		const wire = toWirePathItem(elementItem);
		expect(Object.keys(wire).sort()).toEqual(['label', 'model', 'tipo', 'type']);
		expect(wire.label).toBe('Image');
		expect(wire.type).toBe('sql');
	});

	test('an element alias keeps its type too', () => {
		const wire = toWirePathItem({ ...elementItem, model: 'diffusion_element_alias' });
		expect(wire.type).toBe('sql');
		expect(wire.label).toBe('Image');
	});

	test('the TS-only realTipo memo NEVER reaches the client', () => {
		for (const item of [groupItem, elementItem, { ...elementItem, realTipo: 'mdcat999' }]) {
			expect(Object.keys(toWirePathItem(item))).not.toContain('realTipo');
		}
	});

	test('a null label stays null — never the string "undefined"', () => {
		const wire = toWirePathItem({ ...groupItem, label: null });
		expect(wire.label).toBeNull();
		expect(wire.label).not.toBe('undefined');
	});

	test('an element whose ontology declares no type is not silently dropped', () => {
		// virtual_tree stamps 'unknown' (PHP :351 `?? 'unknown'`); whatever the
		// builder produced must survive the emit unchanged.
		const wire = toWirePathItem({ ...elementItem, type: 'unknown' });
		expect(wire.type).toBe('unknown');
	});
});

describe('get_diffusion_info parents[] — client welding', () => {
	test('the client still reads .label off the element and group parents', () => {
		const client = read('tools/tool_diffusion/js/render_tool_diffusion.js');
		expect(client).toContain('text_content	: diffusion_element_parent.label');
		expect(client).toContain('diffusion_group_parent ? diffusion_group_parent.label');
		expect(client).toContain('diffusion_element_parent ? diffusion_element_parent.type');
	});

	test('info.ts no longer emits the two-key path item', () => {
		const info = read('src/diffusion/api/info.ts');
		expect(info).not.toContain(
			'parents: node.parents.map((item) => ({ tipo: item.tipo, model: item.model }))',
		);
	});
});
