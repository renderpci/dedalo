/**
 * CATALOG-BACKED READERS — one argument, never a fallback.
 *
 * Every default the engine uses comes from `catalog/`, so a default cannot be restated at
 * a call site. That is the whole point: before this, ~160 call sites carried inline
 * literals, `DEDALO_HOST` had two different ones depending on the file, and the generated
 * census would have documented whichever the author of the catalog happened to copy.
 *
 * A reader takes a KEY and nothing else:
 *
 *     readString('DEDALO_TIMEZONE')      // not readEnv('DEDALO_TIMEZONE', 'Europe/Madrid')
 *     readNumber('DB_POOL_MAX')          // not readNumber('DB_POOL_MAX', 10)
 *
 * Once every call site is converted, `readEnv`'s `fallback` parameter is DELETED, and a
 * re-introduced inline default stops being a lint opinion and becomes a compile error.
 *
 * EMPTY-VALUE FIDELITY. `readEnv(k, 'x')` returns '' for a key explicitly set to empty,
 * while readNumber/readListEnv treat '' as unset. That difference is load-bearing —
 * `DB_PASSWORD=''` means trust/peer auth, NOT "use the default" — so it is declared per
 * entry (`emptyIsUnset`) rather than left to whichever reader happened to be called.
 */

import { catalogEntry } from './catalog/index.ts';
import type { CatalogEntry, ComputedDefault } from './catalog_types.ts';
import { readEnv, requireEnv } from './env.ts';
import { INSTALL_MODE } from './install_mode.ts';

/**
 * Does an empty value mean "unset"?
 *
 * The default reproduces the pre-catalog behavior EXACTLY, which differed by reader family:
 *   - `readEnv(k, 'x')` returned '' for a key set to empty. Every string AND every boolean
 *     came through it (`readEnv(k,'true') === 'true'`), so for those, empty is a VALUE:
 *     `DB_PASSWORD=` means trust/peer auth, and `SOME_FLAG=` means false, not "use default".
 *   - readNumber/readListEnv/readJsonMap treated '' as unset and fell back.
 *
 * Get this wrong and a boot changes behavior silently, so it is declared, not inferred.
 */
function emptyIsUnset(entry: CatalogEntry): boolean {
	const emptyIsAValue = entry.type === 'string' || entry.type === 'boolean';
	return entry.emptyIsUnset ?? !emptyIsAValue;
}

/** The raw configured value, or undefined when the key is unset (per the entry's rule). */
function raw(key: string): string | undefined {
	const value = readEnv(key);
	if (value === undefined) return undefined;
	if (emptyIsUnset(catalogEntry(key)) && value.trim() === '') return undefined;
	return value;
}

/** Resolve the catalog default, running the thunk when it is a computed one. */
function defaultOf(key: string): unknown {
	const { default: value } = catalogEntry(key);
	return typeof value === 'function' ? (value as ComputedDefault)(readString) : value;
}

function resolve(key: string): unknown {
	const configured = raw(key);
	if (configured !== undefined) return configured;
	return defaultOf(key);
}

/**
 * In install mode the sentinel wins OUTRIGHT — it is not a fallback consulted after the
 * env.
 *
 * This is subtle and it bit once. Install mode is decided by treating an EMPTY required key
 * as unset (`resolveInstallMode`), but a string reader treats empty as a VALUE (`DB_PASSWORD=`
 * means trust auth). So on a box with `ENTITY=`, "consult the env first, then fall back to
 * the sentinel" yields '' — a booted server with no entity — where the pre-catalog
 * `requireOrInstallSentinel` returned 'install'. Check install mode FIRST, exactly as it did.
 */
function requiredValue(key: string): unknown {
	const entry = catalogEntry(key);
	if (INSTALL_MODE && entry.installSentinel !== undefined) return entry.installSentinel;
	return requireEnv(key);
}

// ---------------------------------------------------------------------------
// Scalars
// ---------------------------------------------------------------------------

export function readString(key: string): string {
	const value = resolve(key);
	return value === undefined ? '' : String(value);
}

/** For a key whose ABSENCE is meaningful (the consumer derives its own behavior). */
export function readOptionalString(key: string): string | undefined {
	const configured = raw(key);
	if (configured !== undefined) return configured;
	const value = defaultOf(key);
	return value === undefined ? undefined : String(value);
}

