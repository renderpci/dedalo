/**
 * TRIPWIRE — a field the CLIENT consumes is a field the SERVER emits
 * (P2-26 / DEAD-05).
 *
 * `grep -rn transliterate src/ --include=*.ts` returns nothing: the TS engine
 * emits no `transliterate_value` on any data item, while four client modules
 * read it. The parity ledger test lists it among the PHP data-item fields —
 * confirming a PHP-era emission the rewrite DROPPED — and that test never FAILS
 * (it reports), with this field sitting in its known-fields allowlist. So the
 * one place that could have noticed was configured not to.
 *
 * Two consequences, both curator-facing: the sibling-language value hint never
 * renders (a translation aid silently gone from a MULTILINGUAL system), and the
 * cross-language id share is dead code — which matters because that is the
 * guard keeping an empty-but-existing IRI entry out of the clear-all path
 * (P0-8 / DATA-06).
 *
 * A dropped emission is a SCOPE NARROWING, which this project's law forbids
 * doing silently. Ledger:
 * engineering/wire_contract/WC-2026-08-31-client-reads-three-fields-the-engine-never-emits.md
 *
 * SHRINK-ONLY: a fourth field is a new narrowing and reds this gate; removing
 * one — by emitting it, or by deciding to delete its readers — is the burn-down.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** A field read off a data item in the browser: `self.data.<field>`. */
const DATA_FIELD_READ = /\bself\.data\.([a-z_][a-z0-9_]*)/g;

/**
 * Fields the client reads that the engine never emits, each with what is lost.
 * ENUMERATED and shrink-only — never a category.
 */
const NOT_EMITTED: Record<string, string> = {
	transliterate_value:
		'PHP-era emission the rewrite dropped (4 client modules). The sibling-language value ' +
		'hint never renders and the cross-language id share is dead code — the guard that keeps ' +
		'an empty-but-existing IRI entry out of P0-8/DATA-06 clear-all path. Emitting it is ' +
		'engine work on the component_input_text / component_iri read path.',
	q_lang: 'A search-language annotation the client is prepared to show and never receives.',
	permissions_indexation:
		'An indexation-permission hint the client branches on and never receives.',
};

/** Every `self.data.<field>` the browser reads, outside comments. */
function clientDataFields(): Map<string, Set<string>> {
	const reads = new Map<string, Set<string>>();
	for (const match of new Glob('**/*.js').scanSync({ cwd: join(REPO_ROOT, 'client') })) {
		const file = `client/${match}`;
		for (const line of readFileSync(join(REPO_ROOT, file), 'utf8').split('\n')) {
			const trimmed = line.trim();
			// Prose ABOUT a field is not a read of it — two of these modules carry
			// long comments naming transliterate_value while describing the bug.
			if (trimmed.startsWith('*') || trimmed.startsWith('//')) continue;
			for (const hit of line.matchAll(DATA_FIELD_READ)) {
				const field = hit[1] as string;
				if (!reads.has(field)) reads.set(field, new Set());
				(reads.get(field) as Set<string>).add(file);
			}
		}
	}
	return reads;
}

/** Everything the engine's source so much as mentions — deliberately generous. */
function engineSource(): string {
	const parts: string[] = [];
	for (const match of new Glob('**/*.ts').scanSync({ cwd: join(REPO_ROOT, 'src') })) {
		if (match.includes('.test.')) continue;
		parts.push(readFileSync(join(REPO_ROOT, 'src', match), 'utf8'));
	}
	return parts.join('\n');
}

describe('a field the client consumes is a field the server emits', () => {
	const reads = clientDataFields();
	const source = engineSource();

	test('both sides are actually read (anti-vacuity)', () => {
		// A set difference over an empty side proves nothing.
		expect(reads.size).toBeGreaterThan(20);
		expect(source.length).toBeGreaterThan(1_000_000);
		// A field the engine certainly emits must read as emitted, or the matcher
		// is broken and every field would look present.
		expect(reads.has('value') || reads.has('lang')).toBe(true);
	});

	test('no NEW field is read by the client and emitted by nothing', () => {
		const orphans = [...reads.keys()]
			.filter((field) => !new RegExp(`\\b${field}\\b`).test(source))
			.filter((field) => NOT_EMITTED[field] === undefined)
			.sort();
		expect(
			orphans,
			'The client reads these off a data item and the engine never emits them. That is a ' +
				'scope narrowing, which this project does not do silently: emit the field, or ' +
				'delete its readers AND ledger the narrowing in engineering/wire_contract/.\n  ' +
				orphans.join('\n  '),
		).toEqual([]);
	});

	test('the known list may only SHRINK, and every entry is still real', () => {
		for (const [field, reason] of Object.entries(NOT_EMITTED)) {
			expect(reason.length, `${field}: a narrowing needs a stated cost`).toBeGreaterThan(60);
			// Still read by the client? If not, the readers were deleted and the
			// entry must go with them.
			expect(
				reads.has(field),
				`${field} is no longer read by any client module — DELETE its entry`,
			).toBe(true);
			// Still un-emitted? If the engine now emits it, the narrowing is CLOSED
			// and leaving the entry here would hide the next one.
			expect(
				new RegExp(`\\b${field}\\b`).test(source),
				`${field} IS emitted now — the narrowing is closed, DELETE its entry`,
			).toBe(false);
		}
	});

	test('the narrowing carries its wire-contract ledger line', () => {
		const ledger = join(
			REPO_ROOT,
			'engineering/wire_contract/WC-2026-08-31-client-reads-three-fields-the-engine-never-emits.md',
		);
		const text = readFileSync(ledger, 'utf8');
		for (const field of Object.keys(NOT_EMITTED)) {
			expect(text, `the ledger entry does not name ${field}`).toContain(field);
		}
	});
});
