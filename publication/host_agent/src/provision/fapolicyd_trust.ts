/**
 * THE FAPOLICYD TRUST SET (owner decision 2026-10-09, spec §9.11) — what ONE instance asks
 * fapolicyd to trust, DERIVED from its declaration's layout and the disk, never from an argument:
 *
 *   - `bun_bin` (a regular file, never a link);
 *   - every regular file of `agent_dir` (the agent runs that Bun as its own account over its own
 *     sources: fapolicyd denies an unprivileged account untrusted language files);
 *   - on nginx `conf_d`, root's host-map renderer Bun (`<host>/map_renderer/bun`, when present);
 *   - the instance's polkit rule (`polkitPath`), BY ITS RENDERED BYTES (render/polkit.ts), never by
 *     what is on disk: polkitd reads it as a language file (application/javascript), and with
 *     `allow_filesystem_mark = 1` fapolicyd checks the sandboxed polkit.service too — an untrusted
 *     rules file then fails to load, the agent's grant is gone and every reload answers "Interactive
 *     authentication required" (measured, RHEL 10.2 two-machine drill, 2026-10-09: polkit's OWN
 *     rules in /usr/share/polkit-1/rules.d failed the same way, fapolicyd-filter.conf leaves them out
 *     of the rpm trust). Trusting the rendered bytes covers the first apply (the plan derives before
 *     it writes) and refuses a hand-edited file (integrity = sha256);
 *   - for each SERVED API, the release `current` names and the store's `previous` (the newest
 *     other release by mtime, releases/store.ts previousRelease — right after a commit that is the
 *     release under test, so the scratch boot runs trusted code), each a real directory directly
 *     under `<state_root>/publication_api/<api>/releases/`.
 *
 * THE LAW: walked by NAME from those roots, lstat only — a symlink is never followed and never
 * trusted (counted in `skippedLinks`: v1's D8 config links live in every v1 release). Nothing
 * outside the roots can be named: there is no input to name it. What cannot be verified is never
 * trusted, at two scopes:
 *   - the CODE (bun_bin, agent_dir, the renderer's Bun, the state root itself): a link in place of a
 *     root, an unreadable or unlistable entry, a path the trust file cannot carry, a FIFO, or more
 *     than TRUST_ENTRY_CAP files REFUSES the whole derivation — nothing is written, the previous
 *     file stays (fail closed, loudly);
 *   - ONE RELEASE (or one API's tree): a `current` that is not `releases/<id>`, a release that is
 *     not a real directory, a hard-linked file (bundles carry none: something else made it), or
 *     any of the above inside it leaves THAT release out, named in `refused` — the code and the
 *     other releases are still trusted, and the agent, which asks for ONE release, refuses it
 *     (releases/trust.ts requireTrust checks the release is in the record).
 *
 * THE FILE (`<FAPOLICYD_TRUST_DIR>/dedalo_<instance>`, root 0644): our stamp (hash.ts, kind
 * `fapolicyd_trust`), comment lines, then fapolicyd's `<path> <size> <sha256>` lines sorted by
 * path. A file without our valid stamp for THIS instance is never overwritten nor removed
 * (trustFileProblem). Two writers render through renderTrustFile, so their bytes cannot differ:
 * `provision apply` (plan.ts plans the write on drift; observeHost derives) and the root oneshot
 * `dedalo-pubhost-trust-<instance>.service` (./fapolicyd_trust_main.ts) the agent starts.
 *
 * THE DAEMON: `fapolicyd-cli --update` returns before the daemon reloaded its database (measured,
 * RHEL 9.8), so commitTrust waits until `--dump-db` lists the LAST line the new file added
 * (pendingEntry); an inactive daemon reads the file when it starts (no update, nothing to wait for).
 *
 * ZERO-DEPENDENCY: node: builtins, ./hash, ./layout, ./render/polkit and the exec contract's types.
 */
