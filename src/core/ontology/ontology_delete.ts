/**
 * Ontology-main cascade delete (PHP ontology::delete_main → delete_ontology):
 * deleting a record of the HIERARCHY/ONTOLOGY registry sections (hierarchy1 /
 * ontology35) uninstalls that record's whole TLD —
 *   1. every dd_ontology node with that tld (DELETE ... WHERE tld = $1);
 *   2. the registry main record itself (the normal delete pipeline, with the
 *      cascade suppressed to avoid recursion);
 *   3. every node record of the '{tld}0' section (per-record delete pipeline
 *      — TM snapshots included). Unresolvable '{tld}0' sections no-op.
 *
 * SAFETY: the tld is validated via safeTld (PHP safe_tld, /^[a-z]{2,}$/) and
 * the dd_ontology purge is strictly parameterized on it — nothing outside the
 * tld can match. Empty or unsafe tld → refuse (never guess).
 */

import { sql } from '../db/postgres.ts';
import { clearOntologyDerivedCaches } from './cache_invalidation.ts';
import { getMatrixTableFromTipo } from './resolver.ts';
import { mapTldToTargetSectionTipo, safeTld } from './tld.ts';

/** Registry sections whose record deletion cascades (PHP sections::delete). */
export const ONTOLOGY_MAIN_SECTIONS: ReadonlySet<string> = new Set(['hierarchy1', 'ontology35']);

export interface OntologyDeleteOutcome {
	result: boolean;
	deletedNodes: number;
	deletedRecords: number;
	errors: string[];
}

/**
 * Uninstall the TLD of one registry record. `deleteRecord` is the caller's
 * per-record delete (injected to avoid a module cycle with delete_record.ts).
 */
export async function deleteOntologyMain(
	sectionTipo: string,
	sectionId: number,
	deleteRecord: (sectionTipo: string, sectionId: number) => Promise<unknown>,
): Promise<OntologyDeleteOutcome> {
	const outcome: OntologyDeleteOutcome = {
		result: false,
		deletedNodes: 0,
		deletedRecords: 0,
		errors: [],
	};

	// tld from the registry record's hierarchy6 (string column).
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) {
		outcome.errors.push(`no matrix table for '${sectionTipo}'`);
		return outcome;
	}
	const rows = (await sql.unsafe(
		`SELECT string->'hierarchy6'->0->>'value' AS tld FROM "${table}"
		 WHERE section_tipo = $1 AND section_id = $2`,
		[sectionTipo, sectionId],
	)) as { tld: string | null }[];
	const tld = (rows[0]?.tld ?? '').trim().toLowerCase();
	if (safeTld(tld) === null) {
		outcome.errors.push(`empty or unsafe tld '${tld}' — cascade refused`);
		return outcome;
	}

	// 1. dd_ontology nodes of the tld.
	const nodeResult = (await sql.unsafe('DELETE FROM dd_ontology WHERE tld = $1 RETURNING tipo', [
		tld,
	])) as { tipo: string }[];
	outcome.deletedNodes = nodeResult.length;

	// 2. the registry main record (cascade suppressed by the caller).
	await deleteRecord(sectionTipo, sectionId);
	outcome.deletedRecords++;

	// 3. every node record of the '{tld}0' section (when its table resolves).
	const nodesSection = mapTldToTargetSectionTipo(tld);
	// The tld's section node may have just been purged — drop every ontology-
	// derived cache so the table lookup below sees the current state.
	await clearOntologyDerivedCaches();
	const nodesTable = await getMatrixTableFromTipo(nodesSection);
	if (nodesTable !== null) {
		const nodeRecords = (await sql.unsafe(
			`SELECT section_id FROM "${nodesTable}" WHERE section_tipo = $1`,
			[nodesSection],
		)) as { section_id: number }[];
		for (const record of nodeRecords) {
			await deleteRecord(nodesSection, Number(record.section_id));
			outcome.deletedRecords++;
		}
	}

	outcome.result = true;
	return outcome;
}
