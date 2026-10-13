/**
 * THE HOST STEPS' FILESYSTEM (terminal installer phase 4, 2026-10-12) — every
 * file a host step reads, writes, creates or removes goes through a HostFs,
 * whose ROOT is `/` on a real host and a marked scratch directory in a gate or
 * a drill (host/scratch.ts): `/etc/nginx/conf.d/x.conf` is then
 * `<root>/etc/nginx/conf.d/x.conf`, and nothing outside the root is touched.
 *
 *  - WRITES ARE ATOMIC: `<file>.tmp.<pid>` created exclusively at the final
 *    mode, fsync, rename — a reader (nginx, systemd) sees the old file or the
 *    new one, never half of one.
 *  - MODE AND OWNER BY DESCRIPTOR: a file gets its mode and owner through the
 *    open fd (fchmod/fchown) BEFORE the rename, a directory through an fd
 *    opened O_DIRECTORY|O_NOFOLLOW — never by path after the fact, where a
 *    swapped-in symlink would redirect root's chown onto another file.
 *  - NO SYMLINK IS FOLLOWED: a path (or any parent under the root) that is a
 *    symbolic link is refused, so a planted link cannot redirect a root write.
 *  - OWNERS BY NAME: resolved from `<root>/etc/passwd` and `<root>/etc/group`
 *    (the instance user is a local one this install created). A scratch root
 *    records owners in a sidecar (`<marker>/owners.json`) instead of chown —
 *    a gate asserts them there, and a non-root gate run can.
 */

import { createHash } from 'node:crypto';
import {
	closeSync,
	constants,
	existsSync,
	fchmodSync,
	fchownSync,
	fsyncSync,
	lstatSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmdirSync,
	rmSync,
	writeFileSync,
	writeSync,
} from 'node:fs';
import { userInfo } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { hostRefuse } from './refuse.ts';

export interface HostStat {
	mode: number;
	owner: string;
	group: string;
	isDirectory: boolean;
	isFile: boolean;
	/** The path itself is a symbolic link (lstat — never followed). */
	isSymlink: boolean;
	mtimeMs: number;
}

export interface HostFs {
	/** '' on a real host; the scratch root otherwise. */
	readonly root: string;
	/** The real path of a host path. */
	real(path: string): string;
	exists(path: string): boolean;
	readText(path: string): string | null;
	/** sha256 hex of the file's BYTES, or null when it cannot be read. */
	sha256(path: string): string | null;
	stat(path: string): HostStat | null;
	/** Atomic write at `mode`, owned `owner:group`. */
	write(path: string, content: string, mode: number, owner: string, group: string): void;
	/** Create (or fix the mode/owner of) a directory; answers whether it was created. */
	mkdir(path: string, mode: number, owner: string, group: string): boolean;
	remove(path: string): void;
	/** Remove a directory only when empty; answers whether it was removed. */
	rmdirIfEmpty(path: string): boolean;
	list(path: string): string[];
}

/** sha256 hex of a text. */
export function sha256Text(text: string): string {
	return createHash('sha256').update(text).digest('hex');
}

/** A `name:x:<id>:…` table (passwd/group) → name → numeric id. */
function idTable(text: string | null): Map<string, number> {
	const table = new Map<string, number>();
	for (const line of (text ?? '').split('\n')) {
		const [name, , id] = line.split(':');
		if (name && id !== undefined && /^\d+$/.test(id)) table.set(name, Number(id));
	}
	return table;
}

/** The numeric owner of `name` in `file`, or refuse (an unknown name is never guessed). */
function numericId(fs: HostFs, file: string, name: string): number {
	const id = idTable(fs.readText(file)).get(name);
	if (id === undefined) {
		hostRefuse('install.step_failed', `${name} is not in ${file} — cannot set an owner by name`);
	}
	return id as number;
}

/** The name of numeric `id` in `file` (or the number as text). */
function nameOf(fs: HostFs, file: string, id: number): string {
	for (const [name, value] of idTable(fs.readText(file))) if (value === id) return name;
	return String(id);
}

/** The owners sidecar of a scratch root. */
interface OwnerBook {
	get(path: string): { owner: string; group: string } | null;
	set(path: string, owner: string, group: string): void;
	drop(path: string): void;
}

function sidecarOwners(file: string): OwnerBook {
	const load = (): Record<string, string> =>
		existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>) : {};
	const save = (book: Record<string, string>) =>
		writeFileSync(file, `${JSON.stringify(book, null, '\t')}\n`, { mode: 0o600 });
	return {
		get: (path) => {
			const entry = load()[path];
			if (entry === undefined) return null;
			const [owner = 'root', group = 'root'] = entry.split(':');
			return { owner, group };
		},
		set: (path, owner, group) => save({ ...load(), [path]: `${owner}:${group}` }),
		drop: (path) => {
			const book = load();
			delete book[path];
			save(book);
		},
	};
}

/** Refuse when `real` or any parent below the root is a symbolic link. */
function assertNoSymlink(root: string, real: string): void {
	for (let probe = real; probe.length > root.length; probe = dirname(probe)) {
		if (existsSync(probe) && lstatSync(probe).isSymbolicLink()) {
			hostRefuse(
				'install.state_conflict',
				`${probe} is a symbolic link — the installer never writes through one`,
			);
		}
		if (dirname(probe) === probe) return;
	}
}

