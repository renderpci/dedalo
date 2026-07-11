/**
 * Gate: the agent write harness — images through the provider seam and the
 * propose→confirm→apply change-plan protocol (Phase 4 of the work-system MCP
 * foundation). Fully OFFLINE via the scripted provider; DB writes only on the
 * scratch section (test2 → matrix_test) and removed afterwards.
 *
 * The load-bearing assertions:
 *   - a valid proposal ENDS the turn with a validated plan and ZERO writes;
 *   - an invalid proposal returns to the model as is_error (loop continues);
 *   - the hash pins what the human confirmed (mutation ⇒ plan_hash_mismatch);
 *   - apply executes ops sequentially THROUGH the registry handlers with
 *     {ref} chaining, and reports partial failure precisely;
 *   - image entries map to Messages-API image blocks (pure toMessages).
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { toMessages } from '../../src/ai/agent/anthropic_provider.ts';
import {
	applyChangePlan,
	hashChangePlan,
	validateChangePlan,
} from '../../src/ai/agent/change_plan.ts';
import type {
	AgentAssistantTurn,
	AgentLlmProvider,
	AgentTranscriptEntry,
} from '../../src/ai/agent/llm_provider.ts';
import { runAgent } from '../../src/ai/agent/loop.ts';
import { ToolError } from '../../src/ai/mcp/envelope.ts';
import { sql } from '../../src/core/db/postgres.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
/** Non-admin scoped principal (the only kind write surfaces accept). */
const SCOPED: Principal = { userId: 16, isGlobalAdmin: false, isDeveloper: false };

const SCRATCH_SECTION = 'test2';
const SCRATCH_TABLE = 'matrix_test';
const TEXT_FIELD = 'numisdata16';

const createdIds: number[] = [];

afterAll(async () => {
	for (const id of createdIds) {
		await cleanScratchRecord(SCRATCH_SECTION, id, SCRATCH_TABLE);
	}
});

class ScriptedProvider implements AgentLlmProvider {
	readonly name = 'scripted';
	readonly seenTranscripts: AgentTranscriptEntry[][] = [];
	private turnIndex = 0;
	constructor(private readonly script: AgentAssistantTurn[]) {}
	async createTurn(request: { transcript: AgentTranscriptEntry[] }): Promise<AgentAssistantTurn> {
		this.seenTranscripts.push([...request.transcript]);
		const turn = this.script[Math.min(this.turnIndex, this.script.length - 1)];
		this.turnIndex++;
		return turn as AgentAssistantTurn;
	}
}

function planFixture(unique: string) {
	return {
		plan_version: 1 as const,
		summary: `Create a scratch record holding '${unique}'.`,
		ops: [
			{
				op_id: 'op1',
				tool: 'dedalo_find_or_create',
				args: {
					section_tipo: SCRATCH_SECTION,
					match: [{ field: TEXT_FIELD, value: unique, lang: 'lg-spa' }],
				},
				summary: `Find-or-create the '${unique}' record`,
			},
			{
				op_id: 'op2',
				tool: 'dedalo_set_field',
				args: {
					section_tipo: SCRATCH_SECTION,
					section_id: { ref: 'op1' },
					field: TEXT_FIELD,
					value: `${unique}-second`,
					lang: 'lg-eng',
				},
				summary: 'Add the English value onto the created record',
			},
		],
	};
}

describe('images through the provider seam (pure)', () => {
	test('a user entry with images maps to image blocks BEFORE the text', () => {
		const messages = toMessages([
			{
				role: 'user',
				text: 'What does this photo show?',
				images: [
					{ media_type: 'image/jpeg', data_base64: 'aGVsbG8=' },
					{ url: 'https://example.org/pic.png' },
				],
			},
		]);
		const content = messages[0]?.content as {
			type: string;
			source?: { type: string; media_type?: string; url?: string };
			text?: string;
		}[];
		expect(content.length).toBe(3);
		expect(content[0]?.type).toBe('image');
		expect(content[0]?.source?.type).toBe('base64');
		expect(content[0]?.source?.media_type).toBe('image/jpeg');
		expect(content[1]?.source?.type).toBe('url');
		expect(content[1]?.source?.url).toBe('https://example.org/pic.png');
		expect(content[2]?.type).toBe('text');
	});

	test('image entries reach the provider request untouched (scripted loop)', async () => {
		const provider = new ScriptedProvider([
			{ text: 'seen', tool_uses: [], stop_reason: 'end_turn' },
		]);
		await runAgent(
			SUPERUSER,
			{ text: 'analyze', images: [{ media_type: 'image/png', data_base64: 'eA==' }] },
			provider,
		);
		const first = provider.seenTranscripts[0]?.[0] as { images?: unknown[] };
		expect(first.images?.length).toBe(1);
	});
});

