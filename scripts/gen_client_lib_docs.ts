/**
 * gen_client_lib_docs.ts — re-render the generated regions of
 * docs/development/vendored_library_versions.md from package.json +
 * src/core/client_libs/registry.ts.
 *
 *   bun run libs:gen     write the regions in place
 *   bun run libs:check   render, compare with disk, exit 1 on drift
 *
 * The renderer is scripts/lib/client_lib_versions.ts; the byte-identity gate is
 * test/unit/client_lib_versions_doc_tripwire.test.ts.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLIENT_LIBS } from '../src/core/client_libs/registry.ts';
import { DOC_PATH, readPackageJson, renderPage } from './lib/client_lib_versions.ts';

const ROOT = join(import.meta.dir, '..');
const check = process.argv.includes('--check');

const full = join(ROOT, DOC_PATH);
const current = readFileSync(full, 'utf8');
const next = renderPage(current, CLIENT_LIBS, readPackageJson(ROOT));

if (current === next) {
	console.log(`  unchanged  ${DOC_PATH}`);
} else if (check) {
	console.error(`  DRIFT  ${DOC_PATH}\nRun: bun run libs:gen`);
	process.exit(1);
} else {
	writeFileSync(full, next);
	console.log(`  written    ${DOC_PATH}`);
}
