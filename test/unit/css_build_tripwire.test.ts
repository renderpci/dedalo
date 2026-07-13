/**
 * CSS BUILD tripwire (DEC-12: every documented invariant has one).
 *
 * The client's CSS is COMPILED from LESS and COMMITTED. That is not a style choice, it is
 * forced by the deployment model: `deploy/deploy.sh` states "the repo IS the artifact —
 * deploy = fetch + checkout <ref> on the host", and production installs with
 * `bun install --frozen-lockfile --production`, which does not even install the LESS
 * compiler. Nothing builds CSS on the way to production. So the bytes in git ARE the bytes
 * the browser gets, and the only question worth gating is: **do they still match the source
 * they claim to come from?**
 *
 * WHAT WENT WRONG WITHOUT THIS GATE (all of it real, all found 2026-07-13):
 *   - The CSS was built by a Mac GUI app on one developer's desktop. It stamped ABSOLUTE
 *     source paths into every `.css.map` — `/Users/<whoever>/…/master_dedalo/core/…`, naming
 *     the retired PHP tree's layout. TWO different developers' home directories were
 *     committed this way, and devtools could not resolve a single source, for anyone.
 *   - 33 tool stylesheets `@import`ed a path that resolves to NOTHING in this repo. They only
 *     ever compiled because the GUI app had a search path configured in its own project file.
 *   - One tool's stylesheet imported nothing at all yet used `@color_white`, compiling only
 *     because the same app silently prepended a global LESS file.
 *   - A block of CSS was HAND-APPENDED to the compiled `main.css`, with no source anywhere.
 *
 * Every one of those is a source→output divergence, invisible until someone rebuilds. This
 * gate makes a rebuild happen on every run.
 *
 * THREE ASSERTIONS:
 *   1. every committed `.css` / `.css.map` is byte-identical to a fresh compile of its `.less`
 *      (edit the LESS, forget `bun run css:build`, and CI is red);
 *   2. no `sources` entry in any map is an absolute path — the exact regression above;
 *   3. every `sources` entry resolves to a real file, relative to the map itself.
 *
 * It imports the REAL build (`scripts/build_css.ts`), so the gate cannot drift from the tool:
 * a second copy of the compile logic here would be a second thing to keep in sync.
 *
 * COST: compiles 41 entrypoints (~1s). DB-less, network-less → hermetic tier.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { buildOne, entrypoints } from '../../scripts/build_css.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** What a maintainer needs to be told when one of these fires. */
const WHY_STALE =
	'Committed CSS is out of date with its LESS. The compiled CSS is what SHIPS (deploy is a checkout, and production installs --production so the compiler is not even there), so a stale .css means the browser gets bytes that no source in this repo produces.\n\nFix: bun run css:build — then commit the result. (Or keep `bun run dev` running; it recompiles on save.)';
const WHY_ABSOLUTE =
	'A .css.map "sources" entry is an ABSOLUTE path. It names one machine\'s filesystem, so it resolves for nobody else — the exact bug the repo build replaced. Sources must be RELATIVE to the map; see relativizeSources() in scripts/build_css.ts.';
const WHY_MISSING =
	'A .css.map names a source file that does not exist, so devtools will 404 on it.';

/** Compile every entrypoint once; the three assertions below all read this. */
const targets = entrypoints();
const built = await Promise.all(
	targets.map(async (lessPath) => ({ lessPath, ...(await buildOne(lessPath)) })),
);

describe('css build tripwire', () => {
	test('there are entrypoints to build (a zero-length pass is not a pass)', () => {
		// Guards the guard: if the discovery ever silently returned [], the two tests below
		// would iterate nothing and report GREEN while proving nothing at all.
		expect(targets.length).toBeGreaterThan(30);
		expect(targets).toContain('client/dedalo/core/page/css/main.less');
	});

	test('every committed .css / .css.map matches a fresh compile of its .less', () => {
		const stale: string[] = [];
		for (const { lessPath, css, map } of built) {
			const cssPath = lessPath.replace(/\.less$/, '.css');
			const mapPath = `${cssPath}.map`;

			const cssOnDisk = existsSync(join(REPO_ROOT, cssPath))
				? readFileSync(join(REPO_ROOT, cssPath), 'utf8')
				: null;
			if (cssOnDisk !== css) stale.push(cssPath);

			if (map !== '') {
				const mapOnDisk = existsSync(join(REPO_ROOT, mapPath))
					? readFileSync(join(REPO_ROOT, mapPath), 'utf8')
					: null;
				if (mapOnDisk !== map) stale.push(mapPath);
			}
		}
		expect(stale, `${WHY_STALE}\n\nStale:\n${stale.map((f) => `  ${f}`).join('\n')}`).toEqual([]);
	});

	test('no source map points at an absolute path', () => {
		const offenders: string[] = [];
		for (const { lessPath, map } of built) {
			if (map === '') continue;
			const sources: string[] = JSON.parse(map).sources ?? [];
			for (const s of sources) {
				if (s.startsWith('/')) offenders.push(`${lessPath.replace(/\.less$/, '.css.map')} → ${s}`);
			}
		}
		expect(offenders, `${WHY_ABSOLUTE}\n${offenders.join('\n')}`).toEqual([]);
	});

	test('every source map entry resolves to a real file', () => {
		const missing: string[] = [];
		for (const { lessPath, map } of built) {
			if (map === '') continue;
			const cssDir = dirname(lessPath);
			const sources: string[] = JSON.parse(map).sources ?? [];
			for (const s of sources) {
				if (s.startsWith('/')) continue; // reported by the previous test
				if (!existsSync(join(REPO_ROOT, normalize(join(cssDir, s))))) {
					missing.push(`${lessPath.replace(/\.less$/, '.css.map')} → ${s}`);
				}
			}
		}
		expect(missing, `${WHY_MISSING}\n${missing.join('\n')}`).toEqual([]);
	});
});
