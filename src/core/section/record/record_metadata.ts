/**
 * RECORD METADATA writer — the `data`-column twin of the audit components.
 *
 * A record's creation identity lives in TWO places (PHP does the same, which is
 * why its importer calls both `$component->import_save()` AND
 * `$section->set_created_date()`):
 *
 *   1. the AUDIT COMPONENTS — dd199 created_date (date column), dd200
 *      created_by_user (relation column), dd197/dd201 the modified pair. These
 *      are what the section's own edit view renders.
 *   2. the `data` COLUMN metadata — `{label, created_date, created_by_user_id,
 *      …}` (create_record.ts buildRecordMetadata). This is what list views, the
 *      diffusion layer and anything reading the record header consult.
 *
 * Writing only (1) leaves a record whose edit view says "created 1998" while
 * every list says "created today, by the importer". So an importer that carries
 * created_date / created_by_user in the CSV must patch (2) as well — that is all
 * this module does.
 *
 * The write is UNSTAMPED (AuditStamp false): setting a record's creation
 * metadata must not, itself, mark the record modified-now.
 */

import type { MatrixJsonbColumn } from '../../db/matrix.ts';
import { getMatrixTableFromTipo } from '../../ontology/resolver.ts';
import { persistRecordKeys } from '../../section_record/index.ts';

/** The `data`-column metadata keys an importer may legitimately set. */
export interface RecordMetadataPatch {
	/** A dd_timestamp string (db_timestamp.ts dbTimestamp shape). */
	createdDate?: string;
	/** The users-section id of the record's author. */
	createdByUserId?: number;
}

/**
 * Patch a record's `data`-column creation metadata. A no-op for an empty patch.
 * Throws (via the write chokepoint) when the record does not exist — a caller
 * that has just created/matched the row is the only legitimate one.
 */
export async function setRecordMetadata(
	sectionTipo: string,
	sectionId: number,
	patch: RecordMetadataPatch,
): Promise<void> {
	const writes: { column: MatrixJsonbColumn; key: string; value: unknown }[] = [];
	if (patch.createdDate !== undefined) {
		writes.push({ column: 'data', key: 'created_date', value: patch.createdDate });
	}
	if (patch.createdByUserId !== undefined) {
		writes.push({ column: 'data', key: 'created_by_user_id', value: patch.createdByUserId });
	}
	if (writes.length === 0) return;

	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) {
		throw new Error(`setRecordMetadata: no matrix table for section '${sectionTipo}'`);
	}
	// audit=false: the caller OWNS this metadata (see the header) — stamping the
	// record modified-now here would defeat the whole point.
	await persistRecordKeys({ table, sectionTipo, sectionId }, writes, false);
}
