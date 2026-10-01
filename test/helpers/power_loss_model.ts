/**
 * WHAT SURVIVES A POWER CUT — a model of the page cache, driven by the real
 * filesystem calls a writer makes.
 *
 * A process kill cannot test durability: the page cache outlives the process,
 * so a `writeFileSync` + `renameSync` with no fsync looks perfectly durable to
 * any kill -9 gate. A power cut (or a kernel crash) keeps only what was forced
 * to disk. This model spies the synchronous `node:fs` calls and answers, at any
 * instant, the question a power cut would:
 *
 *   - a file's BYTES are durable once an fd of that file was fsynced after the
 *     last write that reached it (an fsync covers every earlier write, through
 *     any descriptor);
 *   - a DIRECTORY ENTRY (a creation, a rename's source and target, an unlink,
 *     a mkdir) is durable once its directory was fsynced after the change;
 *   - a path survives with its bytes when its bytes are durable AND every entry
 *     on its way up to `root` is.
 *
 * CONSERVATIVE BY CONSTRUCTION: what the model did not SEE is never proven.
 * Bytes written through a door it does not spy (a `fs/promises` FileHandle, a
 * `Bun.file().writer()`) are unknown until a spied fsync of that file covers
 * them; a rename it did not see leaves the target unknown; an absence it did
 * not see unlinked is not a durable absence; an entry that was not there when
 * the model started and that no spied directory fsync covered (a directory
 * some unseen door created) is not durable. So a gate built on it can be
 * defeated only by a writer that fsyncs, never by one that does not.
 *
 * `restore()` MUST run (finally): the spies replace node:fs exports for the
 * whole process.
 */

import { spyOn } from 'bun:test';
import * as nodeFs from 'node:fs';
import { dirname, resolve } from 'node:path';

type Bytes = 'durable' | 'volatile';

export interface PowerLossModel {
	/** `path` survives a power cut NOW, holding the bytes last written to it. */
	survives(path: string): boolean;
	/** `path` was unlinked (seen by the model) and stays absent after a power cut NOW. */
	absenceSurvives(path: string): boolean;
	/** Why `path` would not survive (for the assertion message). */
	explain(path: string): string;
	/** Register a check run at every spied unlink, BEFORE the unlink happens. */
	beforeUnlink(check: (path: string) => void): void;
	/** What the model saw (a gate asserts it is non-vacuous). */
	readonly seen: { writes: number; fsyncs: number; renames: number; unlinks: number };
	/** Put the real node:fs back. */
	restore(): void;
}

/** True when an open flag writes (string 'w'/'a'/'+' forms, or O_WRONLY/O_RDWR). */
function writesWith(flags: unknown): boolean {
	if (typeof flags === 'number') {
		return (flags & (nodeFs.constants.O_WRONLY | nodeFs.constants.O_RDWR)) !== 0;
	}
	if (typeof flags !== 'string') return false;
	return /[wa+]/.test(flags);
}

/** True when an open flag truncates (`w`, `w+`, O_TRUNC). */
function truncatesWith(flags: unknown): boolean {
	if (typeof flags === 'number') return (flags & nodeFs.constants.O_TRUNC) !== 0;
	return typeof flags === 'string' && flags.startsWith('w');
}

/**
 * Model every file under `root` (absolute). Paths outside it are ignored —
 * a test's own fixtures elsewhere do not pollute the answer.
 */
