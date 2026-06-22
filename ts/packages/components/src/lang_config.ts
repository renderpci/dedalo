/**
 * Language configuration for component value resolution.
 *
 * In PHP these are install-time `define()` constants (DEDALO_DATA_LANG,
 * DEDALO_DATA_LANG_DEFAULT, DEDALO_DATA_NOLAN) plus the project-langs list
 * returned by `common::get_ar_all_langs()` (DEDALO_PROJECTS_DEFAULT_LANGS).
 * They are NOT hardcoded here because they vary per install (e.g. this
 * dedalo7_mib install uses lg-spa as the data-lang default, not lg-eng).
 *
 * They are passed in explicitly (constructor injection) — never read from a
 * module-global — so there is no cross-request mutable state.
 */
export interface LangConfig {
  /** DEDALO_DATA_LANG — the default request lang when the RQO omits one. */
  readonly dataLang: string;
  /** DEDALO_DATA_LANG_DEFAULT — the "main lang" tried first in the fallback chain. */
  readonly dataLangDefault: string;
  /** DEDALO_DATA_NOLAN — the no-language sentinel for non-translatable components. */
  readonly nolan: string;
  /**
   * DEDALO_PROJECTS_DEFAULT_LANGS — the ordered project lang list scanned by the
   * "try any other" fallback step (common::get_ar_all_langs()). Order is
   * significant: the first non-empty slice wins.
   */
  readonly allLangs: readonly string[];
}

/** The hardcoded PHP-source constants (lg-nolan / lg-eng). Install values override. */
export const NOLAN = 'lg-nolan';

/**
 * Build a LangConfig from a Dédalo-style env map (the DEDALO_* vars in private/.env).
 * Mirrors how PHP's config compiler reads these. Falls back to the PHP source
 * defaults when a var is absent.
 */
export function langConfigFromEnv(env: Record<string, string | undefined> = process.env): LangConfig {
  const dataLangDefault = env.DEDALO_DATA_LANG_DEFAULT ?? 'lg-eng';
  const dataLang = env.DEDALO_DATA_LANG ?? dataLangDefault;
  let allLangs: string[] = [];
  const raw = env.DEDALO_PROJECTS_DEFAULT_LANGS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) allLangs = parsed.filter((x): x is string => typeof x === 'string');
    } catch {
      allLangs = [];
    }
  }
  return { dataLang, dataLangDefault, nolan: NOLAN, allLangs };
}
