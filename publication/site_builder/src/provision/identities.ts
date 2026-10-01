/**
 * THE SITE-IDENTITY LEDGER — which ordinal each declared site holds, decided from what the
 * HOST says and VERIFIED, never trusted (LEAD-1b, spec §2.1).
 *
 * THE LEDGER IS /etc/passwd. There is no state file: an account `dedalo-a-<instance>_<k>`
 * whose GECOS is `dedalo site <slug>` IS the binding of <slug> to ordinal k. It is:
 *
 *   - ACTIVE when not retired and its slug is declared — the site keeps k forever;
 *   - RETIRED when its shadow EXPIRY is day 1 (`usermod --lock --expiredate 1`, which only
 *     this provisioner's retirement sets) — its ordinal is never handed out again (a uid that
 *     owned a site's files must not become another site's), and a slug that is removed and
 *     declared again gets a NEW k;
 *   - REMOVED when not retired and its slug is no longer declared — the plan retires it
 *     (never `userdel`).
 *
 * WHY NOT THE PASSWORD LOCK. `passwd -S` reports L for any password field starting with '!'
 * or '*', and `useradd` without `-p` WRITES '!' (shadow-utils: `user_pass = "!"`) — so every
 * identity this provisioner creates reads as locked from birth. A ledger that read the lock
 * would retire every site on the next apply (new uids, new epoch, every token dropped, the
 * old units left enabled) and exhaust the ordinals. The expiry is the one field only the
 * retirement writes. A shadow entry that cannot be read is NOT read as either: the plan
 * refuses (run as root).
 *
 * A new slug gets `max(every k, retired included) + 1`. At most MAX_AGENT_ORDINAL ordinals
 * exist in an instance's lifetime.
 *
 * EVERY EXISTING ACCOUNT IS PROVED. The pre-LEAD-1b planner skipped `useradd` for any name
 * that existed, whatever it was — so an account planted before the provisioner ran (a shared
 * uid, a foreign member in its private group, root's uid) would have become a site's identity
 * by coincidence of name. Here each is checked: primary gid = the instance group; its own
 * private group exists and holds exactly {service user, itself}; its uid is distinct from
 * every other identity's, from root's, from the service user's AND FROM EVERY OTHER ACCOUNT THE
 * HOST ENUMERATES (another museum's identities included); its private group's gid likewise
 * from every other group; and it is listed in NO group but its own private group (and,
 * harmlessly, its instance group) — PID 1 applies initgroups under User=, so a membership in
 * `adm` or another museum's instance group would ride into every run. A violation REFUSES the
 * instance's plan, naming the account — never a silent repair of an account this tool did not
 * create.
 *
 * HONEST LIMIT — ENUMERATION. The host-wide proofs read `getent passwd` / `getent group`
 * ENUMERATIONS. An NSS source that does not enumerate (sssd's default `enumerate = false`, most
 * LDAP setups) lists nothing there, so a uid, gid or membership held only in such a source is
 * not seen by the PLAN. A lookup by id does not close it either (`getent passwd <uid>` answers
 * the FIRST source's entry, which is the identity itself). What does hold there is the RUN-TIME
 * proof (drivers/confinement.ts `confinementProblems`): `id -G <identity>` resolves the
 * identity's groups through NSS by name, so an extra group from any source refuses every run.
 *
 * TWO THINGS AN INTERRUPTED APPLY LEAVES are handled, not wedged on: a private group whose
 * `useradd` never ran (no foreign member, a gid of its own) is ADOPTED by the identity that
 * takes its name — `groupadd` is never planned for a group that exists — and the SYSTEM id
 * budget (login.defs SYS_UID/SYS_GID ranges) is checked BEFORE anything is created, so a full
 * range is a refusal of the plan rather than a half-applied run.
 *
 * PURE: `(layout, ledger) → allocation`, no host access. `apply.ts::observeHost` reads the
 * ledger; a gate builds one by hand.
 */

import {
  agentIdentityName,
  identityGecos,
  isAgentOrdinal,
  MAX_AGENT_ORDINAL,
  parseAgentIdentityName,
  slugFromGecos,
} from '../drivers/agent_identity';
import type { InstanceLayout } from './layout';

