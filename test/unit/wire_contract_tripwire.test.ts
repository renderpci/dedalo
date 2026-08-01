/**
 * WIRE_CONTRACT LEDGER tripwire (DEC-12: every documented invariant has one).
 *
 * The ledger of deliberate PHP→TS wire divergences is `engineering/wire_contract/`, ONE
 * FILE PER ENTRY, and `engineering/WIRE_CONTRACT.md` is the rules that govern it. Ids are
 * cited from ~30 test files and from `docs/` — a `WC-` id is a permanent reference, so the
 * things that can rot are: an id that names no entry, and two entries that answer to the
 * same id.
 *
 * WHY THIS LAYOUT AND THIS GATE (2026-08-01). The ledger used to be one 4,090-line file
 * with sequentially numbered entries appended at the end. Both halves of that failed under
 * more than one developer:
 *   - THE NUMBER. Allocating `WC-nnn` requires knowing what everyone else has taken.
 *     `WC-006` was issued TWICE — the 2026-07-07 `tool_common` relocation and the
 *     2026-07-09 installer diagnostics grid — and both went on to be cited from live code
 *     (`dedalo_files_differential` means the first; `src/core/install/server_info.ts` meant
 *     the second). Nobody noticed for three weeks. `WC-070` was allocated and never used.
 *   - THE FILE. Even with distinct numbers, two developers appending to the same last line
 *     conflict on every merge, in a document whose entries are entirely independent of one
 *     another.
 * One file per entry removes the second (two new entries are two new files, and git has
 * nothing to conflict on); the dated `WC-yyyy-mm-dd-slug` grammar removes the first. This
 * gate is what keeps both true, because a convention that is not mechanical is a wish.
 *
 * SIX ASSERTIONS:
 *   1. every entry file's h1 id equals its filename prefix (the filename IS the index —
 *      there is deliberately no committed index to conflict on);
 *   2. no two entries answer to the same id;
 *   3. ids match a known grammar, and the sequential one is FROZEN — a new `WC-082` is
 *      the exact mistake that produced the duplicate `WC-006`;
 *   4. no entry is appended back into `WIRE_CONTRACT.md`, which is the rules, not a ledger;
 *   5. no citation pairs the RULES file's path with an entry id — the entries left that
 *      file, so `WIRE_CONTRACT.md WC-016` now misdirects the reader who follows it;
 *   6. every `WC-` id cited in any hand-written source or prose file resolves to an entry
 *      that exists (scope: SCANNED_DIRS × SCANNED_EXTENSIONS — see the note there; it is
 *      the whole hand-written tree, but it is a NAMED scope, not a hand-wave).
 *
 * COST: reads the ~80 entry files + every hand-written source/prose file in SCANNED_DIRS
 * (~4s). DB-less, network-less → hermetic tier.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const LEDGER_DIR = 'engineering/wire_contract';
const RULES_FILE = 'engineering/WIRE_CONTRACT.md';
const SELF = 'test/unit/wire_contract_tripwire.test.ts';

/**
 * WHERE A CITATION CAN LIVE. Every directory holding hand-written source or prose, and
 * every extension one is written in — NOT a convenient subset.
 *
 * The first draft of this gate scanned six directories and four extensions and its header
 * still claimed "anywhere in the tree". `client/` was missing, though AGENTS.md calls it
 * the PRIMARY TS-OWNED client source; `.sh` was missing, though `scripts/` was scanned.
 * The two citations that fell in that hole were the two carrying the ORIGINAL duplicate
 * WC-006 (`client/…/render_installer.js`, `scripts/sync_client.sh`) — the exact ambiguity
 * the split existed to remove. A scope that is narrower than its claim is worse than an
 * honest narrow scope, because it reports green over the thing it cannot see.
 *
 * `.agents/` is in scope because it is COMMITTED project law (AGENTS.md: "the skills and
 * workflows ARE [versioned]") — a skill telling a future agent to look in the wrong file
 * is a live defect, not a note. Excluded on purpose: `vendor/` and `publication/…/docu/ui/`
 * (third-party bytes we ship verbatim), `node_modules/`, and generated CSS.
 */
