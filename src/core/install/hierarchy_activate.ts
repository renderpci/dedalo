/**
 * activate_hierarchy (PHP installer_hierarchy_manager::activate_hierarchy).
 *
 * Importing a hierarchy's `<tld>1.copy.gz` only lands the TERM DATA in matrix_hierarchy.
 * On its own that data is UNREACHABLE: `<tld>1` is not a section the engine knows about
 * until its ontology exists, and the hierarchy1 registry record is not flagged active —
 * so the thesaurus tree shows nothing, and the portals that resolve their targets from
 * the ACTIVE hierarchies resolve an empty target_sections.
 *
 * This module owns exactly ONE thing PHP's activate_hierarchy also did and the shared
 * writer cannot know: the DESCRIPTOR. hierarchies.json says what a tld IS (label,
 * typology, active_in_thesaurus), and a fresh install may have no registry record at all
 * — so we find-or-create it and stamp its identity fields. Everything after that
 * (flags, ontology, target sections, the general-term roots) is the SAME invariant the
 * tool converges to, so it is delegated to ontology/hierarchy_state.ts `ensureHierarchy`
 * — the single writer. The installer used to re-implement that sequence with hard-coded
 * `<tld>1`/1 and `<tld>2`/2 locators, which dangle on any thesaurus whose root is not at
 * those ids (live: `es2` has no records at all).
 */

import { updateMatrixKeyData } from '../db/matrix_write.ts';
import { sql } from '../db/postgres.ts';
import { HIERARCHY_SECTION, ensureHierarchy } from '../ontology/hierarchy_state.ts';
import {
	HIERARCHY_TERM,
	HIERARCHY_TLD,
	HIERARCHY_TYPES_SECTION,
	HIERARCHY_TYPOLOGY,
	RELATION_TYPE_LINK,
} from '../ontology/ontology_tipos.ts';
import { createSectionRecord } from '../section/record/create_record.ts';
import type { HierarchyMeta } from './hierarchy_meta.ts';

const HIERARCHY_MAIN_TABLE = 'matrix_hierarchy_main';

export interface ActivateHierarchyResult {
	result: boolean;
	created: boolean;
	sectionId: number | null;
	errors: string[];
	/** What ensureHierarchy had to change (empty when the hierarchy was already sound). */
	applied: string[];
}

/** The hierarchy1 record for this tld, or null (PHP hierarchy::get_hierarchy_by_tld). */
async function findHierarchyByTld(tld: string): Promise<number | null> {
	const rows = (await sql.unsafe(
		`SELECT section_id FROM "${HIERARCHY_MAIN_TABLE}"
		 WHERE section_tipo = $1
		   AND lower(string->'${HIERARCHY_TLD}'->0->>'value') = $2
		 ORDER BY section_id
		 LIMIT 1`,
		[HIERARCHY_SECTION, tld],
	)) as { section_id: number }[];
	return rows[0] ? Number(rows[0].section_id) : null;
}

/** Activate ONE imported hierarchy: register it (if new), then converge it. */
export async function activateHierarchy(
	meta: HierarchyMeta,
	userId: number,
): Promise<ActivateHierarchyResult> {
	const tld = meta.tld.trim().toLowerCase();
	const outcome: ActivateHierarchyResult = {
		result: false,
		created: false,
		sectionId: null,
		errors: [],
		applied: [],
	};

	// An unregistered tld in hierarchies.json carries a placeholder typology; without a
	// real one there is nothing to provision with (PHP refuses here too).
	const typology = Number(meta.typology);
	if (!Number.isInteger(typology) || typology < 1) {
		outcome.errors.push(
			`hierarchy '${tld}' is not registered (no valid typology); activation skipped`,
		);
		return outcome;
	}

	// The registry record. The seed normally ships it (import_hierarchy_main_records);
	// create it from the descriptor when it does not.
	let sectionId = await findHierarchyByTld(tld);
	if (sectionId === null) {
		sectionId = await createSectionRecord(HIERARCHY_SECTION, userId);
		outcome.created = true;
		const write = (column: 'relation' | 'string', tipo: string, value: unknown) =>
			updateMatrixKeyData(
				HIERARCHY_MAIN_TABLE,
				HIERARCHY_SECTION,
				sectionId as number,
				column,
				tipo,
				value,
			);
		// Identity fields, written ONLY for a record we just created — re-activating an
		// existing hierarchy must never clobber operator-edited metadata (PHP comment).
		await write('string', HIERARCHY_TLD, [{ id: 1, lang: 'lg-nolan', value: tld }]);
		await write('string', HIERARCHY_TERM, [{ id: 1, lang: 'lg-eng', value: meta.label }]);
		await write('relation', HIERARCHY_TYPOLOGY, [
			{
				id: 1,
				type: RELATION_TYPE_LINK,
				section_id: String(typology),
				section_tipo: HIERARCHY_TYPES_SECTION,
				from_component_tipo: HIERARCHY_TYPOLOGY,
			},
		]);
	}
	outcome.sectionId = sectionId;

	// Everything else IS the shared invariant — flags, ontology, target sections and the
	// general-term roots (resolved-or-created, never hard-coded).
	const ensured = await ensureHierarchy(sectionId, userId, {
		activate: true,
		activeInThesaurus: meta.active_in_thesaurus !== false,
	});
	outcome.applied = ensured.applied;
	outcome.errors.push(...ensured.errors);
	outcome.result = ensured.result;
	if (!ensured.result && ensured.errors.length === 0) {
		outcome.errors.push(ensured.msg);
	}
	return outcome;
}
