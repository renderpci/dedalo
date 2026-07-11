/**
 * component_info widget FOUNDATION — the shared contract + helpers every
 * info widget builds on (PHP core/widgets/widget_common/class.widget_common.php).
 *
 * A widget is a discipline-owned compute unit (organized by TLD exactly like
 * the PHP tree and the byte-identical client: numisdata/, oh/, dd/, dmm/,
 * mdcat/, calculation, state, test/). The ontology declares them per
 * component_info instance as properties.widgets[] = {widget_name, path, ipo};
 * dispatch is by widget_name through widgets/registry.ts — NEVER by loading
 * code from the ontology-authored path (the TS answer to PHP's
 * include-by-path; `path` is kept as verification data for the client-tree
 * tripwire).
 */

import { readMatrixRecord } from '../../../db/matrix.ts';
import { getMatrixTableFromTipo, getModelByTipo } from '../../../ontology/resolver.ts';

/** One emitted widget data item (shape is widget-specific; keys ordered as PHP inserts them). */
export type WidgetItem = Record<string, unknown>;

/** One ontology-declared widget slot on a component_info instance. */
export interface WidgetDef {
	widget_name?: string;
	path?: string;
	ipo?: unknown[];
}

export interface WidgetContext {
	sectionTipo: string;
	sectionId: number | string;
	mode: string;
	lang: string;
	/** Session user for user-scoped tool availability; null/undefined → superuser set. */
	userId?: number | null;
	/** Global-admin flag of that user (admins resolve the superuser tool set, PHP parity). */
	isAdmin?: boolean;
}

/**
 * WC-026: normalize the widget entries' matching keys at the EMIT boundary —
 * every top-level widget item carries BOTH `id` and `widget_id` when either
 * is a string. The client widget renders match on `widget_id`
 * (render_get_archive_weights/calculation/state/…); the grid/export builders
 * match on `id`; PHP emits ONE of them per widget class (weights/state live
 * = widget_id, calculation live = id) and the STORED misc values are
 * id-keyed — so stored archives and live calculations render BLANK on the
 * PHP client (verified live 2026-07-10). TS satisfies the client's contract
 * by emitting both. Top-level scalar keys only: media_icons row objects
 * (whose `id` key is a CELL object) and nested shapes are untouched; items
 * without a `widget` tag (the tags widget's leading raw text items) pass
 * through verbatim.
 */
export function normalizeWidgetEntryKeys(items: unknown[]): unknown[] {
	return items.map((entry) => {
		if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return entry;
		const item = entry as Record<string, unknown>;
		if (typeof item.widget !== 'string') return entry;
		if (typeof item.id === 'string' && !('widget_id' in item)) {
			return { ...item, widget_id: item.id };
		}
		if (typeof item.widget_id === 'string' && !('id' in item)) {
			return { ...item, id: item.widget_id };
		}
		return entry;
	});
}

/**
 * The registry contract of one widget implementation (PHP <widget> extends
 * widget_common). `name` is the ontology/client identity and the registry
 * key; `path` mirrors the ontology-authored value and locates the CLIENT
 * module (client/dedalo/core/widgets<path>/js/<name>.js) — verified by the
 * registry tripwire, never used for dispatch.
 */
export type InfoWidgetDescriptor =
	| {
			name: string;
			path: string;
			/** PHP is_async() — skipped by the read-time aggregate; delivered via get_widget_data. */
			isAsync?: true;
			computeData(ipo: unknown[], context: WidgetContext): Promise<WidgetItem[]>;
			/** PHP get_data_parsed override (grid/export/diffusion); absent → computeData. */
			computeDataParsed?(ipo: unknown[], context: WidgetContext): Promise<WidgetItem[]>;
			/** PHP get_data_list (edit-mode datalist; only the state widget implements it). */
			computeDataList?(ipo: unknown[], context: WidgetContext): Promise<WidgetItem[]>;
	  }
	| {
			name: string;
			path: string;
			isAsync?: true;
			/** Registered-but-unported: compute throws WidgetUnportedError (ledgered in rewrite/LEDGER.md). */
			unported: { reason: string };
	  };

/** A registered widget whose server compute is not ported yet (rewrite/LEDGER.md row required). */
export class WidgetUnportedError extends Error {
	constructor(name: string, reason: string) {
		super(`component_info widget '${name}' is not ported: ${reason}`);
		this.name = 'WidgetUnportedError';
	}
}

/** An ontology-declared widget_name with no registry entry (PHP fatals on the include). */
export class WidgetNotRegisteredError extends Error {
	constructor(name: string) {
		super(`component_info widget '${name}' is not registered (widgets/registry.ts)`);
		this.name = 'WidgetNotRegisteredError';
	}
}

/**
 * PHP round(): half away from zero at the given precision (JS Math.round is
 * half-up, which differs for negatives; inputs here are non-negative but the
 * sign handling is kept for fidelity). toPrecision(15) absorbs the binary
 * representation drift PHP's pre-rounding also compensates for.
 */
export function phpRound(value: number, precision: number): number {
	const factor = 10 ** precision;
	const scaled = Number((Math.abs(value) * factor).toPrecision(15));
	return (Math.sign(value) || 1) * (Math.round(scaled) / factor);
}

/**
 * A component's data as PHP component_common::get_data() returns it — the
 * FULL stored item array, NO lang filtering (that is get_data_lang, which the
 * widget classes never call; test_info reads the first item of a translatable
 * source verbatim — verified against live PHP on test3/1's lg-eng-only data).
 */
export async function readWidgetComponentData(
	sectionTipo: string,
	sectionId: number | string,
	componentTipo: string,
): Promise<unknown[]> {
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) return [];
	const record = await readMatrixRecord(table, sectionTipo, Number(sectionId));
	if (record === null) return [];
	const model = await getModelByTipo(componentTipo);
	if (model === null) return [];
	const { readComponentItems } = await import('../../../resolve/component_data.ts');
	return readComponentItems(record, componentTipo, model) ?? [];
}

/** Resolve the 'current' sentinel on a source descriptor field. */
export function resolveCurrent(declared: unknown, own: string | number): string | number {
	return declared === undefined || declared === null || declared === 'current'
		? own
		: (declared as string | number);
}

export interface TypedInput {
	type?: string;
	section_tipo?: string;
	section_id?: string | number;
	component_tipo?: string;
}

/** array_reduce($input, …) keep-last-match — PHP scans the whole array. */
export function findTyped(input: unknown[], type: string): TypedInput | undefined {
	let found: TypedInput | undefined;
	for (const item of input) {
		if ((item as TypedInput)?.type === type) found = item as TypedInput;
	}
	return found;
}
