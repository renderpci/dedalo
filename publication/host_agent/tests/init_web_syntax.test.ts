/**
 * THE REAL PARSERS (spec §9 init_web_syntax): the rendered web include, the vhost reference and the
 * pool are accepted by the servers themselves, not only by our tests.
 *   - Apache (`-t`): the Debian and the EL include (they differ only in the socket path) inside a
 *     vhost, with proxy, proxy_fcgi, proxy_http, rewrite and headers loaded; the EL include loaded
 *     AFTER and BEFORE a copy of EL 9's and EL 10's conf.d/php.conf (captured fixtures), so the
 *     `<If>`-wrapped handler parses in both orders (the EL drill proves which handler wins at runtime);
 *     the vhost carrying init's stamped `IncludeOptional` reference (web_edit.ts).
 *   - nginx (`-t -c`): the zero-match vhost reference to the include, the include itself, and the
 *     provisioned host map include (zero-match until the first push).
 *   - PHP-FPM (`-t -y`): the rendered Debian-flavour pool (the EL flavours differ only in paths,
 *     held by provision_render_fpm_pool; the EL drill runs them).
 * RED, not skipped, on Linux (CI) when a server is missing; on Darwin a missing one is skipped
 * with its reason (developer machines). Scratch tree under .test-tmp/, the runner's own uid.
 *
 * SEAMS: the scratch layout repoints state_root / config_base / host_base / nginx_conf_d /
 * v1_var_base into the scratch tree; the pool's listen.owner/listen.group (host accounts —
 * www-data does not exist on a developer machine) are replaced by the runner's own user and group.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { apacheBinary, apacheMainConf, nginxMainConf, phpFpmBinary, sh } from '../../../scripts/lib/web_server_harness';
import { APACHE_MODULES } from '../src/provision/exec_contract';
import { insertApacheReference, insertNginxReference } from '../src/provision/init/web_edit';
import type { AgentLayout, HostDeclaration } from '../src/provision/layout';
import { derive } from '../src/provision/layout';
import { fpmPoolBody } from '../src/provision/render/fpm_pool';
import { nginxMapIncludeRenderer } from '../src/provision/render/nginx_map_include';
import { PENDING_FACTS } from '../src/provision/render/types';
import { apacheWebInclude, nginxWebInclude, webIncludePath } from '../src/provision/render/web_include';
import { tlsDeclaration, unixDeclaration } from './fixtures/provision_declaration';

const LINUX = process.platform === 'linux';
const has = (cmd: string) => sh(['sh', '-c', `command -v ${cmd}`]).code === 0;
const APACHE = has('apxs');
const NGINX = has('nginx');
const FPM = phpFpmBinary();

/** A missing server: red on Linux, skipped with its reason elsewhere. */
function gate(present: boolean, what: string): typeof test {
  if (present) return test;
  if (LINUX) {
    return ((name: string) => test(name, () => {
      throw new Error(`${what} is missing on this Linux host — the syntax gate is RED, not skipped (install it)`);
    })) as unknown as typeof test;
  }
  return test.skip;
}

let SCRATCH = '';
const FIXTURES = join(import.meta.dir, 'fixtures', 'init', 'captured');
const EL_PHP_CONF = { el9: join(FIXTURES, 'rocky9', 'php.conf'), el10: join(FIXTURES, 'rocky10', 'php.conf') };

function scratchLayout(base: HostDeclaration, flavor: 'debian' | 'el', server: 'apache' | 'nginx'): AgentLayout {
  return derive({
    ...base,
    web: server === 'apache' ? { server, unit: flavor === 'el' ? 'httpd' : 'apache2' } : { server, unit: 'nginx', nginx_map: 'conf_d' },
    state_root: join(SCRATCH, 'state'),
    site: { domain: 'museum.example.org', fpm: { flavor, version: flavor === 'el' ? '8.2' : '8.4' } },
    paths: {
      config_base: join(SCRATCH, 'etc'),
      host_base: join(SCRATCH, 'host'),
      nginx_conf_d: join(SCRATCH, 'conf.d'),
      v1_var_base: join(SCRATCH, 'var'),
    },
  });
}

beforeAll(() => {
  const dir = join(import.meta.dir, '..', '.test-tmp', 'init_web_syntax');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  SCRATCH = realpathSync(dir);
  for (const sub of ['etc/test', 'state/publication_api/v1', 'state/rules', 'host/nginx_map', 'conf.d', 'var/test/v1/tmp', 'var/test/v1/log', 'www', 'nginx_tmp']) {
    mkdirSync(join(SCRATCH, sub), { recursive: true });
  }
});

afterAll(() => {
  rmSync(SCRATCH, { recursive: true, force: true });
});

