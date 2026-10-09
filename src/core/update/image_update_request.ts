/**
 * THE PANEL'S IMAGE-UPDATE REQUEST — what "Request this update" does on a
 * container installation (installer unification D3/D4, 2026-10-09).
 *
 * The engine never updates its own image (it has no docker access, by design).
 * It RECORDS a request in the image-update channel (image_update_channel.ts);
 * the opt-in host updater claims it within a minute and runs
 * deploy/dedalo-image-update.sh — backup, pull or build, health, rollback —
 * from the operator's OWN `.dedalo.env`. What a request can choose is a
 * version and nothing else: the repository, the mode, every flag and every
 * ref are the host's.
 *
 * THE GATES, in order, each the one its neighbours already use:
 *   1. checkUpdatePreconditions — superuser + maintenance mode, the code
 *      update's own gate (preconditions.ts);
 *   2. the deployment channel is `image` (channel.ts, the `channel` check's
 *      predicate) — a tree-swap install updates through the swap;
 *   3. the host updater is ALIVE (its heartbeat) — a request nobody will
 *      claim would sit there until the next unrelated install;
 *   4. nothing is pending or in flight — one update at a time;
 *   5. a developer (-dev) target only when the installation already runs a
 *      developer image (the heartbeat's pinned tag is -dev): a request never
 *      moves a release installation onto unreleased code — that move is the
 *      operator's own act on the host. The host updater holds the same floor
 *      (deploy/dedalo-image-updater.sh host_floor_refusal);
 *   6. the target is a version on the LINEAR walk (version_walk.ts, THE rule
 *      the tree swap and the host CLI's check-target use).
 * Refusals are returned as machine ids; the widget turns them into
 * `maintenance.action_refused` with `coordinates.reason`, the client words them.
 *
 * Gate: test/unit/update_code_widget_native.test.ts.
 */

import { randomUUID } from 'node:crypto';
import { projectRoot } from '../../config/env.ts';
import { DedaloError } from '../errors/index.ts';
import { type Principal, SUPERUSER_ID } from '../security/permissions.ts';
import { DEDALO_ENGINE_VERSION } from './build_stamp.ts';
import { type DeploymentChannel, detectDeploymentChannel } from './channel.ts';
import {
	type CancelResult,
	cancelRequest,
	type ImageUpdateRequest,
	imageUpdateDir,
	type PendingRequestView,
	readHostUpdaterState,
	readPendingRequest,
	requestOutstanding,
	writeRequest,
} from './image_update_channel.ts';
import { checkUpdatePreconditions } from './preconditions.ts';
import { DEDALO_VERSION_TRIPLE } from './version.ts';
import { type ImageTag, parseImageTag, type WalkRefusal, walkRefusalOf } from './version_walk.ts';

/** Why a request is refused — the closed id set the client labels. */
export type ImageRequestRefusal =
	| 'not_image_channel'
	| 'host_updater_not_alive'
	| 'request_pending'
	| 'malformed_version'
	| 'dev_channel_not_enabled'
	| 'version_refused';

export type ImageRequestResult =
	| { ok: true; request: PendingRequestView }
	| { ok: false; reason: ImageRequestRefusal; walk?: WalkRefusal };

/** Test seams — production passes none. */
export interface ImageRequestSeams {
	channel?: DeploymentChannel;
	dir?: string;
	now?: Date;
	/** The running version (default: this engine's). */
	current?: readonly number[];
}

/** The tag suffix of each channel a manifest item can carry (an absent channel is a release). */
const CHANNEL_SUFFIX: Readonly<Record<string, string>> = Object.freeze({ master: '', dev: '-dev' });

/** The target the options name: {version:'X.Y.Z', channel?:'dev'|'master'}, or null. */
export function requestedTag(options: Record<string, unknown>): ImageTag | null {
	const suffix = CHANNEL_SUFFIX[String(options.channel ?? 'master')];
	const version = options.version;
	if (suffix === undefined || typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version))
		return null;
	return parseImageTag(`${version}${suffix}`);
}

/** Gates 2-4: the state of this installation, before the target is looked at. */
function stateRefusal(seams: ImageRequestSeams, dir: string): ImageRequestRefusal | null {
	if ((seams.channel ?? detectDeploymentChannel(projectRoot)) !== 'image')
		return 'not_image_channel';
	if (readHostUpdaterState(seams.now ?? new Date(), dir).state !== 'alive')
		return 'host_updater_not_alive';
	return requestOutstanding(dir) ? 'request_pending' : null;
}

