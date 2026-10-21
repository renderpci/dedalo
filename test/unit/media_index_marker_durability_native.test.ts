/**
 * THE MEDIA MARKER STORE IS DURABLE BEFORE A DOOR ANSWERS (closure review
 * cross-diffusion:r3; WC-2026-10-21-unpublish-markers-durable).
 *
 * THE FINDING. A record deleted from the archive: the delete door DELETEs its
 * MariaDB rows, applyTableState unlinks `dbs/<db>/<table>/K` and `pub/K`, and
 * the dd1758 row flips to 'unpublished' on that answer. The unlinks were bare
 * `fs.unlink` calls with no directory fsync: a power cut before the kernel
 * flushed the entries brought both back, the boot reconcile re-derived `pub/K`
 * from the resurrected `dbs/…/K`, and the media of a withdrawn record was
 * anonymously readable again — with nothing left to retry it.
 *
 * THE MODEL. A process kill cannot test this (the page cache outlives the
 * process), so the gate records what a power cut would keep: every marker
 * created or unlinked through the store's `fs.promises` calls, and every
 * DIRECTORY fsync (durable.ts opens the directory, then fsyncs the fd). A
 * change survives once its directory was fsynced AFTER it. Conservative: a
 * change the recorder did not see is never proven, and only an fsync can make
 * one durable.
 *
 * WHAT IS ASSERTED — at the instant each door ANSWERS (and the instant the pub/
 * transition seam hears a flip), every marker change it made is durable:
 *   (a) applyTableState unpublish — `dbs/…/K` and `pub/K`;
 *   (b) the record-delete executor confirms the target only with both durable,
 *       and (c) a marker it cannot withdraw keeps the target PENDING (errors,
 *       not deleted) — media still served is never reported unpublished;
 *   (d) the reconcile apply — the stray it unlinks and the marker it adds;
 *   (e) the rebuild — the diff-sync's unlink and the stale table it removes.
 *
 * WRITES: a temp marker store (the module's guarded seam) only. MariaDB: the
 * lane's suite server, a table never created (errno 1146), no row touched.
 * Postgres: the delete door's advisory lock, released.
 */

import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	spyOn,
	test,
} from 'bun:test';
import * as nodeFs from 'node:fs';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { closeAllTargetPools } from '../../src/diffusion/targets/mariadb/db.ts';
import { executeSqlDeleteTargets } from '../../src/diffusion/targets/mariadb/delete_record.ts';
import {
	applyTableState,
	overrideMediaIndexBaseForTests,
	rebuildMediaIndexStore,
	reconcileMediaIndex,
} from '../../src/diffusion/targets/mediastore/media_index.ts';
import { registerPubTransitionSink } from '../../src/diffusion/targets/mediastore/pub_transitions.ts';
import { requireSuiteMariadb } from '../helpers/suite_mariadb.ts';
import { zzdTargetDatabases } from '../helpers/zzd_diffusion_fixture.ts';

const TIPO = 'zzmdur1';
const DB = 'zzmdur_db';
const TABLE = 'zzmdur_t';

let base: string;

beforeEach(() => {
	base = mkdtempSync(join(tmpdir(), 'dedalo_marker_durability_'));
	overrideMediaIndexBaseForTests(base);
});

afterEach(() => {
	overrideMediaIndexBaseForTests(null);
	rmSync(base, { recursive: true, force: true });
});

function plant(relative: string): string {
	const path = join(base, relative);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, '');
	return path;
}

interface Recorder {
	/** Every marker-store path the door changed (created, unlinked, removed). */
	changed(): string[];
	/** `path`'s last change is covered by a later fsync of its directory. */
	durable(path: string): boolean;
	/** Paths whose last change no fsync covered yet. */
	volatile(): string[];
	restore(): void;
}

/**
 * Record the store's changes and the directory fsyncs after them. The spies
 * pass every call through to the real filesystem.
 */
