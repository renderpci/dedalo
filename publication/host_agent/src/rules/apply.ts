/**
 * rules.apply — install the generated publication-host media include (spec §6, §5.1).
 *
 * ONE TRANSACTION ON THE FILESYSTEM, and the order is the property:
 *
 *   check the request (shape, stamp, DIRECTIVE ALLOWLIST) → write `<live>.new` (0640,
 *   fsynced) → keep the last LOADED include as `<live>.prev` → mark `<live>.reload-pending`
 *   → atomic rename `.new` → live → configtest → reload → clear the marker.
 *
 * THE ALLOWLIST IS WHAT KEEPS THIS A NON-ROOT DOOR. Root parses the include (the sudo'd
 * configtest, the polkit reload), and the stamp check below proves nothing about content
 * (any caller can compute a matching stamp). So every directive is checked against
 * ./directives.ts BEFORE a byte is written or a command runs: no LoadModule, no Include, no
 * log directive, no piped value, no path outside MEDIA_ROOT.
 *
 * A failed configtest puts the `.prev` bytes back (or removes the file when there was none),
 * clears the marker, re-runs configtest and reports BOTH exit codes. It NEVER reloads: the
 * web server keeps serving the configuration it already has in memory, and the disk is back
 * to it.
 *
 * `.prev` IS THE LAST INCLUDE THE WEB SERVER LOADED, not the last file on disk. The
 * reload-pending marker is what makes that true: it is written BEFORE the swap, removed only
 * after a successful reload or a restore, and while it exists `.prev` is not rotated. A
 * failed reload followed by another apply therefore restores the include that is actually
 * loaded, never the one that never was.
 *
 * RELOAD FAILURE KEEPS THE NEW FILE: it passed configtest, so the disk holds the desired
 * state. The marker stays and the error reports it. `appliedRulesHash()` answers null while
 * the marker exists ("applied" means LOADED), so the panel sees a mismatch and re-pushes.
 *
 * IDEMPOTENT RE-APPLY: live bytes identical to the request AND no marker → no write, no
 * configtest, no reload, and still `{ hash, reloaded: true }`. `reloaded: true` is an
 * invariant, not an event: the web server has been reloaded successfully with exactly this
 * include, by this call or by the apply that wrote it. Same stamp with different bytes is
 * NOT idempotent: a hand-edited include carrying a copied stamp is repaired, not trusted.
 *
 * WHAT GOES OVER THE WIRE: machine fields only (exit codes, the include line a configtest
 * names, hashes, booleans). Configtest/reload OUTPUT carries absolute config paths and
 * included file contents, so it goes to the journal (console.error) and the audit line,
 * never into a problem body — a 422 detail is not scrubbed, and a 5xx scrub covers only
 * `detail`, never extensions.
 *
 * Every outcome is audited: action `rules.apply`, outcome ok | refused | failed, and the
 * finer result (applied, unchanged, refused, host_busy, configtest_failed, reload_failed) in detail.
 *
 * THE TRANSACTION IS src/rules/txn.ts (shared with root's host-map renderer), run under the
 * HOST WEB LOCK (spec S12, src/provision/lock.ts): every configtest+reload on this host, by
 * root and by every instance's agent, is serialized, so two instances never reload the same
 * web server over each other's half-written file. The agent opens the root-created lock file
 * read-only and creates nothing (HOST_LOCKS_DIR is root:dedalo_pubhost 0750): a missing file
 * is `host_lock_missing` (run `provision apply`), a holder past 30 s is `host_busy` (503).
 */

import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type AuditOutcome, audit } from '../audit';
import { config } from '../config';
import { HostActionFailedError, type ReasonCode, RefusedError } from '../errors';
import { exec } from '../exec';
import { flockIo } from '../provision/flock';
import { HOST_BASE } from '../provision/layout';
import { acquireHostLockAsync, LockBusy, type LockHandle, type LockIo } from '../provision/lock';
import { refuseDirectives, stampedHash } from './directives';
import { configtestLine, runTxn, type TxnPaths, txnOutput, txnPaths } from './txn';

export { configtestLine, stampedHash };

export interface RulesApplyRequest {
  server: 'apache' | 'nginx';
  text: string;
  hash: string;
  actor: string;
}

/** The largest include accepted, in UTF-8 bytes. A real one is a few KiB. */
export const MAX_RULES_BYTES = 256 * 1024;

/** `<STATE_ROOT>/rules/<RULES_FILE_PREFIX>.<server>.conf` is the include the vhost Includes. */
export const RULES_FILE_PREFIX = 'dedalo_media_publication';

const HASH_PATTERN = /^[0-9a-f]{64}$/;

export type RulesPaths = TxnPaths;

export function rulesPaths(server: 'apache' | 'nginx' = config.WEB_SERVER): RulesPaths {
  const dir = join(config.STATE_ROOT, 'rules');
  return txnPaths(dir, join(dir, `${RULES_FILE_PREFIX}.${server}.conf`));
}

/* ── the host seams (spec §13.2: every path a parameter; production = layout.ts constants) ── */

