/**
 * ============================================================================
 * ARCHIVE — CLI shell over core/archive/ (extract.ts / restore.ts): the ONE
 * complete, self-describing, verified extraction of a section set, and its
 * reconstruction (audit 2026-08-26 P1-10). Format: engineering/ARCHIVE_FORMAT.md.
 * ============================================================================
 *
 * USAGE
 *
 *     bun scripts/archive.ts extract --sections <tipo,tipo,…> --out <dir>
 *     bun scripts/archive.ts verify  --archive <dir>
 *     bun scripts/archive.ts restore --archive <dir> --user-id <n>
 *                                    [--allow-external]
 *                                    [--on-existing-record refuse|overwrite]
 *                                    [--on-ontology-conflict refuse|overwrite]
 *                                    [--on-existing-media refuse|overwrite]
 *
 * `extract` reads the database and writes ONLY under `--out` (which must not
 * exist). `verify` touches nothing. `restore` refuses — with nothing written —
 * on any digest mismatch, on a locator that resolves neither to an archived
 * record nor to a record this database holds, on a record or ontology node that
 * already exists here, unless the matching flag says otherwise. The archive is a
 * DIRECTORY: tar it yourself for transport (`tar -C <out>/.. -cf x.tar <name>`).
 *
 * The user id on `restore` is the actor stamped on the one whole-record audit
 * row each restored record receives (the delete door's shape).
 */

import { extractArchive } from '../src/core/archive/extract.ts';
import { restoreArchive, verifyArchive } from '../src/core/archive/restore.ts';

function argValue(flag: string): string | null {
	const index = process.argv.indexOf(flag);
	return index !== -1 ? (process.argv[index + 1] ?? null) : null;
}

function choice(flag: string): 'refuse' | 'overwrite' | undefined {
	const value = argValue(flag);
	if (value === null) return undefined;
	if (value !== 'refuse' && value !== 'overwrite') usage(`${flag} takes refuse|overwrite`);
	return value;
}

function usage(reason?: string): never {
	if (reason !== undefined) console.error(`archive: ${reason}`);
	console.error(
		'usage: bun scripts/archive.ts extract --sections <a,b> --out <dir> | verify --archive <dir> | restore --archive <dir> --user-id <n> [--allow-external] [--on-existing-record …] [--on-ontology-conflict …] [--on-existing-media …]',
	);
	process.exit(2);
}

const command = process.argv[2];
try {
	switch (command) {
		case 'extract': {
			const sections = argValue('--sections');
			const out = argValue('--out');
			if (sections === null || out === null) usage('extract needs --sections and --out');
			const outcome = await extractArchive({
				sectionTipos: sections
					.split(',')
					.map((s) => s.trim())
					.filter((s) => s !== ''),
				outDir: out,
			});
			const m = outcome.manifest;
			console.log(
				`extracted ${m.sections.length} section(s), ${m.sections.reduce((n, s) => n + s.record_count, 0)} record(s), ${m.ontology.subtree_count} ontology node(s), ${m.media.file_count} media file(s); ${m.references.internal} internal locator(s), ${m.references.external.length} external address(es) → ${outcome.outDir}`,
			);
			break;
		}
		case 'verify': {
			const dir = argValue('--archive');
			if (dir === null) usage('verify needs --archive');
			const m = verifyArchive(dir);
			console.log(
				`ok: ${m.format} v${m.format_version} from engine ${m.engine_version}, ${m.sections.length} section(s), ${m.media.file_count} media file(s), every digest matches`,
			);
			break;
		}
		case 'restore': {
			const dir = argValue('--archive');
			const userId = Number(argValue('--user-id'));
			if (dir === null || !Number.isInteger(userId)) usage('restore needs --archive and --user-id');
			const outcome = await restoreArchive({
				archiveDir: dir,
				userId,
				allowExternal: process.argv.includes('--allow-external'),
				onExistingRecord: choice('--on-existing-record'),
				onOntologyConflict: choice('--on-ontology-conflict'),
				onExistingMedia: choice('--on-existing-media'),
			});
			console.log(JSON.stringify({ ...outcome, manifest: undefined }, null, 2));
			break;
		}
		default:
			usage(command === undefined ? undefined : `unknown command '${command}'`);
	}
	process.exit(0);
} catch (error) {
	console.error((error as Error).message);
	process.exit(1);
}
