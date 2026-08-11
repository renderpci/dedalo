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
 *
 * NO SECTION IS SPECIAL-CASED HERE, and none may be. A rule that binds a
 * section (the USERS section's own-record/created_by/shared-projects rule is the
 * one that tempted it) belongs in the ASSEMBLER, where the list, the count, the
 * UNION branches and this existence probe all inherit it at once; a copy here
 * would be an ACL that answers one thing per record and another per list — the
 * exact shape of the oracle bug WC-2026-08-09-users-section-record-scope
 * records. This module therefore contains NO section tipo comparison at all.
 * Gated behaviourally by test/unit/oh1_permissions_native.test.ts "the
 * per-record answer EQUALS the list answer, record by record".
 */

import { sanitizeClientSqo } from '../concepts/sqo.ts';
import { sql } from '../db/postgres.ts';
import { buildSearchSql } from '../search/sql_assembler.ts';
import { getPermissions, type Principal } from './permissions.ts';

/**
 * True when a principal-scoped existence search for `sectionTipo/sectionId`
 * returns the record — i.e. it is inside the caller's projects filter. Callers
 * that grant global admins unconditional access must check `isGlobalAdmin`
 * themselves before calling this.
 *
 * ONE RULE, TWO DOORS. Every section — the USERS section (dd128) included —
 * answers through the SAME predicate the list/search path applies, because this
 * function runs the real assembler (search/sql_assembler.ts buildSearchSql) with
 * the principal attached. The dd128 rule therefore lives in exactly one place,
 * buildUsersProjectsFilter, and a per-record answer can never drift from what
 * the list shows.
 *
 * DIVERGENCE FROM THE ORACLE, declared as
 * WC-2026-08-09-users-section-record-scope: PHP's per-record helper
 * security::user_can_access_record (class.security.php:1035-1058) short-circuits
 * only the caller's OWN dd128 row and then falls through to the component_filter
 * lookup, which dd128 has none of, so PHP `return true`s for EVERY user record —
 * an IDOR against its own list filter, which hides those same records. TS makes
 * the two doors agree on the restrictive side. PHP's own-record allowance is
 * kept, moved into the assembler predicate so the list honours it too (a
 * projects-less user must be able to read their own account).
 */
export async function isRecordInScope(
	sectionTipo: string,
	sectionId: number,
	principal: Principal,
): Promise<boolean> {
	const scopeSqo = sanitizeClientSqo({
		section_tipo: [sectionTipo],
		filter_by_locators: [{ section_tipo: sectionTipo, section_id: sectionId }],
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
 * Drop record hits a principal cannot reach (AUTHZ-05) — the LIST-shaped twin of
 * {@link principalCanAccessRecord}. A hit survives only when the caller (a)
 * holds a read grant on its SECTION and (b) has the RECORD inside their projects
 * filter. Global admins are unscoped (the current, correct behavior). One
 * getPermissions per distinct section (cached); one isRecordInScope per
 * surviving hit.
 *
 * NAMED for the door it was written at: the inverse scan
 * (search_related.findInverseReferences) is a shared low-level primitive that
 * runs over 'all' owning sections with NO principal — many system paths
 * (diffusion resolve, observers, children) depend on it staying unscoped — so
 * the USER-FACING doors (the relation-list panel + its paginator count) scope
 * its output here before emitting existence / labels / counts. Before this, a
 * non-admin holding only the HOST record's read grant enumerated referencing
 * records in sections + projects they had zero access to.
 *
 * The RULE is general, so the function is too: any deliberately unscoped scan
 * (an inverse-reference walk, a vector hit list, an identification candidate
 * pool) gates through this one implementation at its user-facing door — import
 * it as {@link scopeRecordHits} when the caller is not inverse references. The
 * boundary must never be re-decided per caller.
 *
 * Deliberately silent about what it dropped: a "n hidden" count is an existence
 * oracle for records the caller may not see.
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

/**
 * The name callers that are NOT inverse references import
 * {@link scopeInverseReferenceHits} by (the identification candidate pool is the
 * first). An ALIAS, never a copy: one implementation of the rule, two readable
 * doors — and the AUTHZ-05 tripwire keeps pinning the original export.
 */
export const scopeRecordHits = scopeInverseReferenceHits;

/**
 * AUTHZ-02 — drop CLIENT-SUPPLIED target locators the principal may not resolve.
 *
 * A non-admin must not read the child values of a record outside their projects
 * filter by injecting its locator and letting the standard expansion resolve it.
 * Two doors hand the engine locators that never came from a stored record — the
 * search-chip `resolve_data` path and the WC-079 temporal scratch graft — and
 * both must scope them.
 *
 * Extracted so the two cannot drift: the scratch store shipped without this
 * filter and was a live cross-tenant read (a level-1 grant plus an injected
 * locator returned another tenant's field values).
 *
 * Locators with no (section_tipo, section_id) identity carry nothing to scope
 * and pass through. Global admins are unscoped.
 *
 * (!) Applied at READ time, not only at write time: a principal's projects
 * assignment can change after a locator was stored, so a write-time filter alone
 * would let a stale row outlive the grant that justified it.
 */
export async function filterLocatorsInScope<T extends Record<string, unknown>>(
	locators: readonly T[],
	principal: Principal | undefined,
	usersSectionTipo: string,
): Promise<T[]> {
	if (principal === undefined || principal.isGlobalAdmin || locators.length === 0) {
		return [...locators];
	}
	const scoped: T[] = [];
	for (const locator of locators) {
		const locSectionTipo = locator.section_tipo;
		const locSectionId = locator.section_id;
		if (typeof locSectionTipo !== 'string' || locSectionId === undefined || locSectionId === null) {
			scoped.push(locator);
			continue;
		}
		// The root user locator (dd128/-1) resolves to a LABEL only, and PHP
		// resolves it for any caller with section-level permission — activity "who"
		// chips must render. Record access stays blocked by the assembler's
		// section_id > 0 filter and principalCanAccessRecord.
		if (locSectionTipo === usersSectionTipo && Number(locSectionId) === -1) {
			scoped.push(locator);
			continue;
		}
		if (await isRecordInScope(locSectionTipo, Number(locSectionId), principal)) {
			scoped.push(locator);
		}
	}
	return scoped;
}
