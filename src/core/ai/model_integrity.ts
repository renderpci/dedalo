/**
 * MODEL ARTIFACT INTEGRITY — the one place a model file's BYTES are judged.
 *
 * A model artifact is executed in every curator's browser (a model graph and a
 * tokenizer under a wasm runtime — not arbitrary code, but the thing that writes
 * the transcript of an oral-history recording straight into the catalogue).
 * Until 2026-09-04 the only post-condition on a download was byte LENGTH against
 * a header value, and a resumed `curl -C -` could stitch two objects into one
 * file of the right length. This module is the missing half (P1-25 / CARRY-06):
 *
 *   - `sha256File` — a STREAMING digest (weights reach the gigabyte; a file is
 *     never read whole into memory);
 *   - `verifiedDigest` — the same digest behind a STAT-IDENTITY verdict cache,
 *     so the serving door hashes a weight once per process and answers from the
 *     cache while size/mtime/inode are unchanged;
 *   - `quarantineFile` — a mismatching artifact is MOVED, never deleted and never
 *     left in place: the evidence stays for the operator under
 *     `<root>/.quarantine/…`, and nothing under that segment is ever served.
 *
 * LEAF MODULE: imports nothing from `core/ai/`, so both the fetch and the serve
 * side can use it without an import cycle (the SCC tripwire keeps it that way).
 *
 * HONEST LIMIT of the verdict cache: it keys on `{size, mtimeMs, ino}`. An
 * attacker with WRITE access to the store who rewrites a file in place while
 * preserving all three evades re-verification until the process restarts (or
 * `forgetVerdict` is called). That attacker already owns the store; the cache
 * exists so an honest install does not re-hash 1.5 GB per request.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

/** The store subdirectory a refused artifact is moved to. Never servable. */
export const QUARANTINE_DIR = '.quarantine';

/** A sha256 digest as this subsystem records it: 64 lowercase hex characters. */
export const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Streaming sha256 of a file on disk (hex). Throws when the file cannot be read. */
export async function sha256File(path: string): Promise<string> {
	const hash = createHash('sha256');
	const stream = Bun.file(path).stream();
	for await (const chunk of stream) hash.update(chunk);
	return hash.digest('hex');
}

/** What comparing a file against an expected digest can say. */
export type DigestVerdict = 'match' | 'mismatch' | 'absent';

/**
 * Compare one file's bytes against `expectedSha256`. `absent` covers a missing
 * or unreadable file — a distinct answer from a file that reads and disagrees.
 */
export async function verifyFileDigest(
	path: string,
	expectedSha256: string,
): Promise<DigestVerdict> {
	let actual: string;
	try {
		if (!existsSync(path)) return 'absent';
		actual = await sha256File(path);
	} catch {
		return 'absent';
	}
	return actual === expectedSha256.toLowerCase() ? 'match' : 'mismatch';
}

/** The stat identity a cached verdict is bound to. */
interface StatIdentity {
	size: number;
	mtimeMs: number;
	ino: number;
}

interface Verdict extends StatIdentity {
	sha256: string;
}

/** The file's current stat identity, or null when it cannot be stat'ed. */
function statIdentity(path: string): StatIdentity | null {
	try {
		const info = statSync(path);
		return { size: info.size, mtimeMs: info.mtimeMs, ino: info.ino };
	} catch {
		return null;
	}
}

/** All three facets must agree for a cached verdict to still describe the file. */
function sameIdentity(a: StatIdentity, b: StatIdentity): boolean {
	return a.size === b.size && a.mtimeMs === b.mtimeMs && a.ino === b.ino;
}

/**
 * Digest verdicts by ABSOLUTE PATH (module_state_tripwire allowlist entry
 * `core/ai/model_integrity.ts:verdicts`). Process-scoped, boot-stable, no request
 * identity: a digest is the same fact for every user, session and language.
 * Cleared per entry by `forgetVerdict` (a quarantine, a repair) and never as a
 * whole — a verdict only goes stale when the file changes, and the stat identity
 * catches that.
 */
const verdicts = new Map<string, Verdict>();

/**
 * The file's sha256, from the cache when the stat identity still matches, else
 * computed once and cached. Null when the file cannot be read.
 */
export async function verifiedDigest(path: string): Promise<string | null> {
	const key = resolve(path);
	const identity = statIdentity(key);
	if (identity === null) {
		verdicts.delete(key);
		return null;
	}
	const cached = verdicts.get(key);
	if (cached !== undefined && sameIdentity(cached, identity)) return cached.sha256;
	let sha256: string;
	try {
		sha256 = await sha256File(key);
	} catch {
		verdicts.delete(key);
		return null;
	}
	verdicts.set(key, { ...identity, sha256 });
	return sha256;
}

/** Drop the cached verdict for one path (the file was moved, replaced or removed). */
export function forgetVerdict(path: string): void {
	verdicts.delete(resolve(path));
}

/** A filesystem-safe timestamp for a quarantine name (`:` is not portable). */
function quarantineStamp(now: Date): string {
	return now.toISOString().replace(/[:.]/g, '-');
}

/**
 * Move `<root>/<relPath>` to `<root>/.quarantine/<relPath>.<timestamp>`.
 *
 * Returns the quarantine path, or null when nothing could be moved (already
 * absent, or the move itself failed — reported, never thrown: every caller is
 * on a refusal path and the refusal must still be delivered). The relative path
 * is confined under the root the same way the store confines a fetch target.
 */
export function quarantineFile(
	root: string,
	relPath: string,
	now: Date = new Date(),
): string | null {
	const rootAbs = resolve(root);
	const source = resolve(rootAbs, relPath);
	if (!source.startsWith(rootAbs + sep)) return null;
	const destination = join(rootAbs, QUARANTINE_DIR, `${relPath}.${quarantineStamp(now)}`);
	if (!resolve(destination).startsWith(join(rootAbs, QUARANTINE_DIR) + sep)) return null;
	forgetVerdict(source);
	if (!existsSync(source)) return null;
	try {
		mkdirSync(dirname(destination), { recursive: true });
		renameSync(source, destination);
	} catch (error) {
		console.error(`[integrity] could not quarantine '${source}':`, error);
		return null;
	}
	console.error(
		`[integrity] '${relPath}' failed its digest check and was quarantined at '${destination}'`,
	);
	return destination;
}

/** True when a store-relative path names anything under the quarantine directory. */
export function isQuarantinePath(relPath: string): boolean {
	return relPath.split(/[\\/]/).includes(QUARANTINE_DIR);
}
