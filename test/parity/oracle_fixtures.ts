/**
 * ORACLE HARVEST fixture store (DEC-14b — "the safety net must survive PHP's
 * decommissioning").
 *
 * The parity differentials replay RQOs against the LIVE PHP oracle through
 * PhpApiClient. This module gives that client a record/replay seam so the
 * exact PHP responses can be frozen while the oracle is still alive and served
 * back after it is gone:
 *
 *   ORACLE_MODE=live     — live HTTP to PHP (HISTORICAL since the 2026-07-11
 *                          cutover: the oracle is decommissioned; nothing
 *                          answers).
 *   ORACLE_MODE=record   — live HTTP, and every (request → response) pair is
 *                          frozen into test/parity/fixtures/oracle_harvest/
 *                          <gate>.json (one file per parity gate; the gate
 *                          name comes from ORACLE_HARVEST_GATE, set by
 *                          scripts/oracle_harvest.ts). Never run the full
 *                          suite in this mode by hand — use the harvest
 *                          script, which runs one gate per process so each
 *                          store file is complete and self-consistent.
 *   ORACLE_MODE=fixtures — NO network. PhpApiClient serves the recorded
 *                          response for each request (matched by canonical
 *                          request hash) and throws loudly on a miss.
 *
 * Provenance (extends the batch-1 pattern of scripts/capture_fixture.ts and
 * test/integration/fixtures/diffusion_old_engine_cells.json): every store file
 * carries captured_at, capture_commit, an oracle base-URL hash (the URL itself
 * stays out of the repo), the entity, and a drift_policy.
 *
 * SECRETS: login RQOs are redacted (username/auth → placeholders) BEFORE
 * hashing and storage, so (a) no credential ever lands in a fixture file and
 * (b) fixture-mode lookups succeed on machines with no oracle credentials at
 * all. Response csrf_token values are likewise replaced with a placeholder.
 */

import { createHash } from 'node:crypto';
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

export type OracleMode = 'live' | 'record' | 'fixtures';

/** Directory of the harvested golden fixtures (one JSON file per parity gate). */
export const oracleHarvestDir: string = join(import.meta.dir, 'fixtures', 'oracle_harvest');

const LOGIN_USER_PLACEHOLDER = '__ORACLE_USER__';
const LOGIN_AUTH_PLACEHOLDER = '__ORACLE_AUTH__';
const CSRF_PLACEHOLDER = '__FIXTURE_CSRF__';

/** One frozen oracle interaction. `kind` mirrors the PhpApiClient entrypoint. */
export interface RecordedInteraction {
	kind: 'json' | 'raw';
	/** The (redacted) request, kept for human drift adjudication. */
	rqo: Record<string, unknown>;
	status: number;
	/** kind=json */
	body?: Record<string, unknown>;
	/** kind=raw */
	contentType?: string | null;
	text?: string;
}

interface HarvestFile {
	meta: Record<string, unknown>;
	interactions: Record<string, RecordedInteraction>;
}

/** The active oracle mode. Unknown values fail loudly — a typo must not silently mean the default.
 *
 * CUTOVER 2026-07-11 (runbook §3): the DEFAULT flipped live → fixtures. The
 * PHP oracle is decommissioned (frozen store + pinned DB snapshot are the
 * baseline-of-record); 'live'/'record' remain selectable explicitly but there
 * is nothing left to answer them — a re-harvest is impossible by definition,
 * and any fixture change from here on is a deliberate contract edit
 * (engineering/WIRE_CONTRACT.md). */
export function oracleMode(): OracleMode {
	const raw = process.env.ORACLE_MODE ?? 'fixtures';
	if (raw === 'live' || raw === 'record' || raw === 'fixtures') return raw;
	throw new Error(`Unknown ORACLE_MODE '${raw}' — expected live | record | fixtures.`);
}

/** JSON.stringify with recursively sorted object keys (stable request identity). */
export function canonicalJson(value: unknown): string {
	const sortKeys = (node: unknown): unknown => {
		if (Array.isArray(node)) return node.map(sortKeys);
		if (node !== null && typeof node === 'object') {
			const sorted: Record<string, unknown> = {};
			for (const key of Object.keys(node as Record<string, unknown>).sort()) {
				sorted[key] = sortKeys((node as Record<string, unknown>)[key]);
			}
			return sorted;
		}
		return node;
	};
	return JSON.stringify(sortKeys(value));
}

/**
 * Redact credentials from a login RQO (and ONLY from a login RQO — everything
 * else is stored verbatim; write-path gates never reach the store at all).
 * Applied identically at record and replay time, so the request hash is
 * credential-independent.
 */
export function redactRqoSecrets(rqo: Record<string, unknown>): Record<string, unknown> {
	if (rqo.action !== 'login') return rqo;
	const clone = structuredClone(rqo);
	const options = clone.options as Record<string, unknown> | undefined;
	if (options && typeof options === 'object') {
		if ('username' in options) options.username = LOGIN_USER_PLACEHOLDER;
		if ('auth' in options) options.auth = LOGIN_AUTH_PLACEHOLDER;
	}
	return clone;
}

