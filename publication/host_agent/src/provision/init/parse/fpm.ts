/**
 * DISCOVERY: PHP-FPM installs and their pools (spec §3.2 row FPM; S5 the flavor table; §4.3
 * `host.fpm_install`, `host.fpm_cli`, `declaration.fpm`, `home.root`'s pool facts).
 *
 * THE FLAVORS (S5): Debian `php<v>-fpm` (one per /etc/php/<v>, several side by side), EL
 * AppStream `php-fpm` (one per host, the module stream's version), Remi SCL `php<NN>-php-fpm`
 * (/etc/opt/remi/php<NN>, beside AppStream). `fpmFlavors` enumerates the installs present from
 * what observe.ts saw on disk; the paths are fpmLayout's (layout.ts, the one S5 table), so a
 * flavor's binary, unit, pool directory and socket directory are written once.
 *
 * `-tt` (`fpmDump`) prints the EFFECTIVE configuration, one `[section]` per pool, but not the
 * file a pool came from; `parsePoolSections` reads the section headers of each pool file so
 * `parseFpmTT` can name it. Pool files and `-tt` both carry `env[…]`/`php_admin_value[…]`
 * values that may be secrets: a pool keeps user, group, listen and POOL_PATH_KEYS only, a pool
 * file its section names only.
 *
 * PURE, ZERO-DEPENDENCY (tests/provision_zero_dep.test.ts): node:path, ../../layout and
 * ../types only.
 */
import { dirname } from 'node:path';
import type { FpmFlavor } from '../../layout';
import { FPM_BIN_PATTERN, PHP_CLI_PATTERN, fpmLayout } from '../../layout';
import type { FpmPool } from '../types';

/* ── `-tt` ───────────────────────────────────────────────────────────────────────── */

/**
 * A pool as `-tt` shows it: FpmPool plus the effective POOL_PATH_KEYS values (the `home.root`
 * facts read `chdir`, `php_admin_value[error_log]`…). `-tt` also prints `env[…]` and
 * `php_admin_value[…]` values that may be credentials: only POOL_PATH_KEYS are kept.
 */
export interface FpmDumpPool extends FpmPool {
  /** The POOL_PATH_KEYS of the section that are set (`undefined` dropped). */
  readonly values: Readonly<Record<string, string>>;
}

/** The pool values that put files somewhere (§3.2 row Home: pool paths under the site home). */
export const POOL_PATH_KEYS: readonly string[] = Object.freeze([
  'chdir',
  'php_admin_value[error_log]',
  'php_value[error_log]',
  'php_admin_value[session.save_path]',
  'php_value[session.save_path]',
  'php_admin_value[upload_tmp_dir]',
  'php_value[upload_tmp_dir]',
  'slowlog',
  'access.log',
]);

/**
 * `php-fpm -tt` (its stderr; stdout too, concatenated): `[date] NOTICE: [pool]` headers and
 * `[date] NOTICE: \tkey = value` lines. `[global]` (and `[General]`) is not a pool.
 * `sectionFiles` maps a pool name to the pool file that declares it ('' when none does).
 */
export function parseFpmTT(text: string, sectionFiles: ReadonlyMap<string, string> = new Map()): FpmDumpPool[] {
  const pools: { name: string; values: Record<string, string> }[] = [];
  let current: { name: string; values: Record<string, string> } | null = null;
  let sawTestLine = false;
  for (const raw of text.split('\n')) {
    const body = raw.replace(/\r$/, '').replace(/^\[[^\]]*\]\s+(?:NOTICE|WARNING|ERROR|ALERT):\s?/, '');
    if (/configuration file .* test is successful/.test(body)) {
      sawTestLine = true;
      continue;
    }
    const header = /^\[([^\]]+)\]\s*$/.exec(body.trim());
    if (header) {
      const name = header[1] as string;
      current = name === 'global' || name === 'General' ? null : { name, values: {} };
      if (current) pools.push(current);
      continue;
    }
    const pair = /^\s*([A-Za-z0-9_.[\]-]+)\s*=\s*(.*?)\s*$/.exec(body);
    if (pair && current && pair[2] !== 'undefined') current.values[pair[1] as string] = pair[2] as string;
  }
  if (!sawTestLine) {
    const first = text.split('\n').find(line => /ERROR|ALERT/.test(line)) ?? text.split('\n')[0] ?? '';
    throw new Error(`parse(fpm): -tt did not report a successful test: '${first.trim().slice(0, 160)}'`);
  }
  return pools.map(pool => {
    const kept: Record<string, string> = {};
    for (const key of POOL_PATH_KEYS) if (pool.values[key] !== undefined) kept[key] = pool.values[key] as string;
    return Object.freeze({
      name: pool.name,
      file: sectionFiles.get(pool.name) ?? '',
      user: pool.values.user ?? '',
      group: pool.values.group ?? '',
      listen: pool.values.listen ?? '',
      values: Object.freeze(kept),
    });
  });
}

