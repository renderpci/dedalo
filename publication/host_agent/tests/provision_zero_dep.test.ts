/**
 * The zero-dependency law (Global Constraints): root-repo tests import the provisioner's
 * layout, hash, plan and renderers, so those modules may import only `node:` builtins, each
 * other, and src/instance/roots.ts — whose own imports must stay builtins plus type-only
 * (erased at runtime). Never zod, never schema.ts/apply.ts/cli.ts/exec.ts, never a package.
 */
import { expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const SRC = join(import.meta.dir, '..', 'src');
const PROVISION = join(SRC, 'provision');
const ZERO_DEP = [
  'layout.ts',
  'hash.ts',
  'plan.ts',
  // Task 9: render/engine_fragment.ts computes the pairing fact with the agent's import-free recipe.
  '../security/pairing.ts',
  // Task 9: the mTLS issuer (node:crypto + ./layout) — a root drill may import it without node_modules.
  'tls.ts',
  ...readdirSync(join(PROVISION, 'render'))
    .filter(name => name.endsWith('.ts'))
    .map(name => `render/${name}`),
];
/** The ONE module outside provision/ a zero-dep module may import (src-relative). */
const ALLOWED_OUTSIDE = ['instance/roots.ts'];
const IMPORT = /^\s*(?:import|export)\b([^'"]*?)from\s+['"]([^'"]+)['"]/gm;

test('layout, hash, plan, render/* and security/pairing import only node: builtins, each other and instance/roots', () => {
  const offenders: string[] = [];
  for (const file of ZERO_DEP) {
    const source = readFileSync(join(PROVISION, file), 'utf8');
    for (const match of source.matchAll(IMPORT)) {
      const specifier = match[2] ?? '';
      if (specifier.startsWith('node:')) continue;
      if (specifier.startsWith('.')) {
        const target = `${relative(SRC, resolve(dirname(join(PROVISION, file)), specifier))}.ts`;
        if (ZERO_DEP.map(f => relative(SRC, join(PROVISION, f))).includes(target) || ALLOWED_OUTSIDE.includes(target)) continue;
      }
      offenders.push(`${file} → ${specifier}`);
    }
  }
  expect(offenders).toEqual([]);
  expect(ZERO_DEP).toContain('render/types.ts');
  expect(ZERO_DEP).toContain('render/env.ts');
  expect(ZERO_DEP).toContain('render/engine_fragment.ts');
});

test('instance/roots.ts imports only node: builtins and type-only modules', () => {
  const source = readFileSync(join(SRC, 'instance', 'roots.ts'), 'utf8');
  const offenders: string[] = [];
  for (const match of source.matchAll(IMPORT)) {
    const clause = match[1] ?? '';
    const specifier = match[2] ?? '';
    if (specifier.startsWith('node:')) continue;
    if (/^\s*type\b/.test(clause)) continue;
    offenders.push(specifier);
  }
  expect(offenders).toEqual([]);
  expect(source).toContain("from '../config'"); // anti-vacuity: the one type-only import is seen
});
