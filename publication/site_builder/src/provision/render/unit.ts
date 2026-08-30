/**
 * THE SYSTEMD UNIT for one instance — the file that decides who this museum's daemon runs
 * as, what it may write, and how it is supervised.
 *
 * It is the artifact this whole phase was written for. The unit it replaces
 * (`deploy/dedalo-site-builder.service`) stated the service identity as a literal that
 * `install.sh:13-14` ALSO stated as a literal, with no templating between them and an
 * `install -m 644` copying the file verbatim; and its `ReadWritePaths=` named two roots
 * that did not follow the installer's own `SITES_ROOT`/`PREPROD_ROOT`/`PROD_ROOT`
 * overrides. Under `ProtectSystem=strict` that second defect is not an install failure —
 * the install SUCCEEDS, the daemon boots, and the museum discovers it as EROFS the first
 * time it publishes a site. Both defects are structurally impossible here: every identity
 * comes from `layout.identity` and the writable set is `readWritePaths(layout)`, which is
 * the same function the provisioner creates the directories from. The unit cannot disagree
 * with the tree it is confining, because it is not told about it separately.
 *
 * WHAT THIS FILE MAY AND MAY NOT DO — the renderer law, in force here (see ./types.ts):
 * pure, zero-dep, stamped by `artifact()`, and NEVER carrying a credential value. Provider
 * keys reach the process through `LoadCredential=` and nothing else: the material exists
 * for the process under `$CREDENTIALS_DIRECTORY`, and is absent from this file, from the
 * rendered env, and from `/proc/<pid>/environ`.
 *
 * WHY EVERY INTERPOLATED VALUE IS CHECKED HERE TOO. A systemd unit has no quoting that
 * survives a newline: one `\n` inside any value below and the next line is a DIRECTIVE of
 * the declaration author's choosing, in a root-installed file that starts a process as a
 * uid of their choosing. The schema constrains most of these strings, but `derive()` is a
 * second entry point (`provision adopt` builds a manifest from what is on disk, with no
 * declaration ever validated) and — sharper — `derive()` passes `resources` through
 * UNVALIDATED, so `memory_max` is a string that reaches a unit directive having been
 * checked by exactly one file that a second entry point does not go through. Defence in
 * depth is not a slogan here; it is the only check on that particular value.
 */

import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { InstanceLayout, InstanceManifest } from '../layout';
import {
  CPU_QUOTA_PATTERN,
  credentialSources,
  DESCRIPTION_PATTERN,
  MODES,
  SECRET_KEY_PATTERN,
  SYSTEMD_SIZE_PATTERN,
  UNIX_NAME_PATTERN,
  pathsOverlap,
  readWritePaths,
} from '../layout';
import type { Renderer } from './types';
import { artifact } from './types';

/* ────────────────────────────────────────────────────────────────────────────────────
 * Where the daemon's own code and runtime are
 *
 * DECLARED, AND READ OFF THE LAYOUT LIKE EVERY OTHER PATH. `ExecStart=` and
 * `WorkingDirectory=` need two absolute paths — the checkout this package lives in and the
 * PINNED bun binary — and `instance.json` carries both (`engine.checkout_dir`,
 * `engine.bun_bin`), so `derive()` hands them over and this renderer states no host
 * placement of its own.
 *
 * It used to INFER them from `engine.private_dir` by a "canonical 1:1 topology": the
 * checkout as a sibling of `private/`, the runtime as `.bun/bin/bun` beside them. That
 * convention is true of the hosts this project has seen and is not a fact about any other,
 * so a museum whose tree is laid out differently got a `WorkingDirectory=` naming a
 * directory nobody had created and an `AssertPathIsDirectory=` refusing to start it — while
 * the generated file's own comment told the operator to declare `engine.checkout_dir`, a
 * field the schema refused as unknown. The `Assert*` lines below are KEPT: a declared path
 * can be wrong too, and a refusal at `systemctl start` naming the exact missing path is
 * still better than systemd's bare `status=203/EXEC`.
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** The daemon's entry point, relative to the working directory (package.json `start`). */
const DAEMON_ENTRY = join('src', 'index.ts');

