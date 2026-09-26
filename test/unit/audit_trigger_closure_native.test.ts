/**
 * AUDIT TRIGGER DERIVATION GATE (S3, 2026-09-26).
 *
 * The push gate skips the dependency audit unless the push touched one of its
 * inputs (scripts/ci/audit.ts `auditRunDecision`). The audit's CODE inputs used
 * to be a hand list (audit.ts, vendor_verify.ts, reason_validator.ts): a helper
 * newly imported by audit.ts, edited alone in a later push, was not on it — the
 * checker changed and the checker did not run.
 *
 * The set is now the relative-import closure of AUDIT_CODE_ROOTS
 * (`auditCodeInputs`). This gate measures the OUTCOME, not a spelling: it
 * overlays an edit that adds a new import to audit.ts (through the injectable
 * source reader — nothing is written to the tree) and proves the new module,
 * and what IT imports, become triggers with no list edit anywhere. The
 * positive control is the same matcher without the edit, where they are not.
 *
 * THE CHANGE SET IS RENAME-AWARE (`changedSince`). A rename is diffed as a
 * delete + an add (`--no-renames`), so a file moved OUT of vendor/ still names
 * its old vendor/ path and the audit runs. Proven on a scratch repo with
 * `git mv vendor/x other/x`; the negative control is git's default diff, which
 * names only the new path — the skip the flag exists to prevent.
 *
 * Imported from scripts/lib/audit_triggers.ts, NOT audit.ts: audit.ts globs the
 * whole repo for its PACKAGES census at module load, a walk this gate neither
 * needs nor asserts on. This gate reads only the files the import graph names.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
	AUDIT_CODE_ROOTS,
	auditCodeInputs,
	auditTriggerMatcher,
	changedSince,
	type SourceReader,
} from '../../scripts/lib/audit_triggers.ts';

const ROOT = resolve(import.meta.dir, '../..');

const disk: SourceReader = (rel) => {
	try {
		return readFileSync(join(ROOT, rel), 'utf-8');
	} catch {
		return null;
	}
};

/** The real tree, with some files replaced or added in memory. */
function overlay(files: Record<string, string>): SourceReader {
	return (rel) => (rel in files ? (files[rel] as string) : disk(rel));
}

const AUDIT = 'scripts/ci/audit.ts';
const NEW_HELPER = 'scripts/lib/zz_audit_new_helper.ts';
const DEEPER = 'scripts/lib/zz_audit_deeper.ts';

function withNewImport(): SourceReader {
	const source = disk(AUDIT);
	if (source === null) throw new Error(`${AUDIT} unreadable`);
	return overlay({
		// A value import that is USED, as a real helper would be.
		[AUDIT]: `import { zzHelper } from '../lib/zz_audit_new_helper.ts';\nzzHelper();\n${source}`,
		[NEW_HELPER]:
			"import { deeper } from './zz_audit_deeper';\nexport function zzHelper() { return deeper(); }\n",
		[DEEPER]: 'export function deeper() { return 1; }\n',
	});
}

