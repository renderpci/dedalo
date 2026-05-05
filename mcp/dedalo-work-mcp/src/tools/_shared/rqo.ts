import type { Rqo, Source, Sqo } from '@dedalo/mcp-common';

/**
 * Loose source: extends the strict `Source` schema with arbitrary string
 * keys so action-specific extras (`process_id`, `widget_name`, ...) can
 * be passed without expanding the central type.
 */
export type LooseSource = Source & Record<string, unknown>;

/**
 * RQO factory for work-API calls.
 *
 * Why: every tool handler builds the same envelope shape. Centralising it
 * keeps `prevent_lock` semantics explicit (default true for reads, callers
 * set false for writes when concurrent-edit locking matters) and removes
 * `(a as any)` boilerplate from each tool.
 *
 * @param action        Dédalo API action (e.g. `read`, `save`, `count`).
 * @param dd_api        Target API class (default `dd_core_api`).
 * @param source        Optional source block (tipo/section_tipo/section_id/mode/lang/...).
 * @param sqo           Optional Search Query Object for list/search actions.
 * @param options       Optional action-specific extras (e.g. `{ value: ... }`).
 * @param prevent_lock  Default `true` (safe for reads). Callers that trigger
 *                      write paths where locking must happen should pass `false`.
 */
export function rqo(
	action: string,
	dd_api = 'dd_core_api',
	source?: LooseSource,
	sqo?: Sqo,
	options?: Record<string, unknown>,
	prevent_lock = true
): Rqo {
	const r: Rqo = { action, dd_api, prevent_lock };
	if (source && Object.keys(source).length > 0) r.source = source as Source;
	if (sqo) r.sqo = sqo;
	if (options && Object.keys(options).length > 0) r.options = options;
	return r;
}
