/**
 * install.sh — WHERE THE IMAGE COMES FROM, and the shared host library it is
 * decided with (installer unification D2, 2026-10-09).
 *
 * The compose stacks no longer build: they run `${DEDALO_IMAGE}:${DEDALO_VERSION}`
 * from `.dedalo.env`. install.sh asks where that image comes from — one of
 * Dédalo's official registries (the GENERATED deploy/image_registries.sh), a
 * registry of your own, or a local build — and every later update takes it
 * from the same place. The decisions live in deploy/dedalo-image-lib.sh, shared
 * with deploy/dedalo-image-update.sh and the host updater, so this gate EXECUTES
 * the library under bash with stub `docker`/`cosign` binaries and checks each
 * answer against the engine's own definition of the same thing:
 *
 *  A. the checkout version equals parseDeclaredTriple (code_build_plan.ts) on
 *     the real version.ts and on fixtures, malformed ones included;
 *  B. the .dedalo.env reader/writer: a set keeps every other line byte for
 *     byte, appends an absent key, is atomic and owner-only;
 *  C. the grammars equal isRepositoryReference / normalizeRepository /
 *     compareVersionArrays over a corpus;
 *  D. the registry probe (available / absent / unknown) and the default rule:
 *     the first official registry that publishes the version, else a build;
 *  E. the offered set equals the provisioned entries of the ONE list
 *     (engineering/image_registries.json), primary first; the signing identity
 *     cannot be inherited from the environment; cosign verification refuses
 *     without an identity;
 *  F. install.sh's own functions, lifted and DRIVEN with typed answers: the
 *     default, a pull, a verified pull, a refused signature, a custom
 *     repository, a failed pull — and the .dedalo.env writer block, lifted and
 *     run, writing the five keys the library reads back as complete.
 *
 * No network, no daemon: every docker/cosign is a stub on PATH in a temp dir.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDeclaredTriple } from '../../src/core/update/code_build_plan.ts';
import {
	isRepositoryReference,
	loadImageRegistries,
	normalizeRepository,
	provisionedRegistries,
} from '../../src/core/update/image_registries.ts';
import { compareVersionArrays } from '../../src/core/update/version.ts';
import { scratchRunEntries } from '../helpers/scratch_run_entries.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const LIB = join(REPO_ROOT, 'deploy', 'dedalo-image-lib.sh');
const REGISTRIES_SH = join(REPO_ROOT, 'deploy', 'image_registries.sh');
const INSTALL_SH = readFileSync(join(REPO_ROOT, 'install.sh'), 'utf8');
const SCRATCH = mkdtempSync(join(tmpdir(), 'dedalo-install-image-'));
let scratchCount = 0;

afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

function scratchDir(): string {
	scratchCount += 1;
	const dir = join(SCRATCH, `case-${scratchCount}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

interface BashRun {
	code: number;
	stdout: string;
	stderr: string;
}

/** Run `body` under `set -euo pipefail` with the library + the generated list loaded. */
function bash(
	body: string,
	options: { args?: string[]; cwd?: string; env?: Record<string, string>; stdin?: string } = {},
): BashRun {
	const script = [
		'set -euo pipefail',
		`. ${JSON.stringify(LIB)}`,
		`dedalo_registries_load ${JSON.stringify(REGISTRIES_SH)}`,
		body,
	].join('\n');
	const run = Bun.spawnSync(['bash', '-c', script, 'lib', ...(options.args ?? [])], {
		cwd: options.cwd ?? SCRATCH,
		env: { PATH: '/usr/bin:/bin', ...options.env },
		stdin: options.stdin === undefined ? undefined : new TextEncoder().encode(options.stdin),
	});
	return {
		code: run.exitCode ?? -1,
		stdout: new TextDecoder().decode(run.stdout),
		stderr: new TextDecoder().decode(run.stderr),
	};
}

// ---------------------------------------------------------------------------
// A. The checkout version.
// ---------------------------------------------------------------------------

/** dedalo_checkout_version over a tree whose version.ts holds `source`; null on failure. */
function checkoutVersion(source: string | null): string | null {
	const dir = scratchDir();
	if (source !== null) {
		mkdirSync(join(dir, 'src', 'core', 'update'), { recursive: true });
		writeFileSync(join(dir, 'src', 'core', 'update', 'version.ts'), source);
	}
	const run = bash('dedalo_checkout_version "$1"', { args: [dir] });
	return run.code === 0 ? run.stdout : null;
}

