/**
 * THE OPENCODE TURN'S ARGV, ITS RESTRICTION AND THE DAEMON'S WHOLE CONFIGURATION — a builtin-only
 * leaf (no config, no I/O), so the driver, the gates, `src/config.ts` (which refuses an
 * `OPENCODE_ENV` naming any of these keys) and the live probe (`deploy/probes/
 * opencode_plant_probe.ts`, run on a host with no daemon configuration) spell the SAME statement.
 *
 * WHAT A TURN LOADS IS THE DAEMON'S STATEMENT (LEAD-1c, PLANT for opencode). opencode loads
 * configuration from the workspace (`opencode.json` — instructions, local MCP servers —,
 * `.opencode/{agent,tool,plugin}`, a plugin being CODE it runs), from `.claude/skills` and
 * `.agents/skills`, and from HOME. Every one of those a turn's Write or a build's postinstall can
 * plant for the NEXT turn. So:
 *
 *   - `OPENCODE_DISABLE_PROJECT_CONFIG=1` — no workspace `opencode.json` or `.opencode/` config;
 *   - `OPENCODE_PURE=1` and `--pure` — no plugin from anywhere;
 *   - `OPENCODE_DISABLE_CLAUDE_CODE=1`, `OPENCODE_DISABLE_EXTERNAL_SKILLS=1` — no skill dirs;
 *   - `OPENCODE_CONFIG_CONTENT` — the daemon's WHOLE configuration (its MCP server, its permission
 *     block, its brief as the one instruction file, every loader off), merged last;
 *   - `OPENCODE_PERMISSION` — the permission block again, in the one key opencode lets OVERRIDE a
 *     configuration's (measured on 1.18.32: `OPENCODE_PERMISSION={"bash":"allow"}` over a config
 *     saying `bash: deny` resolves `allow`), so the daemon's statement is the last word there too;
 *   - HOME is the HOME law's (`agent_identity.ts` S3-HOME): root's read-only `.config` under a
 *     unit, a fresh per-run HOME under `none` — never a key of this leaf;
 *   - the egress keys (auto-update, models fetch, LSP download, share) are `childEgressEnv`'s.
 *
 * The prompt follows a literal `--`, so a prompt shaped like an option (`--version`) is the prompt.
 * What the real binary does with each key is RE-MEASURED, per binary, by the driver's probe
 * (`opencode.ts` `probeOpencodePlantClosure`) before any turn of it runs.
 */

/** What one turn's argv is built from. */
export interface OpencodeTurnInput {
  readonly bin: string;
  readonly prompt: string;
  readonly resumeToken?: string;
}

/** `run --pure --format json [--session <t>] -- <prompt>`. */
export function opencodeTurnArgv(input: OpencodeTurnInput): string[] {
  return [
    input.bin,
    'run',
    '--pure',
    '--format',
    'json',
    ...(input.resumeToken ? ['--session', input.resumeToken] : []),
    '--',
    input.prompt,
  ];
}

/** The options an argv names: every `-` token before the `--` that ends them. */
function argvFlags(argv: readonly string[]): string[] {
  const end = argv.indexOf('--');
  return [...new Set((end < 0 ? argv : argv.slice(0, end)).filter(token => token.startsWith('-')))];
}

/**
 * THE FLAGS A TURN REQUIRES `run --help` TO LIST, derived from the argv itself (every optional
 * branch on) — a flag added to the argv is a flag the probe demands, with no second list.
 */
export function requiredOpencodeFlags(): string[] {
  return argvFlags(opencodeTurnArgv({ bin: 'opencode', prompt: 'probe', resumeToken: 'probe' }).slice(1));
}

/**
 * Every option a yargs `--help` DEFINES: the leading `-x, --long` of an option line, at ANY
 * indentation (yargs indents a long-only option further than one with a short alias). A flag a
 * description merely MENTIONS is never counted: a description follows the option on its line.
 */
