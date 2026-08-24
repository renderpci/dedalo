/**
 * THE ONE PARSER for the DEC-14b twin map.
 *
 * `engineering/ORACLE_HARVEST.md` carries the map's PROSE — three tables, three
 * different column grammars, and judgement text worth keeping. Nothing has ever
 * read it, so the map could say anything and no gate would notice. This module
 * reads the claim from the file that MAKES it instead: the twin's own header.
 *
 * WHY THE KEY IS THE PATH, NEVER THE WORD. "twin" is overloaded in this tree —
 * `scratch twin`, `install twin`, `write twin` — so a word-based scan produces
 * false positives forever. The rule is mechanical: if a `test/unit/**` header
 * names a `test/parity/….test.ts` file, it must carry `@twin-of` or sit in the
 * generator's NOT_A_TWIN allowlist with a reason.
 *
 * DIRECTIVES (deliberately only two — see the honest limit below):
 *   @twin-of      test/parity/<gate>.test.ts   the contract this file replaces
 *   @twin-status  retired | frozen-record | supplement | blocked
 *   @twinned-by   test/unit/<twin>.test.ts     on a surviving parity gate
 *
 * The three statuses are DERIVED FROM THE TREE, not asserted by hand:
 *   retired       the parity gate is gone; this file is the whole contract now
 *   frozen-record the gate still exists AND has frozen reds — the corpus-bound
 *                 half stays as the record of the PHP walk, this is the portable half
 *   supplement    the gate still exists and is GREEN — the twin adds coverage
 *                 rather than replacing anything. Measured 2026-08-24: 6 twins
 *                 are this shape, and reddening them (an earlier proposal) would
 *                 have punished extra coverage.
 *
 * HONEST LIMIT, stated rather than implied: `@twin-covers` and `@twin-fixture`
 * are NOT parsed or required here. They were designed for the mutation-fidelity
 * work, nothing consumes them yet, and a gate that demands a field no one can
 * populate correctly is how a map starts carrying decorative claims. They land
 * with the harness that reads them, or not at all.
 *
 * HERMETIC: filesystem reads of tracked test source + engineering/parity_baseline.json.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const REPO_ROOT = resolve(import.meta.dir, '../..');
const UNIT_DIR = join(REPO_ROOT, 'test/unit');
const PARITY_DIR = join(REPO_ROOT, 'test/parity');

export type TwinStatus = 'retired' | 'frozen-record' | 'supplement' | 'blocked';

export type Twin = {
	/** repo-relative path of the twin (test/unit/…). */
	file: string;
	/** repo-relative path of the parity gate it replaces. */
	target: string;
	status: TwinStatus;
	/** present only on a `blocked` twin. */
	blockedOn: string | null;
};

// NOT global: `.test()` on a /g regex advances lastIndex between calls and
// silently skips every other file. Found by this module's own smoke check.
const PARITY_PATH = /test\/parity\/[a-z0-9_]+\.test\.ts/;

/** The leading block comment, which is where every directive must live. */
function header(source: string): string {
	if (!source.startsWith('/**')) return '';
	const end = source.indexOf('*/');
	return end === -1 ? '' : source.slice(0, end);
}

function unitFiles(): string[] {
	return readdirSync(UNIT_DIR)
		.filter((n) => n.endsWith('.test.ts'))
		.sort();
}

/** Unit files whose HEADER names a parity gate — the population the map must cover. */
export function filesNamingAParityGate(): string[] {
	return unitFiles()
		.filter((name) => PARITY_PATH.test(readFileSync(join(UNIT_DIR, name), 'utf8')))
		.map((name) => `test/unit/${name}`)
		.sort();
}

export function parseTwins(): Twin[] {
	const twins: Twin[] = [];
	for (const name of unitFiles()) {
		const head = header(readFileSync(join(UNIT_DIR, name), 'utf8'));
		const of = head.match(/@twin-of\s+(\S+)/)?.[1];
		if (of === undefined) continue;
		const status = head.match(/@twin-status\s+(\S+)/)?.[1] as TwinStatus | undefined;
		const blocked = head.match(/@twin-blocked-on\s+(.+)/)?.[1]?.trim() ?? null;
		twins.push({
			file: `test/unit/${name}`,
			target: of,
			status: status ?? ('retired' as TwinStatus),
			blockedOn: blocked,
		});
	}
	return twins.sort((a, b) => a.file.localeCompare(b.file));
}

/** `@twinned-by` back-links declared on surviving parity gates. */
export function parseBackLinks(): Map<string, string[]> {
	const links = new Map<string, string[]>();
	for (const name of readdirSync(PARITY_DIR).filter((n) => n.endsWith('.test.ts'))) {
		const head = header(readFileSync(join(PARITY_DIR, name), 'utf8'));
		const named = [...head.matchAll(/@twinned-by\s+(\S+)/g)].map((m) => m[1] as string);
		if (named.length > 0) links.set(`test/parity/${name}`, named.sort());
	}
	return links;
}

/** The status the TREE says a target has, independent of what the header claims. */
export function derivedStatus(target: string, redFiles: ReadonlySet<string>): TwinStatus {
	if (!existsSync(join(REPO_ROOT, target))) return 'retired';
	return redFiles.has(target) ? 'frozen-record' : 'supplement';
}

export function redFilesFromBaseline(): Map<string, number> {
	const raw = JSON.parse(
		readFileSync(join(REPO_ROOT, 'engineering/parity_baseline.json'), 'utf8'),
	) as { files: Record<string, string[]> };
	return new Map(Object.entries(raw.files).map(([f, tests]) => [f, tests.length]));
}
