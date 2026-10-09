/**
 * THE AGENT'S systemd UNIT. Pure, zero-dep, stamped through ./types.ts artifact().
 *
 * NoNewPrivileges=no IS REQUIRED, AND IS THE ONE PLACE THIS UNIT IS WEAKER THAN v2's.
 * D4 grants the agent exactly one sudo argv (the web-server configtest, which must read
 * root-only TLS keys). sudo is setuid; with no_new_privs set the kernel ignores the setuid
 * bit and sudo refuses ("The 'no new privileges' flag is set"). So the flag stays off — AND
 * every directive systemd.exec(5) documents as IMPLYING it stays out too, or the flag comes
 * back silently and `rules.apply` dies at its configtest on the production host only
 * (NNP_IMPLYING_DIRECTIVES, each refused by name in tests/provision_render_units.test.ts).
 *
 * IDENTITY. On a unix listener Group= is the ENGINE's group: the agent chmods its socket 0660
 * after the bind (src/boot.ts) and the socket's group is the process's, so this line is what
 * lets the engine — and nobody else — connect (spec §1.1). SupplementaryGroups= carries the
 * v2 group: v2/shared is root:<v2 group> 0750 (layout.ts MODES) and the agent checks
 * v2/shared/v2.env exists (src/exec.ts v2ScratchBoot; systemd reads it for the scratch
 * template unit, never the agent's child); without it every v2 install dies EACCES on a
 * provisioned host and on no test host. v1/shared needs no group: it is root:root 0711, the
 * agent only stats and links there (src/releases/install.ts), and the v1 config is private to
 * the v1 pool user.
 *
 * CONFIGURATION. src/config.ts parses the env file itself; this unit only NAMES it
 * (Environment=DEDALO_HOST_AGENT_ENV_FILE=…, src/config.ts ENV_FILE_VAR) and never loads it with
 * EnvironmentFile= — one parser, one grammar. The bearer is LoadCredential=SERVICE_TOKEN
 * (src/config.ts CREDENTIAL_KEYS), never in any rendered file.
 *
 * nginx -t (unlike apachectl -t) OPENS its log files and creates its temp dirs, and the sudo
 * child runs in THIS unit's mount namespace — ProtectSystem=strict would make them read-only
 * and configtest would fail EROFS. Those two paths are writable in the namespace (`-`: absent
 * is fine); DAC still applies, so only the sudo'd root child can write them.
 *
 * HOME AND LOG DIRECTORIES (spec S10, §5.9). ProtectHome= is a HOST-WIDE fact (layout.protectHome,
 * derived with every sibling declaration): the sudo'd configtest runs in THIS namespace, and a
 * hidden /home would turn a sibling's include under a home into a zero match — configtest would
 * test another config than the root master loads. On nginx the vhost's log directories are opened
 * by `nginx -t` too: every declared `web.log_dirs` entry is writable here with systemd's `-`
 * prefix (absent is fine, never 226/NAMESPACE). The home layout's site logs live in
 * `/var/log/nginx/<domain>` (layout.ts webLogBase), under NGINX_CONFIGTEST_WRITE_PATHS already.
 *
 * HOST-WIDE STATE (spec S11, §13.5). Every agent gets PUBHOST_GROUP (dedalo_pubhost) through
 * SupplementaryGroups= — it opens the host web lock read-only to flock it (no write path needed),
 * and on nginx `conf_d` writes its own map contribution in the sticky contrib directory (its only
 * host-wide write path, `-` prefixed). No existing account is ever modified to join it.
 *
 * THE systemd PROFILE (spec S10, ./systemd_floors.ts): every directive form is dated and at most
 * SYSTEMD_FLOOR (247: LoadCredential= delivers the token); `checkDirectives` throws otherwise.
 *
 * Apache's `-t` writes nothing while Apache runs. Debian's apache2ctl creates /run/apache2 and
 * /run/lock/apache2 only when they are MISSING (Apache not started since boot, /run is tmpfs);
 * that mkdir fails EROFS here, and no ReadWritePaths= can admit it short of all of /run. Not
 * widened on purpose: the configtest exists to precede a reload, and reloading a stopped
 * Apache fails anyway — start the web server first.
 */

import { dirname, join } from 'node:path';
import type { AgentLayout } from '../layout';
import { PUBHOST_GROUP, SERVICE_TOKEN_CREDENTIAL } from '../layout';
import { checkDirectives } from './systemd_floors';
import type { Artifact, RenderFacts, Renderer, UnitGroups } from './types';
import { artifact } from './types';

