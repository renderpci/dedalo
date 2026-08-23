/**
 * LANGUAGE CODES — the one shape, in a LEAF module.
 *
 * Dédalo writes a language as `lg-<code>` (`lg` marks the term as a language,
 * `<code>` is the ISO 639-2/T alpha-3 code, or an ISO 639-6 alpha-4 variant).
 * The pattern also admits the literal sentinel `all`, because a stored VALUE may
 * legitimately be language-agnostic ("this datum holds for every language") and
 * the search identifier chokepoint (§7.6) has to let that through.
 *
 * WHY IT LIVES HERE AND NOT IN core/concepts/ontology.ts (its original home):
 * `src/config/` may not import `src/core/` — building the frozen config runs
 * before, and independently of, anything in core. Config now VALIDATES language
 * codes (DEDALO_DIFFUSION_LANGS), so the shape had to move somewhere both sides
 * can reach. It is a leaf: this module imports nothing. `core/concepts/ontology.ts`
 * RE-EXPORTS `LANG_PATTERN`/`isValidLang` so every existing importer is unchanged
 * — one definition, two doors ("link, never duplicate").
 */

/** Language codes: 'lg-*' or the 'all' sentinel — §7.6 gate shape. */
export const LANG_PATTERN = /^(lg-[a-z0-9_]+|all)$/;

/** Validate a language code (used by the search identifier chokepoint, §7.6). */
export function isValidLang(candidate: string): boolean {
	return LANG_PATTERN.test(candidate);
}

/**
 * Validate a language code that must name ONE REAL LANGUAGE — a diffusion lang.
 *
 * Deliberately STRICTER than `isValidLang`: `LANG_PATTERN` accepts the `all`
 * sentinel, and `all` is meaningful as a stored value ("holds for every
 * language") but MEANINGLESS as a publication target. The diffusion lang set is
 * iterated to build one fixed rendition per language; an `all` entry would name
 * no language, publish an empty rendition and put a phantom `all` column into
 * the published data. Publication langs must therefore be spelled out.
 */
export function isDiffusionLangCode(value: string): boolean {
	return value !== 'all' && LANG_PATTERN.test(value);
}
