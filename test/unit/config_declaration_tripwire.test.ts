/**
 * CONFIG-DECLARATION TRIPWIRE (DEC-12: an invariant is tripwired or it is deleted).
 *
 * WHY THIS EXISTS. `CatalogEntry.type` calls itself "the SEMANTIC type of the value", and
 * until this gate NOTHING read it except one line of `readers.ts` (`emptyIsUnset`). A
 * declaration nothing checks is decoration, and decoration drifts:
 *
 *   DEDALO_DIFFUSION_LANGS was declared `type: 'string'`, LABELLED `array`, documented with
 *   a JSON-array example, and read with a bare `readEnv()` plus a hand-written `.split(',')`
 *   at four separate call sites. The v6→v7 migration JSON-encodes the v6 array, so the
 *   engine CSV-split `["lg-spa","lg-cat","lg-eng","lg-fra"]` into four phantom language
 *   codes (`["lg-spa"`, `"lg-cat"`, …) and published garbage without a word of complaint.
 *
 * Three declarations described that key and all three disagreed. So the gate has two teeth,
 * one for each way the disagreement can be stated:
 *
 *   TOOTH 1 — the catalog must agree WITH ITSELF: the printed `typeLabel` and the fenced
 *             `KEY=…` example must both match the declared `type`. Tooth 1(b) is the one
 *             that would have caught the bug above at the moment it was written.
 *   TOOTH 2 — the catalog must agree with the CODE: a key whose declared type needs parsing
 *             may not be read raw, because a raw read is where the hand-rolled parser goes.
 *
 * Neither tooth is a style opinion. Each one names a way an operator's correctly-written
 * value silently becomes something else.
 */

import { describe, expect, test } from 'bun:test';
import { CONFIG_CATALOG } from '../../src/config/catalog/index.ts';
import type { CatalogEntry, ConfigType } from '../../src/config/catalog_types.ts';
import { envKeyCallSites } from '../helpers/env_key_scan.ts';

const entries = (): [string, CatalogEntry][] => Object.entries(CONFIG_CATALOG);

// ---------------------------------------------------------------------------
// The SHAPE a declared type resolves to.
//
// `ConfigType` has ten members but only five shapes — what an operator writes and what
// the reader hands back. The mapping is exhaustive by construction (the `satisfies`
// below): a new ConfigType member cannot be added without deciding its shape here, which
// is the point. `media_access_mode` is a scalar: the operator writes one bare word.
// ---------------------------------------------------------------------------
type Shape = 'list' | 'map' | 'boolean' | 'number' | 'string';

const SHAPE_OF = {
	string: 'string',
	number: 'number',
	boolean: 'boolean',
	string_list: 'list',
	json_array: 'list',
	server_list: 'list',
	tool_roots: 'list',
	string_map: 'map',
	media_access_mode: 'string',
} satisfies Record<ConfigType, Shape>;

const shapeOf = (type: ConfigType): Shape => SHAPE_OF[type];

// ---------------------------------------------------------------------------
// TOOTH 1(a) — the printed label agrees with the declared type.
//
// `typeLabel` is FREE-FORM by design (`render.ts` prints it verbatim: 'int || false',
// 'array of objects (JSON)', '*deprecated; use X*'), so this cannot be an equality check.
// The rule is derived from reading every label in the catalog, and constrains only the
// four words whose meaning is unambiguous — a label may be vaguer than the type, never
// CONTRADICT it:
//
//   'array', 'array of objects', 'serialized array', 'string[]'  =>  a LIST type
//   'object'                                                     =>  a MAP type
//   'bool'                                                       =>  the BOOLEAN type
//   'string', 'path'                                             =>  a STRING-shaped type
//
// The first match wins, in that order, so 'array of objects' is a list and not a map.
//
// DELIBERATELY UNCONSTRAINED: the numeric labels ('int', 'float', 'int (milliseconds)').
// They are prose about a value's RANGE as often as its type, and pinning them down is a
// separate burn-down — see the deferral note under tooth 2. One real mismatch is known and
// reported rather than silently tolerated: DEDALO_PDF_FOLDER holds '/pdf' and is labelled
// 'int'. It is a label typo in a file this gate's author does not own, not a parse hazard.
// ---------------------------------------------------------------------------
function labelShape(typeLabel: string): Shape | undefined {
	const label = typeLabel.toLowerCase();
	if (label.includes('array') || label.includes('[]')) return 'list';
	if (label.includes('object')) return 'map'; // 'array of objects' already returned above
	if (label.includes('bool')) return 'boolean';
	if (label.includes('string') || label.includes('path')) return 'string';
	return undefined; // numeric and bespoke labels: no claim, no contradiction
}

