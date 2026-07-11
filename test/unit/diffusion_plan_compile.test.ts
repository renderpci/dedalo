/**
 * Plan compiler gates (DIFFUSION_PLAN D3-P1) against the REAL dev ontology
 * (DEDALO_DIFFUSION_DOMAIN=numisdata_mib → dd1190 domain node numisdata323).
 *
 * THE GUARANTEES under test:
 * - the flat virtual tree reproduces the PHP oracle walk (diffusion_utils::
 *   get_virtual_diffusion_tree/:194 semantics): domain resolution, alias
 *   in-place resolution, consumed-branch suppression, parents paths;
 * - every diffusion element of the domain either compiles into a
 *   PublicationPlan or fails LOUDLY with named causes (spec §5 — no silent
 *   narrowing, ever);
 * - a real sql element yields sections/fields whose database/table/column
 *   names ALL pass the identifier chokepoint grammar (spec §8.3);
 * - alias semantics: a table_alias-backed section publishes under the ALIAS
 *   label while its fields come from the REAL table's children (merged);
 * - unknown parser fn → compile error naming the field;
 * - plans are plain JSON (dumpable, diffable, shippable to a runner);
 * - the plan cache is revision-keyed: same revision → same object, a bump
 *   (any dd_ontology write) → recompile with a new planId.
 *
 * READ-ONLY suite: it never writes dd_ontology — the revision bump is called
 * directly (the write layer reaches it through the cache-invalidation hub).
 *
 * The parser classifier is INJECTED (compile.ts CompileOptions) so this suite
 * does not depend on the parser-registry module's build state: the rewriter
 * set below mirrors DIFFUSION_SPEC §5 / parsers/registry.ts.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { readEnv } from '../../src/config/env.ts';
import {
	bumpOntologyRevision,
	currentOntologyRevision,
	getCompiledPlan,
} from '../../src/diffusion/plan/cache.ts';
import {
	PlanCompileError,
	compileElementPlan,
	validateElementPlan,
} from '../../src/diffusion/plan/compile.ts';
import type { ParserClassifier } from '../../src/diffusion/plan/compile.ts';
import type { PublicationPlan } from '../../src/diffusion/plan/types.ts';
import {
	buildVirtualDiffusionTree,
	findElementNodes,
} from '../../src/diffusion/plan/virtual_tree.ts';
import type {
	VirtualDiffusionTree,
	VirtualTreeNode,
} from '../../src/diffusion/plan/virtual_tree.ts';

/** Strict identifier grammar (identifier.ts SQL_IDENTIFIER_PATTERN). */
const IDENTIFIER_GRAMMAR = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * Compile-time rewriters (spec §5 list; mirrors parsers/registry.ts). The
 * test classifier treats every OTHER fn as runtime — the real registry is
 * stricter (unknown names error), but this suite pins the SPLIT mechanics,
 * not the registry contents (registry has its own 1:1 oracle-diff gate).
 */
const REWRITER_FNS = new Set([
	'parser_locator::get_locator',
	'parser_locator::parents',
	'parser_locator::filter_parents_by_term_id',
	'parser_locator::truncate_by_term_id',
	'parser_locator::truncate_by_model',
	'parser_locator::filter_by_section_tipo',
	'parser_locator::slice_chain',
	'parser_locator::map_section_tipo_to_name',
	'parser_global::merge_columns',
	'parser_global::publication_unix_timestamp',
]);
const testClassifier: ParserClassifier = (fn) => (REWRITER_FNS.has(fn) ? 'rewriter' : 'runtime');

let tree: VirtualDiffusionTree;
let elements: VirtualTreeNode[];
/** The first sql element that compiles clean (the shared gate subject). */
let sqlPlan: PublicationPlan;

beforeAll(async () => {
	const built = await buildVirtualDiffusionTree();
	if (built === null) {
		throw new Error(
			'no diffusion domain — this gate needs DEDALO_DIFFUSION_DOMAIN=numisdata_mib against the dev DB',
		);
	}
	tree = built;
	elements = findElementNodes(tree);

	for (const element of elements) {
		const validation = await validateElementPlan(element.tipo, {
			tree,
			classifyParserFn: testClassifier,
		});
		if (validation.result !== null && validation.result.format === 'sql') {
			sqlPlan = validation.result;
			break;
		}
	}
	if (sqlPlan === undefined) throw new Error('no sql element of the domain compiled clean');
});

