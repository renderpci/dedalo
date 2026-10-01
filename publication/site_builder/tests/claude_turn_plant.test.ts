/**
 * PLANT — what a Claude Code turn LOADS is the daemon's statement, never the workspace's.
 *
 * Before: the turn's argv named the tools (Bash denied) and nothing else, so Claude Code loaded
 * its configuration from where the agent writes — `<workspace>/.claude/settings.json` hooks,
 * `.mcp.json` stdio servers, HOME's settings, skills/commands/agents — and a turn's Write, a
 * build's postinstall or a git hook could plant one for the NEXT turn: shell despite the deny.
 * Measured on Claude Code 2.1.286 (see support/fake_claude.ts, and the live probe
 * deploy/probes/claude_plant_probe.ts).
 *
 * This file holds, on the REAL driver code path (`claudeTurnSetup` → `spawnAgentProcess`):
 *
 *   P1. the rendered argv names its sources: `--setting-sources ''`, the daemon's `--settings`
 *       (hooks off, project MCP off), `--strict-mcp-config` + the daemon's `--mcp-config`,
 *       and the prompt LAST after `--`;
 *   P2. a planted workspace + HOME is NOT loaded — a CLI that reports what it would load says
 *       so — and the same CLI on the pre-fix argv DOES load it (the positive control);
 *   P3. the brief (AGENTS.md) still reaches the turn, as the daemon's system prompt; a planted
 *       link at AGENTS.md is refused, never read through;
 *   P4. a prompt that looks like an option is the prompt;
 *   P5. a CLI whose --help does not list a required flag is REFUSED, typed — at admission, in
 *       the turn's setup (nothing spawned, nothing written), at the manager (before any
 *       reservation), and at boot (said, loudly) — and re-probed when the binary changes;
 *   P6. through a stand-in PID 1, the spec frame's argv carries the restriction.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootSequence, daemonBootSteps } from '../src/boot';
import {
  argvFlags,
  assertClaudeCliConfinable,
  bootProbeClaudeCli,
  claudeCodeDriver,
  claudeTurnArgv,
  claudeTurnSetup,
  DAEMON_SETTINGS,
  listedFlags,
  probeClaudeCli,
  requiredCliFlags,
  UNLISTED_FLAGS,
} from '../src/drivers/claude_code';
import { policyFromConfig } from '../src/drivers/confinement';
import { spawnAgentProcess } from '../src/drivers/process';
import { __setTestDriver } from '../src/drivers/registry';
import type { AgentEvent, SessionStartOptions } from '../src/drivers/types';
import { ConfinementRefusedError } from '../src/errors';
import { mkdirPrivate, writeFileShared } from '../src/util/shared_tree';
import { busyReason, end, tryBegin } from '../src/workspace_activity';
import { LEGACY_HELP, MODERN_HELP, loadReport, writeFakeClaude } from './support/fake_claude';
import { type GatePolicy, lead1bPolicy } from './support/lead1b_host';
import { roots, workspacePath } from './fixtures/instance';

const scratch: string[] = [];
const hosts: GatePolicy[] = [];
afterEach(async () => {
  __setTestDriver('claude_code', null);
  for (const host of hosts.splice(0)) {
    host.standIn.release();
    await host.standIn.close();
  }
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A scratch dir outside every masked prefix question (the fakes only need to execute). */
function scratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

const bins = () => {
  const dir = scratchDir('fake-claude-');
  return {
    modern: writeFakeClaude(dir, 'claude-modern', { version: '2.1.286', help: MODERN_HELP }),
    legacy: writeFakeClaude(dir, 'claude-legacy', { version: '2.0.1', help: LEGACY_HELP, tolerateUnknown: true }),
  };
};