import { createHash } from 'node:crypto';
import { closeSync, constants as FS, fstatSync, lstatSync, openSync, readdirSync, readlinkSync, readSync } from 'node:fs';
import { join } from 'node:path';
import type { ExecResult, TrustExec } from './exec_contract';
import { hasDrifted, parseStamp, stamp } from './hash';
import type { AgentLayout, ProvisionApi } from './layout';
import { FAPOLICYD_TRUST_DIR, TRUST_UNIT_PREFIX, trustFileName } from './layout';
import { polkitRenderer } from './render/polkit';
import { PENDING_FACTS } from './render/types';

/** The stamp kind of the trust file (hash.ts). Not a rendered artifact: the record (retire.ts) names it. */
export const TRUST_KIND = 'fapolicyd_trust';
/** root 0644, as fapolicyd-cli writes its own trust.d files (measured RHEL 9.8). */
export const TRUST_FILE_MODE = 0o644;
/** The most entries one derivation trusts: two releases at MAX_BUNDLE_ENTRIES plus the agent's tree. */
export const TRUST_ENTRY_CAP = 450_000;
/**
 * A path a trust line can carry unescaped: fapolicyd reads `%s %lu %64s`, so no whitespace, and
 * nothing its escaping would touch. Release and checkout names never need more.
 */
export const TRUST_PATH_PATTERN = /^\/[A-Za-z0-9._@+,=:~-]+(\/[A-Za-z0-9._@+,=:~-]+)*$/;
/** releases/store.ts RELEASE_ID, respelled (store.ts loads the agent's config; tests hold the two equal). */
export const TRUST_RELEASE_ID = /^\d+(\.\d+){1,3}_[0-9a-f]{7}$/;
/** The `current` link's one target form (releases/store.ts promote). */
const CURRENT_TARGET = /^releases\/([^/]+)$/;

export interface TrustEntry {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
}

/** What one derivation reads (lstat only; the real one is realTrustIo). */
export interface TrustFacts {
  readonly type: 'file' | 'dir' | 'symlink' | 'other';
  readonly size: number;
  readonly nlink: number;
  readonly uid: number;
  readonly mode: number;
  readonly mtimeMs: number;
}
export interface TrustIo {
  lstat(path: string): TrustFacts | null;
  /** The names in a directory (never followed), or null when it cannot be listed. */
  readDir(path: string): string[] | null;
  readLink(path: string): string | null;
  /** A regular file opened O_NOFOLLOW: its size and sha256 as read, or null (gone, not regular, changed while read). */
  hashFile(path: string): { readonly size: number; readonly sha256: string } | null;
}

/** The roots of one instance's trust set, from its layout. */
export interface TrustRoots {
  readonly instance: string;
  readonly stateRoot: string;
  readonly bunBin: string;
  readonly agentDir: string;
  /** nginx `conf_d`: root's renderer Bun; null otherwise. */
  readonly rendererBun: string | null;
  /** Files trusted by the bytes the provisioner renders for them (the polkit rule), never read from disk. */
  readonly rendered: readonly { readonly path: string; readonly body: string }[];
  readonly apis: readonly { readonly api: ProvisionApi; readonly root: string; readonly releases: string; readonly current: string }[];
}

export function trustRootsOf(layout: AgentLayout): TrustRoots {
  const apis = layout.servedApis.map(api => {
    const dirs = api === 'v2' ? layout.state.apis.v2 : layout.v1?.dirs;
    if (dirs === undefined) throw new Error(`fapolicyd trust: '${layout.instance}' serves ${api} without its tree`);
    return Object.freeze({ api, root: dirs.root, releases: dirs.releases, current: dirs.current });
  });
  return Object.freeze({
    instance: layout.instance,
    stateRoot: layout.state.root,
    bunBin: layout.bunBin,
    agentDir: layout.agentDir,
    rendererBun: layout.web.nginxMap === 'conf_d' ? join(layout.host.mapRendererDir, 'bun') : null,
    rendered: Object.freeze(polkitRenderer.render(layout, PENDING_FACTS).map(({ path, body }) => Object.freeze({ path, body }))),
    apis: Object.freeze(apis),
  });
}

