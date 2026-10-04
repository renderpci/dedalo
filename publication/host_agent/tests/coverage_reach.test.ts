/**
 * COVERAGE REACH: bunfig.toml's coverageThreshold is enforced PER FILE, but only on the
 * files a test LOADS IN-PROCESS — a src/ module no test imports never appears in the
 * coverage table and stays green at 0%. So every src/**\/*.ts must be reached by the
 * static import graph rooted at tests/, or sit on EXEMPT with the gate that measures it.
 * The exemption list is exact: an exempt file that becomes reached is red too.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const PACKAGE_DIR = join(import.meta.dir, '..');
const SRC = join(PACKAGE_DIR, 'src');
const TESTS = import.meta.dir;

/** src/ files measured outside the in-process coverage table, each with its reason. */
const EXEMPT: Record<string, string> = {
  'index.ts':
    'the process entry: top-level boot + signal wiring run only in a subprocess (tests/index_process.test.ts)',
};

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return tsFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

const transpiler = new Bun.Transpiler({ loader: 'ts' });

function resolveLocal(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(from), spec);
  for (const candidate of [base, `${base}.ts`, join(base, 'index.ts')]) {
    if (candidate.endsWith('.ts') && existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Every file reachable from `roots` through static and literal dynamic imports. */
function reachable(roots: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...roots];
  while (stack.length > 0) {
    const file = stack.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const { path } of transpiler.scanImports(readFileSync(file, 'utf8'))) {
      const target = resolveLocal(file, path);
      if (target) stack.push(target);
    }
  }
  return seen;
}

describe('coverage reach', () => {
  const sources = tsFiles(SRC).map(file => relative(SRC, file));
  const reached = new Set(
    [...reachable(tsFiles(TESTS))].filter(f => f.startsWith(`${SRC}/`)).map(f => relative(SRC, f)),
  );

  test('the gate is not vacuous: it sees src/ and reaches most of it', () => {
    expect(sources.length).toBeGreaterThanOrEqual(10);
    expect(reached.size).toBeGreaterThanOrEqual(sources.length - Object.keys(EXEMPT).length);
  });

  test('every src/ module is loaded in-process by some test, or exempt by name', () => {
    const unreached = sources.filter(file => !reached.has(file)).sort();
    expect(unreached).toEqual(Object.keys(EXEMPT).sort());
  });

  test('every exemption names a real src/ file and a reason', () => {
    for (const [file, reason] of Object.entries(EXEMPT)) {
      expect(sources).toContain(file);
      expect(reason.length).toBeGreaterThan(20);
    }
  });
});
