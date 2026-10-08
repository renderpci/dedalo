/**
 * parse/apache.ts — `-S`, `-M`, `-t -D DUMP_INCLUDES`, `-v` (captured on Debian 12/13, Ubuntu
 * 22.04/24.04/26.04, Rocky/Alma 9 and 10), EL conf.modules.d and php.conf (captured: AppStream 8.0,
 * the 8.2 stream, EL 10's 8.3, Remi php82, Remi's mod_php under prefork), Debian's php-fpm conf, and the vhost
 * reader + matching rules (typed vhost files: alias-only, duplicates, our reference, the guide's
 * hand lines, wildcards; captured: a certbot -le-ssl vhost inside <IfModule mod_ssl.c>).
 */
import { describe, expect, test } from 'bun:test';
import { APACHE_MODULES } from '../src/provision/exec_contract';
import {
  fpmSocketOfHandler,
  hasPhpModule,
  ifModuleActive,
  matchVhost,
  matchVhosts,
  parseApacheS,
  parseApacheVersion,
  parseDumpIncludes,
  parseModules,
  parseModulesD,
  parsePhpConf,
  parseWebVersion,
  readVhostBlock,
} from '../src/provision/init/parse/apache';
import { fixture } from './fixtures/init/load';

const REFERENCE = '/etc/dedalo_publication_host/museum_org/web.apache.conf';
const site = (name: string) => fixture(`typed/apache/sites/${name}`);

describe('-S (vhosts, run user)', () => {
  test('Debian 12 (captured): a host:port single vhost, a single *:443, a name-based *:80 with an alias', () => {
    const parsed = parseApacheS(fixture('captured/debian12/apache_S.txt'));
    expect(parsed.user).toBe('www-data');
    expect(parsed.group).toBe('www-data');
    expect(parsed.entries.find(entry => entry.port === 8443)).toEqual({
      address: '192.0.2.10',
      port: 8443,
      serverName: 'other.org',
      file: '/etc/apache2/sites-enabled/other.org.conf',
      line: 1,
      aliases: [],
      isDefault: true,
    });
    // certbot's -le-ssl vhost sits inside <IfModule mod_ssl.c>: -S names line 2.
    expect(parsed.entries.find(entry => entry.port === 443)).toMatchObject({ serverName: 'museum.org', line: 2, aliases: [] });
    const port80 = parsed.entries.filter(entry => entry.port === 80);
    expect(port80.map(entry => entry.serverName)).toEqual(['172.17.0.4', 'museum.org']);
    expect(port80[0]?.isDefault).toBe(true);
    expect(port80[1]).toMatchObject({ aliases: ['www.museum.org'], isDefault: false });
  });

  for (const [host, user] of [['rocky9', 'apache'], ['alma9', 'apache'], ['rocky10', 'apache'], ['alma10', 'apache'], ['ubuntu2404', 'www-data'], ['ubuntu2604', 'www-data'], ['debian13', 'www-data']] as const) {
    test(`${host} (captured): the run user is ${user}; the -le-ssl vhost is listed`, () => {
      const parsed = parseApacheS(fixture(`captured/${host}/apache_S.txt`));
      expect(parsed.user).toBe(user);
      expect(parsed.entries.some(entry => entry.serverName === 'museum.org' && entry.port === 443)).toBe(true);
    });
  }

  test('typed: duplicates, an IPv6 address, a `wild alias`', () => {
    const parsed = parseApacheS(fixture('typed/apache/apache_S_typed.txt'));
    expect(parsed.entries.filter(entry => entry.serverName === 'museum.org')).toHaveLength(3);
    expect(parsed.entries.find(entry => entry.file.endsWith('ipv6.conf'))).toMatchObject({ address: '*', aliases: ['*.lan'] });
    expect(parsed.entries.find(entry => entry.file.endsWith('alias_only.conf'))?.isDefault).toBe(true);
  });

  test('empty output: no entries, no user', () => {
    expect(parseApacheS('')).toEqual({ entries: [], user: null, group: null });
  });
});

