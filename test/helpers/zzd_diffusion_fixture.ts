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
 * SHAPE — built by src/core/test_data/situations (2026-08-19; before that
 * these were raw INSERTs bound to whatever domain node the ambient ontology
 * carried). The domain node is PROVISIONED (zzd0), named after the configured
 * DEDALO_DIFFUSION_DOMAIN; an unset variable THROWS, it never skips:
 *
 *   zzd0  diffusion_domain  <DEDALO_DIFFUSION_DOMAIN>   (parent dd1190)
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
import {
	dropSituation,
	ensureSituation,
	residueOf,
	situation,
} from '../../src/core/test_data/situations/situation.ts';

/** The section whose targets are the two scratch sql elements. */
export const SQL_SECTION = 'test3';
/** The scratch section node whose targets are file-type only. */
export const FILE_SECTION = 'zzd9';
// Scratch section-id range owned by these gates: 932000-932999 (the purge
// predicates in both test files key on it).

export const SQL_KEY_ONE = 'zzd_probe_db|zzd_probe_table';
export const SQL_KEY_TWO = 'zzd_probe_db_two|zzd_probe_table_two';

/**
 * The domain node is PART OF THE SITUATION (zzd0, under dd1190, named after
 * the configured DEDALO_DIFFUSION_DOMAIN). Before 2026-08-19 the fixture
 * looked the domain up in the ambient ontology and threw when the configured
 * name matched no node — i.e. the gates were red on every install whose
 * `.env` named a domain that install did not carry (measured: the suite DB
 * with DEDALO_DIFFUSION_DOMAIN=mht). The engine matches the domain by NAME
 * (diffusion_map.ts resolveDomainTipo), so provisioning a node with that
 * name is exactly the situation the gates need, on any install. An UNSET
 * variable still throws: without a name there is no situation to build.
 */
function requireDomainName(): string {
	const domainName = readEnv('DEDALO_DIFFUSION_DOMAIN');
	if (domainName === undefined || domainName === '') {
		throw new Error(
			'DEDALO_DIFFUSION_DOMAIN is unset — the diffusion delete gates cannot be provisioned',
		);
	}
	return domainName;
}

function buildZzdSituation() {
	const domainName = requireDomainName();
	const sql = (type: string) => ({ diffusion: { type } });
	return situation({
		name: 'zzd diffusion fixture',
		tld: 'zzd',
		nodes: [
			{ tipo: 'zzd0', parent: 'dd1190', model: 'diffusion_domain', term: { 'lg-spa': domainName } },
			{
				tipo: 'zzd1',
				parent: 'zzd0',
				model: 'diffusion_element',
				term: { 'lg-spa': 'zzd sql element' },
				properties: sql('sql'),
			},
			{ tipo: 'zzd2', parent: 'zzd1', model: 'database', term: { 'lg-spa': 'zzd_probe_db' } },
			{
				tipo: 'zzd3',
				parent: 'zzd1',
				model: 'table',
				term: { 'lg-spa': 'zzd_probe_table' },
				relations: [{ tipo: 'test3' }],
			},
			{
				tipo: 'zzd4',
				parent: 'zzd0',
				model: 'diffusion_element',
				term: { 'lg-spa': 'zzd sql element two' },
				properties: sql('sql'),
			},
			{ tipo: 'zzd5', parent: 'zzd4', model: 'database', term: { 'lg-spa': 'zzd_probe_db_two' } },
			{
				tipo: 'zzd6',
				parent: 'zzd4',
				model: 'table',
				term: { 'lg-spa': 'zzd_probe_table_two' },
				relations: [{ tipo: 'test3' }],
			},
			{
				tipo: 'zzd7',
				parent: 'zzd0',
				model: 'diffusion_element',
				term: { 'lg-spa': 'zzd rdf element' },
				properties: sql('rdf'),
			},
			{
				tipo: 'zzd11',
				parent: 'zzd7',
				model: 'table',
				term: { 'lg-spa': 'zzd_rdf_child' },
				relations: [{ tipo: 'zzd9' }],
			},
			{
				tipo: 'zzd8',
				parent: 'zzd0',
				model: 'diffusion_element',
				term: { 'lg-spa': 'zzd xml element' },
				properties: { diffusion: { type: 'xml', service_name: 'testsvc' } },
			},
			{
				tipo: 'zzd10',
				parent: 'zzd8',
				model: 'owl:Class',
				term: { 'lg-spa': 'nmo:TestClass' },
				relations: [{ tipo: 'zzd9' }],
			},
			{ tipo: 'zzd9', parent: 'test1', model: 'section', term: { 'lg-spa': 'zzd probe section' } },
		],
	});
}

/** Remove every `zzd` ontology row and drop the derived caches. */
export async function dropZzdOntology(): Promise<void> {
	await dropSituation(buildZzdSituation());
}

/**
 * Provision the fixture (idempotent). Pre-existing `zzd` rows are cleared first
 * and the pre-count is asserted zero by the caller (see the gates' beforeAll).
 */
export async function seedZzdOntology(): Promise<{ domainTipo: string; preCount: number }> {
	const s = buildZzdSituation();
	await dropSituation(s);
	const preCount = await residueOf(s);
	await ensureSituation(s);
	return { domainTipo: 'zzd0', preCount };
}

/** Residue check for afterAll — must be 0. */
export async function countZzdOntology(): Promise<number> {
	return residueOf(buildZzdSituation());
}
