/**
 * singleton.ts — the process-global, frozen config accessor.
 *
 * `config()` lazy-initializes once from `process.env` on first call and returns
 * the same frozen Config thereafter. The config object is IMMUTABLE after load
 * (deep-frozen), so sharing one instance across requests is safe — there is no
 * mutable per-request state here (that lives in @dedalo/runtime). The only mutable
 * module state is the memoized reference itself, which is read-only config; tests
 * can swap or clear it via `setConfigForTesting` / `resetConfig`.
 */

import { loadConfig } from './load.ts';
import type { RawEnv } from './env.ts';
import type { Config } from './schema.ts';

let instance: Config | undefined;

/**
 * Return the process-global config, loading it from `process.env` on first call.
 * Subsequent calls return the cached frozen instance.
 */
export function config(): Config {
	if (instance === undefined) {
		instance = loadConfig(process.env as RawEnv);
	}
	return instance;
}

/** True once `config()` (or `setConfigForTesting`) has initialized the singleton. */
export function isConfigLoaded(): boolean {
	return instance !== undefined;
}

/**
 * Test seam: install a specific Config (already built via `loadConfig`) as the
 * process-global, bypassing process.env. Use in tests/fixtures only.
 */
export function setConfigForTesting(cfg: Config): void {
	instance = cfg;
}

/** Test seam: clear the memoized singleton so the next `config()` re-loads. */
export function resetConfig(): void {
	instance = undefined;
}
