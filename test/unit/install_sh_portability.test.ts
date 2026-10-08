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
 *
 * THE ANSWERS REACH THE SHARED PLAN (2026-10-08, installer unification A1/A3/A7).
 * install.sh's headless questions are turned into installer flags by one block.
 * The gate lifts that block and the `confirm_yes` helper out of the script, runs
 * them under `set -euo pipefail` with the operator's answers, and feeds the argv
 * they produce through the installer's own parser (`answersFromCliArgs` +
 * `buildInstallPlan`, src/core/install/install_plan.ts): "default" must reach the
 * shared default (no flag), "none" must reach an empty thesaurus list, and
 * declining the update server must reach an air-gapped plan — with no parse error.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultOptionalHierarchies } from '../../src/core/install/hierarchy_meta.ts';
import {
	answersFromCliArgs,
	buildInstallPlan,
	OFFICIAL_ONTOLOGY_SERVER,
} from '../../src/core/install/install_plan.ts';

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

/** A top-level `name() { … }` function, verbatim from install.sh. */
function liftFunction(name: string): string {
	const match = INSTALL_SH.match(new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}$`, 'm'));
	expect(match, `install.sh: no \`${name}() { … }\` function`).not.toBeNull();
	return (match as RegExpMatchArray)[0];
}

