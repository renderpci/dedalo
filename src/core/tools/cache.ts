/**
 * Tool cache invalidation — THE single entry point (PHP
 * tools_register::invalidate_all_tool_caches / clean_cache).
 *
 * Every write path that changes the tools registry (dd1324), install config
 * (dd996) or a user's tool profile (dd234) must call invalidateAllToolCaches()
 * so the in-process reader caches do not serve stale data.
 *
 * Single-writer semantics (2026-07-11 cutover, PHP engine retired): this TS
 * engine is the ONLY writer of those sections, so this programmatic
 * invalidation is complete — no TTL, no restart-after-external-write rule.
 * (The coexistence-era S2-09/DEC-20 restart rule and registry TTL are
 * deleted; rewrite/COEXISTENCE.md history.)
 */

import { resetConfigCache } from './config.ts';
import { resetLoadedTools } from './loader.ts';
import { resetPathsCache } from './paths.ts';
import { resetRegistryCache } from './registry.ts';

/** Clear every tools in-process cache. Call after any dd1324/dd996/dd234 write. */
export function invalidateAllToolCaches(): void {
	resetRegistryCache();
	resetConfigCache();
	resetPathsCache();
	resetLoadedTools();
}