// ---------------------------------------------------------------------------
// TOOTH 1(b) — the fenced example parses as the declared type.
//
// The example is the ONLY thing in the generated census that shows an operator what a
// value looks like, and it is the line they copy. An example that does not parse as its
// own declared type is a documented way to misconfigure the engine.
// ---------------------------------------------------------------------------

/** Are all brackets/braces closed (and no string left open)? A crude, sufficient scanner. */
function balanced(text: string): boolean {
	let depth = 0;
	let inString = false;
	for (let i = 0; i < text.length; i++) {
		const char = text[i] as string;
		if (inString) {
			if (char === '\\') i++;
			else if (char === '"') inString = false;
			continue;
		}
		if (char === '"') inString = true;
		else if (char === '[' || char === '{') depth++;
		else if (char === ']' || char === '}') depth--;
	}
	return depth === 0 && !inString;
}

/**
 * Every `KEY=…` value written in a fenced block of this entry's own `doc`.
 *
 * Two shapes have to survive extraction, because both are legitimately in the catalog:
 *   - a JSON value pretty-printed across several lines (ONTOLOGY_SERVERS) — read on until
 *     the brackets balance;
 *   - a one-line shell command with an env prefix (`DEDALO_DEV_MODE=true bun run dev`) —
 *     take the first whitespace-delimited token, which is exactly what the shell itself
 *     does. Without this rule the command tail would be read as part of the value and the
 *     gate would report a defect that only exists in its own parser.
 */
function examplesOf(key: string, doc: string): string[] {
	const found: string[] = [];
	for (const block of doc.matchAll(/```[a-z]*\n([\s\S]*?)```/g)) {
		const lines = (block[1] as string).split('\n');
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i] as string;
			if (!line.startsWith(`${key}=`)) continue;
			let value = line.slice(key.length + 1);
			const opener = value.trimStart()[0];
			if (opener === '[' || opener === '{') {
				while (!balanced(value) && i + 1 < lines.length) value += `\n${lines[++i] as string}`;
			} else if (opener !== '"' && opener !== "'") {
				value = value.trim().split(/\s/)[0] as string; // the shell's own tokenization
			}
			found.push(value.trim());
		}
	}
	return found;
}

/** Strip one matched pair of surrounding quotes — `DEDALO_AV_QUALITY_DEFAULT="404"`. */
function unquote(value: string): string {
	const first = value[0];
	const last = value.at(-1);
	const quoted = value.length >= 2 && first === last && (first === '"' || first === "'");
	return quoted ? value.slice(1, -1) : value;
}

/** Why this example does NOT parse as the declared type — or undefined when it does. */
function exampleDefect(type: ConfigType, rawValue: string): string | undefined {
	const value = rawValue.trim();
	const looksStructured = value.startsWith('[') || value.startsWith('{');
	let decoded: unknown;
	let isJson = false;
	if (looksStructured) {
		try {
			decoded = JSON.parse(value);
			isJson = true;
		} catch {
			isJson = false;
		}
	}
	switch (shapeOf(type)) {
		case 'string':
			// THE DEDALO_DIFFUSION_LANGS TOOTH. A bracketed example under a scalar type is
			// the exact shape of that bug: the doc promises an array, the reader hands the
			// consumer one string, and whatever hand-rolled split follows invents values.
			return looksStructured ? `array/object-shaped example under type '${type}'` : undefined;
		case 'number': {
			const scalar = unquote(value);
			if (scalar === 'false') return undefined; // the documented 'int || false' keys
			return Number.isFinite(Number(scalar)) ? undefined : 'not a number';
		}
		case 'boolean':
			return unquote(value) === 'true' || unquote(value) === 'false' ? undefined : 'not true/false';
		case 'list':
			if (type === 'string_list' && !looksStructured) return undefined; // a comma list is legal
			// A value that OPENS with '[' has already promised JSON to `readList`, which
			// tries JSON first and falls back to a comma split ON THE RAW STRING — brackets
			// and all — when the parse fails. So near-JSON is the worst possible input: the
			// operator gets '[FIRST_ITEM' and 'LAST_ITEM]' as values and no error anywhere.
			return isJson && Array.isArray(decoded)
				? undefined
				: 'starts with [ but is not valid JSON — readList comma-splits it, brackets included';
		case 'map':
			return isJson && decoded !== null && typeof decoded === 'object' && !Array.isArray(decoded)
				? undefined
				: 'must be a JSON object';
	}
}

