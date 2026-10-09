/**
 * THE SOURCE (spec S2, §1.3) — the staged copy `<INIT_BASE>/<instance>/stage/source` that
 * deploy/install.sh built from SOURCE_MANIFEST (init/constants.ts, the one definition the sh
 * gate also reads), root-owned before Bun started.
 *
 *   - `sourceDigest(root)` is the digest the operator confirmed (`--source-digest-confirmed`):
 *     the tree walk of tree_copy.ts over the whole staged directory — byte-identical to
 *     install.sh's `tree_digest "$STAGE/source"` (the shared algorithm, §1.3).
 *   - `readStagedSource(dir)` reads it into the StagedSource contract (init/types.ts): the
 *     layout is CLOSED — every manifest entry present with its kind, nothing else at any level
 *     (an extra file is not "ignored", it is a refusal: someone wrote into root's stage), the
 *     pin grammar, the templates' text, the agent tree's own digest (what code.install compares
 *     with agent_dir), and the facts compare turns into decisions: production dependencies
 *     missing under node_modules, development dependencies present, a test scratch tree.
 *
 * PURE + I/O: the reads go through tree_copy.ts's TreeReader (lstat, O_NOFOLLOW), injected.
 */
import { join } from 'node:path';
import { AGENT_DEV_DEPENDENCIES, TEST_SCRATCH_DIR } from '../plan';
import { SOURCE_MANIFEST } from './constants';
import type { SourceEntry } from './constants';
import type { TreeReader } from './tree_copy';
import { hostTreeReader, treeDigest, TreeRefused } from './tree_copy';
import type { StagedSource } from './types';

export { SOURCE_MANIFEST };
export type { SourceEntry };

/** `.bun-version`: a release pin, nothing else (install.sh step 5.5 checks the same grammar). */
export const PIN_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/;
export const AGENT_SOURCE_PATH = 'publication/host_agent';
export const V2_TEMPLATE_PATH = 'publication/server_api/v2/.env.example';
export const V1_TEMPLATE_PATH = 'publication/server_api/v1/config_api/sample.server_config_api.php';
const TEXT_CAP = 1024 * 1024;

export class SourceRefused extends Error {
  constructor(message: string) {
    super(`source: ${message}`);
    this.name = 'SourceRefused';
  }
}

/** The digest the operator confirmed: the shared tree walk over the whole staged source. */
export function sourceDigest(root: string, reader: TreeReader = hostTreeReader()): string {
  try {
    return treeDigest(root, reader);
  } catch (error) {
    if (error instanceof TreeRefused) throw new SourceRefused(error.message.replace(/^tree: /, ''));
    throw error;
  }
}

/** Every directory a manifest entry needs above it (`publication`, `publication/server_api`, …). */
function containerDirs(manifest: readonly SourceEntry[]): Set<string> {
  const dirs = new Set<string>();
  for (const entry of manifest) {
    const parts = entry.path.split('/');
    for (let i = 1; i < parts.length; i += 1) dirs.add(parts.slice(0, i).join('/'));
  }
  return dirs;
}

/** Refuses anything at the top levels that is neither a manifest entry nor a container of one. */
function assertClosedLayout(dir: string, reader: TreeReader, manifest: readonly SourceEntry[]): void {
  const containers = containerDirs(manifest);
  const entries = new Map(manifest.map(entry => [entry.path, entry]));
  const walk = (rel: string): void => {
    const here = rel === '' ? dir : join(dir, rel);
    for (const name of reader.readdir(here)) {
      const childRel = rel === '' ? name : `${rel}/${name}`;
      const full = join(dir, childRel);
      const facts = reader.lstat(full);
      const entry = entries.get(childRel);
      if (entry !== undefined) {
        const want = entry.kind === 'file' ? 'file' : 'dir';
        if (facts?.type !== want) throw new SourceRefused(`'${childRel}' must be a ${want === 'file' ? 'regular file' : 'directory'}`);
        continue;
      }
      if (containers.has(childRel)) {
        if (facts?.type !== 'dir') throw new SourceRefused(`'${childRel}' must be a directory`);
        walk(childRel);
        continue;
      }
      throw new SourceRefused(`'${childRel}' is not part of the source layout (SOURCE_MANIFEST); the stage holds only what install.sh copied`);
    }
  };
  walk('');
  for (const entry of manifest) {
    // An excluded path inside a tree (the test scratch) is REPORTED (testScratchPresent), not refused: compare prints the fix.
    // An OPTIONAL entry may be absent (the v1 sample of a kit built from a v2-only draft): readStagedSource reports it null.
    if (!entry.optional && reader.lstat(join(dir, entry.path)) === null) throw new SourceRefused(`'${entry.path}' is missing`);
  }
}

