/**
 * Read-side port of the install-time UI-LABELS cache that drives
 * `label::get_label($name, $lang)`.
 *
 * WHY THIS EXISTS
 * ---------------
 * The search-mode element context (`mode:'search'`) appends a
 * `search_options_title` HTML field built from `label::get_label()` calls (the
 * operator-name tooltips: 'Vacío', 'Exactamente', 'Entre', …). `label::get_label`
 * resolves keys from the per-(entity,user) FILE cache:
 *
 *   {DEDALO_ENTITY}_{user_id}_cache_labels_{lang}.php
 *
 * written once by `label::get_ar_label()` via `dd_cache::cache_to_file`. The
 * file is a flat PHP `<?php return ['key'=>'value', …];` map of string→string.
 * PHP `label::get_label($name)`:
 *   1. `lang = lang::get_label_lang($lang)` (only lg-vlca→lg-cat remap),
 *   2. read the cache file (static-cached per request),
 *   3. return `ar_label[lang][name]` when present,
 *   4. else `component_common::decorate_untranslated($name)` =
 *      `'<mark>' . to_string($name) . '</mark>'`.
 *
 * The cache PREFIX is `{DEDALO_ENTITY}_{logged_user_id}_`. For the SUPERUSER
 * (root) the user_id is DEDALO_SUPERUSER = -1, so the file is
 * `{entity}_-1_cache_labels_{lang}.php`. Every native TS path is superuser-gated,
 * so we read the `-1` file (matching the labels the live root session serves).
 *
 * This module parses just the key→value map out of the file (no PHP runtime) and
 * exposes `LabelsCache.getLabel(name)`. Production resolves the file from the
 * install cache dir; tests inject a pinned map (no filesystem coupling) so the
 * suite stays hermetic.
 *
 * No module-global mutable state: the parsed map is returned to the caller, which
 * owns its lifetime (the server builds it once at boot and injects it).
 */

import { readFile } from 'node:fs/promises';

/** DEDALO_SUPERUSER sentinel — the cache-file user-id prefix for root. */
const DEDALO_SUPERUSER = -1;

/**
 * Port of component_common::decorate_untranslated for the non-null case:
 * `'<mark>' . to_string($string) . '</mark>'`. to_string() on a plain string is
 * identity, so this is just the wrap. Used as the missing-key fallback so a
 * missing label is byte-identical to PHP (visible <mark> tag, never silent '').
 */
export function decorateUntranslated(name: string): string {
  return `<mark>${name}</mark>`;
}

/**
 * A read-only UI-labels map for one language. `getLabel(name)` mirrors
 * `label::get_label($name, <pinned lang>)`: returns the cached value, else the
 * decorated-untranslated fallback. The language is fixed at construction (the
 * file is per-lang) — callers pass the already-resolved label lang.
 */
export interface LabelsCache {
  /** label::get_label($name) for the pinned lang (cache hit or <mark> fallback). */
  getLabel(name: string): string;
  /** Number of entries (diagnostics / boot log). */
  readonly size: number;
}

/**
 * Build a LabelsCache from an already-parsed key→value map. Used by tests (pinned
 * map) and by the file/env loaders.
 */
export function makeLabelsCache(map: ReadonlyMap<string, string>): LabelsCache {
  return {
    getLabel(name: string): string {
      const v = map.get(name);
      return v === undefined ? decorateUntranslated(name) : v;
    },
    get size() {
      return map.size;
    },
  };
}

/**
 * Parse a `{entity}_{user}_cache_labels_{lang}.php` cache file's text into a
 * key→value map.
 *
 * The file is a single-line PHP script:
 *   <?php return ['key'=>'value','k2'=>'v2', … ,'kN'=>'vN'];
 * Both keys and values are SINGLE-quoted PHP strings; the only escapes a PHP
 * single-quoted literal supports are `\'` (→ `'`) and `\\` (→ `\`). Any other
 * backslash is literal. There are no nested structures (string→string only).
 *
 * The parser scans single-quoted segments pairwise (key, value separated by
 * `=>`, entries by `,`). It is tolerant of arbitrary characters inside the
 * quoted strings (including `=>`, `,`, `<`, `>`). Returns null only when the
 * `<?php return [` opener is absent (not a labels cache file).
 */
