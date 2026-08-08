/**
 * Scratch diffusion ontology fixture (tld `zzd`) for the diffusion_delete
 * gates.
 *
 * WHY IT EXISTS. Every pre-existing diffusion-delete test binds to the LIVE
 * `numisdata_mib` element nodes; the suite database's dd_ontology predates
 * `properties.diffusion.type`, so those elements resolve `type:'unknown'`,
 * `sqlTargets` is empty and the "no executor registered → pending" case in
 * fact passes through the FILE-UNLINK branch, never the DEC-19 branch it
 * names. These gates provision their OWN elements instead, so every branch of
 * deleteDiffusionRecord is reachable and each assertion is exact.
 *
 * SHAPE (all under the configured DEDALO_DIFFUSION_DOMAIN node — a missing
 * domain THROWS, it never skips):
 *
 *   zzd1  diffusion_element  {"diffusion":{"type":"sql"}}
 *     zzd2  database  'zzd_probe_db'
 *     zzd3  table     'zzd_probe_table'      → section test3
 *   zzd4  diffusion_element  {"diffusion":{"type":"sql"}}   (2nd database)
 *     zzd5  database  'zzd_probe_db_two'
 *     zzd6  table     'zzd_probe_table_two'  → section test3
 *   zzd7  diffusion_element  {"diffusion":{"type":"rdf"}}   (NO service_name)
 *     zzd11 table     'zzd_rdf_child'        → section zzd9
 *   zzd8  diffusion_element  {"diffusion":{"type":"xml","service_name":"testsvc"}}
 *     zzd10 owl:Class 'nmo:TestClass'        → section zzd9
 *   zzd9  section (scratch section node, parent test1) — the FILE-ONLY section
 *
 * so: `test3` → two sql targets (one per element/database), `zzd9` → two
 * file-type targets and NO sql target.
 */

import { readEnv } from '../../src/config/env.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';

/** The section whose targets are the two scratch sql elements. */
export const SQL_SECTION = 'test3';
/** The scratch section node whose targets are file-type only. */
export const FILE_SECTION = 'zzd9';
// Scratch section-id range owned by these gates: 932000-932999 (the purge
// predicates in both test files key on it).

export const SQL_KEY_ONE = 'zzd_probe_db|zzd_probe_table';
export const SQL_KEY_TWO = 'zzd_probe_db_two|zzd_probe_table_two';

/**
 * Resolve the configured diffusion domain node. THROWS when it is absent —
 * a fixture that cannot be provisioned must redden the file, never skip it.
 */
async function requireDomainTipo(): Promise<string> {
	const domainName = readEnv('DEDALO_DIFFUSION_DOMAIN');
	if (domainName === undefined || domainName === '') {
		throw new Error(
			'DEDALO_DIFFUSION_DOMAIN is unset — the diffusion delete gates cannot be provisioned',
		);
	}
	const rows = (await sql.unsafe(
		`SELECT tipo, term FROM dd_ontology WHERE parent = 'dd1190' AND model = 'diffusion_domain'`,
	)) as { tipo: string; term: Record<string, string> | null }[];
	for (const row of rows) {
		const term = row.term ?? {};
		const label = term['lg-spa'] ?? Object.values(term).find((value) => value !== '') ?? null;
		if (label === domainName) return row.tipo;
	}
	throw new Error(
		`no diffusion_domain node named '${domainName}' under dd1190 in this database — fixture unprovisionable`,
	);
}

/** Remove every `zzd` ontology row and drop the derived caches. */
export async function dropZzdOntology(): Promise<void> {
	await sql.unsafe(`DELETE FROM dd_ontology WHERE tld = 'zzd'`);
	await clearOntologyDerivedCaches();
}

/**
 * Provision the fixture. Pre-existing `zzd` rows are cleared first and the
 * pre-count is asserted zero by the caller (see the gates' beforeAll).
 */
export async function seedZzdOntology(): Promise<{ domainTipo: string; preCount: number }> {
	await sql.unsafe(`DELETE FROM dd_ontology WHERE tld = 'zzd'`);
	const preRows = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM dd_ontology WHERE tld = 'zzd'`,
	)) as { n: number }[];
	const preCount = preRows[0]?.n ?? -1;
	const domainTipo = await requireDomainTipo();

	const rows: [string, string, string, string, string | null][] = [
		// tipo, parent, model, term json, properties json
		[
			'zzd1',
			domainTipo,
			'diffusion_element',
			'{"lg-spa":"zzd sql element"}',
			'{"diffusion":{"type":"sql"}}',
		],
		['zzd2', 'zzd1', 'database', '{"lg-spa":"zzd_probe_db"}', null],
		['zzd3', 'zzd1', 'table', '{"lg-spa":"zzd_probe_table"}', null],
		[
			'zzd4',
			domainTipo,
			'diffusion_element',
			'{"lg-spa":"zzd sql element two"}',
			'{"diffusion":{"type":"sql"}}',
		],
		['zzd5', 'zzd4', 'database', '{"lg-spa":"zzd_probe_db_two"}', null],
		['zzd6', 'zzd4', 'table', '{"lg-spa":"zzd_probe_table_two"}', null],
		[
			'zzd7',
			domainTipo,
			'diffusion_element',
			'{"lg-spa":"zzd rdf element"}',
			'{"diffusion":{"type":"rdf"}}',
		],
		['zzd11', 'zzd7', 'table', '{"lg-spa":"zzd_rdf_child"}', null],
		[
			'zzd8',
			domainTipo,
			'diffusion_element',
			'{"lg-spa":"zzd xml element"}',
			'{"diffusion":{"type":"xml","service_name":"testsvc"}}',
		],
		['zzd10', 'zzd8', 'owl:Class', '{"lg-spa":"nmo:TestClass"}', null],
		['zzd9', 'test1', 'section', '{"lg-spa":"zzd probe section"}', null],
	];
	for (const [tipo, parent, model, term, properties] of rows) {
		await sql.unsafe(
			`INSERT INTO dd_ontology (tipo, parent, model, term, tld, is_model, is_translatable, is_main, order_number, properties)
			 VALUES ($1, $2, $3, $4::text::jsonb, 'zzd', false, false, false, 1, $5::text::jsonb)`,
			[tipo, parent, model, term, properties],
		);
	}
	// relations: the nodes that bind an element to a section
	await sql.unsafe(
		`UPDATE dd_ontology SET relations = '[{"tipo":"test3"}]'::jsonb WHERE tipo IN ('zzd3','zzd6')`,
	);
	await sql.unsafe(
		`UPDATE dd_ontology SET relations = '[{"tipo":"zzd9"}]'::jsonb WHERE tipo IN ('zzd11','zzd10')`,
	);
	await clearOntologyDerivedCaches();
	return { domainTipo, preCount };
}

/** Residue check for afterAll — must be 0. */
export async function countZzdOntology(): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM dd_ontology WHERE tld = 'zzd'`,
	)) as { n: number }[];
	return rows[0]?.n ?? -1;
}
