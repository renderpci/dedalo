/**
 * THE ACCOUNTS A FAKE HOST HOLDS — as `useradd`/`usermod` would leave them, and as `getent`
 * would print them. Every provisioning gate with a synthetic host routes its accounts through
 * here, so what the plan reads is the REAL parser (`identities.ts::parseAgentLedger`) over the
 * databases' own text, never a hand-set "locked" flag.
 *
 * What shadow-utils does, restated (and the reason this file exists): `useradd` with no `-p`
 * writes the password field `!` (useradd.c `user_pass = "!"`) — the field `passwd -S` then
 * reports as L, locked — and no expiry; `usermod --lock` prefixes the field with `!`, and
 * `--expiredate N` sets field 8 to N (days since the epoch). A fake that created accounts
 * "unlocked" would hide a ledger that read the lock as retirement.
 */

import { type AgentLedger, parseAgentLedger } from '../../src/provision/identities';
import type { InstanceLayout } from '../../src/provision/layout';

export interface FakeAccount {
  readonly name: string;
  readonly uid: number;
  readonly gid: number;
  readonly gecos: string;
  /** The shadow password field. */
  readonly password: string;
  /** The shadow expiry field (days since the epoch), '' for none. */
  readonly expire: string;
}

export interface FakeGroup {
  readonly name: string;
  readonly gid: number;
  readonly members: readonly string[];
}

/** What `useradd` (no `-p`) leaves: the `!` password, no expiry. */
export function useraddAccount(name: string, uid: number, gid: number, gecos: string): FakeAccount {
  return { name, uid, gid, gecos, password: '!', expire: '' };
}

/** What `usermod <argv>` does to `account`: `--lock` prefixes `!`, `--expiredate N` sets the expiry. */
export function usermodAccount(account: FakeAccount, argv: readonly string[]): FakeAccount {
  let next = account;
  if (argv.includes('--lock') || argv.includes('-L')) next = { ...next, password: `!${next.password}` };
  const at = argv.findIndex(arg => arg === '--expiredate' || arg === '-e');
  if (at >= 0 && argv[at + 1] !== undefined) next = { ...next, expire: String(argv[at + 1]) };
  return next;
}

/** `getent passwd` / `shadow` / `group`, as the host prints them. */
export function passwdText(accounts: Iterable<FakeAccount>): string {
  return [...accounts].map(a => `${a.name}:x:${a.uid}:${a.gid}:${a.gecos}:/nonexistent:/usr/sbin/nologin`).join('\n');
}

export function shadowText(accounts: Iterable<FakeAccount>): string {
  return [...accounts].map(a => `${a.name}:${a.password}:19999:::::${a.expire}:`).join('\n');
}

export function groupText(groups: Iterable<FakeGroup>): string {
  return [...groups].map(g => `${g.name}:x:${g.gid}:${g.members.join(',')}`).join('\n');
}

/** The ledger the REAL parser reads off these accounts and groups. `shadow: false` = not root. */
export function fakeLedger(
  layout: InstanceLayout,
  accounts: Iterable<FakeAccount>,
  groups: Iterable<FakeGroup>,
  options: { readonly shadow?: boolean; readonly loginDefs?: string | null } = {},
): AgentLedger {
  const list = [...accounts];
  return parseAgentLedger(layout, {
    passwd: passwdText(list),
    shadow: options.shadow === false ? null : shadowText(list),
    group: groupText(groups),
    loginDefs: options.loginDefs ?? null,
  });
}
