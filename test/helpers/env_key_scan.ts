/**
 * THE env-key scanner — one copy, shared by `config_census_tripwire`,
 * `config_docs_tripwire` and `config_declaration_tripwire`.
 *
 * All three answer a question about the same set ("which env keys does the engine
 * actually READ, and through what?"): the census checks that set against
 * `migration_map.ts`, the docs gate against `CONFIG_CATALOG`, and the declaration gate
 * against the READER each key is read with. They had a byte-identical copy of the regex
 * and the exclusion list each, which is how, on 2026-08-03, ONE new file turned into TWO
 * red gates needing the SAME edit in two places — the duplication the repo's "link, never
 * duplicate" law exists to prevent. Extracted here so a future exclusion is decided once
 * and cannot drift.
 *
 * WHY THE SCANNER OVER-COLLECTS, DELIBERATELY. It matches an uppercase-snake literal
 * as the first argument of ANY call, not just `readEnv(`. Keys are routinely read
 * through local wrappers — `bin('DEDALO_AV_FFMPEG_PATH', …)`,
 * `envNumber('DEDALO_RAG_CHUNK_TOKENS', 450)` — and three such wrappers really did
 * hide keys from an earlier draft of the catalog. Over-collecting means the false
 * positives are visible and get named below; under-collecting means a key is read,
 * documented nowhere, and nothing says so. The trade is deliberate: an over-collected
 * literal costs one line here, a missed key costs an operator a key they cannot find.
 *
 * WHICH IS ALSO WHY THE CALLEE IS NOW RECORDED. The regex already CONSUMED the callee
 * name to find the literal; it simply threw it away. `envKeyCallSites()` keeps it, so a
 * gate can ask the question the census cannot — not "is this key documented?" but "is it
 * read through the reader its catalog type declares?". That is what makes the catalog's
 * `type` field load-bearing instead of decorative (see
 * `test/unit/config_declaration_tripwire.test.ts`): DEDALO_DIFFUSION_LANGS was declared a
 * string, read with a bare `readEnv` + `.split(',')`, and silently shredded a JSON array
 * into four phantom language codes.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/**
 * Uppercase-snake literal as the first argument of any call.
 *
 * Group 1 is the CALLEE, group 2 the key. Adding group 1 changed nothing about what
 * matches — the callee name was always consumed, only discarded.
 */
const KEY_CALL = /([a-zA-Z_]\w*)\s*\(\s*'([A-Z][A-Z0-9_]{2,})'/g;

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

/** One `someCall('SOME_KEY', …)` occurrence in src/. */
export interface EnvKeyCallSite {
	/** The uppercase-snake literal — an env key, unless it is in NOT_ENV_KEYS. */
	readonly key: string;
	/** The function it was passed to: `readEnv`, `readList`, `bin`, `envNumber`… */
	readonly callee: string;
	/** Repo-relative path. */
	readonly file: string;
	/** 1-indexed line, so a failure names a place a person can open. */
	readonly line: number;
	/**
	 * The occurrence sits in a COMMENT, not in code.
	 *
	 * The census does not care (a key named in prose is still a key worth documenting),
	 * but a gate that judges HOW a key is read must not indict a comment that merely
	 * quotes a call — `config.ts` documents the very defect this scanner now catches by
	 * writing `readEnv('DEDALO_DIFFUSION_LANGS')` in its own header. Heuristic, not a
	 * lexer: the line is a comment line (`//`, `/*`, or a `*` continuation), or a `//`
	 * opens before the match on the same line. It errs toward calling something code,
	 * which is the safe direction — a missed comment is a false alarm someone reads,
	 * a missed CALL is an invariant that never fires.
	 */
	readonly commented: boolean;
}

/** Every `call('KEY')` occurrence in src/, in file order. */
export function envKeyCallSites(): readonly EnvKeyCallSite[] {
	const sites: EnvKeyCallSite[] = [];
	for (const file of new Glob('src/**/*.ts').scanSync(REPO_ROOT)) {
		const source = readFileSync(join(REPO_ROOT, file), 'utf8');
		// Line starts, so an offset becomes a line number without re-splitting per match.
		const lineStarts: number[] = [0];
		for (let i = 0; i < source.length; i++) if (source[i] === '\n') lineStarts.push(i + 1);

		for (const match of source.matchAll(KEY_CALL)) {
			const key = match[2] as string;
			if (NOT_ENV_KEYS.has(key)) continue;
			const offset = match.index;
			// Binary search would be tidier; a linear walk over a few hundred matches is
			// not the cost worth optimizing in a test helper.
			let line = 0;
			while (line + 1 < lineStarts.length && (lineStarts[line + 1] as number) <= offset) line++;
			const lineStart = lineStarts[line] as number;
			const before = source.slice(lineStart, offset);
			const trimmed = before.trimStart();
			sites.push({
				key,
				callee: match[1] as string,
				file,
				line: line + 1,
				commented:
					trimmed.startsWith('//') ||
					trimmed.startsWith('*') ||
					trimmed.startsWith('/*') ||
					before.includes('//'),
			});
		}
	}
	return sites;
}

/**
 * Every env key the engine reads, per the scanner above.
 *
 * DERIVED from `envKeyCallSites()` — deliberately NOT a second scan. It keeps its
 * original meaning exactly, comments included: a key named only in prose is still a key
 * an operator can set and therefore a key the catalog must document.
 */
export function envKeysReadInSrc(): Set<string> {
	return new Set(envKeyCallSites().map((site) => site.key));
}
