/**
 * The nightly private-tree backup (§6 store 4) does NOT copy the export
 * artifacts root — MEASURED by running each shipped invocation's own arguments
 * through the real copier (deploy/dedalo-tree-backup.sh) over a scratch private
 * tree.
 *
 * WHY. Export files are temporary, owner-only copies of records: the TTL sweep
 * deletes them, and every read of one re-checks the owner and their current read
 * access (engineering/PRODUCTION.md §15). The default root is INSIDE the private
 * dir, which store 4 keeps for 14 generations — so without the exclusion every
 * user's exports outlived their TTL by two weeks, readable by anyone who can read
 * the backup.
 *
 * DERIVED, not spelled: the root's position is the CATALOG DEFAULT of
 * DEDALO_EXPORT_ARTIFACTS_DIR relative to the private dir; the invocations are
 * EVERY `dedalo-tree-backup.sh … --label private` code line in `deploy/` and
 * `docker-compose*.yml` (the systemd unit's ExecStart and each compose stack's
 * backup loop — the compose stacks were missed once, 2026-09-24), each run with
 * only --source/--dest repointed. A positive control runs the same copy with the
 * --exclude arguments dropped and must SEE the artifacts, so the fixture cannot
 * pass by being empty.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { CONFIG_CATALOG } from '../../src/config/catalog/index.ts';
import { privateDir } from '../../src/config/env.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const TREE_SCRIPT = join(REPO_ROOT, 'deploy/dedalo-tree-backup.sh');

const scratch = mkdtempSync(join(tmpdir(), 'dedalo_export_backup_'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** Every shipped file that can carry a backup invocation. */
function shippedFiles(): string[] {
	const deploy = readdirSync(join(REPO_ROOT, 'deploy'))
		.map((name) => `deploy/${name}`)
		.filter((rel) => statSync(join(REPO_ROOT, rel)).isFile());
	const compose = readdirSync(REPO_ROOT).filter((name) => /^docker-compose.*\.ya?ml$/.test(name));
	return [...deploy, ...compose].sort();
}

/** Code lines with shell continuations joined; comment lines dropped. */
function logicalLines(text: string): string[] {
	const out: string[] = [];
	let carry = '';
	for (const raw of text.split('\n')) {
		const line = raw.trim();
		if (carry === '' && line.startsWith('#')) continue;
		if (line.endsWith('\\')) {
			carry += `${line.slice(0, -1)} `;
			continue;
		}
		out.push(carry + line);
		carry = '';
	}
	return out;
}

/**
 * The tree-copier arguments of every PRIVATE-tree invocation in a file: the
 * tokens after the script, quotes stripped, the compose KEEP variable given a
 * value.
 */
function privateInvocations(rel: string): string[][] {
	const found: string[][] = [];
	for (const line of logicalLines(readFileSync(join(REPO_ROOT, rel), 'utf8'))) {
		const tokens = line.split(/\s+/).map((token) => token.replace(/^["']|["']$/g, ''));
		const at = tokens.findIndex((token) => token.endsWith('/dedalo-tree-backup.sh'));
		if (at === -1) continue;
		const args = tokens.slice(at + 1).filter((token) => token !== '');
		const label = args.indexOf('--label');
		if (label === -1 || args[label + 1] !== 'private') continue;
		found.push(args.map((arg) => (/^\$+\{?DEDALO_BACKUP_KEEP\}?$/.test(arg) ? '3' : arg)));
	}
	return found;
}

const INVOCATIONS: { file: string; args: string[] }[] = shippedFiles().flatMap((file) =>
	privateInvocations(file).map((args) => ({ file, args })),
);

/** Replace the value after `flag` (which must be present). */
function repoint(args: string[], flag: string, value: string): string[] {
	const index = args.indexOf(flag);
	expect(index, `the store-4 step has no ${flag}`).toBeGreaterThan(-1);
	const out = [...args];
	out[index + 1] = value;
	return out;
}

/** Drop every `--exclude <pattern>` pair. */
function withoutExcludes(args: string[]): string[] {
	const out: string[] = [];
	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--exclude') {
			i++;
			continue;
		}
		out.push(args[i] as string);
	}
	return out;
}

/** The export root's path inside the private dir, from the catalog default. */
function artifactsRelative(): string {
	const spec = CONFIG_CATALOG.DEDALO_EXPORT_ARTIFACTS_DIR as { default: unknown };
	const value =
		typeof spec.default === 'function' ? (spec.default as () => string)() : spec.default;
	const rel = relative(privateDir, String(value));
	// The default must BE inside the private dir for this gate to be the relevant one.
	expect(rel === '' || rel.startsWith('..') || isAbsolute(rel)).toBe(false);
	return rel;
}

/** A private tree: the files store 4 exists for, plus one user's export job. */
function buildPrivateTree(name: string): { source: string; job: string } {
	const source = join(scratch, name, 'private');
	mkdirSync(join(source, 'backups', 'db'), { recursive: true });
	writeFileSync(join(source, '.env'), 'DB_NAME=x\n');
	writeFileSync(join(source, 'backups', 'db', 'dump.custom'), 'dump');
	const job = join(artifactsRelative(), '11', 'job_1');
	mkdirSync(join(source, job), { recursive: true });
	writeFileSync(join(source, job, 'export.csv'), 'record data');
	return { source, job };
}

function runCopy(args: string[]): void {
	const run = spawnSync('sh', [TREE_SCRIPT, ...args], { encoding: 'utf8' });
	expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
}

describe('store 4 (the private tree) does not back up export artifacts', () => {
	test('the census finds every shipped private-tree backup (anti-vacuity)', () => {
		expect(INVOCATIONS.map((invocation) => invocation.file)).toEqual([
			'deploy/dedalo-backup.service',
			'docker-compose.simple.yml',
			'docker-compose.yml',
		]);
		for (const { args } of INVOCATIONS) expect(args).toContain('--source');
	});

	for (const { file, args } of INVOCATIONS) {
		test(`${file}: its own arguments copy the private tree WITHOUT the export root`, () => {
			const name = file.replace(/[^a-z0-9]+/gi, '_');
			const { source, job } = buildPrivateTree(`excluded_${name}`);
			const dest = join(scratch, `excluded_${name}`, 'dest');
			runCopy(repoint(repoint(args, '--source', source), '--dest', dest));
			const latest = join(dest, 'latest');
			// the copy really ran: the file store 4 exists for is there
			expect(existsSync(join(latest, '.env'))).toBe(true);
			// …and no export byte reached the backup
			expect(existsSync(join(latest, job, 'export.csv'))).toBe(false);
			expect(existsSync(join(latest, artifactsRelative()))).toBe(false);
		});

		test(`${file}: positive control — without its --exclude arguments the copy DOES carry them`, () => {
			const name = file.replace(/[^a-z0-9]+/gi, '_');
			const { source, job } = buildPrivateTree(`control_${name}`);
			const dest = join(scratch, `control_${name}`, 'dest');
			runCopy(withoutExcludes(repoint(repoint(args, '--source', source), '--dest', dest)));
			expect(existsSync(join(dest, 'latest', job, 'export.csv'))).toBe(true);
		});
	}
});
