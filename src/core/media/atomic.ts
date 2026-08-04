/**
 * ATOMIC MEDIA WRITER — the ONE way a derivative reaches its final path.
 *
 * Every media producer writes to a unique temp sibling and renames it into place,
 * so a concurrent reader (the web server, a diffusion export, a coexisting
 * process) never sees a partial derivative. That discipline existed as loose
 * copy-paste in `processing.ts`; it lives here as one function because the
 * failure path is what actually matters:
 *
 *   an ImageMagick run that meets a multi-image source writes `<stem>-0.jpg`,
 *   `<stem>-1.jpg`, … instead of the bare temp. The rename then throws ENOENT
 *   and the split files STAY. On 2026-08-04 that left six orphaned
 *   `…tmp.…-N.jpg` files in a live thumb directory with nothing to clean them.
 *
 * So the `finally` here removes the temp AND sweeps `<tempStem>-N<ext>`. The
 * sweep is bounded by the temp's UNIQUE stem, which is what makes it
 * concurrency-safe: it can only ever match files this call produced.
 *
 * WHY A SYNC TWIN EXISTS: `processing.ts::copyToQuality` is synchronous and is
 * called by `regenerate3d`, which is itself synchronous and is called UNAWAITED
 * from `ingest/process_uploaded_file.ts`. Making the writer async-only would
 * cascade an `await` through three call sites, the last of which does not await
 * at all — the failure would become an unhandled rejection instead of an error.
 * The two functions are deliberately identical apart from the `await`.
 */

import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { sweepSequenceSiblings } from './engine/imagemagick.ts';

/**
 * A unique temp path in the same dir as `target` (atomic-rename staging). The
 * temp name MUST keep the target's extension: ImageMagick/ffmpeg infer the
 * OUTPUT FORMAT from the filename extension, so a temp like `x.jpg.tmp.123`
 * would make ImageMagick fall back to the SOURCE format (e.g. write TIFF bytes
 * into a `.jpg` file — which browsers can't display). Insert the uniqueness
 * BEFORE the extension: `<stem>.tmp.<pid>.<uuid>.<ext>`.
 *
 * The uniqueness suffix is `process.pid` + `crypto.randomUUID()`: the previous
 * `performance.now()` can repeat inside a single millisecond, so two concurrent
 * derivatives of the same target could collide on the same temp — and then each
 * would sweep the other's split siblings.
 */
export function tempSibling(target: string): string {
	const slash = target.lastIndexOf('/');
	const dir = target.slice(0, slash);
	const name = target.slice(slash + 1);
	const dot = name.lastIndexOf('.');
	const stem = dot > 0 ? name.slice(0, dot) : name;
	const ext = dot > 0 ? name.slice(dot) : ''; // includes the leading dot
	const unique = `${process.pid}.${crypto.randomUUID()}`;
	return `${dir}/${stem}.tmp.${unique}${ext}`;
}

/** Ensure the parent dir of `absolutePath` exists. */
export function ensureDir(absolutePath: string): void {
	const dir = dirname(absolutePath);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o775 });
}

/**
 * Produce `target` atomically: the producer writes to a temp sibling, which is
 * renamed into place only on success. Returns `target`.
 *
 * Whatever the producer did — success, throw, or the sequence split described in
 * the header — nothing is left behind in the destination directory.
 */
export async function writeAtomically(
	target: string,
	produce: (temp: string) => Promise<void>,
): Promise<string> {
	ensureDir(target);
	const temp = tempSibling(target);
	try {
		await produce(temp);
		renameSync(temp, target);
		return target;
	} finally {
		cleanTemp(temp);
	}
}

/**
 * Synchronous twin of `writeAtomically` (see the header for why it exists —
 * `copyToQuality` → `regenerate3d` → an unawaited ingest call site).
 */
export function writeAtomicallySync(target: string, produce: (temp: string) => void): string {
	ensureDir(target);
	const temp = tempSibling(target);
	try {
		produce(temp);
		renameSync(temp, target);
		return target;
	} finally {
		cleanTemp(temp);
	}
}

/**
 * Remove the temp and any `<tempStem>-N<ext>` siblings a sequence-emitting
 * producer left. After a successful rename the temp is already gone, so the
 * `rmSync` is a no-op (`force: true`) and the sweep finds nothing — the cost of
 * the happy path is one failed unlink and one directory read.
 */
function cleanTemp(temp: string): void {
	rmSync(temp, { force: true });
	const swept = sweepSequenceSiblings(temp);
	if (swept.length > 0) {
		// Reaching here means the producer emitted a SEQUENCE instead of one file.
		// The write has already failed loudly (runMagickTo throws on it); this line
		// records that the debris was collected, so an orphan in a media dir is
		// again evidence of a bug rather than the normal state of affairs.
		console.warn(
			`media atomic write swept ${swept.length} sequence sibling(s) of ${temp}: ${swept.join(', ')}`,
		);
	}
}
