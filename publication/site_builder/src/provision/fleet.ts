/**
 * THE FLEET — every museum on one host, and the law that keeps them apart.
 *
 * `src/provision/layout.ts` derives ONE instance and checks that instance against itself:
 * its roots are not inside its webspaces, its config directory is not inside its writable
 * set, its engine's private directory is outside everything it owns. Every one of those
 * checks is intra-instance, and every one of them passes on a host where two museums
 * declare the SAME workspaces root, the same unix user, the same socket, or the same
 * server_name. That is not a hypothetical: a host runs several museums precisely because
 * the isolation between them is meant to be a uid, a gid and a set of filesystem modes —
 * so two declarations agreeing on any of those is not a naming clash to tidy up later, it
 * is the isolation gone, with every generated file still looking exactly right.
 *
 * This module is the missing half. It reads the whole `/etc/dedalo_sites/instances` tree
 * (`loadFleet`) and asserts the one property no single declaration can state about itself:
 * that no two instances SHARE OR NEST any of the things that make them separate
 * (`assertFleetDisjoint`).
 *
 * THE TWO MOVES ARE SEPARATE ON PURPOSE. Loading refuses BY NAME and keeps going: a
 * malformed declaration for museum #3 must not stop museums #1, #2 and #4 from being
 * provisioned — a fleet-wide run that aborts on the first bad file is a run an operator
 * cannot use on the day it matters. The fleet law is then a second, explicit step over
 * whatever loaded, so `check` can report the refusals AND the collisions in one pass and an
 * operator adding museum #4 fixes everything in one edit rather than one collision per run.
 *
 * PREFIX CONTAINMENT COUNTS, AND SO DO SPELLINGS. `/srv/a` and `/srv/a/b` are a violation,
 * not two paths — one museum's agent turn writing inside another's tree does not need the
 * paths to be equal. And two spellings of one directory (a trailing slash, a `..` segment,
 * a symlink) must not smuggle the same tree past the check under two names, so every path
 * is normalised through `realpath` as far as it exists before it is compared. The
 * containment predicate itself is layout's `pathsOverlap` — one owner, as everywhere on
 * this path, because a second implementation of "is a inside b" is a second set of edge
 * cases about the filesystem root.
 *
 * WHAT THIS FILE MAY IMPORT. Not the zero-dep budget the renderers keep: `loadFleet` reads
 * the filesystem and validates through `schema.ts` (zod), so it could never have been part
 * of the repo-side gate that renders artifacts without this package's node_modules. What it
 * does keep is the ownership rule — it derives NOTHING. Every name, path and grammar comes
 * from `layout.ts`, and the only thing invented here is the census itself.
 *
 * Precedent for the shape: src/core/media/protection.ts in the engine — pure builders, and
 * a status path that answers the question without touching anything.
 */

import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import {
  DEFAULT_PATHS,
  INSTANCE_PATTERN,
  SURFACES,
  derive,
  pathsOverlap,
  tidyPath,
  type InstanceLayout,
  type InstanceManifest,
} from './layout';
import { parseManifest } from './schema';

/* ────────────────────────────────────────────────────────────────────────────────────
 * What a fleet is
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * ONE MUSEUM THAT LOADED: where its declaration was read from, what it said, and where
 * everything derived from it goes.
 *
 * All three together because `plan(layout, manifest, hostState)` needs two of them and
 * every refusal quotes the third. The layout answers "where does this go", the manifest
 * answers "what did the museum ask for", and a caller that had to re-read the file to get
 * the second answer would be a second reader of the same bytes — free to disagree with
 * this one about whether they were acceptable.
 */
export interface FleetMember {
  /** The instance name, which is also the directory name. See `loadFleet`. */
  readonly instance: string;
  /** `<dir>/<instance>/instance.json` — quoted in every refusal about this member. */
  readonly manifestPath: string;
  readonly manifest: InstanceManifest;
  readonly layout: InstanceLayout;
}

/**
 * One thing on the host that will NOT be provisioned, and why.
 *
 * A refusal is addressed by the DIRECTORY name, because that is the operator's handle on
 * it — the declaration inside may be unparseable, may name a different instance, or may not
 * exist at all, and "museum #3 is broken" has to be sayable in every one of those cases.
 */
export interface FleetRefusal {
  /** The directory under the fleet dir. THE instance name when the declaration is sane. */
  readonly instance: string;
  readonly manifestPath: string;
  /** Operator-facing, and SECRET-FREE — see `refuse()` on why the JSON parser is muzzled. */
  readonly reason: string;
}

/**
 * The minimum a fleet-law check needs: the derived layouts, and nothing else.
 *
 * Stated as its own type so a gate (and `provision adopt`, and anything that builds a
 * candidate fleet in memory to ask "would adding this museum collide?") can run the law
 * without a directory of files behind it. Everything the census reads — the identities, the
 * roots, the sockets, the hostnames, the aliases, the resource shares — is ON the layout,
 * because `derive()` echoes `serving` and `resources` for exactly this reason.
 */
export interface FleetMembers {
  readonly layouts: readonly InstanceLayout[];
}