/** The shadow expiry (days since the epoch) that marks a RETIRED identity: `--expiredate 1`. */
export const RETIRED_EXPIRE_DAYS = 1;

/** One account, as `getent passwd` and `getent shadow` report it. */
export interface LedgerAccount {
  readonly name: string;
  readonly uid: number;
  /** Primary gid. */
  readonly gid: number;
  readonly gecos: string;
  /**
   * Its shadow expiry is RETIRED_EXPIRE_DAYS. `null` when its shadow entry could not be read
   * (not root, an NSS source without shadow) — unknown, never guessed either way.
   */
  readonly retired: boolean | null;
}

/** One group, as `getent group` reports it. */
export interface LedgerGroup {
  readonly name: string;
  readonly gid: number;
  readonly members: readonly string[];
}

/** One name and its numeric id, as a whole `getent passwd` / `group` enumeration lists it. */
export interface HostId {
  readonly name: string;
  readonly id: number;
}

/**
 * One account of the whole `getent passwd` enumeration: name, uid (`id`) and PRIMARY gid. The
 * primary gid is a group membership `getent group` never lists (a member list holds only
 * SUPPLEMENTARY members), so it is read here, from passwd field 4 — or the private-group proof
 * would miss the one principal whose membership no group line names.
 */
export interface HostAccount extends HostId {
  readonly gid: number;
}

/**
 * The SYSTEM id ranges `useradd --system` / `groupadd --system` allocate from (login.defs
 * `SYS_UID_MIN`/`SYS_UID_MAX`, `SYS_GID_MIN`/`SYS_GID_MAX`; shadow-utils' defaults when unset:
 * 101 .. UID_MIN-1, UID_MIN 1000).
 */
export interface SystemIdRanges {
  readonly uidMin: number;
  readonly uidMax: number;
  readonly gidMin: number;
  readonly gidMax: number;
}

/**
 * The accounts and groups the plan reasons about: every name in this instance's identity
 * namespace, the retired per-museum agent, the service user and the instance group — and, for
 * the HOST-WIDE proofs, every account and group the host enumerates and its system id ranges.
 */
export interface AgentLedger {
  readonly accounts: readonly LedgerAccount[];
  readonly groups: readonly LedgerGroup[];
  /**
   * EVERY account the host enumerates, by name and uid — the proof that no OTHER principal
   * (another museum's identity, `nobody`, an LDAP entry) holds a site identity's uid, and the
   * uid budget. Absent only in a hand-built ledger; then only `accounts` are compared.
   */
  readonly hostAccounts?: readonly HostAccount[];
  /** EVERY group the host enumerates, by name and gid (the private-gid proof, the gid budget). */
  readonly hostGroups?: readonly HostId[];
  /** Where `--system` ids come from; the plan refuses a run that would exhaust them. */
  readonly systemIds?: SystemIdRanges;
  /**
   * For each name in this instance's identity namespace: EVERY enumerated group whose member
   * list names it (host-wide — another museum's, `adm`, `shadow`). Absent in a hand-built ledger.
   */
  readonly identityMemberships?: ReadonlyMap<string, readonly string[]>;
}

export const EMPTY_LEDGER: AgentLedger = Object.freeze({ accounts: Object.freeze([]), groups: Object.freeze([]) });

/** What `getent passwd`, `getent shadow`, `getent group` and `/etc/login.defs` said; null when unread. */
export interface LedgerText {
  readonly passwd: string | null;
  readonly shadow: string | null;
  readonly group: string | null;
  /** `/etc/login.defs`; absent or null = shadow-utils' compiled-in defaults. */
  readonly loginDefs?: string | null;
}

/** login.defs → the system id ranges, with shadow-utils' defaults for what it does not set. */
export function parseLoginDefs(text: string | null | undefined): SystemIdRanges {
  const value = (key: string): number | undefined => {
    const match = new RegExp(`^\\s*${key}\\s+(\\d+)\\s*(?:#.*)?$`, 'm').exec(text ?? '');
    return match ? Number(match[1]) : undefined;
  };
  const uidMin = value('UID_MIN') ?? 1000;
  const gidMin = value('GID_MIN') ?? 1000;
  return Object.freeze({
    uidMin: value('SYS_UID_MIN') ?? 101,
    uidMax: value('SYS_UID_MAX') ?? uidMin - 1,
    gidMin: value('SYS_GID_MIN') ?? 101,
    gidMax: value('SYS_GID_MAX') ?? gidMin - 1,
  });
}

