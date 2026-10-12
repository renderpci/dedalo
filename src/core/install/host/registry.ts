/**
 * THE HOST REGISTRY OF INSTANCES (terminal installer phase 4, 2026-10-12) —
 * `/var/lib/dedalo-install/instances/<i>.json`, one file per production
 * instance this installer set up on the host. It is what makes the SHARED
 * resources refcounted: the template units, the root-owned Bun of a pin, the
 * SELinux module and the nginx media-map include are removed by an --abort
 * only when NO other instance's file still names them.
 *
 * root:root 0644 (no secret; the instance names are not one).
 */

import type { HostFs } from './fs.ts';
import type { InstancePaths } from './layout.ts';

export interface InstanceEntry {
	instance: string;
	bun_pin: string | null;
	templates: boolean;
	selinux_module: boolean;
	/** This instance's map is the one the host-wide nginx include points at. */
	nginx_map_owner: boolean;
	/** This instance's MEDIA_PATH (where its generated map lives). */
	media: string;
}

function emptyEntry(paths: InstancePaths): InstanceEntry {
	return {
		instance: paths.instance,
		bun_pin: null,
		templates: false,
		selinux_module: false,
		nginx_map_owner: false,
		media: paths.media,
	};
}

/** Read one entry (null: absent or unreadable). */
function readEntry(fs: HostFs, path: string): InstanceEntry | null {
	try {
		return JSON.parse(fs.readText(path) ?? 'null') as InstanceEntry | null;
	} catch {
		return null;
	}
}

/** Merge `change` into this instance's entry. */
export function updateEntry(
	fs: HostFs,
	paths: InstancePaths,
	change: Partial<InstanceEntry>,
): void {
	const entry = { ...(readEntry(fs, paths.registry) ?? emptyEntry(paths)), ...change };
	fs.write(paths.registry, `${JSON.stringify(entry, null, '\t')}\n`, 0o644, 'root', 'root');
}

/** This instance's own entry, or null. */
export function ownEntry(fs: HostFs, paths: InstancePaths): InstanceEntry | null {
	return readEntry(fs, paths.registry);
}

/** Mark ANOTHER instance's entry the nginx map owner (the map handover of an --abort). */
export function setMapOwner(fs: HostFs, registryDir: string, instance: string): void {
	const path = `${registryDir}/${instance}.json`;
	const entry = readEntry(fs, path);
	if (entry === null) return;
	fs.write(
		path,
		`${JSON.stringify({ ...entry, nginx_map_owner: true }, null, '\t')}\n`,
		0o644,
		'root',
		'root',
	);
}

/** Remove this instance's entry. */
export function dropEntry(fs: HostFs, paths: InstancePaths): void {
	fs.remove(paths.registry);
}

/** The OTHER instances' entries. */
export function otherEntries(fs: HostFs, paths: InstancePaths): InstanceEntry[] {
	return fs
		.list(paths.registryDir)
		.filter((name) => name.endsWith('.json') && name !== `${paths.instance}.json`)
		.map((name) => readEntry(fs, `${paths.registryDir}/${name}`))
		.filter((entry): entry is InstanceEntry => entry !== null);
}