/** Stable identity of one oracle request. */
export function hashRequest(kind: 'json' | 'raw', rqo: Record<string, unknown>): string {
	return createHash('sha256')
		.update(`${kind}\n${canonicalJson(redactRqoSecrets(rqo))}`)
		.digest('hex')
		.slice(0, 24);
}

/** Session csrf tokens are volatile secrets — never freeze a real one. */
function redactResponseBody(body: Record<string, unknown>): Record<string, unknown> {
	if (typeof body.csrf_token !== 'string') return body;
	const clone = structuredClone(body);
	clone.csrf_token = CSRF_PLACEHOLDER;
	return clone;
}

// ---------------------------------------------------------------------------
// RECORD side (ORACLE_MODE=record; driven by scripts/oracle_harvest.ts)
// ---------------------------------------------------------------------------

const recordedHashes = new Set<string>();
let appendLogPath: string | null = null;

function harvestGateName(): string {
	const gate = process.env.ORACLE_HARVEST_GATE;
	if (!gate) {
		throw new Error(
			'ORACLE_MODE=record needs ORACLE_HARVEST_GATE=<gate name> so the store file can be attributed. ' +
				'Run the harvest through `bun run scripts/oracle_harvest.ts`, not by hand.',
		);
	}
	return gate;
}

/** The record-mode append log for one gate (finalized by scripts/oracle_harvest.ts). */
export function harvestAppendLogPath(gate: string): string {
	return join(oracleHarvestDir, `${gate}.ndjson.tmp`);
}

/**
 * Freeze one live interaction. Write-through APPEND log: `bun test` (1.3.9)
 * never fires process 'exit'/'beforeExit' handlers, so an in-memory store
 * flushed at exit would silently record nothing — each interaction is
 * appended as one NDJSON line the moment it happens, and the harvest script
 * wraps the log into the final provenance-carrying <gate>.json after the test
 * process ends.
 *
 * First response wins per request hash: read requests are idempotent within a
 * gate (write gates are excluded from the harvest entirely), so a repeat
 * differs only in volatile noise (debug blocks, csrf) and recording it again
 * would add bytes without information.
 */
export function recordInteraction(
	kind: 'json' | 'raw',
	rqo: Record<string, unknown>,
	interaction: {
		status: number;
		body?: Record<string, unknown>;
		contentType?: string | null;
		text?: string;
	},
): void {
	const gate = harvestGateName(); // throws early when unattributed
	const hash = hashRequest(kind, rqo);
	if (recordedHashes.has(hash)) return;
	recordedHashes.add(hash);
	const frozen: RecordedInteraction = {
		kind,
		rqo: redactRqoSecrets(rqo),
		status: interaction.status,
		...(interaction.body !== undefined ? { body: redactResponseBody(interaction.body) } : {}),
		...(interaction.contentType !== undefined ? { contentType: interaction.contentType } : {}),
		...(interaction.text !== undefined ? { text: interaction.text } : {}),
	};
	if (appendLogPath === null) {
		mkdirSync(oracleHarvestDir, { recursive: true });
		appendLogPath = harvestAppendLogPath(gate);
		writeFileSync(appendLogPath, ''); // truncate any stale log from a prior run
	}
	appendFileSync(appendLogPath, `${JSON.stringify({ hash, interaction: frozen })}\n`);
}

/**
 * Wrap a finished gate's append log into the final versioned store file, with
 * the batch-1-style provenance meta. Called by scripts/oracle_harvest.ts (in
 * the PARENT process, after the `bun test` child exits). Returns the number
 * of interactions, or null when the gate recorded nothing.
 */
export function finalizeHarvestGate(
	gate: string,
	provenance: { captureCommit: string; oracleBaseUrl: string; entity: string },
): number | null {
	const logPath = harvestAppendLogPath(gate);
	if (!existsSync(logPath)) return null;
	const interactions: Record<string, RecordedInteraction> = {};
	for (const line of readFileSync(logPath, 'utf8').split('\n')) {
		if (line.trim() === '') continue;
		const parsed = JSON.parse(line) as { hash: string; interaction: RecordedInteraction };
		if (!(parsed.hash in interactions)) interactions[parsed.hash] = parsed.interaction;
	}
	const count = Object.keys(interactions).length;
	if (count === 0) {
		rmSync(logPath);
		return null;
	}
	const file: HarvestFile = {
		meta: {
			gate,
			captured_at: new Date().toISOString(),
			capture_commit: provenance.captureCommit,
			// The URL itself stays out of the repo; the hash detects re-harvests
			// against a DIFFERENT oracle instance (which would be a new baseline).
			oracle_base_url_sha256: createHash('sha256')
				.update(provenance.oracleBaseUrl)
				.digest('hex')
				.slice(0, 16),
			entity: provenance.entity,
			interaction_count: count,
			drift_policy:
				'These interactions freeze LIVE PHP oracle responses over the mutable shared DB. If this ' +
				'gate reds under ORACLE_MODE=fixtures with NO engine change, the shared data moved after the ' +
				'harvest: adjudicate (data-side diff only?), then re-harvest this gate with ' +
				'`bun run scripts/oracle_harvest.ts --gate <name>.test.ts` in the same change that adjudicates the red. ' +
				'After PHP decommissioning there is no re-harvest: fixtures + the cutover DB snapshot are the pinned pair (engineering/ORACLE_HARVEST.md).',
		},
		interactions,
	};
	writeFileSync(join(oracleHarvestDir, `${gate}.json`), `${JSON.stringify(file, null, '\t')}\n`);
	rmSync(logPath);
	return count;
}

