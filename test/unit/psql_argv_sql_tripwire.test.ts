/**
 * TRIPWIRE — SQL reaches a psql child on its STDIN, never in its argv.
 *
 * WHY. A statement passed as `psql -c <sql>` is ONE argv string:
 *  - Linux caps one argv string at MAX_ARG_STRLEN (128 KiB) and the whole argv at
 *    ARG_MAX; past that, posix_spawn fails with E2BIG (the int-clean census died this
 *    way in the CI image while macOS stayed green — 4ad77190d7).
 *  - argv is world-readable in the process table (`ps`, /proc/<pid>/cmdline): every
 *    statement, with whatever it inlines, is visible to every local user for the
 *    child's whole life.
 * THE DOOR: install/pg_exec.ts `runPsqlScript(conn, sql, …)` — the SQL rides `-f -`
 * (stdin) under `-X` + `ON_ERROR_STOP=1`. `runPsql` stays for `-f <file>` runs and
 * streamed stdin; it never carries SQL text in `args`.
 *
 * THE CENSUS (derived from src/, never typed in):
 *  1. every source file that is a PSQL USER (references the door, or names the psql
 *     binary) ships NO SQL-argv flag literal: `-c`, `--command[=…]`, or a short
 *     cluster that reaches `c` before an argument-taking option (`-tAc`, `-XAtc`).
 *     `-tAF` (F takes the next element) and `-XAtq` are not.
 *  2. no string literal anywhere in src/ is a SHELL line running `psql … -c`.
 *  3. every file that names the psql BINARY itself (spawning beside the door) is
 *     enumerated below with its exact site count and why it cannot use the door.
 *
 * ONE NAMED EXEMPTION CLASS (rule 1): the HOST PLAN (install/host/**). Its psql argv
 * is not spawned by the engine's door but printed on the operator's Review and run by
 * the host runner as `postgres` — the Review's contract is "the exact argv", so a
 * constant catalog probe (role/database names, no secret, bytes not kilobytes) stays
 * readable there, and the recording runner keys its canned answers on that argv. Each
 * exempt file is pinned to its exact flag count (a new `-c` there is red too).
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { engineSourceFilesRelative } from '../helpers/engine_source_corpus.ts';
import { extractSourceLiterals } from '../helpers/sql_literals.ts';
import { stripComments } from '../helpers/strip_comments.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** psql short options that consume an argument (the rest of the cluster is its value). */
const ARGUMENT_OPTIONS = new Set(['d', 'f', 'F', 'h', 'L', 'o', 'p', 'P', 'R', 'T', 'U', 'v']);

/** Is this argv element a flag that makes psql take SQL from argv? */
function isSqlArgvFlag(text: string): boolean {
	if (text === '--command' || text.startsWith('--command=')) return true;
	if (!/^-[A-Za-z0-9?]+$/.test(text)) return false;
	for (const option of text.slice(1)) {
		if (option === 'c') return true;
		if (ARGUMENT_OPTIONS.has(option)) return false;
	}
	return false;
}

