/**
 * THE PUBLICATION-HOST KIT, work-host half (scripts/publication_host_pack.ts, `bun run
 * hostagent:pack`): what the packer writes is what deploy/install.sh's verifier accepts — and
 * nothing else gets in.
 *
 *   - DETERMINISM: the same checkout and draft give the same bytes (packed twice, compared), and
 *     the printed sha256 is the file's; the entry order of buildKit's input does not matter.
 *   - THE TWIN: the real checkout's kit, extracted by the system tar, passes install.sh's OWN
 *     kit_names_ok / kit_types_ok / verify_kit (library mode); one altered byte is refused.
 *   - THE CONTENT: the source layout with the agent's tracked files minus its test material
 *     (tests/, .env.test, deploy/examples/), PRODUCTION node_modules only (a development
 *     dependency, a symlink are refusals), the v1 sample only for a draft that serves v1, the
 *     draft byte for byte, install.sh = deploy/install.sh.
 *   - THE REFUSALS: a draft the agent's own parseDraft refuses (judged in a child inside the
 *     scratch copy); a secret-shaped file name; a PEM private key; a path outside the grammar or
 *     with a '..' segment; a duplicate; a kit without its draft; usage errors.
 *
 * HERMETIC: the scratch copy's dependencies come from a stand-in installer that copies this
 * checkout's zod (the agent's only dependency). The real `bun install` (network or warm cache)
 * runs in the init drill's kit leg (scripts/publication_host_init_drill.ts `kit-install`).
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	buildKit,
	KIT_AGENT_EXCLUDES,
	KIT_DEPS_INSTALL_ARGS,
	type KitFile,
	kitConstants,
	PackRefused,
	REPO_ROOT,
	runPack,
} from '../../scripts/publication_host_pack.ts';
import { V2_DEPS_INSTALL_ARGS } from '../../src/core/publication_host/api_bundles.ts';

const INSTALL_SH = join(REPO_ROOT, 'publication/host_agent/deploy/install.sh');
const CONSTANTS = kitConstants(readFileSync(INSTALL_SH, 'utf8'));
const SCRATCH = mkdtempSync(join(realpathSync(tmpdir()), 'dd_kit_pack_'));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

const sha = (bytes: Uint8Array | string): string =>
	createHash('sha256').update(bytes).digest('hex');

/** The stand-in for `bun install --production`: this checkout's zod, copied (never linked). */
const fakeInstall = (scratchAgent: string): void => {
	cpSync(join(REPO_ROOT, 'node_modules/zod'), join(scratchAgent, 'node_modules/zod'), {
		recursive: true,
	});
};

function draft(name: string, body: Record<string, unknown>): string {
	const path = join(SCRATCH, `${name}.draft.json`);
	writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
	return path;
}

const V2_DRAFT = {
	instance: 'museum',
	layout: 'home',
	site: { domain: 'museum.test' },
	media: { mode: 'none' },
};
const V1_DRAFT = {
	...V2_DRAFT,
	instance: 'legacy',
	apis: 'v1_and_v2',
	site: { domain: 'legacy.test' },
};

async function pack(name: string, body: Record<string, unknown>, install = fakeInstall) {
	const out = join(SCRATCH, `${name}.tar.gz`);
	const result = await runPack(['--draft', draft(name, body), '--out', out], REPO_ROOT, {
		installDeps: install,
	});
	return { result, out };
}

/** Extracts a kit with the system tar and runs install.sh's own checks on it. */
function verifyWithInstallSh(kit: string, into: string): { code: number; err: string } {
	rmSync(into, { recursive: true, force: true });
	mkdirSync(into, { recursive: true });
	const list = join(SCRATCH, `${Math.random().toString(16).slice(2)}.list`);
	const vlist = `${list}.v`;
	writeFileSync(list, spawnSync('tar', ['-tzf', kit], { encoding: 'utf8' }).stdout);
	writeFileSync(vlist, spawnSync('tar', ['-tvzf', kit], { encoding: 'utf8' }).stdout);
	expect(
		spawnSync('tar', ['-xzf', kit, '-C', into, '--no-same-owner', '--no-same-permissions']).status,
	).toBe(0);
	return verifyTree(list, vlist, into);
}

function verifyTree(list: string, vlist: string, dir: string): { code: number; err: string } {
	const run = spawnSync(
		'sh',
		[
			'-c',
			'script=$0; a=$1 b=$2 c=$3; set -- --lib; . "$script"; kit_names_ok "$a" && kit_types_ok "$b" && verify_kit "$c"',
			INSTALL_SH,
			list,
			vlist,
			dir,
		],
		{ encoding: 'utf8', env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LC_ALL: 'C' } },
	);
	return { code: run.status ?? -1, err: run.stderr };
}

