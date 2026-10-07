/**
 * provision — the root-run CLI for ONE publication-host agent instance:
 *
 *   bun run src/provision/cli.ts render <instance> [--declaration <file>]   print the artifacts
 *   bun run src/provision/cli.ts check  <instance> [--declaration <file>]   dry run (root)
 *   bun run src/provision/cli.ts apply  <instance> [--declaration <file>]   converge (root)
 *
 * The declaration defaults to /etc/dedalo_publication_host/<instance>.json. `check` and `apply`
 * refuse a declaration (and a sibling declaration) a non-root principal could edit or replace —
 * see declarationTrustProblems. Exit codes and
 * the secret guard are copied from publication/site_builder/src/provision/cli.ts (EXIT,
 * secretShapedAssignment incl. its placeholder exemption, guarded sinks); the fleet, adopt
 * and remove verbs are not.
 *
 * `apply` CONVERGES IN ONE RUN, in this order:
 *   1. the plan's FILESYSTEM actions (directories, marker, the token — minted here on a first
 *      run — every rendered artifact, sudoers through visudo, and the audit trail's
 *      append-only seal, last);
 *   2. the mTLS material (tls.ts) into the directories step 1 guaranteed, BEFORE any unit
 *      starts: the agent refuses to boot a TLS listener without it;
 *   3. when step 1 minted the token the fingerprint moved: re-plan with the new facts and write
 *      only the filesystem actions that moved (the engine fragment);
 *   4. step 1's SERVICE tail (daemon-reload → enable → start → restart), whose effects are the
 *      writes of step 1, plus a restart of a RUNNING agent when step 2 reissued the CA or the
 *      server certificate (tlsRestart: the agent loads TLS once, at boot).
 * A second `apply` is then a no-op and `check` is clean. `check` reports the same, writing
 * nothing: TLS issues in memory to learn what it WOULD write. Reads no environment variable
 * (the process environment is src/config.ts's alone). The host doors are used with their
 * production trust root ('/').
 */
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ProvisionIo } from './apply';
import { apply, hostIo, observeHost, writeAtomic } from './apply';
import type { AgentLayout } from './layout';
import { DEFAULT_PATHS, INSTANCE_PATTERN } from './layout';
import type { Action, EntryType, HostState, PathFacts } from './plan';
import { PlanRefused, ancestorsBelow, describe, plan, renderAll, trustProblem } from './plan';
import { renderFacts, TOKEN_PLACEHOLDER } from './render/engine_fragment';
import { DeclarationError, parseDeclaration } from './schema';
import type { Sibling } from './siblings';
import { siblingRefusals } from './siblings';
import type { TlsIo } from './tls';
import { ensureTls } from './tls';

export const EXIT = Object.freeze({
  /** Did what was asked, or there was nothing to do. */
  OK: 0,
  /** `check` only: the host does not match its declaration. Nothing was written. */
  DRIFT: 1,
  /** The command line is not a command. */
  USAGE: 2,
  /** The declaration or the host was refused (malformed, foreign file, hand edit, missing account, untrusted code, secret-shaped output). */
  REFUSED: 3,
  /** The work was attempted and failed; the report names the action. */
  FAILED: 4,
});
export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export const VERBS = ['render', 'check', 'apply'] as const;
export type Verb = (typeof VERBS)[number];

/* ── the secret guard ─────────────────────────────────────────────────────────────── */

export const CREDENTIAL_NAME_PATTERN = /(KEY|TOKEN|SECRET|PASSWORD)/i;
const MIN_SECRET_LENGTH = 8;

/**
 * The KEY of a credential-shaped assignment anywhere in `line`, or null. Allowed: a path
 * value (`TLS_KEY_FILE="/etc/…"`), a value with whitespace, a value shorter than 8, and the
 * engine fragment's TOKEN_PLACEHOLDER (an impossible value, greppable on purpose).
 */
