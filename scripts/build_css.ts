/**
 * CSS BUILD — LESS → CSS, in the repo, on Bun. Replaces CodeKit (2026-07-13).
 *
 * WHY THIS EXISTS. The CSS used to be compiled by CodeKit, a Mac GUI app. Nothing about
 * that was reproducible: the build lived on one developer's desktop, and CodeKit stamped
 * ABSOLUTE source paths into every `.css.map` — so the committed maps pointed at
 * `/Users/<whoever>/…/master_dedalo/core/…`, a path that exists on no other machine and
 * names the retired PHP tree's layout. Two different developers' home directories were
 * committed this way. Devtools could not resolve a single source, for anyone.
 *
 * The rule this file enforces: **a source map's `sources` are RELATIVE to the map itself**,
 * so they resolve on any checkout. `sourceMapBasepath` is what does it — remove it and the
 * absolute paths come straight back.
 *
 * ENTRYPOINTS ARE DERIVED, NOT LISTED. An entrypoint is any `.less` that no other `.less`
 * imports; everything else is a partial. That way adding a partial needs no edit here, and
 * adding a new top-level stylesheet Just Works — a hand-maintained list would rot.
 *
 * Output is EXPANDED, not minified: the committed CSS is expanded, the client serves these
 * files directly, and `client_serving.test.ts` asserts served bytes == disk bytes.
 *
 *   bun run css:build          # compile every entrypoint
 *   bun run css:watch          # rebuild on save — only the entrypoints that import the file
 *   bun run css:check          # compile to memory; fail if any output is stale (CI)
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { Glob } from 'bun';
import less from 'less';

const REPO_ROOT = resolve(import.meta.dir, '..');
/** Where LESS lives. `tools/` sits at the repo root; the rest under the client tree. */
const SEARCH_DIRS = ['client', 'tools', 'src'];

const checkOnly = Bun.argv.includes('--check');
const watch = Bun.argv.includes('--watch');

/** Every .less in the repo (excluding vendored/third-party trees). */
function allLessFiles(): string[] {
	const out: string[] = [];
	for (const dir of SEARCH_DIRS) {
		const glob = new Glob(`${dir}/**/*.less`);
		for (const f of glob.scanSync({ cwd: REPO_ROOT })) {
			if (f.includes('/lib/') || f.startsWith('vendor/') || f.includes('node_modules')) continue;
			out.push(f);
		}
	}
	return out.sort();
}

/** `@import (once) '../x/y';` → the file it resolves to. LESS makes the extension optional. */
const IMPORT_RE = /@import\s*(?:\([^)]*\)\s*)?['"]([^'"]+)['"]/g;

function importedBy(file: string): string[] {
	const text = readFileSync(join(REPO_ROOT, file), 'utf8');
	const here = dirname(file);
	const hits: string[] = [];
	for (const m of text.matchAll(IMPORT_RE)) {
		const spec = m[1];
		if (spec === undefined || spec.startsWith('http')) continue;
		const withExt = spec.endsWith('.less') || spec.endsWith('.css') ? spec : `${spec}.less`;
		const abs = join(here, withExt);
		if (existsSync(join(REPO_ROOT, abs))) hits.push(abs);
	}
	return hits;
}

/**
 * An ENTRYPOINT is a `.less` that no other `.less` imports. Derived, never hand-listed — a
 * list would rot the first time someone added a partial.
 *
 * A PARTIAL is not compiled on its own, and cannot be: it leans on mixins and variables that
 * `main.less` imports before it (compile `area_admin.less` alone and you get
 * `.dd_console is undefined`). The old GUI build emitted standalone CSS for partials anyway,
 * by silently prepending a global LESS file — which is also why one tool's stylesheet was
 * missing its `vars` import and nobody noticed. This build resolves imports honestly, so a
 * partial that does not declare what it needs fails loudly instead of compiling by accident.
 */
function entrypoints(): string[] {
	const all = allLessFiles();
	const imported = new Set<string>();
	for (const f of all) for (const i of importedBy(f)) imported.add(i);
	return all.filter((f) => !imported.has(f));
}

async function buildOne(lessPath: string): Promise<{ css: string; map: string }> {
	const dir = dirname(lessPath);
	const cssPath = lessPath.replace(/\.less$/, '.css');
	const mapName = `${basename(cssPath)}.map`;

	const result = await less.render(readFileSync(join(REPO_ROOT, lessPath), 'utf8'), {
		filename: join(REPO_ROOT, lessPath),
		paths: [join(REPO_ROOT, dir)],
		sourceMap: {
			sourceMapBasepath: join(REPO_ROOT, dir),
			sourceMapURL: mapName,
			outputSourceFiles: false,
		},
	});
	return { css: result.css, map: relativizeSources(result.map ?? '', dir) };
}

/**
 * Force every `sources` entry to be relative to the map's own directory.
 *
 * `sourceMapBasepath` only strips sources that live UNDER the basepath — a cross-directory
 * `@import` (page/css importing installer/css) falls outside it and less writes the ABSOLUTE
 * path. That single gap is how machine paths got committed in the first place, so we do not
 * trust the option alone: we rewrite the array ourselves and the caller re-checks it.
 */
function relativizeSources(mapJson: string, cssDir: string): string {
	if (mapJson === '') return mapJson;
	const map = JSON.parse(mapJson) as { sources?: string[] };
	if (!Array.isArray(map.sources)) return mapJson;
	map.sources = map.sources.map((s) =>
		s.startsWith('/') ? relative(join(REPO_ROOT, cssDir), s) : s,
	);
	return JSON.stringify(map);
}

