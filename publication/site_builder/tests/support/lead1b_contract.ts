/**
 * LEAD-1b's GATE CONTRACT — every name the LEAD-1b gates assume the implementation exports,
 * in ONE place, and the situations those gates build.
 *
 * WHY A CONTRACT MODULE. The LEAD-1b gates were written BEFORE the code they judge
 * (audits/2026-09-26_full/LEAD-1b_SPEC.md §6, gate-first). A gate that imported
 * `src/drivers/agent_identity.ts` statically would not even LOAD on a HEAD without that file
 * — the whole file would be one "Cannot find module" instead of nineteen reds, each saying
 * WHAT is missing. So every new module is reached through `contractModule()`, which turns an
 * absent module or export into a per-test failure naming it; and every SHAPE the gates assume
 * (a policy's host seams, a HostState's ledger, a renderer's facts) is built HERE.
 *
 * THE RULE FOR THE IMPLEMENTER. The assertions in `tests/lead1b_*.test.ts` state OUTCOMES
 * (who a unit runs as, what a rule answers, what a run could reach). The names below are how
 * those outcomes are ASKED FOR. If the implementation picks another spelling for a seam, adapt
 * it here — in the builder or the adapter — and never in an assertion. A change that has to
 * edit an assertion to go green is a change of the contract and needs the spec's review.
 */

import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { InstanceLayout, InstanceManifest } from '../../src/provision/layout';
import { derive } from '../../src/provision/layout';
import { parseManifest } from '../../src/provision/schema';

export const SRC = resolve(import.meta.dir, '..', '..', 'src');

/** The three doors, restated so a gate file does not depend on a module it is judging. */
export const DOORS = ['turn', 'build', 'git'] as const;

/**
 * THE INSTANCE SUFFIXES PID 1 SPELLS FOR ONE ACCEPTED AF_UNIX CONNECTION (socket.c
 * `instance_from_socket`): <= 257 `<nr>-<pid>-<uid>`; >= 258 `<nr>-<cookie>-<pid>_<pidfd id>-<uid>`,
 * or `<nr>-<cookie>-<pid>-<uid>` without a pidfd id. Every one must be a run the daemon
 * recognises and the rule lets it stop — a 258 host is inside the supported range (floor 248,
 * no ceiling).
 */
export const INSTANCE_SPELLINGS = ['3-100-999', '3-17-1234_5678-999', '3-17-1234-999'] as const;

/** Near-misses of those spellings that are no instance PID 1 names. */
export const NOT_INSTANCE_SPELLINGS = ['3-100', '3-17-1234_5678', '3_1-100-999', '3-17-1234_5678-999-1', '3-17-1234__5678-999', 'x-100-999'] as const;
export type Door = (typeof DOORS)[number];

/* ────────────────────────────────────────────────────────────────────────────────────
 * Reaching modules that may not exist yet
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * `src/<rel>` as a module, or a failure that names it. Never a skip: an absent module on the
 * implementation branch is the gate doing its job, and must read as red.
 */
export async function contractModule(rel: string): Promise<Record<string, any>> {
  const path = join(SRC, rel);
  try {
    return (await import(path)) as Record<string, any>;
  } catch (error) {
    const why = (error as Error).message.split('\n')[0] ?? '';
    throw new Error(
      `LEAD-1b contract: src/${rel} ${/Cannot find module/.test(why) ? 'is ABSENT' : `failed to load (${why})`}. ` +
        `The spec (§3) names this module; the gate cannot ask its question without it.`,
    );
  }
}