describe('config declaration: the catalog type is load-bearing', () => {
	test('the printed typeLabel does not contradict the declared type', () => {
		const contradictions = entries()
			.filter(([, entry]) => {
				const claimed = labelShape(entry.typeLabel);
				return claimed !== undefined && claimed !== shapeOf(entry.type);
			})
			.map(([key, entry]) => `${key}: type '${entry.type}' labelled '${entry.typeLabel}'`);

		// The label is what an administrator READS; the type is what the engine BELIEVES.
		// When they disagree, one of the two is lying and there is no way to tell which
		// from the outside — which is how a key labelled 'array' was read as a string.
		expect(contradictions.sort()).toEqual([]);
	});

	test('every fenced example parses as its own declared type', () => {
		const defects: string[] = [];
		for (const [key, entry] of entries()) {
			for (const example of examplesOf(key, entry.doc)) {
				const defect = exampleDefect(entry.type, example);
				if (defect !== undefined) defects.push(`${key}: ${defect} — ${key}=${example}`);
			}
		}

		// The example is the line an operator copies. If it cannot survive the reader its
		// own key is declared for, the manual is instructions for breaking the install.
		expect(defects.sort()).toEqual([]);
	});

	test('the example census is not silently shrinking', () => {
		// Tooth 1(b) can only judge entries that HAVE an example, so "no examples" would
		// read as "no defects". config_docs_tripwire already demands one per
		// operator-facing key; this floor covers the rest and makes the coverage visible.
		const withExample = entries().filter(([key, e]) => examplesOf(key, e.doc).length > 0);
		expect(withExample.length).toBeGreaterThanOrEqual(264); // measured 2026-08-23: 264 of 274
	});
});

// ---------------------------------------------------------------------------
// TOOTH 2 — the raw door.
//
// `readEnv`/`requireEnv` hand back the RAW string. For a scalar key that is the whole
// answer; for anything with structure it is the beginning of a hand-rolled parser, and a
// hand-rolled parser is precisely what shredded DEDALO_DIFFUSION_LANGS. So: a key whose
// declared type is not a scalar must be read through the catalog-backed reader that knows
// its encoding (`readList`, `readJsonArray`, `readMap`, `readServerList`, `readToolRoots`).
//
// SCOPE, STATED SO IT IS NOT MISTAKEN FOR THOROUGHNESS: this tooth checks only that a
// STRUCTURED key is not read raw. It does NOT check that every scalar key reaches the
// right scalar reader (`readString` on a `number` key, and so on) — that was measured at
// ~63 sites on 2026-08-23 and is an explicitly deferred burn-down, not a hole nobody saw.
// Deferring it here is what keeps this gate at zero exemptions instead of sixty-three.
// ---------------------------------------------------------------------------

/** The readers that return the raw, unparsed string. */
const RAW_READERS = new Set(['readEnv', 'requireEnv']);

/**
 * SHRINK-ONLY. A structured key that is legitimately read raw, each with the reason it
 * cannot go through a catalog reader. Growing this list is how the invariant dies, so the
 * count below is pinned: adding an entry is a deliberate edit to two places at once.
 */
const RAW_READ_ALLOWLIST: Readonly<Record<string, string>> = {
	DEDALO_AGENT_MODELS:
		// An array of OBJECTS. `readJsonArray` maps every element through String(), which
		// would turn each model descriptor into "[object Object]". The key owns a real
		// parser instead (src/ai/agent/model_catalog.ts agentModelCatalog): fail-closed,
		// throwing a typed ModelCatalogError on malformed JSON, an unknown field or one bad
		// entry — stricter than any generic reader, which is why it wants the raw string.
		'array of objects with a dedicated fail-closed validator (agentModelCatalog)',
};

describe('config declaration: structured keys are not read raw', () => {
	test('the allowlist has not grown', () => {
		expect(Object.keys(RAW_READ_ALLOWLIST).length).toBe(1);
	});

	test('no bare readEnv/requireEnv on a key that needs parsing', () => {
		const violations = envKeyCallSites()
			// A comment that QUOTES a call is not a call — config.ts documents this very
			// defect by writing `readEnv('DEDALO_DIFFUSION_LANGS')` in its own header.
			.filter((site) => !site.commented)
			.filter((site) => RAW_READERS.has(site.callee))
			.filter((site) => RAW_READ_ALLOWLIST[site.key] === undefined)
			.filter((site) => {
				const entry = CONFIG_CATALOG[site.key];
				// A key with no catalog entry is config_docs_tripwire's failure to report,
				// not this gate's — it must not be indicted twice with two different stories.
				return (
					entry !== undefined &&
					shapeOf(entry.type) !== 'string' &&
					shapeOf(entry.type) !== 'number' &&
					shapeOf(entry.type) !== 'boolean'
				);
			})
			.map((site) => `${site.key} [${CONFIG_CATALOG[site.key]?.type}] ${site.file}:${site.line}`);

		expect(violations.sort()).toEqual([]);
	});
});