/** systemd.exec(5): each of these turns NoNewPrivileges= on for a non-root User=. */
export const NNP_IMPLYING_DIRECTIVES = Object.freeze([
  'SystemCallFilter',
  'SystemCallArchitectures',
  'RestrictAddressFamilies',
  'RestrictNamespaces',
  'PrivateDevices',
  'ProtectKernelTunables',
  'ProtectKernelModules',
  'ProtectKernelLogs',
  'ProtectClock',
  'MemoryDenyWriteExecute',
  'RestrictRealtime',
  'RestrictSUIDSGID',
  'DynamicUser',
  'LockPersonality',
]);

/** Paths `nginx -t` writes as root (logs, temp dirs). Apache's `-t` writes nothing while Apache runs (header). */
export const NGINX_CONFIGTEST_WRITE_PATHS = Object.freeze(['-/var/log/nginx', '-/var/lib/nginx']);

/** The ambient variable naming the env file src/config.ts parses (ENV_FILE_VAR). */
export const AGENT_ENV_FILE_VAR = 'DEDALO_HOST_AGENT_ENV_FILE';

/**
 * RuntimeDirectory= relative to /run. A '/' is allowed: layout.ts derives
 * `dedalo_publication_host/<instance>`, and systemd creates the parent 0755 and applies
 * RuntimeDirectoryMode= to the innermost directory.
 */
