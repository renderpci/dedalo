/**
 * PUBLICATION-HOST PAIRING TRIPWIRE (DEC-12: every documented invariant has a mechanical gate).
 *
 * ONE WORK ENGINE, ONE PUBLICATION AGENT — proved, not assumed
 * (engineering/PUBLICATION_HOST_SPEC.md §2 rule 3).
 *
 * THE FAILURE IT GUARDS. The engine's half of the pairing will be a few lines in
 * `../private/.env` (phase 3), the most copy-pasted artifact an operator owns. Carried from
 * institution A's work host to B's, it points A's engine at B's publication agent — and
 * `release.install` runs pushed code, so a working mis-pairing is A deploying onto B's
 * public host. The agent publishes `sha256('dedalo-publication-host:' + instance + '\n' +
 * token)` on its one unauthenticated route; the engine recomputes it and refuses before it
 * sends anything else.
 *
 * WHAT IS PINNED HERE:
 *
 *   1. THE TWO SIDES COMPUTE THE SAME FINGERPRINT. The recipe is spelled twice — the engine
 *      in src/core/publication_host/pairing.ts, the agent in
 *      publication/host_agent/src/security/pairing.ts — because they are separate
 *      deployables sharing no module. Both import NOTHING, so both are RUN here side by
 *      side, and a golden vector pins the recipe against both drifting together.
 *   2. DOMAIN SEPARATION FROM THE SITE BUILDER. Same (instance, token) ⇒ a DIFFERENT
 *      fingerprint than `dedalo-site-instance:` gives, so a proof minted for one protocol is
 *      never valid for the other (plan D3). Neither recipe's literal appears on the other side.
 *   3. THE MATCH IS STRICT AND CONSTANT-TIME. Anything that is not 64 lowercase hex — on
 *      either side — is a mismatch, never a pass; the compare is an XOR accumulator.
 *   4. THE REFUSAL IS ONE REFUSAL. A wrong instance and a wrong token both yield a
 *      well-formed, non-matching hex: the caller cannot tell which half it got wrong, so the
 *      check is not an enumeration oracle for either half.
 *   5. NO THIRD SPELLING. The prefix literal lives in exactly the two recipe files across
 *      every shipped first-party code file (the registered test/helpers/shipped_text_corpus.ts
 *      roots: src/, scripts/, tools/, publication/, client/, deploy/; test trees excluded);
 *      every other consumer imports one of them.
 *
 * HERMETIC: no database, no ../private, no network. Source reads + in-process calls only.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// The AGENT's own copy of the recipe, imported straight out of the other package. It
// imports nothing, which is exactly what makes this comparison possible.
import {
	PAIRING_FINGERPRINT_PREFIX as AGENT_PREFIX,
	instanceFingerprint as agentFingerprint,
} from '../../publication/host_agent/src/security/pairing.ts';
// The site builder's two spellings — the OTHER protocol this one must never collide with.
import {
	PAIRING_FINGERPRINT_PREFIX as SITE_DAEMON_PREFIX,
	instanceFingerprint as siteDaemonFingerprint,
} from '../../publication/site_builder/src/security/pairing.ts';
import {
	PUBLICATION_HOST_FINGERPRINT_PREFIX,
	publicationHostFingerprint,
	publicationHostFingerprintMatches,
} from '../../src/core/publication_host/pairing.ts';
import {
	PAIRING_FINGERPRINT_PREFIX as SITE_ENGINE_PREFIX,
	instanceFingerprint as siteEngineFingerprint,
} from '../../src/core/site_builder/pairing.ts';
// The registered shipped-text lister owns the corpus roots (census_derivation_tripwire
// refuses a gate that chooses its own walk roots in-file).
import { shippedTextFiles } from '../helpers/shipped_text_corpus.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), 'utf8');

const ENGINE_FILE = 'src/core/publication_host/pairing.ts';
const AGENT_FILE = 'publication/host_agent/src/security/pairing.ts';
const PREFIX = 'dedalo-publication-host:';

const INSTANCE = 'test';
const TOKEN = 'publication-host-gate-token-0000000000';
/** sha256('dedalo-publication-host:test\n' + TOKEN), computed once by hand (2026-10-03). */
const GOLDEN = 'ae18e7caf38e4ad763e5f26f0710219492dbf2517c346e481730c9400532b894';
const HEX64 = /^[0-9a-f]{64}$/;

