/**
 * Ontology TLD teardown (PHP ontology::delete_main → delete_ontology).
 *
 * TWO callers want TWO different blast radii, and conflating them deleted the
 * wrong record:
 *
 *  - `deleteOntologyByTld` — uninstall a TLD's ONTOLOGY and nothing else:
 *      1. every dd_ontology node with that tld (DELETE ... WHERE tld = $1);
 *      2. the ontology_main registry row resolved FROM THE TLD (PHP
 *         get_ontology_main_from_tld) — NOT the caller's record;
 *      3. every node record of the '{tld}0' section (per-record delete pipeline
 *         — TM snapshots included). Unresolvable '{tld}0' sections no-op.
 *    This is what tool_hierarchy's `force_to_create` needs: rebuild the virtual
 *    sections while the hierarchy1 record that DESCRIBES them stays put.
 *
 *  - `deleteOntologyMain` — the above, PLUS the caller's own registry record.
 *    This is the "user deletes a hierarchy1/ontology35 record" cascade
 *    (dd_core_api delete), where removing the record IS the point.
 *
 * SAFETY: the tld is validated via safeTld (PHP safe_tld, /^[a-z]{2,}$/) and
 * the dd_ontology purge is strictly parameterized on it — nothing outside the
 * tld can match. Empty or unsafe tld → refuse (never guess).
 */

import { sql } from '../db/postgres.ts';
import { clearOntologyDerivedCaches } from './cache_invalidation.ts';
import { ONTOLOGY_MAIN_SECTION } from './ontology_tipos.ts';
import { getOntologyMainFromTld } from './ontology_write.ts';
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

/** The caller's per-record delete (injected to avoid a module cycle with delete_record.ts). */
export type DeleteRecordFn = (sectionTipo: string, sectionId: number) => Promise<unknown>;

/** A registry record excluded from the by-tld sweep (its caller deletes it itself). */
interface RegistryRef {
	sectionTipo: string;
	sectionId: number;
}

/**
 * The TLD a registry record (hierarchy1 / ontology35) declares in hierarchy6.
 * Null when the record or its tld is missing/unsafe — the caller must refuse.
 */
export async function tldFromRegistryRecord(
	sectionTipo: string,
	sectionId: number,
): Promise<string | null> {
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) return null;
	const rows = (await sql.unsafe(
		`SELECT string->'hierarchy6'->0->>'value' AS tld FROM "${table}"
		 WHERE section_tipo = $1 AND section_id = $2`,
		[sectionTipo, sectionId],
	)) as { tld: string | null }[];
	return safeTld((rows[0]?.tld ?? '').trim().toLowerCase());
}

/**
 * Uninstall a TLD's ontology WITHOUT touching the registry record that describes
 * it. `skip` names a registry record the caller deletes itself (so the
 * ontology_main sweep does not delete it twice when the caller IS the
 * ontology_main record).
 */
export async function deleteOntologyByTld(
	tld: string,
	deleteRecord: DeleteRecordFn,
	skip?: RegistryRef,
): Promise<OntologyDeleteOutcome> {
	const outcome: OntologyDeleteOutcome = {
		result: false,
		deletedNodes: 0,
		deletedRecords: 0,
		errors: [],
	};

	const safe = safeTld(tld.trim().toLowerCase());
	if (safe === null) {
		outcome.errors.push(`empty or unsafe tld '${tld}' — cascade refused`);
		return outcome;
	}

	// 1. dd_ontology nodes of the tld.
	const nodeResult = (await sql.unsafe('DELETE FROM dd_ontology WHERE tld = $1 RETURNING tipo', [
		safe,
	])) as { tipo: string }[];
	outcome.deletedNodes = nodeResult.length;

	// 2. the ontology_main registry row FOR THIS TLD (PHP delete_ontology step 2).
	// Resolved from the tld, never from the caller — the caller may be a
	// hierarchy1 record, which must survive a force_to_create rebuild.
	const main = await getOntologyMainFromTld(safe);
	const mainIsSkipped =
		main !== null &&
		skip !== undefined &&
		skip.sectionTipo === ONTOLOGY_MAIN_SECTION &&
		skip.sectionId === main.section_id;
	if (main !== null && !mainIsSkipped) {
		await deleteRecord(ONTOLOGY_MAIN_SECTION, main.section_id);
		outcome.deletedRecords++;
	}

	// 3. every node record of the '{tld}0' section (when its table resolves).
	const nodesSection = mapTldToTargetSectionTipo(safe);
	// The tld's section node was just purged — drop every ontology-derived cache
	// so the table lookup below sees the current state. ('{tld}0' still resolves:
	// getMatrixTableFromTipo short-circuits any section_id-'0' tipo to
	// matrix_ontology BEFORE the node lookup, precisely for this moment.)
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

/**
 * Uninstall the TLD of one registry record AND delete that record — the
 * dd_core_api delete cascade. `deleteRecord` runs with the cascade suppressed by
 * the caller (no recursion).
 */
export async function deleteOntologyMain(
	sectionTipo: string,
	sectionId: number,
	deleteRecord: DeleteRecordFn,
): Promise<OntologyDeleteOutcome> {
	const tld = await tldFromRegistryRecord(sectionTipo, sectionId);
	if (tld === null) {
		return {
			result: false,
			deletedNodes: 0,
			deletedRecords: 0,
			errors: [`empty or unsafe tld for '${sectionTipo}/${sectionId}' — cascade refused`],
		};
	}

	const outcome = await deleteOntologyByTld(tld, deleteRecord, { sectionTipo, sectionId });
	if (!outcome.result) return outcome;

	// The registry record itself — the one thing the by-tld sweep never touches.
	await deleteRecord(sectionTipo, sectionId);
	outcome.deletedRecords++;
	return outcome;
}
