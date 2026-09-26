/**
 * TRIPWIRE — the project skills describe the engine as it IS.
 *
 * `.agents/skills/` holds the subsystem playbooks every coding agent loads
 * before touching the engine. They were prose, and nothing checked them. The
 * 2026-09-26 audit (every claim re-verified against HEAD) found ~130 errors
 * across 15 of 16 skills — cited files deleted months earlier, `file:line`
 * anchors drifted by up to 500 lines, links to five skills that never existed,
 * seven descriptions over the spec's 1024-char limit (one visibly truncated in
 * the agent's skill listing), and — the dangerous class — the PRE-CUTOVER
 * model still taught as current: a live PHP oracle on the same Postgres,
 * `if (!hasPhpCredentials()) return` in every test (the vacuity shape
 * `gate_vacuity_tripwire` counts as debt), a reserved section_id band AGENTS.md
 * says does not exist. An agent following a skill wrote gates the ratchets
 * refuse.
 *
 * THE RULES (each a pure function below, each with a planted positive control):
 *
 *  A. FRONTMATTER — `name` equals the directory; `description` is present and
 *     at most 1024 chars (agentskills.io spec; the harness truncates past it).
 *  B. SKILL LINKS RESOLVE — every `dedalo-<slug>` token names a skill directory,
 *     or is an enumerated non-skill token with its reason.
 *  C. BACKTICKED PATHS ARE TRACKED — a backticked path under a repo root, or a
 *     backticked bare filename, exists in the GIT INDEX (a clone is what a skill
 *     is read on). A deleted file may still be NAMED — without backticks, as
 *     history. Templates (`*`, `{`, `<`, `…`, `$`) are not paths.
 *  D. NO LINE ANCHORS — no `file.ts:123` and no bare `:123`. They were the
 *     single largest drift class; a symbol name survives an edit above it. The
 *     frozen PHP tree (`.php:NNN`) cannot drift and is allowed.
 *  E. NO PRE-CUTOVER FRAMING — an enumerated phrase list (live PHP, byte-
 *     coexistence, "11 tripwires", the vacuity idiom, the closed COEXISTENCE
 *     ledger, the non-existent reserved band).
 *  F. THE MAP IS TOTAL — `dedalo-ts-foundation` (the entry skill that "maps the
 *     rest", per AGENTS.md) names every other skill.
 *
 * HONEST LIMITS. It checks what a skill POINTS AT, never whether a claim about
 * behaviour is still true: "X throws on Y" can go stale with every pointer
 * intact. Rule E is a phrase list, so a new paraphrase of a retired model is
 * unseen. Backticked symbols (`fooBar`) are not resolved — only paths and
 * filenames. What remains is a reviewer's job, and the audit that motivated
 * this gate is the method: re-verify each claim against HEAD.
 *
 * Hermetic: fs + one `git ls-files`, imports no src/ module.
 */

import { describe, expect, test } from 'bun:test';
import { skillFiles, trackedPaths } from '../helpers/agent_skills_corpus.ts';

const DESCRIPTION_MAX = 1024;

/** The entry skill that AGENTS.md says maps the rest. */
const MAP_SKILL = 'dedalo-ts-foundation';

/**
 * `dedalo-<slug>` tokens that are NOT skill names. Shrink-only; each with why
 * it is spelled in a skill.
 */
const NOT_SKILL_TOKENS: Readonly<Record<string, string>> = {};

/** Repo roots whose backticked paths must be tracked. `rewrite/` and `audits/` are gitignored — never a pointer target a clone can follow. */
const PATH_ROOTS = [
	'.agents/',
	'changes/',
	'client/',
	'deploy/',
	'docs/',
	'engineering/',
	'install/',
	'publication/',
	'scripts/',
	'src/',
	'test/',
	'tools/',
	'vendor/',
];

/** Extensions a backticked BARE filename is resolved for (by basename, anywhere in the index). */
const BARE_FILE_EXT = /^[\w.-]+\.(ts|js|json|md|less|sh)$/;

