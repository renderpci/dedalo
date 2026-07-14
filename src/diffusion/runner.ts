/**
 * Diffusion RUNNER — the data-plane process (DIFFUSION_SPEC §4.2).
 *
 * Spawned by the scheduler as `bun run src/diffusion/runner.ts --job <uuid>`
 * (or run by an out-of-machine runner daemon — it only needs Postgres + the
 * publication targets). One process per run: own memory ceiling, crash-
 * isolated from the interactive server, killable. Communicates EXCLUSIVELY
 * through the job row: heartbeat, progress totals, checkpoint, terminal
 * state. Zero runner↔server RPC by design.
 *
 * REAL PIPELINE (stages B→G, spec §4.1): compiled plan → resolvePublication
 * async generator (selection → resolution → transform → projection) → format
 * writer session (schema-ensure once, batched idempotent writes) — with a
 * committed CHECKPOINT after every batch, which is what makes kill -9 +
 * re-queue resume byte-equivalent (P4 keystone gate):
 *   checkpoint = { cursor, run_started_at, processed }
 * `run_started_at` is captured ONCE on the first attempt and reused on
 * resume so the publish_timestamp system field stays deterministic.
 *
 * STUB MODE (spec.options.stub_run === true): the P0 lifecycle harness —
 * deterministic fake batches, no plan, no writes. Kept for the queue/SSE
 * gates (test/unit/diffusion_actions.test.ts); the real client never sends
 * the flag, and a stub run publishes nothing (no dd1758 'published' rows).
 */

import { readEnv } from '../config/env.ts';
// S2-20 boot registration: the runner is its own process — load the component
// registry so the ontology↔components model lookup is registered before plan
// resolution touches component models (see core/ontology/resolver.ts seam note).
import '../core/components/registry.ts';
import { readString } from '../config/readers.ts';
import { closeDatabasePool } from '../core/db/postgres.ts';
import { logDiffusionActivity } from '../core/diffusion_bridge/diffusion_delete.ts';
import {
	checkpointJob,
	finishJob,
	getJobById,
	heartbeatJob,
	isCancelRequested,
	updateJobProgress,
} from './jobs/queue.ts';
import type { DiffusionJobRow } from './jobs/queue.ts';
import { RUNNER_HEARTBEAT_MS } from './jobs/scheduler.ts';

/** Parse --job <uuid> (also tolerates --job=<uuid>). */
function parseJobIdArgument(argv: string[]): string | null {
	const flagIndex = argv.indexOf('--job');
	if (flagIndex !== -1 && argv[flagIndex + 1] !== undefined) return argv[flagIndex + 1] ?? null;
	const inline = argv.find((argument) => argument.startsWith('--job='));
	return inline !== undefined ? inline.slice('--job='.length) : null;
}

/** Cap on error strings persisted to the job row (full detail goes to stderr). */
const MAX_PERSISTED_ERRORS = 50;

// readEnv (not process.env): keeps the ../private/.env half of the config
// precedence chain working in runner processes too (audit S2-21).
const STUB_BATCH_DELAY_MS = Number(readString('DIFFUSION_RUNNER_STUB_DELAY_MS'));

/** The P0 lifecycle stub (see module header). */
async function runStubJob(job: DiffusionJobRow): Promise<void> {
	const jobId = job.job_id;
	const startedAt = Date.now();
	const total = Math.max(1, Math.min(job.spec.estimated_total || 10, 10000));
	const resumeFrom = Number((job.checkpoint as { counter?: unknown }).counter ?? 0) || 0;
	for (let counter = resumeFrom + 1; counter <= total; counter++) {
		if (await isCancelRequested(jobId)) {
			await finishJob(jobId, 'cancelled', { result: false, msg: 'Process cancelled by user' });
			return;
		}
		await Bun.sleep(STUB_BATCH_DELAY_MS);
		await updateJobProgress(jobId, {
			counter,
			msg: `Processing records ${counter} of ${total}...`,
			current: { section_id: counter, time: STUB_BATCH_DELAY_MS },
			total_ms: Date.now() - startedAt,
		});
		await checkpointJob(jobId, { counter });
	}
	await finishJob(jobId, 'completed', { result: true, msg: 'OK. Request done', tables: [] });
}

