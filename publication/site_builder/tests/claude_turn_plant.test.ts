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

/* ────────────────────────────────────────────────────────────────────────────────────
 * Closure round 5 — the probe's answer is a fact about the BINARY, the brief is a bounded
 * regular file, a turn's setup cannot outlive the turn, and the driver is the daemon's.
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('P7 — the probe: a binary it cannot run is a TYPED refusal; only a definitive answer is cached', () => {
  test('a missing CLAUDE_CODE_BIN and a non-executable one: 503 agent_cli_unsupported naming the binary — never a thrown spawn error', async () => {
    const dir = scratchDir('fake-claude-absent-');
    const missing = join(dir, 'claude');
    const notExecutable = join(dir, 'claude-noexec');
    writeFileSync(notExecutable, '#!/bin/sh\necho 2.1.286\n', { mode: 0o644 });
    for (const bin of [missing, notExecutable]) {
      const refusal = await assertClaudeCliConfinable(bin).catch(error => error);
      expect(refusal).toBeInstanceOf(ConfinementRefusedError);
      expect({ status: refusal.status, reason: refusal.extensions?.reason, named: String(refusal.message).includes(bin) }).toEqual({
        status: 503,
        reason: 'confinement.agent_cli_unsupported',
        named: true,
      });
    }
  });

  test('a TRANSIENT failure (killed by the probe timeout, a spawn hiccup) is not remembered: the next ask probes again', async () => {
    const good = (argv: readonly string[]) =>
      Promise.resolve({ exitCode: 0, stdout: argv[1] === '--version' ? '2.1.286 (Claude Code)' : MODERN_HELP });
    const killed = () => Promise.resolve({ exitCode: 137, stdout: '' });
    const hiccup = () => Promise.reject(new Error('EAGAIN: posix_spawn'));
    let modern = '';
    for (const transient of [killed, hiccup]) {
      // A fresh inode per row: the good answer below IS cached, for its own binary.
      modern = bins().modern;
      const first = await assertClaudeCliConfinable(modern, transient).catch(error => error);
      expect(first).toBeInstanceOf(ConfinementRefusedError);
      await expect(assertClaudeCliConfinable(modern, good)).resolves.toBeUndefined();
    }
    // …while a DEFINITIVE answer about this inode is cached: asked again, the binary is not run.
    let runs = 0;
    const counted = (argv: readonly string[]) => {
      runs++;
      return good(argv);
    };
    await assertClaudeCliConfinable(modern, counted);
    expect(runs).toBe(0);
  });
});

describe('P8 — the brief is a bounded regular file, read without blocking', () => {
  test('AGENTS.md planted as a FIFO: the turn is refused at once, nothing written — never a setup that blocks forever', async () => {
    const { modern } = bins();
    const { ws, home } = await plantedWorkspace('zzplant-p8a');
    rmSync(join(ws, 'AGENTS.md'));
    expect(Bun.spawnSync(['mkfifo', join(ws, 'AGENTS.md')]).exitCode).toBe(0);
    const started = Date.now();
    const events = await runTurn('zzplant-p8a', modern, home);
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(loadReport(texts(events))).toBeNull();
    expect(errors(events).join(' ')).toContain('not a regular file');
    expect(existsSync(join(ws, '.builder', 'mcp.json'))).toBe(false);
  }, 15_000);

  test('a NUL byte in AGENTS.md: refused, named, before anything is written (an argv cannot carry it)', async () => {
    const { modern } = bins();
    const { ws, home } = await plantedWorkspace('zzplant-p8b');
    writeFileSync(join(ws, 'AGENTS.md'), '# rules\u0000and more');
    const events = await runTurn('zzplant-p8b', modern, home);
    expect(loadReport(texts(events))).toBeNull();
    expect(errors(events).join(' ')).toContain('NUL');
    expect(existsSync(join(ws, '.builder', 'mcp.json'))).toBe(false);
  });

  test('a multi-GB sparse AGENTS.md is read only up to the cut, and the cut says the real size', async () => {
    const { truncateSync } = await import('node:fs');
    const { readBrief, MAX_BRIEF_BYTES: cap } = await import('../src/drivers/claude_code');
    const { ws } = await plantedWorkspace('zzplant-p8c');
    writeFileSync(join(ws, 'AGENTS.md'), 'A'.repeat(cap + 64));
    const size = 3 * 1024 * 1024 * 1024;
    truncateSync(join(ws, 'AGENTS.md'), size);
    const started = Date.now();
    const brief = await readBrief(ws);
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(brief?.startsWith('A'.repeat(cap))).toBe(true);
    expect(brief).toContain(`(AGENTS.md, ${size} bytes) was cut at ${cap} bytes`);
  }, 15_000);
});

describe('P9 — a turn’s SETUP is inside the turn’s deadline, and an interrupt reaches it', () => {
  const hanging = () => new Promise<never>(() => {});
  test('a setup that never returns ends the turn at timeoutMs: one retriable error, the stream closed', async () => {
    const opts = { ...startOptions('zzplant-p9', '/unused'), timeoutMs: 300 };
    const started = Date.now();
    const events = await drain(spawnAgentProcess(opts, hanging, policyFromConfig()).events);
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(events.map(event => event.type)).toEqual(['error']);
    expect(errors(events).join(' ')).toContain('timed out');
  }, 15_000);

  test('interrupt() during a setup that never returns settles — the stop is not held hostage', async () => {
    const opts = { ...startOptions('zzplant-p9', '/unused'), timeoutMs: 60_000 };
    const turn = spawnAgentProcess(opts, hanging, policyFromConfig());
    const drained = drain(turn.events);
    await new Promise(resolve => setTimeout(resolve, 50));
    const stopped = await Promise.race([turn.interrupt().then(() => 'stopped'), new Promise(resolve => setTimeout(() => resolve('hung'), 3_000))]);
    expect(stopped).toBe('stopped');
    expect(errors(await drained).join(' ')).toContain('interrupted');
  }, 15_000);

  test('a setup that resolves AFTER the turn gave up has its cleanup run (no per-turn file left resident)', async () => {
    let cleaned = false;
    let resolveLate: (plan: never) => void = () => {};
    const late = () => new Promise<never>(resolve => (resolveLate = resolve));
    const opts = { ...startOptions('zzplant-p9', '/unused'), timeoutMs: 100 };
    await drain(spawnAgentProcess(opts, late, policyFromConfig()).events);
    resolveLate({ argv: ['/bin/true'], parseLine: () => [], cleanup: async () => void (cleaned = true) } as never);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(cleaned).toBe(true);
  }, 15_000);
});

describe('P10 — the site’s driver is the DAEMON’s record, never the agent-writable site.json', () => {
  test('a turn that rewrites site.json’s driver does not choose the next session’s driver', async () => {
    const { startSession } = await import('../src/sessions/manager');
    const { createSite } = await import('../src/sites/workspace');
    const { provisionSite, resetInstance } = await import('./fixtures/instance');
    await resetInstance();
    const slug = 'zzplant-drv';
    const { domain } = await provisionSite(slug);
    await createSite({ slug, name: slug, domain, actor: { user_id: 7, username: 'plant-gate' }, driver: 'claude_code' } as never);
    // THE AGENT'S WRITE: site.json is 0660 in its own workspace; it names another driver.
    const manifestFile = join(workspacePath(slug), 'site.json');
    const planted = JSON.parse(await Bun.file(manifestFile).text());
    writeFileSync(manifestFile, JSON.stringify({ ...planted, driver: 'opencode' }));
    const asked: string[] = [];
    const recorder = (id: 'claude_code' | 'opencode') =>
      ({
        ...claudeCodeDriver,
        id,
        admit: async () => void asked.push(`admit ${id}`),
        startTurn: (() => {
          asked.push(`start ${id}`);
          return { pid: 1, events: (async function* () {})(), interrupt: async () => {} };
        }) as never,
      }) as never;
    __setTestDriver('claude_code', recorder('claude_code'));
    __setTestDriver('opencode', recorder('opencode'));
    try {
      await startSession(slug, 'hello');
      const start = Date.now();
      while (!asked.some(line => line.startsWith('start')) && Date.now() - start < 5_000) await new Promise(resolve => setTimeout(resolve, 20));
      expect(asked.filter(line => line.includes('opencode'))).toEqual([]);
      expect(asked).toContain('start claude_code');
    } finally {
      __setTestDriver('opencode', null);
      await resetInstance();
    }
  }, 30_000);
});

describe('P11 — the driver record is where no run can reach it, and an absent one is refused, never defaulted', () => {
  /** Drivers that only record which of them was asked to run. */
  function recordDrivers(asked: string[]): void {
    const recorder = (id: 'claude_code' | 'opencode') =>
      ({
        ...claudeCodeDriver,
        id,
        admit: async () => void asked.push(`admit ${id}`),
        startTurn: (() => {
          asked.push(`start ${id}`);
          return { pid: 1, events: (async function* () {})(), interrupt: async () => {} };
        }) as never,
      }) as never;
    __setTestDriver('claude_code', recorder('claude_code'));
    __setTestDriver('opencode', recorder('opencode'));
  }

  async function started(asked: string[]): Promise<string[]> {
    const start = Date.now();
    while (!asked.some(line => line.startsWith('start')) && Date.now() - start < 5_000) await new Promise(resolve => setTimeout(resolve, 20));
    return asked.filter(line => line.startsWith('start'));
  }

  /** A site whose driver is NOT the instance default — so a fallback to the default is visible. */
  async function siteOnTheOtherDriver(slug: string) {
    const { createSite } = await import('../src/sites/workspace');
    const { provisionSite } = await import('./fixtures/instance');
    const { config } = await import('../src/config');
    const other = config.AGENT_DRIVER === 'opencode' ? 'claude_code' : 'opencode';
    const { domain } = await provisionSite(slug);
    await createSite({ slug, name: slug, domain, actor: { user_id: 7, username: 'plant-gate' }, driver: other } as never);
    return { other, fallback: config.AGENT_DRIVER };
  }

  /** Every place a driver record has ever lived, removed — a site from before the record. */
  function legacy(slug: string): void {
    rmSync(join(workspacePath(slug), '.builder', 'driver.json'), { force: true });
    rmSync(join(roots.sitesRoot, '.driver_records', `${slug}.json`), { force: true });
  }

  test('a build that RENAMES .builder away (same-parent rename, no sticky bit) does not change the driver', async () => {
    const { startSession } = await import('../src/sessions/manager');
    const { resetInstance } = await import('./fixtures/instance');
    await resetInstance();
    const slug = 'zzplant-rename';
    const { other } = await siteOnTheOtherDriver(slug);
    // THE RUN'S MOVE: `mv .builder .x` in its own workspace (2770, no sticky bit), and a fresh
    // `.builder` of its own — with the plugin channel the record exists to close.
    renameSync(join(workspacePath(slug), '.builder'), join(workspacePath(slug), '.x'));
    mkdirSync(join(workspacePath(slug), '.opencode', 'plugin'), { recursive: true });
    const asked: string[] = [];
    recordDrivers(asked);
    try {
      await startSession(slug, 'hello');
      expect(await started(asked)).toEqual([`start ${other}`]);
    } finally {
      __setTestDriver('opencode', null);
      await resetInstance();
    }
  }, 30_000);

  test('a site with NO record is refused (503, typed, nothing reserved) — never the instance default — and the boot seeds it from site.json', async () => {
    const { sweepOnBoot, startSession } = await import('../src/sessions/manager');
    const { listSessions } = await import('../src/sessions/store');
    const { ConfinementUnavailableError } = await import('../src/errors');
    const { resetInstance } = await import('./fixtures/instance');
    await resetInstance();
    const slug = 'zzplant-legacy';
    const { other } = await siteOnTheOtherDriver(slug);
    legacy(slug);
    const asked: string[] = [];
    recordDrivers(asked);
    try {
      const refused = await startSession(slug, 'hello').then(
        () => null,
        (error: unknown) => error,
      );
      expect({
        typed: refused instanceof ConfinementUnavailableError,
        names: String((refused as Error | null)?.message).includes('driver record'),
        asked,
        busy: busyReason(slug),
        sessions: (await listSessions(slug)).length,
      }).toEqual({ typed: true, names: true, asked: [], busy: null, sessions: 0 });
      // The boot (sweepOnBoot) seeds the daemon's record ONCE, from site.json — the authority
      // such a site had — and from then on site.json decides nothing.
      await sweepOnBoot();
      expect(existsSync(join(roots.sitesRoot, '.driver_records', `${slug}.json`))).toBe(true);
      await startSession(slug, 'hello');
      expect(await started(asked)).toEqual([`start ${other}`]);
    } finally {
      __setTestDriver('opencode', null);
      await resetInstance();
    }
  }, 30_000);

  test('the record is the daemon’s own 0600 inode in a 0700 directory under SITES_ROOT — outside every workspace', async () => {
    const { statSync } = await import('node:fs');
    const { resetInstance } = await import('./fixtures/instance');
    await resetInstance();
    const slug = 'zzplant-where';
    await siteOnTheOtherDriver(slug);
    try {
      const dir = join(roots.sitesRoot, '.driver_records');
      const file = join(dir, `${slug}.json`);
      expect({
        dir: statSync(dir).mode & 0o7777,
        file: statSync(file).mode & 0o7777,
        uid: statSync(file).uid === process.getuid?.(),
        inWorkspace: existsSync(join(workspacePath(slug), '.builder', 'driver.json')),
      }).toEqual({ dir: 0o700, file: 0o600, uid: true, inWorkspace: false });
    } finally {
      await resetInstance();
    }
  }, 30_000);
});
