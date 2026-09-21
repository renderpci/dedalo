/**
 * A PUBLICATION DECISION IS NEVER SILENT (P2-13 / PUB-07).
 *
 * `resolveGate` ended in a bare `} catch { return 'unpublish'; }` — no log, no
 * counter, no reason. `'unpublish'` flows to `session.removeRecords`: removal of
 * rows from the PUBLIC heritage website. Failing closed is the documented safe
 * direction and it stays. The defect was that a resolution FAILURE was
 * indistinguishable from a curator's decision to unpublish, so an operator saw
 * records disappear from a museum's public site with no reason recorded
 * anywhere.
 *
 * And it was never executed. The audit measured ZERO executions of that catch in
 * a full-suite coverage run: the two tests literally named "publication gate
 * (fail-closed…)" drive the decision paths and never force a throw. This file
 * forces it — hermetically, with no database — so the branch that decides
 * whether heritage rows leave a public website is reachable somewhere other than
 * production.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MatrixRecord } from '../../src/core/db/matrix.ts';
import {
	type CompileOptions,
	type ParserClassifier,
	validateElementPlan,
} from '../../src/diffusion/plan/compile.ts';
import type {
	OntologyIndex,
	RawOntologyNode,
	VirtualDiffusionTree,
	VirtualTreeNode,
} from '../../src/diffusion/plan/virtual_tree.ts';
import { type RunContext, resolveGate } from '../../src/diffusion/resolve/resolver.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

const RECORD = {
	section_tipo: 'test2',
	section_id: 4242,
	relation: {},
} as unknown as MatrixRecord;

/**
 * The minimum ctx `resolveGate` touches. `boom` poisons the FIRST lookup, which
 * is how the throw is forced without a database — the real-world causes (a
 * failed ontology read, a malformed stored locator) all surface at the same
 * place.
 */
function contextWith(boom: boolean, overrides?: Partial<RunContext>): RunContext {
	const sectionPublishableOverride = boom
		? ({
				get() {
					throw new Error('ontology unreachable');
				},
			} as unknown as Map<string, boolean | null>)
		: new Map<string, boolean | null>();
	return {
		options: {},
		sectionPublishableOverride,
		publishableOverrides: new Map(),
		publicationTipoCache: new Map([['test2', null]]),
		...overrides,
	} as unknown as RunContext;
}

