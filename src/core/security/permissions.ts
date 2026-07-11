/**
 * AUTHORIZATION — the permissions matrix (spec §7.4; PHP
 * security::get_security_permissions + common::get_permissions).
 *
 * Levels: 0 none, 1 read, 2 read/write, 3 admin. A user's per-(section,
 * component) grants come from the component_security_access (dd774) datum in
 * their PROFILE record (section dd234), resolved via the user's profile-select
 * (dd1725). Global admins bypass the matrix; the superuser (user_id -1) is
 * always level 3.
 *
 * PHP references: class.security.php get_security_permissions (:199),
 * get_permissions_table (:326), get_user_profile (:471); common
 * get_permissions (:619).
 *
 * PER-REQUEST SAFETY (spec §4): a Principal object carries the request's
 * identity; every function takes it explicitly. The per-user permissions
 * table is cached in a module Map keyed BY user_id — safe against cross-request
 * bleed (distinct users → distinct keys) but must be cleared when a profile's
 * dd774 data or a user's profile assignment changes (clearPermissionsCache).
 */

import { readEnv } from '../../config/env.ts';
import { isConsultationOnlySection } from '../concepts/section.ts';
import { sql } from '../db/postgres.ts';
import { createDataCache } from '../ontology/cache_factory.ts';
import { getMatrixTableFromTipo, getModelByTipo } from '../ontology/resolver.ts';

/**
 * Bounded-staleness backstop for the per-user caches below. Explicit
 * invalidation (invalidatePermissionsForWrite / clear*) is the PRIMARY control;
 * the TTL only caps how long a MISSED invalidation (e.g. a grant changed on
 * another worker process, whose Map this process cannot reach) can linger.
 * PERMISSIONS_CACHE_TTL_SECONDS=0 disables the TTL (invalidation-only).
 */
const CACHE_TTL_MS = Math.max(0, Number(readEnv('PERMISSIONS_CACHE_TTL_SECONDS', '300'))) * 1000;

interface CacheEntry<V> {
	value: V;
	expiresAt: number;
}

/** Read a still-live cache entry (pruning it on expiry), or undefined. */
function readFresh<K, V>(cache: Map<K, CacheEntry<V>>, key: K): V | undefined {
	const entry = cache.get(key);
	if (entry === undefined) return undefined;
	if (CACHE_TTL_MS > 0 && Date.now() >= entry.expiresAt) {
		cache.delete(key);
		return undefined;
	}
	return entry.value;
}