export function parseLabelsCache(text: string): Map<string, string> | null {
  const openIdx = text.indexOf('[');
  if (openIdx === -1 || !/<\?php\s+return\s*\[/.test(text)) return null;

  const map = new Map<string, string>();
  let i = openIdx + 1;
  const n = text.length;

  // Read one single-quoted PHP string literal starting at the opening quote
  // index `start` (text[start] must be `'`). Returns [value, indexAfterClose].
  function readString(start: number): [string, number] | null {
    if (text[start] !== "'") return null;
    let out = '';
    let j = start + 1;
    while (j < n) {
      const ch = text[j];
      if (ch === '\\') {
        const next = text[j + 1];
        // PHP single-quote escapes: \' → ' and \\ → \. Anything else: literal backslash.
        if (next === "'" || next === '\\') {
          out += next;
          j += 2;
          continue;
        }
        out += '\\';
        j += 1;
        continue;
      }
      if (ch === "'") {
        return [out, j + 1];
      }
      out += ch;
      j += 1;
    }
    return null; // unterminated
  }

  // Advance i to the next single-quote (skipping `=>`, `,`, whitespace). Stops at
  // the closing `]` (end of map).
  function skipToQuoteOrEnd(): boolean {
    while (i < n) {
      const ch = text[i];
      if (ch === "'") return true;
      if (ch === ']') return false;
      i += 1;
    }
    return false;
  }

  while (skipToQuoteOrEnd()) {
    const keyRes = readString(i);
    if (keyRes === null) break;
    const [key, afterKey] = keyRes;
    i = afterKey;
    // expect `=>` then a value string
    if (!skipToQuoteOrEnd()) break;
    const valRes = readString(i);
    if (valRes === null) break;
    const [val, afterVal] = valRes;
    i = afterVal;
    map.set(key, val);
  }

  return map;
}

/** Build the cache file name: `cache_labels_{lang}.php` (label::build_cache_file_name). */
export function labelsCacheFileName(lang: string): string {
  return `cache_labels_${lang}.php`;
}

/**
 * Resolve + parse the labels cache file from an env map. Mirrors the PHP file
 * path: `{cache_dir}/{entity}_{user_id}_cache_labels_{lang}.php`, with
 * user_id = DEDALO_SUPERUSER (-1) for the root session every native path serves.
 *
 * Cache-dir resolution order matches the tools cache loader:
 *   1. DEDALO_CACHE_PATH      (the derived cache/ dir — where these live here)
 *   2. DEDALO_SESSIONS_PATH
 *   3. DEDALO_TOOLS_CACHE_DIR (explicit override; tried last for labels)
 * Lang = label::get_label_lang(DEDALO_APPLICATION_LANGS_DEFAULT) — only the
 * lg-vlca→lg-cat remap applies. Returns null when no candidate file is found
 * (→ search-mode element declines → proxies to PHP).
 */
export async function loadLabelsCacheFromEnv(
  env: Record<string, string | undefined> = process.env,
): Promise<LabelsCache | null> {
  const entity = env.DEDALO_ENTITY;
  if (!entity) return null;
  const rawLang = env.DEDALO_APPLICATION_LANGS_DEFAULT ?? 'lg-eng';
  const lang = rawLang === 'lg-vlca' ? 'lg-cat' : rawLang;
  const fileName = `${entity}_${DEDALO_SUPERUSER}_${labelsCacheFileName(lang)}`;
  const candidates = [
    env.DEDALO_CACHE_PATH,
    env.DEDALO_SESSIONS_PATH,
    env.DEDALO_TOOLS_CACHE_DIR,
  ].filter((d): d is string => typeof d === 'string' && d.length > 0);
  for (const dir of candidates) {
    const sep = dir.endsWith('/') ? '' : '/';
    let text: string;
    try {
      text = await readFile(`${dir}${sep}${fileName}`, 'utf8');
    } catch {
      continue;
    }
    const map = parseLabelsCache(text);
    if (map !== null) return makeLabelsCache(map);
  }
  return null;
}
