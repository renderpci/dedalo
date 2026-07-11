/**
 * menu_skip_tipos widget — TS-NATIVE persistence: the grouping wrappers the
 * menu collapses (PHP menu_skip_tipos::prepare_list + save writes
 * config.local.php; this server persists to its own state store).
 */

import { MENU_ROOT_MODEL_ORDER } from '../../concepts/area.ts';
import { sql } from '../../db/postgres.ts';
import { getModelByTipo } from '../../ontology/resolver.ts';
import type { WidgetModule, WidgetResponse } from './support.ts';

/** Top-level area tipos (PHP area::get_ar_root_area_tipos) — never skippable. */
async function getRootAreaTipos(): Promise<string[]> {
	const placeholders = MENU_ROOT_MODEL_ORDER.map((_, index) => `$${index + 1}`).join(', ');
	const rows = (await sql.unsafe(`SELECT tipo FROM dd_ontology WHERE model IN (${placeholders})`, [
		...MENU_ROOT_MODEL_ORDER,
	])) as { tipo: string }[];
	return rows.map((row) => row.tipo);
}

async function menuSkipTiposGetValue(): Promise<WidgetResponse> {
	try {
		const { getAllAreas } = await import('../../api/handlers/menu.ts');
		const { getEffectiveMenuSkipTipos, isStateWritable } = await import(
			'../../resolve/server_state.ts'
		);
		const { config } = await import('../../../config/config.ts');
		return {
			result: {
				areas: await getAllAreas(),
				skip_tipos: getEffectiveMenuSkipTipos(config.menu.skipTipos),
				writable: isStateWritable(),
			},
			msg: 'OK. Request done successfully',
			errors: [],
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			result: false,
			msg: `Error building menu_skip_tipos value: ${message}`,
			errors: [message],
		};
	}
}

/**
 * save_menu_skip_tipos (PHP menu_skip_tipos::prepare_list + save): the client
 * sends `options.tipos` and reflects `result.tipos` back into its chips.
 * Top-level areas are rejected into `removed` — skipping one would promote ALL
 * of its children into the top menu bar and deform it.
 */
async function menuSkipTiposSave(options: Record<string, unknown>): Promise<WidgetResponse> {
	const raw = Array.isArray(options.tipos) ? options.tipos : [];
	const rootTipos = await getRootAreaTipos();
	const invalid: string[] = [];
	const removed: string[] = [];
	const tipos: string[] = [];
	for (const tipo of [...new Set(raw.map(String))]) {
		if ((await getModelByTipo(tipo)) === null) {
			invalid.push(tipo);
			continue;
		}
		if (rootTipos.includes(tipo)) {
			removed.push(tipo);
			continue;
		}
		tipos.push(tipo);
	}
	const { setServerState } = await import('../../resolve/server_state.ts');
	setServerState({ menu_skip_tipos: tipos });
	return {
		result: { tipos, invalid, removed },
		msg: `OK. Configuration saved. Changes apply on the next request${removed.length === 0 ? '' : '. Top-level areas cannot be skipped and were ignored.'}${invalid.length === 0 ? '' : '. Invalid tipos were ignored.'}`,
		errors: [],
	};
}

export const widget: WidgetModule = {
	spec: {
		id: 'menu_skip_tipos',
		category: 'config',
		label: {
			kind: 'label_mark_fallback',
			key: 'menu_skip_tipos',
			literal: 'Menu: skip grouping tipos',
		},
	},
	apiActions: {
		save_menu_skip_tipos: menuSkipTiposSave,
	},
	getValue: menuSkipTiposGetValue,
};
