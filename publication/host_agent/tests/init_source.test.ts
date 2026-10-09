/**
 * init/source.ts on a REAL staged tree (scratch under .test-tmp): the closed SOURCE_MANIFEST
 * layout (init/constants.ts, the one definition install.sh's gate also reads), the pin grammar,
 * the digests (`sourceDigest` = the shared tree walk over the whole stage; `agentDigest` over
 * publication/host_agent), the dependency facts compare turns into decisions, and the
 * `--source-digest-confirmed` equality.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SOURCE_MANIFEST as CONSTANTS_MANIFEST } from '../src/provision/init/constants';
import {
  confirmedDigestProblem,
  readStagedSource,
  SOURCE_MANIFEST,
  SourceRefused,
  sourceDigest,
} from '../src/provision/init/source';
import { hostTreeReader, treeDigest } from '../src/provision/init/tree_copy';
import { freshScratch } from './fixtures/instance';

const reader = hostTreeReader();
let stage = '';

function put(rel: string, body: string): void {
  mkdirSync(dirname(join(stage, rel)), { recursive: true });
  writeFileSync(join(stage, rel), body);
}

/** A complete, minimal staged source. */
function stageSource(): void {
  put('.bun-version', '1.4.2\n');
  put('.bun-sha256', '# bun-v1.4.2\n');
  put('publication/host_agent/package.json', JSON.stringify({ dependencies: { zod: '^4' }, devDependencies: { typescript: '^7' } }));
  put('publication/host_agent/src/index.ts', 'export {};\n');
  put('publication/host_agent/node_modules/zod/package.json', '{}');
  put('publication/server_api/v2/.env.example', 'DB_HOST=localhost\n');
  put('publication/server_api/v1/config_api/sample.server_config_api.php', '<?php\n');
}

beforeEach(async () => {
  stage = join(await freshScratch('isrc'), 'source');
  mkdirSync(stage);
  stageSource();
});

