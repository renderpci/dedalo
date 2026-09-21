/**
 * THE PUBLICATION CORPUS — the one lister that owns the publication trees.
 *
 * `publication/` holds two standalone packages that ship beside the engine: the
 * read-only publication API v2 (`server_api/v2`) and the site-builder daemon
 * (`site_builder`), the latter with a tool client under `tools/tool_sitebuilder/js`.
 * Engine gates assert source-shape laws over them (bounded parameters and the
 * one identity reader; path confinement and frame sandboxing), and
 * `census_derivation_tripwire` refuses a gate that chooses its own walk root
 * in-file — a corpus that can drift per gate is a census nobody can trust.
 * This module owns the roots; the gates import a shape and never name a directory.
 *
 * Every lister here is zero-argument on purpose: a parameterized lister hands
 * the root choice back to the caller, which is the very thing the rule is about.
 */

import { readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** The publication roots. The ONLY place they are named. */
export const PUBLICATION_API_V2_SRC = join(REPO_ROOT, 'publication/server_api/v2/src');
export const SITE_BUILDER_SRC = join(REPO_ROOT, 'publication/site_builder/src');
export const SITE_BUILDER_TOOL_JS = join(REPO_ROOT, 'tools/tool_sitebuilder/js');

/**
 * The API v2 ENTRY LAYERS — every place a client-supplied value becomes a schema:
 * the two directories, walked, plus the one shared validators module.
 */
export const PUBLICATION_API_V2_ENTRY_DIRS = ['mcp', 'routes'];
export const PUBLICATION_API_V2_ENTRY_FILES = ['validators.ts'];

function walk(dir: string, ext: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		if (entry === 'node_modules') continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, ext, out);
		else if (extname(entry) === ext) out.push(full);
	}
	return out;
}

/** Every .ts under the publication API v2 source tree. */
export function publicationApiV2Files(): string[] {
	return walk(PUBLICATION_API_V2_SRC, '.ts').sort();
}

/** The API v2 entry layers: the mcp/ and routes/ trees plus validators.ts. */
export function publicationApiV2EntryLayerFiles(): string[] {
	const files: string[] = [];
	for (const dir of PUBLICATION_API_V2_ENTRY_DIRS) {
		files.push(...walk(join(PUBLICATION_API_V2_SRC, dir), '.ts'));
	}
	for (const file of PUBLICATION_API_V2_ENTRY_FILES) {
		files.push(join(PUBLICATION_API_V2_SRC, file));
	}
	return files.sort();
}

/** Every .ts under the site-builder daemon source tree. */
export function siteBuilderDaemonFiles(): string[] {
	return walk(SITE_BUILDER_SRC, '.ts').sort();
}

/** Every .js of the site-builder tool client. */
export function siteBuilderToolFiles(): string[] {
	return walk(SITE_BUILDER_TOOL_JS, '.js').sort();
}
