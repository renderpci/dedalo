/**
 * RECORD INFO — who created / last modified / published one record, and when.
 *
 * Served to the inspector's Information panel by its OWN request
 * (dd_utils_api:get_record_info), fetched after the section renders — never
 * folded into the section read. PHP built this per entry inside every read
 * (section::get_section_info: component builds + user lookups per record) and
 * dropped it for cost in 2025-12; here the main read pays nothing and the panel
 * pays one record-scoped round trip.
 *
 * Sources:
 *   - created / modified: the audit components (AUDIT_TIPOS dd199/dd200,
 *     dd201/dd197) read off the record row; created falls back to the `data`
 *     column twin (record_metadata.ts) when the components are absent.
 *   - publication: the dd1758 ledger (diffusion_bridge/publication_history.ts).
 *
 * Dates leave as 'YYYY-MM-DD HH:MM:SS' Dédalo wall-clock strings (the
 * dbTimestamp shape); the client formats them for display.
 */

import { AUDIT_TIPOS } from '../../concepts/section.ts';
import { memoizedReadMatrixRecord } from '../../db/record_memo.ts';
import { readPublicationHistory } from '../../diffusion_bridge/publication_history.ts';
import { getMatrixTableFromTipo } from '../../ontology/resolver.ts';
import { userRecordId } from '../../security/user_identity.ts';
import { ddDateToDbTimestamp } from './record_metadata.ts';

export interface RecordInfoEvent {
	date: string | null;
	user_id: number | null;
	user_name: string | null;
}

export interface RecordInfo {
	created: RecordInfoEvent | null;
	modified: RecordInfoEvent | null;
	publication: {
		first: RecordInfoEvent | null;
		last: RecordInfoEvent | null;
		state: 'published' | 'unpublished' | 'pending' | null;
	};
}

interface RawEvent {
	date: string | null;
	userId: number | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function firstItem(column: unknown, tipo: string): Record<string, unknown> | null {
	if (!isObject(column)) return null;
	const list = column[tipo];
	const first = Array.isArray(list) ? list[0] : undefined;
	return isObject(first) ? first : null;
}

function auditDate(column: unknown, tipo: string): string | null {
	const start = firstItem(column, tipo)?.start;
	return isObject(start) ? ddDateToDbTimestamp(start) : null;
}

function auditUser(column: unknown, tipo: string): number | null {
	return userRecordId(firstItem(column, tipo)?.section_id);
}

function eventOrNull(event: RawEvent): RawEvent | null {
	return event.date === null && event.userId === null ? null : event;
}

/**
 * The audit pair of a record row (pure — the gated fold). `readable` is the
 * per-tipo read grant; a refused tipo contributes nothing — its `data`-column
 * twin included, or the twin would serve what the component grant denies.
 */
export function auditEventsFromColumns(
	columns: Record<string, unknown>,
	readable: ReadonlySet<string>,
): {
	created: RawEvent | null;
	modified: RawEvent | null;
} {
	const data = isObject(columns.data) ? columns.data : {};
	const twinDate =
		typeof data.created_date === 'string' && data.created_date !== '' ? data.created_date : null;
	const created = auditEvent(columns, readable, {
		dateTipo: AUDIT_TIPOS.createdDate,
		userTipo: AUDIT_TIPOS.createdByUser,
		twinDate,
		twinUser: userRecordId(data.created_by_user_id),
	});
	const modified = auditEvent(columns, readable, {
		dateTipo: AUDIT_TIPOS.modifiedDate,
		userTipo: AUDIT_TIPOS.modifiedByUser,
		twinDate: null,
		twinUser: null,
	});
	return { created, modified };
}

/** One audit pair: each half only when readable, the `data` twin as its fallback. */
function auditEvent(
	columns: Record<string, unknown>,
	readable: ReadonlySet<string>,
	pair: { dateTipo: string; userTipo: string; twinDate: string | null; twinUser: number | null },
): RawEvent | null {
	const date = readable.has(pair.dateTipo)
		? (auditDate(columns.date, pair.dateTipo) ?? pair.twinDate)
		: null;
	const userId = readable.has(pair.userTipo)
		? (auditUser(columns.relation, pair.userTipo) ?? pair.twinUser)
		: null;
	return eventOrNull({ date, userId });
}

export interface RecordInfoDeps {
	/** Display name of a user id (user_identity.resolveUserName in production). */
	resolveName: (userId: number) => Promise<string | null>;
	/** The caller's read grant on one audit component of this section. */
	canReadAudit: (componentTipo: string) => Promise<boolean>;
}

/**
 * The record's info, or null when the section has no matrix table or the record
 * does not exist. Names resolve once per distinct user id.
 */
export async function getRecordInfo(
	sectionTipo: string,
	sectionId: number,
	deps: RecordInfoDeps,
): Promise<RecordInfo | null> {
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) return null;
	const auditTipos = Object.values(AUDIT_TIPOS);
	const [record, history, grants] = await Promise.all([
		memoizedReadMatrixRecord(table, sectionTipo, sectionId),
		readPublicationHistory(sectionTipo, sectionId),
		Promise.all(auditTipos.map((tipo) => deps.canReadAudit(tipo))),
	]);
	if (record === null) return null;
	const readable = new Set(auditTipos.filter((_, index) => grants[index] === true));
	const { created, modified } = auditEventsFromColumns(record.columns, readable);
	const ledgerEvent = (
		event: { date: Record<string, unknown> | null; userId: number | null } | null,
	): RawEvent | null =>
		event === null
			? null
			: {
					date: event.date === null ? null : ddDateToDbTimestamp(event.date),
					userId: event.userId,
				};
	const first = ledgerEvent(history.first);
	const last = ledgerEvent(history.last);

	const ids = new Set<number>();
	for (const event of [created, modified, first, last]) {
		if (event?.userId != null) ids.add(event.userId);
	}
	const names = new Map<number, string | null>();
	await Promise.all(
		[...ids].map(async (id) => {
			names.set(id, await deps.resolveName(id));
		}),
	);
	const finish = (event: RawEvent | null): RecordInfoEvent | null =>
		event === null
			? null
			: {
					date: event.date,
					user_id: event.userId,
					user_name: event.userId === null ? null : (names.get(event.userId) ?? null),
				};
	return {
		created: finish(created),
		modified: finish(modified),
		publication: { first: finish(first), last: finish(last), state: history.state },
	};
}
