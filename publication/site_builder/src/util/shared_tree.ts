/**
 * THE TREE TWO UIDS SHARE — the modes that make a confined turn able to work at all,
 * and the ONE way this daemon writes into a directory the agent can also write.
 *
 * WHAT WAS WRONG (first). The turn became a second unix identity (`drivers/confinement.ts`),
 * and the PROVISIONED roots were opened to it (`MODES.workspaces`, `MODES.home` — 2770,
 * setgid, world-closed). But a site's own workspace is not a provisioned artifact: it is
 * created at RUNTIME by this daemon, with `mkdir(dir, {recursive:true})` and the daemon's
 * own `UMask=0027`. The result was drwxr-x--- <daemon>:<group> holding -rw-r----- files, so
 * the agent uid — a member of the group and never the owner — could read the site and write
 * nothing. A turn would have started, been authorized, and failed on its first Write.
 *
 * WHAT WAS WRONG (second, and it is what this module exists to close). Opening the tree to
 * the agent MADE A PLANT POSSIBLE that the 0750 tree had not. Every path here is built by
 * `confinedPath`, which is LEXICAL ONLY — it proves the spelling stays under the root and
 * knows nothing about what is on disk. A daemon-side `writeFile`/`chmod`/`mkdir` on such a
 * path FOLLOWS SYMLINKS, so an agent that dropped `site.json.tmp -> ../../audit/audit.jsonl`
 * and waited for the publisher to click publish would have had the daemon truncate its own
 * 0600 audit trail, refill it with agent-authored text, and re-mode it 0660 — readable by
 * the very group the agent is in. That is PUB-01 (`read … the global actor audit log`)
 * handed back by the fix for PUB-01, with the daemon's own uid doing the write.
 *
 * SO EVERY WRITER BELOW IS FD-BASED AND `O_NOFOLLOW`:
 *
 *   - The caller states a TRUSTED ROOT and a RELATIVE path. The root is provisioned (created
 *     by the installer, owned by root or the service user, never inside a tree the agent may
 *     write); everything BELOW it is untrusted and is opened one component at a time.
 *   - Directories are created NON-recursively, level by level, and each level is then opened
 *     `O_DIRECTORY|O_NOFOLLOW` — a symlink there is `ELOOP`, i.e. a refusal, not a redirect.
 *   - Files are opened `O_CREAT|O_NOFOLLOW` and the mode is set with `fchmod` ON THE HANDLE,
 *     so the thing moded is the thing written, with no window in between.
 *   - A refusal is `PlantedSymlinkError`, which names the path: a workspace with a symlink
 *     where the daemon writes is an incident, not a retry.
 *   - A file is opened WITHOUT `O_TRUNC` and its link count is read off the handle first: a
 *     symlink is not the only way to redirect a write. `O_NOFOLLOW` says nothing about a HARD
 *     link, which is the same inode under a second name, so a turn that links an instance
 *     file into its own tree would have had the daemon truncate the original. More than one
 *     name on a file this daemon is about to write is `PlantedHardLinkError`, and the
 *     truncation happens after that question, never as a side effect of the open.
 *   - And the inode is asked WHOSE IT IS. Neither question above says who owns it, and the
 *     agent uid can create files anywhere in the shared tree: writing into one lands the
 *     body (the museum's Publication API key, in the MCP config) in a file whose mode the
 *     agent chose, with the closing `fchmod` failing EPERM only after the bytes are down.
 *     A file this daemon writes is a file this daemon owns — `ForeignOwnerError` otherwise.
 *
 * AND SO IS EVERY READER, because a confused deputy has two directions. `readFile` on a
 * lexical `confinedPath` follows a planted link exactly as `writeFile` did, and the bytes go
 * out over the museum's own API: a link at `<slug>/.builder/builds/<id>.log` was measured
 * being served through `GET /sites/<slug>/builds/<id>`, which is the instance `.env`, the
 * credential store or the 0600 audit trail one link away. `readFileShared`,
 * `readFilePrivate` and `readdirShared` walk the same chain and read off the same kind of
 * handle; an ABSENT file answers `null`, a PLANTED one throws.
 *
 * AND EVERY DAEMON-SIDE WRITER INTO THAT TREE GOES THROUGH THIS MODULE — not the modules of
 * one directory. The census that holds it is TOTAL over `src/` and keyed by DESTINATION
 * (`test/unit/agent_confinement_tripwire.test.ts`), in BOTH DIRECTIONS: a path-based
 * filesystem mutation, or a path-based read of a file's content, is a finding unless the
 * file states per entry that its destination is outside `SITES_ROOT` and outside every
 * workspace. `sites/git.ts`, both drivers' MCP configs and the session store were each an
 * instance of the write plant until they were routed here; the build record, the build log,
 * `site.json` and the session transcript were each an instance of the read one.
 *
 * THE MODES, in one place, because root and runtime must not drift (`MODES.workspaces` and
 * `MODES.home` in `provision/layout.ts` READ these constants):
 *
 *   - DIRECTORIES 2770. Group rwx so the other uid may create, rename and unlink inside
 *     them; SETGID so what it creates stays in the instance's group instead of the agent's
 *     own (the daemon has to read those files back to build and commit them); world 0 so no
 *     other uid on the host — another museum's daemon or agent included — can see a draft.
 *   - FILES 0660. Group rw, for the same reason in the other direction: the daemon writes
 *     `site.json` and `AGENTS.md`, and the agent has to be able to edit what it was given.
 *
 * AND THE MODE IS APPLIED, NEVER REQUESTED. `mkdir`'s mode argument is masked by the process
 * umask (0027 on a provisioned host, which is precisely the bit that must not be removed),
 * and `writeFile` has no way to state one at all. Every helper below therefore follows the
 * write with an explicit `fchmod`, which the umask does not touch.
 *
 * WHAT IS *NOT* SHARED. `.builder/` — the daemon's own per-site state (build records, logs)
 * — is created 0700 by `mkdirPrivate`, and its files 0600 by `writeFilePrivate` /
 * `appendFilePrivate`. It sits inside a directory the agent can write, so this is a
 * statement of intent and not a wall (a turn can still unlink the directory itself and
 * recreate it — which is exactly why every write into it re-verifies its chain with
 * `O_NOFOLLOW` instead of trusting the directory it created earlier).
 *
 * AND A LEVEL THAT ALREADY EXISTS IS PROVED, NEVER RE-MODED. `mkdirPrivate('<slug>/.builder/
 * builds')` used to mode every component it walked with the SHARED mode and only the leaf
 * with the private one, so the first build of a site re-opened `.builder` — the daemon's own
 * 0700 state — to 2770: group rwx for the uid the agent runs as, which could then unlink a
 * 0600 build record and write its own in its place, for the API to serve back as the
 * daemon's. So a component is moded only by the call that CREATED it; a component that was
 * already there is opened `O_NOFOLLOW` to prove it is a real directory and is otherwise left
 * exactly as it is. A mode is restated over a tree by `applySharedModes`, which is the one
 * function whose job that is.
 */