/** Every `name:x:uid:gid:…` line of a `getent passwd` enumeration, primary gid included. */
function hostAccountIds(text: string | null): HostAccount[] {
  const out: HostAccount[] = [];
  for (const line of (text ?? '').split('\n')) {
    const [name, , id, gid] = line.split(':');
    if (name && /^\d+$/.test(id ?? '') && /^\d+$/.test(gid ?? '')) out.push(Object.freeze({ name, id: Number(id), gid: Number(gid) }));
  }
  return out;
}

/** Every `name:…:id:…` line of an enumeration. */
function hostIds(text: string | null): HostId[] {
  const out: HostId[] = [];
  for (const line of (text ?? '').split('\n')) {
    const [name, , id] = line.split(':');
    if (name && /^\d+$/.test(id ?? '')) out.push(Object.freeze({ name, id: Number(id) }));
  }
  return out;
}

/**
 * THE LEDGER, PARSED — pure, from the three databases' own text (`name:x:uid:gid:gecos:home:shell`,
 * `name:pw:lastchg:min:max:warn:inactive:expire:reserved`, `name:x:gid:members`). Only this
 * instance's identity namespace, the retired agent, the service user and the instance group.
 * The password field is never read: see the header.
 */
export function parseAgentLedger(layout: InstanceLayout, text: LedgerText): AgentLedger {
  const wanted = (name: string): boolean =>
    name === layout.identity.user ||
    name === layout.identity.agentUser ||
    parseAgentIdentityName(name)?.instance === layout.instance;
  const expiries = new Map<string, string>();
  for (const line of (text.shadow ?? '').split('\n')) {
    const fields = line.split(':');
    if (fields.length >= 8 && fields[0]) expiries.set(fields[0], fields[7] ?? '');
  }
  const accounts: LedgerAccount[] = [];
  for (const line of (text.passwd ?? '').split('\n')) {
    const [name, , uid, gid, gecos] = line.split(':');
    if (!name || !wanted(name) || !/^\d+$/.test(uid ?? '') || !/^\d+$/.test(gid ?? '')) continue;
    const expire = expiries.get(name);
    accounts.push(
      Object.freeze({
        name,
        uid: Number(uid),
        gid: Number(gid),
        gecos: gecos ?? '',
        retired: expire === undefined ? null : expire.trim() === String(RETIRED_EXPIRE_DAYS),
      }),
    );
  }
  const groups: LedgerGroup[] = [];
  const memberships = new Map<string, string[]>();
  for (const line of (text.group ?? '').split('\n')) {
    const [name, , gid, members] = line.split(':');
    if (!name || !/^\d+$/.test(gid ?? '')) continue;
    const listed = (members ?? '').split(',').filter(Boolean);
    // HOST-WIDE: which groups list one of THIS instance's identities (its full membership).
    for (const member of listed) {
      if (parseAgentIdentityName(member)?.instance !== layout.instance) continue;
      memberships.set(member, [...(memberships.get(member) ?? []), name]);
    }
    if (!(name === layout.identity.group || wanted(name))) continue;
    groups.push(Object.freeze({ name, gid: Number(gid), members: Object.freeze(listed) }));
  }
  return Object.freeze({
    accounts: Object.freeze(accounts),
    groups: Object.freeze(groups),
    hostAccounts: Object.freeze(hostAccountIds(text.passwd)),
    hostGroups: Object.freeze(hostIds(text.group)),
    systemIds: parseLoginDefs(text.loginDefs),
    identityMemberships: new Map([...memberships].map(([member, names]) => [member, Object.freeze(names)])),
  });
}

/** A site identity the plan must create. */
export interface NewIdentity {
  readonly slug: string;
  readonly k: number;
  readonly name: string;
  /** The slug held a (now retired) identity before: its workspace may hold that uid's files. */
  readonly redeclared: boolean;
  /**
   * Its private group ALREADY EXISTS, verified (no foreign member, a gid of its own): what an
   * apply that died between `groupadd` and `useradd` leaves. Adopted — never `groupadd`ed
   * again (exit 9 would wedge every later apply).
   */
  readonly groupExists: boolean;
}