describe('propose_change_plan (scripted loop, write mode)', () => {
	test('a valid proposal ends the turn with a validated plan and ZERO writes', async () => {
		const unique = `mcp-plan-${process.pid}-${Math.floor(Math.random() * 1e9)}`;
		const provider = new ScriptedProvider([
			{
				text: 'Proposing the plan.',
				tool_uses: [{ id: 'tu1', name: 'propose_change_plan', input: planFixture(unique) }],
				stop_reason: 'tool_use',
			},
		]);
		const run = await runAgent(SUPERUSER, 'file this', provider, { mode: 'write' });
		expect(run.stop).toBe('change_plan');
		expect(run.change_plan).toBeDefined();
		expect(run.change_plan?.plan_hash).toMatch(/^[0-9a-f]{64}$/);
		expect(run.change_plan?.ops.length).toBe(2);

		// NOTHING was written: the unique value exists nowhere.
		const rows = (await sql`
			SELECT section_id FROM matrix_test
			WHERE section_tipo = ${SCRATCH_SECTION}
			  AND EXISTS (
				SELECT 1 FROM jsonb_array_elements(string->'numisdata16') e
				WHERE e->>'value' LIKE ${`${unique}%`}
			)
		`) as { section_id: number }[];
		expect(rows.length).toBe(0);
	});

	test('write tools stay UNEXECUTABLE inside the loop, even in write mode', async () => {
		const provider = new ScriptedProvider([
			{
				text: '',
				tool_uses: [
					{
						id: 'tu1',
						name: 'dedalo_create_record',
						input: { section_tipo: SCRATCH_SECTION },
					},
				],
				stop_reason: 'tool_use',
			},
			{ text: 'done', tool_uses: [], stop_reason: 'end_turn' },
		]);
		const run = await runAgent(SUPERUSER, 'create it', provider, { mode: 'write' });
		expect(run.stop).toBe('end_turn');
		const results = provider.seenTranscripts[1]?.find((entry) => entry.role === 'tool_results') as {
			results: { is_error: boolean; content: string }[];
		};
		expect(results.results[0]?.is_error).toBe(true);
		expect(results.results[0]?.content).toContain('Unknown tool');
	});

	test('an invalid proposal returns as is_error and the loop continues', async () => {
		const badPlan = {
			plan_version: 1,
			summary: 'bad',
			ops: [
				{
					op_id: 'op1',
					tool: 'dedalo_read_record', // not a write tool
					args: { section_tipo: SCRATCH_SECTION },
					summary: 'nope',
				},
			],
		};
		const provider = new ScriptedProvider([
			{
				text: '',
				tool_uses: [{ id: 'tu1', name: 'propose_change_plan', input: badPlan }],
				stop_reason: 'tool_use',
			},
			{ text: 'repaired answer', tool_uses: [], stop_reason: 'end_turn' },
		]);
		const run = await runAgent(SUPERUSER, 'file this', provider, { mode: 'write' });
		expect(run.stop).toBe('end_turn');
		expect(run.change_plan).toBeUndefined();
		const results = provider.seenTranscripts[1]?.find((entry) => entry.role === 'tool_results') as {
			results: { is_error: boolean; content: string }[];
		};
		expect(results.results[0]?.is_error).toBe(true);
		expect(results.results[0]?.content).toContain('not a write tool');
	});
});