/** A vhost carrying init's stamped reference (web_edit.ts) to the include written at its path. */
function apacheVhost(layout: AgentLayout, port: number, before: string | null, after: string | null): string {
  const include = webIncludePath(layout);
  writeFileSync(include, apacheWebInclude(layout));
  const vhost = insertApacheReference(`<VirtualHost 127.0.0.1:${port}>\n    ServerName museum.example.org\n</VirtualHost>\n`, layout.instance, include);
  const site = join(SCRATCH, `site_${layout.site?.fpm.flavor}_${before ? 'after' : after ? 'before' : 'alone'}.conf`);
  writeFileSync(site, [before ? `Include "${before}"` : '', vhost, after ? `Include "${after}"` : ''].join('\n'));
  return site;
}

function apacheTest(site: string): { code: number; out: string } {
  const conf = join(SCRATCH, 'httpd.conf');
  // php.conf names mod_setenvif / mod_dir / mod_mime directives; the include needs APACHE_MODULES minus ssl.
  const modules = [...APACHE_MODULES.filter(m => m !== 'ssl'), 'setenvif', 'dir'];
  writeFileSync(conf, apacheMainConf(SCRATCH, 18443, site, true, { modules }));
  return sh([apacheBinary(), '-t', '-f', conf]);
}

describe('Apache accepts the web include', () => {
  gate(APACHE, 'Apache (apxs)')('the Debian include, referenced from a vhost by init\'s two lines', () => {
    const layout = scratchLayout(unixDeclaration(), 'debian', 'apache');
    const result = apacheTest(apacheVhost(layout, 18443, null, null));
    expect(result.out).toContain('Syntax OK');
    expect(result.code).toBe(0);
  });

  for (const [el, file] of Object.entries(EL_PHP_CONF)) {
    gate(APACHE, 'Apache (apxs)')(`the EL include after ${el}'s php.conf, and before it`, () => {
      expect(existsSync(file)).toBe(true);
      const layout = scratchLayout(unixDeclaration(), 'el', 'apache');
      for (const [before, after] of [[file, null], [null, file]] as const) {
        const result = apacheTest(apacheVhost(layout, 18443, before, after));
        expect(result.out).toContain('Syntax OK');
        expect(result.code).toBe(0);
      }
    });
  }

  gate(APACHE, 'Apache (apxs)')('not vacuous: a broken include is refused by the same run', () => {
    const layout = scratchLayout(unixDeclaration(), 'debian', 'apache');
    const site = apacheVhost(layout, 18443, null, null);
    writeFileSync(webIncludePath(layout), apacheWebInclude(layout).replace('<FilesMatch', '<FilesMatchBroken'));
    expect(apacheTest(site).code).not.toBe(0);
  });
});

describe('nginx accepts the include, the zero-match reference and the host map include', () => {
  gate(NGINX, 'nginx')('nginx -t with the reference glob, the include and the provisioned map include', () => {
    const layout = scratchLayout(tlsDeclaration(), 'debian', 'nginx');
    const include = webIncludePath(layout);
    writeFileSync(include, nginxWebInclude(layout));
    writeFileSync(join(SCRATCH, 'fastcgi_params'), '');
    const reference = insertNginxReference('server {\n}\n', layout.instance, include).split('\n')[2] as string;
    const serverInclude = join(SCRATCH, 'server_body.conf');
    writeFileSync(serverInclude, `${reference}\n`);
    const mapInclude = nginxMapIncludeRenderer.render(layout, PENDING_FACTS)[0]!;
    writeFileSync(join(SCRATCH, 'map_include.conf'), mapInclude.body);
    const conf = join(SCRATCH, 'nginx.conf');
    writeFileSync(conf, nginxMainConf(SCRATCH, 18080, serverInclude, join(SCRATCH, 'map_include.conf')));
    const result = sh(['nginx', '-t', '-c', conf, '-p', SCRATCH]);
    expect(result.out).toContain('syntax is ok');
    expect(result.code).toBe(0);
  });
});

describe('PHP-FPM accepts the pool', () => {
  gate(FPM !== null, 'php-fpm')('php-fpm -t -y with the rendered Debian-flavour pool', () => {
    const layout = scratchLayout(unixDeclaration(), 'debian', 'apache');
    const user = sh(['id', '-un']).out.trim();
    const group = sh(['id', '-gn']).out.trim();
    const pool = fpmPoolBody(layout)
      // sun_path caps at 104 bytes on macOS and the checkout path is long: a short name `-t` checks, never binds.
      .replace(/^listen = .*$/m, `listen = /tmp/ddv1-${process.pid}.sock`)
      .replace(/^listen\.owner = .*$/m, `listen.owner = ${user}`)
      .replace(/^listen\.group = .*$/m, `listen.group = ${group}`)
      .replace(/^user = .*$/m, `user = ${user}`);
    writeFileSync(join(SCRATCH, 'pool.conf'), pool);
    const conf = join(SCRATCH, 'php-fpm.conf');
    writeFileSync(conf, `[global]\npid = ${join(SCRATCH, 'fpm.pid')}\nerror_log = ${join(SCRATCH, 'fpm.log')}\ninclude = ${join(SCRATCH, 'pool.conf')}\n`);
    const result = sh([FPM as string, '-t', '-y', conf]);
    expect(result.out).toContain('test is successful');
    expect(result.code).toBe(0);
  });
});
