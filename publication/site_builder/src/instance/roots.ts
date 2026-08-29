/**
 * THE BOOT PREFLIGHT — the daemon proving who it is, and that it can do its job, BEFORE it
 * does any of it.
 *
 * WHY THIS EXISTS AT ALL. This process runs as one museum's unix user, writes into that
 * museum's roots, and executes arbitrary agent-generated build scripts inside them. Every
 * one of those roots reaches it as an ORDINARY STRING out of an ordinary file. A path is a
 * claim; the engine has answered that with a marker twice already (`dedalo_test_marker` in
 * the suite database, `.dedalo_test_media` in the suite media root) and this is the same
 * law for the same reason: the only thing standing between a mistyped root in a declaration
 * and somebody else's data is the directory itself saying whose it is.
 *
 * WHY IT RUNS FIRST — ABOVE `sweepOnBoot()`, not "before the first request". The session
 * sweep WRITES: it commits recovered work and rewrites session metadata at module
 * evaluation. Any check that runs after it has already let a misconfigured daemon touch
 * whatever tree it was pointed at. "Before the first request" is too late, and the ordering
 * is gated as a source-order assertion (tests/instance_roots.test.ts) anchored on
 * `sweepOnBoot` rather than on `Bun.serve`, because the serve call is not the first write.
 *
 * WHY THE WRITE PROBE. The generated unit runs under `ProtectSystem=strict`, where every
 * path outside `ReadWritePaths=` is mounted READ-ONLY. A root the confinement set omits does
 * not fail at install time and does not fail at boot — it fails as EROFS the first time that
 * museum publishes, at night, on a live site. A create-and-unlink probe per root converts
 * that into a refusal at start, naming the root, which systemd reports and an operator can
 * act on before anybody is looking at a broken page.
 *
 * EVERY REFUSAL NAMES: the door it came through, the root, what was expected, what was
 * found, and that nothing was written. A refusal an operator cannot act on is an outage
 * with extra steps.
 *
 * WHAT IS NOT CHECKED HERE, AND WHY. The SURFACES are not in this list, and they no longer
 * could be: a site's surfaces are `<webspace>/pre` and `<webspace>/web` inside that site's
 * OWN webspace, and sites are created and deleted while this process runs — a set fixed at
 * boot would be a check that is complete for exactly as long as nobody creates a site. Each
 * webspace is instead proved at the moment it is used, by the same marker law and with the
 * same write probe, in `src/sites/webspace.ts`: before a site is created, before a build
 * starts, and again before its output is promoted. `WEBSPACE_BASE` itself is not checked at
 * all — it is the SHARED root-owned parent every museum's webspaces sit under, this daemon
 * neither owns it nor may write into it, and a marker there would be one museum claiming a
 * directory belonging to the host.
 *
 * WHAT WAS ADDED HERE AND WHY (check 6). The SITE TABLE is checked at boot even though the
 * webspaces it names are not: the table is a FILE, and a file that is absent, unstamped,
 * hand-edited or stamped for another instance makes every later answer to "where does this
 * site publish" wrong at once. Its rows are still only claims — each webspace is proved
 * individually, at the moment it is used, by the marker law and the write probe.
 */

import { closeSync, existsSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config, configSource, type Config, type ConfigSourceReport } from '../config';
import { readSiteTable } from '../sites/site_table';
import {
  AUDIT_FILE_NAME,
  INSTANCE_MARKER,
  SECRET_LOOKING_KEY,
  markerContent,
} from '../provision/layout';

/** The trailer every refusal ends with. One sentence, one spelling, always true. */
const NOTHING_WRITTEN = 'Nothing was written.';

