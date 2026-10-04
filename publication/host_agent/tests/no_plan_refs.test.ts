/**
 * src/ cites only what ships: the implementation plan lives in a gitignored directory that
 * is on no clone and no host, so a "Task N" / "deviation N" citation — worse, one inside an
 * operator-facing refusal — is a dead reference. Cite the spec section or the owning module.
 */
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(import.meta.dir, '..', 'src');
const PLAN_REF: readonly RegExp[] = [/\bTasks? \d+/, /\bdeviation \d+/i, /\brewrite\//, /recorded in the plan/];

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return tsFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

describe('no plan references in src/', () => {
  test('no src/ file cites the internal plan', () => {
    const hits = tsFiles(SRC).flatMap(file =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, at: `${relative(SRC, file)}:${i + 1}` }))
        .filter(({ line }) => PLAN_REF.some(p => p.test(line)))
        .map(({ at, line }) => `${at}: ${line.trim()}`),
    );
    expect(hits).toEqual([]);
  });

  test.each(['(Task 1 deviation 1)', 'Tasks 8/9', 'see rewrite/plans/x.md', 'deviation recorded in the plan'])(
    'the gate catches %p',
    snippet => {
      expect(PLAN_REF.some(p => p.test(snippet))).toBe(true);
    },
  );
});
