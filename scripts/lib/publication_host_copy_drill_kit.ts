/**
 * PUBLICATION-HOST COPY DRILL KIT — the pure pieces of the phase-5 copy pass of
 * scripts/publication_host_agent_drill.ts and of the engine child it spawns
 * (scripts/lib/publication_host_copy_engine.ts), kept apart so
 * test/unit/publication_host_copy_drill_kit.test.ts holds them without the live servers.
 *
 *   - parseEngineArgv / engineChildRefusal: the child's CLOSED command set, and the
 *     refusal it applies before any engine import could write: a private dir and a media
 *     root that have not DECLARED themselves scratch (a marker file each) are refused.
 *   - renderDrillResult / parseDrillResult: the ONE result line the child prints, found in
 *     whatever the engine logs around it.
 *   - copyEngineEnv: the child's environment — the drill's own (envSnapshot: the private
 *     .env keys included) with the seams pinned on top.
 *   - listTree: what a copy root holds, as the drill compares it.
 * The engine bundle the child pairs with is the engine drill kit's writeEngineBundle
 * (scripts/lib/publication_host_engine_drill_kit.ts) — one copy of the provisioner's order.
 *
 * No engine import, no package import: node builtins only.
 */

import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

/** The registry name of the drill's copy host (phase 3 HOST_NAME grammar). */
export const COPY_DRILL_HOST = 'drillcopy';
/** The `dbs/<db>/<table>` the drill's publish/unpublish writes under the WORK root. */
export const COPY_DRILL_DATABASE = 'zzcopydrill';
export const COPY_DRILL_TABLE = 'drill_records';
/** The engine's public qualities in the child (DEDALO_MEDIA_PUBLIC_QUALITIES). */
export const COPY_DRILL_QUALITIES = ['image/thumb'] as const;
export const COPY_DRILL_ACTOR = 'drill';
/** The file a scratch private dir carries before the child may write into it. */
export const COPY_DRILL_PRIVATE_MARKER = '.dedalo_copy_drill_private';
export const DRILL_RESULT_PREFIX = 'DRILL_RESULT ';

export type CopyEngineCommand =
	| 'pair'
	| 'rules'
	| 'plan'
	| 'reconcile'
	| 'publish'
	| 'unpublish'
	| 'runtime';

/** The closed command set and each command's argument count. */
export const COPY_ENGINE_ARITY: Readonly<Record<CopyEngineCommand, number>> = {
	pair: 1,
	rules: 0,
	plan: 0,
	reconcile: 0,
	publish: 2,
	unpublish: 2,
	runtime: 0,
};

export const COPY_ENGINE_USAGE =
	'usage: publication_host_copy_engine.ts pair <spec.json> | rules | plan | reconcile | publish <tipo> <id> | unpublish <tipo> <id> | runtime';

const TIPO = /^[a-z0-9]+$/;
const SECTION_ID = /^[0-9]+$/;

/** argv → command, or null for anything outside the closed set or its grammar. */
export function parseEngineArgv(
	argv: readonly string[],
): { command: CopyEngineCommand; args: string[] } | null {
	const [command, ...args] = argv;
	if (command === undefined || !Object.hasOwn(COPY_ENGINE_ARITY, command)) return null;
	const typed = command as CopyEngineCommand;
	if (args.length !== COPY_ENGINE_ARITY[typed]) return null;
	const record = typed === 'publish' || typed === 'unpublish';
	if (record && (!TIPO.test(args[0] ?? '') || !SECTION_ID.test(args[1] ?? ''))) return null;
	if (typed === 'pair' && !isAbsolute(args[0] ?? '')) return null;
	return { command: typed, args };
}

/**
 * Why the child must not run, or null. Checked BEFORE any engine import: the private dir
 * holds the registry, the host secrets and the runtime file; the media root holds the
 * marker store — an unset or undeclared one is the installation's.
 */
export function engineChildRefusal(
	env: Readonly<Record<string, string | undefined>>,
	testMediaMarker: string,
	exists: (path: string) => boolean = existsSync,
): string | null {
	const priv = env.DEDALO_PRIVATE_DIR;
	if (priv === undefined || priv === '' || !isAbsolute(priv)) {
		return "DEDALO_PRIVATE_DIR must name the drill's scratch private dir (absolute): without it the registry, the host secrets and the runtime file would land in the installation's private dir";
	}
	if (!exists(join(priv, COPY_DRILL_PRIVATE_MARKER))) {
		return `the private dir '${priv}' carries no ${COPY_DRILL_PRIVATE_MARKER} marker: it has not declared itself the copy drill's scratch private dir`;
	}
	const media = env.DEDALO_TEST_MEDIA_ROOT;
	if (media === undefined || media === '' || !isAbsolute(media)) {
		return "DEDALO_TEST_MEDIA_ROOT must name the drill's scratch WORK media root (absolute): unarmed, the marker writes would land in the installation's media tree";
	}
	if (!exists(join(media, testMediaMarker))) {
		return `the media root '${media}' carries no ${testMediaMarker} marker: it has not declared itself a disposable test root`;
	}
	return null;
}

export type DrillResult = { ok: true; value: unknown } | { ok: false; error: string };

