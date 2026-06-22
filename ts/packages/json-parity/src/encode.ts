import {
  JSON_PRETTY_PRINT,
  JSON_UNESCAPED_SLASHES,
  JSON_UNESCAPED_UNICODE,
  SUPPORTED_FLAGS,
  type JsonFlags,
} from './flags.ts';

/**
 * Thrown when a value cannot be encoded the way PHP's json_encode would handle it.
 * PHP returns `false` (which `json_handler::encode` turns into a RuntimeException)
 * for NAN/INF and malformed UTF-8; we throw eagerly so a bad value never silently
 * becomes the string "null" (which is what JS `JSON.stringify` would produce).
 */
export class JsonEncodeError extends Error {
  override name = 'JsonEncodeError';
}

/**
 * A value that must be serialised as a JSON object with its keys in *insertion*
 * order. Use this instead of a plain object whenever keys may be numeric strings:
 * PHP associative arrays preserve insertion order, but JS plain objects reorder
 * integer-like keys ascending (`{"2":..,"1":..}` iterates as `1,2`). A `Map`
 * never reorders, so it reproduces PHP exactly. Plain objects are still accepted
 * for the common all-string-key case.
 */
export type JsonObject = Map<string, unknown> | { [k: string]: unknown };

/**
 * Encode `value` to a JSON string that is byte-for-byte identical to what PHP's
 * `json_encode($value, $flags)` produces for the supported flag set.
 *
 * Divergences from JS `JSON.stringify` that this handles (all verified against
 * PHP 8.5, serialize_precision=-1):
 *   - forward slashes are escaped to `\/` unless JSON_UNESCAPED_SLASHES is set;
 *   - non-ASCII is escaped to lowercase `\uXXXX` (with surrogate pairs) unless
 *     JSON_UNESCAPED_UNICODE is set;
 *   - control chars below 0x20 use `\b \f \n \r \t` or lowercase `\u00xx`;
 *   - `-0` is preserved (JS prints `0`);
 *   - bigint renders as exact integer digits (JS Number loses precision > 2^53);
 *   - NaN / Infinity throw (JS prints `null`);
 *   - pretty-print uses 4-space indent and `": "`, with empty arrays/objects inline.
 *
 * Known, intentionally-unhandled edge (documented, not yet needed by any data path):
 *   - very large/small floats where PHP switches to `1.0e+20`-style exponents at a
 *     different threshold than JS. Such magnitudes do not occur in Dédalo data; the
 *     golden-master corpus will flag it if one ever does.
 *
 * @param value  any JS value; use `Map` for objects whose key order must be exact.
 * @param flags  PHP json_encode bitmask (default mirrors json_handler::encode).
 */
export function dedaloJsonEncode(
  value: unknown,
  flags: JsonFlags = JSON_UNESCAPED_UNICODE,
): string {
  if ((flags & ~SUPPORTED_FLAGS) !== 0) {
    throw new JsonEncodeError(`Unsupported json_encode flags: ${flags & ~SUPPORTED_FLAGS}`);
  }
  const opts = {
    unescapedUnicode: (flags & JSON_UNESCAPED_UNICODE) !== 0,
    unescapedSlashes: (flags & JSON_UNESCAPED_SLASHES) !== 0,
    pretty: (flags & JSON_PRETTY_PRINT) !== 0,
  };
  return encodeValue(value, opts, 1);
}

interface EncodeOpts {
  unescapedUnicode: boolean;
  unescapedSlashes: boolean;
  pretty: boolean;
}

const PRETTY_INDENT = '    '; // PHP JSON_PRETTY_PRINT uses 4 spaces

function encodeValue(value: unknown, opts: EncodeOpts, depth: number): string {
  if (value === null || value === undefined) {
    // PHP has no `undefined`; treat it as null at the top level. (Inside objects,
    // undefined-valued keys are dropped before reaching here.)
    return 'null';
  }
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      return encodeNumber(value);
    case 'bigint':
      return value.toString();
    case 'string':
      return encodeString(value, opts);
    case 'object':
      if (Array.isArray(value)) return encodeArray(value, opts, depth);
      if (value instanceof Map) return encodeObjectEntries([...value.entries()], opts, depth);
      return encodeObjectEntries(Object.entries(value as Record<string, unknown>), opts, depth);
    default:
      // functions, symbols — PHP would never see these.
      throw new JsonEncodeError(`Cannot encode value of type ${typeof value}`);
  }
}