export function readNumber(key: string): number {
	const entry = catalogEntry(key);
	const configured = raw(key);
	let value: number;
	if (configured === undefined) {
		value = Number(defaultOf(key));
	} else {
		const parsed = Number(configured);
		value = Number.isFinite(parsed) ? parsed : Number(defaultOf(key));
	}
	const { clamp } = entry;
	if (clamp !== undefined) {
		if (clamp.min !== undefined) value = Math.max(clamp.min, value);
		if (clamp.max !== undefined) value = Math.min(clamp.max, value);
	}
	return value;
}

export function readBool(key: string): boolean {
	const configured = raw(key);
	if (configured === undefined) return defaultOf(key) === true;
	return configured === 'true';
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

/** JSON array OR comma list — the shape most Dédalo list settings accept. */
export function readList(key: string): readonly string[] {
	const configured = raw(key);
	if (configured === undefined) {
		return Object.freeze([...((defaultOf(key) as readonly string[] | undefined) ?? [])]);
	}
	const trimmed = configured.trim();
	if (trimmed.startsWith('[')) {
		try {
			const parsed: unknown = JSON.parse(trimmed);
			if (Array.isArray(parsed)) return Object.freeze(parsed.map(String));
		} catch {
			/* fall through to the comma parse */
		}
	}
	return Object.freeze(
		trimmed
			.split(',')
			.map((entry) => entry.trim())
			.filter((entry) => entry !== ''),
	);
}

/**
 * Like readList, but UNSET (null) is distinguishable from an explicitly EMPTY list ([]).
 * The media public-quality list needs it: unset derives the install's delivery qualities,
 * while [] means no folder is public at all.
 */
export function readOptionalList(key: string): readonly string[] | null {
	if (raw(key) === undefined) return null;
	return readList(key);
}

/**
 * STRICTLY JSON — never a comma list. MEDIA_HTACCESS_ADDONS carries raw web-server
 * directives, and a directive legitimately contains commas (`RewriteRule ^ - [R=404,L]`);
 * a comma fallback would shred one directive into two broken rules and emit them into a
 * live web-server config. A malformed value logs and falls back — never junk rules.
 */
export function readJsonArray(key: string): readonly string[] {
	const configured = raw(key);
	const fallback = (): readonly string[] =>
		Object.freeze([...((defaultOf(key) as readonly string[] | undefined) ?? [])]);
	if (configured === undefined) return fallback();
	try {
		const parsed: unknown = JSON.parse(configured.trim());
		if (Array.isArray(parsed)) return Object.freeze(parsed.map(String));
	} catch {
		/* fall through to the loud refusal */
	}
	console.error(`[config] ${key} must be a JSON array of strings — ignoring the value.`);
	return fallback();
}

export function readMap(key: string): Readonly<Record<string, string>> {
	const configured = raw(key);
	const fallback = (): Readonly<Record<string, string>> =>
		Object.freeze({ ...((defaultOf(key) as Record<string, string> | undefined) ?? {}) });
	if (configured === undefined) return fallback();
	try {
		const parsed: unknown = JSON.parse(configured);
		if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
			const entries: Record<string, string> = {};
			for (const [mapKey, mapValue] of Object.entries(parsed)) entries[mapKey] = String(mapValue);
			return Object.freeze(entries);
		}
	} catch {
		/* fall through to the default */
	}
	return fallback();
}

// ---------------------------------------------------------------------------
// Bespoke shapes
// ---------------------------------------------------------------------------

/**
 * Media access mode: DEDALO_MEDIA_ACCESS_MODE when it names a real mode, else the
 * deprecated DEDALO_PROTECT_MEDIA_FILES=true → 'private', else false (open media).
 * Two keys, one answer — which is why it cannot be a generic reader.
 */
export function readMediaAccessMode(): 'private' | 'publication' | false {
	const mode = readString('DEDALO_MEDIA_ACCESS_MODE');
	if (mode === 'private' || mode === 'publication') return mode;
	// A non-empty value that is neither known mode is almost certainly a typo
	// ('privat', 'public'); it silently coerces to OFF (open media), which reads
	// as protection-configured when it is not. Log it loudly rather than let the
	// footgun pass unseen — the resolved state is unchanged (still off).
	if (mode !== undefined && mode !== '') {
		console.error(
			`[config] DEDALO_MEDIA_ACCESS_MODE='${mode}' is not a valid mode ('private' | 'publication') — media access control is OFF. Fix the value or unset it.`,
		);
	}
	return readBool('DEDALO_PROTECT_MEDIA_FILES') ? 'private' : false;
}

