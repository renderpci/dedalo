/**
 * add_hierarchy widget — import additional thesaurus/hierarchy packages into a
 * RUNNING install, the same operation the install wizard's hierarchy step
 * performs (render_hierarchies_import_block, shared with the installer client).
 *
 * Post-cutover (2026-07-11) the TS engine is the single engine and OWNS the
 * install tree (install/import/hierarchy). So the widget serves the real
 * offered list (get_value) and executes the import natively (apiActions.
 * install_hierarchies) — the same code paths install/context.ts and
 * install/engine.ts drive during the wizard. The wizard's own EXECUTE route
 * (dd_utils_api:install) is install-window-gated and 404s once sealed, so a
 * configured server MUST reach the importer through this widget action.
 *
 * get_value shape: {hierarchies, installed_hierarchies (each {tld}),
 * hierarchy_files_dir_path, hierarchy_typologies}.
 */

import { sql } from '../../db/postgres.ts';
import { offeredHierarchies, readHierarchyJson } from '../../install/hierarchy_meta.ts';
import { HIERARCHY_IMPORT_DIR } from '../../install/paths.ts';
import type { Principal } from '../../security/permissions.ts';
import type { WidgetModule, WidgetResponse } from './support.ts';

/**
 * The importer SEAM (test injection only; production always takes the default).
 *
 * The install and the reset handler differ by EXACTLY one thing — the options
 * object they construct — so that argument IS the behaviour: swap them and the
 * non-destructive "Install" button silently DELETEs and re-seeds an already
 * installed thesaurus, discarding operator edits irreversibly. Injecting the
 * importer lets a gate pin which handler carries `{replace:true}` without ever
 * running the destructive import.
 */
export type HierarchiesImporter =
	typeof import('../../install/hierarchy_import.ts').installHierarchies;

async function realImporter(): Promise<HierarchiesImporter> {
	const { installHierarchies } = await import('../../install/hierarchy_import.ts');
	return installHierarchies;
}

/**
 * The tld of a hierarchy TERM section tipo, or null when the tipo is not one.
 *
 * The anchoring is the whole point: a term section is `<tld>1` EXACTLY —
 * `hierarchy1` → `hierarchy`, but `hierarchy125`, `test3` and `dd1758` are
 * not term sections at all. Loosen the trailing `$` (or the leading `^`) and
 * the installed set re-inflates the way the registry read once did — ~269
 * hierarchies marked installed when ~14 were — and the panel again offers to
 * skip imports that never happened.
 *
 * Pure on purpose: this used to be a `substring(… from …)` + `~` pair inside
 * the SQL, i.e. two copies of one predicate that no gate could reach.
 */
export function installedTldFromSectionTipo(sectionTipo: string): string | null {
	const match = /^([a-z]+)1$/.exec(sectionTipo);
	return match === null ? null : (match[1] as string);
}

/**
 * The hierarchies actually INSTALLED, as unique {tld} objects — a tld is installed
 * when its `<tld>1` term section has rows in matrix_hierarchy. This is the SAME signal
 * the importer keys on (hierarchy_import.ts hierarchyRowsPresent), so the client marker
 * agrees with skip/reset behaviour.
 *
 * (Earlier this read the hierarchy1 REGISTRY instead — but a seed declares a registry
 * record for ~every country whether its terms were imported or not, so it marked all
 * ~269 declared hierarchies "installed" when only ~14 actually were.) Fail-soft: a read
 * error must not break the panel.
 */
async function installedHierarchies(): Promise<{ tld: string }[]> {
	try {
		const rows = (await sql.unsafe(`SELECT DISTINCT section_tipo FROM matrix_hierarchy`, [])) as {
			section_tipo: string | null;
		}[];
		const tlds: { tld: string }[] = [];
		for (const row of rows) {
			const tld = installedTldFromSectionTipo(String(row.section_tipo ?? ''));
			if (tld !== null) tlds.push({ tld });
		}
		return tlds;
	} catch (error) {
		console.error('add_hierarchy: installed_hierarchies read failed:', error);
		return [];
	}
}

async function addHierarchyGetValue(): Promise<WidgetResponse> {
	return {
		result: {
			hierarchies: offeredHierarchies(),
			installed_hierarchies: await installedHierarchies(),
			hierarchy_typologies: readHierarchyJson('hierarchies_typologies.json', []),
			hierarchy_files_dir_path: HIERARCHY_IMPORT_DIR,
		},
		msg: 'OK. Request done successfully',
		errors: [],
	};
}

/**
 * Import + activate the selected TLDs (installHierarchies: vendored `.copy.gz`
 * → matrix_hierarchy → consolidate counter → activate). Native to the engine:
 * the writes land in the CONFIGURED database through the runtime connection,
 * audited to the acting admin. An already-installed tld is SKIPPED (the import is
 * additive; `replace` stays false). ENGINE_NATIVE in update_ownership_tripwire.
 */
export async function addHierarchyInstall(
	options: Record<string, unknown>,
	principal: Principal,
	importer?: HierarchiesImporter,
): Promise<WidgetResponse> {
	const tlds = Array.isArray(options.hierarchies) ? options.hierarchies.map(String) : [];
	const installHierarchies = importer ?? (await realImporter());
	// NO fourth argument on purpose: `replace` stays false, i.e. additive.
	const r = await installHierarchies(tlds, undefined, principal.userId);
	return { result: r.result, msg: r.msg, errors: r.errors };
}

/**
 * DESTRUCTIVE reset: DELETE each selected tld's existing rows, then re-import from the
 * vendored seed and re-activate (installHierarchies with replace:true — the PHP behavior).
 * Discards any operator edits/additions to those hierarchies' terms; reached only through
 * the explicit, confirmed "Reset to seed" control. ENGINE_NATIVE in update_ownership_tripwire.
 */
export async function addHierarchyReset(
	options: Record<string, unknown>,
	principal: Principal,
	importer?: HierarchiesImporter,
): Promise<WidgetResponse> {
	const tlds = Array.isArray(options.hierarchies) ? options.hierarchies.map(String) : [];
	const installHierarchies = importer ?? (await realImporter());
	const r = await installHierarchies(tlds, undefined, principal.userId, { replace: true });
	return { result: r.result, msg: r.msg, errors: r.errors };
}

export const widget: WidgetModule = {
	spec: {
		id: 'add_hierarchy',
		category: 'data',
		class: 'success width_100',
		label: { kind: 'label_concat', keys: ['install', 'hierarchies'] },
	},
	getValue: addHierarchyGetValue,
	apiActions: {
		install_hierarchies: addHierarchyInstall,
		reset_hierarchies: addHierarchyReset,
	},
};