import { constants as FS } from 'node:fs';
import { lstat, mkdir, open, readdir, rename } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { isAbsolute, join, relative as relativePath, resolve, sep } from 'node:path';
import { confinedPath } from './paths';

/** Directories both uids work in: setgid, group-writable, world-closed. */
export const SHARED_DIR_MODE = 0o2770;

/** Files both uids work on. */
export const SHARED_FILE_MODE = 0o660;

/**
 * The daemon's own files that the AGENT must be able to READ and must not be able to WRITE.
 *
 * The MCP configuration is the whole of this class: the turn's own process has to read the
 * museum's Publication API key out of it, and nothing the turn writes may change where that
 * turn's MCP client points. Group r, never group w.
 */
export const AGENT_READABLE_FILE_MODE = 0o640;

/** The daemon's own state inside a shared tree: its uid alone. */
export const PRIVATE_DIR_MODE = 0o700;

/** The daemon's own FILES inside a shared tree: its uid alone. */
export const PRIVATE_FILE_MODE = 0o600;

/** Names inside a workspace that stay the daemon's, and are never opened to the agent. */
export const PRIVATE_NAMES: readonly string[] = Object.freeze(['.builder']);

/**
 * Names `applySharedModes` does not walk into, each for its own reason:
 *
 *   - `.builder` — the daemon's private state (above).
 *   - `.git` — a repository states its own modes, and on a provisioned host it is CREATED
 *     by the agent (git runs confined, `sites/git.ts`), so it already carries them. Walking
 *     it would also make every hook and every object group-writable, which is a wider tree
 *     than anything here needs.
 *   - `node_modules` — a build's own output, up to hundreds of thousands of entries. A
 *     chmod walk over it is a workspace create that takes minutes, and the agent created
 *     it in the first place.
 */