/**
 * Bare filenames that are legitimately NOT tracked — runtime state the engine
 * writes. Shrink-only, each with its reason.
 */
const UNTRACKED_RUNTIME_FILES: Readonly<Record<string, string>> = {
	'ts_state.json':
		'the server runtime state file under the private dir (`server_state.ts`, media protection) — written at runtime, never in git.',
};

/** Rule E: phrases that teach the retired pre-cutover model. */
const RETIRED_FRAMING: readonly { pattern: RegExp; why: string; sample: string }[] = [
	{
		pattern: /\blive PHP\b/i,
		why: 'the live PHP oracle was decommissioned 2026-07-11',
		sample: 'diff against the live PHP server',
	},
	{
		pattern: /byte-coexisten/i,
		why: 'TS is the sole writer; PHP↔TS coexistence is closed history',
		sample: 'PHP↔TS byte-coexistence',
	},
	{
		pattern: /PHP (server )?is (the|a) (READ-ONLY |byte-\w+ )?oracle/i,
		why: 'the oracle is the frozen fixture store, not PHP',
		sample: 'PHP is the READ-ONLY oracle',
	},
	{
		pattern: /\b(11|eleven) tripwires?\b/i,
		why: 'the index is engineering/TRIPWIRES.md and it is far past 11',
		sample: 'the eleven tripwires',
	},
	{
		pattern: /if \(!hasPhpCredentials\(\)\) return/,
		why: 'a bare return before asserting is the vacuity shape gate_vacuity_tripwire counts as debt',
		sample: 'if (!hasPhpCredentials()) return;',
	},
	{
		pattern: /rewrite\/COEXISTENCE\.md/,
		why: 'the COEXISTENCE ledger is CLOSED history, not a current rule',
		sample: 'add a rewrite/COEXISTENCE.md row',
	},
	{
		pattern: /\bsync_client\b/,
		why: 'client/ is TS-owned; sync_client.sh is retired',
		sample: 'run scripts/sync_client.sh',
	},
	{
		pattern: /900000/,
		why: 'there is NO reserved section_id band (AGENTS.md)',
		sample: 'ids >= 900000',
	},
];

interface Offence {
	file: string;
	detail: string;
}