/** An active identity whose site is no longer declared. */
export interface RemovedIdentity {
  readonly slug: string;
  readonly k: number;
  readonly name: string;
}

export interface IdentityAllocation {
  /** Declared slug → k, for every declared site (kept or new). */
  readonly identities: ReadonlyMap<string, number>;
  /** Accounts to create, in declaration order. */
  readonly created: readonly NewIdentity[];
  /** Accounts to retire: their sites are gone. */
  readonly removed: readonly RemovedIdentity[];
  /** Declared slug → the RETIRED identities its GECOS still binds (an earlier incarnation's uids). */
  readonly retiredBySlug: ReadonlyMap<string, readonly string[]>;
  /** The retired per-museum agent account exists at all (retired or not). */
  readonly legacyExists: boolean;
  /** Private groups (by identity name) that exist but lack the service user. */
  readonly missingServiceMembership: readonly string[];
  /** Private groups (by identity name) that do not exist yet for an EXISTING identity. */
  readonly missingPrivateGroups: readonly string[];
  /** The retired per-museum agent account is present and not yet retired (expiry day 1). */
  readonly legacyActive: boolean;
}

/** A refusal of the ledger itself. The message names the account and what is wrong with it. */
export class IdentityLedgerError extends Error {
  constructor(instance: string, problems: readonly string[]) {
    super(
      `identities(${instance}): the host's site-identity ledger cannot be trusted — ${problems.join(' ')} ` +
        `Nothing was planned: an account this provisioner did not create (or one changed since) is ` +
        `never adopted as a site's identity by coincidence of name. Repair or lock it by hand.`,
    );
    this.name = 'IdentityLedgerError';
  }
}

/**
 * ALLOCATE AND VERIFY. Throws `IdentityLedgerError` naming every violation at once.
 */
