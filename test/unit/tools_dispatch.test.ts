/**
 * THE DISPATCH GATE CHAIN (src/core/tools/dispatch.ts, engineering/TOOLS_SPEC.md
 * §"Dispatch gate chain") — one test per gate, each written so that DELETING its
 * gate makes THIS test fail (DEC-12: an invariant with no mechanical gate rots).
 *
 * The chain is the most security-relevant path in the subsystem, so the tests
 * are deliberately DISCRIMINATING rather than merely negative: every gate
 * REFUSES BY THROWING a registered DedaloError (envelope v2, ERRORS_SPEC §4),
 * and every case asserts the CODE of the gate under test, which differs from
 * the code the NEXT gate would produce for the same input. A test that only
 * asserted "it threw" would stay green with the gate removed, because a later
 * gate would refuse the same request for a different reason.
 *
 *   1. options must be an object            → request.invalid_options
 *   2. tool name matches ^tool_[a-z0-9_]+$  → tool.invalid_name  (checked with a
 *      NON-ADMIN caller: gates 3+4 would answer tool.not_authorized for the same
 *      input, so the two are distinguishable)
 *   3. the tool is ACTIVE in dd1324         → tool.invalid_name (admin; scratch INACTIVE row)
 *   4. the tool is authorized for the user  → tool.not_authorized
 *   5. the tool has a loaded server module  → tool.no_server_module (scratch ACTIVE row)
 *   6. the method is in apiActions          → tool.method_not_allowed
 *   7. the permission gate — BEFORE the background fork. THE critical one: a
 *      denial AFTER a fork is invisible to the caller, so a background request
 *      that fails its permission must come back as the DENIAL, never as a job id.
 *      (security.ts still answers legacy tokens: `invalid_request` →
 *      request.invalid, `unauthorized` → perm.denied.)
 *   8. execute / backgroundRunnable         → 'background_not_allowed', else a job.
 *
 * DB-backed: gates 3 and 5 need registry rows the loader cannot resolve to a
 * module, so this seeds its OWN scratch dd1324 rows (reserved zz-prefixed names,
 * deleted in afterAll) instead of depending on which tools an install registered.
 * Hermetic: DEDALO_MEDIA_PROCESSES_DIR points at a temp dir (set BEFORE the module
 * graph loads) so the gate-8 job's pfile mirror never touches ../private/processes.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const scratchDir = mkdtempSync(join(tmpdir(), 'dedalo_tools_dispatch_'));
const previousProcessesDir = process.env.DEDALO_MEDIA_PROCESSES_DIR;
process.env.DEDALO_MEDIA_PROCESSES_DIR = scratchDir;

// Import AFTER the env override so every processesDir() call lands in scratch.
const { dispatchToolRequest } = await import('../../src/core/tools/dispatch.ts');
const { listBackgroundJobs, resetBackgroundJobs, getBackgroundJob } = await import(
	'../../src/core/tools/background.ts'
);

import { encodeForJsonb } from '../../src/core/db/json_codec.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { invalidateAllToolCaches } from '../../src/core/tools/cache.ts';
import {
	DD64_SECTION_TIPO,
	TIPO,
	TOOLS_REGISTER_SECTION_TIPO,
} from '../../src/core/tools/ontology_map.ts';

const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
/** A user with no profile: gates 3+4 grant only the always_active set. */
const PLAIN_USER: Principal = { userId: 999_999, isGlobalAdmin: false, isDeveloper: false };

/** The exemplar module — loaded, and ACTIVE in every seeded registry. */
const TEMPLATE = 'tool_dev_template';

/**
 * Two scratch registry rows with NO directory on disk (so the loader can never
 * resolve a module for them): one ACTIVE (isolates gate 5) and one INACTIVE
 * (isolates gate 3 — without the ACTIVE filter it would fall through to gate 5
 * and answer with gate 5's message instead).
 */
const SCRATCH_ACTIVE = 'tool_zz_dispatch_active';
const SCRATCH_INACTIVE = 'tool_zz_dispatch_inactive';
const SCRATCH_IDS = { [SCRATCH_ACTIVE]: 999_711, [SCRATCH_INACTIVE]: 999_712 } as const;

