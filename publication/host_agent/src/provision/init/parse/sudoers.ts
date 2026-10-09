/**
 * DISCOVERY: sudo (spec §3.2 row sudo; §4.3 `host.sudo`). The agent's sudoers grant is a file
 * in /etc/sudoers.d (render/sudoers.ts): it is policy only when the policy file the INSTALLED sudo
 * reads includes that directory — `#includedir /etc/sudoers.d` (every sudo) or `@includedir`
 * (sudo ≥ 1.9.1, sudo-rs), directly or through an `@include`/`#include`d file. `##includedir` and
 * `# includedir` are comments, as sudo reads them. The walk follows a file only when sudo itself
 * would read it (sudoersFileProblem: root's, not writable by others) and accepts the quoted and
 * backslash-escaped path forms; an `@include` naming `%h` (the host name) is not followed — both
 * are reported (host.sudo's facts), never silently dropped.
 *
 * WHICH FILE. Classic sudo (sudo.ws) reads /etc/sudoers. sudo-rs — /usr/bin/sudo on a stock Ubuntu
 * 26.04 (the `sudo` alternative points at /usr/lib/cargo/bin/sudo) — reads /etc/sudoers-rs when it
 * exists and /etc/sudoers otherwise (measured, 2026-10-09, ubuntu:26.04 sudo-rs 0.2.13: the binary
 * names both paths; the package ships /etc/sudoers only). With sudo-rs and an /etc/sudoers-rs, the
 * /etc/sudoers text is not policy at all, so discovery reads the file sudo uses, never a guess.
 *
 * PURE, ZERO-DEPENDENCY (tests/provision_zero_dep.test.ts): node: builtins only.
 */
import { dirname, isAbsolute, join } from 'node:path';

/** The binary the agent's grant runs through (src/exec.ts SUDO). */
export const SUDO_BIN = '/usr/bin/sudo';
export const SUDOERS = '/etc/sudoers';
/** sudo-rs's own policy file, read INSTEAD of /etc/sudoers when it exists. */
export const SUDOERS_RS = '/etc/sudoers-rs';

export type SudoFlavor = 'sudo' | 'sudo-rs';

/**
 * The flavor from realpath(/usr/bin/sudo): Debian's and Ubuntu's sudo-rs package installs
 * /usr/lib/cargo/bin/sudo (the `sudo` alternative's target); a binary named `sudo-rs` is sudo-rs
 * too. Anything else (sudo.ws, EL's /usr/bin/sudo itself) is classic sudo.
 */
export function sudoFlavor(realpath: string | null): SudoFlavor {
  if (realpath === null) return 'sudo';
  return /\/cargo\/bin\/sudo$/.test(realpath) || /\/sudo-rs$/.test(realpath) ? 'sudo-rs' : 'sudo';
}

/** The policy file `flavor` reads: sudo-rs prefers /etc/sudoers-rs when it exists. */
export function sudoPolicyFile(flavor: SudoFlavor, exists: (path: string) => boolean): string {
  return flavor === 'sudo-rs' && exists(SUDOERS_RS) ? SUDOERS_RS : SUDOERS;
}

/**
 * One `#include`/`#includedir`/`@include`/`@includedir` line's argument, as sudo reads it (sudoers(5)
 * "Including other files from within sudoers"): a double-quoted path (`\"` and `\\` escaped), or an
 * unquoted one where a backslash escapes the next character (`/etc/my\ file`). `%h` expands to the
 * host's short name and `%%` is a literal `%`. Returns null for a line that is not such a directive.
 * `hostDependent` is true when the path holds `%h`: discovery does not expand it (which host name
 * sudo uses is not a fact init observes), so such a file is NOT followed and is reported.
 */
export function parseIncludeLine(raw: string): { readonly kind: 'include' | 'includedir'; readonly path: string; readonly hostDependent: boolean } | null {
  const match = /^\s*[#@](include|includedir)\s+(.+?)\s*$/.exec(raw.replace(/\r$/, ''));
  if (!match) return null;
  const kind = match[1] as 'include' | 'includedir';
  const arg = match[2] as string;
  let path = '';
  if (arg.startsWith('"')) {
    const quoted = /^"((?:[^"\\]|\\.)*)"$/.exec(arg);
    if (!quoted) return null; // an unterminated quote: sudo's own syntax error, not an include
    path = (quoted[1] as string).replace(/\\(.)/g, '$1');
  } else {
    if (!/^(?:[^\s\\]|\\.)+$/.test(arg)) return null; // trailing words: not a directive sudo accepts
    path = arg.replace(/\\(.)/g, '$1');
  }
  const hostDependent = /%h/.test(path.replace(/%%/g, ''));
  return { kind, path: path.replace(/%%/g, '%'), hostDependent };
}

