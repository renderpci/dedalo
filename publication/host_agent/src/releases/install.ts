/**
 * release.install / release.rollback — the §3 install of one Publication API release.
 *
 * ONE flow per API, under a per-API single-flight lock (a second operation is 409 `busy`):
 *
 *   validate (api, id, sha)
 *   → shared config preflight (refused before the body is read)
 *   → sweep releases an interrupted install left without their record
 *   → releases/<id> exists?  verify its recorded .bundle_sha256 = X-Bundle-Sha256, body unread,
 *                            then only promote (D9)
 *   → else, through the store: createStaging → extractBundle(bundleLimits(),
 *         reservedBundlePaths(api)) → sha compare → v1: php -l every .php, link shared/ config
 *         (D8) | v2: node_modules present (D6) → commitStaging into releases/<id>
 *         → v2: scratch boot FROM releases/<id> (the only dir exec.ts accepts, and the only
 *           tree the v2 user can read) on a free loopback port, health within a bound
 *         → write .bundle_sha256 LAST (a release with its record passed every check);
 *           any failure removes releases/<id>
 *   → promote (atomic current swap)
 *   → v2: restart the unit, poll V2_HEALTH_URL; on failure promote back, restart, report
 *         (audited as release.auto_rollback)
 *   → prune → audit (release.install, outcome ok).
 *
 * A failure before the swap leaves the old release serving. v2 reads only process.env: its
 * unit has EnvironmentFile=shared/v2.env, the scratch boot gets the same file through
 * exec().v2ScratchBoot, and the bundle may not carry an env file. Every child process goes
 * through exec.ts.
 */

