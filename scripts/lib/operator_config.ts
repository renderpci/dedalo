/**
 * OPERATOR CONFIG — the engine's configuration as ONE map, composed the way the engine
 * itself reads it, for scripts that must hand it to ANOTHER process or write it to
 * ANOTHER install's `.env`.
 *
 * WHY THIS EXISTS. `scripts/update_drill.ts` boots two real servers: a code master
 * (this checkout) and a consumer copy under a supervisor. Until 2026-09-02 the
 * consumer's private `.env` was a byte copy of `../private/.env`, and the master's
 * spawn env carried only the drill's own runtime surfaces — the master resolved its
 * configuration from the checkout's file. Both are the DEVELOPER's condition. On a
 * hosted runner there is no `../private/.env` at all: the whole configuration is
 * composed in the process environment (scripts/ci/hosted_env.sh), the copy threw
 * ENOENT and the master died at boot with `Missing required config key`. So the
 * drills ran on no CI (P0-1 residual of the 2026-08-26 deep audit, GATE-14/15).
 *
 * THE RULE. The composed map is the readEnv precedence made explicit: the private
 * file, if present, overlaid by the process environment — but ONLY the keys the config
 * CATALOG declares (plus the PHP alias spellings `readEnv` honours). A process
 * environment carries PATH, HOME, a runner's GITHUB_TOKEN, a shell's history file:
 * none of that is configuration, and the consumer's `.env` lands ON DISK (0600, in
 * TMPDIR, swept in `finally` — but `--keep` leaves it). The filter is what makes
 * "write the operator's config to another install" never mean "write the runner's
 * token to another install". test/unit/update_drill_config_tripwire.test.ts asserts
 * that negative against a planted token.
 *
 * DEDALO_PRIVATE_DIR is NOT a catalog key and is NOT forwarded: it is the bootstrap
 * pointer that says where the file IS, and a child install resolving ITS file must do
 * so from its own tree (`<tree>/../private`), never from the parent's pointer.
 *
 * The pure composition (`composeOperatorConfig`) takes its inputs as arguments so the
 * gate can drive it with a planted environment; `operatorConfig()` is the thin real
 * reader every caller uses.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_CATALOG } from '../../src/config/catalog/index.ts';
import { PHP_KEY_ALIASES, parseEnvFile, privateDir } from '../../src/config/env.ts';

/**
 * The key names a process environment may contribute: every catalog key and every
 * PHP alias spelling `readEnv` accepts as a fallback. Computed once; the catalog is
 * frozen at module load.
 */
export const FORWARDABLE_KEYS: ReadonlySet<string> = new Set([
	...Object.keys(CONFIG_CATALOG),
	...Object.values(PHP_KEY_ALIASES),
]);

/**
 * The pure composition. `fileText` is the private file's content (undefined when the
 * file does not exist — the runner's condition); `processEnv` is the environment to
 * overlay. Process values win, as they do for `readEnv`; only forwardable keys cross.
 */
export function composeOperatorConfig(
	fileText: string | undefined,
	processEnv: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
	const composed: Record<string, string> = fileText === undefined ? {} : parseEnvFile(fileText);
	for (const [key, value] of Object.entries(processEnv)) {
		if (value === undefined) continue;
		if (!FORWARDABLE_KEYS.has(key)) continue;
		composed[key] = value;
	}
	return composed;
}

/** The operator's configuration as this process sees it: the private file + the env. */
export function operatorConfig(): Record<string, string> {
	const envFilePath = join(privateDir, '.env');
	const fileText = existsSync(envFilePath) ? readFileSync(envFilePath, 'utf8') : undefined;
	return composeOperatorConfig(fileText, process.env);
}

/**
 * Serialize a map as a dotenv file `parseEnvFile` reads back IDENTICALLY. Every value
 * is double-quoted; the parser strips one matching pair and does no interpolation or
 * escaping, so the only value it cannot round-trip is one containing a newline — which
 * is refused here rather than silently truncated into a second, bogus line.
 */
export function renderEnvFile(config: Readonly<Record<string, string>>): string {
	const lines: string[] = [
		'# Composed by scripts/lib/operator_config.ts — the operator configuration as one map.',
	];
	for (const key of Object.keys(config).sort()) {
		const value = config[key] as string;
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
			throw new Error(`operator_config: '${key}' is not a dotenv key`);
		}
		if (value.includes('\n') || value.includes('\r')) {
			throw new Error(
				`operator_config: '${key}' contains a newline and cannot be written as one line`,
			);
		}
		// The parser strips exactly ONE surrounding pair, so a value that itself
		// starts and ends with a quote survives: `""x""` reads back as `"x"`.
		lines.push(`${key}="${value}"`);
	}
	return `${lines.join('\n')}\n`;
}
