#!/usr/bin/env bun
/**
 * RAG drain CLI (Brick 3) — the entrypoint the PHP `cli/rag_drain.php` never had
 * a TS twin for. Claims ready markers from the matrix-DB `rag_index_queue` and
 * dispatches each to the full-record indexer (embed → upsert into dedalo7_rag).
 *
 * Single-flighted via a Postgres advisory lock, so it is safe to run from cron
 * on every worker. Usage:
 *   bun run src/ai/rag/cli/rag_drain.ts [batch]
 *   bun run src/ai/rag/cli/rag_drain.ts --reconcile <section_tipo> [batch]
 *
 * --reconcile (S2-13): before draining, run indexer.reconcileSection for the
 * given section — presence-drift repair between the matrix and the vector
 * store (matrix-only ids enqueue 'index'; vector-only ids enqueue 'delete').
 * This is the safety net for events dropped during the enqueue-unavailable
 * boot window or produced by out-of-band writes; the ordinary save/delete
 * paths fire their own events (save_component.ts / delete_record.ts).
 */

// S2-20 boot registration: this CLI is its own process — load the component
// registry so the ontology↔components model lookup is registered before any
// model resolution (see core/ontology/resolver.ts seam note).
import '../../../core/components/registry.ts';
import { sql } from '../../../core/db/postgres.ts';
import { getMatrixTableFromTipo } from '../../../core/ontology/resolver.ts';
import { buildRagIndexer } from '../indexer.ts';
import { buildRagQueue, ensureRagQueueTable } from '../queue.ts';
import { isRagEnabled } from '../rag_enabled.ts';

/** Enqueue presence-drift corrections for one section (see module doc). */
async function reconcile(
	queue: ReturnType<typeof buildRagQueue>,
	sectionTipo: string,
): Promise<void> {
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) {
		throw new Error(`[rag] reconcile: no matrix table for section '${sectionTipo}'`);
	}
	const indexer = buildRagIndexer();
	const outcome = await indexer.reconcileSection(
		sectionTipo,
		async () => {
			const rows = (await sql.unsafe(`SELECT section_id FROM "${table}" WHERE section_tipo = $1`, [
				sectionTipo,
			])) as { section_id: number }[];
			return rows.map((row) => Number(row.section_id));
		},
		(locator, op) => queue.enqueue(locator, op),
	);
	console.log(
		`[rag] reconcile ${sectionTipo}: enqueued ${outcome.missing} missing index(es), ${outcome.orphan} orphan delete(s)`,
	);
}

/**
 * The parsed CLI: `[batch]` and `--reconcile <section_tipo>`, or the usage
 * error. Discriminated by `kind`, deliberately NOT the `{ok:false, error}`
 * wire envelope — an internal parse outcome is not an API failure body
 * (error_taxonomy_tripwire B1 ratchets hand-built envelope literals to zero).
 */
export type DrainArguments =
	| { kind: 'run'; batch: number; reconcileSectionTipo: string | null }
	| { kind: 'usage_error'; message: string };

/**
 * Parse the drain CLI's arguments (argv WITHOUT the runtime + script entries).
 * A bare `--reconcile`, or one followed by another flag, is the usage error;
 * a non-numeric batch falls back to 100 (the cron line has always tolerated
 * an empty batch argument).
 */
export function parseDrainArguments(args: readonly string[]): DrainArguments {
	const rest = [...args];
	let reconcileSectionTipo: string | null = null;
	const reconcileFlag = rest.indexOf('--reconcile');
	if (reconcileFlag !== -1) {
		reconcileSectionTipo = rest[reconcileFlag + 1] ?? null;
		if (reconcileSectionTipo === null || reconcileSectionTipo.startsWith('-')) {
			return { kind: 'usage_error', message: '--reconcile requires a <section_tipo> argument' };
		}
		rest.splice(reconcileFlag, 2);
	}
	const batch = Number(rest[0] ?? '100') || 100;
	return { kind: 'run', batch, reconcileSectionTipo };
}

/**
 * The drain CLI body — exit code, never process.exit: the `import.meta.main`
 * block below owns the process, so a test can run this in-process
 * (test/unit/rag_drain_cli_native.test.ts). Order is deliberate: the RAG
 * switch is read BEFORE the arguments, so a disabled install's cron line
 * exits 0 whatever it carries, and the usage error is answered BEFORE any
 * database access.
 */
export async function runRagDrainCli(args: readonly string[]): Promise<number> {
	if (!isRagEnabled()) {
		console.log('[rag] drain: DEDALO_RAG_ENABLED is not set — nothing to do.');
		return 0;
	}
	const parsed = parseDrainArguments(args);
	if (parsed.kind === 'usage_error') {
		console.error(`[rag] drain: ${parsed.message}`);
		return 1;
	}
	await ensureRagQueueTable();
	const queue = buildRagQueue();
	if (parsed.reconcileSectionTipo !== null) {
		await reconcile(queue, parsed.reconcileSectionTipo);
	}
	const result = await queue.drain({ batch: parsed.batch });
	console.log(
		`[rag] drain: ${JSON.stringify(result)}${result.ranSingleFlight ? '' : ' (another worker holds the lock)'}`,
	);
	return 0;
}

// Entry point ONLY when invoked directly (`bun run src/ai/rag/cli/rag_drain.ts`):
// importing this module from a test must execute nothing and exit nothing
// (production_entrypoint_coverage_tripwire).
if (import.meta.main) {
	runRagDrainCli(process.argv.slice(2))
		.then((code) => process.exit(code))
		.catch((error) => {
			console.error('[rag] drain failed:', error);
			process.exit(1);
		});
}