async function cleanScratch(): Promise<void> {
	for (const sectionId of Object.values(SCRATCH_IDS)) {
		await sql`
			DELETE FROM matrix_tools
			WHERE section_tipo = ${TOOLS_REGISTER_SECTION_TIPO} AND section_id = ${sectionId}
		`;
	}
}

async function seedScratchTool(name: string, active: boolean): Promise<void> {
	// $3/$4 need the ::text::jsonb cast — a bare bind lands as a jsonb STRING
	// scalar, not an object (matrix_write.ts uses the same cast for this reason).
	await sql.unsafe(
		`INSERT INTO matrix_tools (section_tipo, section_id, string, relation)
		 VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb)`,
		[
			TOOLS_REGISTER_SECTION_TIPO,
			SCRATCH_IDS[name as keyof typeof SCRATCH_IDS],
			encodeForJsonb({ [TIPO.NAME]: [{ id: 1, value: name }] }),
			encodeForJsonb({
				[TIPO.ACTIVE]: [
					{
						id: 1,
						type: 'dd151',
						section_id: active ? '1' : '2',
						section_tipo: DD64_SECTION_TIPO,
						from_component_tipo: TIPO.ACTIVE,
					},
				],
			}),
		],
	);
}

beforeAll(async () => {
	await cleanScratch();
	await seedScratchTool(SCRATCH_ACTIVE, true);
	await seedScratchTool(SCRATCH_INACTIVE, false);
	// These rows are seeded with RAW SQL, so they bypass the write chokepoint
	// that would normally fire the save event — exactly like the registry's own
	// writeRegistryRecord path, which is why importTools invalidates for itself.
	// The active-registry rows are cached (registry.ts activeToolRowsCache), and
	// a suite that ran earlier in this process may already have warmed it, so
	// without this the scratch tools are invisible to every gate below.
	invalidateAllToolCaches();
	resetBackgroundJobs();
});

afterAll(async () => {
	await cleanScratch();
	// …and drop them again, so a later suite never sees these ghost tools.
	invalidateAllToolCaches();
	resetBackgroundJobs();
	if (previousProcessesDir === undefined) {
		// assigning undefined coerces to the STRING "undefined"
		delete process.env.DEDALO_MEDIA_PROCESSES_DIR;
	} else {
		process.env.DEDALO_MEDIA_PROCESSES_DIR = previousProcessesDir;
	}
	rmSync(scratchDir, { recursive: true, force: true });
});

/** The thrown refusal of a gate — the DedaloError, or a failure if it resolved. */
async function refusal(pending: Promise<unknown>): Promise<DedaloError> {
	try {
		const resolved = await pending;
		throw new Error(`expected a thrown refusal, got ${JSON.stringify(resolved)}`);
	} catch (error) {
		if (error instanceof DedaloError) return error;
		throw error;
	}
}

/** `code | publicMessage` — one comparable string. */
function why(error: DedaloError): string {
	return `${error.code} | ${error.publicMessage ?? ''}`;
}

describe('gate 1 — options must be an object', () => {
	test('a non-object options is refused before the action ever runs', async () => {
		// tool_dev_template.status has permission null and returns {ok:true}: with
		// gate 1 removed this request SUCCEEDS, so the assertion is discriminating.
		const error = await refusal(
			dispatchToolRequest(SUPERUSER, -1, { model: TEMPLATE, action: 'status' }, 'not-an-object'),
		);
		expect(error.code).toBe('request.invalid_options');
		expect(error.publicMessage).toBe('Invalid options type');
	});

	test('an array and a number are refused too (typeof null/array traps)', async () => {
		for (const options of [42, 'x', true] as unknown[]) {
			const error = await refusal(
				dispatchToolRequest(SUPERUSER, -1, { model: TEMPLATE, action: 'status' }, options),
			);
			expect(error.code).toBe('request.invalid_options');
		}
		// undefined is the "no options" case and must still pass.
		const none = await dispatchToolRequest(
			SUPERUSER,
			-1,
			{ model: TEMPLATE, action: 'status' },
			undefined,
		);
		expect(none.data).toEqual({ tool: TEMPLATE });
	});
});