export function allocateIdentities(layout: InstanceLayout, ledger: AgentLedger = EMPTY_LEDGER): IdentityAllocation {
  const instance = layout.instance;
  const svc = layout.identity.user;
  const problems: string[] = [];
  const groupByName = new Map(ledger.groups.map(group => [group.name, group]));
  const instanceGid = groupByName.get(layout.identity.group)?.gid;
  const svcAccount = ledger.accounts.find(account => account.name === svc);

  // This instance's identities, by ordinal.
  const mine: Array<{ account: LedgerAccount; k: number; slug: string | null }> = [];
  for (const account of ledger.accounts) {
    const parsed = parseAgentIdentityName(account.name);
    if (!parsed || parsed.instance !== instance) continue;
    mine.push({ account, k: parsed.ordinal, slug: slugFromGecos(account.gecos) });
  }
  mine.sort((a, b) => a.k - b.k);

  // RETIRED OR NOT is a fact read from the shadow expiry; unread, it is not guessed.
  const legacyAccount = ledger.accounts.find(account => account.name === layout.identity.agentUser);
  for (const account of [...mine.map(({ account }) => account), ...(legacyAccount ? [legacyAccount] : [])]) {
    if (account.retired === null) {
      problems.push(
        `'${account.name}''s shadow entry could not be read, so whether it is retired is unknown (run as root: ` +
          `a retired identity is one whose expiry is day ${RETIRED_EXPIRE_DAYS}).`,
      );
    }
  }

  // THE UIDS: distinct across every identity (retired included), never root's, never the
  // service user's.
  const byUid = new Map<number, string>();
  for (const { account } of mine) {
    if (account.uid === 0) problems.push(`'${account.name}' has uid 0 (root).`);
    if (svcAccount && account.uid === svcAccount.uid) {
      problems.push(`'${account.name}' has the service user '${svc}''s uid ${account.uid}.`);
    }
    const first = byUid.get(account.uid);
    if (first !== undefined) {
      problems.push(`'${first}' and '${account.name}' share uid ${account.uid} — one uid would be two sites.`);
    } else {
      byUid.set(account.uid, account.name);
    }
  }
  // HOST-WIDE, not only among this instance's identities: an identity's uid held by ANY other
  // account (another museum's identity after a merged or restored /etc/passwd, NSS/LDAP,
  // `usermod -o -u`, `nobody`) is one principal to the kernel — its processes read the other's
  // /proc/<pid>/environ and cwd. (Pairs inside this instance and the service user are named above.)
  const known = new Set([...mine.map(({ account }) => account.name), svc]);
  const everyAccount: HostId[] = [
    ...ledger.accounts.map(account => ({ name: account.name, id: account.uid })),
    ...(ledger.hostAccounts ?? []),
  ];
  for (const { account } of mine) {
    const holders = [
      ...new Set(everyAccount.filter(other => other.id === account.uid && !known.has(other.name)).map(other => other.name)),
    ];
    if (holders.length > 0) {
      problems.push(
        `'${account.name}' has uid ${account.uid}, which ${holders.map(name => `'${name}'`).join(', ')} also ` +
          `hold${holders.length === 1 ? 's' : ''} — two principals, one uid.`,
      );
    }
  }

  // THE ACTIVE ONES: primary group, private group, membership.
  const missingServiceMembership: string[] = [];
  const missingPrivateGroups: string[] = [];
  const activeBySlug = new Map<string, number>();
  for (const { account, k, slug } of mine) {
    if (account.retired !== false) continue;
    if (slug === null) {
      problems.push(`'${account.name}' is not retired and its GECOS ('${account.gecos}') names no site ('${identityGecos('<slug>')}').`);
      continue;
    }
    const other = activeBySlug.get(slug);
    if (other !== undefined) {
      problems.push(`site '${slug}' is bound to two active identities (s${other} and s${k}).`);
      continue;
    }
    activeBySlug.set(slug, k);
    // ITS GROUPS ARE {instance group, private group}, nothing else: PID 1's initgroups hands a
    // run EVERY group its identity is listed in.
    const beyond = [...new Set(ledger.identityMemberships?.get(account.name) ?? [])].filter(
      name => name !== account.name && name !== layout.identity.group,
    );
    if (beyond.length > 0) {
      problems.push(
        `'${account.name}' is a member of ${beyond.map(name => `'${name}'`).join(', ')} — beyond its instance group ` +
          `and its own private group; every run of site '${slug}' would carry ${beyond.length === 1 ? 'it' : 'them'} ` +
          `(initgroups under User=). Remove the membership (gpasswd -d ${account.name} <group>).`,
      );
    }
    if (instanceGid === undefined) {
      problems.push(`'${account.name}' exists but the instance group '${layout.identity.group}' does not.`);
    } else if (account.gid !== instanceGid) {
      problems.push(
        `'${account.name}''s primary gid is ${account.gid}, not the instance group '${layout.identity.group}' (${instanceGid}).`,
      );
    }
    const privateGroup = groupByName.get(account.name);
    if (!privateGroup) {
      missingPrivateGroups.push(account.name);
      continue;
    }
    if (!privateGroup.members.includes(account.name)) {
      problems.push(`'${account.name}' is not a member of its own private group '${privateGroup.name}'.`);
    }
    const foreign = privateGroup.members.filter(member => member !== account.name && member !== svc);
    if (foreign.length > 0) {
      problems.push(
        `the private group '${privateGroup.name}' has members other than '${svc}' and '${account.name}': ` +
          `${foreign.map(member => `'${member}'`).join(', ')}.`,
      );
    }
    if (!privateGroup.members.includes(svc)) missingServiceMembership.push(privateGroup.name);
    if (privateGroup.gid === instanceGid) {
      problems.push(`the private group '${privateGroup.name}' has the instance group's gid ${privateGroup.gid}.`);
    }
  }

  // A group in this instance's namespace with no account: either a plant waiting for one
  // (foreign members — refused), or what an apply that died between `groupadd` and `useradd`
  // left (no foreign member, a gid of its own — ADOPTED below, never `groupadd`ed again).
  const orphanGroups = new Set<string>();
  for (const group of ledger.groups) {
    const parsed = parseAgentIdentityName(group.name);
    if (!parsed || parsed.instance !== instance) continue;
    if (!mine.some(({ account }) => account.name === group.name)) {
      const foreign = group.members.filter(member => member !== svc && member !== group.name);
      if (foreign.length > 0) {
        problems.push(
          `the group '${group.name}' has no account yet already has members ${foreign.map(member => `'${member}'`).join(', ')}.`,
        );
      } else if (group.gid === instanceGid) {
        problems.push(`the group '${group.name}' has no account and the instance group's gid ${group.gid}.`);
      } else {
        orphanGroups.add(group.name);
      }
    }
  }

  // EVERY PRIVATE GROUP'S GID IS ITS OWN — host-wide: another group holding it (another
  // museum's, a hand-made one, another site's of this instance) opens this site's 0660 egress
  // sockets to its members. (The instance group's gid is named above.)
  const everyGroup: HostId[] = [...ledger.groups.map(group => ({ name: group.name, id: group.gid })), ...(ledger.hostGroups ?? [])];
  for (const group of ledger.groups) {
    const parsed = parseAgentIdentityName(group.name);
    if (!parsed || parsed.instance !== instance) continue;
    const sharing = [
      ...new Set(
        everyGroup
          .filter(other => other.id === group.gid && other.name !== group.name && other.name !== layout.identity.group)
          .map(other => other.name),
      ),
    ];
    if (sharing.length > 0) {
      problems.push(
        `the private group '${group.name}' has gid ${group.gid}, which ${sharing.map(name => `'${name}'`).join(', ')} also ` +
          `ha${sharing.length === 1 ? 's' : 've'} — its members would open this site's egress sockets.`,
      );
    }
  }

  // NO ACCOUNT HAS A PRIVATE GROUP AS ITS PRIMARY GROUP — the membership `getent group` never
  // lists. A restored passwd line or an LDAP `gidNumber` equal to a private gid makes that
  // principal a member of the site's group to the kernel: it traverses the 0770 egress
  // directory and connects to the 0660 gate sockets (mcp.sock carries the museum's Publication
  // API key). Only the site's own identity and the service user may be members at all.
  const everyAccountWithGid: HostAccount[] = [
    ...ledger.accounts.map(account => ({ name: account.name, id: account.uid, gid: account.gid })),
    ...(ledger.hostAccounts ?? []),
  ];
  for (const group of ledger.groups) {
    const parsed = parseAgentIdentityName(group.name);
    if (!parsed || parsed.instance !== instance) continue;
    const primaries = [
      ...new Set(
        everyAccountWithGid
          .filter(account => account.gid === group.gid && account.name !== group.name && account.name !== svc)
          .map(account => account.name),
      ),
    ];
    if (primaries.length > 0) {
      problems.push(
        `the private group '${group.name}' (gid ${group.gid}) is the PRIMARY group of ` +
          `${primaries.map(name => `'${name}'`).join(', ')} — a membership no group line lists, which would open ` +
          `this site's egress sockets to ${primaries.length === 1 ? 'it' : 'them'}.`,
      );
    }
  }

  if (problems.length > 0) throw new IdentityLedgerError(instance, problems);

  // ALLOCATION.
  const identities = new Map<string, number>();
  const created: NewIdentity[] = [];
  let highest = mine.reduce((max, { k }) => Math.max(max, k), 0);
  const retiredBySlug = new Map<string, string[]>();
  for (const { account, slug } of mine) {
    if (account.retired !== true || slug === null) continue;
    retiredBySlug.set(slug, [...(retiredBySlug.get(slug) ?? []), account.name]);
  }
  const retiredSlugs = new Set(retiredBySlug.keys());
  for (const site of layout.sites) {
    const kept = activeBySlug.get(site.slug);
    if (kept !== undefined) {
      identities.set(site.slug, kept);
      continue;
    }
    highest += 1;
    if (!isAgentOrdinal(highest)) {
      throw new IdentityLedgerError(instance, [
        `site '${site.slug}' needs ordinal ${highest}, and an instance has ${MAX_AGENT_ORDINAL} in its lifetime ` +
          `(ordinals are never reused).`,
      ]);
    }
    identities.set(site.slug, highest);
    const name = agentIdentityName(instance, highest);
    created.push({
      slug: site.slug,
      k: highest,
      name,
      redeclared: retiredSlugs.has(site.slug),
      groupExists: orphanGroups.has(name),
    });
  }

  // THE ID BUDGET — refused BEFORE any groupadd, never discovered as a half-applied run:
  // `useradd --system` / `groupadd --system` take ids only from login.defs' SYS_ ranges.
  if (ledger.systemIds && ledger.hostAccounts && ledger.hostGroups) {
    const { uidMin, uidMax, gidMin, gidMax } = ledger.systemIds;
    const freeIn = (ids: readonly HostId[], min: number, max: number) =>
      Math.max(0, max - min + 1) - new Set(ids.map(entry => entry.id).filter(id => id >= min && id <= max)).size;
    const needUids = created.length + (svcAccount ? 0 : 1);
    const needGids = created.filter(identity => !identity.groupExists).length + (instanceGid === undefined ? 1 : 0);
    const freeUids = freeIn(ledger.hostAccounts, uidMin, uidMax);
    const freeGids = freeIn(ledger.hostGroups, gidMin, gidMax);
    const short: string[] = [];
    if (needUids > freeUids) short.push(`${needUids} system uid(s) are needed and SYS_UID_MIN..SYS_UID_MAX (${uidMin}..${uidMax}) has ${freeUids} free`);
    if (needGids > freeGids) short.push(`${needGids} system gid(s) are needed and SYS_GID_MIN..SYS_GID_MAX (${gidMin}..${gidMax}) has ${freeGids} free`);
    if (short.length > 0) {
      throw new Error(
        `identities(${instance}): ${short.join('; ')} (/etc/login.defs). useradd/groupadd --system would fail ` +
          `part-way through the apply, leaving a group with no account. Widen the range in /etc/login.defs. ` +
          `Nothing was planned.`,
      );
    }
  }

  const declared = new Set(layout.sites.map(site => site.slug));
  const removed: RemovedIdentity[] = [];
  for (const [slug, k] of activeBySlug) {
    if (!declared.has(slug)) removed.push({ slug, k, name: agentIdentityName(instance, k) });
  }
  removed.sort((a, b) => a.k - b.k);

  const declaredRetired = new Map<string, readonly string[]>();
  for (const [slug, names] of retiredBySlug) if (declared.has(slug)) declaredRetired.set(slug, Object.freeze(names));

  return Object.freeze({
    identities,
    created: Object.freeze(created),
    removed: Object.freeze(removed),
    retiredBySlug: declaredRetired,
    legacyExists: legacyAccount !== undefined,
    missingServiceMembership: Object.freeze(missingServiceMembership),
    missingPrivateGroups: Object.freeze(missingPrivateGroups),
    legacyActive: legacyAccount !== undefined && legacyAccount.retired === false,
  });
}

