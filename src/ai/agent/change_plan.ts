/**
 * CHANGE PLAN — the propose→confirm→apply write protocol (plan decision D2).
 *
 * The agent loop NEVER writes. In write mode the model proposes a ChangePlan:
 * an ordered list of ops, each op exactly one registry WRITE tool call
 * (`{op_id, tool, args, summary}`), with `{ref: <op_id>}` chaining later ops
 * onto records created earlier in the same plan. The plan is:
 *
 *   1. VALIDATED here (dry-run: tool exists+write, section allowlist,
 *      level>=2 permission, field labels resolved AND STAMPED to tipos,
 *      concrete record targets scope-checked, refs point at earlier
 *      create-ops) — the human confirms the RESOLVED plan, not a vague one;
 *   2. HASHED over canonical JSON (sorted keys) — apply recomputes the hash,
 *      so what executes is byte-what was confirmed (plan_hash_mismatch else);
 *   3. APPLIED statelessly: the client resends the full plan; every gate
 *      re-runs; ops execute sequentially THROUGH runTool (never engines
 *      directly — the write-scope tripwire counts on that), stop-on-first-
 *      error with an {applied, failed, skipped} report (D7). Each engine call
 *      is its own transaction and TM audit, exactly like a human edit.
 *
 * No server-held plan state exists between propose and apply
 * (module_state_tripwire): re-validation at apply is the security boundary,
 * the hash only protects the HUMAN's confirmation from accidental drift.
 */

import { z } from 'zod';
import { type Structured, ToolError, err, ok, wrapError } from '../mcp/envelope.ts';
import {
	type RegistryGates,
	type RegistryPrincipal,
	getToolSpec,
	runTool,
} from '../mcp/registry.ts';
import { resolveFieldReference } from '../mcp/tools/discovery.ts';

/** One op: exactly one registry write-tool call (+ ref chaining). */
export interface ChangeOp {
	/** Unique id within the plan; later ops reference it as {ref: op_id}. */
	op_id: string;
	/** A registry WRITE tool name, e.g. 'dedalo_find_or_create'. */
	tool: string;
	/** The tool's input; {ref: <op_id>} allowed wherever a section_id goes. */
	args: Record<string, unknown>;
	/** Human-readable one-liner shown in the confirmation UI. */
	summary: string;
}

export interface ChangePlan {
	plan_version: 1;
	/** What the whole plan does, for the confirmation dialog. */
	summary: string;
	ops: ChangeOp[];
}

export interface ValidatedChangePlan extends ChangePlan {
	/** SHA-256 over the canonical JSON of {plan_version, summary, ops}. */
	plan_hash: string;
}

export interface ApplyReport {
	applied: { op_id: string; result: unknown }[];
	failed?: { op_id: string; error: Structured };
	skipped: string[];
	/** section_ids of records created by create-ops, keyed by op_id. */
	created: Record<string, number>;
}

const changeOpSchema = z.object({
	op_id: z.string().min(1),
	tool: z.string().min(1),
	args: z.record(z.unknown()),
	summary: z.string().min(1),
});

export const changePlanSchema = z.object({
	plan_version: z.literal(1),
	summary: z.string().min(1),
	ops: z.array(changeOpSchema).min(1).max(64),
});

/** Tools whose result mints a record other ops may {ref}. */
const CREATE_TOOLS: ReadonlySet<string> = new Set([
	'dedalo_create_record',
	'dedalo_find_or_create',
]);

// ---------------------------------------------------------------------------
// Canonical hash
// ---------------------------------------------------------------------------