/** Store a value with the TTL stamp. */
function storeEntry<K, V>(cache: Map<K, CacheEntry<V>>, key: K, value: V): void {
	cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

// --- ontology constants (resolved from core/base/dd_tipos.php) --------------
/** DEDALO_SUPERUSER — the root user id (fail-closed gates key on this). */
export const SUPERUSER_ID = -1;
const USERS_SECTION = 'dd128';
/** dd234 — the profiles section; a profile record HOLDS the dd774 grant matrix. */
export const PROFILES_SECTION = 'dd234';
/** dd774 — the component_security_access datum (misc column) on a profile record. */
export const SECURITY_ACCESS_COMPONENT = 'dd774';
const PROFILE_SELECT_COMPONENT = 'dd1725';
const GLOBAL_ADMIN_COMPONENT = 'dd244';
const DEVELOPER_COMPONENT = 'dd515';
const AREA_MAINTENANCE = 'dd88';
const TIME_MACHINE_SECTION = 'dd15';
const TOOLS_REGISTER_SECTION = 'dd1324';
const TEMP_PRESET_SECTION = 'dd655';
const INVERSE_RELATIONS_COMPONENT = 'dd1596';
/**
 * Sections whose list values are publicly readable when the matrix says 0.
 * Exported READ-ONLY for the permissions gate (test/parity/
 * permissions_differential.test.ts) so the zero-grant assertion can pin
 * "exactly 0 unless THIS fallback applies" instead of the vacuous >= 0.
 */
export const PUBLIC_LIST_TABLES: ReadonlySet<string> = new Set([
	'matrix_list',
	'matrix_dd',
	'matrix_notes',
]);

/** The request's authenticated identity. */
export interface Principal {
	userId: number;
	isGlobalAdmin: boolean;
	isDeveloper: boolean;
}

/** Read the first locator's target section_id from a user's relation component. */
async function readUserRelationTargetId(
	userId: number,
	componentTipo: string,
): Promise<number | null> {
	const rows = (await sql.unsafe(
		'SELECT relation->$2 AS items FROM matrix_users WHERE section_tipo = $1 AND section_id = $3 LIMIT 1',
		[USERS_SECTION, componentTipo, userId],
	)) as { items: { section_id?: string | number }[] | null }[];
	const first = rows[0]?.items?.[0];
	if (first === undefined || first.section_id === undefined) return null;
	return Number(first.section_id);
}

/**
 * Module cache of resolved principals, keyed by user_id (boot backlog #4:
 * resolvePrincipal ran 2 uncached PG queries on EVERY authenticated request
 * while its siblings in this file were TTL-cached). Data-derived from the
 * USER record (the dd244/dd515 flag locators) — a users-section write/
 * delete/restore drops it via the event channel, same contract as
 * userProjectsCache; the shared TTL is the missed-invalidation backstop.
 */
const principalCache = createDataCache<number, CacheEntry<Principal>>((cache, sectionTipo) => {
	if (sectionTipo === USERS_SECTION) cache.clear();
});

export function clearPrincipalCache(userId?: number): void {
	if (userId === undefined) principalCache.clear();
	else principalCache.delete(userId);
}

/**
 * Resolve a user's global-admin / developer flags (PHP is_global_admin /
 * is_developer): the flag component's first locator target section_id === 1
 * means "yes". Superuser is always global admin. Cached per user_id (the
 * returned object is FROZEN — principals are shared across requests).
 */
export async function resolvePrincipal(userId: number): Promise<Principal> {
	if (userId === SUPERUSER_ID) {
		return { userId, isGlobalAdmin: true, isDeveloper: true };
	}
	const cached = readFresh(principalCache, userId);
	if (cached !== undefined) return cached;
	const [adminTarget, developerTarget] = await Promise.all([
		readUserRelationTargetId(userId, GLOBAL_ADMIN_COMPONENT),
		readUserRelationTargetId(userId, DEVELOPER_COMPONENT),
	]);
	const principal: Principal = Object.freeze({
		userId,
		isGlobalAdmin: adminTarget === 1,
		isDeveloper: developerTarget === 1,
	});
	storeEntry(principalCache, userId, principal);
	return principal;
}

/**
 * user (dd128) → profile-select (dd1725) → profile record id in dd234 (PHP
 * security::get_user_profile). Exported for the grant writer
 * (security/section_permissions.ts), which must write to the SAME profile
 * record this resolves — the superuser (-1) included: it has a real dd128 row
 * carrying a dd1725 profile locator, and PHP has no superuser short-circuit
 * here, so a grant for -1 lands on that profile like any other user's.
 */
export async function resolveProfileId(userId: number): Promise<number | null> {
	return readUserRelationTargetId(userId, PROFILE_SELECT_COMPONENT);
}

/** The projects component in the users section (PHP DEDALO_FILTER_MASTER_TIPO). */
const FILTER_MASTER_COMPONENT = 'dd170';

/**
 * A user's authorized project section_ids (PHP
 * component_filter_master::get_user_projects) — the dd170 relation locators in
 * their user record, each pointing at a project (dd153). Empty array = no
 * projects (⇒ sees no project-gated records). Cached per user_id.
 */
// Data-derived (dd170 relation on the user record). The event-channel clear
// covers every chokepoint write — INCLUDING Time Machine restores through
// persistRecordColumns, which bypass the per-component
// invalidatePermissionsForWrite (S3-18); the TTL below remains only the
// missed-invalidation backstop.
const userProjectsCache = createDataCache<number, CacheEntry<number[]>>((cache, sectionTipo) => {
	if (sectionTipo === USERS_SECTION) cache.clear();
});

export function clearUserProjectsCache(userId?: number): void {
	if (userId === undefined) userProjectsCache.clear();
	else userProjectsCache.delete(userId);
}

export async function getUserProjects(userId: number): Promise<number[]> {
	const cached = readFresh(userProjectsCache, userId);
	if (cached !== undefined) return cached;
	const rows = (await sql.unsafe(
		'SELECT relation->$2 AS items FROM matrix_users WHERE section_tipo = $1 AND section_id = $3 LIMIT 1',
		[USERS_SECTION, FILTER_MASTER_COMPONENT, userId],
	)) as { items: { section_id?: string | number }[] | null }[];
	const projects = (rows[0]?.items ?? [])
		.map((locator) => Number(locator.section_id))
		.filter((id) => Number.isFinite(id));
	storeEntry(userProjectsCache, userId, projects);
	return projects;
}

/** One dd774 grant. */
interface SecurityAccessEntry {
	tipo: string;
	section_tipo: string;
	value: number;
}

/**
 * Module cache of the flat permissions map, keyed by user_id. Data-derived
 * from BOTH the user record (dd1725 profile assignment) and the profile
 * record (dd774 grants) — a write/delete/restore of either section drops it
 * via the event channel (S3-18; coarse clear, the reverse profile→users
 * mapping is not known here).
 */
const permissionsTableCache = createDataCache<number, CacheEntry<Map<string, number>>>(
	(cache, sectionTipo) => {
		if (sectionTipo === USERS_SECTION || sectionTipo === PROFILES_SECTION) cache.clear();
	},
);

/** Clear the cache (call after a profile's dd774 data or assignment changes). */
export function clearPermissionsCache(userId?: number): void {
	if (userId === undefined) permissionsTableCache.clear();
	else permissionsTableCache.delete(userId);
}

/**
 * Invalidate the security caches after a component WRITE, so a grant/assignment/
 * projects change takes effect on the next request instead of persisting for the
 * process lifetime. Called from the save chokepoint (saveComponentData) with the
 * written (section, component, record). Scope-precise where cheap, coarse where
 * the reverse mapping (profile → assigned users) is not known here.
 *
 * - dd774 on a PROFILE (dd234): a profile's grants changed ⇒ EVERY user on that
 *   profile has a stale table. We don't know which users map to it here, so clear
 *   the whole permissions cache (rare event; a cache rebuild, not a correctness risk).
 * - dd1725 on a USER (dd128): that user's profile assignment changed ⇒ their table.
 * - dd170 on a USER (dd128): that user's authorized projects changed.
 */
export function invalidatePermissionsForWrite(
	sectionTipo: string,
	componentTipo: string,
	sectionId: number,
): void {
	if (sectionTipo === PROFILES_SECTION && componentTipo === SECURITY_ACCESS_COMPONENT) {
		clearPermissionsCache();
		return;
	}
	if (sectionTipo === USERS_SECTION) {
		if (componentTipo === PROFILE_SELECT_COMPONENT) clearPermissionsCache(sectionId);
		if (componentTipo === FILTER_MASTER_COMPONENT) clearUserProjectsCache(sectionId);
		// A flag flip (global-admin dd244 / developer dd515) re-resolves the
		// principal on the next request (boot backlog #4 cache).
		if (componentTipo === GLOBAL_ADMIN_COMPONENT || componentTipo === DEVELOPER_COMPONENT) {
			clearPrincipalCache(sectionId);
		}
	}
}

/**
 * Invalidate the security caches after a whole USER or PROFILE record is
 * created/deleted (which can add or remove grants/assignments in ways not
 * captured by a per-component save). Coarse (clear-all) because the reverse
 * mapping is not known here; a no-op for any other section.
 */
export function invalidateSecurityCachesForSection(sectionTipo: string): void {
	if (sectionTipo === USERS_SECTION || sectionTipo === PROFILES_SECTION) {
		clearPermissionsCache();
		clearUserProjectsCache();
		clearPrincipalCache();
	}
}

/**
 * Build the flat "section_tipo_tipo" → level map for a user from their
 * profile's dd774 datum (PHP get_permissions_table). Empty map when the user
 * has no profile.
 */
async function getPermissionsTable(userId: number): Promise<Map<string, number>> {
	const cached = readFresh(permissionsTableCache, userId);
	if (cached !== undefined) return cached;

	const table = new Map<string, number>();
	const profileId = await resolveProfileId(userId);
	if (profileId !== null) {
		const profileTable = (await getMatrixTableFromTipo(PROFILES_SECTION)) ?? 'matrix_profiles';
		const rows = (await sql.unsafe(
			`SELECT misc->$2 AS grants FROM "${profileTable}" WHERE section_tipo = $1 AND section_id = $3 LIMIT 1`,
			[PROFILES_SECTION, SECURITY_ACCESS_COMPONENT, profileId],
		)) as { grants: SecurityAccessEntry[] | null }[];
		for (const entry of rows[0]?.grants ?? []) {
			table.set(`${entry.section_tipo}_${entry.tipo}`, entry.value);
		}
	}
	storeEntry(permissionsTableCache, userId, table);
	return table;
}

/**
 * The AREA tipos a user's profile authorizes (PHP
 * security::get_ar_authorized_areas_for_user): the SELF-KEYED entries of the
 * permissions table (`X_X`, tipo === section_tipo). PHP filters the menu by
 * PRESENCE of the entry, not its level — matched here.
 */
export async function getAuthorizedAreaTipos(userId: number): Promise<Set<string>> {
	const table = await getPermissionsTable(userId);
	const areas = new Set<string>();
	for (const key of table.keys()) {
		const separator = key.indexOf('_');
		if (separator === -1) continue;
		const sectionTipo = key.slice(0, separator);
		if (key.slice(separator + 1) === sectionTipo) areas.add(sectionTipo);
	}
	return areas;
}

/**
 * The self-keyed area permissions WITH their level (PHP
 * security::get_ar_authorized_areas_for_user): every `X_X` entry as
 * {tipo, value}. Callers that need the level (e.g. component_filter_records
 * get_datalist, which keeps only value >= 2 sections) use this; the
 * presence-only menu filter uses getAuthorizedAreaTipos above.
 */
export async function getAuthorizedAreasForUser(
	userId: number,
): Promise<{ tipo: string; value: number }[]> {
	const table = await getPermissionsTable(userId);
	const areas: { tipo: string; value: number }[] = [];
	for (const [key, value] of table.entries()) {
		const separator = key.indexOf('_');
		if (separator === -1) continue;
		const sectionTipo = key.slice(0, separator);
		if (key.slice(separator + 1) === sectionTipo) areas.push({ tipo: sectionTipo, value });
	}
	return areas;
}

/**
 * get_permissions(parentTipo, tipo) → 0-3 for a principal. Reproduces the PHP
 * decision order exactly (wrapper common::get_permissions + core
 * security::get_security_permissions), first match wins.
 */
export async function getPermissions(
	principal: Principal,
	parentTipo: string,
	tipo: string,
): Promise<number> {
	// Wrapper rule: time machine is admin-only (stricter than the core rule).
	if (parentTipo === TIME_MACHINE_SECTION) {
		return principal.isGlobalAdmin ? 1 : 0;
	}
	if (parentTipo === '' || tipo === '') return 0;

	// Core resolver order.
	if (principal.userId === SUPERUSER_ID) return 3;
	if (parentTipo === TOOLS_REGISTER_SECTION) return 1;
	if (parentTipo === TEMP_PRESET_SECTION) return 2;
	// Inverse-relations / 'all' read wildcard (the related "who-calls-me" path).
	// AUTHZ-05 guard: the wildcard grant requires a CONCRETE parent section tipo,
	// so getPermissions(_, 'all', 'all') can NEVER inherit a blanket level-1 grant
	// (a future read path that expanded 'all' into a cross-section scan would
	// otherwise be universally readable; the identifier gate also rejects 'all'
	// downstream — this is defense in depth). Real sections (^[a-z]+[0-9]+$) are
	// unaffected, so the legitimate related/inverse grant is byte-identical.
	if (
		(tipo === INVERSE_RELATIONS_COMPONENT || tipo === 'all') &&
		/^[a-z]+[0-9]+$/.test(parentTipo)
	) {
		return 1;
	}

	// Maintenance-area gate: BLOCKS non-admin/non-dev (does not grant; admins
	// fall through to the matrix).
	if (tipo === AREA_MAINTENANCE && !principal.isGlobalAdmin && !principal.isDeveloper) {
		return 0;
	}

	// component_alias (WC-020): ACL grants live on REAL components — an alias
	// is a view of its target with the target's exact rights (no privilege
	// change in either direction; without the hop a non-admin could never be
	// granted a config node and every alias would vanish from their reads).
	{
		const { resolveAliasTargetTipo } = await import('../ontology/alias.ts');
		const aliasTarget = await resolveAliasTargetTipo(tipo).catch(() => null);
		if (aliasTarget !== null) {
			return getPermissions(principal, parentTipo, aliasTarget);
		}
	}

	// Matrix lookup.
	const table = await getPermissionsTable(principal.userId);
	let level = table.get(`${parentTipo}_${tipo}`) ?? 0;

	// List/dd/notes fallback: publicly readable list values.
	if (level === 0 && (await getModelByTipo(parentTipo)) === 'section') {
		const matrixTable = await getMatrixTableFromTipo(parentTipo);
		if (matrixTable !== null && PUBLIC_LIST_TABLES.has(matrixTable)) {
			level = 1;
		}
	}
	return level;
}

/**
 * Per-component READ gate shared by the request_config builders and the read
 * emission path (PHP check_ddo_permissions, trait.request_config_ddo.php:381-92
 * + filter_authorized_related, trait.request_config_v5.php:574-86): a ddo
 * survives only when the actor's level on (sectionTipo, componentTipo) is ≥ 1.
 *
 * An UNDEFINED principal (no request scope: unit harnesses, background
 * warmups, internal datalist/order-path/save-config resolution) applies NO
 * filter — production requests always carry a seeded principal, and PHP's
 * not-logged-in→0 posture would empty those internal resolutions. The array
 * section form checks the FIRST target (PHP reset(), check_ddo_permissions:384).
 */
export async function ddoIsAuthorized(
	principal: Principal | undefined,
	sectionTipo: string | string[] | undefined,
	componentTipo: string,
): Promise<boolean> {
	if (principal === undefined || principal.isGlobalAdmin) return true;
	const checkSection = Array.isArray(sectionTipo) ? sectionTipo[0] : sectionTipo;
	if (checkSection === undefined || checkSection === '') return true;
	return (await getPermissions(principal, checkSection, componentTipo)) >= 1;
}

/**
 * SECTION-level permission for a principal — the analogue of PHP
 * section::get_section_permissions (class.section.php:1918). Equals
 * getPermissions(sectionTipo, sectionTipo) EXCEPT a consultation-only section
 * is capped at read (1, PHP :1929), so create/duplicate/delete are refused and
 * the client renders the section read-only. Even admins/superusers are capped
 * here (PHP caps after common::get_permissions, unconditionally).
 *
 * WHY A SEPARATE FUNCTION (not a cap inside getPermissions): getPermissions is a
 * faithful mirror of PHP common::get_permissions, which does NOT cap Activity —
 * the cap lives one layer up. Component-level gates and the differential parity
 * contract (permissions_differential.test.ts) depend on that fidelity, so the
 * consultation-only cap belongs ONLY on the section-level computation.
 */
export async function getSectionPermissions(
	principal: Principal,
	sectionTipo: string,
): Promise<number> {
	const level = await getPermissions(principal, sectionTipo, sectionTipo);
	if (level > 1 && isConsultationOnlySection(sectionTipo)) return 1;
	return level;
}
