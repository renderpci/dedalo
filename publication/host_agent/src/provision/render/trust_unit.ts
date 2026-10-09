/**
 * ROOT'S FAPOLICYD TRUST ONESHOT (owner decision 2026-10-09) — `dedalo-pubhost-trust-<instance>.service`,
 * root:root 0644, ONE unit per instance (kind `trust_unit`, stamped with the instance), rendered
 * ONLY on a host where fapolicyd is installed (layout.trust, derive()'s DeriveHost.fapolicyd).
 *
 * `Type=oneshot`, `User=root`, an EMPTY environment, no argument from anyone: ExecStart names the
 * instance and its declaration — both root-written here — and runs the instance's pinned Bun
 * (`--no-env-file --no-install`) over the trust program in the root-owned agent_dir
 * (src/provision/fapolicyd_trust_main.ts), which DERIVES the trust set from that declaration
 * (src/provision/fapolicyd_trust.ts) and rewrites `/etc/fapolicyd/trust.d/dedalo_<instance>`. An
 * agent may only `start` it (its one polkit pair, render/polkit.ts); `systemctl start` waits for a
 * oneshot, so the agent reads a fresh result afterwards. Bootstrap: `provision apply` writes the
 * same file in-process first (the plan's `write` + `fapolicyd-update`), so this unit's own Bun and
 * code are trusted before any agent starts it.
 *
 * SANDBOX: ProtectSystem=full keeps /usr, /boot and /etc read-only but for the trust directory and
 * the instance's config directory (the result record); /var/lib (the host provision lock, fapolicyd's
 * database read by `--dump-db`) and /run (fapolicyd's fifo) stay writable. No
 * MemoryDenyWriteExecute (Bun's JIT). Every directive is dated by render/systemd_floors.ts and
 * within SYSTEMD_FLOOR (`checkDirectives`). Not enabled, never started by the plan.
 *
 * PURE, ZERO-DEPENDENCY.
 */
import { join } from 'node:path';
import type { AgentLayout } from '../layout';
import { FAPOLICYD_TRUST_DIR, FAPOLICYD_UNIT } from '../layout';
import { checkDirectives } from './systemd_floors';
import type { Artifact, RenderFacts, Renderer } from './types';
import { artifact } from './types';

/** The trust program, below agent_dir. */
export const TRUST_PROGRAM_ENTRY = 'src/provision/fapolicyd_trust_main.ts';

/** `<bun> --no-env-file --no-install <agent_dir>/<entry> <instance> <declaration>`. */
export function trustExecStart(layout: AgentLayout): string {
  return `${layout.bunBin} --no-env-file --no-install ${join(layout.agentDir, TRUST_PROGRAM_ENTRY)} ${layout.instance} ${layout.declarationPath}`;
}

/** The unit's body below the stamp, floored to the declaration's systemd. */
export function trustUnitBody(layout: AgentLayout): string {
  const trust = layout.trust;
  if (trust === null) throw new Error(`render(trust_unit): '${layout.instance}' has no fapolicyd trust (fapolicyd is not installed)`);
  const lines = [
    `# Rewrites /etc/fapolicyd/trust.d for instance '${layout.instance}' from ${layout.declarationPath}.`,
    '# Started by its agent after a release install or rollback (polkit: start only); never enabled.',
    '[Unit]',
    `Description=Dédalo publication host: fapolicyd trust of instance ${layout.instance}`,
    `After=${FAPOLICYD_UNIT}`,
    '',
    '[Service]',
    'Type=oneshot',
    'User=root',
    'Group=root',
    `WorkingDirectory=${layout.agentDir}`,
    `ExecStart=${trustExecStart(layout)}`,
    'Environment=',
    'UMask=0022',
    'NoNewPrivileges=yes',
    'PrivateTmp=yes',
    'ProtectSystem=full',
    `ReadWritePaths=-${FAPOLICYD_TRUST_DIR}`,
    `ReadWritePaths=-${layout.instanceDir}`,
    'ProtectHome=read-only',
    'ProtectKernelTunables=yes',
    'ProtectKernelModules=yes',
    'ProtectControlGroups=yes',
    'RestrictRealtime=yes',
    'RestrictSUIDSGID=yes',
    'LockPersonality=yes',
    'StandardOutput=journal',
    'StandardError=journal',
    `SyslogIdentifier=${trust.unit}`,
    '',
  ];
  return checkDirectives(lines).join('\n');
}

export const trustUnitRenderer: Renderer = {
  kind: 'trust_unit',
  appliesTo: layout => layout.trust !== null,
  render(layout: AgentLayout, _facts: RenderFacts): Artifact[] {
    const trust = layout.trust;
    if (trust === null) return [];
    return [
      artifact(layout, {
        kind: 'trust_unit',
        path: trust.unitPath,
        mode: 'unitFile',
        body: trustUnitBody(layout),
        effects: ['daemon_reload'],
      }),
    ];
  },
};
