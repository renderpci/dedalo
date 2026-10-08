/**
 * THE OPERATOR-FILE TRANSACTION (spec §5.10) — the one way `provision init` changes a web-server
 * file it does not own: the vhost reference, the removal of the guide's hand-written lines, the
 * Debian module enable that rides along, and the hand-map migration (`nginx_map_seed`).
 *
 * init/act.ts has already re-read the file and computed the new bytes (web_edit.ts) and journaled
 * its `begin`; here, UNDER THE HOST WEB LOCK (spec S12 3, so no agent or other provisioner reloads
 * in between):
 *   1. the file and every ancestor are root-owned and not group/other-writable, else never written;
 *   2. re-read: its sha must still be the one shown (TOCTOU), else "changed since shown; re-run";
 *   3. the original bytes are kept in the backup act chose (root 0600, outside every include dir);
 *   4. Debian: the missing modules are enabled (a2enmod), recording exactly which;
 *   5. the new bytes replace the file atomically (`.<base>.dedalo-init.tmp` O_EXCL|O_NOFOLLOW,
 *      owner and mode preserved, rename); under SELinux `restorecon` the one file;
 *   6. configtest — FAIL: the original bytes back (and restorecon), the enabled modules disabled
 *      again, configtest again, `rolled_back{exit1, exit2}`, no reload;
 *   7. PASS: reload, then the unit must stay active for the poll (an AVC kills the master at
 *      reload after a passing configtest run as unconfined root) — inactive: restore, configtest,
 *      restart, confirm active, `rolled_back{reload}`.
 *
 * nginx_map_seed (the guide's hand-placed http{} map → the host map, §5.10): ONE transaction —
 * the hand map's three blocks must pass the agent's own grammar (src/rules/directives.ts
 * parseNginxMap); the live host map is seeded from them (re-rendered canonically by
 * src/rules/host_map.ts renderHostMap from one `_seed` contribution) with `contrib/_seed.json`, the
 * provisioned include is written when absent, the hand map is removed (a stand-alone file: the file;
 * mixed into another file: only the blocks), then ONE configtest and reload; any failure restores the
 * hand map and removes every seeded file.
 *
 * Results use act's TxnResult vocabulary; every `reason` is one of OUR sentences, never file content.
 */
import { createHash } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import type { ExecResult } from '../exec_contract';
import type { AgentLayout, WebServer } from '../layout';
import { MODES } from '../layout';
import type { LockHandle, LockIo } from '../lock';
import { acquireHostLockSync } from '../lock';
import type { HostLockRef, PathFacts } from '../plan';
import { judgeAncestors, trustProblem } from '../plan';
import { nginxMapIncludeRenderer } from '../render/nginx_map_include';
import { PENDING_FACTS } from '../render/types';
import { SEED_CONTRIBUTION, contributionOf, isMapRefusal, parseNginxMap } from '../../rules/directives';
import { HOST_MAP_FILE, canonicalRecord, renderHostMap } from '../../rules/host_map';
import { INIT_TEMP_SUFFIX } from './host_io';
import type { InitIo } from './types';

/** act.ts OperatorEditRequest. */
export interface OperatorEditRequest {
  readonly item: string;
  readonly target: string;
  readonly beforeSha: string;
  readonly after: Uint8Array;
  readonly afterSha: string;
  readonly server: WebServer;
  readonly backup: string;
  readonly mods: readonly string[];
}

/** act.ts MapSeedRequest. */
export interface MapSeedRequest {
  readonly item: string;
  readonly target: string;
  readonly beforeSha: string;
  readonly standalone: boolean;
  readonly backup: string;
  readonly seeded: readonly string[];
}

/** act.ts TxnResult. */
export interface TxnResult {
  readonly outcome: 'done' | 'rolled_back' | 'failed';
  readonly reason?: string;
  readonly exit1?: number;
  readonly exit2?: number;
  readonly modsEnabled?: readonly string[];
}

/** The commands the transaction runs (provisionExec ∪ initExec members). */
export interface WebTxnExec {
  webConfigtest(bin: string, server: WebServer): ExecResult;
  reloadUnit(unit: string): ExecResult;
  restartUnit(unit: string): ExecResult;
  unitState(unit: string): { enabled: boolean; active: boolean };
  restorecon(targets: readonly { path: string; recursive: boolean }[], dryRun: boolean): ExecResult;
  enableApacheModules(mods: readonly string[]): ExecResult;
  disableApacheModules(mods: readonly string[]): ExecResult;
}

