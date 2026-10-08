/**
 * install.sh must RUN on every host its guide sends people to — not just on a
 * GNU/Linux box with Docker's root directory on the local filesystem.
 *
 * THE DEFECT (2026-07-27 → 2026-10-08). The disk pre-flight read
 * `df -BG --output=avail "$docker_root"` inside a `$(…)` assignment under
 * `set -euo pipefail`. Where that df fails — BSD df on macOS, or a DockerRootDir
 * that lives inside a VM (Docker Desktop on macOS and WSL, a remote DOCKER_HOST) —
 * the failed assignment exited the whole script with code 64, silently, right
 * after the banner. The quickstart tells macOS users to run exactly this script.
 *
 * WHAT THIS GATE DOES: it lifts the real `docker_free_gib` function out of
 * install.sh and runs it under the script's own shell options, against a path that
 * does not exist (the VM case) and one that does. It is a behaviour gate, not a
 * text match — plus one ratchet on the GNU-only df flags that caused it.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const INSTALL_SH = readFileSync(join(REPO_ROOT, 'install.sh'), 'utf8');

/** The `docker_free_gib` function, verbatim from install.sh. */
function probeFunction(): string {
	const match = INSTALL_SH.match(/^docker_free_gib\(\) \{\n[\s\S]*?\n\}$/m);
	expect(
		match,
		'install.sh: no `docker_free_gib() { … }` function — the disk probe moved or was inlined',
	).not.toBeNull();
	return (match as RegExpMatchArray)[0];
}

/** Run `free_gib="$(docker_free_gib <path>)"` exactly as install.sh does. */
function runProbe(path: string): { exitCode: number; stdout: string } {
	const script = `set -euo pipefail\n${probeFunction()}\nfree_gib="$(docker_free_gib "$1")"\necho "survived:[$free_gib]"`;
	const run = Bun.spawnSync(['bash', '-c', script, 'probe', path]);
	return { exitCode: run.exitCode ?? -1, stdout: new TextDecoder().decode(run.stdout).trim() };
}

describe('install.sh disk pre-flight is portable and never fatal', () => {
	test('a Docker root that is not on this filesystem skips the check instead of killing the script', () => {
		const result = runProbe('/nonexistent/dedalo/docker-root-in-a-vm');
		expect(result.exitCode, 'the probe killed the script under set -euo pipefail').toBe(0);
		expect(result.stdout).toBe('survived:[]');
	});

	test('a real path yields a whole number of GiB', () => {
		const result = runProbe(REPO_ROOT);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toMatch(/^survived:\[\d+\]$/);
	});

	test('install.sh uses the probe, and no GNU-only df flags anywhere', () => {
		expect(INSTALL_SH).toMatch(/^free_gib="\$\(docker_free_gib "\$docker_root"\)"$/m);
		for (const [index, line] of INSTALL_SH.split('\n').entries()) {
			if (/^\s*#/.test(line)) continue;
			expect(
				/\bdf\b[^\n|]*(-B|--output|--block-size)/.test(line),
				`install.sh:${index + 1} uses a GNU-only df flag — BSD df (macOS) rejects it: ${line.trim()}`,
			).toBe(false);
		}
	});
});
