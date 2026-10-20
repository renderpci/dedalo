/**
 * INSTALLER LAUNCHER — `bun run scripts/install.ts [args]` (npm script
 * `dedalo:install`; install.sh and the production host's engine child run it
 * too). The installer itself is scripts/install_main.ts; usage and exit codes
 * are documented there.
 *
 * ONE JOB: a tree without node_modules is REFUSED with a sentence that says
 * what to do (exit 3, install.sh's refusal code, nothing written), instead of
 * the engine graph dying on `Cannot find package 'zod'` — ESM imports are
 * hoisted, so no installer code could run before that. It never installs:
 * dependencies come from `bun install` (dev quickstart) or install.sh's
 * install_deps (`--frozen-lockfile --production --ignore-scripts`); a
 * production tree gets them from its host steps. A tree with node_modules
 * passes straight through.
 *
 * PACKAGE-FREE: `node:*` imports only, the installer reached through the
 * dynamic import below — a static import of anything else would resolve before
 * the check (gate: test/unit/install_launcher_native.test.ts).
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const TREE = resolve(import.meta.dir, '..');

if (!existsSync(join(TREE, 'node_modules'))) {
	console.error(
		`\n✖ install refused: this checkout has no dependencies (no node_modules). Run \`bun install\` in ${TREE} first (developer quickstart, step 3) — or start the installer with \`sh install.sh\`, which installs them.\n`,
	);
	process.exit(3);
}

await import('./install_main.ts');