export interface WebTxnPorts {
  readonly io: InitIo;
  readonly exec: WebTxnExec;
  readonly lockIo: LockIo;
  readonly webLock: HostLockRef;
  /** The web server the files belong to: its configtest binary and unit. */
  readonly web: { readonly server: WebServer; readonly bin: string; readonly unit: string };
  /** lstat facts, never followed (the trust walk). */
  readonly lstat: (path: string) => PathFacts | null;
  /** Ancestors at or above this are not judged (production '/'). */
  readonly trustRoot: string;
  readonly rootUid: number;
  readonly rootGid: number;
  /** SELinux permissive/enforcing: restorecon every file this transaction writes. */
  readonly selinux: boolean;
  /** Debian family: a2enmod/a2dismod exist (EL never enables a module, spec §4.3 web.modules). */
  readonly debian: boolean;
  /** The reload poll's wait (production Bun.sleepSync). */
  readonly sleepSync: (ms: number) => void;
  /** The instance's layout (nginx_map_seed: the host paths and the provisioned include's bytes). */
  readonly layout: AgentLayout;
}

/** How long a reloaded unit must stay active (same as apply.ts RELOAD_POLL). */
export const TXN_RELOAD_POLL = Object.freeze({ intervalMs: 250, count: 20 });

export function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Why `path` may not be written by root (a non-root principal could swap it), or null. */
export function operatorFileTrust(path: string, ports: Pick<WebTxnPorts, 'lstat' | 'trustRoot' | 'rootUid'>): string[] {
  const problems: string[] = [];
  const leaf = ports.lstat(path);
  if (leaf === null) return [`'${path}' does not exist`];
  if (leaf.type !== 'file') problems.push(`'${path}' is a ${leaf.type}, not a regular file`);
  else {
    const problem = trustProblem(leaf, ports.rootUid);
    if (problem) problems.push(`'${path}' is ${problem}`);
  }
  problems.push(...judgeAncestors(`'${path}'`, path, ports.trustRoot, p => ports.lstat(p), ports.rootUid, new Set()));
  return problems;
}

function takeLock(ports: WebTxnPorts): LockHandle {
  return acquireHostLockSync('web', { dir: ports.webLock.dir, io: ports.lockIo, uid: ports.webLock.uid, gid: ports.webLock.gid, create: true });
}

function relabel(ports: WebTxnPorts, paths: readonly string[]): void {
  if (!ports.selinux || paths.length === 0) return;
  const result = ports.exec.restorecon(paths.map(path => ({ path, recursive: false })), false);
  if (result.code !== 0) throw new Error(`restorecon exited ${result.code}`);
}

function staysActive(ports: WebTxnPorts): boolean {
  for (let attempt = 0; attempt < TXN_RELOAD_POLL.count; attempt += 1) {
    if (!ports.exec.unitState(ports.web.unit).active) return false;
    ports.sleepSync(TXN_RELOAD_POLL.intervalMs);
  }
  return ports.exec.unitState(ports.web.unit).active;
}

/** Removes a file this transaction created, through init's one removal door (rename to its init temp). */
function removeCreated(io: InitIo, path: string): void {
  const temp = join(dirname(path), `.${basename(path)}${INIT_TEMP_SUFFIX}`);
  io.rename(path, temp);
  io.removeInitTemp(temp);
}

/**
 * Configtest, then reload with the active poll. `restore` puts every touched file back (and
 * relabels); it runs on a failing configtest (then configtest again) and on a unit that dies at the
 * reload (then configtest, restart, confirm). Never throws: the outcome says what happened.
 */
function testAndReload(ports: WebTxnPorts, restore: () => void, extra: Partial<TxnResult> = {}, onFail: () => void = () => {}): TxnResult {
  const first = ports.exec.webConfigtest(ports.web.bin, ports.web.server);
  if (first.code !== 0) {
    restore();
    onFail();
    const again = ports.exec.webConfigtest(ports.web.bin, ports.web.server);
    return {
      ...extra,
      outcome: 'rolled_back',
      reason: `the configtest failed with the new file (exit ${first.code}); the previous file was restored (configtest after the restore: exit ${again.code}); nothing was reloaded`,
      exit1: first.code,
      exit2: again.code,
    };
  }
  const reload = ports.exec.reloadUnit(ports.web.unit);
  if (reload.code === 0 && staysActive(ports)) return { ...extra, outcome: 'done' };
  restore();
  onFail();
  const test = ports.exec.webConfigtest(ports.web.bin, ports.web.server);
  const restart = ports.exec.restartUnit(ports.web.unit);
  const back = restart.code === 0 && ports.exec.unitState(ports.web.unit).active;
  return {
    ...extra,
    outcome: 'rolled_back',
    reason:
      `rolled_back{reload}: ${ports.web.unit} ${reload.code === 0 ? 'was not active after the reload' : `reload exited ${reload.code}`}; ` +
      `the previous file was restored, configtest exited ${test.code}, restart exited ${restart.code}, ` +
      `${ports.web.unit} is ${back ? 'active again' : 'STILL NOT ACTIVE'}`,
    exit1: reload.code,
    exit2: test.code,
  };
}