export function startPowerLossModel(root: string): PowerLossModel {
	const top = resolve(root);
	const inScope = (path: string): boolean => path === top || path.startsWith(`${top}/`);
	const bytes = new Map<string, Bytes>();
	const dirtyEntries = new Set<string>();
	/** Every entry under `top` when the model started (durable by assumption: it predates the test). */
	const initialEntries = new Set<string>();
	/** Entries a spied directory fsync made durable after their last seen change. */
	const cleanEntries = new Set<string>();
	const walk = (dir: string): void => {
		for (const entry of nodeFs.readdirSync(dir, { withFileTypes: true })) {
			const path = `${dir}/${entry.name}`;
			initialEntries.add(path);
			if (entry.isDirectory()) walk(path);
		}
	};
	if (nodeFs.existsSync(top)) walk(top);
	const unlinked = new Set<string>();
	const fdPath = new Map<number, string>();
	const unlinkChecks: ((path: string) => void)[] = [];
	const seen = { writes: 0, fsyncs: 0, renames: 0, unlinks: 0 };

	const real = {
		openSync: nodeFs.openSync,
		closeSync: nodeFs.closeSync,
		writeSync: nodeFs.writeSync,
		writeFileSync: nodeFs.writeFileSync,
		fsyncSync: nodeFs.fsyncSync,
		renameSync: nodeFs.renameSync,
		unlinkSync: nodeFs.unlinkSync,
		mkdirSync: nodeFs.mkdirSync,
	};

	const entryChanged = (path: string): void => {
		if (!inScope(path)) return;
		dirtyEntries.add(path);
		cleanEntries.delete(path);
	};
	const bytesWritten = (path: string | undefined): void => {
		if (path === undefined || !inScope(path)) return;
		bytes.set(path, 'volatile');
		seen.writes++;
	};

	const spies = [
		spyOn(nodeFs, 'openSync').mockImplementation(((...args: Parameters<typeof nodeFs.openSync>) => {
			const path = resolve(String(args[0]));
			const existed = nodeFs.existsSync(path);
			const fd = real.openSync(...args);
			if (!inScope(path)) return fd;
			fdPath.set(fd, path);
			if (!existed) {
				entryChanged(path);
				bytes.set(path, 'volatile');
			} else if (writesWith(args[1]) && truncatesWith(args[1])) {
				bytes.set(path, 'volatile');
			}
			unlinked.delete(path);
			return fd;
		}) as typeof nodeFs.openSync),
		spyOn(nodeFs, 'closeSync').mockImplementation(((fd: number) => {
			fdPath.delete(fd);
			return real.closeSync(fd);
		}) as typeof nodeFs.closeSync),
		spyOn(nodeFs, 'writeSync').mockImplementation(((fd: number, ...rest: unknown[]) => {
			bytesWritten(fdPath.get(fd));
			return (real.writeSync as (...a: unknown[]) => number)(fd, ...rest);
		}) as typeof nodeFs.writeSync),
		spyOn(nodeFs, 'writeFileSync').mockImplementation(((target: unknown, ...rest: unknown[]) => {
			if (typeof target === 'number') bytesWritten(fdPath.get(target));
			else {
				const path = resolve(String(target));
				if (inScope(path) && !nodeFs.existsSync(path)) entryChanged(path);
				unlinked.delete(path);
				bytesWritten(path);
			}
			return (real.writeFileSync as (...a: unknown[]) => void)(target, ...rest);
		}) as typeof nodeFs.writeFileSync),
		spyOn(nodeFs, 'fsyncSync').mockImplementation(((fd: number) => {
			const result = real.fsyncSync(fd);
			const path = fdPath.get(fd);
			if (path !== undefined) {
				seen.fsyncs++;
				if (nodeFs.statSync(path).isDirectory()) {
					for (const entry of [...dirtyEntries]) {
						if (dirname(entry) !== path) continue;
						dirtyEntries.delete(entry);
						cleanEntries.add(entry);
					}
				} else {
					bytes.set(path, 'durable');
				}
			}
			return result;
		}) as typeof nodeFs.fsyncSync),
		spyOn(nodeFs, 'renameSync').mockImplementation(((from: unknown, to: unknown) => {
			const source = resolve(String(from));
			const target = resolve(String(to));
			real.renameSync(source, target);
			seen.renames++;
			// The target takes the source's bytes; a source the model never saw is unproven.
			if (inScope(target)) bytes.set(target, bytes.get(source) ?? 'volatile');
			bytes.delete(source);
			entryChanged(source);
			entryChanged(target);
			unlinked.delete(target);
		}) as typeof nodeFs.renameSync),
		spyOn(nodeFs, 'unlinkSync').mockImplementation(((target: unknown) => {
			const path = resolve(String(target));
			if (inScope(path)) for (const check of unlinkChecks) check(path);
			real.unlinkSync(path);
			seen.unlinks++;
			bytes.delete(path);
			entryChanged(path);
			if (inScope(path)) unlinked.add(path);
		}) as typeof nodeFs.unlinkSync),
		spyOn(nodeFs, 'mkdirSync').mockImplementation(((
			target: unknown,
			options?: nodeFs.MakeDirectoryOptions,
		) => {
			const path = resolve(String(target));
			const existed = nodeFs.existsSync(path);
			const first = (real.mkdirSync as (...a: unknown[]) => string | undefined)(target, options);
			if (first !== undefined) {
				// Every level from the first created one down to `path` is a new entry.
				const stop = dirname(resolve(first));
				for (let level = path; level !== stop && level !== dirname(level); level = dirname(level)) {
					entryChanged(level);
				}
			} else if (!existed) {
				entryChanged(path);
			}
			return first;
		}) as typeof nodeFs.mkdirSync),
	];

	/** The first entry on the way up to `top` a power cut could take back, or null. */
	const entryChainClean = (path: string): string | null => {
		for (let level = path; level !== top && inScope(level); level = dirname(level)) {
			if (dirtyEntries.has(level)) return level;
			if (!initialEntries.has(level) && !cleanEntries.has(level)) return level;
		}
		return null;
	};

	return {
		survives(path) {
			const absolute = resolve(path);
			return bytes.get(absolute) === 'durable' && entryChainClean(absolute) === null;
		},
		absenceSurvives(path) {
			const absolute = resolve(path);
			return unlinked.has(absolute) && !nodeFs.existsSync(absolute) && !dirtyEntries.has(absolute);
		},
		explain(path) {
			const absolute = resolve(path);
			const state = bytes.get(absolute);
			if (state === undefined) return `${absolute}: the model never saw its bytes land (unproven)`;
			if (state === 'volatile')
				return `${absolute}: its bytes were never fsynced after the last write`;
			const dirty = entryChainClean(absolute);
			if (dirty !== null) {
				return `${absolute}: the directory entry of ${dirty} was never made durable (no fsync of ${dirname(dirty)} after it appeared)`;
			}
			return `${absolute}: durable`;
		},
		beforeUnlink(check) {
			unlinkChecks.push(check);
		},
		seen,
		restore() {
			for (const spy of spies) spy.mockRestore();
		},
	};
}