const SCANNED_DIRS = [
	'src',
	'tools',
	'test',
	'docs',
	'engineering',
	'scripts',
	'client',
	'.agents',
	'deploy',
];
const SCANNED_EXTENSIONS = ['ts', 'js', 'md', 'json', 'less', 'css', 'sh', 'yml', 'yaml'];
/** Repo-root files belong to no directory above, and README.md cites the ledger. */
const SCANNED_ROOT_FILES = ['README.md', 'AGENTS.md'];

/**
 * The sequential grammar, frozen as the EXACT set that was ever issued under it — not a
 * ceiling. A ceiling (`<= 81`) still let a developer allocate `WC-070`, the number that was
 * reserved and never used, which is the same uncoordinated allocation that produced the
 * duplicate WC-006. Being a set, this also fails if an entry is DELETED.
 */
const LEGACY_IDS = new Set([
	'WC-001',
	'WC-002',
	'WC-003',
	'WC-004',
	'WC-005',
	'WC-006',
	'WC-007',
	'WC-008',
	'WC-009',
	'WC-010',
	'WC-011',
	'WC-012',
	'WC-013',
	'WC-014',
	'WC-015',
	'WC-016',
	'WC-017',
	'WC-018',
	'WC-019',
	'WC-020',
	'WC-021',
	'WC-022',
	'WC-023',
	'WC-024',
	'WC-025',
	'WC-026',
	'WC-027',
	'WC-028',
	'WC-029',
	'WC-030',
	'WC-031',
	'WC-032',
	'WC-033',
	'WC-034',
	'WC-035',
	'WC-036',
	'WC-037',
	'WC-038',
	'WC-039',
	'WC-040',
	'WC-041',
	'WC-042',
	'WC-043',
	'WC-044',
	'WC-045',
	'WC-046',
	'WC-047',
	'WC-048',
	'WC-049',
	'WC-050',
	'WC-051',
	'WC-052',
	'WC-053',
	'WC-054',
	'WC-055',
	'WC-056',
	'WC-057',
	'WC-058',
	'WC-059',
	'WC-060',
	'WC-061',
	'WC-062',
	'WC-063',
	'WC-064',
	'WC-065',
	'WC-066',
	'WC-067',
	'WC-068',
	'WC-069',
	'WC-071',
	'WC-072',
	'WC-073',
	'WC-074',
	'WC-075',
	'WC-076',
	'WC-077',
	'WC-078',
	'WC-079',
	'WC-080',
	'WC-081',
]);

/** The grammar for every NEW entry: the day it was adopted + what diverged. */
const DATED_ID = /^WC-(20\d{2})-(\d{2})-(\d{2})-[a-z0-9]+(-[a-z0-9]+)*$/;

/** `WC-2026-99-99-x` is shaped like a date without being one. */
function isRealDate(y: string, m: string, d: string): boolean {
	const date = new Date(`${y}-${m}-${d}T00:00:00Z`);
	return (
		!Number.isNaN(date.getTime()) &&
		date.getUTCMonth() + 1 === Number(m) &&
		date.getUTCDate() === Number(d)
	);
}

/** A file name is `<id>-<slug>.md`; a dated id already carries its slug. */
function idOf(filename: string): string {
	const stem = filename.replace(/\.md$/, '');
	const legacy = /^(WC-\d{3})-/.exec(stem);
	return legacy?.[1] ?? stem;
}

const files = readdirSync(join(REPO_ROOT, LEDGER_DIR))
	.filter((f) => f.endsWith('.md'))
	.sort();

const entries = files.map((file) => ({
	file,
	id: idOf(file),
	firstLine: readFileSync(join(REPO_ROOT, LEDGER_DIR, file), 'utf8').split('\n')[0] ?? '',
}));

/**
 * Every source/doc file that could CITE the ledger.
 *
 * Three are skipped because they NAME ids in prose rather than depending on them: the
 * rules file (the duplicate it records, the number never used, the example grammar), this
 * gate's own header (same history), and the entries themselves (their own id is the h1,
 * and they cross-reference each other freely).
 */
