/**
 * The operator-file transaction (spec §5.10, §9 init_run 5/6/8/17): under the host web lock; the
 * TOCTOU re-read; root-owned chain or never written; backup; Debian a2enmod recorded and undone;
 * configtest failure → restore + dismod + second configtest, no reload; a master dying at the reload
 * → restore + configtest + restart, rolled_back{reload}; the hand-map seed as ONE transaction.
 */
import { describe, expect, test } from 'bun:test';
import { derive } from '../src/provision/layout';
import type { HostDeclaration } from '../src/provision/layout';
import type { WebTxnPorts } from '../src/provision/init/web_txn';
import { editOperatorFile, handMapLines, seedNginxMap, sha256 } from '../src/provision/init/web_txn';
import { insertApacheReference } from '../src/provision/init/web_edit';
import { NGINX_MAP_PINS, envelopePcre, parseNginxMap } from '../src/rules/directives';
import { renderHostMap } from '../src/rules/host_map';
import { unixDeclaration, tlsDeclaration } from './fixtures/provision_declaration';
import { FakeInitHost } from './support/provision_fake_host';

const VHOST = '/etc/apache2/sites-enabled/museum.conf';
const BACKUP = '/var/lib/dedalo_publication_host_init/test/backup/1-museum.conf';
const TEXT = '<VirtualHost *:443>\n    ServerName www.museum.org\n</VirtualHost>\n';
const INCLUDE = '/etc/dedalo_publication_host/test/web.apache.conf';

function world(decl: HostDeclaration = unixDeclaration(), options: { os?: 'debian' | 'el'; selinux?: 'absent' | 'enforcing' } = {}) {
  const layout = derive(decl);
  const host = new FakeInitHost(layout, { os: options.os ?? 'debian', selinux: options.selinux ?? 'absent' });
  host.seedFile(VHOST, TEXT);
  host.seedDir('/var/lib/dedalo_publication_host_init/test/backup');
  host.seedDir(layout.host.nginxMapDir);
  host.seedDir(layout.host.nginxContribDir);
  host.seedDir(layout.host.nginxConfD);
  const server = layout.web.server;
  const ports: WebTxnPorts = {
    io: host,
    exec: host.exec,
    lockIo: host.lockIo,
    webLock: { dir: layout.host.locksDir, uid: 0, gid: 989 },
    web: { server, bin: layout.web.configtestBin, unit: layout.web.unit },
    lstat: path => host.lstat(path),
    trustRoot: '/',
    rootUid: 0,
    rootGid: 0,
    selinux: (options.selinux ?? 'absent') === 'enforcing',
    debian: (options.os ?? 'debian') === 'debian',
    sleepSync: ms => host.lockIo.sleepSync(ms),
    layout,
  };
  host.units.set(layout.web.unit, { enabled: true, active: true });
  return { layout, host, ports };
}

function edit(after = insertApacheReference(TEXT, 'test', INCLUDE), mods: string[] = []) {
  const bytes = new TextEncoder().encode(after);
  return { item: 'web.vhost.abcdef12', target: VHOST, beforeSha: sha256(TEXT), after: bytes, afterSha: sha256(bytes), server: 'apache' as const, backup: BACKUP, mods };
}

const webLock = (ports: WebTxnPorts) => `${ports.webLock.dir}/web.lock`;