/** One export of `src/<rel>`, or a failure naming both. */
export async function contractExport<T = any>(rel: string, name: string): Promise<T> {
  const module = await contractModule(rel);
  if (!(name in module)) {
    throw new Error(
      `LEAD-1b contract: src/${rel} does not export '${name}'. ` +
        `Exports present: ${Object.keys(module).sort().join(', ') || '(none)'}.`,
    );
  }
  return module[name] as T;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Typed refusals
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** The machine code of a daemon error, whichever spelling (`site_busy` / `confinement.site_busy`). */
export function reasonOf(error: unknown): string {
  const extensions = (error as { extensions?: Record<string, unknown> } | null)?.extensions;
  return typeof extensions?.reason === 'string' ? extensions.reason : '';
}

export function statusOf(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : null;
}

/** Does `error` carry the confinement code `code` (spec §3 errors.ts: all 503)? */
export function hasConfinementCode(error: unknown, code: string): boolean {
  const reason = reasonOf(error);
  return statusOf(error) === 503 && (reason === code || reason.endsWith(`.${code}`) || reason === `confinement_${code}`);
}

/** Run `fn`, return what it threw (or a sentinel naming that it did not). */
export async function caught(fn: () => unknown): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  return new Error('LEAD-1b gate: expected a refusal, and nothing was thrown');
}

export function describeError(error: unknown): { status: number | null; reason: string; message: string } {
  return {
    status: statusOf(error),
    reason: reasonOf(error),
    message: error instanceof Error ? error.message.slice(0, 400) : String(error),
  };
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Unit files, read the way systemd reads them
 * ──────────────────────────────────────────────────────────────────────────────────── */

export interface UnitDirective {
  readonly section: string;
  readonly key: string;
  readonly value: string;
}

/** Every KEY=VALUE line with its section. Comments and blank lines drop; no continuation lines. */
export function unitDirectives(body: string): UnitDirective[] {
  const out: UnitDirective[] = [];
  let section = '';
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#') || line.startsWith(';')) continue;
    const header = /^\[([A-Za-z]+)\]$/.exec(line);
    if (header) {
      section = header[1] as string;
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    out.push({ section, key: line.slice(0, eq).trim(), value: line.slice(eq + 1).trim() });
  }
  return out;
}

export function unitValues(body: string, key: string, section?: string): string[] {
  return unitDirectives(body)
    .filter(entry => entry.key === key && (section === undefined || entry.section === section))
    .map(entry => entry.value);
}

/** `Environment=` assignments (possibly several per line, quoted) → a map. */
export function unitEnvironment(body: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const value of unitValues(body, 'Environment')) {
    const tokens = value.match(/"(?:[^"\\]|\\.)*"|\S+/g) ?? [];
    for (const token of tokens) {
      const bare = token.startsWith('"') ? token.slice(1, -1).replace(/\\(.)/g, '$1') : token;
      const eq = bare.indexOf('=');
      if (eq > 0) env[bare.slice(0, eq)] = bare.slice(eq + 1);
    }
  }
  return env;
}