describe('modules', () => {
  test('-M → short names; the captured hosts carry every APACHE_MODULES member', () => {
    for (const host of ['debian12', 'rocky9', 'alma9', 'rocky10', 'alma10']) {
      const modules = parseModules(fixture(`captured/${host}/apache_M.txt`));
      for (const name of APACHE_MODULES) expect(modules).toContain(name);
      expect(modules).toContain('core');
      expect(hasPhpModule(modules)).toBe(false);
    }
  });

  test("EL without mod_ssl (typed); mod_php under prefork (captured rocky10_prefork_remi: Remi's php_module)", () => {
    expect(parseModules(fixture('typed/apache/apache_M_el9_no_ssl.txt'))).not.toContain('ssl');
    const prefork = parseModules(fixture('captured/rocky10_prefork_remi/apache_M.txt'));
    expect(prefork).toContain('php');
    expect(prefork).toContain('mpm_prefork');
    expect(hasPhpModule(prefork)).toBe(true);
    expect(hasPhpModule(['php'])).toBe(true);
    expect(hasPhpModule(['phpx'])).toBe(false);
  });

  test('conf.modules.d (captured EL 9): loaded and commented LoadModule lines, with file and line', () => {
    const dir = 'captured/rocky9/conf.modules.d';
    const files = ['00-ssl.conf', '00-proxy.conf', '00-optional.conf'].map(name => ({ file: `/etc/httpd/conf.modules.d/${name}`, text: fixture(`${dir}/${name}`) }));
    const lines = parseModulesD(files);
    expect(lines).toContainEqual({ file: '/etc/httpd/conf.modules.d/00-ssl.conf', line: 1, module: 'ssl_module', commented: false });
    expect(lines.find(entry => entry.module === 'proxy_fcgi_module')?.commented).toBe(false);
    expect(lines.find(entry => entry.module === 'asis_module')).toMatchObject({ commented: true, line: 6 });
    // The prefork capture's Remi 20-php82-php.conf: php_module inside <IfModule prefork.c>.
    const php = parseModulesD([{ file: '20-php82-php.conf', text: fixture('captured/rocky10_prefork_remi/conf.modules.d.prefork/20-php82-php.conf') }]);
    expect(php).toEqual([{ file: '20-php82-php.conf', line: 10, module: 'php_module', commented: false }]);
    // EL 9 and EL 10 AppStream ship no mod_php: no conf.modules.d file loads one.
    for (const host of ['rocky9', 'rocky10']) expect(parseDumpIncludes(fixture(`captured/${host}/apache_includes.txt`)).some(path => /php.*\.conf$/.test(path) && path.includes('conf.modules.d'))).toBe(false);
  });

  test('<IfModule> conditions: mod_X.c, X_module, prefork.c, negation', () => {
    const loaded = ['proxy_fcgi', 'php7', 'mpm_prefork'];
    expect(ifModuleActive('mod_php7.c', loaded)).toBe(true);
    expect(ifModuleActive('!mod_php7.c', loaded)).toBe(false);
    expect(ifModuleActive('!mod_php5.c', loaded)).toBe(true);
    expect(ifModuleActive('proxy_fcgi_module', loaded)).toBe(true);
    expect(ifModuleActive('prefork.c', loaded)).toBe(true);
    expect(ifModuleActive('!mod_php.c', loaded)).toBe(true);
    // Remi's mod_php is `php_module`: AppStream php.conf's `<IfModule !mod_php.c>` turns its handler off.
    expect(ifModuleActive('!mod_php.c', ['php', 'mpm_prefork'])).toBe(false);
  });
});

