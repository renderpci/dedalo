/**
 * PROGRAMMATIC ACL GRANT — component_security_access::set_section_permissions
 * (PHP core/component_security_access/class.component_security_access.php:830).
 *
 * Grants a user's PROFILE a permission level over a list of section tipos AND
 * every element inside them, then invalidates the permissions cache so the new
 * access is enforced on the very next check.
 *
 * The only caller today is hierarchy provisioning (ontology/hierarchy_provision
 * .ts): a freshly generated hierarchy's virtual sections (<tld>1 descriptors,
 * <tld>2 models) are invisible to the very user who just created them until
 * their profile carries a grant — the sections exist, the ontology is correct,
 * and the menu shows nothing. PHP grants level 2 there; so do we.
 *
 * WHERE THE GRANT LANDS: on the PROFILE record (dd234/<profile_id>), never on
 * the user record — dd774 is the profile's grant matrix (permissions.ts
 * getPermissionsTable reads exactly this datum back). A user with no profile
 * cannot be granted anything; PHP returns false (non-fatal) and so do we.
 *
 * SHAPE (pinned against the live matrix_profiles.misc->'dd774'): one entry per
 * (tipo, section_tipo) pair — {id, tipo, section_tipo, value}. The `id` is the
 * per-component item counter id, stamped by the save chokepoint exactly like
 * PHP's set_data does (component_common::set_data :995 set_data_item_counter),
 * so we deliberately do NOT hand-roll it here.
 *
 * MERGE SEMANTICS (PHP :925-941): an entry already present for the same
 * (tipo, section_tipo) is UPDATED IN PLACE to the new level; only genuinely new
 * pairs are appended. Rerunning a grant is therefore idempotent and never
 * duplicates a row or resurrects a level the admin lowered elsewhere.
 *
 * WRITE PATH: the save chokepoint (saveComponentData, action 'set_data' — PHP
 * set_data + save), so the grant gets the Time Machine audit row, the modified
 * stamps and the cache invalidation every other component write gets.
 * invalidatePermissionsForWrite(dd234, dd774) fires there, which IS PHP's
 * security::reset_permissions_table.
 */

import { readMatrixRecord } from '../db/matrix.ts';
import { getMatrixTableFromTipo } from '../ontology/resolver.ts';
import { getGrantChildrenTipos, getSectionRealTipo } from '../resolve/security_access_datalist.ts';
import { saveComponentData } from '../section/record/save_component.ts';
import { PROFILES_SECTION, SECURITY_ACCESS_COMPONENT, resolveProfileId } from './permissions.ts';

/** The data lang of a non-translatable component (DEDALO_DATA_NOLAN). */
const DATA_NOLAN = 'lg-nolan';

/** One dd774 grant entry as stored in matrix_profiles.misc->'dd774'. */
interface SecurityAccessEntry {
	/** Item-counter id, stamped by the save chokepoint on entries that lack one. */
	id?: number;
	tipo: string;
	section_tipo: string;
	value: number;
}

export interface SetSectionPermissionsOptions {
	/** The section tipos to grant, e.g. ['es1', 'es2'] for a new hierarchy. */
	sectionTipos: string[];
	/** The user whose PROFILE receives the grant. */
	userId: number;
	/** Level to grant: 0 none, 1 read, 2 read/write, 3 admin (PHP default 2). */
	permissions?: number;
}

export interface SetSectionPermissionsResult {
	ok: boolean;
	/** Populated when ok is false — the caller decides whether that is fatal. */
	error?: string;
	/** Profile record (dd234) the grant was written to. */
	profileId?: number;
	/** Entries updated in place + entries appended (diagnostics; PHP dumps these). */
	updated?: number;
	added?: number;
}

/**
 * Grant `permissions` over each section in `sectionTipos` (and every element
 * inside it) to `userId`'s profile. Returns ok:false with an `error` instead of
 * throwing — PHP treats a failed grant as NON-FATAL (the sections are valid and
 * an admin can re-grant), and the hierarchy caller relies on that.
 */
