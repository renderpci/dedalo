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
 */

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../../config/config.ts';
import { DB_BASENAME, downloadCountryDb } from './download.ts';
import { loadReader } from './reader.ts';

/** Refresh the database when the cached file is older than this (DB-IP publishes monthly). */
const REFRESH_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Ensure the country database is downloaded (if auto-update is on and the cache
 * is absent or stale) and loaded. Safe to await; never throws.
 */
export async function ensureGeoipDb(): Promise<void> {
	if (!config.geoip.enabled) {
		console.log('[geoip] disabled (DEDALO_GEOIP_ENABLED=false) — IP country resolution off');
		return;
	}

	const dir = config.geoip.dir;
	const dbPath = join(dir, DB_BASENAME);

	let present = existsSync(dbPath);
	let stale = false;
	if (present) {
		try {
			stale = Date.now() - statSync(dbPath).mtimeMs > REFRESH_AFTER_MS;
		} catch {
			stale = true;
		}
	}

	if (config.geoip.autoUpdate && (!present || stale)) {
		console.log(
			`[geoip] ${present ? 'refreshing stale' : 'downloading'} IP-to-Country database (DB-IP Country Lite, CC-BY-4.0)…`,
		);
		const result = await downloadCountryDb(dir, config.geoip.dbUrl);
		if (result.ok) {
			present = true;
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
