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
}

/**
 * THE SOURCE (spec S2): exactly these entries, nothing else. On one machine it is the work
 * checkout; on two the operator copies them; the step-2 kit is this layout plus a manifest.
 * `publication/host_agent` carries its production node_modules and never `.test-tmp`.
 */
export const SOURCE_MANIFEST: readonly SourceEntry[] = Object.freeze([
  Object.freeze({ path: '.bun-version', kind: 'file', exclude: Object.freeze([]) }),
  Object.freeze({ path: '.bun-sha256', kind: 'file', exclude: Object.freeze([]) }),
  Object.freeze({
    path: 'publication/host_agent',
    kind: 'tree',
    exclude: Object.freeze(['publication/host_agent/.test-tmp']),
  }),
  Object.freeze({ path: 'publication/server_api/v2/.env.example', kind: 'file', exclude: Object.freeze([]) }),
  Object.freeze({
    path: 'publication/server_api/v1/config_api/sample.server_config_api.php',
    kind: 'file',
    exclude: Object.freeze([]),
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