const VERSION_FIXTURES: Record<string, string> = {
	multiLine: 'export const T = Object.freeze([\n\t7, 1, 2,\n]) as [number, number, number];\n',
	singleLine: 'export const T = Object.freeze([8,0,13]);\n',
	spacedEverywhere: 'Object.freeze([ \t\n  9 \n , \r\n 4\t,\n\n 0 \n ])',
	crlf: 'export const T = Object.freeze([\r\n\t7,\r\n\t0,\r\n\t3,\r\n]);\r\n',
	firstOfTwo: 'Object.freeze([7, 2, 0]);\nObject.freeze([9, 9, 9]);\n',
	leadingZeros: 'Object.freeze([07, 00, 1])',
	twoNumbers: 'Object.freeze([7, 0])',
	spaceBeforeParen: 'Object.freeze ([7, 0, 0])',
	splitDigits: 'Object.freeze([7 1, 0, 0])',
	fourNumbers: 'Object.freeze([7, 0, 0, 1])',
	noTriple: 'export const DEDALO_VERSION = "7.0.0";\n',
	empty: '',
};

describe('A. the checkout version is parseDeclaredTriple, in bash', () => {
	test('the real version.ts', () => {
		const source = readFileSync(join(REPO_ROOT, 'src', 'core', 'update', 'version.ts'), 'utf8');
		const expected = parseDeclaredTriple(source);
		expect(expected, 'the real version.ts declares no triple').not.toBeNull();
		const run = bash('dedalo_checkout_version "$1"', { args: [REPO_ROOT] });
		expect(run.code).toBe(0);
		expect(run.stdout).toBe(expected as string);
	});

	test('every fixture: the same triple, or the same refusal', () => {
		let accepted = 0;
		let refused = 0;
		for (const [name, source] of Object.entries(VERSION_FIXTURES)) {
			const expected = parseDeclaredTriple(source);
			expect({ name, got: checkoutVersion(source) }).toEqual({ name, got: expected });
			if (expected === null) refused += 1;
			else accepted += 1;
		}
		// Both directions are exercised, or the comparison proves nothing.
		expect(accepted).toBeGreaterThan(4);
		expect(refused).toBeGreaterThan(3);
	});

	test('an unreadable tree is a failure, not an empty version', () => {
		expect(checkoutVersion(null)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// B. The .dedalo.env reader and writer.
// ---------------------------------------------------------------------------

const ENV_BEFORE = [
	'# Written by install.sh — compose variable substitution only.',
	'POSTGRES_PASSWORD=pa$$w0rd"with\\odd=chars',
	'',
	'   indented line kept as is   ',
	'DEDALO_VERSION=7.0.0',
	'DEDALO_IMAGE="ghcr.io/x/y"',
	"QUOTED='single'",
	'WINDOWS=crlf\r',
	'DEDALO_VERSION=7.0.1',
	'LAST_WITHOUT_NEWLINE=1',
].join('\n');

describe('B. .dedalo.env: read like compose, rewritten line-preserving and atomic', () => {
	test('get: the last line wins, one pair of quotes is removed, an absent key is empty', () => {
		const dir = scratchDir();
		const file = join(dir, '.dedalo.env');
		writeFileSync(file, ENV_BEFORE);
		const get = (key: string): string =>
			bash('dedalo_env_get "$1" "$2"', { args: [file, key] }).stdout;
		expect(get('DEDALO_VERSION')).toBe('7.0.1');
		expect(get('DEDALO_IMAGE')).toBe('ghcr.io/x/y');
		expect(get('QUOTED')).toBe('single');
		expect(get('WINDOWS')).toBe('crlf');
		expect(get('LAST_WITHOUT_NEWLINE')).toBe('1');
		expect(get('POSTGRES_PASSWORD')).toBe('pa$$w0rd"with\\odd=chars');
		expect(get('ABSENT')).toBe('');
		expect(bash('dedalo_env_get "$1" "bad key"', { args: [file] }).code).toBe(2);
	});

	test("get/set follow COMPOSE's line rules: indentation, export, inline comments, quoted comments", () => {
		// What an operator pastes from a manual or a refusal: compose reads these lines
		// (verified with `docker compose config`), so the updater must read them alike.
		const dir = scratchDir();
		const file = join(dir, '.dedalo.env');
		const text = [
			'    DEDALO_IMAGE=localhost/dedalo  # missing',
			'DEDALO_VERSION=7.0.1   # the version this checkout declares',
			'export DEDALO_IMAGE_MODE=build',
			'DEDALO_IMAGE_VERIFY="none" # quoted, then a comment',
			"DEDALO_COMPOSE_FILE='docker-compose.yml'",
			'HASH_IN_VALUE=a#b',
			'# DEDALO_VERSION=9.9.9 a commented-out line assigns nothing',
			'PREFIXED_DEDALO_VERSION=8.0.0',
		].join('\n');
		writeFileSync(file, `${text}\n`);
		const get = (key: string): string =>
			bash('dedalo_env_get "$1" "$2"', { args: [file, key] }).stdout;
		expect({
			DEDALO_IMAGE: get('DEDALO_IMAGE'),
			DEDALO_VERSION: get('DEDALO_VERSION'),
			DEDALO_IMAGE_MODE: get('DEDALO_IMAGE_MODE'),
			DEDALO_IMAGE_VERIFY: get('DEDALO_IMAGE_VERIFY'),
			DEDALO_COMPOSE_FILE: get('DEDALO_COMPOSE_FILE'),
			HASH_IN_VALUE: get('HASH_IN_VALUE'),
		}).toEqual({
			DEDALO_IMAGE: 'localhost/dedalo',
			DEDALO_VERSION: '7.0.1',
			DEDALO_IMAGE_MODE: 'build',
			DEDALO_IMAGE_VERIFY: 'none',
			DEDALO_COMPOSE_FILE: 'docker-compose.yml',
			HASH_IN_VALUE: 'a#b',
		});
		expect(bash('dedalo_env_problems "$1"', { args: [file] }).stdout).toBe('');
		// set replaces the line compose reads (here: the indented one), not a duplicate.
		expect(bash('dedalo_env_set "$1" DEDALO_IMAGE ghcr.io/x/y', { args: [file] }).code).toBe(0);
		const after = readFileSync(file, 'utf8').split('\n');
		expect(after[0]).toBe('DEDALO_IMAGE=ghcr.io/x/y');
		expect(after.filter((line) => line.includes('DEDALO_IMAGE='))).toHaveLength(1);
		expect(after.slice(1, -1)).toEqual(text.split('\n').slice(1));
	});

	test('set: every other line byte-identical, the key replaced in place, owner-only, no temp left', () => {
		const dir = scratchDir();
		const file = join(dir, '.dedalo.env');
		writeFileSync(file, ENV_BEFORE, { mode: 0o644 });
		const run = bash('dedalo_env_set "$1" DEDALO_VERSION 7.0.2', { args: [file] });
		expect(run.code, run.stderr).toBe(0);
		const before = ENV_BEFORE.split('\n');
		const after = readFileSync(file, 'utf8').split('\n');
		// The file gains exactly its missing final newline.
		expect(after.length).toBe(before.length + 1);
		expect(after.at(-1)).toBe('');
		for (const [index, line] of before.entries()) {
			const expected = line.startsWith('DEDALO_VERSION=') ? 'DEDALO_VERSION=7.0.2' : line;
			expect({ index, line: after[index] }).toEqual({ index, line: expected });
		}
		expect(statSync(file).mode & 0o777).toBe(0o600);
		expect(scratchRunEntries(dir)).toEqual(['.dedalo.env']);
	});

	test('set: an absent key is appended; a line break or a bad key is refused and changes nothing', () => {
		const dir = scratchDir();
		const file = join(dir, '.dedalo.env');
		writeFileSync(file, 'A=1\n');
		expect(bash('dedalo_env_set "$1" NEW_KEY value', { args: [file] }).code).toBe(0);
		expect(readFileSync(file, 'utf8')).toBe('A=1\nNEW_KEY=value\n');
		expect(bash(`dedalo_env_set "$1" NEW_KEY $'two\\nlines'`, { args: [file] }).code).toBe(2);
		expect(bash('dedalo_env_set "$1" "bad key" v', { args: [file] }).code).toBe(2);
		expect(bash('dedalo_env_set "$1/missing" A v', { args: [dir] }).code).toBe(1);
		expect(readFileSync(file, 'utf8')).toBe('A=1\nNEW_KEY=value\n');
	});
});

// ---------------------------------------------------------------------------
// C. The grammars equal the engine's.
// ---------------------------------------------------------------------------

const REPOSITORY_CORPUS = [
	'ghcr.io/dedalia-org/dedalo',
	'docker.io/example/dedalo',
	'example/dedalo',
	'localhost/dedalo',
	'localhost:5000/dedalo',
	'registry.example.org:443/a/b/c',
	'a',
	'a.b-c_d/e__f',
	'a-b/c',
	'Ghcr.io/x/y',
	'ghcr.io/x/Y',
	'ghcr.io/x/y:7.0.1',
	'ghcr.io/x/y@sha256:abc',
	'-a/b',
	'a/-b',
	'a//b',
	'a/b/',
	'',
	'host:port/x',
	'a..b/c',
	'a_b.c/d',
	`a/${'b'.repeat(260)}`,
	'ghcr.io/x/y z',
];

describe('C. the grammars are the engine grammars', () => {
	test('repository: dedalo_repository_grammar ≡ isRepositoryReference', () => {
		let accepted = 0;
		for (const value of REPOSITORY_CORPUS) {
			const bashSays = bash('dedalo_repository_grammar "$1"', { args: [value] }).code === 0;
			expect({ value, bashSays }).toEqual({ value, bashSays: isRepositoryReference(value) });
			if (bashSays) accepted += 1;
		}
		expect(accepted).toBeGreaterThan(5);
		expect(accepted).toBeLessThan(REPOSITORY_CORPUS.length - 5);
	});

	test('repository: dedalo_repository_normalize ≡ normalizeRepository', () => {
		for (const value of ['docker.io/A/b', 'index.docker.io/a/b', 'GHCR.io/x/y', 'a/b']) {
			expect(bash('dedalo_repository_normalize "$1"', { args: [value] }).stdout).toBe(
				normalizeRepository(value),
			);
		}
	});

	test('version: X.Y.Z or X.Y.Z-dev, literal dots, nothing else', () => {
		const verdict = (value: string): boolean =>
			bash('dedalo_version_grammar "$1"', { args: [value] }).code === 0;
		for (const ok of ['7.0.0', '7.0.1-dev', '10.20.300', '0.0.0'])
			expect({ ok, v: verdict(ok) }).toEqual({ ok, v: true });
		for (const bad of [
			'7.0',
			'7x0x1',
			'7.0.0-beta.1',
			'v7.0.0',
			'7.0.0-DEV',
			'7.0.0.dev',
			'',
			' 7.0.0',
		])
			expect({ bad, v: verdict(bad) }).toEqual({ bad, v: false });
	});

	test('version order: dedalo_version_cmp ≡ compareVersionArrays (the -dev suffix ignored)', () => {
		const pairs: [string, string][] = [
			['7.0.1', '7.0.0'],
			['7.0.0', '7.0.1'],
			['7.0.0-dev', '7.0.0'],
			['7.10.0', '7.9.9'],
			['8.0.0', '7.99.99'],
			['07.0.0', '7.0.0'],
		];
		for (const [a, b] of pairs) {
			const expected = compareVersionArrays(
				a.replace(/-dev$/, '').split('.').map(Number),
				b.replace(/-dev$/, '').split('.').map(Number),
			);
			expect({
				a,
				b,
				got: bash('dedalo_version_cmp "$1" "$2"', { args: [a, b] }).stdout.trim(),
			}).toEqual({
				a,
				b,
				got: String(expected),
			});
		}
		expect(bash('dedalo_version_cmp 7.0 7.0.0').code).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// D. The probe and the default rule.
// ---------------------------------------------------------------------------

/**
 * A stub `docker` for the probe: `manifest inspect` and `buildx imagetools
 * inspect` answer per repository from $STUB/<verb>.<sanitized ref> = "<code> <stderr>".
 */
const PROBE_DOCKER = `#!/bin/bash
ref="\${!#}"
key="$(printf '%s' "$ref" | tr -c 'a-zA-Z0-9.' '_')"
case "$1 $2" in
	'manifest inspect') verb=manifest ;;
	'buildx imagetools') verb=imagetools ;;
	*) verb=other ;;
esac
answer="$(cat "$STUB/$verb.$key" 2>/dev/null || echo '1 dial tcp: network is unreachable')"
printf '%s\\n' "\${answer#* }" >&2
exit "\${answer%% *}"
`;

function probeBin(answers: Record<string, string>): { bin: string; stub: string } {
	const dir = scratchDir();
	const bin = join(dir, 'bin');
	mkdirSync(bin);
	writeFileSync(join(bin, 'docker'), PROBE_DOCKER);
	chmodSync(join(bin, 'docker'), 0o755);
	for (const [file, answer] of Object.entries(answers)) writeFileSync(join(dir, file), answer);
	return { bin, stub: dir };
}

function sanitize(ref: string): string {
	return ref.replace(/[^a-zA-Z0-9.]/g, '_');
}

describe('D. which registry publishes this version, and the default it gives', () => {
	test('dedalo_image_available: 0 available, 1 absent (a registry SAYING so), 2 unknown', () => {
		const ref = 'ghcr.io/x/y:7.0.1';
		const cases: [Record<string, string>, number][] = [
			[{ [`manifest.${sanitize(ref)}`]: '0 ' }, 0],
			[
				{
					[`manifest.${sanitize(ref)}`]: "1 docker: 'manifest' is not a docker command",
					[`imagetools.${sanitize(ref)}`]: '0 ',
				},
				0,
			],
			[{ [`manifest.${sanitize(ref)}`]: '1 no such manifest: ghcr.io/x/y:7.0.1' }, 1],
			[
				{
					[`manifest.${sanitize(ref)}`]: '1 dial tcp: timeout',
					[`imagetools.${sanitize(ref)}`]: '1 ERROR: ghcr.io/x/y:7.0.1: not found',
				},
				1,
			],
			[
				{
					[`manifest.${sanitize(ref)}`]: '1 unauthorized',
					[`imagetools.${sanitize(ref)}`]: '1 denied',
				},
				2,
			],
			[{}, 2],
		];
		for (const [answers, expected] of cases) {
			const { bin, stub } = probeBin(answers);
			const run = bash('dedalo_image_available "$1"', {
				args: [ref],
				env: { PATH: `${bin}:/usr/bin:/bin`, STUB: stub },
			});
			expect({ answers, code: run.code }).toEqual({ answers, code: expected });
		}
	});

	test('dedalo_default_source: the first AVAILABLE official registry, else build', () => {
		const cases: [string[], string][] = [
			[[], 'build'],
			[['1'], 'build'],
			[['2', '2'], 'build'],
			[['1', '0'], '1'],
			[['0', '0'], '0'],
			[['2', '1', '0'], '2'],
			[['2', '0', '1'], '1'],
		];
		for (const [codes, expected] of cases) {
			expect({
				codes,
				got: bash('dedalo_default_source "$@"', { args: codes }).stdout.trim(),
			}).toEqual({
				codes,
				got: expected,
			});
		}
	});

	test('probe + default over the GENERATED list: the published mirror wins, nothing published builds', () => {
		const provisioned = provisionedRegistries(loadImageRegistries());
		expect(
			provisioned.length,
			'no provisioned registry — the probe chain is untested',
		).toBeGreaterThan(0);
		const last = provisioned.at(-1)?.repository as string;
		const published = probeBin({ [`manifest.${sanitize(`${last}:7.0.1`)}`]: '0 ' });
		const chain = 'dedalo_default_source $(dedalo_probe_registries "$1")';
		expect(
			bash(chain, {
				args: ['7.0.1'],
				env: { PATH: `${published.bin}:/usr/bin:/bin`, STUB: published.stub },
			}).stdout.trim(),
		).toBe(String(provisioned.length - 1));
		const none = probeBin({});
		expect(
			bash(chain, {
				args: ['7.0.1'],
				env: { PATH: `${none.bin}:/usr/bin:/bin`, STUB: none.stub },
			}).stdout.trim(),
		).toBe('build');
	});
});

// ---------------------------------------------------------------------------
// E. The offered set IS the list.
// ---------------------------------------------------------------------------

describe('E. the offered registries are the provisioned entries of the one list', () => {
	test('dedalo_offered_registries ≡ provisionedRegistries(engineering/image_registries.json)', () => {
		const list = loadImageRegistries();
		const expected = provisionedRegistries(list).map(
			(entry, index) => `${index}\t${entry.id}\t${entry.label}\t${entry.role}\t${entry.repository}`,
		);
		expect(expected.length).toBeGreaterThan(0);
		const offered = bash('dedalo_offered_registries').stdout.split('\n').filter(Boolean);
		expect(offered).toEqual(expected);
		// Primary first — and an unprovisioned entry is never offered.
		const roles = offered.map((line) => line.split('\t')[3]);
		expect(roles.indexOf('primary') <= 0).toBe(true);
		for (const entry of list.registries.filter((registry) => !registry.provisioned)) {
			expect(offered.some((line) => line.split('\t')[1] === entry.id)).toBe(false);
		}
	});

	test('dedalo_official_index names an official repository in any spelling; yours is not one', () => {
		const provisioned = provisionedRegistries(loadImageRegistries());
		for (const [index, entry] of provisioned.entries()) {
			const spelled = (entry.repository as string).toUpperCase();
			expect(bash('dedalo_official_index "$1"', { args: [spelled] }).stdout.trim()).toBe(
				String(index),
			);
		}
		expect(bash('dedalo_official_index registry.example.org/dedalo').code).toBe(1);
	});

	test('the signing identity is the generated one, never inherited from the environment', () => {
		const dir = scratchDir();
		const partial = join(dir, 'image_registries.sh');
		writeFileSync(
			partial,
			'DEDALO_REGISTRY_IDS=()\nDEDALO_REGISTRY_LABELS=()\nDEDALO_REGISTRY_ROLES=()\nDEDALO_REGISTRY_REPOSITORIES=()\n',
		);
		const run = bash(
			'dedalo_registries_load "$1"; printf "[%s][%s]" "$DEDALO_IMAGE_SIGNING_ISSUER" "$DEDALO_IMAGE_SIGNING_IDENTITY_REGEXP"',
			{
				args: [partial],
				env: {
					DEDALO_IMAGE_SIGNING_ISSUER: 'https://evil.invalid',
					DEDALO_IMAGE_SIGNING_IDENTITY_REGEXP: '.*',
				},
			},
		);
		expect(run.stdout).toBe('[][]');
		const list = loadImageRegistries();
		const real = bash(
			'printf "%s\\n%s" "$DEDALO_IMAGE_SIGNING_ISSUER" "$DEDALO_IMAGE_SIGNING_IDENTITY_REGEXP"',
		);
		expect(real.stdout).toBe(`${list.signing.issuer}\n${list.signing.identity_regexp}`);
	});

	test('cosign verification: the official identity is passed; no identity or no cosign refuses', () => {
		const dir = scratchDir();
		const bin = join(dir, 'bin');
		mkdirSync(bin);
		writeFileSync(join(bin, 'cosign'), '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$OUT"\nexit 0\n');
		chmodSync(join(bin, 'cosign'), 0o755);
		const ref = `ghcr.io/x/y@sha256:${'c'.repeat(64)}`;
		const env = { PATH: `${bin}:/usr/bin:/bin`, OUT: join(dir, 'argv') };
		expect(bash('dedalo_cosign_verify "$1"', { args: [ref], env }).code).toBe(0);
		const list = loadImageRegistries();
		expect(readFileSync(join(dir, 'argv'), 'utf8').split('\n').slice(0, -1)).toEqual([
			'verify',
			'--certificate-identity-regexp',
			list.signing.identity_regexp,
			'--certificate-oidc-issuer',
			list.signing.issuer,
			ref,
		]);
		// no identity loaded → refused, cosign never asked
		rmSync(join(dir, 'argv'));
		const blank = bash('DEDALO_IMAGE_SIGNING_IDENTITY_REGEXP=""; dedalo_cosign_verify "$1"', {
			args: [ref],
			env,
		});
		expect(blank.code).toBe(1);
		expect(existsSync(join(dir, 'argv'))).toBe(false);
		// a tag, not a digest → refused
		expect(bash('dedalo_cosign_verify "$1"', { args: ['ghcr.io/x/y:7.0.1'], env }).code).toBe(1);
		// no cosign on PATH → refused
		expect(bash('dedalo_cosign_verify "$1"', { args: [ref] }).code).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// F. install.sh's own code, lifted and driven.
// ---------------------------------------------------------------------------

/** A top-level `name() { … }` function, verbatim from install.sh. */
function liftFunction(name: string): string {
	const match = INSTALL_SH.match(new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}$`, 'm'));
	expect(match, `install.sh: no \`${name}() { … }\` function`).not.toBeNull();
	return (match as RegExpMatchArray)[0];
}

const CHOOSER_FUNCTIONS = [
	'bold',
	'warn',
	'fail',
	'ask',
	'availability_word',
	'verify_official',
	'pull_source',
	'custom_source',
	'build_source',
	'print_image_menu',
	'choose_image_source',
	'pick_image_source',
];

/** One-line helpers (bold/warn/fail) are single-line definitions in install.sh. */
function liftAny(name: string): string {
	const oneLine = INSTALL_SH.match(new RegExp(`^${name}\\(\\)\\s+\\{[^\\n]*\\}$`, 'm'));
	return oneLine ? oneLine[0] : liftFunction(name);
}

/**
 * A stub docker for the chooser: probe answers as in D, `pull` succeeds unless
 * $STUB/pull_fail, `image inspect` reports a RepoDigest; every call logged.
 */
const CHOOSER_DOCKER = `#!/bin/bash
printf '%s\\n' "$*" >> "$STUB/docker.log"
case "$1" in
	pull) [ -e "$STUB/pull_fail" ] && exit 1; exit 0 ;;
	image)
		ref="\${!#}"
		# The version label the release workflow stamps: the tag, unless a test plants
		# another (a mirror re-pointing a newer tag at an older signed release).
		case "$*" in *Labels*) cat "$STUB/label" 2>/dev/null || printf '%s\\n' "\${ref##*:}"; exit 0 ;; esac
		printf '%s@sha256:%s\\n' "\${ref%:*}" "$(printf 'd%.0s' $(seq 1 64))"
		exit 0
		;;
esac
ref="\${!#}"
key="$(printf '%s' "$ref" | tr -c 'a-zA-Z0-9.' '_')"
verb=imagetools
if [ "$1" = manifest ]; then verb=manifest; fi
answer="$(cat "$STUB/$verb.$key" 2>/dev/null || echo '1 dial tcp: network is unreachable')"
printf '%s\\n' "\${answer#* }" >&2
exit "\${answer%% *}"
`;

interface Chosen {
	code: number;
	vars: Record<string, string>;
	pulls: string[];
	/** Everything said to the operator (install.sh's warn() writes to stdout). */
	said: string;
	stderr: string;
}

/** Drive the lifted chooser in a tree declaring `checkout`, with `typed` answers. */
function choose(options: {
	typed: string[];
	published?: string[];
	cosign?: 'absent' | 'ok' | 'fail';
	pullFails?: boolean;
	/** The version label the pulled image declares (default: its tag). */
	label?: string;
}): Chosen {
	const dir = scratchDir();
	const bin = join(dir, 'bin');
	mkdirSync(bin);
	mkdirSync(join(dir, 'src', 'core', 'update'), { recursive: true });
	writeFileSync(join(dir, 'src', 'core', 'update', 'version.ts'), 'Object.freeze([7, 0, 1])');
	writeFileSync(join(bin, 'docker'), CHOOSER_DOCKER);
	chmodSync(join(bin, 'docker'), 0o755);
	if (options.cosign !== undefined && options.cosign !== 'absent') {
		writeFileSync(join(bin, 'cosign'), `#!/bin/sh\nexit ${options.cosign === 'ok' ? 0 : 1}\n`);
		chmodSync(join(bin, 'cosign'), 0o755);
	}
	for (const ref of options.published ?? [])
		writeFileSync(join(dir, `manifest.${sanitize(ref)}`), '0 ');
	if (options.pullFails) writeFileSync(join(dir, 'pull_fail'), '');
	if (options.label !== undefined) writeFileSync(join(dir, 'label'), `${options.label}\n`);
	const body = [
		...CHOOSER_FUNCTIONS.map(liftAny),
		'choose_image_source',
		'printf "%s\\n" "MODE=$IMAGE_MODE" "REPO=$IMAGE_REPOSITORY" "VERSION=$IMAGE_VERSION" "VERIFY=$IMAGE_VERIFY" "LABEL=$IMAGE_SOURCE_LABEL"',
	].join('\n');
	const run = bash(body, {
		cwd: dir,
		env: { PATH: `${bin}:/usr/bin:/bin`, STUB: dir },
		stdin: options.typed.map((line) => `${line}\n`).join(''),
	});
	const vars: Record<string, string> = {};
	for (const line of run.stdout.split('\n')) {
		const match = line.match(/^(MODE|REPO|VERSION|VERIFY|LABEL)=(.*)$/);
		if (match) vars[match[1] as string] = match[2] as string;
	}
	const log = existsSync(join(dir, 'docker.log'))
		? readFileSync(join(dir, 'docker.log'), 'utf8')
		: '';
	return {
		code: run.code,
		vars,
		pulls: log.split('\n').filter((line) => line.startsWith('pull ')),
		said: run.stdout + run.stderr,
		stderr: run.stderr,
	};
}

const PROVISIONED = provisionedRegistries(loadImageRegistries());
const FIRST = PROVISIONED[0]?.repository as string;
const BUILD_CHOICE = String(PROVISIONED.length + 2);
const CUSTOM_CHOICE = String(PROVISIONED.length + 1);

describe('F. install.sh chooses the image source', () => {
	test('nothing published: Enter builds here, from the checkout version, unverified', () => {
		const chosen = choose({ typed: [''] });
		expect(chosen.code, chosen.stderr).toBe(0);
		expect(chosen.vars).toMatchObject({
			MODE: 'build',
			REPO: 'localhost/dedalo',
			VERSION: '7.0.1',
			VERIFY: 'none',
		});
		expect(chosen.pulls).toEqual([]);
	});

	test('published on an official registry: Enter pulls it; no cosign → verify none, said aloud', () => {
		const chosen = choose({ typed: ['', ''], published: [`${FIRST}:7.0.1`] });
		expect(chosen.code, chosen.stderr).toBe(0);
		expect(chosen.vars).toMatchObject({
			MODE: 'pull',
			REPO: FIRST,
			VERSION: '7.0.1',
			VERIFY: 'none',
		});
		expect(chosen.pulls).toEqual([`pull ${FIRST}:7.0.1`]);
		expect(chosen.said).toContain('NOT verified');
	});

	test('cosign present and the signature verifies → DEDALO_IMAGE_VERIFY=cosign', () => {
		const chosen = choose({ typed: ['1', ''], cosign: 'ok' });
		expect(chosen.code, chosen.stderr).toBe(0);
		expect(chosen.vars).toMatchObject({ MODE: 'pull', REPO: FIRST, VERIFY: 'cosign' });
	});

	test('a signature that does not verify is refused: back to the menu, then build', () => {
		const chosen = choose({ typed: ['1', '', BUILD_CHOICE], cosign: 'fail' });
		expect(chosen.code, chosen.stderr).toBe(0);
		expect(chosen.vars.MODE).toBe('build');
		expect(chosen.said).toContain("does NOT carry Dédalo's signature");
	});

	test('a SIGNED image declaring another version is refused (a re-pointed tag is not that release)', () => {
		const chosen = choose({ typed: ['1', '', BUILD_CHOICE], cosign: 'ok', label: '7.0.0' });
		expect(chosen.code, chosen.stderr).toBe(0);
		expect(chosen.vars.MODE).toBe('build');
		expect(chosen.said).toContain("does NOT carry Dédalo's signature for version 7.0.1");
	});

	test('a failed pull returns to the menu', () => {
		const chosen = choose({ typed: ['1', '7.0.2-dev', BUILD_CHOICE], pullFails: true });
		expect(chosen.code, chosen.stderr).toBe(0);
		expect(chosen.pulls).toEqual([`pull ${FIRST}:7.0.2-dev`]);
		expect(chosen.vars.MODE).toBe('build');
	});

	test('a custom repository: the grammar is enforced, the version asked, no signature claimed', () => {
		const chosen = choose({
			typed: [
				CUSTOM_CHOICE,
				'Registry.Example.org/Dedalo:7',
				'registry.example.org/dedalo',
				'7.0',
				'7.0.2-dev',
			],
		});
		expect(chosen.code, chosen.stderr).toBe(0);
		expect(chosen.vars).toMatchObject({
			MODE: 'pull',
			REPO: 'registry.example.org/dedalo',
			VERSION: '7.0.2-dev',
			VERIFY: 'none',
			LABEL: 'a registry of your own',
		});
		expect(chosen.pulls).toEqual(['pull registry.example.org/dedalo:7.0.2-dev']);
	});

	test('a choice out of range or not a number is asked again', () => {
		const chosen = choose({ typed: ['0', 'x', '99', BUILD_CHOICE] });
		expect(chosen.code, chosen.stderr).toBe(0);
		expect(chosen.vars.MODE).toBe('build');
	});
});

/** The .dedalo.env writer block, verbatim: `umask 077` … `umask 022`. */
function writerBlock(): string {
	const match = INSTALL_SH.match(/^umask 077\ncat >"\$ENV_FILE" <<ENV\n[\s\S]*?\n^umask 022$/m);
	expect(
		match,
		'install.sh: the .dedalo.env writer block (umask 077 … umask 022) moved',
	).not.toBeNull();
	return (match as RegExpMatchArray)[0];
}

describe('F. install.sh writes the image answer the library reads', () => {
	test('the writer block, lifted and run, writes the five keys — complete, owner-only', () => {
		const dir = scratchDir();
		writeFileSync(join(dir, 'docker-compose.simple.yml'), 'services: {}\n');
		const body = [
			"ENV_FILE='.dedalo.env' COMPOSE_FILE='docker-compose.simple.yml'",
			'DB_PASSWORD=pw TLS_MODE=none NGINX_CONF_NAME=nginx.simple.conf COOKIE_SECURE=false',
			"WIZARD_ALLOWED_IPS='' COMPOSE_PROFILES=''",
			"IMAGE_REPOSITORY='ghcr.io/x/y' IMAGE_VERSION='7.0.1' IMAGE_MODE='pull' IMAGE_VERIFY='cosign'",
			writerBlock(),
			'dedalo_env_problems .dedalo.env',
			'printf "COMPOSE_ARGS:%s\\n" "$(dedalo_compose_args .dedalo.env | tr "\\n" " ")"',
		].join('\n');
		const run = bash(body, { cwd: dir });
		expect(run.code, run.stderr).toBe(0);
		const file = join(dir, '.dedalo.env');
		const get = (key: string): string =>
			bash('dedalo_env_get "$1" "$2"', { args: [file, key] }).stdout;
		expect({
			DEDALO_COMPOSE_FILE: get('DEDALO_COMPOSE_FILE'),
			DEDALO_IMAGE: get('DEDALO_IMAGE'),
			DEDALO_VERSION: get('DEDALO_VERSION'),
			DEDALO_IMAGE_MODE: get('DEDALO_IMAGE_MODE'),
			DEDALO_IMAGE_VERIFY: get('DEDALO_IMAGE_VERIFY'),
		}).toEqual({
			DEDALO_COMPOSE_FILE: 'docker-compose.simple.yml',
			DEDALO_IMAGE: 'ghcr.io/x/y',
			DEDALO_VERSION: '7.0.1',
			DEDALO_IMAGE_MODE: 'pull',
			DEDALO_IMAGE_VERIFY: 'cosign',
		});
		// dedalo_env_problems printed nothing: the file is COMPLETE for the updater.
		expect(run.stdout.split('\n').filter((line) => / (missing|invalid)$/.test(line))).toEqual([]);
		expect(run.stdout).toContain(
			'COMPOSE_ARGS:-f docker-compose.simple.yml --env-file .dedalo.env ',
		);
		expect(statSync(file).mode & 0o777).toBe(0o600);
		// The keys it writes are exactly the library's contract.
		const contract = bash('printf "%s" "$DEDALO_ENV_IMAGE_KEYS"').stdout.split(' ');
		expect(contract.length).toBe(5);
		for (const key of contract)
			expect(readFileSync(file, 'utf8')).toMatch(new RegExp(`^${key}=`, 'm'));
	});

	test('the build answer reaches compose through the override; every compose call keeps the env file', () => {
		expect(liftFunction('compose_build')).toContain('dedalo_compose "$ENV_FILE" build "$@"');
		expect(INSTALL_SH).toMatch(/^\tcompose_build build dedalo$/m);
		// The everyday helper is unchanged.
		expect(liftFunction('compose')).toContain(
			'docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"',
		);
		// The library and the list are loaded before anything asks a question.
		const loads = INSTALL_SH.indexOf('. deploy/dedalo-image-lib.sh');
		expect(loads).toBeGreaterThan(-1);
		expect(INSTALL_SH.indexOf('dedalo_registries_load deploy/image_registries.sh')).toBeGreaterThan(
			loads,
		);
		expect(INSTALL_SH.indexOf('\nchoose_image_source\n')).toBeGreaterThan(
			INSTALL_SH.indexOf('\nchoose_tls\n'),
		);
		expect(INSTALL_SH).toContain('./deploy/dedalo-image-update.sh --version <version>');
	});
});