describe('audit trigger set — derived from the import graph', () => {
	test('the real closure is complete and reaches the helpers audit.ts imports', () => {
		const code = auditCodeInputs();
		expect(code.incomplete).toEqual([]);
		for (const root of AUDIT_CODE_ROOTS) expect(code.files).toContain(root);
		// Reached through audit.ts's imports, not named anywhere in the matcher.
		expect(code.files).toContain('scripts/vendor_verify.ts');
		expect(code.files).toContain('scripts/lib/reason_validator.ts');
		// The derivation's own module is a checker input too (audit.ts imports it).
		expect(code.files).toContain('scripts/lib/audit_triggers.ts');
	});

	test('a NEW relative import in audit.ts makes that module (and its imports) a trigger, no list edit', () => {
		const unedited = auditTriggerMatcher([], auditCodeInputs(AUDIT_CODE_ROOTS, disk));
		expect(unedited(NEW_HELPER)).toBe(false); // positive control: not an input yet
		expect(unedited(DEEPER)).toBe(false);

		const code = auditCodeInputs(AUDIT_CODE_ROOTS, withNewImport());
		expect(code.incomplete).toEqual([]);
		const edited = auditTriggerMatcher([], code);
		expect(edited(NEW_HELPER)).toBe(true);
		expect(edited(DEEPER)).toBe(true); // transitive, extensionless specifier resolved
		expect(edited('src/core/section/read.ts')).toBe(false); // the rest of the tree is untouched
	});

	test('comments, strings and type-only imports are not edges', () => {
		const code = auditCodeInputs(
			[AUDIT],
			overlay({
				[AUDIT]:
					"// import './zz_commented.ts';\nconst s = \"import './zz_string.ts'\";\nimport type { T } from './zz_type_only.ts';\nexport const x: T | string = s;\n",
			}),
		);
		expect(code.files).toEqual([AUDIT]);
		expect(code.incomplete).toEqual([]);
	});

	test('FAIL-SAFE: an unresolvable import or an unparseable module makes EVERY path a trigger', () => {
		const dangling = auditCodeInputs(
			[AUDIT],
			overlay({ [AUDIT]: "import { gone } from './zz_missing.ts';\ngone();\n" }),
		);
		expect(dangling.incomplete.length).toBe(1);
		expect(auditTriggerMatcher([], dangling)('src/anything.ts')).toBe(true);

		const broken = auditCodeInputs([AUDIT], overlay({ [AUDIT]: 'import { from ;;; (((' }));
		expect(broken.incomplete.length).toBe(1);
		expect(auditTriggerMatcher([], broken)('docs/x.md')).toBe(true);
	});
});

describe('the change set — a rename OUT of vendor/ still triggers the audit', () => {
	const scratch = mkdtempSync(join(tmpdir(), 'dedalo-audit-trigger-'));
	afterAll(() => rmSync(scratch, { recursive: true, force: true }));
	// No GIT_* inherited: a scratch repo is named by cwd, never by an ambient GIT_DIR.
	const env = Object.fromEntries(
		Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
	);
	const git = (...args: string[]): string => {
		const proc = Bun.spawnSync(
			[
				'git',
				'-c',
				'user.name=gate',
				'-c',
				'user.email=gate@example.invalid',
				'-c',
				'commit.gpgsign=false',
				'-c',
				'core.hooksPath=/dev/null',
				...args,
			],
			{ cwd: scratch, env, stdout: 'pipe', stderr: 'pipe' },
		);
		if (proc.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${proc.stderr.toString()}`);
		return proc.stdout.toString();
	};
	git('init', '-q', '-b', 'main');
	mkdirSync(join(scratch, 'vendor/x'), { recursive: true });
	writeFileSync(join(scratch, 'vendor/x/lib.js'), 'export const lib = 1;\n');
	git('add', '-A');
	git('commit', '-q', '-m', 'vendored');
	const base = git('rev-parse', 'HEAD').trim();
	mkdirSync(join(scratch, 'other'));
	git('mv', 'vendor/x', 'other/x');
	git('commit', '-q', '-m', 'moved out of vendor');
	const isTrigger = auditTriggerMatcher([]);

	test('changedSince names BOTH paths of the rename, so the vendor/ source triggers', () => {
		const changed = changedSince(base, scratch);
		expect(changed).toEqual(['other/x/lib.js', 'vendor/x/lib.js']);
		expect((changed ?? []).filter(isTrigger)).toEqual(['vendor/x/lib.js']);
	});

	test("negative control: git's rename-detecting diff names only the new path — no trigger", () => {
		const detected = git('-c', 'diff.renames=true', 'diff', '--name-only', base, '--')
			.split('\n')
			.filter((line) => line !== '');
		expect(detected).toEqual(['other/x/lib.js']);
		expect(detected.some(isTrigger)).toBe(false);
	});

	test('an unresolvable base is null (the fail-safe "run"), never an empty diff', () => {
		expect(changedSince('zz_no_such_ref', scratch)).toBeNull();
		expect(changedSince('', scratch)).toBeNull();
	});
});