export function listedYargsFlags(help: string): Set<string> {
  const flags = new Set<string>();
  for (const line of help.split('\n')) {
    const match = /^\s+(-{1,2}[A-Za-z][\w-]*(?:,\s*-{1,2}[A-Za-z][\w-]*)*)/.exec(line);
    if (!match) continue;
    for (const flag of (match[1] as string).split(/,\s*/)) flags.add(flag);
  }
  return flags;
}

/**
 * OPENCODE'S OWN VOCABULARY for the closed statement the Claude Code driver makes: shell, the
 * web, code search, skills, sub-agents and any path outside the workspace denied; editing — the
 * whole job — allowed.
 */
export const DENIED_PERMISSIONS: Readonly<Record<string, string>> = Object.freeze({
  bash: 'deny',
  webfetch: 'deny',
  websearch: 'deny',
  codesearch: 'deny',
  skill: 'deny',
  task: 'deny',
  external_directory: 'deny',
  edit: 'allow',
});

/** One MCP server as the daemon attaches it (`types.ts` McpAttachment, restated: builtins only). */
export interface OpencodeMcp {
  readonly name: string;
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
}

/** Characters opencode's `instructions` would read as a glob: a path holding one is not one file. */
const GLOB_METACHARACTERS = /[*?[\]{}!]/;

/**
 * THE DAEMON'S WHOLE CONFIGURATION — the one source `OPENCODE_CONFIG_CONTENT` carries: its MCP
 * server alone, its permission block, the brief the DAEMON wrote as the one instruction file
 * (`instructions`, absolute paths — never a glob), and every loader that could reach a file or a
 * host off.
 */
export function opencodeDaemonConfig(mcp: OpencodeMcp, instructions: readonly string[] = []): Record<string, unknown> {
  for (const path of instructions) {
    if (!path.startsWith('/') || GLOB_METACHARACTERS.test(path)) {
      throw new Error(`opencode: the instruction file '${path}' is not one absolute path without glob characters`);
    }
  }
  const server: Record<string, unknown> = { type: 'remote', url: mcp.url };
  if (mcp.headers && Object.keys(mcp.headers).length > 0) server.headers = { ...mcp.headers };
  return {
    mcp: { [mcp.name]: server },
    permission: { ...DENIED_PERMISSIONS },
    lsp: false,
    formatter: false,
    snapshot: false,
    share: 'disabled',
    autoupdate: false,
    plugin: [],
    instructions: [...instructions],
  };
}

/** The four switches that turn a SOURCE off (the probe's control leg runs without exactly these). */
export const OPENCODE_SOURCE_SWITCHES = Object.freeze([
  'OPENCODE_DISABLE_PROJECT_CONFIG',
  'OPENCODE_PURE',
  'OPENCODE_DISABLE_CLAUDE_CODE',
  'OPENCODE_DISABLE_EXTERNAL_SKILLS',
] as const);

/** The keys of the restriction, the same in both confinement modes. */
export const OPENCODE_RESTRICTION_KEYS = Object.freeze([...OPENCODE_SOURCE_SWITCHES, 'OPENCODE_CONFIG_CONTENT', 'OPENCODE_PERMISSION'] as const);

/**
 * THE RESTRICTION: the four switches, the daemon's configuration (`opencodeDaemonConfig`, as JSON)
 * and its permission block in the key that overrides a configuration's.
 */
export function OPENCODE_RESTRICTION_ENV(configJson: string): Readonly<Record<(typeof OPENCODE_RESTRICTION_KEYS)[number], string>> {
  return Object.freeze({
    OPENCODE_DISABLE_PROJECT_CONFIG: '1',
    OPENCODE_PURE: '1',
    OPENCODE_DISABLE_CLAUDE_CODE: '1',
    OPENCODE_DISABLE_EXTERNAL_SKILLS: '1',
    OPENCODE_CONFIG_CONTENT: configJson,
    OPENCODE_PERMISSION: JSON.stringify(DENIED_PERMISSIONS),
  });
}

