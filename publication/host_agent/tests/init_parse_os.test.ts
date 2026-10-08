/**
 * parse/os.ts — os-release, the supported family (S8, decision C; owner decision 2026-10-08:
 * EL 9 and 10, never 8), the kernel floor, hosting panels. Over the captured os-release of every
 * §3.2 OS.
 */
import { describe, expect, test } from 'bun:test';
import { BUN_KERNEL_FLOOR } from '../src/provision/layout';
import {
  OS_SUPPORT,
  PANEL_MARKERS,
  compareVersions,
  detectPanel,
  kernelFacts,
  osFamily,
  osSupportFor,
  parseKernelRelease,
  parseOsRelease,
  SUPPORTED_SUMMARY,
  unsupportedReason,
} from '../src/provision/init/parse/os';
import { caseDirs, caseJson, fixture } from './fixtures/init/load';

const os = (name: string) => parseOsRelease(fixture(`captured/${name}/os-release`));

describe('the fixture tree', () => {
  test('every case directory says whether it is typed, and a capture names its source', () => {
    const dirs = caseDirs();
    expect(dirs.length).toBeGreaterThan(20);
    for (const dir of dirs) {
      const meta = caseJson(dir);
      expect(typeof meta.typed).toBe('boolean');
      expect(meta.typed).toBe(dir.startsWith('typed/'));
      if (!meta.typed) expect(meta.captured).toContain('docker');
    }
  });
});

describe('os-release and the supported family (S8)', () => {
  const supported: [string, string, string][] = [
    ['debian12', 'debian', '12'],
    ['debian13', 'debian', '13'],
    ['ubuntu2404', 'ubuntu', '24.04'],
    ['ubuntu2604', 'ubuntu', '26.04'],
    ['rocky9', 'el', '9'],
    ['alma9', 'el', '9'],
    ['rhel9', 'el', '9'],
    ['rocky10', 'el', '10'],
    ['alma10', 'el', '10'],
    ['rhel10', 'el', '10'],
  ];
  for (const [name, family, version] of supported) {
    test(`${name} is supported (${family} ${version})`, () => {
      const release = os(name);
      const row = osSupportFor(release);
      expect(row).not.toBeNull();
      expect(row?.family).toBe(family as never);
      expect(row?.version).toBe(version);
      expect(osFamily(release)).toBe(family as never);
      expect(unsupportedReason(release)).toBeNull();
    });
  }

  test('an EL point release keys by its major (9.8 → 9, 10.2 → 10), Ubuntu by its exact version', () => {
    expect(os('rocky9').versionId).toBe('9.8');
    expect(osSupportFor(os('rocky9'))?.version).toBe('9');
    expect(os('rhel10').versionId).toBe('10.2');
    expect(os('rhel10').idLike).toEqual(['centos', 'fedora']);
    expect(osSupportFor(os('rhel10'))?.version).toBe('10');
    expect(osSupportFor(parseOsRelease('ID=ubuntu\nVERSION_ID="24.10"\n'))).toBeNull();
    expect(os('ubuntu2604').versionId).toBe('26.04');
    expect(os('ubuntu2604').prettyName).toBe('Ubuntu 26.04.1 LTS');
    expect(osSupportFor(os('ubuntu2604'))?.version).toBe('26.04');
    expect(osSupportFor(parseOsRelease('ID=ubuntu\nVERSION_ID="25.10"\n'))).toBeNull();
  });

  test('Ubuntu 22.04 is not supported: polkit 0.105', () => {
    const release = os('ubuntu2204');
    expect(osSupportFor(release)).toBeNull();
    expect(osFamily(release)).toBe('ubuntu');
    expect(unsupportedReason(release)).toContain('polkit 0.105');
    expect(unsupportedReason(release)).toContain('upgrade to Ubuntu 24.04/26.04 or Debian 12/13');
  });

  test('CentOS Stream and Oracle Linux (9 and 10) are EL-family but not supported; the reason names 9 and 10', () => {
    for (const name of ['centos_stream9', 'centos_stream10', 'ol9', 'ol10']) {
      const release = os(name);
      expect(osFamily(release)).toBe('el');
      expect(osSupportFor(release)).toBeNull();
      expect(unsupportedReason(release)).toContain('is not supported (RHEL, Rocky and Alma 9 and 10 are)');
    }
    expect(os('centos_stream10').versionId).toBe('10');
  });

  test('EL 8 (RHEL, Rocky, Alma) is refused: systemd 239 and kernel 4.18, upgrade to 9 or 10', () => {
    for (const [id, like] of [['rhel', 'fedora'], ['rocky', 'rhel centos fedora'], ['almalinux', 'rhel centos fedora']]) {
      const release = parseOsRelease(`ID="${id}"\nID_LIKE="${like}"\nVERSION_ID="8.10"\nPRETTY_NAME="${id} 8.10"\n`);
      expect(osFamily(release)).toBe('el');
      expect(osSupportFor(release)).toBeNull();
      expect(unsupportedReason(release)).toBe(
        `${id} 8.10: EL 8 (systemd 239, kernel 4.18) is below the units' systemd floor and Bun's kernel floor: upgrade to RHEL, Rocky or Alma 9 or 10; the manual guide applies`,
      );
    }
    expect(OS_SUPPORT.some(row => row.version === '8')).toBe(false);
  });

  test('another Debian/Ubuntu release, and an unknown OS, name what is supported', () => {
    expect(unsupportedReason(parseOsRelease('ID=debian\nVERSION_ID="11"\n'))).toContain('(Debian 12/13, Ubuntu 24.04/26.04)');
    expect(unsupportedReason(parseOsRelease('ID=alpine\nVERSION_ID=3.20.0\n'))).toBe(`alpine 3.20.0 is not supported (${SUPPORTED_SUMMARY}); the manual guide applies`);
    expect(SUPPORTED_SUMMARY).toBe('Debian 12/13, Ubuntu 24.04/26.04, RHEL/Rocky/Alma 9 and 10');
    expect(unsupportedReason(parseOsRelease(''))).toContain('no /etc/os-release ID');
    expect(osFamily(parseOsRelease('ID=alpine\n'))).toBe('other');
    expect(osFamily(parseOsRelease('ID=linuxmint\nID_LIKE="ubuntu debian"\n'))).toBe('ubuntu');
    expect(osFamily(parseOsRelease('ID=raspbian\nID_LIKE=debian\n'))).toBe('debian');
  });

  test('quoting: single, double with escapes, comments, blank lines', () => {
    const release = parseOsRelease('# comment\n\nID=\'debian\'\nPRETTY_NAME="A \\"quoted\\" name"\nVERSION_ID=12\n');
    expect(release).toEqual({ id: 'debian', versionId: '12', idLike: [], prettyName: 'A "quoted" name' });
  });

  test('the rows: EL gets dnf, apache, el+remi, both nologin paths; dnf modules on EL 9 only', () => {
    const el9 = OS_SUPPORT.find(row => row.family === 'el' && row.version === '9');
    const el10 = OS_SUPPORT.find(row => row.family === 'el' && row.version === '10');
    for (const row of [el9, el10]) {
      expect(row).toMatchObject({ packageTool: 'dnf', webUser: 'apache', apacheFlavor: 'el' });
      expect(row?.fpmFlavors).toEqual(['el', 'remi']);
      expect(row?.nologinShells).toEqual(['/usr/sbin/nologin', '/sbin/nologin']);
      expect(row?.ids).toEqual(['rhel', 'rocky', 'almalinux']);
    }
    expect(el9?.dnfModules).toBe(true);
    expect(el10?.dnfModules).toBe(false);
    for (const row of OS_SUPPORT.filter(entry => entry.family !== 'el')) {
      expect(row).toMatchObject({ packageTool: 'apt', webUser: 'www-data', apacheFlavor: 'debian', dnfModules: false });
      expect(row.fpmFlavors).toEqual(['debian']);
    }
    for (const row of OS_SUPPORT) expect(row.kernelFloor).toBe(BUN_KERNEL_FLOOR);
    expect(OS_SUPPORT.map(row => `${row.family}${row.version}`)).toEqual(['debian12', 'debian13', 'ubuntu24.04', 'ubuntu26.04', 'el9', 'el10']);
  });
});

