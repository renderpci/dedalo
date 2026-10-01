/**
 * THE AI SPEND LEDGER — every model spend is reserved against the caller's
 * per-day budget BEFORE the provider is touched (closure Step 3, TOOLS-4;
 * owner decision 2026-09-30; WC-2026-10-01-ai-spend-budget).
 *
 * WHAT WAS WRONG. An authenticated user could spend without bound: the agent
 * loop (up to MAX_ITERATIONS provider turns per call), the generative RAG
 * `ask`, the retrieval query embeddings and the identify vision calls. A grant
 * says WHO may spend; nothing said HOW MUCH, so one session could run an
 * installation's model bill (or its local GPU) into the ground.
 *
 * THE LEDGER IS STANDARD SCHEMA (the Dédalo way — no bespoke table): the
 * engine-owned section `ddengine1` ("AI usage", ontology/engine_ontology.json),
 * ONE record per (user, UTC day): the user (`ddengine4`, a dd128 locator), the
 * day (`ddengine5`, `YYYY-MM-DD`), and four counters (`ddengine6` runs,
 * `ddengine7` tokens, `ddengine8` query embeddings, `ddengine9` vision calls).
 * It is written through the engine's own doors — `createSectionRecord` for the
 * day's birth, `persistRecordKeys` (the component-key chokepoint: stamped,
 * observed, evented) for every counter move — so an administrator reads and
 * corrects it like any other section, and it is DB state: no cache clear, no
 * restart, no second process resets it.
 *
 * THE PROTOCOL, per spend:
 *   1. `reserveAiSpend(principal, {door, runs?, tokens?, embeds?, vision?})`
 *      BEFORE the provider (before an SSE stream opens): in ONE transaction,
 *      under the node lock of (user, day) — which serializes the find-or-create
 *      a `FOR UPDATE` alone cannot (there is no row to lock before the birth) —
 *      the day's row is read `FOR UPDATE`, every requested kind is checked
 *      (`used + requested > budget` refuses), and the request is CHARGED.
 *      Refusal: `ai.budget_exhausted` (429, details budget_kind / limit /
 *      window_resets_at). A failure to read or write the ledger is
 *      `ai.budget_unavailable` (503) — FAIL CLOSED, never an unmetered spend.
 *   2. `settle(usage)` once the provider answered (in `finally`): the token
 *      reservation is replaced by the REPORTED usage. A missing usage keeps the
 *      FULL reservation charged — never settle-to-zero.
 *   3. `release()` only when the provider was provably never called (a
 *      grounding miss, an egress refusal): the whole reservation is refunded.
 * Counts (runs, embeds, vision) are final at reserve; only tokens settle.
 *
 * NOBODY IS EXEMPT — root and global admins included: spend is a resource, and
 * a resource has an owner and a limit. The SYSTEM principal (the RAG indexer,
 * embed_source.ts) never reaches a metered door: indexing is the
 * installation's own work, not a user's spend.
 *
 * BUDGETS: the DEDALO_AI_USER_DAILY_* catalog keys (config/catalog/ai.ts), read
 * per reservation; `0` refuses every spend of that kind; there is no unlimited
 * value.
 *
 * Gate: test/unit/ai_spend_budget_native.test.ts.
 */

import { readNumber } from '../../config/readers.ts';
import { acquireNodeLock, sql, withTransaction } from '../db/postgres.ts';
import { DedaloError, isDedaloError, logError, toDedaloError } from '../errors/index.ts';
import { ENGINE_TLD } from '../ontology/engine_ontology.ts';
import { getMatrixTableFromTipo, getModelByTipo } from '../ontology/resolver.ts';
import { auditUserLocator, createSectionRecord } from '../section/record/create_record.ts';
import { persistRecordKeys, type SavePathItem } from '../section_record/record_write.ts';
import type { Principal } from './permissions.ts';

/** The ledger's ontology coordinates. */
export interface AiSpendLedger {
	section: string;
	user: string;
	day: string;
	runs: string;
	tokens: string;
	embeds: string;
	vision: string;
}

