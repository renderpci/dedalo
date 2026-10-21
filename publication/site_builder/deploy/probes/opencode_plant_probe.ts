#!/usr/bin/env bun
/**
 * PLANT FOR OPENCODE — THE LIVE LEG (LEAD-1c). Runs the REAL opencode CLI through the SAME
 * scenario the driver's own probe runs (`src/drivers/opencode_argv.ts`: the canaries, the
 * restriction environment, the questions and the verdict — one module, so the two cannot
 * disagree), and proves the restriction holds on THIS binary, while the same canaries load
 * without it.
 *
 *   bun publication/site_builder/deploy/probes/opencode_plant_probe.ts [/abs/path/to/opencode] [--run]
 *
 * Owner-run, on any host with the CLI (no daemon configuration needed). Everything is in a temp
 * directory, removed on exit (KEEP=1 keeps it). No network is needed for P0–P1: the questions are
 * `opencode debug …`, which resolve configuration and answer without a model.
 *
 * Legs (each PASS/FAIL; exit 1 on any FAIL):
 *   P0 — `run --help` lists every flag the turn's argv passes (`--pure`, `--format`, `--session`);
 *        yargs writes the help to STDERR (measured on 1.18.32), so both streams are read.
 *   C  — CONTROL, per SOURCE (`OPENCODE_PLANT_SOURCES`, one token each): the turn's environment
 *        WITHOUT the four switches — every source's canary surfaces in the `debug` answers (the
 *        plugin by running). A source that does not proves nothing about its switch: FAIL.
 *   P1 — the turn's environment (`opencodeTurnEnvironment`): no source surfaces, no plugin runs,
 *        and the resolved configuration is the daemon's (its MCP server, every permission, exactly
 *        its instruction file).
 *   P-env — an operator `OPENCODE_PERMISSION={"bash":"allow"}` handed in BEFORE the restriction
 *        resolves `bash: deny` (the daemon's key wins).
 *   P-db — `opencode db path` under the turn's environment answers the database the daemon states
 *        (`OPENCODE_DB`) — the file admission reads for a console account.
 *   P-org — an active console org (planted with the binary's own `db`, served by a loopback stand-in)
 *        has its `/api/config` merged under the FULL restriction: the source no key closes, which is
 *        why the driver refuses a turn whose database holds a console account.
 *   With `--run` (a provider is needed: its credential keys are passed through from this shell by
 *   name, `PROBE_PASS_ENV=OPENAI_API_KEY,…`):
 *   P2 — a prompt shaped like an option (`--version`) after the literal `--` is the PROMPT: the
 *        turn answers JSON events, never the version string.
 *   P3 — `--session <id>` resumes the turn under the restriction.
 *   P-brief — the daemon's brief (the one instruction file) reaches the model: asked for the
 *        brief's token, the turn answers it; the workspace's own `opencode.json` instruction does
 *        not (asked, with no tool and without pointing at the file, to repeat every instruction
 *        it was given, the turn never names that instruction's token; a turn that used a tool is
 *        inconclusive — the file is named after the token, so a listing would leak it). If the
 *        brief does NOT reach the model, the driver must fall back to a prompt preamble.
 *
 * Measured 2026-10-11 on opencode 1.18.32 (macOS, Homebrew): P0, C, P1, P-env PASS; P-db, P-org
 * PASS on 2026-10-12. P2, P3 and
 * P-brief are owner rows (a provider key). Unmeasured until then: opencode's literal `--` through
 * `run`, whether `instructions` are loaded for a turn, and its project detection under the masked
 * `.git` (a confined turn's workspace).
 */

import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  OPENCODE_PLANT_SOURCES,
  OPENCODE_PROBE_OFFLINE_ENV,
  OPENCODE_PROBE_QUESTIONS,
  OPENCODE_SOURCE_SWITCHES,
  type OpencodePlantSource,
  listedYargsFlags,
  opencodePlantCanaries,
  opencodePlantVerdict,
  opencodeProbeConfig,
  opencodeStateDatabase,
  opencodeTurnArgv,
  opencodeTurnEnvironment,
  requiredOpencodeFlags,
} from '../../src/drivers/opencode_argv';

