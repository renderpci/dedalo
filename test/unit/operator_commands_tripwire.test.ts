/**
 * OPERATOR-PROCEDURE tripwire (DEC-12: every documented invariant has one).
 *
 * A page in `docs/management/` is not prose about the system — it is the thing an operator
 * types into a root shell on a museum's machine. So it has exactly one failure mode worth
 * gating: IT NAMES SOMETHING THAT DOES NOT EXIST.
 *
 * WHY IT EXISTS. Until 2026-08-30 `docs/management/site_builder.md` told an operator to
 * install the site-builder daemon by copying files (`install.sh`, a shipped systemd unit, a
 * hand-written vhost) that had been DELETED when the provisioner replaced them, and the
 * cookbook beside it configured the daemon through four environment keys the daemon does
 * not read (`PREPROD_ROOT`, `PROD_ROOT`, `PREPROD_BASE_URL`, `PROD_BASE_URL`) and told the
 * operator to give a site a custom domain by hand-writing a virtual host — which is now a
 * declared field. Following that page end to end produced a NON-WORKING INSTALL, and every
 * gate in the repo was green the whole time: no test read the manual, and the manual read no
 * code.
 *
 * The same silence covered `engineering/PRODUCTION.md` §6, which names the backup SET. A
 * store named there and copied by nothing is a store discovered missing at restore time,
 * which is the worst moment there is.
 *
 * SIX LEGS, each in both directions where a direction exists:
 *
 *   A. Every `provision <verb>` an operator page names is a verb the CLI HAS — and every
 *      verb the CLI has appears in `docs/management/site_builder.md`, so a new one cannot
 *      ship undocumented.
 *   B. Every flag written next to a `provision` command is a real option, AND is one that
 *      that verb accepts. `provision apply --purge-published` used to be accepted and
 *      silently ignored; a doc that teaches it is the same defect one layer up.
 *   C. Every repo script and deploy artifact an operator page names is on disk.
 *   D. Every daemon environment key an operator page names is one the daemon READS
 *      (`publication/site_builder/src/config.ts`) or an engine catalog key. This is the leg
 *      that catches the four dead root keys without anybody maintaining a list of them.
 *   E. The backup set of `PRODUCTION.md` §6 equals what `deploy/dedalo-backup.service`
 *      copies: every documented store's token appears in the unit, every ExecStart carries a
 *      documented store's token, and the counts agree with the prose.
 *   G. Every declaration a page shows an operator is PARSED by the real schema and DERIVED
 *      by the real layout — including the `--declare` fragment, merged over an inference the
 *      way `adopt` merges it. A copy-paste block that does not parse is the most expensive
 *      kind of wrong: the operator finds out with root, on a museum's host, from a refusal
 *      naming a field they did not choose.
 *   F. BEHAVIOURAL: `deploy/dedalo-site-builder-backup.sh` is RUN over a synthetic host and
 *      must copy the instance marker, both release stores and the served symlink AS a
 *      symlink — and must exit non-zero when a source it was told about is absent. A backup
 *      script that has never been run is a hypothesis, not a backup.
 *
 * WHY THE SCANS ONLY READ CODE CONTEXTS. Every extraction below runs over fenced blocks and
 * inline code spans, never over prose. A sentence may legitimately contain the word
 * "provision" followed by anything at all; a command must be a command.
 */

import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readlinkSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { EXIT, OPTIONAL_FLAGS, VERBS } from '../../publication/site_builder/src/provision/cli.ts';
import { derive } from '../../publication/site_builder/src/provision/layout.ts';
import { parseManifest } from '../../publication/site_builder/src/provision/schema.ts';
import { CONFIG_CATALOG } from '../../src/config/catalog/index.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

const read = (relative: string): string => readFileSync(join(REPO_ROOT, relative), 'utf8');

/**
 * The pages this gate holds to the code. The management page is the OPERATOR'S, and is the
 * one whose commands must be complete; the others are scanned because they carry commands
 * and keys too, and a stale command is a stale command wherever it sits.
 */
const OPERATOR_PAGE = 'docs/management/site_builder.md';
const SCANNED_PAGES: readonly string[] = [
	OPERATOR_PAGE,
	'docs/management/site_builder_cookbook.md',
	'docs/development/site_builder_internals.md',
	'docs/tools/using_sitebuilder.md',
	'engineering/SITE_BUILDER_INSTANCES.md',
];

/* ─────────────────────────────────────────────────────────────────────────────
 * Extraction — code contexts only
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Every fenced block body and inline code span in a markdown document, concatenated.
 *
 * BACKSLASH CONTINUATIONS ARE JOINED FIRST. A shell command wrapped over three lines is one
 * command, and reading it line by line was measured to hide `--from` from the very
 * `provision adopt` example that carries it — the gate would then have demanded a flag the
 * page already documents.
 */