// ---------------------------------------------------------------------------
// REPLAY side (ORACLE_MODE=fixtures)
// ---------------------------------------------------------------------------

let mergedStore: Map<string, RecordedInteraction> | null = null;
let loadedFileCount = 0;

/** Lazy-load and merge every harvested gate file (first-wins per request hash). */
function loadStore(): Map<string, RecordedInteraction> {
	if (mergedStore) return mergedStore;
	mergedStore = new Map();
	if (!existsSync(oracleHarvestDir)) return mergedStore;
	const files = readdirSync(oracleHarvestDir)
		.filter((name) => name.endsWith('.json'))
		.sort();
	for (const name of files) {
		const parsed = JSON.parse(readFileSync(join(oracleHarvestDir, name), 'utf8')) as HarvestFile;
		for (const [hash, interaction] of Object.entries(parsed.interactions)) {
			if (!mergedStore.has(hash)) mergedStore.set(hash, interaction);
		}
		loadedFileCount += 1;
	}
	return mergedStore;
}

/** True when a harvested store exists on disk (fixture mode's oracle-presence probe). */
export function fixturesAvailable(): boolean {
	return loadStore().size > 0;
}

/** Store shape summary for the canary / coverage reporting. */
export function fixtureStoreStats(): { files: number; interactions: number } {
	const store = loadStore();
	return { files: loadedFileCount, interactions: store.size };
}

/** Serve one recorded interaction, or throw with re-harvest guidance. */
export function lookupInteraction(
	kind: 'json' | 'raw',
	rqo: Record<string, unknown>,
): RecordedInteraction {
	const hash = hashRequest(kind, rqo);
	const found = loadStore().get(hash);
	if (!found) {
		throw new Error(
			`ORACLE_MODE=fixtures: no recorded oracle response for ${kind} request action='${String(
				rqo.action,
			)}' (hash ${hash}). Either the gate issues a request that was never harvested (re-run \`bun run scripts/oracle_harvest.ts\` while the PHP oracle is alive), or the request is non-deterministic / side-effecting and the gate belongs in FIXTURE_EXEMPT_GATES (test/parity/oracle_fixtures.ts). See engineering/ORACLE_HARVEST.md.`,
		);
	}
	return found;
}

// ---------------------------------------------------------------------------
// Gate classification (the fixture-exempt list — engineering/ORACLE_HARVEST.md)
// ---------------------------------------------------------------------------

/**
 * Parity gates that NEED THE LIVE ORACLE. Two reasons (per-line comments;
 * untagged lines are [write]):
 *
 *  [write] — the gate drives real mutations through the PHP oracle (create /
 *    save / delete / tool mutations / widget actions). Replaying a frozen
 *    response would assert nothing about a write that never happened.
 *  [scratch-read] — the gate SEEDS scratch records per run (fresh section_ids)
 *    and then READS them through PHP; the request hashes can never match a
 *    frozen store (proven: these three red with lookup misses under
 *    ORACLE_MODE=fixtures, 2026-07-07).
 *
 * Consequences:
 *   - scripts/oracle_harvest.ts never records them;
 *   - they gate on hasLivePhpOracle() and SKIP under ORACLE_MODE=fixtures.
 * After PHP decommissioning these gates retire with the oracle — their
 * coverage must be re-expressed as TS-native integration tests (tracked in
 * engineering/ORACLE_HARVEST.md §cutover).
 */
export const FIXTURE_EXEMPT_GATES: readonly string[] = [
	// EMPTY since the 2026-07-11 cutover (runbook §3): the 23 live-only gates
	// retired WITH the PHP oracle — their surviving contracts live in the
	// TS-native test/unit/*_native.test.ts twins (the DEC-14b punch list in
	// engineering/ORACLE_HARVEST.md maps every retired gate to its twin).
];

/**
 * Parity-directory tests with NO PhpApiClient traffic (TS + shared-DB only;
 * some use hasPhpCredentials purely as a dev-environment probe). Unaffected by
 * the oracle mode: they run identically in live and fixture modes and are
 * excluded from the harvest manifest.
 */
export const NO_ORACLE_GATES: readonly string[] = [
	'import_files_filename_differential.test.ts',
	'media_files_info_differential.test.ts',
	'permissions_differential.test.ts',
	'projects_filter_differential.test.ts',
	'publication_toggle_doubling_differential.test.ts',
	'regenerate_differential.test.ts',
	'tools_register_differential.test.ts',
	'ts_mutations_differential.test.ts',
	'ts_mutations_hardening.test.ts',
];
