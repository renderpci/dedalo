/**
 * TRIPWIRE — `engineering/` is the half that travels with the code, and it had
 * NO currency gate at all (P3-2 / GATE-47).
 *
 * `docs_current_engine_tripwire` scans `docs/` only. `engineering/` is defined
 * as "what the system IS" — the permanent definitions a consumer of the engine
 * reads — and nothing checked that it still described the system.
 *
 * THE LIVE CONSEQUENCE: MEDIA_SPEC §11 instructed a developer to "pin the live
 * corpus for the gates (this install, `dedalo_mib_v7`)" and tabled MANDATORY
 * fixtures naming `rsc*` tipos, while AGENTS.md states the opposite and
 * `generic_tld_tripwire` mechanically REFUSES it. A developer following the
 * spec writes a gate the ratchet rejects — the spec and the enforcement
 * disagreed, and only the enforcement was armed.
 *
 * THE RULE. A spec that names the live application database must carry a DATED
 * ADDENDUM, so a reader meets the correction before the stale instruction. It
 * is deliberately not "must never mention it": the observation history is
 * genuinely useful, and deleting it would lose why these behaviours are known.
 * What must not happen is a reader taking it as a current instruction.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const ENGINEERING = join(REPO_ROOT, 'engineering');

/** The live APPLICATION database. Never a fixture source, never a gate target. */
const LIVE_APP_DB = 'dedalo_mib_v7';

/**
 * Files that necessarily QUOTE the forbidden shapes rather than instruct them.
 * TRIPWIRES.md is the machine-read gate index: every row describes what a gate
 * refuses, so it names `dedalo_mib_v7` and "pin the live corpus" BY DESIGN — as
 * this very gate's own row does, which is how it first reddened itself.
 */
const QUOTES_NOT_INSTRUCTS = new Set(['engineering/TRIPWIRES.md']);

/** A dated addendum — the pattern the specs already use. */
const DATED_ADDENDUM = /ADDENDUM\s+\(?\d{4}-\d{2}-\d{2}/i;

function specs(): { file: string; body: string }[] {
	const found: { file: string; body: string }[] = [];
	for (const rel of new Glob('**/*.md').scanSync({ cwd: ENGINEERING })) {
		found.push({ file: `engineering/${rel}`, body: readFileSync(join(ENGINEERING, rel), 'utf8') });
	}
	return found.sort((a, b) => a.file.localeCompare(b.file));
}

describe('engineering/ describes the system as it IS', () => {
	const all = specs();

	test('the scan reads the tree (anti-vacuity)', () => {
		expect(all.length).toBeGreaterThan(10);
		expect(all.map((entry) => entry.file)).toContain('engineering/TRIPWIRES.md');
	});

	test('a spec naming the live application database carries a dated addendum', () => {
		const offenders = all
			// The WC ledger is DATED BY CONSTRUCTION — each entry's filename carries
			// the date (WC-yyyy-mm-dd-slug) and each records one measurement made on
			// that day. It is a history, never an instruction.
			.filter((entry) => !entry.file.startsWith('engineering/wire_contract/'))
			.filter((entry) => !QUOTES_NOT_INSTRUCTS.has(entry.file))
			.filter((entry) => entry.body.includes(LIVE_APP_DB))
			.filter((entry) => !DATED_ADDENDUM.test(entry.body))
			.map((entry) => entry.file);
		expect(
			offenders,
			`These specs name ${LIVE_APP_DB} — the LIVE application database — with no dated ` +
				'addendum. A reader takes the surrounding text as current instruction, and the ' +
				'instruction is refused by generic_tld_tripwire and by the test-database marker. ' +
				`Add an addendum saying what has overtaken it.\n  ${offenders.join('\n  ')}`,
		).toEqual([]);
	});

	test('no spec instructs a gate to target the live database', () => {
		// The sharper form: prose telling the reader to PIN or REQUIRE the live
		// corpus, rather than merely recording that it was observed there.
		const offenders: string[] = [];
		for (const { file, body } of all) {
			if (file.startsWith('engineering/wire_contract/')) continue;
			if (QUOTES_NOT_INSTRUCTS.has(file)) continue;
			// A dated addendum at the top of a SECTION covers that whole section —
			// which is how the specs already write their corrections, and what a
			// reader actually meets on the way to the table.
			let sectionAddended = false;
			for (const [index, line] of body.split('\n').entries()) {
				if (/^#{1,4}\s/.test(line)) sectionAddended = false;
				if (DATED_ADDENDUM.test(line)) sectionAddended = true;
				if (sectionAddended) continue;
				if (!/\b(pin|mandatory|required)\b/i.test(line)) continue;
				if (!new RegExp(`${LIVE_APP_DB}|\\b(?:rsc|oh|numisdata|tch|ich|mdcat)\\d+\\b`).test(line)) {
					continue;
				}
				if (line.trimStart().startsWith('>')) continue;
				offenders.push(`${file}:${index + 1}  ${line.trim().slice(0, 100)}`);
			}
		}
		expect(
			offenders,
			'A spec must not instruct a gate to pin the live install corpus — tests use the ' +
				'generic `test` TLD and BUILD the situation they test.\n  ' +
				offenders.join('\n  '),
		).toEqual([]);
	});
});
