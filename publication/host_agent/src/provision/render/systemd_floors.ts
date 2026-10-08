/**
 * THE systemd DIRECTIVE CENSUS (spec S10): the oldest systemd that understands each directive FORM
 * the unit renderers emit. Every supported OS ships systemd ≥ 252 (Debian 12, EL 9), so the units
 * have ONE profile: SYSTEMD_FLOOR (layout.ts, 247 — LoadCredential=, ProtectProc=). Every renderer
 * passes its lines through `checkDirectives`, which throws on a form the table does not date: a
 * renderer cannot emit a directive nobody dated. Every row is at most SYSTEMD_FLOOR (held by
 * tests/provision_render_units.test.ts), so no unit carries a form a supported host's systemd
 * would ignore (systemd warns and skips an unknown directive — hardening lost silently); a newer
 * form needs the floor moved first. Below the floor `host.systemd` blocks init and plan refuses.
 *
 * KEYED BY (directive, value) where the value decides the version (ProtectHome= per value,
 * ProtectSystem=strict, ProtectProc= per value, RestrictNamespaces= per form, SystemCallFilter= per
 * group), by the directive name otherwise (`value: null`).
 *
 * Versions from systemd's NEWS / systemd.exec(5) "Added in version N".
 *
 * PURE, ZERO-DEPENDENCY.
 */

export interface DirectiveFloor {
  readonly directive: string;
  /** null: every value of the directive dates the same. */
  readonly value: string | null;
  /** The first systemd version that accepts this form. */
  readonly since: number;
}

function row(directive: string, value: string | null, since: number): DirectiveFloor {
  return Object.freeze({ directive, value, since });
}

/** Every directive form a rendered unit may carry, with the systemd that introduced it. */
export const SYSTEMD_DIRECTIVE_FLOORS: readonly DirectiveFloor[] = Object.freeze([
  // [Unit]
  row('Description', null, 1),
  row('Documentation', null, 1),
  row('After', null, 1),
  row('Wants', null, 1),
  row('AssertPathIsDirectory', null, 218),
  row('AssertFileIsExecutable', null, 218),
  row('StartLimitIntervalSec', null, 230),
  row('StartLimitBurst', null, 1),
  // [Service] identity and process
  row('Type', null, 1),
  row('User', null, 1),
  row('Group', null, 1),
  row('SupplementaryGroups', null, 1),
  row('WorkingDirectory', null, 1),
  row('ExecStart', null, 1),
  row('ExecStartPre', null, 1),
  row('Environment', null, 1),
  row('EnvironmentFile', null, 1),
  row('LoadCredential', null, 247),
  row('RuntimeDirectory', null, 211),
  row('RuntimeDirectoryMode', null, 211),
  row('UMask', null, 1),
  row('Restart', null, 1),
  row('RestartSec', null, 1),
  row('TimeoutStopSec', null, 1),
  row('KillSignal', null, 1),
  row('StandardOutput', null, 1),
  row('StandardError', null, 1),
  row('SyslogIdentifier', null, 1),
  // [Service] sandbox — value-dependent forms first
  row('NoNewPrivileges', null, 187),
  row('ProtectSystem', 'yes', 214),
  row('ProtectSystem', 'full', 214),
  row('ProtectSystem', 'strict', 232),
  row('ProtectHome', 'yes', 214),
  row('ProtectHome', 'read-only', 214),
  row('ProtectHome', 'tmpfs', 238),
  row('ProtectProc', 'invisible', 247),
  row('ProtectProc', 'noaccess', 247),
  row('ProtectProc', 'ptraceable', 247),
  row('RestrictNamespaces', 'yes', 233),
  row('SystemCallFilter', '@system-service', 231),
  row('PrivateTmp', null, 1),
  row('PrivateDevices', null, 209),
  row('ProtectKernelTunables', null, 232),
  row('ProtectKernelModules', null, 232),
  row('ProtectKernelLogs', null, 244),
  row('ProtectControlGroups', null, 232),
  row('ProtectClock', null, 245),
  row('RestrictSUIDSGID', null, 242),
  row('RestrictRealtime', null, 231),
  row('LockPersonality', null, 235),
  row('RestrictAddressFamilies', null, 211),
  row('ReadWritePaths', null, 231),
  // [Install]
  row('WantedBy', null, 1),
]);

/** The printed form of a row: `Name=value`, or `Name=` for a value-independent directive. */
export function formOf(entry: DirectiveFloor): string {
  return `${entry.directive}=${entry.value ?? ''}`;
}

/** The row a directive line belongs to, or null (not dated: the renderer may not emit it). */
export function floorRow(line: string): DirectiveFloor | null {
  const cut = line.indexOf('=');
  if (cut <= 0) return null;
  const directive = line.slice(0, cut);
  const value = line.slice(cut + 1);
  const valued = SYSTEMD_DIRECTIVE_FLOORS.filter(entry => entry.directive === directive);
  if (valued.length === 0) return null;
  const exact = valued.find(entry => entry.value === value);
  if (exact) return exact;
  return valued.find(entry => entry.value === null) ?? null;
}

const DIRECTIVE_LINE = /^[A-Za-z]+=/;

/**
 * Throws on a directive line whose form the table does not date (every dated form is within
 * SYSTEMD_FLOOR). Comments, section headers and blank lines pass. Returns the lines unchanged.
 */
export function checkDirectives<T extends readonly string[]>(lines: T): T {
  for (const line of lines) {
    if (!DIRECTIVE_LINE.test(line)) continue;
    const entry = floorRow(line);
    if (entry === null) {
      throw new Error(
        `render: the unit line '${line}' names a directive form render/systemd_floors.ts does not date — ` +
          'add its row (the systemd version that introduced it) before rendering it',
      );
    }
  }
  return lines;
}
