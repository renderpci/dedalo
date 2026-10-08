/**
 * ACCESS — pure: can an ACCOUNT, with the credentials its process actually gets, read /
 * traverse / execute a path? Judged like the kernel's DAC check (path_resolution(7),
 * inode_permission): EXACTLY ONE class of mode bits applies —
 *   - the owner bits when the process uid owns the path (even if the group or other bits
 *     would grant more: a 0077 file is unreadable by its owner);
 *   - else the group bits when ANY of the process gids owns it;
 *   - else the other bits.
 * uid 0 (CAP_DAC_OVERRIDE) reads and traverses anything and executes a file with any x bit.
 * POSIX ACLs are NOT seen (lstat mode bits only): with an ACL the group bits are its mask, so a
 * named-user entry could grant what this denies — the verdict errs toward refusing, never
 * toward a unit that dies EACCES.
 *
 * CREDENTIALS (what systemd gives a unit's process, systemd.exec(5) User=/Group=/
 * SupplementaryGroups=): the uid of User=; the gid of Group= (or the user's primary gid when
 * the unit renders no Group=); every SupplementaryGroups= gid; and the user's supplementary
 * groups from the user database (systemd runs initgroups/getgrouplist for User=, seeded with
 * the unit's gid). The database answer (`id -G`) lists the primary gid too; it is subtracted
 * when the unit sets another Group= — getgrouplist only re-adds it when /etc/group names the
 * user as a member of its own primary group, which `id -G` cannot tell apart, so the verdict
 * again errs toward refusing. An account with no unit of ours (v1: the site's PHP-FPM pool)
 * gets its primary gid + the database groups (a pool file's own `group =` is not seen: the
 * declaration names the pool's user, not its group).
 *
 * ZERO-DEPENDENCY (tests/provision_zero_dep.test.ts).
 */

/** The bits one class grants. */
export const READ = 0o4;
export const WRITE = 0o2;
export const EXECUTE = 0o1;

export interface AccessFacts {
  readonly type: 'dir' | 'file' | 'symlink' | 'other';
  readonly uid: number;
  readonly gid: number;
  /** Permission bits (`& 0o7777`). */
  readonly mode: number;
}

/** An account's database groups: `id -g` (primary) and `id -G` (all, primary included). */
export interface AccountGroups {
  readonly primary: number;
  readonly all: readonly number[];
}

/** What a process of the account runs with. */
export interface Credentials {
  readonly uid: number;
  readonly gids: readonly number[];
}

/** Which class of mode bits the kernel consults for this process on this path. */
export type AccessClass = 'root' | 'u' | 'g' | 'o';

export function accessClass(facts: AccessFacts, cred: Credentials): AccessClass {
  if (cred.uid === 0) return 'root';
  if (facts.uid === cred.uid) return 'u';
  if (cred.gids.includes(facts.gid)) return 'g';
  return 'o';
}

/** The bits of `need` (READ|WRITE|EXECUTE) the process LACKS on the path; 0 = granted. */
export function missingAccess(facts: AccessFacts, cred: Credentials, need: number): number {
  const cls = accessClass(facts, cred);
  if (cls === 'root') {
    // DAC override: everything, except executing a file no class may execute.
    const anyExec = (facts.mode & 0o111) !== 0;
    return facts.type !== 'dir' && (need & EXECUTE) !== 0 && !anyExec ? EXECUTE : 0;
  }
  const shift = cls === 'u' ? 6 : cls === 'g' ? 3 : 0;
  const granted = (facts.mode >> shift) & 0o7;
  return need & ~granted & 0o7;
}

export function permits(facts: AccessFacts, cred: Credentials, need: number): boolean {
  return missingAccess(facts, cred, need) === 0;
}

/** `rx`, `x`, … — the letters of a bit set, in rwx order. */
export function accessLetters(bits: number): string {
  return `${bits & READ ? 'r' : ''}${bits & WRITE ? 'w' : ''}${bits & EXECUTE ? 'x' : ''}`;
}

/**
 * The narrowest chmod that grants the missing bits to THIS process: on the class the kernel
 * consults for it (`chmod o+x /home/site`), never a wider one. null when nothing is missing.
 */
export function chmodFix(path: string, facts: AccessFacts, cred: Credentials, need: number): string | null {
  const missing = missingAccess(facts, cred, need);
  if (missing === 0) return null;
  const cls = accessClass(facts, cred);
  return `chmod ${cls === 'root' ? 'a' : cls}+${accessLetters(missing)} ${path}`;
}

function unique(values: readonly number[]): number[] {
  return [...new Set(values)];
}

/**
 * A unit's process credentials. `group` = the gid of the unit's Group=, or null when the unit
 * renders none (the user's primary gid applies). `supplementary` = the SupplementaryGroups= gids.
 */
export function unitCredentials(
  uid: number,
  group: number | null,
  supplementary: readonly number[],
  database: AccountGroups,
): Credentials {
  const primary = group ?? database.primary;
  const fromDatabase = database.all.filter(gid => gid !== database.primary);
  return Object.freeze({ uid, gids: Object.freeze(unique([primary, ...supplementary, ...fromDatabase])) });
}

/** A process no unit of ours starts (v1: the site's PHP-FPM pool): its database groups. */
export function accountCredentials(uid: number, database: AccountGroups): Credentials {
  return Object.freeze({ uid, gids: Object.freeze(unique([database.primary, ...database.all])) });
}
