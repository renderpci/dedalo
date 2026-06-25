/**
 * PHP json_encode option flag values, reproduced with their exact PHP integer
 * values so call sites can mirror PHP code directly (e.g. `JSON_UNESCAPED_UNICODE
 * | JSON_UNESCAPED_SLASHES`). Only the flags Dédalo's output paths actually use
 * are modelled; others are intentionally omitted until a real call site needs them.
 *
 * Reference: core/db/class.json_handler.php::encode (default JSON_UNESCAPED_UNICODE)
 * and the API response path in core/api/v1/json/index.php.
 */
export const JSON_UNESCAPED_SLASHES = 64;
export const JSON_PRETTY_PRINT = 128;
export const JSON_UNESCAPED_UNICODE = 256;

/** Bitmask of the supported PHP json_encode flags. */
export type JsonFlags = number;

/** All flags Dédalo recognises; used to reject unsupported bits early. */
export const SUPPORTED_FLAGS: JsonFlags =
  JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE;