export function renderDrillResult(result: DrillResult): string {
	const body = result.ok ? { ok: true, value: result.value ?? null } : result;
	return `${DRILL_RESULT_PREFIX}${JSON.stringify(body)}`;
}

/** The LAST result line of the child's stdout; throws (stderr tail) when there is none. */
export function parseDrillResult(stdout: string, stderr: string): DrillResult {
	const last = stdout
		.split('\n')
		.filter((line) => line.startsWith(DRILL_RESULT_PREFIX))
		.at(-1);
	if (last === undefined) {
		const tail = stderr.trimEnd().split('\n').slice(-15).join('\n');
		throw new Error(`the engine child printed no result line:\n${tail}`);
	}
	let parsed: unknown = null;
	try {
		parsed = JSON.parse(last.slice(DRILL_RESULT_PREFIX.length));
	} catch {
		parsed = null;
	}
	const shape = (parsed ?? {}) as { ok?: unknown; value?: unknown; error?: unknown };
	if (shape.ok === true && 'value' in shape) return { ok: true, value: shape.value };
	if (shape.ok === false && typeof shape.error === 'string')
		return { ok: false, error: shape.error };
	throw new Error(`malformed result line: ${last}`);
}

/** `<code>: <message>` — a DedaloError's code, else the error class name. */
export function describeError(error: unknown): string {
	if (!(error instanceof Error)) return String(error);
	const code = (error as { code?: unknown }).code;
	return `${typeof code === 'string' ? code : error.name}: ${error.message}`;
}

/** Inherited keys the child must not see: the installation's media root spellings. */
export const COPY_ENGINE_DROPPED_KEYS = ['MEDIA_PATH', 'DEDALO_MEDIA_PATH'] as const;

export interface CopyEngineEnvInput {
	readonly base: Readonly<Record<string, string | undefined>>;
	readonly privateDir: string;
	readonly suiteDb: string;
	readonly mediaRoot: string;
	readonly processesDir: string;
}

/** The child's environment: the drill's own, with every seam pinned on top. */
export function copyEngineEnv(input: CopyEngineEnvInput): Record<string, string> {
	const paths = [
		['privateDir', input.privateDir],
		['mediaRoot', input.mediaRoot],
		['processesDir', input.processesDir],
	] as const;
	for (const [name, path] of paths) {
		if (!isAbsolute(path)) throw new Error(`copy drill: ${name} must be absolute (got '${path}')`);
	}
	if (!/^[A-Za-z0-9_]+$/.test(input.suiteDb)) {
		throw new Error(`copy drill: suite database '${input.suiteDb}' is not an identifier`);
	}
	const dropped: readonly string[] = COPY_ENGINE_DROPPED_KEYS;
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(input.base)) {
		if (value !== undefined && !dropped.includes(key)) env[key] = value;
	}
	return {
		...env,
		DEDALO_PRIVATE_DIR: input.privateDir,
		DB_NAME: input.suiteDb,
		DEDALO_DATABASE_CONN: input.suiteDb,
		DEDALO_TEST_MEDIA_ROOT: input.mediaRoot,
		DEDALO_MEDIA_PROCESSES_DIR: input.processesDir,
		DEDALO_MEDIA_PUBLIC_QUALITIES: JSON.stringify(COPY_DRILL_QUALITIES),
		DEDALO_RECONCILE_SCHEDULER_ENABLED: 'false',
	};
}

/** Every file under `root`, relative and sorted; a symlink is named, never followed. */
export function listTree(root: string): string[] {
	if (!existsSync(root)) return [];
	const out: string[] = [];
	const walk = (rel: string): void => {
		for (const name of readdirSync(rel === '' ? root : join(root, rel))) {
			const path = rel === '' ? name : `${rel}/${name}`;
			const stat = lstatSync(join(root, path));
			if (stat.isSymbolicLink()) out.push(`${path} -> (symlink)`);
			else if (stat.isDirectory()) walk(path);
			else out.push(path);
		}
	};
	walk('');
	return out.sort();
}

/** What the child returns, per command (the drill reads these, never engine types). */
export interface CopyPlanView {
	put: string[];
	del: string[];
	mark: { key: string; published: boolean }[];
}
export interface RulesView {
	expected_hash: string;
	applied_hash: string;
	root: string | null;
	dropped: string[];
}
/** MEDIA_COPY_RECONCILE's report + the drill host's outcome (state, error code). */
export interface ReconcileView {
	drift: number;
	applied: number;
	state: string | null;
	error: string | null;
}
/**
 * An unpublish through the REAL latency hook: the marker flip reaches the started copy
 * worker (pub/ transition seam), which withdraws at once and runs the host's lane.
 * `round` = the lane round's CopyApplyReport state/error (null: no round reported).
 */
export interface UnpublishView {
	key: string;
	/** The key's public work files, read while it was still published. */
	paths: string[];
	round: { state: string; error: string | null } | null;
}
/** GET /v1/media/manifest (phase-5 agent route). */
export interface ManifestView {
	entries: { path: string; size: number; sha256: string }[];
	irregular: string[];
	markers: string[];
	next: string | null;
}
