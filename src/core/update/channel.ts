/**
 * DEPLOYMENT CHANNEL detection for the code updater (2026-08-23; discriminator
 * corrected 2026-09-26).
 *
 * A tree swap is only meaningful when the code tree lives on a filesystem the
 * operator owns. Inside the PRODUCT IMAGE the tree is part of the image's
 * layers: a rename swap "succeeds" into the container's WRITABLE LAYER, and the
 * next container recreation discards that layer — silently reverting the
 * install to the old code AND destroying the backup the swap made. So the
 * updater must refuse on the `image` channel and point the operator at the
 * image update path (`deploy/dedalo-image-update.sh`).
 *
 * THE DISCRIMINATOR IS A POSITIVE MARKER THE PRODUCT IMAGE WRITES, not "am I in
 * a container". The first version asked `/.dockerenv` / the cgroup path, which
 * answers a different question: the CI toolchain image (`ci/Dockerfile`) runs
 * the update drills inside a container against a git-cloned scratch tree that
 * the container OWNS for the run, and every such run was refused as `image`
 * (measured: `ci:local --docker --instance` red on both drills, "verify phase
 * did not report the mismatch"). Being containerized says nothing about where
 * a given CODE TREE came from; only the build that baked the tree knows that.
 * The product `Dockerfile` therefore writes {@link IMAGE_TREE_MARKER_PATH}
 * (outside the tree, so no release archive, `docker cp` of the tree, or swap
 * can carry it). Gate: `test/unit/update_channel_native.test.ts`.
 *
 * WHY NO LEGACY FALLBACK IS NEEDED: this module only runs from a tree that
 * contains it, and the product image that ships this code is built by the
 * Dockerfile that writes the marker — code and marker travel in the same image
 * build. An older image runs its own older copy of this module.
 *
 * A BIND-MOUNTED checkout inside the product image is a different animal: the
 * tree lives on the host filesystem and survives recreation, so it is
 * `tree_swap` and proceeds normally (the `probe:update` museum stack runs
 * exactly this). The discriminator there is whether the root sits on its own
 * mount (bind mount / volume) or on the container's root overlay.
 *
 * FAIL-SAFE DIRECTION inside a marked image: a marker that exists but cannot be
 * read still counts as present, and an unreadable mountinfo counts as "not a
 * mount" — both land on `image` (refuse), because a false `tree_swap` there
 * loses the install on the next recreation, while a false `image` only costs
 * the operator the image update path.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';

export type DeploymentChannel = 'tree_swap' | 'image';

/**
 * The marker the PRODUCT image (`Dockerfile`, runtime stage) writes. Outside
 * the code tree on purpose: a tree exported from the image, or a checkout
 * bind-mounted over it, must never inherit it. Its body is informational (the
 * baked root); only its EXISTENCE is the verdict.
 */
export const IMAGE_TREE_MARKER_PATH = '/etc/dedalo/image_tree';

/** Test seams: the filesystem surfaces, injectable. */
export interface ChannelProbeSeams {
	imageMarkerPath?: string;
	mountinfoPath?: string;
}

/** Does this filesystem belong to a Dédalo PRODUCT image (the marker exists)? */
export function isProductImage(seams: ChannelProbeSeams = {}): boolean {
	return existsSync(seams.imageMarkerPath ?? IMAGE_TREE_MARKER_PATH);
}

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

/**
 * Is `root` its own mount point, or under one that is not the container's `/`
 * overlay? Parses `/proc/self/mountinfo` (field 5 = mount point). A bind mount
 * of the checkout (or of a parent of it) covers the project root. Unreadable ⇒
 * false (the fail-safe direction inside a marked image).
 */
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
 * product image (marker present) AND the tree is NOT on a mount ⇒ `image`;
 * anything else (bare metal, macOS dev, the CI toolchain container, a
 * bind-mounted checkout inside the product image) ⇒ `tree_swap`.
 */
export function detectDeploymentChannel(
	root: string,
	seams: ChannelProbeSeams = {},
): DeploymentChannel {
	if (!isProductImage(seams)) return 'tree_swap';
	return isOwnMountPoint(root, seams.mountinfoPath ?? '/proc/self/mountinfo')
		? 'tree_swap'
		: 'image';
}
