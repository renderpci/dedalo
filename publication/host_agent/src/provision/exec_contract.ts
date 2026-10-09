/**
 * THE SPAWN CONTRACTS of the root-run provisioner — types and closed value sets only. The
 * implementations live in src/exec.ts (the ONE spawning file); this module is what every pure
 * consumer (plan, compare, the init orchestrator, the FakeHost) imports instead, so naming a
 * command never pulls a spawner into a zero-dependency module.
 *
 * Two closed sets, disjoint by construction (tests/init_exec.test.ts holds the key sets apart):
 *   - ProvisionExec — `provision check|apply` (read-only probes, validation, the apply-owned
 *     SELinux label commands). Never creates an account, never sets a boolean.
 *   - InitExec — `provision init` only: discovery commands, the account creators, a2enmod,
 *     setsebool, the Bun unpack and the engine-side pairing child. `init/act.ts` is the only
 *     caller of the creators (tests/init_account_door.test.ts).
 *
 * ZERO-DEPENDENCY (tests/provision_zero_dep.test.ts): node: builtins and ./layout only.
 */

/** One finished child: exit code (127 = the binary is absent), captured text. */
export type ExecResult = { code: number; stdout: string; stderr: string };

/**
 * The assets the pinned Bun release ships for the CPUs a publication host may have, in the
 * order `.bun-sha256` lists them (spec §1.3). install.sh's asset table is held equal to it.
 */
export const BUN_ASSETS = Object.freeze(['bun-linux-aarch64', 'bun-linux-x64-baseline', 'bun-linux-x64'] as const);
export type BunAsset = (typeof BUN_ASSETS)[number];

/**
 * The SELinux booleans init may READ (getsebool) — the closed set of spec S9. setsebool admits
 * the set minus `httpd_graceful_shutdown` (read, never written). src/provision/selinux.ts
 * re-exports this definition; it lives here because the exec validators need it and this
 * module may not import selinux.ts's renderers.
 */
export const SELINUX_BOOLEANS = Object.freeze([
  'httpd_can_network_connect',
  'httpd_can_network_connect_db',
  'httpd_can_network_relay',
  'httpd_enable_homedirs',
  'httpd_graceful_shutdown',
  'httpd_use_cifs',
  'httpd_use_fusefs',
  'httpd_use_nfs',
] as const);
export type SelinuxBoolean = (typeof SELINUX_BOOLEANS)[number];
/** Read to decide, never written (spec S9). */
export const SELINUX_READ_ONLY_BOOLEANS: readonly SelinuxBoolean[] = Object.freeze(['httpd_graceful_shutdown']);

/**
 * The Apache modules the rendered web include and the engine's Apache media rules need
 * (spec §2.4). init enables only these (Debian a2enmod), never on EL; a root census
 * (test/unit/publication_host_apache_modules_census.test.ts) holds the set equal to the needs.
 */
export const APACHE_MODULES = Object.freeze(['ssl', 'proxy', 'proxy_http', 'proxy_fcgi', 'headers', 'rewrite'] as const);
export type ApacheModule = (typeof APACHE_MODULES)[number];

/**
 * The SELinux policy module's name, file name and priority (selinux_module.ts re-exports them): here
 * because the exec door validates against them and must not import the renderer (the root map
 * renderer's closure includes src/exec.ts).
 */
export const SELINUX_MODULE_NAME = 'dedalo_publication_host';
export const SELINUX_MODULE_FILE = `${SELINUX_MODULE_NAME}.cil`;
export const SELINUX_MODULE_PRIORITY = 400;

/** `semanage <kind> -l -C -n`: the local customisations of one kind. */
export type SemanageKind = 'fcontext' | 'port';

/** One restorecon target (selinux.ts restoreconTargets): `-R` only when `recursive`. */
export interface RestoreconTarget {
  readonly path: string;
  readonly recursive: boolean;
}

/** The nologin shells useradd may be given (first real file wins, spec §5.1). */
export const NOLOGIN_SHELLS = Object.freeze(['/usr/sbin/nologin', '/sbin/nologin'] as const);

/**
 * The one engine-side pairing child (spec §6 B5): `setsid --wait runuser -u <user> -- <bun>
 * --no-install <checkout>/scripts/publication_host_pair.ts <verb> <name> --fragment <f>
 * --token-stdin [--dry-run]`. The token reaches the child's stdin ONLY — never argv, never env.
 */
export interface PairInvocation {
  readonly user: string;
  readonly bun: string;
  readonly checkout: string;
  readonly verb: 'add' | 'replace';
  readonly name: string;
  readonly fragment: string;
  readonly dryRun: boolean;
  /** Keys ⊆ PATH, HOME, LC_ALL, DEDALO_*; values without NUL or newline. */
  readonly env: Readonly<Record<string, string>>;
  readonly token: string;
}

