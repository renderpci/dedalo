/**
 * Read-side port of the install-time REGISTERED-TOOLS cache that drives each
 * tool DDO's `properties` field.
 *
 * WHY THIS EXISTS
 * ---------------
 * `common::get_tools()` → `tool_common::create_tool_simple_context()` copies the
 * tool's `properties` verbatim from the simple_tool_object that
 * `tool_common::get_all_registered_tools()` returns. That method's authoritative
 * source is the entity-scoped FILE cache
 * `{entity}_cache_tools_all_registered_tools.php`
 * (written once by `import_tools()` via `dd_cache::cache_to_file`).
 *
 * That cache is NOT byte-derivable from the live matrix_tools DB row: the same
 * dd1335 DB value (`{open_as, windowFeatures}`) is served either FLAT (e.g.
 * tool_print, the most recently (re)cached tool) or lang-wrapped
 * `{lg-nolan:[<value>]}` (the older tools whose cache entry predates the current
 * component_json get_data() path). The live PHP server serves whatever the cache
 * holds, so to be byte-green we must read the SAME cache the server reads.
 *
 * The cache file is a PHP `<?php return [ 'name'=>(object)[...], ... ];` script
 * (a var_export-style dump by OpcacheObjectManager). This module parses just the
 * per-tool `properties` value out of it — no PHP runtime needed — and exposes it
 * as a name→properties map. Production resolves the file from the install paths;
 * tests inject a pinned map (no filesystem coupling) so the suite stays hermetic.
 *
 * No module-global mutable state: the parsed map is returned to the caller, which
 * owns its lifetime (the server builds it once at boot and injects it).
 */

import { readFile } from 'node:fs/promises';

/**
 * A name→properties map for the tool DDO `properties` field. A key PRESENT with
 * value `undefined`/`null` means "the cache entry exists but carries no
 * properties" (the DDO drops `properties`). A key ABSENT means the cache has no
 * entry for that tool — the caller falls back to the DB-derived form.
 */
export type ToolPropertiesMap = ReadonlyMap<string, unknown>;

/**
 * Parse a value out of the PHP var_export-style cache literal, starting at
 * `pos`. Supports exactly the subset the cache emits:
 *   - `(object)[ 'k'=>V, ... ]`   → object
 *   - `[ V, V, ... ]` / `[ 'k'=>V ]` → array (list) or, when keyed, object
 *   - `'string'` (with `\'` and `\\` escapes)
 *   - integer / float literals
 *   - `true` / `false` / `NULL`
 * Returns the decoded JS value and the index just past it.
 */
interface ParseResult {
  value: unknown;
  next: number;
}

function skipWs(text: string, pos: number): number {
  while (pos < text.length && (text[pos] === ' ' || text[pos] === '\n' || text[pos] === '\r' || text[pos] === '\t')) {
    pos++;
  }
  return pos;
}

function parsePhpString(text: string, pos: number): { value: string; next: number } {
  // pos is at the opening quote
  let i = pos + 1;
  let out = '';
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      const nxt = text[i + 1];
      // PHP single-quoted strings only escape \' and \\
      if (nxt === "'" || nxt === '\\') {
        out += nxt;
        i += 2;
        continue;
      }
      out += '\\';
      i += 1;
      continue;
    }
    if (ch === "'") {
      return { value: out, next: i + 1 };
    }
    out += ch;
    i += 1;
  }
  throw new Error('Unterminated PHP string at ' + pos);
}

function parsePhpValue(text: string, pos: number): ParseResult {
  pos = skipWs(text, pos);

  // (object)[ ... ]
  if (text.startsWith('(object)', pos)) {
    return parsePhpBracket(text, pos + '(object)'.length, true);
  }
  // [ ... ]
  if (text[pos] === '[') {
    return parsePhpBracket(text, pos, false);
  }
  // 'string'
  if (text[pos] === "'") {
    const s = parsePhpString(text, pos);
    return { value: s.value, next: s.next };
  }
  // keywords
  if (text.startsWith('NULL', pos) || text.startsWith('null', pos)) {
    return { value: null, next: pos + 4 };
  }
  if (text.startsWith('true', pos)) {
    return { value: true, next: pos + 4 };
  }
  if (text.startsWith('false', pos)) {
    return { value: false, next: pos + 5 };
  }
  // number (int or float, optional sign)
  const numMatch = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(pos));
  if (numMatch) {
    return { value: Number(numMatch[0]), next: pos + numMatch[0].length };
  }
  throw new Error('Unexpected token at ' + pos + ': ' + JSON.stringify(text.slice(pos, pos + 20)));
}

/**
 * Parse a `[ ... ]` body (pos at the `[`). When `forceObject` the result is an
 * object regardless of keys (PHP `(object)[]`); otherwise a `'k'=>V` body yields
 * an object and a positional body yields an array.
 */
