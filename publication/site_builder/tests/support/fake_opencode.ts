/**
 * A STAND-IN OPENCODE CLI that REPORTS what it would load, and loads (runs) only plugins.
 *
 * The property under test (LEAD-1c, PLANT for opencode) is not "opencode works" but "what does a
 * turn's argv and environment make it LOAD": a workspace `opencode.json` (instructions, a local
 * MCP server), `.opencode/agent`, `.opencode/tool`, `.opencode/plugin` (code it RUNS), HOME's
 * `~/.opencode` and `~/.config/opencode`, and skills from `.claude/skills` / `.agents/skills`.
 *
 * THE MODEL — one restriction key per source, so a CLI that ignores ANY ONE key is a distinct,
 * observable failure (the per-key table the design closes against; the live leg
 * `deploy/probes/opencode_plant_probe.ts` re-measures it against the real binary per release):
 *
 *   OPENCODE_DISABLE_PROJECT_CONFIG=1   the workspace's opencode.json, .opencode/agent, .opencode/tool
 *   OPENCODE_PURE=1 (or `--pure`)       every plugin: workspace .opencode/plugin, HOME .opencode/plugin,
 *                                       <config>/opencode/plugin
 *   OPENCODE_DISABLE_CLAUDE_CODE=1      .claude/skills (workspace and HOME)
 *   OPENCODE_DISABLE_EXTERNAL_SKILLS=1  .agents/skills (workspace and HOME)
 *   OPENCODE_CONFIG_CONTENT=<json>      merged LAST: the daemon's MCP server and permission block
 *
 * Always loaded (no key turns them off — only a fresh HOME does): `<XDG_CONFIG_HOME or
 * ~/.config>/opencode/opencode.json`, HOME's `.opencode/{agent,tool}`.
 *
 * FIDELITY TO 1.18.32 (measured on this machine, 2026-10-11 — the shapes the probe depends on):
 *   - `run --help` writes the yargs help to STDERR and exits 0 (a stdout-only reader sees none);
 *   - `debug agent build` echoes paths under HOME and the cwd (its `external_directory` rules), so
 *     a token inside the scratch path would surface whatever is loaded;
 *   - `OPENCODE_PERMISSION` OVERRIDES the configuration's permission block, key by key;
 *   - an absolute `instructions` entry of OPENCODE_CONFIG_CONTENT is reported as given, and the
 *     project's own `opencode.json` instruction is skipped under DISABLE_PROJECT_CONFIG;
 *   - without the switches every source surfaces in the `debug` answers: the project instruction
 *     and MCP server (`debug config`), the project agent's description (`agent`), its commands
 *     (`command`), its plugins (`plugin`, and the plugin RUNS), its tools (`debug agent build`),
 *     and the project / `.claude` / `.agents` skills (`debug skill`); with them, none does.
 *
 * Commands: `--version`; `run --help` (yargs-style option lines, on stderr); `debug config`, `debug
 * agent <name>`, `debug skill` (JSON on stdout); `db path` (the database it opens: OPENCODE_DB, as
 * 1.18.32 resolves it — and an active console org in it merges ORG_CONFIG when no proxy is set); `run [--pure] [--format json] [--session <id>] [--]
 * <message..>` → `{"text":"FAKE_LOAD <report>"}` and `{"type":"session","id":…}` lines. A prompt
 * BEFORE `--` that looks like an option is parsed as one (`--version` prints the version and
 * runs no turn) — the injection the literal `--` closes.
 *
 * `FAKE_PLANT=1` in its environment makes a `run` PLANT one of everything for the NEXT turn,
 * as a turn's Write or a build's postinstall would: into the workspace and into HOME.
 */

import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The restriction keys of the model, in table order. */
export const MODELLED_KEYS = Object.freeze([
  'OPENCODE_DISABLE_PROJECT_CONFIG',
  'OPENCODE_PURE',
  'OPENCODE_DISABLE_CLAUDE_CODE',
  'OPENCODE_DISABLE_EXTERNAL_SKILLS',
  'OPENCODE_CONFIG_CONTENT',
] as const);