function refuse(door: string, message: string): never {
  throw new Error(`${door}: ${message} ${NOTHING_WRITTEN}`);
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The roots this daemon holds
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * HOW A ROOT IS PROVED WRITABLE. Not one probe but two, because the roots are not one
 * shape: the audit directory is ROOT-owned on purpose (unlink and rename are permissions on
 * the DIRECTORY, which is what makes the trail append-only in the filesystem rather than by
 * convention), so a create-and-unlink probe there would refuse every correctly provisioned
 * host. What the daemon needs in that root is not a new file but an APPEND to the one the
 * provisioner created for it, so that is what is probed.
 */
export type RootProbe = 'create' | 'append';

export interface InstanceRoot {
  /** How a refusal names it — the config key, because that is what an operator will edit. */
  readonly label: string;
  readonly path: string;
  readonly probe: RootProbe;
  /** For `append`: the file inside the root the daemon must be able to append to. */
  readonly appendPath?: string;
  /**
   * True when the ownership matrix says the SERVICE USER owns this root. False for the
   * audit directory, which root owns by design — see the probe note above.
   */
  readonly ownedByService: boolean;
}

/**
 * THE THREE STATE ROOTS, exactly the set `src/provision/layout.ts` derives, the provisioner
 * marks and the unit's `ReadWritePaths=` confines. One list, read from the same config the
 * rest of the daemon uses, so a root that moves moves here too.
 */
export function daemonRoots(cfg: Pick<Config, 'SITES_ROOT' | 'AGENT_HOME' | 'AUDIT_DIR'> = config): InstanceRoot[] {
  return [
    { label: 'SITES_ROOT', path: cfg.SITES_ROOT, probe: 'create', ownedByService: true },
    { label: 'AGENT_HOME', path: cfg.AGENT_HOME, probe: 'create', ownedByService: true },
    {
      label: 'AUDIT_DIR',
      path: cfg.AUDIT_DIR,
      probe: 'append',
      appendPath: join(cfg.AUDIT_DIR, AUDIT_FILE_NAME),
      ownedByService: false,
    },
  ];
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * 1. Every root declares itself this instance's
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** Where a root's marker lives. One spelling, from the module that owns the name. */
export function markerPath(root: string): string {
  return join(root, INSTANCE_MARKER);
}

/**
 * A ROOT THAT DOES NOT SAY IT IS OURS IS NOT OURS.
 *
 * Two refusals, deliberately equal in weight: a root with NO marker (nothing has claimed
 * it, so this daemon would be adopting whatever is there) and a root marked for ANOTHER
 * instance (a declaration's typo about to put one museum's agent inside another museum's
 * tree). The content is a bare name so this stays a string compare instead of a parse
 * somebody has to decide how lenient to be about.
 *
 * The marker is NOT planted here. Creating what is missing would make the check assert only
 * that this process can write — the provisioner plants it (`plan.ts`, the tree phase),
 * immediately after each root's own mkdir, and the suite plants it in `resetInstance()`.
 */
/**
 * WHICH INSTANCE A DIRECTORY DECLARES ITSELF PART OF — the marker, read once, here.
 *
 * Exported because the state roots are no longer the only directories that carry one: every
 * per-site WEBSPACE the provisioner creates is marked too, and the daemon must ask the same
 * question of a webspace before publishing into it (`src/sites/webspace.ts`). Two readers,
 * one reader function — a second implementation would be a second opinion about what an
 * empty or absent marker means, on the one check that stands between a museum and another
 * museum's tree.
 *
 * `null` covers both "no directory" and "no marker": neither has said whose it is, and the
 * caller phrases the refusal, because a root and a webspace are fixed by different actions.
 */
export function declaredInstance(root: string): string | null {
  const marker = markerPath(root);
  if (!existsSync(marker)) return null;
  try {
    return readFileSync(marker, 'utf8').trim();
  } catch {
    return null;
  }
}

export function assertInstanceRoots(instance: string, roots: readonly InstanceRoot[] = daemonRoots()): void {
  const expected = markerContent(instance).trim();
  for (const root of roots) {
    if (!existsSync(root.path)) {
      refuse(
        'assertInstanceRoots',
        `${root.label} names '${root.path}', which does not exist. Expected a directory ` +
          `holding a '${INSTANCE_MARKER}' file that reads '${expected}'; found nothing at ` +
          `all. The provisioner creates and marks this root — run 'provision apply' for ` +
          `instance '${instance}', or correct ${root.label}.`,
      );
    }
    const found = declaredInstance(root.path);
    if (found === null) {
      refuse(
        'assertInstanceRoots',
        `${root.label} ('${root.path}') does not declare itself. Expected a ` +
          `'${INSTANCE_MARKER}' file reading '${expected}'; found no marker. A path is a ` +
          `claim — this daemon writes into its roots and will not adopt a directory that has ` +
          `not said whose it is.`,
      );
    }
    if (found !== expected) {
      refuse(
        'assertInstanceRoots',
        `${root.label} ('${root.path}') belongs to another instance. Expected ` +
          `'${INSTANCE_MARKER}' to read '${expected}'; it reads ` +
          `'${found || '(empty)'}'. Starting here would put instance '${instance}' on top of ` +
          `instance '${found || 'unknown'}'s data.`,
      );
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * 2. The process is the identity those roots were provisioned for
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * WHO THIS PROCESS IS, checked by OWNERSHIP rather than by name.
 *
 * The obvious check — "am I the user the layout names?" — cannot be written honestly: the
 * service user is `dedalo-site-<instance>` on a provisioned host and a developer's own login
 * on a laptop, so the expected NAME is machine-specific and could never be committed to the
 * suite. Ownership is the same question with a portable answer: the provisioner chowns the
 * roots the daemon owns to the service user, so "the uid running this process owns them" is
 * true on a museum's host, true on a laptop, true in the suite, and false in exactly the
 * case that matters — a daemon started as somebody else against a provisioned tree.
 *
 * ROOT IS REFUSED OUTRIGHT. This process spawns agent turns that execute generated build
 * scripts; as uid 0 they would own the host. The unit states `User=`; a daemon that reached
 * this line as root was started by hand, and the whole isolation design is off.
 */
export function assertRunningAs(instance: string, roots: readonly InstanceRoot[] = daemonRoots()): void {
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  if (uid === null) return; // no POSIX uids here (Windows) — nothing to prove.

  if (uid === 0) {
    refuse(
      'assertRunningAs',
      `this daemon is running as root (uid 0). Instance '${instance}' has its own unix user, ` +
        `and every agent turn this process starts inherits its identity — as root that is the ` +
        `whole host. Start it through the generated unit, which states User=.`,
    );
  }

  for (const root of roots) {
    if (!root.ownedByService) continue;
    let owner: number;
    try {
      owner = statSync(root.path).uid;
    } catch (error) {
      refuse(
        'assertRunningAs',
        `${root.label} ('${root.path}') could not be inspected (${(error as Error).message}).`,
      );
    }
    if (owner !== uid) {
      refuse(
        'assertRunningAs',
        `${root.label} ('${root.path}') is owned by uid ${owner}, and this process is uid ` +
          `${uid}. The provisioner chowns instance '${instance}'s roots to its service user, ` +
          `so this daemon is either running as the wrong user or pointed at another ` +
          `instance's tree.`,
      );
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * 3. No secret came in through a door that must not carry one
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * THE NO-SECRET LAW, CHECKED FROM THE DAEMON'S END.
 *
 * `render/env.ts` refuses to WRITE a secret-shaped key into the rendered env, because that
 * file is group-readable and its whole contents reach every agent child this daemon spawns.
 * A law enforced only by the writer is a law that lapses the moment a file is edited by
 * hand, adopted from an older host, or restored from a backup taken before the rule existed
 * — so the reader enforces it too, against the same pattern (`SECRET_LOOKING_KEY`, owned by
 * layout so there is one spelling of it).
 *
 * WHERE IT APPLIES. Wherever there is a credential store to have used instead, and on any
 * production run. A laptop and the suite have neither systemd nor a credential directory,
 * and a `SERVICE_TOKEN=` line in a developer's `.env.test` is the only way to run at all;
 * refusing it there would buy nothing and would be worked around within a day.
 *
 * IT ALSO REFUSES THE ARRANGEMENT THIS ONE REPLACED: a `.env` inside the checkout, owned by
 * the service user, holding every provider key — a file the daemon could read, rewrite, and
 * hand to any agent turn that talked it into `cat`ting a path. On a provisioned host the
 * environment lives in `/etc`, root-owned; a leftover `.env` in the working directory is the
 * old shape lying in wait.
 */
export function assertNoLegacyEnv(
  source: ConfigSourceReport = configSource,
  options: { nodeEnv?: string; packageDir?: string } = {},
): void {
  const nodeEnv = options.nodeEnv ?? config.NODE_ENV;
  const managed = source.credentialsDir !== null || nodeEnv === 'production';
  if (!managed) return;

  const offenders = source.envFileKeys.filter(key => SECRET_LOOKING_KEY.test(key));
  if (offenders.length > 0) {
    refuse(
      'assertNoLegacyEnv',
      `the environment file '${source.envFilePath}' carries ` +
        `${offenders.length === 1 ? 'a key that names a credential' : 'keys that name credentials'}: ` +
        `${offenders.join(', ')}. That file is readable by this service's group and its whole ` +
        `contents reach every agent child. Declare the value under 'secrets' in instance.json ` +
        `so it arrives as a systemd credential at $CREDENTIALS_DIRECTORY, and remove the line.`,
    );
  }

  const packageDir = options.packageDir;
  if (packageDir) {
    const strayEnv = join(packageDir, '.env');
    if (existsSync(strayEnv) && strayEnv !== source.envFilePath) {
      refuse(
        'assertNoLegacyEnv',
        `'${strayEnv}' exists inside the checkout while this daemon reads its environment ` +
          `from '${source.envFilePath}'. A per-checkout .env is the pre-instance arrangement: ` +
          `service-user-owned, agent-readable, and silently authoritative on the day someone ` +
          `starts the daemon by hand from this directory. Delete it.`,
      );
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * 4. Every root is actually writable, now, by this process
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * THE WRITE PROBE. Create a file and unlink it (or open the audit log for append), in each
 * root, at boot — see the header for why an EROFS discovered at publish time is the failure
 * this converts into a refusal at start.
 *
 * The probe name carries the pid so two processes probing the same root cannot collide, and
 * it is unlinked in a `finally` so a probe that fails mid-way leaves nothing behind. This is
 * the one function in the preflight that writes; it writes nothing that outlives itself.
 */
export function assertRootsWritable(instance: string, roots: readonly InstanceRoot[] = daemonRoots()): void {
  for (const root of roots) {
    if (root.probe === 'append') {
      const path = root.appendPath as string;
      try {
        closeSync(openSync(path, 'a'));
      } catch (error) {
        refuse(
          'assertRootsWritable',
          `the audit trail '${path}' cannot be appended to (${(error as Error).message}). ` +
            `${root.label} is root-owned by design — unlink and rename are permissions on the ` +
            `DIRECTORY, which is what keeps the trail append-only — so the provisioner creates ` +
            `the file and chowns it to instance '${instance}'s service user. A missing or ` +
            `unwritable log means every mutation this daemon performs would go unrecorded.`,
        );
      }
      continue;
    }

    const probe = join(root.path, `.dedalo_site_write_probe.${process.pid}`);
    try {
      writeFileSync(probe, '', { flag: 'w' });
    } catch (error) {
      refuse(
        'assertRootsWritable',
        `${root.label} ('${root.path}') is not writable by this process ` +
          `(${(error as Error).message}). Under ProtectSystem=strict every path the unit's ` +
          `ReadWritePaths= does not name is mounted READ-ONLY, and a root missing from that ` +
          `list fails as EROFS at publish time rather than here — which is why this is checked ` +
          `at boot. Re-run 'provision apply' for instance '${instance}'.`,
      );
    } finally {
      try {
        if (existsSync(probe)) unlinkSync(probe);
      } catch {
        // Best effort: an unremovable probe file is reported by the next run's own probe.
      }
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * 5. The agent binaries are the ones the host installed
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** One pinned binary: the config key that named it and the path it names. */
export interface PinnedBinary {
  readonly label: string;
  readonly path: string;
}

/** The pinned driver/build binaries this configuration states. Empty ones are absent. */
export function pinnedBinaries(cfg: Config = config): PinnedBinary[] {
  return (['CLAUDE_CODE_BIN', 'OPENCODE_BIN', 'PI_BIN'] as const)
    .map(label => ({ label, path: cfg[label] }))
    .filter(bin => bin.path !== '');
}

/**
 * A DRIVER BINARY IS A PATH, NOT A NAME.
 *
 * `CLAUDE_CODE_BIN=claude` — the old default — is resolved off `PATH` by whatever the child
 * inherits. PATH is precisely the thing an agent turn can arrange to influence, and a
 * writable directory earlier on it is a substitution vector: another uid on the host drops
 * its own `claude` there and this museum's daemon runs it, with this museum's credentials,
 * inside this museum's workspaces. The declaration pins an absolute path
 * (`agent.bins.<driver>`), so this asserts what the pin is worth:
 *
 *   - ABSOLUTE, always. A relative binary is a PATH lookup wearing a path's clothes.
 *   - NOT GROUP- OR WORLD-WRITABLE, always. A binary anyone can overwrite is a binary
 *     anyone can replace between two turns.
 *   - ROOT-OWNED on a production host. Ownership by the service user itself would mean an
 *     agent turn could rewrite the very binary the next turn runs. On a laptop the CLIs live
 *     in a developer's own `~/.local/bin` and are owned by the developer, so there the
 *     ownership is REPORTED and not refused — the two other checks still bind.
 */
export function assertAgentBinaries(
  binaries: readonly PinnedBinary[] = pinnedBinaries(),
  options: { requireRootOwned?: boolean; warn?: (line: string) => void } = {},
): void {
  const requireRootOwned = options.requireRootOwned ?? config.NODE_ENV === 'production';
  const warn = options.warn ?? ((line: string) => console.warn(line));

  for (const bin of binaries) {
    if (!bin.path.startsWith('/')) {
      refuse(
        'assertAgentBinaries',
        `${bin.label}='${bin.path}' is not an absolute path, so it would be resolved off ` +
          `PATH at spawn time. A writable directory earlier on that PATH is a substitution ` +
          `vector: another uid's binary would run with this instance's credentials, inside ` +
          `its workspaces. State the absolute path (agent.bins.<driver> in instance.json).`,
      );
    }
    let stat;
    try {
      stat = statSync(bin.path);
    } catch (error) {
      refuse(
        'assertAgentBinaries',
        `${bin.label} names '${bin.path}', which cannot be inspected ` +
          `(${(error as Error).message}). A driver pinned to a binary that is not there fails ` +
          `at the first agent turn instead of here.`,
      );
    }
    if ((stat.mode & 0o022) !== 0) {
      refuse(
        'assertAgentBinaries',
        `${bin.label} ('${bin.path}') is group- or world-writable (mode ` +
          `${(stat.mode & 0o7777).toString(8).padStart(4, '0')}). Anything that can write it ` +
          `can replace the agent this daemon runs, between one turn and the next.`,
      );
    }
    if (stat.uid !== 0) {
      if (requireRootOwned) {
        refuse(
          'assertAgentBinaries',
          `${bin.label} ('${bin.path}') is owned by uid ${stat.uid}, not by root. A driver ` +
            `binary owned by the service user is one an agent turn can rewrite for the next ` +
            `turn. Install it root-owned.`,
        );
      }
      warn(
        `[preflight] ${bin.label} ('${bin.path}') is owned by uid ${stat.uid}, not root. ` +
          `Accepted because this is not a production run; on a museum's host it is refused.`,
      );
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * 6. The site table is present, ours, and readable
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * WHERE THIS DAEMON MAY PUBLISH IS A FILE, AND THE FILE IS CHECKED AT BOOT.
 *
 * The daemon no longer derives a site's webspace: every placement comes out of
 * `<configDir>/sites.json`, which the provisioner renders from the same `layout.sites[n]`
 * the vhosts are rendered from (`src/sites/site_table.ts` says why, at length). That makes
 * the table load-bearing in exactly the way the root markers are, so it is held to the same
 * standard and at the same moment: absent, unstamped, hand-edited or stamped for ANOTHER
 * instance is a refusal to start, not a surprise at the first publish.
 *
 * "But an empty table is legitimate" — and it stays legitimate: a museum is provisioned
 * before it has its first site, and a table with `"sites": []` reads fine and refuses every
 * site by name at create time. What is refused here is a table that cannot be READ, because
 * a daemon that cannot answer "where does this site live" has no honest answer to any of
 * its requests.
 *
 * The refusal is re-worded rather than re-thrown: `readSiteTable` raises a `WebspaceError`
 * for a request-time caller, and this door prefixes it the way every other boot refusal is
 * prefixed, so systemd's journal shows one shape of message.
 */
export function assertSiteTable(instance: string, path: string = config.SITE_TABLE_FILE): void {
  try {
    readSiteTable(path, instance);
  } catch (error) {
    refuse('assertSiteTable', (error as Error).message.replace(/\s*Nothing was written\.$/, ''));
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The preflight
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * THE SIX CHECKS, IN ORDER, AGAINST THE REAL CONFIGURATION. Called as the FIRST statement
 * of `src/index.ts` — above the top-level `await sweepOnBoot()`, which already writes.
 *
 * Synchronous on purpose: there is nothing to interleave with at this point in the boot, and
 * a synchronous call cannot be accidentally left un-awaited above an `await` that writes.
 *
 * The order is the argument: prove the roots are OURS before proving we can write to them
 * (the probe writes), and prove no secret arrived by the wrong door before anything at all
 * has been logged.
 */
export function bootPreflight(): void {
  const instance = config.DEDALO_SITE_INSTANCE;
  const roots = daemonRoots();
  // The package directory — where a legacy per-checkout .env would sit, and where the
  // unit's WorkingDirectory= points, so an agent turn could read one.
  const packageDir = resolve(import.meta.dir, '..', '..');
  assertNoLegacyEnv(configSource, { nodeEnv: config.NODE_ENV, packageDir });
  assertInstanceRoots(instance, roots);
  assertRunningAs(instance, roots);
  assertRootsWritable(instance, roots);
  assertAgentBinaries();
  // LAST, and only because it neither writes nor decides anything about the roots: by here
  // the daemon has proved WHO it is, so a table stamped for another instance is reported
  // against an identity that is already established rather than against a claim.
  assertSiteTable(instance);
}
