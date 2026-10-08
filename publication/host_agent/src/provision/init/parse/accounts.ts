/**
 * DISCOVERY: the account databases and how the host resolves them (spec §3.2 rows NSS and
 * Accounts; §4.3 `host.nss`, `account.*`, `account.engine_group`).
 *
 * `getent passwd` / `getent group` give what NSS resolves (files AND any directory service).
 * Whether a directory service can ALSO answer — so that "absent" from a lookup is not proof
 * that `useradd` will not clash — is `host.nss`: files-only when every passwd/group source is
 * `files`, `systemd` or `compat`, or `sss` while sssd has no domain (RHEL's authselect writes
 * `sss files systemd` even then). sssd.conf holds credentials (ldap_default_authtok…): it is
 * reduced to the one boolean `sssdHasDomains`, never kept.
 *
 * PURE, ZERO-DEPENDENCY (tests/provision_zero_dep.test.ts): ../types only.
 */
import type { GroupRow, PasswdRow } from '../types';

function rows(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.replace(/\r$/, ''))
    .filter(line => line.trim() !== '' && !line.startsWith('#'));
}

function id(field: string, line: string): number {
  if (!/^\d+$/.test(field)) throw new Error(`parse(accounts): id '${field}' is not a number in '${line.slice(0, 120)}'`);
  return Number(field);
}

/** passwd(5): `name:x:uid:gid:gecos:home:shell`. */
export function parsePasswd(text: string): PasswdRow[] {
  return rows(text).map(line => {
    const fields = line.split(':');
    if (fields.length !== 7) throw new Error(`parse(accounts): passwd line has ${fields.length} fields, not 7: '${line.slice(0, 120)}'`);
    const [name, , uid, gid, , home, shell] = fields as [string, string, string, string, string, string, string];
    return Object.freeze({ name, uid: id(uid, line), gid: id(gid, line), home, shell });
  });
}

/** group(5): `name:x:gid:member,member`. */
export function parseGroup(text: string): GroupRow[] {
  return rows(text).map(line => {
    const fields = line.split(':');
    if (fields.length !== 4) throw new Error(`parse(accounts): group line has ${fields.length} fields, not 4: '${line.slice(0, 120)}'`);
    const [name, , gid, members] = fields as [string, string, string, string];
    return Object.freeze({ name, gid: id(gid, line), members: Object.freeze(members.split(',').filter(Boolean)) });
  });
}

export interface NsswitchSources {
  readonly passwd: readonly string[];
  readonly group: readonly string[];
}

/** nsswitch.conf(5): the services of `passwd:` and `group:`, `[STATUS=action]` items dropped; a missing line is glibc's default, `files`. */
export function parseNsswitch(text: string): NsswitchSources {
  const sources = new Map<string, string[]>();
  for (const line of rows(text)) {
    const match = /^\s*(passwd|group)\s*:\s*(.*?)\s*(?:#.*)?$/.exec(line);
    if (!match) continue;
    const services = (match[2] as string).replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(Boolean);
    sources.set(match[1] as string, services);
  }
  return Object.freeze({
    passwd: Object.freeze(sources.get('passwd') ?? ['files']),
    group: Object.freeze(sources.get('group') ?? ['files']),
  });
}

/** The services that answer only from local files (or systemd's dynamic users, which never clash with a system account name we choose). */
const LOCAL_SOURCES = ['files', 'systemd', 'compat'];

/** Files-only (§4.3 `host.nss`): every source is local, or `sss` while sssd serves no domain. */
export function nssFilesOnly(services: readonly string[], sssDomains: boolean): boolean {
  return services.every(service => LOCAL_SOURCES.includes(service) || (service === 'sss' && !sssDomains));
}

/**
 * sssd.conf (and each conf.d snippet): true when sssd may serve a domain — a non-empty
 * `domains =` in `[sssd]`, or ANY `[domain/<name>]` section (sssd ≥ 2 activates configured
 * domain sections without the list). Conservative on purpose: a wrong `true` costs a manual
 * decision, a wrong `false` would let init create an account a directory already names.
 */
export function sssdHasDomains(text: string): boolean {
  let section = '';
  for (const raw of text.split('\n')) {
    const line = raw.replace(/[#;].*$/, '').trim();
    if (line === '') continue;
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) {
      section = (header[1] as string).trim().toLowerCase();
      if (section.startsWith('domain/')) return true;
      continue;
    }
    const domains = /^domains\s*=\s*(.*)$/i.exec(line);
    if (domains && section === 'sssd' && (domains[1] as string).split(',').some(name => name.trim() !== '')) return true;
  }
  return false;
}

/**
 * `engine_group` must hold the work system's account ALONE (the agent's socket is 0660
 * <agent>:<engine_group>; docs/install/publication_host.md step 2): every account that gets
 * the group — as its primary group or as a supplementary member — must be `expectedUser`.
 * null when it does; otherwise the problem and the guide's checks.
 */
export function soleMemberProblem(
  group: string,
  expectedUser: string,
  users: readonly PasswdRow[],
  groups: readonly GroupRow[],
): string | null {
  const row = groups.find(entry => entry.name === group);
  if (row === undefined) return `group '${group}' does not exist — declare the group the work system's process runs with (id -gn ${expectedUser})`;
  const members = new Set<string>([...row.members, ...users.filter(user => user.gid === row.gid).map(user => user.name)]);
  const others = [...members].filter(name => name !== expectedUser).sort();
  if (others.length === 0 && members.has(expectedUser)) return null;
  const fix = `getent group ${group} (it must list no members); awk -F: '$4 == ${row.gid} {print $1}' /etc/passwd (it must print ${expectedUser} alone)`;
  if (others.length > 0) {
    return `group '${group}' is also held by ${others.map(name => `'${name}'`).join(', ')} — every member can open the agent's socket; give ${expectedUser} a group of its own. Check: ${fix}`;
  }
  return `user '${expectedUser}' is not in group '${group}' — the work system could not open the agent's socket. Check: ${fix}`;
}
