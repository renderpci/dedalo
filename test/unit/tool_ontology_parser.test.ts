/**
 * Gate: tool_ontology_parser — the module contract, the developer gate on all
 * five actions, and the two READ wires the client renders.
 *
 * `test/unit/ontology_data_io.test.ts` already covers the export pipeline's
 * ordering/abort semantics with an injected IO. What was untested is the part a
 * user actually touches first: the ACTION SURFACE (five developer-gated actions,
 * none background-runnable) and the two reads —
 *
 *  - get_ontologies      → the census the tool's checkbox list is built from.
 *    Its wire is EXACTLY five keys; adding a sixth leaks census internals
 *    (name_data) to the browser, dropping one blanks a column.
 *  - inspect_ontologies  → `states[]`, which render_tool_ontology_parser.js reads
 *    as `state.inSync` / `state.matrixNodes` / `state.mainNodeOk` /
 *    `state.drift[].kind`. A renamed field renders "Status unavailable".
 *
 * Both reads are pure: this file writes nothing.
 */

import { describe, expect, test } from 'bun:test';
import type { Principal } from '../../src/core/security/permissions.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import type { ToolActionContext, ToolActionSpec } from '../../src/core/tools/module.ts';
import { mustGet } from '../helpers/assert.ts';

const DEVELOPER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
const PLAIN_USER: Principal = { userId: 99, isGlobalAdmin: false, isDeveloper: false };

const ACTIONS = [
	'export_ontologies',
	'get_ontologies',
	'inspect_ontologies',
	'reconcile_ontologies',
	'regenerate_ontologies',
];

function ctx(principal: Principal, options: Record<string, unknown> = {}): ToolActionContext {
	return { principal, userId: principal.userId, options, background: false };
}

async function action(name: string): Promise<ToolActionSpec> {
	const loaded = await getLoadedTool('tool_ontology_parser');
	expect(loaded).not.toBeNull();
	return mustGet(loaded!.module.apiActions[name], name);
}

describe('tool_ontology_parser module', () => {
	test('registers the five actions, all developer-gated, none background-runnable', async () => {
		const loaded = await getLoadedTool('tool_ontology_parser');
		expect(loaded).not.toBeNull();
		const actions = loaded!.module.apiActions;
		expect(Object.keys(actions).sort()).toEqual(ACTIONS);
		for (const name of ACTIONS) {
			expect(mustGet(actions[name], name).permission).toBe('developer');
		}
		expect(loaded!.module.backgroundRunnable).toBeUndefined();
	});

	test('every action refuses a non-developer even with the dispatch gate bypassed', async () => {
		// Defence in depth (PHP assert_developer): the declarative spec is the
		// framework gate, the in-handler check is the second lock. Two of these
		// actions WRITE the runtime ontology, so both locks must hold on their own.
		for (const name of ACTIONS) {
			const res = await (await action(name)).handler(
				ctx(PLAIN_USER, { selected_ontologies: ['test'] }),
			);
			expect(res.result).toBe(false);
			expect(res.errors).toContain('unauthorized');
		}
	});

	test('get_ontologies emits EXACTLY the five UI metadata fields', async () => {
		const res = await (await action('get_ontologies')).handler(ctx(DEVELOPER));
		expect(res.result).not.toBe(false);
		const list = res.result as Record<string, unknown>[];
		expect(Array.isArray(list)).toBe(true);
		expect(list.length).toBeGreaterThan(0);
		for (const entry of list) {
			expect(Object.keys(entry).sort()).toEqual([
				'name',
				'target_section_tipo',
				'tld',
				'typology_id',
				'typology_name',
			]);
		}
		// The census is the source of the checkbox list — the core TLDs are in it.
		const tlds = list.map((entry) => entry.tld);
		expect(tlds).toContain('dd');
		expect(tlds).toContain('test');
	});

	test('inspect_ontologies is a READ that returns one state per requested tld', async () => {
		const res = await (await action('inspect_ontologies')).handler(
			ctx(DEVELOPER, { selected_ontologies: ['test', 'dd'] }),
		);
		expect(res.result).toBe(true);
		const states = res.states as Record<string, unknown>[];
		expect(Array.isArray(states)).toBe(true);
		expect(states.length).toBe(2);
		// The exact keys render_tool_ontology_parser.js reads off each state.
		for (const state of states) {
			for (const key of ['tld', 'matrixNodes', 'storedNodes', 'mainNodeOk', 'drift', 'inSync']) {
				expect(key in state).toBe(true);
			}
			expect(Array.isArray(state.drift)).toBe(true);
			// storedNodes counts the bootstrap <tld>0 main node, which is NOT parsed
			// from a matrix record — so a healthy tld is matrixNodes + 1, and reading
			// the difference as drift would be wrong.
			expect(state.mainNodeOk).toBe(true);
			if (state.inSync === true) {
				expect(state.storedNodes).toBe((state.matrixNodes as number) + 1);
				expect((state.drift as unknown[]).length).toBe(0);
			}
		}
		// Every drift entry is one of the three kinds the client counts.
		for (const state of states) {
			for (const item of state.drift as { kind: string; tipo: string; diffColumns: string[] }[]) {
				expect(['missing', 'stale', 'orphaned']).toContain(item.kind);
				expect(typeof item.tipo).toBe('string');
				expect(Array.isArray(item.diffColumns)).toBe(true);
			}
		}
	});

	test('inspect_ontologies on a malformed tld reports not-in-sync instead of throwing', async () => {
		// safeTld is /^[a-z]{2,}$/ — the panel must render a failed check, not a 500.
		const res = await (await action('inspect_ontologies')).handler(
			ctx(DEVELOPER, { selected_ontologies: ['9x', 'DD;DROP'] }),
		);
		expect(res.result).toBe(true);
		const states = res.states as Record<string, unknown>[];
		expect(states.length).toBe(2);
		for (const state of states) {
			expect(state.tld).toBeNull();
			expect(state.inSync).toBe(false);
			expect(state.matrixNodes).toBe(0);
		}
	});

	test('inspect_ontologies with no selection is an empty read, not a whole-install sweep', async () => {
		const res = await (await action('inspect_ontologies')).handler(ctx(DEVELOPER, {}));
		expect(res.result).toBe(true);
		expect(res.states).toEqual([]);
	});

	test('export_ontologies refuses an absent or empty selection (PHP parity)', async () => {
		for (const options of [{}, { selected_ontologies: [] }, { selected_ontologies: null }]) {
			const res = await (await action('export_ontologies')).handler(ctx(DEVELOPER, options));
			expect(res.result).toBe(false);
			expect(res.errors).toContain('selected_ontologies must be a non-empty array');
		}
	});
});
