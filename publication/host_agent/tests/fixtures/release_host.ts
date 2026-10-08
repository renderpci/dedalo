/**
 * RELEASE FIXTURES (Task 7) — release trees and a fake publication host.
 *
 * Bundles are built by Task 6's tests/fixtures/ustar_writer.ts (`bundle`): ONE test-only
 * ustar writer in this package, never a second encoder.
 *
 * The fake host stands in for everything exec.ts would run:
 *   - php -l: fails exactly the files containing SYNTAX_ERROR.
 *   - v2 scratch boot: FIRST runs Task 3's REAL `createExec(config, spawner).v2ScratchBoot`
 *     (its confinement — a direct child of v2/releases/ — and its shared/v2.env check), with a
 *     recording spawner instead of systemctl. An install that hands the scratch boot any
 *     other directory is refused here exactly as in production. Then a real loopback
 *     Bun.serve on the chosen port answers 200 only for release ids in `scratchHealthy`.
 *   - v2 restart: records which release is live (= the `current` link at restart time).
 *     A real loopback health server answers 200 only while that release is in `liveHealthy`.
 */

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { config } from '../../src/config';
import { createExec, type Exec, type ExecResult, type Spawner } from '../../src/exec';
import type { InstallTiming } from '../../src/releases/install';
import { apiLayout, BUNDLE_SHA_FILE, currentRelease } from '../../src/releases/store';
import { bundle, type TarEntry } from './ustar_writer';

/** path → file content; `null` = a directory entry. */
export type BundleTree = Record<string, string | null>;

export function makeBundle(tree: BundleTree): Uint8Array {
  const entries: TarEntry[] = Object.entries(tree).map(([path, content]) =>
    content === null ? { path, type: '5' } : { path, data: content },
  );
  return bundle(entries);
}

export function sha256Hex(bytes: Uint8Array): string {
  return new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
}

export function without(tree: BundleTree, ...paths: string[]): BundleTree {
  const copy: BundleTree = { ...tree };
  for (const path of paths) delete copy[path];
  return copy;
}

export const V1_TREE: BundleTree = {
  'json/': null,
  'json/index.php': '<?php echo "v1";',
  'config_api/': null,
  'config_api/sample.server_config_api.php': '<?php // sample',
  'config_api/server_config_headers.php': '<?php // default headers',
};

export const V2_TREE: BundleTree = {
  'package.json': '{"name":"dedalo-publication-api-v2"}',
  'src/': null,
  'src/index.ts': 'export {};',
  'node_modules/': null,
  'node_modules/zod/': null,
  'node_modules/zod/package.json': '{"name":"zod"}',
};

/** Health polling fast enough for a unit suite: a failing case gives up in ~1.5 s. */
export const FAST_TIMING: InstallTiming = {
  scratchHealthMs: 1_500,
  restartHealthMs: 1_500,
  pollIntervalMs: 50,
  probeTimeoutMs: 500,
};

/** The per-API dirs plus the operator's shared config, as a provisioned host has them. */
export async function prepareReleaseRoots(): Promise<void> {
  for (const api of ['v1', 'v2'] as const) {
    const layout = apiLayout(api);
    await mkdir(layout.releases, { recursive: true });
    await mkdir(layout.shared, { recursive: true });
    await mkdir(layout.staging, { recursive: true });
  }
  // Private to its owner (the v1 pool user): releases/install.ts refuses it readable by group or others.
  await writeFile(join(apiLayout('v1').shared, 'server_config_api.php'), '<?php // shared test config', { mode: 0o600 });
  await writeFile(join(apiLayout('v2').shared, 'v2.env'), 'DB_NAME=test\n');
}

/** A spawner that starts nothing and records every argv it was asked to run. */
export function recordingSpawner(): { spawner: Spawner; calls: string[][] } {
  const calls: string[][] = [];
  const ok: ExecResult = { code: 0, stdout: '', stderr: '' };
  return {
    calls,
    spawner: {
      async run(argv) {
        calls.push([...argv]);
        return ok;
      },
    },
  };
}

export interface FakeHostState {
  scratchHealthy: Set<string>;
  liveHealthy: Set<string>;
  lints: string[];
  /** The directory each scratch boot was handed (what Task 3's confinement accepted). */
  scratchDirs: string[];
  /** Whether releases/<id> already held its sha record when it was scratch-booted (must be never). */
  scratchHadRecord: boolean[];
  scratchBoots: string[];
  restarts: number;
  live: string | null;
}

export interface FakeReleaseHost {
  exec: Exec;
  state: FakeHostState;
  healthUrl: string;
  reset(): void;
  close(): void;
}

export function fakeReleaseHost(): FakeReleaseHost {
  const state: FakeHostState = {
    scratchHealthy: new Set(),
    liveHealthy: new Set(),
    lints: [],
    scratchDirs: [],
    scratchHadRecord: [],
    scratchBoots: [],
    restarts: 0,
    live: null,
  };
  const liveServer = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () =>
      new Response(null, { status: state.live !== null && state.liveHealthy.has(state.live) ? 200 : 503 }),
  });
  const confinement = createExec(config, recordingSpawner().spawner);
  const exec: Exec = {
    webConfigtest: async () => {
      throw new Error('release tests never run the web server configtest');
    },
    webReload: async () => {
      throw new Error('release tests never reload the web server');
    },
    startHostMap: async () => {
      throw new Error('release tests never start the host map renderer');
    },
    v2Restart: async () => {
      state.restarts++;
      state.live = currentRelease('v2');
      return { code: 0, stdout: '', stderr: '' };
    },
    phpLint: async (file: string) => {
      state.lints.push(file);
      const text = await Bun.file(file).text();
      return text.includes('SYNTAX_ERROR')
        ? { code: 255, stdout: '', stderr: `PHP Parse error:  syntax error in ${file} on line 1` }
        : { code: 0, stdout: `No syntax errors detected in ${file}`, stderr: '' };
    },
    v2ScratchBoot: async (releaseDir: string, port: number) => {
      // Task 3's REAL confinement first: throws for anything but a direct child of v2/releases/.
      const unit = await confinement.v2ScratchBoot(releaseDir, port);
      state.scratchDirs.push(releaseDir);
      state.scratchHadRecord.push(existsSync(join(releaseDir, BUNDLE_SHA_FILE)));
      const id = basename(releaseDir);
      state.scratchBoots.push(id);
      const healthy = state.scratchHealthy.has(id);
      const server = Bun.serve({
        hostname: '127.0.0.1',
        port,
        fetch: () => new Response(null, { status: healthy ? 200 : 503 }),
      });
      return {
        unit: unit.unit,
        stop: async () => {
          server.stop(true);
        },
      };
    },
  };
  return {
    exec,
    state,
    healthUrl: `http://127.0.0.1:${liveServer.port}/publication/server_api/v2/health`,
    reset() {
      state.scratchHealthy.clear();
      state.liveHealthy.clear();
      state.lints.length = 0;
      state.scratchDirs.length = 0;
      state.scratchHadRecord.length = 0;
      state.scratchBoots.length = 0;
      state.restarts = 0;
      state.live = null;
    },
    close() {
      liveServer.stop(true);
    },
  };
}
