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
import type { Principal } from './permissions.ts';

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
