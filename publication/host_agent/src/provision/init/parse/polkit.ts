/**
 * DISCOVERY: polkit (spec §3.2 row polkit; §4.3 `host.polkit`). The systemd floor is
 * layout.ts SYSTEMD_FLOOR (one profile, S10).
 *
 * The agent's grants are JavaScript polkit rules (render/polkit.ts): polkit before 0.106 only
 * reads the old .pkla format, so 0.105 (Ubuntu 22.04) is below the floor. `pkaction --version`
 * prints `pkaction version 0.105` (old numbering) or `pkaction version 125` (from 121 on;
 * measured: EL 9 0.117, EL 10 125).
 *
 * PURE, ZERO-DEPENDENCY (tests/provision_zero_dep.test.ts): no imports.
 */

/** The lowest polkit that reads JavaScript rules (`0.106` → 106). */
export const POLKIT_JS_FLOOR = 106;

/** `pkaction --version` → one comparable number: `0.105` → 105, `0.115` → 115, `124` → 124; null when unreadable. */
export function parsePolkitVersion(text: string): number | null {
  const match = /(?:^|\s)(\d+)(?:\.(\d+))?\s*$/.exec(text.trim().split('\n')[0] ?? '');
  if (!match) return null;
  const major = Number(match[1]);
  if (major === 0 && match[2] !== undefined) return Number(match[2]);
  return major;
}

/*
 * WHETHER polkit ANSWERS. polkitd is D-Bus-activated on every supported OS: the package ships no
 * [Install] section (`UnitFileState=static`) and the system bus starts `polkit.service` on the first
 * authorization request, through the activation file below (its `SystemdService=` names the unit).
 * So "not running" at discovery is the NORMAL state of an idle host, not a fault (measured,
 * 2026-10-09, systemd PID 1 containers: Debian 13 polkit 126 and Ubuntu 26.04 polkit 127 both list
 * nothing for `polkit.service` until the first `pkaction`, then `loaded active running`;
 * `systemctl show` says LoadState=loaded, ActiveState=inactive, UnitFileState=static, CanStart=yes).
 */

/** The system bus activation file polkit's package ships (Debian, Ubuntu, EL: the same path). */
export const POLKIT_DBUS_SERVICE = '/usr/share/dbus-1/system-services/org.freedesktop.PolicyKit1.service';
/** The unit the activation file must name. */
export const POLKIT_UNIT = 'polkit.service';

/**
 * `running`: active now. `activatable`: loaded, not masked, and the system bus starts it on demand.
 * `masked`: systemd refuses to start it. `not_activatable`: loaded or not, nothing starts it.
 */
export type PolkitState = 'running' | 'activatable' | 'masked' | 'not_activatable';

/** True when a `[D-BUS Service]` file's `SystemdService=` is `unit` (comments and other sections ignored). */
export function dbusActivatesUnit(text: string, unit: string): boolean {
  let section = '';
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '').trim();
    if (line === '' || line.startsWith('#')) continue;
    const header = /^\[(.+)\]$/.exec(line);
    if (header) {
      section = header[1] as string;
      continue;
    }
    if (section !== 'D-BUS Service') continue;
    const match = /^SystemdService\s*=\s*(\S+)$/.exec(line);
    if (match && match[1] === unit) return true;
  }
  return false;
}

/**
 * The state from what discovery read: `listedActive` (list-units says active), `show`
 * (`systemctl show polkit.service`: LoadState, ActiveState, UnitFileState) and the activation file's
 * text (null = absent).
 */
export function polkitState(listedActive: boolean, show: ReadonlyMap<string, string>, dbusService: string | null): PolkitState {
  if (listedActive || show.get('ActiveState') === 'active') return 'running';
  if (show.get('LoadState') === 'masked' || (show.get('UnitFileState') ?? '').startsWith('masked')) return 'masked';
  if (show.get('LoadState') === 'loaded' && dbusService !== null && dbusActivatesUnit(dbusService, POLKIT_UNIT)) return 'activatable';
  return 'not_activatable';
}