/** `opencode run --help` (yargs: two-space indented option lines), the flags the argv needs. */
export const RUN_HELP = `opencode run [message..]

run opencode with a message

Positionals:
  message  message to send                                       [array] [default: []]

Options:
  -h, --help        show help                                                [boolean]
  -v, --version     show version number                                      [boolean]
      --print-logs  print logs to stderr                                     [boolean]
  -c, --continue    continue the last session                                [boolean]
  -s, --session     session id to continue                                    [string]
      --share       share the session                                        [boolean]
  -m, --model       model to use in the format of provider/model              [string]
      --agent       agent to use                                              [string]
      --format      format: default (formatted) or json (raw JSON events)
                                       [string] [choices: "default", "json"] [default: "default"]
      --pure        run without external plugins                             [boolean]
`;

export interface FakeOpencodeOptions {
  readonly version?: string;
  /** `run --help` text (default RUN_HELP). */
  readonly help?: string;
  /** Write the help to stdout instead of stderr (an older yargs). */
  readonly helpOnStdout?: boolean;
  /** Ignore ONE restriction key of the model — the CLI that the probe must catch. */
  readonly ignore?: (typeof MODELLED_KEYS)[number];
  /** No `debug` subcommand at all (exit 1, unknown command). */
  readonly noDebug?: boolean;
  /** Loads everything, REPORTS nothing of it (the CLI a probe without a control leg would believe). */
  readonly blind?: boolean;
  /**
   * Honours OPENCODE_CONFIG_CONTENT (its MCP server, its instructions) but resolves NONE of the
   * daemon's permissions — neither the config's block nor OPENCODE_PERMISSION (the vacuity guard's case).
   */
  readonly dropPermission?: boolean;
  /** `debug config` exits 1 once (its first call creates this marker file), then answers. */
  readonly failOnceMarker?: string;
  /** Every `debug` answer is clean but the command exits 3 (an answer the probe must not believe). */
  readonly debugExit?: number;
  /**
   * The configuration a `wellknown` credential's server "serves" (merged, as 1.18.32 merges
   * `<url>/.well-known/opencode`'s `config`, for each wellknown entry of the credential store).
   * Default: an extra LOCAL MCP server and a prompt for the builtin `build` agent.
   */
  readonly wellknownConfig?: Record<string, unknown>;
  /**
   * The binary ignores `OPENCODE_DB` and opens its CHANNEL's database (`opencode-dev.db`), as a dev
   * build would without the key — the probe's `db path` question must catch it.
   */
  readonly ignoreDbKey?: boolean;
  /** No `db` subcommand (exit 1, unknown command): the database it opens cannot be asked. */
  readonly noDbCommand?: boolean;
  /** What an active console org "serves" (merged after OPENCODE_CONFIG_CONTENT, as 1.18.32 does). */
  readonly orgConfig?: Record<string, unknown>;
}

/** What an active console org's `/api/config` serves by default: an extra LOCAL MCP server. */
export const ORG_CONFIG = Object.freeze({ mcp: { zorgmcp: { type: 'local', command: ['/bin/echo', 'org'] } } });

/** What a wellknown credential's server serves by default (the reviewer's measured payload). */
export const WELLKNOWN_CONFIG = Object.freeze({
  mcp: { zextramcp: { type: 'local', command: ['/bin/echo', 'planted'] } },
  agent: { build: { prompt: 'ZZ_REMOTE_PROMPT' } },
});

/** Write a fake `opencode` binary into `dir`; returns its absolute path. */
export function writeFakeOpencode(dir: string, name: string, options: FakeOpencodeOptions = {}): string {
  const path = join(dir, name);
  const body = `#!${process.execPath}
const VERSION = ${JSON.stringify(options.version ?? '1.18.32')};
const HELP = ${JSON.stringify(options.help ?? RUN_HELP)};
const IGNORE = ${JSON.stringify(options.ignore ?? null)};
const NO_DEBUG = ${JSON.stringify(options.noDebug === true)};
const HELP_ON_STDOUT = ${JSON.stringify(options.helpOnStdout === true)};
const BLIND = ${JSON.stringify(options.blind === true)};
const DROP_PERMISSION = ${JSON.stringify(options.dropPermission === true)};
const FAIL_ONCE = ${JSON.stringify(options.failOnceMarker ?? null)};
const DEBUG_EXIT = ${JSON.stringify(options.debugExit ?? 0)};
const WELLKNOWN = ${JSON.stringify(options.wellknownConfig ?? WELLKNOWN_CONFIG)};
const IGNORE_DB_KEY = ${JSON.stringify(options.ignoreDbKey === true)};
const NO_DB_COMMAND = ${JSON.stringify(options.noDbCommand === true)};
const ORG = ${JSON.stringify(options.orgConfig ?? ORG_CONFIG)};
${FAKE_BODY}`;
  writeFileSync(path, body, { mode: 0o755 });
  chmodSync(path, 0o755);
  return path;
}

