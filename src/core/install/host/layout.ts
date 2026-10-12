/**
 * ONE PRODUCTION INSTANCE'S PLACES (terminal installer phase 4, 2026-10-12) —
 * every path and name a production install creates, derived from the instance
 * name and the answers in ONE function (multi_instance.md's layout, with the
 * owner's phase-4 decisions):
 *
 *   /home/ded_<i>/                    the instance user's home (0750)
 *   /home/ded_<i>/dedalo/             the release tree (WorkingDirectory)
 *   /home/ded_<i>/private/            ../private (.env 0600, sessions, state) — 0700
 *   /home/ded_<i>/backups/            the backup units' target (default) — 0750
 *   /srv/dedalo/<i>/                  the web root (0750; THE ROOT RULE)
 *   /srv/dedalo/<i>/dedalo/media/     MEDIA_PATH (0750 — L56)
 *   /srv/dedalo/<i>/client/           DEDALO_CLIENT_PUBLISH_DIR: the engine publishes
 *                                     the client of the code it runs here at boot, so
 *                                     the web server never reads the code tree (critique
 *                                     B13 — an updated tree keeps no SELinux label)
 *   /run/dedalo-<i>/dedalo_ts.sock    the socket (systemd RuntimeDirectory)
 *   /opt/dedalo/bun/<pin>/bun         the runtime, ROOT-OWNED (Q4/F2: a root-run unit
 *                                     never executes a file the instance user can replace)
 *   /opt/dedalo/instances/<i>/bin/    the root-run scripts (backup, watchdog, rollback, alert)
 *   /var/lib/dedalo-install/<i>/      the host run's plan + state (0700)
 *   /var/lib/dedalo-install/acme/<i>/ the HTTP-01 challenge root (Let's Encrypt)
 *   /var/lib/dedalo-install/instances/<i>.json   the host registry (refcounts)
 *
 * PURE.
 */

import { dirname } from 'node:path';
import type { InstallAnswers } from '../install_plan.ts';

export interface InstancePaths {
	readonly instance: string;
	readonly user: string;
	readonly group: string;
	readonly home: string;
	readonly tree: string;
	readonly privateDir: string;
	readonly backupDir: string;
	readonly srv: string;
	readonly media: string;
	readonly webRoot: string;
	readonly mediaDir: string;
	readonly clientPublish: string;
	readonly socket: string;
	readonly socketDir: string;
	readonly bunDir: string;
	readonly bun: string;
	readonly binDir: string;
	readonly stateDir: string;
	readonly acmeDir: string;
	readonly registryDir: string;
	readonly registry: string;
	readonly backupStateDir: string;
	readonly selinuxDir: string;
}

/** The host-wide install state root. */
export const INSTALL_STATE_ROOT = '/var/lib/dedalo-install';

/**
 * The site's `root` and the media dir name (THE ROOT RULE: `root` +
 * `/dedalo/<dir>` == MEDIA_PATH; the plan refuses any other MEDIA_PATH on
 * production — install_validation.ts mediaRootErrors).
 */
export function webRootOf(media: string): { webRoot: string; mediaDir: string } {
	const mediaDir = media.slice(media.lastIndexOf('/') + 1);
	return { webRoot: dirname(dirname(media)), mediaDir };
}

/** Every place of the instance (see the header). */
export function instancePaths(answers: InstallAnswers, bunPin: string): InstancePaths {
	const i = answers.instance;
	const home = `/home/ded_${i}`;
	const { webRoot, mediaDir } = webRootOf(answers.media_path);
	return {
		instance: i,
		user: `ded_${i}`,
		group: `ded_${i}`,
		home,
		tree: `${home}/dedalo`,
		privateDir: `${home}/private`,
		backupDir: answers.backup_dir,
		srv: `/srv/dedalo/${i}`,
		media: answers.media_path,
		webRoot,
		mediaDir,
		clientPublish: `/srv/dedalo/${i}/client`,
		socket: answers.unix_socket,
		socketDir: dirname(answers.unix_socket),
		bunDir: `/opt/dedalo/bun/${bunPin}`,
		bun: `/opt/dedalo/bun/${bunPin}/bun`,
		binDir: `/opt/dedalo/instances/${i}/bin`,
		stateDir: `${INSTALL_STATE_ROOT}/${i}`,
		acmeDir: `${INSTALL_STATE_ROOT}/acme/${i}`,
		registryDir: `${INSTALL_STATE_ROOT}/instances`,
		registry: `${INSTALL_STATE_ROOT}/instances/${i}.json`,
		backupStateDir: `${answers.backup_dir}/state`,
		selinuxDir: `${INSTALL_STATE_ROOT}/selinux`,
	};
}
