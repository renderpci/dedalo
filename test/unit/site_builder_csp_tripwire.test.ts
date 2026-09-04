/**
 * TRIPWIRE — every generated site is served under a Content Security Policy that lets no
 * script run from a record value (P2-6 / CARRY-01's site-builder residual, systemic S-4).
 *
 * The audit's open question: neither shipped web-server config for a GENERATED site emitted
 * a CSP, so an agent-authored page that put a component value into `innerHTML` would be
 * live stored XSS to anonymous visitors, and nothing in the repository would notice. The
 * engine's own client is escaped at the render boundary (render_escape_tripwire) and runs
 * under APP_CSP; a generated site is a static tree an agent wrote — the header is the one
 * control that does not depend on the agent having been careful.
 *
 * The policy itself is stated ONCE, in publication/site_builder/src/provision/render/csp.ts,
 * and both web-server renderers write it. This gate renders BOTH from the committed
 * reference declaration and asserts the outcome on every artifact that serves a document
 * root — preprod and prod, every TLS mode the declaration can name. It lives at the repo
 * level (the package suite runs only when its files change; scripts/verify.ts) so that a
 * renderer edit anywhere fails the pipeline's hermetic tier.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { derive } from '../../publication/site_builder/src/provision/layout.ts';
import { apacheRenderer } from '../../publication/site_builder/src/provision/render/apache.ts';
import { contentSecurityPolicy } from '../../publication/site_builder/src/provision/render/csp.ts';
import { nginxRenderer } from '../../publication/site_builder/src/provision/render/nginx.ts';
import { parseManifest } from '../../publication/site_builder/src/provision/schema.ts';
import { renderedHostConfs } from '../helpers/deploy_conf_corpus.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const PACKAGE = join(REPO_ROOT, 'publication/site_builder');
const DECLARATION = join(PACKAGE, 'deploy/examples/instance.example.json');

/** The committed reference declaration, with a patch applied to `serving`/`web`. */
function layoutFrom(patch: Record<string, unknown> = {}) {
	const doc = JSON.parse(readFileSync(DECLARATION, 'utf8')) as Record<string, unknown>;
	return derive(parseManifest({ ...doc, ...patch }, { source: 'site_builder_csp_tripwire' }));
}

/** One policy string per `Content-Security-Policy` header line in a rendered body. */
function policies(body: string): string[] {
	return [...body.matchAll(/Content-Security-Policy "([^"]+)"/g)].map((m) => m[1] as string);
}

/** Directive → value, for one policy string. */
function directives(policy: string): Map<string, string> {
	return new Map(
		policy.split('; ').map((d) => {
			const [name, ...value] = d.split(' ');
			return [name as string, value.join(' ')];
		}),
	);
}

/** Every served-tree count in a body: nginx `root`, apache `DocumentRoot`. */
function servedRoots(body: string): number {
	return (body.match(/^\s*(root |DocumentRoot )/gm) ?? []).length;
}

const TLS_MODES: ReadonlyArray<Record<string, unknown>> = [
	{ mode: 'none' },
	{ mode: 'letsencrypt', account_email: 'ops@example.org' },
	{ mode: 'files', certificate: '/etc/ssl/example/site.pem', key: '/etc/ssl/example/site.key' },
];

describe('generated sites are served under a CSP that lets no record value run', () => {
	test('the policy: script-src is exactly self, the bypass routes are closed, no inline, no eval', () => {
		const policy = contentSecurityPolicy(layoutFrom());
		const d = directives(policy);
		expect(d.get('script-src')).toBe("'self'");
		expect(d.get('default-src')).toBe("'self'");
		expect(d.get('style-src')).toBe("'self'");
		expect(d.get('object-src')).toBe("'none'");
		expect(d.get('base-uri')).toBe("'self'");
		expect(d.get('frame-ancestors')).toBe("'none'");
		expect(d.get('form-action')).toBe("'self'");
		expect(policy).not.toContain('unsafe-inline');
		expect(policy).not.toContain('unsafe-eval');
		expect(policy).not.toContain('unsafe-hashes');
		// the data classes name the DECLARED API origin (the example's), never its path
		expect(d.get('connect-src')).toContain('http://127.0.0.1:3100');
		expect(policy).not.toContain('/publication/server_api');
	});

	for (const server of ['nginx', 'apache'] as const) {
		const renderer = server === 'nginx' ? nginxRenderer : apacheRenderer;

		test(`${server}: every served surface of every site carries the policy, in every TLS mode`, () => {
			let served = 0;
			for (const tls of TLS_MODES) {
				const base = JSON.parse(readFileSync(DECLARATION, 'utf8')) as {
					serving: Record<string, unknown>;
				};
				const layout = layoutFrom({
					web: { server, group: 'www-data' },
					serving: { ...base.serving, prod: { tls } },
				});
				const artifacts = renderer.render(layout, {} as never);
				expect(artifacts.length, `${server}/${String(tls.mode)}: renders vhosts`).toBeGreaterThan(
					0,
				);
				for (const artifact of artifacts) {
					const roots = servedRoots(artifact.body);
					const found = policies(artifact.body);
					// letsencrypt's nginx port-80 server has a `root` for the ACME challenge
					// location but serves no tree — it redirects; the 443 server carries it.
					const expected =
						server === 'nginx' && tls.mode === 'letsencrypt' && !artifact.path.endsWith('-pre.conf')
							? roots - 1
							: roots;
					expect(found.length, `${artifact.path}: one policy per served server`).toBe(expected);
					for (const policy of found) {
						expect(directives(policy).get('script-src'), artifact.path).toBe("'self'");
						expect(policy, artifact.path).not.toContain('unsafe-inline');
					}
					// `always`: on the 401 challenge and the 404 too, not only a 200
					for (const line of artifact.body
						.split('\n')
						.filter((l) => l.includes('Content-Security-Policy'))) {
						expect(line, artifact.path).toMatch(/always/);
					}
					served += found.length;
				}
			}
			expect(served).toBeGreaterThan(8); // 2 sites × 2 surfaces × 3 modes, minus nothing
		});
	}

	test('the committed rendered examples carry it (a stale example is a stale host)', () => {
		const confs = renderedHostConfs();
		// the floor is bound to the walk: an emptied examples directory would
		// otherwise satisfy every per-conf assertion below vacuously
		expect(confs.length).toBeGreaterThan(4);
		expect(confs.length).toBe(8);
		for (const conf of confs) {
			const body = readFileSync(conf, 'utf8');
			expect(policies(body).length, conf).toBeGreaterThan(0);
			for (const policy of policies(body))
				expect(directives(policy).get('script-src'), conf).toBe("'self'");
		}
	});

	test('a layout without the declared API origin is REFUSED, not rendered without it', () => {
		const layout = layoutFrom();
		const broken = { ...layout, envVars: { ...layout.envVars, PUBLICATION_API_URL: '' } };
		expect(() => contentSecurityPolicy(broken as never)).toThrow(/PUBLICATION_API_URL/);
	});
});