function codeText(markdown: string): string {
	const parts: string[] = [];
	for (const match of markdown.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm))
		parts.push(match[1] as string);
	for (const match of markdown.matchAll(/`([^`\n]+)`/g)) parts.push(match[1] as string);
	return parts.join('\n').replace(/\\\n\s*/g, ' ');
}

/** One `provision …` invocation: its verb (null when it is a placeholder) and its flags. */
interface Invocation {
	readonly page: string;
	readonly line: string;
	readonly verb: string | null;
	readonly flags: readonly string[];
}

/**
 * Every `provision …` command line in a page's code contexts.
 *
 * The verb is the first token after `provision` that is not an option. `<verb>` is the
 * documented placeholder in the usage line and is deliberately allowed — the same string
 * `--help` prints.
 */
function invocations(page: string, markdown: string): Invocation[] {
	const found: Invocation[] = [];
	for (const line of codeText(markdown).split('\n')) {
		const at = line.indexOf('provision ');
		if (at === -1) continue;
		// `provisioner`, `provision_x` and friends are words, not the command.
		if (at > 0 && /[A-Za-z0-9_/.-]/.test(line[at - 1] as string)) continue;
		const rest = line
			.slice(at + 'provision '.length)
			.replace(/\\$/, '')
			.trim();
		if (rest === '') continue;
		const tokens = rest.split(/\s+/);
		const first = tokens[0] as string;
		const verb = first.startsWith('-') ? null : first === '<verb>' ? null : first;
		found.push({
			page,
			line: line.trim(),
			verb,
			flags: tokens
				.filter((token) => token.startsWith('-'))
				.map((token) => token.split('=')[0] as string),
		});
	}
	return found;
}

/** The universal options, spelled as the CLI's own tables spell them. */
const UNIVERSAL_OPTIONS = ['--instance', '--all', '--config-dir', '--help', '-h'] as const;

/** camelCase optional flag → its command-line spelling. Asserted against cli.ts below. */
const spellingOf = (flag: string): string =>
	`--${flag.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

/* ─────────────────────────────────────────────────────────────────────────────
 * A + B — the commands
 * ───────────────────────────────────────────────────────────────────────────── */

describe('the provision commands an operator page names are commands that exist', () => {
	const allInvocations = SCANNED_PAGES.flatMap((page) => invocations(page, read(page)));

	test('the flag-spelling derivation is the CLI’s own, not this gate’s guess', () => {
		// This gate derives `--purge-published` from `purgePublished`. If cli.ts ever spells
		// one differently, leg B would be checking against a spelling nothing accepts — so
		// the derivation is pinned against the source that owns it.
		const source = read('publication/site_builder/src/provision/cli.ts');
		for (const flag of OPTIONAL_FLAGS) {
			expect({ flag, line: `${flag}: '${spellingOf(flag)}'` }).toEqual({
				flag,
				line: source.includes(`${flag}: '${spellingOf(flag)}'`)
					? `${flag}: '${spellingOf(flag)}'`
					: `MISSING from cli.ts FLAG_SPELLING`,
			});
		}
	});

	test('anti-vacuity: the scan actually found commands to check', () => {
		// A regex that stops matching would otherwise make every assertion below pass
		// having read nothing. Measured when written: 14 invocations across 5 pages.
		expect(allInvocations.length).toBeGreaterThanOrEqual(10);
	});

	test('every verb named in a doc exists in the CLI', () => {
		const offenders = allInvocations
			.filter((invocation) => invocation.verb !== null && !(invocation.verb in VERBS))
			.map(
				(invocation) =>
					`${invocation.page}: “${invocation.line}” — '${invocation.verb}' is not a verb`,
			);
		expect(
			offenders,
			`A management page names a provisioner verb that does not exist. The verbs are: ` +
				`${Object.keys(VERBS).join(', ')}. An operator does not discover this from the page; ` +
				'they discover it from a refusal on a museum’s host.\n  ' +
				offenders.join('\n  '),
		).toEqual([]);
	});

	test('every verb the CLI has appears in the operator page', () => {
		const documented = new Set(
			invocations(OPERATOR_PAGE, read(OPERATOR_PAGE)).flatMap((i) =>
				i.verb === null ? [] : [i.verb],
			),
		);
		const missing = Object.keys(VERBS).filter((verb) => !documented.has(verb));
		expect(
			missing,
			`${OPERATOR_PAGE} does not show these verbs being run: ${missing.join(', ')}. A verb ` +
				'that ships without a documented procedure is a verb an operator will improvise ' +
				'around, on a live host, with root.',
		).toEqual([]);
	});

	test('every flag written next to a provision command is one that verb accepts', () => {
		const offenders: string[] = [];
		for (const invocation of allInvocations) {
			for (const flag of invocation.flags) {
				if ((UNIVERSAL_OPTIONS as readonly string[]).includes(flag)) continue;
				const owner = OPTIONAL_FLAGS.find((candidate) => spellingOf(candidate) === flag);
				if (owner === undefined) {
					offenders.push(`${invocation.page}: “${invocation.line}” — ${flag} is not an option`);
					continue;
				}
				if (invocation.verb === null) continue;
				const spec = VERBS[invocation.verb];
				if (spec && !spec.flags.includes(owner)) {
					offenders.push(
						`${invocation.page}: “${invocation.line}” — '${invocation.verb}' does not accept ${flag}`,
					);
				}
			}
		}
		expect(
			offenders,
			'A flag a verb does not accept is REFUSED by the CLI by name — so a page teaching it ' +
				'sends an operator to type a command that was never going to run.\n  ' +
				offenders.join('\n  '),
		).toEqual([]);
	});

	test("every verb's required flags are shown at least once where that verb is documented", () => {
		const offenders: string[] = [];
		for (const [verb, spec] of Object.entries(VERBS)) {
			for (const required of spec.requires ?? []) {
				const shown = invocations(OPERATOR_PAGE, read(OPERATOR_PAGE)).some(
					(invocation) =>
						invocation.verb === verb && invocation.flags.includes(spellingOf(required)),
				);
				if (!shown)
					offenders.push(
						`${verb} needs ${spellingOf(required)}, and no example in ${OPERATOR_PAGE} passes it`,
					);
			}
		}
		expect(offenders).toEqual([]);
	});
});

/* ─────────────────────────────────────────────────────────────────────────────
 * B2 — the exit codes
 * ───────────────────────────────────────────────────────────────────────────── */

describe('the exit-code table an operator page prints is the CLI’s own closed set', () => {
	/**
	 * The one part of this page a MACHINE reads. An operator's monitoring job branches on
	 * these numbers — `check` exiting 1 is the assertion that a fleet is converged — so a
	 * table that drifts from `EXIT` is a nightly job that reports the wrong thing forever,
	 * silently, which is the failure mode this whole file exists to end. It was ungated.
	 */
	const TABLE_ROW = /^\|\s*`?(\d+)`?\s*\|\s*(.+?)\s*\|$/gm;

	function documentedCodes(): { code: number; meaning: string }[] {
		const page = read(OPERATOR_PAGE);
		const from = page.indexOf('| Code | Meaning |');
		expect(from, `${OPERATOR_PAGE} no longer carries an exit-code table.`).toBeGreaterThan(-1);
		const to = page.indexOf('\n## ', from);
		const section = page.slice(from, to === -1 ? undefined : to);
		return [...section.matchAll(TABLE_ROW)].map((match) => ({
			code: Number(match[1]),
			meaning: match[2] as string,
		}));
	}

	test('every code the CLI can return is documented, and every documented code is one it returns', () => {
		const documented = documentedCodes().map((row) => row.code);
		expect(documented.length).toBeGreaterThan(0);
		// BOTH directions. A code the CLI returns and the page omits is a number an operator
		// meets for the first time in a failing cron job; a code the page promises and no path
		// returns is a promise to a script that will never be kept — which is exactly why the
		// old `UNSUPPORTED` code was deleted rather than kept as documentation.
		expect(documented.sort((a, b) => a - b)).toEqual(
			[...new Set(Object.values(EXIT))].sort((a, b) => a - b),
		);
	});

	test('the numbers carry the meanings the CLI gives them', () => {
		const byCode = new Map(documentedCodes().map((row) => [row.code, row.meaning.toLowerCase()]));
		// Only the two that a script actually branches on are pinned to their sense: OK is the
		// absence of trouble, and DRIFT is the assertion `check --all` exists to make.
		expect(byCode.get(EXIT.OK)).toContain('nothing to do');
		expect(byCode.get(EXIT.DRIFT)).toContain('drifted');
		expect(byCode.get(EXIT.DRIFT)).toContain('check');
		expect(byCode.get(EXIT.REFUSED)).toContain('refused');
		expect(byCode.get(EXIT.FAILED)).toContain('failed');
	});
});

/* ─────────────────────────────────────────────────────────────────────────────
 * C — the files a procedure names
 * ───────────────────────────────────────────────────────────────────────────── */

describe('every repo artifact an operator page names is on disk', () => {
	/** Repo-relative paths worth resolving: our own scripts, and the deploy artifacts. */
	const PATH_PATTERN =
		/\b(?:scripts\/[A-Za-z0-9_/.-]+\.ts|deploy\/[A-Za-z0-9_.-]+|publication\/site_builder\/src\/[A-Za-z0-9_/.-]+\.ts)\b/g;

	/**
	 * A path in these pages is relative EITHER to the repo root or to the daemon's package —
	 * `deploy/examples/` is the daemon's, `deploy/dedalo-backup.service` is the repo's — so
	 * both roots are tried. Resolving against one only was measured to report six real files
	 * as missing.
	 */
	const ROOTS = ['', 'publication/site_builder'] as const;
	const resolves = (path: string): boolean =>
		ROOTS.some((root) => existsSync(join(REPO_ROOT, root, path)));

	/**
	 * The DOCS pages only. `engineering/SITE_BUILDER_INSTANCES.md` deliberately names files
	 * that must NOT exist — §4's retirement law lists the six hand-written artifacts the
	 * renderers replaced, and its own gate asserts they stay deleted. A page whose subject is
	 * an absence cannot be held to a presence.
	 */
	const PAGES = SCANNED_PAGES.filter((page) => page.startsWith('docs/'));

	test('anti-vacuity: the scan found paths to resolve', () => {
		const all = PAGES.flatMap((page) => [...codeText(read(page)).matchAll(PATH_PATTERN)]);
		expect(all.length).toBeGreaterThanOrEqual(5);
	});

	test('each one resolves', () => {
		const offenders: string[] = [];
		for (const page of PAGES) {
			for (const match of codeText(read(page)).matchAll(PATH_PATTERN)) {
				const path = match[0] as string;
				// A brace-expansion listing (`src/provision/{plan,apply}.ts`) is a summary, not
				// a path; the pattern cannot produce one, but a `*` glob can be written.
				if (path.includes('*')) continue;
				if (!resolves(path)) offenders.push(`${page}: ${path}`);
			}
		}
		expect(
			offenders,
			'A management page names a repo file that does not exist. That is how the retired ' +
				'installer survived in the manual for weeks after it was deleted.\n  ' +
				offenders.join('\n  '),
		).toEqual([]);
	});
});

/* ─────────────────────────────────────────────────────────────────────────────
 * D — the environment keys
 * ───────────────────────────────────────────────────────────────────────────── */

describe('every daemon environment key an operator page names is one the daemon reads', () => {
	/** The daemon's own schema is the census: `  KEY: z.…` in its config module. */
	function daemonKeys(): Set<string> {
		const source = read('publication/site_builder/src/config.ts');
		// `: z.…` is not the only shape — the four roots are declared `: absolutePath,` — and
		// matching only the zod form was measured to drop SITES_ROOT, AGENT_HOME, AUDIT_DIR,
		// WEBSPACE_BASE and SITE_TABLE_FILE from the census, which would have reported five
		// real keys as dead.
		const keys = [...source.matchAll(/^ {2}([A-Z][A-Z0-9_]+):\s/gm)].map((m) => m[1] as string);
		if (keys.length < 20)
			throw new Error(
				'publication/site_builder/src/config.ts: the key grammar changed and this census is scanning nothing',
			);
		return new Set(keys);
	}

	/**
	 * Names that are legitimately UPPER_SNAKE in these pages and are NOT daemon keys. Each
	 * carries its reason, and the set is asserted LIVE below: an entry nothing uses any more
	 * is as much a lie as a missing one.
	 */
	const NOT_A_DAEMON_KEY: Readonly<Record<string, string>> = Object.freeze({
		OPENAI_API_KEY:
			"a THIRD-PARTY variable, forwarded to the OpenCode child inside OPENCODE_ENV's contents; the daemon never reads it",
		OPENAI_BASE_URL: 'the same — the endpoint a local model answers on, forwarded, not read',
		CREDENTIALS_DIRECTORY:
			"systemd's own variable, set by the unit's LoadCredential=; the daemon reads FROM it and does not declare it",
		TOKEN:
			'one of the four words of the credential-law pattern (KEY|TOKEN|SECRET|PASSWORD), quoted as a word',
		SECRET: 'the same pattern, quoted as a word',
		PASSWORD: 'the same pattern, quoted as a word',
		DEDALO_SITE_BUILDER_:
			'the engine key PREFIX, written with a trailing wildcard to mean all of them',
		CSRF: 'a protocol term in the request-model diagram, not a key',
		HTTP: 'a protocol name, not a key',
		PREPROD_PASSWORD:
			'a credential FILE name this repo chose, referenced by PATH from the declaration; it is never an environment key',
		PREPROD_ROOT:
			'RETIRED, and named on purpose: the adoption page has to tell an operator which keys their pre-instance .env carries. Held to the assignment rule below — history may be described, never assigned.',
		PROD_ROOT: 'the same retired pair, and the same rule',
		AGENTS: 'the agent brief file AGENTS.md, named in a workspace listing',
		CLAUDE: 'the symlink CLAUDE.md beside it, named in the same listing',
	});

	/**
	 * The DOCS pages only. `engineering/SITE_BUILDER_INSTANCES.md` is a specification and its
	 * code spans are full of TypeScript identifiers (`INSTANCE_PATTERN`, `USER_PREFIX`,
	 * `SLUG_PATTERN`); it also names the four DELETED root keys precisely to record that they
	 * are deleted. Its agreement with the code is gated by the daemon's own
	 * `tests/provision.test.ts`, which evaluates its accessors and its mode matrix directly.
	 */
	const PAGES = SCANNED_PAGES.filter((page) => page.startsWith('docs/'));

	test('anti-vacuity: the scan found keys to check', () => {
		const seen = PAGES.flatMap((page) => [
			...codeText(read(page)).matchAll(/\b[A-Z][A-Z0-9_]{3,}_?\b/g),
		]);
		expect(seen.length).toBeGreaterThanOrEqual(20);
	});

	test('each named key is a daemon key, an engine catalog key, or a reason-stamped exception', () => {
		const daemon = daemonKeys();
		const engine = new Set(Object.keys(CONFIG_CATALOG));
		const offenders: string[] = [];
		const usedExceptions = new Set<string>();

		for (const page of PAGES) {
			for (const match of codeText(read(page)).matchAll(/\b[A-Z][A-Z0-9_]{3,}_?\b/g)) {
				const token = match[0] as string;
				if (daemon.has(token) || engine.has(token)) continue;
				if (token in NOT_A_DAEMON_KEY) {
					usedExceptions.add(token);
					continue;
				}
				offenders.push(`${page}: ${token}`);
			}
		}

		expect(
			offenders,
			'An operator page names an environment key nothing reads. The four that produced a ' +
				'non-working install were PREPROD_ROOT, PROD_ROOT, PREPROD_BASE_URL and ' +
				'PROD_BASE_URL — configuration the daemon had never heard of, in a copy-paste ' +
				'block. Either the key is real (add it to the daemon or the catalog) or the page ' +
				'is wrong.\n  ' +
				offenders.join('\n  '),
		).toEqual([]);

		// LIVE in the other direction: an exception nobody needs is a stale claim.
		expect([...usedExceptions].sort()).toEqual(Object.keys(NOT_A_DAEMON_KEY).sort());
	});

	test('a retired root key may be DESCRIBED but never assigned', () => {
		// The two exceptions above are what let the adoption page name the keys a museum's
		// pre-instance .env actually carries. They are not a licence for the defect this leg
		// was written for: PREPROD_ROOT=/var/lib/… in a copy-paste block is configuration the
		// daemon has never heard of, and it produced a non-working install. Describing is a
		// mention; instructing is an ASSIGNMENT, and only the assignment is refused.
		const RETIRED_KEYS = ['PREPROD_ROOT', 'PROD_ROOT', 'PREPROD_BASE_URL', 'PROD_BASE_URL'];
		const offenders: string[] = [];
		for (const page of SCANNED_PAGES) {
			for (const key of RETIRED_KEYS) {
				const assignment = new RegExp(`\\b${key}\\s*=`);
				for (const [index, line] of read(page).split('\n').entries()) {
					if (assignment.test(line)) offenders.push(`${page}:${index + 1}: ${line.trim()}`);
				}
			}
		}
		expect(
			offenders,
			'A page ASSIGNS a root key the daemon does not read. Those four keys are what made ' +
				'the manual produce a non-working install.\n  ' +
				offenders.join('\n  '),
		).toEqual([]);
		// Anti-vacuity: the rule must still see the shape it forbids.
		expect(/\bPREPROD_ROOT\s*=/.test('PREPROD_ROOT=/var/lib/dedalo_sites/preprod')).toBe(true);
	});

	test('the retired procedure stays retired', () => {
		// The dead ACTS, not a dead filename. The key census above covers the dead env keys;
		// this covers the two instructions that made the page produce a non-working install:
		// run the deleted installer, and hand-copy a unit or a vhost into a system
		// directory. The unit's OLD NAME is deliberately not banned — `provision adopt`
		// defaults `--unit` to it, so a correct page has to be able to say it.
		const MANAGEMENT_PAGES = [
			'docs/management/site_builder.md',
			'docs/management/site_builder_cookbook.md',
		];
		const RETIRED_ACTS: readonly { readonly pattern: RegExp; readonly why: string }[] = [
			{
				pattern: /\binstall\.sh\b/,
				why: 'the retired installer, deleted when the provisioner replaced it',
			},
			{
				pattern: /\b(?:cp|install|ln)\b[^\n]*\/etc\/(?:systemd|nginx|apache2)\b/,
				why: 'hand-copying a unit or a vhost into a system directory — every one of those files is now GENERATED from the declaration, and a copied one is drift on the next run',
			},
		];
		const offenders: string[] = [];
		for (const page of MANAGEMENT_PAGES) {
			const text = read(page);
			for (const act of RETIRED_ACTS) {
				const hit = text.match(act.pattern);
				if (hit) offenders.push(`${page}: “${hit[0]}” — ${act.why}`);
			}
		}
		expect(offenders).toEqual([]);

		// Anti-vacuity: both patterns must still SEE a violation when one is present.
		const controls = [
			'sudo ./install.sh --instance x',
			'sudo cp deploy/dedalo-site-builder.service /etc/systemd/system/',
			'sudo install -m 0644 nginx/site.conf /etc/nginx/sites-available/x.conf',
		];
		for (const control of controls) {
			expect({ control, caught: RETIRED_ACTS.some((act) => act.pattern.test(control)) }).toEqual({
				control,
				caught: true,
			});
		}
	});
});

/* ─────────────────────────────────────────────────────────────────────────────
 * E — the backup set
 * ───────────────────────────────────────────────────────────────────────────── */

describe('the backup set PRODUCTION.md §6 names is the one the nightly unit copies', () => {
	const UNIT = 'deploy/dedalo-backup.service';

	/** §6, from its heading to the next `## `. */
	function backupSection(): string {
		const doc = read('engineering/PRODUCTION.md');
		const from = doc.indexOf('## 6. Backups');
		expect(from).toBeGreaterThan(-1);
		const to = doc.indexOf('\n## ', from + 1);
		return doc.slice(from, to === -1 ? undefined : to);
	}

	/** The rows of §6's store table: `| n | name | \`token\` |`. */
	function documentedStores(): { number: string; store: string; token: string }[] {
		return [...backupSection().matchAll(/^\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*`([^`]+)`\s*\|$/gm)].map(
			(m) => ({
				number: m[1] as string,
				store: m[2] as string,
				token: m[3] as string,
			}),
		);
	}

	/** Every ExecStart line of the unit, commented-out ones included. */
	function execStarts(): string[] {
		return read(UNIT)
			.split('\n')
			.filter((line) => /^#?ExecStart=/.test(line.trim()));
	}

	test('the table is parseable, and its numbering is 1..n', () => {
		const stores = documentedStores();
		expect(stores.length).toBeGreaterThanOrEqual(5);
		expect(stores.map((s) => s.number)).toEqual(stores.map((_, index) => String(index + 1)));
	});

	test('the prose count equals the number of stores', () => {
		const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
		const stores = documentedStores();
		const expected = `backup set is ${WORDS[stores.length]} stores`;
		expect(
			backupSection().includes(expected),
			`engineering/PRODUCTION.md §6 lists ${stores.length} stores but does not say "${expected}". ` +
				'The sentence and the list are the same claim.',
		).toBe(true);
		// And the numbered narrative list has one item per row. Only the list BEFORE the
		// first subsection: §6.1's restore order is also a numbered list, and counting it
		// too would make the two claims impossible to keep equal.
		const storeList = backupSection().split('\n### ')[0] as string;
		const items = [...storeList.matchAll(/^\d+\. \*\*/gm)];
		expect(items.length).toBe(stores.length);
	});

	test('every documented store is actually copied by the unit', () => {
		const unit = read(UNIT);
		const offenders = documentedStores()
			.filter((store) => !unit.includes(store.token))
			.map(
				(store) =>
					`store ${store.number} (${store.store}): nothing in ${UNIT} contains \`${store.token}\``,
			);
		expect(
			offenders,
			'A store documented in the backup set and copied by nothing is a store discovered ' +
				'missing at restore time.\n  ' +
				offenders.join('\n  '),
		).toEqual([]);
	});

	test('every ExecStart in the unit is a documented store', () => {
		const tokens = documentedStores().map((store) => store.token);
		const offenders = execStarts().filter((line) => !tokens.some((token) => line.includes(token)));
		expect(
			offenders,
			`${UNIT} copies something engineering/PRODUCTION.md §6 does not list. An undocumented ` +
				'backup step is one nobody knows how to restore.\n  ' +
				offenders.join('\n  '),
		).toEqual([]);
		expect(execStarts().length).toBe(documentedStores().length);
	});

	test('§6 states a restore order and a reconciliation rule', () => {
		const section = backupSection();
		for (const required of ['Restore order', 'reconciliation rule']) {
			expect({ required, present: section.includes(required) }).toEqual({
				required,
				present: true,
			});
		}
		// The reconciliation rule is the one `src/provision/verify.ts` runs, and it must name
		// the field it compares against — a rule that says "check the symlink" without saying
		// what it must agree with is not a rule.
		expect(section).toContain('published.release');
	});

	test('the site-builder store’s copier exists, is executable, and derives its paths', () => {
		const script = 'deploy/dedalo-site-builder-backup.sh';
		expect(existsSync(join(REPO_ROOT, script))).toBe(true);
		expect(lstatSync(join(REPO_ROOT, script)).mode & 0o111).toBeGreaterThan(0);
		// EXECUTABLE lines only. The header explains at length which artifacts the script
		// reads, so a whole-file substring check passes on a script whose CODE no longer
		// reads them — measured: renaming the one live `SITES_ROOT` left this green.
		const code = read(script)
			.split('\n')
			.filter((line) => !/^\s*#/.test(line))
			.join('\n');
		// It must read the instance's own generated artifacts rather than carry a list of
		// roots — the second-derivation defect, whose failure direction here is a museum's
		// data quietly outside the backup.
		for (const derived of ['SITES_ROOT', 'AUDIT_DIR', 'sites.json', 'instance.json']) {
			expect({ derived, present: code.includes(derived) }).toEqual({ derived, present: true });
		}
	});
});

