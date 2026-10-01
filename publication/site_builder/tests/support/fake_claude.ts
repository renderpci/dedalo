/**
 * A STAND-IN CLAUDE CODE CLI that REPORTS which configuration it would load, and executes
 * nothing.
 *
 * The real CLI cannot run in the suite (it needs an account, a network and a minute), and the
 * property under test is not "Claude Code works" but "what does a turn's argv make it LOAD":
 * the planted `<workspace>/.claude/settings.json` hook, the planted `.mcp.json` stdio server,
 * HOME's settings, the project memory. So this binary parses the argv the way the real one does
 * (commander: options until `--`, values, variadics, an unknown option refused — or, for the
 * LEGACY variant, tolerated: the worst case a probe exists for) and answers with one assistant
 * line `FAKE_LOAD {…}` and a result line, both in stream-json.
 *
 * WHAT IT MODELS IS MEASURED, NOT ASSUMED — Claude Code 2.1.286 (2026-10-01), against a planted
 * workspace with a local fake Messages API (spec PLANT; the live leg is
 * `deploy/probes/claude_plant_probe.ts`):
 *
 *   - default sources (no `--setting-sources`): user, project and local settings load; their
 *     hooks fire; a project `.mcp.json` server runs when the settings approve project servers;
 *     project memory (CLAUDE.md) and project skills/commands/agents load.
 *   - `--setting-sources ''`: none of the above; `--settings` still applies.
 *   - `--settings '{"disableAllHooks":true}'` alone: no hook fires, from any source.
 *   - `--strict-mcp-config` alone: only `--mcp-config` servers.
 *   - a settings source that fails validation is ignored WHOLE (here: invalid JSON).
 *
 * The honest limit: this is a model of one release. A release that changes those semantics
 * is caught by the probe only as far as `--help` changes; the semantics themselves are
 * re-measured by the live probe.
 */

import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The option lines of 2.1.286's `--help` that the driver's argv uses (copied, trimmed). */
export const MODERN_HELP = `Usage: claude [options] [command] [prompt]

Options:
  --allowedTools, --allowed-tools <tools...>
      Comma or space-separated list of tool names to allow (e.g. "Bash(git *)
      Edit")
  --append-system-prompt <prompt>       Append a system prompt to the default
                                        system prompt
  --disallowedTools, --disallowed-tools <tools...>
      Comma or space-separated list of tool names to deny (e.g. "Bash(git *)
      Edit")
  --mcp-config <configs...>             Load MCP servers from JSON files or
                                        strings (space-separated)
  --output-format <format>              Output format (only works with --print)
  --permission-mode <mode>              Permission mode to use for the session
  -p, --print                           Print response and exit (useful for
                                        pipes).
  --restricted                          Restricted mode: removes the built-in
                                        tools; add --strict-mcp-config to skip
                                        MCP servers too.
  -r, --resume [value]                  Resume a conversation by session ID
  --setting-sources <sources>           Comma-separated list of setting sources
                                        to load (user, project, local).
  --settings <file-or-json>             Path to a settings JSON file or a JSON
                                        string to load additional settings from
  --strict-mcp-config                   Only use MCP servers from --mcp-config,
                                        ignoring all other MCP configurations
  --verbose                             Override verbose mode setting from
                                        config
  -v, --version                         Output the version number
`;

/**
 * A LEGACY help: no `--setting-sources`, no `--settings`, no `--strict-mcp-config` as option
 * lines — but `--strict-mcp-config` still MENTIONED inside a description, which a probe that
 * grepped the whole text would mistake for support.
 */
