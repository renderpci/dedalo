/**
 * THE PUBLICATION HOST'S SELINUX POLICY MODULE (spec §9.8, owner decision 2026-10-09) — pure.
 *
 * WHY. The Publication API v2 tree (`<state>/publication_api/v2`) keeps its path's default type —
 * `var_t` under /srv (system layout), `user_home_t` in a home (home layout) — and systemd (`init_t`)
 * may read neither (sesearch / AVC, RHEL 9.8): neither the v2 units' `EnvironmentFile=`
 * (`shared/v2.env`) nor the `current`/`scratch` links of `WorkingDirectory=` /
 * `AssertPathIsDirectory=` — no v2 unit can start. No policy type fits a tree systemd must read and
 * httpd must not: the home layout once used `data_home_t`, which init_t reads only as a
 * `gnome_home_type` (read AND write) and httpd_t reads under `httpd_read_user_content` (a
 * `user_home_type`). So the provisioner ships ONE small module defining ONE file type, used by EVERY
 * layout (owner decision 2026-10-09):
 *
 *   dedalo_publication_v2_t — the whole v2 tree (releases, staging, shared/v2.env, the links).
 *     init_t: search/read its directories, read its files and links (the unit start).
 *     the v2 service and the agent: `unconfined_service_t` (init_t → bin_t execs transition there;
 *       a `files_unconfined_type`), so they need no rule.
 *     httpd_t: NOTHING. It reaches v2 over the v2 port (http_port_t), never by file; the policy's
 *       own `httpd_t file_type:dir { getattr open search }` lets it traverse, never read a file.
 *
 * It is a NORMAL file type (`file_type`, `non_security_file_type`, `non_auth_file_type` — what the
 * reference policy's `files_type()` gives), so restorecon, backups and the unconfined domains treat it
 * like any other. Nothing else lives in the module: no domain, no boolean, no rule for another type.
 *
 * FORMAT: CIL, installed with `semodule -X 400 -i <dir>/dedalo_publication_host.cil` — no compiler
 * (checkmodule/semodule_package are not needed; EL 9 and EL 10 build CIL in libsemanage). semodule
 * names a CIL module after its file, so the file name IS the module name.
 *
 * OURS OR NOT. The file is stamped `; dedalo-provision: _host selinux_module <sha>` (hash.ts, host-wide:
 * one module per host, shared by every instance). The INSTALLED module is judged by
 * what `semodule -E` extracts (a CIL module extracts byte-for-byte as installed — measured, RHEL 9.8):
 * a module of our name that is not CIL at priority 400, or whose text is not one of our stamped,
 * unedited bodies, is FOREIGN — refused, never replaced, never removed.
 *
 * ZERO-DEPENDENCY (tests/provision_zero_dep.test.ts): node: builtins, ./exec_contract, ./hash, ./layout.
 */
import { join } from 'node:path';
import { SELINUX_MODULE_FILE, SELINUX_MODULE_NAME, SELINUX_MODULE_PRIORITY } from './exec_contract';
import { HOST_STAMP_INSTANCE, hasDrifted, parseStamp, stamp } from './hash';
import type { AgentLayout } from './layout';

/**
 * The module's name (and its file's stem: semodule names a CIL module after its file), its file
 * name, and semodule's priority for it (400, the local-module default, always spelled `-X 400`):
 * defined in ./exec_contract, where the exec door's validators need them.
 */
export { SELINUX_MODULE_FILE, SELINUX_MODULE_NAME, SELINUX_MODULE_PRIORITY };
/** The stamp kind of the module source (host-wide: hash.ts HOST_WIDE_KINDS). */
export const SELINUX_MODULE_KIND = 'selinux_module';
/** root:root 0644: policy source, not a secret; only root installs it. */
export const SELINUX_MODULE_FILE_MODE = 0o644;
/** The module's one type: the Publication API v2 tree of every layout (selinux.ts row S/publication_api/v2). */
export const V2_TREE_TYPE = 'dedalo_publication_v2_t';
/** CIL's comment prefix (the stamp's). */
const CIL_COMMENT = ';';

/** Where the stamped source lives: the host-wide state directory (layout.host.base), root's. */
export function selinuxModulePath(layout: AgentLayout): string {
  return join(layout.host.base, SELINUX_MODULE_FILE);
}