/* ─────────────────────────────────────────────────────────────────────────────
 * G — the declarations a page hands an operator
 * ───────────────────────────────────────────────────────────────────────────── */

describe('every declaration an operator page shows actually parses', () => {
	const PAGES = ['docs/management/site_builder.md', 'docs/management/site_builder_cookbook.md'];

	interface Block {
		readonly index: number;
		readonly value: Record<string, unknown>;
	}

	/**
	 * Every fenced ```json block of a page, in the form it CLAIMS to be.
	 *
	 * A page shows two shapes and both must be checked: a whole document (starts with `{`)
	 * and an EXCERPT of one (`"sites": [ … ], "serving": { … }`, which is how the
	 * custom-domain section shows two fields without reprinting a 40-line declaration). An
	 * excerpt is wrapped in braces so it is parsed as what it is, rather than skipped for not
	 * being a document — skipping it is how a mistyped field name in the block an operator is
	 * most likely to copy would go unnoticed.
	 */
	function jsonBlocks(page: string): Block[] {
		const blocks: Block[] = [];
		for (const [index, match] of [...read(page).matchAll(/^```json\n([\s\S]*?)^```/gm)].entries()) {
			const body = (match[1] as string).trim();
			const text = body.startsWith('{') ? body : `{${body.replace(/,\s*$/, '')}}`;
			try {
				blocks.push({ index, value: JSON.parse(text) as Record<string, unknown> });
			} catch (error) {
				throw new Error(
					`${page}: the JSON block at index ${index} is not valid JSON — ${(error as Error).message}. ` +
						'An operator copies these blocks verbatim.',
				);
			}
		}
		return blocks;
	}

	/** A WHOLE declaration names the instance; everything else is an excerpt of one. */
	const declaresAnInstance = (block: Block): boolean => 'instance' in block.value;

	/** The merge `adopt` performs: deep, and the overlay wins at every leaf. */
	function merge(
		base: Record<string, unknown>,
		over: Record<string, unknown>,
	): Record<string, unknown> {
		const out: Record<string, unknown> = { ...base };
		for (const [key, value] of Object.entries(over)) {
			const existing = out[key];
			const bothObjects =
				existing !== null &&
				typeof existing === 'object' &&
				!Array.isArray(existing) &&
				value !== null &&
				typeof value === 'object' &&
				!Array.isArray(value);
			out[key] = bothObjects
				? merge(existing as Record<string, unknown>, value as Record<string, unknown>)
				: value;
		}
		return out;
	}

	/**
	 * What `adopt` infers from a pre-instance install, in the shape it infers it — the base a
	 * documented `--declare` fragment is merged over. Nothing here is invented: these are the
	 * fields `inferManifest` fills from the `.env`, the unit and each site's own manifest, and
	 * the three a pre-instance install cannot record are absent, which is why the fragment
	 * exists at all.
	 */
	const INFERRED_FROM_A_PRE_INSTANCE_HOST: Record<string, unknown> = {
		instance: 'museum-a',
		publication_api: { url: 'http://127.0.0.1:3100/publication/server_api/v2' },
		// Read off the installed unit's WorkingDirectory=/ExecStart=, which is why the
		// documented fragment does not have to carry them — and why this base does.
		engine: {
			checkout_dir: '/opt/dedalo/master_dedalo',
			bun_bin: '/opt/dedalo/.bun/bin/bun',
		},
		identity: { user: 'dedalo-sites', group: 'dedalo-sites' },
		roots: {
			workspaces: '/var/lib/dedalo_sites/workspaces',
			home: '/var/lib/dedalo_sites/home',
			audit: '/var/log/dedalo_sites',
		},
		webspace_base: '/home/www',
		sites: [
			{
				slug: 'coleccion',
				domain: 'www.museum-a.example',
				webspace: '/home/www/www.museum-a.example',
			},
		],
		serving: { preprod: { enabled: true, auth: { mode: 'none', users: [] } } },
		agent: { driver: 'claude_code', bins: { claude_code: '/usr/local/bin/claude' } },
	};

	test('anti-vacuity: there are declarations and excerpts to parse', () => {
		const blocks = PAGES.flatMap((page) => jsonBlocks(page));
		expect(blocks.filter(declaresAnInstance).length).toBeGreaterThanOrEqual(2);
		expect(blocks.length).toBeGreaterThanOrEqual(4);
	});

	test('every whole declaration parses and derives', () => {
		for (const page of PAGES) {
			for (const block of jsonBlocks(page).filter(declaresAnInstance)) {
				// `parseManifest` throws an InstanceManifestError naming every bad field;
				// `derive` is what turns it into paths, so a block that parses but cannot be
				// derived is still a block an operator cannot use.
				const layout = derive(
					parseManifest(block.value, { source: `${page} block ${block.index}` }),
				);
				expect({ page, index: block.index, ok: layout.instance.length > 0 }).toEqual({
					page,
					index: block.index,
					ok: true,
				});
			}
		}
	});

	test("every excerpt's field names are the schema's, merged over that page's own declaration", () => {
		for (const page of PAGES) {
			const blocks = jsonBlocks(page);
			const base = blocks.find(declaresAnInstance);
			expect({ page, hasDeclaration: base !== undefined }).toEqual({ page, hasDeclaration: true });
			for (const block of blocks.filter((candidate) => !declaresAnInstance(candidate))) {
				// An excerpt is shown as a CHANGE to the declaration above it, so that is how
				// it is checked: merged in, it must still be a declaration. A misspelt
				// `webspaces` or `alias` is refused here rather than on a museum's host.
				const merged = merge((base as Block).value, block.value);
				const layout = derive(parseManifest(merged, { source: `${page} excerpt ${block.index}` }));
				expect({ page, index: block.index, ok: layout.sites.length > 0 }).toEqual({
					page,
					index: block.index,
					ok: true,
				});
			}
		}
	});

	test('the --declare fragment merges over an inference and is accepted', () => {
		// The adopt fragment is the one excerpt whose base is NOT the page's own declaration
		// but an inference from a live host, so it gets its own case. It is identified by the
		// field only it supplies.
		const fragments = jsonBlocks('docs/management/site_builder.md').filter(
			(block) => !declaresAnInstance(block) && 'engine' in block.value,
		);
		expect(
			fragments.length,
			'docs/management/site_builder.md no longer shows an adopt --declare fragment. Adoption ' +
				'REFUSES without one, so a page documenting adopt without it documents a refusal.',
		).toBe(1);

		const merged = merge(INFERRED_FROM_A_PRE_INSTANCE_HOST, (fragments[0] as Block).value);
		const manifest = parseManifest(merged, { source: 'the documented --declare fragment' });
		const layout = derive(manifest);

		// It supplies exactly the three things a pre-instance host cannot record …
		expect(manifest.serving.prod.tls.mode).not.toBe(undefined);
		// … while the two the unit DOES record survive the merge, which is what makes the
		// page's "the fragment does not need them" claim true.
		expect(manifest.engine.checkout_dir).toBe('/opt/dedalo/master_dedalo');
		expect(manifest.engine.bun_bin).toBe('/opt/dedalo/.bun/bin/bun');
		expect(layout.identity.engineGroup.length).toBeGreaterThan(0);
		expect(layout.identity.webGroup.length).toBeGreaterThan(0);
		// … and leaves the inference's own findings intact, which a shallow merge would not.
		expect(manifest.serving.preprod.enabled).toBe(true);
		expect(layout.identity.adopted).toBe(true);
		expect(layout.identity.user).toBe('dedalo-sites');
	});
});

