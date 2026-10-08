/**
 * DISCOVERY: the operating system, its kernel and a hosting panel (spec §3.2 rows OS, Kernel,
 * Panel; S8 the supported family).
 *
 * THE SUPPORTED FAMILY (decision C, spec S8; owner decision 2026-10-08) is OS_SUPPORT, one row per
 * (distribution, major version): Debian 12/13, Ubuntu 24.04 and 26.04, RHEL/Rocky/Alma 9 and 10.
 * Everything else is a blocking "needs your decision → manual guide" item (compare `host.os`), and
 * `unsupportedReason` names why: Ubuntu 22.04 (polkit 0.105, below the JavaScript-rules floor
 * 106); EL 8 (systemd 239, below the units' floor 247, and kernel 4.18, below Bun's); the other
 * RHEL-likes (CentOS Stream, Oracle Linux) "not supported". The rows are the ONLY place a
 * family's package tool, web user, Apache flavor, FPM flavors, nologin shells and dnf-module use
 * are written; compare and draft read them from here.
 *
 * MEASURED (container captures, tests/fixtures/init/captured/*, 2026-10-08): EL 9 ships systemd
 * 252, polkit 0.117, httpd 2.4.62, nginx 1.20 and PHP 8.0 as `dnf module` streams; EL 10 ships
 * systemd 257, polkit 125, httpd 2.4.63, nginx 1.26 and PHP 8.3 with NO modules, and no mod_php.
 * Ubuntu 26.04 ships systemd 259, polkit 127, apache2 2.4.66, nginx 1.28.3, PHP 8.5 and sudo-rs
 * as /usr/bin/sudo (and visudo): the agent's one Cmnd_Alias + NOPASSWD rule passes visudo -cf/-c
 * and runs under it (container probe, 2026-10-08); the row is otherwise the 24.04 row.
 *
 * THE KERNEL (S8): Bun documents a Linux floor (BUN_KERNEL_FLOOR, layout.ts, moved with the
 * pin). Every supported row's distribution kernel is above it (EL 9 5.14, Debian 12 6.1, Ubuntu
 * 24.04 6.8, Debian 13 6.12, EL 10 6.12, Ubuntu 26.04 7.0); a host below it (an old custom
 * kernel) is a blocking `host.kernel`.
 *
 * PURE, ZERO-DEPENDENCY (tests/provision_zero_dep.test.ts): node: builtins, ../../layout and
 * ../types only.
 */
import { BUN_KERNEL_FLOOR } from '../../layout';
import type { OsFamily, OsSupport } from '../types';

/* ── /etc/os-release ─────────────────────────────────────────────────────────────── */

export interface OsRelease {
  /** `ID`, lower case; '' when absent. */
  readonly id: string;
  /** `VERSION_ID`; '' when absent (Debian testing/sid has none). */
  readonly versionId: string;
  /** `ID_LIKE`, split on whitespace. */
  readonly idLike: readonly string[];
  readonly prettyName: string;
}