describe('the constants and the install argv', () => {
	test("the packer reads the verifier's own constants (install.sh)", () => {
		expect(CONSTANTS.formatLine).toBe('# dedalo publication-host kit 1');
		expect([
			CONSTANTS.manifestName,
			CONSTANTS.draftName,
			CONSTANTS.installName,
			CONSTANTS.sourceDir,
		]).toEqual(['MANIFEST', 'draft.json', 'install.sh', 'source']);
		expect(CONSTANTS.sourceManifest.map((e) => e.path)).toContain('publication/host_agent');
		expect(CONSTANTS.sourceOptional).toEqual([
			'publication/server_api/v1/config_api/sample.server_config_api.php',
		]);
	});

	test("the scratch install is the release bundles' own argv (frozen, production, hoisted, no scripts)", () => {
		expect([...KIT_DEPS_INSTALL_ARGS]).toEqual([...V2_DEPS_INSTALL_ARGS]);
		expect(KIT_DEPS_INSTALL_ARGS).toContain('--ignore-scripts');
	});
});

describe('runPack on this checkout', () => {
	test('a v2-only kit: deterministic, verified by install.sh, the closed content', async () => {
		const first = await pack('v2a', V2_DRAFT);
		expect(first.result.stderr).toBe('');
		expect(first.result.code).toBe(0);
		const second = await pack('v2b', V2_DRAFT);
		const a = readFileSync(first.out);
		const b = readFileSync(second.out);
		expect(sha(a)).toBe(sha(b));
		expect(Buffer.compare(a, b)).toBe(0);
		expect(first.result.stdout).toContain(`sha256 ${sha(a)}`);
		expect(first.result.stdout).toContain(`--kit-sha256 ${sha(a)}`);

		const dir = join(SCRATCH, 'x_v2');
		const verdict = verifyWithInstallSh(first.out, dir);
		expect(verdict.err).toBe('');
		expect(verdict.code).toBe(0);

		const agent = join(dir, 'source/publication/host_agent');
		expect(readFileSync(join(dir, 'draft.json'), 'utf8')).toBe(
			`${JSON.stringify(V2_DRAFT, null, 2)}\n`,
		);
		expect(Buffer.compare(readFileSync(join(dir, 'install.sh')), readFileSync(INSTALL_SH))).toBe(0);
		expect(existsSync(join(agent, 'src/provision/cli.ts'))).toBe(true);
		expect(existsSync(join(agent, 'deploy/install.sh'))).toBe(true);
		expect(existsSync(join(agent, 'node_modules/zod/package.json'))).toBe(true);
		for (const excluded of KIT_AGENT_EXCLUDES)
			expect(existsSync(join(agent, excluded)), excluded).toBe(false);
		for (const dev of ['typescript', '@types', '.test-tmp', '.bin'])
			expect(existsSync(join(agent, dev === '.test-tmp' ? dev : `node_modules/${dev}`)), dev).toBe(
				false,
			);
		expect(existsSync(join(dir, 'source/publication/server_api/v2/.env.example'))).toBe(true);
		expect(existsSync(join(dir, 'source/publication/server_api/v1'))).toBe(false);
		for (const rel of ['.bun-version', '.bun-sha256']) {
			expect(
				Buffer.compare(readFileSync(join(dir, 'source', rel)), readFileSync(join(REPO_ROOT, rel))),
			).toBe(0);
		}
	}, 60_000);

	test('one altered byte of an extracted kit is refused by install.sh', async () => {
		const { out } = await pack('tamper', V2_DRAFT);
		const dir = join(SCRATCH, 'x_tamper');
		expect(verifyWithInstallSh(out, dir).code).toBe(0);
		const target = join(dir, 'source/publication/host_agent/src/provision/cli.ts');
		const bytes = readFileSync(target);
		bytes[0] = (bytes[0] as number) ^ 1;
		writeFileSync(target, bytes);
		const list = join(SCRATCH, 'tamper.list');
		writeFileSync(list, 'MANIFEST\n');
		writeFileSync(`${list}.v`, '-rw-r--r-- MANIFEST\n');
		const verdict = verifyTree(list, `${list}.v`, dir);
		expect(verdict.code).toBe(3);
		expect(verdict.err).toContain(
			"'source/publication/host_agent/src/provision/cli.ts' has sha256",
		);
	}, 60_000);

	test('a draft that serves v1 carries the v1 sample', async () => {
		const { result, out } = await pack('v1', V1_DRAFT);
		expect(result.code).toBe(0);
		expect(result.stdout).toContain("kit for instance 'legacy' (v1 and v2)");
		const dir = join(SCRATCH, 'x_v1');
		expect(verifyWithInstallSh(out, dir).code).toBe(0);
		expect(
			existsSync(
				join(dir, 'source/publication/server_api/v1/config_api/sample.server_config_api.php'),
			),
		).toBe(true);
	}, 60_000);

	test("a draft the agent's own parseDraft refuses is refused (exit 3), nothing written", async () => {
		const { result, out } = await pack('bad', { ...V2_DRAFT, password: 'hunter2hunter2' });
		expect(result.code).toBe(3);
		expect(result.stderr).toContain("refused by the agent's own validation");
		expect(existsSync(out)).toBe(false);
		const v2Only = await pack('bad2', { ...V2_DRAFT, apis: 'v2_only', php_bin: '/usr/bin/php' });
		expect(v2Only.result.code).toBe(3);
		expect(v2Only.result.stderr).toContain('php_bin');
	}, 60_000);

	test('a development dependency or a symlink in the scratch node_modules is refused', async () => {
		const dev = await pack('dev', V2_DRAFT, (dir) => {
			fakeInstall(dir);
			mkdirSync(join(dir, 'node_modules/typescript'), { recursive: true });
			writeFileSync(join(dir, 'node_modules/typescript/package.json'), '{}');
		});
		expect(dev.result.code).toBe(3);
		expect(dev.result.stderr).toContain("the development dependency 'typescript'");
		const link = await pack('link', V2_DRAFT, (dir) => {
			fakeInstall(dir);
			symlinkSync('/etc/passwd', join(dir, 'node_modules/zod/evil'));
		});
		expect(link.result.code).toBe(3);
		expect(link.result.stderr).toContain("node_modules/zod/evil' is a symlink");
	}, 60_000);

	test('usage', async () => {
		expect((await runPack([])).code).toBe(2);
		expect((await runPack(['--draft'])).code).toBe(2);
		expect((await runPack(['--draft', 'x', '--bogus'])).code).toBe(2);
		expect(
			(
				await runPack(['--draft', join(SCRATCH, 'absent.json')], REPO_ROOT, {
					installDeps: fakeInstall,
				})
			).code,
		).toBe(3);
	});
});