function encodeNumber(n: number): string {
  if (Number.isNaN(n) || !Number.isFinite(n)) {
    throw new JsonEncodeError('Inf and NaN cannot be JSON encoded');
  }
  if (Object.is(n, -0)) return '-0'; // PHP prints -0; JS String(-0) === "0"
  return String(n);
}

function encodeArray(arr: readonly unknown[], opts: EncodeOpts, depth: number): string {
  if (arr.length === 0) return '[]';
  const parts = arr.map((v) => encodeValue(v === undefined ? null : v, opts, depth + 1));
  if (!opts.pretty) return `[${parts.join(',')}]`;
  const pad = PRETTY_INDENT.repeat(depth);
  const closePad = PRETTY_INDENT.repeat(depth - 1);
  return `[\n${parts.map((p) => pad + p).join(',\n')}\n${closePad}]`;
}

function encodeObjectEntries(
  entries: ReadonlyArray<readonly [string, unknown]>,
  opts: EncodeOpts,
  depth: number,
): string {
  // Drop undefined-valued keys, matching JSON.stringify (PHP has no undefined).
  const kept = entries.filter(([, v]) => v !== undefined && typeof v !== 'function' && typeof v !== 'symbol');
  if (kept.length === 0) return '{}';
  if (!opts.pretty) {
    const body = kept
      .map(([k, v]) => `${encodeString(k, opts)}:${encodeValue(v, opts, depth + 1)}`)
      .join(',');
    return `{${body}}`;
  }
  const pad = PRETTY_INDENT.repeat(depth);
  const closePad = PRETTY_INDENT.repeat(depth - 1);
  const body = kept
    .map(([k, v]) => `${pad}${encodeString(k, opts)}: ${encodeValue(v, opts, depth + 1)}`)
    .join(',\n');
  return `{\n${body}\n${closePad}}`;
}

const HEX = '0123456789abcdef';

function unicodeEscape(cp: number): string {
  // Produces lowercase \uXXXX, with a surrogate pair for code points above the BMP.
  if (cp <= 0xffff) {
    return '\\u' + hex4(cp);
  }
  const c = cp - 0x10000;
  const high = 0xd800 + (c >> 10);
  const low = 0xdc00 + (c & 0x3ff);
  return '\\u' + hex4(high) + '\\u' + hex4(low);
}

function hex4(n: number): string {
  return (
    HEX[(n >> 12) & 0xf]! +
    HEX[(n >> 8) & 0xf]! +
    HEX[(n >> 4) & 0xf]! +
    HEX[n & 0xf]!
  );
}

function encodeString(s: string, opts: EncodeOpts): string {
  let out = '"';
  // Iterate by code point so astral characters are handled as one unit.
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    switch (cp) {
      case 0x22: out += '\\"'; continue;   // "
      case 0x5c: out += '\\\\'; continue;  // \
      case 0x2f: out += opts.unescapedSlashes ? '/' : '\\/'; continue; // /
      case 0x08: out += '\\b'; continue;
      case 0x09: out += '\\t'; continue;
      case 0x0a: out += '\\n'; continue;
      case 0x0c: out += '\\f'; continue;
      case 0x0d: out += '\\r'; continue;
    }
    if (cp < 0x20) {
      out += '\\u00' + HEX[(cp >> 4) & 0xf]! + HEX[cp & 0xf]!;
    } else if (cp < 0x80) {
      out += ch; // printable ASCII (incl. 0x7f DEL, which PHP leaves raw)
    } else if (opts.unescapedUnicode) {
      out += ch; // raw UTF-8
    } else {
      out += unicodeEscape(cp);
    }
  }
  return out + '"';
}
