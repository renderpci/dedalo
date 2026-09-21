/**
 * THE AUDIT'S OWN OPEN QUESTIONS STAY ANSWERED OR STAY NAMED (CLOSURE-openquestions).
 *
 * The 2026-08-26 deep audit closed with fourteen questions its filed severities
 * depend on (`raw/canonical_register.md` §5.2) and three measurements it OWES
 * rather than defers. A closure record that answers twelve of them and quietly
 * drops two reads as complete — which is the exact failure mode the register
 * warned about when it wrote the list down.
 *
 * THE CENSUS IS TOTAL AND IT IS DERIVED FROM THE REGISTER, not from a hand list
 * here: the questions are parsed out of §5.2's own bullets, so a bullet ADDED
 * there and not answered in CLOSURE.md reds this gate, and a hand list cannot
 * drift from the source. The floor refuses a parse that collapses (a heading
 * rename, a reformat) to zero or to fewer than the fourteen of record.
 *
 * WHAT EACH ENTRY MUST CARRY, and why each leg exists:
 *  - a VERDICT token, ANSWERED or OPEN. A paragraph with neither is prose, not
 *    a decision input.
 *  - ANSWERED ⇒ at least one CITATION that resolves on disk. "Answered" without
 *    evidence is an assertion; a citation that names a deleted file is worse
 *    than none, because it reads as evidence.
 *  - OPEN ⇒ a "What would answer it" line. An open question with no stated
 *    resolution path is an excuse.
 *  - EVERY citation in the block must resolve, ANSWERED or not — a dead path
 *    anywhere in the section is a stale record.
 *  - the three OWED measurements must each be named in the block.
 *
 * The detectors are pure functions over text, so each leg is exercised twice:
 * once against the real record, and once against a SYNTHETIC block planted with
 * the offence it is supposed to catch (the positive controls below). The
 * synthetic leg runs EVERYWHERE, because it needs no artifact.
 *
 * (!) THE ARTIFACT IS LOCAL-ONLY. `audits/` is gitignored, exactly like
 * `rewrite/`, so on a clone neither the register nor CLOSURE.md exists. This
 * gate therefore reads them DEFENSIVELY (never at import, never throwing) and
 * declares itself skipped, with the reason in the test name, when the audit
 * tree is absent — instead of dying at module load on every checkout that is
 * not the maintainer's. Where the artifact IS present, every leg below is
 * enforced in full. What cannot be honestly claimed is that this runs on CI:
 * the artifact it gates does not ship.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';

const REPO_ROOT = new URL('../../', import.meta.url).pathname;
const AUDIT_DIR = `${REPO_ROOT}audits/2026-08-26_deep/`;
const REGISTER = `${AUDIT_DIR}raw/canonical_register.md`;
const CLOSURE = `${AUDIT_DIR}CLOSURE.md`;

/** The delimiters this item owns; the rest of CLOSURE.md is another lane's. */
const BLOCK_START = '<!-- BEGIN open-questions -->';
const BLOCK_END = '<!-- END open-questions -->';

/** Fourteen bullets of record. A parse below this floor is a broken parse. */
const QUESTION_FLOOR = 14;

/** The measurements REMEDIATION §"does NOT cover" (2) says the audit owes. */
const OWED_MEASUREMENTS = [
	'client retention slope',
	'Write-path query counts',
	'CLI-26 step 5',
] as const;

/** §5.2's bullets, by their own bold labels (trailing period stripped). */
function parseQuestionLabels(registerText: string): string[] {
	const start = registerText.indexOf('### 5.2 Open questions');
	if (start < 0) return [];
	const rest = registerText.slice(start);
	const end = rest.indexOf('\n### ', 1);
	const section = end < 0 ? rest : rest.slice(0, end);
	const labels: string[] = [];
	for (const line of section.split('\n')) {
		const hit = /^- \*\*(.+?)\*\*/.exec(line);
		const label = hit?.[1];
		if (label !== undefined) labels.push(label.replace(/\.$/, ''));
	}
	return labels;
}

/** The delimited block this item owns ('' when the markers are absent). */
function extractBlock(closureText: string): string {
	const from = closureText.indexOf(BLOCK_START);
	const to = closureText.indexOf(BLOCK_END);
	if (from < 0 || to < 0 || to < from) return '';
	return closureText.slice(from + BLOCK_START.length, to);
}

interface AnsweredEntry {
	label: string;
	verdict: string;
	body: string;
}

/** One entry per label: its verdict token and everything up to the next entry. */
function findEntry(block: string, label: string): AnsweredEntry | null {
	const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const head = new RegExp(`^\\*\\*${escaped}\\*\\* — (ANSWERED|OPEN)\\b`, 'm');
	const hit = head.exec(block);
	if (hit === null) return null;
	const after = block.slice(hit.index + hit[0].length);
	const next = /^\*\*[^*\n]+\*\* — (ANSWERED|OPEN)\b/m.exec(after);
	return {
		label,
		verdict: hit[1] ?? '',
		body: next === null ? after : after.slice(0, next.index),
	};
}

/** Backticked tokens that look like a repo path (a `:line` suffix is dropped). */
function citationsIn(text: string): string[] {
	const out: string[] = [];
	for (const hit of text.matchAll(/`([^`\s]+\/[^`\s]+)`/g)) {
		const raw = (hit[1] ?? '').replace(/:[0-9]+(-[0-9]+)?$/, '');
		if (/\.(ts|js|md|sh|json|yml|yaml|html|css)$/.test(raw)) out.push(raw);
	}
	return out;
}

