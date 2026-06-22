/**
 * env.ts — env-string layering + coercion primitives.
 *
 * Mirrors the PHP boot pipeline (config/bootstrap.php + class.env_loader.php):
 * a base `.env` is loaded, then an optional host override `.env.<host>` is layered
 * on top with last-wins semantics (later file overrides earlier). Env values are
 * always strings; the Zod schema (schema.ts) coerces each one to its catalog type
 * (int / bool / string / list / map). These helpers do the raw string→value
 * coercion so the schema stays declarative.
 */

export type RawEnv = Record<string, string | undefined>;

/**
 * Sanitize a raw host (Host header / DEDALO_ENV / hostname) into a filename-safe
 * token, exactly as bootstrap.php does:
 *   - strip an optional `:port` suffix (split on ':', take the first segment)
 *   - keep only [A-Za-z0-9_.-]
 *   - reject anything containing '..' (path traversal) → empty string
 * An empty result means "no host overlay" (a spoofed/unknown Host can only miss).
 */
export function sanitizeHostname(rawHost: string | undefined | null): string {
	if (rawHost == null) {
		return '';
	}
	const firstSegment = String(rawHost).split(':')[0] ?? '';
	const cleaned = firstSegment.replace(/[^A-Za-z0-9_.-]/g, '');
	if (cleaned === '' || cleaned.includes('..')) {
		return '';
	}
	return cleaned;
}

/**
 * Merge env layers with last-wins semantics (mirrors env_loader's behaviour where
 * a later loaded file overrides an earlier one). `undefined` values in an overlay
 * do NOT clobber a defined base value — only present keys override. This matches
 * the PHP loop that only loads files that exist and only sets keys they declare.
 */
export function mergeEnv(...layers: ReadonlyArray<RawEnv>): RawEnv {
	const merged: RawEnv = {};
	for (const layer of layers) {
		for (const key of Object.keys(layer)) {
			const value = layer[key];
			if (value !== undefined) {
				merged[key] = value;
			}
		}
	}
	return merged;
}

/**
 * Parse a minimal `.env` file body into a RawEnv map (last-wins on duplicate keys).
 * Supports `KEY=value`, `export KEY=value`, blank lines, `#` comments, and single
 * or double quoted values (quotes stripped, no escape processing — matching the
 * lightweight semantics the install `.env` relies on). JSON values are kept as the
 * raw string and parsed later by the schema.
 */
export function parseEnvFile(body: string): RawEnv {
	const out: RawEnv = {};
	const lines = body.split(/\r?\n/);
	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (line === '' || line.startsWith('#')) {
			continue;
		}
		const withoutExport = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
		const eq = withoutExport.indexOf('=');
		if (eq === -1) {
			continue;
		}
		const key = withoutExport.slice(0, eq).trim();
		if (key === '') {
			continue;
		}
		let value = withoutExport.slice(eq + 1).trim();
		if (
			value.length >= 2 &&
			((value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'")))
		) {
			value = value.slice(1, -1);
		}
		out[key] = value;
	}
	return out;
}
