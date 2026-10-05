/**
 * Publication-host RUNTIME state (src/core/publication_host/runtime.ts): the last observed
 * per-host results of phases 4–6, beside the phase-3 registry, read and written ONLY
 * through the atomic JSON kernel (the registry's own laws: regular 0600 engine-owned file,
 * bounded read AND write, flock). Corrupt is LOUD (load rejects, update refuses to
 * overwrite) — never a silent reset to defaults. The store is reached from the API dispatch
 * table, so it is ASYNC and makes no call from the sync_io_on_request_path_tripwire
 * forbidden class.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { RUNTIME_PATH_CENSUS } from '../../src/core/install/runtime_paths.ts';
import { registryPath } from '../../src/core/publication_host/registry.ts';
import {
	defaultHostRuntime,
	type HostRuntime,
	loadRuntimeAt,
	RUNTIME_FILE_NAME,
	RUNTIME_MAX_BYTES,
	RuntimeStateError,
	removeHostRuntimeAt,
	runtimePath,
	updateHostRuntimeAt,
} from '../../src/core/publication_host/runtime.ts';
import { stripComments } from '../helpers/strip_comments.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

let dir: string;
let file: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'pubhost_runtime_'));
	file = join(dir, RUNTIME_FILE_NAME);
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

/** The RuntimeStateError reason `run` rejects with, null when it resolves. */
async function reasonOf(run: () => Promise<unknown>): Promise<string | null> {
	try {
		await run();
		return null;
	} catch (error) {
		return error instanceof RuntimeStateError ? error.reason : `foreign: ${String(error)}`;
	}
}

/** A hand-written state file, private like the store writes it. */
function plant(text: string): void {
	writeFileSync(file, text, { mode: 0o600 });
	chmodSync(file, 0o600);
}

function probeOk(cur: HostRuntime): HostRuntime {
	return {
		...cur,
		probe: {
			state: 'ok',
			at: '2026-10-03T10:00:00.000Z',
			published_status: 200,
			unpublished_status: 404,
			detail: null,
		},
	};
}