/** True when the text includes `dir` (`#includedir` or `@includedir`, quoted or not, trailing '/' ignored). */
export function hasIncludedir(text: string, dir: string): boolean {
  const wanted = dir.replace(/\/+$/, '');
  for (const raw of text.split('\n')) {
    const line = parseIncludeLine(raw);
    if (line?.kind === 'includedir' && !line.hostDependent && line.path.replace(/\/+$/, '') === wanted) return true;
  }
  return false;
}

/** The files a sudoers text includes (`#include` / `@include`), relative ones resolved against `from`'s directory; `%h` ones apart. */
export function includeLines(text: string, from: string): { readonly files: string[]; readonly hostDependent: string[] } {
  const files: string[] = [];
  const hostDependent: string[] = [];
  for (const raw of text.split('\n')) {
    const line = parseIncludeLine(raw);
    if (line?.kind !== 'include') continue;
    const path = isAbsolute(line.path) ? line.path : join(dirname(from), line.path);
    (line.hostDependent ? hostDependent : files).push(path);
  }
  return { files, hostDependent };
}

/** The files a sudoers text includes and discovery follows (no `%h`). */
export function includedFiles(text: string, from: string): string[] {
  return includeLines(text, from).files;
}

/** The include walk's depth cap (sudo's own limit is 128; a policy deeper than this is not ours to judge). */
export const SUDOERS_INCLUDE_DEPTH = 8;

/** A policy file as the walk reads it: its text and the facts of the descriptor it was read through. */
export interface SudoersFile {
  readonly text: string;
  readonly uid: number;
  readonly gid: number;
  /** Permission bits. */
  readonly mode: number;
}

/** A file the walk did not follow, and why (reported by host.sudo). */
export interface SudoersSkip {
  readonly path: string;
  readonly reason: string;
}

/**
 * SUDO'S OWN FILE RULE (review S3-3): sudo reads a policy file only when it is owned by root and
 * not writable by others; the walk applies the same judgement before it trusts a file's
 * `includedir` — a file another account could write is not policy anyone may rely on, and sudo
 * itself refuses it. This is STRICTER than classic sudo in one case: sudo.ws also accepts a
 * group-writable file whose group is root (gid 0); the walk skips it and says so (a root:root 0664
 * sudoers file is an anomaly worth a look, never a reason to install the grant through it).
 */
export function sudoersFileProblem(file: Pick<SudoersFile, 'uid' | 'mode'>, rootUid = 0): string | null {
  if (file.uid !== rootUid) return `owned by uid ${file.uid}, not root — sudo does not read it`;
  if ((file.mode & 0o022) !== 0) return `mode ${(file.mode & 0o7777).toString(8).padStart(4, '0')} is group- or world-writable — sudo does not read it`;
  return null;
}

/**
 * Whether the policy rooted at `root` includes `dir`: its own text, then every file it includes,
 * depth-first, each file once. `read` returns null for an unreadable file (skipped). `present` is
 * false when `root` itself is unreadable. A file sudo would not read (sudoersFileProblem) and an
 * `@include` naming `%h` are not followed; both are listed in `skipped`.
 */
export function policyIncludesDir(
  root: string,
  read: (path: string) => SudoersFile | null,
  dir: string,
): { readonly present: boolean; readonly includes: boolean; readonly skipped: readonly SudoersSkip[] } {
  const seen = new Set<string>();
  const skipped: SudoersSkip[] = [];
  const walk = (path: string, depth: number): boolean => {
    if (seen.has(path) || depth > SUDOERS_INCLUDE_DEPTH) return false;
    seen.add(path);
    const file = read(path);
    if (file === null) return false;
    const problem = sudoersFileProblem(file);
    if (problem) {
      skipped.push({ path, reason: problem });
      return false;
    }
    if (hasIncludedir(file.text, dir)) return true;
    const lines = includeLines(file.text, path);
    for (const named of lines.hostDependent) skipped.push({ path: named, reason: 'its name holds %h (the host name): not followed' });
    return lines.files.some(child => walk(child, depth + 1));
  };
  const present = read(root) !== null;
  const includes = present && walk(root, 0);
  return { present, includes, skipped: Object.freeze(skipped) };
}
