/**
 * Directory pre-flight (PHP installer check_directories). Verifies (and, when
 * `create` is true, creates) the writable directories a running TS server needs:
 * the private config dir, the session store's dir, the media root, and the
 * backups dir. Writability is proven by a write+unlink probe, not `access` bits
 * (PHP dir_is_writable parity — an NFS/ACL mount can lie about the bits); the
 * probe itself lives in `dir_probe.ts`, shared with the media-tree provisioner.
 *
 * THE MEDIA TREE IS PART OF THIS STEP (audit 2026-08_oh1_beta §5.2). PHP's
 * boot-time provisioner (`dd_init_test`) created the whole tree under the media
 * root — quality folders, posterframe, subtitles, upload staging, import. The
 * rewrite created only the ROOT, so `media/av/subtitles` never existed and VTT
 * subtitles could not be produced at all. `media_tree.ts` is the ported
 * declarative description; this step drives it so an install ends with a
 * complete, verified tree at ONE permission mode. The step is NOT the only
 * driver — `provisionMediaTreeAtBoot` runs on every server start, which is what
 * reaches a box that was installed years ago.
 *
 * Response shape is the client contract: `{result, dirs:[{label,path,exists,
 * writable}]}` (render_installer.js renders one row per dir). The media tree is
 * ONE row ("Media tree") — thirty rows would drown the panel — and `msg` carries
 * a ONE-LINE summary, never the list: the client assigns `msg` with textContent
 * into a `display:flex` `.msg` pill (`render_installer.js`, `installer.less`), so
 * embedded newlines collapse into one unreadable run. The full per-directory
 * detail travels structured, on `mediaTree.problems`.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../../config/config.ts';
import { dirIsWritable } from './dir_probe.ts';
import {
	MEDIA_DIR_MODE,
	type MediaTreeReport,
	provisionMediaTree,
	summarizeMediaTreeReport,
} from './media_tree.ts';
import { installPrivateDir } from './paths.ts';

interface DirReport {
	label: string;
	path: string;
	exists: boolean;
	writable: boolean;
}

export interface CheckDirectoriesOptions {
	/** Create missing directories (the installer's create pass). */
	readonly create: boolean;
	/**
	 * MEDIA ROOT OVERRIDE — the seam that keeps a test out of the live media tree.
	 *
	 * `create:true` provisions the whole media tree, so without this a unit test
	 * exercising this function would mkdir into the REAL configured media root
	 * (which is exactly what happened once). Production callers — the installer
	 * step (`install/engine.ts`) and `scripts/install.ts` — never pass it, and the
	 * default stays `config.media.rootPath`.
	 */
	readonly mediaRoot?: string;
}

/** The directories the installer manages, with human labels. */
function targetDirs(mediaRoot: string | null): { label: string; path: string }[] {
	const dir = installPrivateDir();
	const dirs: { label: string; path: string }[] = [
		{ label: 'Private config', path: dir },
		{ label: 'Sessions', path: join(dir, 'sessions') },
		{ label: 'Backups', path: config.ops.backupDir ?? join(dir, 'backups', 'db') },
	];
	if (mediaRoot !== null) {
		dirs.push({ label: 'Media', path: mediaRoot });
	}
	return dirs;
}

export interface CheckDirectoriesResult {
	result: boolean;
	dirs: DirReport[];
	msg: string;
	/**
	 * The media-tree pass, when a media root is configured. Null when it is not
	 * (an install that has not written MEDIA_PATH yet) — never silently absent
	 * on a configured box: a throwing provisioner surfaces as an error row.
	 */
	mediaTree: MediaTreeReport | null;
}

/** Verify (optionally create) the install directories AND the media tree. */
export function checkDirectories(options: CheckDirectoriesOptions): CheckDirectoriesResult {
	const mediaRoot = options.mediaRoot ?? config.media.rootPath;
	const reports: DirReport[] = [];
	const notes: string[] = [];
	for (const { label, path } of targetDirs(mediaRoot)) {
		if (options.create && !existsSync(path)) {
			try {
				// The media root is the media tree's own root: same mode as every
				// directory under it (MEDIA_DIR_MODE === the 0750 PHP used here).
				mkdirSync(path, { recursive: true, mode: MEDIA_DIR_MODE });
			} catch {
				// fall through — the report below records exists:false
			}
		}
		const exists = existsSync(path);
		reports.push({ label, path, exists, writable: exists && dirIsWritable(path) });
	}

	// The media tree, driven from the SAME step: the installer creates the root
	// above, the provisioner fills it. A configuration that cannot be provisioned
	// at all (no root, an escaping folder name) throws — it is a refusal, not a
	// row, and the installer must show it rather than advance.
	//
	// PROVISIONING ONLY (`create:true`). PHP's installer check_directories did NOT
	// touch the tree — its BOOT script (dd_init_test) did, on every request. The
	// per-boot equivalent is `provisionMediaTreeAtBoot`, wired in src/server.ts;
	// this step is the fresh-install path, and a plain verify call keeps PHP's
	// installer shape exactly and reports nothing extra.
	//
	// NO `budgetMs`, DELIBERATELY. The boot pass carries a wall-clock budget
	// (MEDIA_TREE_BOOT_BUDGET_MS) because it sits between the process starting and
	// the socket being bound. This one does not: the wizard step is an interactive
	// operation an operator is watching, where waiting is the correct behaviour and
	// half a tree behind an "all directories present" panel is worse than a slow
	// answer. Gated in media_tree_provision_native.test.ts ("the INSTALLER pass is
	// deliberately unbounded").
	let mediaTree: MediaTreeReport | null = null;
	if (
		options.create &&
		mediaRoot !== null &&
		reports.some((r) => r.label === 'Media' && r.exists)
	) {
		try {
			mediaTree = provisionMediaTree({ root: mediaRoot, create: true });
			// ONE line: `msg` renders as a single-line pill (see the header). The
			// full per-directory list travels on `mediaTree.problems`, which a
			// legacy install can fill with one mode deviation per pre-existing
			// folder.
			notes.push(summarizeMediaTreeReport(mediaTree));
			reports.push({
				label: 'Media tree',
				path: mediaTree.root,
				exists: mediaTree.result,
				writable: mediaTree.result,
			});
		} catch (error) {
			notes.push(`media tree: REFUSED — ${(error as Error).message}`);
			reports.push({
				label: 'Media tree',
				path: mediaRoot,
				exists: false,
				writable: false,
			});
		}
	}

	const result = reports.every((report) => report.exists && report.writable);
	const base = result
		? 'All directories present and writable'
		: 'One or more directories need attention';
	return {
		result,
		dirs: reports,
		// Single line, always: joined with ' | ', never '\n' (header).
		msg: notes.length > 0 ? [base, ...notes].join(' | ') : base,
		mediaTree,
	};
}