export async function setSectionPermissions(
	options: SetSectionPermissionsOptions,
): Promise<SetSectionPermissionsResult> {
	const { sectionTipos, userId } = options;
	const permissions = Math.trunc(options.permissions ?? 2); // zero IS accepted (PHP :833)

	// PHP `if (empty($user_id))`: 0/null are refused, -1 (superuser) is NOT —
	// it has a real dd128 record and a real profile.
	if (!Number.isFinite(userId) || userId === 0) {
		return { ok: false, error: `Invalid user id '${userId}': unable to set section permissions` };
	}
	if (sectionTipos.length === 0) {
		return { ok: true, updated: 0, added: 0 }; // nothing asked for
	}

	// The grant matrix lives on the user's PROFILE record.
	const profileId = await resolveProfileId(userId);
	if (profileId === null) {
		return {
			ok: false,
			error: `Unable to get the security profile of user ${userId} (no ${PROFILES_SECTION} profile assigned)`,
		};
	}

	const profileTable = (await getMatrixTableFromTipo(PROFILES_SECTION)) ?? 'matrix_profiles';
	const profileRecord = await readMatrixRecord(profileTable, PROFILES_SECTION, profileId);
	if (profileRecord === null) {
		return {
			ok: false,
			error: `Security profile record not found: ${PROFILES_SECTION}/${profileId}`,
		};
	}
	const misc = (profileRecord.columns.misc as Record<string, unknown[]> | null) ?? {};
	// The CURRENT grants — copied entry by entry, because we mutate levels in
	// place below and the record object must not be aliased into the write.
	const currentEntries: SecurityAccessEntry[] = (
		(misc[SECURITY_ACCESS_COMPONENT] as SecurityAccessEntry[] | undefined) ?? []
	).map((entry) => ({ ...entry }));

	// Build the (tipo, section_tipo) pairs this grant covers: the section
	// itself, then every element inside it (PHP's values_list generator :845).
	const wanted: SecurityAccessEntry[] = [];
	for (const sectionTipo of sectionTipos) {
		wanted.push({ tipo: sectionTipo, section_tipo: sectionTipo, value: permissions });

		// Elements are read from the REAL section (a virtual alias would
		// otherwise duplicate the child list), but each grant is KEYED BY THE
		// SECTION AS ADDRESSED — es1/es2, not the real source section (PHP :864).
		const realSectionTipo = await getSectionRealTipo(sectionTipo);
		for (const childTipo of await getGrantChildrenTipos(realSectionTipo)) {
			wanted.push({ tipo: childTipo, section_tipo: sectionTipo, value: permissions });
		}
	}

	// Merge: update an existing (tipo, section_tipo) in place, else append.
	const index = new Map<string, SecurityAccessEntry>();
	for (const entry of currentEntries) {
		index.set(`${entry.section_tipo}_${entry.tipo}`, entry);
	}
	let updated = 0;
	const appended: SecurityAccessEntry[] = [];
	const seen = new Set<string>(); // a pair yielded twice must not be appended twice
	for (const entry of wanted) {
		const key = `${entry.section_tipo}_${entry.tipo}`;
		const existing = index.get(key);
		if (existing !== undefined) {
			if (existing.value !== permissions) updated++;
			existing.value = permissions;
			continue;
		}
		if (seen.has(key)) continue;
		seen.add(key);
		appended.push(entry);
	}
	const newData = [...currentEntries, ...appended];

	// Persist through the save chokepoint (TM audit + modified stamps + the
	// permissions-cache invalidation that is PHP's reset_permissions_table).
	const saved = await saveComponentData({
		componentTipo: SECURITY_ACCESS_COMPONENT,
		sectionTipo: PROFILES_SECTION,
		sectionId: profileId,
		lang: DATA_NOLAN,
		changedData: [{ action: 'set_data', value: newData }],
		userId,
	});
	if (saved.ok !== true) {
		return { ok: false, error: `Saving the security grants failed: ${saved.message}`, profileId };
	}

	return { ok: true, profileId, updated, added: appended.length };
}
