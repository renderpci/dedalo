/**
 * menu_skip_tipos widget — TS-NATIVE persistence: the grouping wrappers the
 * menu collapses (PHP menu_skip_tipos::prepare_list + save writes
 * config.local.php; this server persists to its own state store).
 */

import { MENU_ROOT_MODEL_ORDER } from '../../concepts/area.ts';
import { sql } from '../../db/postgres.ts';
import { getModelByTipo } from '../../ontology/resolver.ts';
import type { WidgetModule, WidgetResponse } from './support.ts';

/**
 * Top-level area tipos (PHP area::get_ar_root_area_tipos) — never skippable.
 *
 * COVERAGE-EXEMPT, this reader and the `menuSkipTiposGetValue` panel spread below
 * (coverage plan §5.1; reason registered in engineering/crap_coverage_exempt.json):
 * a single-predicate `dd_ontology` model lookup and its panel projection. The
 * DECISIONS — root-area rejection, dedup, invalid classification — are gated as
 * PURE functions over an INJECTED root list (`classifyMenuSkipTipos` /
 * `menuSkipTiposMessage`, test/unit/area_lockout_lists_native.test.ts). Asserting
 * the query results would pin installed ontology content.
 */
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
	const validTipos = new Set<string>();
	for (const tipo of new Set(raw.map(String))) {
		if ((await getModelByTipo(tipo)) !== null) validTipos.add(tipo);
	}
	const { tipos, invalid, removed } = classifyMenuSkipTipos(raw, rootTipos, (tipo) =>
		validTipos.has(tipo),
	);
	const { setServerState } = await import('../../resolve/server_state.ts');
	setServerState({ menu_skip_tipos: tipos });
	return {
		result: { tipos, invalid, removed },
		msg: menuSkipTiposMessage(removed, invalid),
		errors: [],
	};
}

/**
 * The PURE skip-list classifier — root list and tipo validity INJECTED (a gate
 * that queried dd_ontology would pin installed content, not the decision).
 *
 * The root arm is the deforming one: skipping a TOP-LEVEL area promotes ALL of
 * its children into the top menu bar, so a root-model tipo is diverted into
 * `removed` and never reaches the persisted list. String() before dedup, so
 * `12` and `'12'` are one tipo.
 */
export function classifyMenuSkipTipos(
	rawTipos: unknown[],
	rootTipos: string[],
	isValidTipo: (tipo: string) => boolean,
): { tipos: string[]; invalid: string[]; removed: string[] } {
	const invalid: string[] = [];
	const removed: string[] = [];
	const tipos: string[] = [];
	for (const tipo of [...new Set(rawTipos.map(String))]) {
		if (!isValidTipo(tipo)) {
			invalid.push(tipo);
			continue;
		}
		if (rootTipos.includes(tipo)) {
			removed.push(tipo);
			continue;
		}
		tipos.push(tipo);
	}
	return { tipos, invalid, removed };
}

/** The save envelope's operator feedback — the suffixes are the only signal
 * that a requested skip was refused. */
export function menuSkipTiposMessage(removed: string[], invalid: string[]): string {
	return `OK. Configuration saved. Changes apply on the next request${removed.length === 0 ? '' : '. Top-level areas cannot be skipped and were ignored.'}${invalid.length === 0 ? '' : '. Invalid tipos were ignored.'}`;
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
