/**
 * ============================================================================
 * MEDIA files_info REPAIR SWEEP — CLI shell over
 * src/core/media/files_info_reconcile.ts (the sweep; registered as the
 * `files_info` reconcile — `bun scripts/reconcile.ts run files_info` is the
 * generic door, this shell keeps the record/component narrowing and
 * --allow-shrink).
 * ============================================================================
 *
 * `files_info` inside the `media` jsonb column is a DISK-DERIVED CACHE; a
 * stale index renders nothing although the files are on disk. The sweep's
 * scope, safety rules and adjudication (GROW/DIFF/SHRINK) are documented in
 * the core module. This script owns only what a terminal needs: argv and
 * printing.
 *
 * USAGE (dry-run is the default and prints the full change listing):
 *
 *     bun scripts/media_repair_files_info.ts
 *     bun scripts/media_repair_files_info.ts --section rsc170 --id 1 --component rsc29
 *     bun scripts/media_repair_files_info.ts --apply [--allow-shrink]
 */

// Side-effect: registers the component-model lookup the ontology resolver
// requires (standalone scripts must do what the server entrypoint does).
import '../src/core/components/registry.ts';
import { sweepFilesInfo } from '../src/core/media/files_info_reconcile.ts';

interface Args {
	apply: boolean;
	allowShrink: boolean;
	section: string | null;
	id: number | null;
	component: string | null;
}

function usage(message: string): never {
	console.error(`media_repair_files_info: ${message}`);
	console.error(
		'usage: bun scripts/media_repair_files_info.ts [--section <tipo>] [--id <n>] [--component <tipo>] [--apply] [--allow-shrink]',
	);
	process.exit(1);
}

function parseArgs(argv: string[]): Args {
	const args: Args = { apply: false, allowShrink: false, section: null, id: null, component: null };
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		switch (arg) {
			case '--apply':
				args.apply = true;
				break;
			case '--allow-shrink':
				args.allowShrink = true;
				break;
			case '--section':
				args.section = argv[++index] ?? usage('--section needs a tipo');
				break;
			case '--id': {
				const value = Number(argv[++index]);
				if (!Number.isInteger(value) || value <= 0) usage('--id must be a positive integer');
				args.id = value;
				break;
			}
			case '--component':
				args.component = argv[++index] ?? usage('--component needs a tipo');
				break;
			default:
				usage(`unknown argument '${arg}'`);
		}
	}
	if (args.id !== null && args.section === null) usage('--id requires --section');
	return args;
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	const scope =
		args.section !== null
			? `${args.section}${args.id !== null ? `/${args.id}` : ''}${args.component !== null ? ` ${args.component}` : ''}`
			: 'ALL media components';
	console.log(`media_repair_files_info — mode ${args.apply ? 'APPLY' : 'DRY-RUN'}, scope ${scope}`);

	let summary: Awaited<ReturnType<typeof sweepFilesInfo>>;
	try {
		summary = await sweepFilesInfo({ ...args, log: (line) => console.log(line) });
	} catch (error) {
		usage((error as Error).message);
	}

	console.log(
		`\nroot ${summary.root}; scanned ${summary.scannedRows} record(s) / ${summary.scannedItems} media item(s); stale indexes: ${summary.changes.length}`,
	);
	if (summary.skippedModels.length > 0) {
		console.log(
			`non-media models in the media column (ignored): ${summary.skippedModels.join(', ')}`,
		);
	}
	if (!args.apply) {
		console.log(
			`\nDRY-RUN complete: ${summary.applicable} component(s) would be repaired, ${summary.held} held. Re-run with --apply.`,
		);
		return;
	}
	console.log(`\nrepaired ${summary.repaired} component(s), held ${summary.held}.`);
}

await main();
process.exit(0);
