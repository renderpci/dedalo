/**
 * LEAD-1b — THE polkit FLOOR: the daemon's only authority over its runs (stop, kill) is a
 * JavaScript `rules.d` rule, which polkit reads from 0.106. 0.105 (Ubuntu 22.04) ignores it
 * silently: runs still start, every stop is denied, and a run that will not exit quarantines
 * its site until RuntimeMaxSec. The plan refuses such a host by name — and an unreadable
 * polkit — instead of converging on a grant that does not exist.
 */

import { describe, expect, test } from 'bun:test';
import { agentPlan, type HostState, parsePolkitVersion, POLKIT_JS_RULES_FLOOR } from '../src/provision/plan';
import { gateInstance } from './support/lead1b_contract';

const hostAt = (polkitVersion: number | null | undefined): HostState =>
  ({
    users: [],
    groups: [],
    entries: {},
    unitEnabled: false,
    unitActive: false,
    pid1Version: 255,
    ...(polkitVersion === undefined ? {} : { polkitVersion }),
  }) as unknown as HostState;

function verdict(polkitVersion: number | null | undefined): string {
  const { layout } = gateInstance('museo', ['alpha']);
  try {
    agentPlan(layout, hostAt(polkitVersion));
    return 'planned';
  } catch (error) {
    return String((error as Error).message);
  }
}

describe('the polkit floor — the rendered rule must be one polkit reads', () => {
  test('the floor is the release JavaScript rules arrived in', () => {
    expect(POLKIT_JS_RULES_FLOOR).toBe(106);
  });

  test('`pkaction --version` normalises across the 0.x → integer renumbering', () => {
    expect(
      ['pkaction version 0.105', 'pkaction version 0.106', 'pkaction version 0.120', 'pkaction version 124\n', 'pkaction version 126', 'no version here', ''].map(
        parsePolkitVersion,
      ),
    ).toEqual([105, 106, 120, 124, 126, null, null]);
  });

  test('0.105 (Ubuntu 22.04) is refused by name; unreadable is refused; 106, 0.117 (RHEL 9), 122 (Debian 12), 124 (Ubuntu 24.04) plan', () => {
    expect(verdict(105)).toContain('polkit is 0.105, which reads only .pkla files');
    expect(verdict(null)).toContain("polkit's release could not be read");
    // …and says how to fix it: a server/minimal Debian 12 or Ubuntu install lacks the package (round 5).
    expect(verdict(null)).toContain('apt install polkitd');
    expect(verdict(null)).toContain('dnf install polkit');
    for (const version of [106, 117, 122, 124]) expect({ version, verdict: verdict(version) }).toEqual({ version, verdict: 'planned' });
    // A hand-built state (no observation) is not refused on it — the same law as pid1Version.
    expect(verdict(undefined)).toBe('planned');
  });
});