/** The block that turns the answers into installer flags, verbatim. */
function argsBlock(): string {
	const match = INSTALL_SH.match(
		/^install_args=\($[\s\S]*?^if \[ "\$USE_UPDATE_SERVERS" = 'false' \]; then install_args\+=\(--no-update-servers\); fi$/m,
	);
	expect(
		match,
		'install.sh: the install_args block (ending with the --no-update-servers append) moved',
	).not.toBeNull();
	return (match as RegExpMatchArray)[0];
}

interface Answers {
	LANGS: string;
	HIERARCHIES: string;
	USE_UPDATE_SERVERS: 'true' | 'false';
}

/** Run the lifted block with these answers; return the argv it builds (NUL-separated, exact). */
function buildArgs(answers: Answers): string[] {
	const script = [
		'set -euo pipefail',
		'DB_PASSWORD=pw ENTITY=museo ENTITY_LABEL=Museo LOCALE=es-ES TIMEZONE=Europe/Madrid',
		`LANGS="$1" HIERARCHIES="$2" USE_UPDATE_SERVERS="$3"`,
		'APP_LANG="${LANGS%%,*}"',
		argsBlock(),
		`printf '%s\\0' "\${install_args[@]}"`,
	].join('\n');
	const run = Bun.spawnSync([
		'bash',
		'-c',
		script,
		'args',
		answers.LANGS,
		answers.HIERARCHIES,
		answers.USE_UPDATE_SERVERS,
	]);
	expect(run.exitCode, new TextDecoder().decode(run.stderr)).toBe(0);
	const argv = new TextDecoder().decode(run.stdout).split('\0').slice(0, -1);
	// Corpus floor: the fixed flags (password, entity, label, locale, timezone…)
	// always arrive, so an empty argv means the lifted block ran blind.
	expect(argv.length, 'the lifted install_args block emitted no flags').toBeGreaterThan(5);
	return argv;
}

/** `confirm_yes` / `confirm` under the script's shell options, with `reply` typed. */
function ask(helper: 'confirm' | 'confirm_yes', reply: string): number {
	const script = `set -euo pipefail\n${liftFunction(helper)}\nif ${helper} 'Question?'; then exit 0; else exit 1; fi`;
	const run = Bun.spawnSync(['bash', '-c', script], {
		stdin: new TextEncoder().encode(`${reply}\n`),
	});
	return run.exitCode ?? -1;
}

describe('install.sh answers reach the shared install plan', () => {
	test('confirm_yes: Enter and yes accept, only n/no decline (any case); confirm keeps No as default', () => {
		for (const reply of ['', 'y', 'Y', 'yes', 'YES'])
			expect(ask('confirm_yes', reply), `confirm_yes '${reply}'`).toBe(0);
		for (const reply of ['n', 'N', 'no', 'No'])
			expect(ask('confirm_yes', reply), `confirm_yes '${reply}'`).toBe(1);
		expect(ask('confirm', '')).toBe(1);
		expect(ask('confirm', 'Yes')).toBe(0);
	});

	test('all defaults: no language or thesaurus flag, official update servers, the shared thesaurus default', () => {
		const argv = buildArgs({
			LANGS: 'default',
			HIERARCHIES: 'default',
			USE_UPDATE_SERVERS: 'true',
		});
		for (const flag of [
			'--langs',
			'--app-lang',
			'--data-lang',
			'--hierarchies',
			'--no-update-servers',
		]) {
			expect(argv, `${flag} must be omitted for the default`).not.toContain(flag);
		}
		const invocation = answersFromCliArgs(argv);
		const plan = buildInstallPlan(invocation.raw);
		expect([...invocation.errors, ...plan.errors]).toEqual([]);
		expect(plan.answers.update_servers).toBe('official');
		expect([...plan.hierarchies]).toEqual(defaultOptionalHierarchies());
		expect(plan.answers.langs).toBeUndefined();
		const servers = plan.env
			.flatMap((section) => section.entries)
			.find((entry) => entry.key === 'ONTOLOGY_SERVERS');
		expect(servers && JSON.parse(servers.value)).toEqual([OFFICIAL_ONTOLOGY_SERVER]);
	});

	test('explicit answers: languages, "none" thesauri and the air-gapped opt-out all arrive', () => {
		const argv = buildArgs({
			LANGS: 'lg-spa,lg-eng',
			HIERARCHIES: 'none',
			USE_UPDATE_SERVERS: 'false',
		});
		const invocation = answersFromCliArgs(argv);
		const plan = buildInstallPlan(invocation.raw);
		expect([...invocation.errors, ...plan.errors]).toEqual([]);
		expect([...plan.hierarchies]).toEqual([]);
		expect(plan.answers.update_servers).toBe('none');
		expect(plan.answers.langs).toEqual(['lg-spa', 'lg-eng']);
		expect(plan.answers.app_lang_default).toBe('lg-spa');
		const entries = plan.env.flatMap((section) => section.entries);
		for (const key of ['ONTOLOGY_SERVERS', 'CODE_SERVERS']) {
			expect(entries.find((entry) => entry.key === key)?.value, key).toBe('[]');
		}
	});

	// `ask VAR …` OVERWRITES VAR with its literal default on Enter, so a second
	// prompt for the same answer silently discards the first one (a duplicated
	// `ask LOCALE` after the Updates block, 2026-10-08, turned `fr-FR` back into
	// es-ES). No question may be asked twice.
	test('no answer is asked twice (a repeat prompt would overwrite the first answer)', () => {
		const asked = new Map<string, number[]>();
		for (const [index, line] of INSTALL_SH.split('\n').entries()) {
			const match = line.match(/^\s*ask(?:_secret)?\s+([A-Z_][A-Z0-9_]*)\s/);
			const name = match?.[1];
			if (name !== undefined) asked.set(name, [...(asked.get(name) ?? []), index + 1]);
		}
		// Corpus floor: the terminal questions exist, so an empty map means the scan ran blind.
		expect(asked.has('LOCALE') && asked.has('ROOT_PASSWORD'), 'no ask lines found').toBe(true);
		const repeated = [...asked].filter(([, lines]) => lines.length > 1);
		expect(repeated, 'install.sh asks these answers more than once (lines)').toEqual([]);
	});

	test('an explicit thesaurus list is passed through', () => {
		const argv = buildArgs({ LANGS: 'default', HIERARCHIES: 'es', USE_UPDATE_SERVERS: 'true' });
		expect(argv.slice(argv.indexOf('--hierarchies'), argv.indexOf('--hierarchies') + 2)).toEqual([
			'--hierarchies',
			'es',
		]);
		const plan = buildInstallPlan(answersFromCliArgs(argv).raw);
		expect(plan.errors).toEqual([]);
		expect([...plan.hierarchies]).toEqual(['es']);
	});
});
