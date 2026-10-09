/**
 * The constants `deploy/install.sh` and the TS side share (spec §1.1, S2). The trampoline's
 * gate (tests/init_install_sh.test.ts) parses the sh copies and holds them EQUAL to these; a
 * change here without the sh twin is red.
 *
 * PURE, ZERO-DEPENDENCY (tests/provision_zero_dep.test.ts).
 */

/** One entry of the source's closed layout (spec S2): a file, or a tree copied with `cp -RP`. */
export interface SourceEntry {
  /** Relative to the source root, no leading './', no '..'. */
  readonly path: string;
  readonly kind: 'file' | 'tree';
  /** Paths under a tree that are never copied (relative to the source root). */
  readonly exclude: readonly string[];
  /**
   * May be absent from a source (install.sh skips it; readStagedSource reports it null). Only the
   * v1 sample is: a kit built from a v2-only draft carries no PHP template (compare blocks a v1
   * instance whose source lacks it).
   */
  readonly optional: boolean;
}

/**
 * THE SOURCE (spec S2): exactly these entries, nothing else. On one machine it is the work
 * checkout; on two the operator copies them; the step-2 kit is this layout plus a manifest.
 * `publication/host_agent` carries its production node_modules and never `.test-tmp`.
 */
export const SOURCE_MANIFEST: readonly SourceEntry[] = Object.freeze([
  Object.freeze({ path: '.bun-version', kind: 'file', exclude: Object.freeze([]), optional: false }),
  Object.freeze({ path: '.bun-sha256', kind: 'file', exclude: Object.freeze([]), optional: false }),
  Object.freeze({
    path: 'publication/host_agent',
    kind: 'tree',
    exclude: Object.freeze(['publication/host_agent/.test-tmp']),
    optional: false,
  }),
  Object.freeze({ path: 'publication/server_api/v2/.env.example', kind: 'file', exclude: Object.freeze([]), optional: false }),
  Object.freeze({
    path: 'publication/server_api/v1/config_api/sample.server_config_api.php',
    kind: 'file',
    exclude: Object.freeze([]),
    optional: true,
  }),
] as const);

/**
 * The init flags the trampoline itself passes in the hand-over (spec §1.1 step 7), in the order
 * it writes them. Every one is also an INIT_FLAGS member (init/args.ts); the operator's own
 * flags follow them (`-- <init flags>`).
 */
export const INIT_FLAGS_HANDOVER: readonly string[] = Object.freeze([
  '--draft',
  '--source',
  '--source-digest-confirmed',
  '--bun-archive',
  '--bun-sums',
  '--kit-file',
  '--kit-digest-confirmed',
]);

/** The Bun runtime flags of the hand-over (`<bun> --no-env-file --no-install --config=<empty bunfig>`); run.ts re-checks them in /proc/self/cmdline. */
export const BUN_HANDOVER_FLAGS: readonly string[] = Object.freeze(['--no-env-file', '--no-install']);

/** The empty bunfig the trampoline writes into the stage and passes with `--config=`. */
export const EMPTY_BUNFIG_NAME = 'empty.bunfig.toml';
/**
 * How the empty bunfig is passed: `--config=<stage>/empty.bunfig.toml`, NEVER `-c`. Measured on
 * Bun 1.4.2 (P5): `-c <file> <entry>` takes <file> as the entry (nothing of ours runs), and
 * `-c=<file>` still loads `$cwd/bunfig.toml`. run.ts requires this exact argument in
 * /proc/self/cmdline (a footgun guard); deploy/install.sh writes it (tests/init_install_sh.test.ts).
 */
export const BUN_CONFIG_FLAG_PREFIX = '--config=';
/**
 * The stage directory under `<INIT_BASE>/<instance>/` (wiped and recreated 0700 by install.sh,
 * only while it holds INSTALL_LOCK_NAME).
 */
export const STAGE_DIR_NAME = 'stage';
/**
 * install.sh's own lock under `<INIT_BASE>/<instance>/`: an flock taken BEFORE the stage is
 * cleared and held across the exec into Bun (the open descriptor is inherited), so a second
 * install.sh for the same instance refuses instead of wiping a stage a running init reads. A
 * file of its own, never `init.lock`: init's instance lock opens that file anew, and an
 * inherited lock on the same file would refuse init itself.
 */
export const INSTALL_LOCK_NAME = 'install.lock';
/** The re-run trampoline file (spec §1.1 step 2): `BUN=` and `AGENT=` lines, root:root 0600. */
export const RERUN_ENV_NAME = 'rerun.env';
/** Root copies of the source's templates kept for re-runs without --source (spec §1.2). */
export const KEPT_DIR_NAME = 'kept';

/* ── the step-2 kit (`bun run hostagent:pack` on the work host → `install.sh --kit`) ─────── */

/**
 * THE KIT: one deterministic gzip+ustar archive (src/core/publication_host/bundle_writer.ts)
 * holding `MANIFEST`, `draft.json`, `install.sh` (deploy/install.sh, byte for byte) and
 * `source/` (the SOURCE_MANIFEST layout). The MANIFEST's first line is KIT_FORMAT_LINE; every
 * other line is `<sha256>  <path>` (sha256sum's form), one per regular file of the kit except
 * the MANIFEST itself, in byte order of the path. install.sh's verify_kit holds the extracted
 * tree to it exactly (tests/init_install_sh.test.ts holds the sh twins of these constants equal).
 */
export const KIT_FORMAT_LINE = '# dedalo publication-host kit 1';
export const KIT_MANIFEST_NAME = 'MANIFEST';
export const KIT_DRAFT_NAME = 'draft.json';
export const KIT_INSTALL_NAME = 'install.sh';
export const KIT_SOURCE_DIR = 'source';
/** A kit member path: relative, `/`-separated segments of `[A-Za-z0-9._@+-]`… */
export const KIT_PATH_PATTERN = /^[A-Za-z0-9._@+-]+(\/[A-Za-z0-9._@+-]+)*$/;
/** …none of them `.` or `..`. */
export const KIT_DOT_SEGMENT_PATTERN = /(^|\/)\.\.?(\/|$)/;
/** install.sh refuses a kit listing more members than this before extracting it. */
export const KIT_MAX_ENTRIES = 20000;

/**
 * Where a local MariaDB listens on a unix socket (spec §5.8, the v1 transport), in the order
 * discovery looks: Debian/Ubuntu's mariadb-server (`/run/mysqld/mysqld.sock`; `/var/run` is a
 * link to `/run` there) and the EL family's (`/var/lib/mysql/mysql.sock`). The first that is a
 * socket is the default; none → TCP 127.0.0.1:3306 is the default, still a decision.
 */
export const MARIADB_SOCKET_CANDIDATES: readonly string[] = Object.freeze(['/run/mysqld/mysqld.sock', '/var/lib/mysql/mysql.sock']);
/** The TCP default when no local socket exists: the loopback address, never `localhost` (PHP's mysqli reads `localhost` as "use the socket"). */
export const MARIADB_TCP_HOST = '127.0.0.1';
export const MARIADB_TCP_PORT = 3306;
