/**
 * update_channel_native — the code updater's DEPLOYMENT CHANNEL verdict
 * (src/core/update/channel.ts).
 *
 * THE DEFECT THIS GATE PINS (2026-09-26). The first discriminator was "am I in a
 * container" (`/.dockerenv`, the cgroup path). Inside the CI toolchain image
 * (`ci/Dockerfile`) the update drills clone a scratch tree the container owns
 * for the run, and every install was refused as `image` — `ci:local --docker
 * --instance` red on both drills. The question is not WHERE the process runs but
 * whether THIS CODE TREE is baked into the product image; only the build that
 * baked it knows, so the product `Dockerfile` writes a positive marker.
 *
 * The verdict matrix, each row a real filesystem fixture through the seams:
 *   host / macOS / CI container (no marker)          → tree_swap
 *   product image, tree on the root overlay          → image
 *   product image, tree (or a parent) bind-mounted   → tree_swap (probe:update)
 *   product image, mountinfo unreadable              → image (fail-safe)
 * plus the two halves of the marker's provenance: the product Dockerfile's
 * command, EXECUTED, produces a marker the detector recognizes; the CI image
 * writes none. And the suite's own machine — wherever it runs, the CI container
 * included — must read `tree_swap`, which is the measured regression itself.
 */

import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { projectRoot } from '../../src/config/env.ts';
import {
	detectDeploymentChannel,
	IMAGE_TREE_MARKER_PATH,
	isOwnMountPoint,
	isProductImage,
} from '../../src/core/update/channel.ts';

const BAKED_ROOT = '/opt/dedalo/master_dedalo';

/** A mountinfo line (proc(5) shape) for `mountPoint`. */
function mountLine(id: number, mountPoint: string, fs = 'ext4'): string {
	return `${id} 1 8:1 / ${mountPoint} rw,relatime - ${fs} /dev/sda1 rw`;
}
const OVERLAY_ROOT = mountLine(1, '/', 'overlay');

function fixture(): { dir: string; marker: string; mountinfo(lines: string[]): string } {
	const dir = mkdtempSync(join(tmpdir(), 'dedalo_channel_'));
	const marker = join(dir, 'image_tree');
	return {
		dir,
		marker,
		mountinfo(lines) {
			const path = join(dir, 'mountinfo');
			writeFileSync(path, `${lines.join('\n')}\n`);
			return path;
		},
	};
}

describe('detectDeploymentChannel — the verdict matrix', () => {
	test('no product-image marker ⇒ tree_swap, even on a container root overlay', () => {
		// The CI toolchain container: containerized, tree NOT on its own mount
		// (a clone under /tmp), and still legitimately swappable.
		const f = fixture();
		try {
			const mountinfoPath = f.mountinfo([OVERLAY_ROOT, mountLine(2, '/proc', 'proc')]);
			expect(
				detectDeploymentChannel('/tmp/drill/opt/master_dedalo', {
					imageMarkerPath: f.marker,
					mountinfoPath,
				}),
			).toBe('tree_swap');
			expect(isProductImage({ imageMarkerPath: f.marker })).toBe(false);
		} finally {
			rmSync(f.dir, { recursive: true, force: true });
		}
	});

	test('product image, baked tree on the root overlay ⇒ image', () => {
		const f = fixture();
		try {
			writeFileSync(f.marker, `${BAKED_ROOT}\n`);
			const mountinfoPath = f.mountinfo([OVERLAY_ROOT, mountLine(2, '/private')]);
			expect(
				detectDeploymentChannel(BAKED_ROOT, { imageMarkerPath: f.marker, mountinfoPath }),
			).toBe('image');
		} finally {
			rmSync(f.dir, { recursive: true, force: true });
		}
	});

	test('product image, tree or its parent bind-mounted ⇒ tree_swap (the probe:update museum)', () => {
		const f = fixture();
		try {
			writeFileSync(f.marker, `${BAKED_ROOT}\n`);
			for (const mounted of ['/opt/dedalo', BAKED_ROOT, '/opt']) {
				const mountinfoPath = f.mountinfo([OVERLAY_ROOT, mountLine(2, mounted)]);
				expect(
					detectDeploymentChannel(BAKED_ROOT, { imageMarkerPath: f.marker, mountinfoPath }),
				).toBe('tree_swap');
			}
			// a SIBLING prefix is not a parent: /opt/dedalo_other does not cover the tree
			const sibling = f.mountinfo([OVERLAY_ROOT, mountLine(2, '/opt/dedalo_other')]);
			expect(
				detectDeploymentChannel(BAKED_ROOT, {
					imageMarkerPath: f.marker,
					mountinfoPath: sibling,
				}),
			).toBe('image');
		} finally {
			rmSync(f.dir, { recursive: true, force: true });
		}
	});

	test('product image, unreadable mountinfo ⇒ image (the fail-safe direction)', () => {
		const f = fixture();
		try {
			writeFileSync(f.marker, `${BAKED_ROOT}\n`);
			expect(
				detectDeploymentChannel(BAKED_ROOT, {
					imageMarkerPath: f.marker,
					mountinfoPath: join(f.dir, 'absent'),
				}),
			).toBe('image');
		} finally {
			rmSync(f.dir, { recursive: true, force: true });
		}
	});

	test('octal-escaped mount points (proc(5)) are decoded', () => {
		const f = fixture();
		try {
			const mountinfoPath = f.mountinfo([OVERLAY_ROOT, mountLine(2, '/srv/my\\040tree')]);
			expect(isOwnMountPoint('/srv/my tree/master_dedalo', mountinfoPath)).toBe(true);
			expect(isOwnMountPoint('/srv/my', mountinfoPath)).toBe(false);
		} finally {
			rmSync(f.dir, { recursive: true, force: true });
		}
	});
});

