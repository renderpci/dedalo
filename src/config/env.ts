/**
 * Environment loader for the Dédalo TS server.
 *
 * Secrets and per-instance settings live OUTSIDE the web root in `../private/.env`
 * (a sibling `private/` directory next to this repo — the same convention the PHP
 * tree uses, but a SEPARATE directory: the two servers never share config files,
 * per spec §5 "Config & independence").
 *
 * Bun auto-loads `.env` from the project cwd only, so we read the private file
 * explicitly. Precedence (highest wins):
 *   1. real process environment variables (lets CI/systemd override anything)
 *   2. ../private/.env
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Absolute path of the repo root (this file lives at <root>/src/config/env.ts). */
export const projectRoot: string = resolve(import.meta.dir, '../..');

/**
 * The private config directory: sibling of the repo, outside any web root.
 * Relocatable via DEDALO_PRIVATE_DIR (read from the real process env at
 * bootstrap — this is the loader itself, so it cannot use readEnv). Both the
 * READ side (this file's `.env` load) and the WRITE side (the installer) honor
 * it, so the whole private tree can move together (containers, install drives).
 */
export const privateDir: string =
	process.env.DEDALO_PRIVATE_DIR !== undefined && process.env.DEDALO_PRIVATE_DIR !== ''
		? resolve(process.env.DEDALO_PRIVATE_DIR)
		: resolve(projectRoot, '../private');

/**
 * Parse a dotenv-style file into a plain map.
 * Supports `KEY=value`, blank lines, `#` comments, and single/double-quoted values.
 * Intentionally minimal — no interpolation, no multiline values (boring on purpose).
 */
export function parseEnvFile(fileContent: string): Record<string, string> {
	const parsedEntries: Record<string, string> = {};
	for (const rawLine of fileContent.split('\n')) {
		const line = rawLine.trim();
		if (line.length === 0 || line.startsWith('#')) {
			continue;
		}
		const separatorIndex = line.indexOf('=');
		if (separatorIndex <= 0) {
			continue; // not a KEY=value line; ignore silently like dotenv does
		}
		const key = line.slice(0, separatorIndex).trim();
		let value = line.slice(separatorIndex + 1).trim();
		// Strip one matching pair of surrounding quotes, if present.
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		parsedEntries[key] = value;
	}
	return parsedEntries;
}

/** Values read from ../private/.env (empty object when the file does not exist yet). */
const privateFileValues: Record<string, string> = (() => {
	const envFilePath = join(privateDir, '.env');
	if (!existsSync(envFilePath)) {
		return {};
	}
	return parseEnvFile(readFileSync(envFilePath, 'utf-8'));
})();

/**
 * PHP-catalog constant names honored as FALLBACK spellings of TS-native keys,
 * so an administrator migrating from the PHP server can carry their existing
 * `DEDALO_*` .env lines over unchanged. The TS-native name always wins when
 * both are set; keys whose VALUE SHAPE differs between the engines (e.g.
 * APPLICATION_LANGS list vs DEDALO_APPLICATION_LANGS map) are intentionally
 * NOT aliased. Census: ../private/sample.env.
 */
export const PHP_KEY_ALIASES: Readonly<Record<string, string>> = Object.freeze({
	ENTITY: 'DEDALO_ENTITY',
	MAIN_SECTION: 'MAIN_FALLBACK_SECTION',
	DB_NAME: 'DEDALO_DATABASE_CONN',
	DB_HOST: 'DEDALO_HOSTNAME_CONN',
	DB_PORT: 'DEDALO_DB_PORT_CONN',
	DB_USER: 'DEDALO_USERNAME_CONN',
	DB_PASSWORD: 'DEDALO_PASSWORD_CONN',
	MEDIA_PATH: 'DEDALO_MEDIA_PATH',
	APPLICATION_LANG: 'DEDALO_APPLICATION_LANG',
	DATA_LANG: 'DEDALO_DATA_LANG',
	DATA_LANG_SYNC: 'DEDALO_DATA_LANG_SYNC',
	DATA_NOLAN: 'DEDALO_DATA_NOLAN',
	PROJECTS_DEFAULT_LANGS: 'DEDALO_PROJECTS_DEFAULT_LANGS',
	MENU_SKIP_TIPOS: 'DEDALO_ENTITY_MENU_SKIP_TIPOS',
	DEDALO_SLOW_QUERY_MS: 'SLOW_QUERY_MS',
	DEDALO_RAG_EMBEDDING_PROVIDER: 'DEDALO_RAG_PROVIDER',
	DEDALO_RAG_EMBEDDING_MODEL: 'DEDALO_RAG_MODEL',
	DEDALO_RAG_EMBEDDING_ENDPOINT: 'DEDALO_RAG_ENDPOINT',
	DEDALO_RAG_DB_NAME: 'DEDALO_RAG_DB_DATABASE_CONN',
});

