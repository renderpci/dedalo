/**
 * P2-12 / PUB-06, PUB-09 — the INVARIANT under the behavioural gate
 * (publication_budget_native): a DoS bound may exist in exactly ONE place, and every entry
 * layer of the publication API must reach it rather than declare its own.
 *
 * This is the census the audit asks for — TOTAL over (entry layer × bounded parameter) —
 * and it is a source census on purpose: publication_budget_native proves the bounds HOLD
 * today, at both doors; this file proves a third door cannot be opened without them. PUB-06
 * was not a wrong number, it was a second declaration of the same parameter at a layer the
 * first one did not cover, and only a scan over the whole entry surface refuses that shape.
 *
 * Scope is DERIVED from the tree (every .ts under the publication v2 src entry layers), not
 * from a list, with a floor; the exemptions are enumerated with a per-entry reason and are
 * shrink-only. Every leg carries a planted positive control, so a scan that stopped
 * matching would fail here rather than pass silently.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	PUBLICATION_API_V2_SRC,
	publicationApiV2EntryLayerFiles,
	publicationApiV2Files,
} from '../helpers/publication_corpus.ts';

// The root is the shared lister's — named there, never here.
const V2_ROOT = PUBLICATION_API_V2_SRC;

/**
 * The bounded parameter names, READ OUT OF the module that defines them rather than
 * retyped here: `BOUNDED_PARAMETERS` in validators.ts is the census key, so adding a bound
 * there extends this scan by itself.
 *
 * Parsed from the source rather than imported, deliberately: publication/server_api/v2 is
 * an isolated app with its own tsconfig, and importing it into the engine's TypeScript
 * program raises ~60 errors its own config does not — the engine must READ this package,
 * never link against it. The behavioural half of this row is the package's own gate,
 * publication/server_api/v2/tests/budget.test.ts, which imports the objects directly.
 */
function boundedNames(): string[] {
	const source = readFileSync(join(V2_ROOT, 'validators.ts'), 'utf8');
	const literal = /export const BOUNDED_PARAMETERS = \{([\s\S]*?)\n\} as const;/.exec(source);
	if (!literal)
		throw new Error(
			'BOUNDED_PARAMETERS literal not found in validators.ts — the census lost its key',
		);
	const body = literal[1] ?? '';
	return [...body.matchAll(/^\s*([a-z_]+):\s*bounded[A-Za-z]+,/gm)]
		.map((match) => match[1] ?? '')
		.filter(Boolean);
}

const BOUNDED_NAMES = boundedNames();

/**
 * The census FLOOR — every parameter that was bounded when this row was closed. Enumerated
 * and shrink-only: deleting a key from BOUNDED_PARAMETERS would otherwise shrink the scan
 * silently, which is exactly how a census stops seeing the thing it was built to see.
 * Growing the list is free; removing an entry is a decision that has to be argued here.
 */
const CENSUS_FLOOR = [
	'limit',
	'offset',
	'section_id',
	'max_characters',
	'max_occurrences',
	'q',
	'terms',
];

/**
 * The ENTRY LAYERS — every place a client-supplied value is turned into a schema — are
 * the shared publication lister's: the mcp/ and routes/ trees, walked recursively (a new
 * file in one of them is scanned the day it lands), plus validators.ts.
 */

/**
 * ENUMERATED exemptions — shrink-only, each with the reason it is not a bound.
 * Keyed `<relative file>:<parameter>`.
 */
const EXEMPT: Record<string, string> = {
	// validators.ts IS the one place a bound may be declared; that is the invariant, not a
	// hole in it. Its declarations are asserted positively below instead.
	'validators.ts:*': 'the single source of the bounds — the module every other layer must import',
};

/**
 * CODE ONLY. Every scan below reads the source with comments removed: this file's own
 * subject matter appears in prose all over the package ("z.coerce.boolean() is not a
 * parser", "config.TRUST_PROXY"), and a census that counted an explanation as an offender
 * would push the next author to delete the explanation. Strings are left intact — nothing
 * scanned here can hide in one.
 */
