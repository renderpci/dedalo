/**
 * RESTORE-POINT LIFECYCLE — retention, deletability, and the verified removal.
 *
 * WHY THIS EXISTS. Every update renames the live tree aside into a restore
 * point and keeps it WITH its `node_modules` (deliberately: a bare `mv` must
 * boot with no network). Nothing ever removed one. Measured on the docker
 * museum 2026-08-28: eleven points, one multi-GB tree each, on a disk the
 * update itself measures and refuses on. The panel reported the free space, the
 * engine produced the consumption, and no affordance closed the loop — an
 * operator with no shell (a museum behind a container) was simply stuck, and
 * one with a shell was deleting multi-GB trees by hand, in the dark, next to
 * the live one.
 *
 * TWO HALVES, and the order matters:
 *   1. RETENTION runs itself. `DEDALO_CODE_RESTORE_POINTS_KEEP` prunes after a
 *      swap the booted tree has CONFIRMED, so the disk stays bounded without an
 *      operator ever making a destructive decision. This is the answer.
 *   2. DELETION is the escape hatch, for what retention cannot reach: a corrupt
 *      point, a husk, an install that needs the space now.
 *
 * THE ONE HARD RULE. The newest BOOTABLE point is the rollback for the code
 * running right now — the thing that makes a bad update survivable. It is
 * refused, not confirmed away: a dialog is not a sufficient guard for deleting
 * disaster recovery, and `deletabilityOf` is the same predicate the panel
 * disables the button with, so the two can never disagree (the shape
 * `restorabilityOf` already established).
 *
 * A REMOVAL IS VERIFIED, NEVER ASSUMED. `rm -rf` reports success per entry;
 * what matters is whether the directory is gone afterwards. Measured the same
 * day: three points on a Docker Desktop bind mount could not be removed by the
 * host user, by root inside the container, with the containers stopped, or from
 * a fresh container — an inner `client/` that every layer refused, because the
 * mount travels with the swap's rename. An unverified delete would have left
 * the panel listing a "restore point" that is not there. So the removal is
 * re-checked and a survivor is reported as a partial failure, by name.
 *
 * Leaf module: node + the error registry only. `status.ts` and `code_restore.ts`
 * both import it; it imports neither.
 */