describe('editOperatorFile', () => {
  test('pass: the new bytes with the owner and mode kept, the backup root 0600, configtest → reload, the lock released', () => {
    const { host, ports } = world();
    host.entries.get(VHOST)!.mode = 0o640;
    const result = editOperatorFile(edit(), ports);
    expect(result).toEqual({ outcome: 'done', modsEnabled: [] });
    expect(host.body(VHOST)).toContain(`IncludeOptional ${INCLUDE}`);
    expect(host.entries.get(VHOST)).toMatchObject({ uid: 0, gid: 0, mode: 0o640 });
    expect(host.entries.get(BACKUP)).toMatchObject({ body: TEXT, mode: 0o600, uid: 0 });
    expect(host.calls.filter(call => /^(configtest|reload) /.test(call))).toEqual(['configtest apache', 'reload apache2']);
    expect(host.lockIo.calls).toContain(`open ${webLock(ports)}`);
    expect(host.lockIo.heldBySelf(webLock(ports))).toBeNull();
  });

  test('TOCTOU: changed since shown → nothing written, nothing reloaded', () => {
    const { host, ports } = world();
    host.entries.get(VHOST)!.body = `${TEXT}# edited\n`;
    expect(editOperatorFile(edit(), ports)).toEqual({ outcome: 'failed', reason: 'changed since shown; re-run' });
    expect(host.body(VHOST)).toBe(`${TEXT}# edited\n`);
    expect(host.calls).not.toContain('reload apache2');
    expect(host.entries.has(BACKUP)).toBe(false);
  });

  test('a file (or an ancestor) a non-root principal could swap is never written', () => {
    const { host, ports } = world();
    host.entries.get(VHOST)!.uid = 990;
    expect(editOperatorFile(edit(), ports).reason).toContain("owned by uid 990, not root");
    const second = world();
    second.host.entries.get('/etc/apache2')!.mode = 0o777;
    expect(editOperatorFile(edit(), second.ports).reason).toContain("'/etc/apache2' (above");
    expect(second.host.body(VHOST)).toBe(TEXT);
  });

  test('configtest fails: the original bytes back, the enabled modules disabled again, configtest again, no reload', () => {
    const { host, ports } = world();
    host.configtestBreakers.push('BROKEN');
    const result = editOperatorFile(edit(`${TEXT}BROKEN\n`, ['rewrite', 'headers']), ports);
    expect(result).toMatchObject({ outcome: 'rolled_back', exit1: 1, exit2: 0, modsEnabled: [] });
    expect(host.body(VHOST)).toBe(TEXT);
    expect(host.calls).toContain('a2enmod rewrite headers');
    expect(host.calls).toContain('a2dismod rewrite headers');
    expect(host.calls.filter(call => call === 'configtest apache')).toHaveLength(2);
    expect(host.calls).not.toContain('reload apache2');
    expect(host.lockIo.heldBySelf(webLock(ports))).toBeNull();
  });

  test('the master dies at the reload (the EL AVC case): restore, configtest, restart, rolled_back{reload}', () => {
    const { host, ports } = world();
    host.reloadKills.add('apache2');
    const result = editOperatorFile(edit(), ports);
    expect(result.outcome).toBe('rolled_back');
    expect(result.reason).toContain('rolled_back{reload}: apache2 was not active after the reload');
    expect(result.reason).toContain('active again');
    expect(host.body(VHOST)).toBe(TEXT);
    expect(host.calls.filter(call => /^(configtest|reload|restart) /.test(call))).toEqual(['configtest apache', 'reload apache2', 'configtest apache', 'restart apache2']);
  });

  test('EL: no module is ever enabled (the operator loads it); SELinux: restorecon of the one file', () => {
    const el = world({ ...unixDeclaration(), web: { server: 'apache', unit: 'httpd' } }, { os: 'el', selinux: 'enforcing' });
    expect(editOperatorFile(edit(undefined, ['ssl']), el.ports).reason).toContain('Debian only');
    expect(el.host.calls.some(call => call.startsWith('a2enmod'))).toBe(false);
    expect(editOperatorFile(edit(), el.ports).outcome).toBe('done');
    expect(el.host.calls).toContain(`restorecon ${VHOST}`);
  });

  test('the new bytes must match their sha; the server must be this host\'s', () => {
    const { ports } = world();
    expect(editOperatorFile({ ...edit(), afterSha: 'f'.repeat(64) }, ports).reason).toContain('do not match');
    expect(editOperatorFile({ ...edit(), server: 'nginx' }, ports).reason).toContain('for nginx');
  });
});