function recordDurability(failUnlink?: (path: string) => boolean): Recorder {
	let clock = 0;
	const lastChange = new Map<string, number>();
	const lastDirSync = new Map<string, number>();
	const fdPath = new Map<number, string>();
	const inStore = (path: string): boolean => resolve(path).startsWith(`${resolve(base)}/`);
	const change = (path: unknown): void => {
		const absolute = resolve(String(path));
		if (inStore(absolute)) lastChange.set(absolute, ++clock);
	};
	const real = {
		unlink: nodeFs.promises.unlink.bind(nodeFs.promises),
		writeFile: nodeFs.promises.writeFile.bind(nodeFs.promises),
		mkdir: nodeFs.promises.mkdir.bind(nodeFs.promises),
		rm: nodeFs.promises.rm.bind(nodeFs.promises),
		openSync: nodeFs.openSync,
		fsyncSync: nodeFs.fsyncSync,
	};
	const spies = [
		spyOn(nodeFs.promises, 'unlink').mockImplementation((async (target: nodeFs.PathLike) => {
			if (failUnlink?.(String(target)) === true) {
				throw Object.assign(new Error(`EACCES: permission denied, unlink '${target}'`), {
					code: 'EACCES',
				});
			}
			await real.unlink(target);
			change(target);
		}) as typeof nodeFs.promises.unlink),
		spyOn(nodeFs.promises, 'writeFile').mockImplementation((async (...args: unknown[]) => {
			await (real.writeFile as (...a: unknown[]) => Promise<void>)(...args);
			change(args[0]);
		}) as typeof nodeFs.promises.writeFile),
		spyOn(nodeFs.promises, 'mkdir').mockImplementation((async (...args: unknown[]) => {
			const first = await (real.mkdir as (...a: unknown[]) => Promise<string | undefined>)(...args);
			if (first !== undefined) {
				for (
					let level = resolve(String(args[0]));
					level !== dirname(resolve(first));
					level = dirname(level)
				) {
					change(level);
				}
			}
			return first;
		}) as typeof nodeFs.promises.mkdir),
		spyOn(nodeFs.promises, 'rm').mockImplementation((async (...args: unknown[]) => {
			await (real.rm as (...a: unknown[]) => Promise<void>)(...args);
			change(args[0]);
		}) as typeof nodeFs.promises.rm),
		spyOn(nodeFs, 'openSync').mockImplementation(((...args: Parameters<typeof nodeFs.openSync>) => {
			const fd = real.openSync(...args);
			fdPath.set(fd, resolve(String(args[0])));
			return fd;
		}) as typeof nodeFs.openSync),
		spyOn(nodeFs, 'fsyncSync').mockImplementation(((fd: number) => {
			real.fsyncSync(fd);
			const path = fdPath.get(fd);
			if (path !== undefined && nodeFs.statSync(path).isDirectory()) lastDirSync.set(path, ++clock);
		}) as typeof nodeFs.fsyncSync),
	];
	const durable = (path: string): boolean => {
		const absolute = resolve(path);
		const changed = lastChange.get(absolute);
		if (changed === undefined) return false; // never seen: not proven
		return (lastDirSync.get(dirname(absolute)) ?? 0) > changed;
	};
	return {
		changed: () => [...lastChange.keys()].sort(),
		durable,
		volatile: () => [...lastChange.keys()].filter((path) => !durable(path)).sort(),
		restore() {
			for (const spy of spies) spy.mockRestore();
		},
	};
}

describe('(a) applyTableState — an unpublish is durable when it returns', () => {
	test('dbs/<db>/<table>/K and pub/K are unlinked AND their directories fsynced before the answer', async () => {
		const dbsMarker = plant(`dbs/${DB}/${TABLE}/${TIPO}_1`);
		const pubMarker = plant(`pub/${TIPO}_1`);
		const recorder = recordDurability();
		try {
			const result = await applyTableState(DB, TABLE, TIPO, [], [1]);
			expect(result.applied).toBe(1);
			expect(nodeFs.existsSync(dbsMarker) || nodeFs.existsSync(pubMarker)).toBe(false);
			expect(recorder.changed()).toEqual([dbsMarker, pubMarker].sort());
			expect(
				recorder.volatile(),
				'an unlink a power cut can take back: dbs/…/K returns, the boot reconcile re-derives pub/K, the withdrawn media is public again',
			).toEqual([]);
		} finally {
			recorder.restore();
		}
	});

	test('a publish is durable too, new directory levels included', async () => {
		const recorder = recordDurability();
		try {
			await applyTableState(DB, TABLE, TIPO, [2], []);
			const changed = recorder.changed();
			expect(changed).toContain(join(base, 'dbs', DB, TABLE, `${TIPO}_2`));
			expect(changed).toContain(join(base, 'pub', `${TIPO}_2`));
			expect(changed).toContain(join(base, 'dbs', DB));
			expect(recorder.volatile()).toEqual([]);
		} finally {
			recorder.restore();
		}
	});

	test('the pub/ transition seam hears the flip only once it is durable', async () => {
		plant(`dbs/${DB}/${TABLE}/${TIPO}_3`);
		const pubMarker = plant(`pub/${TIPO}_3`);
		const recorder = recordDurability();
		const heard: { key: string; published: boolean; durable: boolean }[] = [];
		const unregister = registerPubTransitionSink((key, published) => {
			heard.push({ key, published, durable: recorder.durable(pubMarker) });
		});
		try {
			await applyTableState(DB, TABLE, TIPO, [], [3]);
			expect(heard).toEqual([{ key: `${TIPO}_3`, published: false, durable: true }]);
		} finally {
			unregister();
			recorder.restore();
		}
	});
});