/** `--pair-name` grammar (spec §1.2): the engine's registry name for this agent. */
export const PAIR_NAME_PATTERN = /^(?!pairing_)[a-z][a-z0-9_]{1,31}$/;

/** The name a RETIRED tree is renamed to before `removeTree` (retire.ts): the only argument that door admits. */
export const RETIRED_SUFFIX = '.dedalo-provision.retired';

/**
 * THE TRUST PROGRAM'S CLOSED SET (src/provision/fapolicyd_trust.ts commitTrust): fapolicyd's
 * state, its database update and its dump — three fixed argv (src/exec.ts trustExec), no
 * argument from anyone. Used by root only: the oneshot `dedalo-pubhost-trust-<instance>.service`
 * and `provision apply`'s `fapolicyd-update` op.
 */
export interface TrustExec {
  /** `systemctl is-active --quiet fapolicyd.service` = 0. */
  fapolicydActive(): boolean;
  /** `fapolicyd-cli --update`. */
  fapolicydUpdate(): ExecResult;
  /** `fapolicyd-cli --dump-db` (the whole database, uncapped: it is scanned, never shown). */
  fapolicydDump(): ExecResult;
  /** The wait between two dumps (no spawn). */
  sleep(ms: number): void;
}

/**
 * The provisioner's closed set (29 commands, spec §2.4; the 25th is retire.ts's, 26-29 the SELinux
 * policy module's, selinux_module.ts). Synchronous: `provision` is a sync CLI.
 */
export interface ProvisionExec {
  userId(name: string): number | null; //               ['id','-u',name]
  groupId(name: string): number | null; //              ['getent','group',name]
  /** The account's database groups: primary + all (primary included). null = unknown user. */
  userGroups(name: string): { primary: number; all: number[] } | null; // ['id','-g',name] + ['id','-G',name]
  unitState(unit: string): { enabled: boolean; active: boolean }; // is-enabled / is-active --quiet
  daemonReload(): ExecResult; //                         ['systemctl','daemon-reload']
  enableUnit(unit: string): ExecResult; //               ['systemctl','enable',<unit>.service]
  startUnit(unit: string): ExecResult; //                ['systemctl','start',<unit>.service]
  restartUnit(unit: string): ExecResult; //              ['systemctl','restart',<unit>.service]
  reloadUnit(unit: string): ExecResult; //               ['systemctl','reload',<unit>.service]
  webConfigtest(bin: string, server: 'apache' | 'nginx'): ExecResult; // [<a WEB_CONFIGTEST_CANDIDATES[server] entry>,'-t']
  visudoCheck(file: string): ExecResult; //              ['visudo','-cf',file]
  visudoCheckPolicy(): ExecResult; //                    ['visudo','-c'] — the whole policy, includes and all
  /** The audit contract (src/instance/roots.ts): the trail is append-only by the kernel (FS_APPEND_FL). */
  appendOnly(file: string): ExecResult; //               ['chattr','+a',file]
  // ── 14-24: spec §2.4 (provision init, step 1) ──
  fpmConfigtest(bin: string): ExecResult; //             [bin,'-t'] — bin ∈ FPM_BIN_PATTERN, a real file
  apacheIncludes(bin: string): ExecResult; //            [bin,'-t','-D','DUMP_INCLUDES'] — bin ∈ APACHE_DUMP_CANDIDATES
  nginxDump(bin: string): ExecResult; //                 [bin,'-T'] — bin ∈ WEB_CONFIGTEST_CANDIDATES.nginx
  selinuxMode(): ExecResult; //                          ['getenforce'] — 127 = absent
  semanageLocal(kind: SemanageKind): ExecResult; //      ['semanage',kind,'-l','-C','-n']
  semanageImport(file: string): ExecResult; //           ['semanage','import','-f',file] — the root 0600 import temp
  /** One call per `recursive` value, recursive first; the results are joined (first failing code wins). */
  restorecon(targets: readonly RestoreconTarget[], dryRun: boolean): ExecResult; // ['restorecon',[-R],[-n],'-v','--',…]
  getsebool(name: string): ExecResult; //                ['getsebool',name] — name ∈ SELINUX_BOOLEANS
  systemdVersion(): ExecResult; //                       ['systemctl','--version']
  semanagePortList(): ExecResult; //                     ['semanage','port','-l','-n']
  selinuxLabel(paths: readonly string[]): ExecResult; // ['stat','-c','%C %n','--',…] — 1-32 clean absolute paths
  /** A RETIRED tree (retire.ts): only a root-owned 0700 directory named `*.dedalo-provision.retired`. */
  removeTree(path: string): ExecResult; //               ['rm','-rf','--one-file-system','--',path]
  // ── 26-29: the SELinux policy module (selinux_module.ts, spec §9.8) — no argument but the one file ──
  semoduleList(): ExecResult; //                         ['semodule','--list-modules=full']
  /**
   * `semodule -X 400 -E dedalo_publication_host`, run in a fresh root 0700 directory the door creates
   * (and removes): the extracted source's text, null when nothing was extracted.
   */
  semoduleExtract(): { readonly result: ExecResult; readonly text: string | null };
  /** The module source (selinux_module.ts selinuxModulePath): a root-owned regular file named `dedalo_publication_host.cil`, not group/other-writable. */
  semoduleInstall(file: string): ExecResult; //          ['semodule','-X','400','-i',file]
  semoduleRemove(): ExecResult; //                       ['semodule','-X','400','-r','dedalo_publication_host']
}

