/**
 * ROOT'S HOST-MAP ONESHOT UNIT (spec §13.5) — `dedalo-pubhost-map.service`, root:root 0644,
 * ONE unit per host (kind `host_map_unit`, stamped `_host`: hash.ts HOST_WIDE_KINDS).
 *
 * `Type=oneshot`, `User=root`, no argument, an EMPTY environment: it runs root's renderer copy
 * (src/provision/host_map_renderer.ts) — the copied Bun with `--no-env-file --no-install` and an
 * empty bunfig passed as `--config=` (init/constants.ts BUN_CONFIG_FLAG_PREFIX), so nothing in the working directory or the environment can preload or install
 * code. An agent may only `start` it (its one polkit pair, render/polkit.ts); `systemctl start`
 * waits for a oneshot to finish, so the agent reads a fresh result.json afterwards.
 *
 * SANDBOX: what root's run needs and nothing more — it writes HOST_NGINX_MAP_DIR only
 * (ProtectSystem=full keeps /usr, /boot, /etc read-only; /var/lib stays writable), runs
 * `nginx -t` (which opens nginx's own log and pid paths) and `systemctl reload nginx.service`
 * (D-Bus). No MemoryDenyWriteExecute (Bun's JIT). Every directive is dated by
 * render/systemd_floors.ts and within SYSTEMD_FLOOR (`checkDirectives`). Not enabled, never
 * started by the plan: only on demand.
 *
 * On an nginx `conf_d` host only. PURE, ZERO-DEPENDENCY.
 */
import { dirname, join } from 'node:path';
import { BUN_CONFIG_FLAG_PREFIX } from '../init/constants';
import type { AgentLayout } from '../layout';
import { HOST_MAP_UNIT } from '../layout';
import { MAP_RENDERER_BUN, MAP_RENDERER_BUNFIG, MAP_RENDERER_ENTRY } from '../host_map_renderer';
import { checkDirectives } from './systemd_floors';
import type { Artifact, RenderFacts, Renderer } from './types';
import { artifact } from './types';

/** The unit file's path: beside the instance's own units (paths.unit_dir). */
export function hostMapUnitPath(layout: AgentLayout): string {
  return join(dirname(layout.agentUnitPath), `${HOST_MAP_UNIT}.service`);
}

/** The unit's body below the stamp, floored to the declaration's systemd. */
export function hostMapUnitBody(layout: AgentLayout): string {
  const dir = layout.host.mapRendererDir;
  const lines = [
    `# Renders the host-wide nginx media map from every instance's contribution (root's copy in ${dir}).`,
    '# Started by an agent (polkit: start only); never enabled.',
    '[Unit]',
    'Description=Dédalo publication host: render the host-wide nginx media map',
    'After=nginx.service',
    '',
    '[Service]',
    'Type=oneshot',
    'User=root',
    'Group=root',
    `WorkingDirectory=${dir}`,
    // `--config=`, never `-c`: Bun 1.4 reads `-c <file> <entry>` as the entry <file> — the empty
    // bunfig — so the unit "succeeded" running nothing (measured: the init drill's 503, no result.json).
    `ExecStart=${join(dir, MAP_RENDERER_BUN)} --no-env-file --no-install ${BUN_CONFIG_FLAG_PREFIX}${join(dir, MAP_RENDERER_BUNFIG)} ${join(dir, MAP_RENDERER_ENTRY)}`,
    'Environment=',
    'UMask=0022',
    'NoNewPrivileges=yes',
    'PrivateTmp=yes',
    'ProtectSystem=full',
    'ProtectHome=read-only',
    'ProtectKernelTunables=yes',
    'ProtectKernelModules=yes',
    'ProtectControlGroups=yes',
    'RestrictRealtime=yes',
    'RestrictSUIDSGID=yes',
    'LockPersonality=yes',
    'StandardOutput=journal',
    'StandardError=journal',
    `SyslogIdentifier=${HOST_MAP_UNIT}`,
    '',
  ];
  return checkDirectives(lines).join('\n');
}

export const hostMapUnitRenderer: Renderer = {
  kind: 'host_map_unit',
  appliesTo: layout => layout.web.server === 'nginx' && layout.web.nginxMap === 'conf_d',
  render(layout: AgentLayout, _facts: RenderFacts): Artifact[] {
    return [
      artifact(layout, {
        kind: 'host_map_unit',
        path: hostMapUnitPath(layout),
        mode: 'unitFile',
        body: hostMapUnitBody(layout),
        effects: ['daemon_reload'],
        hostWide: true,
      }),
    ];
  },
};