/** spec §5.10 1-8, for `web.vhost`, `web.manual_lines` and (Debian) `web.modules`. */
export function editOperatorFile(request: OperatorEditRequest, ports: WebTxnPorts): TxnResult {
  if (request.server !== ports.web.server) {
    return { outcome: 'failed', reason: `the request is for ${request.server}, this host's web server is ${ports.web.server}` };
  }
  if (request.mods.length > 0 && !ports.debian) {
    return { outcome: 'failed', reason: 'modules are enabled by a2enmod on Debian only; on EL the operator loads them (conf.modules.d)' };
  }
  const untrusted = operatorFileTrust(request.target, ports);
  if (untrusted.length > 0) {
    return { outcome: 'failed', reason: `not written — a non-root principal could swap it: ${untrusted.join('; ')}` };
  }
  if (sha256(request.after) !== request.afterSha) return { outcome: 'failed', reason: 'the new bytes do not match their sha' };
  let lock: LockHandle;
  try {
    lock = takeLock(ports);
  } catch (error) {
    return { outcome: 'failed', reason: `the host web lock: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}` };
  }
  try {
    const before = ports.io.readOperatorFile(request.target);
    if (before.sha !== request.beforeSha) return { outcome: 'failed', reason: 'changed since shown; re-run' };
    ports.io.writeBytesAtomic(request.backup, before.bytes, 0o600, ports.rootUid, ports.rootGid);
    let modsEnabled: readonly string[] = [];
    if (request.mods.length > 0) {
      const enabled = ports.exec.enableApacheModules(request.mods);
      if (enabled.code !== 0) return { outcome: 'failed', reason: `a2enmod exited ${enabled.code}; nothing was written` };
      modsEnabled = [...request.mods];
    }
    const restore = (): void => {
      ports.io.writeBytesAtomic(request.target, before.bytes, before.mode, before.uid, before.gid);
      relabel(ports, [request.target]);
    };
    const dismod = (): void => {
      if (modsEnabled.length > 0) ports.exec.disableApacheModules(modsEnabled);
    };
    try {
      ports.io.writeBytesAtomic(request.target, request.after, before.mode, before.uid, before.gid);
      relabel(ports, [request.target]);
    } catch (error) {
      restore();
      dismod();
      return { outcome: 'failed', reason: `the write failed (${error instanceof Error ? error.message.split('\n')[0] : String(error)}); the previous file was restored` };
    }
    const result = testAndReload(ports, restore, { modsEnabled }, dismod);
    return result.outcome === 'done' ? result : { ...result, modsEnabled: [] };
  } finally {
    lock.release();
  }
}

/* ── nginx_map_seed (spec §5.10) ──────────────────────────────────────────────────── */