/** The module's body below the stamp. Pure: one host, one module, no input. */
export function selinuxModuleBody(): string {
  const t = V2_TREE_TYPE;
  return [
    `; The Dédalo publication host's SELinux policy module '${SELINUX_MODULE_NAME}' (spec §9.8).`,
    '; Written by provision apply and installed with semodule -X 400 -i; never edit it (a hand edit is',
    '; refused, never installed). Removed by provision apply when no instance on this host needs it.',
    ';',
    `; ${t}: the Publication API v2 tree of every instance (releases, staging, shared/v2.env,`,
    ';   the current/scratch links). systemd reads it to start the v2 units; httpd is given nothing.',
    `(type ${t})`,
    `(roletype object_r ${t})`,
    `(typeattributeset file_type (${t}))`,
    `(typeattributeset non_security_file_type (${t}))`,
    `(typeattributeset non_auth_file_type (${t}))`,
    '; systemd: EnvironmentFile= (shared/v2.env), WorkingDirectory= and AssertPathIsDirectory= (the links).',
    `(allow init_t ${t} (dir (getattr open read search)))`,
    `(allow init_t ${t} (file (getattr open read)))`,
    `(allow init_t ${t} (lnk_file (getattr read)))`,
    '',
  ].join('\n');
}

/** The stamped module source, byte for byte what provision apply writes and semodule installs. */
export function renderSelinuxModule(): string {
  return stamp(SELINUX_MODULE_KIND, HOST_STAMP_INSTANCE, selinuxModuleBody(), CIL_COMMENT);
}

/** One row of `semodule --list-modules=full` for our module name. */
export interface ListedModule {
  readonly priority: number;
  readonly lang: string;
  readonly disabled: boolean;
}

/** What observeHost learns of the module (apply.ts observeSelinux). */
export interface SelinuxModuleObserved {
  /** Every installed row of SELINUX_MODULE_NAME, any priority. */
  readonly listed: readonly ListedModule[];
  /** What `semodule -X 400 -E` extracted (null = nothing at 400, or the extraction failed). */
  readonly source: string | null;
}

/** The observation of a host where the module is not installed. */
export const NO_MODULE: SelinuxModuleObserved = Object.freeze({ listed: Object.freeze([]), source: null });

/**
 * Why a text is not one of our module sources, or null: our stamp (`_host`, this kind), its body
 * unedited. Any version of our renderer passes (an older one is upgraded, never refused).
 */
export function moduleSourceProblem(what: string, text: string | null): string | null {
  if (text === null) return `${what} could not be read`;
  const parsed = parseStamp(text);
  if (parsed === null || parsed.kind !== SELINUX_MODULE_KIND || parsed.instance !== HOST_STAMP_INSTANCE) {
    return `${what} was not written by this provisioner (no '${SELINUX_MODULE_KIND}' stamp)`;
  }
  if (hasDrifted(text)) return `${what} was edited by hand since provision apply wrote it`;
  return null;
}

/** The installed module's standing: absent, ours (current or older), or not ours (with the reason). */
export type InstalledModule =
  | { readonly kind: 'absent' }
  | { readonly kind: 'ours'; readonly current: boolean }
  | { readonly kind: 'foreign'; readonly reason: string };

export function installedModule(observed: SelinuxModuleObserved): InstalledModule {
  if (observed.listed.length === 0) return { kind: 'absent' };
  const what = `the installed SELinux module '${SELINUX_MODULE_NAME}'`;
  const elsewhere = observed.listed.find(row => row.priority !== SELINUX_MODULE_PRIORITY);
  if (elsewhere !== undefined) return { kind: 'foreign', reason: `${what} is installed at priority ${elsewhere.priority}, not ${SELINUX_MODULE_PRIORITY} (provision apply never installs it there)` };
  const row = observed.listed[0] as ListedModule;
  if (row.lang !== 'cil') return { kind: 'foreign', reason: `${what} is a '${row.lang}' module, not the CIL source provision apply installs` };
  if (row.disabled) return { kind: 'foreign', reason: `${what} is disabled (semodule -d): someone turned it off by hand` };
  const problem = moduleSourceProblem(what, observed.source);
  if (problem !== null) return { kind: 'foreign', reason: problem };
  return { kind: 'ours', current: observed.source === renderSelinuxModule() };
}

/** The operator's way out of a foreign module (named in every refusal). */
export const FOREIGN_MODULE_HINT = `semodule --list-modules=full | grep ${SELINUX_MODULE_NAME}; semodule -X <priority> -E ${SELINUX_MODULE_NAME} to inspect it, then remove it (semodule -X <priority> -r ${SELINUX_MODULE_NAME}) if it is not needed`;
