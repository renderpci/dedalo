/**
 * THE SHIPPED DEPLOYMENT STACK — the one lister that owns the `deploy/` proxy
 * configurations and the prose that describes how the client reaches them.
 *
 * The engine ships four reference front-end configurations (three nginx, one
 * apache), plus include-only OVERLAYS that open no server context of their own,
 * and documents them in `docs/install/` + `engineering/`. Transport is
 * a property OF THAT SET, not of one file: "every TLS-terminating conf
 * multiplexes the boot graph, and the one plain-HTTP conf records why it
 * cannot" is only a census if the set is derived. `census_derivation_tripwire`
 * refuses a gate that chooses its own walk root in-file, so the roots live
 * here, once, and the gate imports a shape.
 *
 * Zero-argument on purpose: a parameterized lister hands the root choice back
 * to the caller, which is the thing the rule is about.
 *
 * ONE walk site: git's index over the three roots. Tracked only — the file
 * `install.sh` GENERATES (`deploy/nginx.simple.generated.conf`) is a machine's
 * output on an operator's disk, not a shipped decision, and a census that
 * counted it would pass or fail by whether someone had run the installer.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const REPO_ROOT = join(import.meta.dir, '..', '..');

/** The deployment roots. The ONLY place they are named. */
export const DEPLOY_STACK_ROOTS = ['deploy', 'docs/install', 'engineering'];

/** Every tracked file under the deployment roots, repo-relative, sorted. */
function trackedDeployStackFiles(): string[] {
	return execFileSync('git', ['ls-files', '--cached', '--', ...DEPLOY_STACK_ROOTS], {
		cwd: REPO_ROOT,
		encoding: 'utf8',
	})
		.split('\n')
		.filter(Boolean)
		.sort();
}

/** Every tracked `deploy/*.conf` and `deploy/*.conf.tpl`. Repo-relative, sorted. */
function deployConfFiles(): string[] {
	return trackedDeployStackFiles().filter(
		(f) => /^deploy\/[^/]+\.conf$/.test(f) || /^deploy\/[^/]+\.conf\.tpl$/.test(f),
	);
}

/**
 * A conf OPENS A SERVER CONTEXT when a live directive (comments stripped)
 * starts an nginx `server {` block or an apache `<VirtualHost>`. Only such a
 * conf chooses a transport; anything else is a fragment `Include`d inside
 * one, and inherits the transport of the context that includes it.
 */
export function opensServerContext(source: string): boolean {
	const code = source
		.split('\n')
		.map((line) => line.replace(/#.*$/, ''))
		.join('\n');
	return /^\s*server\s*\{/m.test(code) || /<VirtualHost\b/.test(code);
}

const readConf = (rel: string): string => readFileSync(join(REPO_ROOT, rel), 'utf8');

/**
 * The SHIPPED front-end configurations: every `deploy/*.conf` and the nginx
 * template `install.sh` renders that opens a server context. Repo-relative,
 * sorted.
 */
export function deployProxyConfs(): string[] {
	return deployConfFiles().filter((f) => opensServerContext(readConf(f)));
}

/**
 * The shipped OVERLAYS: every `deploy/*.conf` that opens no server context
 * (e.g. `apache.master_legacy_v6.conf`, included inside the official master's
 * :443 vhost). Derived as the complement, so a conf is always in exactly one
 * of the two sets. Repo-relative, sorted.
 */
export function deployProxyOverlays(): string[] {
	return deployConfFiles().filter((f) => !opensServerContext(readConf(f)));
}

/**
 * Every file under the deployment roots that a transport claim could be
 * written in: the confs themselves plus the operator documentation and the
 * engineering ops definitions. Repo-relative, sorted.
 */
export function deployStackProse(): string[] {
	return trackedDeployStackFiles().filter((f) => /\.(conf|tpl|md)$/.test(f));
}
