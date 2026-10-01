/**
 * THE CLAUDE CODE TURN'S ARGV, and what a binary's `--help` must list for it — a builtin-only
 * leaf (no config, no I/O), so the driver, the gates and the live probe
 * (`deploy/probes/claude_plant_probe.ts`, run on a host with no daemon configuration) render
 * the SAME argv. Why each flag is there: `claude_code.ts` header (PLANT).
 */

/**
 * THE TOOLS A SITE BUILD NEEDS, and the complete set this driver grants.
 *
 * Read, Write, Edit and Glob/Grep are the whole of "build a website in this directory"; the
 * MCP server is the one door to museum data and is named as a wildcard so the publication
 * API's tool list can grow without this constant becoming a second census of it.
 */
export const ALLOWED_TOOLS: readonly string[] = Object.freeze([
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'TodoWrite',
  'mcp__dedalo_publication',
]);

/**
 * THE TOOLS NO SITE BUILD MAY HAVE, whatever the allow list or a future default says.
 *
 * Bash is arbitrary execution — the confinement makes that a bounded uid rather than a
 * bounded capability, and a museum's site builder has no legitimate use for it. WebFetch
 * and WebSearch are the outbound half of a disclosure: everything the read tools can reach
 * becomes exfiltrable the moment the agent can address a URL of its own choosing.
 */
export const DENIED_TOOLS: readonly string[] = Object.freeze(['Bash', 'WebFetch', 'WebSearch']);

/**
 * THE DAEMON'S SETTINGS — the one settings source a turn loads (`--settings`, a JSON string in
 * the argv: no file anyone could replace). Minimal on purpose: in `-p` mode a settings source
 * that fails the CLI's validation is SILENTLY IGNORED (its own --help says so; measured: an
 * invalid `permissions` value un-disabled every planted hook), so nothing goes here that is not
 * a documented key with a boolean value.
 */
export const DAEMON_SETTINGS: Readonly<Record<string, boolean>> = Object.freeze({
  disableAllHooks: true,
  enableAllProjectMcpServers: false,
});

/**
 * The brief rides the argv, and Linux caps ONE argv string at MAX_ARG_STRLEN (128 KiB). Below
 * it, with room to spare; a longer AGENTS.md is cut and the cut is STATED in the brief itself.
 */
export const MAX_BRIEF_BYTES = 96 * 1024;

/** What one turn's argv is built from. */
export interface ClaudeTurnInput {
  readonly bin: string;
  readonly prompt: string;
  readonly mcpConfigPath: string;
  /** The site's AGENTS.md, read by the daemon (no project memory is loaded by the CLI). */
  readonly brief?: string;
  readonly resumeToken?: string;
}

/**
 * THE TURN'S ARGV — pure, so a gate renders it. Every source of configuration is named here
 * (see the header), and the prompt comes LAST, after `--`: it is a positional argument and
 * nothing it says can be read as an option.
 */
export function claudeTurnArgv(input: ClaudeTurnInput): string[] {
  const argv = [
    input.bin,
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    'acceptEdits',
    '--max-turns',
    '50',
    // NO user, project or local source: nothing the agent can write is configuration.
    '--setting-sources',
    '',
    '--settings',
    JSON.stringify(DAEMON_SETTINGS),
    '--strict-mcp-config',
    '--mcp-config',
    input.mcpConfigPath,
    '--allowedTools',
    ALLOWED_TOOLS.join(','),
    '--disallowedTools',
    DENIED_TOOLS.join(','),
  ];
  if (input.brief !== undefined && input.brief.length > 0) argv.push('--append-system-prompt', input.brief);
  if (input.resumeToken) argv.push('--resume', input.resumeToken);
  argv.push('--', input.prompt);
  return argv;
}

/**
 * THE FLAGS THE ARGV PASSES THAT `--help` DOES NOT LIST — each with its reason. Exempt from the
 * probe, never from the argv. Everything else the argv names must be listed, or no turn runs.
 */
export const UNLISTED_FLAGS: Readonly<Record<string, string>> = Object.freeze({
  '--max-turns':
    'hidden in 2.x (--help does not list it); it bounds cost, not confinement, and a CLI that ' +
    'does not know it errors "unknown option" (commander) rather than running unbounded.',
});

/**
 * Every option a `--help` text DEFINES: the leading `-x, --long` of an option line (indented
 * at most four columns). Description and continuation lines are indented further, so a flag a
 * description merely MENTIONS ("add --strict-mcp-config to skip MCP servers too") is never
 * counted as defined.
 */
export function listedFlags(help: string): Set<string> {
  const flags = new Set<string>();
  for (const line of help.split('\n')) {
    const match = /^ {1,4}(-{1,2}[A-Za-z][\w-]*(?:,\s*-{1,2}[A-Za-z][\w-]*)*)/.exec(line);
    if (!match) continue;
    for (const flag of (match[1] as string).split(/,\s*/)) flags.add(flag);
  }
  return flags;
}

/** The options an argv names: every `-` token before the `--` that ends them. */
export function argvFlags(argv: readonly string[]): string[] {
  const end = argv.indexOf('--');
  return [...new Set((end < 0 ? argv : argv.slice(0, end)).filter(token => token.startsWith('-')))];
}

/**
 * THE FLAGS A TURN REQUIRES, derived from the argv itself (every optional branch on) — so a
 * flag added to the argv is a flag the probe demands, with no second list to forget.
 */
export function requiredCliFlags(): string[] {
  const reference = claudeTurnArgv({
    bin: 'claude',
    prompt: 'probe',
    mcpConfigPath: '/probe/mcp.json',
    brief: 'probe',
    resumeToken: 'probe',
  });
  return argvFlags(reference.slice(1)).filter(flag => !(flag in UNLISTED_FLAGS));
}
