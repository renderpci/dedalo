/**
 * ONE PRODUCTION INSTANCE'S PLACES (terminal installer phase 4, 2026-10-12) —
 * every path and name a production install creates, derived from the instance
 * name and the answers in ONE function (multi_instance.md's layout, with the
 * owner's phase-4 decisions and the 2026-10-12 install folder / service
 * account decisions — engineering/PRODUCTION.md §2.2):
 *
 *   <install_dir>/                    THE INSTANCE DIR (any path; default
 *                                     /home/ded_<i>), owned by the SERVICE USER
 *                                     (<service_user>, default ded_<i>); its
 *                                     parent may be root-owned and is never changed
 *   <install_dir>/dedalo/             the release tree (WorkingDirectory)
 *   <install_dir>/private/            ../private (.env 0600, sessions, state) — 0700
 *   <install_dir>/backups/            the code updater's backup root (backups/code —
 *                                     `<tree>/../backups`) and the backup units'
 *                                     default target — 0750
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
	/** The service user (an answer — created, or an existing account used as it is). */
	readonly user: string;
	/** The service group (resolved: the answer, else the user's primary group, else its own). */
	readonly group: string;
	/** The instance dir (the install folder) — also the service's HOME. */
	readonly instanceDir: string;
	readonly tree: string;
	readonly privateDir: string;
	/** `<instanceDir>/backups` — always created (the code updater's backup root lives in it). */
	readonly instanceBackups: string;
	/** `<instanceDir>/backups/code` — the code updater's `<tree>/../backups/code`. */
	readonly codeBackupRoot: string;
	/** The backup units' target (an answer; default `<instanceDir>/backups`). */
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
	/** The release archive's root-owned hand-over dir (root:<group> 0750, outside the instance dir). */
	readonly releaseDir: string;
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

/** What the service group resolution reads of the host (account_facts.ts AccountFacts). */
export interface GroupSource {
	readonly user: { readonly primaryGroup: string | null } | null;
}

/**
 * THE service group: the answer; else the EXISTING user's primary group; else
 * the user's own name (a new user is created with its same-named group).
 * `account` null = not measured yet (only host_preflight runs before).
 */
export function serviceGroupOf(
	answers: Pick<InstallAnswers, 'service_user' | 'service_group'>,
	account: GroupSource | null | undefined,
): string {
	if (answers.service_group !== '') return answers.service_group;
	return account?.user?.primaryGroup ?? answers.service_user;
}

/** Every place of the instance (see the header); `group` = serviceGroupOf(answers, facts.account). */
export function instancePaths(
	answers: InstallAnswers,
	bunPin: string,
	group: string = serviceGroupOf(answers, null),
): InstancePaths {
	const i = answers.instance;
	const dir = answers.install_dir;
	const { webRoot, mediaDir } = webRootOf(answers.media_path);
	return {
		instance: i,
		user: answers.service_user,
		group,
		instanceDir: dir,
		tree: `${dir}/dedalo`,
		privateDir: `${dir}/private`,
		instanceBackups: `${dir}/backups`,
		codeBackupRoot: `${dir}/backups/code`,
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
		releaseDir: `${INSTALL_STATE_ROOT}/release-${i}`,
	};
}

/** The runtime pin a paths value carries (`/opt/dedalo/bun/<pin>`). */
export function bunPinOfPaths(paths: Pick<InstancePaths, 'bunDir'>): string {
	return paths.bunDir.slice(paths.bunDir.lastIndexOf('/') + 1);
}

/**
 * THE instance paths of a plan for the facts measured: the service group is
 * decided by the account facts (serviceGroupOf) — the ONE derivation the
 * Review, the frozen digest and every resume share (critique B2).
 */
export function pathsFor(
	answers: InstallAnswers,
	bunPin: string,
	facts: { readonly account: GroupSource | null },
): InstancePaths {
	return instancePaths(answers, bunPin, serviceGroupOf(answers, facts.account));
}