/** A shell line that runs `psql … -c` (stops at a pipe / list operator). */
const SHELL_PSQL_COMMAND = /(?:^|[\s/(])psql\b[^\n|;&]*?\s(?:-[A-Za-z]*c\b|--command\b)/;

/** A resolution of the psql BINARY in code (the engine's resolvers, called for `psql`). */
const PSQL_BINARY_CALL =
	/\bresolvePgBinary\(\s*'psql'\s*\)|\bpgBinaryCandidates\(\s*'psql'|\bresolvePsql\s*\(/g;

/** A literal that is a psql binary PATH (`${dir}/psql`, `/usr/bin/psql`). */
function namesPsqlPath(text: string): boolean {
	return text.endsWith('/psql');
}

/** Sites naming the psql binary: resolver calls + path literals. */
function psqlBinarySites(code: string, literals: readonly { text: string }[]): number {
	return (
		[...code.matchAll(PSQL_BINARY_CALL)].length +
		literals.filter((item) => namesPsqlPath(item.text)).length
	);
}

/** Does the (comment-stripped) source use the psql door or name the binary? */
function isPsqlUser(code: string, literals: readonly { text: string }[]): boolean {
	return /\brunPsql(?:Script)?\b/.test(code) || psqlBinarySites(code, literals) > 0;
}

/**
 * Files that name the psql binary themselves — exact site count (resolver calls + paths)
 * and why the door does not fit. A new direct spawn is red until listed here.
 */
const DIRECT_PSQL_BINARY: Readonly<Record<string, { sites: number; reason: string }>> = {
	'src/core/install/pg_exec.ts': { sites: 1, reason: 'THE DOOR itself (runPsql).' },
	'src/core/install/pg_bin.ts': {
		sites: 1,
		reason: 'binary RESOLUTION (candidate paths, the `psql --version` probe) — no SQL.',
	},
	'src/core/install/server_info.ts': {
		sites: 1,
		reason: 'the `psql --version` line of the server-info panel — no SQL.',
	},
	'src/core/install/seed_build.ts': {
		sites: 1,
		reason:
			'the seed compiler’s cluster LOCK session: a long-lived psql whose stdin stays open to hold pg_try_advisory_lock for the run (SQL written to its stdin).',
	},
	'src/core/install/db_restore.ts': {
		sites: 1,
		reason:
			'the installer’s LOCK session (holdInstallLock): a long-lived psql holding the install advisory lock (SQL written to its stdin).',
	},
	'src/core/install/host/facts.ts': {
		sites: 1,
		reason: 'host plan (exempt class — see header): the System check’s catalog probe.',
	},
	'src/core/install/host/production/database.ts': {
		sites: 1,
		reason: 'host plan (exempt class — see header): the database step’s psql builder.',
	},
};

/** The host plan's exempt files: exact SQL-argv flag literal count, why (see header). */
const HOST_PLAN_ARGV_SQL: Readonly<Record<string, { flags: number; reason: string }>> = {
	'src/core/install/host/facts.ts': {
		flags: 1,
		reason:
			'System check: `SELECT count(*)` of pg_database/pg_roles for the two names the operator typed — printed on the Review.',
	},
	'src/core/install/host/production/database.ts': {
		flags: 1,
		reason:
			'the `unless` existence probes and the outcome checks (constant catalog SELECTs) — printed on the Review; the CREATE/GRANT/DROP statements already travel on stdin.',
	},
};

interface FileScan {
	file: string;
	psqlUser: boolean;
	doorCalls: number;
	binarySites: number;
	argvFlags: string[];
	shellLines: string[];
}

function scanSource(file: string, source: string): FileScan {
	const code = stripComments(source);
	const literals = extractSourceLiterals(code);
	const psqlUser = isPsqlUser(code, literals);
	return {
		file,
		psqlUser,
		doorCalls: [...code.matchAll(/\brunPsql(?:Script)?\s*\(/g)].length,
		binarySites: psqlBinarySites(code, literals),
		argvFlags: psqlUser
			? literals
					.filter((item) => isSqlArgvFlag(item.text))
					.map((item) => `${item.text}@${item.line}`)
			: [],
		shellLines: literals
			.filter((item) => SHELL_PSQL_COMMAND.test(item.text))
			.map((item) => `${item.text.slice(0, 80)}@${item.line}`),
	};
}

const CORPUS = engineSourceFilesRelative();
const SCANS = CORPUS.map((file) => scanSource(file, readFileSync(join(REPO_ROOT, file), 'utf8')));

describe('psql argv carries no SQL (src/)', () => {
	test('the walk is the engine tree, and the psql users are found in it', () => {
		expect(CORPUS.length).toBeGreaterThan(500);
		const users = SCANS.filter((scan) => scan.psqlUser);
		expect(users.length).toBeGreaterThan(12);
		const doorCalls = SCANS.reduce((sum, scan) => sum + scan.doorCalls, 0);
		expect(doorCalls).toBeGreaterThan(30);
	});

	test('no psql user ships a SQL-argv flag (`-c`, `-tAc`, `--command`) outside the host-plan exemption', () => {
		const violations: string[] = [];
		for (const scan of SCANS) {
			const exempt = HOST_PLAN_ARGV_SQL[scan.file];
			if (exempt === undefined) {
				if (scan.argvFlags.length > 0)
					violations.push(`${scan.file}: SQL in psql argv — ${scan.argvFlags.join(', ')}`);
			} else if (scan.argvFlags.length !== exempt.flags) {
				violations.push(
					`${scan.file}: ${scan.argvFlags.length} argv-SQL flag(s), the exemption says ${exempt.flags}`,
				);
			}
		}
		expect(violations, 'send the SQL through runPsqlScript (install/pg_exec.ts)').toEqual([]);
	});

	test('no shell line in src/ runs `psql … -c`', () => {
		const violations = SCANS.flatMap((scan) =>
			scan.shellLines.map((line) => `${scan.file}: ${line}`),
		);
		expect(violations).toEqual([]);
	});

	test('every file naming the psql binary is enumerated with its exact site count', () => {
		const derived: Record<string, number> = {};
		for (const scan of SCANS) if (scan.binarySites > 0) derived[scan.file] = scan.binarySites;
		const pinned = Object.fromEntries(
			Object.entries(DIRECT_PSQL_BINARY).map(([file, entry]) => [file, entry.sites]),
		);
		expect(derived).toEqual(pinned);
		for (const file of Object.keys(HOST_PLAN_ARGV_SQL)) expect(file in derived).toBe(true);
	});
});

describe('the detector (control legs)', () => {
	test('SQL-argv flags are recognised; option clusters that end elsewhere are not', () => {
		for (const flag of ['-c', '-tAc', '-XAtc', '-qc', '--command', '--command=SELECT 1'])
			expect(isSqlArgvFlag(flag), flag).toBe(true);
		for (const flag of ['-f', '-tA', '-tAF', '-XAtq', '-X', '-v', '-1', '--file', '-vfoo'])
			expect(isSqlArgvFlag(flag), flag).toBe(false);
	});

	test('each forbidden shape in a synthetic psql user is flagged', () => {
		const shapes = [
			"await runPsql(conn, ['-c', sql]);",
			"await runPsql(conn, ['-X', '-tAc', `SELECT ${x}`]);",
			"const args = ['--command=SELECT 1']; await runPsql(conn, args);",
			"Bun.spawn([resolvePgBinary('psql'), ...connArgs(conn), ...(sql ? ['-c', sql] : [])]);",
			'Bun.spawn([`${dir}/psql`, "-c", statement]);',
		];
		for (const shape of shapes) expect(scanSource('x.ts', shape).argvFlags.length, shape).toBe(1);
		expect(
			scanSource('x.ts', "spawn(['sh', '-c', `psql -d x -c 'SELECT 1'`]);").shellLines,
		).toHaveLength(1);
	});

	test('the stdin door and non-psql `-c` users are clean', () => {
		const clean = scanSource(
			'x.ts',
			"await runPsqlScript(conn, sql, { flags: ['-tA'] });\nawait runPsql(conn, ['-1', '-f', path]);",
		);
		expect(clean.psqlUser).toBe(true);
		expect(clean.argvFlags).toEqual([]);
		expect(scanSource('x.ts', "spawn(['sh', '-c', 'rm -f \"$1\"']);").psqlUser).toBe(false);
		expect(scanSource('x.ts', '`gzip -c > ${file} && sync`').shellLines).toEqual([]);
	});
});
