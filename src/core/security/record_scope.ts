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
import { DedaloError } from '../errors/dedalo_error.ts';
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
 * THE WRITE-DOOR TARGET GATE (P1-2, closes SEC-05) — the throwing form of
 * {@link principalCanAccessRecord}, in the order that matters.
 *
 * The three record-lifecycle doors (save, duplicate, delete) each wrote the scope check
 * as `if (!principal.isGlobalAdmin) { isRecordInScope(...) }`. That inlines the admin
 * bypass ABOVE the non-positive-id refusal, so for an admin-flagged principal the
 * refusal never executed at all — and `root_user_hidden_tripwire` asserted the property
 * of the FUNCTION while every DOOR skipped it. Root (dd128/-1) is a strictly higher tier
 * than global admin everywhere else in the codebase, and its password was rewritable by
 * any global admin holding a level-2 grant on `(dd128, dd133)`.
 *
 * Calling this instead makes the order un-inlineable: the non-positive-id refusal is
 * inside the same function as the bypass, ahead of it, exactly as
 * `principalCanAccessRecord` has always had it.
 *
 * ONE LEGITIMATE FLOW WRITES A NON-POSITIVE RECORD ID, AND EXACTLY ONE — MEASURED, not
 * assumed. Every `matrix*` table carrying a `section_id` was counted read-only on
 * 2026-08-28 across the suite database and the live installation `dedalo_v7_mht`: the
 * ONLY row with `section_id < 1` anywhere is `matrix_users` dd128/-1, root itself. And
 * by construction: root is seeded by the install SQL
 * (`install/db/dedalo_install.pgsql.gz`, one COPY row), not through the API;
 * `createSectionRecord` allocates from the section counter and can only return a
 * positive id; both delete engines already refuse `sectionId < 1` themselves
 * (`delete_record.ts:73` and `:544`); the fixtures and the test corpus insert through
 * `insertMatrixRecordWithCounter`, positive by construction.
 *
 * That one flow is ROOT EDITING ITS OWN ACCOUNT — `selfServiceAccountWrite`, below. The
 * first shape of this gate had no exception, and the side effect nobody chose was that
 * root could no longer change its own password or its own email through the engine
 * either, while `password_reset.ts` excludes root from the emailed recovery flow by the
 * same `id > 0` rule: an installation with no in-engine way to rotate its most
 * privileged credential.
 */
export async function assertRecordWriteTarget(
	sectionTipo: string,
	sectionId: number,
	principal: Principal,
	operation: string,
	options: {
		/**
		 * The ONE exception to the non-positive-id refusal: the actor is editing one of
		 * its OWN account's self-editable components on its OWN record.
		 *
		 * A BOOLEAN, computed by the caller through `permissions.isSelfServiceAccountWrite`
		 * — deliberately not a section tipo or a component tipo passed in here. This
		 * module contains no section comparison at all, and none may be added: a rule
		 * that binds a section belongs in the ASSEMBLER, where the list, the count, the
		 * UNION branches and the existence probe all inherit it at once (see the module
		 * docblock and WC-2026-08-09-users-section-record-scope). The predicate lives
		 * beside `SELF_EDITABLE_COMPONENTS`, which is the only place that set is stated.
		 *
		 * It is re-checked against `principal.userId` here anyway, so a caller that
		 * passes `true` for someone else's record still gets the ordinary refusal.
		 */
		selfServiceAccountWrite?: boolean;
	} = {},
): Promise<void> {
	if (options.selfServiceAccountWrite === true && sectionId === principal.userId) return;
	if (await principalCanAccessRecord(sectionTipo, sectionId, principal)) return;
	throw new DedaloError('perm.out_of_scope', {
		message:
			sectionId < 1
				? `${operation}: ${sectionTipo}/${String(sectionId)} is not a writable record address — a non-positive section_id is refused for EVERY caller, global admins included (only the account itself may edit its own name/email/password/image).`
				: `${operation}: ${sectionTipo}/${String(sectionId)} is outside the caller's scope`,
		coordinates: { section_tipo: sectionTipo, section_id: sectionId, operation },
	});
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
