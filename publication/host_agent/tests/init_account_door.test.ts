/**
 * THE ACCOUNT AND BOOLEAN DOOR (spec §9 package gates, D2, S9): accounts are created and
 * SELinux booleans set by `provision init` ONLY, after confirmation, through one file —
 * src/provision/init/act.ts. A call of the InitExec creators (`groupAdd`, `userAddOwnGroup`,
 * `userAddInGroup`) or of `setsebool` anywhere else in src/ is red; exec.ts (the one spawning
 * file, which DEFINES them) and exec_contract.ts (which DECLARES them) are the only other
 * places the names may appear. `provision check|apply` (plan.ts, apply.ts, cli.ts) never even
 * import initExec: apply never creates an account, never sets a boolean.
 *
 * Measured on call sites (`.name(`), not spellings: a renamed caller is still a call.
 */
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(import.meta.dir, '..', 'src');
const DOOR = 'provision/init/act.ts';
const DEFINERS = ['exec.ts', 'provision/exec_contract.ts'];
const CREATORS = ['groupAdd', 'userAddOwnGroup', 'userAddInGroup', 'setsebool'] as const;
const NEVER_INIT_EXEC = ['provision/plan.ts', 'provision/apply.ts', 'provision/cli.ts'];

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return tsFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

/** `.name(`, `.name?.(`, `['name'](`, and a destructured `{ name }` — every way to reach the member. */
function reaches(source: string, name: string): boolean {
  return new RegExp(`(?:\\.\\s*${name}\\s*(?:\\?\\.)?\\(|\\[\\s*['"\`]${name}['"\`]\\s*\\]|\\{[^}]*\\b${name}\\b[^}]*\\}\\s*=)`).test(source);
}

const files = tsFiles(SRC).map(file => ({ rel: relative(SRC, file), source: readFileSync(file, 'utf8') }));

describe('only init/act.ts creates accounts and sets booleans', () => {
  for (const name of CREATORS) {
    test(`${name}: called from ${DOOR} only`, () => {
      const callers = files.filter(f => !DEFINERS.includes(f.rel) && reaches(f.source, name)).map(f => f.rel);
      expect(callers).toEqual([DOOR]);
    });
  }

  test('the detector sees every form (anti-vacuity)', () => {
    expect(reaches('ctx.exec.groupAdd(name)', 'groupAdd')).toBe(true);
    expect(reaches('exec?.setsebool?.(n, true)', 'setsebool')).toBe(true);
    expect(reaches("exec['userAddInGroup'](a, b, c)", 'userAddInGroup')).toBe(true);
    expect(reaches('const { userAddOwnGroup } = exec;', 'userAddOwnGroup')).toBe(true);
    expect(reaches('// mentions groupAdd in prose', 'groupAdd')).toBe(false);
  });
});

describe('provision check|apply never reach initExec', () => {
  for (const rel of NEVER_INIT_EXEC) {
    test(rel, () => {
      const source = files.find(f => f.rel === rel)?.source;
      expect(source).toBeDefined();
      expect(/\binitExec\b/.test(source as string)).toBe(false);
      for (const name of CREATORS) expect(reaches(source as string, name)).toBe(false);
    });
  }
});