/** The shipped ledger: ontology/engine_ontology.json. */
export const AI_SPEND_LEDGER: Readonly<AiSpendLedger> = Object.freeze({
	section: `${ENGINE_TLD}1`,
	user: `${ENGINE_TLD}4`,
	day: `${ENGINE_TLD}5`,
	runs: `${ENGINE_TLD}6`,
	tokens: `${ENGINE_TLD}7`,
	embeds: `${ENGINE_TLD}8`,
	vision: `${ENGINE_TLD}9`,
});

/** The four budget kinds, and the catalog key each one is read from. */
export const AI_SPEND_BUDGET_KEYS = Object.freeze({
	runs: 'DEDALO_AI_USER_DAILY_RUNS',
	tokens: 'DEDALO_AI_USER_DAILY_TOKENS',
	embeds: 'DEDALO_AI_USER_DAILY_EMBED_QUERIES',
	vision: 'DEDALO_AI_USER_DAILY_VISION',
} as const);

export type AiSpendKind = keyof typeof AI_SPEND_BUDGET_KEYS;
const KINDS = Object.keys(AI_SPEND_BUDGET_KEYS) as AiSpendKind[];

/** The counters of one (user, day). */
export type AiSpendCounters = Record<AiSpendKind, number>;

/** What one spend asks for. `door` names the caller in logs and refusals. */
export interface AiSpendRequest {
	door: string;
	runs?: number;
	tokens?: number;
	embeds?: number;
	vision?: number;
}

/** Usage the provider reported; `null` (or no finite `tokens`) = not reported. */
export interface AiSpendUsage {
	tokens?: number;
}

export interface AiSpendReservation {
	/**
	 * Replace the token reservation by the reported usage; null keeps the
	 * reservation. Idempotent. NEVER THROWS: a ledger failure here is logged and
	 * leaves the reservation charged (the request it settles already happened).
	 */
	settle(usage: AiSpendUsage | null): Promise<void>;
	/** Refund the whole reservation — ONLY when the provider was never called. Idempotent; never throws. */
	release(): Promise<void>;
}

/**
 * Per-call options. There is NO ledger override: the ledger section is
 * hard-bound (AI_SPEND_LEDGER), so no caller can aim these writes anywhere else
 * (the dd128 write census classifies this module `not-dd128` on that fact).
 */
export interface AiSpendOptions {
	/** Test hook: runs after the day's row was read under the lock, before the charge. */
	afterRead?: () => Promise<void>;
	/** The instant (tests); defaults to now. */
	now?: Date;
}

/** The UTC day a spend is charged to (`YYYY-MM-DD`). */
export function spendDay(now: Date): string {
	return now.toISOString().slice(0, 10);
}

/** The next UTC midnight — when the day's budget resets. */
export function budgetResetsAt(now: Date): string {
	const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
	return next.toISOString();
}

/**
 * The configured budget of one kind (per call: an operator change takes effect
 * at once). Each key is read by its literal name — the config census counts
 * reads, and an indirection through the map would hide them.
 */
export function aiSpendBudget(kind: AiSpendKind): number {
	switch (kind) {
		case 'runs':
			return readNumber('DEDALO_AI_USER_DAILY_RUNS');
		case 'tokens':
			return readNumber('DEDALO_AI_USER_DAILY_TOKENS');
		case 'embeds':
			return readNumber('DEDALO_AI_USER_DAILY_EMBED_QUERIES');
		case 'vision':
			return readNumber('DEDALO_AI_USER_DAILY_VISION');
	}
}

/** A requested amount: a non-negative integer, else 0. */
function amount(value: number | undefined): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.ceil(value) : 0;
}

function requested(request: AiSpendRequest): AiSpendCounters {
	return {
		runs: amount(request.runs),
		tokens: amount(request.tokens),
		embeds: amount(request.embeds),
		vision: amount(request.vision),
	};
}

/** FAIL CLOSED: anything that is not this module's own refusal becomes `ai.budget_unavailable`. */
function unavailable(error: unknown, door: string): never {
	if (isDedaloError(error) && error.code === 'ai.budget_exhausted') throw error;
	throw new DedaloError('ai.budget_unavailable', {
		cause: error,
		message: `ai_spend: the ledger could not be used for ${door}`,
		coordinates: { door },
	});
}