/**
 * Keys RETIRED by a rename, mapped to their replacement. A retired spelling is
 * NOT an alias: it no longer configures anything, so leaving it in place would
 * silently fall back to the new key's default — the exact "silent scope
 * narrowing" the hard rules ban. `config.ts` refuses the boot when a retired key
 * is set and its replacement is not; `config/migration_map.ts` turns the same
 * table into the v6→v7 rename rules. It lives HERE, in the vocabulary module, so
 * neither consumer has to import (and thereby BUILD) the frozen config.
 */
export const RETIRED_ENV_KEYS: Readonly<Record<string, string>> = Object.freeze({
	DEDALO_PREFIX_TIPOS: 'ACTIVE_ONTOLOGY_TLDS', // renamed 2026-07-11 (WC-028)
});

/**
 * Read one env value with the documented precedence (process env > private .env),
 * then the same chain under the key's PHP-catalog alias name, if it has one.
 * Returns undefined when the key is set nowhere.
 *
 * THERE IS NO `fallback` PARAMETER, AND THAT IS THE POINT.
 *
 * It used to take one, and ~160 call sites passed a literal — so a key's default lived
 * wherever its reader happened to be called. `DEDALO_HOST` ended up with two different
 * defaults depending on which file you landed in, `APPLICATION_LANGS` was hardcoded to
 * `lg-spa,lg-cat,lg-eng` in three of them, and a generated census could only ever document
 * whichever one it happened to read. Defaults now live in `src/config/catalog/` — one per
 * key, next to the prose that describes it — and are resolved by `readers.ts`
 * (`readString`, `readNumber`, `readBool`, `readList`, …), which take a key and nothing
 * else.
 *
 * Deleting this parameter is what turns that rule from a convention into a GATE: passing a
 * default here is now a compile error (TS2554), not a code-review opinion. Use the typed
 * readers. Use bare `readEnv(key)` only where ABSENCE is itself meaningful and the consumer
 * derives its own behavior from it.
 */
export function readEnv(key: string): string | undefined {
	const direct = process.env[key] ?? privateFileValues[key];
	if (direct !== undefined) return direct;
	const alias = PHP_KEY_ALIASES[key];
	if (alias !== undefined) {
		const aliased = process.env[alias] ?? privateFileValues[alias];
		if (aliased !== undefined) return aliased;
	}
	return undefined;
}

/**
 * A merged env MAP with the same precedence readEnv applies (process env wins
 * over ../private/.env). For modules whose API takes an injectable env map
 * (e.g. ai/rag/multimodal_config.ts) — defaulting such a parameter to bare
 * `process.env` silently drops the private-file half of the precedence chain
 * (audit S2-21), which is exactly the trap this helper closes.
 *
 * Built fresh per call: tests mutate process.env at runtime and must see the
 * current values, so this must not be a boot-time snapshot.
 */
export function envSnapshot(): Record<string, string | undefined> {
	return { ...privateFileValues, ...process.env };
}

/** Like readEnv but throws a clear boot-time error when the key is missing. */
export function requireEnv(key: string): string {
	const value = readEnv(key);
	if (value === undefined || value === '') {
		throw new Error(
			`Missing required config key '${key}'. Set it in ${join(privateDir, '.env')} or as a process environment variable. See private/sample.env.`,
		);
	}
	return value;
}