export const NOT_WALKED: readonly string[] = Object.freeze(['.builder', '.git', 'node_modules']);

/**
 * A daemon-side write met a symlink where it expected a real directory or file.
 *
 * There is no benign spelling of this inside a site workspace: the daemon creates every
 * path it writes, so a link in the way was planted by the other uid. It is raised instead
 * of "resolved", and nothing is written.
 */
export class PlantedSymlinkError extends Error {
  constructor(readonly path: string) {
    super(
      `shared_tree: refusing to write through a symlink at '${path}'. Everything under a ` +
        `site workspace is agent-authored; a link where this daemon writes redirects its ` +
        `own uid out of the tree. Nothing was written.`,
    );
    this.name = 'PlantedSymlinkError';
  }
}

/**
 * A file this daemon was about to write already has MORE THAN ONE NAME.
 *
 * `O_NOFOLLOW` refuses a symlink and says nothing about a hard link, which is not a pointer
 * at all — it is the same inode under a second name, so a write through it is a write to the
 * original with no link anywhere for a check to see. An agent uid that can read an
 * instance file (0660, its own group) can link it into its own workspace under a name the
 * daemon writes. Everything this module creates it creates itself, so a link count above one
 * is never benign here.
 *
 * (On Linux `fs.protected_hardlinks` already refuses to link a file the linking uid does not
 * own; that sysctl is the host's decision and not this daemon's, and the files at risk are
 * group-writable to the agent anyway, which satisfies it.)
 */
export class PlantedHardLinkError extends Error {
  constructor(
    readonly path: string,
    readonly links: number,
  ) {
    super(
      `shared_tree: refusing to write '${path}': the file has ${links} names. A second ` +
        `hard link to a file this daemon writes redirects the write to whatever the other ` +
        `name refers to, and O_NOFOLLOW cannot see it. Nothing was written.`,
    );
    this.name = 'PlantedHardLinkError';
  }
}

/**
 * A FILE THIS DAEMON WAS ABOUT TO WRITE (OR TO READ BACK AS ITS OWN) IS NOT ITS OWN.
 *
 * `O_NOFOLLOW` proves the name was not a link and `nlink === 1` proves there is no second
 * name; neither says WHO OWNS THE INODE. The agent uid can create files anywhere in the
 * shared tree — it can unlink `opencode.json` and author its own in its place — and a
 * write into an agent-owned inode is two defects at once: the body (the museum's
 * Publication API key) lands in a file whose MODE the agent chose, and the `fchmod` that
 * was supposed to close it is EPERM, so it fails AFTER the secret is on disk. In the read
 * direction it is the same inode question: a build record or a session transcript this
 * daemon serves back as its own must be one it wrote.
 *
 * So the law is stated once, at the door: this daemon writes and re-reads only inodes it
 * owns. Anything else is an incident and is refused with nothing written and nothing read.
 */