describe('readStagedSource', () => {
  test('reads the closed layout into the StagedSource contract', () => {
    const source = readStagedSource(stage, reader);
    expect(source.pin).toBe('1.4.2');
    expect(source.shaTable).toBe('# bun-v1.4.2\n');
    expect(source.agentDir).toBe(join(stage, 'publication/host_agent'));
    expect(source.agentDigest).toBe(treeDigest(source.agentDir, reader));
    expect(source.digest).toBe(sourceDigest(stage, reader));
    expect(source.v2EnvExample).toBe('DB_HOST=localhost\n');
    expect(source.v1Sample).toBe('<?php\n');
    expect(source.missingDependencies).toEqual([]);
    expect(source.devDependenciesPresent).toEqual([]);
    expect(source.testScratchPresent).toBe(false);
    expect(SOURCE_MANIFEST).toBe(CONSTANTS_MANIFEST); // one definition, re-exported
  });

  test('dependency facts: a missing production dependency, an installed dev dependency, a test scratch tree', () => {
    rmSync(join(stage, 'publication/host_agent/node_modules/zod'), { recursive: true });
    put('publication/host_agent/node_modules/typescript/package.json', '{}');
    put('publication/host_agent/.test-tmp/x', '');
    const source = readStagedSource(stage, reader);
    expect(source.missingDependencies).toEqual(['zod']);
    expect(source.devDependenciesPresent).toEqual(['typescript']);
    expect(source.testScratchPresent).toBe(true);
  });

  test('the layout is CLOSED: an extra entry at any level, a missing entry, a wrong kind are refused', () => {
    put('extra.txt', '');
    expect(() => readStagedSource(stage, reader)).toThrow("'extra.txt' is not part of the source layout");
    rmSync(join(stage, 'extra.txt'));
    put('publication/server_api/v2/other.js', '');
    expect(() => readStagedSource(stage, reader)).toThrow("'publication/server_api/v2/other.js' is not part of the source layout");
    rmSync(join(stage, 'publication/server_api/v2/other.js'));
    rmSync(join(stage, '.bun-sha256'));
    expect(() => readStagedSource(stage, reader)).toThrow("'.bun-sha256' is missing");
    mkdirSync(join(stage, '.bun-sha256'));
    expect(() => readStagedSource(stage, reader)).toThrow("'.bun-sha256' must be a regular file");
    rmSync(join(stage, '.bun-sha256'), { recursive: true });
    put('.bun-sha256', '');
    rmSync(join(stage, 'publication/server_api'), { recursive: true });
    put('publication/server_api', '');
    expect(() => readStagedSource(stage, reader)).toThrow("'publication/server_api' must be a directory");
  });

  test('the v1 sample is OPTIONAL (a kit built from a v2-only draft): absent → null; every other entry stays required', () => {
    rmSync(join(stage, 'publication/server_api/v1'), { recursive: true });
    expect(readStagedSource(stage, reader).v1Sample).toBeNull();
    expect(SOURCE_MANIFEST.filter(entry => entry.optional).map(entry => entry.path)).toEqual(['publication/server_api/v1/config_api/sample.server_config_api.php']);
    rmSync(join(stage, 'publication/server_api/v2/.env.example'));
    expect(() => readStagedSource(stage, reader)).toThrow("'publication/server_api/v2/.env.example' is missing");
  });

  test('a symlink where a manifest file belongs is refused (never followed)', () => {
    rmSync(join(stage, '.bun-version'));
    symlinkSync('/etc/hostname', join(stage, '.bun-version'));
    expect(() => readStagedSource(stage, reader)).toThrow("'.bun-version' must be a regular file");
  });

  test('the pin grammar, package.json and the agent tree rules', () => {
    put('.bun-version', 'latest\n');
    expect(() => readStagedSource(stage, reader)).toThrow('.bun-version must match');
    put('.bun-version', '1.4.2\n');
    put('publication/host_agent/package.json', 'not json');
    expect(() => readStagedSource(stage, reader)).toThrow('package.json is not JSON');
    put('publication/host_agent/package.json', JSON.stringify({ dependencies: ['zod'] }));
    expect(() => readStagedSource(stage, reader)).toThrow('dependencies is not an object');
    put('publication/host_agent/package.json', JSON.stringify({ dependencies: { '../evil': '1' } }));
    expect(() => readStagedSource(stage, reader)).toThrow('outside the npm name grammar');
    put('publication/host_agent/package.json', JSON.stringify({}));
    symlinkSync('/etc/passwd', join(stage, 'publication/host_agent/src/evil'));
    expect(() => readStagedSource(stage, reader)).toThrow(SourceRefused);
    expect(() => readStagedSource(join(stage, 'absent'), reader)).toThrow('is not a directory');
  });

  test('sourceDigest refuses a tree that is not a code tree', () => {
    Bun.spawnSync(['mkfifo', join(stage, 'publication/host_agent/fifo')]);
    expect(() => sourceDigest(stage, reader)).toThrow(SourceRefused);
  });
});

describe('confirmedDigestProblem (--source-digest-confirmed)', () => {
  test('equality is required; the grammar is checked; absence is named', () => {
    const source = readStagedSource(stage, reader);
    expect(confirmedDigestProblem(source, source.digest)).toBeNull();
    expect(confirmedDigestProblem(source, null)).toContain('requires --source-digest-confirmed');
    expect(confirmedDigestProblem(source, 'ABC')).toContain('64 lowercase hex');
    expect(confirmedDigestProblem(source, 'f'.repeat(64))).toContain('changed after you confirmed it');
  });

  test('MUTATION: one changed byte in the agent tree changes the digest', () => {
    const before = readStagedSource(stage, reader).digest;
    put('publication/host_agent/src/index.ts', 'export {}; \n');
    const after = readStagedSource(stage, reader);
    expect(after.digest).not.toBe(before);
    expect(confirmedDigestProblem(after, before)).toContain('changed after you confirmed it');
  });
});
