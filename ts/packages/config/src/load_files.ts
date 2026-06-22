/**
 * load_files.ts — optional filesystem wrapper around the pure `loadConfig(env)`.
 *
 * Reproduces config/bootstrap.php's host-layered env load: read `<dir>/.env`
 * (shared base) then `<dir>/.env.<host>` (per-host override), last-wins, and
 * validate the merged result. Uses Bun's file API. `loadConfig(env)` stays the
 * pure primary path; this is sugar for entrypoints that read from disk.
 */

import { mergeEnv, parseEnvFile, sanitizeHostname, type RawEnv } from './env.ts';
import { loadConfig } from './load.ts';
import type { Config } from './schema.ts';

async function readIfExists(path: string): Promise<RawEnv> {
	const file = Bun.file(path);
	if (!(await file.exists())) {
		return {};
	}
	return parseEnvFile(await file.text());
}

/**
 * Read `<dir>/.env` then `<dir>/.env.<sanitizedHost>` (if `hostname` given and the
 * file exists), merge last-wins, overlay `baseEnv` on top (the ambient environment
 * always wins, mirroring bootstrap.php's precedence), and validate into a frozen
 * Config. `baseEnv` defaults to `process.env`; tests inject a controlled object so
 * they are hermetic and unaffected by the developer's shell environment.
 */
export async function loadConfigFromFiles(
	dir: string,
	hostname?: string,
	baseEnv: RawEnv = process.env as RawEnv,
): Promise<Config> {
	const base = await readIfExists(`${dir}/.env`);
	const host = sanitizeHostname(hostname);
	const overlay = host !== '' ? await readIfExists(`${dir}/.env.${host}`) : {};
	const merged = mergeEnv(base, overlay, baseEnv);
	return loadConfig(merged);
}
