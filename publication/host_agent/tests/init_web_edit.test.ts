/**
 * The vhost edits (spec §5.10, §9 init_web_edit): the two reference lines right after the opener,
 * idempotent, CRLF kept, nested <IfModule>, nginx server blocks with nested braces, several vhosts
 * refused unless named, and the removal of the guide's hand-written lines.
 */
import { describe, expect, test } from 'bun:test';
import { REFERENCE_MARKER, insertApacheReference, insertNginxReference, removeManualLines } from '../src/provision/init/web_edit';

const INCLUDE_A = '/etc/dedalo_publication_host/museum/web.apache.conf';
const INCLUDE_N = '/etc/dedalo_publication_host/museum/web.nginx.conf';

const APACHE = [
  '<IfModule mod_ssl.c>',
  '<VirtualHost *:443>',
  '    ServerName www.museum.org',
  '    DocumentRoot /home/museum.org/httpdocs',
  '</VirtualHost>',
  '</IfModule>',
  '',
].join('\n');

describe('insertApacheReference', () => {
  test('two lines right after <VirtualHost …>, indented, inside a nested <IfModule>', () => {
    const out = insertApacheReference(APACHE, 'museum', INCLUDE_A);
    expect(out.split('\n')).toEqual([
      '<IfModule mod_ssl.c>',
      '<VirtualHost *:443>',
      `    # ${REFERENCE_MARKER('museum')} — managed by \`provision init\`; delete both lines to detach`,
      `    IncludeOptional ${INCLUDE_A}`,
      '    ServerName www.museum.org',
      '    DocumentRoot /home/museum.org/httpdocs',
      '</VirtualHost>',
      '</IfModule>',
      '',
    ]);
    expect(REFERENCE_MARKER('museum')).toBe('dedalo-provision: museum vhost_reference');
  });

  test('idempotent: a second insertion returns the same bytes', () => {
    const once = insertApacheReference(APACHE, 'museum', INCLUDE_A);
    expect(insertApacheReference(once, 'museum', INCLUDE_A)).toBe(once);
    // another instance's reference is its own
    expect(insertApacheReference(once, 'other', '/etc/dedalo_publication_host/other/web.apache.conf')).not.toBe(once);
  });

  test('CRLF stays CRLF', () => {
    const crlf = APACHE.replace(/\n/g, '\r\n');
    const out = insertApacheReference(crlf, 'museum', INCLUDE_A);
    expect(out.includes('\n') && out.split('\r\n').length === out.split('\n').length).toBe(true);
    expect(out).toContain(`\r\n    IncludeOptional ${INCLUDE_A}\r\n`);
  });

  test('several vhosts: refused unless the opener line is named; a wrong line is refused', () => {
    const two = `<VirtualHost *:80>\n    Redirect / https://www.museum.org/\n</VirtualHost>\n${APACHE}`;
    expect(() => insertApacheReference(two, 'museum', INCLUDE_A)).toThrow(/2 <VirtualHost> openers/);
    const out = insertApacheReference(two, 'museum', INCLUDE_A, 5);
    expect(out.split('\n')[4]).toBe('<VirtualHost *:443>');
    expect(out.split('\n')[6]).toBe(`    IncludeOptional ${INCLUDE_A}`);
    expect(out.split('\n')[1]).toBe('    Redirect / https://www.museum.org/');
    expect(() => insertApacheReference(two, 'museum', INCLUDE_A, 2)).toThrow(/line 2 is not a <VirtualHost> opener/);
  });

  test('a bad include path, instance or an unclosed vhost is refused', () => {
    expect(() => insertApacheReference(APACHE, 'museum', 'relative/x.conf')).toThrow(/clean absolute/);
    expect(() => insertApacheReference(APACHE, 'museum', '/etc/x\nInclude /etc/shadow')).toThrow(/clean absolute/);
    expect(() => insertApacheReference(APACHE, 'Museum', INCLUDE_A)).toThrow(/instance/);
    expect(() => insertApacheReference('<VirtualHost *:443>\n', 'museum', INCLUDE_A)).toThrow(/never closed/);
  });
});

describe('insertNginxReference', () => {
  const NGINX = [
    'server {',
    '    listen 443 ssl;',
    '    server_name www.museum.org;',
    '    location / { try_files $uri $uri/ =404; }',
    '}',
    '',
  ].join('\n');

  test('a zero-match glob include at the top of server { … }', () => {
    const out = insertNginxReference(NGINX, 'museum', INCLUDE_N);
    expect(out.split('\n').slice(0, 3)).toEqual([
      'server {',
      `    # ${REFERENCE_MARKER('museum')} — managed by \`provision init\`; delete both lines to detach`,
      '    include /etc/dedalo_publication_host/museum/web.nginx.con[f];',
    ]);
    expect(insertNginxReference(out, 'museum', INCLUDE_N)).toBe(out);
  });

  test('a redirect block and the TLS block: refused unless named; braces in strings and comments ignored', () => {
    const two = `server {\n    listen 80;\n    return 301 "https://x{y}";  # {\n}\n${NGINX}`;
    expect(() => insertNginxReference(two, 'museum', INCLUDE_N)).toThrow(/2 server \{ openers/);
    const out = insertNginxReference(two, 'museum', INCLUDE_N, 5);
    expect(out.split('\n')[6]).toBe('    include /etc/dedalo_publication_host/museum/web.nginx.con[f];');
  });
});

describe('removeManualLines', () => {
  test('removes exactly the listed lines, keeps every other byte and CRLF', () => {
    const text = 'a\r\nb\r\nc\r\nd\r\n';
    expect(removeManualLines(text, [2, 3])).toBe('a\r\nd\r\n');
    expect(removeManualLines('a\nb\n', [1])).toBe('b\n');
  });

  test('out of range, listed twice or nothing to remove: refused', () => {
    expect(() => removeManualLines('a\n', [3])).toThrow(/not a line/);
    expect(() => removeManualLines('a\nb\n', [1, 1])).toThrow(/twice/);
    expect(() => removeManualLines('a\n', [])).toThrow(/no line/);
    expect(() => removeManualLines('a\n', [0])).toThrow(/not a line/);
  });
});