describe('gate 2 — strict tool-name shape, before ANY lookup', () => {
	/**
	 * Asserted with a NON-ADMIN caller on purpose. For an admin, gates 3+4 answer
	 * an unknown tool with the SAME 'Invalid tool name' string, so an admin-based
	 * test would stay green with gate 2 deleted. A non-admin's gates 3+4 answer
	 * 'Tool not authorized for current user' instead — the two are distinguishable.
	 */
	test.each([
		'../../etc/passwd',
		'tools/../tool_export',
		'tool_Export',
		'tool-export',
		'notatool',
		'tool_',
		'',
	])('refuses %p at gate 2, not at gates 3+4', async (name) => {
		const error = await refusal(
			dispatchToolRequest(PLAIN_USER, PLAIN_USER.userId, { model: name, action: 'status' }, {}),
		);
		expect(error.code).toBe('tool.invalid_name');
		expect(why(error)).not.toContain('not_authorized');
	});

	test('a non-string model is refused as an empty name', async () => {
		const error = await refusal(
			dispatchToolRequest(SUPERUSER, -1, { model: { evil: true }, action: 'status' }, {}),
		);
		expect(error.code).toBe('tool.invalid_name');
	});
});

describe('gate 3 — the tool must be ACTIVE in dd1324', () => {
	test('an INACTIVE registered tool is refused before the module lookup', async () => {
		// The scratch rows are identical except for dd1354. The ACTIVE twin reaches
		// gate 5 ('tool has no server module'); this one must not.
		const error = await refusal(
			dispatchToolRequest(SUPERUSER, -1, { model: SCRATCH_INACTIVE, action: 'status' }, {}),
		);
		expect(error.code).toBe('tool.invalid_name');
		expect(error.code).not.toBe('tool.no_server_module');
	});
});

describe('gate 4 — the tool must be authorized for the caller', () => {
	test('a user with no profile grant is refused a real, active, loadable tool', async () => {
		const error = await refusal(
			dispatchToolRequest(PLAIN_USER, PLAIN_USER.userId, { model: TEMPLATE, action: 'status' }, {}),
		);
		expect(error.code).toBe('tool.not_authorized');
	});

	test('the same request succeeds for a global admin (the gate is the GRANT, not the tool)', async () => {
		const response = await dispatchToolRequest(
			SUPERUSER,
			-1,
			{ model: TEMPLATE, action: 'status' },
			{},
		);
		expect(response.data).toEqual({ tool: TEMPLATE });
	});
});

describe('gate 5 — the tool must have a loaded server module', () => {
	test('an ACTIVE registry row with no package on disk is refused as module-less', async () => {
		const error = await refusal(
			dispatchToolRequest(SUPERUSER, -1, { model: SCRATCH_ACTIVE, action: 'status' }, {}),
		);
		expect(error.code).toBe('tool.no_server_module');
	});
});

describe('gate 6 — the method must be in apiActions', () => {
	test('an unlisted method on a loaded tool is refused', async () => {
		const error = await refusal(
			dispatchToolRequest(SUPERUSER, -1, { model: TEMPLATE, action: 'not_a_method' }, {}),
		);
		expect(error.code).toBe('tool.method_not_allowed');
		expect(error.details).toEqual({ method: 'not_a_method' });
	});

	test('inherited Object properties are not actions', async () => {
		for (const action of ['toString', 'constructor', 'hasOwnProperty', '__proto__']) {
			const error = await refusal(
				dispatchToolRequest(SUPERUSER, -1, { model: TEMPLATE, action }, {}),
			);
			expect(error.code).toBe('tool.method_not_allowed');
		}
	});
});

/**
 * GATE 7 — the declarative permission gate, and the ORDER invariant that makes it
 * meaningful: it must run BEFORE the background fork. A background request answers
 * immediately with a job handle; if the permission check happened inside the forked
 * work, its denial would land on a job frame nobody is required to read, and the
 * caller would see a successful launch. PHP's invariant, kept here.
 */