/** A citation resolves from the repo root or from the audit directory. */
function citationResolves(citation: string): boolean {
	return existsSync(`${REPO_ROOT}${citation}`) || existsSync(`${AUDIT_DIR}${citation}`);
}

/** Both artifacts present? (`audits/` is gitignored — absent on a clone.) */
const auditTreePresent = existsSync(REGISTER) && existsSync(CLOSURE);
const registerText = auditTreePresent ? await Bun.file(REGISTER).text() : '';
const closureText = auditTreePresent ? await Bun.file(CLOSURE).text() : '';
const labels = parseQuestionLabels(registerText);
const block = extractBlock(closureText);

describe.if(!auditTreePresent)('the audit artifact is absent on this checkout', () => {
	test.skip('SKIPPED — audits/ is gitignored, so the 2026-08-26 register and CLOSURE.md are not on this checkout; the detector legs below still run', () => {});
});

describe.if(auditTreePresent)(
	'the register’s open questions are answered or named in CLOSURE.md',
	() => {
		test('CENSUS TOTAL: §5.2’s bullets parse, at or above the fourteen of record', () => {
			expect(
				labels.length,
				`parsed ${labels.length} question labels out of ${REGISTER} §5.2 — the section moved, ` +
					'was renamed or was reformatted, and this gate is measuring nothing.',
			).toBeGreaterThanOrEqual(QUESTION_FLOOR);
		});

		test('the delimited block exists and is not empty', () => {
			expect(
				block.trim().length,
				`${CLOSURE} carries no ${BLOCK_START} … ${BLOCK_END} block — the open-questions section ` +
					'was removed or its markers were edited away.',
			).toBeGreaterThan(500);
		});

		test('every question of §5.2 has an entry carrying a verdict', () => {
			const missing = labels.filter((label) => findEntry(block, label) === null);
			expect(
				missing,
				`${missing.length} question(s) of §5.2 have no verdict entry in the block: ` +
					`${missing.join(' | ')}. Every bullet needs "**<label>** — ANSWERED|OPEN".`,
			).toEqual([]);
		});

		test('every ANSWERED entry cites evidence that resolves on disk', () => {
			const bare: string[] = [];
			for (const label of labels) {
				const entry = findEntry(block, label);
				if (entry === null || entry.verdict !== 'ANSWERED') continue;
				if (citationsIn(entry.body).filter(citationResolves).length === 0) bare.push(label);
			}
			expect(
				bare,
				`ANSWERED without a resolving citation: ${bare.join(' | ')}. An answer with no path, ` +
					'gate or measured artefact is an assertion.',
			).toEqual([]);
		});

		test('every OPEN entry states what would answer it', () => {
			const silent: string[] = [];
			for (const label of labels) {
				const entry = findEntry(block, label);
				if (entry === null || entry.verdict !== 'OPEN') continue;
				if (!/What would answer it/i.test(entry.body)) silent.push(label);
			}
			expect(
				silent,
				`OPEN with no resolution path: ${silent.join(' | ')}. An open question that does not ` +
					'say what would close it cannot be picked up by anyone.',
			).toEqual([]);
		});

		test('CENSUS TOTAL: every citation in the block resolves', () => {
			const cited = citationsIn(block);
			expect(
				cited.length,
				'the block cites no repo path at all — the whole section is unevidenced prose.',
			).toBeGreaterThan(10);
			const dead = [...new Set(cited.filter((c) => !citationResolves(c)))];
			expect(
				dead,
				`dead citation(s) in the open-questions block: ${dead.join(' | ')}. A path that no ` +
					'longer exists reads as evidence and is not.',
			).toEqual([]);
		});

		test('the three owed measurements are each named', () => {
			const absent = OWED_MEASUREMENTS.filter((m) => !block.includes(m));
			expect(absent, `owed measurement(s) not named in the block: ${absent.join(' | ')}.`).toEqual(
				[],
			);
		});
	},
);

describe('POSITIVE CONTROLS: the detectors fire on planted offences', () => {
	const SYNTHETIC = [
		BLOCK_START,
		'**Answered question** — ANSWERED.',
		'Evidence: `src/core/db/query_tap.ts`.',
		'',
		'**Fabricated question** — ANSWERED.',
		'Evidence: `src/core/db/no_such_file_here.ts`.',
		'',
		'**Silent question** — OPEN.',
		'Nothing is said about how to close it.',
		'',
		'Verdictless question — the entry that forgot its token.',
		BLOCK_END,
	].join('\n');
	const synthetic = extractBlock(SYNTHETIC);

	test('a verdict-less entry is not found', () => {
		expect(findEntry(synthetic, 'Verdictless question')).toBeNull();
		expect(findEntry(synthetic, 'Answered question')?.verdict).toBe('ANSWERED');
	});

	test('a fabricated citation does not resolve', () => {
		const entry = findEntry(synthetic, 'Fabricated question');
		expect(entry).not.toBeNull();
		const cites = citationsIn(entry?.body ?? '');
		expect(cites.length).toBeGreaterThan(0);
		expect(cites.filter(citationResolves)).toEqual([]);
		// and the real one does
		expect(
			citationsIn(findEntry(synthetic, 'Answered question')?.body ?? '').filter(citationResolves),
		).toEqual(['src/core/db/query_tap.ts']);
	});

	test('an OPEN entry with no resolution path is detected', () => {
		const entry = findEntry(synthetic, 'Silent question');
		expect(entry?.verdict).toBe('OPEN');
		expect(/What would answer it/i.test(entry?.body ?? '')).toBe(false);
	});

	test('a block without markers extracts as empty', () => {
		expect(extractBlock('no markers here')).toBe('');
	});
});