const FAKE_BODY = String.raw`
const { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const env = process.env;
const on = key => key !== IGNORE && env[key] === '1';
const args = process.argv.slice(2);
const cwd = process.cwd();
const home = env.HOME || '';
const configHome = env.XDG_CONFIG_HOME || (home ? join(home, '.config') : '');
const readJson = path => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };
const list = dir => { try { return readdirSync(dir).sort(); } catch { return []; } };

if (args[0] === '--version' || args[0] === '-v') { console.log(VERSION); process.exit(0); }

// THE OPTIONS of run, yargs-like: options until '--'; an option-shaped word is an option.
const flags = {}; const positional = [];
let sub = [];
{
  let i = 0;
  while (i < args.length && !args[i].startsWith('-')) sub.push(args[i++]);
  for (; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { positional.push(...args.slice(i + 1)); break; }
    if (a === '--help' || a === '-h') { flags.help = true; continue; }
    if (a === '--version' || a === '-v') { flags.version = true; continue; }
    if (a === '--pure') { flags.pure = true; continue; }
    if (a === '--format' || a === '--session' || a === '-s' || a === '--model' || a === '-m' || a === '--agent') { flags[a.replace(/^-+/, '')] = args[++i]; continue; }
    if (a.startsWith('-')) { flags[a.replace(/^-+/, '')] = true; continue; }
    positional.push(a);
  }
}
if (sub[0] === 'run' && sub.length > 1) positional.unshift(...sub.slice(1));
sub = sub.slice(0, sub[0] === 'debug' ? 3 : sub[0] === 'db' ? 2 : 1);

if (flags.version) { console.log(VERSION); process.exit(0); }
if (sub[0] === 'run' && flags.help) { (HELP_ON_STDOUT ? process.stdout : process.stderr).write(HELP); process.exit(0); }

// WHAT IT LOADS — the model in the header, per key.
const pure = flags.pure === true || on('OPENCODE_PURE');
const projectOff = on('OPENCODE_DISABLE_PROJECT_CONFIG');
const loaded = { config: [], instructions: [], mcp: [], agents: [], tools: [], plugins: [], skills: [], commands: [], permission: null };
const merge = (from, cfg) => {
  if (!cfg || typeof cfg !== 'object') return;
  loaded.config.push(from);
  for (const i of cfg.instructions || []) loaded.instructions.push(String(i));
  for (const name of Object.keys(cfg.mcp || {})) loaded.mcp.push({ name, from, type: (cfg.mcp[name] || {}).type || null });
  if (cfg.permission && !(from === 'content' && DROP_PERMISSION)) loaded.permission = Object.assign({}, loaded.permission || {}, cfg.permission);
  for (const name of Object.keys(cfg.agent || {})) loaded.agents.push({ from, name: name + '.md', body: String((cfg.agent[name] || {}).prompt || '') });
};
if (configHome) merge('global', readJson(join(configHome, 'opencode', 'opencode.json')));
if (!projectOff) merge('project', readJson(join(cwd, 'opencode.json')));
// THE CREDENTIAL STORE (measured on 1.18.32): OPENCODE_AUTH_CONTENT when set, else
// <XDG_DATA_HOME>/opencode/auth.json; each wellknown entry merges its server configuration.
const dataHome = env.XDG_DATA_HOME || (home ? join(home, '.local', 'share') : '');
const authText = env.OPENCODE_AUTH_CONTENT !== undefined ? env.OPENCODE_AUTH_CONTENT : (() => { try { return readFileSync(join(dataHome, 'opencode', 'auth.json'), 'utf8'); } catch { return null; } })();
const authStore = (() => { try { return JSON.parse(authText); } catch { return null; } })();
for (const entry of Object.values(authStore && typeof authStore === 'object' ? authStore : {})) {
  if (entry && entry.type === 'wellknown') merge('wellknown', WELLKNOWN);
}
const contentKey = 'OPENCODE_CONFIG_CONTENT';
if (contentKey !== IGNORE && env[contentKey]) { try { merge('content', JSON.parse(env[contentKey])); } catch {} }
// THE DATABASE (measured on 1.18.32): OPENCODE_DB absolute as given, relative under
// <XDG_DATA_HOME>/opencode; unset, the channel's name. Its ACTIVE CONSOLE ORG's configuration is
// FETCHED and merged after OPENCODE_CONFIG_CONTENT — reached only with the network (no proxy here:
// a dead proxy is a failed fetch, ignored, exactly as 1.18.32 logs and ignores it).
const dbFile = (() => {
  const key = IGNORE_DB_KEY ? undefined : env.OPENCODE_DB;
  if (key && key.startsWith('/')) return key;
  return join(dataHome, 'opencode', key || (IGNORE_DB_KEY ? 'opencode-dev.db' : 'opencode.db'));
})();
const activeOrg = (() => {
  try {
    if (!existsSync(dbFile)) return null;
    const { Database } = require('bun:sqlite');
    const db = new Database(dbFile, { readonly: true });
    try { const row = db.query('SELECT active_org_id FROM account_state WHERE active_org_id IS NOT NULL LIMIT 1').get(); return row ? row.active_org_id : null; } finally { db.close(); }
  } catch { return null; }
})();
const proxied = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'].some(key => env[key]);
if (activeOrg && !proxied) merge('org', ORG);
// OPENCODE_PERMISSION overrides the configuration's permission block, key by key (measured).
if (env.OPENCODE_PERMISSION && !DROP_PERMISSION) { try { loaded.permission = Object.assign({}, loaded.permission || {}, JSON.parse(env.OPENCODE_PERMISSION)); } catch {} }
const dirs = [];
if (home) dirs.push(['home', join(home, '.opencode')]);
if (configHome) dirs.push(['global', join(configHome, 'opencode')]);
if (!projectOff) dirs.push(['project', join(cwd, '.opencode')]);
for (const [from, dir] of dirs) {
  for (const e of list(join(dir, 'agent'))) loaded.agents.push({ from, name: e, body: (() => { try { return readFileSync(join(dir, 'agent', e), 'utf8'); } catch { return ''; } })() });
  for (const e of list(join(dir, 'tool'))) loaded.tools.push({ from, name: e });
  for (const e of list(join(dir, 'command'))) loaded.commands.push({ from, name: e, body: (() => { try { return readFileSync(join(dir, 'command', e), 'utf8'); } catch { return ''; } })() });
}
if (!pure) {
  const pluginDirs = [];
  if (home) pluginDirs.push(['home', join(home, '.opencode', 'plugin')]);
  if (configHome) pluginDirs.push(['global', join(configHome, 'opencode', 'plugin')]);
  pluginDirs.push(['project', join(cwd, '.opencode', 'plugin')]);
  for (const [from, dir] of pluginDirs) for (const e of list(dir)) {
    loaded.plugins.push({ from, name: e, dir });
    // A plugin is CODE the CLI runs.
    try { require(join(dir, e)); } catch {}
  }
}
const skillRoots = [];
if (!projectOff) skillRoots.push(['project', join(cwd, '.opencode', 'skills')]);
if (!on('OPENCODE_DISABLE_CLAUDE_CODE')) { skillRoots.push(['claude', join(cwd, '.claude', 'skills')]); if (home) skillRoots.push(['claude-home', join(home, '.claude', 'skills')]); }
if (!on('OPENCODE_DISABLE_EXTERNAL_SKILLS')) { skillRoots.push(['agents', join(cwd, '.agents', 'skills')]); if (home) skillRoots.push(['agents-home', join(home, '.agents', 'skills')]); }
for (const [from, dir] of skillRoots) for (const e of list(dir)) loaded.skills.push({ from, name: e, body: (() => { try { return readFileSync(join(dir, e, 'SKILL.md'), 'utf8'); } catch { return ''; } })() });

if (sub[0] === 'db' && sub[1] === 'path' && !NO_DB_COMMAND) { console.log(dbFile); process.exit(0); }

if (sub[0] === 'debug') {
  if (NO_DEBUG) { process.stderr.write('error: unknown command debug\n'); process.exit(1); }
  if (FAIL_ONCE && sub[1] === 'config' && !existsSync(FAIL_ONCE)) { writeFileSync(FAIL_ONCE, '1'); process.stderr.write('error: transient\n'); process.exit(1); }
  // A BLIND CLI loads all of it (above — its plugins RAN) and reports none of it.
  const shown = BLIND ? { ...loaded, instructions: loaded.instructions.filter(i => i.startsWith('/')), mcp: loaded.mcp.filter(m => m.from === 'content'), agents: [], tools: [], plugins: [], skills: [], commands: [] } : loaded;
  const answer = body => { console.log(JSON.stringify(body, null, 2)); process.exit(DEBUG_EXIT); };
  if (sub[1] === 'config') answer({
    instructions: shown.instructions,
    mcp: Object.fromEntries(shown.mcp.map(m => [m.name, { type: m.type, from: m.from }])),
    permission: shown.permission,
    agent: Object.fromEntries(shown.agents.map(a => [a.name.replace(/\.md$/, ''), { description: a.body }])),
    command: Object.fromEntries(shown.commands.map(c => [c.name.replace(/\.md$/, ''), { template: c.body }])),
    plugin: shown.plugins.map(p => 'file://' + p.dir + '/' + p.name),
    sources: shown.config,
  });
  if (sub[1] === 'agent') {
    const name = sub[2] || 'build';
    const own = shown.agents.find(a => a.name.replace(/\.md$/, '') === name);
    // Like 1.18.32: the agent's rules echo paths under HOME and the cwd.
    answer({ name, prompt: own ? own.body : '(builtin)', tools: shown.tools.map(t => t.name), agents: shown.agents.map(a => a.from + ':' + a.name), permission: [{ permission: 'external_directory', pattern: join(home, '.local', 'share', 'opencode', 'tool-output', '*'), action: 'allow' }, { permission: 'read', pattern: join(cwd, '*'), action: 'allow' }] });
  }
  if (sub[1] === 'skill') answer(shown.skills);
  process.stderr.write('error: unknown debug command\n'); process.exit(1);
}

if (sub[0] !== 'run') { process.stderr.write('error: unknown command ' + (sub[0] || '') + '\n'); process.exit(1); }

// A TURN THAT PLANTS for the next one — the workspace and HOME, as a turn's Write could.
if (env.FAKE_PLANT === '1') {
  const put = (path, body) => { mkdirSync(require('node:path').dirname(path), { recursive: true }); writeFileSync(path, body); };
  put(join(cwd, 'opencode.json'), JSON.stringify({ instructions: ['PLANTED_INSTRUCTIONS.md'], mcp: { planted: { type: 'local', command: ['/bin/sh', '-c', 'touch MCP_RAN'] } } }));
  put(join(cwd, '.opencode', 'plugin', 'planted.js'), "require('node:fs').writeFileSync(require('node:path').join(process.cwd(), 'PLUGIN_RAN'), '1');");
  put(join(cwd, '.opencode', 'agent', 'build.md'), 'PLANTED_AGENT');
  if (home) {
    put(join(home, '.opencode', 'tool', 'planted.js'), '// planted tool');
    put(join(home, '.opencode', 'plugin', 'home_planted.js'), "require('node:fs').writeFileSync(require('node:path').join(process.cwd(), 'HOME_PLUGIN_RAN'), '1');");
  }
  if (configHome) put(join(configHome, 'opencode', 'opencode.json'), JSON.stringify({ instructions: ['PLANTED_GLOBAL.md'], mcp: { globalplant: { type: 'local', command: ['/bin/true'] } } }));
}

const prompt = positional.join(' ');
const report = {
  argv: args,
  prompt,
  session: flags.session || flags.s || null,
  pure,
  env: Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith('OPENCODE_') || k.startsWith('XDG_') || k === 'HOME')),
  // The WHOLE environment the run received — what a gate compares with the probe's.
  allEnv: { ...env },
  loaded,
  planted: [
    ...loaded.instructions.filter(i => i.startsWith('PLANTED')),
    ...loaded.mcp.filter(m => m.name === 'planted' || m.name === 'globalplant').map(m => 'mcp:' + m.name),
    ...loaded.plugins.map(p => 'plugin:' + p.from + ':' + p.name),
    ...loaded.agents.filter(a => /PLANTED/.test(a.body)).map(a => 'agent:' + a.from + ':' + a.name),
    ...loaded.tools.map(t => 'tool:' + t.from + ':' + t.name),
  ],
};
console.log(JSON.stringify({ type: 'text', text: 'FAKE_LOAD ' + JSON.stringify(report) }));
console.log(JSON.stringify({ type: 'session', id: 'fake-opencode-session' }));
`;

/** The `FAKE_LOAD` report out of a turn's text events, or null. */
export function opencodeLoadReport(texts: readonly string[]): Record<string, any> | null {
  const line = texts.find(text => text.startsWith('FAKE_LOAD '));
  return line ? JSON.parse(line.slice('FAKE_LOAD '.length)) : null;
}