/* ────────────────────────────────────────────────────────────────────────────────────
 * The values that are NOT tuning knobs: they come from the matrix
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * `UMask=`, DERIVED from the served tree's row rather than typed.
 *
 * The webspace and its release store are 2750 `<user>:<webGroup>` (§3), and the mask is
 * simply the complement of that row's permission bits: everything the daemon creates in a
 * served tree keeps the group READ bit the web server needs and denies every other uid on
 * the host — which is the whole point of the closed world bits, since at 0755 one museum's
 * UNPUBLISHED preprod tree would be readable by every other museum's service user.
 *
 * It follows that the daemon's socket is NOT created 0660 by the umask alone (the mask
 * strips the group WRITE bit the engine needs to connect, the same trap the engine's own
 * unit documents at deploy/dedalo-ts.service:68-74). That is deliberate and is the right
 * side to err on: the served trees are many and are created continuously by agent turns,
 * the socket is one file created once at bind, and a single explicit chmod there is far
 * cheaper than a group-writable webspace on every publish.
 */
const UMASK = 0o777 & ~(MODES.webspace.mode & 0o777);

/**
 * The supervision numbers, INHERITED from the engine's own unit
 * (deploy/dedalo-ts.service:23-31) rather than re-decided here. systemd's default budget
 * of 5 starts per 10 s sits right on top of a `RestartSec=3` cadence, so a burst of
 * legitimate restarts — a provisioning run, a code update, a host reboot storm — leaves
 * the unit `failed` with NOTHING to restart it. 5 starts per 5 minutes is still a real
 * backstop against a hot crash loop and is no longer trippable by a planned restart.
 *
 * The journald budget is this daemon's own addition, and it is per-INSTANCE for the reason
 * everything here is: journald's rate limiting is otherwise a shared resource, so one
 * chatty museum's agent turn (an agent CLI streaming its whole reasoning to stdout, say)
 * would spend the global budget and journald would start dropping ANOTHER museum's audit
 * lines. A per-unit budget makes a museum's flood cost that museum its own log lines.
 */
const SUPERVISION = Object.freeze({
  startLimitIntervalSec: 300,
  startLimitBurst: 5,
  restartSec: 3,
  /** Long enough for in-flight agent turns and SSE streams to drain (server.stop(false)). */
  timeoutStopSec: 30,
  logRateLimitIntervalSec: 30,
  logRateLimitBurst: 10_000,
  limitNoFile: 65_536,
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * Escaping — R6, applied to every string that becomes part of a directive
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** Anything a unit file cannot survive inside a value: NUL, the C0 range, DEL. */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/**
 * A free-text value (today: the Description).
 *
 * A newline is REFUSED, never escaped: systemd has no in-value escape for it, so the only
 * honest options are "reject" and "silently truncate", and truncation would leave the
 * attacker's second line as a live directive. `%` IS escaped, because systemd expands
 * specifiers (`%H` is the hostname, `%i` the instance) in most directives — a museum whose
 * description mentions "100%" would otherwise render a unit that says something else.
 */
function unitText(label: string, value: string): string {
  if (typeof value !== 'string' || CONTROL_CHARACTERS.test(value)) {
    throw new Error(
      `render(unit): ${label} contains a control character or newline. A systemd unit has no ` +
        `quoting that survives a newline — the next line would be a directive. Nothing was ` +
        `rendered.`,
    );
  }
  return value.replace(/%/g, '%%');
}

/**
 * A PATH value. Stricter than free text, because most path directives (`ReadWritePaths=`,
 * `ExecStart=`) are whitespace-SEPARATED lists: a path containing a space is not a path
 * there, it is two of them, and quoting rules differ from one directive to the next. So
 * whitespace, quotes and backslashes are refused rather than escaped — a grammar is a
 * property of the value, an escape is a property each call site would have to get right.
 */
function unitPath(label: string, value: string): string {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new Error(`render(unit): ${label} must be an absolute path, got '${String(value)}'.`);
  }
  if (CONTROL_CHARACTERS.test(value) || /[\s"'\\]/.test(value)) {
    throw new Error(
      `render(unit): ${label} ('${value}') contains whitespace, a quote, a backslash or a ` +
        `control character. Path directives are whitespace-separated and un-quotable per ` +
        `entry, so such a path cannot be expressed in a unit at all. Nothing was rendered.`,
    );
  }
  return value.replace(/%/g, '%%');
}

/** A declared value that must match one of layout's grammars before it reaches a directive. */
function matching(pattern: RegExp, label: string, value: string): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new Error(
      `render(unit): ${label} '${String(value)}' does not match ${pattern.source}. It is ` +
        `rendered verbatim into a root-installed unit file. Nothing was rendered.`,
    );
  }
  return value;
}

