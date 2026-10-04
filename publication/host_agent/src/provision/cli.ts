/**
 * provision — the root-run CLI for ONE publication-host agent instance:
 *
 *   bun run src/provision/cli.ts render <instance> [--declaration <file>]   print the artifacts
 *   bun run src/provision/cli.ts check  <instance> [--declaration <file>]   dry run (root)
 *   bun run src/provision/cli.ts apply  <instance> [--declaration <file>]   converge (root)
 *
 * The declaration defaults to /etc/dedalo_publication_host/<instance>.json. Exit codes and
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
 *      writes of step 1.
 * A second `apply` is then a no-op and `check` is clean. `check` reports the same, writing
 * nothing: TLS issues in memory to learn what it WOULD write. Reads no environment variable
 * (the process environment is src/config.ts's alone). The host doors are used with their
 * production trust root ('/').
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProvisionIo } from './apply';
import { apply, hostIo, observeHost, writeAtomic } from './apply';
import type { AgentLayout } from './layout';
import { DEFAULT_PATHS, INSTANCE_PATTERN } from './layout';
import type { Action, HostState } from './plan';
import { PlanRefused, describe, plan, renderAll } from './plan';
import { renderFacts, TOKEN_PLACEHOLDER } from './render/engine_fragment';
import { DeclarationError, parseDeclaration } from './schema';
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

export function hostDeps(): ProvisionDeps {
  return {
    readDeclaration: readOrNull,
    isRoot: () => process.geteuid?.() === 0,
    observeHost: layout => observeHost(layout),
    io: () => hostIo(),
    readRootFile: readOrNull,
    now: () => new Date(),
  };
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
    const source = args.declaration ?? join(DEFAULT_PATHS.configBase, `${args.instance}.json`);
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
    const { layout } = parseDeclaration(raw, source);
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

    if (!deps.isRoot()) {
      err(`provision: '${args.verb}' reads root-only files and must run as root`);
      return EXIT.REFUSED;
    }

    const host = deps.observeHost(layout);
    const actions = plan(layout, host, facts);

    if (args.verb === 'check') {
      const tls = ensureTls(layout, tlsIo(deps, null, host), deps.now());
      const would = [
        ...actions.map(action => `would: ${describe(action)}`),
        ...tls.issued.map(piece => `would: issue the ${piece} certificate (tls)`),
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
      }
    }

    // 3. A token minted in step 1 moves the fingerprint: write what moved.
    const after = renderFacts(layout, path => deps.readRootFile(path));
    if (after.fingerprint !== facts.fingerprint) {
      if (!runActions(plan(layout, deps.observeHost(layout), after).filter(isFilesystemAction))) return failed();
    }

    // 4. The service tail of the first plan.
    if (!runActions(actions.filter(action => !isFilesystemAction(action)))) return failed();

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
