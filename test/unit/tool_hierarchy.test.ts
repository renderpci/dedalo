/**
 * Gate: tool_hierarchy — the module contract of the reference "tool that OWNS no
 * logic" (engineering/TOOLS_SPEC.md §tool_hierarchy).
 *
 * The two actions are a READ and a WRITE over an invariant that lives in
 * src/core/ontology/hierarchy_state.ts. What must not drift is the DOOR:
 *
 *  - inspect_hierarchy is `section` / minLevel **1** — seeing WHY a hierarchy is
 *    broken is a read, and the panel renders on every open. Raising it to 2 makes
 *    the status panel blank for read-only users.
 *  - generate_virtual_section is `section` / minLevel **2** — it provisions
 *    sections and writes root-term locators.
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
		expect(inspect.permission).toBe('section');
		expect(inspect.minLevel).toBe(1);
		const generate = mustGet(actions.generate_virtual_section, 'generate_virtual_section');
		expect(generate.permission).toBe('section');
		expect(generate.minLevel).toBe(2);
		expect(loaded!.module.backgroundRunnable).toBeUndefined();
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
