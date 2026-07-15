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
 * get_value shape (PHP add_hierarchy::get_value parity): {hierarchies,
 * active_hierarchies (each {tld}), hierarchy_files_dir_path, hierarchy_typologies}.
 */

import { sql } from '../../db/postgres.ts';
import { offeredHierarchies, readHierarchyJson } from '../../install/hierarchy_meta.ts';
import { HIERARCHY_IMPORT_DIR } from '../../install/paths.ts';
import type { Principal } from '../../security/permissions.ts';
import type { WidgetModule, WidgetResponse } from './support.ts';

/**
 * The hierarchies already present in this install, as unique {tld} objects — the
 * client lowercases each .tld to mark already-installed rows in the picker
 * (render_add_hierarchy.js). ONE read of the tld literal (hierarchy6, string col)
 * across all hierarchy1 records. Fail-soft: a read error must not break the panel.
 */
async function activeHierarchies(): Promise<{ tld: string }[]> {
	try {
		const rows = (await sql.unsafe(
			`SELECT DISTINCT lower(trim(string->'hierarchy6'->0->>'value')) AS tld
			 FROM matrix_hierarchy_main
			 WHERE section_tipo = 'hierarchy1'
			   AND nullif(trim(string->'hierarchy6'->0->>'value'), '') IS NOT NULL`,
			[],
		)) as { tld: string | null }[];
		return rows.filter((row) => row.tld).map((row) => ({ tld: row.tld as string }));
	} catch (error) {
		console.error('add_hierarchy: active_hierarchies read failed:', error);
		return [];
	}
}

async function addHierarchyGetValue(): Promise<WidgetResponse> {
	return {
		result: {
			hierarchies: offeredHierarchies(),
			active_hierarchies: await activeHierarchies(),
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
async function addHierarchyInstall(
	options: Record<string, unknown>,
	principal: Principal,
): Promise<WidgetResponse> {
	const tlds = Array.isArray(options.hierarchies) ? options.hierarchies.map(String) : [];
	const { installHierarchies } = await import('../../install/hierarchy_import.ts');
	const r = await installHierarchies(tlds, undefined, principal.userId);
	return { result: r.result, msg: r.msg, errors: r.errors };
}

/**
 * DESTRUCTIVE reset: DELETE each selected tld's existing rows, then re-import from the
 * vendored seed and re-activate (installHierarchies with replace:true — the PHP behavior).
 * Discards any operator edits/additions to those hierarchies' terms; reached only through
 * the explicit, confirmed "Reset to seed" control. ENGINE_NATIVE in update_ownership_tripwire.
 */
async function addHierarchyReset(
	options: Record<string, unknown>,
	principal: Principal,
): Promise<WidgetResponse> {
	const tlds = Array.isArray(options.hierarchies) ? options.hierarchies.map(String) : [];
	const { installHierarchies } = await import('../../install/hierarchy_import.ts');
	const r = await installHierarchies(tlds, undefined, principal.userId, { replace: true });
	return { result: r.result, msg: r.msg, errors: r.errors };
}

export const widget: WidgetModule = {
	spec: {
		id: 'add_hierarchy',
		category: 'data',
		class: 'success width_100',
		label: { kind: 'label_concat', keys: ['instalar', 'jerarquias'] },
	},
	getValue: addHierarchyGetValue,
	apiActions: {
		install_hierarchies: addHierarchyInstall,
		reset_hierarchies: addHierarchyReset,
	},
};