/** The `[section]` names a pool file declares (`[global]` excluded); comments (`;`, `#`) skipped. */
export function parsePoolSections(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/[;#].*$/, '').trim();
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header && header[1] !== 'global') out.push(header[1] as string);
  }
  return out;
}

/* ── installs (`fpmFlavors`) ─────────────────────────────────────────────────────── */

export interface FpmCandidate {
  readonly flavor: FpmFlavor;
  /** `<major>.<minor>`; for `el` the CLI's version once probed ('' until then: AppStream's version is the module stream's). */
  readonly version: string;
  readonly bin: string;
  readonly unit: string;
  readonly poolDir: string;
  /** The directory its pools' sockets live in (the dedicated v1 socket's directory). */
  readonly socketDir: string;
  readonly cli: string;
}

/** What observe.ts saw on disk: `ls /etc/php`, `ls /etc/opt/remi`, and a real-file test. */
export interface FpmPresence {
  readonly debianVersions: readonly string[];
  readonly remiNames: readonly string[];
  readonly isRealFile: (path: string) => boolean;
}

/** The S5 row for (flavor, version) with no instance: the dirs and binaries only. */
function candidate(flavor: FpmFlavor, version: string): FpmCandidate {
  // fpmLayout needs an instance name and a server to fill pool/listen/webUser; neither is read here.
  const row = fpmLayout('probe', flavor, version === '' ? '0.0' : version, 'apache');
  return Object.freeze({
    flavor,
    version,
    bin: row.bin,
    unit: row.unit,
    poolDir: dirname(row.poolFile),
    socketDir: dirname(row.listen),
    cli: row.cli,
  });
}

/**
 * Every FPM install present (`fpmFlavors(present)`, spec §2.1): one Debian candidate per
 * `/etc/php/<v>` whose `/usr/sbin/php-fpm<v>` is a real file; the AppStream one when
 * `/usr/sbin/php-fpm` is; one Remi candidate per `/etc/opt/remi/php<NN>` whose
 * `/opt/remi/php<NN>/root/usr/sbin/php-fpm` is. Sorted by flavor, then version.
 */
export function fpmFlavors(present: FpmPresence): FpmCandidate[] {
  const out: FpmCandidate[] = [];
  for (const version of [...present.debianVersions].filter(name => /^\d+\.\d+$/.test(name)).sort(compareMinor)) {
    const found = candidate('debian', version);
    if (FPM_BIN_PATTERN.test(found.bin) && present.isRealFile(found.bin)) out.push(found);
  }
  const appstream = candidate('el', '');
  if (present.isRealFile(appstream.bin)) out.push(appstream);
  const remi = present.remiNames
    .map(name => /^php(\d)(\d)$/.exec(name))
    .filter((match): match is RegExpExecArray => match !== null)
    .map(match => `${match[1]}.${match[2]}`)
    .sort(compareMinor);
  for (const version of remi) {
    const found = candidate('remi', version);
    if (FPM_BIN_PATTERN.test(found.bin) && present.isRealFile(found.bin)) out.push(found);
  }
  return out;
}

function compareMinor(a: string, b: string): number {
  const [aMajor = 0, aMinor = 0] = a.split('.').map(Number);
  const [bMajor = 0, bMinor = 0] = b.split('.').map(Number);
  return aMajor - bMajor || aMinor - bMinor;
}

/** `phpVersion` output (`8.2.20`, `8.1.2-1ubuntu2.26`) → `<major>.<minor>.<patch…>` as printed; null when not a version. */
export function parsePhpVersion(text: string): string | null {
  const value = text.trim();
  return /^\d+\.\d+\.\d+/.test(value) ? value : null;
}

/** `8.2.20` → `8.2`. */
export function minorOf(version: string): string {
  return /^(\d+\.\d+)/.exec(version)?.[1] ?? '';
}

/** The CLI path is one PHP_CLI_PATTERN accepts (phpVersion's validator; observe tests the realpath). */
export function isPhpCliPath(path: string): boolean {
  return PHP_CLI_PATTERN.test(path);
}