/** A site workspace under SITES_ROOT, its `.builder`, a brief — and every plant PLANT names. */
async function plantedWorkspace(slug: string): Promise<{ ws: string; home: string }> {
  const ws = workspacePath(slug);
  rmSync(ws, { recursive: true, force: true });
  mkdirSync(ws, { recursive: true });
  scratch.push(ws);
  await mkdirPrivate(roots.sitesRoot, join(slug, '.builder'));
  await writeFileShared(roots.sitesRoot, join(slug, 'AGENTS.md'), '# BRIEF_MARKER site rules');
  symlinkSync('AGENTS.md', join(ws, 'CLAUDE.md'));
  mkdirSync(join(ws, '.claude', 'skills', 'planted'), { recursive: true });
  mkdirSync(join(ws, '.claude', 'commands'), { recursive: true });
  const hook = (mark: string) => ({ SessionStart: [{ hooks: [{ type: 'command', command: `touch ${mark}` }] }] });
  writeFileSync(join(ws, '.claude', 'settings.json'), JSON.stringify({ enableAllProjectMcpServers: true, hooks: hook('PROJECT_HOOK') }));
  writeFileSync(join(ws, '.claude', 'settings.local.json'), JSON.stringify({ hooks: hook('LOCAL_HOOK') }));
  writeFileSync(join(ws, '.claude', 'skills', 'planted', 'SKILL.md'), '---\nname: planted\n---\n');
  writeFileSync(join(ws, '.claude', 'commands', 'planted.md'), '!`touch CMD`\n');
  writeFileSync(join(ws, '.mcp.json'), JSON.stringify({ mcpServers: { planted: { type: 'stdio', command: '/bin/sh', args: ['-c', 'touch MCP'] } } }));
  // The turn's HOME — the unit's persistent per-(site, door) directory — planted too.
  const home = scratchDir('fake-claude-home-');
  mkdirSync(join(home, '.claude', 'skills', 'userplant'), { recursive: true });
  writeFileSync(join(home, '.claude', 'settings.json'), JSON.stringify({ hooks: hook('USER_HOOK') }));
  return { ws, home };
}

function startOptions(slug: string, home: string, prompt = 'build the page'): SessionStartOptions {
  return {
    slug,
    workspace: workspacePath(slug),
    prompt,
    mcp: { name: 'dedalo_publication', url: 'http://127.0.0.1:9/mcp' },
    env: { PATH: '/usr/bin:/bin', HOME: home },
    timeoutMs: 30_000,
  };
}