async function* scanTree(): AsyncGenerator<{ path: string; text: string }> {
	for (const dir of SCANNED_DIRS) {
		const glob = new Glob(`**/*.{${SCANNED_EXTENSIONS.join(',')}}`);
		for await (const rel of glob.scan({ cwd: join(REPO_ROOT, dir) })) {
			const path = join(dir, rel);
			if (path === RULES_FILE || path === SELF || path.startsWith(`${LEDGER_DIR}/`)) continue;
			yield { path, text: readFileSync(join(REPO_ROOT, path), 'utf8') };
		}
	}
	for (const path of SCANNED_ROOT_FILES) {
		yield { path, text: readFileSync(join(REPO_ROOT, path), 'utf8') };
	}
}

describe('wire contract ledger tripwire', () => {
	test('there are entries to check (a zero-length pass is not a pass)', () => {
		// Guards the guard: point LEDGER_DIR at an empty or renamed directory and every
		// assertion below would iterate nothing and report GREEN while proving nothing.
		expect(entries.length).toBeGreaterThan(50);
		expect(entries.map((e) => e.id)).toContain('WC-001');
	});

	test("every entry's h1 id matches its filename", () => {
		const offenders: string[] = [];
		for (const { file, id, firstLine } of entries) {
			const m = /^# (WC-[0-9A-Za-z-]+) — /.exec(firstLine);
			if (m === null) {
				offenders.push(`${file}: first line is not \`# <id> — <title>\` (got: ${firstLine})`);
				continue;
			}
			if (m[1] !== id) offenders.push(`${file}: h1 says ${m[1]}, filename says ${id}`);
		}
		expect(
			offenders,
			`An entry's id must be readable from its FILENAME, because the directory listing is the ledger's only index — there is no committed index file, deliberately: an index is an append point and an append point is the merge conflict this layout removes.\n\n${offenders.join('\n')}`,
		).toEqual([]);
	});

	test('no two entries answer to the same id', () => {
		const byId = new Map<string, string[]>();
		for (const { file, id } of entries) {
			const key = id.toLowerCase();
			byId.set(key, [...(byId.get(key) ?? []), file]);
		}
		const duplicates = [...byId.entries()]
			.filter(([, f]) => f.length > 1)
			.map(([id, f]) => `${id}: ${f.join(', ')}`);
		expect(
			duplicates,
			`Two ledger entries share one id. A WC- id is cited from test files and from docs/ as a permanent reference, so a duplicate silently sends two readers to two different contracts — which is exactly what happened with WC-006 (tool_common relocation / installer diagnostics grid) and went unnoticed for three weeks.\n\n${duplicates.join('\n')}`,
		).toEqual([]);
	});

	test('ids match a known grammar, and the sequential one is frozen', () => {
		const offenders: string[] = [];
		for (const { file, id } of entries) {
			if (LEGACY_IDS.has(id)) continue;
			if (/^WC-\d{3}$/.test(id)) {
				offenders.push(`${file}: ${id} allocates a number under the RETIRED sequential grammar`);
				continue;
			}
			const dated = DATED_ID.exec(id);
			if (dated === null) {
				offenders.push(`${file}: ${id} matches no id grammar`);
				continue;
			}
			const [, y, m, d] = dated;
			if (!isRealDate(y ?? '', m ?? '', d ?? '')) {
				offenders.push(`${file}: ${id} is shaped like a date but ${y}-${m}-${d} is not one`);
			}
		}
		// Deleting an entry is as much a contract change as adding one.
		const vanished = [...LEGACY_IDS].filter((id) => !entries.some((e) => e.id === id));
		for (const id of vanished) offenders.push(`${id}: frozen legacy entry is GONE from the ledger`);
		expect(
			offenders,
			`A new entry's id is \`WC-<yyyy>-<mm>-<dd>-<slug>\` (see ${RULES_FILE}). The sequential \`WC-nnn\` grammar is FROZEN as an exact set of ${LEGACY_IDS.size} ids: allocating the next number requires knowing what every other developer has already taken offline, which is how one id ended up naming two different divergences. A date plus a topic slug needs no coordination.\n\n${offenders.join('\n')}`,
		).toEqual([]);
	});

	test('no entry is appended back into WIRE_CONTRACT.md', () => {
		const rules = readFileSync(join(REPO_ROOT, RULES_FILE), 'utf8');
		const headings = rules.split('\n').filter((l) => /^#{1,6} WC-[0-9]/.test(l));
		expect(
			headings,
			`${RULES_FILE} is the ledger's RULES, not the ledger. An entry heading here means someone appended to the shared file again — which reinstates the merge conflict the split removed. Put it in ${LEDGER_DIR}/<id>-<slug>.md instead.\n\n${headings.join('\n')}`,
		).toEqual([]);
	});

	test('no citation sends a reader to the rules file for an ENTRY', async () => {
		// The split moved the entries out of WIRE_CONTRACT.md, so `WIRE_CONTRACT.md WC-016`
		// now names a file that does not contain WC-016 — the id still resolves, but the
		// path misdirects. 42 such citations were repointed in the split commit; this keeps
		// them repointed, because the way a stale one comes back is someone copying a
		// neighbouring comment that predates the move.
		// The separator must tolerate everything real prose puts between the path and the
		// id — `(`, `,`, backticks, "entry", a line wrap. The first draft allowed only
		// `[,\s]*`, so the commonest markdown form, `` `…WIRE_CONTRACT.md` (WC-033) ``,
		// sailed straight through it — and five committed `.agents/` skills used exactly
		// that form. Dated ids count too: an entry re-issued under the new grammar can be
		// mis-cited just as easily as a legacy one.
		const STALE = /WIRE_CONTRACT\.md[`'")\]]*[\s,:;(\[]*[`'"]*(?:entry\s+)?`?WC-(?:\d{3}|20\d{2}-)/;
		const offenders: string[] = [];
		for await (const { path, text } of scanTree()) {
			for (const [i, line] of text.split('\n').entries()) {
				if (STALE.test(line)) offenders.push(`${path}:${i + 1}`);
			}
		}
		expect(
			offenders,
			`A citation pairs \`${RULES_FILE}\` with an entry id. That file is the RULES — the entries live in \`${LEDGER_DIR}/\`, one per file, so a reader who opens the path in this comment will not find the entry it names. Cite \`${LEDGER_DIR}/\` instead.\n\n${offenders.join('\n')}`,
		).toEqual([]);
	});

	test('every WC- id cited in the tree resolves to an entry', async () => {
		const known = new Set(entries.map((e) => e.id));
		// `WC-017/018/019` is a real citation form in docs/: the bare `018` and `019` are
		// ids too, and a first draft that matched only the prefixed one would let an entry
		// cited ONLY that way rot unnoticed. The second alternative reads those tails.
		const CITATION = /WC-(?:\d{3}|20\d{2}-\d{2}-\d{2}-[a-z0-9-]+?)(?=[^0-9A-Za-z-]|$)/g;
		const CITATION_TAIL = /(?<=WC-\d{3}(?:\/\d{3})*)\/(\d{3})/g;
		const dangling = new Map<string, string[]>();

		for await (const { path, text } of scanTree()) {
			const cited = [
				...[...text.matchAll(CITATION)].map((m) => m[0]),
				...[...text.matchAll(CITATION_TAIL)].map((m) => `WC-${m[1]}`),
			];
			for (const id of cited) {
				if (known.has(id)) continue;
				dangling.set(id, [...(dangling.get(id) ?? []), path]);
			}
		}

		const report = [...dangling.entries()].map(
			([id, where]) => `${id} — cited in ${[...new Set(where)].join(', ')}`,
		);
		expect(
			report,
			`A WC- id is cited that no ledger entry answers to. Either the entry was never written (a deliberate divergence with no ledger entry is a REGRESSION, not a divergence — the standing DEC-02/DEC-12 rule), or it was renamed without updating the citation. An id is permanent precisely so this cannot happen quietly.\n\n${report.join('\n')}`,
		).toEqual([]);
	});
});
