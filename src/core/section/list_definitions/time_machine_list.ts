/**
 * time_machine_list (SECTION_SPEC §7.4) — the inspector time-machine ACCESS
 * permission target. It has NO rendering resolver: it is a permission-flag node
 * whose grant governs whether the record-history (time machine) list is
 * accessible in the INSPECTOR — explicitly distinct from tool_time_machine
 * access (granted through the tools-profile system).
 *
 * PHP reference: the node participates in the component_security_access
 * permission tree (component_security_access.php:502,:885). The user's
 * permission level on the section's time_machine_list tipo governs access.
 *
 * SCOPE: TS has no component_security_access editor yet (LEDGERED), but the
 * runtime enforcement — gate the inspector TM read on the caller's permission
 * for the time_machine_list tipo — is implemented here and wired into the TM
 * read path. section_list is EXCLUDED from the permission tree (PHP :543);
 * time_machine_list and relation_list are INCLUDED (PHP :502).
 */

import { type Principal, getPermissions } from '../../security/permissions.ts';
import { findSectionChildByModel } from './node_find.ts';

/** A section's time_machine_list child tipo (virtual-aware), or null. */
export async function getTimeMachineListTipo(sectionTipo: string): Promise<string | null> {
	const node = await findSectionChildByModel(sectionTipo, 'time_machine_list');
	return node?.tipo ?? null;
}

/**
 * Whether `principal` may access the inspector time machine of `sectionTipo`
 * (PHP: the grant on the time_machine_list tipo, >= 1 = read the history).
 * When the section declares no time_machine_list node the target is absent, so
 * access falls back to global-admin only (fail-closed — a non-admin cannot see
 * record history the ontology never granted).
 */
export async function canAccessTimeMachineList(
	principal: Principal,
	sectionTipo: string,
): Promise<boolean> {
	if (principal.isGlobalAdmin) return true;
	const tipo = await getTimeMachineListTipo(sectionTipo);
	if (tipo === null) return false;
	const level = await getPermissions(principal, sectionTipo, tipo);
	return level >= 1;
}