/** The real publication pipeline. */
async function runPublicationJob(job: DiffusionJobRow): Promise<void> {
	const jobId = job.job_id;
	const startedAt = Date.now();

	// Lazy imports keep the stub path (and the scheduler's spawn) light.
	const { getCompiledPlan } = await import('./plan/cache.ts');
	const { getDiffusionWriter } = await import('./writers/registry.ts');
	const { resolvePublication } = await import('./resolve/resolver.ts');

	const plan = await getCompiledPlan(job.spec.diffusion_element_tipo);
	const writer = getDiffusionWriter(plan.format);
	const session = await writer.open(plan);

	const checkpoint = job.checkpoint as {
		cursor?: unknown;
		run_started_at?: unknown;
		processed?: unknown;
	};
	// Deterministic across resumes: the publish timestamp is the FIRST
	// attempt's start, persisted in the checkpoint (never re-stamped).
	const runStartedAt = Number(checkpoint.run_started_at) || Math.floor(startedAt / 1000);
	const afterSectionId = Number(checkpoint.cursor) || 0;
	let processed = Number(checkpoint.processed) || 0;
	const errors: string[] = [];
	const trackError = (message: string): void => {
		if (errors.length < MAX_PERSISTED_ERRORS) errors.push(message);
		console.error(`[diffusion runner] ${message}`);
	};

	try {
		// Schema first, serialized, OUTSIDE any row transaction (DDL commits).
		await session.ensureSchema();

		const options = job.spec.options as {
			levels?: unknown;
			skip_publication_state_check?: unknown;
		};
		// DIFF-01: re-derive the enqueuing principal so the primary selection honors
		// their projects filter (a non-admin publishes only in-scope records). Only
		// a concrete user (real id, or superuser -1 = unscoped) is resolved; a
		// system/unknown owner (id <= 0 and not -1) stays unscoped as before.
		const { resolvePrincipal } = await import('../core/security/permissions.ts');
		const ownerId = job.owner_user_id;
		const ownerPrincipal =
			ownerId === -1 || ownerId > 0 ? await resolvePrincipal(ownerId) : undefined;
		const batches = resolvePublication(plan, {
			sectionTipo: job.spec.section_tipo,
			// Sanitized at enqueue (sanitizeClientSqo) — stored as plain jsonb,
			// re-typed here for the resolver's Sqo signature.
			sqo: job.spec.sqo as Parameters<typeof resolvePublication>[1]['sqo'],
			runStartedAt,
			afterSectionId,
			skipPublicationStateCheck: options.skip_publication_state_check === true,
			maxLevels: Number(options.levels) > 0 ? Number(options.levels) : undefined,
			principal: ownerPrincipal,
		});

		for await (const batch of batches) {
			if (await isCancelRequested(jobId)) {
				// Everything committed so far stays published (idempotent re-run
				// completes the rest); close() finalizes the partial summary.
				const partial = await session.close();
				await finishJob(jobId, 'cancelled', {
					result: false,
					msg: 'Process cancelled by user',
					tables: partial.tables,
				});
				return;
			}

			if (batch.rows.length > 0) {
				await session.writeRows(batch.section, batch.rows);
			}
			if (batch.unpublishIds.length > 0) {
				await session.removeRecords(batch.section, batch.unpublishIds);
			}
			for (const fieldError of batch.errors) {
				trackError(
					`${fieldError.sectionTipo}:${fieldError.sectionId} ${fieldError.columnName}: ${fieldError.message}`,
				);
			}

			// dd1758 publication ledger: one 'published' row per PRIMARY record
			// per element (PHP diffusion_activity_logger convention; linked
			// frontier records ride their primary's trail).
			if (batch.section.sectionTipo === job.spec.section_tipo) {
				for (const record of batch.records) {
					if (record.status !== 'publish') continue;
					await logDiffusionActivity({
						sectionTipo: record.sectionTipo,
						sectionId: Number(record.sectionId),
						elementTipo: job.spec.diffusion_element_tipo,
						action: 1, // published
						userId: job.owner_user_id,
					}).catch((error) =>
						console.error('[diffusion runner] dd1758 log failed (non-fatal):', error),
					);
				}
				processed += batch.records.length;
			}

			const lastRecord = batch.records[batch.records.length - 1];
			await updateJobProgress(jobId, {
				counter: processed,
				msg: `Processing records ${processed}${job.spec.estimated_total > 0 ? ` of ${job.spec.estimated_total}` : ''}...`,
				current: { section_id: lastRecord?.sectionId, time: Date.now() - startedAt },
				total_ms: Date.now() - startedAt,
			});
			// COMMITTED checkpoint — the resume point (batch writes are already
			// durable in the target; re-running this batch is an idempotent upsert).
			await checkpointJob(jobId, {
				cursor: batch.cursor,
				run_started_at: runStartedAt,
				processed,
			});
		}

		const summary = await session.close();
		const allErrors = [...errors, ...summary.errors];

		// File runs: writers append consolidated artifacts as prefixed
		// zero-count table entries (see writers/rdf.ts CONSOLIDATED_* docs) —
		// lift them into the client result fields the final SSE chunk renders
		// (consolidated_files / diffusion_data, old engine index.ts:529-563;
		// projected by jobs/sse.ts progressDataFromJob finish-parity).
		let tables = summary.tables;
		let fileResultFields: Record<string, unknown> = {};
		if (plan.target.kind === 'files') {
			const { config } = await import('../config/config.ts');
			const mediaUrl = `/dedalo/${config.mediaDir}`;
			const consolidated: { merged_url?: string; zip_url?: string } = {};
			tables = [];
			for (const entry of summary.tables) {
				if (entry.table_name.startsWith('consolidated_merged:')) {
					consolidated.merged_url =
						mediaUrl + entry.table_name.slice('consolidated_merged:'.length);
				} else if (entry.table_name.startsWith('consolidated_zip:')) {
					consolidated.zip_url = mediaUrl + entry.table_name.slice('consolidated_zip:'.length);
				} else {
					tables.push(entry);
				}
			}
			if (consolidated.merged_url !== undefined || consolidated.zip_url !== undefined) {
				fileResultFields = {
					consolidated_files: consolidated,
					diffusion_data: [consolidated.merged_url, consolidated.zip_url]
						.filter((url): url is string => url !== undefined)
						.map((url) => ({ file_url: url })),
					diffusion_class: `diffusion_${plan.format}`,
				};
			}
		}

		await finishJob(jobId, 'completed', {
			result: allErrors.length === 0,
			msg:
				allErrors.length === 0
					? 'OK. Request done'
					: `Partial success: ${allErrors.length} error(s) — see errors`,
			tables,
			errors: allErrors.slice(0, MAX_PERSISTED_ERRORS),
			...fileResultFields,
		});
	} catch (error) {
		await session.abort().catch(() => {});
		throw error;
	}
}

