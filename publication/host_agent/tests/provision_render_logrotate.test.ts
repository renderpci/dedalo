/**
 * The site's web log rotation (render/logrotate.ts; owner decision 1(c)): the vhost logs into
 * `/var/log/<server>/<domain>/`, which the distribution's own logrotate files (one glob level under
 * /var/log/apache2, /var/log/httpd, /var/log/nginx) never reach — this stamped file does. The
 * family's log group, the server's reopen, the home layout only, every value re-checked.
 */
import { describe, expect, test } from 'bun:test';
import { parseStamp } from '../src/provision/hash';
import type { HostDeclaration } from '../src/provision/layout';
import { derive } from '../src/provision/layout';
import { logrotateBody, logrotateRenderer, v1LogrotateBody, v1LogrotateRenderer } from '../src/provision/render/logrotate';
import { PENDING_FACTS } from '../src/provision/render/types';
import { unixDeclaration } from './fixtures/provision_declaration';

const HOME = '/home/museum.example.org';

function homeSite(web: HostDeclaration['web'], flavor: 'debian' | 'el' | 'remi'): HostDeclaration {
  return {
    ...unixDeclaration(),
    web,
    agent_dir: `${HOME}/host_agent`,
    state_root: `${HOME}/dedalo`,
    bun_bin: `${HOME}/.bun/bin/bun`,
    site: { domain: 'museum.example.org', fpm: { flavor, version: '8.4' } },
  };
}

const DEBIAN = derive(homeSite({ server: 'apache', unit: 'apache2' }, 'debian'));
const EL = derive(homeSite({ server: 'apache', unit: 'httpd' }, 'el'));
const NGINX_EL = derive(homeSite({ server: 'nginx', unit: 'nginx' }, 'remi'));

describe('the artifact', () => {
  test('stamped root 0644 at /etc/logrotate.d/dedalo_<instance>_web; no effect, no validator', () => {
    const [a] = logrotateRenderer.render(DEBIAN, PENDING_FACTS);
    expect([a?.kind, a?.path, a?.owner, a?.group, a?.mode]).toEqual(['logrotate', '/etc/logrotate.d/dedalo_test_web', 'root', 'root', 0o644]);
    expect(a?.effects).toEqual([]);
    expect(a?.validate).toBeNull();
    expect(parseStamp(a?.body ?? '')).toMatchObject({ kind: 'logrotate', instance: 'test' });
  });

  test('the home layout only: no site, or the system layout, renders nothing', () => {
    expect(logrotateRenderer.appliesTo?.(DEBIAN)).toBe(true);
    expect(logrotateRenderer.appliesTo?.(derive(unixDeclaration()))).toBe(false);
    expect(logrotateRenderer.appliesTo?.(derive({ ...unixDeclaration(), site: { domain: 'museum.example.org', fpm: { flavor: 'debian', version: '8.4' } } }))).toBe(false);
  });
});

describe('the stanza', () => {
  test("Debian/Ubuntu Apache: /var/log/apache2/<domain>, the distribution's own policy, adm, a graceful reload", () => {
    const lines = logrotateBody(DEBIAN).split('\n');
    expect(lines).toContain('/var/log/apache2/museum.example.org/*.log {');
    for (const directive of ['daily', 'missingok', 'rotate 14', 'compress', 'delaycompress', 'notifempty', 'sharedscripts', 'postrotate', 'endscript']) expect(lines).toContain(`\t${directive}`);
    expect(lines).toContain('\tcreate 0640 root adm');
    expect(lines).toContain('\t\tsystemctl --quiet is-active apache2.service && systemctl reload apache2.service || true');
  });

  test('EL httpd: /var/log/httpd/<domain>, group root', () => {
    const lines = logrotateBody(EL).split('\n');
    expect(lines).toContain('/var/log/httpd/museum.example.org/*.log {');
    expect(lines).toContain('\tcreate 0640 root root');
    expect(lines).toContain('\t\tsystemctl --quiet is-active httpd.service && systemctl reload httpd.service || true');
  });

  test("nginx: /var/log/nginx/<domain>, USR1 to the master (its reopen), never a reload", () => {
    const body = logrotateBody(NGINX_EL);
    expect(body).toContain('/var/log/nginx/museum.example.org/*.log {');
    expect(body).toContain('systemctl kill --kill-whom=main --signal=USR1 nginx.service');
    expect(body).not.toContain('reload');
  });

  test('a value outside its grammar renders nothing', () => {
    expect(() => logrotateBody({ ...DEBIAN, web: { ...DEBIAN.web, unit: 'apache2; rm -rf /' } })).toThrow('render(logrotate): web.unit');
    expect(() => logrotateBody(derive(unixDeclaration()))).toThrow('no site');
  });
});

describe("B5: the v1 pool's own log (logrotate_v1)", () => {
  const SYSTEM = derive({ ...unixDeclaration(), site: { domain: 'museum.example.org', fpm: { flavor: 'debian', version: '8.4' } } });

  test('stamped root 0644 at /etc/logrotate.d/dedalo_<instance>_v1, every site in either layout; no site: nothing', () => {
    const [a] = v1LogrotateRenderer.render(DEBIAN, PENDING_FACTS);
    expect([a?.kind, a?.path, a?.owner, a?.group, a?.mode]).toEqual(['logrotate_v1', '/etc/logrotate.d/dedalo_test_v1', 'root', 'root', 0o644]);
    expect(a?.effects).toEqual([]);
    expect(a?.validate).toBeNull();
    expect(parseStamp(a?.body ?? '')).toMatchObject({ kind: 'logrotate_v1', instance: 'test' });
    expect(v1LogrotateRenderer.appliesTo?.(DEBIAN)).toBe(true);
    expect(v1LogrotateRenderer.appliesTo?.(SYSTEM)).toBe(true);
    expect(v1LogrotateRenderer.appliesTo?.(derive(unixDeclaration()))).toBe(false);
  });

  test('the pool error_log directory, as the v1 user (su: root never renames in a directory another account owns), the new file the pool user 0600; no reopen', () => {
    const lines = v1LogrotateBody(SYSTEM).split('\n');
    const user = SYSTEM.v1!.user;
    expect(lines).toContain(`${SYSTEM.site?.v1?.var.log}/*.log {`);
    expect(lines).toContain(`\tsu ${user} root`);
    expect(lines).toContain(`\tcreate 0600 ${user} root`);
    for (const directive of ['daily', 'missingok', 'rotate 14', 'compress', 'delaycompress', 'notifempty']) expect(lines).toContain(`\t${directive}`);
    // PHP opens its error_log anew for every message: nothing to signal.
    expect(lines.some(line => line.includes('postrotate'))).toBe(false);
  });

  test('a value outside its grammar renders nothing', () => {
    expect(() => v1LogrotateBody({ ...SYSTEM, v1: { ...SYSTEM.v1!, user: 'root; x' } })).toThrow('render(logrotate): v1.user');
    expect(() => v1LogrotateBody(derive(unixDeclaration()))).toThrow('no site');
  });
});
