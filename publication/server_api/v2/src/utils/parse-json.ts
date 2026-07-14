/**
 * The one decode step between the driver and the API's JSON: it turns Dédalo's
 * JSON-in-TEXT columns back into structure, so the wire carries real objects and
 * arrays rather than strings containing JSON.
 *
 * Every read path runs through it — db/query-builder.executeQuery, and the
 * hand-built fetches in resolve.service and search.service — because the decision
 * cannot be made per column: nothing in the published schema marks which TEXT
 * columns are JSON. So the shape of the VALUE is the only evidence available, and
 * this module is that heuristic, kept in one place and applied uniformly.
 *
 * Unwrapping is ONE level deep per string: a parsed value is not re-scanned, so JSON
 * nested inside a JSON string stays a string. The recursion below walks the row
 * structure, not the results of parsing.
 */

// Recursively parses JSON-string columns (Dédalo stores JSON in TEXT columns, which
// the driver hands back as strings) into real objects/arrays. Rows are freshly
// fetched and owned by the caller, so this mutates them in place to avoid
// rebuilding an object per row/value. Output is identical to a rebuild.
export function parseJsonStrings<T>(data: T): T {
  if (data === null || typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    const arr = data as unknown[];
    for (let i = 0; i < arr.length; i++) {
      arr[i] = parseJsonStrings(arr[i]);
    }
    return data;
  }

  const obj = data as Record<string, unknown>;
  for (const key in obj) {
    const value = obj[key];
    if (typeof value === 'string') {
      if (isJsonLike(value)) {
        try {
          obj[key] = JSON.parse(value);
        } catch {
          // leave the original string on parse failure
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      parseJsonStrings(value); // recurse in place
    }
  }

  return data;
}

/**
 * Cheap pre-filter: only strings that could plausibly be a JSON object/array are
 * handed to JSON.parse. It must also END with the matching bracket — a transcription
 * beginning "[sic] the witness said…" opens with `[` but is prose, and trying to parse
 * every such field was pure waste. (Parsing still fails safely — the catch keeps the
 * original string — so this is about not treating ordinary text as a parse candidate.)
 */
function isJsonLike(value: string): boolean {
  if (value.length < 2) return false;

  const first = value[0];
  const last = value[value.length - 1];

  return (first === '[' && last === ']') || (first === '{' && last === '}');
}