/** A unit file's directives as `K=V` property strings — what `support/systemd_reach.ts` reads. */
export function unitProperties(body: string, section = 'Service'): string[] {
  return unitDirectives(body)
    .filter(entry => entry.section === section)
    .map(entry => `${entry.key}=${entry.value}`);
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The situation: an instance with declared sites
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** The smallest declaration that parses, with `sites` — the shape tests/provision_render_unit uses. */
export function gateManifestDoc(instance: string, slugs: readonly string[]): Record<string, any> {
  return {
    instance,
    engine: {
      private_dir: `/srv/dedalo/${instance}/private`,
      group: `dedalo-${instance}`,
      checkout_dir: `/srv/dedalo/${instance}/master_dedalo`,
      bun_bin: `/srv/dedalo/${instance}/.bun/bin/bun`,
    },
    web: { server: 'nginx', group: 'www-data' },
    publication_api: { url: 'http://127.0.0.1:3100/publication/server_api/v2' },
    sites: slugs.map(slug => ({ slug, domain: `${slug}.${instance}.example.org` })),
    serving: {
      preprod: { enabled: false, auth: { mode: 'none' } },
      prod: { tls: { mode: 'none' } },
    },
    agent: { driver: 'claude_code', bins: { claude_code: '/usr/local/bin/claude' } },
    limits: {
      session_turn_timeout_ms: 600_000,
      install_timeout_ms: 300_000,
      build_timeout_ms: 420_000,
    },
  };
}

export interface GateInstance {
  readonly manifest: InstanceManifest;
  readonly layout: InstanceLayout;
  /** slug → ordinal k, in declaration order starting at 1 (a fresh host). */
  readonly identities: ReadonlyMap<string, number>;
}

export function gateInstance(instance: string, slugs: readonly string[], doc?: Record<string, any>): GateInstance {
  const manifest = parseManifest(doc ?? gateManifestDoc(instance, slugs), { source: 'a LEAD-1b gate' });
  const layout = derive(manifest);
  return { manifest, layout, identities: new Map(slugs.map((slug, index) => [slug, index + 1])) };
}

/**
 * THE RENDER FACTS the per-site renderers need beyond the layout: which ordinal each declared
 * site holds (from the host ledger, §2.1) and PID 1's release (§2.2 "for PID 1's version").
 *
 * CONTRACT: `Renderer.render(layout, manifest, facts)` — a third argument, which `plan()`
 * derives from the observed host and threads through `renderAll`. The gates call the two
 * renderers that need it directly.
 */
export interface RenderFacts {
  readonly agentIdentities: ReadonlyMap<string, number>;
  readonly systemdVersion: number;
}

export interface RenderedFile {
  readonly path: string;
  readonly name: string;
  readonly body: string;
  readonly owner: string;
  readonly group: string;
  readonly mode: number;
}

/** `render/agent_units.ts` → every socket, target and template, by basename. */
export async function renderAgentUnits(gate: GateInstance, systemdVersion: number): Promise<Map<string, RenderedFile>> {
  const renderer = await contractExport<{ render: (...args: unknown[]) => any[] }>(
    'provision/render/agent_units.ts',
    'agentUnitsRenderer',
  );
  const facts: RenderFacts = { agentIdentities: gate.identities, systemdVersion };
  const files = new Map<string, RenderedFile>();
  for (const artifact of renderer.render(gate.layout, gate.manifest, facts)) {
    // The UNIT files: the egress directories' tmpfiles.d declaration is `renderAgentTmpfiles`.
    if (artifact.path === gate.layout.agentTmpfilesPath) continue;
    const name = String(artifact.path).split('/').pop() as string;
    files.set(name, {
      path: artifact.path,
      name,
      body: artifact.body,
      owner: artifact.owner,
      group: artifact.group,
      mode: artifact.mode,
    });
  }
  return files;
}

/** The rendered tmpfiles.d declaration of `gate`'s egress directories (null when none is rendered). */
export async function renderAgentTmpfiles(gate: GateInstance, systemdVersion = 255): Promise<RenderedFile | null> {
  const { agentUnitsRenderer } = await import('../../src/provision/render/agent_units');
  const facts: RenderFacts = { agentIdentities: gate.identities, systemdVersion };
  const found = (agentUnitsRenderer.render as (...args: unknown[]) => any[])(gate.layout, gate.manifest, facts).find(
    artifact => artifact.path === gate.layout.agentTmpfilesPath,
  );
  if (!found) return null;
  return { path: found.path, name: String(found.path).split('/').pop() as string, body: found.body, owner: found.owner, group: found.group, mode: found.mode };
}

/** The rendered polkit rule body for `gate`, with its facts (declared ordinals). */
export async function renderAgentRule(gate: GateInstance, systemdVersion = 255): Promise<string> {
  const { agentAuthorizationRenderer } = await import('../../src/provision/render/agent_authorization');
  const facts: RenderFacts = { agentIdentities: gate.identities, systemdVersion };
  const artifacts = (agentAuthorizationRenderer.render as (...args: unknown[]) => { body: string }[])(
    gate.layout,
    gate.manifest,
    facts,
  );
  return artifacts[0]!.body;
}

/**
 * Site k's identity name: from the leaf when it exists, else the spec's spelling (§2.1,
 * `dedalo-a-<instance>_<k>`). The fallback exists so that a gate about the PLAN or the
 * DAEMON shows its own red on a HEAD without the leaf, instead of the leaf's absence
 * (which G1 reports on its own).
 */
export async function identityName(instance: string, k: number): Promise<string> {
  try {
    const name = await contractExport<(i: string, k: number) => string>('drivers/agent_identity.ts', 'agentIdentityName');
    return name(instance, k);
  } catch {
    return `dedalo-a-${instance}_${k}`;
  }
}

/** The names of (site k, door d)'s three units, from the identity leaf. */
export async function unitNamesFor(
  prefix: string,
  k: number,
  door: Door,
): Promise<{ socket: string; template: string; target: string; instanceRegex: RegExp }> {
  const agentUnitNames = await contractExport<(p: string, k: number, d: Door) => any>(
    'drivers/agent_identity.ts',
    'agentUnitNames',
  );
  return agentUnitNames(prefix, k, door);
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Executing a polkit rule
 * ──────────────────────────────────────────────────────────────────────────────────── */

export type PolkitAnswer = 'YES' | 'NO' | 'AUTH_ADMIN' | 'NOT_HANDLED' | string;

/**
 * Load a rendered rules file into a fresh `node:vm` context whose `polkit` records the rule,
 * then ask it. The rule is EXECUTED — never read — so a rule that says the right words and
 * answers the wrong thing is red.
 */
export async function loadRule(body: string): Promise<(ask: {
  action?: string;
  user?: string;
  unit?: string | undefined;
  verb?: string | undefined;
}) => PolkitAnswer> {
  const vm = await import('node:vm');
  const rules: Array<(action: unknown, subject: unknown) => unknown> = [];
  const Result = { YES: 'YES', NO: 'NO', AUTH_ADMIN: 'AUTH_ADMIN', NOT_HANDLED: 'NOT_HANDLED' };
  const context = vm.createContext({
    polkit: {
      Result,
      addRule: (fn: (action: unknown, subject: unknown) => unknown) => rules.push(fn),
      log: () => {},
      spawn: () => {
        throw new Error('a rendered agent rule must never spawn');
      },
    },
  });
  vm.runInContext(body, context, { filename: 'agent.rules' });
  if (rules.length !== 1) throw new Error(`the rendered rule file added ${rules.length} rules, expected exactly 1`);
  const rule = rules[0] as (action: unknown, subject: unknown) => unknown;
  return ({ action = 'org.freedesktop.systemd1.manage-units', user = '', unit, verb }) => {
    const details: Record<string, string | undefined> = { unit, verb };
    const answer = rule(
      { id: action, lookup: (key: string) => details[key] },
      { user, groups: [], local: true, active: true, isInGroup: () => false, isInNetGroup: () => false },
    );
    return answer === undefined || answer === null ? 'NOT_HANDLED' : String(answer);
  };
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The host ledger (§2.1) — what `observeHost` reads out of getent passwd / group
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * CONTRACT: `HostState.agentLedger` — the accounts and groups whose names begin with
 * `AGENT_IDENTITY_STEM`, plus the legacy agent and the service user, as `getent passwd`,
 * `shadow` and `group` report them. Every field is a fact the plan must VERIFY, never trust
 * (§2.1). `retired` is the shadow expiry at day 1 (`null`: unread) — never the password lock,
 * which `useradd` sets on every account it creates.
 */
export interface LedgerAccount {
  readonly name: string;
  readonly uid: number;
  /** Primary gid. */
  readonly gid: number;
  readonly gecos: string;
  readonly retired: boolean | null;
}

export interface LedgerGroup {
  readonly name: string;
  readonly gid: number;
  readonly members: readonly string[];
}

export interface AgentLedger {
  readonly accounts: readonly LedgerAccount[];
  readonly groups: readonly LedgerGroup[];
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Scratch directories
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** A short scratch root (sun_path is 104 bytes on macOS), removed by `sweepScratch()`. */
const scratchDirs: string[] = [];
export function shortScratch(tag: string): string {
  // RESOLVED: `/tmp` is a symlink on macOS, and a gate directory whose path runs through a
  // link is one the egress gate refuses (its every ancestor must be a real directory).
  const dir = realpathSync(mkdtempSync(join('/tmp', `l1b-${tag}-`)));
  scratchDirs.push(dir);
  return dir;
}
export function sweepScratch(): void {
  for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
}