/**
 * opencode's OWN OFF-PLAN TRAFFIC, turned OFF — the auto-updater (which would replace the binary
 * the probe proved), the models.dev catalogue, LSP downloads, share uploads (a disclosure, not
 * only a host). Names read off the 1.18 binary's flag table. The DRIVER states them, in every
 * mode: under `none` there is no egress gate to refuse those hosts one CONNECT at a time, so a
 * switch that lived only in the confined run's egress keys (`childEgressEnv`) never reached the
 * one mode an opencode turn runs in.
 */
export const OPENCODE_TRAFFIC_SWITCHES: Readonly<Record<string, string>> = Object.freeze({
  OPENCODE_DISABLE_AUTOUPDATE: '1',
  OPENCODE_DISABLE_MODELS_FETCH: '1',
  OPENCODE_DISABLE_LSP_DOWNLOAD: '1',
  OPENCODE_DISABLE_SHARE: '1',
});

/**
 * THE DATABASE IS STATED, NOT GUESSED. opencode keeps its sessions AND its console accounts in one
 * SQLite file under `<XDG_DATA_HOME>/opencode/`, named by its release CHANNEL (`opencode.db`, or
 * `opencode-<channel>.db` for a dev build) unless `OPENCODE_DB` says otherwise; a RELATIVE value
 * is taken under that same data directory (measured on 1.18.32). The daemon states the name, so
 * the file it checks for a console account (`opencodeStateDatabase`) is the file the turn opens —
 * and the probe proves the binary agrees (`opencode db path`).
 */
export const OPENCODE_DB_KEY = 'OPENCODE_DB';
export const OPENCODE_STATED_DB = 'opencode.db';

/** The database a turn whose XDG_DATA_HOME is `dataHome` opens — the file `OPENCODE_DB` states. */
export function opencodeStateDatabase(dataHome: string): string {
  return `${dataHome.replace(/\/+$/, '')}/opencode/${OPENCODE_STATED_DB}`;
}

/**
 * A CONSOLE ACCOUNT IS A REMOTE CONFIGURATION SOURCE no key turns off. Measured on 1.18.32: when the
 * database holds an active console account with an org (`opencode console login`), every start
 * fetches `<account url>/api/config` and merges it AFTER `OPENCODE_CONFIG_CONTENT` — an extra LOCAL
 * MCP server (a command it spawns, past `bash: deny`) reached a turn under the full restriction.
 * No environment key closes it, and a probe cannot see what a remote serves tomorrow, so the
 * daemon closes it by statement: a turn whose database holds ANY console account (`account`, and
 * the older `control_account` a migration would activate) is refused, every turn.
 */
export const OPENCODE_ACCOUNT_TABLES = Object.freeze(['account', 'control_account'] as const);

/**
 * THE ONE OPENCODE TURN ENVIRONMENT, beyond PATH and the HOME law's keys (the confinement's): the
 * operator's credentials (`OPENCODE_ENV`, an allowlist — `isOpencodeCredentialKey`), then the
 * daemon's statement OVER them — the traffic switches, the database, the restriction. The
 * driver's setup states it for every turn (`TurnPlan.env`, merged over the caller's), and the
 * probe asks the binary under exactly it — so what the probe proves is what a turn runs with,
 * the operator's own keys included.
 */
export function opencodeTurnEnvironment(input: {
  readonly operatorEnv: Readonly<Record<string, string>>;
  readonly configJson: string;
}): Record<string, string> {
  return {
    [OPENCODE_AUTH_CONTENT_KEY]: OPENCODE_NO_STORED_CREDENTIALS,
    ...input.operatorEnv,
    ...OPENCODE_TRAFFIC_SWITCHES,
    [OPENCODE_DB_KEY]: OPENCODE_STATED_DB,
    ...OPENCODE_RESTRICTION_ENV(input.configJson),
  };
}