/** Split `---\n…\n---` frontmatter into `key: value` pairs (one-line values). */
function frontmatter(body: string): Record<string, string> {
	const match = body.match(/^---\n([\s\S]*?)\n---/);
	if (!match?.[1]) return {};
	const out: Record<string, string> = {};
	for (const line of match[1].split('\n')) {
		const kv = line.match(/^([a-z_-]+):\s*(.*)$/i);
		if (kv?.[1]) out[kv[1]] = (kv[2] ?? '').replace(/^(['"])(.*)\1$/, '$2');
	}
	return out;
}

function frontmatterProblems(dir: string, rel: string, body: string): Offence[] {
	const fm = frontmatter(body);
	const out: Offence[] = [];
	if (fm.name !== dir)
		out.push({ file: rel, detail: `name "${fm.name ?? ''}" ≠ directory "${dir}"` });
	const desc = fm.description ?? '';
	if (desc.length === 0) out.push({ file: rel, detail: 'no description' });
	if (desc.length > DESCRIPTION_MAX)
		out.push({ file: rel, detail: `description is ${desc.length} chars (max ${DESCRIPTION_MAX})` });
	return out;
}

function skillLinkProblems(rel: string, body: string, names: ReadonlySet<string>): Offence[] {
	const out: Offence[] = [];
	for (const token of new Set(body.match(/(?<![\w-])dedalo-[a-z]+(?:-[a-z]+)*\b/g) ?? [])) {
		if (names.has(token) || token in NOT_SKILL_TOKENS) continue;
		out.push({ file: rel, detail: `links to "${token}", which is not a skill in .agents/skills/` });
	}
	return out;
}

/** Normalise a backticked token to the path it names, or null if it is not a path. */
function pathOf(token: string): string | null {
	if (/[*{}<>…$\s]/.test(token)) return null;
	const cleaned = token
		.replace(/::.*$/, '')
		.replace(/#.*$/, '')
		.replace(/\(.*$/, '')
		.replace(/:\d+.*$/, '')
		.replace(/[.,;:]+$/, '');
	return cleaned === '' ? null : cleaned;
}

function pathProblems(
	rel: string,
	body: string,
	tracked: readonly string[],
	trackedSet: ReadonlySet<string>,
	trackedBasenames: ReadonlySet<string>,
): { offences: Offence[]; checked: number } {
	const out: Offence[] = [];
	let checked = 0;
	for (const [, token] of body.matchAll(/`([^`\n]+)`/g)) {
		const path = token === undefined ? null : pathOf(token);
		if (path === null) continue;
		if (PATH_ROOTS.some((root) => path.startsWith(root))) {
			checked++;
			const dir = path.endsWith('/') ? path : `${path}/`;
			if (trackedSet.has(path) || tracked.some((p) => p.startsWith(dir))) continue;
			out.push({
				file: rel,
				detail: `\`${token}\` is not tracked (deleted? name it without backticks, as history)`,
			});
		} else if (BARE_FILE_EXT.test(path) && !path.includes('/')) {
			checked++;
			if (trackedBasenames.has(path) || path in UNTRACKED_RUNTIME_FILES) continue;
			out.push({ file: rel, detail: `\`${token}\` matches no tracked file` });
		}
	}
	return { offences: out, checked };
}

const LINE_ANCHOR = /\b[\w./-]+\.(ts|js|json|md|less|sh)(:\d+)|(?<![\w\d/]):\d{2,5}(?![\d:])/g;

function lineAnchorProblems(rel: string, body: string): Offence[] {
	const out: Offence[] = [];
	for (const m of body.matchAll(LINE_ANCHOR)) {
		out.push({ file: rel, detail: `line anchor "${m[0]}" — cite the symbol, not the line` });
	}
	return out;
}

function framingProblems(rel: string, body: string): Offence[] {
	const out: Offence[] = [];
	for (const { pattern, why } of RETIRED_FRAMING) {
		const hit = body.match(pattern);
		if (hit) out.push({ file: rel, detail: `"${hit[0]}" — ${why}` });
	}
	return out;
}

function mapProblems(mapBody: string, names: ReadonlySet<string>): string[] {
	return [...names].filter((n) => n !== MAP_SKILL && !mapBody.includes(n)).sort();
}

const fmt = (offences: Offence[]): string =>
	offences.map((o) => `${o.file}: ${o.detail}`).join('\n  ');

describe('project skills describe the engine as it IS', () => {
	const skills = skillFiles();
	const names = new Set(skills.map((s) => s.dir));
	const tracked = trackedPaths();
	const trackedSet = new Set(tracked);
	const trackedBasenames = new Set(tracked.map((p) => p.slice(p.lastIndexOf('/') + 1)));

	test('the scan reads the skills and the index (anti-vacuity)', () => {
		expect(skills.length).toBeGreaterThan(10);
		expect(tracked.length).toBeGreaterThan(1000);
		expect(names.has(MAP_SKILL)).toBe(true);
	});

	test('A: frontmatter name = directory, description ≤ 1024 chars', () => {
		const offences = skills.flatMap((s) => frontmatterProblems(s.dir, s.rel, s.body));
		expect(offences, `  ${fmt(offences)}`).toEqual([]);
	});

	test('B: every dedalo-<slug> skill link resolves', () => {
		const offences = skills.flatMap((s) => skillLinkProblems(s.rel, s.body, names));
		expect(offences, `  ${fmt(offences)}`).toEqual([]);
		for (const token of Object.keys(NOT_SKILL_TOKENS)) {
			expect(names.has(token), `${token} is now a skill — drop it from NOT_SKILL_TOKENS`).toBe(
				false,
			);
			expect(
				skills.some((s) => s.body.includes(token)),
				`${token} is spelled nowhere — drop it`,
			).toBe(true);
		}
	});

	test('C: every backticked repo path / filename is tracked', () => {
		const results = skills.map((s) =>
			pathProblems(s.rel, s.body, tracked, trackedSet, trackedBasenames),
		);
		const offences = results.flatMap((r) => r.offences);
		expect(results.reduce((n, r) => n + r.checked, 0)).toBeGreaterThan(100);
		expect(offences, `  ${fmt(offences)}`).toEqual([]);
		for (const name of Object.keys(UNTRACKED_RUNTIME_FILES)) {
			expect(trackedBasenames.has(name), `${name} is tracked now — drop the exemption`).toBe(false);
		}
	});

	test('D: no file:line or bare :line anchors', () => {
		const offences = skills.flatMap((s) => lineAnchorProblems(s.rel, s.body));
		expect(offences, `  ${fmt(offences)}`).toEqual([]);
	});

	test('E: no pre-cutover framing', () => {
		const offences = skills.flatMap((s) => framingProblems(s.rel, s.body));
		expect(offences, `  ${fmt(offences)}`).toEqual([]);
	});

	test(`F: ${MAP_SKILL} maps every skill`, () => {
		const map = skills.find((s) => s.dir === MAP_SKILL);
		expect(mapProblems(map?.body ?? '', names)).toEqual([]);
	});
});

describe('positive controls — each rule fires on a planted offender', () => {
	const tracked = ['src/core/a.ts', 'test/unit/b.test.ts'];
	const trackedSet = new Set(tracked);
	const bases = new Set(['a.ts', 'b.test.ts']);

	test('A', () => {
		const long = 'x'.repeat(DESCRIPTION_MAX + 1);
		expect(
			frontmatterProblems('s', 's.md', `---\nname: other\ndescription: ok\n---\n`),
		).toHaveLength(1);
		expect(
			frontmatterProblems('s', 's.md', `---\nname: s\ndescription: ${long}\n---\n`),
		).toHaveLength(1);
		expect(frontmatterProblems('s', 's.md', `---\nname: s\n---\n`)).toHaveLength(1);
		expect(frontmatterProblems('s', 's.md', `---\nname: s\ndescription: fine\n---\n`)).toEqual([]);
	});

	test('B', () => {
		const names = new Set(['dedalo-real']);
		expect(skillLinkProblems('s', 'see dedalo-real and dedalo-ghost-skill', names)).toHaveLength(1);
		// a header or id that merely CONTAINS the prefix is not a link
		expect(skillLinkProblems('s', "headers: {'x-dedalo-csrf-token': t}", names)).toEqual([]);
	});

	test('C', () => {
		const body =
			'`src/core/a.ts` `src/core/gone.ts` `src/core/` `b.test.ts` `gone_differential.test.ts` `src/<x>.ts`';
		const { offences, checked } = pathProblems('s', body, tracked, trackedSet, bases);
		expect(checked).toBe(5);
		expect(offences.map((o) => o.detail.split('`')[1])).toEqual([
			'src/core/gone.ts',
			'gone_differential.test.ts',
		]);
	});

	test('D', () => {
		expect(lineAnchorProblems('s', 'at `save.ts:778` and (:264) and ~server.ts:653')).toHaveLength(
			3,
		);
		expect(
			lineAnchorProblems('s', 'class.x.php:301, 10:30, localhost:4000, WC-043, ~48 h, ~230 lines'),
		).toEqual([]);
	});

	test('E', () => {
		for (const { pattern, sample } of RETIRED_FRAMING) {
			expect(framingProblems('s', sample), `control for ${pattern}`).toHaveLength(1);
		}
		expect(framingProblems('s', 'parity replays the frozen fixture store')).toEqual([]);
	});

	test('F', () => {
		expect(mapProblems('dedalo-a', new Set([MAP_SKILL, 'dedalo-a', 'dedalo-b']))).toEqual([
			'dedalo-b',
		]);
	});
});
