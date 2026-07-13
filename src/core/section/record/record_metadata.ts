/**
 * RECORD METADATA writer — the `data`-column twin of the audit components.
 *
 * A record's creation identity lives in TWO places (the audit components AND the
 * record header), which is why an importer that carries created_date /
 * created_by_user in its CSV must write both:
 *
 *   1. the AUDIT COMPONENTS — dd199 created_date (date column), dd200
 *      created_by_user (relation column), dd197/dd201 the modified pair. These
 *      are what the section's own edit view renders.
 *   2. the `data` COLUMN metadata — `{label, created_date, created_by_user_id,
 *      …}` (create_record.ts buildRecordMetadata). This is what list views, the
 *      diffusion layer and anything reading the record header consult.
 *
 * Writing only (1) leaves a record whose edit view says "created 1998" while
 * every list says "created today, by the importer".
 *
 * (!) WHY NOT persistRecordKeys. The per-KEY writer (updateMatrixKeysData) is the
 * component save path: it validates every key against the TIPO GRAMMAR, because a
 * key there is a component tipo inside a jsonb path. The `data` column's keys are
 * NOT tipos — they are `created_date`, `label`, `created_by_user_id` — so that
 * writer refuses them outright ("key 'created_date' fails the tipo grammar"). This
 * module therefore merges into the WHOLE `data` column (updateMatrixRecord), which
 * has no key gate. Safe because the caller runs inside the row's transaction and
 * nothing else writes `data` during an import — the modified-audit stamps land in
 * the `relation`/`date` columns, not this one.
 *
 * The write is UNSTAMPED by construction: setting a record's creation metadata
 * must not, itself, mark the record modified-now.
 */

import { readMatrixRecord } from '../../db/matrix.ts';
import { updateMatrixRecord } from '../../db/matrix_write.ts';
import { getMatrixTableFromTipo } from '../../ontology/resolver.ts';

/** The `data`-column metadata keys an importer may legitimately set. */
export interface RecordMetadataPatch {
	/** A dd_timestamp string (db_timestamp.ts dbTimestamp shape). */
	createdDate?: string;
	/** The users-section id of the record's author. */
	createdByUserId?: number;
}

/**
 * Merge a record's `data`-column creation metadata. A no-op for an empty patch.
 * Throws when the record does not exist — a caller that has just created/matched
 * the row is the only legitimate one.
 */
export async function setRecordMetadata(
	sectionTipo: string,
	sectionId: number,
	patch: RecordMetadataPatch,
): Promise<void> {
	if (patch.createdDate === undefined && patch.createdByUserId === undefined) return;

	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) {
		throw new Error(`setRecordMetadata: no matrix table for section '${sectionTipo}'`);
	}
	const record = await readMatrixRecord(table, sectionTipo, sectionId);
	if (record === null) {
		throw new Error(`setRecordMetadata: no record ${sectionTipo}/${sectionId}`);
	}

	// MERGE, never replace: the column also holds `label`, `section_tipo`,
	// `diffusion_info` — none of which this caller owns.
	const current = record.columns.data;
	const next: Record<string, unknown> =
		current !== null && typeof current === 'object' && !Array.isArray(current)
			? { ...(current as Record<string, unknown>) }
			: {};

	if (patch.createdDate !== undefined) next.created_date = patch.createdDate;
	if (patch.createdByUserId !== undefined) next.created_by_user_id = patch.createdByUserId;

	await updateMatrixRecord(table, sectionTipo, sectionId, { data: next });
}
