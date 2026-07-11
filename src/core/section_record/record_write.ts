/**
 * record_write — THE write chokepoint for key-level and column-level matrix
 * record persistence. TS re-expression of PHP section_record::save_key_data /
 * save_component_data / save / save_column (class.section_record.php:661/:805/
 * :539/:601) as stateless functions.
 *
 * Every writer that persists component keys into a matrix record MUST route
 * through persistRecordKeys (grep-gated by test/unit/section_record.test.ts):
 * that is what guarantees the PHP write contract everywhere —
 *
 *   1. AUDIT MERGE — the record's modified stamps (dd197 modified_by_user
 *      locator + dd201 modified_date) land in the SAME UPDATE statement as the
 *      component value (PHP save_component_data merges the metadata save_path
 *      before ONE update_by_key). Skipped for the Activity section and when no
 *      user is given (PHP build_modification_data :1584).
 *   2. KEY-REMOVAL SEMANTICS — value null removes the key with the exact PHP
 *      end state (oracle-verified): the column keeps '{}' after its last key,
 *      and a NULL column stays NULL (the PHP save_key_data "columns_to_delete"
 *      guard). Implemented inside updateMatrixKeysData via `#-`.
 *   3. SAVE EVENT — dependent caches invalidated after every persist
 *      (save_event.ts).
 *
 * The SQL itself stays in db/matrix_write.ts (updateMatrixKeysData /
 * updateMatrixRecord) — this module owns the contract, not the statements.
 *
 * NOT a class on purpose: the PHP class shape (per-request instance singleton,
 * lazy JSON decode) is PHP-runtime machinery — see concepts/section_record.ts
 * for the mapping of the concept onto TS.
 */

import { ACTIVITY_SECTION_TIPO, AUDIT_TIPOS } from '../concepts/section.ts';
import {
	type MatrixKeyWrite,
	type MatrixWriteValues,
	updateMatrixKeysData,
	updateMatrixRecord,
} from '../db/matrix_write.ts';
import { auditDateItem, auditUserLocator } from '../section/record/create_record.ts';
import { fireRagRecordEvent, fireSaveEvent } from './save_event.ts';

/** The record a write targets. The table comes from the ontology (getMatrixTableFromTipo). */
export interface RecordWriteTarget {
	table: string;
	sectionTipo: string;
	sectionId: number;
}

/**
 * One component-key write (PHP save_path item {column, key} + its value).
 * value null ⇒ REMOVE the key (PHP set_key_data(null) / delete_key).
 */
export type SavePathItem = MatrixKeyWrite;

/**
 * The modified-audit stamp for a write. Pass `false` ONLY when the caller
 * legitimately owns its own stamping (e.g. it already carries dd197/dd201 in
 * the savePath) or PHP itself skips it (system/maintenance writes that must
 * not touch the modified metadata, e.g. cache regeneration).
 */
export type AuditStamp = { userId: number; now?: Date } | false;

/**
 * Build the modified-audit savePath items (PHP get_modified_section_save_path
 * mode 'update_record' → build_modification_data): dd197 user locator into
 * `relation`, dd201 virtual date into `date`. Empty for the Activity section
 * or a missing user — PHP :1584 returns {} for both.
 */
export function buildModifiedAuditWrites(sectionTipo: string, audit: AuditStamp): SavePathItem[] {
	if (audit === false || !audit.userId || sectionTipo === ACTIVITY_SECTION_TIPO) {
		return [];
	}
	const now = audit.now ?? new Date();
	return [
		{
			column: 'relation',
			key: AUDIT_TIPOS.modifiedByUser,
			value: [auditUserLocator(audit.userId, AUDIT_TIPOS.modifiedByUser)],
		},
		{
			column: 'date',
			key: AUDIT_TIPOS.modifiedDate,
			value: [auditDateItem(now)],
		},
	];
}

/**
 * Persist one or more component keys of a record — value(s) + modified-audit
 * stamps in ONE UPDATE, then empty-column pruning, then the save event.
 *
 * This is the PHP save_component_data contract; with audit=false it degrades
 * to plain save_key_data.
 */
