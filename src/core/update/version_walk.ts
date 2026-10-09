/**
 * THE VERSION WALK — one rule shared by every door that moves an install to
 * another version (installer unification D3, 2026-10-09): the tree swap
 * (code_update.ts), the image-update request the panel records
 * (area_maintenance/widgets/update_code.ts), and the host CLI's `check-target`
 * (scripts/ops/image_update_channel.ts) that deploy/dedalo-image-update.sh asks
 * before it pulls or builds.
 *
 * MOVED VERBATIM out of code_update.ts so the CLI can load it without
 * config.ts (it must answer in install mode, inside an image the operator is
 * about to replace). A LEAF: version.ts and a type, nothing else.
 * Gates: test/unit/code_update*.test.ts (the swap) and
 * test/unit/image_update_channel_native.test.ts (the CLI's verdicts equal this).
 */

import type { InstallChannel } from './install_stamp.ts';
import { compareVersionArrays } from './version.ts';

/**
 * Strict linear upgrade guard (Opus §1.3) — a backstop against a malicious or
 * buggy code server offering a skip. Returns null when the target is a legal
 * next rung, else the reason.
 *
 * THE DEV CHANNEL (2026-08-24) relaxes exactly ONE clause: `target === current`
 * becomes legal, because a branch build carries no version bump — that is the
 * whole point of testing unreleased `v7` code on a remote install. It relaxes
 * an ORDERING guard, not an AUTHENTICITY one: the origin allowlist, the
 * no-redirect rule and the sha256-vs-sidecar check are untouched, so the worst
 * a forged `channel` buys is installing a same-version archive the configured
 * master really published. Downgrades and rung skips stay refused on both
 * channels, and an OMITTED channel never relaxes anything.
 */
export function assertLinearUpgrade(
	current: readonly number[],
	target: readonly number[],
	channel: InstallChannel = 'master',
): string | null {
	const order = compareVersionArrays(target, current);
	if (order === 0 && channel === 'dev') return null;
	if (order !== 1) return 'refusing a downgrade or same-version install';
	return versionSkipReason(current, target);
}

/**
 * The skip rules over a KNOWN-ascending pair (assertLinearUpgrade gates order
 * first) — the swap path's ONLY version gate, so it must be exact.
 *
 * The PATCH AXIS WAS NEVER CONSTRAINED: `cPatch` was not even destructured, so
 * `assertLinearUpgrade([7,0,0], [7,0,99999])` returned null and 7.0.0 → 7.0.3
 * installed in one hop, skipping every intervening rung's migrations. Nothing
 * else caught it — the sha is CLIENT-SUPPLIED and matches the genuinely
 * published sidecar of the skipped-to release, so a consumer pointed at a
 * master with several archives on disk could jump the queue.
 *
 * Now it asks ONE question, the same notion of "next rung" the manifest builds
 * from (code_manifest.ts upgradeRung): major+1.0.0, minor+1.0, or patch+1.
 */
function versionSkipReason(current: readonly number[], target: readonly number[]): string | null {
	const [cMajor = 0, cMinor = 0, cPatch = 0] = current;
	const [tMajor = 0, tMinor = 0, tPatch = 0] = target;
	if (isNextRung([cMajor, cMinor, cPatch], [tMajor, tMinor, tPatch])) return null;
	if (tMajor > cMajor) return 'major version skip is not allowed';
	if (tMinor <= cMinor) return 'patch version skip is not allowed';
	return tPatch !== 0 ? 'a minor/major bump must land on .0' : 'minor version skip is not allowed';
}

/** Is `target` the ONE rung above `current`: major+1.0.0, minor+1.0, or patch+1? */
function isNextRung(
	[cMajor, cMinor, cPatch]: readonly [number, number, number],
	[tMajor, tMinor, tPatch]: readonly [number, number, number],
): boolean {
	if (tMajor === cMajor + 1) return tMinor === 0 && tPatch === 0;
	if (tMajor !== cMajor) return false;
	if (tMinor === cMinor + 1) return tPatch === 0;
	return tMinor === cMinor && tPatch === cPatch + 1;
}

// ---------------------------------------------------------------------------
// The image-tag face of the same rule (installer unification D3, 2026-10-09)
// ---------------------------------------------------------------------------

/**
 * Why a walk is refused, as a MACHINE id — the CLI prints it, the panel
 * refusal carries it in its coordinates, the label catalog owns the sentence.
 * The two ids partition assertLinearUpgrade's sentences: its order clause
 * (downgrade or same version) and its rung clauses (every skip).
 */
export type WalkRefusal = 'downgrade_or_same_version' | 'version_skip';

/** The walk verdict as an id: null when `target` is a legal next step. */
export function walkRefusalOf(
	current: readonly number[],
	target: readonly number[],
	channel: InstallChannel = 'master',
): WalkRefusal | null {
	const reason = assertLinearUpgrade(current, target, channel);
	if (reason === null) return null;
	return compareVersionArrays(target, current) === 1 ? 'version_skip' : 'downgrade_or_same_version';
}

/** A parsed image tag: `X.Y.Z` (a release) or `X.Y.Z-dev` (a developer image). */
export interface ImageTag {
	tag: string;
	/** `X.Y.Z` — the version the tag names, without the channel suffix. */
	version: string;
	triple: [number, number, number];
	channel: InstallChannel;
}

/**
 * The code server's release vocabulary, as image tags: `<v>.zip` ↔ `:<v>`,
 * `<v>-dev.zip` ↔ `:<v>-dev` (deploy/dedalo-image-lib.sh DEDALO_VERSION_RE —
 * the same grammar, bounded per segment). Anything else is null.
 */
export const IMAGE_TAG_RE = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})(-dev)?$/;

/** Parse an image tag, or null when it is not one. */
export function parseImageTag(value: unknown): ImageTag | null {
	if (typeof value !== 'string') return null;
	const match = IMAGE_TAG_RE.exec(value);
	if (match === null) return null;
	const triple: [number, number, number] = [Number(match[1]), Number(match[2]), Number(match[3])];
	return {
		tag: value,
		version: triple.join('.'),
		triple,
		channel: match[4] === undefined ? 'master' : 'dev',
	};
}
