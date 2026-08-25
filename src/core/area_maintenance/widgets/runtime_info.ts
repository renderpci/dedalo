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

/**
 * COVERAGE-EXEMPT (coverage plan §5.1; reason registered in
 * engineering/crap_coverage_exempt.json): a projection of process/Bun runtime
 * globals with NO branch. Any assertion would compare a runtime read against the
 * same runtime read.
 */
async function runtimeInfoGetValue(): Promise<WidgetResponse> {
	const memory = process.memoryUsage();
	return {
		data: {
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
	};
}

/**
 * clear_cache_files — flush the TS server's IN-MEMORY caches (the TS analog
 * of PHP's dd_cache file purge).
 *
 * Goes through the invalidation HUB (clearOntologyDerivedCaches), which fires
 * every clearer registered by cache_factory — not a hand-picked list. The
 * hand-picked version silently missed caches nobody remembered to add here: it
 * cleared ontology/labels.ts (dd_ontology TERM labels) and reported 'labels',
 * while the UI-label dictionaries of labels/catalog.ts survived, so an admin who
 * pressed this button after a label deploy still got the old strings back and
 * had nothing but a restart left to try. Keeping a second list of caches next to
 * the hub's is the bug — there is now one list, and it is the hub's.
 *
 * The tools caches are NOT ontology-derived (registry rows, tool config, loaded
 * modules), so they stay an explicit second call.
 */
/*
 * COVERAGE-EXEMPT, this function and runtimeInfoClearSessions below (coverage
 * plan §5.1; reason registered in engineering/crap_coverage_exempt.json): each
 * calls into the cache-invalidation hub / pruneExpiredSessions, whose registry
 * and expiry semantics are gated in the cache-factory and session-store suites.
 * Bun runs the WHOLE SUITE IN ONE PROCESS, so invoking either flushes
 * process-global caches or prunes the session store shared with every other test
 * in the run — a first-class order-dependent flake generator.
 */
async function runtimeInfoClearCaches(): Promise<WidgetResponse> {
	const { clearOntologyDerivedCaches } = await import('../../ontology/cache_invalidation.ts');
	await clearOntologyDerivedCaches();
	const { invalidateAllToolCaches } = await import('../../tools/cache.ts');
	invalidateAllToolCaches();
	return { data: { cleared: ['ontology_derived', 'tools'] } };
}

/**
 * clear_session_files — prune EXPIRED sessions from the TS session store.
 * COVERAGE-EXEMPT — see the reason on runtimeInfoClearCaches above (shared
 * entry in engineering/crap_coverage_exempt.json).
 */
async function runtimeInfoClearSessions(): Promise<WidgetResponse> {
	// sweepExpiredSessions, not pruneExpiredSessions: an expired session's MEDIA marker
	// must go with its row, or the web server keeps honouring a `dedalo_media_auth`
	// cookie whose session no longer exists. This is also the one place the ORPHAN sweep
	// runs — an operator action, holding the real session store, which is why it is not
	// done at boot (the update's smoke boot starts with an empty throwaway store and the
	// inherited MEDIA_PATH, so a boot reconcile would unlink every live editor's marker).
	const { sweepExpiredSessions } = await import('../../security/session_media.ts');
	const pruned = sweepExpiredSessions();
	return { data: { pruned } };
}

export const widget: WidgetModule = {
	spec: {
		id: 'runtime_info',
		category: 'system',
		// Deliberately NO `class` override (WC-030): this widget keeps php_runtime's plain
		// layout, not the frozen oracle's php_info iframe styling — the differential omits
		// `class` at this slot alongside id/label.
		label: { kind: 'literal', text: 'Runtime info' },
	},
	apiActions: {
		clear_cache_files: runtimeInfoClearCaches,
		clear_session_files: runtimeInfoClearSessions,
	},
	getValue: runtimeInfoGetValue,
};
