/**
 * GEOIP — in-memory country database reader.
 *
 * Wraps a single mmdb-lib Reader over the DB-IP IP-to-Country Lite database
 * (GeoIP2-Country schema: `country.iso_code` is the ISO 3166-1 alpha-2 code).
 * The reader is a module-level singleton loaded ONCE (after ensure.ts downloads
 * the file at boot) and shared read-only across all requests — it derives from
 * a static file, holds no request identity (session / lang / principal), and is
 * therefore not a cache-factory resource (same rationale as the static-asset
 * gzip cache and the media spec cache). The `reader` binding is allowlisted in
 * test/unit/module_state_tripwire.test.ts (ALLOWLISTED_MODULE_LET).
 *
 * Every path degrades soft: reader unloaded, private/reserved IP, malformed
 * address, or a missing record all return null → the client shows the IP with
 * no country flag, never an error. There is no runtime third-party dependency.
 */

import { readFileSync } from 'node:fs';
import { Reader } from 'mmdb-lib';
import type { CountryResponse } from 'mmdb-lib';
import { isPrivateOrReserved } from './ip_ranges.ts';

/**
 * The loaded country database, or null until ensure.ts has downloaded and
 * loaded it (or if GeoIP is disabled / the download failed). Request-independent
 * boot-stable in-memory data — carries no session/lang/principal identity.
 */
let reader: Reader<CountryResponse> | null = null;

/** Load (or replace) the in-memory reader from an .mmdb file on disk. */
export function loadReader(mmdbPath: string): void {
	reader = new Reader<CountryResponse>(readFileSync(mmdbPath));
}

/** True once a database has been loaded. */
export function isReaderLoaded(): boolean {
	return reader !== null;
}

/** Drop the in-memory reader (used by tests to reset module state). */
export function unloadReader(): void {
	reader = null;
}

/**
 * Resolve an IP to its ISO 3166-1 alpha-2 country code, or null when the address
 * is private/reserved, the database is not loaded, the address is malformed, or
 * the database has no record for it.
 */
export function resolveCountry(ip: string): { country_code: string } | null {
	if (isPrivateOrReserved(ip)) {
		return null;
	}
	if (reader === null) {
		return null;
	}
	let response: CountryResponse | null;
	try {
		response = reader.get(ip);
	} catch {
		// mmdb-lib throws on a syntactically invalid address — treat as unresolved.
		return null;
	}
	const code = response?.country?.iso_code;
	if (typeof code !== 'string' || code === '') {
		return null;
	}
	return { country_code: code };
}
