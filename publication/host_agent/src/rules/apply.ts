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
 * finer result (applied, unchanged, refused, configtest_failed, reload_failed) in detail.
 */

import { existsSync, readFileSync } from 'node:fs';
import { chmod, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { type AuditOutcome, audit } from '../audit';
import { config } from '../config';
import { HostActionFailedError, type ReasonCode, RefusedError } from '../errors';
import { type ExecResult, exec } from '../exec';
import { refuseDirectives } from './directives';

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
const STAMP_PATTERN = /^# config-hash: ([0-9a-f]{64})$/;
/** Configtest / reload output kept in the AUDIT line (never the wire): the tail, where the error is. */
const OUTPUT_CAP = 4096;

export interface RulesPaths {
  dir: string;
  live: string;
  next: string;
  prev: string;
  restore: string;
  pending: string;
}

export function rulesPaths(server: 'apache' | 'nginx' = config.WEB_SERVER): RulesPaths {
  const dir = join(config.STATE_ROOT, 'rules');
  const live = join(dir, `${RULES_FILE_PREFIX}.${server}.conf`);
  return {
    dir,
    live,
    next: `${live}.new`,
    prev: `${live}.prev`,
    restore: `${live}.restore`,
    pending: `${live}.reload-pending`,
  };
}

/**
 * The hash stamped in the text's LEADING comment block (consecutive `#` lines from line 1),
 * or null when there is none or more than one. A stamp further down is not a stamp:
 * phase 1's renderers write it on line 3, and accepting it anywhere would let one include
 * carry a second, contradicting claim.
 */
export function stampedHash(text: string): string | null {
  const found: string[] = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('#')) break;
    const match = STAMP_PATTERN.exec(line);
    if (match?.[1]) found.push(match[1]);
  }
  return found.length === 1 ? (found[0] ?? null) : null;
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

type RulesResult = 'refused' | 'unchanged' | 'applied' | 'configtest_failed' | 'reload_failed';

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

/** Write + fsync a file at exactly 0640 (a pre-existing file is replaced; the umask is overridden). */
async function writeDurable(path: string, data: Uint8Array): Promise<void> {
  await rm(path, { force: true });
  const handle = await open(path, 'wx', 0o640);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(path, 0o640);
}

async function readOptional(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/** A spawn that throws (sudo missing, ENOENT) is a failed step, never an unhandled one after the swap. */
async function run(step: () => Promise<ExecResult>): Promise<ExecResult> {
  try {
    return await step();
  } catch (error) {
    return { code: -1, stdout: '', stderr: error instanceof Error ? error.message : String(error) };
  }
}

/** The child's output, for the journal and the audit line only. */
function output(result: ExecResult): string {
  return `${result.stdout}${result.stderr}`.trim().slice(-OUTPUT_CAP);
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The include line a configtest names, or null. Read only when the message names the LIVE
 * include (`… on line N of <live>` for Apache, `… in <live>:N` for nginx), so an error in
 * some other file of the server's config never reports a misleading line.
 */
export function configtestLine(result: ExecResult, live: string): number | null {
  const text = output(result);
  const path = escapeRegex(live);
  const match = new RegExp(`on line (\\d+) of ${path}\\b`).exec(text) ?? new RegExp(`in ${path}:(\\d+)`).exec(text);
  return match?.[1] ? Number(match[1]) : null;
}

/** Put the last loaded include back (atomically), or remove the include when there was none. */
async function restore(paths: RulesPaths, hadPrevious: boolean): Promise<'previous' | 'removed'> {
  if (hadPrevious) {
    await writeDurable(paths.restore, await readFile(paths.prev));
    await rename(paths.restore, paths.live);
    return 'previous';
  }
  await rm(paths.live, { force: true });
  return 'removed';
}

async function applyRulesNow(req: RulesApplyRequest): Promise<{ hash: string; reloaded: true }> {
  const refused = refusal(req);
  if (refused) {
    await record(req, 'refused', 'refused', { reason: refused.reason, ...refused.extensions });
    throw new RefusedError(refused.detail, refused.reason, refused.extensions);
  }

  const paths = rulesPaths(req.server);
  await mkdir(paths.dir, { recursive: true, mode: 0o750 });
  const requested = Buffer.from(req.text, 'utf8');
  const live = await readOptional(paths.live);
  const pending = existsSync(paths.pending);
  const unchanged = live !== null && live.equals(requested);

  if (unchanged && !pending) {
    await record(req, 'ok', 'unchanged');
    return { hash: req.hash, reloaded: true };
  }

  // `.prev` is the last LOADED include: rotate it only when the live file is the loaded one.
  const hadPrevious = pending ? existsSync(paths.prev) : live !== null;
  if (!unchanged) {
    await writeDurable(paths.next, requested);
    if (!pending) {
      if (live !== null) await writeDurable(paths.prev, live);
      else await rm(paths.prev, { force: true });
    }
  }
  // The marker goes down BEFORE the swap: a crash after it leaves "not loaded", never a lie.
  await writeDurable(paths.pending, Buffer.from(`${req.hash}\n`, 'utf8'));
  if (!unchanged) await rename(paths.next, paths.live);

  const configtest = await run(() => exec().webConfigtest());
  if (configtest.code !== 0) {
    const line = configtestLine(configtest, paths.live);
    const restored = await restore(paths, hadPrevious);
    await rm(paths.pending, { force: true });
    const after = await run(() => exec().webConfigtest());
    console.error(
      `[rules.apply] ${config.WEB_SERVER} configtest refused the include (exit ${configtest.code}); ${restored}:\n` +
        `${output(configtest)}\n[rules.apply] configtest after restore (exit ${after.code}):\n${output(after)}`,
    );
    await record(req, 'failed', 'configtest_failed', {
      restored,
      configtest: { code: configtest.code, line, output: output(configtest) },
      configtest_after_restore: { code: after.code, output: output(after) },
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

  const reload = await run(() => exec().webReload());
  if (reload.code !== 0) {
    console.error(`[rules.apply] reloading ${config.WEB_UNIT} failed (exit ${reload.code}):\n${output(reload)}`);
    await record(req, 'failed', 'reload_failed', {
      configtest: { code: configtest.code },
      reload: { code: reload.code, output: output(reload) },
    });
    throw new HostActionFailedError(
      `the include passed configtest and is in place, but reloading ${config.WEB_UNIT} failed; re-apply to complete`,
      'reload_failed',
      { applied_hash: req.hash, reload_pending: true, reload: { code: reload.code } },
    );
  }

  await rm(paths.pending, { force: true });
  await record(req, 'ok', 'applied', { replaced: hadPrevious });
  return { hash: req.hash, reloaded: true };
}
