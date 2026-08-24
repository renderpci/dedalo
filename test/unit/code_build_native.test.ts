/**
 * Server-side release BUILD (UPDATE_PROCESS Phase 4, WC-024) — the pure
 * refusal/planning half (`planCodeBuild`) exhaustively, plus ONE real
 * `git archive` integration drill in a TEMP git repo outside the repo tree.
 *
 * The GATE ORDER is the contract, not an implementation detail: code-server
 * flag → dirs → version → ref. Each order assertion feeds a bad value to a
 * LATER gate and proves the EARLIER refusal still wins.
 *
 * No DB. Needs `git` for the integration block; skips LOUDLY if absent.
 */

import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as realConfigModule from '../../src/config/config.ts';
import { isDedaloError } from '../../src/core/errors/index.ts';
import { buildVersionFromGit } from '../../src/core/update/code_build.ts';
import { parseDeclaredTriple, planCodeBuild } from '../../src/core/update/code_build_plan.ts';
import { DEDALO_VERSION } from '../../src/core/update/version.ts';

// Snapshot the REAL config module ONCE at top level: mock.restore() does NOT
// revert mock.module, so afterAll must re-install it or the mocked config
// leaks into every other file of this suite.
const REAL_CONFIG = { ...realConfigModule };

const ROOT = join(
	process.env.TMPDIR ?? '/tmp',
	`dedalo_code_build_${process.pid}_${Math.random().toString(36).slice(2)}`,
);

const OK_CFG = {
	isCodeServer: true,
	codeServerGitDir: '/g',
	codeFilesDir: '/f',
} as const;

let gitAvailable = false;

beforeAll(async () => {
	mkdirSync(ROOT, { recursive: true });
	const probe = Bun.spawn(['git', '--version'], { stdout: 'ignore', stderr: 'ignore' });
	gitAvailable = (await probe.exited) === 0;
});
afterAll(() => {
	mock.module('../../src/config/config.ts', () => REAL_CONFIG);
	mock.restore();
	rmSync(ROOT, { recursive: true, force: true });
});

/** Narrow to the refusal arm (and fail loudly, not silently, when it is not). */
function refusal(plan: ReturnType<typeof planCodeBuild>): { msg: string; error: string } {
	expect(plan.ok).toBe(false);
	if (plan.ok !== false) throw new Error('expected a refusal plan');
	return { msg: plan.msg, error: plan.error };
}

describe('planCodeBuild — gate order', () => {
	test('gate 1 wins: a non-code-server refuses before dirs/version/ref are looked at', () => {
		// every later gate is ALSO violated here; only the first message may show.
		const plan = planCodeBuild(
			{ version: 'x.y.z', ref: '--output=/tmp/evil' },
			{ isCodeServer: false, codeServerGitDir: undefined, codeFilesDir: undefined },
		);
		expect(refusal(plan)).toEqual({
			msg: 'Error. This instance is not a code server',
			error: 'not a code server',
		});
	});

	test('the flag is an identity check: a truthy non-true value still refuses', () => {
		const plan = planCodeBuild(
			{ version: '7.0.1' },
			{
				...OK_CFG,
				isCodeServer: 1 as unknown as boolean,
			},
		);
		expect(refusal(plan).error).toBe('not a code server');
	});

	test('gate 2 wins: missing dirs refuse before the (invalid) version is parsed', () => {
		const plan = planCodeBuild(
			{ version: 'x.y.z', ref: 'a;b' },
			{ isCodeServer: true, codeServerGitDir: undefined, codeFilesDir: '/f' },
		);
		expect(refusal(plan)).toEqual({
			msg: 'Error. Define DEDALO_CODE_SERVER_GIT_DIR and DEDALO_CODE_FILES_DIR to build releases',
			error: 'code build dirs unconfigured',
		});
	});

	test('gate 2 also fires when only the files dir is missing', () => {
		const plan = planCodeBuild(
			{ version: '7.0.1' },
			{ isCodeServer: true, codeServerGitDir: '/g', codeFilesDir: undefined },
		);
		expect(refusal(plan).error).toBe('code build dirs unconfigured');
	});

	test('gate 3 wins: an invalid version refuses before the (invalid) ref', () => {
		const plan = planCodeBuild({ version: 'x.y.z', ref: '--output=/tmp/evil' }, OK_CFG);
		expect(refusal(plan)).toEqual({
			msg: 'Error. Invalid version number',
			error: 'invalid version: x.y.z',
		});
	});

	test('gate 4 is last: a valid version with an invalid ref reports the ref', () => {
		const plan = planCodeBuild({ version: '7.0.1', ref: '--output=/tmp/evil' }, OK_CFG);
		expect(refusal(plan)).toEqual({
			msg: 'Error. Invalid git ref',
			error: 'invalid ref: --output=/tmp/evil',
		});
	});
});

