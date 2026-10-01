/**
 * LEAD-1b G16 (commit C3) — TWO MUSEUMS NEVER REACH, OR BECOME, EACH OTHER’S SITE IDENTITIES.
 *
 * Written BEFORE the implementation (audits/2026-09-26_full/LEAD-1b_SPEC.md §6); every row
 * is red on the pre-LEAD-1b HEAD, and says why.
 *
 * The rule of one museum must not answer YES for another's units, and an adopted service
 * identity must not be able to BE another museum's site identity. The instance pair `ab` /
 * `ab-agent` is the case a prefix-only rule gets wrong: `dedalo-site-ab-agent-` is a PREFIX
 * of `dedalo-site-ab-agent-agent-`, so today `ab`'s rule answers YES (stop, kill) for
 * `ab-agent`'s units.
 *
 * Written red-first against 75ccb35a38 (the pre-LEAD-1b HEAD); parked as `.gate.ts` until
 * the implementation it gates landed, and renamed into the suite by that same change.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import {
  AGENT_USER_PREFIX,
  MAX_INSTANCE_LENGTH,
  MAX_USERNAME_LENGTH,
  UNIX_NAME_PATTERN,
  USER_PREFIX,
} from '../src/provision/layout';
import { fleetViolations } from '../src/provision/fleet';
import { contractExport, DOORS, gateInstance, gateManifestDoc, loadRule, renderAgentRule, sweepScratch, unitNamesFor } from './support/lead1b_contract';

afterEach(sweepScratch);

const IDENTITY = 'drivers/agent_identity.ts';

/** The property sample (spec G1): the collision-prone pairs plus the longest legal name. */
const LONGEST = 'a' + 'bcdefghijklmnopqrs'.slice(0, MAX_INSTANCE_LENGTH - 1);
const INSTANCES = ['ab', 'ab-agent', 'museo', 'museo-2', 'x1', 'a1-2', LONGEST] as const;
const ORDINALS = [1, 9, 10, 99, 100, 999] as const;

type NameFn = (instance: string, k: number) => string;
type ParseFn = (name: string) => { instance: string; ordinal: number } | null;

async function identityLeaf(): Promise<{ name: NameFn; parse: ParseFn; max: number }> {
  return {
    name: await contractExport<NameFn>(IDENTITY, 'agentIdentityName'),
    parse: await contractExport<ParseFn>(IDENTITY, 'parseAgentIdentityName'),
    max: await contractExport<number>(IDENTITY, 'MAX_AGENT_ORDINAL'),
  };
}

