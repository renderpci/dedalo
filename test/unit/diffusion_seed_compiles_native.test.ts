/**
 * THE SHIPPED ONTOLOGY COMPILES IN THE SHIPPED ENGINE (audit 2026-08-26,
 * PUB-04 / P1-13 — and the un-masked half of PUB-08 / P2-13).
 *
 * Every shipped diffusion element declared its output format with the retired
 * v6 key `properties.diffusion.class_name`; the plan compiler reads only
 * `type` and has no alias. On a fresh install NOT ONE shipped element compiled
 * — loudly, which is the safe direction, and invisibly, because the
 * maintainer's own database had been hand-migrated and both compile gates
 * authored a synthetic element node with `type: 'sql'` hardcoded. A gate that
 * compiles a node it wrote itself proves nothing about the ontology's real
 * vocabulary; this one compiles WHAT SHIPS, through the REAL compiler, on the
 * suite database AS A BOOTED INSTALL.
 *
 * CENSUS: TOTAL. Every dd1190 `diffusion_domain` node the suite database
 * holds, the virtual tree of each, `findElementNodes` of each — and the
 * SHIPPED partition of that census is DERIVED, never hand-listed: an element
 * is shipped when its TLD is not one the `test` source of record owns (dd, oh,
 * … — seed-shipped) OR when it is in `coreClosure(doc.nodes)` — the exact set
 * `materializeTestTldOntology({scope:'core'})` installs, computed from the
 * committed clone map (test_tld_materialize.ts). Clone twins the suite alone
 * holds (test5942, test6336, test6359, test6112, …) are NOT shipped and NOT
 * judged here — several are partial clones with no database/section under
 * them, which is the clone's shape, not the engine's. Floors: > 3 domains
 * carrying a shipped element, > 4 shipped elements.
 *
 * WHAT IS ASSERTED, per shipped element:
 *   - `validateElementPlan` answers errors [] and degradations [] — with two
 *     ENUMERATED, shrink-only exemptions carrying their reason:
 *       · dd60 (`diffusion_section_stats`, domain `dedalo`): a v6 renderer with
 *         no v7 format. The migration lane is UPDATE-only and cannot retire the
 *         node, so it stays and must fail with EXACTLY the loud format error —
 *         it is the shipped POSITIVE CONTROL of the branch every other element
 *         used to die in.
 *       · dd1099 (`Web pública Dédalo`, domain `dedalo_dev`): its dd1192 table
 *         fields carry the v5 `process_dato` string-fn directive
 *         (`diffusion_sql::resolve_value`, `map_locator_to_terminoID`…) with no
 *         mechanical v7 translation. It must compile (errors []) AND report
 *         exactly those fields as `retired_parser_spelling` — the PUB-08
 *         degradation MEASURED on the shipped element, un-masked now that the
 *         element reaches its fields. The semantic port to
 *         `process.ddo_map`/`parser` is the maintainer's, per field.
 *   - warnings are only of the `uninstalled-tld:` / `rewriter:` classes (a
 *     ddo into an optional package this database does not carry; a rewriter
 *     absorbed by the resolver) — never a new kind nobody read.
 *   - the boot migration 0008 is RECORDED (dedalo_ts_schema_migrations): the
 *     suite database is a booted install, or `bun run test:db:setup` is stale.
 *   - source and derived agree: `inspectOntology` reports NO drift on any
 *     shipped element's tipo — the migration moved matrix_ontology (source,
 *     `ontology18`) and dd_ontology (derived) together, so a regenerate cannot
 *     resurrect the retired key.
 *
 * PLANTED OFFENDER (anti-vacuity for the "compiles clean" leg): the same
 * shipped element re-compiled with its block put back to the PRE-FIX shape
 * (`{class_name: 'diffusion_mysql'}`) must fail with the format error — the
 * check is live against the ontology's real shape, not a hardcoded node.
 *
 * HONEST LIMIT. dd1099's OTHER table, dd1101 (`component`, 10 more
 * `process_dato` fields), relates to dd772 — a field, not a section — so the
 * compiler never enumerates a section for it and never visits those fields.
 * Only the 8 fields the compiler REACHES are asserted; a table with no section
 * relation contributes nothing and says nothing (out of this row's scope).
 *
 * NOT HERMETIC: compiles the real dd_ontology of the suite database (the
 * ontology index, the virtual tree, the drift inspection all read it).
 */