/** What the rules commands touch outside the agent's own state root. */
export interface RulesDeps {
  /** config.INSTANCE / WEB_SERVER / NGINX_MAP_MODE — facts, so a gate can model an nginx conf_d host. */
  readonly instance: string;
  readonly webServer: 'apache' | 'nginx';
  readonly nginxMapMode: 'conf_d' | 'none';
  /** flock(2) through bun:ffi (src/provision/flock.ts); a fake in the tests. */
  readonly lockIo: LockIo;
  /** `<host base>/locks` (HOST_LOCKS_DIR). */
  readonly locksDir: string;
  /**
   * The uid the lock file must belong to: root (0) — root creates it, an agent never does.
   * The ONE exception is a scratch host base under NODE_ENV=test (a drill running as a plain
   * user, see productionDeps); a production agent always requires root's file.
   */
  readonly lockUid: number;
  /** `<host base>/nginx_map` (HOST_NGINX_MAP_DIR). */
  readonly nginxMapDir: string;
  /** This process's uid (the owner its own contribution must carry). */
  readonly uid: number;
  /** lstat facts of a path, never followed; null when absent. The tests model foreign uids here. */
  lstat(path: string): { readonly type: 'file' | 'dir' | 'symlink' | 'other'; readonly uid: number } | null;
}

function lstatFacts(path: string): ReturnType<RulesDeps['lstat']> {
  try {
    const st = lstatSync(path);
    const type = st.isSymbolicLink() ? 'symlink' : st.isFile() ? 'file' : st.isDirectory() ? 'dir' : 'other';
    return { type, uid: st.uid };
  } catch {
    return null;
  }
}

function productionDeps(): RulesDeps {
  const base = config.HOST_BASE ?? HOST_BASE;
  const uid = typeof process.getuid === 'function' ? process.getuid() : -1;
  // A drill (NODE_ENV=test, a scratch HOST_BASE, no root) plants its own lock file; nothing else
  // relaxes the owner check — production never runs NODE_ENV=test (src/config.ts).
  const scratchLocks = config.NODE_ENV === 'test' && config.HOST_BASE !== undefined;
  return Object.freeze({
    instance: config.INSTANCE,
    webServer: config.WEB_SERVER,
    nginxMapMode: config.NGINX_MAP_MODE,
    lockIo: flockIo(),
    locksDir: join(base, 'locks'),
    lockUid: scratchLocks ? uid : 0,
    nginxMapDir: join(base, 'nginx_map'),
    uid,
    lstat: lstatFacts,
  });
}

let currentDeps: RulesDeps | null = null;

/** The deps every rules command uses: the test stand-in when installed, else the host's. */
export function rulesDeps(): RulesDeps {
  if (currentDeps === null) currentDeps = productionDeps();
  return currentDeps;
}

/** Install stand-ins for the suite; returns the restore. Refuses outside NODE_ENV=test. */
export function setRulesDepsForTests(standIn: RulesDeps): () => void {
  if (config.NODE_ENV !== 'test') throw new Error(`setRulesDepsForTests refused: NODE_ENV is '${config.NODE_ENV}', not 'test'.`);
  const previous = currentDeps;
  currentDeps = standIn;
  return () => {
    currentDeps = previous;
  };
}

/**
 * The host web lock, async (the wait never blocks a request), opened read-only and never
 * created by an agent. A missing lock file or a holder past the wait is a typed 503.
 */
export async function withHostWebLock<T>(deps: RulesDeps, run: () => Promise<T>): Promise<T> {
  let handle: LockHandle;
  try {
    handle = await acquireHostLockAsync('web', { dir: deps.locksDir, io: deps.lockIo, uid: deps.lockUid, gid: null, create: false });
  } catch (error) {
    if (error instanceof LockBusy) {
      throw new HostActionFailedError(
        `the host web lock is held (${error.message}); every configtest and reload on this host waits for it — retry`,
        'host_busy',
        { holder_pids: error.holder.pids ?? [] },
      );
    }
    throw new HostActionFailedError(
      `the host web lock cannot be opened (${error instanceof Error ? error.message : String(error)}); run 'provision apply' for this instance on the host`,
      'host_lock_missing',
    );
  }
  try {
    return await run();
  } finally {
    handle.release();
  }
}

/** The `# config-hash:` of the include the web server has LOADED, or null (none, or reload pending). */
export function appliedRulesHash(): string | null {
  const paths = rulesPaths();
  if (existsSync(paths.pending)) return null;
  let text: string;
  try {
    text = readFileSync(paths.live, 'utf8');
  } catch {
    return null;
  }
  return stampedHash(text);
}

/** One apply at a time: this process is the only writer of `<STATE_ROOT>/rules` (D10). */
let tail: Promise<unknown> = Promise.resolve();

export function applyRules(req: RulesApplyRequest): Promise<{ hash: string; reloaded: true }> {
  const run = tail.then(
    () => applyRulesNow(req),
    () => applyRulesNow(req),
  );
  tail = run.catch(() => undefined);
  return run;
}