const MAP_BLOCK_OPENER = /^\s*map\s+\$(?:cookie_dedalo_media_auth|uri)\s+\$dedalo_(?:auth_key|svg_disposition|svg_csp)\s*\{\s*$/;

/**
 * The hand map's own lines inside `text`: its three `map` blocks and the comment block right
 * above the first (it carries `# config-hash:`). Returns the 0-based line indexes, or why not.
 */
export function handMapLines(text: string): { lines: number[] } | { why: string } {
  const all = text.split('\n');
  const blocks: number[] = [];
  let first = -1;
  for (let index = 0; index < all.length; index += 1) {
    if (!MAP_BLOCK_OPENER.test(all[index] ?? '')) continue;
    if (first === -1) first = index;
    let end = index;
    while (end < all.length && !/^\s*\}\s*$/.test(all[end] ?? '')) end += 1;
    if (end >= all.length) return { why: `the map block at line ${index + 1} is never closed` };
    for (let line = index; line <= end; line += 1) blocks.push(line);
    index = end;
  }
  if (blocks.length === 0 || first === -1) return { why: 'no Dédalo map block was found' };
  const lead: number[] = [];
  for (let line = first - 1; line >= 0 && /^\s*#/.test(all[line] ?? ''); line -= 1) lead.unshift(line);
  return { lines: [...lead, ...blocks] };
}

/** One transaction under the host web lock: seed the host map from the hand map, then remove it. */
export function seedNginxMap(request: MapSeedRequest, ports: WebTxnPorts): TxnResult {
  if (ports.web.server !== 'nginx') return { outcome: 'failed', reason: 'the hand-map migration is nginx only' };
  const untrusted = operatorFileTrust(request.target, ports);
  if (untrusted.length > 0) {
    return { outcome: 'failed', reason: `not written — a non-root principal could swap it: ${untrusted.join('; ')}` };
  }
  const host = ports.layout.host;
  const live = join(host.nginxMapDir, HOST_MAP_FILE);
  const seedFile = join(host.nginxContribDir, `${SEED_CONTRIBUTION}.json`);
  let lock: LockHandle;
  try {
    lock = takeLock(ports);
  } catch (error) {
    return { outcome: 'failed', reason: `the host web lock: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}` };
  }
  try {
    const before = ports.io.readOperatorFile(request.target);
    if (before.sha !== request.beforeSha) return { outcome: 'failed', reason: 'changed since shown; re-run' };
    const text = new TextDecoder().decode(before.bytes);
    const found = handMapLines(text);
    if ('why' in found) return { outcome: 'failed', reason: `the hand map was not recognised: ${found.why}` };
    const all = text.split('\n');
    const mapText = request.standalone ? text : `${found.lines.map(index => all[index]).join('\n')}\n`;
    const parsed = parseNginxMap(mapText);
    if (isMapRefusal(parsed)) return { outcome: 'failed', reason: `the hand map does not pass the map grammar (line ${parsed.line}: ${parsed.why})` };
    const contribution = contributionOf(parsed, SEED_CONTRIBUTION);
    if (typeof contribution === 'string') return { outcome: 'failed', reason: `the hand map is not one contribution: ${contribution}` };
    const rendered = renderHostMap([contribution]);
    const include = host.nginxMapInclude;
    const includeArtifact = nginxMapIncludeRenderer.render(ports.layout, PENDING_FACTS)[0];
    if (includeArtifact === undefined) return { outcome: 'failed', reason: 'the provisioned include could not be rendered' };
    const encoder = new TextEncoder();

    ports.io.writeBytesAtomic(request.backup, before.bytes, 0o600, ports.rootUid, ports.rootGid);
    const created: string[] = [];
    const restore = (): void => {
      // The hand map back with its owner and mode (a removed stand-alone file is re-created).
      ports.io.writeBytesAtomic(request.target, before.bytes, before.mode, before.uid, before.gid);
      for (const path of [...created].reverse()) {
        if (path !== request.target && ports.lstat(path) !== null) removeCreated(ports.io, path);
      }
      relabel(ports, [request.target]);
    };
    try {
      for (const [path, bytes, mode] of [
        [live, encoder.encode(rendered.text), MODES.nginxMapInclude.mode],
        [seedFile, encoder.encode(canonicalRecord(contribution as unknown as Record<string, unknown>)), MODES.nginxMapInclude.mode],
      ] as const) {
        ports.io.writeBytesAtomic(path, bytes, mode, ports.rootUid, ports.rootGid);
        created.push(path);
      }
      // The hand map goes: a stand-alone file entirely, a mixed one only its blocks.
      if (request.standalone) {
        if (request.target !== include) removeCreated(ports.io, request.target);
      } else {
        const drop = new Set(found.lines);
        const kept = all.filter((_, index) => !drop.has(index)).join('\n');
        ports.io.writeBytesAtomic(request.target, encoder.encode(kept), before.mode, before.uid, before.gid);
      }
      // The provisioned include, when absent now (or when the hand map sat at its very path).
      if (request.seeded.includes(include) || request.target === include) {
        ports.io.writeBytesAtomic(include, encoder.encode(includeArtifact.body), includeArtifact.mode, ports.rootUid, ports.rootGid);
        if (request.target !== include) created.push(include);
      }
      relabel(ports, [live, seedFile, include, ...(request.standalone ? [] : [request.target])]);
    } catch (error) {
      restore();
      return { outcome: 'failed', reason: `the seed failed (${error instanceof Error ? error.message.split('\n')[0] : String(error)}); the hand map was restored` };
    }
    return testAndReload(ports, restore);
  } finally {
    lock.release();
  }
}
