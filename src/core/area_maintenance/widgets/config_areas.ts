/**
 * config_areas widget — TS-NATIVE persistence (the runtime deny/allow lists
 * live in the TS server's own state store; the PHP widget writes
 * config.local.php, which this server must not touch) behind the
 * byte-identical client contract: the `areas` catalog is the UNfiltered walk
 * (PHP area::get_all_areas — denied nodes INCLUDED, or the widget's own
 * chips/search lose them).
 */

import { sql } from '../../db/postgres.ts';
import { getModelByTipo } from '../../ontology/resolver.ts';
import type { WidgetModule, WidgetResponse } from './support.ts';

/** Root/admin/maintenance area tipos that may never be denied (anti-lockout). */
async function getGuardedAreaTipos(): Promise<string[]> {
	const rows = (await sql.unsafe(
		`SELECT tipo FROM dd_ontology WHERE model IN ('area_root', 'area_maintenance', 'area_admin')`,
		[],
	)) as { tipo: string }[];
	return rows.map((row) => row.tipo);
}

/** PHP config_areas::prepare_lists — validate, strip guarded, dedup. */
async function prepareAreaLists(
	areasDeny: unknown[],
	areasAllow: unknown[],
): Promise<{
	areas_deny: string[];
	areas_allow: string[];
	invalid: string[];
	removed_guarded: string[];
}> {
	const guarded = await getGuardedAreaTipos();
	const out = {
		areas_deny: [] as string[],
		areas_allow: [] as string[],
		invalid: [] as string[],
		removed_guarded: [] as string[],
	};
	const validTipo = async (tipo: string): Promise<boolean> => (await getModelByTipo(tipo)) !== null;
	for (const raw of [...new Set(areasDeny.map(String))]) {
		if (!(await validTipo(raw))) {
			out.invalid.push(raw);
			continue;
		}
		if (guarded.includes(raw)) {
			out.removed_guarded.push(raw);
			continue;
		}
		out.areas_deny.push(raw);
	}
	for (const raw of [...new Set(areasAllow.map(String))]) {
		if (!(await validTipo(raw))) {
			out.invalid.push(raw);
			continue;
		}
		out.areas_allow.push(raw);
	}
	return out;
}

async function configAreasGetValue(): Promise<WidgetResponse> {
	try {
		const { getAllAreas } = await import('../../api/handlers/menu.ts');
		const { getEffectiveAreasDeny, getEffectiveAreasAllow, isStateWritable } = await import(
			'../../resolve/server_state.ts'
		);
		const { config } = await import('../../../config/config.ts');
		return {
			result: {
				areas: await getAllAreas(),
				areas_deny: getEffectiveAreasDeny(config.menu.areasDeny),
				areas_allow: getEffectiveAreasAllow(),
				writable: isStateWritable(),
			},
			msg: 'OK. Request done successfully',
			errors: [],
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			result: false,
			msg: `Error building config_areas value: ${message}`,
			errors: [message],
		};
	}
}

async function configAreasSave(options: Record<string, unknown>): Promise<WidgetResponse> {
	const prepared = await prepareAreaLists(
		Array.isArray(options.areas_deny) ? options.areas_deny : [],
		Array.isArray(options.areas_allow) ? options.areas_allow : [],
	);
	const { setServerState } = await import('../../resolve/server_state.ts');
	setServerState({ areas_deny: prepared.areas_deny, areas_allow: prepared.areas_allow });
	return {
		result: prepared,
		msg: `OK. Configuration saved. Changes apply on the next request${
			prepared.removed_guarded.length === 0
				? ''
				: '. Protected areas cannot be denied and were kept enabled.'
		}${prepared.invalid.length === 0 ? '' : '. Invalid tipos were ignored.'}`,
		errors: [],
	};
}

export const widget: WidgetModule = {
	spec: {
		id: 'config_areas',
		category: 'config',
		label: {
			kind: 'label_mark_fallback',
			key: 'config_areas',
			literal: 'Config areas (allow/deny)',
		},
	},
	apiActions: {
		save_config_areas: configAreasSave,
	},
	getValue: configAreasGetValue,
};