export type TrustDerivation =
  | {
      readonly kind: 'ok';
      readonly entries: readonly TrustEntry[];
      readonly skippedLinks: number;
      /** `<api>:<id>` of every release trusted, in API order (current first). */
      readonly releases: readonly string[];
      /** One line per release (or API tree) that could not be verified and is NOT trusted; [] = all were. */
      readonly refused: readonly string[];
    }
  | { readonly kind: 'refused'; readonly reasons: readonly string[] };

/** A path is under (or is) a root, by string: the walk never leaves its roots, this proves it again. */
function within(root: string, path: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

interface Walk {
  readonly entries: TrustEntry[];
  readonly reasons: string[];
  skippedLinks: number;
  count: number;
}

function add(walk: Walk, io: TrustIo, path: string, what: string): void {
  if (!TRUST_PATH_PATTERN.test(path) || path.length > 4096) {
    walk.reasons.push(`${what}: '${JSON.stringify(path).slice(1, -1)}' has a character a fapolicyd trust line cannot carry (${TRUST_PATH_PATTERN.source})`);
    return;
  }
  walk.count += 1;
  if (walk.count > TRUST_ENTRY_CAP) {
    if (walk.count === TRUST_ENTRY_CAP + 1) walk.reasons.push(`more than ${TRUST_ENTRY_CAP} files to trust: the trees cannot be verified whole`);
    return;
  }
  const hashed = io.hashFile(path);
  if (hashed === null) {
    walk.reasons.push(`${what}: '${path}' could not be read whole as a regular file (removed or changed while it was hashed)`);
    return;
  }
  walk.entries.push({ path, size: hashed.size, sha256: hashed.sha256 });
}

/** Every regular file below `root` (a real directory), by name, links counted and never entered. */
function walkTree(walk: Walk, io: TrustIo, root: string, what: string, singleLink: boolean): void {
  const stack = [root];
  while (stack.length > 0 && walk.count <= TRUST_ENTRY_CAP) {
    const dir = stack.pop() as string;
    const names = io.readDir(dir);
    if (names === null) {
      walk.reasons.push(`${what}: the directory '${dir}' cannot be listed`);
      continue;
    }
    for (const name of names.sort()) {
      const path = `${dir}/${name}`;
      if (!within(root, path)) throw new Error(`fapolicyd trust: '${path}' left its root '${root}'`);
      const facts = io.lstat(path);
      if (facts === null) {
        walk.reasons.push(`${what}: '${path}' vanished while the tree was walked`);
      } else if (facts.type === 'symlink') {
        walk.skippedLinks += 1;
      } else if (facts.type === 'dir') {
        stack.push(path);
      } else if (facts.type === 'file') {
        if (singleLink && facts.nlink !== 1) {
          walk.reasons.push(`${what}: '${path}' is hard-linked (${facts.nlink} links) — a release tree holds none, so this one is not verified`);
        } else add(walk, io, path, what);
      } else {
        walk.reasons.push(`${what}: '${path}' is not a regular file, a directory or a link`);
      }
    }
  }
}

function realDir(io: TrustIo, path: string, what: string, reasons: string[]): boolean {
  const facts = io.lstat(path);
  if (facts === null) return false;
  if (facts.type === 'dir') return true;
  reasons.push(`${what} '${path}' is a ${facts.type}, not a real directory — it is never followed`);
  return false;
}

/** The ids of `current` and the store's `previous` (newest other release; ties: the greater id). */
function servedReleases(io: TrustIo, api: TrustRoots['apis'][number], reasons: string[]): string[] {
  const facts = io.lstat(api.current);
  let current: string | null = null;
  if (facts !== null) {
    if (facts.type !== 'symlink') {
      reasons.push(`${api.api}: '${api.current}' is a ${facts.type}, not the release link`);
      return [];
    }
    const target = io.readLink(api.current) ?? '';
    const match = CURRENT_TARGET.exec(target);
    if (match === null || !TRUST_RELEASE_ID.test(match[1] as string)) {
      reasons.push(`${api.api}: '${api.current}' points at '${target}', not releases/<id>`);
      return [];
    }
    current = match[1] as string;
  }
  const rows: { id: string; t: number }[] = [];
  let currentIsDir = false;
  for (const id of io.readDir(api.releases) ?? []) {
    if (!TRUST_RELEASE_ID.test(id)) continue;
    const release = io.lstat(join(api.releases, id));
    if (release?.type !== 'dir') continue;
    if (id === current) currentIsDir = true;
    else rows.push({ id, t: release.mtimeMs });
  }
  if (current !== null && !currentIsDir) {
    reasons.push(`${api.api}: '${api.current}' names releases/${current}, which is not a real directory`);
    return [];
  }
  rows.sort((a, b) => b.t - a.t || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  const previous = rows[0]?.id ?? null;
  return [...(current === null ? [] : [current]), ...(previous === null ? [] : [previous])];
}

/** THE DERIVATION (see the header). Pure over `io`. */
export function deriveTrust(roots: TrustRoots, io: TrustIo): TrustDerivation {
  // The code the agent and the oneshot run: anything unverifiable here refuses the WHOLE set.
  const walk: Walk = { entries: [], reasons: [], skippedLinks: 0, count: 0 };
  const bun = io.lstat(roots.bunBin);
  if (bun?.type !== 'file') walk.reasons.push(`bun_bin '${roots.bunBin}' is ${bun === null ? 'absent' : `a ${bun.type}`}, not a regular file`);
  else add(walk, io, roots.bunBin, 'bun_bin');
  const agent = io.lstat(roots.agentDir);
  if (agent?.type !== 'dir') walk.reasons.push(`agent_dir '${roots.agentDir}' is ${agent === null ? 'absent' : `a ${agent.type}`}, not a real directory`);
  else walkTree(walk, io, roots.agentDir, 'agent_dir', false);
  if (roots.rendererBun !== null) {
    const renderer = io.lstat(roots.rendererBun);
    if (renderer?.type === 'file') add(walk, io, roots.rendererBun, 'the host map renderer');
    else if (renderer !== null) walk.reasons.push(`the host map renderer's Bun '${roots.rendererBun}' is a ${renderer.type}, not a regular file`);
  }
  for (const file of roots.rendered) {
    if (!TRUST_PATH_PATTERN.test(file.path)) {
      walk.reasons.push(`'${JSON.stringify(file.path).slice(1, -1)}' has a character a fapolicyd trust line cannot carry (${TRUST_PATH_PATTERN.source})`);
      continue;
    }
    const bytes = Buffer.from(file.body, 'utf8');
    walk.entries.push({ path: file.path, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  // The releases: one that cannot be verified is left OUT, named in `refused` — never the others.
  const releases: string[] = [];
  const refused: string[] = [];
  if (realDir(io, roots.stateRoot, 'state_root', walk.reasons)) {
    for (const api of roots.apis) {
      if (!within(roots.stateRoot, api.releases)) throw new Error(`fapolicyd trust: ${api.api} releases '${api.releases}' are outside state_root`);
      // Absent trees are an instance with nothing installed yet; anything but a real directory is refused.
      const scoped: string[] = [];
      if (realDir(io, api.root, `the ${api.api} tree`, scoped) && realDir(io, api.releases, `the ${api.api} releases`, scoped)) {
        for (const id of servedReleases(io, api, scoped)) {
          const tree: Walk = { entries: [], reasons: [], skippedLinks: 0, count: walk.count };
          walkTree(tree, io, join(api.releases, id), `${api.api} release ${id}`, true);
          walk.count = tree.count;
          if (tree.reasons.length > 0) {
            refused.push(...tree.reasons.map(reason => `${reason} — ${api.api} release ${id} is not trusted`));
            continue;
          }
          walk.entries.push(...tree.entries);
          walk.skippedLinks += tree.skippedLinks;
          releases.push(`${api.api}:${id}`);
        }
      }
      refused.push(...scoped.map(reason => `${reason} — no ${api.api} release is trusted`));
    }
  }
  if (walk.reasons.length > 0) return Object.freeze({ kind: 'refused', reasons: Object.freeze([...walk.reasons]) });
  const entries = [...walk.entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (let i = 1; i < entries.length; i += 1) {
    if ((entries[i] as TrustEntry).path === (entries[i - 1] as TrustEntry).path) {
      throw new Error(`fapolicyd trust: '${(entries[i] as TrustEntry).path}' derived twice`);
    }
  }
  return Object.freeze({
    kind: 'ok',
    entries: Object.freeze(entries),
    skippedLinks: walk.skippedLinks,
    releases: Object.freeze(releases),
    refused: Object.freeze(refused),
  });
}

/* ── the file ─────────────────────────────────────────────────────────────────────── */

export function trustFilePath(instance: string): string {
  return join(FAPOLICYD_TRUST_DIR, trustFileName(instance));
}

/** One fapolicyd trust line. */
export function trustLine(entry: TrustEntry): string {
  return `${entry.path} ${entry.size} ${entry.sha256}`;
}

/** The whole file, stamped (the one rendering both writers use). */
export function renderTrustFile(instance: string, derivation: Extract<TrustDerivation, { kind: 'ok' }>): string {
  const body = [
    '# GENERATED by the publication host provisioner (src/provision/fapolicyd_trust.ts) — do NOT edit:',
    `# instance '${instance}' (bun_bin, agent_dir, its polkit rule and each served API's current and previous release:`,
    `# ${derivation.releases.length === 0 ? 'none installed' : derivation.releases.join(', ')}). Rewritten by provision apply and by`,
    `# ${TRUST_UNIT_PREFIX}${instance}.service after every release install or rollback.`,
    ...derivation.entries.map(trustLine),
    '',
  ].join('\n');
  return stamp(TRUST_KIND, instance, body);
}

/** Why the file on disk may not be replaced or removed by us, or null (ours, for this instance, unedited). */
export function trustFileProblem(instance: string, path: string, text: string | null): string | null {
  if (text === null) return `'${path}' could not be read`;
  const parsed = parseStamp(text);
  if (parsed === null) return `'${path}' was not written by this provisioner (no stamp) — it is not ours to rewrite or remove: move it aside`;
  if (parsed.instance !== instance || parsed.kind !== TRUST_KIND) {
    return `'${path}' is stamped for '${parsed.instance} ${parsed.kind}', not '${instance} ${TRUST_KIND}' — it belongs to someone else`;
  }
  if (hasDrifted(text)) return `'${path}' was edited by hand (fapolicyd-cli --file writes it too) — move it aside and re-run`;
  return null;
}

/** The trust lines of a stamped file (comments and the stamp skipped). */
export function trustLinesOf(text: string | null): string[] {
  if (text === null) return [];
  return text.split('\n').filter(line => line !== '' && !line.startsWith('#'));
}

/**
 * The line the daemon must list before the new file counts as loaded: the LAST line (in path
 * order) the new file has and the old one does not; null when it only removes lines or is equal.
 */
export function pendingEntry(previous: string | null, next: string): string | null {
  const before = new Set(trustLinesOf(previous));
  const added = trustLinesOf(next).filter(line => !before.has(line));
  return added.at(-1) ?? null;
}

/** `fapolicyd-cli --dump-db` lists `<source> <path> <size> <sha>` (measured: `filedb …`). */
export function dumpLists(dump: string, line: string): boolean {
  return dump.split('\n').some(row => row === `filedb ${line}`);
}

/**
 * The wait for the daemon to list the new file (measured: ~0.3 s). Bounded so the oneshot (30 s for
 * the provision lock, the walk, this wait) ends inside the agent's 60 s spawn bound (exec.ts).
 */
export const COMMIT_TIMEOUT_MS = 20_000;
export const COMMIT_INTERVAL_MS = 250;

export type CommitOutcome =
  | { readonly kind: 'loaded' }
  | { readonly kind: 'inactive' }
  | { readonly kind: 'failed'; readonly why: string };

function firstLine(result: ExecResult): string {
  return (result.stderr.trim() || result.stdout.trim()).split('\n')[0] ?? '';
}

/** `--update`, then wait until the daemon lists `pending` (see the header). */
export function commitTrust(exec: TrustExec, pending: string | null, timeoutMs = COMMIT_TIMEOUT_MS, intervalMs = COMMIT_INTERVAL_MS): CommitOutcome {
  if (!exec.fapolicydActive()) return { kind: 'inactive' };
  const update = exec.fapolicydUpdate();
  if (update.code !== 0) return { kind: 'failed', why: `fapolicyd-cli --update exited ${update.code}: ${firstLine(update)}` };
  if (pending === null) return { kind: 'loaded' };
  for (let waited = 0; ; waited += intervalMs) {
    const dump = exec.fapolicydDump();
    if (dump.code === 0 && dumpLists(dump.stdout, pending)) return { kind: 'loaded' };
    if (waited >= timeoutMs) {
      return {
        kind: 'failed',
        why: `fapolicyd did not load the new trust file within ${timeoutMs} ms (--dump-db ${dump.code === 0 ? 'does not list' : `exited ${dump.code} before listing`} '${pending.split(' ')[0]}')`,
      };
    }
    exec.sleep(intervalMs);
  }
}

/* ── the result record (the agent reads it for status) ───────────────────────────── */

export const TRUST_OUTCOMES = ['applied', 'unchanged', 'inactive', 'refused', 'failed', 'busy', 'not_installed', 'retired'] as const;
export type TrustOutcome = (typeof TRUST_OUTCOMES)[number];

export interface TrustResult {
  readonly v: 1;
  readonly at: string;
  readonly outcome: TrustOutcome;
  /** Lines in the trust file after this run (null: no file). */
  readonly entries: number | null;
  readonly skipped_links: number;
  readonly releases: readonly string[];
  readonly reasons: readonly string[];
}

export function renderTrustResult(result: TrustResult): string {
  return `${JSON.stringify(result)}\n`;
}

/** A result record, or null when absent or not one of ours. */
export function parseTrustResult(text: string | null): TrustResult | null {
  if (text === null) return null;
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    if (raw?.v !== 1 || typeof raw.at !== 'string' || !(TRUST_OUTCOMES as readonly unknown[]).includes(raw.outcome)) return null;
    if (raw.entries !== null && !Number.isSafeInteger(raw.entries)) return null;
    if (!Number.isSafeInteger(raw.skipped_links)) return null;
    if (!Array.isArray(raw.releases) || !raw.releases.every(r => typeof r === 'string')) return null;
    if (!Array.isArray(raw.reasons) || !raw.reasons.every(r => typeof r === 'string')) return null;
    return raw as unknown as TrustResult;
  } catch {
    return null;
  }
}

/* ── the real filesystem ──────────────────────────────────────────────────────────── */

const HASH_CHUNK = 1024 * 1024;

/** The real reads (root's run): lstat, readdir, readlink, an O_NOFOLLOW hash. */
export function realTrustIo(): TrustIo {
  return Object.freeze({
    lstat(path: string): TrustFacts | null {
      try {
        const st = lstatSync(path);
        const type = st.isSymbolicLink() ? 'symlink' : st.isFile() ? 'file' : st.isDirectory() ? 'dir' : 'other';
        return { type, size: st.size, nlink: st.nlink, uid: st.uid, mode: st.mode & 0o7777, mtimeMs: st.mtimeMs };
      } catch {
        return null;
      }
    },
    readDir(path: string): string[] | null {
      try {
        return readdirSync(path);
      } catch {
        return null;
      }
    },
    readLink(path: string): string | null {
      try {
        return readlinkSync(path);
      } catch {
        return null;
      }
    },
    hashFile(path: string) {
      let fd: number;
      try {
        fd = openSync(path, FS.O_RDONLY | FS.O_NOFOLLOW | FS.O_NONBLOCK);
      } catch {
        return null;
      }
      try {
        const before = fstatSync(fd);
        if (!before.isFile()) return null;
        const hash = createHash('sha256');
        const buffer = Buffer.alloc(HASH_CHUNK);
        let size = 0;
        for (;;) {
          const read = readSync(fd, buffer, 0, HASH_CHUNK, null);
          if (read === 0) break;
          hash.update(buffer.subarray(0, read));
          size += read;
        }
        const after = fstatSync(fd);
        if (size !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) return null;
        return { size, sha256: hash.digest('hex') };
      } catch {
        return null;
      } finally {
        closeSync(fd);
      }
    },
  });
}
