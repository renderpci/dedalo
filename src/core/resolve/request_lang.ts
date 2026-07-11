/**
 * Request-scoped effective languages (PHP DEDALO_APPLICATION_LANG /
 * DEDALO_DATA_LANG, which PHP defines as per-request constants seeded from the
 * user's session at bootstrap).
 *
 * WHY THIS EXISTS (spec §4, plan risk A5.1): Bun is a long-lived process, so
 * the "current language" can NOT be a module-level value the way PHP's
 * per-request constants effectively were — that would bleed one user's language
 * choice into every concurrent request. Instead the effective languages live in
 * an AsyncLocalStorage scope opened once per RQO at the dispatch chokepoint
 * (dispatchRqo) from the caller's session. Leaf resolvers (label lookup, data
 * reads, page_globals) read them through the accessors below; outside any scope
 * (unit tests calling resolvers directly, background jobs) they fall back to the
 * installation defaults, so behavior is identical to before whenever no user
 * override is in effect.
 *
 * This is the same AsyncLocalStorage pattern already used for the transaction
 * handle in core/db/postgres.ts — the boring, consistent choice (§2b).
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { config } from '../../config/config.ts';

/** The two languages every request resolves against. */
export interface RequestLangs {
	/** Interface/label language (PHP DEDALO_APPLICATION_LANG). */
	readonly applicationLang: string;
	/** Component-data language (PHP DEDALO_DATA_LANG). */
	readonly dataLang: string;
}

const requestLangStore = new AsyncLocalStorage<RequestLangs>();

/** Run `fn` with the given effective languages in scope for its whole async tree. */
export function runWithRequestLangs<T>(langs: RequestLangs, fn: () => T): T {
	return requestLangStore.run(langs, fn);
}

/**
 * The effective interface/label language for the current request, or the
 * installation default when called outside a request scope.
 */
export function currentApplicationLang(): string {
	return requestLangStore.getStore()?.applicationLang ?? config.menu.applicationLang;
}

/**
 * The effective component-data language for the current request, or the
 * installation default when called outside a request scope.
 */
export function currentDataLang(): string {
	return requestLangStore.getStore()?.dataLang ?? config.menu.dataLang;
}