/** The value of one os-release assignment: shell-like quoting, `\` escapes inside double quotes. */
function unquote(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\([\\"$`])/g, '$1');
  }
  return value;
}

/** os-release(5): `KEY=value` lines; comments and blank lines ignored. */
export function parseOsRelease(text: string): OsRelease {
  const values = new Map<string, string>();
  for (const line of text.split('\n')) {
    const match = /^\s*([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match) values.set(match[1] as string, unquote(match[2] as string));
  }
  return Object.freeze({
    id: (values.get('ID') ?? '').toLowerCase(),
    versionId: values.get('VERSION_ID') ?? '',
    idLike: Object.freeze((values.get('ID_LIKE') ?? '').toLowerCase().split(/\s+/).filter(Boolean)),
    prettyName: values.get('PRETTY_NAME') ?? '',
  });
}

const EL_IDS = ['rhel', 'rocky', 'almalinux', 'centos', 'ol', 'fedora'];

/** The package family (install.sh's `family_of`): Debian, Ubuntu, EL (any RHEL-like), other. */
export function osFamily(os: OsRelease): OsFamily {
  if (os.id === 'debian') return 'debian';
  if (os.id === 'ubuntu') return 'ubuntu';
  if (EL_IDS.includes(os.id) || os.idLike.some(like => ['rhel', 'fedora', 'centos'].includes(like))) return 'el';
  if (os.idLike.includes('ubuntu')) return 'ubuntu';
  if (os.idLike.includes('debian')) return 'debian';
  return 'other';
}

/* ── the supported family (S8) ───────────────────────────────────────────────────── */

const DEBIAN_NOLOGIN = Object.freeze(['/usr/sbin/nologin']);
/** EL ships both paths (/sbin is a link to /usr/sbin); useradd takes the first real file. */
const EL_NOLOGIN = Object.freeze(['/usr/sbin/nologin', '/sbin/nologin']);

function row(fields: OsSupport): OsSupport {
  return Object.freeze({ ...fields, ids: Object.freeze([...fields.ids]), fpmFlavors: Object.freeze([...fields.fpmFlavors]) });
}

/**
 * THE SUPPORTED OS ROWS (spec S8, decision C). `kernelFloor` is BUN_KERNEL_FLOOR on every row.
 * Every row's systemd (Debian 12 252, Ubuntu 24.04 255, Debian 13 257, Ubuntu 26.04 259, EL 9 252,
 * EL 10 257) is
 * above the units' one floor (layout.ts SYSTEMD_FLOOR); compare checks the measured version.
 */
export const OS_SUPPORT: readonly OsSupport[] = Object.freeze([
  row({
    ids: ['debian'],
    version: '12',
    family: 'debian',
    packageTool: 'apt',
    webUser: 'www-data',
    apacheFlavor: 'debian',
    fpmFlavors: ['debian'],
    nologinShells: DEBIAN_NOLOGIN,
    dnfModules: false,
    appStreamPhp: null,
    kernelFloor: BUN_KERNEL_FLOOR,
  }),
  row({
    ids: ['debian'],
    version: '13',
    family: 'debian',
    packageTool: 'apt',
    webUser: 'www-data',
    apacheFlavor: 'debian',
    fpmFlavors: ['debian'],
    nologinShells: DEBIAN_NOLOGIN,
    dnfModules: false,
    appStreamPhp: null,
    kernelFloor: BUN_KERNEL_FLOOR,
  }),
  row({
    ids: ['ubuntu'],
    version: '24.04',
    family: 'ubuntu',
    packageTool: 'apt',
    webUser: 'www-data',
    apacheFlavor: 'debian',
    fpmFlavors: ['debian'],
    nologinShells: DEBIAN_NOLOGIN,
    dnfModules: false,
    appStreamPhp: null,
    kernelFloor: BUN_KERNEL_FLOOR,
  }),
  row({
    ids: ['ubuntu'],
    version: '26.04',
    family: 'ubuntu',
    packageTool: 'apt',
    webUser: 'www-data',
    apacheFlavor: 'debian',
    fpmFlavors: ['debian'],
    nologinShells: DEBIAN_NOLOGIN,
    dnfModules: false,
    appStreamPhp: null,
    kernelFloor: BUN_KERNEL_FLOOR,
  }),
  row({
    ids: ['rhel', 'rocky', 'almalinux'],
    version: '9',
    family: 'el',
    packageTool: 'dnf',
    webUser: 'apache',
    apacheFlavor: 'el',
    fpmFlavors: ['el', 'remi'],
    nologinShells: EL_NOLOGIN,
    dnfModules: true,
    appStreamPhp: null,
    kernelFloor: BUN_KERNEL_FLOOR,
  }),
  row({
    ids: ['rhel', 'rocky', 'almalinux'],
    version: '10',
    family: 'el',
    packageTool: 'dnf',
    webUser: 'apache',
    apacheFlavor: 'el',
    fpmFlavors: ['el', 'remi'],
    nologinShells: EL_NOLOGIN,
    dnfModules: false,
    appStreamPhp: '8.3',
    kernelFloor: BUN_KERNEL_FLOOR,
  }),
]);

/** The version a row is keyed by: EL by major (`9.4` → `9`, `10.2` → `10`), Debian by major, Ubuntu exact (`24.04`, `26.04`). */
function rowVersion(os: OsRelease): string {
  if (os.id === 'ubuntu') return os.versionId;
  return os.versionId.split('.')[0] ?? '';
}

/** The OS_SUPPORT row for this os-release, or null (unsupported). */
export function osSupportFor(os: OsRelease): OsSupport | null {
  const version = rowVersion(os);
  return OS_SUPPORT.find(candidate => candidate.ids.includes(os.id) && candidate.version === version) ?? null;
}

/** The supported family in one phrase (every refusal names it). */
export const SUPPORTED_SUMMARY = 'Debian 12/13, Ubuntu 24.04/26.04, RHEL/Rocky/Alma 9 and 10';

/**
 * Why an OS without a row is not supported — the `host.os` item's fact. Never null for an
 * unsupported OS: an unknown one is "not supported" with its os-release name.
 */
export function unsupportedReason(os: OsRelease): string | null {
  if (osSupportFor(os) !== null) return null;
  const name = os.prettyName || `${os.id} ${os.versionId}`.trim() || 'this OS (no /etc/os-release ID)';
  if (os.id === 'ubuntu' && os.versionId === '22.04') {
    return `${name}: polkit 0.105 (below the JavaScript-rules floor 0.106): upgrade to Ubuntu 24.04/26.04 or Debian 12/13`;
  }
  if (os.id === 'ubuntu' || os.id === 'debian') {
    return `${name} is not a supported release (Debian 12/13, Ubuntu 24.04/26.04); the manual guide applies`;
  }
  if (osFamily(os) === 'el' && rowVersion(os) === '8') {
    return `${name}: EL 8 (systemd 239, kernel 4.18) is below the units' systemd floor and Bun's kernel floor: upgrade to RHEL, Rocky or Alma 9 or 10; the manual guide applies`;
  }
  if (osFamily(os) === 'el') {
    return `${name} is not supported (RHEL, Rocky and Alma 9 and 10 are); the manual guide applies`;
  }
  return `${name} is not supported (${SUPPORTED_SUMMARY}); the manual guide applies`;
}

/* ── versions and the kernel (S8) ────────────────────────────────────────────────── */

/** Dotted numeric compare on the leading numeric parts (`4.18.0-553…` vs `5.1`): <0, 0, >0. */
export function compareVersions(a: string, b: string): number {
  const parts = (value: string): number[] => (/^\d+(?:\.\d+)*/.exec(value)?.[0] ?? '').split('.').filter(Boolean).map(Number);
  const left = parts(a);
  const right = parts(b);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export interface KernelRelease {
  /** The whole release string (`5.14.0-427.el9.x86_64`). */
  readonly release: string;
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

/** /proc/sys/kernel/osrelease → its numeric parts. Throws on a release with no `<major>.<minor>`. */
export function parseKernelRelease(text: string): KernelRelease {
  const release = text.trim();
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(release);
  if (!match) throw new Error(`parse(os): kernel release '${release.slice(0, 80)}' has no <major>.<minor>`);
  return Object.freeze({ release, major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3] ?? 0) });
}

/** HostFacts.kernel: the release against the row's floor (BUN_KERNEL_FLOOR without a row). */
export function kernelFacts(release: string, support: OsSupport | null): { readonly release: string; readonly meetsFloor: boolean } {
  const parsed = parseKernelRelease(release);
  const floor = support?.kernelFloor ?? BUN_KERNEL_FLOOR;
  return Object.freeze({ release: parsed.release, meetsFloor: compareVersions(parsed.release, floor) >= 0 });
}

/* ── hosting panels (§3.2 row Panel; host.panel is blocking on its own) ───────────── */

/** A path whose presence names a hosting panel. Order matters only for a host with two. */
export const PANEL_MARKERS: readonly { readonly path: string; readonly panel: string }[] = Object.freeze([
  { path: '/usr/local/psa', panel: 'plesk' },
  { path: '/usr/local/ispconfig', panel: 'ispconfig' },
  { path: '/usr/local/cpanel', panel: 'cpanel' },
  { path: '/etc/webmin/virtual-server', panel: 'virtualmin' },
  { path: '/usr/local/hestia', panel: 'hestia' },
  { path: '/usr/local/vesta', panel: 'vesta' },
  { path: '/usr/local/directadmin', panel: 'directadmin' },
  { path: '/home/clp', panel: 'cloudpanel' },
  { path: '/www/server/panel', panel: 'aapanel' },
  { path: '/usr/local/cwpsrv', panel: 'cwp' },
  { path: '/usr/local/webuzo', panel: 'webuzo' },
  { path: '/usr/local/apnscp', panel: 'apiscp' },
  { path: '/var/www/froxlor', panel: 'froxlor' },
].map(entry => Object.freeze(entry)));

/** The first panel whose marker is present (lstat, never followed), or null. */
export function detectPanel(present: (path: string) => boolean): string | null {
  return PANEL_MARKERS.find(marker => present(marker.path))?.panel ?? null;
}