import { describe, expect, test } from 'bun:test';
import { MIGRATIONS_VERSION_TABLE } from '../../install/db/migrate.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { inspectOntology } from '../../src/core/ontology/ontology_state.ts';
import {
	coreClosure,
	loadTestTldOntologyDoc,
} from '../../src/core/test_data/test_tld_materialize.ts';
import { validateElementPlan } from '../../src/diffusion/plan/compile.ts';
import { KNOWN_FORMATS } from '../../src/diffusion/plan/formats.ts';
import {
	buildVirtualDiffusionTree,
	findElementNodes,
	termLabelOf,
	type VirtualDiffusionTree,
	type VirtualTreeNode,
} from '../../src/diffusion/plan/virtual_tree.ts';

const MIGRATION = '0008_diffusion_element_type.sql';

/** The loud format error, spelled from the engine's own list (compile.ts). */
const MISSING_TYPE_ERROR = `missing or unknown properties->diffusion->type '' (expected one of: ${[...KNOWN_FORMATS].join(', ')})`;

/**
 * ENUMERATED exemptions — shrink-only, reason per entry. Everything not listed
 * must compile with errors [] and degradations [].
 */
const EXEMPT_ERRORS: ReadonlyMap<string, { reason: string; errors: string[] }> = new Map([
	[
		'dd60',
		{
			reason:
				'diffusion_section_stats — v6 section-statistics renderer, no v7 output format; the UPDATE-only migration lane cannot retire it, so it stays LOUD (the shipped positive control of the format check)',
			errors: [MISSING_TYPE_ERROR],
		},
	],
]);

const EXEMPT_DEGRADATIONS: ReadonlyMap<string, { reason: string; fieldIds: string[] }> = new Map([
	[
		'dd1099',
		{
			reason:
				'dd1192 (ts_web) fields carry the v5 `process_dato` string-fn directive (diffusion_sql::resolve_value / map_*_terminoID) with no mechanical v7 translation; reported as retired_parser_spelling (PUB-08, un-masked), semantic port to process.ddo_map/parser is the maintainer’s per field',
			fieldIds: ['dd1419', 'dd1423', 'dd1424', 'dd1427', 'dd1433', 'dd1467', 'dd1508', 'dd1509'],
		},
	],
]);

const WARNING_CLASSES = /^(uninstalled-tld|rewriter):/;

interface ShippedElement {
	domainTipo: string;
	domainName: string;
	tree: VirtualDiffusionTree;
	node: VirtualTreeNode;
	tld: string;
}

/** The TOTAL census: every domain × every element, partitioned into shipped / suite-only. */
async function censusOfShippedElements(): Promise<{
	domains: number;
	elements: number;
	shipped: ShippedElement[];
}> {
	const doc = await loadTestTldOntologyDoc();
	// The TLDs the source of record OWNS = the TLDs its nodes declare.
	const testTlds = new Set(doc.nodes.map((node) => node.tld ?? ''));
	const shippedTestTipos = new Set((await coreClosure(doc.nodes)).map((node) => node.tipo));

	const domainRows = await sql<{ tipo: string; term: Record<string, string> | null }[]>`
		SELECT tipo, term FROM dd_ontology WHERE model = 'diffusion_domain' ORDER BY tipo`;
	const tldRows = await sql<{ tipo: string; tld: string | null }[]>`
		SELECT tipo, tld FROM dd_ontology WHERE model LIKE 'diffusion_element%'`;
	const tldOf = new Map(tldRows.map((row) => [row.tipo, row.tld ?? '']));

	let elements = 0;
	const shipped: ShippedElement[] = [];
	for (const domain of domainRows) {
		const domainName = termLabelOf(domain as never);
		if (domainName === null) continue;
		const tree = await buildVirtualDiffusionTree(domainName);
		if (tree === null) continue;
		for (const node of findElementNodes(tree)) {
			elements += 1;
			const tld = tldOf.get(node.tipo) ?? '';
			const isShipped = !testTlds.has(tld) || shippedTestTipos.has(node.tipo);
			if (isShipped) shipped.push({ domainTipo: domain.tipo, domainName, tree, node, tld });
		}
	}
	return { domains: domainRows.length, elements, shipped };
}

