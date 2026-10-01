#!/usr/bin/env bun
/**
 * PLANT — THE LIVE LEG. Runs the REAL Claude Code CLI against a planted workspace and proves
 * that the driver's argv (`src/drivers/claude_argv.ts`, the same function the daemon renders)
 * loads none of the plants, while the pre-fix argv loads all of them.
 *
 *   bun publication/site_builder/deploy/probes/claude_plant_probe.ts [/abs/path/to/claude]
 *
 * Owner-run, on any host with the CLI (no daemon configuration needed). No account and no
 * network: the CLI talks to a fake Messages API on 127.0.0.1 with a bogus key. Everything is
 * in a temp directory, removed on exit. The planted hooks only `touch` marker files there.
 *
 * Legs (each PASS/FAIL; exit 1 on any FAIL):
 *   P0 — the binary's --help lists every flag the turn's argv requires.
 *   C  — CONTROL: the pre-fix argv loads the plants (hooks fire, the planted stdio server runs,
 *        CLAUDE.md reaches the model). If this does not hold, the probe proves nothing on this
 *        CLI and says so.
 *   P1 — the driver's argv: no planted hook fires, no planted MCP server runs, the init frame
 *        lists only the daemon's server and no planted skill/command/agent; the turn completes.
 *   P2 — the brief (AGENTS.md) reaches the model via --append-system-prompt; CLAUDE.md does not.
 *   P3 — `--resume` works under the restriction (sessions persist in HOME regardless).
 *   P4 — a prompt that looks like an option is the prompt.
 *   C5 — CONTROL: the workspace becomes a repository with a planted `filter.<x>.clean` (+ an
 *        attributes line, a stat-dirty tracked file) and an fsmonitor hook: the driver's argv
 *        runs the filter — the CLI's own git (`status`, `ls-files`, `log`, `config`; it
 *        neutralises fsmonitor and hooks, not filters) — EVEN WITH `GIT_DIR=/nonexistent` in its
 *        environment, which the CLI drops for those calls (measured: an env fix is no fix).
 *   P5 — the same with the repository MASKED as the turn unit masks it (`InaccessiblePaths=
 *        <workspace>/.git`, `agent_identity.ts` TURN_MASKED_REPOSITORY; emulated here by mode 000,
 *        the mask's effect for the run's uid): nothing planted runs and the turn completes. A CLI
 *        release that adds git calls, or reads `.git` some other way, is caught here.
 *
 * Measured 2026-10-01 on Claude Code 2.1.286 (macOS): all legs PASS.
 */

import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claudeTurnArgv, listedFlags, requiredCliFlags } from '../../src/drivers/claude_argv';