/** Numeric owner ids (null: a scratch root — the sidecar records the names). */
type OwnerIds = { uid: number; gid: number } | null;

/** Write `content` atomically at `mode` (tmp + fsync + fchmod/fchown on the fd + rename). */
function atomicWrite(real: string, content: string, mode: number, ids: OwnerIds): void {
	const tmp = `${real}.tmp.${process.pid}`;
	rmSync(tmp, { force: true });
	const fd = openSync(
		tmp,
		constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
		mode,
	);
	try {
		writeSync(fd, content);
		fsyncSync(fd);
		fchmodSync(fd, mode);
		if (ids !== null) fchownSync(fd, ids.uid, ids.gid);
	} finally {
		closeSync(fd);
	}
	renameSync(tmp, real);
}

/** Set a directory's mode (and owner) through an fd that never follows a symlink. */
function fixDirectory(real: string, mode: number, ids: OwnerIds): void {
	const fd = openSync(real, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
	try {
		fchmodSync(fd, mode);
		if (ids !== null) fchownSync(fd, ids.uid, ids.gid);
	} finally {
		closeSync(fd);
	}
}

/**
 * A HostFs over `root` ('' = the real `/`). `ownersFile` given = a scratch
 * root: owners go to that sidecar instead of chown.
 */
export function hostFs(root: string, ownersFile?: string): HostFs {
	const base = root === '' ? '' : resolve(root);
	const book = ownersFile === undefined ? null : sidecarOwners(ownersFile);
	const real = (path: string): string => (base === '' ? path : join(base, path));
	const fs: HostFs = {
		root: base,
		real,
		exists: (path) => existsSync(real(path)),
		readText: (path) => {
			try {
				return readFileSync(real(path), 'utf8');
			} catch {
				return null;
			}
		},
		sha256: (path) => {
			try {
				return createHash('sha256')
					.update(readFileSync(real(path)))
					.digest('hex');
			} catch {
				return null;
			}
		},
		stat: (path) => statOf(fs, book, path),
		write: (path, content, mode, owner, group) => {
			assertNoSymlink(base, real(path));
			mkdirSync(dirname(real(path)), { recursive: true });
			atomicWrite(real(path), content, mode, ownerIds(fs, book, owner, group));
			book?.set(path, owner, group);
		},
		mkdir: (path, mode, owner, group) => {
			assertNoSymlink(base, real(path));
			const created = !existsSync(real(path));
			mkdirSync(real(path), { recursive: true, mode });
			fixDirectory(real(path), mode, ownerIds(fs, book, owner, group));
			book?.set(path, owner, group);
			return created;
		},
		remove: (path) => {
			assertNoSymlink(base, dirname(real(path)));
			rmSync(real(path), { force: true });
			book?.drop(path);
		},
		rmdirIfEmpty: (path) => {
			try {
				if (readdirSync(real(path)).length > 0) return false;
				rmdirSync(real(path));
				book?.drop(path);
				return true;
			} catch {
				return false;
			}
		},
		list: (path) => {
			try {
				return readdirSync(real(path)).sort();
			} catch {
				return [];
			}
		},
	};
	return fs;
}

/**
 * The numeric ids of `owner:group` on a real root (null on a scratch root: the
 * sidecar records names — and null for an unprivileged process writing as
 * ITSELF: what it creates is already its own, and macOS keeps its accounts in
 * Directory Services, not /etc/passwd — the docker/trial operator on a Mac).
 */
function ownerIds(fs: HostFs, book: OwnerBook | null, owner: string, group: string): OwnerIds {
	if (book !== null) return null;
	if (process.getuid?.() !== 0 && owner === userInfo().username) return null;
	return { uid: numericId(fs, '/etc/passwd', owner), gid: numericId(fs, '/etc/group', group) };
}

/** The owner names of a real path's numeric ids (a scratch root without a record: root). */
function ownerNames(
	fs: HostFs,
	book: OwnerBook | null,
	ids: { uid: number; gid: number },
): { owner: string; group: string } {
	if (book !== null) return { owner: 'root', group: 'root' };
	return { owner: nameOf(fs, '/etc/passwd', ids.uid), group: nameOf(fs, '/etc/group', ids.gid) };
}

/** A path's mode and owner (the sidecar's on a scratch root). */
function statOf(fs: HostFs, book: OwnerBook | null, path: string): HostStat | null {
	let stats: ReturnType<typeof lstatSync>;
	try {
		stats = lstatSync(fs.real(path));
	} catch {
		return null;
	}
	const owners = book?.get(path) ?? ownerNames(fs, book, stats);
	return {
		mode: stats.mode & 0o7777,
		owner: owners.owner,
		group: owners.group,
		isDirectory: stats.isDirectory(),
		isFile: stats.isFile(),
		isSymlink: stats.isSymbolicLink(),
		mtimeMs: stats.mtimeMs,
	};
}

/** Is `path` (a host path) inside `dir` (a host path)? */
export function isInside(dir: string, path: string): boolean {
	const rel = relative(resolve(dir), resolve(path));
	return rel === '' || (!rel.startsWith('..') && !rel.startsWith('/'));
}