interface Refusal {
  reason: ReasonCode;
  detail: string;
  extensions?: Record<string, unknown>;
}

function refusal(req: RulesApplyRequest): Refusal | null {
  if (req.server !== config.WEB_SERVER) {
    return { reason: 'server_mismatch', detail: `this host runs ${config.WEB_SERVER}, not ${req.server}` };
  }
  if (!HASH_PATTERN.test(req.hash)) return { reason: 'hash_invalid', detail: 'hash must be 64 lowercase hex characters' };
  if (Buffer.byteLength(req.text, 'utf8') > MAX_RULES_BYTES) {
    return { reason: 'rules_too_large', detail: `the include exceeds ${MAX_RULES_BYTES} bytes` };
  }
  if (req.text.includes('\0')) return { reason: 'rules_nul_byte', detail: 'the include contains a NUL byte' };
  const stamped = stampedHash(req.text);
  if (stamped === null) {
    return {
      reason: 'stamp_missing',
      detail: 'the include must carry exactly one `# config-hash: <64 hex>` line in its leading comment block',
    };
  }
  if (stamped !== req.hash) {
    return { reason: 'hash_mismatch', detail: `the include is stamped ${stamped}, the request names ${req.hash}` };
  }
  const refused = refuseDirectives(req.server, req.text, config.MEDIA_ROOT ?? null);
  if (refused !== null) {
    return {
      reason: 'directive_refused',
      detail: `line ${refused.line}: '${refused.directive}' — ${refused.why}`,
      extensions: { line: refused.line, directive: refused.directive },
    };
  }
  return null;
}

type RulesResult = 'refused' | 'unchanged' | 'applied' | 'host_busy' | 'configtest_failed' | 'reload_failed';

async function record(
  req: RulesApplyRequest,
  outcome: AuditOutcome,
  result: RulesResult,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await audit({
    actor: req.actor,
    action: 'rules.apply',
    outcome,
    detail: { result, server: req.server, hash: req.hash.slice(0, 64), ...detail },
  });
}

/** The file mode of the include and its companions (the web server's group reads it). */
const INCLUDE_MODE = 0o640;

async function applyRulesNow(req: RulesApplyRequest): Promise<{ hash: string; reloaded: true }> {
  const refused = refusal(req);
  if (refused) {
    await record(req, 'refused', 'refused', { reason: refused.reason, ...refused.extensions });
    throw new RefusedError(refused.detail, refused.reason, refused.extensions);
  }

  const paths = rulesPaths(req.server);
  const deps = rulesDeps();
  let outcome: Awaited<ReturnType<typeof runTxn>>;
  try {
    outcome = await withHostWebLock(deps, () =>
      runTxn(paths, Buffer.from(req.text, 'utf8'), exec(), { fileMode: INCLUDE_MODE, dirMode: 0o750, marker: req.hash }),
    );
  } catch (error) {
    if (error instanceof HostActionFailedError) {
      await record(req, 'failed', 'host_busy', { reason: error.extensions?.reason ?? null });
    }
    throw error;
  }

  if (outcome.result === 'unchanged') {
    await record(req, 'ok', 'unchanged');
    return { hash: req.hash, reloaded: true };
  }
  if (outcome.result === 'configtest_failed') {
    const { configtest, after, restored } = outcome;
    const line = configtestLine(configtest, paths.live);
    console.error(
      `[rules.apply] ${config.WEB_SERVER} configtest refused the include (exit ${configtest.code}); ${restored}:\n` +
        `${txnOutput(configtest)}\n[rules.apply] configtest after restore (exit ${after.code}):\n${txnOutput(after)}`,
    );
    await record(req, 'failed', 'configtest_failed', {
      restored,
      configtest: { code: configtest.code, line, output: txnOutput(configtest) },
      configtest_after_restore: { code: after.code, output: txnOutput(after) },
    });
    throw new RefusedError(
      `${config.WEB_SERVER} configtest refused the include${line === null ? '' : ` at line ${line}`}; ${
        restored === 'previous' ? 'the previous include was restored' : 'the include was removed'
      }; nothing was reloaded. The full output is in the agent journal.`,
      'configtest_failed',
      {
        restored,
        configtest: { code: configtest.code, line },
        configtest_after_restore: { code: after.code },
      },
    );
  }
  if (outcome.result === 'reload_failed') {
    const { configtest, reload } = outcome;
    console.error(`[rules.apply] reloading ${config.WEB_UNIT} failed (exit ${reload.code}):\n${txnOutput(reload)}`);
    await record(req, 'failed', 'reload_failed', {
      configtest: { code: configtest.code },
      reload: { code: reload.code, output: txnOutput(reload) },
    });
    throw new HostActionFailedError(
      `the include passed configtest and is in place, but reloading ${config.WEB_UNIT} failed; re-apply to complete`,
      'reload_failed',
      { applied_hash: req.hash, reload_pending: true, reload: { code: reload.code } },
    );
  }
  await record(req, 'ok', 'applied', { replaced: outcome.replaced });
  return { hash: req.hash, reloaded: true };
}