describe('a publication decision is never silent', () => {
	test('a gate FAILURE fails closed AND says why', async () => {
		const warnings: string[] = [];
		const realWarn = console.warn;
		console.warn = (...args: unknown[]) => warnings.push(args.join(' '));
		try {
			const result = await resolveGate(contextWith(true), RECORD);
			// Fail-closed: unchanged, and the whole point of the branch.
			expect(result.status).toBe('unpublish');
			// ...but now DISTINGUISHABLE from a decided unpublish.
			expect(result.failure).toBeDefined();
			expect(result.failure).toContain('ontology unreachable');
		} finally {
			console.warn = realWarn;
		}
		// And loudly: the operator's log names the record it could not decide.
		expect(warnings.join('\n')).toContain('publication gate FAILED');
		expect(warnings.join('\n')).toContain('test2/4242');
		expect(warnings.join('\n')).toContain('REMOVED from the public site');
	});

	test('a DECIDED unpublish carries no failure — the two stay distinguishable', async () => {
		const ctx = contextWith(false, {
			sectionPublishableOverride: new Map([['test2', false]]),
		} as Partial<RunContext>);
		const result = await resolveGate(ctx, RECORD);
		expect(result.status).toBe('unpublish');
		expect(result.failure).toBeUndefined();
	});

	test('an ordinary publish is unaffected', async () => {
		const ctx = contextWith(false, {
			sectionPublishableOverride: new Map([['test2', true]]),
		} as Partial<RunContext>);
		expect(await resolveGate(ctx, RECORD)).toEqual({ status: 'publish' });
	});

	test('the skip option still bypasses the gate entirely', async () => {
		const ctx = contextWith(true, {
			options: { skipPublicationStateCheck: true },
		} as unknown as Partial<RunContext>);
		// Even with a poisoned lookup: the bypass returns before the try block.
		expect(await resolveGate(ctx, RECORD)).toEqual({ status: 'publish' });
	});

	test('the failure reaches the operator-facing error list, not just the log', async () => {
		// A console line is not a record: journald rotates. processRecord must put
		// the failure into the batch errors — the job's error list is the
		// operator's ONLY view of a partial publication.
		const source = readFileSync(join(REPO_ROOT, 'src/diffusion/resolve/resolver.ts'), 'utf8');
		expect(source).toContain('PUBLICATION_GATE_ERROR_FIELD');
		expect(source).toMatch(/if \(gate\.failure !== undefined\) \{[\s\S]{0,400}errors\.push\(/);
		expect(source).toContain('REMOVED from the public site');
	});
});

/**
 * THE OTHER HALF OF P2-13 (PUB-08) — a retired directive spelling must not
 * compile to silence.
 *
 * `properties.process.parser` naming an UNREGISTERED function is a hard compile
 * ERROR, under a comment citing "nothing silent". The v6 spelling of the whole
 * directive — `process_dato`, still carried by 18 ontology nodes — misses the
 * `process?.parser` read entirely and yields an EMPTY transform with zero
 * errors, zero warnings and zero degradations. The field publishes untransformed
 * and nothing says the ontology asked for a transform at all.
 *
 * The louder an engine is about a mistyped function name, the more misleading
 * its silence about a directive it no longer reads.
 *
 * BEHAVIOURAL, NOT SPELLED (P1-13 un-masked this, 2026-09-03). The first
 * version of this leg asserted the compiler's SOURCE contained the right
 * identifiers — and the report those identifiers implemented looked only for
 * `process_dato.parser`, an object shape NO shipped node carries: every one of
 * the 18 nodes spells the directive as a STRING fn
 * (`"process_dato": "diffusion_sql::resolve_value"`). Green gate, silent
 * engine, on exactly the rows it was written for. Both shapes are now
 * compiled through the real compiler over an INJECTED tree (no database) and
 * the degradation is asserted on the report, with the fieldId, for each.
 * diffusion_seed_compiles_native measures the same report on the SHIPPED
 * dd1099 element.
 */
describe('a retired parser spelling is reported, not silently dropped', () => {
	// The smallest tree the compiler will walk: one sql element → database →
	// table → the two field nodes under test (compile.ts CompileOptions.tree).
	function treeWith(
		fields: { tipo: string; properties: Record<string, unknown> }[],
	): VirtualDiffusionTree {
		const path: VirtualTreeNode['parents'] = [
			{ tipo: 'el1', model: 'diffusion_element', label: 'el', realTipo: null, type: 'sql' },
		];
		const fieldNodes = new Map<string, RawOntologyNode>(
			fields.map((field) => [
				field.tipo,
				{
					tipo: field.tipo,
					parent: 'tb1',
					model: 'field_text',
					term: { 'lg-spa': field.tipo },
					properties: field.properties,
					relations: null,
				},
			]),
		);
		const index: OntologyIndex = {
			nodeOf: async (tipo) => fieldNodes.get(tipo) ?? null,
			childTipos: async () => [],
			relatedByModel: async () => [],
			relationTipos: async () => [],
			resolveAlias: async () => null,
		};
		const base = { realTipo: null, isAlias: false, childrenTipos: [], relatedSections: [] };
		return {
			domainName: 'test',
			domainTipo: 'dom1',
			index,
			nodes: [
				{
					...base,
					tipo: 'el1',
					model: 'diffusion_element',
					label: 'el',
					properties: { diffusion: { type: 'sql' } },
					parents: [],
					directChildrenTipos: ['db1'],
				},
				{
					...base,
					tipo: 'db1',
					model: 'database',
					label: 'web_test',
					properties: null,
					parents: path,
					directChildrenTipos: ['tb1'],
				},
				{
					...base,
					tipo: 'tb1',
					model: 'table',
					label: 'interview',
					properties: null,
					parents: path,
					childrenTipos: fields.map((field) => field.tipo),
					directChildrenTipos: fields.map((field) => field.tipo),
					relatedSections: ['test6813'],
				},
			],
		};
	}

	const options = (
		fields: { tipo: string; properties: Record<string, unknown> }[],
	): CompileOptions => ({
		tree: treeWith(fields),
		classifyParserFn: (() => 'unknown') as ParserClassifier,
		resolveModelByTipo: async () => null,
	});

	test('the SHIPPED shape — a string fn — and the object shape both surface as retired_parser_spelling with the fieldId', async () => {
		const report = await validateElementPlan(
			'el1',
			options([
				// the shape every one of the 18 shipped nodes carries (dd1419…dd1509)
				{
					tipo: 'zzf1',
					properties: {
						process_dato: 'diffusion_sql::resolve_value',
						process_dato_arguments: { target_component_tipo: 'zzf9' },
					},
				},
				// the object shape the first report looked for
				{
					tipo: 'zzf2',
					properties: { process_dato: { parser: [{ fn: 'diffusion_sql::map_to_terminoID' }] } },
				},
				// a v7 field with no directive: nothing to report
				{ tipo: 'zzf3', properties: { exclude_column: false } },
			]),
		);
		expect(report.errors).toEqual([]);
		expect(report.result).not.toBeNull();
		// The floor: two directives were planted, two reports must come back.
		expect(report.degradations.length).toBe(2);
		const degraded = report.degradations.map((item) => `${item.fieldId}:${item.reason}`).sort();
		expect(degraded).toEqual(['zzf1:retired_parser_spelling', 'zzf2:retired_parser_spelling']);
		// The report names the fn the ontology asked for and the replacement —
		// what an operator needs to port the directive.
		const shipped = report.degradations.find((item) => item.fieldId === 'zzf1');
		expect(shipped?.message).toContain('diffusion_sql::resolve_value');
		expect(shipped?.message).toContain("'process'");
		expect(shipped?.message).toContain('NO transform');
		// ...and the field still publishes (untransformed): it is in the plan.
		const fieldIds = (report.result?.sections[0]?.fields ?? []).map((field) => field.id);
		expect(fieldIds).toEqual(['zzf1', 'zzf2', 'zzf3']);
	});

	test('the degradation reason is a closed union the run report can switch on', () => {
		// A free-text message alone would be unreportable: the run report groups by
		// reason, so a new degradation kind has to be declared, not improvised.
		const types = readFileSync(join(REPO_ROOT, 'src/diffusion/plan/types.ts'), 'utf8');
		expect(types).toMatch(/reason: 'dangling_ddo_tipo' \| 'retired_parser_spelling';/);
	});
});
