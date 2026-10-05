/**
 * A FAKE COPY WORLD for the media-copy gates: the work host's pub/ markers and
 * public files, and one agent's files + markers, all in memory. No database, no
 * filesystem, no network — the gates that need the real advisory lock take it
 * themselves. `calls` is the ordered log of agent MUTATIONS (manifest reads and puts
 * refused up front are not logged): a put logs `put <path>` when its body starts.
 *
 * The fake agent enforces the real agent's invariant (publication/host_agent
 * src/media/copy.ts): a put for a key with no agent marker is REFUSED
 * (publication_host.rejected / key_unpublished) — up front AND again at the landing,
 * after the body was read (the agent's re-check under its key lock) — so a gate that put
 * before marking goes red here, not only in the live drill.
 */

import { DedaloError } from '../../src/core/errors/index.ts';
import { getPublicQualities, MEDIA_FILENAME_GRAMMAR } from '../../src/core/media/protection.ts';
import {
	type DesiredFile,
	publicFileClassifier,
} from '../../src/diffusion/targets/mediastore/media_copy.ts';
import type {
	ApplyPlan,
	CopyApplyReport,
	CopyDeps,
	MediaCopyRuntime,
} from '../../src/diffusion/targets/mediastore/media_copy_apply.ts';

export interface World {
	published: Set<string>;
	local: Map<string, { bytes: string; mtimeMs: number }>;
	/** Paths whose sha the cache reports unstable (null). */
	unstable: Set<string>;
	agentFiles: Map<string, string>;
	/** Agent paths that are not regular files (links, fifos): listed as `irregular`. */
	agentIrregular: Set<string>;
	agentMarkers: Set<string>;
	calls: string[];
	actors: Set<string>;
	runtime: Map<string, MediaCopyRuntime>;
	down: boolean;
	lockBusy: boolean;
	duringPut: ((path: string) => Promise<void>) | null;
	clock: { t: number };
}

export const T0 = Date.parse('2026-10-03T10:00:00.000Z');

export function newWorld(): World {
	return {
		published: new Set(),
		local: new Map(),
		unstable: new Set(),
		agentFiles: new Map(),
		agentIrregular: new Set(),
		agentMarkers: new Set(),
		calls: [],
		actors: new Set(),
		runtime: new Map(),
		down: false,
		lockBusy: false,
		duringPut: null,
		clock: { t: T0 },
	};
}

export function emptyRuntime(): MediaCopyRuntime {
	return {
		state: 'n/a',
		desired: 0,
		present: 0,
		pending_puts: 0,
		pending_deletions: [],
		last_verified_at: null,
		error: null,
	};
}

/** The first public IMAGE quality of this install (never hardcoded). */
export function imageQuality(): string {
	const quality = getPublicQualities().find((q) => q.startsWith('image/'));
	if (quality === undefined) throw new Error('no public image quality configured');
	return quality;
}

/** A public media path for marker key `test3_<id>` (grammar: <component>_<section>_<id>.<ext>). */
export function mediaPath(key: string, component = 'test99'): string {
	return `${imageQuality()}/0/${component}_${key}.jpg`;
}

export function keyOf(path: string): string {
	const match = new RegExp(MEDIA_FILENAME_GRAMMAR).exec(path.slice(path.lastIndexOf('/') + 1));
	if (match === null) throw new Error(`not a media file name: ${path}`);
	return `${match[1]}_${match[2]}`;
}

export function desired(world: World, path: string): DesiredFile {
	const file = world.local.get(path);
	if (file === undefined) throw new Error(`no local file ${path}`);
	return { path, key: keyOf(path), size: file.bytes.length, mtimeMs: file.mtimeMs };
}

/** What planCopy would answer for this world (media_copy.ts semantics, recomputed in memory). */
export function planFrom(world: World): ApplyPlan {
	const put = [...world.local.keys()]
		.filter((path) => world.published.has(keyOf(path)) && !world.agentFiles.has(path))
		.filter((path) => !world.agentIrregular.has(path))
		.map((path) => desired(world, path));
	const del = [
		...[...world.agentFiles.keys()].filter((path) => !world.published.has(keyOf(path))),
		...world.agentIrregular,
	].sort();
	const mark = [
		...[...world.agentMarkers]
			.filter((key) => !world.published.has(key))
			.map((key) => ({ key, published: false })),
		...[...world.published]
			.filter((key) => !world.agentMarkers.has(key))
			.map((key) => ({ key, published: true })),
	];
	return { put, del, mark };
}

function keyUnpublished(path: string): DedaloError {
	return new DedaloError('publication_host.rejected', {
		message: `key_unpublished (test): ${path}`,
		coordinates: { agent_reason: 'key_unpublished' },
	});
}

function reach(world: World): void {
	if (world.down)
		throw new DedaloError('publication_host.unreachable', { message: 'agent down (test)' });
}

export function worldDeps(world: World): CopyDeps {
	return {
		async put(_host, file, actor) {
			reach(world);
			if (!world.agentMarkers.has(keyOf(file.path))) {
				await file.body.cancel();
				throw keyUnpublished(file.path);
			}
			world.actors.add(actor);
			world.calls.push(`put ${file.path}`);
			const bytes = await new Response(file.body).text();
			if (world.duringPut !== null) await world.duringPut(file.path);
			// The real agent re-checks the marker under its key lock before the rename.
			if (!world.agentMarkers.has(keyOf(file.path))) throw keyUnpublished(file.path);
			world.agentFiles.set(file.path, bytes);
		},
		async del(_host, paths, actor) {
			reach(world);
			if (paths.length === 0) return;
			world.actors.add(actor);
			world.calls.push(`del ${paths.join(',')}`);
			for (const path of paths) {
				world.agentFiles.delete(path);
				world.agentIrregular.delete(path);
			}
		},
		async mark(_host, key, published, actor) {
			reach(world);
			world.actors.add(actor);
			world.calls.push(`mark ${key} ${published}`);
			if (published) world.agentMarkers.add(key);
			else world.agentMarkers.delete(key);
		},
		async manifest() {
			reach(world);
			return {
				entries: [...world.agentFiles].map(([path, bytes]) => ({
					path,
					size: bytes.length,
					sha256: 'f'.repeat(64),
				})),
				irregular: [...world.agentIrregular],
				markers: [...world.agentMarkers],
			};
		},
		async isPublished(key) {
			return world.published.has(key);
		},
		classifier: () => publicFileClassifier(getPublicQualities()),
		async sha256(file) {
			return world.unstable.has(file.path) ? null : 'c'.repeat(64);
		},
		async open(path) {
			const file = world.local.get(path);
			if (file === undefined) return null;
			return {
				size: file.bytes.length,
				mtimeMs: file.mtimeMs,
				body: new Blob([file.bytes]).stream(),
			};
		},
		async lock(_host, work) {
			if (world.lockBusy) return { acquired: false, reason: 'busy', busyKey: 'media:pub1' };
			return { acquired: true, value: await work() };
		},
		async updateRuntime(host, fn) {
			const next = fn(world.runtime.get(host) ?? emptyRuntime());
			world.runtime.set(host, next);
			return next;
		},
		now: () => new Date(world.clock.t),
	};
}

export function okReport(host: string): CopyApplyReport {
	return {
		host,
		state: 'ok',
		withdrawn: 0,
		deleted: 0,
		put: 0,
		published: 0,
		skipped_unpublished: 0,
		deferred: 0,
		compensated: 0,
		pending_deletions: 0,
		error: null,
	};
}