export function secretShapedAssignment(line: string): string | null {
  const assignments = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:"([^"\r\n]*)"|(\S+))/g;
  for (const match of line.matchAll(assignments)) {
    const key = match[1] ?? '';
    if (!CREDENTIAL_NAME_PATTERN.test(key)) continue;
    const value = (match[2] ?? match[3] ?? '').trim();
    if (value.length < MIN_SECRET_LENGTH) continue;
    if (/\s/.test(value)) continue;
    if (value === TOKEN_PLACEHOLDER) continue; // the fragment's impossible sentinel, greppable on purpose
    if (value.startsWith('/')) continue;
    return key;
  }
  return null;
}

export class SecretOutputRefused extends Error {
  constructor(key: string) {
    super(
      `provision: refusing to print a line that assigns '${key}' a value — the provisioner names ` +
        'credential FILES, never credential VALUES. Nothing further was printed.',
    );
    this.name = 'SecretOutputRefused';
  }
}

function guarded(sink: (line: string) => void): (line: string) => void {
  return (line: string): void => {
    const key = secretShapedAssignment(line);
    if (key !== null) throw new SecretOutputRefused(key);
    sink(line);
  };
}

/* ── arguments ────────────────────────────────────────────────────────────────────── */

export interface ProvisionArgs {
  readonly verb: Verb;
  readonly instance: string;
  readonly declaration: string | null;
}

export function usageLines(): string[] {
  return [
    'usage: bun run src/provision/cli.ts <render|check|apply> <instance> [--declaration <file>]',
    `  the declaration defaults to ${DEFAULT_PATHS.configBase}/<instance>.json`,
    '  exit: 0 ok · 1 drift (check) · 2 usage · 3 refused · 4 failed',
  ];
}

export function parseArgs(argv: readonly string[]): ProvisionArgs | { readonly error: string } {
  const positional: string[] = [];
  let declaration: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    if (arg === '--declaration') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) return { error: '--declaration needs a file path' };
      if (declaration !== null) return { error: '--declaration given twice' };
      declaration = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('-')) return { error: `unknown flag '${arg}'` };
    positional.push(arg);
  }
  const [verb, instance, ...rest] = positional;
  if (verb === undefined) return { error: 'no verb' };
  if (!(VERBS as readonly string[]).includes(verb)) return { error: `unknown verb '${verb}'` };
  if (instance === undefined) return { error: 'no instance' };
  if (!INSTANCE_PATTERN.test(instance)) return { error: `instance '${instance}' must match ${INSTANCE_PATTERN.source}` };
  if (rest.length > 0) return { error: `unexpected argument '${rest[0]}'` };
  return { verb: verb as Verb, instance, declaration };
}

/* ── the injected world ───────────────────────────────────────────────────────────── */

export interface ProvisionDeps {
  readDeclaration(path: string): string | null;
  /** The `*.json` regular files and symlinks directly in a directory (the other declarations), sorted. */
  listDeclarations(dir: string): string[];
  /** The canonical path (realpath), or the path itself when it does not resolve. */
  canonical(path: string): string;
  /**
   * lstat facts of one path, never following a link (null: absent or not inspectable). The
   * declaration trust law walks a path and its ancestors through this door.
   */
  lstat(path: string): PathFacts | null;
  /** lstat regular file, never following a link: picks the web server's configtest binary. */
  isRealFile(path: string): boolean;
  isRoot(): boolean;
  observeHost(layout: AgentLayout): HostState;
  io(): ProvisionIo;
  /** A root-only file's text, or null (absent or unreadable): the service token, the TLS material. */
  readRootFile(path: string): string | null;
  now(): Date;
}

function readOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function entryType(stats: { isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean }): EntryType {
  if (stats.isSymbolicLink()) return 'symlink';
  if (stats.isDirectory()) return 'dir';
  if (stats.isFile()) return 'file';
  return 'other';
}

function lstatFacts(path: string): PathFacts | null {
  try {
    const stats = lstatSync(path);
    return { type: entryType(stats), uid: stats.uid, gid: stats.gid, mode: stats.mode & 0o7777 };
  } catch {
    return null;
  }
}