/** Gate 5: a -dev target needs an installation that already runs a -dev image. */
function devChannelRefusal(
	target: ImageTag,
	seams: ImageRequestSeams,
	dir: string,
): ImageRequestRefusal | null {
	if (target.channel !== 'dev') return null;
	const pinned = readHostUpdaterState(seams.now ?? new Date(), dir).pinned;
	return parseImageTag(pinned)?.channel === 'dev' ? null : 'dev_channel_not_enabled';
}

/** The request record a valid target becomes. */
function requestRecord(target: ImageTag, principal: Principal, now: Date): ImageUpdateRequest {
	return {
		schema: 1,
		id: randomUUID(),
		tag: target.tag,
		version: target.version,
		channel: target.channel,
		from_version: DEDALO_ENGINE_VERSION,
		requested_at: now.toISOString(),
		requested_by: principal.userId,
	};
}

/**
 * Write the request; a pending one makes it `request_pending`. The record is
 * built here from validated parts, so its own validation failing is an engine
 * defect, never an operator's refusal.
 */
function writeTarget(
	target: ImageTag,
	principal: Principal,
	now: Date,
	dir: string,
): ImageRequestResult {
	const written = writeRequest(requestRecord(target, principal, now), dir);
	if (written.ok) return { ok: true, request: readPendingRequest(dir) as PendingRequestView };
	if (written.reason === 'request_pending') return { ok: false, reason: 'request_pending' };
	throw new DedaloError('internal.invariant', {
		message: `image update request for ${target.tag} failed its own validation (from ${DEDALO_ENGINE_VERSION})`,
		coordinates: { module: 'core/update/image_update_request.ts' },
	});
}

/** Gate 6 and the write. */
function recordTarget(
	target: ImageTag,
	principal: Principal,
	seams: ImageRequestSeams,
	dir: string,
): ImageRequestResult {
	const walk = walkRefusalOf(seams.current ?? DEDALO_VERSION_TRIPLE, target.triple, target.channel);
	if (walk !== null) return { ok: false, reason: 'version_refused', walk };
	const result = writeTarget(target, principal, seams.now ?? new Date(), dir);
	// the request is an instruction to replace the running code: who asked is
	// logged loudly, like the backup waiver (code_update.ts)
	if (result.ok)
		console.warn(
			`[image_update] user ${principal.userId} requested the image update to ${target.tag} (host updater will claim it)`,
		);
	return result;
}

/**
 * Record an image-update request. THROWS the preconditions' own typed errors
 * (perm.superuser_required / maintenance.mode_required); every other refusal
 * is a returned id.
 */
export function requestImageUpdate(
	options: Record<string, unknown>,
	principal: Principal,
	seams: ImageRequestSeams = {},
): ImageRequestResult {
	checkUpdatePreconditions(principal);
	const dir = imageUpdateDir(seams.dir);
	const refusal = stateRefusal(seams, dir);
	if (refusal !== null) return { ok: false, reason: refusal };
	const target = requestedTag(options);
	if (target === null) return { ok: false, reason: 'malformed_version' };
	const devRefusal = devChannelRefusal(target, seams, dir);
	if (devRefusal !== null) return { ok: false, reason: devRefusal };
	return recordTarget(target, principal, seams, dir);
}

/**
 * Withdraw an UNCLAIMED request. Superuser only — and deliberately NOT the
 * maintenance-mode half of checkUpdatePreconditions: withdrawing an update is
 * never the risky direction, and an operator who left maintenance mode after
 * requesting must still be able to take the request back. (The `maintenance:
 * false` flag is a shrink-only census in update_preconditions.test.ts; this
 * door asks the superuser question alone instead of joining it.)
 */
export function cancelImageUpdateRequest(
	principal: Principal,
	seams: Pick<ImageRequestSeams, 'dir'> = {},
): CancelResult {
	if (principal.userId !== SUPERUSER_ID) {
		throw new DedaloError('perm.superuser_required', { coordinates: { user: principal.userId } });
	}
	const result = cancelRequest(imageUpdateDir(seams.dir));
	if (result.ok)
		console.warn(
			`[image_update] user ${principal.userId} cancelled the pending image update request`,
		);
	return result;
}