function parsePhpBracket(text: string, pos: number, forceObject: boolean): ParseResult {
  pos = skipWs(text, pos);
  if (text[pos] !== '[') throw new Error('Expected [ at ' + pos);
  pos++; // past [
  pos = skipWs(text, pos);

  const list: unknown[] = [];
  const obj: Record<string, unknown> = {};
  let keyed = false;

  if (text[pos] === ']') {
    return { value: forceObject ? {} : [], next: pos + 1 };
  }

  for (;;) {
    pos = skipWs(text, pos);
    // Detect a keyed entry: 'key'=>value  OR  int=>value
    const entryStart = pos;
    let key: string | null = null;
    if (text[pos] === "'") {
      const s = parsePhpString(text, pos);
      const afterKey = skipWs(text, s.next);
      if (text.startsWith('=>', afterKey)) {
        key = s.value;
        pos = afterKey + 2;
        keyed = true;
      } else {
        pos = entryStart; // positional string value
      }
    } else {
      const km = /^(\d+)\s*=>/.exec(text.slice(pos));
      if (km) {
        key = km[1]!;
        pos += km[0].length;
        keyed = true;
      }
    }

    const parsed = parsePhpValue(text, pos);
    if (key !== null) {
      obj[key] = parsed.value;
    } else {
      list.push(parsed.value);
    }
    pos = skipWs(text, parsed.next);
    if (text[pos] === ',') {
      pos++;
      pos = skipWs(text, pos);
      if (text[pos] === ']') {
        // trailing comma
        pos++;
        break;
      }
      continue;
    }
    if (text[pos] === ']') {
      pos++;
      break;
    }
    throw new Error('Expected , or ] at ' + pos);
  }

  if (forceObject || keyed) return { value: obj, next: pos };
  return { value: list, next: pos };
}

/**
 * Extract the `properties` value for every tool from the PHP registered-tools
 * cache text. Scans for each top-level `'name'=>(object)[ ... 'properties'=>V ... ]`
 * entry and parses just that V. Keys present in the result map to their
 * properties (possibly null); tools without a `properties` key are recorded with
 * `undefined` so the caller knows the entry existed.
 *
 * Robust to the cache's ordering/whitespace: it locates each tool block by its
 * top-level key and, within the block, the first `'properties'=>` token.
 */
export function parseToolPropertiesCache(text: string): ToolPropertiesMap {
  const out = new Map<string, unknown>();

  // Find each top-level entry "'tool_xxx'=>(object)[". Tool names are
  // ^tool_[a-z0-9_]+$ (validate_register), so a name-keyed object opener is an
  // unambiguous block start.
  const entryRe = /'(tool_[a-z0-9_]+)'\s*=>\s*\(object\)\[/g;
  let m: RegExpExecArray | null;
  const starts: { name: string; objStart: number }[] = [];
  while ((m = entryRe.exec(text)) !== null) {
    starts.push({ name: m[1]!, objStart: m.index + m[0].length - 1 }); // objStart at the '['
  }

  for (let i = 0; i < starts.length; i++) {
    const { name, objStart } = starts[i]!;
    try {
      // Parse the FULL tool object block (objStart at its `[`), then read its
      // OWN top-level `properties` key. A naive `indexOf("'properties'=>")` is
      // WRONG: a tool block can carry a NESTED `properties` key (e.g. tool_lang's
      // `ontology` descriptor holds `'properties'=>NULL` before the tool's own
      // top-level `'properties'=>(object)[...]`), so the first textual match picks
      // the nested null and drops the real value. Structural parsing extracts the
      // top-level key unambiguously. `(object)` precedes the `[` at objStart.
      const objText = '(object)' + text.slice(objStart);
      const parsed = parsePhpValue(objText, 0);
      const value = parsed.value;
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const rec = value as Record<string, unknown>;
        // A top-level `properties` key present (even null) → use it; absent →
        // record `undefined` so the caller knows the entry existed without props.
        out.set(name, 'properties' in rec ? rec.properties : undefined);
      } else {
        out.set(name, undefined);
      }
    } catch {
      // A parse failure for one tool must not poison the rest; record absence so
      // the caller falls back to the DB-derived form for that tool.
      // (Intentionally swallow: malformed cache entries are non-fatal.)
      out.delete(name);
    }
  }

  return out;
}

/**
 * Load the registered-tools properties map from the install-time cache FILE.
 * Returns null when the file is missing/unreadable (the caller then has no
 * override map → DB-derived properties for every tool).
 *
 * @param filePath absolute path to `{entity}_cache_tools_all_registered_tools.php`
 */
export async function loadToolPropertiesFromCacheFile(filePath: string): Promise<ToolPropertiesMap | null> {
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
  return parseToolPropertiesCache(text);
}

/**
 * Resolve the install-time registered-tools cache file path + parse it, from a
 * Dédalo-style env map. Mirrors:
 *   DEDALO_CACHE_MANAGER['files_path'] = DEDALO_SESSIONS_PATH (the cache dir)
 *   filename = DEDALO_ENTITY . '_cache_tools_all_registered_tools.php'
 *
 * Resolution order for the cache directory (the PHP install writes the file to
 * DEDALO_CACHE_MANAGER['files_path'], which an install may point at either the
 * derived cache/ or sessions/ dir — so try the common candidates):
 *   1. DEDALO_TOOLS_CACHE_DIR (explicit override)
 *   2. DEDALO_CACHE_PATH      (the derived cache/ dir)
 *   3. DEDALO_SESSIONS_PATH   (the derived sessions/ dir)
 * The first candidate whose cache file exists+parses wins. Entity from
 * DEDALO_ENTITY. Returns null when no candidate file is found (→ no override map
 * → DB-derived properties).
 */
export async function loadToolPropertiesFromEnv(
  env: Record<string, string | undefined> = process.env,
): Promise<ToolPropertiesMap | null> {
  const entity = env.DEDALO_ENTITY;
  if (!entity) return null;
  const fileName = `${entity}_cache_tools_all_registered_tools.php`;
  const candidates = [
    env.DEDALO_TOOLS_CACHE_DIR,
    env.DEDALO_CACHE_PATH,
    env.DEDALO_SESSIONS_PATH,
  ].filter((d): d is string => typeof d === 'string' && d.length > 0);
  for (const dir of candidates) {
    const sep = dir.endsWith('/') ? '' : '/';
    const map = await loadToolPropertiesFromCacheFile(`${dir}${sep}${fileName}`);
    if (map !== null) return map;
  }
  return null;
}