/** systemd's octal spelling for a mode out of the matrix: 0o750 → '0750', 0o2750 → '02750'. */
function octal(mode: number): string {
  return `0${(mode & 0o7777).toString(8).padStart(3, '0')}`;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The renderer
 * ──────────────────────────────────────────────────────────────────────────────────── */

export const unitRenderer: Renderer = {
  kind: 'unit',

  render(layout: InstanceLayout, manifest: InstanceManifest) {
    const tree = layout.daemon;
    const lines: string[] = [];

    /* ── Header. The file says what it is and what to edit instead of it. ───────────── */
    lines.push(
      `# GENERATED by publication/site_builder/src/provision/render/unit.ts — do NOT edit.`,
      `#`,
      `# Every value below is derived from ${unitPath('manifestPath', layout.manifestPath)}.`,
      `# A hand edit is reported as drift on the next provisioning run and re-rendered away;`,
      `# the way to change this unit is to change that declaration and re-run the provisioner.`,
      `#`,
      `# Instance: ${unitText('instance', layout.instance)}`,
    );
    if (layout.description) {
      lines.push(
        `# ${unitText('description', matching(DESCRIPTION_PATTERN, 'description', layout.description))}`,
      );
    }

    /* ── [Unit] ─────────────────────────────────────────────────────────────────────── */
    lines.push(
      ``,
      `[Unit]`,
      `Description=Dedalo Site Builder (Bun) - instance ${unitText('instance', layout.instance)}`,
      // The operator is pointed at the declaration, so "where do I change this?" has an
      // answer inside the file rather than in somebody's memory.
      `Documentation=file://${unitPath('manifestPath', layout.manifestPath)}`,
      `After=network.target`,
      ``,
      `# A wrong tree or a missing runtime refuses AT START, naming the path that is not`,
      `# there, instead of systemd's bare status=203/EXEC. Assert* are [Unit] settings; the`,
      `# paths they guard are WorkingDirectory=/ExecStart= in [Service] below.`,
      `AssertPathIsDirectory=${unitPath('the daemon working directory', tree.workingDirectory)}`,
      `AssertFileIsExecutable=${unitPath('the pinned bun binary', tree.bun)}`,
      ``,
      `# Crash-loop budget, inherited from the engine's unit (deploy/dedalo-ts.service).`,
      `# systemd's default is 5 starts per 10 s, which a normal RestartSec=3 cadence trips.`,
      `StartLimitIntervalSec=${SUPERVISION.startLimitIntervalSec}`,
      `StartLimitBurst=${SUPERVISION.startLimitBurst}`,
    );

    /* ── [Service]: identity ────────────────────────────────────────────────────────── */
    lines.push(
      ``,
      `[Service]`,
      `Type=simple`,
      `# THE isolation boundary: one museum, one uid, one gid. Both come from the layout —`,
      `# the installer and the shipped unit each stated them separately, and an operator who`,
      `# overrode the roots got a daemon running as a user nobody had declared.`,
      `# Group= is stated explicitly (never left to useradd's distro-dependent default): a`,
      `# unit hard-requiring a group that does not exist fails with "Failed to determine`,
      `# group credentials" before Bun ever runs (deploy/dedalo-ts.service:45-51).`,
      `User=${matching(UNIX_NAME_PATTERN, 'identity.user', layout.identity.user)}`,
      `Group=${matching(UNIX_NAME_PATTERN, 'identity.group', layout.identity.group)}`,
    );

    /* ── [Service]: the code and the runtime ────────────────────────────────────────── */
    lines.push(
      ``,
      `# The daemon runs from ITS OWN engine's tree — the topology is 1:1 — and from the`,
      `# PINNED bun, never a floating one on PATH (a stray 'bun upgrade' must not be able to`,
      `# change a museum's production runtime).`,
      `WorkingDirectory=${unitPath('the daemon working directory', tree.workingDirectory)}`,
      `ExecStart=${unitPath('the pinned bun binary', tree.bun)} run ${DAEMON_ENTRY}`,
    );

    /* ── [Service]: environment ─────────────────────────────────────────────────────── */
    lines.push(
      ``,
      `# The rendered, SECRET-FREE env (src/provision/render/env.ts). The engine's unit`,
      `# refuses EnvironmentFile= on purpose — it reads a hand-written .env whose raw-JSON`,
      `# values systemd's parser mangles — but this file is GENERATED by the same`,
      `# provisioner from layout.envVars: plain KEY=VALUE, no quoting to disagree about, and`,
      `# nothing in it that a credential could hide in.`,
      `EnvironmentFile=${unitPath('envFile', layout.envFile)}`,
      `# The instance identity comes LAST so the unit wins: the file and this line are`,
      `# derived from the same layout and cannot disagree, but a stale env file must never be`,
      `# able to tell the daemon it is a different museum than the unit that started it.`,
      `Environment=DEDALO_SITE_INSTANCE=${unitText('instance', layout.instance)}`,
    );

    /* ── [Service]: credentials ─────────────────────────────────────────────────────── */
    lines.push(
      ``,
      `# CREDENTIALS, AND THE ONLY WAY THEY REACH THIS PROCESS. Each value lives in a`,
      `# root-owned 0600 file the service user cannot read; systemd (as root) copies it into`,
      `# $CREDENTIALS_DIRECTORY for this process alone. No value appears in this unit, in the`,
      `# rendered env, or in /proc/<pid>/environ — which is what makes an Environment= line`,
      `# carrying a provider key a defect and not a shortcut.`,
      `#`,
      `# THE SET IS credentialSources(layout), NOT THE DECLARATION'S "secrets". Two of these`,
      `# are never declared and both are needed to boot: the shared bearer, which the`,
      `# provisioner MINTS, and the Publication API key, which is declared as a PATH the`,
      `# service user cannot open. Rendering this block from "secrets" alone produced a host`,
      `# where every file was correct and the daemon still could not start.`,
    );
    const credentials = Object.entries(credentialSources(layout));
    for (const [key, file] of credentials) {
      matching(SECRET_KEY_PATTERN, 'secret key', key);
      const path = unitPath(`secrets.${key}`, file);
      if (path.includes(':')) {
        throw new Error(
          `render(unit): the credential path for '${key}' ('${path}') contains a colon, which ` +
            `is LoadCredential='s own id:path separator — systemd would read the tail as the ` +
            `path and load the wrong file, or none. Nothing was rendered.`,
        );
      }
      lines.push(`LoadCredential=${key}:${path}`);
    }

    /* ── [Service]: runtime directory ───────────────────────────────────────────────── */
    lines.push(
      ``,
      `# /run is tmpfs and is wiped every reboot, so the socket's parent is systemd's job:`,
      `# RuntimeDirectory= creates it owned by this service on every start and removes it on`,
      `# stop. The mode is the matrix's runtimeDir row, not a number typed here.`,
      `RuntimeDirectory=${unitRuntimeDirectory(layout)}`,
      `RuntimeDirectoryMode=${octal(MODES.runtimeDir.mode)}`,
    );

    /* ── [Service]: confinement ─────────────────────────────────────────────────────── */
    lines.push(
      ``,
      `# Confinement. This daemon executes arbitrary agent-generated build scripts as the`,
      `# service user, so what it may write is the security model — not a hardening bonus.`,
      `NoNewPrivileges=yes`,
      `ProtectSystem=strict`,
      `ProtectHome=yes`,
      `PrivateTmp=yes`,
      `# Created files keep the group READ bit the web server needs and deny every other uid`,
      `# on the host — derived from the webspace row of the ownership matrix (${octal(MODES.webspace.mode)}).`,
      `UMask=${octal(UMASK)}`,
      ``,
      `# THE WRITABLE SET — the three state roots, the runtime dir, and EVERY site webspace,`,
      `# straight from readWritePaths(layout): the same list the provisioner creates the`,
      `# directories from, so an override in instance.json moves both or neither. Under`,
      `# ProtectSystem=strict an omitted root is not an install failure — it is EROFS the`,
      `# first time that museum publishes. ReadWritePaths= is also what exempts the served`,
      `# trees from ProtectHome= above, which matters because the default webspace base is`,
      `# under /home.`,
    );
    for (const path of readWritePaths(layout)) {
      lines.push(`ReadWritePaths=${unitPath('a writable path', path)}`);
    }

    /* ── [Service]: supervision ─────────────────────────────────────────────────────── */
    lines.push(
      ``,
      `# Supervision: any crash restarts the daemon; SIGTERM lets in-flight agent turns and`,
      `# SSE streams drain first.`,
      `Restart=always`,
      `RestartSec=${SUPERVISION.restartSec}`,
      `TimeoutStopSec=${SUPERVISION.timeoutStopSec}`,
      `KillSignal=SIGTERM`,
    );

    /* ── [Service]: logging ─────────────────────────────────────────────────────────── */
    lines.push(
      ``,
      `# One journal identity per INSTANCE (the shipped unit had one flat literal for every`,
      `# museum, so 'journalctl -t' mixed them). The rate limit is per-unit for the same`,
      `# reason: journald's budget is otherwise shared, and one chatty agent turn would`,
      `# spend it and start dropping ANOTHER museum's audit lines.`,
      `StandardOutput=journal`,
      `StandardError=journal`,
      `SyslogIdentifier=${unitText('syslog identifier', syslogIdentifier(layout))}`,
      `LogRateLimitIntervalSec=${SUPERVISION.logRateLimitIntervalSec}s`,
      `LogRateLimitBurst=${SUPERVISION.logRateLimitBurst}`,
    );

    /* ── [Service]: the museum's share of the host ──────────────────────────────────── */
    lines.push(``, `LimitNOFILE=${SUPERVISION.limitNoFile}`);
    lines.push(...resourceLines(layout));

    /* ── [Install] ──────────────────────────────────────────────────────────────────── */
    lines.push(``, `[Install]`, `WantedBy=multi-user.target`);

    return [
      artifact(layout, {
        kind: 'unit',
        path: layout.unitPath,
        // Read by systemd running as root: 0644 root:root, like the vhosts.
        mode: 'hostConfig',
        body: `${lines.join('\n')}\n`,
      }),
    ];
  },
};

/**
 * `RuntimeDirectory=` is BY DEFINITION relative to /run and systemd refuses a leading
 * slash. The layout already spells it that way; this checks it rather than trusting it,
 * because an absolute value here is a unit that fails to start with a message about a
 * directory nobody wrote down.
 */
function unitRuntimeDirectory(layout: InstanceLayout): string {
  const value = layout.runtimeDirectory;
  if (typeof value !== 'string' || value.length === 0 || isAbsolute(value) || /[\s"'\\]/.test(value) || CONTROL_CHARACTERS.test(value)) {
    throw new Error(
      `render(unit): RuntimeDirectory= value '${String(value)}' must be a relative path under ` +
        `/run with no whitespace — systemd resolves it there and refuses anything absolute.`,
    );
  }
  return value.replace(/%/g, '%%');
}

/**
 * The journal identity: the unit's own name without its suffix, so
 * `journalctl -t dedalo-site-builder@museum-a` is exactly the unit an operator just read.
 * Derived from `layout.unitName` and never spelled here — the name has one owner.
 */
function syslogIdentifier(layout: InstanceLayout): string {
  return layout.unitName.replace(/\.service$/, '');
}

/**
 * The kernel-enforced share of the host, in a FIXED order (soft memory limit, hard limit,
 * CPU, tasks) so that re-ordering the keys in instance.json cannot look like drift.
 *
 * Every value is matched against layout's own grammars HERE. This is the one place in this
 * file where that is not merely defence in depth: `derive()` passes `resources` through
 * untouched, so `schema.ts` is the only thing that has ever looked at these strings — and
 * `provision adopt` does not go through it. `memory_max: "4G\nExecStartPre=…"` would
 * otherwise be a root-installed unit running a command of the declaration author's
 * choosing.
 */
function resourceLines(layout: InstanceLayout): string[] {
  const resources = layout.resources ?? {};
  const out: string[] = [];

  if (resources.memory_high !== undefined) {
    out.push(`MemoryHigh=${matching(SYSTEMD_SIZE_PATTERN, 'resources.memory_high', resources.memory_high)}`);
  }
  if (resources.memory_max !== undefined) {
    out.push(`MemoryMax=${matching(SYSTEMD_SIZE_PATTERN, 'resources.memory_max', resources.memory_max)}`);
  }
  if (resources.cpu_quota !== undefined) {
    out.push(`CPUQuota=${matching(CPU_QUOTA_PATTERN, 'resources.cpu_quota', resources.cpu_quota)}`);
  }
  if (resources.tasks_max !== undefined) {
    const tasks = resources.tasks_max;
    if (typeof tasks !== 'number' || !Number.isInteger(tasks) || tasks < 1) {
      throw new Error(
        `render(unit): resources.tasks_max must be a positive integer, got '${String(tasks)}'. ` +
          `It is rendered verbatim into a root-installed unit file. Nothing was rendered.`,
      );
    }
    out.push(`TasksMax=${tasks}`);
  }

  if (out.length === 0) return out;
  return [
    ``,
    `# The museum's share of the host, as declared. Absent means the host's default — this`,
    `# subsystem does not invent a cap it was not asked for.`,
    ...out,
  ];
}