describe('gate 7 — the permission gate, BEFORE the background fork', () => {
	test('a foreground request with an invalid permission target is denied', async () => {
		const error = await refusal(
			dispatchToolRequest(
				SUPERUSER,
				-1,
				{ model: TEMPLATE, action: 'long_job' }, // permission 'section', minLevel 2
				{ section_tipo: 'not-a-tipo' },
			),
		);
		expect(error.code).toBe('request.invalid');
		expect(error.publicMessage).toContain('invalid section target');
	});

	test('a BACKGROUND request that fails its permission comes back as the DENIAL, not a job', async () => {
		resetBackgroundJobs();
		const error = await refusal(
			dispatchToolRequest(
				SUPERUSER,
				-1,
				{ model: TEMPLATE, action: 'long_job' },
				{ background_running: true, section_tipo: 'not-a-tipo' },
			),
		);
		expect(error.publicMessage).toContain('invalid section target');
		// THE assertion: it THREW — no handle was minted, so nothing was forked.
		expect(error.extend).toBeUndefined();
		// …and the job registry never saw it (a fork that ran and then denied
		// would leave a record here).
		expect(listBackgroundJobs(TEMPLATE, -1, true)).toHaveLength(0);
	});

	test('gate 7 outranks gate 8: a permission failure beats background_not_allowed', async () => {
		// read_demo has permission 'tipo' and is NOT in backgroundRunnable. With the
		// gates in order the answer is the PERMISSION denial; if the permission check
		// had slipped behind the fork decision it would be 'background_not_allowed'.
		const error = await refusal(
			dispatchToolRequest(
				SUPERUSER,
				-1,
				{ model: TEMPLATE, action: 'read_demo' },
				{ background_running: true, section_tipo: 'test3' }, // no `tipo` → gate 7 denies
			),
		);
		expect(error.publicMessage).toContain('invalid permission target');
		expect(error.code).not.toBe('tool.background_not_allowed');
	});

	test('a permission that PASSES reaches the handler', async () => {
		const response = await dispatchToolRequest(
			SUPERUSER,
			-1,
			{ model: TEMPLATE, action: 'read_demo' },
			{ section_tipo: 'test3', tipo: 'test65' },
		);
		expect(response.result).toEqual({ section_tipo: 'test3', tipo: 'test65', read: true });
	});
});

/**
 * GATE 7, the 'section_list' kind — a BATCH action whose section targets ride
 * INSIDE the payload (the CSV import posts files[], one section_tipo per file).
 * Three properties define it, and all three are asserted THROUGH THE DISPATCHER
 * rather than only against assertActionPermission: the entire reason the target
 * extractor lives on the SPEC is that it must run at gate 7, ahead of the fork.
 *
 *   - `sectionTipos(options)` is what the batch means — nothing else is gated;
 *   - `minLevel` is asserted on EVERY entry, so one bad entry denies the batch;
 *   - an EMPTY list is a DENIAL, never a vacuous pass ("nothing to check" must
 *     not read as "everything is authorized").
 */
describe("gate 7 — the 'section_list' batch kind", () => {
	const BATCH = { model: TEMPLATE, action: 'batch_demo' };

	test('a batch whose every target clears minLevel reaches the handler', async () => {
		const response = await dispatchToolRequest(SUPERUSER, -1, BATCH, {
			items: [{ section_tipo: 'test3' }, { section_tipo: 'test3' }],
		});
		expect(response.result).toEqual({ batch: 2, gated: true });
	});

	test('an EMPTY batch is a denial, not a vacuous pass', async () => {
		for (const options of [{}, { items: [] }, { items: 'not-an-array' }]) {
			const error = await refusal(dispatchToolRequest(SUPERUSER, -1, BATCH, options));
			expect(error.publicMessage).toContain('invalid section target');
		}
	});

	test('ONE invalid entry denies the WHOLE batch (the loop is not short-circuited)', async () => {
		for (const items of [
			[{ section_tipo: 'test3' }, {}], // second entry carries no target
			[{ section_tipo: 'test3' }, { section_tipo: 'not-a-tipo' }],
			[{ section_tipo: 'test3' }, { section_tipo: '../../etc/passwd' }],
			[{ section_tipo: 'test3' }, { section_tipo: null }],
		]) {
			const error = await refusal(dispatchToolRequest(SUPERUSER, -1, BATCH, { items }));
			expect({ items, code: error.code }).toEqual({ items, code: 'request.invalid' });
		}
	});

	test('the batch gate runs BEFORE the fork decision (gate 7 outranks gate 8)', async () => {
		// batch_demo is NOT in backgroundRunnable. A denied batch must answer with
		// the PERMISSION failure; 'background_not_allowed' here would mean gate 8
		// had overtaken gate 7 — and a denial after a fork is invisible to the caller.
		resetBackgroundJobs();
		const error = await refusal(
			dispatchToolRequest(SUPERUSER, -1, BATCH, { background_running: true, items: [] }),
		);
		expect(error.publicMessage).toContain('invalid section target');
		expect(error.code).not.toBe('tool.background_not_allowed');
		expect(listBackgroundJobs(TEMPLATE, -1, true)).toHaveLength(0);
	});
});