/** Compile one entrypoint and write its .css + .css.map. Returns false if it was a no-op. */
async function writeOne(lessPath: string): Promise<boolean> {
	const cssPath = lessPath.replace(/\.less$/, '.css');
	const mapPath = `${cssPath}.map`;
	const { css, map } = await buildOne(lessPath);
	writeFileSync(join(REPO_ROOT, cssPath), css);
	if (map !== '') writeFileSync(join(REPO_ROOT, mapPath), map);
	return true;
}

/**
 * Which entrypoints does `changed` affect? An entrypoint is affected if it IS the changed
 * file, or if the changed file appears anywhere in its transitive `@import` graph.
 *
 * Editing `layout/vars.less` (imported by nearly everything) correctly rebuilds nearly
 * everything; editing one tool's stylesheet rebuilds only that tool. That is the whole point
 * of walking the graph instead of rebuilding all 41 on every keystroke.
 */
function affectedBy(changed: string, targets: string[]): string[] {
	const out: string[] = [];
	for (const entry of targets) {
		if (entry === changed) {
			out.push(entry);
			continue;
		}
		const seen = new Set<string>();
		const stack = [entry];
		while (stack.length > 0) {
			const f = stack.pop();
			if (f === undefined || seen.has(f)) continue;
			seen.add(f);
			for (const dep of importedBy(f)) stack.push(dep);
		}
		if (seen.has(changed)) out.push(entry);
	}
	return out;
}

// ---------------------------------------------------------------------------
// WATCH — rebuild on save. `bun run css:watch`
// ---------------------------------------------------------------------------
if (watch) {
	const { watch: fsWatch } = await import('node:fs');
	let targets = entrypoints();
	console.log(`css: watching ${SEARCH_DIRS.join(', ')} for *.less — ${targets.length} entrypoints`);
	console.log('css: Ctrl-C to stop\n');

	// Debounce: editors write a file in several syscalls, and one save must not trigger
	// several compiles of the same sheet.
	const pending = new Set<string>();
	let timer: ReturnType<typeof setTimeout> | null = null;

	const flush = async (): Promise<void> => {
		const changed = [...pending];
		pending.clear();
		// A new/renamed .less can change the entrypoint set, so re-derive it.
		targets = entrypoints();
		const toBuild = new Set<string>();
		for (const c of changed) for (const e of affectedBy(c, targets)) toBuild.add(e);

		for (const c of changed) console.log(`css: changed ${c}`);
		if (toBuild.size === 0) {
			console.log('css:   (no entrypoint depends on it)\n');
			return;
		}
		const started = Bun.nanoseconds();
		for (const entry of toBuild) {
			try {
				await writeOne(entry);
				console.log(`css:   → ${entry.replace(/\.less$/, '.css')}`);
			} catch (error) {
				// A LESS error must NOT kill the watcher — print it and keep watching, so a
				// typo does not force you to restart the process.
				const e = error as { message?: string; filename?: string; line?: number };
				console.error(`css:   ✗ ${entry}: ${e.message ?? String(error)}`);
				if (e.filename !== undefined) console.error(`css:     ${e.filename}:${e.line ?? '?'}`);
			}
		}
		const ms = Math.round((Bun.nanoseconds() - started) / 1e6);
		console.log(`css: rebuilt ${toBuild.size} in ${ms}ms\n`);
	};

	for (const dir of SEARCH_DIRS) {
		fsWatch(join(REPO_ROOT, dir), { recursive: true }, (_event, filename) => {
			if (filename === null || !filename.endsWith('.less')) return;
			const rel = join(dir, filename);
			if (rel.includes('/lib/') || rel.includes('node_modules')) return;
			pending.add(rel);
			if (timer !== null) clearTimeout(timer);
			timer = setTimeout(() => void flush(), 80);
		});
	}
	// Hold the process open.
	await new Promise(() => {});
}

const targets = entrypoints();
console.log(`css: ${targets.length} entrypoints (derived: a .less nobody imports)`);

let written = 0;
const stale: string[] = [];

for (const lessPath of targets) {
	const cssPath = lessPath.replace(/\.less$/, '.css');
	const mapPath = `${cssPath}.map`;

	if (checkOnly) {
		const { css, map } = await buildOne(lessPath);
		const cssOld = existsSync(join(REPO_ROOT, cssPath))
			? readFileSync(join(REPO_ROOT, cssPath), 'utf8')
			: null;
		const mapOld = existsSync(join(REPO_ROOT, mapPath))
			? readFileSync(join(REPO_ROOT, mapPath), 'utf8')
			: null;
		if (cssOld !== css || mapOld !== map) stale.push(cssPath);
		continue;
	}

	await writeOne(lessPath);
	written++;
}

if (checkOnly) {
	if (stale.length > 0) {
		console.error(`\ncss: ${stale.length} output(s) STALE — run \`bun run css:build\` and commit:`);
		for (const f of stale) console.error(`  ${f}`);
		process.exit(1);
	}
	console.log('css: all outputs up to date');
} else {
	console.log(`css: wrote ${written} .css (+ .css.map, sources relative to each map)`);
	// A guard against the regression this build exists to fix.
	for (const lessPath of targets) {
		const mapPath = join(REPO_ROOT, lessPath.replace(/\.less$/, '.css.map'));
		if (!existsSync(mapPath)) continue;
		const sources: string[] = JSON.parse(readFileSync(mapPath, 'utf8')).sources ?? [];
		const absolute = sources.filter((s) => s.startsWith('/'));
		if (absolute.length > 0) {
			console.error(`css: ABSOLUTE source in ${relative(REPO_ROOT, mapPath)}: ${absolute[0]}`);
			process.exit(1);
		}
	}
}