const bin = process.argv[2] ?? Bun.which('claude') ?? '';
if (!bin) {
  console.error('no claude binary (pass its absolute path)');
  process.exit(2);
}
const root = mkdtempSync(join(tmpdir(), 'claude-plant-'));
const ws = join(root, 'ws');
const home = join(root, 'home');
const marks = join(root, 'marks');
let failed = 0;
const say = (ok: boolean, leg: string, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${leg}${detail ? ` — ${detail}` : ''}`);
};

/* The plants. */
mkdirSync(join(ws, '.claude', 'skills', 'plantskill'), { recursive: true });
mkdirSync(join(ws, '.claude', 'commands'), { recursive: true });
mkdirSync(join(ws, '.claude', 'agents'), { recursive: true });
mkdirSync(join(ws, '.builder'), { recursive: true });
mkdirSync(join(home, '.claude'), { recursive: true });
mkdirSync(marks);
const hook = (name: string) => ({ SessionStart: [{ hooks: [{ type: 'command', command: `touch ${join(marks, name)}` }] }] });
writeFileSync(join(ws, '.claude', 'settings.json'), JSON.stringify({ enableAllProjectMcpServers: true, hooks: hook('project_hook') }));
writeFileSync(join(ws, '.claude', 'settings.local.json'), JSON.stringify({ hooks: hook('local_hook') }));
writeFileSync(join(home, '.claude', 'settings.json'), JSON.stringify({ hooks: hook('user_hook') }));
writeFileSync(join(ws, '.mcp.json'), JSON.stringify({ mcpServers: { planted: { type: 'stdio', command: '/bin/sh', args: ['-c', `touch ${join(marks, 'planted_mcp')}; sleep 3`] } } }));
writeFileSync(join(ws, '.claude', 'skills', 'plantskill', 'SKILL.md'), '---\nname: plantskill\ndescription: planted\n---\nx\n');
writeFileSync(join(ws, '.claude', 'commands', 'plantcmd.md'), '---\ndescription: planted\n---\nx\n');
writeFileSync(join(ws, '.claude', 'agents', 'plantagent.md'), '---\nname: plantagent\ndescription: planted\n---\nx\n');
writeFileSync(join(ws, 'AGENTS.md'), 'BRIEF_MARKER_PLANT site rules');
writeFileSync(join(ws, 'CLAUDE.md'), 'CLAUDEMD_MARKER_PLANT');
const mcpConfig = join(ws, '.builder', 'mcp.json');
writeFileSync(mcpConfig, JSON.stringify({ mcpServers: { dedalo_publication: { type: 'stdio', command: '/bin/sh', args: ['-c', `touch ${join(marks, 'daemon_mcp')}; sleep 3`] } } }));

/* The fake Messages API: records every body, answers one streamed text reply. */
const bodies: string[] = [];
const ev = (type: string, data: unknown) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
const api = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  async fetch(request) {
    const url = new URL(request.url);
    const body = request.method === 'POST' ? await request.text() : '';
    bodies.push(body);
    if (!url.pathname.startsWith('/v1/messages')) return Response.json({});
    if (url.pathname.includes('count_tokens')) return Response.json({ input_tokens: 1 });
    const parsed = JSON.parse(body || '{}');
    const message = { id: 'msg_probe', type: 'message', role: 'assistant', model: parsed.model ?? 'x', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } };
    if (!parsed.stream) return Response.json({ ...message, content: [{ type: 'text', text: 'PROBE_REPLY' }], stop_reason: 'end_turn' });
    return new Response(
      ev('message_start', { type: 'message_start', message }) +
        ev('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }) +
        ev('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'PROBE_REPLY' } }) +
        ev('content_block_stop', { type: 'content_block_stop', index: 0 }) +
        ev('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } }) +
        ev('message_stop', { type: 'message_stop' }),
      { headers: { 'content-type': 'text/event-stream' } },
    );
  },
});

interface Run {
  readonly marks: string[];
  readonly init: Record<string, any> | null;
  readonly result: Record<string, any> | null;
  readonly bodies: string;
  readonly stderr: string;
}

async function run(argv: string[], extraEnv: Readonly<Record<string, string>> = {}): Promise<Run> {
  for (const mark of readdirSync(marks)) rmSync(join(marks, mark));
  bodies.length = 0;
  const child = Bun.spawn(argv, {
    cwd: ws,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      HOME: home,
      PATH: '/usr/bin:/bin',
      ANTHROPIC_API_KEY: 'sk-ant-probe-not-a-key',
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${api.port}`,
      CLAUDE_CODE_MAX_RETRIES: '0',
      DISABLE_AUTOUPDATER: '1',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      ...extraEnv,
    },
  });
  const timer = setTimeout(() => child.kill(9), 60_000);
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  await child.exited;
  clearTimeout(timer);
  await Bun.sleep(1_500); // a stdio server's `touch` races the CLI's exit
  const frames = stdout.split('\n').filter(Boolean).flatMap(line => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
  return {
    marks: readdirSync(marks).sort(),
    init: frames.find(frame => frame.type === 'system' && frame.subtype === 'init') ?? null,
    result: frames.find(frame => frame.type === 'result') ?? null,
    bodies: bodies.join('\n'),
    stderr,
  };
}

const planted = (init: Record<string, any> | null) =>
  JSON.stringify([init?.slash_commands, init?.skills, init?.agents]).match(/plant\w*/g) ?? [];