describe('G16 — two museums never reach, or become, each other’s site identities', () => {
  const ab = () => gateInstance('ab', ['one', 'two']);
  const abAgent = () => gateInstance('ab-agent', ['one', 'two']);

  test('control: the pair really is the prefix-overlap case', () => {
    expect(abAgent().layout.agentUnitPrefix.startsWith(ab().layout.agentUnitPrefix)).toBe(true);
  });

  test('control: each museum’s rule answers YES for its own declared units (stop, kill)', async () => {
    for (const gate of [ab(), abAgent()]) {
      const ask = await loadRule(await renderAgentRule(gate));
      for (const [, k] of gate.identities) {
        for (const door of DOORS) {
          for (const verb of ['stop', 'kill']) {
            const unit = `${gate.layout.agentUnitPrefix}s${k}-${door}@3-100-999.service`;
            expect({ unit, verb, answer: ask({ user: gate.layout.identity.user, unit, verb }) }).toEqual({
              unit,
              verb,
              answer: 'YES',
            });
          }
        }
      }
    }
  });

  test('neither museum’s rule answers YES for ANY unit of the other', async () => {
    const leaks: string[] = [];
    for (const [owner, other] of [
      [ab(), abAgent()],
      [abAgent(), ab()],
    ] as const) {
      const ask = await loadRule(await renderAgentRule(owner));
      for (const k of [1, 2, 3]) {
        for (const door of DOORS) {
          for (const verb of ['stop', 'kill', 'start']) {
            const unit = `${other.layout.agentUnitPrefix}s${k}-${door}@3-100-999.service`;
            const answer = ask({ user: owner.layout.identity.user, unit, verb });
            if (answer !== 'NOT_HANDLED') leaks.push(`${owner.layout.instance}'s rule: ${verb} ${unit} → ${answer}`);
          }
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  test('identities and private groups of the two are disjoint for every ordinal', async () => {
    const name = await contractExport<NameFn>(IDENTITY, 'agentIdentityName');
    const left = new Set<string>();
    for (let k = 1; k <= 999; k++) left.add(name('ab', k));
    const shared: string[] = [];
    for (let k = 1; k <= 999; k++) if (left.has(name('ab-agent', k))) shared.push(name('ab-agent', k));
    expect(shared).toEqual([]);
  });

  test('an ADOPTED service identity that IS another museum’s site identity is a fleet violation', async () => {
    const name = await contractExport<NameFn>(IDENTITY, 'agentIdentityName');
    const stolen = name('ab', 1);
    const victim = ab();
    const doc = gateManifestDoc('cd', ['three']);
    doc.identity = { user: stolen, group: stolen };
    const thief = gateInstance('cd', ['three'], doc);
    const violations = fleetViolations({ layouts: [victim.layout, thief.layout] });
    expect(violations.some(violation => violation.shared === stolen || violation.message.includes(stolen))).toBe(true);
  });

  test('control: a duplicated instance is reported (the census still runs)', () => {
    const violations = fleetViolations({ layouts: [ab().layout, ab().layout] });
    expect(violations.some(violation => violation.kind === 'instance')).toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * ROOT'S `systemctl stop` GLOBS stay inside their museum
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('G16 — root’s stop globs never reach another museum’s units (`ab` / `ab-agent-s2`)', () => {
  /**
   * A glob is not a regex: the rule's anchored regexes are safe for the reason `fleet.ts`
   * states, but `systemctl stop '<prefix>s2-*@*.service'` as root expands its `*` across the
   * boundary — `dedalo-site-ab-agent-s2-*` matches `ab-agent-s2`'s
   * `dedalo-site-ab-agent-s2-agent-s1-turn@…`. Every glob the plan, the removal and the
   * migration spell (per-door runs, the pre-LEAD-1b transient names) is matched, with
   * fnmatch semantics, against EVERY unit of the other museum — both ways round.
   */
  const pairs = [
    ['ab', 'ab-agent-s2'],
    ['ab', 'ab-agent-a'],
    ['museo', 'museo-agent-s1'],
  ] as const;

  async function unitsOf(instance: string): Promise<string[]> {
    const { INSTANCE_SPELLINGS } = await import('./support/lead1b_contract');
    const leaf = await import('../src/drivers/agent_identity');
    const prefix = gateInstance(instance, ['one']).layout.agentUnitPrefix;
    const out: string[] = [`${prefix}0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0.service`];
    for (const k of [1, 2, 3, 10]) {
      for (const door of DOORS) {
        const names = leaf.agentUnitNames(prefix, k, door);
        out.push(names.socket, names.target, names.template, ...INSTANCE_SPELLINGS.map(spelling => `${names.instanceStem}${spelling}.service`));
      }
    }
    return out;
  }

  async function globsOf(instance: string): Promise<string[]> {
    const { agentRunGlobs } = await import('../src/provision/plan');
    const { legacyTransientUnitGlob } = await import('../src/drivers/agent_identity');
    const prefix = gateInstance(instance, ['one']).layout.agentUnitPrefix;
    return [...[1, 2, 3, 10].flatMap(k => agentRunGlobs(prefix, k)), legacyTransientUnitGlob(prefix)];
  }

  for (const [a, b] of pairs) {
    test(`${a} ↔ ${b}: no glob of either matches a unit of the other; each matches its own runs`, async () => {
      const { globMatch } = await import('./support/lead1b_host');
      const reach: string[] = [];
      for (const [from, to] of [
        [a, b],
        [b, a],
      ]) {
        const units = await unitsOf(to as string);
        for (const glob of await globsOf(from as string)) {
          for (const unit of units) if (globMatch(glob, unit)) reach.push(`${from}: ${glob} → ${unit}`);
        }
      }
      expect(reach).toEqual([]);
      // Control: the globs DO reach their own museum's runs (and the legacy name).
      const own = await unitsOf(a);
      const globs = await globsOf(a);
      const ownRuns = own.filter(unit => /@[0-9]/.test(unit) || /[0-9a-f]{8}-[0-9a-f]{4}/.test(unit));
      expect(ownRuns.filter(unit => !globs.some(glob => globMatch(glob, unit)))).toEqual([]);
    });
  }
});
