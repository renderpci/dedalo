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
 *
 * CORE HIERARCHIES (A7, 2026-10-08): `activateCoreHierarchies` runs this same door for
 * every CORE_HIERARCHIES descriptor (today `lg`) — with NO import in front of it. Their
 * terms ship in the seed, in their own table (21,705 `lg1` rows in matrix_langs), and the
 * seed's registry record (hierarchy1 for tld `lg`) arrives inactive: hierarchy4 = No,
 * hierarchy125 = No, no hierarchy59 model root. Measured on the suite DB (rolled back):
 * one activation applied 'flagged active', 'active in thesaurus: Yes' and 'hierarchy59:
 * linked the existing root lg2/2', with zero lg rows in matrix_hierarchy, and the
 * hierarchy then inspected usable (root lg1/1 resolved in matrix_langs). The seed
 * restore calls it (db_restore.ts), so every surface that restores the seed gets
 * Languages active.
 */

import { updateMatrixKeyData } from '../db/matrix_write.ts';
import { sql } from '../db/postgres.ts';
import { ensureHierarchy, HIERARCHY_SECTION } from '../ontology/hierarchy_state.ts';
import {
	HIERARCHY_TERM,
	HIERARCHY_TLD,
	HIERARCHY_TYPES_SECTION,
	HIERARCHY_TYPOLOGY,
	RELATION_TYPE_LINK,
} from '../ontology/ontology_tipos.ts';
import { createSectionRecord } from '../section/record/create_record.ts';
import { CORE_HIERARCHIES, type HierarchyMeta } from './hierarchy_meta.ts';

const HIERARCHY_MAIN_TABLE = 'matrix_hierarchy_main';

export interface ActivateHierarchyResult {
	/** INTERNAL outcome (never a wire body): did the activation converge? */
	ok: boolean;
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
		ok: false,
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
				// WC-2026-08-10-section-id-int-canonical: typology is the int address of
				// the hierarchy-types record.
				section_id: typology,
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
	outcome.ok = ensured.ok;
	if (!ensured.ok && ensured.errors.length === 0) {
		outcome.errors.push(ensured.msg);
	}
	return outcome;
}

/** The outcome of activating every core hierarchy (INTERNAL — the seed restore reads it). */
export interface CoreHierarchiesActivation {
	ok: boolean;
	msg: string;
	errors: string[];
	/** The core tlds that converged. */
	activated: string[];
}

/**
 * Activate every CORE hierarchy (see the header): activation only, never an import.
 * Idempotent — a second run converges with nothing applied.
 */
export async function activateCoreHierarchies(userId = -1): Promise<CoreHierarchiesActivation> {
	const outcome: CoreHierarchiesActivation = { ok: true, msg: '', errors: [], activated: [] };
	for (const meta of CORE_HIERARCHIES) {
		const activation = await activateHierarchy(meta, userId);
		if (activation.ok) outcome.activated.push(meta.tld);
		else outcome.errors.push(...activation.errors.map((error) => `${meta.tld}: ${error}`));
	}
	outcome.ok = outcome.errors.length === 0;
	outcome.msg = outcome.ok
		? `Core hierarchies active: ${outcome.activated.join(', ')}`
		: `Core hierarchy activation failed: ${outcome.errors.join('; ')}`;
	return outcome;
}
