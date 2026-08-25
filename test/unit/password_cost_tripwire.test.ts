/**
 * PASSWORD COST HAS ONE DEFINITION, AND STORED HASHES CATCH UP TO IT (P2-7, 2026-08-24).
 *
 * Every `Bun.password.hash` call in this codebase used to pass `{ algorithm: 'argon2id' }`
 * and inherit whatever cost the runtime chose. Two problems, and the second is the one
 * that matters for an archive:
 *
 *  - the cost of a heritage institution's password hashes was a property of whichever
 *    Bun version happened to be installed the day each account was created, changing
 *    silently under a runtime upgrade in EITHER direction, with nothing in the repo
 *    recording what was actually used;
 *  - and there was no path back. `isArgon2Hash` passes any `$argon2…` string through
 *    untouched by design (it is what makes export→import round-trips work), so a hash
 *    made under weak parameters stayed weak forever — no login, no password change and
 *    no migration would ever revisit it.
 *
 * So: one constant, imported everywhere, and an UPGRADE-ONLY rehash at the one moment
 * the plaintext exists — a successful verify.
 *
 * HONEST LIMIT: this proves the parameters are stated in one place and that the
 * upgrade predicate is correct. It does not measure the actual work done (that is the
 * runtime's business) and it does not prove the rehash lands — `rehashStoredPassword`
 * is deliberately best-effort and off the login's critical path.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { Glob } from 'bun';
import { ARGON2_OPTIONS, needsPasswordRehash } from '../../src/core/security/argon2_params.ts';
import { stripComments } from '../helpers/strip_comments.ts';

const PARAMS_MODULE = 'src/core/security/argon2_params.ts';

/** Every non-test .ts under the given roots. */
function sourceFiles(): string[] {
	const out: string[] = [];
	for (const root of ['src', 'tools', 'scripts']) {
		for (const file of new Glob('**/*.ts').scanSync({ cwd: root, absolute: false })) {
			if (file.includes('.test.')) continue;
			out.push(`${root}/${file}`);
		}
	}
	return out;
}

describe('argon2 cost: one definition', () => {
	test('no hash call anywhere passes its own options', () => {
		// A cost chosen per call site is a cost that drifts per call site, and a weaker
		// hash looks exactly like a stronger one.
		const offenders: string[] = [];
		for (const file of sourceFiles()) {
			const source = readFileSync(file, 'utf8');
			// Up to the statement END, not the first ')': the decoy hashes
			// `crypto.randomUUID()`, whose own paren would truncate a lazy match and
			// report a compliant call site as an offender.
			for (const match of source.matchAll(/Bun\.password\.hash\(([\s\S]*?)\);/g)) {
				const args = match[1] ?? '';
				if (!args.includes('ARGON2_OPTIONS')) offenders.push(`${file}: ${args.trim()}`);
			}
		}
		expect(offenders).toEqual([]);
	});

	test('the cost literals live ONLY in the params module', () => {
		// CODE only: `parallelism` is an ordinary English word and appears in prose
		// about the external transport's concurrency cap. Strip comments first, which
		// is what the rest of this repo's source scans do for the same reason.
		const offenders = sourceFiles().filter((file) => {
			if (file === PARAMS_MODULE) return false;
			const code = stripComments(readFileSync(file, 'utf8'));
			return /\b(memoryCost|timeCost|parallelism)\s*:/.test(code);
		});
		expect(offenders).toEqual([]);
	});

	test('ANTI-VACUITY: the literal scan really fires on an offender', () => {
		const synthetic = stripComments('const x = { memoryCost: 4096, timeCost: 1 };');
		expect(/\b(memoryCost|timeCost|parallelism)\s*:/.test(synthetic)).toBe(true);
	});

	test('every hashing call site imports the constant (anti-vacuity)', () => {
		// If the scan above ever matched nothing, it would pass silently. Pin the
		// census of real hashing sites so an emptied scan is red.
		const importers = sourceFiles().filter((file) =>
			readFileSync(file, 'utf8').includes('ARGON2_OPTIONS'),
		);
		expect(importers.length).toBeGreaterThanOrEqual(6);
		expect(importers).toContain('src/core/security/password_hash.ts');
		// The DECOY must be cost-matched or the failure path is distinguishable again
		// by exactly the difference (AUTHZ-03).
		expect(importers).toContain('src/core/security/auth.ts');
	});

	test('the parameters are explicit and at least the runtime default', () => {
		expect(ARGON2_OPTIONS.algorithm).toBe('argon2id');
		expect(ARGON2_OPTIONS.memoryCost).toBeGreaterThanOrEqual(65_536);
		expect(ARGON2_OPTIONS.timeCost).toBeGreaterThanOrEqual(3);
	});
});

describe('argon2 cost: the rehash predicate is UPGRADE-ONLY', () => {
	test("the runtime's old default is upgraded", () => {
		expect(needsPasswordRehash('$argon2id$v=19$m=65536,t=2,p=1$c2FsdA$aGFzaA')).toBe(true);
	});

	test('a weaker hash on the memory axis is upgraded', () => {
		expect(needsPasswordRehash('$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA')).toBe(true);
	});

	test('a hash already at the target is left alone', () => {
		expect(needsPasswordRehash('$argon2id$v=19$m=65536,t=3,p=1$c2FsdA$aGFzaA')).toBe(false);
	});

	test('a STRONGER hash is never rewritten downwards', () => {
		// PHP's password_hash(PASSWORD_ARGON2ID) used m=65536,t=4. Rewriting it would be
		// a silent security regression performed by a routine login — and those are
		// exactly the hashes an install carries from before the rewrite.
		expect(needsPasswordRehash('$argon2id$v=19$m=65536,t=4,p=1$c2FsdA$aGFzaA')).toBe(false);
		expect(needsPasswordRehash('$argon2id$v=19$m=131072,t=3,p=1$c2FsdA$aGFzaA')).toBe(false);
	});

	test('anything not a parseable argon2 hash is left alone', () => {
		// Not knowing a credential's cost is not a reason to rewrite it.
		for (const value of ['', 'plaintext', '$2y$10$abc', '$argon2id$broken', null, 42]) {
			expect(needsPasswordRehash(value)).toBe(false);
		}
	});

	test('a real hash from the shared options does not ask to be rehashed', async () => {
		// The end-to-end shape: what we produce must satisfy what we demand, or every
		// login would rewrite every password forever.
		const hash = await Bun.password.hash('correct horse', ARGON2_OPTIONS);
		expect(hash).toContain(
			`m=${String(ARGON2_OPTIONS.memoryCost)},t=${String(ARGON2_OPTIONS.timeCost)}`,
		);
		expect(needsPasswordRehash(hash)).toBe(false);
	});
});
