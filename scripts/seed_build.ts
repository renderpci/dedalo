/**
 * Compile the install seed from the repository sources (src/core/install/seed_build.ts).
 *
 *   bun run seed:build                 → install/db/dedalo_install.pgsql.gz + its manifest
 *   bun run seed:build --out <file>    → <file> + <file>.manifest.json (a trial compile)
 *
 * The same compiler the maintenance widget's "Build install version" runs. It
 * needs a Postgres cluster and a user with CREATEDB (the configured connection's
 * host/port/user/password); it reads no installation's database.
 */

import { resolve } from 'node:path';
import { isDedaloError } from '../src/core/errors/index.ts';
import { buildInstallVersion } from '../src/core/install/seed_build.ts';

const outFlag = process.argv.indexOf('--out');
const outFile = outFlag === -1 ? undefined : process.argv[outFlag + 1];
if (outFlag !== -1 && outFile === undefined) {
	console.error('usage: bun run seed:build [--out <file>]');
	process.exit(2);
}

try {
	const result = await buildInstallVersion(
		outFile === undefined ? {} : { outFile: resolve(outFile) },
	);
	for (const step of result.steps) console.log(`  ${step}`);
	for (const finding of result.findings) console.log(`  ! ${finding}`);
	console.log(`${result.msg} (${result.file_size})`);
	process.exit(0);
} catch (error) {
	if (!isDedaloError(error)) throw error;
	const readout = (error.extend ?? {}) as { steps?: string[]; findings?: string[] };
	for (const step of readout.steps ?? []) console.log(`  ${step}`);
	for (const finding of readout.findings ?? []) console.log(`  ! ${finding}`);
	console.error(error.publicMessage ?? error.code);
	process.exit(1);
}
