#!/usr/bin/env bun
/**
 * PUBLICATION-HOST COPY DRILL — THE ENGINE SIDE, one command per process.
 *
 * Spawned by the copy pass of scripts/publication_host_agent_drill.ts with an environment
 * that repoints the engine (copyEngineEnv, publication_host_copy_drill_kit.ts): the SUITE
 * database, a scratch private dir (the registry, the host secrets, the runtime file, the
 * sha cache) and a scratch WORK media root (the marker store and the media files the
 * planner walks).
 *
 * WHY A CHILD. The engine reads its private dir (src/config/env.ts privateDir) and its
 * media root (config.media) ONCE, when the module loads. The drill process loaded them at
 * the installation's values, so only a fresh process can run the engine against scratch
 * stores without a test hook in engine code. One command per process also proves that
 * every piece of state the next step relies on is on DISK (registry, runtime, pending
 * deletions, sha cache): nothing survives in memory between steps.
 *
 * WHAT EACH COMMAND DRIVES:
 *   pair       secrets → registry entry → the live pairing proof (proveHostPairing);
 *   rules      the phase-1 profile rendered over the agent's reported (COPY) root, applied (nginx:
 *              the engine's host-wide map pushed first, as apply_rules does);
 *   plan       planCopy (writes only the sha cache);
 *   reconcile  MEDIA_COPY_RECONCILE.run({apply: true}) — the correctness path (M3);
 *   publish    the work marker (applyTableState): no worker runs, so the copy is left to
 *              `reconcile`;
 *   unpublish  the LATENCY path, for real: the copy worker is started as server.ts starts
 *              it (the facade's startMediaCopy, hooked to the pub/ transition seam), the
 *              work marker is withdrawn, and the flip reaches the worker — withdrawNow at
 *              once, then the host's lane run — which this command waits out (idle);
 *   runtime    the drill host's runtime row.
 *
 * REFUSES, before it can write anywhere (exit 2, nothing written):
 *   - an argv outside the closed command set (parseEngineArgv);
 *   - a private dir that is unset, relative, or not marked .dedalo_copy_drill_private;
 *   - a media root that is unset, relative, or not marked .dedalo_test_media;
 * and every command asserts the suite database's test marker row first
 * (assertTestDatabase). It writes NO database row: the suite database supplies only the
 * media-copy target lock.
 *
 * Prints ONE result line (`DRILL_RESULT {…}`) as its last stdout line; engine logs may
 * surround it. Exit 0 = ok result, 1 = failure result, 2 = refused (no result line).
 */

import { readFileSync } from 'node:fs';
import type { PublicationHostRecord } from '../../src/core/publication_host/registry.ts';
import { TEST_MEDIA_MARKER } from '../../test/helpers/test_media_root.ts';
import {
	COPY_DRILL_ACTOR,
	COPY_DRILL_DATABASE,
	COPY_DRILL_HOST,
	COPY_DRILL_TABLE,
	COPY_ENGINE_USAGE,
	type CopyEngineCommand,
	type CopyPlanView,
	describeError,
	engineChildRefusal,
	parseEngineArgv,
	type ReconcileView,
	type RulesView,
	renderDrillResult,
	type UnpublishView,
} from './publication_host_copy_drill_kit.ts';

interface PairSpec {
	record: PublicationHostRecord;
	token_file: string;
	bundle_file: string;
}

async function requireHost(): Promise<PublicationHostRecord> {
	const { getHost } = await import('../../src/core/publication_host/registry.ts');
	const host = getHost(COPY_DRILL_HOST);
	if (host === null) throw new Error(`no '${COPY_DRILL_HOST}' in the registry: run 'pair' first`);
	return host;
}

/** Secrets, then the registry entry, then the live pairing proof (health → fingerprint). */
async function pair(specFile: string): Promise<{ name: string; paired: boolean }> {
	const spec = JSON.parse(readFileSync(specFile, 'utf8')) as PairSpec;
	if (spec.record.name !== COPY_DRILL_HOST) {
		throw new Error(`the pair spec names '${spec.record.name}', not '${COPY_DRILL_HOST}'`);
	}
	const { updateRegistry } = await import('../../src/core/publication_host/registry.ts');
	const { writeHostSecrets } = await import('../../src/core/publication_host/secrets.ts');
	const { proveHostPairing } = await import('../../src/core/publication_host/agent_client.ts');
	writeHostSecrets(
		COPY_DRILL_HOST,
		readFileSync(spec.token_file, 'utf8').trim(),
		readFileSync(spec.bundle_file, 'utf8'),
	);
	updateRegistry((current) => ({
		version: 1,
		hosts: [...current.hosts.filter((host) => host.name !== COPY_DRILL_HOST), spec.record],
	}));
	await proveHostPairing(await requireHost());
	return { name: COPY_DRILL_HOST, paired: true };
}

/**
 * The phase-1 profile over the agent's reported root (its COPY root), applied — on nginx with
 * the host-wide map AFTER the engine's map is pushed (`rules.map`), the order apply_rules keeps
 * (publication_hosts.ts): the include uses the map's variables.
 */
async function rules(): Promise<RulesView> {
	const host = await requireHost();
	const { hostApplyRules, hostApplyRulesMap, hostStatus } = await import(
		'../../src/core/publication_host/agent_client.ts'
	);
	const { expectedNginxMap, expectedRulesForHost } = await import(
		'../../src/core/publication_host/rules.ts'
	);
	const status = await hostStatus(host.name);
	const map = expectedNginxMap(status);
	const loaded = status.rules.map?.managed === true ? status.rules.map.hash : null;
	if (map !== null && loaded !== map.hash) {
		await hostApplyRulesMap(host.name, { text: map.text, hash: map.hash }, COPY_DRILL_ACTOR);
	}
	const expected = expectedRulesForHost(host, status);
	const applied = await hostApplyRules(
		host.name,
		{ server: expected.server, text: expected.text, hash: expected.hash },
		COPY_DRILL_ACTOR,
	);
	return {
		expected_hash: expected.hash,
		applied_hash: applied.hash,
		root: status.media.root,
		dropped: expected.dropped,
	};
}