export const LEGACY_HELP = MODERN_HELP.split('\n')
  .filter(line => !/^ {2}--(setting-sources|settings|strict-mcp-config) /.test(line))
  .filter(line => !/^ {40}(to load \(user|string to load additional|ignoring all other MCP)/.test(line))
  .join('\n');

export interface FakeClaudeOptions {
  readonly version: string;
  readonly help: string;
  /** Tolerate unknown options (the worst legacy case): they are dropped, the turn runs. */
  readonly tolerateUnknown?: boolean;
}

/** Write a fake `claude` binary into `dir`; returns its absolute path. */
export function writeFakeClaude(dir: string, name: string, options: FakeClaudeOptions): string {
  const path = join(dir, name);
  const body = `#!${process.execPath}
const VERSION = ${JSON.stringify(options.version)};
const HELP = ${JSON.stringify(options.help)};
const TOLERATE = ${JSON.stringify(options.tolerateUnknown === true)};
${FAKE_BODY}`;
  writeFileSync(path, body, { mode: 0o755 });
  chmodSync(path, 0o755);
  return path;
}

/** The fake's program (after its constants). Plain JS: it runs under the bun of the shebang. */
const FAKE_BODY = String.raw`
const { existsSync, readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const listed = new Set();
for (const line of HELP.split('\n')) {
  const m = /^ {1,4}(-{1,2}[A-Za-z][\w-]*(?:,\s*-{1,2}[A-Za-z][\w-]*)*)/.exec(line);
  if (m) for (const f of m[1].split(/,\s*/)) listed.add(f);
}
const VALUE = new Set(['--output-format', '--permission-mode', '--max-turns', '--setting-sources', '--settings', '--append-system-prompt']);
const VARIADIC = new Set(['--mcp-config', '--allowedTools', '--disallowedTools']);
const OPTIONAL = new Set(['--resume', '-r']);
const HIDDEN = new Set(['--max-turns']);
const args = process.argv.slice(2);
if (args[0] === '--version' || args[0] === '-v') { console.log(VERSION + ' (Claude Code)'); process.exit(0); }
if (args[0] === '--help' || args[0] === '-h') { process.stdout.write(HELP); process.exit(0); }
const opts = {}; const positional = []; const dropped = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--') { positional.push(...args.slice(i + 1)); break; }
  if (!a.startsWith('-')) { positional.push(a); continue; }
  const [name, inline] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
  if (!listed.has(name) && !HIDDEN.has(name)) {
    if (!TOLERATE) { process.stderr.write("error: unknown option '" + name + "'\n"); process.exit(1); }
    dropped.push(name);
    if (VALUE.has(name) && inline === undefined) i++;
    else if (VARIADIC.has(name) && inline === undefined) while (i + 1 < args.length && !args[i + 1].startsWith('-')) i++;
    continue;
  }
  if (VALUE.has(name)) { opts[name] = inline !== undefined ? inline : args[++i]; continue; }
  if (VARIADIC.has(name)) {
    const values = inline !== undefined ? [inline] : [];
    while (inline === undefined && i + 1 < args.length && !args[i + 1].startsWith('-')) values.push(args[++i]);
    opts[name] = (opts[name] || []).concat(values); continue;
  }
  if (OPTIONAL.has(name)) { if (inline !== undefined) opts['--resume'] = inline; else if (i + 1 < args.length && !args[i + 1].startsWith('-')) opts['--resume'] = args[++i]; else opts['--resume'] = true; continue; }
  opts[name] = true;
}
const cwd = process.cwd();
const home = process.env.HOME;
const sources = '--setting-sources' in opts ? String(opts['--setting-sources']).split(',').map(s => s.trim()).filter(Boolean) : ['user', 'project', 'local'];
const readJson = path => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };
const files = [];
if (sources.includes('user') && home) files.push(join(home, '.claude', 'settings.json'));
if (sources.includes('project')) files.push(join(cwd, '.claude', 'settings.json'));
if (sources.includes('local')) files.push(join(cwd, '.claude', 'settings.local.json'));
const loaded = [];
for (const f of files) if (existsSync(f)) { const j = readJson(f); if (j && typeof j === 'object') loaded.push({ from: f, settings: j }); }
if ('--settings' in opts) {
  const v = String(opts['--settings']);
  let j = null;
  if (v.trim().startsWith('{')) { try { j = JSON.parse(v); } catch { j = null; } } else j = readJson(v);
  if (j && typeof j === 'object') loaded.push({ from: 'flag', settings: j });
}
const effective = key => { let v; for (const l of loaded) if (key in l.settings) v = l.settings[key]; return v; };
const hooksOff = loaded.some(l => l.settings.disableAllHooks === true);
const hooks = [];
if (!hooksOff) for (const l of loaded) for (const event of Object.values(l.settings.hooks || {})) for (const m of event) for (const h of m.hooks || []) hooks.push(h.command);
const mcp = [];
for (const c of opts['--mcp-config'] || []) { const j = c.trim().startsWith('{') ? JSON.parse(c) : readJson(c); for (const name of Object.keys((j && j.mcpServers) || {})) mcp.push({ name, from: c.trim().startsWith('{') ? 'inline' : c }); }
if (!opts['--strict-mcp-config'] && sources.includes('project') && effective('enableAllProjectMcpServers') === true && existsSync(join(cwd, '.mcp.json'))) {
  for (const name of Object.keys((readJson(join(cwd, '.mcp.json')) || {}).mcpServers || {})) mcp.push({ name, from: '.mcp.json' });
}
const memory = sources.includes('project') && existsSync(join(cwd, 'CLAUDE.md')) ? ['CLAUDE.md'] : [];
const extensions = [];
for (const kind of ['skills', 'commands', 'agents']) {
  if (sources.includes('project') && existsSync(join(cwd, '.claude', kind))) for (const e of readdirSync(join(cwd, '.claude', kind))) extensions.push('project:' + kind + ':' + e);
  if (sources.includes('user') && home && existsSync(join(home, '.claude', kind))) for (const e of readdirSync(join(home, '.claude', kind))) extensions.push('user:' + kind + ':' + e);
}
const report = { sources, settingsFrom: loaded.map(l => l.from), hooks, mcp, memory, extensions, prompt: positional[0] ?? null, positional, appendSystemPrompt: opts['--append-system-prompt'] ?? null, dropped, argv: args };
console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'FAKE_LOAD ' + JSON.stringify(report) }] } }));
console.log(JSON.stringify({ type: 'result', session_id: 'fake-session', duration_ms: 1 }));
`;

/** The `FAKE_LOAD` report out of a turn's text events, or null. */
export function loadReport(texts: readonly string[]): Record<string, any> | null {
  const line = texts.find(text => text.startsWith('FAKE_LOAD '));
  return line ? JSON.parse(line.slice('FAKE_LOAD '.length)) : null;
}
