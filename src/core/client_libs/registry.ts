/**
 * THE CLIENT-LIB REGISTRY — the single allowlist of third-party browser
 * libraries the client may load, and the only place their filesystem roots are
 * declared.
 *
 * Every lib is served at `/dedalo/lib/<id>/<subpath>` and resolves to exactly one
 * root below. There is no filesystem `client/dedalo/lib/` any more: the libs come
 * from the package manager (`bun install`), from the committed `vendor/` tree, or
 * from an upstream release fetched at install time (scripts/fetch_client_libs.ts).
 *
 * SECURITY — this registry IS the chokepoint. `node_modules/` also holds the
 * SERVER's own dependencies (the Anthropic SDK, zod, the MCP SDK, Puppeteer…).
 * The serving route must key on an id in this table and NEVER map a request path
 * into node_modules directly, or the whole dependency tree becomes web-readable.
 *
 * Versions are PINNED EXACTLY in package.json (no `^`), because the pins were
 * chosen by byte-comparing each file against the previously-vendored copy: 18 of
 * the 20 files the client loads are byte-identical to what shipped before. The two
 * that are not: `highlightjs` (differs only by the build hash in its banner — same
 * 11.9.0 release) and `chai` (the old copy was a CDN build; npm's is an equivalent
 * UMD bundle, and it is test-harness-only anyway).
 *
 * Adding a lib: add an entry here, add the dep to package.json (or drop it in
 * `vendor/` with a `reason`), and point `probe` at a file that must exist. The
 * client_libs tripwire GETs every probe — a lib that is missing, misplaced, or
 * renamed by an upstream reshuffle fails loudly instead of 404ing in the browser.
 */

import { resolve } from 'node:path';
import { projectRoot, readEnv } from '../../config/env.ts';

/** Where a lib's bytes come from. Drives the tripwire and the docs, not the routing. */
export type LibSource =
	/** A pinned package.json dependency — Dependabot/CVE alerts apply. */
	| 'npm'
	/** Committed under vendor/. Cannot come from a package manager; needs a `reason`. */
	| 'vendor'
	/** Fetched from an upstream release at install time. Needs a `reason`. */
	| 'fetched';

export interface ClientLib {
	/** Filesystem root, relative to the repo root. */
	readonly base: string;
	readonly source: LibSource;
	/**
	 * A file that MUST resolve under `base` — the tripwire fetches it. Pick the
	 * file the client actually loads, so an upstream layout change is caught.
	 */
	readonly probe: string;
	/**
	 * Only served when DEDALO_DEV_MODE=true. These are devDependencies, so they are
	 * absent after `bun install --frozen-lockfile --production` on a deploy host —
	 * serving them in production would 404 anyway; gating them says so on purpose.
	 */
	readonly devOnly?: boolean;
	/** Why this lib is not package-manager-tracked. Required for vendor/fetched. */
	readonly reason?: string;
}

/**
 * id → lib. The id is the URL segment and is deliberately DECOUPLED from the
 * package name, so swapping the underlying package (jsoneditor →
 * vanilla-jsoneditor) never touches a client file.
 */