describe('planCodeBuild — version guard', () => {
	for (const bad of ['7.0', '7.0.1.2', 'x.y.z', '7.0.-1', '', '7.0.1.1.dev', '7.0.1x', '7.0.1.5']) {
		test(`rejects version ${JSON.stringify(bad)}`, () => {
			const plan = planCodeBuild({ version: bad, ref: 'main' }, OK_CFG);
			expect(refusal(plan)).toEqual({
				msg: 'Error. Invalid version number',
				error: `invalid version: ${bad}`,
			});
		});
	}

	test("accepts '7.0.1' from the master ref and builds the confined PUBLISHED path", () => {
		const plan = planCodeBuild({ version: '7.0.1', ref: 'master' }, OK_CFG);
		expect(plan.ok).toBe(true);
		if (plan.ok !== true) throw new Error('expected an ok plan');
		expect(plan).toEqual({
			ok: true,
			gitDir: '/g',
			ref: 'master',
			versionString: '7.0.1',
			targetDir: '/f/7/7.0',
			filePath: '/f/7/7.0/7.0.1.zip',
		});
	});

	test('release channel: only master (or refs/heads/master) claims the published <v>.zip name', () => {
		// The published name is what code_manifest.ts advertises; a developer-branch
		// build must NEVER overwrite it — any other ref gets the -dev suffix
		// (still built, still served by code_serving.ts, never advertised).
		for (const masterRef of ['master', 'refs/heads/master']) {
			const plan = planCodeBuild({ version: '7.0.1', ref: masterRef }, OK_CFG);
			if (plan.ok !== true) throw new Error('expected an ok plan');
			expect(plan.filePath).toBe('/f/7/7.0/7.0.1.zip');
		}
		for (const devRef of ['main', 'v7', 'refs/heads/v7', 'Master', 'master2', 'x/master']) {
			const plan = planCodeBuild({ version: '7.0.1', ref: devRef }, OK_CFG);
			if (plan.ok !== true) throw new Error('expected an ok plan');
			expect(plan.filePath).toBe('/f/7/7.0/7.0.1-dev.zip');
		}
	});

	test("accepts the prerelease form '7.0.1.dev' and normalises it to '7.0.1'", () => {
		const plan = planCodeBuild({ version: '7.0.1.dev', ref: 'master' }, OK_CFG);
		if (plan.ok !== true) throw new Error('expected an ok plan');
		expect(plan.versionString).toBe('7.0.1');
		expect(plan.filePath).toBe('/f/7/7.0/7.0.1.zip');
		// the DEFAULT ref still comes from the raw option, not the normalised one
		const defaulted = planCodeBuild({ version: '7.0.1.dev' }, OK_CFG);
		if (defaulted.ok !== true) throw new Error('expected an ok plan');
		expect(defaulted.ref).toBe('7.0.1.dev');
	});

	// FOUND, NOT FIXED (moved faithfully): `parseVersionString` maps segments
	// through `Number`, which coerces '' → 0 and trims whitespace. So sloppy
	// version strings are silently ACCEPTED and normalised. Pinned here so the
	// quirk cannot change unnoticed; it is not exploitable — the release path is
	// rebuilt from the parsed integer triple, never from the raw input.
	for (const [sloppy, normalised] of [
		['7..1', '7.0.1'],
		['7. 0 .1', '7.0.1'],
		['7.0.1e0', '7.0.1'],
	] as const) {
		test(`quirk: ${JSON.stringify(sloppy)} is accepted and normalised to ${normalised}`, () => {
			// explicit ref: some of these sloppy strings are not valid git refs,
			// and the ref gate would otherwise mask the version behaviour.
			const plan = planCodeBuild({ version: sloppy, ref: 'master' }, OK_CFG);
			if (plan.ok !== true) throw new Error('expected an ok plan');
			expect(plan.versionString).toBe(normalised);
			expect(plan.filePath).toBe(`/f/7/7.0/${normalised}.zip`);
		});
	}

	test('a multi-digit / zero triple lands in the right major.minor directory', () => {
		// omitted ref defaults to the version string — a NON-master ref, so the
		// artifact lands on the -dev channel.
		const plan = planCodeBuild({ version: '10.12.0' }, OK_CFG);
		if (plan.ok !== true) throw new Error('expected an ok plan');
		expect(plan.targetDir).toBe('/f/10/10.12');
		expect(plan.filePath).toBe('/f/10/10.12/10.12.0-dev.zip');
	});
});

