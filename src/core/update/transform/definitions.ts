/**
 * move_* transform DEFINITION FILES (UPDATE_PROCESS Phase 5) — the operator
 * JSON declarations each move_* widget consumes (PHP
 * core/base/transform_definition_files/<widget>/*.json). On the TS side these
 * live under a TS-OWNED dir (config.ops.transformDefinitionsDir, default
 * <projectRoot>/install/transform_definition_files) — the PHP install's local
 * files are never read.
 *
 * Loading is path-confined exactly like the PHP SEC-069 realpath check: only
 * `*.json` directly under `<dir>/<widget>/`, never a traversal.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { config } from '../../../config/config.ts';

export type MoveWidgetId =
	| 'move_tld'
	| 'move_locator'
	| 'move_to_portal'
	| 'move_to_table'
	| 'move_lang';

/** move_tld / move_locator item: {old,new,type,perform,...}. */
export interface TipoMoveItem {
	old: string;
	new: string;
	type: 'section' | 'component';
	perform: string[];
	info?: string;
	add_data_to_new_section?: {
		fn: string;
		options: Record<string, unknown>;
	}[];
}

/** move_to_portal item: flat-copy components into a new section + portal link. */
export interface PortalizeItem {
	source_section: string;
	target_section: string;
	portal: string;
	components: { source_tipo: string; target_tipo: string; info?: string }[];
	info?: string;
}

/** move_to_table item: relocate a section's rows to another matrix table. */
export interface TableMoveItem {
	source_section: string;
	source_table: string;
	target_table: string;
	info?: string;
}

/** move_lang item: re-key component data across languages / to no-lang. */
export interface LangMoveItem {
	component_tipo: string;
	from_lang?: string;
	to_lang?: string;
	to_nolan?: boolean;
	info?: string;
}

export interface DefinitionFile {
	file_name: string;
	content: unknown;
}

/** The confined definitions dir for one widget, or null when unconfigured. */
export function definitionsDir(widget: MoveWidgetId): string | null {
	const base = config.ops.transformDefinitionsDir;
	if (base === undefined) return null;
	const dir = resolve(join(base, widget));
	// Confinement: the widget subdir must sit directly under the base.
	if (!dir.startsWith(resolve(base) + sep)) return null;
	return dir;
}

/** List a widget's definition files (PHP get_definitions_files). */
export function listDefinitionFiles(widget: MoveWidgetId): DefinitionFile[] {
	const dir = definitionsDir(widget);
	if (dir === null || !existsSync(dir)) return [];
	const files: DefinitionFile[] = [];
	for (const name of readdirSync(dir).sort()) {
		if (!name.endsWith('.json') || name.includes('/') || name.includes('..')) continue;
		try {
			files.push({ file_name: name, content: JSON.parse(readFileSync(join(dir, name), 'utf8')) });
		} catch {
			// unparsable definition files are skipped (PHP json_decode null)
		}
	}
	return files;
}

/** Load + parse one selected definition file, confined to the widget's dir. */
export function loadDefinitionFile(widget: MoveWidgetId, fileName: string): unknown | null {
	if (fileName.includes('/') || fileName.includes('..') || fileName.includes('\0')) return null;
	if (!fileName.endsWith('.json')) return null;
	const dir = definitionsDir(widget);
	if (dir === null) return null;
	const path = resolve(join(dir, fileName));
	if (!path.startsWith(dir + sep) || !existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, 'utf8'));
	} catch {
		return null;
	}
}
