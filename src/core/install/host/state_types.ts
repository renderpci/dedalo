/**
 * WHAT A HOST RUN RECORDS (terminal installer phase 4, 2026-10-12) — the two
 * shapes the host state file adds to the ONE state schema (run_files_core.ts
 * InstallPreflight.host / InstallCreated.host, both optional so the engine
 * child's state stays the engine's).
 *
 *  - HostPreflight: the FACTS the first host_preflight measured (the OS row,
 *    the web server and its version, what already exists), FROZEN for the
 *    whole install — every later step's commands are computed from these, so
 *    the commands a resume runs are the ones the run showed (critique A2) —
 *    plus the digest of every step's command list at that moment.
 *  - HostCreated: what THIS install created. `--abort` trusts only this: a
 *    user, database, site file, unit or certificate that existed before the
 *    install is never touched. Packages and repositories are RECORDED and TOLD,
 *    never removed (shared host state — removing a repository while keeping its
 *    packages would leave them without security updates: critique B4).
 *
 * Types only.
 */

import type { HostFacts } from './facts.ts';

export interface HostPreflight {
	facts: HostFacts;
	/** sha256 of each step's command list (the Review's) when the facts were frozen. */
	commands_digest: Record<string, string>;
}

/** The image a docker/trial install runs, as stack_image pulled (or built) and verified it. */
export interface StackImage {
	repository: string;
	version: string;
	/** The registry digest cosign verified (official images); null for a custom or local image. */
	digest: string | null;
	verify: 'cosign' | 'none';
}

/** What the docker/trial host steps created (host/stack/ fills it). */
export interface StackCreated {
	/** .dedalo.env, compose.override.yaml, the generated nginx site (host paths). */
	env_file: boolean;
	override: boolean;
	generated_conf: boolean;
	/** Certificate files (and deploy/certs itself, when created) — host paths. */
	certs: string[];
	/** Docker volumes this install created (none of them existed before it). */
	volumes: string[];
	containers_started: boolean;
	image: StackImage | null;
}

export interface HostCreated {
	/** Package repositories this install added (told on --abort, never removed). */
	repos: string[];
	/** Packages this install added (told on --abort, never removed). */
	packages: string[];
	/** The service user THIS install created (null: none — an existing account is never recorded). */
	user: string | null;
	/** The service group THIS install created (null: none — an existing group is never recorded). */
	group: string | null;
	/**
	 * The install folder, when this install created or adopted it: `root` (made
	 * by root under a root-owned parent), `user` (made by the service user under
	 * its own ancestor), `adopted` (an empty foreign folder handed to the user —
	 * its owner and mode before, restored by --abort). null: used as it is.
	 */
	install_dir: {
		path: string;
		how: 'root' | 'user' | 'adopted';
		owner: string;
		group: string;
		mode: number;
	} | null;
	/** Directories this install created as ROOT (host paths, created ancestors included), parents first. */
	dirs: string[];
	/** Directories this install created AS THE SERVICE USER (inside the install folder, or its own ancestors). */
	user_dirs: string[];
	/** /opt/dedalo/bun/<pin> was created by this install (shared — refcounted). */
	bun_dir: boolean;
	/** The release tree <install_dir>/dedalo was created by this install. */
	release_dir: boolean;
	pg_role: boolean;
	pg_database: boolean;
	/** Files written under /opt/dedalo/instances/<i>/bin. */
	scripts: string[];
	/** Shared template unit files this install wrote (refcounted across instances). */
	units: string[];
	/** Per-instance drop-in files this install wrote. */
	dropins: string[];
	/** Units this install enabled. */
	enabled: string[];
	/** The web server's user was added to the instance group by this install. */
	web_group_member: boolean;
	/** Web server files this install wrote (the site file, the challenge root). */
	site_files: string[];
	/** The Let's Encrypt certificate name this install issued, or null. */
	cert_name: string | null;
	selinux_fcontexts: string[];
	/** The host-wide SELinux module was installed by this install (refcounted). */
	selinux_module: boolean;
	watchdog_armed: boolean;
	backup_timer: boolean;
	/** The engine child's private dir (its own state lives in <dir>/install). */
	engine_run_dir: string | null;
	/** docker/trial only. */
	stack?: StackCreated;
}

/** A host run's empty `created` (nothing yet). */
export function emptyHostCreated(): HostCreated {
	return {
		repos: [],
		packages: [],
		user: null,
		group: null,
		install_dir: null,
		dirs: [],
		user_dirs: [],
		bun_dir: false,
		release_dir: false,
		pg_role: false,
		pg_database: false,
		scripts: [],
		units: [],
		dropins: [],
		enabled: [],
		web_group_member: false,
		site_files: [],
		cert_name: null,
		selinux_fcontexts: [],
		selinux_module: false,
		watchdog_armed: false,
		backup_timer: false,
		engine_run_dir: null,
	};
}