describe('planCodeBuild — git ref allowlist (CMD-05)', () => {
	for (const bad of [
		'--output=/tmp/evil',
		'-o',
		'a;b',
		'a b',
		'a$(x)',
		'',
		'a|b',
		'a&b',
		'a`b`',
		'-main',
		'.'.repeat(0) + 'x'.repeat(201),
	]) {
		test(`rejects ref ${JSON.stringify(bad.length > 40 ? `${bad.length}-char ref` : bad)}`, () => {
			const plan = planCodeBuild({ version: '7.0.1', ref: bad }, OK_CFG);
			expect(refusal(plan)).toEqual({
				msg: 'Error. Invalid git ref',
				error: `invalid ref: ${bad}`,
			});
		});
	}

	for (const good of ['main', 'refs/heads/v7', 'v7.0.1', 'release-7.0.1', 'x'.repeat(200)]) {
		test(`accepts ref ${good.length > 40 ? `${good.length}-char ref` : JSON.stringify(good)}`, () => {
			const plan = planCodeBuild({ version: '7.0.1', ref: good }, OK_CFG);
			if (plan.ok !== true) throw new Error('expected an ok plan');
			expect(plan.ref).toBe(good);
			// the ref selects ONLY the channel suffix — no ref bytes in the path
			expect(plan.filePath).toBe('/f/7/7.0/7.0.1-dev.zip');
		});
	}

	test("'refs/heads/../../x' is ACCEPTED BY DESIGN — the ref is never used as a path", () => {
		// Not a traversal hole: the ref is only handed to `git archive` as a ref
		// to resolve; the output path is derived solely from the version triple.
		const plan = planCodeBuild({ version: '7.0.1', ref: 'refs/heads/../../x' }, OK_CFG);
		if (plan.ok !== true) throw new Error('expected an ok plan');
		expect(plan.ref).toBe('refs/heads/../../x');
		expect(plan.filePath).toBe('/f/7/7.0/7.0.1-dev.zip');
	});

	test('an empty explicit ref does NOT fall back to the version (?? not ||)', () => {
		const plan = planCodeBuild({ version: '7.0.1', ref: '' }, OK_CFG);
		expect(refusal(plan).error).toBe('invalid ref: ');
	});

	test('an omitted ref defaults to the version string', () => {
		const plan = planCodeBuild({ version: '7.0.1' }, OK_CFG);
		if (plan.ok !== true) throw new Error('expected an ok plan');
		expect(plan.ref).toBe('7.0.1');
	});
});