export class ForeignOwnerError extends Error {
  constructor(
    readonly path: string,
    readonly uid: number,
  ) {
    super(
      `shared_tree: refusing '${path}': the file is owned by uid ${uid}, not by this ` +
        `daemon. Everything this module writes it creates itself, so a file under another ` +
        `uid was put there by the agent; writing into it would hand it the body and leave ` +
        `the mode its own. Nothing was written or read.`,
    );
    this.name = 'ForeignOwnerError';
  }
}

/**
 * WHICH ERRNO MEANS "A LINK WAS IN THE WAY" — and it is not one errno.
 *
 * `O_NOFOLLOW` answers `ELOOP` on Linux and `EMLINK` on some BSDs; with `O_DIRECTORY` set,
 * macOS answers `ENOTDIR` instead — which is ALSO what a plain file in a directory's place
 * gives. So the errno only says "stop", and `lstat` says WHY: a symlink is the plant this
 * module exists to refuse, anything else is the caller's own ordinary error, re-thrown
 * unchanged rather than dressed up as an attack.
 */
const REFUSAL_CODES = new Set(['ELOOP', 'EMLINK', 'ENOTDIR']);

async function openNoFollow(path: string, flags: number, mode?: number) {
  try {
    return await open(path, flags | FS.O_NOFOLLOW, mode);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code && REFUSAL_CODES.has(code) && (await isSymlink(path))) {
      throw new PlantedSymlinkError(path);
    }
    throw error;
  }
}

