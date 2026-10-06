/**
 * SEVERAL INSTANCES ON ONE HOST — what one instance may never share with another.
 *
 * derive() namespaces every path it owns by instance (config dir, agent unit, socket, sudoers
 * and polkit files), and the state-root marker refuses another instance's tree. What it cannot
 * see is the OTHER declarations: the principals, the v2 unit and the ports are the operator's
 * choice, and a collision there is either a silent failure (two v2 services on one port) or an
 * isolation hole. The hole is the users: polkit grants by subject.user and each state root is
 * owned by its agent user, so two instances sharing an agent user can each write the other's
 * media include (parsed by root at configtest) and API releases — one compromise is both.
 *
 * The SECRET-READING groups are the same law as the users: v1.group reads v1/shared (the v1
 * API's configuration, DB credentials included) and v2.group reads v2/shared/v2.env. Behind one
 * web server the v1 group is the site's PHP-FPM pool group (the v6 practice) — never the web
 * server's own group shared by every site, which would let every instance read every v1
 * configuration.
 *
 * Pure, ZERO-DEPENDENCY (tests/provision_zero_dep.test.ts): the CLI reads and parses the
 * sibling declarations (schema.ts), this module only judges the derived layouts.
 */
import type { AgentLayout } from './layout';
import { pathsOverlap } from './layout';

export interface Sibling {
  /** The declaration file, named in every refusal. */
  readonly source: string;
  readonly layout: AgentLayout;
}

/** derive()'s own normal-form overlap (segment-wise: '/srv/a' vs '/srv/ab' and '/srv/a/..x' right). */
const overlap = pathsOverlap;

/** The users that run code for an instance. Disjoint across instances. */
function principals(layout: AgentLayout): ReadonlyMap<string, string> {
  return new Map([
    [layout.identity.agentUser, 'agent_user'],
    [layout.identity.v2User, 'v2.user'],
  ]);
}

/** The groups that read an instance's API configuration (its credentials). Disjoint across instances. */
function secretGroups(layout: AgentLayout): ReadonlyMap<string, string> {
  // v1 first: when one group is both (allowed within one instance), the v1 name reports it.
  const groups = new Map([[layout.identity.v2Group, 'v2.group']]);
  groups.set(layout.identity.v1Group, 'v1.group');
  return groups;
}

/** The directories an instance WRITES (its state root; a copy-mode media root). */
function writtenRoots(layout: AgentLayout): readonly [string, string][] {
  const roots: [string, string][] = [['state_root', layout.state.root]];
  if (layout.media.mode === 'copy' && layout.media.root !== null) roots.push(['media.root (copy)', layout.media.root]);
  return roots;
}

/** Every reason `own` cannot coexist with the given siblings; empty = isolated. */
export function siblingRefusals(own: AgentLayout, siblings: readonly Sibling[]): string[] {
  const refusals: string[] = [];
  for (const { source, layout: other } of siblings) {
    const clash = (what: string, fix: string) =>
      refusals.push(`${what} — also used by instance '${other.instance}' (${source}); ${fix}`);

    if (other.instance === own.instance) {
      refusals.push(`${source} declares instance '${own.instance}' too — one declaration per instance; remove one`);
      continue;
    }
    const otherPrincipals = principals(other);
    for (const [user, field] of principals(own)) {
      const theirs = otherPrincipals.get(user);
      if (theirs !== undefined) {
        clash(
          `${field} '${user}' is that instance's ${theirs}`,
          'give each instance its own users (one compromised instance must not reach the other)',
        );
      }
    }
    const otherGroups = secretGroups(other);
    for (const [group, field] of secretGroups(own)) {
      const theirs = otherGroups.get(group);
      if (theirs === undefined) continue;
      clash(
        `${field} '${group}' is that instance's ${theirs}`,
        field === 'v1.group' || theirs === 'v1.group'
          ? "run each site's v1 API in its own PHP-FPM pool and declare that pool's group as v1.group"
          : 'give each instance its own v2 group',
      );
    }
    // Our v2 unit file is written to the unit dir and its restart granted to our agent by polkit:
    // named like ANY of their units it would shadow (or one day control) that unit.
    const theirUnits = new Map([
      [other.v2.unit, 'v2.unit'],
      [other.web.unit, 'web.unit'],
      [other.agentUnitName, 'agent unit'],
    ]);
    const unitClash = theirUnits.get(own.v2.unit);
    if (unitClash !== undefined) {
      clash(`v2.unit '${own.v2.unit}' is that instance's ${unitClash}`, 'give each instance its own v2 unit name');
    }
    // Our socket's group (unix listener): one of their service groups would let their code connect.
    if (own.identity.engineGroup !== null && secretGroups(other).has(own.identity.engineGroup)) {
      clash(
        `engine_group '${own.identity.engineGroup}' is one of that instance's service groups`,
        "use the work system's own group, never a web or API group",
      );
    }
    if (own.v2.port === other.v2.port) clash(`v2.port ${own.v2.port}`, 'give each instance its own v2 port');
    if (own.listen.kind === 'tls' && other.listen.kind === 'tls') {
      if (own.listen.host === other.listen.host && own.listen.port === other.listen.port) {
        clash(`listen ${own.listen.host}:${own.listen.port}`, 'give each instance its own port (or address)');
      }
    }
    // v2 binds loopback: a loopback agent listener on their v2 port collides.
    if (own.listen.kind === 'tls' && own.listen.host.startsWith('127.') && own.listen.port === other.v2.port) {
      clash(`listen ${own.listen.host}:${own.listen.port} is that instance's v2.port`, 'give each instance its own port');
    }
    const theirsWritten = writtenRoots(other);
    const theirsRead = other.media.root !== null ? [...theirsWritten, ['media.root', other.media.root] as [string, string]] : theirsWritten;
    for (const [field, path] of writtenRoots(own)) {
      for (const [otherField, otherPath] of theirsRead) {
        if (overlap(path, otherPath)) {
          clash(`${field} '${path}' overlaps that instance's ${otherField} '${otherPath}'`, 'use separate directories');
        }
      }
    }
    // A shared (read-only) media root of ours under a tree THEY write: they would publish into it.
    if (own.media.mode === 'shared' && own.media.root !== null) {
      for (const [otherField, otherPath] of theirsWritten) {
        if (overlap(own.media.root, otherPath)) {
          clash(`media.root '${own.media.root}' overlaps that instance's ${otherField} '${otherPath}'`, 'use separate directories');
        }
      }
    }
  }
  return refusals;
}