describe('gate 8 — execute, or fork behind the backgroundRunnable allowlist', () => {
	test('an action absent from backgroundRunnable is refused a fork', async () => {
		resetBackgroundJobs();
		// Envelope v2: the refusal THROWS the registered code (the chokepoint
		// converts it); the legacy `errors:['background_not_allowed']` token is gone.
		const error = await refusal(
			dispatchToolRequest(
				SUPERUSER,
				-1,
				{ model: TEMPLATE, action: 'status' }, // permission null → gate 7 passes
				{ background_running: true },
			),
		);
		expect(error.code).toBe('tool.background_not_allowed');
		expect(listBackgroundJobs(TEMPLATE, -1, true)).toHaveLength(0);
	});

	test('an allowed action forks and answers with the job handle', async () => {
		resetBackgroundJobs();
		const response = await dispatchToolRequest(
			SUPERUSER,
			-1,
			{ model: TEMPLATE, action: 'long_job' },
			{ background_running: true, section_tipo: 'test3' },
		);
		expect(response.result).toBe(true);
		const jobId = response.job_id as string;
		expect(typeof jobId).toBe('string');
		expect(response.background_job_id).toBe(jobId);
		expect(response.pfile).toBe(`${jobId}.json`);

		await new Promise((resolve) => setTimeout(resolve, 30));
		const job = getBackgroundJob(jobId);
		expect(job?.status).toBe('done');
		// The handler saw background:true — it really ran under the executor.
		expect((job?.result?.result as { ran_in_background?: boolean })?.ran_in_background).toBe(true);
	});

	test('without background_running the same action runs synchronously', async () => {
		const response = await dispatchToolRequest(
			SUPERUSER,
			-1,
			{ model: TEMPLATE, action: 'long_job' },
			{ section_tipo: 'test3' },
		);
		expect(response.result).toMatchObject({ started: true, ran_in_background: false });
		expect(response.job_id).toBeUndefined();
	});

	test('background_running must be the BOOLEAN true (a truthy string does not fork)', async () => {
		resetBackgroundJobs();
		const response = await dispatchToolRequest(
			SUPERUSER,
			-1,
			{ model: TEMPLATE, action: 'long_job' },
			{ background_running: 'true', section_tipo: 'test3' },
		);
		expect(response.result).toMatchObject({ started: true, ran_in_background: false });
		expect(listBackgroundJobs(TEMPLATE, -1, true)).toHaveLength(0);
	});
});

/**
 * The two RESERVED framework actions are answered by the dispatcher itself, AFTER
 * gates 3+4 and BEFORE the module lookup (gate 5) — so a module-less tool still
 * gets the wire, and a module can never shadow the name. (Their payload semantics
 * are gated in test/unit/tool_job_status.test.ts.)
 */
describe('reserved framework actions sit between gate 4 and gate 5', () => {
	test('an unauthorized caller is still refused them (they are behind gates 3+4)', async () => {
		const error = await refusal(
			dispatchToolRequest(
				PLAIN_USER,
				PLAIN_USER.userId,
				{ model: TEMPLATE, action: 'get_background_jobs' },
				{},
			),
		);
		expect(error.code).toBe('tool.not_authorized');
	});

	test('a tool with NO server module still answers them (they precede gate 5)', async () => {
		const response = await dispatchToolRequest(
			SUPERUSER,
			-1,
			{ model: SCRATCH_ACTIVE, action: 'get_background_jobs' },
			{},
		);
		// Envelope v2 (`ok(data)`): `data` is the job list; `result` is only the
		// bounded compat mirror and there is no `msg` prose channel.
		expect(response.ok).toBe(true);
		expect(response.data).toEqual([]);
	});
});
