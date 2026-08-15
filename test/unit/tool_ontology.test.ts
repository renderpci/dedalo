/**
 * Gate: tool_ontology — the module contract and the DEVELOPER gate on the one
 * destructive action, `set_records_in_dd_ontology`.
 *
 * WHY THIS EXISTS. The action (up)serts dd_ontology rows, the table every runtime
 * tipo resolution reads. Its access control is TWO-layered by design — the
 * declarative `permission:'developer'` spec the dispatcher enforces BEFORE the
 * handler (PHP's framework gate), plus the handler's own `principal.isDeveloper`
 * check (PHP's `assert_developer()`, defence in depth). Neither layer had a test:
 * a spec edit to `null` or a dropped internal check would both have shipped green.
 *
 * Everything here is pure/argument-level — nothing in this file writes.
 */

import { describe, expect, test } from 'bun:test';
import type { Principal } from '../../src/core/security/permissions.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import type { ToolActionContext } from '../../src/core/tools/module.ts';
import { mustGet } from '../helpers/assert.ts';
import { refusalOf } from '../helpers/refusal.ts';

const DEVELOPER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
const PLAIN_USER: Principal = { userId: 99, isGlobalAdmin: false, isDeveloper: false };

function ctx(principal: Principal, options: Record<string, unknown>): ToolActionContext {
	return { principal, userId: principal.userId, options, background: false };
}

describe('tool_ontology module', () => {
	test('registers exactly set_records_in_dd_ontology, developer-gated, never background', async () => {
		const loaded = await getLoadedTool('tool_ontology');
		expect(loaded).not.toBeNull();
		const actions = loaded!.module.apiActions;
		expect(Object.keys(actions).sort()).toEqual(['set_records_in_dd_ontology']);
		expect(
			mustGet(actions.set_records_in_dd_ontology, 'set_records_in_dd_ontology').permission,
		).toBe('developer');
		// A dd_ontology wipe/rewrite must never be forkable into a background job:
		// backgroundRunnable is a SECOND allowlist, and this tool declares none.
		expect(loaded!.module.backgroundRunnable).toBeUndefined();
	});

	test('the handler refuses a non-developer even when the dispatch gate is bypassed', async () => {
		const loaded = await getLoadedTool('tool_ontology');
		const spec = mustGet(
			loaded!.module.apiActions.set_records_in_dd_ontology,
			'set_records_in_dd_ontology',
		);
		const refusal = await refusalOf(
			spec.handler(ctx(PLAIN_USER, { section_tipo: 'test0', section_id: 1 })),
		);
		// The refusal happens BEFORE the section_tipo is even looked at.
		expect(refusal.code).toBe('perm.developer_required');
	});

	test('a developer with no section_tipo is refused before any write', async () => {
		const loaded = await getLoadedTool('tool_ontology');
		const spec = mustGet(
			loaded!.module.apiActions.set_records_in_dd_ontology,
			'set_records_in_dd_ontology',
		);
		const refusal = await refusalOf(spec.handler(ctx(DEVELOPER, { section_id: 1 })));
		expect(refusal.code).toBe('request.invalid_options');
		expect(refusal.publicMessage).toBe('section_tipo is required');
	});

	test('an unresolvable section_tipo fails closed (no matrix table → nothing processed)', async () => {
		const loaded = await getLoadedTool('tool_ontology');
		const spec = mustGet(
			loaded!.module.apiActions.set_records_in_dd_ontology,
			'set_records_in_dd_ontology',
		);
		const refusal = await refusalOf(
			spec.handler(ctx(DEVELOPER, { section_tipo: 'no_such_section_9999', section_id: 1 })),
		);
		expect(refusal.code).toBe('tool.action_failed');
		// The ontology write's per-check detail rides the LOG-only message.
		expect(refusal.message).toContain('no matrix table');
	});
});