describe('buildVersionFromGit — rewired to planCodeBuild', () => {
	test('the refusal gates are GONE from code_build.ts (no un-wired revert)', () => {
		const source = readFileSync(
			join(import.meta.dir, '../../src/core/update/code_build.ts'),
			'utf8',
		);
		// the moved inline logic must not exist here any more…
		expect(source).not.toContain('GIT_REF_RE');
		expect(source).not.toContain('parseVersionString');
		expect(source).not.toContain('not a code server');
		expect(source).not.toContain('code build dirs unconfigured');
		expect(source).not.toContain('Invalid version number');
		expect(source).not.toContain('unconfined release path');
		// …and the call site must actually run the extraction. The options object
		// is now BUILT (the version is derived from the ref's own bytes before
		// planning, see parseDeclaredTriple), so the call no longer forwards
		// `options` verbatim — what matters is that planCodeBuild is what
		// decides, and that the ref allowlist is still the planner's ONE copy.
		expect(source).toContain("from './code_build_plan.ts'");
		expect(source).toContain('planCodeBuild(');
		expect(source).toContain('isSafeGitRef(');
	});

	test('the refusal path THROWS the registered update.refused code (P1 sweep)', async () => {
		// The first gate is asserted against a MOCKED non-code-server config, not
		// against the ambient one: reading `realConfigModule.config` made the gate
		// depend on the developer's own `../private/.env` and turned this case red
		// on any machine actually set up as a code master (2026-08-16).
		mock.module('../../src/config/config.ts', () => ({
			...REAL_CONFIG,
			config: {
				...REAL_CONFIG.config,
				update: { ...REAL_CONFIG.config.update, isCodeServer: false },
			},
		}));
		try {
			const error = await buildVersionFromGit({ version: '7.0.1' }).then(
				() => null,
				(caught: unknown) => caught,
			);
			expect(isDedaloError(error)).toBe(true);
			expect((error as { code: string }).code).toBe('update.refused');
			// the operator sentence reaches the wire (update.refused is public-disclosure)
			expect((error as { publicMessage?: string }).publicMessage).toBe(
				'Error. This instance is not a code server',
			);
			// the machine detail stays LOG-side only
			expect((error as Error).message).toContain('not a code server');
		} finally {
			mock.module('../../src/config/config.ts', () => REAL_CONFIG);
		}
	});
});

describe('buildVersionFromGit — real git archive', () => {
	test('archives a tag into a confined zip with a sha256 sidecar', async () => {
		if (!gitAvailable) {
			console.warn('[UNCOVERED] git is absent — code_build git-archive drill NOT executed');
			return;
		}
		const base = join(ROOT, 'ok');
		const repo = join(base, 'repo');
		const filesDir = join(base, 'files');
		mkdirSync(repo, { recursive: true });
		mkdirSync(filesDir, { recursive: true });
		writeFileSync(join(repo, 'package.json'), '{"name":"dedalo"}');
		const git = async (...args: string[]) => {
			const child = Bun.spawn(['git', '-C', repo, ...args], {
				stdout: 'ignore',
				stderr: 'pipe',
				env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
			});
			const [code, err] = await Promise.all([child.exited, new Response(child.stderr).text()]);
			if (code !== 0) throw new Error(`git ${args.join(' ')} failed: ${err}`);
		};
		await git('init', '-q');
		await git('config', 'user.email', 'test@dedalo.dev');
		await git('config', 'user.name', 'test');
		await git('add', 'package.json');
		await git('commit', '-q', '-m', 'seed');
		// build from the PUBLISHED channel: only `master` claims `<v>.zip`
		await git('branch', '-M', 'master');

		try {
			mock.module('../../src/config/config.ts', () => ({
				...REAL_CONFIG,
				config: {
					...REAL_CONFIG.config,
					update: {
						...REAL_CONFIG.config.update,
						isCodeServer: true,
						codeServerGitDir: repo,
						codeFilesDir: filesDir,
					},
				},
			}));

			const out = await buildVersionFromGit({ version: '7.0.1', ref: 'master' });
			expect(out.ok).toBe(true);

			const expected = join(filesDir, '7', '7.0', '7.0.1.zip');
			expect(out.file_path).toBe(expected);
			const zip = readFileSync(expected);
			expect(zip.length).toBeGreaterThan(0);
			// the installer's required prefix is inside the archive
			expect(zip.toString('binary')).toContain('dedalo_code/package.json');
			expect(out.msg).toBe(`OK. Built release 7.0.1.zip (${zip.length} bytes)`);

			// WC-024 sidecar: "<sha256>  <file>\n"
			const { createHash } = await import('node:crypto');
			const digest = createHash('sha256').update(zip).digest('hex');
			expect(out.sha256).toBe(digest);
			expect(readFileSync(`${expected}.sha256`, 'utf8')).toBe(`${digest}  7.0.1.zip\n`);

			// a bad ref: refused by git itself, no sidecar written
			const bad = await buildVersionFromGit({ version: '7.0.2', ref: 'no-such-ref' }).then(
				() => null,
				(caught: unknown) => caught,
			);
			expect(isDedaloError(bad)).toBe(true);
			expect((bad as { code: string }).code).toBe('update.failed');
			expect((bad as { publicMessage?: string }).publicMessage).toBe('Error. git archive failed');
			// git's stderr is the LOG-side detail, never the wire sentence
			expect((bad as Error).message).toStartWith('git archive failed: ');
			expect((bad as Error).message.length).toBeGreaterThan('git archive failed: '.length);
			// non-master ref → the artifact would be 7.0.2-dev.zip; no sidecar either way
			expect(existsSync(join(filesDir, '7', '7.0', '7.0.2-dev.zip.sha256'))).toBe(false);
		} finally {
			mock.module('../../src/config/config.ts', () => REAL_CONFIG);
			mock.restore();
		}
	}, 60000);
});

