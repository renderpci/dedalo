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
 * two shared-state groups: v1/shared is root:<web group> 0750 and v2/shared is root:<v2 group>
 * 0750 (layout.ts MODES). The agent stats and links the v1 config (src/releases/install.ts)
 * and READS v2/shared/v2.env (src/exec.ts v2ScratchBoot); without these groups every install
 * dies EACCES on a provisioned host and on no test host.
 *
 * CONFIGURATION. src/config.ts parses the env file itself; this unit only NAMES it
 * (Environment=DEDALO_HOST_AGENT_ENV_FILE=…, Task 1's ENV_FILE_VAR) and never loads it with
 * EnvironmentFile= — one parser, one grammar. The bearer is LoadCredential=SERVICE_TOKEN
 * (Task 1's CREDENTIAL_KEYS), never in any rendered file.
 *
 * nginx -t (unlike apachectl -t) OPENS its log files and creates its temp dirs, and the sudo
 * child runs in THIS unit's mount namespace — ProtectSystem=strict would make them read-only
 * and configtest would fail EROFS. Those two paths are writable in the namespace (`-`: absent
 * is fine); DAC still applies, so only the sudo'd root child can write them.
 */

import { dirname, join } from 'node:path';
import type { AgentLayout } from '../layout';
import { SERVICE_TOKEN_CREDENTIAL } from '../layout';
import type { Artifact, RenderFacts, Renderer } from './types';
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

/** Paths `nginx -t` writes as root (logs, temp dirs). Apache's `-t` writes nothing. */
export const NGINX_CONFIGTEST_WRITE_PATHS = Object.freeze(['-/var/log/nginx', '-/var/lib/nginx']);

/** The ambient variable naming the env file src/config.ts parses (Task 1's ENV_FILE_VAR). */
export const AGENT_ENV_FILE_VAR = 'DEDALO_HOST_AGENT_ENV_FILE';

/**
 * RuntimeDirectory= relative to /run. A '/' is allowed: layout.ts derives
 * `dedalo_publication_host/<instance>`, and systemd creates the parent 0755 and applies
 * RuntimeDirectoryMode= to the innermost directory.
 */
export const RUNTIME_DIRECTORY_PATTERN = /^[a-z][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/;

const HOME_TREES = /^\/(home|root|run\/user)(\/|$)/;

/**
 * layout.identity.agentSupplementaryGroups (the web and v2 groups — layout.ts owns the list),
 * without the one Group= already gives (unix: the engine group).
 */
export function agentSupplementaryGroups(layout: AgentLayout): string[] {
  const primary = layout.listen.kind === 'unix' ? layout.identity.engineGroup : null;
  return layout.identity.agentSupplementaryGroups.filter(group => group !== primary);
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

    // ProtectHome=yes would HIDE a root under /home: read-only keeps it visible, and
    // ReadWritePaths= still lifts the state root.
    const homeBound = [layout.state.root, layout.agentDir, layout.bunBin, layout.media.root ?? ''].some(path =>
      HOME_TREES.test(path),
    );
    const supplementary = agentSupplementaryGroups(layout);

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
    if (runtimeDirectory !== null) {
      lines.push(`# The socket's group = the engine's (spec §1.1); src/boot.ts chmods the socket 0660.`, `Group=${identity.engineGroup}`);
    }
    if (supplementary.length > 0) {
      lines.push(
        `# v1/shared (web group) and v2/shared (v2 group) are 0750: the agent links into one, reads v2.env from the other.`,
        `SupplementaryGroups=${supplementary.join(' ')}`,
      );
    }
    lines.push(
      `WorkingDirectory=${layout.agentDir}`,
      `# The PINNED bun, never one on PATH.`,
      `ExecStart=${layout.bunBin} run ${layout.agentEntry}`,
      `Environment=NODE_ENV=production`,
      `# src/config.ts PARSES this file itself (no EnvironmentFile=: one parser, one grammar).`,
      `Environment=${AGENT_ENV_FILE_VAR}=${layout.envFile}`,
      `# The bearer: a root-only file -> $CREDENTIALS_DIRECTORY/${SERVICE_TOKEN_CREDENTIAL}. Never in an env file.`,
      `LoadCredential=${SERVICE_TOKEN_CREDENTIAL}:${layout.serviceTokenPath}`,
    );
    if (runtimeDirectory !== null) lines.push(`RuntimeDirectory=${runtimeDirectory}`, `RuntimeDirectoryMode=0750`);

    lines.push(
      ``,
      `# REQUIRED off: the configtest grant is sudo (setuid), which no_new_privs disables.`,
      `# None of the directives that imply it may appear in this unit (see the renderer header).`,
      `NoNewPrivileges=no`,
      `ProtectSystem=strict`,
      `ProtectHome=${homeBound ? 'read-only' : 'yes'}`,
      `PrivateTmp=yes`,
      `ProtectProc=invisible`,
      `UMask=0027`,
      `# THE writable set: the agent's own state root (and a copy-mode media root), nothing else.`,
      `ReadWritePaths=${layout.state.root}`,
    );
    if (layout.media.mode === 'copy' && layout.media.root !== null) lines.push(`ReadWritePaths=${layout.media.root}`);
    if (layout.web.server === 'nginx') {
      lines.push(`# nginx -t (run as root through sudo, inside this namespace) opens these.`);
      for (const path of NGINX_CONFIGTEST_WRITE_PATHS) lines.push(`ReadWritePaths=${path}`);
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

    return [
      artifact(layout, {
        kind: 'unit_agent',
        path: layout.agentUnitPath,
        mode: 'unitFile',
        body: lines.join('\n'),
        effects: ['daemon_reload', 'restart_agent'],
        service: { unit: layout.agentUnitName, start: true },
      }),
    ];
  },
};
