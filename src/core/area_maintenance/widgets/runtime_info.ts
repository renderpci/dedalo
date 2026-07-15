/**
 * runtime_info widget — TS-NATIVE runtime panel: reports the RUNNING ENGINE's
 * runtime (Bun version, pid, memory, uptime), plus REAL cache/session clears.
 *
 * Merged from two PHP-oracle-era slots (2026-07-15, WC-030): `php_info` (a
 * phpinfo() iframe with no Bun equivalent — always engine_denied) and
 * `php_runtime` (already TS-native). Since neither had a working phpinfo()
 * twin on this engine, the surviving widget is the native one, carrying the
 * `runtime_info` id/label. opcache/realpath resets have no TS equivalent and
 * stay unregistered.
 */

import type { WidgetModule, WidgetResponse } from './support.ts';

/** The moment the server module loaded (uptime baseline). */
const RUNTIME_STARTED_AT = Date.now();

async function runtimeInfoGetValue(): Promise<WidgetResponse> {
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
async function runtimeInfoClearCaches(): Promise<WidgetResponse> {
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
async function runtimeInfoClearSessions(): Promise<WidgetResponse> {
	const { pruneExpiredSessions } = await import('../../security/session_store.ts');
	const pruned = pruneExpiredSessions();
	return {
		result: { pruned },
		msg: 'OK. Request done successfully',
		errors: [],
	};
}

export const widget: WidgetModule = {
	spec: {
		id: 'runtime_info',
		category: 'system',
		label: { kind: 'literal', text: 'RUNTIME INFO' },
	},
	apiActions: {
		clear_cache_files: runtimeInfoClearCaches,
		clear_session_files: runtimeInfoClearSessions,
	},
	getValue: runtimeInfoGetValue,
};
