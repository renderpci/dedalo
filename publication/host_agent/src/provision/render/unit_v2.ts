/**
 * THE PUBLICATION API v2 UNIT. Pure, zero-dep, stamped through ./types.ts artifact().
 *
 * v2 is the PUBLIC-facing process, so it gets the full sandbox the agent cannot have:
 * NoNewPrivileges=yes plus the hardening set, its own user, and NO writable path. The code is
 * `current` (the agent's atomic symlink swap, spec §3); the state is `shared/v2.env`, read by
 * systemd as root.
 *
 * LOOPBACK AND PORT ARE ENFORCED IN ExecStart, NOT WITH Environment=. systemd.exec(5):
 * settings from EnvironmentFile= override Environment= whatever their order, and v2.env is
 * operator-edited state — a HOST=0.0.0.0 there would publish v2 on every interface, past the
 * web server and its media rules. env(1) sets NODE_ENV/HOST/PORT after every file is loaded,
 * the same override the scratch template unit below applies to a release under test.
 *
 * ENABLED, NEVER STARTED BY THE PROVISIONER (service.start = false): until the first
 * release.install promotes one, `current` does not exist and AssertPathIsDirectory= would fail
 * the start. The agent's polkit-granted `restart` starts it then.
 *
 * MemoryDenyWriteExecute= is deliberately ABSENT: Bun's JIT needs W+X pages.
 *
 * THE systemd PROFILE (spec S10, ./systemd_floors.ts): every directive form is dated and at most
 * SYSTEMD_FLOOR; `checkDirectives` throws otherwise.
 *
 * THE SCRATCH TEMPLATE (`v2_scratch_unit`, `<v2.unit>-scratch@.service`): the agent boots a
 * release under test on a scratch port as THIS unit's instance `@<port>` (polkit grants exactly
 * start/stop of `<v2.unit>-scratch@<4-5 digits>.service`), never as its own child — pushed release
 * code must not run with the agent's credential, TLS key, sudo or polkit grants. Same user and
 * sandbox as v2; runs `<v2>/scratch` (the agent's symlink); no LoadCredential=, no [Install]
 * (never enabled), Restart=no. Port and loopback via env(1) for the same reason as above (an
 * `Environment=PORT=%i` would lose to v2.env: EnvironmentFile= overrides Environment=).
 */

import { join } from 'node:path';
import type { AgentLayout } from '../layout';
import { HOME_TREES } from '../layout';
import { checkDirectives } from './systemd_floors';
import type { Artifact, RenderFacts, Renderer, UnitGroups } from './types';
import { artifact } from './types';

/** v2's entry point, relative to the release root (publication/server_api/v2/package.json). */
export const V2_ENTRY = 'src/index.ts';
/** The env file under `<state>/publication_api/v2/shared/` (spec §3). */
export const V2_ENV_FILE_NAME = 'v2.env';
export const V2_LOOPBACK_HOST = '127.0.0.1';
export const ENV_BIN = '/usr/bin/env';

/**
 * `<bun> <entry>`, never `<bun> run <entry>`: `bun run` writes its node shim links into the unit's
 * PrivateTmp (`/tmp/bun-node-<build>/{node,bun}`), and systemd (init_t) may not unlink `tmp_t` links
 * when it removes that directory at the stop — one AVC per stop (measured, RHEL 9.8, the EL drill's
 * first v2 push). A file entry needs no shim.
 */
export function v2ExecStart(layout: AgentLayout, port: string = String(layout.v2.port)): string {
  return `${ENV_BIN} NODE_ENV=production HOST=${V2_LOOPBACK_HOST} PORT=${port} ${layout.bunBin} ${V2_ENTRY}`;
}

/** Both v2 units' groups (./types.ts UnitGroups): Group=<v2.group>, no SupplementaryGroups=. plan.ts judges v2 with it. */
export function v2UnitGroups(layout: AgentLayout): UnitGroups {
  return { group: layout.identity.v2Group, supplementary: [] };
}

/** The Group=/SupplementaryGroups= lines, from v2UnitGroups — never written by hand. */
function v2GroupLines(layout: AgentLayout): string[] {
  const { group, supplementary } = v2UnitGroups(layout);
  return [
    ...(group === null ? [] : [`Group=${group}`]),
    ...(supplementary.length === 0 ? [] : [`SupplementaryGroups=${supplementary.join(' ')}`]),
  ];
}

function refuseSharedUser(kind: string, layout: AgentLayout): void {
  const { identity } = layout;
  if (identity.v2User === identity.agentUser) {
    throw new Error(
      `render(${kind}): v2 must run as its own user, not the agent's ('${identity.v2User}') — the public ` +
        `process must not be able to rewrite its own releases. Nothing was rendered.`,
    );
  }
}

/** The sandbox both v2 units share (the public-facing code, current or under test). */
function v2Sandbox(layout: AgentLayout): string[] {
  // v2's OWN paths (it runs no configtest, so the host-wide agent fact of spec S10 does not apply).
  const homeBound = HOME_TREES.test(layout.state.root) || HOME_TREES.test(layout.bunBin);
  return [
    `NoNewPrivileges=yes`,
    `ProtectSystem=strict`,
    `ProtectHome=${homeBound ? 'read-only' : 'yes'}`,
    `PrivateTmp=yes`,
    `PrivateDevices=yes`,
    `ProtectKernelTunables=yes`,
    `ProtectKernelModules=yes`,
    `ProtectKernelLogs=yes`,
    `ProtectControlGroups=yes`,
    `ProtectClock=yes`,
    `ProtectProc=invisible`,
    `RestrictSUIDSGID=yes`,
    `RestrictNamespaces=yes`,
    `RestrictRealtime=yes`,
    `LockPersonality=yes`,
    `RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6`,
    `UMask=0077`,
    `# No ReadWritePaths=: v2 writes nothing.`,
  ];
}