describe('the marker is the product image’s, and only the product image’s', () => {
	/** The Dockerfile's instructions with comments dropped and `\` continuations joined. */
	function instructions(text: string): string[] {
		return text
			.split('\n')
			.filter((line) => !/^\s*#/.test(line))
			.join('\n')
			.replaceAll(/\\\n/g, ' ')
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line !== '');
	}

	test('the product Dockerfile RUNTIME stage writes the marker — executed, then detected', () => {
		const all = instructions(readFileSync(join(projectRoot, 'Dockerfile'), 'utf8'));
		// the runtime stage = everything before the next FROM (dev and production
		// inherit it; a marker written only in `dev` would leave production unmarked)
		const stageEnd = all.findIndex((line, i) => i > 0 && /^FROM\s/i.test(line));
		const runtime = all.slice(0, stageEnd === -1 ? all.length : stageEnd);
		const writers = runtime.filter(
			(line) => /^RUN\s/i.test(line) && line.includes(IMAGE_TREE_MARKER_PATH),
		);
		expect(writers).toHaveLength(1);

		// EXECUTE it against a scratch /etc: the gate measures that the command
		// really produces a marker the detector sees, not that the path is spelled.
		const f = fixture();
		try {
			const markerDir = dirname(IMAGE_TREE_MARKER_PATH);
			const command = (writers[0] as string)
				.replace(/^RUN\s+/i, '')
				.replaceAll(markerDir, join(f.dir, 'etc_dedalo'));
			const run = Bun.spawnSync(['sh', '-ec', command]);
			expect(run.exitCode).toBe(0);
			const written = join(f.dir, 'etc_dedalo', basename(IMAGE_TREE_MARKER_PATH));
			expect(isProductImage({ imageMarkerPath: written })).toBe(true);
			// the tree the marker names is the WORKDIR the image bakes the code into
			const workdir = runtime.find((line) => /^WORKDIR\s/i.test(line))?.split(/\s+/)[1];
			expect(readFileSync(written, 'utf8').trim()).toBe(workdir as string);
			// and a baked tree there, un-mounted, is refused
			const mountinfoPath = f.mountinfo([OVERLAY_ROOT]);
			expect(
				detectDeploymentChannel(workdir as string, { imageMarkerPath: written, mountinfoPath }),
			).toBe('image');
		} finally {
			rmSync(f.dir, { recursive: true, force: true });
		}
	});

	test('the CI toolchain image writes no marker (it runs drills on trees it owns)', () => {
		const ci = readFileSync(join(projectRoot, 'ci', 'Dockerfile'), 'utf8');
		expect(ci.includes(IMAGE_TREE_MARKER_PATH)).toBe(false);
		expect(ci.includes(`${dirname(IMAGE_TREE_MARKER_PATH)}/`)).toBe(false);
	});

	test('the machine running this suite reads tree_swap (host, or the CI container)', () => {
		// build_context.ts keeps test/ out of the product image, so the suite never
		// runs where the marker legitimately exists. A red here in the CI
		// container is exactly the 2026-09-26 regression.
		expect(detectDeploymentChannel(projectRoot)).toBe('tree_swap');
	});
});