/** Every (instance, token) shape either side can produce. */
const CASES: readonly (readonly [string, string])[] = [
	[INSTANCE, TOKEN],
	['a', 'b'],
	// The separator's whole job: `ab` + `cde` must not collide with `abc` + `de`.
	['ab', 'cde'],
	['abc', 'de'],
	['museum_with_a_long_name', 'x'.repeat(64)],
	['test', ''],
	['', TOKEN],
	['tést_ünïcode', 'tøken-ñ'],
];

/** Source with comments blanked (same rule as scripts/lib/site_builder_census.ts `strip`). */
function strip(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// `tests` / `test`: a gate PINS the literal on purpose (this file, the package's own
// tests/pairing.test.ts); a test tree is never a consumer that could fork the recipe.
// `dist` / `build`: generated output, not a source that could fork it.
const SKIP_SEGMENTS = new Set(['tests', 'test', 'dist', 'build']);
const CODE_FILE = /\.(ts|js|mjs)$/;

/**
 * Every shipped first-party CODE file (repo-relative, codepoint order) outside test trees —
 * the registered lister's roots (client, tools, src, scripts, publication, deploy) are a
 * superset of the src/ scripts/ tools/ publication/ the recipe could be forked into.
 */
function shippedCodeFiles(): string[] {
	return shippedTextFiles().filter(
		(file) =>
			CODE_FILE.test(file) &&
			!file.endsWith('.d.ts') &&
			!file.split('/').some((segment) => SKIP_SEGMENTS.has(segment)),
	);
}

// ---------------------------------------------------------------------------
// Rule 1 — the two implementations of one recipe
// ---------------------------------------------------------------------------

describe('the engine and the agent compute the same pairing fingerprint', () => {
	test('identical output on every case, and always 64 lowercase hex', () => {
		for (const [instance, token] of CASES) {
			const engine = publicationHostFingerprint(instance, token);
			expect(engine).toBe(agentFingerprint(instance, token));
			expect(engine).toMatch(HEX64);
		}
	});

	test('the golden vector pins the recipe on BOTH sides (a joint drift is still red)', () => {
		expect(publicationHostFingerprint(INSTANCE, TOKEN)).toBe(GOLDEN);
		expect(agentFingerprint(INSTANCE, TOKEN)).toBe(GOLDEN);
	});

	test('the separator makes the encoding unambiguous', () => {
		expect(publicationHostFingerprint('ab', 'cde')).not.toBe(
			publicationHostFingerprint('abc', 'de'),
		);
	});

	test('the prefix is one literal, spelled the same on both sides', () => {
		expect(PUBLICATION_HOST_FINGERPRINT_PREFIX).toBe(PREFIX);
		expect(AGENT_PREFIX).toBe(PREFIX);
		// Read from SOURCE as well, so a rename that kept the value is still visible.
		expect(read(ENGINE_FILE)).toContain(`= '${PREFIX}'`);
		expect(read(AGENT_FILE)).toContain(`= '${PREFIX}'`);
	});

	test('both modules import NOTHING (what lets a root gate load the agent copy)', () => {
		for (const file of [ENGINE_FILE, AGENT_FILE]) {
			const code = strip(read(file));
			expect(code, `${file} must be import-free`).not.toMatch(/\bimport\b|\brequire\s*\(/);
			// Anti-vacuity: the file really is the recipe.
			expect(code).toContain('CryptoHasher');
		}
	});
});

// ---------------------------------------------------------------------------
// Rule 2 — domain separation from the site-builder pairing
// ---------------------------------------------------------------------------

describe('the publication-host proof is never a site-builder proof', () => {
	test('the two protocols use different prefixes', () => {
		expect(SITE_ENGINE_PREFIX).toBe('dedalo-site-instance:');
		expect(SITE_DAEMON_PREFIX).toBe(SITE_ENGINE_PREFIX);
		expect(PUBLICATION_HOST_FINGERPRINT_PREFIX).not.toBe(SITE_ENGINE_PREFIX);
	});

	test('the same (instance, token) gives DIFFERENT fingerprints across the two protocols', () => {
		for (const [instance, token] of CASES) {
			const host = publicationHostFingerprint(instance, token);
			expect(host).not.toBe(siteEngineFingerprint(instance, token));
			expect(host).not.toBe(siteDaemonFingerprint(instance, token));
			// A site-builder daemon answering where an agent was expected is a MISMATCH.
			expect(publicationHostFingerprintMatches(host, siteDaemonFingerprint(instance, token))).toBe(
				false,
			);
		}
	});

	test("neither protocol's literal appears in the other's recipe files", () => {
		for (const file of [ENGINE_FILE, AGENT_FILE]) {
			expect(strip(read(file))).not.toContain(SITE_ENGINE_PREFIX);
		}
		for (const file of [
			'src/core/site_builder/pairing.ts',
			'publication/site_builder/src/security/pairing.ts',
		]) {
			expect(strip(read(file))).not.toContain(PREFIX);
		}
	});
});

// ---------------------------------------------------------------------------
// Rule 3 — the match: strict shape, constant time
// ---------------------------------------------------------------------------

describe('publicationHostFingerprintMatches refuses everything that is not the exact hex', () => {
	const expected = publicationHostFingerprint(INSTANCE, TOKEN);

	test('the exact hex matches', () => {
		expect(publicationHostFingerprintMatches(expected, expected)).toBe(true);
		expect(publicationHostFingerprintMatches(expected, agentFingerprint(INSTANCE, TOKEN))).toBe(
			true,
		);
	});

	test('a malformed PUBLISHED value is a mismatch, never a pass', () => {
		// An agent too old (or too broken) to publish the field must not be trusted by omission.
		const malformed: unknown[] = [
			undefined,
			null,
			'',
			0,
			true,
			[expected],
			{ toString: () => expected },
			new String(expected),
			expected.toUpperCase(),
			expected.slice(0, -1),
			`${expected}0`,
			` ${expected}`,
			`${expected.slice(0, -1)}g`,
		];
		for (const published of malformed) {
			expect(publicationHostFingerprintMatches(expected, published)).toBe(false);
		}
	});

	test('a malformed EXPECTED value matches nothing, not even itself', () => {
		for (const bad of ['', 'abc', expected.toUpperCase(), `${expected}0`, 'g'.repeat(64)]) {
			expect(publicationHostFingerprintMatches(bad, bad)).toBe(false);
		}
	});

	test('the compare is an XOR accumulator, not an early-exit equality', () => {
		const code = strip(read(ENGINE_FILE));
		const body = code.slice(code.indexOf('function publicationHostFingerprintMatches'));
		expect(body.length).toBeGreaterThan(40);
		expect(body).toMatch(/\^/);
		expect(body).not.toMatch(/expected\s*[!=]==?\s*published|published\s*[!=]==?\s*expected/);
		expect(body).not.toMatch(/\.(indexOf|includes|localeCompare|startsWith)\s*\(/);
	});
});

// ---------------------------------------------------------------------------
// Rule 4 — one refusal for both wrong halves
// ---------------------------------------------------------------------------

describe('a wrong instance and a wrong token are indistinguishable', () => {
	test('both are a well-formed, non-matching hex, and the same verdict', () => {
		const expected = publicationHostFingerprint(INSTANCE, TOKEN);
		const wrongInstance = agentFingerprint('other_museum', TOKEN);
		const wrongToken = agentFingerprint(INSTANCE, `${TOKEN}x`);
		const unknownInstance = agentFingerprint('no_such_instance', 'z'.repeat(40));
		for (const published of [wrongInstance, wrongToken, unknownInstance]) {
			expect(published).toMatch(HEX64);
			expect(published).not.toBe(expected);
			expect(publicationHostFingerprintMatches(expected, published)).toBe(false);
		}
		expect(wrongInstance).not.toBe(wrongToken);
	});
});

// ---------------------------------------------------------------------------
// Rule 5 — no third spelling
// ---------------------------------------------------------------------------

describe('the recipe is spelled exactly twice', () => {
	test('the prefix literal lives only in the two recipe files', () => {
		const files = shippedCodeFiles();
		// Anti-vacuity: the walk really saw the trees (both recipe files among them).
		expect(files).toContain(ENGINE_FILE);
		expect(files).toContain(AGENT_FILE);
		expect(files.length).toBeGreaterThan(800);
		const spellers = files.filter((file) => strip(read(file)).includes(PREFIX));
		expect(spellers).toEqual([AGENT_FILE, ENGINE_FILE].sort());
	});
});