describe('validate + hash + apply (live scratch writes)', () => {
	test('hash pins the confirmed plan; mutation ⇒ plan_hash_mismatch', async () => {
		const unique = `mcp-hash-${process.pid}-${Math.floor(Math.random() * 1e9)}`;
		const plan = planFixture(unique);
		const validated = await validateChangePlan(SUPERUSER, plan, { allowWrite: true });
		const mutated = structuredClone(validated);
		(mutated.ops[1] as unknown as { args: { value: string } }).args.value = 'evil';
		await expect(
			applyChangePlan(SUPERUSER, mutated, validated.plan_hash, { allowWrite: true }),
		).rejects.toMatchObject({ code: 'plan_hash_mismatch' });
	});

	test('apply chains {ref} through the registry handlers; report is precise', async () => {
		const unique = `mcp-apply-${process.pid}-${Math.floor(Math.random() * 1e9)}`;
		const validated = await validateChangePlan(SUPERUSER, planFixture(unique), {
			allowWrite: true,
		});
		const report = await applyChangePlan(SUPERUSER, validated, validated.plan_hash, {
			allowWrite: true,
		});
		expect(report.failed).toBeUndefined();
		expect(report.applied.map((entry) => entry.op_id)).toEqual(['op1', 'op2']);
		const createdId = report.created.op1 as number;
		expect(createdId).toBeGreaterThan(0);
		createdIds.push(createdId);

		// Both values landed on the SAME record (the ref resolved).
		const rows = (await sql.unsafe(
			`SELECT string->'${TEXT_FIELD}' AS items FROM ${SCRATCH_TABLE} WHERE section_tipo = $1 AND section_id = $2`,
			[SCRATCH_SECTION, createdId],
		)) as { items: { value?: string }[] | null }[];
		const values = (rows[0]?.items ?? []).map((item) => item.value);
		expect(values).toContain(unique);
		expect(values).toContain(`${unique}-second`);
	});

	test('partial failure: first op applies, the bad op fails, the rest skip', async () => {
		const unique = `mcp-partial-${process.pid}-${Math.floor(Math.random() * 1e9)}`;
		const plan = {
			plan_version: 1 as const,
			summary: 'partial failure fixture',
			ops: [
				{
					op_id: 'op1',
					tool: 'dedalo_find_or_create',
					args: {
						section_tipo: SCRATCH_SECTION,
						match: [{ field: TEXT_FIELD, value: unique, lang: 'lg-spa' }],
					},
					summary: 'create',
				},
				{
					op_id: 'op2',
					tool: 'dedalo_set_field',
					args: {
						section_tipo: SCRATCH_SECTION,
						section_id: { ref: 'op1' },
						field: TEXT_FIELD,
						// no value → the tool refuses with invalid_request
					},
					summary: 'broken set',
				},
				{
					op_id: 'op3',
					tool: 'dedalo_set_field',
					args: {
						section_tipo: SCRATCH_SECTION,
						section_id: { ref: 'op1' },
						field: TEXT_FIELD,
						value: 'never-runs',
						lang: 'lg-eng',
					},
					summary: 'never runs',
				},
			],
		};
		const validated = await validateChangePlan(SUPERUSER, plan, { allowWrite: true });
		const report = await applyChangePlan(SUPERUSER, validated, validated.plan_hash, {
			allowWrite: true,
		});
		if (report.created.op1 !== undefined) createdIds.push(report.created.op1);
		expect(report.applied.map((entry) => entry.op_id)).toEqual(['op1']);
		expect(report.failed?.op_id).toBe('op2');
		expect(report.skipped).toEqual(['op3']);
	});

	test('validation walls: allowlist, permissions, forward refs, read-only surface', async () => {
		const base = planFixture(`mcp-walls-${process.pid}`);
		// Read-only surface refuses plans outright.
		await expect(validateChangePlan(SUPERUSER, base, {})).rejects.toMatchObject({
			code: 'permission_denied',
		});
		// Off-allowlist section.
		await expect(
			validateChangePlan(SUPERUSER, base, {
				allowWrite: true,
				writableSections: new Set(['oh1']),
			}),
		).rejects.toMatchObject({ code: 'section_not_writable' });
		// A denied user fails the permission dry-run before anything else runs.
		await expect(
			validateChangePlan({ userId: 999999, isGlobalAdmin: false, isDeveloper: false }, base, {
				allowWrite: true,
			}),
		).rejects.toMatchObject({ code: 'permission_denied' });
		// Forward ref (op2 references op1 BEFORE it) is rejected.
		const forward = structuredClone(base);
		forward.ops.reverse();
		await expect(
			validateChangePlan(SUPERUSER, forward, { allowWrite: true }),
		).rejects.toMatchObject({ code: 'invalid_request' });
		// Field labels are STAMPED to tipos in the validated plan.
		const validated = await validateChangePlan(SUPERUSER, base, { allowWrite: true });
		expect((validated.ops[1] as unknown as { args: { field: string } }).args.field).toBe(
			TEXT_FIELD,
		);
		// And the hash is over the resolved plan.
		expect(validated.plan_hash).toBe(hashChangePlan(validated));
	});

	test('scoped user cannot smuggle an out-of-scope record into a plan', async () => {
		// numisdata267 record NOT in user 16's project (fixture family from the
		// mcp_tools gate).
		const hidden = (await sql`
			SELECT section_id FROM matrix
			WHERE section_tipo = 'numisdata267'
			  AND NOT EXISTS (
				SELECT 1 FROM jsonb_array_elements(relation->'numisdata21') e
				WHERE e->>'section_id' = '7'
			)
			ORDER BY section_id LIMIT 1
		`) as { section_id: number }[];
		const hiddenId = Number(hidden[0]?.section_id);
		expect(hiddenId).toBeGreaterThan(0);
		try {
			await validateChangePlan(
				SCOPED,
				{
					plan_version: 1,
					summary: 'smuggle',
					ops: [
						{
							op_id: 'op1',
							tool: 'dedalo_set_field',
							args: {
								section_tipo: 'numisdata267',
								section_id: hiddenId,
								field: 'numisdata16',
								value: 'x',
							},
							summary: 'smuggle',
						},
					],
				},
				{ allowWrite: true },
			);
			throw new Error('expected a wall');
		} catch (error) {
			expect(error).toBeInstanceOf(ToolError);
			// Either the permission dry-run or the scope gate stops it — both walls
			// are correct; what matters is that it NEVER validates.
			expect(['permission_denied', 'out_of_scope']).toContain((error as ToolError).code);
		}
	});
});