describe('php.conf (host.php_mode)', () => {
  // MEASURED: no captured EL php.conf wraps the handler in <If> (the spec assumed it did).
  for (const [path, conditions] of [
    ['captured/rocky9/php.conf', ['!mod_php.c']],
    ['captured/rocky9_php82/php.conf', ['!mod_php.c']],
    ['captured/alma9/php.conf', ['!mod_php.c']],
    ['captured/rocky10/php.conf', ['!mod_php.c']],
    ['captured/alma10/php.conf', ['!mod_php.c']],
    ['captured/rocky10_prefork_remi/php.conf', ['!mod_php.c']],
  ] as const) {
    test(`${path}: www.sock in <FilesMatch \\.(php|phar)$>, NOT inside <If>`, () => {
      const handler = parsePhpConf(fixture(path), '/etc/httpd/conf.d/php.conf');
      expect(handler).toEqual({
        file: '/etc/httpd/conf.d/php.conf',
        pattern: '\\.(php|phar)$',
        insideIf: false,
        socket: '/run/php-fpm/www.sock',
        ifModules: [...conditions],
      });
    });
  }

  test('Remi php82-php.conf (captured): the Remi socket, three nested !mod_php conditions', () => {
    const handler = parsePhpConf(fixture('captured/rocky9_php82/remi_php82-php.conf'), '/etc/httpd/conf.d/php82-php.conf');
    expect(handler?.socket).toBe('/var/opt/remi/php82/run/php-fpm/www.sock');
    expect(handler?.ifModules).toEqual(['!mod_php5.c', '!mod_php7.c', '!mod_php.c']);
    expect(parsePhpConf(fixture('captured/rocky10_prefork_remi/remi_php82-php.conf'), '/etc/httpd/conf.d/php82-php.conf')).toEqual(handler);
  });

  test('the <If> form the spec assumed (typed) sets insideIf', () => {
    expect(parsePhpConf(fixture('typed/apache/php_conf_if.conf'), 'php.conf')?.insideIf).toBe(true);
  });

  test("Debian's php8.2-fpm.conf (captured): the .ph(ar|p|tml) pattern, active only with proxy_fcgi", () => {
    const handler = parsePhpConf(fixture('captured/debian12/apache_php_fpm.conf'), 'php8.2-fpm.conf');
    expect(handler?.pattern).toBe('.+\\.ph(?:ar|p|tml)$');
    expect(handler?.ifModules).toEqual(['!mod_php8.c', 'proxy_fcgi_module']);
    expect(handler?.ifModules.every(condition => ifModuleActive(condition, ['proxy_fcgi']))).toBe(true);
    expect(handler?.ifModules.every(condition => ifModuleActive(condition, []))).toBe(false);
  });

  test("Ubuntu 26.04's php8.5-fpm.conf (captured): the pattern drops the leading .+ (\\.ph(ar|p|tml)$), same guards", () => {
    const handler = parsePhpConf(fixture('captured/ubuntu2604/apache_php_fpm.conf'), 'php8.5-fpm.conf');
    expect(handler?.pattern).toBe('\\.ph(?:ar|p|tml)$');
    expect(handler?.ifModules).toEqual(['!mod_php8.c', 'proxy_fcgi_module']);
    expect(handler?.ifModules.every(condition => ifModuleActive(condition, ['proxy_fcgi']))).toBe(true);
  });

  test('a mod_php handler only, or a handler outside <FilesMatch>, is no FPM handler', () => {
    expect(parsePhpConf('<FilesMatch \\.php$>\n  SetHandler application/x-httpd-php\n</FilesMatch>\n', 'x')).toBeNull();
    expect(parsePhpConf('SetHandler "proxy:unix:/run/a.sock|fcgi://localhost"\n', 'x')).toBeNull();
  });

  test('fpmSocketOfHandler', () => {
    expect(fpmSocketOfHandler('proxy:unix:/run/php/php8.2-fpm.sock|fcgi://localhost')).toBe('/run/php/php8.2-fpm.sock');
    expect(fpmSocketOfHandler('unix:/run/a.sock|fcgi://localhost/srv')).toBe('/run/a.sock');
    expect(fpmSocketOfHandler('proxy:fcgi://127.0.0.1:9000')).toBeNull();
  });
});

describe('one vhost block', () => {
  test('captured certbot -le-ssl (Debian 12): line 2, SSL from its certificate, logs, the site FPM handler', () => {
    const block = readVhostBlock(fixture('typed/apache/sites/debian_museum.org-le-ssl.conf'), 2, { referencePath: REFERENCE });
    expect(block).toMatchObject({
      line: 2,
      endLine: 13,
      serverName: 'museum.org',
      aliases: ['www.museum.org'],
      ssl: true,
      documentRoot: '/home/museum.org/httpdocs',
      errorLog: '/home/museum.org/logs/error.log',
      accessLogs: ['/home/museum.org/logs/access.log'],
      fpmHandler: '/run/php/php8.2-fpm-museum.org.sock',
      ourReference: false,
      manualLines: [],
    });
  });

  test('our stamped reference (CRLF file) is seen; TransferLog counts as an access log', () => {
    const block = readVhostBlock(site('our_reference.conf'), 1, { referencePath: REFERENCE });
    expect(block.ourReference).toBe(true);
    expect(block.accessLogs).toEqual(['/home/museum.org/logs/access.log', '/home/museum.org/logs/transfer.log']);
    expect(block.ssl).toBe(true);
    expect(readVhostBlock(site('our_reference.conf'), 1, { referencePath: '/etc/other/web.apache.conf' }).ourReference).toBe(false);
  });

  test("the install guide's step-9 hand lines are found whole (media include, v1 Alias + <Directory>, v2 <Location>, their comments)", () => {
    const block = readVhostBlock(site('guide_manual.conf'), 1, { referencePath: REFERENCE });
    const lines = block.manualLines.map(entry => entry.line);
    expect(lines).toEqual([9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26]);
    expect(block.manualLines[0]?.text).toContain("# The agent's media rules");
    expect(block.manualLines.at(-1)?.text.trim()).toBe('</Location>');
    // The site's OWN handler (ProxyPassMatch), never the one inside the guide's v1 <Directory>.
    expect(block.fpmHandler).toBe('/run/php/php8.3-fpm-museum.org.sock');
    expect(block.serverName).toBe('www.museum.org');
  });

  test('a handler only inside the guide block is not the site handler', () => {
    const text = '<VirtualHost *:443>\n  ServerName a.org\n  <Directory /x/dedalo/publication_api/v1>\n    <FilesMatch "\\.php$">\n      SetHandler "proxy:unix:/run/a.sock|fcgi://localhost"\n    </FilesMatch>\n  </Directory>\n</VirtualHost>\n';
    const block = readVhostBlock(text, 1, { referencePath: REFERENCE });
    expect(block.fpmHandler).toBeNull();
    expect(block.manualLines.map(entry => entry.line)).toEqual([3, 4, 5, 6, 7]);
  });

  test('ServerName with :port and upper case is normalised; a continued ServerAlias is read whole', () => {
    expect(readVhostBlock(site('duplicate_b.conf'), 2, { referencePath: REFERENCE }).serverName).toBe('museum.org');
    expect(readVhostBlock(site('wildcard.conf'), 1, { referencePath: REFERENCE }).aliases).toEqual(['*.museum.org', 'museum.*']);
  });

  test('a line that is not a <VirtualHost>, or one never closed, throws', () => {
    expect(() => readVhostBlock(site('alias_only.conf'), 2, { referencePath: REFERENCE })).toThrow('is not a <VirtualHost>');
    expect(() => readVhostBlock('<VirtualHost *:80>\n  ServerName a\n', 1, { referencePath: REFERENCE })).toThrow('has no </VirtualHost>');
  });
});

