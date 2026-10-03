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

  test('the gate is not vacuous: src/config.ts does read it', () => {
    const body = readFileSync(join(SRC, ALLOWED), 'utf8');
    expect(READS_ENV[0]!.test(body)).toBe(true);
  });
});
