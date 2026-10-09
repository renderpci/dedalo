/**
 * SPEC ↔ CODE — the two privilege-boundary controls are STATED in engineering/PUBLICATION_HOST_SPEC.md
 * §2 (items 5 and 6) and the package README, and ENFORCED in code. A stated rule needs a gate
 * (DEC-12): this holds the statements to the code, so neither the prose nor the control can
 * drift into "protects nothing" unseen.
 *
 *   - the media include's directive allowlist (src/rules/directives.ts) — what keeps the
 *     root-parsed include (sudo configtest, polkit reload) from being a root door;
 *   - pushed release code never runs as the agent user (src/exec.ts v2ScratchBoot starts the
 *     `<V2_UNIT>-scratch@<port>` unit; tests/exec.test.ts pins no named command runs Bun).
 *
 * And the §9 (`provision init`) statements a reader acts on: the two closed command sets'
 * sizes, the MODES rows, the artifact kinds and validators, the lock path and waits, and the
 * one polkit pair the host map adds to item 5.
 *
 * Reads repo files outside the package: a dev-time gate only.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initExec, provisionExec } from '../src/exec';
import { EXIT } from '../src/provision/cli';
import { HOST_MAP_UNIT, MODES, PUBHOST_GROUP } from '../src/provision/layout';
import { INIT_BASE, LOCK_WAIT_MS } from '../src/provision/lock';
import { ARTIFACT_KINDS, ARTIFACT_VALIDATORS } from '../src/provision/render/types';

const PACKAGE = join(import.meta.dir, '..');
const SPEC = readFileSync(join(PACKAGE, '..', '..', 'engineering', 'PUBLICATION_HOST_SPEC.md'), 'utf8');
const README = readFileSync(join(PACKAGE, 'README.md'), 'utf8');

/** Spec §2 numbered item `n` (`n. **…`), up to item n+1 or a blank line, whichever comes first. */
function specItem(n: number): string {
  const start = SPEC.indexOf(`\n${n}. **`);
  if (start === -1) throw new Error(`spec: no item "${n}. **" — the statement has nowhere to live`);
  const ends = [SPEC.indexOf(`\n${n + 1}. **`, start + 1), SPEC.indexOf('\n\n', start + 1)].filter(i => i !== -1);
  return SPEC.slice(start, ends.length > 0 ? Math.min(...ends) : undefined);
}

const ALLOWLIST_SENTENCE =
  'The media include the agent installs is checked against a closed directive allowlist ' +
  '(`publication/host_agent/src/rules/directives.ts`) before root parses it: no module load, no include, ' +
  'no log or piped directive, no path outside MEDIA_ROOT. What remains runs at request time as the ' +
  'web-server user, the trust §2.6 already gives the paired engine.';

describe('spec §2 states the privilege boundary the code enforces', () => {
  test('item 5 carries the allowlist sentence verbatim, and the file it names exists', () => {
    expect(specItem(5).replace(/\s+/g, ' ')).toContain(ALLOWLIST_SENTENCE);
    expect(existsSync(join(PACKAGE, 'src', 'rules', 'directives.ts'))).toBe(true);
  });

  test('item 5 states release code never runs as the agent, and no OPEN gap is left standing', () => {
    const item = specItem(5).replace(/\s+/g, ' ');
    expect(item).toContain('Pushed release code never runs as the agent user.');
    expect(item).toContain('`<v2 unit>-scratch@<port>`');
    expect(item).not.toContain('OPEN');
    // the code the sentence describes: a unit start, never a spawn of Bun (the config has no BUN_BIN)
    const exec = readFileSync(join(PACKAGE, 'src', 'exec.ts'), 'utf8');
    expect(exec).toContain("spawner.run([SYSTEMCTL, 'start', unit]");
    expect(exec).not.toMatch(/BUN_BIN/);
  });

  test('item 6 lists the allowlist among what the agent validates (directives.ts cites it)', () => {
    const item = specItem(6).replace(/\s+/g, ' ');
    expect(item).toContain('directive allowlist');
    expect(item).not.toContain('second-guess');
    expect(readFileSync(join(PACKAGE, 'src', 'rules', 'directives.ts'), 'utf8')).toContain('spec §2.6');
  });

  test('the README states both controls', () => {
    expect(README).toContain('`src/rules/directives.ts`');
    expect(README).toContain('`<V2_UNIT>-scratch@<port>`');
    expect(README).not.toMatch(/Open: the scratch template/);
  });
});

/** Spec §9 subsection `9.n`, up to the next `### ` heading. */
function specSubsection(n: number): string {
  const start = SPEC.indexOf(`\n### 9.${n} `);
  if (start === -1) throw new Error(`spec: no "### 9.${n}" — the statement has nowhere to live`);
  const end = SPEC.indexOf('\n### ', start + 1);
  return SPEC.slice(start, end === -1 ? undefined : end);
}

describe('spec §9 (provision init) states what the code is', () => {
  test('§9.3: the two closed command sets have the sizes the spec gives', () => {
    const text = specSubsection(3).replace(/\s+/g, ' ');
    expect(text).toContain(`\`provisionExec()\` is the closed set of **${Object.keys(provisionExec()).length}** commands`);
    expect(text).toContain(`\`initExec()\` is a separate closed set of **${Object.keys(initExec()).length}** commands`);
  });

  test('§9.4: every artifact kind and validator the table names is in the census', () => {
    const table = specSubsection(4);
    const kinds = [...table.matchAll(/^\| `([a-z0-9_]+)` \|/gm)].map(m => m[1]);
    expect(kinds).toEqual(['web_include', 'fpm_pool', 'nginx_map_include', 'host_map_unit', 'logrotate', 'logrotate_v1']);
    for (const kind of kinds) expect(ARTIFACT_KINDS as readonly string[]).toContain(kind as string);
    for (const validator of ['web', 'fpm']) expect(ARTIFACT_VALIDATORS as readonly string[]).toContain(validator);
  });

  test('§9.5: every MODES row the table lists is the layout.ts row, owner, group and mode', () => {
    const rows = [...specSubsection(5).matchAll(/^\| `([A-Za-z0-9]+)` \| (\w+) \| (\w+) \| (\d+) \|$/gm)];
    expect(rows.length).toBeGreaterThanOrEqual(17);
    for (const [, key, owner, group, mode] of rows) {
      const row = (MODES as Record<string, { owner: string; group: string; mode: number }>)[key as string];
      expect(row, `MODES.${key}`).toBeDefined();
      expect([key, row?.owner, row?.group, row?.mode.toString(8).padStart(4, '0')]).toEqual([key, owner, group, mode]);
    }
    expect(specSubsection(5)).toContain(`\`pubhost\` is the group \`${PUBHOST_GROUP}\``);
  });

  test('§9.6: the lock path, the wait and the busy exit are lock.ts / cli.ts', () => {
    const text = specSubsection(6).replace(/\s+/g, ' ');
    expect(text).toContain(`\`${INIT_BASE}/<instance>/init.lock\``);
    expect(text).toContain(`apply waits ${LOCK_WAIT_MS.instance / 1000} s`);
    expect(text).toContain(`check ends exit **${EXIT.BUSY} (busy)**`);
  });

  test('item 5 names the one polkit pair the host map adds, by its unit', () => {
    expect(specItem(5).replace(/\s+/g, ' ')).toContain(`\`start\` of \`${HOST_MAP_UNIT}.service\``);
  });
});

