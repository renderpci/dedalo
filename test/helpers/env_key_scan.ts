/**
 * THE env-key scanner — one copy, shared by `config_census_tripwire` and
 * `config_docs_tripwire`.
 *
 * Both gates answer a question about the same set ("which env keys does the engine
 * actually READ?"): the census checks that set against `migration_map.ts`, the docs
 * gate against `CONFIG_CATALOG`. They had a byte-identical copy of the regex and the
 * exclusion list each, which is how, on 2026-08-03, ONE new file turned into TWO red
 * gates needing the SAME edit in two places — the duplication the repo's "link, never
 * duplicate" law exists to prevent. Extracted here so a future exclusion is decided
 * once and cannot drift.
 *
 * WHY THE SCANNER OVER-COLLECTS, DELIBERATELY. It matches an uppercase-snake literal
 * as the first argument of ANY call, not just `readEnv(`. Keys are routinely read
 * through local wrappers — `bin('DEDALO_AV_FFMPEG_PATH', …)`,
 * `envNumber('DEDALO_RAG_CHUNK_TOKENS', 450)` — and three such wrappers really did
 * hide keys from an earlier draft of the catalog. Over-collecting means the false
 * positives are visible and get named below; under-collecting means a key is read,
 * documented nowhere, and nothing says so. The trade is deliberate: an over-collected
 * literal costs one line here, a missed key costs an operator a key they cannot find.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** Uppercase-snake literal as the first argument of any call. */
const KEY_CALL = /[a-zA-Z_]\w*\s*\(\s*'([A-Z][A-Z0-9_]{2,})'/g;

/**
 * Uppercase-snake literals in src/ that are NOT env keys — the cost of the
 * over-collection above. Each entry needs a reason: this list is the ONLY thing
 * standing between the scanner and a genuinely undocumented key, so "add it to
 * NOT_ENV_KEYS" must never be the reflex for a red gate. Ask first whether the
 * literal is a config key that nobody documented.
 */
const NOT_ENV_KEYS = new Set([
	'GMT', // date formatting
	'NFD', // unicode normalization form
	'SIGINT', // signal names
	'SIGTERM',
	// Binary format markers passed to `ascii(…)` in the media content verifier
	// (src/core/media/engine/verify_content.ts): the four bytes that terminate a
	// PNG stream, not a setting anyone can configure.
	'IEND',
]);

/** Every env key the engine reads, per the scanner above. */
export function envKeysReadInSrc(): Set<string> {
	const keys = new Set<string>();
	for (const file of new Glob('src/**/*.ts').scanSync(REPO_ROOT)) {
		const source = readFileSync(join(REPO_ROOT, file), 'utf8');
		for (const match of source.matchAll(KEY_CALL)) {
			const key = match[1] as string;
			if (!NOT_ENV_KEYS.has(key)) keys.add(key);
		}
	}
	return keys;
}
