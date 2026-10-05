/**
 * THE PHASE-5 COPY DRILL'S OWN PIECES — held without the live servers.
 *
 * The copy pass of scripts/publication_host_agent_drill.ts runs on the instance tier only
 * (live Apache/nginx, the real agent over mTLS, the suite database). What it builds, and
 * the engine child it spawns, must be right before they can prove anything, so this gate
 * holds, hermetically:
 *   - the child's closed argv grammar and its refusals: an unmarked or unset private dir or
 *     media root is refused BEFORE any engine import can write (registry, secrets, runtime
 *     file, marker store would otherwise land in the installation's trees);
 *   - the result line the drill parses out of engine noise;
 *   - the repointed child environment (suite database, scratch private dir, scratch WORK
 *     media root armed by DEDALO_TEST_MEDIA_ROOT, install media keys dropped);
 *   - the tree listing the drill compares the agent's copy root with.
 * The engine bundle (client cert, PKCS#8 key, CA) is the engine drill kit's
 * writeEngineBundle, held by publication_host_engine_drill_kit.test.ts — one copy.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	COPY_DRILL_PRIVATE_MARKER,
	COPY_DRILL_QUALITIES,
	copyEngineEnv,
	describeError,
	engineChildRefusal,
	listTree,
	parseDrillResult,
	parseEngineArgv,
	renderDrillResult,
} from '../../scripts/lib/publication_host_copy_drill_kit.ts';

const scratch = mkdtempSync(join(tmpdir(), 'dd_pubhost_copy_kit_'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const ENGINE = join(
	import.meta.dir,
	'..',
	'..',
	'scripts',
	'lib',
	'publication_host_copy_engine.ts',
);

describe('copy drill kit — the result line', () => {
	test('the LAST result line wins; engine noise around it is ignored', () => {
		const out = [
			'[config] something the engine logged',
			renderDrillResult({ ok: true, value: 1 }),
			'noise',
			renderDrillResult({ ok: true, value: { a: [2] } }),
			'',
		].join('\n');
		expect(parseDrillResult(out, '')).toEqual({ ok: true, value: { a: [2] } });
	});

	test('a failure result is returned, not thrown; an undefined value renders as null', () => {
		const failed = renderDrillResult({ ok: false, error: 'publication_host.unreachable: down' });
		expect(parseDrillResult(failed, '')).toEqual({
			ok: false,
			error: 'publication_host.unreachable: down',
		});
		expect(parseDrillResult(renderDrillResult({ ok: true, value: undefined }), '')).toEqual({
			ok: true,
			value: null,
		});
	});

	test('no result line → throws with the stderr tail', () => {
		expect(() => parseDrillResult('plain', 'boom at line 3')).toThrow(
			'the engine child printed no result line:\nboom at line 3',
		);
	});

	test('a malformed result line throws naming it', () => {
		expect(() => parseDrillResult('DRILL_RESULT {"value":1}', '')).toThrow(
			'malformed result line: DRILL_RESULT {"value":1}',
		);
		expect(() => parseDrillResult('DRILL_RESULT {not json', '')).toThrow(
			'malformed result line: DRILL_RESULT {not json',
		);
	});

	test('describeError: a typed code wins over the class name', () => {
		const typed = Object.assign(new Error('agent down'), { code: 'publication_host.unreachable' });
		expect(describeError(typed)).toBe('publication_host.unreachable: agent down');
		expect(describeError(new TypeError('x'))).toBe('TypeError: x');
		expect(describeError('plain')).toBe('plain');
	});
});

describe('copy drill kit — the engine child argv and refusals', () => {
	test('the closed command set, arity and argument grammar', () => {
		expect(parseEngineArgv(['plan'])).toEqual({ command: 'plan', args: [] });
		expect(parseEngineArgv(['publish', 'test3', '1'])).toEqual({
			command: 'publish',
			args: ['test3', '1'],
		});
		expect(parseEngineArgv(['pair', '/tmp/x/spec.json'])).toEqual({
			command: 'pair',
			args: ['/tmp/x/spec.json'],
		});
		for (const bad of [
			[],
			['drop_everything'],
			['plan', 'extra'],
			['publish', 'test3'],
			['publish', 'test3', 'x'],
			['unpublish', '../x', '1'],
			['pair', 'relative.json'],
			['toString'],
		]) {
			expect(parseEngineArgv(bad)).toBeNull();
		}
	});

	test('refuses an unset or unmarked private dir, then an unset or unmarked media root', () => {
		const marks = new Set<string>();
		const exists = (path: string) => marks.has(path);
		const env = { DEDALO_PRIVATE_DIR: '/tmp/d/private', DEDALO_TEST_MEDIA_ROOT: '/tmp/d/work' };
		expect(engineChildRefusal({}, '.m', exists)).toContain('DEDALO_PRIVATE_DIR');
		expect(engineChildRefusal({ ...env, DEDALO_PRIVATE_DIR: 'private' }, '.m', exists)).toContain(
			'DEDALO_PRIVATE_DIR',
		);
		expect(engineChildRefusal(env, '.m', exists)).toContain(COPY_DRILL_PRIVATE_MARKER);
		marks.add(`/tmp/d/private/${COPY_DRILL_PRIVATE_MARKER}`);
		expect(
			engineChildRefusal({ DEDALO_PRIVATE_DIR: env.DEDALO_PRIVATE_DIR }, '.m', exists),
		).toContain('DEDALO_TEST_MEDIA_ROOT');
		expect(engineChildRefusal(env, '.m', exists)).toContain('carries no .m marker');
		marks.add('/tmp/d/work/.m');
		expect(engineChildRefusal(env, '.m', exists)).toBeNull();
	});
});

describe('copy drill kit — the child environment', () => {
	test('pins the seams over the inherited environment and drops the install media keys', () => {
		const env = copyEngineEnv({
			base: {
				PATH: '/usr/bin',
				DB_NAME: 'dedalo7_app',
				DEDALO_DATABASE_CONN: 'dedalo7_app',
				MEDIA_PATH: '/srv/media',
				DEDALO_MEDIA_PATH: '/srv/media',
				DEDALO_MEDIA_PUBLIC_QUALITIES: '["image/original"]',
				DEDALO_PRIVATE_DIR: '/srv/private',
				DB_PASSWORD: 'x',
				UNSET: undefined,
			},
			privateDir: '/tmp/d/private',
			suiteDb: 'dedalo7_app_test',
			mediaRoot: '/tmp/d/work',
			processesDir: '/tmp/d/work.processes',
		});
		expect(env).toMatchObject({
			PATH: '/usr/bin',
			DB_PASSWORD: 'x',
			DEDALO_PRIVATE_DIR: '/tmp/d/private',
			DB_NAME: 'dedalo7_app_test',
			DEDALO_DATABASE_CONN: 'dedalo7_app_test',
			DEDALO_TEST_MEDIA_ROOT: '/tmp/d/work',
			DEDALO_MEDIA_PROCESSES_DIR: '/tmp/d/work.processes',
			DEDALO_MEDIA_PUBLIC_QUALITIES: JSON.stringify(COPY_DRILL_QUALITIES),
			DEDALO_RECONCILE_SCHEDULER_ENABLED: 'false',
		});
		expect('MEDIA_PATH' in env).toBe(false);
		expect('DEDALO_MEDIA_PATH' in env).toBe(false);
		expect('UNSET' in env).toBe(false);
	});

	test('refuses a relative path and a database name that is not an identifier', () => {
		const ok = {
			base: {},
			privateDir: '/tmp/p',
			suiteDb: 'x_test',
			mediaRoot: '/tmp/m',
			processesDir: '/tmp/m.processes',
		};
		expect(() => copyEngineEnv({ ...ok, privateDir: 'private' })).toThrow(
			"copy drill: privateDir must be absolute (got 'private')",
		);
		expect(() => copyEngineEnv({ ...ok, suiteDb: 'x;drop' })).toThrow(
			"copy drill: suite database 'x;drop' is not an identifier",
		);
	});
});

describe('copy drill kit — the tree listing', () => {
	test('files relative and sorted, dot dirs included, a symlink named and never followed', () => {
		const root = join(scratch, 'tree');
		mkdirSync(join(root, 'image/thumb/0'), { recursive: true });
		mkdirSync(join(root, '.publication/pub'), { recursive: true });
		writeFileSync(join(root, 'image/thumb/0/b.jpg'), 'b');
		writeFileSync(join(root, 'image/thumb/0/a.jpg'), 'a');
		writeFileSync(join(root, '.publication/pub/test3_1'), '');
		symlinkSync('/etc', join(root, 'escape'));
		expect(listTree(root)).toEqual([
			'.publication/pub/test3_1',
			'escape -> (symlink)',
			'image/thumb/0/a.jpg',
			'image/thumb/0/b.jpg',
		]);
		// an absent root lists as nothing — witnessed by length 0 on a path proven absent,
		// beside the populated listing above (the floor)
		const absent = join(scratch, 'absent');
		expect(existsSync(absent)).toBe(false);
		expect(listTree(absent).length).toBe(0);
	});
});

describe('the engine child, spawned — refuses before it can write anywhere', () => {
	const run = (args: string[], env: Record<string, string>) => {
		const r = Bun.spawnSync([process.execPath, ENGINE, ...args], {
			env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? scratch, ...env },
			stdout: 'pipe',
			stderr: 'pipe',
		});
		return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
	};

	test('an argv outside the closed set → exit 2, usage, no result line', () => {
		const r = run(['drop_everything'], {});
		expect(r.code).toBe(2);
		expect(r.err).toContain('usage: publication_host_copy_engine.ts');
		expect(r.out).not.toContain('DRILL_RESULT');
	});

	test('an unmarked private dir → exit 2, REFUSED, nothing written into it', () => {
		const priv = join(scratch, 'unmarked_private');
		mkdirSync(priv);
		// a sentinel: the listing must equal exactly it — proves the read saw the dir and nothing was added
		writeFileSync(join(priv, 'sentinel'), '');
		const r = run(['runtime'], {
			DEDALO_PRIVATE_DIR: priv,
			DEDALO_TEST_MEDIA_ROOT: join(scratch, 'nowhere'),
		});
		expect(r.code).toBe(2);
		expect(r.err).toContain('publication_host_copy_engine REFUSED');
		expect(r.err).toContain(COPY_DRILL_PRIVATE_MARKER);
		expect(r.out).not.toContain('DRILL_RESULT');
		expect(readdirSync(priv)).toEqual(['sentinel']);
	});

	test('a marked private dir but an unmarked media root → exit 2, nothing written into either', () => {
		const priv = join(scratch, 'marked_private');
		const media = join(scratch, 'unmarked_media');
		mkdirSync(priv);
		mkdirSync(media);
		writeFileSync(join(priv, COPY_DRILL_PRIVATE_MARKER), '');
		writeFileSync(join(media, 'sentinel'), '');
		const r = run(['runtime'], { DEDALO_PRIVATE_DIR: priv, DEDALO_TEST_MEDIA_ROOT: media });
		expect(r.code).toBe(2);
		expect(r.err).toContain('publication_host_copy_engine REFUSED');
		expect(r.err).toContain('.dedalo_test_media');
		expect(readdirSync(priv)).toEqual([COPY_DRILL_PRIVATE_MARKER]);
		expect(readdirSync(media)).toEqual(['sentinel']);
	});
});