const byKey = (a: { key: string }, b: { key: string }) =>
	a.key < b.key ? -1 : a.key > b.key ? 1 : 0;

async function plan(): Promise<CopyPlanView> {
	const { planCopy } = await import('../../src/diffusion/targets/mediastore/media_copy.ts');
	const planned = await planCopy(COPY_DRILL_HOST);
	return {
		put: planned.put.map((file) => file.path).sort(),
		del: [...planned.del].sort(),
		mark: planned.mark.map((m) => ({ key: m.key, published: m.published })).sort(byKey),
	};
}

/** The correctness path (M3): the registered definition, applied. */
async function reconcile(): Promise<ReconcileView> {
	const { MEDIA_COPY_RECONCILE } = await import('../../src/diffusion/api/reconcile.ts');
	const report = await MEDIA_COPY_RECONCILE.run({ apply: true });
	const hosts = (report.detail.hosts ?? {}) as Record<
		string,
		{ state: string | null; error: string | null }
	>;
	const outcome = hosts[COPY_DRILL_HOST];
	return {
		drift: report.drift,
		applied: report.applied,
		state: outcome?.state ?? null,
		error: outcome?.error ?? null,
	};
}

/** The work side's publication truth for one record: dbs/ marker + pub/ union. */
async function publish(tipo: string, id: string): Promise<{ applied: number }> {
	const { applyTableState } = await import('../../src/diffusion/targets/mediastore/media_index.ts');
	const result = await applyTableState(COPY_DRILL_DATABASE, COPY_DRILL_TABLE, tipo, [id], []);
	if (result.applied !== 1) {
		throw new Error(
			`applyTableState published ${result.applied} (skipped: ${result.skipped.join(', ')})`,
		);
	}
	return { applied: result.applied };
}

async function publicPathsOf(key: string): Promise<string[]> {
	const { desiredPublicFiles } = await import(
		'../../src/diffusion/targets/mediastore/media_copy.ts'
	);
	const paths: string[] = [];
	for await (const file of desiredPublicFiles()) {
		if (file.key === key) paths.push(file.path);
	}
	return paths.sort();
}

/**
 * The unpublish, through the REAL latency hook (header). A failed round is REPORTED, not
 * thrown: the drill judges by the runtime file and the agent's disk.
 */
async function unpublish(tipo: string, id: string): Promise<UnpublishView> {
	const { applyTableState, makeMarkerKey } = await import(
		'../../src/diffusion/targets/mediastore/media_index.ts'
	);
	const { startMediaCopy } = await import('../../src/diffusion/api/media_copy.ts');
	const { activeMediaCopyWorker } = await import(
		'../../src/diffusion/targets/mediastore/media_copy_worker.ts'
	);
	const key = makeMarkerKey(tipo, id);
	if (key === null) throw new Error(`'${tipo}_${id}' is not a marker key`);
	const paths = await publicPathsOf(key);
	const seen: { round: UnpublishView['round'] } = { round: null };
	const stop = startMediaCopy({
		afterSync: (host, report) => {
			if (host === COPY_DRILL_HOST) seen.round = { state: report.state, error: report.error };
		},
	});
	try {
		const result = await applyTableState(COPY_DRILL_DATABASE, COPY_DRILL_TABLE, tipo, [], [id]);
		if (result.applied !== 1) throw new Error(`applyTableState unpublished ${result.applied}`);
		const worker = activeMediaCopyWorker();
		if (worker === null) throw new Error('the copy worker did not start');
		await worker.idle();
	} finally {
		stop();
	}
	return { key, paths, round: seen.round };
}

async function runtime(): Promise<unknown> {
	const { loadRuntime } = await import('../../src/core/publication_host/runtime.ts');
	return (await loadRuntime())[COPY_DRILL_HOST] ?? null;
}

const COMMANDS: Record<CopyEngineCommand, (args: readonly string[]) => Promise<unknown>> = {
	pair: ([spec]) => pair(spec as string),
	rules: () => rules(),
	plan: () => plan(),
	reconcile: () => reconcile(),
	publish: ([tipo, id]) => publish(tipo as string, id as string),
	unpublish: ([tipo, id]) => unpublish(tipo as string, id as string),
	runtime: () => runtime(),
};

if (import.meta.main) {
	const parsed = parseEngineArgv(process.argv.slice(2));
	if (parsed === null) {
		console.error(COPY_ENGINE_USAGE);
		process.exit(2);
	}
	const refusal = engineChildRefusal(process.env, TEST_MEDIA_MARKER);
	if (refusal !== null) {
		console.error(`publication_host_copy_engine REFUSED: ${refusal}. NOTHING WAS WRITTEN.`);
		process.exit(2);
	}
	try {
		const { assertTestDatabase } = await import('../../src/core/test_data/test_database_marker.ts');
		await assertTestDatabase('publication_host_copy_engine');
		const value = await COMMANDS[parsed.command](parsed.args);
		console.log(renderDrillResult({ ok: true, value }));
		process.exit(0);
	} catch (error) {
		console.log(renderDrillResult({ ok: false, error: describeError(error) }));
		process.exit(1);
	}
}