describe('virtual tree (PHP get_virtual_diffusion_tree semantics)', () => {
	test('resolves the configured domain and enumerates its elements', () => {
		// numisdata_mib → domain node numisdata323 (verified live fixture).
		expect(tree.domainTipo).toBe('numisdata323');
		expect(tree.nodes[0]?.tipo).toBe(tree.domainTipo); // walk starts at the domain
		expect(elements.length).toBeGreaterThanOrEqual(1);
		// every element sits under the domain: non-empty parents path ending there
		for (const element of elements) {
			expect(element.parents.length).toBeGreaterThan(0);
			expect(element.parents[element.parents.length - 1]?.tipo).toBe(tree.domainTipo);
		}
	});

	test('alias nodes resolve in place: alias tipo/label win, real subtree merges', () => {
		const aliasNodes = tree.nodes.filter((node) => node.isAlias && node.realTipo !== null);
		expect(aliasNodes.length).toBeGreaterThan(0);
		for (const alias of aliasNodes) {
			expect(alias.tipo).not.toBe(alias.realTipo); // virtual identity is the alias
			expect(alias.model.includes('_alias')).toBe(true);
		}
	});
});

describe('compileElementPlan over the real domain', () => {
	test('every element compiles or fails LOUDLY with named causes', async () => {
		let compiled = 0;
		for (const element of elements) {
			const validation = await validateElementPlan(element.tipo, {
				tree,
				classifyParserFn: testClassifier,
			});
			if (validation.result !== null) {
				compiled += 1;
				expect(validation.result.elementTipo).toBe(element.tipo);
				expect(validation.errors).toEqual([]);
			} else {
				// loud failure: at least one non-empty, self-explanatory cause
				expect(validation.errors.length).toBeGreaterThan(0);
				for (const cause of validation.errors) {
					expect(typeof cause).toBe('string');
					expect(cause.length).toBeGreaterThan(10);
				}
			}
		}
		expect(compiled).toBeGreaterThanOrEqual(1);
	});

	test('a sql element yields sections, fields and a table target', () => {
		expect(sqlPlan.format).toBe('sql');
		expect(sqlPlan.target.kind).toBe('table');
		expect(sqlPlan.sections.length).toBeGreaterThanOrEqual(1);
		const totalFields = sqlPlan.sections.reduce((sum, section) => sum + section.fields.length, 0);
		expect(totalFields).toBeGreaterThanOrEqual(1);
		// every field resolves through a compiled source chain or is an
		// explicitly declared no-chain field (empty ddo_map in the ontology)
		for (const section of sqlPlan.sections) {
			expect(section.sectionTipo).toMatch(/^[a-z][a-z0-9_]*\d+$/);
			expect(section.tableTipo.length).toBeGreaterThan(0);
		}
	});

	test('identifier chokepoint: database/table/column names all pass the grammar', () => {
		if (sqlPlan.target.kind !== 'table') throw new Error('sql plan must target a table');
		expect(sqlPlan.target.database).toMatch(IDENTIFIER_GRAMMAR);
		for (const section of sqlPlan.sections) {
			expect(section.tableName).toMatch(IDENTIFIER_GRAMMAR);
			for (const field of section.fields) {
				// exclude_column fields emit no SQL column → exempt (PHP
				// build_datum_context returns empty context for them)
				if (field.excludeColumn === true) continue;
				expect(field.columnName).toMatch(IDENTIFIER_GRAMMAR);
			}
		}
	});

	test('alias table: plan uses the ALIAS label, fields merge from the real table', async () => {
		// Find a compiled section backed by a table_alias virtual node whose
		// real table lives elsewhere (e.g. cult1 → 'ts_culture' aliasing the
		// shared 'ts' table) — mirrors get_section_node_for_element :1163.
		const nodeByTipo = new Map(tree.nodes.map((node) => [node.tipo, node]));
		let checkedAliasSection = false;
		for (const section of sqlPlan.sections) {
			const tableNode = nodeByTipo.get(section.tableTipo);
			if (tableNode === undefined || !tableNode.isAlias || tableNode.realTipo === null) continue;

			// alias label IS the published table name
			expect(section.tableName).toBe(tableNode.label as string);
			expect(section.fields.length).toBeGreaterThan(0);

			// at least one field must come from the REAL table's children (the
			// alias+real merge of walk_virtual_diffusion_tree :335-357)
			let fieldsFromRealTable = 0;
			for (const field of section.fields) {
				const fieldNode = await tree.index.nodeOf(field.id);
				if (fieldNode?.parent === tableNode.realTipo) fieldsFromRealTable += 1;
			}
			expect(fieldsFromRealTable).toBeGreaterThan(0);
			checkedAliasSection = true;
			break;
		}
		expect(checkedAliasSection).toBe(true);
	});

	test('parser split: rewriters absorbed as warnings, runtime steps kept in order', () => {
		// the real domain uses rewriter fns (parents, get_locator, ...) — their
		// absorption must be ledgered, never silent
		const rewriterWarnings = sqlPlan.warnings.filter((warning) => warning.startsWith('rewriter:'));
		expect(rewriterWarnings.length).toBeGreaterThan(0);
		for (const warning of rewriterWarnings) {
			expect(warning).toMatch(/^rewriter:[a-z_]+::[a-z_0-9]+@[a-z]+[0-9]+$/);
		}
		// no surviving transform step may carry a rewriter fn
		for (const section of sqlPlan.sections) {
			for (const field of section.fields) {
				for (const step of field.transform) {
					expect(REWRITER_FNS.has(step.fn)).toBe(false);
				}
			}
		}
	});

	test('unknown parser fn is a compile ERROR naming the field', async () => {
		const alwaysUnknown: ParserClassifier = () => 'unknown';
		expect(
			compileElementPlan(sqlPlan.elementTipo, { tree, classifyParserFn: alwaysUnknown }),
		).rejects.toThrow(PlanCompileError);
		try {
			await compileElementPlan(sqlPlan.elementTipo, { tree, classifyParserFn: alwaysUnknown });
			throw new Error('unreachable: compile must have thrown');
		} catch (error) {
			const compileError = error as PlanCompileError;
			expect(compileError.compileErrors.length).toBeGreaterThan(0);
			// each violation names its field: "field '<tipo>' (<label>): unknown parser fn '<fn>'"
			expect(compileError.compileErrors[0]).toMatch(/^field '[a-z]+[0-9]+' .*unknown parser fn/);
			expect(compileError.message).toContain('unknown parser fn');
		}
	});

	test('the plan is plain JSON (serializable without loss)', () => {
		const roundTripped = JSON.parse(JSON.stringify(sqlPlan));
		expect(roundTripped).toEqual(sqlPlan as unknown as Record<string, unknown>);
	});

	test('langPolicy and recursion come from config with oracle defaults', () => {
		expect(sqlPlan.langPolicy.langs.length).toBeGreaterThan(0);
		expect(sqlPlan.langPolicy.mainLang).toBe(sqlPlan.langPolicy.langs[0] as string);
		expect(sqlPlan.recursion.maxLevels).toBeGreaterThanOrEqual(1);
	});

	test('DEDALO_DIFFUSION_LANGS: env wins when set; unset derives the full project lang set', () => {
		// Regression: the constant is a DERIVED catalog key (defaults to
		// DEDALO_PROJECTS_DEFAULT_LANGS) on the PHP oracle, so publication emits
		// every project language — a single-lang fallback published only lg-spa.
		// S3-69 unpin: this install may legitimately set the key in
		// ../private/.env, so assert the ACTIVE posture instead of pinning
		// "unset" (the test used to fail on legitimate config changes).
		const envLangs = (readEnv('DEDALO_DIFFUSION_LANGS') ?? '')
			.split(',')
			.map((lang) => lang.trim())
			.filter((lang) => lang !== '');
		if (envLangs.length > 0) {
			expect(sqlPlan.langPolicy.langs).toEqual(envLangs);
		} else {
			expect(sqlPlan.langPolicy.langs).toEqual([...config.menu.projectsDefaultLangs]);
		}
		// The regression tooth either way: never a single-lang fallback on a
		// multi-lang install.
		expect(sqlPlan.langPolicy.langs.length).toBeGreaterThan(1);
	});
});