import { existsSync, lstatSync } from 'node:fs';
import { readdir, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { type AuditOutcome, audit } from '../audit';
import { config } from '../config';
import { ApiError, ConflictError, ReleaseRefusedError, ValidationError } from '../errors';
import { exec } from '../exec';
import {
  apiLayout,
  BUNDLE_SHA_FILE,
  bundleLimits,
  commitStaging,
  createStaging,
  currentRelease,
  listReleases,
  previousRelease,
  promote,
  pruneReleases,
  RELEASE_ID,
  ReleaseStoreError,
  releaseExists,
  reservedBundlePaths,
  V1_CONFIG_DIR,
  V1_SHARED_CONFIG,
  V1_SHARED_HEADERS,
  V2_SHARED_ENV,
} from './store';
import { type ApiName, BundleRefused, extractBundle } from './ustar';

export { BUNDLE_SHA_FILE, V1_CONFIG_DIR, V1_SHARED_CONFIG, V1_SHARED_HEADERS, V2_SHARED_ENV } from './store';

export interface InstallRequest {
  api: ApiName;
  releaseId: string;
  sha256: string;
  actor: string;
  body: ReadableStream<Uint8Array>;
}
export interface InstallResult {
  api: ApiName;
  from: string | null;
  to: string;
  reused: boolean;
  health: 'ok';
}

const SHA256_HEX = /^[0-9a-f]{64}$/;
const PHP_LINT_CONCURRENCY = 8;
/** Refusals that happen AFTER a swap: the host did not carry the release. */
const HOST_FAILURE_REASONS: ReadonlySet<string> = new Set(['health_failed', 'rollback_unhealthy']);

export interface InstallTiming {
  /** Bound for the scratch-booted v2 to answer 200. */
  scratchHealthMs: number;
  /** Bound for the restarted unit to answer 200 on V2_HEALTH_URL. */
  restartHealthMs: number;
  pollIntervalMs: number;
  /** One probe's own timeout. */
  probeTimeoutMs: number;
}

const DEFAULT_TIMING: InstallTiming = {
  scratchHealthMs: 60_000,
  restartHealthMs: 60_000,
  pollIntervalMs: 500,
  probeTimeoutMs: 5_000,
};

let timing: InstallTiming = DEFAULT_TIMING;
let v2HealthUrlOverride: string | null = null;

/** Test seam: shorter health bounds and a loopback fake for V2_HEALTH_URL. Refused outside NODE_ENV=test. */
export function setInstallSeamsForTests(seams: { timing?: Partial<InstallTiming>; v2HealthUrl?: string }): () => void {
  if (config.NODE_ENV !== 'test') {
    throw new Error('setInstallSeamsForTests is refused outside NODE_ENV=test');
  }
  const previous = { timing, v2HealthUrlOverride };
  timing = { ...timing, ...seams.timing };
  if (seams.v2HealthUrl !== undefined) v2HealthUrlOverride = seams.v2HealthUrl;
  return () => {
    timing = previous.timing;
    v2HealthUrlOverride = previous.v2HealthUrlOverride;
  };
}

// ── single flight ────────────────────────────────────────────────────────────

const inFlight = new Set<ApiName>();

/** Claimed SYNCHRONOUSLY (before any await), so two calls in the same tick cannot both pass. */
function claim(api: ApiName, verb: 'install' | 'rollback'): () => void {
  if (inFlight.has(api)) {
    throw new ConflictError(`A release operation on ${api} is already running; this ${verb} was refused. Retry when it finishes.`, 'busy');
  }
  inFlight.add(api);
  return () => {
    inFlight.delete(api);
  };
}

// ── install ──────────────────────────────────────────────────────────────────

export async function installRelease(req: InstallRequest): Promise<InstallResult> {
  validateRequest(req);
  const release = claim(req.api, 'install');
  try {
    return await installLocked(req);
  } catch (raw) {
    const error = fromStore(raw);
    await auditFailure('release.install', req.actor, { api: req.api, release: req.releaseId, sha256: req.sha256 }, error);
    throw error;
  } finally {
    release();
  }
}

function validateRequest(req: InstallRequest): void {
  assertApi(req.api);
  if (!RELEASE_ID.test(req.releaseId)) {
    throw new ValidationError('X-Release-Id must be <version>_<digest7>, e.g. 7.0.3_a1b2c3d', 'release_id_invalid');
  }
  if (!SHA256_HEX.test(req.sha256)) {
    throw new ValidationError('X-Bundle-Sha256 must be 64 lowercase hex characters');
  }
}

function assertApi(api: string): asserts api is ApiName {
  if (api !== 'v1' && api !== 'v2') throw new ValidationError('api must be v1 or v2');
}

async function installLocked(req: InstallRequest): Promise<InstallResult> {
  const { api, releaseId } = req;
  try {
    sharedPreflight(api);
  } catch (error) {
    await discard(req.body);
    throw error;
  }
  const swept = await sweepInterrupted(api);

  let fresh = false;
  if (releaseExists(api, releaseId)) {
    await discard(req.body);
    await verifyRecordedSha(api, releaseId, req.sha256);
    if (currentRelease(api) === releaseId) {
      if (api === 'v2') {
        const health = await waitHealthy(v2HealthUrl(), timing.restartHealthMs);
        if (!health.ok) {
          throw new ReleaseRefusedError(
            'health_failed',
            `v2 release ${releaseId} is already current but ${v2HealthUrl()} does not answer 200 (${health.last}); nothing was changed`,
            { rolled_back_to: null },
          );
        }
      }
      await audit({
        actor: req.actor,
        action: 'release.install',
        outcome: 'ok',
        detail: { api, from: releaseId, to: releaseId, reused: true, sha256: req.sha256, pruned: [], swept },
      });
      return { api, from: releaseId, to: releaseId, reused: true, health: 'ok' };
    }
  } else {
    await stageRelease(req);
    fresh = true;
  }

  const swap = await promote(api, releaseId);
  if (api === 'v2') await restartOrRestore(swap.from, swap.to, fresh, req.actor);

  const pruned = await pruneQuietly(api);
  await audit({
    actor: req.actor,
    action: 'release.install',
    outcome: 'ok',
    detail: { api, from: swap.from, to: swap.to, reused: !fresh, sha256: req.sha256, pruned, swept },
  });
  return { api, from: swap.from, to: swap.to, reused: !fresh, health: 'ok' };
}

/** The operator's config each API needs before anything is staged. Refused with the file to create. */
function sharedPreflight(api: ApiName): void {
  const layout = apiLayout(api);
  if (api === 'v1') {
    const configFile = join(layout.shared, V1_SHARED_CONFIG);
    if (!existsSync(configFile)) {
      throw new ReleaseRefusedError(
        'shared_config_missing',
        `v1 has no ${configFile}. Create it (the Publication API v1 configuration, kept outside every release; start from config_api/sample.server_config_api.php) and install again.`,
      );
    }
    return;
  }
  const envFile = join(layout.shared, V2_SHARED_ENV);
  if (!existsSync(envFile)) {
    throw new ReleaseRefusedError(
      'shared_config_missing',
      `v2 has no ${envFile}. Create it (the Publication API v2 environment its unit's EnvironmentFile= reads) and install again.`,
    );
  }
}

function hasRecord(api: ApiName, releaseId: string): boolean {
  return existsSync(join(apiLayout(api).releases, releaseId, BUNDLE_SHA_FILE));
}

/**
 * A release dir without its record that is not current can only be an install this agent
 * started and never finished: only commitStaging creates release dirs, the record is written
 * last, and this agent is the only writer (D10). Swept under the per-API lock, reported.
 */
async function sweepInterrupted(api: ApiName): Promise<string[]> {
  const current = currentRelease(api);
  const swept: string[] = [];
  for (const id of listReleases(api)) {
    if (id === current || hasRecord(api, id)) continue;
    await rm(join(apiLayout(api).releases, id), { recursive: true, force: true });
    swept.push(id);
  }
  return swept;
}

async function verifyRecordedSha(api: ApiName, releaseId: string, declared: string): Promise<void> {
  const releaseDir = join(apiLayout(api).releases, releaseId);
  let recorded: string;
  try {
    recorded = (await readFile(join(releaseDir, BUNDLE_SHA_FILE), 'utf8')).trim();
  } catch {
    throw new ReleaseRefusedError(
      'release_unverified',
      `release ${releaseId} is current but carries no ${BUNDLE_SHA_FILE} record, so its bundle cannot be proved. Install under a new release id.`,
    );
  }
  if (recorded !== declared) {
    throw new ReleaseRefusedError(
      'sha_mismatch',
      `release ${releaseId} is already installed from bundle ${recorded}; a release id names exactly one bundle, so ${declared} is refused`,
    );
  }
}

async function stageRelease(req: InstallRequest): Promise<void> {
  const { api, releaseId } = req;
  // Read ONCE: the extraction refuses exactly the config_api/ files prepareV1 then links.
  const reserved = reservedBundlePaths(api);
  const staged = await createStaging(api);
  try {
    let received: { entries: number; bytes: number; sha256: string };
    try {
      received = await extractBundle(req.body, staged, bundleLimits(), reserved);
    } catch (error) {
      if (error instanceof BundleRefused) {
        throw new ReleaseRefusedError('bundle_refused', `the bundle was refused (${error.reason}): ${error.message}`, {
          bundle_reason: error.reason,
        });
      }
      throw error;
    }
    if (received.sha256 !== req.sha256) {
      throw new ReleaseRefusedError(
        'sha_mismatch',
        `the bundle received hashes to ${received.sha256}, not the declared X-Bundle-Sha256 ${req.sha256}; nothing was installed`,
      );
    }
    if (api === 'v1') await prepareV1(staged, reserved);
    else assertNodeModules(staged, releaseId);
    await commitStaging(api, staged, releaseId);
  } catch (error) {
    await rm(staged, { recursive: true, force: true });
    throw error;
  }

  const releaseDir = join(apiLayout(api).releases, releaseId);
  try {
    if (api === 'v2') await scratchHealth(releaseDir, releaseId);
    await writeFile(join(releaseDir, BUNDLE_SHA_FILE), `${req.sha256}\n`, { mode: 0o444 });
  } catch (error) {
    await rm(releaseDir, { recursive: true, force: true });
    throw error;
  }
}

// ── v1: php -l + shared links ────────────────────────────────────────────────

async function prepareV1(stageDir: string, reserved: readonly string[]): Promise<void> {
  await lintAll(stageDir, await phpFiles(stageDir));
  const shared = apiLayout('v1').shared;
  // The links ARE the reserved config_api/ files: one rule (store.ts reservedBundlePaths).
  for (const path of reserved) {
    if (!path.startsWith(`${V1_CONFIG_DIR}/`)) continue;
    const name = path.slice(V1_CONFIG_DIR.length + 1);
    await symlink(join(shared, name), join(stageDir, path));
  }
  // json/index.php includes the headers file unconditionally: no file = a broken API.
  if (!existsSync(join(stageDir, V1_CONFIG_DIR, V1_SHARED_HEADERS))) {
    throw new ReleaseRefusedError(
      'shared_config_missing',
      `v1 has no headers file: neither ${join(shared, V1_SHARED_HEADERS)} nor the bundle's ${V1_CONFIG_DIR}/${V1_SHARED_HEADERS} exists. Create the shared one (start from config_api/sample.server_config_headers.php) and install again.`,
    );
  }
}

async function phpFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.php$/i.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

async function lintAll(stageDir: string, files: readonly string[]): Promise<void> {
  const failures: { file: string; output: string }[] = [];
  let next = 0;
  async function worker(): Promise<void> {
    while (failures.length === 0 && next < files.length) {
      const file = files[next++];
      const result = await exec().phpLint(file);
      if (result.code !== 0) failures.push({ file, output: firstLine(result.stderr || result.stdout) });
    }
  }
  await Promise.all(Array.from({ length: Math.min(PHP_LINT_CONCURRENCY, files.length) }, () => worker()));
  if (failures.length > 0) {
    const { file, output } = failures[0];
    const shown = relative(stageDir, file);
    throw new ReleaseRefusedError(
      'php_lint_failed',
      `php -l rejected ${shown}: ${output.replaceAll(`${stageDir}/`, '')}`,
      { file: shown },
    );
  }
}

// ── v2: node_modules + scratch boot ──────────────────────────────────────────

function assertNodeModules(stageDir: string, releaseId: string): void {
  const nodeModules = join(stageDir, 'node_modules');
  if (!existsSync(nodeModules) || !lstatSync(nodeModules).isDirectory()) {
    throw new ReleaseRefusedError(
      'node_modules_missing',
      `v2 bundle ${releaseId} carries no node_modules/; the publication host never runs bun install, so the bundle must ship its production dependencies`,
    );
  }
}

/** Boot the COMMITTED release (releases/<id>) on a scratch loopback port; health within a bound. */
async function scratchHealth(releaseDir: string, releaseId: string): Promise<void> {
  const port = freeLoopbackPort();
  const scratch = exec().v2ScratchBoot(releaseDir, port);
  try {
    const health = await waitHealthy(scratchHealthUrl(port), timing.scratchHealthMs);
    if (!health.ok) {
      throw new ReleaseRefusedError(
        'scratch_health_failed',
        `v2 release ${releaseId} booted on 127.0.0.1:${port} did not answer 200 within ${timing.scratchHealthMs} ms (last: ${health.last}); the live release was not touched`,
      );
    }
  } finally {
    await scratch.stop();
  }
}

function v2HealthUrl(): string {
  return v2HealthUrlOverride ?? config.V2_HEALTH_URL;
}

/** The live health URL's path, on loopback, at the scratch port. */
function scratchHealthUrl(port: number): string {
  const url = new URL(v2HealthUrl());
  url.hostname = '127.0.0.1';
  url.port = String(port);
  return url.toString();
}

function freeLoopbackPort(): number {
  const probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response(null, { status: 404 }) });
  const port = probe.port;
  probe.stop(true);
  if (!port) throw new Error('could not reserve a free loopback port for the v2 scratch boot');
  return port;
}