describe('matching (security: an exact ServerName is the only candidate)', () => {
  const block = (name: string, line = 1) => readVhostBlock(site(name), line, { referencePath: REFERENCE });

  test('exact ServerName; alias-only; wildcard; none', () => {
    expect(matchVhost(block('duplicate_a.conf').serverName, block('duplicate_a.conf').aliases, 'museum.org')).toBe('servername');
    expect(matchVhost(block('alias_only.conf').serverName, block('alias_only.conf').aliases, 'museum.org')).toBe('alias');
    expect(matchVhost(block('wildcard.conf').serverName, block('wildcard.conf').aliases, 'shop.museum.org')).toBe('wildcard');
    expect(matchVhost(block('wildcard.conf').serverName, block('wildcard.conf').aliases, 'museum.net')).toBe('wildcard');
    // `museum.*` claims museum.org too: a wildcard claimant, never a candidate.
    expect(matchVhost(block('wildcard.conf').serverName, block('wildcard.conf').aliases, 'museum.org')).toBe('wildcard');
    expect(matchVhost(block('wildcard.conf').serverName, block('wildcard.conf').aliases, 'gallery.org')).toBeNull();
    expect(matchVhost(null, [], 'museum.org')).toBeNull();
    expect(matchVhost('MUSEUM.ORG', [], 'museum.org')).toBe('servername');
  });

  test('duplicate ServerName: both blocks are claimants (compare makes it blocking)', () => {
    const blocks = [block('duplicate_a.conf'), block('duplicate_b.conf', 2), block('alias_only.conf'), block('wildcard.conf')];
    const found = matchVhosts(blocks, 'museum.org');
    expect(found.map(entry => entry.matchedBy)).toEqual(['servername', 'servername', 'alias', 'wildcard']);
    expect(matchVhosts(blocks, 'gallery.org')).toEqual([]);
  });
});

describe('DUMP_INCLUDES and versions', () => {
  test('captured Debian 12 and EL 9: the load order starts at the main file', () => {
    const debian = parseDumpIncludes(fixture('captured/debian12/apache_includes.txt'));
    expect(debian[0]).toBe('/etc/apache2/apache2.conf');
    expect(debian).toContain('/etc/apache2/sites-enabled/museum.org-le-ssl.conf');
    const el = parseDumpIncludes(fixture('captured/rocky9/apache_includes.txt'));
    expect(el[0]).toBe('/etc/httpd/conf/httpd.conf');
    expect(el).toContain('/etc/httpd/conf.d/php.conf');
    expect(parseDumpIncludes(fixture('captured/rocky10_prefork_remi/apache_includes.txt'))).toContain('/etc/httpd/conf.modules.d/20-php82-php.conf');
  });

  test('-v: captured Apache versions; nginx through parseWebVersion', () => {
    expect(parseApacheVersion(fixture('captured/rocky9/apache_v.txt'))).toBe('2.4.62');
    expect(parseApacheVersion(fixture('captured/rocky10/apache_v.txt'))).toBe('2.4.63');
    expect(parseApacheVersion(fixture('captured/debian12/apache_v.txt'))).toBe('2.4.68');
    expect(parseWebVersion('apache', fixture('captured/ubuntu2204/apache_v.txt'))).toBe('2.4.52');
    expect(parseApacheVersion(fixture('captured/ubuntu2604/apache_v.txt'))).toBe('2.4.66');
    expect(parseWebVersion('nginx', fixture('captured/ubuntu2604/nginx_v.txt'))).toBe('1.28.3');
    expect(parseWebVersion('nginx', fixture('captured/rocky9/nginx_v.txt'))).toBe('1.20.1');
    expect(parseWebVersion('nginx', fixture('captured/rocky10/nginx_v.txt'))).toBe('1.26.3');
    expect(parseApacheVersion('nothing')).toBeNull();
  });
});
