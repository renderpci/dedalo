/**
 * PUBLIC-URL PROBE — PUBLICATION_HOST_SPEC §7, phase 6 (plan Decisions P1-P3).
 *
 * A rule hash proves the rules are INSTALLED; this proves they GATE. Through the
 * URL the public uses, the operator's published probe file must answer 2xx and the
 * unpublished one 404.
 *
 * THE PUBLIC URL IS AN ORIGIN. `public_url` must parse as a bare http(s) origin: no
 * path, query, fragment or credentials. The probe URL is built from `url.origin`, so
 * a stray path or query can never move the probe off the media URL, and userinfo
 * never reaches the outbound door. Anything else is `unknown`, and nothing is sent.
 * Checked here on every probe, whatever the registry accepted.
 *
 * P1 — VALIDATED, NOT TRUSTED. The operator picks the two files (registry `probe`,
 * no scratch records in a production DB). Before any request each must be a plain
 * relative path under a public quality (`filterPublicQualities`: never a master),
 * match `MEDIA_FILENAME_GRAMMAR`, not be a working file, exist as a regular file in
 * the work media tree (a 404 caused by absence proves nothing), and carry — or not
 * carry — the `pub/<key>` marker it claims. A failed validation is `unknown` with
 * the reason, never a pass, and no request leaves.
 *
 * P2 — THE PUBLIC DOOR. `fetchGuardedText` (vetted, pinned, redirects refused),
 * `Range: bytes=0-0`, a 1 KiB cap. A body is read only for a 2xx (the door cancels
 * any other unread), so a `body_cap` — a server ignoring Range — IS a 2xx. A
 * non-public address is `unknown`, never a pass; the SSRF guard is not bent.
 * No cache-busting header, on purpose: a CDN still serving an unpublished file is
 * exactly the exposure this probe exists to see.
 *
 * VERDICT. A definite failure on either side (the unpublished file served → the
 * gate is OPEN) is `failed` even when the other side is `unknown`; otherwise any
 * unknown side is `unknown`; otherwise `ok`. A 2xx is recorded as 200.
 *
 * P3 — CALLERS: the `apply_rules` action (`probeAfterRulesApplied`); the end of a
 * copy-apply round that changed the host (`scheduleProbeAfterCopyBatch` — called by
 * the copy worker's `afterSync`, wired in server.ts, and by the media_copy reconcile
 * apply; never by `applyCopy` itself, so one sync schedules once); the `probe_public`
 * action (`probePublicGate`); and the scheduled `PUBLICATION_PROBE_RECONCILE`, whose
 * DRY run writes nothing (ReconcileRunOptions) and whose APPLY — the scheduled mode,
 * `autoApply` — records the observation. Every recorded verdict lands in
 * `runtime.probe`, an OBSERVATION; no mode of this module writes the gate, the media
 * or the registry.
 */

import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../../config/config.ts';
import { DedaloError } from '../errors/dedalo_error.ts';
import {
	filterPublicQualities,
	getPublicQualities,
	MEDIA_FILENAME_GRAMMAR,
	MEDIA_WORKING_FILE_EXTENSIONS,
	markerStoreBase,
	mediaRoot,
} from '../media/protection.ts';
import type {
	ReconcileDefinition,
	ReconcileReport,
	ReconcileRunOptions,
	ReconcileScope,
} from '../reconcile/registry.ts';
import {
	fetchGuardedText,
	type GuardedFetchOptions,
	isAddressRefusal,
	isSsrfRefusal,
	type PinnedHopDeps,
} from '../security/ssrf_guard.ts';
import { getHost, loadRegistry, type PublicationHostRecord } from './registry.ts';
import { type HostRuntime, updateHostRuntime } from './runtime.ts';

export type GateProbe = HostRuntime['probe'];
export type ProbeCause = 'apply_rules' | 'copy_batch';

/** Injectable seams (production supplies none): the guard's resolver/fetch + the deadline. */
export interface ProbeDeps extends PinnedHopDeps {
	readonly timeoutMs?: number;
}

/**
 * What the copy trigger reads of one copy-apply round. Structural on purpose: the
 * diffusion `CopyApplyReport` satisfies it, and core never imports a diffusion type.
 */