/** `provision init`'s closed set (22 commands, spec §2.4). Synchronous, timeout COMMAND_TIMEOUT_MS. */
export interface InitExec {
  unameMachine(): ExecResult; //                         ['uname','-m']
  passwdDb(): ExecResult; //                             ['getent','passwd']
  groupDb(): ExecResult; //                              ['getent','group']
  passwdLookup(name: string): ExecResult; //             ['getent','passwd',name] — exit 2 = absent
  groupLookup(name: string): ExecResult; //              ['getent','group',name]
  unitShow(unit: string): ExecResult; //                 ['systemctl','show',<unit>.service,'-p',…] (UNIT_SHOW_PROPERTIES)
  listCandidateUnits(): ExecResult; //                   ['systemctl','list-units',…CANDIDATE_UNIT_PATTERNS]
  polkitVersion(): ExecResult; //                        ['pkaction','--version'] — 127 = absent
  apacheVhosts(bin: string): ExecResult; //              [bin,'-S']
  apacheModules(bin: string): ExecResult; //             [bin,'-M']
  fpmDump(bin: string): ExecResult; //                   [bin,'-tt']
  phpVersion(bin: string): ExecResult; //                [realpath(bin),'-n','-r','echo PHP_VERSION;']
  groupAdd(name: string): ExecResult; //                 ['groupadd','--system',name]
  userAddOwnGroup(name: string, shell: string): ExecResult; // useradd --system --no-create-home --shell <s> --user-group n
  userAddInGroup(name: string, group: string, shell: string): ExecResult; // … -g <group> n
  enableApacheModules(mods: readonly string[]): ExecResult; // ['a2enmod','-q',…] — Debian only
  disableApacheModules(mods: readonly string[]): ExecResult; // ['a2dismod','-q',…] — Debian only
  unzipBun(zip: string, asset: string, dest: string): ExecResult; // ['unzip','-q','-o','-j',zip,'<asset>/bun','-d',dest]
  bunVersion(bin: string): ExecResult; //                [bin,'--version']
  pairAsEngine(invocation: PairInvocation): ExecResult; // setsid --wait runuser … (stdin = token, 120 s)
  setsebool(name: string, value: boolean): ExecResult; // ['setsebool','-P',name,'on'|'off']
  webVersion(bin: string): ExecResult; //                [bin,'-v']
}

/** The properties `unitShow` asks for (spec §2.4 row 6; DropInPaths names the file a sandbox value comes from, §4.3 host.unit_sandbox). */
export const UNIT_SHOW_PROPERTIES = Object.freeze([
  'LoadState',
  'ActiveState',
  'UnitFileState',
  'User',
  'Group',
  'WorkingDirectory',
  'ExecStart',
  'Environment',
  'EnvironmentFiles',
  'FragmentPath',
  'DropInPaths',
  'ProtectHome',
  'ProtectSystem',
  'InaccessiblePaths',
  'ReadOnlyPaths',
  'TemporaryFileSystem',
] as const);

/** The unit patterns `listCandidateUnits` lists (spec §2.4 row 7): the work engine, web servers, FPM, polkit. */
export const CANDIDATE_UNIT_PATTERNS = Object.freeze([
  'dedalo-ts.service',
  'dedalo-ts@*.service',
  'apache2.service',
  'httpd.service',
  'nginx.service',
  'php*-fpm.service',
  'php-fpm.service',
  'php*-php-fpm.service',
  'polkit.service',
] as const);

/** The pairing child's ceiling (spec §2.4 row 20). */
export const PAIR_TIMEOUT_MS = 120_000;
