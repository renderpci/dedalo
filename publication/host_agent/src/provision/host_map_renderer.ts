/**
 * ROOT'S HOST-MAP RENDERER COPY (spec §13.5) — what `provision apply` installs into
 * HOST_MAP_RENDERER_DIR, and the rule that decides whether it installs.
 *
 * ONE CODE VERSION RENDERS THE HOST MAP, and it is root's: a copy of the zero-dependency closure
 * of src/rules/host_map_main.ts (MAP_RENDERER_FILES, package-relative), plus the instance's
 * verified Bun binary as `<dir>/bun`, an empty `<dir>/empty.bunfig.toml`, a `VERSION` record and
 * `identities.json` (rewritten on every apply). The unit `dedalo-pubhost-map.service`
 * (render/host_map_unit.ts) runs it with no argument and no environment. The copy is root-owned
 * (`u=rwX,go=rX`), so an agent can start it (its polkit pair) but never change what runs.
 *
 * NEVER DOWNGRADED (rendererInstallDecision): several instances on one host may run different
 * agent versions. An apply installs when nothing is installed, when its grammar is newer, or
 * when the grammar is equal and the digest differs (same grammar: any copy reads every
 * contribution the other did); an OLDER grammar keeps the installed copy — so an older
 * instance's apply can never drop a newer instance's contributions on the floor.
 *
 * PURE, ZERO-DEPENDENCY: node: builtins and the zero-dep src/rules/directives.ts (MAP_GRAMMAR) and
 * src/rules/host_map.ts (IDENTITIES_FILE).
 */
import { createHash } from 'node:crypto';
import { MAP_GRAMMAR } from '../rules/directives';

export { MAP_GRAMMAR };

/**
 * The renderer's closure, package-relative, sorted: every file src/rules/host_map_main.ts reaches
 * through value imports. tests/provision_host_map_renderer.test.ts computes the closure from the
 * sources and holds it EQUAL to this list (and src/config.ts and every package import outside it).
 */
export const MAP_RENDERER_FILES: readonly string[] = Object.freeze([
  'src/errors.ts',
  'src/exec.ts',
  'src/instance/roots.ts',
  'src/provision/exec_contract.ts',
  'src/provision/flock.ts',
  'src/provision/layout.ts',
  'src/provision/lock.ts',
  'src/rules/directives.ts',
  'src/rules/host_map.ts',
  'src/rules/host_map_main.ts',
  'src/rules/txn.ts',
]);

/** The entry the unit runs, below HOST_MAP_RENDERER_DIR. */
export const MAP_RENDERER_ENTRY = 'src/rules/host_map_main.ts';
/** The Bun copy, the empty bunfig (no preload, no install), and the two records. */
export const MAP_RENDERER_BUN = 'bun';
export const MAP_RENDERER_BUNFIG = 'empty.bunfig.toml';
export const MAP_RENDERER_VERSION_FILE = 'VERSION';
export { IDENTITIES_FILE } from '../rules/host_map';

/** `VERSION`: what is installed, and which instance's apply installed it. */
export interface RendererVersion {
  readonly grammar: number;
  /** rendererDigest over MAP_RENDERER_FILES' bytes (the Bun binary excluded: its own hash is pinned). */
  readonly digest: string;
  readonly from: string;
}

const HEX64 = /^[0-9a-f]{64}$/;
const INSTANCE = /^[a-z][a-z0-9_]{1,31}$/;

/** The digest of a renderer copy: sha256 over `<path>\0<sha256(bytes)>\n` for each file, in path order. */
export function rendererDigest(files: readonly { readonly path: string; readonly bytes: Uint8Array }[]): string {
  const hash = createHash('sha256');
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    hash.update(`${file.path}\0${createHash('sha256').update(file.bytes).digest('hex')}\n`);
  }
  return hash.digest('hex');
}

/** The VERSION file body (canonical, trailing newline). */
export function renderRendererVersion(version: RendererVersion): string {
  if (!Number.isSafeInteger(version.grammar) || version.grammar < 1) throw new Error('renderer: grammar must be a positive integer');
  if (!HEX64.test(version.digest)) throw new Error('renderer: digest must be 64 lowercase hex');
  if (!INSTANCE.test(version.from)) throw new Error('renderer: from must be an instance name');
  return `${JSON.stringify({ digest: version.digest, from: version.from, grammar: version.grammar })}\n`;
}

/** A VERSION file, or null when absent or unreadable (an unreadable one is replaced, like an absent one). */
export function parseRendererVersion(text: string | null): RendererVersion | null {
  if (text === null) return null;
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    if (typeof value !== 'object' || value === null) return null;
    const { grammar, digest, from } = value;
    if (!Number.isSafeInteger(grammar) || (grammar as number) < 1) return null;
    if (typeof digest !== 'string' || !HEX64.test(digest)) return null;
    if (typeof from !== 'string' || !INSTANCE.test(from)) return null;
    return { grammar: grammar as number, digest, from };
  } catch {
    return null;
  }
}

export type RendererDecision =
  | { readonly install: true; readonly why: 'absent' | 'newer' | 'digest' }
  | { readonly install: false; readonly why: 'same' | 'older' };

/** Install, or keep what is there (see the header): never a downgrade. */
export function rendererInstallDecision(
  installed: Pick<RendererVersion, 'grammar' | 'digest'> | null,
  own: Pick<RendererVersion, 'grammar' | 'digest'>,
): RendererDecision {
  if (installed === null) return { install: true, why: 'absent' };
  if (own.grammar > installed.grammar) return { install: true, why: 'newer' };
  if (own.grammar < installed.grammar) return { install: false, why: 'older' };
  return own.digest === installed.digest ? { install: false, why: 'same' } : { install: true, why: 'digest' };
}

/** `identities.json`: `{<instance>: <agent uid>}` of every nginx conf_d declaration, sorted, canonical. */
export function renderIdentities(identities: Readonly<Record<string, number>>): string {
  const sorted: Record<string, number> = {};
  for (const instance of Object.keys(identities).sort()) {
    const uid = identities[instance] as number;
    if (!INSTANCE.test(instance)) throw new Error(`renderer: '${instance}' is not an instance name`);
    if (!Number.isSafeInteger(uid) || uid < 0) throw new Error(`renderer: uid of '${instance}' is not a uid`);
    sorted[instance] = uid;
  }
  return `${JSON.stringify(sorted, null, 2)}\n`;
}