describe('publication host runtime store', () => {
	test('an absent file is an empty runtime, not an error', async () => {
		expect(await loadRuntimeAt(file)).toEqual({});
	});

	test('the first update starts from the default record; file is 0600, no temp left', async () => {
		const written = await updateHostRuntimeAt(file, 'museum', (cur) => {
			expect(cur).toEqual(defaultHostRuntime());
			return probeOk(cur);
		});
		expect(written.probe.state).toBe('ok');
		expect((await loadRuntimeAt(file)).museum?.probe.published_status).toBe(200);
		expect(statSync(file).mode & 0o777).toBe(0o600);
		expect(readdirSync(dir).sort()).toEqual([RUNTIME_FILE_NAME, `${RUNTIME_FILE_NAME}.lock`]);
		expect(JSON.parse(readFileSync(file, 'utf8')).version).toBe(1);
	});

	test('updates are per host: the other hosts survive', async () => {
		await updateHostRuntimeAt(file, 'museum', probeOk);
		await updateHostRuntimeAt(file, 'archive', (cur) => ({
			...cur,
			apis: { ...cur.apis, v2: { state: 'ok', release: '7.1.0_abc1234', error: null, at: null } },
		}));
		const all = await loadRuntimeAt(file);
		expect(Object.keys(all).sort()).toEqual(['archive', 'museum']);
		expect(all.museum?.probe.state).toBe('ok');
		expect(all.archive?.apis.v2.release).toBe('7.1.0_abc1234');
		expect(all.archive?.probe.state).toBe('unknown');
	});

	test('two concurrent updates in one process both land (the lock serializes them; no lost update)', async () => {
		await Promise.all([
			updateHostRuntimeAt(file, 'museum', probeOk),
			updateHostRuntimeAt(file, 'archive', probeOk),
		]);
		expect(Object.keys(await loadRuntimeAt(file)).sort()).toEqual(['archive', 'museum']);
	});

	test('the default record is a fresh object every call', () => {
		const first = defaultHostRuntime();
		first.media_copy.pending_deletions.push({ path: 'image/1.5MB/x.jpg', since: 'now' });
		expect(defaultHostRuntime().media_copy.pending_deletions).toEqual([]);
	});

	test('a throwing fn (even after mutating its argument) writes nothing', async () => {
		await updateHostRuntimeAt(file, 'museum', probeOk);
		const before = readFileSync(file, 'utf8');
		await expect(
			updateHostRuntimeAt(file, 'museum', (cur) => {
				cur.apis.v1.state = 'failed';
				throw new RangeError('stop');
			}),
		).rejects.toThrow('stop');
		expect(readFileSync(file, 'utf8')).toBe(before);
		expect(readdirSync(dir).filter((name) => name.includes('.tmp-'))).toEqual([]);
	});

	test('an invalid host name is refused before anything is written', async () => {
		expect(await reasonOf(() => updateHostRuntimeAt(file, 'Bad Name', (cur) => cur))).toBe(
			'invalid_name',
		);
		expect(readdirSync(dir)).toEqual([]);
	});

	test('an fn producing an invalid record is refused and writes nothing', async () => {
		await updateHostRuntimeAt(file, 'museum', probeOk);
		const before = readFileSync(file, 'utf8');
		const bad = (cur: HostRuntime) =>
			({ ...cur, probe: { ...cur.probe, state: 'green' } }) as unknown as HostRuntime;
		expect(await reasonOf(() => updateHostRuntimeAt(file, 'museum', bad))).toBe('invalid_shape');
		expect(readFileSync(file, 'utf8')).toBe(before);
	});

	test('an fn adding an unknown key is refused (strict shape, like the registry)', async () => {
		const extra = (cur: HostRuntime) => ({ ...cur, note: 'x' }) as unknown as HostRuntime;
		expect(await reasonOf(() => updateHostRuntimeAt(file, 'museum', extra))).toBe('invalid_shape');
		expect(readdirSync(dir).filter((name) => name === RUNTIME_FILE_NAME)).toEqual([]);
	});

	test('a corrupt file is LOUD: load rejects and update/remove refuse to overwrite it', async () => {
		plant('{not json');
		expect(await reasonOf(() => loadRuntimeAt(file))).toBe('invalid_json');
		expect(await reasonOf(() => updateHostRuntimeAt(file, 'museum', probeOk))).toBe('invalid_json');
		expect(await reasonOf(() => removeHostRuntimeAt(file, 'museum'))).toBe('invalid_json');
		expect(readFileSync(file, 'utf8')).toBe('{not json');
	});

	test('a wrong envelope or a bad host entry is invalid_shape', async () => {
		const ok = defaultHostRuntime();
		const cases: unknown[] = [
			[],
			{ version: 2, hosts: {} },
			{ version: 1, hosts: [] },
			{ version: 1, hosts: {}, extra: true },
			{ version: 1, hosts: { Bad: ok } },
			{ version: 1, hosts: { museum: { ...ok, media_copy: { ...ok.media_copy, desired: -1 } } } },
			{ version: 1, hosts: { museum: { ...ok, probe: { ...ok.probe, published_status: 42 } } } },
			{ version: 1, hosts: { museum: { ...ok, probe: { ...ok.probe, extra: 1 } } } },
			{
				version: 1,
				hosts: {
					museum: { ...ok, media_copy: { ...ok.media_copy, pending_deletions: [{ path: 1 }] } },
				},
			},
			{ version: 1, hosts: { museum: { ...ok, apis: { v1: ok.apis.v1 } } } },
		];
		for (const value of cases) {
			plant(JSON.stringify(value));
			expect(await reasonOf(() => loadRuntimeAt(file)), JSON.stringify(value)).toBe(
				'invalid_shape',
			);
		}
	});

	test('a non-private file (mode 0644) is `unreadable`, never trusted', async () => {
		plant(JSON.stringify({ version: 1, hosts: {} }));
		chmodSync(file, 0o644);
		expect(await reasonOf(() => loadRuntimeAt(file))).toBe('unreadable');
		expect(await reasonOf(() => updateHostRuntimeAt(file, 'museum', probeOk))).toBe('unreadable');
	});

	test('an unreadable path (a directory) is `unreadable`, never an empty runtime', async () => {
		const asDir = join(dir, 'as_dir', RUNTIME_FILE_NAME);
		mkdirSync(asDir, { recursive: true });
		expect(await reasonOf(() => loadRuntimeAt(asDir))).toBe('unreadable');
	});

	test('the read AND the write are bounded: past RUNTIME_MAX_BYTES is too_large, file untouched', async () => {
		plant(`${' '.repeat(RUNTIME_MAX_BYTES)}{}`);
		expect(await reasonOf(() => loadRuntimeAt(file))).toBe('too_large');
		rmSync(file);
		await updateHostRuntimeAt(file, 'museum', probeOk);
		const before = readFileSync(file, 'utf8');
		const huge = (cur: HostRuntime): HostRuntime => ({
			...cur,
			media_copy: {
				...cur.media_copy,
				pending_deletions: [{ path: 'x'.repeat(RUNTIME_MAX_BYTES), since: 'now' }],
			},
		});
		expect(await reasonOf(() => updateHostRuntimeAt(file, 'museum', huge))).toBe('too_large');
		expect(readFileSync(file, 'utf8')).toBe(before);
	});

	test('a lock held elsewhere is refused as `locked` (bounded wait, never forever)', async () => {
		const child = Bun.spawn(
			[
				process.execPath,
				'-e',
				`import { writeSync } from 'node:fs';
				 import { withJsonFileLock } from ${JSON.stringify(join(REPO_ROOT, 'src/core/files/atomic_json.ts'))};
				 withJsonFileLock(${JSON.stringify(file)}, () => { writeSync(1, 'held\\n'); Bun.sleepSync(30000); });`,
			],
			{ stdout: 'pipe', stderr: 'pipe' },
		);
		try {
			await (child.stdout as ReadableStream<Uint8Array>).getReader().read();
			expect(await reasonOf(() => updateHostRuntimeAt(file, 'museum', probeOk))).toBe('locked');
			expect(readdirSync(dir)).toEqual([`${RUNTIME_FILE_NAME}.lock`]);
		} finally {
			child.kill('SIGKILL');
			await child.exited;
		}
	});

	test('remove drops only that host; removing an absent host writes nothing', async () => {
		await removeHostRuntimeAt(file, 'museum');
		expect(readdirSync(dir).filter((name) => name === RUNTIME_FILE_NAME)).toEqual([]);
		await updateHostRuntimeAt(file, 'museum', probeOk);
		await updateHostRuntimeAt(file, 'archive', probeOk);
		await removeHostRuntimeAt(file, 'museum');
		expect(Object.keys(await loadRuntimeAt(file))).toEqual(['archive']);
	});

	test('runtimePath sits beside the registry and the runtime-path census resolves to it', () => {
		expect(dirname(runtimePath())).toBe(dirname(registryPath()));
		expect(basename(runtimePath())).toBe(RUNTIME_FILE_NAME);
		const entry = RUNTIME_PATH_CENSUS.find(
			(candidate) => candidate.id === 'publication_hosts_runtime',
		);
		expect(entry, 'census entry publication_hosts_runtime missing').toBeDefined();
		expect(entry?.resolve()).toBe(runtimePath());
	});

	test('registry.ts and runtime.ts read, write and lock ONLY through the atomic_json kernel', () => {
		const RAW_IO =
			/\b(renameSync|fsyncSync|openSync|writeSync|writeFileSync|readSync|readBoundedSync|dlopen|flock)\b/g;
		// Anti-vacuity: the pattern does see the kernel's own raw I/O.
		const kernel = stripComments(
			readFileSync(join(REPO_ROOT, 'src/core/files/atomic_json.ts'), 'utf8'),
		);
		expect((kernel.match(RAW_IO) ?? []).length).toBeGreaterThan(4);
		for (const rel of [
			'src/core/publication_host/registry.ts',
			'src/core/publication_host/runtime.ts',
		]) {
			const code = stripComments(readFileSync(join(REPO_ROOT, rel), 'utf8'));
			expect(code, `${rel} must go through the shared kernel`).toContain(
				"from '../files/atomic_json.ts'",
			);
			expect(code.match(RAW_IO) ?? [], `${rel} touches a state file outside the kernel`).toEqual(
				[],
			);
		}
	});

	test('runtime.ts and atomic_json.ts make no call from the sync-I/O forbidden class, and runtime.ts never waits synchronously', () => {
		// The exact class test/unit/sync_io_on_request_path_tripwire.test.ts forbids on the
		// dispatch closure (whose ledger is shrink-only): pinned here, BEFORE a widget makes
		// runtime.ts reachable, so reachability can never red that gate.
		const FORBIDDEN =
			/\b(copyFileSync|cpSync|readFileSync|writeFileSync|appendFileSync|execSync|execFileSync|spawnSync|globSync|scanSync)\s*\(/g;
		// Anti-vacuity: the pattern does see a forbidden call.
		expect('const x = readFileSync(p);'.match(FORBIDDEN)).toHaveLength(1);
		for (const rel of ['src/core/files/atomic_json.ts', 'src/core/publication_host/runtime.ts']) {
			const code = stripComments(readFileSync(join(REPO_ROOT, rel), 'utf8'));
			expect(code.match(FORBIDDEN) ?? [], `${rel}: synchronous unbounded-byte I/O`).toEqual([]);
		}
		const runtime = stripComments(
			readFileSync(join(REPO_ROOT, 'src/core/publication_host/runtime.ts'), 'utf8'),
		);
		expect(runtime).toContain('withJsonFileLockAsync(');
		expect(runtime).toContain('readPrivateJsonText(');
		expect(runtime).not.toMatch(/\bwithJsonFileLock\(|\breadPrivateJsonTextSync\b|\bsleepSync\b/);
	});
});
