import type { Rqo, Source, Sqo } from '@dedalo/mcp-common';

/**
 * Loose source: extends the strict `Source` schema with arbitrary string
 * keys so action-specific extras (`process_id`, `widget_name`, ...) can
 * be passed without expanding the central type.
 */
export type LooseSource = Source & Record<string, unknown>;

/**
 * Options for the `rqo()` factory.
 */
export interface RqoOptions {
	/** Dédalo API action (e.g. `read`, `save`, `count`). */
	action: string;
	/** Target API class (default `dd_core_api`). */
	dd_api?: string;
	/** Optional source block (tipo/section_tipo/section_id/mode/lang/...). */
	source?: LooseSource;
	/** Optional Search Query Object for list/search actions. */
	sqo?: Sqo;
	/** Optional action-specific extras (e.g. `{ value: ... }`). */
	options?: Record<string, unknown>;
	/**
	 * Default `true` (safe for reads). Callers that trigger write paths
	 * where locking must happen should set `false`.
	 */
	prevent_lock?: boolean;
}

/**
 * RQO factory for work-API calls.
 *
 * Why: every tool handler builds the same envelope shape. Centralising it
 * keeps `prevent_lock` semantics explicit and removes boilerplate from
 * each tool.
 *
 * @param opts  Options object with action, dd_api, source, sqo, options, prevent_lock.
 */
export function rqo(opts: RqoOptions): Rqo {
	const r: Rqo = {
		action: opts.action,
		dd_api: opts.dd_api ?? 'dd_core_api',
		prevent_lock: opts.prevent_lock ?? true,
	};
	if (opts.source && Object.keys(opts.source).length > 0) r.source = opts.source as Source;
	if (opts.sqo) r.sqo = opts.sqo;
	if (opts.options && Object.keys(opts.options).length > 0) r.options = opts.options;
	return r;
}