// ---------------------------------------------------------------------------
// A RELEASE IS NAMED AFTER ITS OWN BYTES.
//
// The build used to take the artifact's version from the RUNNING MASTER
// PROCESS (DEDALO_VERSION) while the bytes came from an independently chosen
// git ref, with nothing comparing the two. Two live consequences, both
// measured 2026-08-24 on the dev master:
//   - a master left running across a version bump keeps naming archives after
//     the OLD version, so <v>.zip holds a tree that is not version v;
//   - a master whose ref declares the version it ALREADY runs publishes a
//     same-version zip that assertLinearUpgrade refuses as a downgrade — an
//     uninstallable release produced by the button that exists to publish.
// ---------------------------------------------------------------------------
describe('the release version comes from the ref, not the process', () => {
	test('parseDeclaredTriple reads both the committed and the bumped spelling', () => {
		// The committed source spreads the triple over three lines; a probe's
		// bump writes it on one. A substring match on one spelling silently
		// misreads the other (that exact bug half-wiped the probe museum).
		const committed = readFileSync(
			join(import.meta.dir, '../../src/core/update/version.ts'),
			'utf8',
		);
		expect(parseDeclaredTriple(committed)).toBe(DEDALO_VERSION);
		expect(parseDeclaredTriple('Object.freeze([7, 0, 4]) as [number, number, number]')).toBe(
			'7.0.4',
		);
		expect(parseDeclaredTriple('Object.freeze([\n\t8, 1, 12,\n])')).toBe('8.1.12');
		expect(parseDeclaredTriple('no triple here')).toBeNull();
	});

	test('the widget no longer names the artifact from the running process', () => {
		// The regression this whole change exists to prevent: if the widget ever
		// re-imports DEDALO_VERSION to default `version`, the process is naming
		// releases again.
		const widget = readFileSync(
			join(import.meta.dir, '../../src/core/area_maintenance/widgets/update_code.ts'),
			'utf8',
		);
		const build = widget.slice(widget.indexOf('async function buildVersionOwned'));
		const body = build.slice(0, build.indexOf('\n}'));
		expect(body).not.toContain('DEDALO_VERSION');
	});

	test('the ref allowlist has exactly ONE definition', () => {
		// code_build.ts validates the ref before its pre-plan `git show` read;
		// that must reuse the planner's predicate, never re-declare the regex.
		const plan = readFileSync(
			join(import.meta.dir, '../../src/core/update/code_build_plan.ts'),
			'utf8',
		);
		const build = readFileSync(
			join(import.meta.dir, '../../src/core/update/code_build.ts'),
			'utf8',
		);
		expect(plan.match(/\[A-Za-z0-9\._\/\]\[A-Za-z0-9\._\/-\]/g)?.length ?? 0).toBe(1);
		expect(build).not.toContain('A-Za-z0-9');
	});
});