function text(reader: TreeReader, path: string, what: string): string {
  const bytes = reader.readFile(path);
  if (bytes.length > TEXT_CAP) throw new SourceRefused(`${what} is over ${TEXT_CAP} bytes`);
  return Buffer.from(bytes).toString('utf8');
}

/** The package.json `dependencies` / `devDependencies` names (an unreadable file is a refusal). */
function packageDependencies(reader: TreeReader, agentDir: string): { dependencies: string[]; devDependencies: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text(reader, join(agentDir, 'package.json'), 'publication/host_agent/package.json'));
  } catch (error) {
    if (error instanceof SourceRefused) throw error;
    throw new SourceRefused('publication/host_agent/package.json is not JSON');
  }
  const names = (key: string): string[] => {
    const value = (raw as Record<string, unknown>)[key];
    if (value === undefined) return [];
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new SourceRefused(`package.json ${key} is not an object`);
    return Object.keys(value).sort();
  };
  return { dependencies: names('dependencies'), devDependencies: names('devDependencies') };
}

const DEPENDENCY_NAME = /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/;

/**
 * The staged source as compare sees it. Throws SourceRefused when the layout is not the closed
 * one, the pin is malformed, or the agent tree is not a code tree (tree_copy.ts's rules).
 */
export function readStagedSource(dir: string, reader: TreeReader = hostTreeReader(), manifest = SOURCE_MANIFEST): StagedSource {
  if (reader.lstat(dir)?.type !== 'dir') throw new SourceRefused(`'${dir}' is not a directory`);
  assertClosedLayout(dir, reader, manifest);
  const pin = text(reader, join(dir, '.bun-version'), '.bun-version').trim();
  if (!PIN_PATTERN.test(pin)) throw new SourceRefused(`.bun-version must match ${PIN_PATTERN.source}`);
  const shaTable = text(reader, join(dir, '.bun-sha256'), '.bun-sha256');
  const agentDir = join(dir, AGENT_SOURCE_PATH);
  const testScratchPresent = reader.lstat(join(agentDir, TEST_SCRATCH_DIR)) !== null;
  const { dependencies } = packageDependencies(reader, agentDir);
  const missingDependencies: string[] = [];
  for (const name of dependencies) {
    if (!DEPENDENCY_NAME.test(name)) throw new SourceRefused(`package.json names a dependency '${name}' outside the npm name grammar`);
    if (reader.lstat(join(agentDir, 'node_modules', name, 'package.json'))?.type !== 'file') missingDependencies.push(name);
  }
  const devDependenciesPresent = AGENT_DEV_DEPENDENCIES.filter(name => reader.lstat(join(agentDir, 'node_modules', name)) !== null);
  let agentDigest: string;
  try {
    agentDigest = treeDigest(agentDir, reader);
  } catch (error) {
    if (error instanceof TreeRefused) throw new SourceRefused(`${AGENT_SOURCE_PATH}: ${error.message.replace(/^tree: /, '')}`);
    throw error;
  }
  return Object.freeze({
    dir,
    digest: sourceDigest(dir, reader),
    pin,
    shaTable,
    agentDir,
    agentDigest,
    v2EnvExample: text(reader, join(dir, V2_TEMPLATE_PATH), V2_TEMPLATE_PATH),
    v1Sample: reader.lstat(join(dir, V1_TEMPLATE_PATH)) === null ? null : text(reader, join(dir, V1_TEMPLATE_PATH), V1_TEMPLATE_PATH),
    missingDependencies: Object.freeze(missingDependencies),
    devDependenciesPresent: Object.freeze(devDependenciesPresent),
    testScratchPresent,
  });
}

/**
 * `--source-digest-confirmed` (spec §1.2): init recomputes the digest and requires equality.
 * Returns the refusal line, or null.
 */
export function confirmedDigestProblem(source: StagedSource, confirmed: string | null): string | null {
  if (confirmed === null) return '--source requires --source-digest-confirmed <sha256> (install.sh passes it)';
  if (!/^[0-9a-f]{64}$/.test(confirmed)) return '--source-digest-confirmed must be 64 lowercase hex';
  if (confirmed !== source.digest) {
    return `the staged source's digest ${source.digest} is not the confirmed ${confirmed}: it changed after you confirmed it — start again through deploy/install.sh`;
  }
  return null;
}