describe('the shipped diffusion ontology compiles in the shipped engine', () => {
	test('the suite database is a BOOTED install: migration 0008 is recorded', async () => {
		const rows = await sql.unsafe(
			`SELECT version FROM "${MIGRATIONS_VERSION_TABLE}" WHERE version = $1`,
			[MIGRATION],
		);
		expect(
			(rows as { version: string }[]).length,
			`${MIGRATION} is not recorded in ${MIGRATIONS_VERSION_TABLE} — the suite database predates the migration; run \`bun run test:db:setup\``,
		).toBe(1);
	});

	test('every SHIPPED element of every domain compiles: errors [] and degradations [], except the enumerated exemptions', async () => {
		const census = await censusOfShippedElements();
		expect(census.domains, 'census floor: diffusion_domain nodes').toBeGreaterThan(3);
		expect(census.elements, 'census floor: elements across all domains').toBeGreaterThan(4);
		const shippedDomains = new Set(census.shipped.map((entry) => entry.domainTipo));
		expect(shippedDomains.size, 'census floor: domains carrying a shipped element').toBeGreaterThan(
			3,
		);
		expect(census.shipped.length, 'census floor: shipped elements').toBeGreaterThan(4);
		// Both exemptions must still be SHIPPED elements — a vanished exemption is
		// a stale list, not a free pass.
		const shippedTipos = new Set(census.shipped.map((entry) => entry.node.tipo));
		for (const tipo of [...EXEMPT_ERRORS.keys(), ...EXEMPT_DEGRADATIONS.keys()]) {
			expect(
				shippedTipos.has(tipo),
				`exemption ${tipo} names an element that is no longer shipped — shrink the list`,
			).toBe(true);
		}

		const faults: string[] = [];
		for (const entry of census.shipped) {
			const tipo = entry.node.tipo;
			const where = `${tipo} (${entry.node.label}, domain '${entry.domainName}')`;
			const report = await validateElementPlan(tipo, { tree: entry.tree });

			const exemptErrors = EXEMPT_ERRORS.get(tipo);
			if (exemptErrors !== undefined) {
				if (JSON.stringify(report.errors) !== JSON.stringify(exemptErrors.errors)) {
					faults.push(
						`${where}: exempt for '${exemptErrors.reason}' but compiled with errors ${JSON.stringify(report.errors)} instead of exactly ${JSON.stringify(exemptErrors.errors)}`,
					);
				}
			} else if (report.errors.length > 0) {
				faults.push(`${where}: does not compile — ${JSON.stringify(report.errors)}`);
			}

			const exemptDegradations = EXEMPT_DEGRADATIONS.get(tipo);
			const degraded = report.degradations.map((item) => `${item.fieldId}:${item.reason}`).sort();
			const expected = (exemptDegradations?.fieldIds ?? [])
				.map((fieldId) => `${fieldId}:retired_parser_spelling`)
				.sort();
			if (JSON.stringify(degraded) !== JSON.stringify(expected)) {
				faults.push(
					`${where}: degradations ${JSON.stringify(degraded)}, expected exactly ${JSON.stringify(expected)}${exemptDegradations === undefined ? '' : ` (${exemptDegradations.reason})`}`,
				);
			}

			const unknownWarnings = report.warnings.filter((warning) => !WARNING_CLASSES.test(warning));
			if (unknownWarnings.length > 0) {
				faults.push(
					`${where}: warnings outside the read classes — ${JSON.stringify(unknownWarnings)}`,
				);
			}
		}
		expect(faults).toEqual([]);
	});

	test('planted offender: the same shipped element with its block put back to the PRE-FIX shape fails the format check', async () => {
		const census = await censusOfShippedElements();
		const clean = census.shipped.find(
			(entry) => !EXEMPT_ERRORS.has(entry.node.tipo) && !EXEMPT_DEGRADATIONS.has(entry.node.tipo),
		);
		expect(clean, 'a shipped element that compiles clean').toBeDefined();
		const entry = clean as ShippedElement;
		const before = await validateElementPlan(entry.node.tipo, { tree: entry.tree });
		expect(before.errors).toEqual([]);

		const regressed: VirtualDiffusionTree = {
			...entry.tree,
			nodes: entry.tree.nodes.map((node) =>
				node.tipo === entry.node.tipo
					? {
							...node,
							properties: {
								...(node.properties ?? {}),
								diffusion: { class_name: 'diffusion_mysql' },
							},
						}
					: node,
			),
		};
		const after = await validateElementPlan(entry.node.tipo, { tree: regressed });
		expect(after.errors).toContain(MISSING_TYPE_ERROR);
	});

	test('source and derived agree: no ontology drift on any shipped element', async () => {
		const census = await censusOfShippedElements();
		const byTld = new Map<string, string[]>();
		for (const entry of census.shipped) {
			byTld.set(entry.tld, [...(byTld.get(entry.tld) ?? []), entry.node.tipo]);
		}
		expect(byTld.size, 'census floor: TLDs carrying a shipped element').toBeGreaterThan(1);
		const drifted: string[] = [];
		for (const [tld, tipos] of byTld) {
			const state = await inspectOntology(tld);
			expect(state.matrixNodes, `census floor: ${tld} source records`).toBeGreaterThan(50);
			for (const item of state.drift) {
				if (tipos.includes(item.tipo)) {
					drifted.push(`${tld}: ${item.tipo} ${item.kind} ${item.diffColumns.join(',')}`);
				}
			}
		}
		expect(drifted).toEqual([]);
	});
});