/** A JSON array of {name,url,code} server descriptors; invalid entries are dropped. */
export function readServerList(
	key: string,
): readonly { name: string; url: string; code: string }[] {
	const configured = raw(key);
	if (configured === undefined || configured.trim() === '') return Object.freeze([]);
	try {
		const parsed: unknown = JSON.parse(configured);
		if (!Array.isArray(parsed)) return Object.freeze([]);
		return Object.freeze(
			parsed.filter(
				(entry): entry is { name: string; url: string; code: string } =>
					entry !== null &&
					typeof entry === 'object' &&
					typeof (entry as { name: unknown }).name === 'string' &&
					typeof (entry as { url: unknown }).url === 'string' &&
					typeof (entry as { code: unknown }).code === 'string',
			),
		);
	} catch {
		return Object.freeze([]);
	}
}

/**
 * Additional tool roots (JSON `[{"path":...,"url":...}]`). Entries missing a path/url, or
 * with a non-root-relative (cross-origin) url, are DROPPED — the browser import()s tool JS
 * from these urls, so they MUST be same-origin.
 */
export function readToolRoots(key: string): readonly { path: string; url: string }[] {
	const configured = raw(key);
	if (configured === undefined || configured.trim() === '') return Object.freeze([]);
	try {
		const parsed: unknown = JSON.parse(configured);
		if (!Array.isArray(parsed)) return Object.freeze([]);
		const roots: { path: string; url: string }[] = [];
		for (const entry of parsed) {
			const path = (entry as { path?: unknown })?.path;
			const url = (entry as { url?: unknown })?.url;
			if (typeof path !== 'string' || typeof url !== 'string') continue;
			if (!url.startsWith('/') || url.startsWith('//')) continue; // same-origin only
			roots.push({ path, url: url.replace(/\/$/, '') });
		}
		return Object.freeze(roots);
	} catch {
		return Object.freeze([]);
	}
}

// ---------------------------------------------------------------------------
// Required (install-sentinel aware)
// ---------------------------------------------------------------------------

export function requireString(key: string): string {
	return String(requiredValue(key));
}

/**
 * A required JSON array. Owner rule (2026-07-09): LANGUAGE definitions are install
 * configuration — a missing or malformed value must REFUSE THE BOOT, never fall back to a
 * hardcoded list. Install mode boots on the sentinel so the wizard can run and persist the
 * real value.
 */
export function requireList(key: string): readonly string[] {
	const entry = catalogEntry(key);
	if (INSTALL_MODE && entry.installSentinel !== undefined) {
		return Object.freeze([...(entry.installSentinel as readonly string[])]);
	}
	const value = requireEnv(key);
	try {
		const parsed: unknown = JSON.parse(value);
		if (Array.isArray(parsed) && parsed.length > 0) return Object.freeze(parsed.map(String));
	} catch {
		/* fall through to the loud refusal */
	}
	throw new Error(
		`Config key '${key}' must be a non-empty JSON array (e.g. ["lg-spa","lg-eng"]). See install/sample.env.`,
	);
}

/** Required JSON-map twin of requireList (same owner rule). */
export function requireMap(key: string): Readonly<Record<string, string>> {
	const entry = catalogEntry(key);
	if (INSTALL_MODE && entry.installSentinel !== undefined) {
		return Object.freeze({ ...(entry.installSentinel as Record<string, string>) });
	}
	const value = requireEnv(key);
	try {
		const parsed: unknown = JSON.parse(value);
		if (
			parsed !== null &&
			typeof parsed === 'object' &&
			!Array.isArray(parsed) &&
			Object.keys(parsed).length > 0
		) {
			const entries: Record<string, string> = {};
			for (const [mapKey, mapValue] of Object.entries(parsed)) entries[mapKey] = String(mapValue);
			return Object.freeze(entries);
		}
	} catch {
		/* fall through to the loud refusal */
	}
	throw new Error(
		`Config key '${key}' must be a non-empty JSON object map (e.g. {"lg-spa":"Castellano"}). See install/sample.env.`,
	);
}
