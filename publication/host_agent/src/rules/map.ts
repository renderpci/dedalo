/**
 * rules.map — this instance's CONTRIBUTION to the host-wide nginx media map (spec §13.4, §13.5).
 *
 * The engine pushes its buildNginxMap() text. This agent never writes the file nginx loads:
 *   1. refuses before any write (server, NGINX_MAP_MODE, hash, size, NUL, stamp, the map
 *      grammar of ./directives.ts parseNginxMap, and EXACTLY one envelope);
 *   2. writes its own `contrib/<instance>.json` atomically (`.<instance>.json.tmp` in the sticky
 *      contrib directory, then rename; a file of that name owned by another uid is
 *      `map_contribution_foreign`);
 *   3. `systemctl start dedalo-pubhost-map.service` (its one polkit pair, no argument): root's
 *      oneshot (./host_map_main.ts) re-validates every contribution, renders and installs the
 *      host file under the host web lock, and records `result.json`;
 *   4. answers from that result: this instance's entry, the host hash, the counts — or the
 *      refusal root recorded for it. A start that failed with no fresh result (`seq` unchanged)
 *      is `map_renderer_missing` (exit 5: the unit is not installed) or `reload_failed`.
 *   5. audits `rules.map` (ok | refused | failed, with the finer result).
 *
 * A start that joins a run already in progress may find this instance's NEW contribution not
 * yet read: the answer is retried once, with a second start, before it is judged stale.
 *
 * Machine fields only on the wire (reasons, hashes, counts); renderer output stays in root's journal.
 */

