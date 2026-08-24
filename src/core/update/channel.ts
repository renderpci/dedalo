/**
 * DEPLOYMENT CHANNEL detection for the code updater (2026-08-23).
 *
 * A tree swap is only meaningful when the code tree lives on a filesystem the
 * operator owns. Inside a CONTAINER IMAGE the tree is part of the image's
 * read-only layers: a rename swap "succeeds" into the container's WRITABLE
 * LAYER, and the next container recreation discards that layer — silently
 * reverting the install to the old code AND destroying the backup the swap
 * made. So the updater must refuse on the `image` channel and point the
 * operator at the image update path (`deploy/dedalo-image-update.sh`).
 *
 * A BIND-MOUNTED checkout inside a container is a different animal: the tree
 * lives on the host filesystem and survives recreation, so it is `tree_swap`
 * and proceeds normally. The discriminator is whether `projectRoot` sits on
 * its own mount (bind mount) or on the container's root overlay.
 *
 * Detection is Linux-/proc-based and DEGRADES SAFELY: no `/proc` (macOS dev)
 * or an unreadable mountinfo ⇒ `tree_swap` — a false `image` verdict would
 * brick legitimate updates, while a false `tree_swap` inside an image is the
 * pre-existing behaviour this module merely narrows.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';

export type DeploymentChannel = 'tree_swap' | 'image';

/** Test seams: the /proc surfaces, injectable. */
export interface ChannelProbeSeams {
	dockerenvPath?: string;
	cgroupPath?: string;
	mountinfoPath?: string;
}

/** Containerized? `/.dockerenv` or a container-runtime token in the cgroup path. */
export function isContainerized(seams: ChannelProbeSeams = {}): boolean {
	if (existsSync(seams.dockerenvPath ?? '/.dockerenv')) return true;
	try {
		const cgroup = readFileSync(seams.cgroupPath ?? '/proc/self/cgroup', 'utf8');
		return /docker|containerd|kubepods|libpod|podman|lxc/.test(cgroup);
	} catch {
		return false;
	}
}

/**
 * Is `root` its own mount point (or under one that is not the container's `/`
 * overlay)? Parses `/proc/self/mountinfo` (field 5 = mount point). A bind
 * mount of the checkout shows up as a mount point at (or above, excluding `/`)
 * the project root.
 */
/** Does one mountinfo line's mount point cover `target` (the container's `/` never does)? */
function mountLineCovers(line: string, target: string): boolean {
	// mountinfo: <id> <parent> <maj:min> <fs-root> <mount point> <options> …
	const mountPoint = line.split(' ')[4];
	if (mountPoint === undefined || mountPoint === '/') return false;
	// octal escapes (\040 = space) per proc(5)
	const decoded = mountPoint.replaceAll(/\\(\d{3})/g, (_, oct: string) =>
		String.fromCharCode(Number.parseInt(oct, 8)),
	);
	return decoded === target || target.startsWith(decoded + sep);
}

export function isOwnMountPoint(root: string, mountinfoPath = '/proc/self/mountinfo'): boolean {
	let text: string;
	try {
		text = readFileSync(mountinfoPath, 'utf8');
	} catch {
		return false;
	}
	const target = resolve(root);
	for (const line of text.split('\n')) {
		if (mountLineCovers(line, target)) return true;
	}
	return false;
}

/**
 * The channel verdict for a code tree at `root`:
 * containerized AND the tree is NOT bind-mounted ⇒ `image`; anything else
 * (bare metal, macOS dev, bind-mounted checkout, unreadable /proc) ⇒
 * `tree_swap`.
 */
export function detectDeploymentChannel(
	root: string,
	seams: ChannelProbeSeams = {},
): DeploymentChannel {
	if (!isContainerized(seams)) return 'tree_swap';
	return isOwnMountPoint(root, seams.mountinfoPath ?? '/proc/self/mountinfo')
		? 'tree_swap'
		: 'image';
}