async function waitHealthy(url: string, boundMs: number): Promise<{ ok: true } | { ok: false; last: string }> {
  const deadline = Date.now() + boundMs;
  let last = 'no answer';
  while (Date.now() < deadline) {
    try {
      const remaining = Math.max(1, deadline - Date.now());
      const response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(Math.min(timing.probeTimeoutMs, remaining)),
      });
      await response.body?.cancel();
      if (response.status === 200) return { ok: true };
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.name : String(error);
    }
    await Bun.sleep(timing.pollIntervalMs);
  }
  return { ok: false, last };
}

/** systemctl restart + health; null = healthy, else a one-line diagnosis. */
async function restartAndProbe(): Promise<string | null> {
  const restart = await exec().v2Restart();
  if (restart.code !== 0) return `systemctl restart exited ${restart.code}: ${firstLine(restart.stderr)}`;
  const health = await waitHealthy(v2HealthUrl(), timing.restartHealthMs);
  return health.ok ? null : `${v2HealthUrl()} answered ${health.last} for ${timing.restartHealthMs} ms`;
}

/**
 * `current` already points at `to`. Restart onto it; if it is not healthy, put `from` back,
 * restart onto that, audit the automatic restore (release.auto_rollback), and refuse. A
 * release extracted by THIS install (`removeOnFailure`) is deleted after a failure so a retry
 * re-extracts instead of re-promoting a known-bad tree.
 */