import { existsSync, lstatSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { DedaloError } from '../errors/index.ts';

/** The prefix every restore point's directory name carries (the swap mints it). */
export const RESTORE_POINT_PREFIX = 'dedalo_';

/**
 * Why a restore point may not be deleted — a MACHINE id (the wire never carries
 * sentences), same contract as RestoreBlockReason.
 */
export type DeleteBlockReason = 'live_rollback';

/** What deletability is decided from. `bootable` is the point's own fact. */
export interface DeletableFacts {
	name: string;
	stamp: number;
	bootable: boolean;
}

/**
 * The name of the point that is the CURRENT ROLLBACK: newest by stamp among the
 * bootable ones. Null when nothing on disk could be booted back into — and then
 * nothing is protected, because there is nothing to protect.
 *
 * Bootability, not recency, is the criterion: an unbootable newer husk is not a
 * rollback, and treating it as one would pin the protection on a directory that
 * cannot save anybody while leaving the real fallback deletable.
 */
export function liveRollbackName(points: readonly DeletableFacts[]): string | null {
	let best: DeletableFacts | null = null;
	for (const point of points) {
		if (!point.bootable) continue;
		if (best === null || point.stamp > best.stamp) best = point;
	}
	return best === null ? null : best.name;
}

/**
 * THE deletability predicate — the panel's button state and the pipeline's
 * refusal are the same two lines, by construction.
 *
 * Everything else is deletable, including an unbootable husk (that is precisely
 * what an operator needs to clear) and an older bootable point (the rollback
 * chain beyond one step back is convenience, not recovery).
 */
export function deletabilityOf(
	point: DeletableFacts,
	points: readonly DeletableFacts[],
): { deletable: boolean; reason: DeleteBlockReason | null } {
	if (point.name === liveRollbackName(points)) {
		return { deletable: false, reason: 'live_rollback' };
	}
	return { deletable: true, reason: null };
}

/**
 * Resolve a CLIENT-SUPPLIED name to a path inside `backupRoot`, or refuse.
 *
 * A delete-by-name door is a traversal surface, so the name is not trusted for
 * anything: it must carry no separator, it must start with the swap's own
 * prefix, and — after `resolve` — the result must still sit directly under the
 * backup root. A symlink is refused outright rather than followed: removing
 * through one would delete whatever it points at, which is the one mistake this
 * function exists to make impossible.
 */
export function resolveRestorePointOrRefuse(backupRoot: string, name: unknown): string {
	const requested = typeof name === 'string' ? name : '';
	const refuse = (detail: string): never => {
		const sentence = 'Error. That is not a restore point of this installation.';
		throw new DedaloError('update.refused', {
			message: `${sentence} (${detail}: ${JSON.stringify(requested)})`,
			publicMessage: sentence,
		});
	};
	if (requested === '' || !requested.startsWith(RESTORE_POINT_PREFIX)) {
		refuse('name does not carry the restore-point prefix');
	}
	if (requested.includes('/') || requested.includes('\\') || requested.includes('\0')) {
		refuse('name carries a path separator');
	}
	const root = resolve(backupRoot);
	const target = resolve(join(root, requested));
	// startsWith on the root alone would accept a sibling whose name merely
	// begins with it (`/backups/code_evil`); the separator is what makes it
	// containment. And the target must be a CHILD, never the root itself.
	if (!target.startsWith(root + sep) || target === root) {
		refuse('resolved outside the backup root');
	}
	if (!existsSync(target)) {
		refuse('no such restore point');
	}
	if (lstatSync(target).isSymbolicLink()) {
		refuse('restore point is a symbolic link');
	}
	if (!statSync(target).isDirectory()) {
		refuse('restore point is not a directory');
	}
	return target;
}

/**
 * Remove one restore-point directory and PROVE it is gone.
 *
 * Returns the removed name. Throws `update.failed` when the directory survives
 * — naming what is left, because "delete reported success and the row is still
 * there" is the failure this whole module was written after.
 */
export function removeRestorePointDir(dir: string, name: string): string {
	try {
		rmSync(dir, { recursive: true, force: true });
	} catch (error) {
		// fall through to the existence check: a partial removal that threw is
		// still worth reporting by what SURVIVED rather than by its errno.
		if (!existsSync(dir)) return name;
		const survivors = surviving(dir);
		throw new DedaloError('update.failed', {
			message: `rm of ${dir} failed`,
			publicMessage: partialSentence(name, survivors),
			cause: error instanceof Error ? error : undefined,
		});
	}
	if (existsSync(dir)) {
		throw new DedaloError('update.failed', {
			message: `rm of ${dir} reported success but the directory is still present`,
			publicMessage: partialSentence(name, surviving(dir)),
		});
	}
	return name;
}

/** What is still inside a directory that would not go away (first few entries). */
function surviving(dir: string): string[] {
	try {
		return readdirSync(dir).slice(0, 5);
	} catch {
		return [];
	}
}

/** The operator sentence for a removal that did not complete. */
function partialSentence(name: string, survivors: string[]): string {
	const left = survivors.length > 0 ? ` — ${survivors.join(', ')} could not be removed` : '';
	return `Error. The restore point ${name} was NOT fully deleted${left}. On a bind-mounted tree this is usually a mount the host still holds; free it and retry.`;
}

/**
 * RETENTION. Keep the `keep` newest points, delete the rest — but never the
 * live rollback, and never `protect` (the sentinel's own backupDir, which is
 * the evidence of the swap that just happened).
 *
 * Best-effort BY DESIGN: it runs on the boot path, after a confirmed update,
 * and a disk that will not give a directory back is not a reason to fail a boot
 * that is otherwise healthy. Every outcome is logged; nothing is silent.
 *
 * `keep < 1` is treated as 1: a retention policy that deletes the last rollback
 * is not a policy anybody meant to write, and the live-rollback rule would
 * refuse it anyway — this makes the intent explicit rather than emergent.
 */
export function pruneRestorePoints(options: {
	points: readonly DeletableFacts[];
	backupRoot: string;
	keep: number;
	protect?: string | null;
}): { deleted: string[]; kept: number; failed: string[] } {
	const keep = Math.max(1, Math.floor(options.keep));
	const newestFirst = [...options.points].sort((a, b) => b.stamp - a.stamp);
	const deleted: string[] = [];
	const failed: string[] = [];
	for (const point of newestFirst.slice(keep)) {
		if (options.protect !== undefined && options.protect !== null && point.name === options.protect) {
			continue;
		}
		if (deletabilityOf(point, options.points).deletable !== true) continue;
		try {
			removeRestorePointDir(join(options.backupRoot, point.name), point.name);
			deleted.push(point.name);
		} catch (error) {
			failed.push(point.name);
			console.error(
				`[code update] retention could not remove the restore point ${point.name}:`,
				error instanceof Error ? error.message : error,
			);
		}
	}
	return { deleted, kept: Math.min(keep, newestFirst.length), failed };
}