export interface CopyBatchCounts {
	readonly put: number;
	readonly deleted: number;
	readonly withdrawn: number;
	readonly published: number;
}

export const PUBLICATION_PROBE_EVERY_MS = 15 * 60_000;
/** A proof older than two periods is shown `warn` (the scheduler stopped, or every run failed). */
export const PROBE_MAX_AGE_MS = 2 * PUBLICATION_PROBE_EVERY_MS;
const PROBE_TIMEOUT_MS = 10_000;
const PROBE_MAX_BYTES = 1024;

export const BARE_ORIGIN_REFUSAL =
	'public URL must be a bare origin (http(s)://host[:port], no path, query, fragment or credentials)';

export const NEVER_PROBED: Readonly<GateProbe> = Object.freeze<GateProbe>({
	state: 'unknown',
	at: null,
	published_status: null,
	unpublished_status: null,
	detail: 'never probed',
});

// ---------------------------------------------------------------------------
// The public URL: a bare origin
// ---------------------------------------------------------------------------

function isBareOrigin(url: URL): boolean {
	return [
		url.protocol === 'https:' || url.protocol === 'http:',
		url.username === '' && url.password === '',
		url.pathname === '/' || url.pathname === '',
		url.search === '' && url.hash === '',
	].every(Boolean);
}