export async function persistRecordKeys(
	target: RecordWriteTarget,
	savePath: readonly SavePathItem[],
	audit: AuditStamp,
): Promise<void> {
	if (savePath.length === 0) {
		throw new Error('persistRecordKeys: empty savePath');
	}

	const writes: SavePathItem[] = [
		...savePath,
		...buildModifiedAuditWrites(target.sectionTipo, audit),
	];
	const affected = await updateMatrixKeysData(
		target.table,
		target.sectionTipo,
		target.sectionId,
		writes,
	);
	assertRecordStillExists(affected, target, 'persistRecordKeys');

	await fireSaveEvent(target.sectionTipo);
}

/**
 * S2-02 consumer-side fail-loud: an UPDATE matching 0 rows means the record was
 * deleted (or never existed) — a save racing a delete used to no-op with
 * `ok:true`, silently discarding the user's data. Throw instead so the API
 * surfaces the conflict and nothing pretends the write landed.
 */
function assertRecordStillExists(
	affected: number,
	target: RecordWriteTarget,
	caller: string,
): void {
	if (affected === 0) {
		throw new Error(
			`${caller}: record ${target.sectionTipo}/${target.sectionId} not found in ${target.table} — it was deleted concurrently (or never existed); the write did not land`,
		);
	}
}

/**
 * Persist ONLY the modified-audit stamps (PHP update_modified_section_data,
 * class.section_record.php:1530) — used by writers whose data write cannot go
 * through updateMatrixKeysData (e.g. the atomic-insert concatenation in
 * save_component.ts) but that must still refresh dd197/dd201 like every PHP
 * component save. No-op for the Activity section / missing user (PHP :1584).
 */
export async function persistModifiedStamp(
	target: RecordWriteTarget,
	audit: Exclude<AuditStamp, false>,
): Promise<void> {
	const writes = buildModifiedAuditWrites(target.sectionTipo, audit);
	if (writes.length === 0) return;
	const affected = await updateMatrixKeysData(
		target.table,
		target.sectionTipo,
		target.sectionId,
		writes,
	);
	assertRecordStillExists(affected, target, 'persistModifiedStamp');
	await fireSaveEvent(target.sectionTipo);
}

/**
 * Persist whole columns of a record (PHP save / save_column / the create()
 * update mode; the TM full-record restore path). Columns not present in
 * `columns` are untouched; a column set to null becomes SQL NULL.
 *
 * When an audit stamp is given, the dd197/dd201 modified items are MERGED into
 * the provided `relation`/`date` column objects so everything lands in the one
 * upsert — the caller must therefore pass the FULL intended content of any
 * column it includes (whole-column writes replace, they do not patch).
 *
 * Fires the save event and the RAG 'index' seam (PHP save() :564 enqueues the
 * record for re-indexing on every full save).
 */
export async function persistRecordColumns(
	target: RecordWriteTarget,
	columns: MatrixWriteValues,
	audit: AuditStamp = false,
): Promise<'updated' | 'inserted'> {
	const values: MatrixWriteValues = { ...columns };

	const auditWrites = buildModifiedAuditWrites(target.sectionTipo, audit);
	for (const write of auditWrites) {
		const current = values[write.column];
		const bag =
			current !== null && current !== undefined && typeof current === 'object'
				? { ...(current as Record<string, unknown>) }
				: {};
		bag[write.key] = write.value;
		values[write.column] = bag;
	}

	if (Object.keys(values).length === 0) {
		throw new Error('persistRecordColumns: empty columns payload');
	}

	const result = await updateMatrixRecord(
		target.table,
		target.sectionTipo,
		target.sectionId,
		values,
	);

	await fireSaveEvent(target.sectionTipo);
	await fireRagRecordEvent({
		kind: 'index',
		sectionTipo: target.sectionTipo,
		sectionId: target.sectionId,
	});

	return result;
}