/* ─────────────────────────────────────────────────────────────────────────────
 * F — the copier, RUN
 * ───────────────────────────────────────────────────────────────────────────── */

describe('the site-builder backup script actually copies what it claims to', () => {
	const SCRIPT = join(REPO_ROOT, 'deploy', 'dedalo-site-builder-backup.sh');

	/**
	 * A synthetic host: one declared instance, N sites, one published release each.
	 *
	 * `sites` are given as (slug, webspace) so a caller can build the case that matters —
	 * two sites of ONE museum whose webspaces share a basename.
	 */
	function buildHost(
		root: string,
		sites: readonly { slug: string; webspace: string }[] = [
			{ slug: 'coleccion', webspace: join(root, 'srv', 'www', 'www.museum-t.example') },
		],
	): { configDir: string; dest: string } {
		const configDir = join(root, 'etc', 'instances');
		const instanceDir = join(configDir, 'museum-t');
		const workspaces = join(root, 'var', 'workspaces');
		const audit = join(root, 'srv', 'audit');

		mkdirSync(join(instanceDir, 'secrets'), { recursive: true });
		mkdirSync(workspaces, { recursive: true });
		mkdirSync(audit, { recursive: true });

		writeFileSync(join(instanceDir, 'instance.json'), '{}\n');
		writeFileSync(join(instanceDir, 'secrets', 'SERVICE_TOKEN'), 'not-a-real-token\n');
		chmodSync(join(instanceDir, 'secrets', 'SERVICE_TOKEN'), 0o600);
		writeFileSync(join(instanceDir, 'env'), `AUDIT_DIR="${audit}"\nSITES_ROOT="${workspaces}"\n`);
		writeFileSync(
			join(instanceDir, 'sites.json'),
			`// dedalo-provision: museum-t sites 0\n{\n  "sites": [\n${sites
				.map(
					(site) =>
						`    {\n      "slug": "${site.slug}",\n      "webspace": "${site.webspace}"\n    }`,
				)
				.join(',\n')}\n  ]\n}\n`,
		);
		// The marker §5 requires in every root, and the release each site serves.
		writeFileSync(join(workspaces, '.dedalo_site_instance'), 'museum-t\n');
		writeFileSync(join(audit, 'audit.jsonl'), '{}\n');

		for (const site of sites) {
			mkdirSync(join(site.webspace, '.releases', 'web', 'r1'), { recursive: true });
			mkdirSync(join(site.webspace, '.releases', 'pre', 'r2'), { recursive: true });
			mkdirSync(join(workspaces, site.slug), { recursive: true });
			writeFileSync(join(workspaces, site.slug, 'site.json'), '{"published":{"release":"r1"}}\n');
			// The BYTES differ per site, which is the whole point of the collision case: two
			// identical files would pass an overwrite.
			writeFileSync(
				join(site.webspace, '.releases', 'web', 'r1', 'index.html'),
				`live ${site.slug}\n`,
			);
			// Two sites may legitimately be DECLARED onto one webspace — that is the case the
			// refusal below exists for — so the link is planted once.
			if (!existsSync(join(site.webspace, 'web'))) {
				symlinkSync(join('.releases', 'web', 'r1'), join(site.webspace, 'web'));
			}
		}

		return { configDir, dest: join(root, 'backup') };
	}

	/** Where the script puts one webspace: its own source path, minus the leading slash. */
	const backupOf = (dest: string, webspace: string): string =>
		join(dest, 'museum-t', 'webspaces', webspace.replace(/^\//, ''));

	test('it copies the markers, both release stores and the served symlink AS a symlink', () => {
		const root = join(REPO_ROOT, 'test', '.tmp-operator-commands-backup');
		rmSync(root, { recursive: true, force: true });
		try {
			const { configDir, dest } = buildHost(root);
			const run = spawnSync('sh', [SCRIPT, dest, configDir], { encoding: 'utf8' });
			expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: '' });

			const instance = join(dest, 'museum-t');
			const webspace = backupOf(dest, join(root, 'srv', 'www', 'www.museum-t.example'));

			// The declaration and its credentials.
			expect(existsSync(join(instance, 'config', 'instance.json'))).toBe(true);
			expect(existsSync(join(instance, 'config', 'secrets', 'SERVICE_TOKEN'))).toBe(true);
			// The workspaces root, INCLUDING the marker — a restore that drops dotfiles
			// produces a root the provisioner refuses.
			expect(existsSync(join(instance, 'workspaces', '.dedalo_site_instance'))).toBe(true);
			expect(existsSync(join(instance, 'workspaces', 'coleccion', 'site.json'))).toBe(true);
			// BOTH release stores.
			expect(existsSync(join(webspace, '.releases', 'web', 'r1', 'index.html'))).toBe(true);
			expect(existsSync(join(webspace, '.releases', 'pre', 'r2'))).toBe(true);
			// The served link, as a LINK: which release is live lives in a symlink and
			// nowhere else, and a copy that dereferenced it would lose that fact.
			expect(lstatSync(join(webspace, 'web')).isSymbolicLink()).toBe(true);
			expect(readlinkSync(join(webspace, 'web'))).toBe(join('.releases', 'web', 'r1'));
			// The audit trail.
			expect(existsSync(join(instance, 'audit', 'audit.jsonl'))).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test('two sites of one museum whose webspaces SHARE A BASENAME both survive', () => {
		// THE COLLISION. `sites[].webspace` is a free path, so two sites of one instance may
		// legitimately end in the same directory name. The destination used to be
		// `webspaces/$(basename …)`, so both landed on one path: rsync copied the first and
		// then copied the second over it — one museum's published bytes silently replaced by
		// another of its sites', with the script reporting success and exiting 0.
		const root = join(REPO_ROOT, 'test', '.tmp-operator-commands-backup-collision');
		rmSync(root, { recursive: true, force: true });
		try {
			const one = join(root, 'srv', 'srvA', 'site');
			const two = join(root, 'srv', 'srvB', 'site');
			const { configDir, dest } = buildHost(root, [
				{ slug: 'one', webspace: one },
				{ slug: 'two', webspace: two },
			]);
			const run = spawnSync('sh', [SCRIPT, dest, configDir], { encoding: 'utf8' });
			expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: '' });

			// BOTH, each with its own bytes. Same-named directories, two destinations.
			expect(
				readFileSync(join(backupOf(dest, one), '.releases', 'web', 'r1', 'index.html'), 'utf8'),
			).toBe('live one\n');
			expect(
				readFileSync(join(backupOf(dest, two), '.releases', 'web', 'r1', 'index.html'), 'utf8'),
			).toBe('live two\n');
			// And the served link is still a link on both sides.
			expect(lstatSync(join(backupOf(dest, one), 'web')).isSymbolicLink()).toBe(true);
			expect(lstatSync(join(backupOf(dest, two), 'web')).isSymbolicLink()).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test('a destination named twice is REFUSED and non-zero — never overwritten', () => {
		// The guard behind the naming: a site table that names one webspace twice would still
		// map onto one destination, and overwriting there is a museum's bytes lost inside a
		// backup that says it succeeded.
		const root = join(REPO_ROOT, 'test', '.tmp-operator-commands-backup-twice');
		rmSync(root, { recursive: true, force: true });
		try {
			const shared = join(root, 'srv', 'www', 'shared.example');
			const { configDir, dest } = buildHost(root, [
				{ slug: 'one', webspace: shared },
				{ slug: 'two', webspace: shared },
			]);
			const run = spawnSync('sh', [SCRIPT, dest, configDir], { encoding: 'utf8' });
			expect(run.status).not.toBe(0);
			expect(run.stderr).toContain('twice');
			expect(run.stderr).toContain('NOT backed up');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test('a source it was told about but cannot find is LOUD and non-zero', () => {
		const root = join(REPO_ROOT, 'test', '.tmp-operator-commands-backup-missing');
		rmSync(root, { recursive: true, force: true });
		try {
			const { configDir, dest } = buildHost(root);
			rmSync(join(root, 'srv', 'audit'), { recursive: true, force: true });
			const run = spawnSync('sh', [SCRIPT, dest, configDir], { encoding: 'utf8' });
			expect(run.status).not.toBe(0);
			expect(run.stderr).toContain('NOT backed up');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
