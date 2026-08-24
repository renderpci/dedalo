/**
 * INSTALL PROVENANCE (2026-08-24, dev channel) — what the SWAP wrote into this
 * tree, read once at module init from the sibling `install_stamp.json`.
 *
 * The sibling `build_stamp.ts` reads `build_info.txt`, which `git archive`
 * expands for EVERY ref. That answers "which commit", and the dev channel needs
 * two things it cannot answer:
 *
 *  - WHICH ARCHIVE is installed. A rebuild of the same commit produces the same
 *    commit sha but a different archive; the sha256 of the archive the updater
 *    verified (code_update.ts) is the only per-bytes identity, and it is what
 *    boot_confirm.ts compares and `/health` publishes so the panel can tell a
 *    landed same-version swap from a rollback.
 *  - WHETHER THIS TREE IS A RELEASE. A `v7` build is a `git archive` too, so
 *    without this stamp an unreleased branch build installs a tree reporting
 *    `posture: 'release'` and a bare `7.0.1` version string — presenting itself
 *    as the published release in `/health`, `page_globals.dedalo_version` and
 *    the maintenance panel. The channel recorded here restores the `.dev` tag.
 *
 * A tree with no stamp is a DEV CHECKOUT or a pre-2026-08-24 install: both
 * degrade to nulls, never to a throw — a broken stamp must not take the server
 * down. Leaf module: node builtins only.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The channel the installed archive was built on (code_build_plan.ts releaseFileName). */
export type InstallChannel = 'master' | 'dev';

export interface InstallStamp {
	/** sha256 of the installed archive, as verified by the updater. */
	digest: string;
	channel: InstallChannel;
	/** The release URL the archive came from (operator forensics; optional). */
	source_url?: string;
	/** ISO instant of the swap (operator forensics; optional). */
	installed_at?: string;
}

/** The stamp file's name inside any Dédalo tree, relative to the repo root. */
export const INSTALL_STAMP_PATH = 'src/core/update/install_stamp.json';

/**
 * Parse stamp content. ANY malformed shape → null (never a throw): a stamp is
 * evidence, and evidence that does not parse is simply absent. The digest must
 * be a plain 64-hex sha256 and the channel one of the two built ones — a stamp
 * that fails either is not partially trusted.
 */
export function parseInstallStamp(content: string): InstallStamp | null {
	let raw: unknown;
	try {
		raw = JSON.parse(content);
	} catch {
		return null;
	}
	if (raw === null || typeof raw !== 'object') return null;
	const fields = raw as Record<string, unknown>;
	const required = requiredStampFields(fields);
	if (required === null) return null;
	return Object.freeze({
		...required,
		...optionalText('source_url', fields.source_url),
		...optionalText('installed_at', fields.installed_at),
	});
}

/**
 * The two fields a stamp cannot be trusted without: a plain 64-hex sha256 and
 * one of the two built channels. Null when either fails — a stamp is never
 * PARTIALLY trusted.
 */
function requiredStampFields(
	raw: Record<string, unknown>,
): { digest: string; channel: InstallChannel } | null {
	const { digest, channel } = raw;
	if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) return null;
	if (channel !== 'master' && channel !== 'dev') return null;
	return { digest, channel };
}

/** An optional forensic field: present only when it is actually a string. */
function optionalText(key: string, value: unknown): Record<string, string> {
	return typeof value === 'string' ? { [key]: value } : {};
}

function readInstallStamp(): InstallStamp | null {
	try {
		return parseInstallStamp(readFileSync(join(import.meta.dir, 'install_stamp.json'), 'utf8'));
	} catch {
		return null;
	}
}

const STAMP = readInstallStamp();

/** sha256 of the archive this tree was installed from — null on a dev checkout. */
export const INSTALLED_DIGEST: string | null = STAMP?.digest ?? null;

/** The channel this tree was installed from — null on a dev checkout. */
export const INSTALLED_CHANNEL: InstallChannel | null = STAMP?.channel ?? null;
