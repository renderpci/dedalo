/**
 * INSTALL STEP ROUTER — runInstallStep (src/core/install/engine.ts).
 *
 * The wizard's one entry point had no gate at all: the unknown-step arm, the
 * per-step session requirement on the two record-WRITING steps, and the
 * required-field guard the db probe answers with all lived untested. Nothing
 * here needs a seam — every arm below is hermetic (the default arm imports
 * nothing, install_hierarchies/register_tools return 401 BEFORE their dynamic
 * import, test_db_connection stops at the db_probe field guard before any spawn).
 *
 * Scratch namespace: zzi. No DB writes; the one filesystem-touching arm
 * (check_directories) runs in a CHILD process pointed at a scratch private/
 * media/backup root, and is SKIPPED unless every resolved directory is under it
 * — dirIsWritable does a real write+unlink and must never touch real user data.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ApiRequestContext } from '../../src/core/api/handler_context.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { runInstallStep } from '../../src/core/install/engine.ts';

const ROOT = join(import.meta.dir, '..', '..');

/** A no-session install request context (the pre-login wizard state). */
function anonContext(): ApiRequestContext {
	return {
		requestId: 'zzi-install-router',
		clientIp: '127.0.0.1',
		session: null,
		csrfCandidate: null,
	};
}

/** An RQO carrying only the install step options bag. */
function stepRqo(options?: Record<string, unknown>): Rqo {
	return { action: 'install', options } as Rqo;
}

describe('runInstallStep — unknown steps', () => {
	test("an unrecognised action answers 200 with errors:['unknown_step']", async () => {
		const r = await runInstallStep(stepRqo({ action: 'nope' }), anonContext());
		expect(r.status).toBe(200);
		expect(r.body).toEqual({
			result: false,
			msg: "Unknown install step 'nope'",
			errors: ['unknown_step'],
		});
	});

	test('a missing options bag falls to the same arm with an EMPTY step name', async () => {
		// quirk: pinned, not fixed — `options.action ?? ''` means "no action" is
		// reported as the unknown step '' rather than as a distinct error.
		const r = await runInstallStep(stepRqo(), anonContext());
		expect(r.status).toBe(200);
		expect((r.body as { msg: string }).msg).toBe("Unknown install step ''");
		expect((r.body as { errors: string[] }).errors).toEqual(['unknown_step']);
	});
});

describe('runInstallStep — per-step session requirement', () => {
	// The two record-WRITING steps; every other step is reachable pre-login.
	for (const step of ['install_hierarchies', 'register_tools']) {
		test(`${step} refuses a session-less request with 401`, async () => {
			const r = await runInstallStep(stepRqo({ action: step }), anonContext());
			expect(r.status).toBe(401);
			expect(r.body).toEqual({
				result: false,
				msg: 'Authentication required',
				errors: ['unauthorized'],
			});
		});
	}
});

describe('runInstallStep — test_db_connection', () => {
	test('routes to the db probe and stops at the required-field guard', async () => {
		const r = await runInstallStep(stepRqo({ action: 'test_db_connection' }), anonContext());
		expect(r.status).toBe(200);
		expect(r.body).toEqual({
			result: false,
			can_connect: false,
			db_exists: false,
			can_create: false,
			msg: 'Database name and user are required',
		});
	});
});

/**
 * check_directories in a child process with the private/media/backup roots
 * pointed at a NON-EXISTENT scratch tree, so the write+unlink writability probe
 * can never reach real user data. The child refuses (prints `skip`) if any
 * resolved directory escapes the scratch root — e.g. if `config` had already
 * been frozen from the real environment.
 */
const SCRATCH_ROOT = join(tmpdir(), `dedalo_zzi_install_${process.pid}`);

const CHECK_DIRS_SNIPPET = [
	"const scratch = process.env.ZZI_SCRATCH_ROOT ?? '';",
	"const { installPrivateDir } = await import('./src/core/install/paths.ts');",
	"const { config } = await import('./src/config/config.ts');",
	'const roots = [installPrivateDir(), config.ops.backupDir, config.media.rootPath];',
	'const escaped = roots.filter((p) => typeof p !== "string" || !p.startsWith(scratch));',
	'if (escaped.length > 0) {',
	'  console.log(JSON.stringify({ skip: escaped }));',
	'} else {',
	"  const { runInstallStep } = await import('./src/core/install/engine.ts');",
	"  const ctx = { requestId: 'zzi', clientIp: '127.0.0.1', session: null, csrfCandidate: null };",
	"  const plain = await runInstallStep({ action: 'install', options: { action: 'check_directories' } }, ctx);",
	// A TRUTHY STRING — exactly what an HTML form posts for an unchecked box.
	"  const truthy = await runInstallStep({ action: 'install', options: { action: 'check_directories', create: 'false' } }, ctx);",
	"  const { existsSync } = await import('node:fs');",
	'  const created = truthy.body.dirs.filter((d) => existsSync(d.path)).map((d) => d.path);',
	'  console.log(JSON.stringify({ plain: plain.body, truthy: truthy.body, created }));',
	'}',
].join('\n');

function runCheckDirsChild(): Record<string, unknown> {
	const child = Bun.spawnSync(['bun', '-e', CHECK_DIRS_SNIPPET], {
		cwd: ROOT,
		env: {
			...process.env,
			ZZI_SCRATCH_ROOT: SCRATCH_ROOT,
			DEDALO_INSTALL_PRIVATE_DIR: join(SCRATCH_ROOT, 'private'),
			MEDIA_PATH: join(SCRATCH_ROOT, 'media'),
			DEDALO_BACKUP_DIR: join(SCRATCH_ROOT, 'backups'),
		} as Record<string, string>,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const lastLine = (child.stdout.toString().trim().split('\n').pop() ?? '').trim();
	if (child.exitCode !== 0 || lastLine === '') {
		throw new Error(
			`check_directories child failed (${child.exitCode}): ${child.stderr.toString()}`,
		);
	}
	return JSON.parse(lastLine) as Record<string, unknown>;
}

const childResult = runCheckDirsChild();
const scratchConfirmed = childResult.skip === undefined;

describe('runInstallStep — check_directories', () => {
	test.if(scratchConfirmed)('reports one row per managed directory', () => {
		const body = childResult.plain as { result: boolean; dirs: unknown[]; msg: string };
		expect(Array.isArray(body.dirs)).toBe(true);
		expect(body.dirs.length).toBeGreaterThan(0);
		// Nothing exists under the scratch root, so the pre-flight must say so.
		expect(body.result).toBe(false);
		expect(body.msg).toBe('One or more directories need attention');
	});

	test.if(scratchConfirmed)(
		"create:'false' — a TRUTHY STRING — creates nothing (=== true, not truthiness)",
		() => {
			const body = childResult.truthy as { dirs: { exists: boolean }[] };
			expect(body.dirs.length).toBeGreaterThan(0);
			expect(childResult.created).toEqual([]);
			expect(body.dirs.every((d) => d.exists === false)).toBe(true);
			// And the scratch tree really was never touched.
			expect(existsSync(SCRATCH_ROOT)).toBe(false);
		},
	);

	test.if(!scratchConfirmed)('SKIPPED: install dirs did not resolve under the scratch root', () => {
		// Audible: the write+unlink writability probe would have hit real paths.
		console.warn(
			`check_directories cases skipped — these escaped ${SCRATCH_ROOT}: ${JSON.stringify(childResult.skip)}`,
		);
		expect(childResult.skip).toBeDefined();
	});
});
