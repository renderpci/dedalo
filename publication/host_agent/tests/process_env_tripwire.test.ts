/**
 * ONLY src/config.ts READS THE PROCESS ENVIRONMENT (Global Constraints). Every other module
 * receives configuration through `config`, so the schema stays the complete census of what
 * the agent can be tuned with. This gate is about READS only: what a child process inherits
 * (Bun.spawn without an explicit `env` passes the whole environment on) is the exec.ts gate's
 * law (Task 3), not this one's.
 * Comments count: a module that talks about process.env is one edit away from reading it.
 * Outside src/config.ts the global object (`globalThis`, and `global` / `self` used as it),
 * reflective reads (`Reflect.get*` / `Reflect.ownKeys`) and string-compiled code
 * (`eval`, `Function`) are banned outright: each reaches `process` without naming it.
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
  // Second review of 0b62da6b97: optional chaining, Bun's env by index/destructuring/alias,
  // a dynamic import of the process module.
  /\bprocess\s*\?\.\s*(?:env\b|\[)/,
  /\bBun\s*\?\.\s*env\b/,
  /\bBun\s*(?:\?\.\s*)?\[/,
  /\{[^}]*\benv\b[^}]*\}\s*=\s*(?:globalThis\s*\??\.\s*)?Bun\b/,
  /=\s*(?:globalThis\s*\??\.\s*)?Bun\s*(?:[;,)\n]|$)/m,
  /[(,]\s*Bun\s*[,)]/,
  /\bglobalThis\s*\?\.\s*(?:process|Bun)\b/,
  /\bglobalThis\s*(?:\.\s*Bun\s*\.\s*env\b)/,
  /\bimport\(\s*['"](?:node:)?process['"]\s*\)/,
  // Task 13 (phase-2 review): the global object in ANY form — `{ process } = globalThis`
  // needs no `.process` — so the bare identifier is banned outside src/config.ts; its
  // aliases `global` / `self` in every access, destructuring, aliasing or passing form;
  // reflective reads (Reflect.get / getOwnPropertyDescriptor / ownKeys, Reflect itself
  // aliased or destructured); and code compiled from a string (eval, Function).
  /\bglobalThis\b/,
  /\b(?:global|self)\s*(?:\??\.|\[)/,
  /\}\s*=\s*(?:global|self|Reflect)\b/,
  /(?<![=!<>])=\s*(?:global|self|Reflect)\s*(?:[;,)\n]|$)/m,
  /[(,]\s*(?:global|self)\s*[,)]/,
  /\bReflect\s*(?:\??\.\s*|\[\s*['"`])(?:get|ownKeys)/,
  /\beval\s*\(/,
  /\bFunction\s*\(/,
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
  'const t = process?.env.SERVICE_TOKEN;',
  "const t = process?.['env'];",
  'const t = Bun?.env.SERVICE_TOKEN;',
  "const t = Bun['env'].X;",
  "const t = Bun?.['env'];",
  'const { env } = Bun;',
  'const { env: e } = globalThis.Bun;',
  'const b = Bun;',
  'const b = Bun\nconst e = b.env',
  'const e = Object.entries(Bun);',
  'const p = globalThis?.process;',
  'const e = globalThis.Bun.env;',
  "const p = await import('node:process');",
  "const p = await import('process');",
  // Task 13 hardening: destructuring the global object, global aliases, reflective reads,
  // and code built from a string (each reaches `process` without ever spelling `.process`).
  'const { process: p } = globalThis;',
  'const { Bun: b } = globalThis;',
  'const g = globalThis;\nconst e = g.process.env;',
  "const e = Reflect.get(globalThis, 'process');",
  "const e = Reflect.get(p, 'env');",
  'const keys = Reflect.ownKeys(p);',
  "const d = Reflect.getOwnPropertyDescriptor(p, 'env');",
  "const e = Reflect?.get(p, 'env');",
  'const { get } = Reflect;',
  'const r = Reflect;',
  'const e = global.process.env;',
  'const { process: p } = global;',
  "const e = global['process'];",
  'const g = global;',
  'const e = self.process.env;',
  'const { process: p } = self;',
  "const e = self['Bun'];",
  'const e = Object.entries(self);',
  "const e = new Function('return process')();",
  "const e = Function('return this')().process;",
  "const e = eval('process');",
];
/** What other modules legitimately do with `process` — none may match. */
const INNOCENT = [
  'process.exit(1);',
  "process.on('SIGTERM', stop);",
  'process.exitCode = 2;',
  '// the child process exits before the parent process does',
  'const processed = 3;',
  "const child = Bun.spawn(['x'], { env: childEnv });",
  'const f = Bun.file(path);',
  "const h = new Bun.CryptoHasher('sha256');",
  "const m = await import('./config');",
  // src/provision/apply.ts names a local `self`; prose may say "global" or "self-signed".
  "const self = typeof process.geteuid === 'function' ? process.geteuid() : -1;",
  'if (stats.uid !== self) {',
  '// a global constraint, a self-signed CA',
  'const evaluated = evaluate(x);',
  'const fn = makeFunction(x);',
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