async function isSymlink(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Set a mode on the OPEN handle — never on the path, which a link can move under us. */
async function chmodHandle(path: string, flags: number, mode: number): Promise<void> {
  const handle = await openNoFollow(path, flags);
  try {
    await handle.chmod(mode);
  } finally {
    await handle.close();
  }
}

/** The components of `relative` under `root`, refused if the spelling escapes. */
function segmentsUnder(root: string, relative: string): { target: string; segments: string[] } {
  const target = confinedPath(root, relative);
  const segments = relativePath(resolve(root), target)
    .split(sep)
    .filter(part => part.length > 0);
  if (segments.length === 0) {
    throw new Error(`shared_tree: '${relative}' names the root itself, not a path inside it`);
  }
  return { target, segments };
}

/**
 * Create one level and state its mode on the handle — or, if it was already there, prove it
 * is a real directory and leave its mode alone.
 *
 * The mode belongs to the call that CREATES a directory. Re-stating it on the way past would
 * mean every nested call re-decides the mode of its parents, which is how `.builder` (0700,
 * the daemon's own) was re-opened to 2770 by the first build under it.
 */
async function mkdirLevel(path: string, mode: number): Promise<void> {
  try {
    await mkdir(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    // Existing: the ONE question left is whether it is a directory or a link planted where
    // one was expected. `O_DIRECTORY|O_NOFOLLOW` asks it and answers nothing else.
    const handle = await openNoFollow(path, FS.O_RDONLY | FS.O_DIRECTORY);
    await handle.close();
    return;
  }
  await chmodHandle(path, FS.O_RDONLY | FS.O_DIRECTORY, mode);
}

/** Walk (without creating) every directory component below `root`, refusing a link. */
async function assertRealChain(root: string, segments: readonly string[]): Promise<void> {
  let path = resolve(root);
  for (const segment of segments) {
    path = join(path, segment);
    const handle = await openNoFollow(path, FS.O_RDONLY | FS.O_DIRECTORY);
    await handle.close();
  }
}

async function ensureDir(root: string, relative: string, mode: number): Promise<string> {
  const { target, segments } = segmentsUnder(root, relative);
  let path = resolve(root);
  for (const segment of segments) {
    path = join(path, segment);
    await mkdirLevel(path, mode);
  }
  return target;
}

/**
 * Create a directory (and its missing parents) that BOTH uids can work in.
 *
 * `root` is the trusted prefix — a provisioned root, never a path the agent can replace.
 * Every component of `relative` is created and moded through its own file descriptor.
 */
export async function mkdirShared(root: string, relative: string): Promise<string> {
  // A shared path may not RUN THROUGH the daemon's private state: `mkdirShared` modes what
  // it creates, so `.builder/x` asked for here would create `.builder` group-writable and
  // hand the agent the directory this module exists to keep. The private door states the
  // private mode; there is no spelling that reaches one through the other.
  const { segments } = segmentsUnder(root, relative);
  const priv = segments.find((segment) => PRIVATE_NAMES.includes(segment));
  if (priv) {
    throw new Error(
      `shared_tree: '${relative}' passes through '${priv}', which is the daemon's own ` +
        `state and is never created shared. Use mkdirPrivate.`,
    );
  }
  return ensureDir(root, relative, SHARED_DIR_MODE);
}

/**
 * Create a directory only this daemon may enter (its per-site private state).
 *
 * Every level this call creates is 0700 — including an intermediate. A private path whose
 * parent does not exist yet is a private path: creating its parent shared would be this
 * function widening the very thing it is asked to close.
 */
export async function mkdirPrivate(root: string, relative: string): Promise<string> {
  return ensureDir(root, relative, PRIVATE_DIR_MODE);
}

/**
 * THE TWO QUESTIONS AN OPEN HANDLE CAN STILL BE ASKED — asked before anything is written.
 *
 * `O_NOFOLLOW` proved the NAME was not a link. It did not prove the inode has only this one
 * name (`nlink`), and it did not prove the inode is this daemon's (`uid`). Both are ways for
 * the other uid in the tree to put its own inode where this daemon writes: a hard link makes
 * the write land on the original file under the other name, and an agent-created file makes
 * the body land in a file whose mode the agent chose, with the closing `fchmod` failing
 * EPERM only AFTER the bytes are on disk.
 */
async function assertOwnInode(handle: FileHandle, path: string): Promise<void> {
  const stats = await handle.stat();
  if (stats.nlink > 1) throw new PlantedHardLinkError(path, stats.nlink);
  if (stats.uid !== process.getuid?.()) throw new ForeignOwnerError(path, stats.uid);
}

async function writeThroughHandle(
  root: string,
  relative: string,
  body: string,
  mode: number,
  flags: number,
): Promise<string> {
  const { target, segments } = segmentsUnder(root, relative);
  await assertRealChain(root, segments.slice(0, -1));
  // NO `O_TRUNC` HERE. Truncation at open time happens BEFORE any question can be asked of
  // the thing opened, so a hard-linked victim would already be empty by the time its link
  // count was read. The file is opened, interrogated, and only then emptied.
  const handle = await openNoFollow(target, flags | FS.O_WRONLY | FS.O_CREAT, mode);
  try {
    await assertOwnInode(handle, target);
    if ((flags & FS.O_APPEND) === 0) await handle.truncate(0);
    await handle.writeFile(body, 'utf8');
    await handle.chmod(mode);
  } finally {
    await handle.close();
  }
  return target;
}

/** Write a file both uids can then read AND rewrite. */
export async function writeFileShared(root: string, relative: string, body: string): Promise<void> {
  await writeThroughHandle(root, relative, body, SHARED_FILE_MODE, 0);
}

/**
 * Write a file atomically, shared. The mode is set on the TEMPORARY file, because
 * `rename` carries the inode — and with it the mode — over the target.
 *
 * The tmp name is inside the agent's tree too, so it is written through the same
 * `O_NOFOLLOW` door: `site.json.tmp -> <somewhere else>` was the exact plant this closes.
 *
 * It is ALSO the door for a directory this daemon does not own — `.git/info/`, created by
 * the agent's own `git init` on a provisioned host. A file already there is the agent's, so
 * `fchmod` on it would be EPERM; a tmp sibling this daemon creates is this daemon's, and
 * `rename` carries that inode over whatever was in the way without writing through it.
 */
export async function writeFileSharedAtomic(
  root: string,
  relative: string,
  body: string,
): Promise<void> {
  const tmp = await writeThroughHandle(root, `${relative}.tmp`, body, SHARED_FILE_MODE, 0);
  // `rename` does not follow a symlink at the destination — it replaces it — and the
  // directory chain above it was just proved link-free.
  await rename(tmp, confinedPath(root, relative));
}

/** Write one of the DAEMON's own files (0600) inside a tree the agent can write. */
export async function writeFilePrivate(root: string, relative: string, body: string): Promise<void> {
  await writeThroughHandle(root, relative, body, PRIVATE_FILE_MODE, 0);
}

/**
 * Write one of the DAEMON's own files (0600) ATOMICALLY, through a tmp sibling + `rename`.
 *
 * For the daemon's own state that a CONCURRENT READER polls — the build record the UI polls
 * while a build settles, the session meta the SSE door reads on every message. A truncating
 * write through one descriptor is not atomic (this process awaits between `truncate(0)` and
 * `writeFile`, and serves HTTP on the same event loop), so a poller could read an EMPTY file
 * and the caller above it would answer "no such build" for a build that exists — and a
 * process death mid-write would leave that emptiness permanently, which is how a 'running'
 * session stops being sweepable at boot.
 *
 * The tmp sibling is NOT the plant it would be if it were path-based: it is written through
 * the same `O_NOFOLLOW`, hard-link and owner door as any other file here, and `rename`
 * carries the daemon's own inode — with its 0600 — over whatever was in the way instead of
 * writing through it.
 */
export async function writeFilePrivateAtomic(
  root: string,
  relative: string,
  body: string,
): Promise<void> {
  const tmp = await writeThroughHandle(root, `${relative}.tmp`, body, PRIVATE_FILE_MODE, 0);
  await rename(tmp, confinedPath(root, relative));
}

/**
 * Write one of the DAEMON's own files that the AGENT must be able to read (0640).
 *
 * The MCP configuration, in both drivers. It carries the museum's Publication API key: the
 * turn reads it, the turn may not rewrite it, and no other uid on the host may see it.
 */
export async function writeFileAgentReadable(
  root: string,
  relative: string,
  body: string,
): Promise<string> {
  return writeThroughHandle(root, relative, body, AGENT_READABLE_FILE_MODE, 0);
}

/** Append to one of the DAEMON's own files (0600), creating it 0600 if absent. */
export async function appendFilePrivate(
  root: string,
  relative: string,
  text: string,
): Promise<void> {
  await writeThroughHandle(root, relative, text, PRIVATE_FILE_MODE, FS.O_APPEND);
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * THE READ DIRECTION — the same class, the same door.
 *
 * Closing every daemon-side WRITE and leaving the reads path-based closes half of it. A
 * `readFile(confinedPath(...))` follows a planted link exactly as a `writeFile` did, and the
 * daemon then hands the bytes to the museum's own API: a link at
 * `<slug>/.builder/builds/<id>.log` was measured being served through
 * `GET /sites/<slug>/builds/<id>` as the build's own output, so anything the daemon uid can
 * read and the agent uid cannot — the instance `.env`, `$CREDENTIALS_DIRECTORY`, the 0600
 * actor audit trail — was one planted link away. That is the confused deputy in the read
 * direction, and it is refused at the same door: the parent chain is walked `O_NOFOLLOW`,
 * the target is opened `O_NOFOLLOW`, and the content is read off the HANDLE, never the path.
 *
 * `readFilePrivate` adds the owner question, because the daemon's own state is also its own
 * word: a build record or a session transcript it serves back as its own must be an inode it
 * wrote, not one the agent authored in a `.builder` it recreated.
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** Open a file for reading with the whole chain proved, or `null` when it is not there. */
async function openForRead(
  root: string,
  relative: string,
  requireOwn: boolean,
): Promise<FileHandle | null> {
  const { target, segments } = segmentsUnder(root, relative);
  try {
    await assertRealChain(root, segments.slice(0, -1));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  let handle: FileHandle;
  try {
    handle = await openNoFollow(target, FS.O_RDONLY);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  try {
    const stats = await handle.stat();
    if (stats.nlink > 1) throw new PlantedHardLinkError(target, stats.nlink);
    if (requireOwn && stats.uid !== process.getuid?.()) {
      throw new ForeignOwnerError(target, stats.uid);
    }
  } catch (error) {
    await handle.close();
    throw error;
  }
  return handle;
}

async function readThroughHandle(
  root: string,
  relative: string,
  requireOwn: boolean,
): Promise<string | null> {
  const handle = await openForRead(root, relative, requireOwn);
  if (handle === null) return null;
  try {
    return await handle.readFile('utf8');
  } finally {
    await handle.close();
  }
}

/**
 * Read a file inside a tree the agent can write — refusing a link, refusing a second name,
 * and answering `null` for a file that is simply not there.
 *
 * A REFUSAL IS NOT A `null`. An absent file is an ordinary answer ("no such build"); a
 * PLANTED one is an incident, and it is THROWN so the caller cannot fold it into the same
 * shrug — which is how a leak would become a quiet 404 instead of an alarm.
 */
export async function readFileShared(root: string, relative: string): Promise<string | null> {
  return readThroughHandle(root, relative, false);
}

/** Read one of the DAEMON's OWN files back: link-free, single-named, and its own inode. */
export async function readFilePrivate(root: string, relative: string): Promise<string | null> {
  return readThroughHandle(root, relative, true);
}

/**
 * List a directory inside a tree the agent can write, with every component of the chain —
 * the directory itself included — proved to be a real directory and not a link.
 *
 * `null` when it is not there. The listing itself is by path after the proof, because node
 * exposes no descriptor-relative `readdir`; what that costs is a race on the NAMES in a
 * directory this daemon created, never a read through a link, because every file those names
 * lead to is opened through the doors above.
 */
export async function readdirShared(root: string, relative: string): Promise<string[] | null> {
  const { target, segments } = segmentsUnder(root, relative);
  try {
    await assertRealChain(root, segments);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  return readdir(target);
}

/**
 * The path of `absolute` RELATIVE to a trusted root, refused when it is not under it.
 *
 * The writers take (trusted root, untrusted relative) because that is the only shape in
 * which a chain can be walked. A caller that holds an absolute workspace path — the drivers
 * do, it is what the agent process is given — converts it here rather than by string
 * arithmetic of its own, and a workspace that is not under the root is a bug loud at the
 * first write instead of a write outside the tree.
 */
export function relativeUnderRoot(root: string, absolute: string): string {
  const rel = relativePath(resolve(root), resolve(absolute));
  if (rel.length === 0 || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`shared_tree: '${absolute}' is not inside '${root}'`);
  }
  return rel;
}

/**
 * Re-state the shared modes over a whole tree.
 *
 * For the paths this daemon does not write itself — a template copied with `cp`, a
 * repository created by `git init` — where following every individual write would mean
 * teaching another program this module's rules. `NOT_WALKED` names are skipped entirely,
 * and so is every symlink: the mode is set on a descriptor opened `O_NOFOLLOW`, so a link
 * swapped in between the `readdir` and the `chmod` is refused rather than followed.
 */
export async function applySharedModes(root: string): Promise<void> {
  await chmodHandle(root, FS.O_RDONLY | FS.O_DIRECTORY, SHARED_DIR_MODE);
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (NOT_WALKED.includes(entry.name)) continue;
    if (entry.isSymbolicLink()) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      await applySharedModes(path);
    } else if (entry.isFile()) {
      // O_NONBLOCK: `isFile()` came from the readdir's lstat, and a fifo swapped in after
      // it would otherwise park this open until someone opened the other end.
      await chmodHandle(path, FS.O_RDONLY | FS.O_NONBLOCK, SHARED_FILE_MODE);
    }
  }
}