async function runJob(jobId: string): Promise<void> {
	const job = await getJobById(jobId);
	if (job === null) {
		console.error(`[diffusion runner] job not found: ${jobId}`);
		return;
	}
	if (job.state !== 'running') {
		// Claimed state is a precondition — the scheduler transitions it. A
		// re-spawn on an already-terminal job is a no-op (idempotent restart).
		console.error(`[diffusion runner] job ${jobId} not in running state (${job.state})`);
		return;
	}

	// A missed heartbeat is non-fatal (the sweeper heals on staleness) but a
	// floating rejection kills the runner process outright (S1-15) — catch it.
	const heartbeat = setInterval(
		() =>
			void heartbeatJob(jobId).catch((error) =>
				console.error('[diffusion runner] heartbeat failed:', error),
			),
		RUNNER_HEARTBEAT_MS,
	);
	try {
		if ((job.spec.options as { stub_run?: unknown }).stub_run === true) {
			await runStubJob(job);
		} else {
			await runPublicationJob(job);
		}
	} catch (error) {
		await finishJob(jobId, 'failed', {
			result: false,
			msg: `Error. Diffusion run failed: ${error instanceof Error ? error.message : String(error)}`,
		});
	} finally {
		clearInterval(heartbeat);
	}
}

if (import.meta.main) {
	const jobId = parseJobIdArgument(process.argv);
	if (jobId === null) {
		console.error('Usage: bun run src/diffusion/runner.ts --job <uuid>');
		process.exit(2);
	}
	// SIGTERM (cancel_process on this host / systemd stop): exit promptly; the
	// job row keeps its checkpoint, and the sweeper or cancel flag settles state.
	process.on('SIGTERM', () => process.exit(143));
	await runJob(jobId);
	await closeDatabasePool();
	process.exit(0);
}

/** Exported for the end-to-end publish gate (drives a job in-process). */
export { runJob };