async function restartOrRestore(from: string | null, to: string, removeOnFailure: boolean, actor: string): Promise<void> {
  const failure = await restartAndProbe();
  if (failure === null) return;

  const layout = apiLayout('v2');
  if (from === null) {
    await unlink(layout.current);
    if (removeOnFailure) await rm(join(layout.releases, to), { recursive: true, force: true });
    await audit({
      actor,
      action: 'release.auto_rollback',
      outcome: 'failed',
      detail: { api: 'v2', from: to, to: null, failure, note: 'no previous release: current removed, v2 not serving' },
    });
    throw new ReleaseRefusedError(
      'health_failed',
      `v2 release ${to} failed after the restart (${failure}). There was no previous release: current was removed and v2 is not serving.`,
      { rolled_back_to: null },
    );
  }
  await promote('v2', from);
  const restored = await restartAndProbe();
  if (removeOnFailure) await rm(join(layout.releases, to), { recursive: true, force: true });
  await audit({
    actor,
    action: 'release.auto_rollback',
    outcome: restored === null ? 'ok' : 'failed',
    detail: { api: 'v2', from: to, to: from, failure, restored_health: restored },
  });
  if (restored !== null) {
    throw new ReleaseRefusedError(
      'rollback_unhealthy',
      `v2 release ${to} failed after the restart (${failure}); current is back on ${from}, which ALSO failed its health check (${restored}). An operator must look at the v2 unit.`,
      { rolled_back_to: from },
    );
  }
  throw new ReleaseRefusedError(
    'health_failed',
    `v2 release ${to} failed after the restart (${failure}); current is back on ${from}, restarted and healthy`,
    { rolled_back_to: from },
  );
}

