/**
 * Directory pre-flight (PHP installer check_directories). Verifies (and, when
 * `create` is true, creates) the writable directories a running TS server needs:
 * the private config dir, the session store's dir, the media root, and the
 * backups dir. Writability is proven by a write+unlink probe, not `access` bits
 * (PHP dir_is_writable parity — an NFS/ACL mount can lie about the bits).
 *
 * Response shape is the client contract: `{result, dirs:[{label,path,exists,
 * writable}]}` (render_installer.js renders one row per dir).
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../../config/config.ts';
import { installPrivateDir } from './paths.ts';

interface DirReport {
	label: string;
	path: string;
	exists: boolean;
	writable: boolean;
}

/** The directories the installer manages, with human labels. */
function targetDirs(): { label: string; path: string }[] {
	const dir = installPrivateDir();
	const dirs: { label: string; path: string }[] = [
		{ label: 'Private config', path: dir },
		{ label: 'Sessions', path: join(dir, 'sessions') },
		{ label: 'Backups', path: config.ops.backupDir ?? join(dir, 'backups', 'db') },
	];
	if (config.media.rootPath !== null) {
		dirs.push({ label: 'Media', path: config.media.rootPath });
	}
	return dirs;
}

/** Prove writability by writing+deleting a probe file (PHP dir_is_writable). */
function dirIsWritable(dir: string): boolean {
	if (!existsSync(dir)) return false;
	const probe = join(dir, `.dedalo_write_test_${process.pid}`);
	try {
		writeFileSync(probe, '');
		rmSync(probe, { force: true });
		return true;
	} catch {
		return false;
	}
}

export interface CheckDirectoriesResult {
	result: boolean;
	dirs: DirReport[];
	msg: string;
}

/** Verify (optionally create) the install directories. */
export function checkDirectories(options: { create: boolean }): CheckDirectoriesResult {
	const reports: DirReport[] = [];
	for (const { label, path } of targetDirs()) {
		if (options.create && !existsSync(path)) {
			try {
				mkdirSync(path, { recursive: true, mode: 0o750 });
			} catch {
				// fall through — the report below records exists:false
			}
		}
		const exists = existsSync(path);
		reports.push({ label, path, exists, writable: exists && dirIsWritable(path) });
	}
	const result = reports.every((report) => report.exists && report.writable);
	return {
		result,
		dirs: reports,
		msg: result ? 'All directories present and writable' : 'One or more directories need attention',
	};
}
