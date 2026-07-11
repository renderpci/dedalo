/**
 * php_runtime widget — TS-NATIVE runtime panel: this panel slot reports the
 * RUNNING ENGINE's runtime (Bun version, pid, memory, uptime) instead of the
 * PHP interpreter the widget id names, plus REAL cache/session clears.
 * opcache/realpath resets have no TS equivalent and stay unregistered.
 */

import type { WidgetModule, WidgetResponse } from './support.ts';

/** The moment the server module loaded (uptime baseline). */
const RUNTIME_STARTED_AT = Date.now();

async function phpRuntimeGetValue(): Promise<WidgetResponse> {
	const memory = process.memoryUsage();
	return {
		result: {
			info: {
				engine: 'bun',
				version: Bun.version,
				pid: process.pid,
				platform: process.platform,
				memory_rss: memory.rss,
				memory_heap_used: memory.heapUsed,
				uptime_seconds: Math.round((Date.now() - RUNTIME_STARTED_AT) / 1000),
			},
			environment: process.env.NODE_ENV ?? 'production',
		},
		msg: 'OK. Request done successfully',
		errors: [],
	};
}

/**
 * clear_cache_files — flush the TS server's IN-MEMORY caches (the TS analog
 * of PHP's dd_cache file purge): ontology nodes/models, tools registry and
 * the datalist cache.
 */
async function phpRuntimeClearCaches(): Promise<WidgetResponse> {
	const cleared: string[] = [];
	const { clearOntologyCaches } = await import('../../ontology/resolver.ts');
	clearOntologyCaches();
	cleared.push('ontology');
	const { invalidateAllToolCaches } = await import('../../tools/cache.ts');
	invalidateAllToolCaches();
	cleared.push('tools');
	const { clearDatalistCache } = await import('../../relations/datalist.ts');
	clearDatalistCache();
	cleared.push('datalist');
	// Area/structure caches: ontology-derived, request-invariant, but stale after
	// an ontology import (engineering/AREA_SPEC.md §1 cache hygiene).
	const { clearChildrenTipoCache } = await import('../../area/tree.ts');
	clearChildrenTipoCache();
	const { clearLabelCache } = await import('../../ontology/labels.ts');
	clearLabelCache();
	const { clearStructureContextCache } = await import('../../resolve/structure_context.ts');
	clearStructureContextCache();
	cleared.push('area_tree', 'labels', 'structure_context');
	return {
		result: { cleared },
		msg: 'OK. Request done successfully',
		errors: [],
	};
}

/** clear_session_files — prune EXPIRED sessions from the TS session store. */
async function phpRuntimeClearSessions(): Promise<WidgetResponse> {
	const { pruneExpiredSessions } = await import('../../security/session_store.ts');
	const pruned = pruneExpiredSessions();
	return {
		result: { pruned },
		msg: 'OK. Request done successfully',
		errors: [],
	};
}

export const widget: WidgetModule = {
	spec: { id: 'php_runtime', category: 'system', label: { kind: 'literal', text: 'PHP RUNTIME' } },
	apiActions: {
		clear_cache_files: phpRuntimeClearCaches,
		clear_session_files: phpRuntimeClearSessions,
	},
	getValue: phpRuntimeGetValue,
};
