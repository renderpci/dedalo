/**
 * SPEC ↔ CODE — the two privilege-boundary controls are STATED in engineering/PUBLICATION_HOST_SPEC.md
 * §2 (items 5 and 6) and the package README, and ENFORCED in code. A stated rule needs a gate
 * (DEC-12): this holds the statements to the code, so neither the prose nor the control can
 * drift into "protects nothing" unseen.
 *
 *   - the media include's directive allowlist (src/rules/directives.ts) — what keeps the
 *     root-parsed include (sudo configtest, polkit reload) from being a root door;
 *   - pushed release code never runs as the agent user (src/exec.ts v2ScratchBoot starts the
 *     `<V2_UNIT>-scratch@<port>` unit; tests/exec.test.ts pins no named command runs BUN_BIN).
 *
 * Reads repo files outside the package: a dev-time gate only.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
    // the code the sentence describes: a unit start, never a spawn of BUN_BIN
    const exec = readFileSync(join(PACKAGE, 'src', 'exec.ts'), 'utf8');
    expect(exec).toContain("spawner.run([SYSTEMCTL, 'start', unit]");
    expect(exec).not.toMatch(/BUN_BIN,\s*'run'/);
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
