/**
 * THE EGRESS CENSUS (spec S7, §9): the agent package's TypeScript never fetches from the
 * internet. Exactly these files may open an outbound connection, each with its reason; any other
 * file under src/ that does is red. Bun is downloaded by deploy/install.sh (curl), never by TS.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(import.meta.dir, '..', 'src');

/** Files allowed to send a request, with their reason. */
const EGRESS: Readonly<Record<string, string>> = {
  'boot.ts': 'claimListenTarget: Bun.connect to its OWN listen target (socket or TLS_HOST:port) before binding it',
  'releases/install.ts': "the v2 scratch boot's health probe (loopback, the release under test)",
  'provision/init/verify.ts': "B4: the agent's own /health, at AGENT_BASE_PATH on the declared listener (spec §6)",
};

/** Every way to reach the network from Bun/Node code without naming `fetch(` plainly. */
const EGRESS_PATTERNS: readonly RegExp[] = [
  /\bfetch\s*\(/,
  /[=(]\s*fetch\s*[;,)\n]/, // aliasing or passing the global (`const f = fetch;`, `run(fetch)`)
  /\bglobalThis\s*(\?\.|\.)\s*fetch\b/,
  /\[\s*['"`]fetch['"`]\s*\]/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bEventSource\b/,
  /from\s+['"`]node:(https?|http2|tls|dgram|dns)['"`]/,
  /require\s*\(\s*['"`]node:(https?|http2|net|tls|dgram|dns)['"`]\s*\)/,
  // node:net only for its connecting exports (isIP & co. are pure parsers).
  /import\s*\{[^}]*\b(connect|createConnection|Socket)\b[^}]*\}\s*from\s*['"`]node:net['"`]/,
  /import\s+(\*\s+as\s+)?[\w$]+\s+from\s*['"`]node:net['"`]/,
  /\bBun\s*(\?\.|\.)\s*(connect|udpSocket)\b/,
];

const BYPASSES = [
  "await fetch('https://example.org');",
  'const f = fetch;',
  "globalThis.fetch('x');",
  "globalThis['fetch']('x');",
  'new WebSocket(url);',
  "import https from 'node:https';",
  "import { connect } from 'node:net';",
  "import * as net from 'node:net';",
  'run(fetch);',
  "const h = require('node:http');",
  'await Bun.connect({ hostname, port });',
  'Bun.udpSocket({});',
  'new XMLHttpRequest();',
];

const INNOCENT = [
  'const server = Bun.serve(options);',
  '// fetched releases are verified',
  'const prefetch = 1;',
  "import { join } from 'node:path';",
  "import type { Server } from 'bun';",
  "import { isIP, isIPv4 } from 'node:net';",
  'export function startServer(cfg: ListenConfig, fetch: FetchHandler): AgentServer {',
  'const common = { idleTimeout: 0, fetch };',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

/** The source without comments: a doc line naming fetch() is not a request. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

describe('the egress census', () => {
  test('no src/ file outside the census reaches the network', () => {
    const offenders = sourceFiles(SRC)
      .map(file => relative(SRC, file))
      .filter(file => !(file in EGRESS))
      .filter(file => EGRESS_PATTERNS.some(pattern => pattern.test(code(readFileSync(join(SRC, file), 'utf8')))));
    expect(offenders).toEqual([]);
  });

  test.each(BYPASSES)('the gate catches %p', snippet => {
    expect(EGRESS_PATTERNS.some(pattern => pattern.test(code(snippet)))).toBe(true);
  });

  test.each(INNOCENT)('the gate lets %p through', snippet => {
    expect(EGRESS_PATTERNS.some(pattern => pattern.test(code(snippet)))).toBe(false);
  });

  test('anti-vacuity: the gate sees every census member that exists today', () => {
    for (const file of ['releases/install.ts', 'boot.ts']) {
      const body = code(readFileSync(join(SRC, file), 'utf8'));
      expect(EGRESS_PATTERNS.some(pattern => pattern.test(body))).toBe(true);
    }
  });

  test("verify.ts (once it exists) builds its URL from AGENT_BASE_PATH, never a literal host", () => {
    const verify = join(SRC, 'provision', 'init', 'verify.ts');
    if (!existsSync(verify)) return; // P7 lands it; until then the census entry admits nothing
    const body = code(readFileSync(verify, 'utf8'));
    expect(body).toContain('AGENT_BASE_PATH');
    expect(body).not.toMatch(/fetch\s*\(\s*['"`]https?:\/\/(?!localhost)/);
  });
});