describe('the kernel (S8)', () => {
  const el9 = OS_SUPPORT.find(row => row.family === 'el' && row.version === '9') ?? null;
  const el10 = OS_SUPPORT.find(row => row.family === 'el' && row.version === '10') ?? null;
  const debian = OS_SUPPORT[0] ?? null;

  test('parseKernelRelease over the typed releases', () => {
    expect(parseKernelRelease(fixture('typed/kernel/osrelease_el9'))).toMatchObject({ major: 5, minor: 14 });
    expect(parseKernelRelease(fixture('typed/kernel/osrelease_el10'))).toEqual({ release: '6.12.0-211.62.1.el10_2.x86_64', major: 6, minor: 12, patch: 0 });
    expect(parseKernelRelease(fixture('typed/kernel/osrelease_debian12'))).toMatchObject({ major: 6, minor: 1, patch: 0 });
    expect(parseKernelRelease('6.8\n')).toMatchObject({ patch: 0 });
    expect(() => parseKernelRelease('garbage')).toThrow('no <major>.<minor>');
  });

  test('EL 9, EL 10 and Debian 12 meet the floor; below it is below, row or not', () => {
    expect(kernelFacts(fixture('typed/kernel/osrelease_el9'), el9).meetsFloor).toBe(true);
    expect(kernelFacts(fixture('typed/kernel/osrelease_el10'), el10).meetsFloor).toBe(true);
    expect(kernelFacts(fixture('typed/kernel/osrelease_debian12'), debian)).toEqual({ release: '6.1.0-25-amd64', meetsFloor: true });
    expect(kernelFacts('4.18.0-553.el8_10.x86_64', el9)).toEqual({ release: '4.18.0-553.el8_10.x86_64', meetsFloor: false });
    expect(kernelFacts('5.0.21', null)).toEqual({ release: '5.0.21', meetsFloor: false });
    expect(kernelFacts('5.1.0', null).meetsFloor).toBe(true);
  });

  test('compareVersions is numeric, not lexical', () => {
    expect(compareVersions('4.18.0-553', '5.1')).toBeLessThan(0);
    expect(compareVersions('5.10', '5.9')).toBeGreaterThan(0);
    expect(compareVersions('5.1', '5.1.0')).toBe(0);
    expect(compareVersions('x', '1')).toBeLessThan(0);
  });
});

describe('hosting panels', () => {
  test('each marker names its panel; none present → null; the spec panels are all there', () => {
    for (const marker of PANEL_MARKERS) expect(detectPanel(path => path === marker.path)).toBe(marker.panel);
    expect(detectPanel(() => false)).toBeNull();
    const panels = PANEL_MARKERS.map(marker => marker.panel);
    for (const name of ['plesk', 'hestia', 'virtualmin', 'cwp', 'webuzo', 'apiscp', 'froxlor']) expect(panels).toContain(name);
    expect(detectPanel(path => path === '/usr/local/cwpsrv')).toBe('cwp');
    expect(detectPanel(path => path === '/usr/local/apnscp')).toBe('apiscp');
  });
});