// ── rollback ─────────────────────────────────────────────────────────────────

export async function rollbackRelease(api: ApiName, actor: string): Promise<{ from: string; to: string }> {
  assertApi(api);
  const release = claim(api, 'rollback');
  try {
    await sweepInterrupted(api);
    const from = currentRelease(api);
    if (from === null) {
      throw new ReleaseRefusedError('no_current_release', `${api} has no current release; there is nothing to roll back from`);
    }
    const to = previousRelease(api);
    if (to === null) {
      throw new ReleaseRefusedError('no_previous_release', `${api} retains no release other than ${from}; there is nothing to roll back to`);
    }
    if (!hasRecord(api, to)) {
      throw new ReleaseRefusedError(
        'release_unverified',
        `${api} release ${to} carries no ${BUNDLE_SHA_FILE} record, so it never passed the install checks; it is not a rollback target`,
      );
    }
    await promote(api, to);
    if (api === 'v2') await restartOrRestore(from, to, false, actor);
    await audit({ actor, action: 'release.rollback', outcome: 'ok', detail: { api, from, to } });
    return { from, to };
  } catch (raw) {
    const error = fromStore(raw);
    await auditFailure('release.rollback', actor, { api }, error);
    throw error;
  } finally {
    release();
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Retention never fails an install whose swap already happened: logged, audited as an empty prune. */
async function pruneQuietly(api: ApiName): Promise<string[]> {
  try {
    return await pruneReleases(api, config.RELEASES_RETAINED);
  } catch (error) {
    console.error(`[host_agent] release prune failed for ${api}:`, error);
    return [];
  }
}

async function discard(body: ReadableStream<Uint8Array>): Promise<void> {
  try {
    await body.cancel();
  } catch {
    // Already closed or errored: nothing to release.
  }
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0] ?? '';
}

/** A store refusal (Task 6) becomes an operator sentence, never an unscrubbed-or-scrubbed 500. */
function fromStore(error: unknown): unknown {
  return error instanceof ReleaseStoreError
    ? new ReleaseRefusedError('store_refused', error.message, { store_reason: error.reason })
    : error;
}

function outcomeOf(error: unknown): AuditOutcome {
  if (!(error instanceof ApiError)) return 'failed';
  const reason = String(error.extensions?.reason ?? '');
  return error.status >= 500 || HOST_FAILURE_REASONS.has(reason) ? 'failed' : 'refused';
}

async function auditFailure(
  action: 'release.install' | 'release.rollback',
  actor: string,
  detail: Record<string, unknown>,
  error: unknown,
): Promise<void> {
  const reason = error instanceof ApiError ? String(error.extensions?.reason ?? error.name) : 'internal';
  const message = error instanceof Error ? error.message : String(error);
  await audit({ actor, action, outcome: outcomeOf(error), detail: { ...detail, reason, message } });
}
