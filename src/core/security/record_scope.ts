/**
 * Per-record authorization scope (PHP assert_record_in_user_scope).
 *
 * The projects filter (component_filter_master / dd170) is a WRITE boundary as
 * well as a read boundary in Dédalo: a user who can edit a section may only
 * touch the records inside their authorized projects. Read paths get this for
 * free (readSection applies the projects filter), but the write handlers (save,
 * delete, duplicate) and the tool record gate must assert it EXPLICITLY on the
 * target section_id — otherwise a level-2 user can mutate a record they can
 * never see (a direct-object-reference / tenant-isolation break).
 *
 * This is the single implementation of that check, reused everywhere so the
 * write scope rule stays byte-identical to list/search enforcement: it runs a
 * PRINCIPAL-SCOPED existence search for the record's locator (buildSearchSql
 * applies the same projects filter as any list) and reports whether the record
 * is visible. Global admins are unscoped and must be short-circuited by the
 * CALLER (they never reach here in the write handlers) — this function makes no
 * admin exception itself so it always answers the literal question "is this
 * record inside the projects filter?".
 */

import { sanitizeClientSqo } from '../concepts/sqo.ts';
import { sql } from '../db/postgres.ts';
import { buildSearchSql } from '../search/sql_assembler.ts';
import { type Principal, getPermissions } from './permissions.ts';

/**
 * True when a principal-scoped existence search for `sectionTipo/sectionId`
 * returns the record — i.e. it is inside the caller's projects filter. Callers
 * that grant global admins unconditional access must check `isGlobalAdmin`
 * themselves before calling this.
 */
export async function isRecordInScope(
	sectionTipo: string,
	sectionId: number,
	principal: Principal,
): Promise<boolean> {
	const scopeSqo = sanitizeClientSqo({
		section_tipo: [sectionTipo],
		filter_by_locators: [{ section_tipo: sectionTipo, section_id: String(sectionId) }],
		limit: 1,
	});
	const scopeQuery = await buildSearchSql(scopeSqo, { principal });
	const visible = (await sql.unsafe(
		scopeQuery.sql,
		scopeQuery.params as (string | number | null)[],
	)) as unknown[];
	return visible.length > 0;
}

/**
 * Admin-aware convenience wrapper over {@link isRecordInScope}: global admins are
 * unconditionally allowed (unscoped); everyone else must have the record inside
 * their projects filter. This is the SHARED per-record read/write scope gate —
 * every caller that addresses a record by (section_tipo, section_id) outside the
 * list/search path (get_data reads, resolve_data targets, MCP write tools) must
 * funnel through here so the tenant boundary cannot be forgotten at a new door
 * (foundation security audit AUTHZ-01/AUTHZ-02/AI-01: the filter was enforced
 * per-caller, not per-engine, so three doors skipped it).
 */
export async function principalCanAccessRecord(
	sectionTipo: string,
	sectionId: number,
	principal: Principal,
): Promise<boolean> {
	// PHP security::user_can_access_record (class.security.php:1007-1009): a
	// non-positive section_id is never accessible as a record, checked BEFORE
	// the global-admin bypass and for ALL sections (blocks record-level reach
	// to the root user dd128/-1 through get_data, MCP writes, change-plan).
	if (sectionId < 1) return false;
	if (principal.isGlobalAdmin) return true;
	return isRecordInScope(sectionTipo, sectionId, principal);
}

/**
 * Drop inverse-reference hits a principal cannot reach (AUTHZ-05). The inverse
 * scan (search_related.findInverseReferences) is a shared low-level primitive
 * that runs over 'all' owning sections with NO principal — many system paths
 * (diffusion resolve, observers, children) depend on it staying unscoped. So
 * the USER-FACING doors (the relation-list panel + its paginator count) must
 * scope the hits HERE before emitting existence / labels / counts: a hit is
 * kept only when the caller (a) holds a read grant on the referencing SECTION
 * and (b) has the referencing RECORD inside their projects filter. Before this,
 * a non-admin holding only the HOST record's read grant enumerated referencing
 * records in sections + projects they had zero access to. Global admins are
 * unscoped (the current, correct behavior). One getPermissions per distinct
 * section (cached); one isRecordInScope per surviving hit.
 */
export async function scopeInverseReferenceHits<
	T extends { section_tipo: string; section_id: number },
>(hits: T[], principal: Principal): Promise<T[]> {
	if (principal.isGlobalAdmin) return hits;
	const sectionReadable = new Map<string, boolean>();
	const out: T[] = [];
	for (const hit of hits) {
		let readable = sectionReadable.get(hit.section_tipo);
		if (readable === undefined) {
			readable = (await getPermissions(principal, hit.section_tipo, hit.section_tipo)) >= 1;
			sectionReadable.set(hit.section_tipo, readable);
		}
		if (!readable) continue;
		if (!(await isRecordInScope(hit.section_tipo, hit.section_id, principal))) continue;
		out.push(hit);
	}
	return out;
}
