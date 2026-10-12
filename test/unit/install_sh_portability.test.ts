/**
 * THE INSTALLER RUNS ON EVERY HOST ITS GUIDE SENDS PEOPLE TO — not just on a
 * GNU/Linux box with Docker's root directory on the local filesystem.
 *
 * THE DEFECT (2026-07-27 → 2026-10-08). The disk pre-flight read
 * `df -BG --output=avail "$docker_root"` inside a `$(…)` assignment under
 * `set -euo pipefail`. Where that df fails — BSD df on macOS, or a DockerRootDir
 * that lives inside a VM (Docker Desktop on macOS and WSL, a remote DOCKER_HOST) —
 * the failed assignment exited the whole script with code 64, silently, right
 * after the banner.
 *
 * TERMINAL INSTALLER PHASE 4 (2026-10-12): the disk check moved into the
 * TypeScript installer (src/core/install/host/stack/facts.ts `freeGibOf`, read
 * by stack_preflight) and install.sh became a POSIX BOOTSTRAP (it gets Bun and
 * the release, then execs the installer). This gate follows the OUTCOMES:
 *
 *  (a) the disk probe is the old one's port: POSIX `df -Pk` (no GNU-only
 *      flag), the available KiB of the second line as whole GiB — EQUAL to the
 *      old awk over this machine's real df output — and an unmeasurable Docker
 *      root (df fails: a VM, a remote daemon) is `null`, which the preflight
 *      treats as "not measurable", never as a refusal;
 *  (b) install.sh itself parses under POSIX sh (and dash where present), names
 *      no GNU-only df flag and uses no bash-ism outside comments — the
 *      bootstrap is what an operator types first, on any distribution.
 *
 * The answers reaching the shared plan (once install.sh's own question block)
 * are the interactive installer's now: install_plain_parity_tripwire and
 * install_tui_parity_tripwire hold every front end to the flags' plan.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { freeGibOf } from '../../src/core/install/host/stack/facts.ts';
import { STACK_MIN_FREE_GIB } from '../../src/core/install/host/stack/preflight.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const INSTALL_SH = readFileSync(join(REPO_ROOT, 'install.sh'), 'utf8');

/** The retired bash probe, verbatim (git history: install.sh docker_free_gib, 2026-10-08). */
const OLD_AWK = 'NR == 2 && $4 ~ /^[0-9]+$/ { print int($4 / 1048576) }';

/** `df -Pk <path>` as the stack facts run it (stdout, '' when df failed). */
function dfPk(path: string): string {
	const run = Bun.spawnSync(['df', '-Pk', path], { stdout: 'pipe', stderr: 'pipe' });
	return run.exitCode === 0 ? run.stdout.toString() : '';
}

/** The old awk over the same text. */
function oldProbe(text: string): string {
	const run = Bun.spawnSync(['awk', OLD_AWK], {
		stdin: new TextEncoder().encode(text),
		stdout: 'pipe',
	});
	return run.stdout.toString().trim();
}

/** A GNU-only df flag or a bash-ism (install.sh runs under /bin/sh: dash on Debian/Ubuntu). */
function isOffender(line: string): boolean {
	return (
		/\bdf\b[^\n|]*(-B|--output|--block-size)/.test(line) ||
		/\[\[|\blocal\s|\bfunction\s+\w|(^|[\s=(])\$'|\bdeclare\b|\breadarray\b|<<<|\bpipefail\b/.test(
			line,
		)
	);
}

/** The code of a shell script: comment lines removed (prose about a rule is not the rule). */
function code(script: string): string[] {
	return script.split('\n').filter((line) => !/^\s*#/.test(line));
}

describe('the disk pre-flight is portable and never fatal (a)', () => {
	test("a real path: whole GiB, equal to the retired probe's", () => {
		const text = dfPk(REPO_ROOT);
		expect(text).not.toBe('');
		const gib = freeGibOf(text);
		expect(gib).not.toBeNull();
		expect(Number.isInteger(gib)).toBe(true);
		expect(String(gib)).toBe(oldProbe(text));
	});

	test('a Docker root that is not on this filesystem: null (not measurable), not a refusal', () => {
		const text = dfPk('/nonexistent/docker/root/inside/a/vm');
		expect(text).toBe('');
		expect(freeGibOf(text)).toBeNull();
		expect(oldProbe(text)).toBe('');
		// The preflight's own rule: an unmeasured disk counts as enough.
		expect(STACK_MIN_FREE_GIB).toBe(8);
	});

	test('a garbled or headerless answer is null, never a number', () => {
		expect(freeGibOf('Filesystem 1024-blocks Used Available Capacity Mounted on\n')).toBeNull();
		expect(
			freeGibOf('Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/x 1 2 n/a 3% /\n'),
		).toBeNull();
		expect(
			freeGibOf(
				'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/x 100 1 9437184 1% /\n',
			),
		).toBe(9);
	});
});

describe('install.sh is a POSIX bootstrap (b)', () => {
	test('it parses under sh -n (and dash -n where installed)', () => {
		for (const shell of ['/bin/sh', Bun.which('dash')].filter(
			(item): item is string => item !== null,
		)) {
			const run = Bun.spawnSync([shell, '-n', join(REPO_ROOT, 'install.sh')], { stderr: 'pipe' });
			expect(run.exitCode, `${shell}: ${run.stderr.toString()}`).toBe(0);
		}
		expect(INSTALL_SH.split('\n')[0]).toBe('#!/bin/sh');
	});

	test('no GNU-only df flags, no bash-isms outside comments (positive control: each is caught)', () => {
		const bashisms = [
			'[[ -n "$x" ]]',
			'local x=1',
			'function f { :; }',
			"x=$'a\\tb'",
			'declare -a x',
			'readarray x',
			'cat <<<"$x"',
			'set -o pipefail',
			'df -BG --output=avail /',
		];
		const caught = bashisms.filter((line) => code(`${line}\n`).some(isOffender));
		expect(caught).toEqual(bashisms);
		expect(code(INSTALL_SH).length).toBeGreaterThan(100);
		expect(code(INSTALL_SH).filter(isOffender)).toEqual([]);
	});

	test('it drives no docker and asks no install question: the TypeScript installer does both', () => {
		expect(code(INSTALL_SH).filter((line) => /\bdocker\b|\bread\s+-r?\s*\w/.test(line))).toEqual(
			[],
		);
		expect(INSTALL_SH).toMatch(/^exec "\$BUN" .*"\$SRC\/scripts\/install\.ts" "\$@"$/m);
	});
});