/** A loaded fleet: what will be provisioned, what was refused, and where it came from. */
export interface Fleet extends FleetMembers {
  /** The directory that was read — quoted in reports, so a run against a copy is legible. */
  readonly dir: string;
  /** Every museum that loaded, in instance-name order. THE record. */
  readonly members: readonly FleetMember[];
  /**
   * The same museums, projected to their layouts — what the fleet law reads, and what a
   * caller that only places files needs.
   *
   * A PROJECTION, not a second list: it is built in the same pass as `members`, from the
   * same object, and neither is ever assembled on its own. Two views of one build cannot
   * disagree; two builds of one fact always eventually do.
   */
  readonly layouts: readonly InstanceLayout[];
  /**
   * Every member that did NOT, in instance-name order. NEVER an exception: see the header.
   * A fleet with zero layouts and one or more refusals is a FAILED run and the CLI exits
   * non-zero on it — that decision is `cli.ts`'s, because "what is a failure" is a property
   * of the command an operator typed (`--all` over eight museums, or one instance by name),
   * not of the directory.
   */
  readonly refusals: readonly FleetRefusal[];
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * loadFleet
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** The declaration's filename inside an instance directory. Layout owns the directory. */
export const MANIFEST_FILENAME = 'instance.json';

/**
 * READ EVERY DECLARATION UNDER `dir`, REFUSING THE BROKEN ONES BY NAME.
 *
 * The directory name IS the instance name — that is what makes a derived identity
 * collision-free (`layout.ts` says so where it explains why `dedalo-site-<instance>` cannot
 * collide), so a declaration that names a different instance is refused here rather than
 * quietly provisioning a museum under the wrong user, in the wrong tree, with a unit whose
 * filename says otherwise.
 *
 * The ONE thing that throws is a fleet directory that cannot be read at all. That is not
 * "one member is broken", it is "the host is not what this command was pointed at", and
 * continuing would report an empty fleet — which reads exactly like a host with no museums
 * on it, and is the sort of answer that gets acted on.
 */
export function loadFleet(dir: string = DEFAULT_PATHS.configBase): Fleet {
  const fleetDir = resolve(tidyPath(dir));

  let entries: string[];
  try {
    entries = readdirSync(fleetDir);
  } catch (error) {
    throw new Error(
      `fleet: cannot read the instance directory '${fleetDir}' (${errorText(error)}). This is ` +
        `the host's fleet root, not one museum's declaration — an unreadable fleet root would ` +
        `otherwise report as a host with no instances on it, which is a very different fact. ` +
        `Nothing was provisioned.`,
    );
  }

  const members: FleetMember[] = [];
  const refusals: FleetRefusal[] = [];

  for (const name of [...entries].sort(byName)) {
    const instanceDir = join(fleetDir, name);
    const manifestPath = join(instanceDir, MANIFEST_FILENAME);

    // NOT a directory → not an instance, and not a refusal either. An /etc directory
    // accumulates notes, backups and editor droppings, and a fleet that refuses to load
    // because somebody left a README beside eight museums is a fleet nobody can operate.
    // A DIRECTORY that is not a valid instance name is a different matter — `cp -r example
    // example.bak` leaves a complete second declaration on the host — so that one is named.
    let isDirectory = false;
    try {
      isDirectory = statSync(instanceDir).isDirectory();
    } catch {
      isDirectory = false;
    }
    if (!isDirectory) continue;

    if (!INSTANCE_PATTERN.test(name)) {
      refusals.push({
        instance: name,
        manifestPath,
        reason:
          `'${name}' is not a valid instance name (${INSTANCE_PATTERN.source}). The DIRECTORY ` +
          `name is the instance name — it becomes the unix user, the unit and the state root — ` +
          `so a directory that cannot be one is not provisioned. Rename it, or move it out of ` +
          `the fleet root if it is a copy.`,
      });
      continue;
    }

    let raw: string;
    try {
      raw = readFileSync(manifestPath, 'utf8');
    } catch (error) {
      refusals.push({
        instance: name,
        manifestPath,
        reason: `no readable ${MANIFEST_FILENAME} (${errorText(error)}) — an instance directory ` +
          `without a declaration describes nothing that could be provisioned.`,
      });
      continue;
    }

    let document: unknown;
    try {
      document = JSON.parse(raw);
    } catch {
      // THE PARSER'S MESSAGE IS WITHHELD, AND THAT IS THE POINT. A JSON syntax error quotes
      // the token it tripped over, and this file sits in a directory whose whole purpose is
      // to be beside credentials — an operator pastes a key into instance.json, the parser
      // trips on the line after it, and the value lands in a plan, a log and a ticket. A
      // refusal is printed; a refusal never carries file content. The operator gets the
      // command that shows them the position, on their own terminal, on their own host.
      refusals.push({
        instance: name,
        manifestPath,
        reason:
          `${MANIFEST_FILENAME} is not valid JSON. The parser's message is deliberately not ` +
          `quoted here: it echoes the token it tripped on, and this file lives beside ` +
          `credentials. Run \`jq . ${manifestPath}\` to see where.`,
      });
      continue;
    }

    try {
      const manifest = parseManifest(document, { source: manifestPath });

      // The directory names the instance. A declaration that disagrees would be provisioned
      // as `<declared>` while every operator, every path under /etc and every `--all` run
      // calls it `<directory>`.
      if (manifest.instance !== name) {
        refusals.push({
          instance: name,
          manifestPath,
          reason:
            `the declaration names instance '${manifest.instance}' but lives in the directory ` +
            `'${name}'. The directory name is the instance name; the identity, the unit, the ` +
            `state root and every path under /etc are spelled from it. Rename the directory or ` +
            `fix the declaration — provisioning it would produce a museum nobody can address.`,
        });
        continue;
      }

      members.push(Object.freeze({ instance: name, manifestPath, manifest, layout: derive(manifest) }));
    } catch (error) {
      // `parseManifest` refuses with every problem at once and `derive` refuses with the one
      // it found; both messages are written for an operator with root, and neither carries a
      // declared VALUE for a credential (the credential law is enforced by KEY, and the path
      // grammars quote their field name, never the string they rejected). So the message is
      // passed through whole: rewriting it here would be a second, worse account of a
      // refusal whose owner already explained it.
      refusals.push({ instance: name, manifestPath, reason: errorText(error) });
    }
  }

  members.sort((a, b) => byName(a.instance, b.instance));

  return Object.freeze({
    dir: fleetDir,
    members: Object.freeze(members),
    layouts: Object.freeze(members.map(member => member.layout)),
    refusals: Object.freeze(refusals.sort((a, b) => byName(a.instance, b.instance))),
  });
}

/**
 * The declaration behind a loaded member — the seam between `loadFleet` and
 * `plan(layout, manifest, hostState)`.
 *
 * A function rather than a bare map lookup so the failure is a sentence and not an
 * `undefined` that flows one call further before anything notices.
 */
export function manifestOf(fleet: Fleet, instance: string): InstanceManifest {
  const member = fleet.members.find(candidate => candidate.instance === instance);
  if (!member) {
    throw new Error(
      `fleet: no declaration was loaded for instance '${instance}' in '${fleet.dir}'. It was ` +
        `either refused (see the fleet's refusals) or never there. Nothing was provisioned.`,
    );
  }
  return member.manifest;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The disjointness law
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** What two instances were caught sharing. The kinds a report groups by. */
export type FleetViolationKind =
  | 'instance'
  | 'user'
  | 'group'
  | 'path'
  | 'hostname'
  | 'budget';

/** One violation of the fleet law, in the vocabulary an operator has to act in. */
export interface FleetViolation {
  readonly kind: FleetViolationKind;
  /** Every instance involved — two for a collision, all contributors for a budget. */
  readonly instances: readonly string[];
  /** The shared thing itself: the user name, the hostname, the path, the budget field. */
  readonly shared: string;
  /** The whole sentence: who, what, and why it is not a cosmetic clash. */
  readonly message: string;
}

/**
 * The refusal. Carries EVERY violation, because an operator adding museum #4 to a host must
 * not have to discover one collision per provisioning run — each run is another round trip
 * against a host with live museum sites on it. Same discipline as
 * `InstanceManifestError`, one level up: that one reports every problem in a declaration,
 * this one reports every problem BETWEEN declarations.
 */
export class FleetCollisionError extends Error {
  constructor(
    readonly violations: readonly FleetViolation[],
    readonly dir?: string,
  ) {
    const where = dir ? ` in ${dir}` : '';
    const count = `${violations.length} collision${violations.length === 1 ? '' : 's'}`;
    super(
      `The instances on this host are not disjoint${where} (${count}):\n` +
        violations.map(violation => `  - [${violation.kind}] ${violation.message}`).join('\n') +
        `\nNothing was provisioned.`,
    );
    this.name = 'FleetCollisionError';
  }
}

/**
 * A HOST-WIDE resource budget, against which the fleet's declared shares are summed.
 *
 * INJECTED, and stated in the same systemd spellings a manifest uses, because nothing in
 * the declaration grammar knows about the host: `instance.json` is strictly one museum's
 * document, and a museum does not get to state how much memory the machine has. The
 * operator (through `cli.ts`) does. Every field is optional and a field that is absent is
 * simply not checked — an unstated budget is not a budget of zero.
 */
export interface HostBudget {
  /** systemd size, e.g. '16G' — compared against the sum of `resources.memory_max`. */
  readonly memory_max?: string;
  /** systemd CPU share, e.g. '400%' for four cores — against the sum of `cpu_quota`. */
  readonly cpu_quota?: string;
  /** The kernel's pids budget for this host — against the sum of `tasks_max`. */
  readonly tasks_max?: number;
}

export interface FleetCheckOptions {
  /** When stated, the fleet's declared shares are summed and compared against it. */
  readonly hostBudget?: HostBudget;
}

/**
 * THE LAW, as a list rather than an exception — the shape `check` needs.
 *
 * `check` writes nothing and reports what an `apply` would refuse, so the collisions have
 * to be available WITHOUT throwing. `assertFleetDisjoint` is then this function plus a
 * throw, which is the only arrangement in which the dry run and the real run can never
 * disagree about what is wrong with a host.
 *
 * Every pair compared here is CROSS-INSTANCE. Two sites of ONE museum sharing a webspace,
 * an alias equal to its own site's hostname, a root inside its own webspace — all of those
 * are already refused, by `derive()` and by the vhost renderers, which own them. Repeating
 * their checks here would be a second owner of an intra-instance rule, and the second owner
 * is the one that drifts.
 */

/**
 * A path one instance merely READS must not live in a tree another instance can WRITE.
 *
 * The exclusive census above asks "do two museums claim the same thing". This asks a
 * different and sharper question: instance A names a credential file, a TLS private key or
 * an agent binary, and that path lies inside instance B's workspaces root or one of B's
 * webspaces — trees B's agent turns write by design, executing arbitrary generated code.
 * B then controls the bytes A opens as its own bearer token, or the binary A executes as
 * its own agent. Nothing in the exclusive census sees this, because the two instances are
 * not claiming the SAME path at all.
 *
 * Sharing such a path is legitimate and common — one `claude` binary serves every museum on
 * the host — so this is deliberately NOT an exclusivity rule. Only containment in someone
 * ELSE'S writable tree is refused.
 */
function readPathsInsideForeignWritableTrees(members: readonly InstanceLayout[]): FleetViolation[] {
  const violations: FleetViolation[] = [];

  const readPaths = (layout: InstanceLayout): { label: string; path: string }[] => {
    const out: { label: string; path: string }[] = [];
    for (const [key, path] of Object.entries(layout.secrets)) {
      out.push({ label: `the credential file for ${key}`, path });
    }
    const tls = layout.serving.prod.tls as { certificate?: string; key?: string };
    if (tls.certificate) out.push({ label: 'the production TLS certificate', path: tls.certificate });
    if (tls.key) out.push({ label: 'the production TLS private key', path: tls.key });
    // The resolved, absolute forms the daemon actually opens — the same bytes the unit
    // hands it. Re-reading the manifest here would be a second resolution of the same
    // fields, free to disagree with the one the daemon uses.
    for (const [key, value] of Object.entries(layout.envVars)) {
      if (!value.startsWith('/')) continue;
      if (key.endsWith('_BIN')) out.push({ label: `the agent binary in ${key}`, path: value });
      else if (key.endsWith('_KEY_PATH') || key.endsWith('_KEY_FILE')) {
        out.push({ label: `the credential file in ${key}`, path: value });
      }
    }
    return out;
  };

  const writableTrees = (layout: InstanceLayout): { label: string; path: string }[] => [
    { label: 'workspaces root', path: layout.roots.workspaces },
    { label: 'agent HOME', path: layout.roots.home },
    ...layout.sites.map(site => ({ label: `site '${site.slug}'s webspace`, path: site.webspace })),
  ];

  for (const reader of members) {
    for (const owner of members) {
      if (owner.instance === reader.instance) continue;
      for (const read of readPaths(reader)) {
        for (const tree of writableTrees(owner)) {
          if (!pathsOverlap(realPathOf(read.path), realPathOf(tree.path))) continue;
          violations.push({
            kind: 'path',
            instances: [reader.instance, owner.instance],
            shared: read.path,
            message:
              `${read.label} of instance '${reader.instance}' ('${read.path}') lies inside ` +
              `instance '${owner.instance}'s ${tree.label} ('${tree.path}'), which that ` +
              `instance's agent turns write by design. '${owner.instance}' would control ` +
              `the bytes '${reader.instance}' reads as its own credential, or the binary it ` +
              `executes as its own agent.`,
          });
        }
      }
    }
  }

  return violations;
}

export function fleetViolations(
  fleet: FleetMembers,
  options: FleetCheckOptions = {},
): FleetViolation[] {
  const violations: FleetViolation[] = [];
  const members: InstanceLayout[] = [];
  const seen = new Set<string>();

  for (const layout of [...fleet.layouts].sort((a, b) => byName(a.instance, b.instance))) {
    assertNoTcpListener(layout);

    // A DUPLICATE INSTANCE NAME COLLIDES IN EVERY DIMENSION AT ONCE — the user, the group,
    // the unit, the state root, the runtime dir, the socket, the config dir. Reporting
    // twelve lines about one cause is the exact opposite of "fix them all in one run", so
    // the duplicate is named once and then left out of the rest of the census. (A fleet
    // loaded from a directory cannot produce this — two directories cannot share a name —
    // but a fleet assembled in memory, by `adopt` or by a gate, can.)
    if (seen.has(layout.instance)) {
      violations.push({
        kind: 'instance',
        instances: [layout.instance, layout.instance],
        shared: layout.instance,
        message:
          `two members declare the instance name '${layout.instance}'. The name IS the unix ` +
          `identity, the unit, the state root and the /etc directory, so this is not a naming ` +
          `clash — it is one museum's daemon provisioned over another's. Only the first was ` +
          `considered for the rest of this report.`,
      });
      continue;
    }
    seen.add(layout.instance);
    members.push(layout);
  }

  violations.push(...nameCollisions(members));
  violations.push(...pathCollisions(members));
  violations.push(...readPathsInsideForeignWritableTrees(members));
  violations.push(...hostnameCollisions(members));
  violations.push(...budgetViolations(members, options.hostBudget));

  return violations.sort(byViolation);
}

/**
 * THE FLEET LAW. Throws with every violation at once, or returns.
 *
 * Called before ANY plan is executed against a host that holds more than one museum — and
 * before one is added to it. The failure it prevents has no symptom until it has a very
 * large one: two declarations that agree on a user, a socket or a served tree provision
 * cleanly, render correct-looking files, and start two daemons that share the thing that
 * was supposed to separate them.
 */
export function assertFleetDisjoint(fleet: FleetMembers, options: FleetCheckOptions = {}): void {
  const violations = fleetViolations(fleet, options);
  if (violations.length > 0) {
    throw new FleetCollisionError(violations, (fleet as Fleet).dir);
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The census — identities
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * THE UNIX IDENTITIES, compared name for name.
 *
 * The user and the group only. `webGroup` and `engineGroup` are SHARED BY DESIGN — every
 * instance on a Debian host names `www-data` — and comparing them would refuse every real
 * fleet. The instance's own two are the isolation: two museums under one uid is one museum's
 * agent turn running as the owner of the other's workspaces, its releases and its git
 * history, which is the entire boundary this subsystem draws.
 *
 * Users are compared with users and groups with groups, never across: they are separate
 * namespaces, and A's user having the same string as B's group grants nothing to anybody.
 */
function nameCollisions(members: readonly InstanceLayout[]): FleetViolation[] {
  const violations: FleetViolation[] = [];

  const dimensions: {
    kind: 'user' | 'group';
    what: string;
    value: (layout: InstanceLayout) => string;
    why: string;
  }[] = [
    {
      kind: 'user',
      what: 'unix user',
      value: layout => layout.identity.user,
      why:
        `one uid means one museum's agent turn runs as the owner of the other's workspaces, ` +
        `its release store and its git history — the isolation between two instances IS the ` +
        `uid`,
    },
    {
      kind: 'group',
      what: 'unix group',
      value: layout => layout.identity.group,
      why:
        `the instance group is what 0750 roots and 0640 rendered envs are group-owned by, so ` +
        `one group is every member museum reading the other's configuration and trees`,
    },
  ];

  for (const dimension of dimensions) {
    const owner = new Map<string, string>();
    for (const layout of members) {
      const value = dimension.value(layout);
      const first = owner.get(value);
      if (first !== undefined) {
        violations.push({
          kind: dimension.kind,
          instances: [first, layout.instance],
          shared: value,
          message:
            `instances '${first}' and '${layout.instance}' share the ${dimension.what} ` +
            `'${value}' — ${dimension.why}. An adopted identity is the only way to declare ` +
            `one; the derived form (a per-instance name) cannot collide.`,
        });
        continue;
      }
      owner.set(value, layout.instance);
    }
  }

  return violations;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The census — paths
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** One path an instance claims, with the name an operator would recognise it by. */
interface PathClaim {
  readonly instance: string;
  readonly label: string;
  /** As declared/derived — quoted in the report, so the operator sees their own spelling. */
  readonly path: string;
  /** Normalised through realpath as far as it exists — what is actually compared. */
  readonly real: string;
}

/**
 * EVERY PATH THAT BELONGS TO EXACTLY ONE MUSEUM.
 *
 * What is NOT here matters as much as what is. The three BASES — `webspaceBase`,
 * the state base and the config base — are shared by every instance on the host by
 * construction (`/home/www`, `/var/lib/dedalo_sites`, `/etc/dedalo_sites/instances`), so
 * claiming them would refuse every fleet with more than one museum in it. What is claimed is
 * the per-instance tree UNDER each base, plus every path an override can move somewhere else
 * entirely.
 *
 * The engine's private directory is claimed for two reasons at once: two instances must not
 * be paired to one engine (the topology is 1:1), and — the case the fleet law exists for —
 * one instance's root or webspace must not CONTAIN another instance's private directory,
 * which `pathsOverlap` catches in the same comparison because containment is symmetric.
 *
 * The socket is claimed separately from the runtime directory that holds it. Today it is
 * derived from the instance name and cannot collide on its own, so the row would be
 * decoration — except that a socket collision is the one failure on this list an operator
 * has already met somewhere else (two daemons, one `.sock`, and every second request
 * answered by the wrong process), and the day a runtime path becomes declarable the census
 * already covers it rather than being extended a release later.
 */
function pathClaims(layout: InstanceLayout): PathClaim[] {
  const claims: { label: string; path: string }[] = [
    { label: 'the instance config directory', path: layout.configDir },
    { label: 'the state directory', path: layout.stateDir },
    { label: 'roots.workspaces', path: layout.roots.workspaces },
    { label: 'roots.home', path: layout.roots.home },
    { label: 'roots.audit', path: layout.roots.audit },
    { label: 'the runtime directory', path: layout.runtimeDir },
    { label: 'the daemon socket', path: layout.socketPath },
    { label: 'the preprod password file', path: layout.htpasswd },
    { label: "the engine's private directory", path: layout.enginePrivateDir },
    { label: 'the systemd unit file', path: layout.unitPath },
    { label: 'the rendered env file', path: layout.envFile },
    { label: "the engine pairing fragment", path: layout.engineFragment },
    { label: 'the credential directory', path: layout.secretsDir },
    { label: 'the instance declaration', path: layout.manifestPath },
  ];

  for (const site of layout.sites) {
    claims.push({ label: `site '${site.slug}'s webspace`, path: site.webspace });
    for (const surface of SURFACES) {
      claims.push({
        label: `site '${site.slug}'s ${surface} vhost file`,
        path: site.vhostPaths[surface],
      });
    }
  }

  return claims.map(claim => ({
    instance: layout.instance,
    label: claim.label,
    path: claim.path,
    real: realPathOf(claim.path),
  }));
}

/**
 * Pairwise, across instances, with containment counting in both directions.
 *
 * O(n²) over a handful of museums and a dozen claims each, deliberately: a hash of exact
 * paths would be faster and would miss `/srv/a` against `/srv/a/b`, which is the collision
 * that actually happens — an operator gives the second museum the parent of the first one's
 * tree, and nothing about either declaration looks wrong on its own.
 */
function pathCollisions(members: readonly InstanceLayout[]): FleetViolation[] {
  const violations: FleetViolation[] = [];
  const claims = members.map(pathClaims);

  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      for (const left of claims[i]!) {
        for (const right of claims[j]!) {
          if (!pathsOverlap(left.real, right.real)) continue;
          const same = left.real === right.real;
          violations.push({
            kind: 'path',
            instances: [left.instance, right.instance],
            shared: left.real,
            message:
              `${left.label} of instance '${left.instance}' ('${left.path}') ` +
              `${same ? 'is' : 'overlaps'} ${right.label} of instance '${right.instance}' ` +
              `('${right.path}')${describeNormalisation(left, right)}. Two instances may share a ` +
              `BASE (/home/www, /var/lib, /etc/dedalo_sites/instances) but never a tree inside ` +
              `it: one museum's daemon — and every agent turn it runs — would write inside the ` +
              `other's.`,
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Says so when the collision was only visible after normalisation.
 *
 * A report that prints two paths an operator can see are different, and calls them the same,
 * is a report that gets argued with instead of acted on. A symlinked `/var/lib` is the
 * ordinary case, not a trick.
 */
function describeNormalisation(left: PathClaim, right: PathClaim): string {
  const leftMoved = left.real !== resolve(tidyPath(left.path));
  const rightMoved = right.real !== resolve(tidyPath(right.path));
  if (!leftMoved && !rightMoved) return '';
  return left.real === right.real
    ? ` (both spellings resolve to '${left.real}' once symlinks are followed)`
    : ` (they resolve to '${left.real}' and '${right.real}' once symlinks are followed)`;
}

/**
 * A path as the filesystem actually means it: `realpath` as deep as the tree exists, with
 * the not-yet-created remainder appended.
 *
 * The deep-as-it-exists walk is the whole point. Provisioning runs BEFORE the directories
 * exist, so a plain `realpathSync` would throw on every root worth checking and leave the
 * comparison lexical — while the ordinary host has a symlinked `/var/lib` or a `/srv` that
 * is a mount point reached through one. Resolving the deepest existing ancestor and
 * re-appending the tail gives the two declarations one spelling in exactly the case that
 * matters: the tree they will be created in is the same tree.
 *
 * A path whose every ancestor is missing (a gate's `/srv/museum-a`) falls back to the
 * lexical form, which is correct — nothing on disk can be smuggling anything.
 */
function realPathOf(path: string): string {
  const absolute = resolve(tidyPath(path));
  const tail: string[] = [];
  let current = absolute;
  for (;;) {
    try {
      const real = realpathSync(current);
      return tail.length === 0 ? real : join(real, ...tail);
    } catch {
      const parent = dirname(current);
      if (parent === current) return absolute;
      tail.unshift(basename(current));
      current = parent;
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The census — hostnames
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * EVERY server_name THIS INSTANCE WILL CLAIM, INCLUDING THE DERIVED PREPROD HOSTNAME.
 *
 * The preprod name is the one a census forgets, because nobody wrote it down: it is
 * `<host_prefix>.<domain>`, derived, and it lands in a vhost exactly like the production
 * name does. So a museum whose production domain is `pre.www.other.example.org` silently
 * takes over the OTHER museum's draft surface — the drafts of an unpublished exhibition
 * served from the wrong host, with both declarations looking impeccable.
 *
 * Claimed whether or not `serving.preprod.enabled` is true, for two reasons: the vhost
 * renderers' own intra-instance census claims it unconditionally (one law, not two), and a
 * hostname that becomes a collision on the day a museum enables its draft surface is a
 * collision now — refusing it while both declarations are still being edited is the whole
 * value of a fleet check.
 */
function hostnameClaims(layout: InstanceLayout): { label: string; host: string }[] {
  const claims: { label: string; host: string }[] = [];
  for (const site of layout.sites) {
    claims.push({ label: `site '${site.slug}'s production hostname`, host: site.domain });
    claims.push({ label: `site '${site.slug}'s preprod hostname`, host: site.preprodDomain });
  }
  for (const alias of Object.keys(layout.serving.aliases ?? {})) {
    claims.push({ label: `serving.aliases['${alias}']`, host: alias });
  }
  return claims;
}

function hostnameCollisions(members: readonly InstanceLayout[]): FleetViolation[] {
  const violations: FleetViolation[] = [];
  const owner = new Map<string, { instance: string; label: string }>();

  for (const layout of members) {
    for (const claim of hostnameClaims(layout)) {
      const first = owner.get(claim.host);
      if (first !== undefined) {
        // Intra-instance duplicates belong to `derive()` and the vhost renderers, which
        // already refuse them and explain them better than a fleet-level message could.
        if (first.instance === layout.instance) continue;
        violations.push({
          kind: 'hostname',
          instances: [first.instance, layout.instance],
          shared: claim.host,
          message:
            `'${claim.host}' is ${first.label} of instance '${first.instance}' AND ${claim.label} ` +
            `of instance '${layout.instance}'. Two vhosts claiming one server_name is not a ` +
            `merge: the web server answers with whichever file it read first, so one museum ` +
            `serves the other's bytes — and which one depends on the order sites-enabled ` +
            `happens to be read in.`,
        });
        continue;
      }
      owner.set(claim.host, { instance: layout.instance, label: claim.label });
    }
  }

  return violations;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The census — the host's resources
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * THE FLEET MUST FIT ON THE HOST.
 *
 * `resources.memory_max` is a kernel-enforced cgroup limit, and systemd will start eight
 * museums whose limits sum to four times the machine's memory without a word — each unit is
 * individually satisfiable, and the arithmetic nobody does is the fleet's. The failure is
 * then an OOM killer choosing which museum's daemon dies, under load, on the day all of them
 * are busy at once.
 *
 * AN UNBOUNDED MEMBER IS A VIOLATION TOO, once a budget is stated. An instance that declares
 * no share can take the whole host, which makes every other member's careful limit
 * decorative — the budget would be arithmetic about a fleet that does not exist. It is only
 * checked when the operator states a budget, because until then nothing claims the fleet has
 * to fit anything.
 */
function budgetViolations(
  members: readonly InstanceLayout[],
  budget: HostBudget | undefined,
): FleetViolation[] {
  if (!budget) return [];

  const violations: FleetViolation[] = [];

  const dimensions: {
    field: 'memory_max' | 'cpu_quota' | 'tasks_max';
    limit: number | undefined;
    share: (layout: InstanceLayout) => number | undefined;
    format: (value: number) => string;
    why: string;
  }[] = [
    {
      field: 'memory_max',
      limit: budget.memory_max === undefined ? undefined : parseSize('the host budget memory_max', budget.memory_max),
      share: layout =>
        layout.resources.memory_max === undefined
          ? undefined
          : parseSize(`instance '${layout.instance}' resources.memory_max`, layout.resources.memory_max),
      format: formatSize,
      why: 'the kernel decides which museum dies when they are all busy at once',
    },
    {
      field: 'cpu_quota',
      limit: budget.cpu_quota === undefined ? undefined : parsePercent('the host budget cpu_quota', budget.cpu_quota),
      share: layout =>
        layout.resources.cpu_quota === undefined
          ? undefined
          : parsePercent(`instance '${layout.instance}' resources.cpu_quota`, layout.resources.cpu_quota),
      format: value => `${value}%`,
      why: 'every build then runs slower than its own declaration promised, under load, for everyone',
    },
    {
      field: 'tasks_max',
      limit: budget.tasks_max,
      share: layout => layout.resources.tasks_max,
      format: value => String(value),
      why: 'the host runs out of pids and the failure lands on whichever museum forked next',
    },
  ];

  for (const dimension of dimensions) {
    if (dimension.limit === undefined) continue;

    let total = 0;
    const contributors: string[] = [];
    const unbounded: string[] = [];
    const breakdown: string[] = [];

    for (const layout of members) {
      const share = dimension.share(layout);
      if (share === undefined) {
        unbounded.push(layout.instance);
        continue;
      }
      total += share;
      contributors.push(layout.instance);
      breakdown.push(`${layout.instance}: ${dimension.format(share)}`);
    }

    if (unbounded.length > 0) {
      violations.push({
        kind: 'budget',
        instances: unbounded,
        shared: dimension.field,
        message:
          `the host states a ${dimension.field} budget of ${dimension.format(dimension.limit)}, ` +
          `but instance${unbounded.length === 1 ? '' : 's'} ${quoteList(unbounded)} declare` +
          `${unbounded.length === 1 ? 's' : ''} no resources.${dimension.field}. An unbounded ` +
          `member can take the whole host, which makes every other member's limit — and this ` +
          `budget — arithmetic about a fleet that does not exist.`,
      });
    }

    if (total > dimension.limit) {
      violations.push({
        kind: 'budget',
        instances: contributors,
        shared: dimension.field,
        message:
          `the fleet's declared ${dimension.field} sums to ${dimension.format(total)}, over the ` +
          `host budget of ${dimension.format(dimension.limit)} (${breakdown.join(', ')}). ` +
          `systemd starts every one of these units without a word — each limit is satisfiable ` +
          `alone — and ${dimension.why}.`,
      });
    }
  }

  return violations;
}

/** systemd sizes, in bytes. The grammar is layout's (SYSTEMD_SIZE_PATTERN); this is arithmetic. */
const SIZE_UNITS: Readonly<Record<string, number>> = Object.freeze({
  K: 1024,
  M: 1024 * 1024,
  G: 1024 * 1024 * 1024,
});

function parseSize(label: string, value: string): number {
  const match = /^(\d+)([KMG])$/.exec(value.trim());
  if (!match) {
    throw new Error(
      `fleet: ${label} is '${value}', which is not a systemd size such as '4G'. The budget ` +
        `arithmetic would silently be about zero. Nothing was provisioned.`,
    );
  }
  return Number(match[1]) * SIZE_UNITS[match[2]!]!;
}

/** Back to the spelling the operator wrote, so a report reads in the declaration's units. */
function formatSize(bytes: number): string {
  for (const unit of ['G', 'M', 'K'] as const) {
    const scale = SIZE_UNITS[unit]!;
    if (bytes % scale === 0 && bytes >= scale) return `${bytes / scale}${unit}`;
  }
  return `${bytes}B`;
}

function parsePercent(label: string, value: string): number {
  const match = /^(\d+)%$/.exec(value.trim());
  if (!match) {
    throw new Error(
      `fleet: ${label} is '${value}', which is not a systemd CPU share such as '150%'. The ` +
        `budget arithmetic would silently be about zero. Nothing was provisioned.`,
    );
  }
  return Number(match[1]);
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The TCP listener that does not exist — tripwired, not assumed
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * Names a listener declaration would plausibly take, in the vocabulary a layout speaks.
 * The twin of `TCP_LISTENER_HINTS` in `src/provision/render/engine_fragment.ts` — grep for
 * either and find both.
 */
const TCP_LISTENER_HINTS: readonly string[] = Object.freeze([
  'listener',
  'listen',
  'tcp',
  'bind',
  'port',
]);

/**
 * WHY A PORT IS NOT IN THE CENSUS ABOVE, EXPRESSED AS A GATE.
 *
 * The fleet law says no two instances may share a TCP port. Today none can, because none
 * has one: the engine reaches this daemon over a unix socket (0660 `<user>:<engineGroup>`),
 * `instanceManifestSchema` is strict, and `derive()` produces no port. A census row for
 * ports would therefore be a loop over an empty list — a check nothing can fail, which is
 * a check nobody keeps honest.
 *
 * The real risk is the day a listener becomes declarable: a port would be derived, two
 * museums would be given the same one by an operator who had no reason to think it
 * mattered, and this file would still be reporting a disjoint fleet. So the invariant is
 * TRIPWIRED instead of assumed — a layout carrying anything port-shaped refuses here, by
 * name, and the census gains its row in the same commit that makes ports possible. The
 * subsystem's law is that an invariant is tripwired or deleted; this one is tripwired.
 */
function assertNoTcpListener(layout: InstanceLayout): void {
  const declared = (layout ?? {}) as unknown as Record<string, unknown>;
  for (const hint of TCP_LISTENER_HINTS) {
    if (declared[hint] === undefined) continue;
    throw new Error(
      `fleet: instance '${String(declared.instance)}' carries a '${hint}', which this census ` +
        `does not understand. The fleet law requires that no two instances share a TCP port; ` +
        `it holds today only because no port can be declared. If one now can, add its row to ` +
        `the census in src/provision/fleet.ts — a fleet check that silently ignores ports ` +
        `reports two museums bound to one listener as disjoint. Nothing was provisioned.`,
    );
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Small shared helpers
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * The order violations are reported in — a pure function of the FLEET and not of the order
 * its members happened to be read in, for the same reason `renderAll` sorts by path: a
 * report that reshuffles when a directory listing does cannot be diffed between runs.
 */
const KIND_ORDER: readonly FleetViolationKind[] = Object.freeze([
  'instance',
  'user',
  'group',
  'path',
  'hostname',
  'budget',
]);

function byViolation(a: FleetViolation, b: FleetViolation): number {
  const kind = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
  if (kind !== 0) return kind;
  const instances = byName(a.instances.join(','), b.instances.join(','));
  if (instances !== 0) return instances;
  return byName(a.shared, b.shared);
}

/** Byte order, never locale order: a report must not depend on the host's LANG. */
function byName(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function quoteList(names: readonly string[]): string {
  return names.map(name => `'${name}'`).join(', ');
}

/** An error's message, without assuming anything threw an Error. */
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