/**
 * THE ORDINALS THE LEDGER ALREADY BINDS — declared slug → k for every ACTIVE identity, and
 * nothing decided. What the host OBSERVER uses to know which agent-unit paths to look at;
 * never a refusal (the plan makes those).
 */
export function ledgerOrdinals(layout: InstanceLayout, ledger: AgentLedger | undefined): Map<string, number> {
  const out = new Map<string, number>();
  const declared = new Set(layout.sites.map(site => site.slug));
  for (const account of ledger?.accounts ?? []) {
    const parsed = parseAgentIdentityName(account.name);
    // Retired identities have no units to look at; an UNREAD one is looked at (the plan refuses it).
    if (!parsed || parsed.instance !== layout.instance || account.retired === true) continue;
    const slug = slugFromGecos(account.gecos);
    if (slug && declared.has(slug) && !out.has(slug)) out.set(slug, parsed.ordinal);
  }
  return out;
}

/** Every ordinal the ledger knows for this instance (active or retired), sorted. */
export function ledgerAllOrdinals(layout: InstanceLayout, ledger: AgentLedger | undefined): number[] {
  const ks = new Set<number>();
  for (const account of ledger?.accounts ?? []) {
    const parsed = parseAgentIdentityName(account.name);
    if (parsed && parsed.instance === layout.instance) ks.add(parsed.ordinal);
  }
  return [...ks].sort((a, b) => a - b);
}