export const RUNTIME_DIRECTORY_PATTERN = /^[a-z][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/;

/**
 * layout.identity.agentSupplementaryGroups (the v2 group — layout.ts owns the list) plus
 * PUBHOST_GROUP (spec S11: the host web lock, the map contribution), without the one Group=
 * already gives (unix: the engine group). plan.ts judges the agent's access with this same list.
 */
export function agentSupplementaryGroups(layout: AgentLayout): string[] {
  const primary = layout.listen.kind === 'unix' ? layout.identity.engineGroup : null;
  const groups = [...layout.identity.agentSupplementaryGroups];
  if (!groups.includes(PUBHOST_GROUP)) groups.push(PUBHOST_GROUP);
  return groups.filter(group => group !== primary);
}

/**
 * The directories `nginx -t` opens for writing inside this namespace beyond the distribution's own
 * (NGINX_CONFIGTEST_WRITE_PATHS): every declared vhost log directory, `-` prefixed (an absent one
 * is fine). Empty on apache.
 */
export function nginxLogWritePaths(layout: AgentLayout): string[] {
  if (layout.web.server !== 'nginx') return [];
  const dirs: string[] = [];
  for (const dir of layout.web.logDirs) if (!dirs.includes(dir)) dirs.push(dir);
  return dirs.map(dir => `-${dir}`);
}

/**
 * The agent unit's groups (./types.ts UnitGroups): Group= is the engine group on a unix
 * listener (the socket's group) and absent on tls; SupplementaryGroups= is
 * agentSupplementaryGroups(). The renderer emits its lines from this, plan.ts judges with it.
 */
export function agentUnitGroups(layout: AgentLayout): UnitGroups {
  return {
    group: layout.listen.kind === 'unix' ? layout.identity.engineGroup : null,
    supplementary: agentSupplementaryGroups(layout),
  };
}

export const agentUnitRenderer: Renderer = {
  kind: 'unit_agent',
  render(layout: AgentLayout, _facts: RenderFacts): Artifact[] {
    const { identity, listen } = layout;
    let runtimeDirectory: string | null = null;
    if (listen.kind === 'unix') {
      if (identity.engineGroup === null) {
        throw new Error(`render(unit_agent): a unix listener needs the engine's group. Nothing was rendered.`);
      }
      if (!RUNTIME_DIRECTORY_PATTERN.test(listen.runtimeDirectory)) {
        throw new Error(
          `render(unit_agent): RuntimeDirectory '${listen.runtimeDirectory}' does not match ` +
            `${RUNTIME_DIRECTORY_PATTERN.source}. Nothing was rendered.`,
        );
      }
      const owned = join('/run', listen.runtimeDirectory);
      if (dirname(listen.socketPath) !== owned) {
        throw new Error(
          `render(unit_agent): the socket '${listen.socketPath}' is not directly inside ${owned}, the ` +
            `RuntimeDirectory= this unit owns — ProtectSystem=strict would make its bind EROFS. Nothing was rendered.`,
        );
      }
      runtimeDirectory = listen.runtimeDirectory;
    }

    const groups = agentUnitGroups(layout);

    const lines: string[] = [
      `# GENERATED by publication/host_agent/src/provision/render/unit_agent.ts — do NOT edit.`,
      `# Derived from ${layout.declarationPath}; a hand edit is refused by 'provision check' as drift.`,
      ``,
      `[Unit]`,
      `Description=Dedalo publication host agent - instance ${layout.instance}`,
      `Documentation=file://${layout.declarationPath}`,
      `After=network-online.target`,
      `Wants=network-online.target`,
      `AssertPathIsDirectory=${layout.agentDir}`,
      `AssertFileIsExecutable=${layout.bunBin}`,
      `StartLimitIntervalSec=300`,
      `StartLimitBurst=5`,
      ``,
      `[Service]`,
      `Type=simple`,
      `User=${identity.agentUser}`,
    ];
    if (groups.group !== null) {
      lines.push(`# The socket's group = the engine's (spec §1.1); src/boot.ts chmods the socket 0660.`, `Group=${groups.group}`);
    }
    if (groups.supplementary.length > 0) {
      lines.push(
        `# v2/shared is root:<v2 group> 0750: the agent checks v2.env there.${layout.v1 === null ? '' : ' v1/shared needs no group (0711).'}`,
        `# ${PUBHOST_GROUP}: the host web lock (opened read-only) and the host map contribution.`,
        `SupplementaryGroups=${groups.supplementary.join(' ')}`,
      );
    }
    lines.push(
      `WorkingDirectory=${layout.agentDir}`,
      `# The PINNED bun, never one on PATH.`,
      `ExecStart=${layout.bunBin} run ${layout.agentEntry}`,
      `Environment=NODE_ENV=production`,
      `# src/config.ts PARSES this file itself (no EnvironmentFile=: one parser, one grammar).`,
      `Environment=${AGENT_ENV_FILE_VAR}=${layout.envFile}`,
    );
    if (runtimeDirectory !== null) lines.push(`RuntimeDirectory=${runtimeDirectory}`, `RuntimeDirectoryMode=0750`);
    lines.push(
      `# The bearer: a root-only file -> $CREDENTIALS_DIRECTORY/${SERVICE_TOKEN_CREDENTIAL}. Never in an env file.`,
      `LoadCredential=${SERVICE_TOKEN_CREDENTIAL}:${layout.serviceTokenPath}`,
    );

    lines.push(
      ``,
      `# REQUIRED off: the configtest grant is sudo (setuid), which no_new_privs disables.`,
      `# None of the directives that imply it may appear in this unit (see the renderer header).`,
      `NoNewPrivileges=no`,
      `ProtectSystem=strict`,
      `# Host-wide (spec S10): read-only when ANY declaration on this host lives under a home tree.`,
      `ProtectHome=${layout.protectHome}`,
      `PrivateTmp=yes`,
      `ProtectProc=invisible`,
      `UMask=0027`,
      `# THE writable set: the agent's own state root (and a copy-mode media root), nothing else.`,
      `ReadWritePaths=${layout.state.root}`,
    );
    if (layout.media.mode === 'copy' && layout.media.root !== null) lines.push(`ReadWritePaths=${layout.media.root}`);
    if (layout.web.server === 'nginx') {
      lines.push(`# nginx -t (run as root through sudo, inside this namespace) opens these.`);
      for (const path of [...NGINX_CONFIGTEST_WRITE_PATHS, ...nginxLogWritePaths(layout)]) lines.push(`ReadWritePaths=${path}`);
      if (layout.web.nginxMap === 'conf_d') {
        lines.push(`# Its own host map contribution only (the live map is root's).`, `ReadWritePaths=-${layout.host.nginxContribDir}`);
      }
    }
    lines.push(
      ``,
      `Restart=always`,
      `RestartSec=3`,
      `TimeoutStopSec=30`,
      `KillSignal=SIGTERM`,
      `StandardOutput=journal`,
      `StandardError=journal`,
      `SyslogIdentifier=${layout.agentUnitName}`,
      ``,
      `[Install]`,
      `WantedBy=multi-user.target`,
      ``,
    );

    const body = checkDirectives(lines);
    return [
      artifact(layout, {
        kind: 'unit_agent',
        path: layout.agentUnitPath,
        mode: 'unitFile',
        body: body.join('\n'),
        effects: ['daemon_reload', 'restart_agent'],
        service: { unit: layout.agentUnitName, start: true },
      }),
    ];
  },
};