try {
  // P0
  const help = Bun.spawnSync([bin, '--help'], { env: { PATH: '/usr/bin:/bin' } }).stdout.toString();
  const version = Bun.spawnSync([bin, '--version'], { env: { PATH: '/usr/bin:/bin' } }).stdout.toString().trim();
  const missing = requiredCliFlags().filter(flag => !listedFlags(help).has(flag));
  console.log(`claude: ${bin} (${version})`);
  say(missing.length === 0, 'P0 --help lists every required flag', missing.length ? `missing ${missing.join(', ')}` : '');

  // C — the argv before PLANT.
  const before = await run([bin, '-p', 'control', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits', '--max-turns', '3', '--mcp-config', mcpConfig, '--allowedTools', 'Read', '--disallowedTools', 'Bash,WebFetch,WebSearch']);
  const controlHolds = before.marks.includes('project_hook') && before.marks.includes('planted_mcp') && before.bodies.includes('CLAUDEMD_MARKER_PLANT');
  say(controlHolds, 'C  control: the pre-fix argv loads the plants', `marks=${before.marks.join(',')}`);
  if (!controlHolds) console.log('   (this CLI does not load the plants even unrestricted: the legs below prove nothing here)');

  // P1/P2 — the driver's argv.
  const turn = await run(claudeTurnArgv({ bin, prompt: 'first turn', mcpConfigPath: mcpConfig, brief: 'BRIEF_MARKER_PLANT site rules' }));
  const servers = (turn.init?.mcp_servers ?? []).map((server: { name: string }) => server.name);
  say(turn.marks.every(mark => mark === 'daemon_mcp'), 'P1 no planted hook or MCP server ran', `marks=${turn.marks.join(',') || 'none'}`);
  say(JSON.stringify(servers) === '["dedalo_publication"]', 'P1 only the daemon MCP server', `servers=${JSON.stringify(servers)}`);
  say(planted(turn.init).length === 0, 'P1 no planted skill/command/agent', planted(turn.init).join(','));
  say(turn.result?.is_error === false, 'P1 the turn completed', `result=${JSON.stringify(turn.result?.result ?? turn.stderr.slice(0, 200))}`);
  say(turn.bodies.includes('BRIEF_MARKER_PLANT') && !turn.bodies.includes('CLAUDEMD_MARKER_PLANT'), 'P2 the brief reaches the model, CLAUDE.md does not');

  // P3 — resume.
  const sessionId = String(turn.result?.session_id ?? '');
  const resumed = await run(claudeTurnArgv({ bin, prompt: 'second turn', mcpConfigPath: mcpConfig, brief: 'b', resumeToken: sessionId }));
  say(resumed.result?.is_error === false && resumed.bodies.includes('first turn'), 'P3 --resume carries the conversation', `session=${sessionId}`);

  // P4 — a prompt that is an option.
  const injected = await run(claudeTurnArgv({ bin, prompt: `--mcp-config={"mcpServers":{"inj":{"type":"stdio","command":"/bin/sh","args":["-c","touch ${join(marks, 'injected')}"]}}}`, mcpConfigPath: mcpConfig }));
  say(!injected.marks.includes('injected') && injected.result?.is_error === false, 'P4 an option-shaped prompt is the prompt', `marks=${injected.marks.join(',') || 'none'}`);

  // C5/P5 — the CLI's OWN git: a planted repository filter and fsmonitor (last: they would
  // otherwise fire under every leg above, which runs without the turn unit's git environment).
  const git = (...args: string[]) =>
    Bun.spawnSync(['git', ...args], {
      cwd: ws,
      env: { PATH: '/usr/bin:/bin', HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 'p', GIT_AUTHOR_EMAIL: 'p@p', GIT_COMMITTER_NAME: 'p', GIT_COMMITTER_EMAIL: 'p@p' },
    });
  writeFileSync(join(ws, 'page.txt'), 'aaaa\n');
  git('init', '-q');
  git('add', 'page.txt');
  git('commit', '-q', '-m', 'seed');
  writeFileSync(join(ws, '.git', 'fsm.sh'), `#!/bin/sh\ntouch ${join(marks, 'git_fsmonitor')}\nexit 1\n`, { mode: 0o755 });
  appendFileSync(join(ws, '.git', 'config'), `[filter "evil"]\n\tclean = touch ${join(marks, 'git_filter')}; cat\n[core]\n\tfsmonitor = ${join(ws, '.git', 'fsm.sh')}\n`);
  writeFileSync(join(ws, '.gitattributes'), '*.txt filter=evil\n');
  writeFileSync(join(ws, 'page.txt'), 'bbbb\n');
  const later = new Date(Date.now() + 60_000);
  utimesSync(join(ws, 'page.txt'), later, later);
  const gitArgv = claudeTurnArgv({ bin, prompt: 'git turn', mcpConfigPath: mcpConfig });
  const gitControl = await run(gitArgv, { GIT_DIR: '/nonexistent', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' });
  say(gitControl.marks.includes('git_filter'), 'C5 control: the CLI’s own git runs a planted filter — a GIT_DIR in its env notwithstanding', `marks=${gitControl.marks.join(',') || 'none'}`);
  chmodSync(join(ws, '.git'), 0o000);
  let gitTurn: Run;
  try {
    gitTurn = await run(gitArgv);
  } finally {
    chmodSync(join(ws, '.git'), 0o755);
  }
  say(
    !gitTurn.marks.includes('git_filter') && !gitTurn.marks.includes('git_fsmonitor') && gitTurn.result?.is_error === false,
    'P5 the repository masked as the turn unit masks it: no planted filter or fsmonitor ran, the turn completed',
    `marks=${gitTurn.marks.join(',') || 'none'}`,
  );
} finally {
  api.stop(true);
  if (!process.env.KEEP) rmSync(root, { recursive: true, force: true });
}
console.log(failed === 0 ? 'PLANT PROBE: ALL PASS' : `PLANT PROBE: ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
