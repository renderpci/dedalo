/**
 * GEOIP — boot orchestration: ensure the country database is present, fresh,
 * and loaded into the in-memory reader.
 *
 * Called fire-and-forget from server boot (src/server.ts, inside the
 * !installMode block). NON-FATAL by construction — a failed/slow/absent
 * download never blocks boot and never throws; resolution simply degrades to
 * "IP shown, no country flag" (S1-15 posture). No runtime third-party
 * dependency: the browser never calls out, and after the one-time server-side
 * download the lookups are local and offline.
 *
 * COVERAGE POSTURE (rewrite/CRAP_COVERAGE_PLAN.md §3.15): the enabled /
 * auto-update / freshness policy lives in the pure `decideGeoipAction`, gated by
 * test/unit/geoip_ensure_native.test.ts. The `ensureGeoipDb` shell around it
 * (config read, statSync, the awaited download, the loadReader try/catch, logs)
 * is EXEMPT — `config.geoip` is Object.frozen, so a shell test could only assert
 * its own mock. Known residue, stated not hidden: the `await downloadCountryDb`
 * at the download step has no try/catch; it is safe only because that function
 * is documented never to throw.
 */

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../../config/config.ts';
import { DB_BASENAME, downloadCountryDb } from './download.ts';
import { loadReader } from './reader.ts';

/** Refresh the database when the cached file is older than this (DB-IP publishes monthly). */
const REFRESH_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/** What the boot task should do with the cached database. */
export interface GeoipAction {
	/** Attempt a download now. */
	download: boolean;
	/** Attempt to load the reader afterwards. */
	load: boolean;
	/** Cache state that drove the decision. */
	present: boolean;
	stale: boolean;
	reason: 'disabled' | 'absent' | 'stale' | 'fresh';
}

/**
 * Freshness/auto-update policy (pure). `mtimeMs === null` means the cached file
 * could not be stat'ed — treated as stale. Staleness is STRICT (`>`): an age
 * exactly equal to the refresh window is still fresh.
 */
export function decideGeoipAction(input: {
	enabled: boolean;
	autoUpdate: boolean;
	present: boolean;
	mtimeMs: number | null;
	now: number;
	refreshAfterMs?: number;
}): GeoipAction {
	if (!input.enabled) {
		return {
			download: false,
			load: false,
			present: input.present,
			stale: false,
			reason: 'disabled',
		};
	}
	const refreshAfterMs = input.refreshAfterMs ?? REFRESH_AFTER_MS;
	const stale = input.present
		? input.mtimeMs === null || input.now - input.mtimeMs > refreshAfterMs
		: false;
	return {
		download: input.autoUpdate && (!input.present || stale),
		load: true,
		present: input.present,
		stale,
		reason: !input.present ? 'absent' : stale ? 'stale' : 'fresh',
	};
}

/**
 * Ensure the country database is downloaded (if auto-update is on and the cache
 * is absent or stale) and loaded. Safe to await; never throws.
 */
/*
 * COVERAGE-EXEMPT (coverage plan §5.2; reason registered in
 * engineering/crap_coverage_exempt.json): it downloads the GeoIP database from a
 * third-party provider. Never fetch in a test; inject at the boundary if the
 * surrounding logic is ever needed.
 */
export async function ensureGeoipDb(): Promise<void> {
	const dir = config.geoip.dir;
	const dbPath = join(dir, DB_BASENAME);

	const present = existsSync(dbPath);
	let mtimeMs: number | null = null;
	if (present) {
		try {
			mtimeMs = statSync(dbPath).mtimeMs;
		} catch {
			mtimeMs = null;
		}
	}

	const action = decideGeoipAction({
		enabled: config.geoip.enabled,
		autoUpdate: config.geoip.autoUpdate,
		present,
		mtimeMs,
		now: Date.now(),
	});

	if (!action.load) {
		console.log('[geoip] disabled (DEDALO_GEOIP_ENABLED=false) — IP country resolution off');
		return;
	}

	if (action.download) {
		console.log(
			`[geoip] ${present ? 'refreshing stale' : 'downloading'} IP-to-Country database (DB-IP Country Lite, CC-BY-4.0)…`,
		);
		const result = await downloadCountryDb(dir, config.geoip.dbUrl);
		if (result.ok) {
			console.log('[geoip] IP-to-Country database ready');
		} else {
			// Keep any pre-existing (stale) copy usable; only warn.
			console.warn(`[geoip] database download failed: ${result.error}`);
		}
	}

	if (existsSync(dbPath)) {
		try {
			loadReader(dbPath);
			console.log('[geoip] country reader loaded');
		} catch (error) {
			console.warn(`[geoip] failed to load database: ${(error as Error).message}`);
		}
	} else {
		console.warn('[geoip] no database available — IP addresses shown without country flag');
	}
}
