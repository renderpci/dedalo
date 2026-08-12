/**
 * Directory write PROBE — the one implementation of "can this process really
 * write here", shared by the installer's `checkDirectories` and the media-tree
 * provisioner.
 *
 * Writability is proven by a write+unlink probe, NOT by `access` bits: PHP's
 * `dir_is_writable` did the same, because an NFS/ACL mount can advertise bits it
 * will not honour, and Dédalo's media root is very often exactly such a mount.
 *
 * PHP's `dd_init_test` proved the same property by creating a literal `test`
 * SUBDIRECTORY inside the upload-tmp and import folders — and never removing it,
 * so every v6 install carries `media/import/test` and
 * `media/upload/service_upload/tmp/test` forever. The probe here is equivalent
 * (it exercises inode creation in the same directory) but leaves no residue.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Remove a probe artefact. THE ONE removal in this module, and the reason
 * `dirIsWritable` below can honestly call itself non-throwing.
 *
 * A bare `rmSync` is not safe in a `finally`. `force:true` swallows ENOENT and
 * NOTHING else, so an EACCES/EPERM/EROFS unlink — a read-only remount landing
 * between the write and the unlink, an NFS server that revoked the delegation, a
 * directory whose write bit was taken away mid-probe — escapes the `finally` and
 * REPLACES the function's return value with an exception. Every caller is built
 * on the opposite contract: `checkDirectories` turns a false into one
 * operator-facing row and `provisionMediaTree` into one problem among fifty, so
 * that a single bad directory never hides the rest. A throw there aborts the
 * whole pass at the first one.
 *
 * A failed removal is NOT silent. Residue is precisely what this module exists
 * to avoid, so the operator is told the exact path to delete and that it is not
 * Dédalo data. It is logged, never raised: the probe reports, it never decides.
 */
export function removeProbe(path: string, options: { recursive?: boolean } = {}): void {
	try {
		rmSync(path, { recursive: options.recursive === true, force: true });
	} catch (error) {
		console.warn(
			`[dir probe] could not remove the write probe '${path}' — it is scaffolding, not ` +
				`Dédalo data; delete it by hand. Cause: ${(error as Error).message}`,
		);
	}
}

/**
 * Can this process create an entry inside `dir`? Non-throwing: the caller
 * reports the failure, it is never an exception path.
 *
 * `deep` additionally proves a SUBDIRECTORY can be created (PHP's two-level
 * check for the upload staging and import landing zones): a directory can be
 * file-writable while a read-only remount or a restrictive ACL still refuses
 * `mkdir`.
 */
export function dirIsWritable(dir: string, options: { deep?: boolean } = {}): boolean {
	const probe = join(dir, `.dedalo_write_test_${process.pid}_${Date.now()}`);
	try {
		writeFileSync(probe, '');
	} catch {
		return false;
	} finally {
		removeProbe(probe);
	}
	if (options.deep !== true) return true;
	let probeDir: string | null = null;
	try {
		probeDir = mkdtempSync(join(dir, '.dedalo_mkdir_test_'));
		return true;
	} catch {
		return false;
	} finally {
		if (probeDir !== null) removeProbe(probeDir, { recursive: true });
	}
}