describe('(b)(c) the record-delete executor confirms only a durable withdrawal', () => {
	let database: string;
	// A table never created on a suite target: errno 1146, the idempotent branch —
	// the executor goes on to withdraw the markers, no MariaDB row is touched.
	const MISSING_TABLE = 'zzmdur_never_created';

	beforeAll(async () => {
		database = zzdTargetDatabases()[0] as string;
		await requireSuiteMariadb(import.meta.path, [database]);
	}, 120_000);

	afterAll(async () => {
		await closeAllTargetPools();
	});

	test('(b) confirmed ⇒ both markers are gone and durable at the answer', async () => {
		const dbsMarker = plant(`dbs/${database}/${MISSING_TABLE}/${TIPO}_4`);
		const pubMarker = plant(`pub/${TIPO}_4`);
		const recorder = recordDurability();
		const warn = spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const result = await executeSqlDeleteTargets([
				{
					database_name: database,
					table_name: MISSING_TABLE,
					section_ids: [4],
					section_tipo: TIPO,
				},
			]);
			expect(result.errors).toEqual([]);
			expect(result.deleted).toEqual([`${database}|${MISSING_TABLE}`]);
			expect(recorder.changed()).toEqual([dbsMarker, pubMarker].sort());
			expect(
				recorder.volatile(),
				'dd1758 would flip to unpublished over an unlink a power cut takes back',
			).toEqual([]);
		} finally {
			warn.mockRestore();
			recorder.restore();
		}
	});

	test('(c) a marker it cannot withdraw keeps the target PENDING, never "unpublished"', async () => {
		const dbsMarker = plant(`dbs/${database}/${MISSING_TABLE}/${TIPO}_5`);
		plant(`pub/${TIPO}_5`);
		const recorder = recordDurability((path) => resolve(path) === dbsMarker);
		const warn = spyOn(console, 'warn').mockImplementation(() => {});
		const error = spyOn(console, 'error').mockImplementation(() => {});
		try {
			const result = await executeSqlDeleteTargets([
				{
					database_name: database,
					table_name: MISSING_TABLE,
					section_ids: [5],
					section_tipo: TIPO,
				},
			]);
			expect(result.deleted).toEqual([]);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toContain(
				`${database}|${MISSING_TABLE}: media markers not withdrawn`,
			);
			expect(nodeFs.existsSync(join(base, 'pub', `${TIPO}_5`))).toBe(true); // still served
		} finally {
			error.mockRestore();
			warn.mockRestore();
			recorder.restore();
		}
	});
});

describe('(d)(e) the reconcile apply and the rebuild are durable before they answer', () => {
	test('(d) reconcile: the stray it unlinks and the marker it adds are durable', async () => {
		plant(`dbs/${DB}/${TABLE}/${TIPO}_6`);
		const stray = plant(`pub/${TIPO}_7`);
		const recorder = recordDurability();
		try {
			expect(await reconcileMediaIndex()).toEqual({ added: 1, removed: 1 });
			expect(recorder.changed()).toEqual([join(base, 'pub', `${TIPO}_6`), stray].sort());
			expect(recorder.volatile()).toEqual([]);
		} finally {
			recorder.restore();
		}
	});

	test('(e) rebuild: the diff-sync unlink and the stale table removal are durable', async () => {
		const unpublished = plant(`dbs/${DB}/${TABLE}/${TIPO}_8`);
		const staleTable = join(base, 'dbs', DB, 'zzmdur_stale');
		plant(`dbs/${DB}/zzmdur_stale/${TIPO}_9`);
		const recorder = recordDurability();
		try {
			const report = await rebuildMediaIndexStore(
				[{ database_name: DB, table_name: TABLE, section_tipo: TIPO }],
				async () => [],
			);
			expect(report.ok).toBe(true);
			const changed = recorder.changed();
			expect(changed).toContain(unpublished);
			expect(changed).toContain(staleTable);
			expect(recorder.volatile()).toEqual([]);
		} finally {
			recorder.restore();
		}
	});
});