async function drain(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

const texts = (events: AgentEvent[]) => events.flatMap(event => (event.type === 'text' ? [event.text] : []));
const errors = (events: AgentEvent[]) => events.flatMap(event => (event.type === 'error' ? [event.message] : []));

/** Run one real claude_code turn (declared `none`: a local child) against `bin`. */
async function runTurn(slug: string, bin: string, home: string, prompt?: string) {
  const opts = startOptions(slug, home, prompt);
  return drain(spawnAgentProcess(opts, claudeTurnSetup(opts, { bin }), policyFromConfig()).events);
}

describe('P1 — the rendered argv names every configuration source', () => {
  test('setting sources none, the daemon’s settings, strict MCP, and the prompt last after --', () => {
    const argv = claudeTurnArgv({ bin: '/opt/claude', prompt: 'x', mcpConfigPath: '/w/.builder/mcp.json', brief: 'b', resumeToken: 'r' });
    const at = (flag: string) => argv.indexOf(flag);
    expect(argv[at('--setting-sources') + 1]).toBe('');
    expect(JSON.parse(argv[at('--settings') + 1] as string)).toEqual({ disableAllHooks: true, enableAllProjectMcpServers: false });
    expect(at('--strict-mcp-config')).toBeGreaterThan(0);
    expect(argv[at('--mcp-config') + 1]).toBe('/w/.builder/mcp.json');
    expect(argv[at('--disallowedTools') + 1]).toBe('Bash,WebFetch,WebSearch');
    expect(argv[at('--append-system-prompt') + 1]).toBe('b');
    expect(argv[at('--resume') + 1]).toBe('r');
    expect(argv.slice(-2)).toEqual(['--', 'x']);
    // ONE `--`, and every option is before it.
    expect(argv.filter(token => token === '--')).toEqual(['--']);
    // The daemon's settings are the frozen constant, and only booleans (an invalid source is
    // silently ignored in -p mode — the one way this layer could vanish).
    expect(Object.values(DAEMON_SETTINGS).every(value => typeof value === 'boolean')).toBe(true);
  });

  test('the probe demands every flag the argv passes, bar the named exemptions', () => {
    const required = requiredCliFlags();
    for (const flag of ['--setting-sources', '--settings', '--strict-mcp-config', '--mcp-config', '--disallowedTools', '--allowedTools', '--permission-mode', '--append-system-prompt', '--resume', '-p']) {
      expect({ flag, required: required.includes(flag) }).toEqual({ flag, required: true });
    }
    expect(required).not.toContain('--max-turns');
    for (const [flag, reason] of Object.entries(UNLISTED_FLAGS)) expect({ flag, stated: reason.length > 60 }).toEqual({ flag, stated: true });
    // The parser counts DEFINED options, not mentions: LEGACY_HELP mentions --strict-mcp-config
    // inside another option's description.
    expect(LEGACY_HELP).toContain('--strict-mcp-config');
    expect(listedFlags(LEGACY_HELP).has('--strict-mcp-config')).toBe(false);
    expect(listedFlags(MODERN_HELP).has('--strict-mcp-config')).toBe(true);
    expect(argvFlags(['claude', '-p', '--x', 'v', '--', '--not-a-flag'])).toEqual(['-p', '--x']);
  });
});

describe('P2 — a planted workspace and HOME are NOT loaded', () => {
  test('the real turn setup: no hook, no planted MCP server, no project memory, no skill — only the daemon’s', async () => {
    const { modern } = bins();
    const { home } = await plantedWorkspace('zzplant-p2');
    const events = await runTurn('zzplant-p2', modern, home);
    expect(errors(events)).toEqual([]);
    const report = loadReport(texts(events));
    expect(report).not.toBeNull();
    expect({
      sources: report?.sources,
      settingsFrom: report?.settingsFrom,
      hooks: report?.hooks,
      mcp: (report?.mcp as Array<{ name: string }>).map(server => server.name),
      memory: report?.memory,
      extensions: report?.extensions,
    }).toEqual({ sources: [], settingsFrom: ['flag'], hooks: [], mcp: ['dedalo_publication'], memory: [], extensions: [] });
  });

  test('POSITIVE CONTROL: the same CLI on the pre-fix argv loads every plant', async () => {
    const { modern } = bins();
    const { ws, home } = await plantedWorkspace('zzplant-p2c');
    // The argv this driver ran until PLANT: no source restriction, no strict MCP, no --settings.
    const before = [modern, '-p', 'x', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits', '--max-turns', '50', '--mcp-config', join(ws, '.builder', 'mcp.json'), '--allowedTools', 'Read', '--disallowedTools', 'Bash'];
    writeFileSync(join(ws, '.builder', 'mcp.json'), JSON.stringify({ mcpServers: { dedalo_publication: { type: 'http', url: 'http://x' } } }));
    const proc = Bun.spawn(before, { cwd: ws, env: { PATH: '/usr/bin:/bin', HOME: home }, stdout: 'pipe' });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    const report = loadReport(out.split('\n').filter(Boolean).flatMap(line => (JSON.parse(line).message?.content ?? []).map((block: { text: string }) => block.text)));
    expect(report?.hooks).toEqual(['touch USER_HOOK', 'touch PROJECT_HOOK', 'touch LOCAL_HOOK']);
    expect((report?.mcp as Array<{ name: string }>).map(server => server.name)).toEqual(['dedalo_publication', 'planted']);
    expect(report?.memory).toEqual(['CLAUDE.md']);
  });
});

describe('P3 — the brief still reaches the turn, from the daemon', () => {
  test('AGENTS.md rides --append-system-prompt; a planted link there is refused, never read through', async () => {
    const { modern } = bins();
    const { ws, home } = await plantedWorkspace('zzplant-p3');
    const report = loadReport(texts(await runTurn('zzplant-p3', modern, home)));
    expect(report?.appendSystemPrompt).toBe('# BRIEF_MARKER site rules');

    const victim = join(scratchDir('fake-claude-victim-'), 'secret');
    writeFileSync(victim, 'DAEMON_SECRET');
    rmSync(join(ws, 'AGENTS.md'));
    symlinkSync(victim, join(ws, 'AGENTS.md'));
    const events = await runTurn('zzplant-p3', modern, home);
    expect(loadReport(texts(events))).toBeNull();
    expect(errors(events).join(' ')).toContain('refusing to write through a symlink');
    expect(JSON.stringify(events)).not.toContain('DAEMON_SECRET');
    // Refused BEFORE the MCP config was written.
    expect(existsSync(join(ws, '.builder', 'mcp.json'))).toBe(false);
  });
});

describe('P4 — a prompt is a prompt', () => {
  test('a prompt that looks like an option is passed as the prompt, never parsed', async () => {
    const { modern } = bins();
    const { home } = await plantedWorkspace('zzplant-p4');
    const prompt = '--mcp-config={"mcpServers":{"x":{"type":"stdio","command":"/bin/sh"}}}';
    const report = loadReport(texts(await runTurn('zzplant-p4', modern, home, prompt)));
    expect(report?.prompt).toBe(prompt);
    expect((report?.mcp as Array<{ name: string }>).map(server => server.name)).toEqual(['dedalo_publication']);
  });
});

describe('P5 — a CLI that cannot carry the restriction is refused, typed', () => {
  test('admission: legacy → confinement.agent_cli_unsupported naming the missing flags; modern → admitted', async () => {
    const { modern, legacy } = bins();
    const refusal = await assertClaudeCliConfinable(legacy).catch(error => error);
    expect(refusal).toBeInstanceOf(ConfinementRefusedError);
    expect({ status: refusal.status, reason: refusal.extensions?.reason }).toEqual({ status: 503, reason: 'confinement.agent_cli_unsupported' });
    expect(refusal.message).toContain('--setting-sources');
    expect(refusal.message).toContain('--strict-mcp-config');
    await expect(assertClaudeCliConfinable(modern)).resolves.toBeUndefined();
    // Unconfigured and relative are refusals too, never a PATH lookup.
    expect((await probeClaudeCli('')).problems.length).toBe(1);
    expect((await probeClaudeCli('claude')).problems.length).toBe(1);
  });

  test('the turn’s setup refuses before anything: no spawn, no MCP config written — even for a CLI that would tolerate the flags', async () => {
    const { legacy } = bins();
    const { ws, home } = await plantedWorkspace('zzplant-p5');
    const events = await runTurn('zzplant-p5', legacy, home);
    expect(loadReport(texts(events))).toBeNull();
    expect(errors(events).join(' ')).toContain('--setting-sources');
    expect(existsSync(join(ws, '.builder', 'mcp.json'))).toBe(false);
  });

  test('the manager asks the driver before it reserves anything (503, no reservation left behind)', async () => {
    const { legacy } = bins();
    const { startSession } = await import('../src/sessions/manager');
    const { createSite } = await import('../src/sites/workspace');
    const { provisionSite, resetInstance } = await import('./fixtures/instance');
    await resetInstance();
    const { domain } = await provisionSite('zzplant-mgr');
    await createSite({ slug: 'zzplant-mgr', name: 'zzplant-mgr', domain, actor: { user_id: 7, username: 'plant-gate' } } as never);
    let started = 0;
    __setTestDriver('claude_code', {
      ...claudeCodeDriver,
      admit: () => assertClaudeCliConfinable(legacy),
      startTurn: (() => {
        started++;
        throw new Error('must not start');
      }) as never,
    });
    const refusal = await startSession('zzplant-mgr', 'hello', 'claude_code').catch(error => error);
    expect(refusal).toBeInstanceOf(ConfinementRefusedError);
    expect(refusal.code).toBe('agent_cli_unsupported');
    expect(started).toBe(0);
    expect(busyReason('zzplant-mgr')).toBeNull();
    expect(tryBegin('zzplant-mgr', 'turn')).toBe(true);
    end('zzplant-mgr', 'turn');
  });

  test('re-probed when the binary changes under the same path (an upgrade or a downgrade)', async () => {
    const dir = scratchDir('fake-claude-swap-');
    // (1) REPLACED IN PLACE — the same resolved path, a new inode (an installer's rename).
    const path = writeFakeClaude(dir, 'claude', { version: '2.1.286', help: MODERN_HELP });
    await expect(assertClaudeCliConfinable(path)).resolves.toBeUndefined();
    renameSync(writeFakeClaude(dir, 'claude.tmp', { version: '2.0.1', help: LEGACY_HELP, tolerateUnknown: true }), path);
    await expect(assertClaudeCliConfinable(path)).rejects.toBeInstanceOf(ConfinementRefusedError);
    // (2) A RE-POINTED LINK — the native installer's `~/.local/bin/claude -> versions/<v>`.
    const link = join(dir, 'claude-link');
    symlinkSync(writeFakeClaude(dir, 'claude-2.1.286', { version: '2.1.286', help: MODERN_HELP }), link);
    await expect(assertClaudeCliConfinable(link)).resolves.toBeUndefined();
    rmSync(link);
    symlinkSync(writeFakeClaude(dir, 'claude-2.0.1', { version: '2.0.1', help: LEGACY_HELP, tolerateUnknown: true }), link);
    await expect(assertClaudeCliConfinable(link)).rejects.toBeInstanceOf(ConfinementRefusedError);
  });

  test('boot: the probe runs before listen and SAYS a refusing CLI — without stopping the boot', async () => {
    const { legacy, modern } = bins();
    const order: string[] = [];
    const reported: string[] = [];
    const steps = (bin: string) =>
      daemonBootSteps({
        policy: () => ({}) as never,
        preflight: () => void order.push('preflight'),
        probeAgentCli: async () => {
          order.push('probe');
          return bootProbeClaudeCli(bin);
        },
        sweepOnBoot: async () => void order.push('sweep'),
        listen: () => void order.push('listen'),
        report: (message, detail) => void reported.push(`${message} ${String(detail)}`),
      });
    await bootSequence({ ...steps(legacy), reconcileAgentUnits: () => void order.push('reconcile') });
    expect(order).toEqual(['preflight', 'probe', 'reconcile', 'sweep', 'listen']);
    expect(reported.join(' ')).toContain('confinement.agent_cli_unsupported');
    reported.length = 0;
    await bootSequence({ ...steps(modern), reconcileAgentUnits: () => {} });
    expect(reported).toEqual([]);
    expect(await bootProbeClaudeCli('')).toEqual([]);
  });
});

describe('P6 — confined: the spec frame PID 1’s unit receives carries the restriction', () => {
  test('one turn through a stand-in PID 1 — its argv is the restricted one', async () => {
    const { modern } = bins();
    const slug = 'site-a';
    const host = await lead1bPolicy({ identities: new Map([[slug, 1]]) });
    hosts.push(host);
    host.standIn.script = () => ({ kind: 'exit', code: 0, stdout: '' });
    const ws = workspacePath(slug);
    mkdirSync(ws, { recursive: true });
    await mkdirPrivate(roots.sitesRoot, join(slug, '.builder'));
    expect(tryBegin(slug, 'turn')).toBe(true);
    try {
      const opts = { ...startOptions(slug, '/unused'), env: { PATH: '/usr/bin:/bin' } };
      const events = await drain(spawnAgentProcess(opts, claudeTurnSetup(opts, { bin: modern }), host.policy).events);
      expect(errors(events)).toEqual([]);
    } finally {
      end(slug, 'turn');
    }
    const argv = host.standIn.specs[0]?.spec.argv as string[];
    expect(argv[0]).toBe(modern);
    expect(argv[argv.indexOf('--setting-sources') + 1]).toBe('');
    expect(argv).toContain('--strict-mcp-config');
    expect(JSON.parse(argv[argv.indexOf('--settings') + 1] as string).disableAllHooks).toBe(true);
    expect(argv.slice(-2)).toEqual(['--', 'build the page']);
  });
});