import { closeSync, constants, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { type AuditOutcome, audit } from '../audit';
import { type ApiError, ConflictError, HostActionFailedError, type ReasonCode, RefusedError } from '../errors';
import { exec } from '../exec';
import { contributionOf, isMapRefusal, type MapContribution, parseNginxMap, stampedHash } from './directives';
import {
  HOST_MAP_CONTRIB_DIR,
  HOST_MAP_FILE,
  HOST_MAP_RESULT_FILE,
  type HostMapRefusalReason,
  type HostMapResult,
  MAX_CONTRIBUTION_BYTES,
  parseHostMapResult,
} from './host_map';
import { type RulesDeps, rulesDeps } from './apply';

export interface RulesMapRequest {
  text: string;
  hash: string;
  actor: string;
}

export interface RulesMapAnswer {
  /** The hash of this instance's contribution (= the request's). */
  hash: string;
  /** The `# config-hash:` of the host file nginx now serves (shared with other instances). */
  host_hash: string;
  /** How many contributions the host file merges. */
  contributions: number;
  /** An invariant like rules.apply's: nginx has loaded a host file carrying this contribution. */
  reloaded: true;
}

/** The largest map accepted, in UTF-8 bytes (a real one is under 2 KiB). */
export const MAX_MAP_BYTES = 64 * 1024;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
/** systemctl's exit code for "unit not found" (LSB 5): the oneshot is not installed. */
const UNIT_NOT_FOUND = 5;
const STARTS = 2;

interface Refusal {
  readonly error: ApiError;
  readonly reason: ReasonCode;
  readonly extensions: Record<string, unknown>;
}

function refused(reason: ReasonCode, detail: string, extensions: Record<string, unknown> = {}): Refusal {
  return { error: new RefusedError(detail, reason, extensions), reason, extensions };
}

function conflict(reason: ReasonCode, detail: string, extensions: Record<string, unknown> = {}): Refusal {
  return { error: new ConflictError(detail, reason, extensions), reason, extensions };
}

function hostFailed(reason: ReasonCode, detail: string, extensions: Record<string, unknown> = {}): Refusal {
  return { error: new HostActionFailedError(detail, reason, extensions), reason, extensions };
}

/** Step 1: every refusal before a byte is written, or the contribution the push makes. */
function judge(deps: RulesDeps, req: RulesMapRequest): Refusal | MapContribution {
  if (deps.webServer !== 'nginx') {
    return refused('server_mismatch', `this host runs ${deps.webServer}; the http{} media map is nginx's`);
  }
  if (deps.nginxMapMode !== 'conf_d') {
    return conflict(
      'map_unmanaged',
      "this host's nginx http{} map is not managed by the publication host (web.nginx_map is 'none'); it is placed by hand",
    );
  }
  if (!HASH_PATTERN.test(req.hash)) return refused('hash_invalid', 'hash must be 64 lowercase hex characters');
  if (Buffer.byteLength(req.text, 'utf8') > MAX_MAP_BYTES) return refused('rules_too_large', `the map exceeds ${MAX_MAP_BYTES} bytes`);
  if (req.text.includes('\0')) return refused('rules_nul_byte', 'the map contains a NUL byte');
  const stamped = stampedHash(req.text);
  if (stamped === null) {
    return refused('stamp_missing', 'the map must carry exactly one `# config-hash: <64 hex>` line in its leading comment block');
  }
  if (stamped !== req.hash) return refused('hash_mismatch', `the map is stamped ${stamped}, the request names ${req.hash}`);
  const parsed = parseNginxMap(req.text);
  if (isMapRefusal(parsed)) {
    return refused('map_refused', `line ${parsed.line}: '${parsed.directive}' — ${parsed.why}`, {
      line: parsed.line,
      directive: parsed.directive,
    });
  }
  const contribution = contributionOf(parsed, deps.instance);
  if (typeof contribution === 'string') return refused('map_refused', contribution);
  return contribution;
}

/** The store paths below the host map directory. */
export function mapPaths(deps: RulesDeps = rulesDeps(), instance: string = deps.instance) {
  const contribDir = join(deps.nginxMapDir, HOST_MAP_CONTRIB_DIR);
  return {
    dir: deps.nginxMapDir,
    contribDir,
    own: join(contribDir, `${instance}.json`),
    temp: join(contribDir, `.${instance}.json.tmp`),
    live: join(deps.nginxMapDir, HOST_MAP_FILE),
    pending: join(deps.nginxMapDir, `${HOST_MAP_FILE}.reload-pending`),
    result: join(deps.nginxMapDir, HOST_MAP_RESULT_FILE),
  };
}

/** Step 2. The sticky bit lets this uid replace only its own files; a foreign file is refused, never touched. */
function writeContribution(deps: RulesDeps, contribution: MapContribution): Refusal | null {
  const paths = mapPaths(deps);
  const own = deps.lstat(paths.own);
  if (own !== null && (own.type !== 'file' || own.uid !== deps.uid)) {
    return conflict(
      'map_contribution_foreign',
      `the contribution file for instance '${deps.instance}' exists and is not this agent's (owner uid ${own.uid}, ${own.type}); ` +
        "root's next 'provision apply' sweeps it",
    );
  }
  const temp = deps.lstat(paths.temp);
  if (temp !== null && temp.uid !== deps.uid) {
    return conflict('map_contribution_foreign', `the contribution temp file for '${deps.instance}' is not this agent's`);
  }
  const body = Buffer.from(`${JSON.stringify(contribution)}\n`, 'utf8');
  if (body.length > MAX_CONTRIBUTION_BYTES) return refused('map_refused', 'the contribution exceeds its size bound');
  rmSync(paths.temp, { force: true });
  const fd = openSync(paths.temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o640);
  try {
    let offset = 0;
    while (offset < body.length) offset += writeSync(fd, body, offset, body.length - offset);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(paths.temp, paths.own);
  return null;
}

export function readHostMapResult(deps: RulesDeps = rulesDeps()): HostMapResult | null {
  try {
    return parseHostMapResult(readFileSync(mapPaths(deps).result, 'utf8'));
  } catch {
    return null;
  }
}

const ROOT_REASONS: Readonly<Record<HostMapRefusalReason, ReasonCode>> = Object.freeze({
  map_contribution_foreign: 'map_contribution_foreign',
  map_refused: 'map_refused',
  map_envelope_rebind: 'map_envelope_rebind',
  map_contribution_newer: 'map_contribution_newer',
  // An instance root does not know (identities.json lacks it): this instance's apply fixes it.
  undeclared: 'map_renderer_missing',
});

type MapResultKind = 'applied' | 'unchanged' | 'stale';

/** Step 4: the answer, or the refusal, root's result gives THIS instance. */
function fromResult(instance: string, result: HostMapResult, req: RulesMapRequest): Refusal | { kind: MapResultKind; answer: RulesMapAnswer } {
  const mine = result.refused.find(entry => entry.instance === instance);
  if (result.outcome === 'map_contribution_newer') {
    const newer = result.refused.find(entry => entry.reason === 'map_contribution_newer');
    return conflict(
      'map_contribution_newer',
      `instance '${newer?.instance ?? '?'}' contributes grammar ${newer?.grammar ?? '?'} (${newer?.pins_id ?? '?'}), which this host's ` +
        `map renderer does not know; run 'provision apply' for that instance to upgrade the renderer. The host map was left as it is.`,
      { instance: newer?.instance ?? null, grammar: newer?.grammar ?? null },
    );
  }
  if (mine !== undefined && mine.reason !== 'map_envelope_rebind') {
    const reason = ROOT_REASONS[mine.reason] ?? 'map_refused';
    return reason === 'map_refused'
      ? refused(reason, "root's renderer refused this instance's contribution")
      : conflict(reason, `root's renderer refused this instance's contribution (${mine.reason}); run 'provision apply' for this instance`);
  }
  if (mine?.reason === 'map_envelope_rebind') {
    return conflict(
      'map_envelope_rebind',
      `the map's envelope differs from the one instance '${instance}' is bound to on this host; the bound envelope stays in ` +
        "the host map until this instance's 'provision apply' clears the binding",
    );
  }
  switch (result.outcome) {
    case 'host_busy':
      return hostFailed('host_busy', 'the host web lock is held by another configtest or reload; retry');
    case 'lock_missing':
    case 'identities_invalid':
      return conflict('map_renderer_missing', `the host map renderer cannot run (${result.outcome}); run 'provision apply' for this instance`);
    case 'configtest_failed':
      return refused('configtest_failed', 'nginx configtest refused the host map; the previous host map was restored and nothing was reloaded');
    case 'reload_failed':
      return hostFailed('reload_failed', 'the host map passed configtest and is in place, but reloading nginx failed; re-apply to complete', {
        reload_pending: true,
      });
    default:
      break;
  }
  const entry = result.contributions.find(item => item.instance === instance);
  if (entry === undefined || entry.hash !== req.hash || result.host_hash === null) {
    return { kind: 'stale', answer: { hash: req.hash, host_hash: '', contributions: 0, reloaded: true } };
  }
  return {
    kind: result.outcome === 'unchanged' ? 'unchanged' : 'applied',
    answer: { hash: req.hash, host_hash: result.host_hash, contributions: result.contributions.length, reloaded: true },
  };
}

async function record(req: RulesMapRequest, outcome: AuditOutcome, result: string, detail: Record<string, unknown> = {}) {
  await audit({ actor: req.actor, action: 'rules.map', outcome, detail: { result, hash: req.hash.slice(0, 64), ...detail } });
}

async function fail(req: RulesMapRequest, refusal: Refusal, outcome: AuditOutcome): Promise<never> {
  await record(req, outcome, refusal.reason, { reason: refusal.reason, ...refusal.extensions });
  throw refusal.error;
}

/** Steps 3–4: start root's renderer and read what it recorded for this instance. */
async function renderAndRead(deps: RulesDeps, req: RulesMapRequest): Promise<Refusal | { kind: MapResultKind; answer: RulesMapAnswer }> {
  let last: Refusal | { kind: MapResultKind; answer: RulesMapAnswer } | null = null;
  for (let attempt = 0; attempt < STARTS; attempt++) {
    const before = readHostMapResult(deps)?.seq ?? null;
    let code: number;
    try {
      code = (await exec().startHostMap()).code;
    } catch {
      code = -1;
    }
    const result = readHostMapResult(deps);
    if (result === null || result.seq === before) {
      if (code === UNIT_NOT_FOUND) {
        return conflict('map_renderer_missing', "the host map renderer (dedalo-pubhost-map.service) is not installed; run 'provision apply'");
      }
      last = hostFailed(
        'reload_failed',
        `starting the host map renderer ${code === 0 ? 'recorded no result' : `failed (exit ${code})`}; root's journal has the reason`,
        { renderer_exit: code },
      );
      continue;
    }
    last = fromResult(deps.instance, result, req);
    if (!('kind' in last) || last.kind !== 'stale') return last;
  }
  if (last === null || 'kind' in last) {
    return hostFailed('reload_failed', "root's renderer ran but the host map does not carry this contribution yet; re-apply", {
      renderer_result: 'stale',
    });
  }
  return last;
}

/** One map at a time in this process (like applyRules). */
let tail: Promise<unknown> = Promise.resolve();

export function applyMap(req: RulesMapRequest): Promise<RulesMapAnswer> {
  const run = tail.then(
    () => applyMapNow(req),
    () => applyMapNow(req),
  );
  tail = run.catch(() => undefined);
  return run;
}

async function applyMapNow(req: RulesMapRequest): Promise<RulesMapAnswer> {
  const deps = rulesDeps();
  const judged = judge(deps, req);
  if ('error' in judged) return fail(req, judged, 'refused');
  const written = writeContribution(deps, judged);
  if (written !== null) return fail(req, written, 'refused');
  const outcome = await renderAndRead(deps, req);
  if ('error' in outcome) {
    const failed = outcome.error instanceof HostActionFailedError || outcome.reason === 'configtest_failed';
    return fail(req, outcome, failed ? 'failed' : 'refused');
  }
  await record(req, 'ok', outcome.kind, { host_hash: outcome.answer.host_hash, contributions: outcome.answer.contributions });
  return outcome.answer;
}

/* ── status (GET /v1/status rules.map) ────────────────────────────────────────────── */

export type RulesMapStatus =
  | null
  | { managed: false }
  | {
      managed: true;
      /** This instance's contribution hash when it is part of the LOADED host file, else null. */
      hash: string | null;
      /** The stamp of the loaded host file, or null when absent or reload-pending. */
      host_hash: string | null;
      contributions: number;
      invalid: number;
      /** The reason root's last render recorded for this instance, or null. */
      refused: string | null;
    };

function refusedReason(instance: string, result: HostMapResult | null): ReasonCode | null {
  const mine = result?.refused.find(entry => entry.instance === instance);
  return mine === undefined ? null : (ROOT_REASONS[mine.reason] ?? 'map_refused');
}

/** The status field: null on apache, `{managed: false}` when the map is placed by hand. Read at request time. */
export function hostMapStatus(deps: RulesDeps = rulesDeps()): RulesMapStatus {
  if (deps.webServer !== 'nginx') return null;
  if (deps.nginxMapMode !== 'conf_d') return { managed: false };
  const paths = mapPaths(deps);
  let hostHash: string | null = null;
  if (deps.lstat(paths.pending) === null) {
    try {
      hostHash = stampedHash(readFileSync(paths.live, 'utf8'));
    } catch {
      hostHash = null;
    }
  }
  const result = readHostMapResult(deps);
  const mine = result?.contributions.find(entry => entry.instance === deps.instance);
  const loaded = hostHash !== null && result?.host_hash === hostHash;
  return {
    managed: true,
    hash: loaded && mine !== undefined ? mine.hash : null,
    host_hash: hostHash,
    contributions: result?.contributions.length ?? 0,
    invalid: result?.invalid ?? 0,
    refused: refusedReason(deps.instance, result),
  };
}
