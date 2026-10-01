/**
 * LEAD-1b G1 (commit C1) — ONE AGENT IDENTITY PER DECLARED SITE, NAMED SO NOTHING ELSE CAN BE IT.
 *
 * Written BEFORE the implementation (audits/2026-09-26_full/LEAD-1b_SPEC.md §6); every row
 * is red on the pre-LEAD-1b HEAD, and says why.
 *
 * `AGENT_IDENTITY_STEM + <instance> + '_' + k` is a unix user AND a group name (the private
 * group `priv_k` carries the same name), so it must fit the 32-character ceiling for the
 * LONGEST legal instance at the LARGEST ordinal, parse back to exactly the (instance, k) it
 * was built from — or the ledger in /etc/passwd would bind one site's workspace to another's
 * uid — and share no prefix with the service user or the legacy agent, which are the two
 * namespaces the rule and the census reason about.
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
import { contractExport, DOORS, gateInstance, INSTANCE_SPELLINGS, NOT_INSTANCE_SPELLINGS, gateManifestDoc, loadRule, renderAgentRule, sweepScratch, unitNamesFor } from './support/lead1b_contract';

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

describe('G1 — an agent identity name is short, parseable, injective and in its own namespace', () => {
  test('control: the sample really contains the longest legal instance name', () => {
    expect(LONGEST.length).toBe(MAX_INSTANCE_LENGTH);
  });

  test('the ordinal ceiling is 999 and k = 1000 (and every non-ordinal) is refused', async () => {
    const { name, max } = await identityLeaf();
    expect(max).toBe(999);
    for (const bad of [0, -1, 1.5, 1000, Number.NaN]) {
      expect({ k: bad, threw: (() => { try { name('museo', bad); return false; } catch { return true; } })() }).toEqual({
        k: bad,
        threw: true,
      });
    }
  });

  test('every (instance, k) of the sample fits the unix ceiling and the name grammar', async () => {
    const { name } = await identityLeaf();
    const over: string[] = [];
    for (const instance of INSTANCES) {
      for (const k of ORDINALS) {
        const built = name(instance, k);
        if (built.length > MAX_USERNAME_LENGTH || !UNIX_NAME_PATTERN.test(built)) over.push(`${built} (${built.length})`);
      }
    }
    expect(over).toEqual([]);
  });

  test('parse ∘ name is the identity, and the map is injective', async () => {
    const { name, parse } = await identityLeaf();
    const seen = new Map<string, string>();
    const wrong: string[] = [];
    for (const instance of INSTANCES) {
      for (const k of ORDINALS) {
        const built = name(instance, k);
        const back = parse(built);
        if (!back || back.instance !== instance || back.ordinal !== k) wrong.push(`${built} → ${JSON.stringify(back)}`);
        const first = seen.get(built);
        if (first !== undefined) wrong.push(`${built} is both ${first} and ${instance}#${k}`);
        seen.set(built, `${instance}#${k}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  test('a name that is not a canonical identity parses to null (no second spelling of one k)', async () => {
    const { name, parse } = await identityLeaf();
    const canonical = name('museo', 1);
    const stem = canonical.slice(0, canonical.length - 'museo_1'.length);
    for (const other of [
      `${AGENT_USER_PREFIX}museo`,
      `${USER_PREFIX}museo`,
      `${stem}museo`,
      `${stem}museo_0`,
      `${stem}museo_01`,
      `${stem}museo_1000`,
      `${stem}Museo_1`,
      `${stem}_1`,
    ]) {
      expect({ name: other, parsed: parse(other) }).toEqual({ name: other, parsed: null });
    }
  });

  test('no identity name shares the service or the legacy agent namespace', async () => {
    const { name } = await identityLeaf();
    const clashes: string[] = [];
    for (const instance of INSTANCES) {
      for (const k of ORDINALS) {
        const built = name(instance, k);
        if (built.startsWith(USER_PREFIX)) clashes.push(`${built} starts with ${USER_PREFIX}`);
        if (built.startsWith(AGENT_USER_PREFIX)) clashes.push(`${built} starts with ${AGENT_USER_PREFIX}`);
        for (const other of INSTANCES) {
          if (built === `${USER_PREFIX}${other}` || built === `${AGENT_USER_PREFIX}${other}`) clashes.push(built);
        }
      }
    }
    expect(clashes).toEqual([]);
  });

  test('unit names: one socket/template/target per (k, door), and the instance regex is exact', async () => {
    const prefix = gateInstance('museo', ['alpha']).layout.agentUnitPrefix;
    const all = new Set<string>();
    for (const k of [1, 2, 10]) {
      for (const door of DOORS) {
        const names = await unitNamesFor(prefix, k, door);
        expect(names.socket).toBe(`${prefix}s${k}-${door}.socket`);
        expect(names.template).toBe(`${prefix}s${k}-${door}@.service`);
        expect(names.target).toBe(`${prefix}s${k}-${door}.target`);
        for (const unit of [names.socket, names.template, names.target]) {
          expect(all.has(unit)).toBe(false);
          all.add(unit);
        }
        for (const spelling of INSTANCE_SPELLINGS) {
          const instance = `${prefix}s${k}-${door}@${spelling}.service`;
          expect({ instance, matched: names.instanceRegex.test(instance) }).toEqual({ instance, matched: true });
        }
        for (const not of [
          ...NOT_INSTANCE_SPELLINGS.map(spelling => `${prefix}s${k}-${door}@${spelling}.service`),
          `${prefix}s${k}-${door}@.service`,
          `${prefix}s${k}-${door}@x.service`,
          `${prefix}s${k}-${door}@3-100-999.service.d`,
          `${prefix}s${k + 1}-${door}@3-100-999.service`,
          `${prefix}s${k}${door}@3-100-999.service`,
          `x${prefix}s${k}-${door}@3-100-999.service`,
        ]) {
          expect({ not, matched: names.instanceRegex.test(not) }).toEqual({ not, matched: false });
        }
      }
    }
  });
});
