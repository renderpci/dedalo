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

import { AUDIT_TIPOS } from '../../concepts/section.ts';
import { readMatrixRecord } from '../../db/matrix.ts';
import { updateMatrixRecord } from '../../db/matrix_write.ts';
import { DedaloError } from '../../errors/dedalo_error.ts';
import { getMatrixTableFromTipo } from '../../ontology/resolver.ts';

/** The `data`-column metadata keys an importer may legitimately set. */
export interface RecordMetadataPatch {
	/** A dd_timestamp string (db_timestamp.ts dbTimestamp shape). */
	createdDate?: string;
	/** The users-section id of the record's author. */
	createdByUserId?: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** A dd_date {year, month, day, …} → the 'YYYY-MM-DD HH:MM:SS' the `data` column stores. */
function ddDateToDbTimestamp(date: Record<string, unknown>): string | null {
	const year = Number(date.year);
	if (!Number.isFinite(year)) return null;
	const pad = (value: unknown, fallback: number): string =>
		String(Number.isFinite(Number(value)) ? Number(value) : fallback).padStart(2, '0');
	const yyyy = (year < 0 ? '-' : '') + String(Math.abs(year)).padStart(4, '0');
	return `${yyyy}-${pad(date.month, 1)}-${pad(date.day, 1)} ${pad(date.hour, 0)}:${pad(date.minute, 0)}:${pad(date.second, 0)}`;
}

/**
 * The `data`-column twin an AUDIT component's value implies: dd199 (created
 * date, its first item's `start`) → `createdDate`; dd200 (created-by user, its
 * first locator) → `createdByUserId`. `{}` for any other tipo, or a value that
 * implies nothing. THE ONE DERIVATION — the CSV importer writes the twin with
 * it, and the bulk revert re-derives the twin with it after restoring dd199 /
 * dd200, so the two stores cannot disagree by construction.
 */
export function metadataPatchFromAuditValue(tipo: string, value: unknown): RecordMetadataPatch {
	const first = Array.isArray(value) ? value[0] : undefined;
	if (!isObject(first)) return {};
	if (tipo === AUDIT_TIPOS.createdDate && isObject(first.start)) {
		const stamp = ddDateToDbTimestamp(first.start);
		return stamp === null ? {} : { createdDate: stamp };
	}
	if (tipo === AUDIT_TIPOS.createdByUser && first.section_id !== undefined) {
		const userId = Number(first.section_id);
		return Number.isFinite(userId) ? { createdByUserId: userId } : {};
	}
	return {};
}

/** Whether a tipo is one of the two audit components the `data` column twins. */
export function isMetadataTwinned(tipo: string): boolean {
	return tipo === AUDIT_TIPOS.createdDate || tipo === AUDIT_TIPOS.createdByUser;
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
		throw new DedaloError('section.no_matrix_table', {
			message: `setRecordMetadata: no matrix table for section '${sectionTipo}'`,
			coordinates: { section_tipo: sectionTipo },
		});
	}
	const record = await readMatrixRecord(table, sectionTipo, sectionId);
	if (record === null) {
		throw new DedaloError('resource.not_found', {
			message: `setRecordMetadata: no record ${sectionTipo}/${sectionId}`,
			coordinates: { section_tipo: sectionTipo, section_id: sectionId },
		});
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