describe('buildKit (pure)', () => {
	const base = (): KitFile[] => [
		{ path: 'draft.json', bytes: new TextEncoder().encode('{}\n'), executable: false },
		{ path: 'install.sh', bytes: new TextEncoder().encode('#!/bin/sh\n'), executable: true },
		{ path: 'source/.bun-version', bytes: new TextEncoder().encode('1.4.2\n'), executable: false },
		{
			path: 'source/publication/host_agent/src/index.ts',
			bytes: new TextEncoder().encode('export {};\n'),
			executable: false,
		},
	];

	test('the input order does not change one byte', async () => {
		const a = await buildKit(base(), CONSTANTS);
		const b = await buildKit([...base()].reverse(), CONSTANTS);
		expect(a.sha256).toBe(b.sha256);
		expect(sha(a.bytes)).toBe(a.sha256);
	});

	const refusedWith = async (files: KitFile[], message: string): Promise<void> => {
		let caught: unknown = null;
		try {
			await buildKit(files, CONSTANTS);
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(PackRefused);
		expect((caught as Error).message).toContain(message);
	};
	const plus = (path: string, body: string): KitFile[] => [
		...base(),
		{ path, bytes: new TextEncoder().encode(body), executable: false },
	];

	test('secret-shaped names are refused', async () => {
		for (const name of [
			'source/publication/host_agent/.env',
			'source/x/.env.local',
			'source/x/server.pem',
			'source/x/tls.key',
			'source/x/id_ed25519',
			'source/x/SERVICE_TOKEN',
			'source/x/credentials',
		]) {
			await refusedWith(plus(name, 'x'), 'named like a credential');
		}
		// the shipped example and code that merely names the armour line are not secrets
		expect(
			(await buildKit(plus('source/publication/server_api/v2/.env.example', 'A=1\n'), CONSTANTS))
				.sha256,
		).toMatch(/^[0-9a-f]{64}$/);
		expect(
			(
				await buildKit(
					plus('source/x/tls.ts', "const H = '-----BEGIN PRIVATE KEY-----';\n"),
					CONSTANTS,
				)
			).sha256,
		).toMatch(/^[0-9a-f]{64}$/);
	});

	test('a PEM private key block is refused', async () => {
		const pem = `-----BEGIN PRIVATE KEY-----\n${'A'.repeat(64)}\n${'B'.repeat(64)}\n-----END PRIVATE KEY-----\n`;
		await refusedWith(plus('source/x/fixture.txt', pem), 'holds a PEM private key');
		await refusedWith(
			plus('source/x/rsa.txt', pem.replaceAll('PRIVATE KEY', 'RSA PRIVATE KEY')),
			'holds a PEM private key',
		);
	});

	test('paths outside the grammar, duplicates, a missing draft are refused', async () => {
		await refusedWith(plus('source/../../etc/cron.d/x', 'x'), 'outside the kit path grammar');
		await refusedWith(plus('/etc/x', 'x'), 'outside the kit path grammar');
		await refusedWith(plus('source/a b', 'x'), 'outside the kit path grammar');
		await refusedWith(plus('MANIFEST', 'x'), "the MANIFEST's own name");
		await refusedWith(plus('draft.json', 'x'), 'listed twice');
		await refusedWith(
			base().filter((f) => f.path !== 'draft.json'),
			'the kit has no draft.json',
		);
	});
});