/** The unit body: every directive form dated and within SYSTEMD_FLOOR (./systemd_floors.ts). */
function unitBody(lines: readonly string[]): string {
  return checkDirectives(lines).join('\n');
}

export const v2UnitRenderer: Renderer = {
  kind: 'unit_v2',
  render(layout: AgentLayout, _facts: RenderFacts): Artifact[] {
    refuseSharedUser('unit_v2', layout);
    const { identity } = layout;
    const current = layout.state.apis.v2.current;
    const envFile = join(layout.state.apis.v2.shared, V2_ENV_FILE_NAME);

    const lines = [
      `# GENERATED by publication/host_agent/src/provision/render/unit_v2.ts — do NOT edit.`,
      `# Derived from ${layout.declarationPath}; a hand edit is refused by 'provision check' as drift.`,
      ``,
      `[Unit]`,
      `Description=Dedalo Publication API v2 - instance ${layout.instance}`,
      `Documentation=file://${layout.declarationPath}`,
      `After=network-online.target`,
      `Wants=network-online.target`,
      `AssertPathIsDirectory=${current}`,
      `AssertFileIsExecutable=${layout.bunBin}`,
      `AssertFileIsExecutable=${ENV_BIN}`,
      `StartLimitIntervalSec=300`,
      `StartLimitBurst=5`,
      ``,
      `[Service]`,
      `Type=simple`,
      `User=${identity.v2User}`,
      ...v2GroupLines(layout),
      `# The release the agent promoted; a swap + restart (polkit) moves it.`,
      `WorkingDirectory=${current}`,
      `# State outside the code (spec §3), read by systemd as root.`,
      `EnvironmentFile=${envFile}`,
      `# NODE_ENV/HOST/PORT set by env(1) AFTER the file: v2.env cannot move v2 off loopback.`,
      `ExecStart=${v2ExecStart(layout)}`,
      ``,
      ...v2Sandbox(layout),
      ``,
      `Restart=always`,
      `RestartSec=3`,
      `TimeoutStopSec=30`,
      `KillSignal=SIGTERM`,
      `StandardOutput=journal`,
      `StandardError=journal`,
      `SyslogIdentifier=${layout.v2.unit}`,
      ``,
      `[Install]`,
      `WantedBy=multi-user.target`,
      ``,
    ];
    return [
      artifact(layout, {
        kind: 'unit_v2',
        path: layout.v2UnitPath,
        mode: 'unitFile',
        body: unitBody(lines),
        effects: ['daemon_reload', 'restart_v2'],
        service: { unit: layout.v2.unit, start: false },
      }),
    ];
  },
};

export const v2ScratchUnitRenderer: Renderer = {
  kind: 'v2_scratch_unit',
  render(layout: AgentLayout, _facts: RenderFacts): Artifact[] {
    refuseSharedUser('v2_scratch_unit', layout);
    const { identity } = layout;
    const scratch = layout.state.apis.v2.scratch;
    const envFile = join(layout.state.apis.v2.shared, V2_ENV_FILE_NAME);
    const lines = [
      `# GENERATED by publication/host_agent/src/provision/render/unit_v2.ts — do NOT edit.`,
      `# Derived from ${layout.declarationPath}; a hand edit is refused by 'provision check' as drift.`,
      `# TEMPLATE: the agent starts/stops '<this unit>@<port>' (polkit) to health-check a release`,
      `# under test on a scratch port. Never enabled; the agent repoints ${scratch} first.`,
      ``,
      `[Unit]`,
      `Description=Dedalo Publication API v2 scratch boot on port %i - instance ${layout.instance}`,
      `Documentation=file://${layout.declarationPath}`,
      `AssertPathIsDirectory=${scratch}`,
      `AssertFileIsExecutable=${layout.bunBin}`,
      `AssertFileIsExecutable=${ENV_BIN}`,
      ``,
      `[Service]`,
      `Type=simple`,
      `User=${identity.v2User}`,
      ...v2GroupLines(layout),
      `# The release under test (the agent's scratch symlink), never the agent's own uid.`,
      `WorkingDirectory=${scratch}`,
      `EnvironmentFile=${envFile}`,
      `# NODE_ENV/HOST/PORT set by env(1) AFTER the file: v2.env cannot move it off loopback.`,
      `ExecStart=${v2ExecStart(layout, '%i')}`,
      `# No LoadCredential=: the scratch boot holds no secret of the agent.`,
      ``,
      ...v2Sandbox(layout),
      ``,
      `Restart=no`,
      `TimeoutStopSec=30`,
      `KillSignal=SIGTERM`,
      `StandardOutput=journal`,
      `StandardError=journal`,
      `SyslogIdentifier=${layout.v2.unit}-scratch`,
      `# No install section: started on demand by the agent, never at boot.`,
      ``,
    ];
    return [
      artifact(layout, {
        kind: 'v2_scratch_unit',
        path: layout.v2ScratchUnitPath,
        mode: 'unitFile',
        body: unitBody(lines),
        effects: ['daemon_reload'],
      }),
    ];
  },
};