/** The ledger's matrix table, after proving its ontology is installed (else fail closed). */
async function ledgerTable(ledger: AiSpendLedger, door: string): Promise<string> {
	const table = await getMatrixTableFromTipo(ledger.section);
	const counters = [ledger.runs, ledger.tokens, ledger.embeds, ledger.vision];
	const models = await Promise.all([
		getModelByTipo(ledger.user),
		getModelByTipo(ledger.day),
		...counters.map((tipo) => getModelByTipo(tipo)),
	]);
	const shapeOk =
		models[0] === 'component_portal' &&
		models[1] === 'component_input_text' &&
		models.slice(2).every((model) => model === 'component_number');
	if (table === null || !/^matrix[a-z_]*$/.test(table) || !shapeOk) {
		throw new DedaloError('ai.budget_unavailable', {
			message: `ai_spend: the ledger section '${ledger.section}' is not installed (the engine ontology '${ENGINE_TLD}' is missing or damaged — the boot log says why)`,
			coordinates: { door, section_tipo: ledger.section },
		});
	}
	return table;
}

/** The first numeric value of a number component's stored items. */
function storedCount(bag: Record<string, unknown> | null | undefined, tipo: string): number {
	const items = bag?.[tipo];
	if (!Array.isArray(items)) return 0;
	const value = Number((items[0] as { value?: unknown } | undefined)?.value);
	return Number.isFinite(value) && value > 0 ? value : 0;
}

interface LockedDay {
	table: string;
	sectionId: number;
	counters: AiSpendCounters;
}

/**
 * Inside the caller's transaction: lock (user, day), find the day's record
 * `FOR UPDATE`, or give birth to it. Returns its live counters.
 */
async function lockDay(
	principal: Principal,
	ledger: AiSpendLedger,
	day: string,
	door: string,
): Promise<LockedDay> {
	const table = await ledgerTable(ledger, door);
	// The node lock serializes the FIND-OR-CREATE: before the day's birth there
	// is no row for `FOR UPDATE` to lock, and two first spends would both create.
	await acquireNodeLock(ledger.section, `spend_${principal.userId}_${day}`);
	const userProbe = JSON.stringify({
		[ledger.user]: [{ section_tipo: 'dd128', section_id: principal.userId }],
	});
	const dayProbe = JSON.stringify({ [ledger.day]: [{ value: day }] });
	const rows = (await sql.unsafe(
		`SELECT section_id, number FROM "${table}"
		 WHERE section_tipo = $1 AND relation @> $2::text::jsonb AND string @> $3::text::jsonb
		 ORDER BY section_id LIMIT 1 FOR UPDATE`,
		[ledger.section, userProbe, dayProbe],
	)) as { section_id: number; number: Record<string, unknown> | null }[];
	const row = rows[0];
	if (row !== undefined) {
		const counters = {} as AiSpendCounters;
		for (const kind of KINDS) counters[kind] = storedCount(row.number, ledger[kind]);
		return { table, sectionId: Number(row.section_id), counters };
	}
	const sectionId = await createSectionRecord(ledger.section, principal.userId);
	await persistRecordKeys(
		{ table, sectionTipo: ledger.section, sectionId },
		[
			{
				column: 'relation',
				key: ledger.user,
				value: [auditUserLocator(principal.userId, ledger.user)],
			},
			{ column: 'string', key: ledger.day, value: [{ id: 1, lang: 'lg-nolan', value: day }] },
		],
		{ userId: principal.userId },
		{ actor: principal.userId },
	);
	return { table, sectionId, counters: { runs: 0, tokens: 0, embeds: 0, vision: 0 } };
}

/** Write the counters that changed (one chokepoint write, stamped as the spender). */
async function writeCounters(
	principal: Principal,
	ledger: AiSpendLedger,
	locked: LockedDay,
	next: AiSpendCounters,
): Promise<void> {
	const savePath: SavePathItem[] = [];
	for (const kind of KINDS) {
		if (next[kind] === locked.counters[kind]) continue;
		savePath.push({ column: 'number', key: ledger[kind], value: [{ id: 1, value: next[kind] }] });
	}
	if (savePath.length === 0) return;
	await persistRecordKeys(
		{ table: locked.table, sectionTipo: ledger.section, sectionId: locked.sectionId },
		savePath,
		{ userId: principal.userId },
		{ actor: principal.userId },
	);
}