/**
 * THE CREDENTIAL STORE IS THE DAEMON'S STATEMENT TOO. opencode reads its credentials from
 * `OPENCODE_AUTH_CONTENT` when set, and otherwise from `<XDG_DATA_HOME>/opencode/auth.json` — a file
 * in the turn's own writable state. And that store is a CONFIGURATION SOURCE: for each `wellknown`
 * entry opencode fetches `<url>/.well-known/opencode` on every turn and merges the remote `config`
 * (an extra LOCAL MCP server — a command it spawns, past `bash: deny` —, an agent's prompt).
 * Measured on 1.18.32: a `wellknown` entry in `auth.json` or in `OPENCODE_AUTH_CONTENT` adds the
 * remote MCP server; `OPENCODE_AUTH_CONTENT={}` (or an `api` entry) makes the same `auth.json`
 * unread. So every turn states the key: the operator's (`opencodeAuthContentProblem` admits only
 * `api`/`oauth` entries, at boot), else EMPTY — never the file a previous turn could have written.
 * A `none`-mode `opencode auth login` therefore reaches no turn: an operator states the
 * credential in `OPENCODE_ENV`.
 */
export const OPENCODE_AUTH_CONTENT_KEY = 'OPENCODE_AUTH_CONTENT';
export const OPENCODE_NO_STORED_CREDENTIALS = '{}';

/** The entry kinds `OPENCODE_AUTH_CONTENT` may hold: credentials, never a configuration source. */
export const OPENCODE_AUTH_KINDS = Object.freeze(['api', 'oauth'] as const);

/** WHY an operator's `OPENCODE_AUTH_CONTENT` is refused, or null: a JSON object of credential entries only. */
export function opencodeAuthContentProblem(value: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return `${OPENCODE_AUTH_CONTENT_KEY} is not JSON (OPENCODE_ENV splits its pairs on ',': a value holding one cannot be carried there)`;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return `${OPENCODE_AUTH_CONTENT_KEY} is not a JSON object of credentials`;
  for (const [provider, entry] of Object.entries(parsed as Record<string, unknown>)) {
    const kind = (entry as { type?: unknown } | null)?.type;
    if (!(OPENCODE_AUTH_KINDS as readonly unknown[]).includes(kind)) {
      return (
        `${OPENCODE_AUTH_CONTENT_KEY}'s entry '${provider}' is of type ${JSON.stringify(kind ?? null)}, not one of ${JSON.stringify([...OPENCODE_AUTH_KINDS])}` +
        (kind === 'wellknown' ? ': a wellknown entry makes opencode fetch and merge a REMOTE configuration on every turn' : '')
      );
    }
  }
  return null;
}

/**
 * THE KEYS AN OPERATOR MAY HAND OPENCODE (`OPENCODE_ENV`) — AN ALLOWLIST: provider credentials,
 * and nothing else. opencode 1.18 reads ~80 `OPENCODE_*` keys (the census:
 * tests/fixtures/opencode_1.18.32_env_keys.json), many of them configuration sources or switches
 * (`OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR`, `OPENCODE_PERMISSION`, `OPENCODE_EXPERIMENTAL_*`,
 * `OPENCODE_MODELS_URL` …), and its runtime reads `NODE_OPTIONS`, `BUN_OPTIONS`, `LD_PRELOAD`: a
 * denylist would be one release behind. So a key passes only when it is
 *
 *   - one of the stated opencode credentials (`OPENCODE_API_KEY`, `OPENCODE_AUTH_CONTENT` — the
 *     latter is opencode's own credential store, inline); or
 *   - a credential by its NAME: `<PROVIDER>_API_KEY`, `_AUTH_TOKEN`, `_ACCESS_KEY_ID`,
 *     `_SECRET_ACCESS_KEY`, `_SESSION_TOKEN`.
 *
 * Ancillary provider keys (a region, a base URL, a project) are refused until added here with
 * their reason — a base URL is where the agent's traffic goes.
 */
