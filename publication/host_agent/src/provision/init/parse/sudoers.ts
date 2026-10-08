/**
 * DISCOVERY: sudo (spec §3.2 row sudo; §4.3 `host.sudo`). The agent's sudoers grant is a file
 * in /etc/sudoers.d (render/sudoers.ts): it is policy only when the policy file the INSTALLED sudo
 * reads includes that directory — `#includedir /etc/sudoers.d` (every sudo) or `@includedir`
 * (sudo ≥ 1.9.1, sudo-rs), directly or through an `@include`/`#include`d file. `##includedir` and
 * `# includedir` are comments, as sudo reads them.
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

/** True when the text includes `dir` (`#includedir` or `@includedir`, trailing '/' ignored). */
export function hasIncludedir(text: string, dir: string): boolean {
  const wanted = dir.replace(/\/+$/, '');
  for (const raw of text.split('\n')) {
    const match = /^\s*[#@]includedir\s+(\S+)\s*$/.exec(raw.replace(/\r$/, ''));
    if (match && (match[1] as string).replace(/\/+$/, '') === wanted) return true;
  }
  return false;
}

/** The files a sudoers text includes (`#include` / `@include`), relative ones resolved against `from`'s directory. */
export function includedFiles(text: string, from: string): string[] {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    const match = /^\s*[#@]include\s+(\S+)\s*$/.exec(raw.replace(/\r$/, ''));
    if (!match) continue;
    const path = match[1] as string;
    out.push(isAbsolute(path) ? path : join(dirname(from), path));
  }
  return out;
}

/** The include walk's depth cap (sudo's own limit is 128; a policy deeper than this is not ours to judge). */
export const SUDOERS_INCLUDE_DEPTH = 8;

/**
 * Whether the policy rooted at `root` includes `dir`: its own text, then every file it includes,
 * depth-first, each file once. `read` returns null for an unreadable file (skipped). `present` is
 * false when `root` itself is unreadable.
 */
export function policyIncludesDir(root: string, read: (path: string) => string | null, dir: string): { readonly present: boolean; readonly includes: boolean } {
  const seen = new Set<string>();
  const walk = (path: string, depth: number): boolean => {
    if (seen.has(path) || depth > SUDOERS_INCLUDE_DEPTH) return false;
    seen.add(path);
    const text = read(path);
    if (text === null) return false;
    if (hasIncludedir(text, dir)) return true;
    return includedFiles(text, path).some(child => walk(child, depth + 1));
  };
  const present = read(root) !== null;
  return { present, includes: present && walk(root, 0) };
}