describe('nginx_map_seed', () => {
  const pins = NGINX_MAP_PINS[NGINX_MAP_PINS.length - 1]!;
  const handMap = renderHostMap([{ hash: 'c'.repeat(64), envelope: envelopePcre('media', 'image'), pinsId: pins.id }]).text;
  const HAND = '/etc/nginx/conf.d/dedalo_hand_map.conf';
  const nginx = () => world({ ...tlsDeclaration(), web: { server: 'nginx', unit: 'nginx', nginx_map: 'conf_d' } });

  test('the fixture is a map the grammar admits', () => {
    expect('why' in parseNginxMap(handMap)).toBe(false);
  });

  test('stand-alone: live map + _seed.json + include written, the hand map removed, ONE configtest + reload', () => {
    const { layout, host, ports } = nginx();
    host.seedFile(HAND, handMap);
    const result = seedNginxMap(
      { item: 'web.nginx_manual_map.x', target: HAND, beforeSha: sha256(handMap), standalone: true, backup: BACKUP, seeded: [layout.host.nginxMapInclude] },
      ports,
    );
    expect(result).toEqual({ outcome: 'done' });
    const live = host.body(`${layout.host.nginxMapDir}/dedalo_media_map.nginx.conf`) ?? '';
    expect(live).toBe(renderHostMap([{ hash: 'c'.repeat(64), envelope: envelopePcre('media', 'image'), pinsId: pins.id }]).text);
    expect(JSON.parse(host.body(`${layout.host.nginxContribDir}/_seed.json`) ?? '{}')).toMatchObject({ instance: '_seed', envelope: envelopePcre('media', 'image') });
    expect(host.body(layout.host.nginxMapInclude)?.startsWith('# dedalo-provision: _host nginx_map_include ')).toBe(true);
    expect(host.entries.has(HAND)).toBe(false);
    expect(host.body(BACKUP)).toBe(handMap);
    expect(host.calls.filter(call => /^(configtest|reload) /.test(call))).toEqual(['configtest nginx', 'reload nginx']);
  });

  test('a failing configtest: the hand map restored, every seeded file removed, configtest again, no reload', () => {
    const { layout, host, ports } = nginx();
    host.seedFile(HAND, handMap);
    host.configtestBreakers.push('dedalo-provision: _host nginx_map_include');
    const result = seedNginxMap(
      { item: 'x', target: HAND, beforeSha: sha256(handMap), standalone: true, backup: BACKUP, seeded: [layout.host.nginxMapInclude] },
      ports,
    );
    expect(result.outcome).toBe('rolled_back');
    expect(host.body(HAND)).toBe(handMap);
    for (const path of [`${layout.host.nginxMapDir}/dedalo_media_map.nginx.conf`, `${layout.host.nginxContribDir}/_seed.json`, layout.host.nginxMapInclude]) {
      expect(host.entries.has(path)).toBe(false);
    }
    expect(host.calls).not.toContain('reload nginx');
  });

  test('mixed into another file: only the map blocks and their header go', () => {
    const { layout, host, ports } = nginx();
    const mixed = `user nginx;\n${handMap}events {}\n`;
    host.seedFile(HAND, mixed);
    const found = handMapLines(mixed);
    expect('lines' in found && found.lines.length > 0).toBe(true);
    const result = seedNginxMap({ item: 'x', target: HAND, beforeSha: sha256(mixed), standalone: false, backup: BACKUP, seeded: [] }, ports);
    expect(result).toEqual({ outcome: 'done' });
    const kept = host.body(HAND) ?? '';
    expect(kept).toContain('user nginx;');
    expect(kept).toContain('events {}');
    expect(kept).not.toContain('map $uri');
    expect(kept).not.toContain('config-hash');
    expect(host.entries.has(layout.host.nginxMapInclude)).toBe(false);
  });

  test('a hand map the grammar refuses is never migrated', () => {
    const { host, ports } = nginx();
    const bad = handMap.replace('"_invalid_"', '"_other_"');
    host.seedFile(HAND, bad);
    const result = seedNginxMap({ item: 'x', target: HAND, beforeSha: sha256(bad), standalone: true, backup: BACKUP, seeded: [] }, ports);
    expect(result.outcome).toBe('failed');
    expect(result.reason).toContain('does not pass the map grammar');
    expect(host.body(HAND)).toBe(bad);
    expect(host.calls.some(call => call.startsWith('configtest'))).toBe(false);
  });
});