describe('plan cache (revision-keyed, spec §4.1)', () => {
	test('same revision → same plan object; bump → recompile with new planId', async () => {
		const options = { tree, classifyParserFn: testClassifier };
		const elementTipo = sqlPlan.elementTipo;

		const revisionBefore = currentOntologyRevision();
		const first = await getCompiledPlan(elementTipo, options);
		const second = await getCompiledPlan(elementTipo, options);
		expect(second).toBe(first); // cache hit: identical object
		expect(first.planId).toBe(`${elementTipo}:r${revisionBefore}`);

		// an ontology write reaches bumpOntologyRevision through the
		// cache-invalidation hub; here we call it directly (read-only suite)
		bumpOntologyRevision();
		const revisionAfter = currentOntologyRevision();
		expect(revisionAfter).toBe(revisionBefore + 1);

		const recompiled = await getCompiledPlan(elementTipo, options);
		expect(recompiled).not.toBe(first);
		expect(recompiled.planId).toBe(`${elementTipo}:r${revisionAfter}`);
		expect(recompiled.planId).not.toBe(first.planId);

		// content-wise the plan is unchanged (same ontology, same options)
		expect(JSON.parse(JSON.stringify(recompiled.sections))).toEqual(
			JSON.parse(JSON.stringify(first.sections)),
		);
	});
});
