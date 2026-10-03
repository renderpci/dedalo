/**
 * ONLY src/config.ts READS THE PROCESS ENVIRONMENT (Global Constraints). Every other module
 * receives configuration through `config`, so the schema stays the complete census of what
 * the agent can be tuned with, and a child process never inherits a value nobody declared.
 * Comments count: a module that talks about process.env is one edit away from reading it.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(import.meta.dir, '..', 'src');
const ALLOWED = 'config.ts';
const READS_ENV = [
  /\bprocess\.env\b/,
  /\bprocess\s*\[/,
  /\bBun\.env\b/,
  /\bimport\.meta\.env\b/,
  /from\s+['"](?:node:)?process['"]/,
  /require\(\s*['"](?:node:)?process['"]\s*\)/,
  // Indirect reads (review of 3240fc9c10): destructuring, aliasing, globalThis, passing it on.
  /\{[^}]*\benv\b[^}]*\}\s*=\s*(?:globalThis\s*\.\s*)?process\b/,
  /=\s*(?:globalThis\s*\.\s*)?process\s*(?:[;,)\n]|$)/m,
  /\bglobalThis\s*(?:\.\s*process\b|\[)/,
  /[(,]\s*process\s*[,)]/,
];

/** Every way of reaching the environment the gate claims to catch — each must match. */
const BYPASSES = [
  'const x = process.env.SERVICE_TOKEN;',
  "const x = process['env'];",
  'const x = Bun.env.SERVICE_TOKEN;',
  'const x = import.meta.env.SERVICE_TOKEN;',
  "import { env } from 'node:process';",
  "const p = require('process');",
  'const { env } = process;',
  'const { env: e } = globalThis.process;',
  'const p = process;',
  'const p = process\nconst e = p.env',
  'let p; p = globalThis.process;',
  "const e = globalThis['process'];",
  "const e = Reflect.get(process, 'env');",
  'const e = Object.entries(process);',
];
/** What other modules legitimately do with `process` — none may match. */
const INNOCENT = [
  'process.exit(1);',
  "process.on('SIGTERM', stop);",
  'process.exitCode = 2;',
  '// the child process exits before the parent process does',
  'const processed = 3;',
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (entry.name.endsWith('.ts')) out.push(path);
  }
  return out;
}

describe('process environment confinement', () => {
  test('no src/ module other than src/config.ts reads the process environment', () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThanOrEqual(3);
    const offenders = files
      .map(file => relative(SRC, file))
      .filter(rel => rel !== ALLOWED)
      .filter(rel => {
        const body = readFileSync(join(SRC, rel), 'utf8');
        return READS_ENV.some(pattern => pattern.test(body));
      });
    expect(offenders).toEqual([]);
  });

  test.each(BYPASSES)('the gate catches %p', snippet => {
    expect(READS_ENV.some(pattern => pattern.test(snippet))).toBe(true);
  });

  test.each(INNOCENT)('the gate lets %p through', snippet => {
    expect(READS_ENV.some(pattern => pattern.test(snippet))).toBe(false);
  });

  test('the gate is not vacuous: src/config.ts does read it', () => {
    const body = readFileSync(join(SRC, ALLOWED), 'utf8');
    expect(READS_ENV[0]!.test(body)).toBe(true);
  });
});