function codeOf(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// The corpus comes from the shared publication lister, which OWNS these roots
// (census_derivation_tripwire: a gate imports a lister rather than naming a
// directory in-file). The entry-layer and whole-tree shapes are its two exports.
function entryLayerFiles(): string[] {
	return publicationApiV2EntryLayerFiles();
}

function allSourceFiles(): string[] {
	return publicationApiV2Files();
}

/**
 * A locally-declared bound: `<bounded name>: z.…` — a schema built on the spot instead of
 * imported. A declaration that REFERENCES the shared module (`mcpBounded.limit`,
 * `boundedLimit.default(…)`) does not start with `z.` and is not an offender.
 */
function localBoundDeclarations(source: string, names: string[]): string[] {
	const hits: string[] = [];
	for (const name of names) {
		const pattern = new RegExp(`(^|[\\s{(,])${name}\\s*:\\s*z\\.`, 'gm');
		if (pattern.test(source)) hits.push(name);
	}
	return hits;
}

describe('publication API — every bounded parameter is declared once, in one module', () => {
	test('the scan sees the whole entry surface', () => {
		const files = entryLayerFiles();
		// Floor: the nine routes plus the MCP pair plus validators.ts. A scan that started
		// resolving nothing would sit under this.
		expect(files.length).toBeGreaterThan(10);
		expect(BOUNDED_NAMES.length).toBeGreaterThanOrEqual(CENSUS_FLOOR.length);
		for (const name of CENSUS_FLOOR) {
			expect({ name, bounded: BOUNDED_NAMES.includes(name) }).toEqual({ name, bounded: true });
		}
	});

	test('no entry layer declares its own copy of a bounded parameter', () => {
		const offenders: string[] = [];
		let scanned = 0;

		for (const file of entryLayerFiles()) {
			const relative = file.slice(V2_ROOT.length + 1);
			if (EXEMPT[`${relative}:*`]) continue;
			scanned++;
			const source = codeOf(readFileSync(file, 'utf8'));
			for (const name of localBoundDeclarations(source, BOUNDED_NAMES)) {
				if (EXEMPT[`${relative}:${name}`]) continue;
				offenders.push(`${relative}: ${name}`);
			}
		}

		expect(scanned).toBeGreaterThan(9);
		expect(offenders).toEqual([]);
	});

	test('positive control — a planted local declaration IS caught', () => {
		const planted = `
      export const badTool = {
        inputSchema: {
          table: z.string(),
          limit: z.number().optional().describe('Maximum number of results'),
        },
      };
    `;
		expect(localBoundDeclarations(planted, BOUNDED_NAMES)).toEqual(['limit']);
		// …and the shape the fix uses is NOT caught.
		const good = `inputSchema: { limit: mcpBounded.limit, offset: mcpBounded.offset }`;
		expect(localBoundDeclarations(good, BOUNDED_NAMES)).toEqual([]);
	});

	test('every bounded parameter is actually declared in the one module that may', () => {
		const source = codeOf(readFileSync(join(V2_ROOT, 'validators.ts'), 'utf8'));
		for (const name of BOUNDED_NAMES) {
			// Each census key maps to a `bounded…` object declared in this module — that mapping
			// is what makes the shared object, and not a matching number, the thing every door
			// parses.
			const mapped = new RegExp(`^\\s*${name}:\\s*bounded[A-Za-z]+,`, 'm').test(source);
			expect({ name, mapped }).toEqual({ name, mapped: true });
		}
		// The MCP shapes are built there too, from those objects.
		expect(source).toContain('export const mcpBounded');
		expect(source).toContain('export const BOUNDED_PARAMETERS');
	});
});

describe('publication API — an environment boolean is parsed, never coerced', () => {
	// z.coerce.boolean() is Boolean(input) and every env var is a string, so TRUST_PROXY=false
	// parsed TRUE (PUB-09: the documented mitigation was inert). The ban is repo-wide over the
	// package because the trap is the API, not one key.
	function coerceBooleanSites(source: string): number {
		return (source.match(/z\.coerce\.boolean\s*\(/g) ?? []).length;
	}

	test('no source file in the package coerces a boolean', () => {
		const files = allSourceFiles();
		expect(files.length).toBeGreaterThan(25);
		const offenders = files
			.map((file) => ({
				file: file.slice(V2_ROOT.length + 1),
				hits: coerceBooleanSites(codeOf(readFileSync(file, 'utf8'))),
			}))
			.filter((entry) => entry.hits > 0);
		expect(offenders).toEqual([]);
	});

	test('positive control — the banned call IS matched, and prose about it is not', () => {
		expect(coerceBooleanSites(codeOf('TRUST_PROXY: z.coerce.boolean().default(true),'))).toBe(1);
		expect(coerceBooleanSites(codeOf('TRUST_PROXY: envBooleanOptional,'))).toBe(0);
		expect(coerceBooleanSites(codeOf('/* z.coerce.boolean() is Boolean(input) */'))).toBe(0);
		expect(coerceBooleanSites(codeOf('// never z.coerce.boolean() here'))).toBe(0);
	});
});

describe('publication API — the proxy-trust decision has one owner', () => {
	function trustProxyReads(source: string): number {
		// Both keys: TRUST_PROXY decides WHETHER a forwarding header may be believed and
		// TRUSTED_PROXY_HOPS decides WHICH entry of it is the caller. Reading either raw
		// bypasses the derivation that gives the honest answer.
		return (
			source.match(/config\.TRUST_PROXY(?:_IN_STANDALONE)?\b|config\.TRUSTED_PROXY_HOPS/g) ?? []
		).length;
	}

	test('nothing outside config.ts reads the raw TRUST_PROXY value', () => {
		const files = allSourceFiles().filter((file) => !file.endsWith(`${'/'}config.ts`));
		expect(files.length).toBeGreaterThan(25);
		const offenders = files
			.map((file) => ({
				file: file.slice(V2_ROOT.length + 1),
				hits: trustProxyReads(codeOf(readFileSync(file, 'utf8'))),
			}))
			.filter((entry) => entry.hits > 0);
		// Reading the raw key is how the derivation (standalone ⇒ no trust) gets bypassed: the
		// resolved `trustProxy` export is the only honest answer.
		expect(offenders).toEqual([]);
	});

	test('positive control — a raw read IS matched, and prose about it is not', () => {
		expect(trustProxyReads(codeOf('if (config.TRUST_PROXY) { return header; }'))).toBe(1);
		expect(trustProxyReads(codeOf('const hops = config.TRUSTED_PROXY_HOPS;'))).toBe(1);
		expect(trustProxyReads(codeOf('export function clientIp(req, trusted = trustProxy)'))).toBe(0);
		expect(trustProxyReads(codeOf('// config.TRUST_PROXY used to be read here'))).toBe(0);
	});
});

describe('publication API — the forwarding header has exactly one reader', () => {
	/**
	 * PUB-09, second reproduction: the first fix read `X-Forwarded-For.split(',')[0]`, i.e.
	 * the LEFTMOST hop. Both shipped proxy configs APPEND (nginx `$proxy_add_x_forwarded_for`,
	 * Apache mod_proxy_http), so the leftmost entry is the CLIENT'S OWN TEXT and a rotating
	 * header still bought a fresh rate-limit bucket per request under the DEFAULT deployment
	 * mode. Which entry is the caller is a fact about the deployment (how many hops we add),
	 * so it may be derived in exactly ONE place; a second reader anywhere in the package is a
	 * second answer, and the wrong one is a rate-limit bypass over an API that is
	 * unauthenticated by default.
	 *
	 * That the surviving reader answers CORRECTLY is the package gate's job
	 * (publication/server_api/v2/tests/budget.test.ts: a rotating leftmost hop must not move
	 * the identity even WITH a proxy declared). This leg only guarantees there is one.
	 */
	const HEADER_OWNER = 'security/client-ip.ts';

	function forwardingHeaderReads(source: string): number {
		return (source.match(/['"`]x-(?:forwarded-for|real-ip)['"`]/gi) ?? []).length;
	}

	test('only client-ip.ts reads X-Forwarded-For / X-Real-IP', () => {
		const files = allSourceFiles();
		expect(files.length).toBeGreaterThan(25);
		const offenders = files
			.map((file) => ({
				file: file.slice(V2_ROOT.length + 1),
				hits: forwardingHeaderReads(codeOf(readFileSync(file, 'utf8'))),
			}))
			.filter((entry) => entry.hits > 0 && entry.file !== HEADER_OWNER);
		expect(offenders).toEqual([]);
	});

	test('the one owner does read it (the scan is not matching nothing)', () => {
		const owner = codeOf(readFileSync(join(V2_ROOT, HEADER_OWNER), 'utf8'));
		expect(forwardingHeaderReads(owner)).toBeGreaterThan(0);
	});

	test('positive control — a second reader IS matched, and prose about it is not', () => {
		expect(forwardingHeaderReads(codeOf("const ip = req.headers.get('x-forwarded-for');"))).toBe(1);
		expect(forwardingHeaderReads(codeOf("req.headers.get('X-Real-IP')"))).toBe(1);
		expect(forwardingHeaderReads(codeOf('// x-forwarded-for is appended by the proxy'))).toBe(0);
		expect(forwardingHeaderReads(codeOf('const ip = clientIp(req);'))).toBe(0);
	});
});