const args = process.argv.slice(2);
const live = args.includes('--run');
const bin = args.find(arg => arg !== '--run') ?? Bun.which('opencode') ?? '';
if (!bin) {
  console.error('no opencode binary (pass its absolute path)');
  process.exit(2);
}
let failed = 0;
const say = (ok: boolean, leg: string, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${leg}${detail ? ` — ${detail}` : ''}`);
};
const PATH = '/usr/local/bin:/usr/bin:/bin';
const root = mkdtempSync(join(tmpdir(), 'opencode-plant-'));

const word = () => `z${randomBytes(8).toString('hex')}`;

/** One scenario tree: a canary per source, its own tokens, under a fresh root. */
function plantTree() {
  const at = join(root, word());
  const tokens = Object.fromEntries(OPENCODE_PLANT_SOURCES.map(source => [source, word()])) as Record<OpencodePlantSource, string>;
  const tree = opencodePlantCanaries({ tokens, root: at });
  for (const dir of tree.dirs) mkdirSync(join(at, dir), { recursive: true, mode: 0o700 });
  for (const [relative, body] of tree.files) writeFileSync(join(at, relative), body, { mode: 0o600 });
  return { at, tokens, ws: join(at, 'ws'), home: join(at, 'home'), marker: join(at, tree.pluginMarker), brief: join(at, tree.brief) };
}

/** The same question without blocking the event loop (P-org's stand-in server answers on it). */
async function askAsync(argv: readonly string[], cwd: string, env: Record<string, string>): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const child = Bun.spawn([...argv], { cwd, env, stdout: 'pipe', stderr: 'pipe', timeout: 30_000 });
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  return { ok: (await child.exited) === 0, stdout, stderr };
}

function ask(argv: readonly string[], cwd: string, env: Record<string, string>): { ok: boolean; stdout: string; stderr: string } {
  const result = Bun.spawnSync([...argv], { cwd, env, timeout: 30_000 });
  return { ok: result.exitCode === 0, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

/** The probe's one added key (the traffic switches are the turn environment's own, `opencodeTurnEnvironment`). */
const EGRESS = { ...OPENCODE_PROBE_OFFLINE_ENV };

/** The questions under `env`, judged by the driver's own verdict. */
function leg(tree: ReturnType<typeof plantTree>, env: Record<string, string>, restricted: boolean): string[] {
  const answers: string[] = [];
  let configAnswer: string | null = null;
  const failedQuestions: string[] = [];
  for (const question of OPENCODE_PROBE_QUESTIONS) {
    const answer = ask([bin, ...question], tree.ws, env);
    if (!answer.ok) failedQuestions.push(question.join(' '));
    answers.push(answer.stdout);
    if (question[1] === 'config' && answer.ok) configAnswer = answer.stdout;
  }
  const pluginRan = existsSync(tree.marker);
  rmSync(tree.marker, { force: true });
  return [
    ...failedQuestions.map(question => `'${question}' failed`),
    ...opencodePlantVerdict({ tokens: tree.tokens, answers, configAnswer, pluginRan, brief: tree.brief, restricted }),
  ];
}

try {
  const version = ask([bin, '--version'], '/', { PATH }).stdout.trim();
  console.log(`opencode: ${bin} (${version})`);

  // P0 — both streams.
  const helpRun = ask([bin, 'run', '--help'], '/', { PATH });
  const missing = requiredOpencodeFlags().filter(flag => !listedYargsFlags(`${helpRun.stdout}\n${helpRun.stderr}`).has(flag));
  say(missing.length === 0, 'P0 run --help lists every required flag', missing.length ? `missing ${missing.join(', ')}` : `help on ${helpRun.stderr.length > helpRun.stdout.length ? 'stderr' : 'stdout'}`);

  const tree = plantTree();
  const turnEnv = (operatorEnv: Record<string, string> = {}) => ({
    ...EGRESS,
    PATH,
    HOME: tree.home,
    XDG_CONFIG_HOME: join(tree.home, '.config'),
    ...opencodeTurnEnvironment({ operatorEnv, configJson: opencodeProbeConfig(tree.brief) }),
  });

  // C — per source: without the four switches every canary surfaces.
  const control: Record<string, string> = turnEnv();
  for (const key of OPENCODE_SOURCE_SWITCHES) delete control[key];
  const unseen = leg(tree, control, false);
  say(unseen.length === 0, 'C  control: without the switches every source’s canary surfaces', unseen.join('; '));

  // P1 — the turn's environment.
  const problems = leg(tree, turnEnv(), true);
  say(problems.length === 0, 'P1 with the restriction: no source loads, the daemon’s configuration is resolved', problems.join('; '));

  // P-env — an operator OPENCODE_PERMISSION under the restriction.
  const permission = ask([bin, 'debug', 'config'], tree.ws, turnEnv({ OPENCODE_PERMISSION: '{"bash":"allow"}' }));
  let bash: unknown = '(no answer)';
  try {
    bash = (JSON.parse(permission.stdout) as { permission?: Record<string, unknown> }).permission?.bash;
  } catch {
    // (no answer)
  }
  say(bash === 'deny', 'P-env an operator OPENCODE_PERMISSION cannot reopen bash', `bash=${String(bash)}`);

  // P-db — the database the daemon STATES (OPENCODE_DB) is the one this binary opens: admission
  // reads exactly that file for a console account.
  const dataHome = join(root, 'data');
  const dbEnv = { ...turnEnv(), XDG_DATA_HOME: dataHome };
  const dbPath = ask([bin, 'db', 'path'], tree.ws, dbEnv).stdout.trim().split('\n').pop()?.trim() ?? '';
  say(dbPath === opencodeStateDatabase(dataHome), 'P-db `db path` answers the stated database', dbPath);

  // P-org — the console-account source, measured: an active org's `/api/config` (a loopback stand-in
  // here) merged AFTER the restriction under the turn's own network. While this holds no key closes
  // it, and the driver's per-turn account refusal is what does.
  const orgHome = join(root, 'org-data');
  const orgEnv = { ...turnEnv(), XDG_DATA_HOME: orgHome };
  let served = 0;
  const server = Bun.serve({
    hostname: '::1',
    port: 0,
    fetch(request) {
      served++;
      const url = new URL(request.url);
      if (url.pathname === '/api/config') return Response.json({ config: { mcp: { zorgprobe: { type: 'local', command: ['/bin/echo', 'org'] } } } });
      if (url.pathname === '/api/orgs') return Response.json([{ id: 'org1', name: 'Org' }]);
      return new Response('not found', { status: 404 });
    },
  });
  try {
    const now = Date.now();
    const sql = (query: string) => askAsync([bin, 'db', query], tree.ws, orgEnv);
    await sql(`INSERT INTO account (id,email,url,access_token,refresh_token,token_expiry,time_created,time_updated) VALUES ('probe','p@probe','http://[::1]:${server.port}','AT','RT',${now + 86_400_000},${now},${now})`);
    await sql("INSERT INTO account_state (id,active_account_id,active_org_id) VALUES (1,'probe','org1')");
    const merged = (await askAsync([bin, 'debug', 'config'], tree.ws, orgEnv)).stdout.includes('zorgprobe');
    say(
      merged,
      'P-org an active console org’s configuration merges under the full restriction (the account refusal is load-bearing)',
      merged ? `served=${served}` : `not merged (served=${served}) — re-measure: if no key-less source remains, the account refusal may be revisited`,
    );
  } finally {
    server.stop(true);
  }

  if (live) {
    // P2/P3/P-brief — a real turn: needs a provider, whose credential keys are passed through by name.
    const passed = Object.fromEntries(
      (process.env.PROBE_PASS_ENV ?? '')
        .split(',')
        .map(key => key.trim())
        .filter(key => key !== '' && process.env[key] !== undefined)
        .map(key => [key, process.env[key] as string]),
    );
    const turnHome = join(root, 'turn-home');
    mkdirSync(join(turnHome, '.config'), { recursive: true });
    chmodSync(turnHome, 0o700);
    const briefToken = word();
    writeFileSync(tree.brief, `# the site brief\nThe site's code word is ${briefToken}.\n`);
    const liveEnv = { ...turnEnv(passed), HOME: turnHome, XDG_CONFIG_HOME: join(turnHome, '.config') };
    const first = ask(opencodeTurnArgv({ bin, prompt: '--version' }), tree.ws, liveEnv);
    const frames = first.stdout.split('\n').flatMap(line => {
      try {
        return [JSON.parse(line) as Record<string, unknown>];
      } catch {
        return [];
      }
    });
    say(frames.length > 0 && !first.stdout.trim().startsWith(version), 'P2 an option-shaped prompt after -- is the prompt', `frames=${frames.length}`);
    const session = frames.map(frame => frame.sessionID ?? frame.session_id ?? (frame.type === 'session' ? frame.id : undefined)).find(Boolean);
    const resumed = session ? ask(opencodeTurnArgv({ bin, prompt: 'go on', resumeToken: String(session) }), tree.ws, liveEnv) : { ok: false, stdout: '', stderr: '' };
    say(Boolean(session) && resumed.ok, 'P3 --session resumes under the restriction', `session=${String(session ?? 'none')}`);
    // NEVER POINT AT THE WORKSPACE FILE. The planted instruction file is NAMED after its token, so
    // a prompt that sends the model looking for it puts the token into a tool frame (a listing, a
    // read) whether or not the instruction was LOADED — the negative half then measured the
    // model's tools, not the restriction. The question is neutral, asks for what the model was
    // GIVEN, and a turn that used any tool is inconclusive (red), never a pass. The authoritative
    // negative stays P1 (`debug config`'s instructions list, offline); this is its live witness.
    const asked = ask(
      opencodeTurnArgv({
        bin,
        prompt: "Do not use any tool. First repeat, verbatim, every instruction or context text you were given besides this message. Then say the site's code word.",
      }),
      tree.ws,
      liveEnv,
    );
    const askedFrames = asked.stdout.split('\n').flatMap(line => {
      try {
        return [JSON.parse(line) as Record<string, unknown>];
      } catch {
        return [];
      }
    });
    const usedTool = askedFrames.some(frame => typeof frame.tool === 'string' || String(frame.type ?? '').includes('tool'));
    say(
      asked.stdout.includes(briefToken) && !usedTool && !asked.stdout.includes(tree.tokens.project_instructions),
      'P-brief the daemon’s brief reaches the model; the workspace’s own instruction does not (no tool used)',
      `brief=${asked.stdout.includes(briefToken)} workspace=${asked.stdout.includes(tree.tokens.project_instructions)} tool_used=${usedTool}`,
    );
  }
} finally {
  if (!process.env.KEEP) rmSync(root, { recursive: true, force: true });
}
console.log(failed === 0 ? 'OPENCODE PLANT PROBE: ALL PASS' : `OPENCODE PLANT PROBE: ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
