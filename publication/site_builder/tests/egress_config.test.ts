/**
 * THE RETIRED EGRESS KEY IS A LOUD REFUSAL (LEAD-1).
 *
 * `AGENT_EGRESS_ALLOW` took systemd `IPAddressAllow=` tokens — IP ranges and `localhost` —
 * and under systemd's allow-wins filter every one of them re-opened what the deny list
 * claimed to close. Egress is now hostname-only, through the daemon's gate, declared in
 * `AGENT_PROVIDER_HOSTS` (a turn's model provider) and `BUILD_REGISTRY_HOSTS` (a build's
 * package registry). A museum whose env still carries the old key must be TOLD at boot,
 * naming the replacements — a key that silently stopped taking effect is exactly the
 * "configured but not in force" state this daemon refuses everywhere else.
 *
 * Observed in a child process with a scratch env file, because the config is parsed once,
 * at import, and a refusal is `process.exit(1)`.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PACKAGE = resolve(import.meta.dir, '..');
const CONFIG = join(PACKAGE, 'src', 'config.ts');

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** The suite's own env, with relative roots made absolute, plus `extra` lines. */
function envFileWith(extra: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsb-config-'));
  scratch.push(dir);
  const base = readFileSync(join(PACKAGE, '.env.test'), 'utf8')
    .split('\n')
    .map(line => line.replace(/^([A-Z_]+)=\.\/(.*)$/, (_m, key: string, rest: string) => `${key}=${join(PACKAGE, rest)}`))
    .join('\n');
  const path = join(dir, 'site.env');
  writeFileSync(path, `${base}\n${extra}\n`);
  return path;
}

function parseConfigWith(extra: string): { exitCode: number; output: string } {
  const result = Bun.spawnSync([process.execPath, '-e', `await import(${JSON.stringify(CONFIG)});`], {
    cwd: PACKAGE,
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', NODE_ENV: 'test', DEDALO_SITE_ENV_FILE: envFileWith(extra) },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: result.exitCode ?? -1,
    output: `${result.stdout.toString()}\n${result.stderr.toString()}`,
  };
}

describe('AGENT_EGRESS_ALLOW is refused, naming what replaced it', () => {
  test('control: the suite env parses', () => {
    // Without it, the refusal below could be any boot failure at all.
    const control = parseConfigWith('');
    expect({ exitCode: control.exitCode, output: control.exitCode === 0 ? '' : control.output }).toEqual({
      exitCode: 0,
      output: '',
    });
  });

  test('a non-empty AGENT_EGRESS_ALLOW stops the daemon at parse', () => {
    const refused = parseConfigWith('AGENT_EGRESS_ALLOW=10.0.0.0/8');
    expect(refused.exitCode).not.toBe(0);
    expect(refused.output).toContain('AGENT_EGRESS_ALLOW');
    expect(refused.output).toContain('AGENT_PROVIDER_HOSTS');
    expect(refused.output).toContain('BUILD_REGISTRY_HOSTS');
  });

  test('the replacement keys are real keys with a hostname default for builds', () => {
    const accepted = parseConfigWith('AGENT_PROVIDER_HOSTS=api.provider.example\nBUILD_REGISTRY_HOSTS=registry.npmjs.org');
    expect({ exitCode: accepted.exitCode, output: accepted.exitCode === 0 ? '' : accepted.output }).toEqual({
      exitCode: 0,
      output: '',
    });
  });
});

describe('the replacement keys are held to the gate’s hostname grammar AT BOOT', () => {
  // M41: with the superRefine gone these all parsed, and the first a museum heard of a bad
  // host was a 503 on every turn (planProblems) — or, for a build, never.
  const rows = [
    { key: 'AGENT_PROVIDER_HOSTS', value: '10.0.0.5', why: 'IP literal' },
    { key: 'BUILD_REGISTRY_HOSTS', value: 'localhost', why: 'local special-use name' },
    { key: 'AGENT_PROVIDER_HOSTS', value: 'api.x.example,*', why: 'wildcard' },
    { key: 'BUILD_REGISTRY_HOSTS', value: 'registry', why: 'not a lowercase dotted DNS hostname' },
  ] as const;
  for (const row of rows) {
    test(`${row.key}=${row.value} stops the daemon at parse, naming the key`, () => {
      const refused = parseConfigWith(`${row.key}=${row.value}`);
      expect({ exitCode: refused.exitCode === 0 ? 0 : 'non-zero' }).toEqual({ exitCode: 'non-zero' });
      expect(refused.output).toContain(row.key);
      expect(refused.output).toContain(row.why);
    });
  }
});

describe('the configured hosts ARE the plan each door is served — config → policy → gate', () => {
  // The grammar rows above prove a key PARSES; nothing proved the parsed value reaches the gate.
  // `policyFromConfig()` is where the two keys become each door's plan, and a swap or a dropped
  // key there serves a build the provider and a turn the registry, with every row above green.
  const CONFINEMENT = join(PACKAGE, 'src', 'drivers', 'confinement.ts');
  const NETWORK = join(PACKAGE, 'src', 'drivers', 'network_profile.ts');

  function plansWith(extra: string): { exitCode: number; output: string; plans: Record<string, unknown> | null } {
    const script =
      `const { policyFromConfig } = await import(${JSON.stringify(CONFINEMENT)});` +
      `const { egressPlanFor } = await import(${JSON.stringify(NETWORK)});` +
      'const facts = policyFromConfig().egressFacts;' +
      "console.log('PLANS ' + JSON.stringify({ facts, build: egressPlanFor('build', facts).hosts, " +
      "turn: egressPlanFor('turn', facts).hosts, git: egressPlanFor('git', facts).hosts }));";
    const result = Bun.spawnSync([process.execPath, '-e', script], {
      cwd: PACKAGE,
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin', NODE_ENV: 'test', DEDALO_SITE_ENV_FILE: envFileWith(extra) },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stdout = result.stdout.toString();
    const line = stdout.split('\n').find(entry => entry.startsWith('PLANS '));
    return {
      exitCode: result.exitCode ?? -1,
      output: `${stdout}\n${result.stderr.toString()}`,
      plans: line ? (JSON.parse(line.slice('PLANS '.length)) as Record<string, unknown>) : null,
    };
  }

  test('an opencode host: the provider list is the TURN plan, the registry list the BUILD plan, git none', () => {
    const run = plansWith(
      'AGENT_DRIVER=opencode\nAGENT_PROVIDER_HOSTS=api.provider.example\nBUILD_REGISTRY_HOSTS=registry.example.com',
    );
    expect({ exitCode: run.exitCode, output: run.exitCode === 0 ? '' : run.output }).toEqual({ exitCode: 0, output: '' });
    expect(run.plans).toEqual({
      facts: { driver: 'opencode', providerHosts: ['api.provider.example'], registryHosts: ['registry.example.com'] },
      build: ['registry.example.com'],
      turn: ['api.provider.example'],
      git: [],
    });
  });

  test('BUILD_REGISTRY_HOSTS unset: a build is served the npm registry — the hostname default is real', () => {
    const run = plansWith('AGENT_DRIVER=opencode\nAGENT_PROVIDER_HOSTS=api.provider.example');
    expect({ exitCode: run.exitCode, output: run.exitCode === 0 ? '' : run.output }).toEqual({ exitCode: 0, output: '' });
    expect({ build: run.plans?.build, turn: run.plans?.turn }).toEqual({
      build: ['registry.npmjs.org'],
      turn: ['api.provider.example'],
    });
  });
});