export function hostDeps(): ProvisionDeps {
  return {
    readDeclaration: readOrNull,
    listDeclarations: dir => {
      try {
        return readdirSync(dir, { withFileTypes: true })
          // Symlinks too: siblingProblems refuses them (a link is a declaration we will not follow).
          .filter(entry => (entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith('.json'))
          .map(entry => join(dir, entry.name))
          .sort();
      } catch {
        return [];
      }
    },
    canonical: path => {
      try {
        return realpathSync(path);
      } catch {
        return resolve(path);
      }
    },
    lstat: lstatFacts,
    isRealFile: path => {
      try {
        return lstatSync(path).isFile();
      } catch {
        return false;
      }
    },
    isRoot: () => process.geteuid?.() === 0,
    observeHost: layout => observeHost(layout),
    io: () => hostIo(),
    readRootFile: readOrNull,
    now: () => new Date(),
  };
}

/* ── the declaration trust law ────────────────────────────────────────────────────── */

/**
 * Root ACTS on a declaration: it chooses the accounts the sudoers/polkit grants name, the units,
 * the paths root writes. Whoever can edit it — or replace it, or a directory above it — can make
 * the next `apply` grant root-reachable permissions to an account of their choice. So `check`
 * and `apply` only read a declaration that is a REGULAR file (lstat: never a symlink, which can
 * be repointed after this check), owned by uid 0 and not group/world-writable, under real
 * directories with the same property up to and including '/'. The ownership/mode test is
 * plan.ts's trustProblem and the walk is its ancestorsBelow — ONE trust law for the pinned code
 * and the declaration. uid 0 only: the host's user table is not consulted before the
 * declaration is trusted. `render` is exempt: it needs no root, writes nothing, grants nothing
 * (an operator drafts and reviews a declaration from anywhere before installing it).
 */
export const DECLARATION_TRUST_ROOT = '/';

/**
 * Refusal lines for one declaration path (`what` names it in each line). `judged` carries the
 * directories already judged, so several declarations under one config base name a bad
 * directory once. An empty list: trusted.
 */
export function declarationTrustProblems(
  path: string,
  what: string,
  lstat: (path: string) => PathFacts | null,
  judged: Set<string> = new Set(),
): string[] {
  const fix = (target: string): string =>
    `fix: chown root:root '${target}' && chmod go-w '${target}', and keep declarations in ${DEFAULT_PATHS.configBase}/`;
  const problems: string[] = [];
  const leaf = lstat(path);
  if (leaf === null) return [`${what} '${path}' does not exist or cannot be inspected`];
  if (leaf.type === 'symlink') {
    problems.push(
      `${what} '${path}' is a symlink — a link can be repointed after this check; replace it with the file itself ` +
        `(owned by root, not group- or world-writable) in ${DEFAULT_PATHS.configBase}/`,
    );
  } else if (leaf.type !== 'file') {
    problems.push(`${what} '${path}' is a ${leaf.type}, not a regular file`);
  } else {
    const problem = trustProblem(leaf, 0);
    if (problem) {
      problems.push(
        `${what} '${path}' is ${problem} — whoever can edit it chooses whom the next apply grants root-reachable ` +
          `permissions; ${fix(path)}`,
      );
    }
  }
  problems.push(...directoryTrustProblems(path, what, lstat, judged, false));
  return problems;
}

/**
 * The directories above `path` (and `path` itself when `inclusive`), '/' included: each a real
 * directory owned by uid 0, not group/world-writable. An absent directory is skipped (its
 * existing parent is judged); an absent ANCESTOR of an existing leaf cannot happen, so a leaf
 * check always reaches here with every ancestor observable or refused.
 */
function directoryTrustProblems(
  path: string,
  what: string,
  lstat: (path: string) => PathFacts | null,
  judged: Set<string>,
  inclusive: boolean,
): string[] {
  const problems: string[] = [];
  const chain = [DECLARATION_TRUST_ROOT, ...ancestorsBelow(path, DECLARATION_TRUST_ROOT), ...(inclusive ? [path] : [])];
  for (const dir of chain) {
    if (judged.has(dir)) continue;
    judged.add(dir);
    const facts = lstat(dir);
    if (facts === null) continue;
    if (facts.type !== 'dir') {
      problems.push(
        `'${dir}' (above ${what} '${path}') is a ${facts.type}, not a real directory — keep declarations in ` +
          `${DEFAULT_PATHS.configBase}/ under real, root-owned directories`,
      );
      continue;
    }
    const problem = trustProblem(facts, 0);
    if (problem) {
      problems.push(
        `'${dir}' (above ${what} '${path}') is ${problem} — a non-root principal could replace or remove the ` +
          `declarations below it; fix: chown root:root '${dir}' && chmod go-w '${dir}'`,
      );
    }
  }
  return problems;
}

/**
 * Every other declaration in the config base, judged against this one. A sibling that does
 * not parse is a refusal too: isolation that cannot be checked is not assumed.
 */
function siblingProblems(layout: AgentLayout, source: string, deps: ProvisionDeps, judged: Set<string>): string[] {
  // Compared canonically: `--declaration ./x.json`, a doubled '/' or a symlinked config base
  // still names this instance's own file, never a sibling.
  const own = new Set([source, join(layout.configBase, `${layout.instance}.json`)].map(path => deps.canonical(path)));
  // The config base itself and every directory above it, also when it holds no sibling: whoever
  // can write there can REMOVE a sibling and so hide the clash this check exists to find.
  const problems: string[] = directoryTrustProblems(
    layout.configBase,
    'the config base',
    path => deps.lstat(path),
    judged,
    true,
  );
  const siblings: Sibling[] = [];
  for (const path of deps.listDeclarations(layout.configBase)) {
    if (own.has(deps.canonical(path))) continue;
    // A sibling steers this isolation check: one a non-root principal can edit is untrusted input
    // (it could hide a clash, or invent one). Same law as the own declaration; never followed.
    const untrusted = declarationTrustProblems(path, 'sibling declaration', p => deps.lstat(p), judged);
    if (untrusted.length > 0) {
      problems.push(
        ...untrusted.map(line => `cannot check isolation against '${path}': ${line} — or move it out of ${layout.configBase}`),
      );
      continue;
    }
    const text = deps.readDeclaration(path);
    try {
      if (text === null) throw new Error('unreadable');
      siblings.push({ source: path, layout: parseDeclaration(JSON.parse(text), path).layout });
    } catch (error) {
      const why = error instanceof SyntaxError ? 'not JSON' : error instanceof Error ? error.message : String(error);
      problems.push(
        `cannot check isolation against '${path}' (${why.split('\n')[0]}) — fix it, or move it out of ${layout.configBase}`,
      );
    }
  }
  return [...problems, ...siblingRefusals(layout, siblings)];
}

export interface RunOptions {
  readonly deps?: ProvisionDeps;
  readonly out?: (line: string) => void;
  readonly err?: (line: string) => void;
}

function octal(mode: number): string {
  return `0${mode.toString(8)}`;
}

/** plan.ts's filesystem ops, the append-only seal included (it closes the filesystem phase). */
function isFilesystemAction(action: Action): boolean {
  return (
    action.op === 'mkdir' ||
    action.op === 'write' ||
    action.op === 'chown' ||
    action.op === 'chmod' ||
    action.op === 'append-only'
  );
}

/**
 * A reissued CA or server certificate reaches the running agent only through a restart: boot.ts
 * reads TLS_* once (readTlsMaterial), no hot reload. Without it the agent keeps serving the old
 * server certificate and trusting the old client CA — a rotated CA would leave a leaked engine
 * bundle valid, and a renewed leaf would still expire. `tail` is the plan's service tail: a unit it
 * already starts or restarts is not restarted twice; an inactive unit is left to its start. A
 * client-only reissue needs no restart (the agent trusts the CA, not the leaf).
 */
export function tlsRestart(
  layout: AgentLayout,
  host: HostState,
  issued: readonly string[],
  tail: readonly Action[],
): Action[] {
  if (!issued.some(piece => piece === 'ca' || piece === 'server')) return [];
  const unit = layout.agentUnitName;
  if (host.units.get(unit)?.active !== true) return [];
  if (tail.some(a => (a.op === 'start' || a.op === 'restart') && a.unit === unit)) return [];
  return [{ op: 'restart', unit }];
}

/**
 * TLS issuance's io: reads through the root-only reader, writes atomically through the plan's
 * own ProvisionIo with ids from the observed host. `io === null` (check): certificates are
 * issued in memory to learn WHAT would change, and nothing is written.
 */
function tlsIo(deps: ProvisionDeps, io: ProvisionIo | null, host: HostState): TlsIo {
  const idOf = (ids: ReadonlyMap<string, number>, name: string, what: string): number => {
    const id = ids.get(name);
    if (id === undefined) throw new Error(`provision: ${what} '${name}' has no id on this host`);
    return id;
  };
  return {
    readFile: path => deps.readRootFile(path),
    writeFile(path, body, owner, group, mode) {
      if (io === null) return;
      writeAtomic(io, path, body, mode, idOf(host.users, owner, 'user'), idOf(host.groups, group, 'group'));
    },
  };
}

/* ── run ──────────────────────────────────────────────────────────────────────────── */

export function run(argv: readonly string[], options: RunOptions = {}): number {
  const rawOut = options.out ?? ((line: string) => console.log(line));
  const rawErr = options.err ?? ((line: string) => console.error(line));
  const out = guarded(rawOut);
  const err = guarded(rawErr);
  const deps = options.deps ?? hostDeps();

  const args = parseArgs(argv);
  if ('error' in args) {
    rawErr(`provision: ${args.error}`);
    for (const line of usageLines()) rawErr(line);
    return EXIT.USAGE;
  }

  try {
    // Resolved ONCE: the path judged below is the path read (a relative --declaration is the cwd's).
    const source = resolve(args.declaration ?? join(DEFAULT_PATHS.configBase, `${args.instance}.json`));
    // Directories judged by the declaration trust law, shared with the sibling pass below.
    const judged = new Set<string>();
    if (args.verb !== 'render') {
      if (!deps.isRoot()) {
        err(`provision: '${args.verb}' reads root-only files and must run as root`);
        return EXIT.REFUSED;
      }
      // Judged BEFORE it is read: root never parses a declaration a non-root principal can steer.
      const untrusted = declarationTrustProblems(source, 'the declaration', path => deps.lstat(path), judged);
      if (untrusted.length > 0) throw new PlanRefused(args.instance, untrusted);
    }
    const text = deps.readDeclaration(source);
    if (text === null) {
      err(`provision: no readable declaration at '${source}'`);
      return EXIT.REFUSED;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      err(`provision: '${source}' is not JSON`);
      return EXIT.REFUSED;
    }
    const { layout } = parseDeclaration(raw, source, { isRealFile: path => deps.isRealFile(path) });
    if (layout.instance !== args.instance) {
      err(`provision: '${source}' declares instance '${layout.instance}', not '${args.instance}'`);
      return EXIT.REFUSED;
    }

    const facts = renderFacts(layout, path => deps.readRootFile(path));

    if (args.verb === 'render') {
      for (const art of renderAll(layout, facts)) {
        out(`=== ${art.path} (${art.kind}, ${art.owner}:${art.group} ${octal(art.mode)})`);
        for (const line of art.body.replace(/\n$/, '').split('\n')) out(line);
      }
      return EXIT.OK;
    }

    // Several instances on one host: what this one may not share with the others (siblings.ts).
    const isolation = siblingProblems(layout, source, deps, judged);
    if (isolation.length > 0) throw new PlanRefused(layout.instance, isolation);

    const host = deps.observeHost(layout);
    const actions = plan(layout, host, facts);

    if (args.verb === 'check') {
      const tls = ensureTls(layout, tlsIo(deps, null, host), deps.now());
      const restart = tlsRestart(layout, host, tls.issued, actions.filter(a => !isFilesystemAction(a)));
      const would = [
        ...actions.map(action => `would: ${describe(action)}`),
        ...tls.issued.map(piece => `would: issue the ${piece} certificate (tls)`),
        ...restart.map(action => `would: ${describe(action)} (the reissued tls material)`),
      ];
      if (would.length === 0) {
        out(`provision: instance '${layout.instance}' matches its declaration`);
        return EXIT.OK;
      }
      for (const line of would) out(line);
      out(`provision: ${would.length} action(s) would change instance '${layout.instance}'`);
      return EXIT.DRIFT;
    }

    const io = deps.io();
    let written = 0;
    const runActions = (list: readonly Action[]): boolean => {
      if (list.length === 0) return true;
      const report = apply(list, io);
      for (const outcome of report.outcomes) {
        const line = `[${outcome.status}] ${describe(outcome.action)}`;
        if (outcome.status === 'failed') err(`${line}: ${outcome.detail}`);
        else out(line);
      }
      written += report.written.length;
      return report.ok;
    };
    const failed = (): number => {
      err(`provision: apply FAILED for instance '${layout.instance}'; later actions were not run`);
      return EXIT.FAILED;
    };

    // 1. The filesystem (the token is minted here on a first run).
    if (!runActions(actions.filter(isFilesystemAction))) return failed();

    // 2. The mTLS material, before any unit starts.
    const tls = ensureTls(layout, tlsIo(deps, io, host), deps.now());
    if (tls.applicable) {
      out(`tls: issued [${tls.issued.join(', ') || 'nothing'}]; CA sha256 ${tls.caFingerprint}`);
      if (tls.engineBundleChanged) {
        out(
          `tls: THE ENGINE BUNDLE CHANGED — carry ${layout.engineBundlePath} to the work host (0600, the engine's ` +
            `user) and point the engine at it; the engine presents the old client certificate until then`,
        );
        if (!tls.issued.includes('ca')) {
          out(
            `tls: the OLD client certificate STAYS VALID until its notAfter — the agent trusts the CA, not one ` +
              `leaf. To revoke a leaked bundle, rotate the CA: remove ${layout.tls?.caCert} and ${layout.tls?.caKey}, ` +
              `then apply again (new CA, new leaves, agent restarted)`,
          );
        }
      }
    }

    // 3. A token minted in step 1 moves the fingerprint: write what moved.
    const after = renderFacts(layout, path => deps.readRootFile(path));
    if (after.fingerprint !== facts.fingerprint) {
      if (!runActions(plan(layout, deps.observeHost(layout), after).filter(isFilesystemAction))) return failed();
    }

    // 4. The service tail of the first plan, plus the agent restart reissued TLS obliges (after
    //    daemon-reload/enable/start: a restart is the tail's last op).
    const tail = actions.filter(action => !isFilesystemAction(action));
    const restart = tlsRestart(layout, host, tls.issued, tail);
    if (restart.length > 0) out(`tls: the running agent loaded the old material — restarting ${layout.agentUnitName}`);
    if (!runActions([...tail, ...restart])) return failed();

    if (actions.length === 0 && tls.issued.length === 0 && written === 0) {
      out(`provision: instance '${layout.instance}' already matches its declaration — nothing written`);
      return EXIT.OK;
    }
    out(`provision: instance '${layout.instance}' converged (${written} file(s) written)`);
    return EXIT.OK;
  } catch (error) {
    if (error instanceof SecretOutputRefused) {
      rawErr(error.message);
      return EXIT.REFUSED;
    }
    const refused = error instanceof DeclarationError || error instanceof PlanRefused;
    const message = error instanceof Error ? error.message : String(error);
    try {
      for (const line of (refused ? message : `provision: FAILED: ${message}`).split('\n')) err(line);
    } catch (guardError) {
      rawErr(guardError instanceof Error ? guardError.message : String(guardError));
      return EXIT.REFUSED;
    }
    return refused ? EXIT.REFUSED : EXIT.FAILED;
  }
}

if (import.meta.main) {
  process.exit(run(process.argv.slice(2)));
}
