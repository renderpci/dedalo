/**
 * THE APACHE MODULE CENSUS (publication-host provision init, spec §2.4): `APACHE_MODULES`
 * (publication/host_agent/src/provision/exec_contract.ts) — the closed set init enables with
 * a2enmod on Debian and checks with `httpd -M` on EL — is EQUAL to what the two Apache texts on a
 * publication host require:
 *   - the engine's media rules (src/core/media/publication_host_rules.ts): every module an
 *     `<IfModule [!]mod_X.c>` names (they fail closed without it), plus `RewriteEngine` outside
 *     any wrapper (rewrite);
 *   - the provisioner's web include (render/web_include.ts): `ProxyPass` to `http://` → proxy,
 *     proxy_http; the `proxy:unix:…|fcgi://` handler → proxy, proxy_fcgi; and the TLS vhost it is
 *     referenced from (init inserts the reference into the site's `:443` vhost) → ssl.
 * The include's `<IfModule php_module>` guards are the opposite (mod_php switched OFF) and are not
 * requirements. A module either text grows is red here until APACHE_MODULES names it; a module
 * APACHE_MODULES names that neither needs is red too.
 */

import { describe, expect, test } from 'bun:test';
import { APACHE_MODULES } from '../../publication/host_agent/src/provision/exec_contract.ts';
import { derive } from '../../publication/host_agent/src/provision/layout.ts';
import { apacheWebInclude } from '../../publication/host_agent/src/provision/render/web_include.ts';
import { buildPublicationHostApacheConf } from '../../src/core/media/publication_host_rules.ts';

const RULES = buildPublicationHostApacheConf({
	root: '/mnt/dedalo_media',
	qualities: ['image/thumb', 'av/404'],
});

const SITE = derive({
	instance: 'census',
	listen: { kind: 'unix' },
	agent_user: 'census_agent',
	engine_group: 'dedalo',
	agent_dir: '/opt/dedalo_publication_host/host_agent',
	web: { server: 'apache', unit: 'apache2' },
	site: { domain: 'museum.example.org', fpm: { flavor: 'debian', version: '8.4' } },
	v1: { user: 'census_v1' },
	state_root: '/srv/dedalo_publication_host/census',
	media: { mode: 'shared', root: '/mnt/dedalo_media' },
	php_bin: '/usr/bin/php8.4',
	bun_bin: '/opt/dedalo_publication_host/bun/bin/bun',
	v2: {
		unit: 'dedalo-publication-api-v2-census',
		user: 'census_v2',
		group: 'census_v2',
		port: 3100,
		health_url: 'http://127.0.0.1:3100/health',
	},
});
const INCLUDE = apacheWebInclude(SITE);

/** `<IfModule mod_X.c>` / `<IfModule !mod_X.c>` → X. */
function ifModules(text: string): string[] {
	return [...text.matchAll(/<IfModule\s+!?mod_([a-z0-9_]+)\.c>/g)].map((m) => m[1] as string);
}

/** What the web include's directives need. */
function includeNeeds(text: string): string[] {
	const needs: string[] = [];
	const lines = text.split('\n').map((line) => line.trim());
	if (lines.some((line) => /^ProxyPass(Reverse)?\s+http:\/\//.test(line)))
		needs.push('proxy', 'proxy_http');
	if (lines.some((line) => /^SetHandler\s+"proxy:unix:[^|]+\|fcgi:\/\//.test(line)))
		needs.push('proxy', 'proxy_fcgi');
	return needs;
}

describe('APACHE_MODULES is exactly what the publication host Apache texts need', () => {
	test('the engine media rules: the IfModule-named modules and the unwrapped RewriteEngine', () => {
		const named = new Set(ifModules(RULES));
		expect([...named].sort()).toEqual(['headers', 'rewrite']);
		expect(RULES.split('\n').some((line) => line.trim().startsWith('RewriteEngine On'))).toBe(true);
	});

	test('the web include: proxy, proxy_http, proxy_fcgi; its php IfModule guards are not requirements', () => {
		expect([...new Set(includeNeeds(INCLUDE))].sort()).toEqual([
			'proxy',
			'proxy_fcgi',
			'proxy_http',
		]);
		expect(ifModules(INCLUDE)).toEqual([]);
		expect(INCLUDE).toContain('<IfModule php_module>');
	});

	test('the union, plus ssl for the TLS vhost the include is referenced from, EQUALS APACHE_MODULES', () => {
		const required = new Set([...ifModules(RULES), 'rewrite', ...includeNeeds(INCLUDE), 'ssl']);
		expect([...required].sort()).toEqual([...APACHE_MODULES].sort());
	});
});
