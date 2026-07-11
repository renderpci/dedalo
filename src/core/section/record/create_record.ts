/**
 * Section record creation (PHP section::create_record → section_record::create).
 *
 * Creating a record writes ONE new matrix row with the audit metadata a fresh
 * record carries:
 * - the `data` column: {label, created_date, section_id, section_tipo,
 *   diffusion_info, created_by_user_id} (PHP section_record::build_metadata);
 * - the `relation` column: the created-by-user locator under dd200 (a link to
 *   the user record in dd128);
 * - the `date` column: the creation date under dd199 as a Dédalo virtual-date
 *   object (PHP build_modification_data mode 'new_record').
 * The section_id is allocated atomically through the matrix counter (see
 * insertMatrixRecordWithCounter).
 *
 * created_date / the dd199 date are wall-clock values — the only non-reproducible
 * fields; a differential must normalize them.
 */

import { config } from '../../../config/config.ts';
import { isConsultationOnlySection } from '../../concepts/section.ts';
import { dbTimestamp } from '../../db/db_timestamp.ts';
import {
	insertMatrixRecordWithCounter,
	insertMatrixRecordWithExplicitId,
} from '../../db/matrix_write.ts';
import { sql } from '../../db/postgres.ts';
import { getMatrixTableFromTipo } from '../../ontology/resolver.ts';

/** Audit component tipos (PHP section::get_metadata_definition + relation types). */
export const CREATED_BY_USER = 'dd200';
export const CREATED_DATE = 'dd199';
export const MODIFIED_BY_USER = 'dd197';
export const MODIFIED_DATE = 'dd201';
const USERS_SECTION = 'dd128'; // DEDALO_SECTION_USERS_TIPO
const RELATION_TYPE_LINK = 'dd151'; // DEDALO_RELATION_TYPE_LINK

/** A Dédalo virtual-date `start` object (matches the stored component_date shape). */
interface VirtualDateStart {
	day: number;
	hour: number;
	time: number;
	year: number;
	month: number;
	minute: number;
	second: number;
}

/**
 * The current instant as a Dédalo virtual date. `time` is the virtual-calendar
 * encoding (fixed 372-day years / 31-day months — PHP dd_date), NOT a Unix
 * timestamp: year*372*86400 + (month-1)*31*86400 + (day-1)*86400 + h*3600 +
 * m*60 + s.
 */
export function virtualDateNow(now: Date): VirtualDateStart {
	const year = now.getFullYear();
	const month = now.getMonth() + 1;
	const day = now.getDate();
	const hour = now.getHours();
	const minute = now.getMinutes();
	const second = now.getSeconds();
	const time =
		year * 372 * 86400 +
		(month - 1) * 31 * 86400 +
		(day - 1) * 86400 +
		hour * 3600 +
		minute * 60 +
		second;
	return { day, hour, time, year, month, minute, second };
}

// The shared DEDALO_TIMEZONE-aware stamp helper (S1-03): re-exported so the
// delete/duplicate/observers paths that import it from here keep one source.
export { dbTimestamp } from '../../db/db_timestamp.ts';

/**
 * Resolve a section's display label from its ontology `term` map (PHP
 * build_metadata → get_term_by_tipo, application lang with fallback to any
 * non-empty term). Empty string when the node has no term (PHP casts null→'').
 */
async function resolveSectionLabel(sectionTipo: string): Promise<string> {
	const rows = (await sql`SELECT term FROM dd_ontology WHERE tipo = ${sectionTipo} LIMIT 1`) as {
		term: Record<string, string> | null;
	}[];
	const term = rows[0]?.term;
	if (term == null) return '';
	const appLang = config.menu.applicationLang;
	if (term[appLang]) return term[appLang];
	for (const value of Object.values(term)) {
		if (value) return value;
	}
	return '';
}

/**
 * The `data`-column metadata a fresh record carries (PHP build_metadata).
 * section_id is left null — PHP writes it null too (the row's real section_id
 * lives in the structural column).
 */
export async function buildRecordMetadata(
	sectionTipo: string,
	userId: number,
	now: Date,
): Promise<Record<string, unknown>> {
	return {
		label: await resolveSectionLabel(sectionTipo),
		created_date: dbTimestamp(now),
		section_id: null,
		section_tipo: sectionTipo,
		diffusion_info: null,
		created_by_user_id: userId,
	};
}

/** An audit user locator (created-by dd200 / modified-by dd197 stamp). */
export function auditUserLocator(userId: number, componentTipo: string): Record<string, unknown> {
	return {
		id: 1,
		type: RELATION_TYPE_LINK,
		section_id: String(userId),
		section_tipo: USERS_SECTION,
		from_component_tipo: componentTipo,
	};
}

/** An audit date item (created dd199 / modified dd201 stamp, nolan lang). */
export function auditDateItem(now: Date): Record<string, unknown> {
	return { id: 1, start: virtualDateNow(now), lang: 'lg-nolan' };
}

/**
 * Create a new record in `sectionTipo` owned by `userId`. Returns the allocated
 * section_id. `now` is injectable for deterministic tests.
 *
 * `sectionId` forces a specific id instead of counter-allocating one — the
 * ontology provisioning path needs deterministic node ids (`<tld>0` descriptor
 * = 1, model = 2, typology groupers). With it set the counter is raised so a
 * later auto-allocation never collides; a duplicate id throws — unless
 * `options.conflictTolerant` is set, in which case an already-existing row is
 * ACCEPTED without error (the save path's materialize-on-save race, S1-02:
 * two concurrent saves both find no row and both try to create it; the loser
 * re-reads under its lock) and the requested sectionId is returned.
 */
export async function createSectionRecord(
	sectionTipo: string,
	userId: number,
	now: Date = new Date(),
	sectionId?: number,
	options: { conflictTolerant?: boolean } = {},
): Promise<number> {
	// Consultation-only sections are read-only for every caller (Activity dd542,
	// Time Machine dd15, …). PHP refuses this at section::create_record:452; the
	// engine backstop covers the client API, MCP tools, the agent and any future
	// door in one place. The API handlers deny earlier with a clean 403.
	if (isConsultationOnlySection(sectionTipo)) {
		throw new Error(
			`createSectionRecord: section '${sectionTipo}' is consultation-only (read-only)`,
		);
	}
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) {
		throw new Error(`createSectionRecord: no matrix table for section '${sectionTipo}'`);
	}
	const jsonbColumns = {
		data: await buildRecordMetadata(sectionTipo, userId, now),
		// created-by-user link + creation date (PHP build_modification_data 'new_record').
		relation: { [CREATED_BY_USER]: [auditUserLocator(userId, CREATED_BY_USER)] },
		date: { [CREATED_DATE]: [auditDateItem(now)] },
	};
	return sectionId === undefined
		? insertMatrixRecordWithCounter(table, sectionTipo, jsonbColumns)
		: insertMatrixRecordWithExplicitId(table, sectionTipo, sectionId, jsonbColumns, {
				onConflict: options.conflictTolerant === true ? 'ignore' : 'throw',
			});
}