export const CLIENT_LIBS: Readonly<Record<string, ClientLib>> = {
	// --- package-manager tracked ------------------------------------------------
	three: { base: 'node_modules/three', source: 'npm', probe: 'build/three.module.js' },
	d3: { base: 'node_modules/d3', source: 'npm', probe: 'dist/d3.min.js' },
	jsoneditor: { base: 'node_modules/vanilla-jsoneditor', source: 'npm', probe: 'standalone.js' },
	leaflet: { base: 'node_modules/leaflet', source: 'npm', probe: 'dist/leaflet.js' },
	geoman: {
		base: 'node_modules/@geoman-io/leaflet-geoman-free',
		source: 'npm',
		probe: 'dist/leaflet-geoman.min.js',
	},
	turf: { base: 'node_modules/@turf/turf', source: 'npm', probe: 'turf.min.js' },
	flatpickr: { base: 'node_modules/flatpickr', source: 'npm', probe: 'dist/flatpickr.min.js' },
	dropzone: { base: 'node_modules/dropzone', source: 'npm', probe: 'dist/min/dropzone.min.js' },
	split: { base: 'node_modules/split.js', source: 'npm', probe: 'dist/split.es.js' },
	iro: { base: 'node_modules/@jaames/iro', source: 'npm', probe: 'dist/iro.min.js' },
	'codex-tooltip': {
		base: 'node_modules/codex-tooltip',
		source: 'npm',
		probe: 'dist/tooltip.js',
	},
	highlightjs: {
		// The `highlight.js` package's es/ entry is a bundler stub that chains into a
		// CommonJS lib/ — unusable in a browser without a bundler. @highlightjs/cdn-assets
		// ships the SAME release as browser-ready ESM, which is what the client loads.
		base: 'node_modules/@highlightjs/cdn-assets',
		source: 'npm',
		probe: 'es/core.min.js',
	},
	xlsx: {
		// SheetJS left the npm registry (npm's `xlsx` is abandoned at 0.18.5), so the
		// dep is pinned to their own tarball URL — bun installs it like any other.
		base: 'node_modules/xlsx',
		source: 'npm',
		probe: 'xlsx.mjs',
	},
	svgedit: {
		// Was a vendored ~7.2.x-era build (2.0 MB) with no upstream package. 7.4.2 is a
		// verified drop-in: same default export, all 29 methods + 3 properties
		// vector_editor.js uses, and an identical add→serialise→read-back round trip —
		// including `xlink:href`, which the stored layer JSON depends on (the 7.2.7
		// "prefer href to xlink href" change does NOT rewrite it).
		base: 'node_modules/@svgedit/svgcanvas',
		source: 'npm',
		probe: 'dist/svgcanvas.js',
	},

	// --- dev-only (client test harness; devDependencies) -------------------------
	mocha: { base: 'node_modules/mocha', source: 'npm', probe: 'mocha.js', devOnly: true },
	chai: { base: 'node_modules/chai', source: 'npm', probe: 'chai.js', devOnly: true },

	// --- committed under vendor/ (2.7 MB gzipped) --------------------------------
	ckeditor: {
		base: 'vendor/ckeditor',
		source: 'vendor',
		probe: 'build/ckeditor.js',
		reason:
			'Custom Dédalo webpack build of CKEditor 5 42.0.1 (a bespoke ddEditor class plus the dedalo_image_tags and reference plugins). The build project no longer exists in any checkout — build/ckeditor.js.map is the only surviving copy of that plugin source, which is why the map is committed too. Not reproducible from npm.',
	},
	'json-view': {
		base: 'vendor/json-view',
		source: 'vendor',
		probe: 'jsonview.bundle.js',
		reason: 'pgrabovets/json-view is distributed via GitHub/jsDelivr only; never published to npm.',
	},

	// --- fetched from upstream at install time -----------------------------------
	pdfjs: {
		base: 'vendor/pdfjs',
		source: 'fetched',
		probe: 'web/viewer.html',
		reason:
			"npm's pdfjs-dist ships the pdf.js COMPONENT library (web/pdf_viewer.mjs), not the standalone viewer app. component_pdf iframes web/viewer.html, which only exists in the pdfjs-<version>-dist.zip GitHub release — so it is fetched from Mozilla's own release by scripts/fetch_client_libs.ts and sha256-verified.",
	},
} as const;

/**
 * True when the client test harness (and its dev-only libs) may be served. Read
 * per-call, not memoized at module load, so a test can flip DEDALO_DEV_MODE.
 */
export function isDevMode(): boolean {
	return readEnv('DEDALO_DEV_MODE', 'false') === 'true';
}

/** Absolute filesystem root for a lib id, or null when the id is not registered. */
export function libRoot(id: string): string | null {
	const lib = CLIENT_LIBS[id];
	if (lib === undefined) return null;
	return resolve(projectRoot, lib.base);
}