export const OPENCODE_STATED_CREDENTIALS = Object.freeze(['OPENCODE_API_KEY', 'OPENCODE_AUTH_CONTENT'] as const);

const CREDENTIAL_NAME = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_(API_KEY|AUTH_TOKEN|ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN)$/;

export function isOpencodeCredentialKey(key: string): boolean {
  return (OPENCODE_STATED_CREDENTIALS as readonly string[]).includes(key) || CREDENTIAL_NAME.test(key);
}

/**
 * A configuration, HOME or search-path redirection — used only to EXPLAIN a refusal (the
 * allowlist above is what refuses): another configuration source, a HOME/XDG redirection, or PATH.
 */
export function isOpencodeRedirectionKey(key: string): boolean {
  return (
    key.startsWith('XDG_') ||
    key.startsWith('OPENCODE_CONFIG') ||
    key === 'OPENCODE_TEST_HOME' ||
    key === 'HOME' ||
    key === 'PATH' ||
    key === 'CLAUDE_CONFIG_DIR'
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * THE PLANT SCENARIO — what the driver's probe and the live probe both ask (pure: the I/O is
 * the caller's, the scenario and the verdict are spelled once, here)
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** The MCP server a probe states: a loopback address nothing listens on (the probe connects nowhere). */
export const PROBE_MCP: OpencodeMcp = Object.freeze({ name: 'dedalo_publication', url: 'http://127.0.0.1:9/mcp' });

/** The questions a probe asks the CLI about what it would LOAD, run in the canary workspace. */
export const OPENCODE_PROBE_QUESTIONS: readonly (readonly string[])[] = Object.freeze([
  Object.freeze(['debug', 'config']),
  Object.freeze(['debug', 'agent', 'build']),
  Object.freeze(['debug', 'skill']),
]);

/**
 * EVERY SOURCE THE RESTRICTION CLOSES, one canary each — measured on opencode 1.18.32: without the
 * switches each of these surfaces in the `debug` answers (a plugin by RUNNING), with them none does.
 */
export const OPENCODE_PLANT_SOURCES = Object.freeze([
  'project_instructions',
  'project_mcp',
  'project_agent',
  'project_tool',
  'project_plugin',
  'project_skill',
  'project_command',
  'claude_skill',
  'agents_skill',
] as const);

export type OpencodePlantSource = (typeof OPENCODE_PLANT_SOURCES)[number];

/** The canary tree, relative to the probe's scratch root: directories first, then files. */
export interface OpencodeCanaries {
  readonly dirs: readonly string[];
  readonly files: ReadonlyArray<readonly [string, string]>;
  /** The marker the canary PLUGIN writes into the workspace if it ever runs. */
  readonly pluginMarker: string;
  /** Where the probe states its brief — the one instruction file (`opencodeDaemonConfig`). */
  readonly brief: string;
}

/**
 * ONE CANARY PER SOURCE, EACH WITH ITS OWN TOKEN — so an answer names the SOURCE that leaked, and
 * one token can never stand in for another's. `ws/` is the canary workspace (the probe's cwd),
 * `home/` the fresh, empty HOME. The tokens are independent random words; NONE may occur in the
 * scratch root's path (refused here): a CLI echoes its cwd and HOME in its answers, and a token
 * inside a path would surface whatever the CLI loaded.
 */
export function opencodePlantCanaries(input: {
  readonly tokens: Readonly<Record<OpencodePlantSource, string>>;
  /** The absolute scratch root the tree is built under (checked against every token). */
  readonly root: string;
}): OpencodeCanaries {
  const { tokens } = input;
  for (const source of OPENCODE_PLANT_SOURCES) {
    const token = tokens[source];
    if (!/^[a-z][a-z0-9]{11,}$/.test(token)) throw new Error(`opencode probe: the ${source} token '${token}' is not a random lowercase word`);
    if (input.root.toLowerCase().includes(token)) throw new Error(`opencode probe: the ${source} token occurs in the scratch root '${input.root}'`);
    for (const other of OPENCODE_PLANT_SOURCES) {
      if (other !== source && (tokens[other].includes(token) || token.includes(tokens[other]))) {
        throw new Error(`opencode probe: the ${source} and ${other} tokens overlap`);
      }
    }
  }
  const plugin =
    `require('node:fs').writeFileSync(require('node:path').join(process.cwd(), '${tokens.project_plugin}.ran'), '1');\n` +
    `export default async () => ({});\n`;
  const skill = (token: string) => `---\nname: sk-${token}\ndescription: ${token}\n---\n${token}\n`;
  return {
    dirs: [
      'brief',
      'home/.config',
      'ws/.opencode/agent',
      'ws/.opencode/tool',
      'ws/.opencode/plugin',
      'ws/.opencode/command',
      `ws/.opencode/skills/sk-${tokens.project_skill}`,
      `ws/.claude/skills/sk-${tokens.claude_skill}`,
      `ws/.agents/skills/sk-${tokens.agents_skill}`,
    ],
    files: [
      // The project configuration: an instruction file and a local MCP server, each its own token.
      [
        'ws/opencode.json',
        JSON.stringify({
          instructions: [`${tokens.project_instructions}.md`],
          mcp: { [`m-${tokens.project_mcp}`]: { type: 'local', command: ['/bin/true'] } },
        }),
      ],
      [`ws/${tokens.project_instructions}.md`, `${tokens.project_instructions}\n`],
      // The project's own agent definition (overriding the builtin `build`).
      ['ws/.opencode/agent/build.md', `---\ndescription: ${tokens.project_agent}\n---\n${tokens.project_agent}\n`],
      // A project tool.
      [`ws/.opencode/tool/${tokens.project_tool}.ts`, `export default { description: '${tokens.project_tool}', args: {}, async execute() { return '' } };\n`],
      // A project plugin — CODE: it marks the workspace if it ever runs.
      [`ws/.opencode/plugin/${tokens.project_plugin}.js`, plugin],
      // A project command.
      [`ws/.opencode/command/${tokens.project_command}.md`, `---\ndescription: ${tokens.project_command}\n---\n${tokens.project_command}\n`],
      // Skills: the project's own, and the two foreign skill trees.
      [`ws/.opencode/skills/sk-${tokens.project_skill}/SKILL.md`, skill(tokens.project_skill)],
      [`ws/.claude/skills/sk-${tokens.claude_skill}/SKILL.md`, skill(tokens.claude_skill)],
      [`ws/.agents/skills/sk-${tokens.agents_skill}/SKILL.md`, skill(tokens.agents_skill)],
      // The daemon's own brief, outside the workspace: the one instruction file it states.
      ['brief/opencode-brief.md', '# the site brief\n'],
    ],
    pluginMarker: `ws/${tokens.project_plugin}.ran`,
    brief: 'brief/opencode-brief.md',
  };
}

/**
 * THE ONE KEY THE PROBE ADDS TO A TURN'S ENVIRONMENT — and why it changes nothing it judges. A
 * `.opencode/plugin` directory makes opencode npm-install `@opencode-ai/plugin` into every
 * configuration directory BEFORE it answers (measured on 1.18.32: 70 s of npm retries against the
 * turn's closed proxy, per question). Offline, that install fails at once and the answer is the
 * same (the plugin is still listed, and RUNS); the probe never fetches anything from anywhere.
 */
export const OPENCODE_PROBE_OFFLINE_ENV: Readonly<Record<string, string>> = Object.freeze({ npm_config_offline: 'true' });

/** The probe's own statement: the daemon's configuration with the probe's brief as its one instruction file. */
export function opencodeProbeConfig(briefPath: string): string {
  return JSON.stringify(opencodeDaemonConfig(PROBE_MCP, [briefPath]));
}

/**
 * THE VERDICT on the CLI's answers — the problems, empty when the binary honours the restriction:
 *
 *   - per SOURCE: its token in any answer (or, for the plugin, the marker it wrote) — named;
 *   - THE VACUITY GUARD: a CLI that ignored the daemon's configuration also loads no canary, so the
 *     resolved configuration must carry the daemon's MCP server, every entry of its permission
 *     block, and EXACTLY its instruction list;
 *   - EXACTNESS: no MCP server but the daemon's, no agent and no command definition — what a source
 *     the switches do not close (a remote or account configuration) would add.
 *
 * `restricted: false` is the CONTROL leg's verdict: there every source must SURFACE, or the probe
 * cannot prove it closed on this binary.
 */
export function opencodePlantVerdict(input: {
  readonly tokens: Readonly<Record<OpencodePlantSource, string>>;
  readonly answers: readonly string[];
  /** `debug config`'s stdout, or null when it gave none. */
  readonly configAnswer: string | null;
  readonly pluginRan: boolean;
  /** The absolute brief path the probe stated (`opencodeProbeConfig`). */
  readonly brief: string;
  readonly restricted: boolean;
}): string[] {
  const text = input.answers.join('\n').toLowerCase();
  const surfaced = (source: OpencodePlantSource) => (source === 'project_plugin' ? input.pluginRan : text.includes(input.tokens[source]));
  if (!input.restricted) {
    const hidden = OPENCODE_PLANT_SOURCES.filter(source => !surfaced(source));
    return hidden.map(source => `cannot prove ${source} closed on this binary: even unrestricted, its canary never surfaced`);
  }
  const problems: string[] = [];
  for (const source of OPENCODE_PLANT_SOURCES) {
    if (surfaced(source)) {
      problems.push(source === 'project_plugin' ? 'it RAN a workspace plugin despite OPENCODE_PURE and --pure' : `it still loads ${source} (its canary surfaced)`);
    }
  }
  let resolved: {
    mcp?: Record<string, unknown>;
    permission?: Record<string, unknown>;
    instructions?: unknown;
    agent?: Record<string, unknown>;
    command?: Record<string, unknown>;
  } | null = null;
  if (input.configAnswer === null) problems.push(`'debug config' gave no answer to check the daemon's configuration against`);
  else {
    try {
      resolved = JSON.parse(input.configAnswer);
    } catch {
      problems.push(`'debug config' did not answer JSON`);
    }
  }
  if (resolved !== null && typeof resolved === 'object') {
    if (!resolved.mcp || !Object.hasOwn(resolved.mcp, PROBE_MCP.name)) {
      problems.push(`its resolved configuration lacks the daemon's MCP server (OPENCODE_CONFIG_CONTENT not honoured)`);
    }
    // EXACTLY the daemon's: a configuration source the switches do not close (a remote
    // `wellknown` or account-org configuration, a managed one) merges its own MCP servers — a LOCAL
    // one is a command opencode spawns — and agent or command definitions beside the daemon's.
    const extraMcp = Object.keys(resolved.mcp ?? {}).filter(name => name !== PROBE_MCP.name);
    if (extraMcp.length > 0) problems.push(`its resolved configuration adds MCP servers the daemon did not state (${extraMcp.join(', ')})`);
    for (const key of ['agent', 'command'] as const) {
      const defined = Object.keys(resolved[key] ?? {});
      if (defined.length > 0) problems.push(`its resolved configuration defines ${key}s the daemon did not state (${defined.join(', ')})`);
    }
    const permission = resolved.permission ?? {};
    const unstated = Object.entries(DENIED_PERMISSIONS)
      .filter(([key, value]) => permission[key] !== value)
      .map(([key]) => key);
    if (unstated.length > 0) problems.push(`its resolved configuration lacks the daemon's permission block (${unstated.join(', ')})`);
    if (JSON.stringify(resolved.instructions ?? null) !== JSON.stringify([input.brief])) {
      problems.push(`its resolved instructions are ${JSON.stringify(resolved.instructions ?? null)}, not exactly the daemon's brief`);
    }
  }
  return problems;
}
