/**
 * THE RENDERED HOST CONFIGURATIONS — the lister that owns the site-builder's
 * committed deployment examples.
 *
 * `site_builder_csp_tripwire` reads the rendered nginx and apache examples to
 * prove every served host carries its Content-Security-Policy. It named those
 * two directories itself, which `census_derivation_tripwire` refuses: a gate
 * may not choose its own walk root. The roots live here, once.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const PACKAGE = join(REPO_ROOT, 'publication/site_builder');

/** The directories the provisioner renders a host configuration into. */
const RENDERED_CONF_DIRS = [
	'deploy/examples/rendered/etc/nginx/sites-available',
	'deploy/examples/rendered-apache/etc/apache2/sites-available',
];

/** Every committed rendered host configuration, absolute, in directory order. */
export function renderedHostConfs(): string[] {
	const confs: string[] = [];
	for (const dir of RENDERED_CONF_DIRS) {
		for (const name of readdirSync(join(PACKAGE, dir))) confs.push(join(PACKAGE, dir, name));
	}
	return confs;
}