/** `url.origin` of a bare http(s) origin; null for anything else (never a guess). */
export function bareOrigin(publicUrl: string): string | null {
	try {
		const url = new URL(publicUrl);
		return isBareOrigin(url) ? url.origin : null;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// P1 — validation against ground truth
// ---------------------------------------------------------------------------

/** One path segment: no leading dot (so no `.`/`..`/`.publication`), web-safe characters only. */
const PROBE_SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
/** The rule-B grammar, anchored on the basename (its `[^/]*` prefix never crosses a slash). */
const PROBE_FILENAME = new RegExp(`^${MEDIA_FILENAME_GRAMMAR}`);
const WORKING_EXTENSIONS: ReadonlySet<string> = new Set(MEDIA_WORKING_FILE_EXTENSIONS);

interface ParsedProbePath {
	path: string;
	key: string;
}

type Validation = { ok: true } | { ok: false; reason: string };

function refused(reason: string): Validation {
	return { ok: false, reason };
}

function hostQualities(record: PublicationHostRecord): string[] {
	return filterPublicQualities(record.qualities ?? getPublicQualities());
}

function parseProbePath(path: string, qualities: readonly string[]): ParsedProbePath | string {
	if (!path.split('/').every((segment) => PROBE_SEGMENT.test(segment))) {
		return `'${path}' is not a plain relative media path`;
	}
	const inQuality = qualities.some((quality) => path.startsWith(`${quality}/`));
	if (!inQuality) return `'${path}' is not under a public quality (${qualities.join(', ')})`;
	return parseProbeFile(path);
}

function parseProbeFile(path: string): ParsedProbePath | string {
	const file = path.slice(path.lastIndexOf('/') + 1);
	const extension = file.slice(file.lastIndexOf('.') + 1).toLowerCase();
	if (WORKING_EXTENSIONS.has(extension)) {
		return `'${path}' is a working file (.${extension}), never served`;
	}
	const match = PROBE_FILENAME.exec(file);
	if (match === null) return `'${path}' does not match the media filename grammar`;
	return { path, key: `${match[1]}_${match[2]}` };
}

async function isRegularFile(path: string): Promise<boolean> {
	try {
		return (await lstat(path)).isFile();
	} catch {
		return false;
	}
}

function markerMismatch(parsed: ParsedProbePath, wantPublished: boolean): string {
	return wantPublished
		? `'${parsed.path}' is not published (no pub/${parsed.key} marker): it cannot prove that published media is served`
		: `'${parsed.path}' is published (pub/${parsed.key} exists): it cannot prove that unpublished media is refused`;
}

async function checkGroundTruth(
	parsed: ParsedProbePath,
	wantPublished: boolean,
): Promise<string | null> {
	const root = mediaRoot();
	const base = markerStoreBase();
	if (root === null || base === null) return 'the media root is not configured';
	if (!(await isRegularFile(join(root, parsed.path)))) {
		return `'${parsed.path}' is not a file in the work media tree`;
	}
	const published = await isRegularFile(join(base, 'pub', parsed.key));
	return published === wantPublished ? null : markerMismatch(parsed, wantPublished);
}

async function checkProbePath(
	path: string,
	qualities: readonly string[],
	wantPublished: boolean,
): Promise<string | null> {
	const parsed = parseProbePath(path, qualities);
	return typeof parsed === 'string' ? parsed : checkGroundTruth(parsed, wantPublished);
}

/** P1. `{ok:true}` only when both paths mean exactly what they claim, today. */
export async function validateProbePaths(record: PublicationHostRecord): Promise<Validation> {
	const { published, unpublished } = record.probe;
	if (published === null || unpublished === null) return refused('probe paths are not set');
	if (published === unpublished) {
		return refused('the published and unpublished probe paths are the same file');
	}
	const qualities = hostQualities(record);
	const publishedProblem = await checkProbePath(published, qualities, true);
	if (publishedProblem !== null) return refused(publishedProblem);
	const unpublishedProblem = await checkProbePath(unpublished, qualities, false);
	return unpublishedProblem === null ? { ok: true } : refused(unpublishedProblem);
}

// ---------------------------------------------------------------------------
// P2 — through the public door
// ---------------------------------------------------------------------------

type Answer = { readonly status: number } | { readonly unknown: string };

/** `origin` is `bareOrigin(...)`'s answer — never the raw registry string. */
function probeUrl(origin: string, path: string): string {
	return `${origin}/dedalo/${config.mediaDir}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

function probeOptions(deps: ProbeDeps): GuardedFetchOptions {
	return {
		maxBytes: PROBE_MAX_BYTES,
		timeoutMs: deps.timeoutMs ?? PROBE_TIMEOUT_MS,
		init: { method: 'GET', headers: { Range: 'bytes=0-0' } },
	};
}

/**
 * An ADDRESS refusal (isAddressRefusal — the guard's one table; no reason is spelled
 * here): a private address, or a name that does not resolve to a public one. The
 * guard's reason code is named as a fact; its message (which names the address) is not.
 */
function addressDetail(error: unknown): string {
	const reason = String((error as DedaloError).coordinates?.reason ?? 'address');
	return `not a public host (${reason}): a private address, or a name that does not resolve to a public one`;
}

function answerOfOutbound(coordinates: Readonly<Record<string, string | number>>): Answer {
	// Only a 2xx body is read, so a body over the cap is a 2xx answer.
	if (coordinates.reason === 'body_cap') return { status: 200 };
	if (typeof coordinates.status === 'number') return { status: coordinates.status };
	return {
		unknown: `the public URL did not answer (${String(coordinates.reason ?? 'transport')})`,
	};
}

function answerOfFailure(error: unknown): Answer {
	if (isAddressRefusal(error)) return { unknown: addressDetail(error) };
	if (isSsrfRefusal(error)) return { unknown: 'the public URL is not a fetchable http(s) URL' };
	if (!(error instanceof DedaloError) || error.code !== 'security.outbound_failed') {
		console.error('[publication_host] probe request failed unexpectedly:', error);
		return { unknown: 'probe error (see the server log)' };
	}
	return answerOfOutbound(error.coordinates ?? {});
}

async function publicAnswer(url: string, deps: ProbeDeps): Promise<Answer> {
	try {
		await fetchGuardedText(url, probeOptions(deps), deps);
		return { status: 200 };
	} catch (error) {
		return answerOfFailure(error);
	}
}

function statusOf(answer: Answer): number | null {
	return 'status' in answer ? answer.status : null;
}

function unknownOf(which: string, answer: Answer): string | null {
	return 'unknown' in answer ? `${which}: ${answer.unknown}` : null;
}

function unpublishedFailure(status: number): string {
	return status >= 200 && status <= 299
		? `the unpublished file is publicly served (HTTP ${status}): the gate is OPEN`
		: `the unpublished file answered HTTP ${status} (must be 404)`;
}

function gateFailures(published: number | null, unpublished: number | null): string[] {
	const failures: string[] = [];
	if (published !== null && published !== 200) {
		failures.push(`the published file answered HTTP ${published} (must be 2xx)`);
	}
	if (unpublished !== null && unpublished !== 404) failures.push(unpublishedFailure(unpublished));
	return failures;
}

function verdict(published: Answer, unpublished: Answer, at: string): GateProbe {
	const statuses = {
		at,
		published_status: statusOf(published),
		unpublished_status: statusOf(unpublished),
	};
	const failures = gateFailures(statuses.published_status, statuses.unpublished_status);
	const unknown = [unknownOf('published', published), unknownOf('unpublished', unpublished)].filter(
		(part): part is string => part !== null,
	);
	if (failures.length > 0) {
		return { ...statuses, state: 'failed', detail: [...failures, ...unknown].join('; ') };
	}
	if (unknown.length > 0) return { ...statuses, state: 'unknown', detail: unknown.join('; ') };
	return { ...statuses, state: 'ok', detail: null };
}

function unknownProbe(at: string, detail: string): GateProbe {
	return { state: 'unknown', at, published_status: null, unpublished_status: null, detail };
}

/** Validate the origin and the paths, then probe both files through the public door. Writes nothing. */
export async function probeHostRecord(
	record: PublicationHostRecord,
	deps: ProbeDeps = {},
): Promise<GateProbe> {
	const at = new Date().toISOString();
	if (record.public_url === null) return unknownProbe(at, 'the public URL is not set');
	const origin = bareOrigin(record.public_url);
	if (origin === null) return unknownProbe(at, BARE_ORIGIN_REFUSAL);
	const valid = await validateProbePaths(record);
	if (!valid.ok) return unknownProbe(at, valid.reason);
	const paths = record.probe as { published: string; unpublished: string };
	const published = await publicAnswer(probeUrl(origin, paths.published), deps);
	const unpublished = await publicAnswer(probeUrl(origin, paths.unpublished), deps);
	return verdict(published, unpublished, at);
}

async function probeAndRecord(record: PublicationHostRecord, deps: ProbeDeps): Promise<GateProbe> {
	const probe = await probeHostRecord(record, deps);
	await updateHostRuntime(record.name, (current) => ({ ...current, probe }));
	return probe;
}

/** Probe one registered host and record the verdict in `runtime.probe`. */
export async function probePublicGate(name: string, deps: ProbeDeps = {}): Promise<GateProbe> {
	const record = getHost(name);
	if (record === null) {
		throw new DedaloError('publication_host.unconfigured', {
			message: `publication host '${name}' is not in the registry`,
			coordinates: { host: name },
		});
	}
	return probeAndRecord(record, deps);
}

/** The `apply_rules` trigger: awaited by the action, never fails the (already applied) rules. */
export async function probeAfterRulesApplied(
	name: string,
	deps: ProbeDeps = {},
): Promise<GateProbe> {
	try {
		return await probePublicGate(name, deps);
	} catch (error) {
		console.error(`[publication_host] probe after apply_rules on '${name}' failed:`, error);
		return unknownProbe(new Date().toISOString(), 'the probe could not run (see the server log)');
	}
}

// ---------------------------------------------------------------------------
// P3 — the after-change lane (rule changes, copy batches)
// ---------------------------------------------------------------------------

interface ProbeLane {
	tail: Promise<void>;
	queued: boolean;
}

// Per-host serialization of AFTER-CHANGE probes (module_state_tripwire allowlisted):
// keyed on the registry host name, never request identity. An entry lives from the
// schedule call until its own probe settles (runLane deletes it), so the map holds
// at most one queued lane per host that is still changing.
const probeLanes = new Map<string, ProbeLane>();

async function runLane(
	name: string,
	cause: ProbeCause,
	lane: ProbeLane,
	probe: (name: string) => Promise<unknown>,
): Promise<void> {
	lane.queued = false;
	try {
		await probe(name);
	} catch (error) {
		console.error(`[publication_host] probe after ${cause} on '${name}' failed:`, error);
	} finally {
		if (probeLanes.get(name) === lane) probeLanes.delete(name);
	}
}

/**
 * Detached, never rejects. A change while a probe is IN FLIGHT queues one follow-up
 * (the running probe may predate the change); a change while one is merely QUEUED
 * joins it (it has not started, so it will see the change).
 */
export function scheduleProbeAfterChange(
	name: string,
	cause: ProbeCause,
	probe: (name: string) => Promise<unknown> = probePublicGate,
): Promise<void> {
	const current = probeLanes.get(name);
	if (current?.queued === true) return current.tail;
	const lane: ProbeLane = { tail: Promise.resolve(), queued: true };
	lane.tail = (current?.tail ?? Promise.resolve()).then(() => runLane(name, cause, lane, probe));
	probeLanes.set(name, lane);
	return lane.tail;
}

/** Did one copy-apply round change what the host serves (a file or a marker)? */
export function copyBatchChanged(counts: CopyBatchCounts): boolean {
	return counts.put + counts.deleted + counts.withdrawn + counts.published > 0;
}

/**
 * THE copy-batch trigger (P3). Called once at the end of each copy-apply driver —
 * the worker run (server.ts `afterSync`) and the media_copy reconcile apply — never
 * from `applyCopy`, so one sync schedules at most once. null = nothing changed.
 */
export function scheduleProbeAfterCopyBatch(
	name: string,
	counts: CopyBatchCounts,
	probe: (name: string) => Promise<unknown> = probePublicGate,
): Promise<void> | null {
	return copyBatchChanged(counts) ? scheduleProbeAfterChange(name, 'copy_batch', probe) : null;
}

// ---------------------------------------------------------------------------
// P3 — the scheduled reconcile (dry = report; apply = record the observation)
// ---------------------------------------------------------------------------

function probeConfigured(host: PublicationHostRecord): boolean {
	return (
		host.public_url !== null && host.probe.published !== null && host.probe.unpublished !== null
	);
}

function inScope(host: PublicationHostRecord, scope: ReconcileScope | undefined): boolean {
	return scope === undefined || scope.includes(host.name);
}

/** Dry: probe, write nothing (ReconcileRunOptions). Apply: probe and record. */
function probeFor(apply: boolean): (host: PublicationHostRecord) => Promise<GateProbe> {
	return apply ? (host) => probeAndRecord(host, {}) : (host) => probeHostRecord(host);
}

async function runProbeReconcile(options: ReconcileRunOptions): Promise<ReconcileReport> {
	const hosts: Record<string, GateProbe['state']> = {};
	const skipped: string[] = [];
	const probe = probeFor(options.apply);
	let recorded = 0;
	for (const host of loadRegistry().hosts.filter((entry) => inScope(entry, options.scope))) {
		const verdictOf = await probe(host);
		if (options.apply) recorded++;
		if (probeConfigured(host)) hosts[host.name] = verdictOf.state;
		else skipped.push(host.name);
	}
	const drift = Object.values(hosts).filter((state) => state !== 'ok').length;
	// An observation repairs nothing: applied is always 0; `recorded` counts runtime writes.
	return { drift, applied: 0, detail: { hosts, skipped, recorded } };
}

export const PUBLICATION_PROBE_RECONCILE: ReconcileDefinition = {
	name: 'publication_probe',
	stores: [
		'publication-host registry probe paths + work pub/ markers',
		'publication-host public URL answers',
	],
	description:
		"Fetches each publication host's two probe files through its PUBLIC URL: the published one must answer 2xx, the unpublished one 404. Drift = configured hosts whose gate is not proven (failed or unknown). A dry run writes nothing; apply records each verdict in runtime.probe and repairs nothing — the repair is apply_rules, an operator action.",
	scopeLabel: 'publication host name',
	schedule: { everyMs: PUBLICATION_PROBE_EVERY_MS },
	autoApply: {
		reason:
			'apply only records the observed verdict in runtime.probe (idempotent, overwrites one observation per host, writes no gate, media or registry); without it the scheduled dry run would leave the panel showing a stale proof',
	},
	sources: ['src/core/publication_host/probe.ts'],
	run: runProbeReconcile,
};
