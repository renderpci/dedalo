/**
 * Gate: tool_hierarchy — the module contract of the reference "tool that OWNS no
 * logic" (engineering/TOOLS_SPEC.md §tool_hierarchy).
 *
 * The two actions are a READ and a WRITE over an invariant that lives in
 * src/core/ontology/hierarchy_state.ts. What must not drift is the DOOR:
 *
 *  - inspect_hierarchy is `targets` / minLevel **1** — seeing WHY a hierarchy is
 *    broken is a read, and the panel renders on every open. Raising it to 2 makes
 *    the status panel blank for read-only users.
 *  - generate_virtual_section is `targets` / minLevel **2** — it provisions
 *    sections and writes root-term locators.
 *  - BOTH bind their gate to the record the state module is PINNED to,
 *    `hierarchy1/<section_id>` — never to the client's `section_tipo`, which the
 *    writer ignores (audit CARRY-08). The behavioural half (a principal holding
 *    write on the declared-but-wrong section is REFUSED) is
 *    action_scope_binding_native.
 *  - neither is background-runnable.
 *
 * The convergence behaviour itself is covered by hierarchy_state_native /
 * hierarchy_generate_native; this file only asserts the gate + the argument
 * validation that must refuse BEFORE anything is touched.
 */

import { describe, expect, test } from 'bun:test';
import type { Principal } from '../../src/core/security/permissions.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import type { ToolActionContext } from '../../src/core/tools/module.ts';
import { mustGet } from '../helpers/assert.ts';
import { refusalOf } from '../helpers/refusal.ts';

const PRINCIPAL: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };

function ctx(options: Record<string, unknown>): ToolActionContext {
	return { principal: PRINCIPAL, userId: -1, options, background: false };
}

describe('tool_hierarchy module', () => {
	test('registers inspect_hierarchy (read, level 1) + generate_virtual_section (write, level 2)', async () => {
		const loaded = await getLoadedTool('tool_hierarchy');
		expect(loaded).not.toBeNull();
		const actions = loaded!.module.apiActions;
		expect(Object.keys(actions).sort()).toEqual(['generate_virtual_section', 'inspect_hierarchy']);
		const inspect = mustGet(actions.inspect_hierarchy, 'inspect_hierarchy');
		expect(inspect.permission).toBe('targets');
		expect(inspect.minLevel).toBe(1);
		const generate = mustGet(actions.generate_virtual_section, 'generate_virtual_section');
		expect(generate.permission).toBe('targets');
		expect(generate.minLevel).toBe(2);
		expect(loaded!.module.backgroundRunnable).toBeUndefined();
	});

	test('both gates name the PINNED hierarchy record, whatever section_tipo the client sends', async () => {
		const loaded = await getLoadedTool('tool_hierarchy');
		for (const name of ['inspect_hierarchy', 'generate_virtual_section']) {
			const spec = mustGet(loaded!.module.apiActions[name], name);
			expect(typeof spec.targets, `${name} must declare a targets extractor`).toBe('function');
			// A client that names ANOTHER section (one it holds write on) is still
			// gated on hierarchy1/<id>: the section it sends is not consulted.
			expect(spec.targets!({ section_tipo: 'test3', section_id: 7 })).toEqual([
				{ section_tipo: 'hierarchy1', section_id: 7 },
			]);
		}
	});

	test('a section_tipo other than hierarchy1 is refused as an unusable target', async () => {
		const loaded = await getLoadedTool('tool_hierarchy');
		const generate = mustGet(
			loaded!.module.apiActions.generate_virtual_section,
			'generate_virtual_section',
		);
		const refusal = await refusalOf(
			generate.handler(ctx({ section_tipo: 'test3', section_id: 1 })),
		);
		expect(refusal.code).toBe('request.invalid_options');
	});

	test('both actions refuse an unusable target before touching the DB', async () => {
		const loaded = await getLoadedTool('tool_hierarchy');
		const inspect = mustGet(loaded!.module.apiActions.inspect_hierarchy, 'inspect_hierarchy');
		const generate = mustGet(
			loaded!.module.apiActions.generate_virtual_section,
			'generate_virtual_section',
		);
		// Missing section_id, blank section_tipo, id 0 and a non-numeric id are all
		// refused — the WRITE must never fall through to hierarchy record 0/NaN.
		const badOptions: Record<string, unknown>[] = [
			{ section_tipo: 'hierarchy1' },
			{ section_tipo: '', section_id: 1 },
			{ section_tipo: 'hierarchy1', section_id: 0 },
			{ section_tipo: 'hierarchy1', section_id: 'abc' },
			{},
		];
		for (const options of badOptions) {
			for (const [name, action] of [
				['inspect_hierarchy', inspect],
				['generate_virtual_section', generate],
			] as const) {
				const refusal = await refusalOf(action.handler(ctx(options)));
				expect(refusal.code).toBe('request.invalid_options');
				// Which action refused stays legible in the LOG-only message.
				expect(refusal.message).toContain(name);
			}
		}
	});
});