/** JSON.stringify with recursively sorted object keys (canonical form). */
function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(canonicalJson).join(',')}]`;
	}
	if (value !== null && typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>)
			.filter(([, entryValue]) => entryValue !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
			.map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`);
		return `{${entries.join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
}

/** SHA-256 hex of the plan's canonical JSON (plan_hash itself excluded). */
export function hashChangePlan(plan: ChangePlan): string {
	const hasher = new Bun.CryptoHasher('sha256');
	hasher.update(
		canonicalJson({ plan_version: plan.plan_version, summary: plan.summary, ops: plan.ops }),
	);
	return hasher.digest('hex');
}

// ---------------------------------------------------------------------------
// Ref plumbing
// ---------------------------------------------------------------------------

function isRef(value: unknown): value is { ref: string } {
	return (
		value !== null &&
		typeof value === 'object' &&
		typeof (value as { ref?: unknown }).ref === 'string' &&
		Object.keys(value as object).length === 1
	);
}

/** Collect every {ref} inside a value (deep). */
function collectRefs(value: unknown, into: string[]): void {
	if (isRef(value)) {
		into.push(value.ref);
		return;
	}
	if (Array.isArray(value)) {
		for (const entry of value) collectRefs(entry, into);
		return;
	}
	if (value !== null && typeof value === 'object') {
		for (const entry of Object.values(value)) collectRefs(entry, into);
	}
}

/** Deep-substitute {ref: op_id} with the created section_id. */
function substituteRefs(value: unknown, created: Record<string, number>): unknown {
	if (isRef(value)) {
		const resolved = created[value.ref];
		if (resolved === undefined) {
			throw new ToolError('invalid_request', `Unresolved ref '${value.ref}' at apply time.`);
		}
		return resolved;
	}
	if (Array.isArray(value)) {
		return value.map((entry) => substituteRefs(entry, created));
	}
	if (value !== null && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(value)) {
			out[key] = substituteRefs(entry, created);
		}
		return out;
	}
	return value;
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

/**
 * Dry-run the plan under the principal + gates: every failure throws a
 * ToolError the caller envelopes. Returns the RESOLVED plan (field labels
 * stamped to tipos) with its hash — that is what the human confirms.
 */
export async function validateChangePlan(
	principal: RegistryPrincipal,
	rawPlan: unknown,
	gates: RegistryGates,
): Promise<ValidatedChangePlan> {
	if (gates.allowWrite !== true) {
		throw new ToolError('permission_denied', 'Change plans need the write opt-in on this surface.');
	}
	const parsed = changePlanSchema.safeParse(rawPlan);
	if (!parsed.success) {
		throw new ToolError('invalid_request', `Malformed change plan: ${parsed.error.message}`);
	}
	const plan = parsed.data as ChangePlan;

	const { getPermissions } = await import('../../core/security/permissions.ts');
	const { principalCanAccessRecord } = await import('../../core/security/record_scope.ts');

	const seenOps = new Set<string>();
	const createOps = new Set<string>();
	for (const op of plan.ops) {
		if (seenOps.has(op.op_id)) {
			throw new ToolError('invalid_request', `Duplicate op_id '${op.op_id}'.`);
		}
		seenOps.add(op.op_id);

		const spec = getToolSpec(op.tool);
		if (spec === undefined || !spec.write) {
			throw new ToolError('invalid_request', `Op '${op.op_id}': '${op.tool}' is not a write tool.`);
		}

		// Refs may only point at EARLIER create-ops (no cycles, no forward refs).
		const refs: string[] = [];
		collectRefs(op.args, refs);
		for (const ref of refs) {
			if (!createOps.has(ref)) {
				throw new ToolError(
					'invalid_request',
					`Op '${op.op_id}' references '${ref}', which is not an earlier create-op.`,
				);
			}
		}

		// Section allowlist + permission gates (the same wall apply re-runs).
		const sectionTipo = op.args.section_tipo;
		if (typeof sectionTipo !== 'string' || sectionTipo === '') {
			throw new ToolError('invalid_request', `Op '${op.op_id}' needs args.section_tipo.`);
		}
		if (
			gates.writableSections !== undefined &&
			gates.writableSections.size > 0 &&
			!gates.writableSections.has(sectionTipo)
		) {
			throw new ToolError(
				'section_not_writable',
				`Op '${op.op_id}': section '${sectionTipo}' is not in the write allowlist.`,
			);
		}

		// Resolve + STAMP field labels to tipos, so what the human confirms is
		// the exact component the apply will touch (never re-guessed later).
		if (typeof op.args.field === 'string') {
			op.args.field = await resolveFieldReference(sectionTipo, op.args.field);
			if ((await getPermissions(principal, sectionTipo, op.args.field as string)) < 2) {
				throw new ToolError(
					'permission_denied',
					`Op '${op.op_id}': no write permission on ${sectionTipo}/${op.args.field}.`,
				);
			}
		} else if ((await getPermissions(principal, sectionTipo, sectionTipo)) < 2) {
			throw new ToolError(
				'permission_denied',
				`Op '${op.op_id}': no write permission on ${sectionTipo}.`,
			);
		}

		// Concrete record targets must be in the principal's scope NOW (refs are
		// re-checked at apply through the tools' own gates).
		const concreteId = op.args.section_id;
		if (typeof concreteId === 'number') {
			if (!(await principalCanAccessRecord(sectionTipo, concreteId, principal))) {
				throw new ToolError(
					'out_of_scope',
					`Op '${op.op_id}': record ${sectionTipo}/${concreteId} is out of the user scope.`,
				);
			}
		}

		if (CREATE_TOOLS.has(op.tool)) createOps.add(op.op_id);
	}

	return { ...plan, plan_hash: hashChangePlan(plan) };
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

/**
 * Apply a confirmed plan: hash recheck → full re-validation → sequential
 * execution through the registry write handlers. Stop-on-first-error; the
 * report names what ran, what failed, and what never started.
 */
export async function applyChangePlan(
	principal: RegistryPrincipal,
	rawPlan: unknown,
	planHash: string,
	gates: RegistryGates,
): Promise<ApplyReport> {
	const validated = await validateChangePlan(principal, rawPlan, gates);
	if (validated.plan_hash !== planHash) {
		throw new ToolError('plan_hash_mismatch', 'The plan differs from the one that was confirmed.');
	}

	const report: ApplyReport = { applied: [], skipped: [], created: {} };
	for (let index = 0; index < validated.ops.length; index++) {
		const op = validated.ops[index] as ChangeOp;
		const spec = getToolSpec(op.tool);
		if (spec === undefined) {
			// Unreachable after validation; belt for the type system.
			report.failed = { op_id: op.op_id, error: err('invalid_request', 'unknown tool') };
			report.skipped = validated.ops.slice(index + 1).map((rest) => rest.op_id);
			return report;
		}
		let envelope: Structured;
		try {
			const args = substituteRefs(op.args, report.created) as Record<string, unknown>;
			envelope = await runTool(spec, principal, args, gates);
		} catch (error) {
			envelope = wrapError(error);
		}
		if (!envelope.ok) {
			report.failed = { op_id: op.op_id, error: envelope };
			report.skipped = validated.ops.slice(index + 1).map((rest) => rest.op_id);
			return report;
		}
		report.applied.push({ op_id: op.op_id, result: envelope.data });
		if (CREATE_TOOLS.has(op.tool)) {
			const createdId = (envelope.data as { section_id?: unknown } | null)?.section_id;
			if (typeof createdId === 'number') {
				report.created[op.op_id] = createdId;
			}
		}
	}
	return report;
}

/** Envelope helper for surfaces exposing apply as a tool/action. */
export async function applyChangePlanEnveloped(
	principal: RegistryPrincipal,
	rawPlan: unknown,
	planHash: string,
	gates: RegistryGates,
): Promise<Structured<ApplyReport>> {
	try {
		return ok(await applyChangePlan(principal, rawPlan, planHash, gates));
	} catch (error) {
		return wrapError(error);
	}
}