/** Apply `delta` to the day's counters (never below 0), under the lock. */
async function adjust(
	principal: Principal,
	ledger: AiSpendLedger,
	day: string,
	door: string,
	delta: Partial<AiSpendCounters>,
): Promise<void> {
	try {
		await withTransaction(async () => {
			const locked = await lockDay(principal, ledger, day, door);
			const next = { ...locked.counters };
			for (const kind of KINDS) next[kind] = Math.max(0, next[kind] + (delta[kind] ?? 0));
			await writeCounters(principal, ledger, locked, next);
		});
	} catch (error) {
		// A SETTLEMENT never fails the request it settles: the spend already
		// happened, and a ledger that cannot be corrected keeps the RESERVATION
		// charged — the conservative side. Logged, counted, never silent.
		logError(isDedaloError(error) ? error : toDedaloError(error), {
			subsystem: `ai_spend::settle(${door})`,
		});
	}
}

/**
 * RESERVE a spend: THROWS `ai.budget_exhausted` when any requested kind would
 * pass its budget (nothing charged), `ai.budget_unavailable` when the ledger
 * cannot be used. On success the request is charged and the reservation
 * returned.
 */
export async function reserveAiSpend(
	principal: Principal,
	request: AiSpendRequest,
	options: AiSpendOptions = {},
): Promise<AiSpendReservation> {
	const ledger = AI_SPEND_LEDGER;
	const now = options.now ?? new Date();
	const day = spendDay(now);
	const asked = requested(request);
	try {
		await withTransaction(async () => {
			const locked = await lockDay(principal, ledger, day, request.door);
			await options.afterRead?.();
			for (const kind of KINDS) {
				if (asked[kind] === 0) continue;
				const limit = aiSpendBudget(kind);
				if (locked.counters[kind] + asked[kind] > limit) {
					throw new DedaloError('ai.budget_exhausted', {
						details: { budget_kind: kind, limit, window_resets_at: budgetResetsAt(now) },
						coordinates: { door: request.door, user_id: principal.userId, day },
					});
				}
			}
			const next = { ...locked.counters };
			for (const kind of KINDS) next[kind] += asked[kind];
			await writeCounters(principal, ledger, locked, next);
		});
	} catch (error) {
		unavailable(error, request.door);
	}

	let closed = false;
	return {
		settle: async (usage) => {
			if (closed) return;
			closed = true;
			const reported = usage?.tokens;
			// A missing usage keeps the FULL reservation charged: never settle-to-zero.
			if (typeof reported !== 'number' || !Number.isFinite(reported) || reported < 0) return;
			const delta = Math.ceil(reported) - asked.tokens;
			if (delta !== 0) await adjust(principal, ledger, day, request.door, { tokens: delta });
		},
		release: async () => {
			if (closed) return;
			closed = true;
			const refund: Partial<AiSpendCounters> = {};
			for (const kind of KINDS) refund[kind] = -asked[kind];
			await adjust(principal, ledger, day, request.door, refund);
		},
	};
}

/** A COUNT-ONLY spend (an embedding query, a vision call): reserved and final in one call. */
export async function chargeAiSpend(
	principal: Principal,
	request: AiSpendRequest,
	options: AiSpendOptions = {},
): Promise<void> {
	await reserveAiSpend(principal, request, options);
}

/** The day's counters for a principal (zeros when nothing was spent). Read-only. */
export async function readAiSpend(
	principal: Principal,
	options: { now?: Date } = {},
): Promise<AiSpendCounters> {
	const ledger = AI_SPEND_LEDGER;
	const day = spendDay(options.now ?? new Date());
	const table = await ledgerTable(ledger, 'readAiSpend');
	const rows = (await sql.unsafe(
		`SELECT number FROM "${table}"
		 WHERE section_tipo = $1 AND relation @> $2::text::jsonb AND string @> $3::text::jsonb
		 ORDER BY section_id LIMIT 1`,
		[
			ledger.section,
			JSON.stringify({ [ledger.user]: [{ section_tipo: 'dd128', section_id: principal.userId }] }),
			JSON.stringify({ [ledger.day]: [{ value: day }] }),
		],
	)) as { number: Record<string, unknown> | null }[];
	const counters = { runs: 0, tokens: 0, embeds: 0, vision: 0 };
	for (const kind of KINDS) counters[kind] = storedCount(rows[0]?.number, ledger[kind]);
	return counters;
}
