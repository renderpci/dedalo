/**
 * Server-side observers (PHP component_common::propagate_to_observers →
 * update_observer_data): when an OBSERVED component saves, its declared
 * observers recompute.
 *
 * HOME (moved from api/handlers 2026-07-24): this is WRITE-CASCADE domain
 * logic, fired from the saveComponentData chokepoint post-commit — so EVERY
 * save door propagates (dispatch, imports, MCP tools, transcription). The
 * 2026-07-24 audit found the api-layer wiring only covered the interactive
 * dispatch save; bulk imports left hierarchy93-style mirrors permanently
 * stale (dc1 §2 was the reported case). Doors that mutate relation slots
 * WITHOUT saveComponentData call propagateToObservers themselves
 * (deletePortalLocator passes the REMOVED locators — the targets that must
 * recompute); record deletes rely on the generic inverse cleanup (pruning);
 * remaining bulk doors (tool_propagate, delete_data wipe, portalize
 * migration) are healed by scripts/observer_reconcile.ts.
 *
 * Coverage (measured on this ontology):
 *   - 58/66 observer configs are CLIENT-only (no `server` key) → nothing to
 *     do on the server;
 *   - the dominant server config is {config:{use_observable_dato}, perform:
 *     set_dato_external} — the hierarchy93 ← rsc387 family: the observer
 *     component AT EACH TARGET of the saved data recomputes its EXTERNAL
 *     value = every record referencing the target through
 *     properties.source.component_to_search, order-preserved (existing
 *     entries kept in place, new ones appended with the next item id —
 *     PHP-oracle-verified byte shape);
 *   - component_info observers (incl. the component_state/calculation
 *     aliases) — 2026-07-10, oracle-verified on scratch twins: BOTH server
 *     shapes recompute the widgets. `filter:{SQO}` (numisdata595/oh87 — the
 *     observed component lives on ANOTHER section) fills every clause's q
 *     with the saved record's locator (+ from_component_tipo from the
 *     clause's last path step) and searches the observer's section for the
 *     referencing records; `filter:false` (rsc19/test180/numisdata1125 —
 *     same-record observers) targets the saved record itself. Per target
 *     PHP writes ONE matrix_time_machine row (lg-nolan, the computed live
 *     shape) and — measured, deliberate — does NOT touch the live misc
 *     column (stored misc values are LEGACY; live reads fall back to live
 *     compute). Targets equal to the saved record additionally ride the
 *     save response's data array (mode 'list', the client refresh);
 *   - other `server.filter` + perform shapes remain LEDGERED (logged skip,
 *     never guessed).
 *
 * DISCOVERY (Act 2, 2026-08-02): edges come from the ontology-wide
 * SUBSCRIPTION REGISTRY (./observer_subscriptions.ts) — no longer from the
 * saved node's `properties.observers` alone. THE DISPATCH RULE (owner ruling
 * 2026-08-02): an edge dispatches iff the OBSERVER declares it in
 * `properties.observe` with a `server` block (plus wildcard edges compiled
 * from forward specs) — the ontology decides; no code table gates it. A
 * reverse-only declaration (observe half alone) dispatches like any other —
 * the single-declaration model that closes the rsc19 -> oh28 defect. The
 * SQO-filter recompute's host section comes from the registry's 4-step
 * resolution (observe-entry scope → forward spec → observer's own section
 * with virtual↔real equivalence → loud refusal); dead config (forward-only
 * specs, dead wildcards, unresolved hosts) is a LOUD contract violation
 * (gate-RED where the suite ontology carries it; boot-probe/gauge/counter on
 * a production ontology — see observer_subscriptions.ts header).
 * Classification, the resolvers and every perform below are untouched.
 */

import { incrementCounter } from '../../api/counters.ts';
import { isInTransaction, registerCommitAction, sql } from '../../db/postgres.ts';
import { recordTimeMachine } from '../../db/time_machine.ts';
import { getMatrixTableFromTipo, getModelByTipo, getNode } from '../../ontology/resolver.ts';
// type-only: erased at build, so no static relations↔section cycle is created
// (the VALUE import of relations/related.ts stays dynamic on the compute path).
import type { RelatedGraphIO } from '../../relations/related.ts';
import { auditDateItem, auditUserLocator, dbTimestamp } from './create_record.ts';
import {
	type ObserveEntry,
	entryServerBlock,
	getObserverSubscriptions,
	isSqoFilter,
} from './observer_subscriptions.ts';

interface StoredLocator {
	id?: number;
	type?: string;
	section_id?: number | string;
	section_tipo?: string;
	from_component_tipo?: string;
	[key: string]: unknown;
}

/**
 * D2 — THE BOUNDED CASCADE GUARD. PHP's propagation is transitively recursive
 * (every recompute/relay ends in Save() → propagate_to_observers) and
 * UNGUARDED — no visited set, no depth budget: a cyclic observe graph
 * infinite-loops the PHP engine. TS re-enters propagation ONLY through
 * emitCascadeHop/runObserverCascadeHop below, carrying this guard as a
 * PARAMETER (never module state — module_state_tripwire): a shared visited
 * set keyed `observerTipo|performKind|section_tipo|section_id` and a depth
 * budget (MAX_CASCADE_DEPTH). Exceeding either is a LOUD, counted stop
 * naming the full chain — never a silent truncation, never a hang. The
 * measured real graph is depth ≤ 2 with zero cycles, so the budget is a
 * backstop, not a workload.
 *
 * The cascade is UNCONDITIONAL (2026-08-02): the ontology's observers/observe
 * declarations are the source of truth, and the mirrors are STORED relation
 * data — gating declared edges behind a config key made two installs with the
 * same ontology store different values. The DEDALO_OBSERVER_CASCADE rollout
 * flag was retired the day the benchmark cleared it (typical external hop p50
 * 1.3ms / p90 3.1ms; worst real case 22ms; depth ≤ 2, zero cycles —
 * WC-2026-08-02-observer-cascade-bounded-flag).
 */
export interface CascadeGuard {
	/** Hops taken to REACH the current propagation (root = 0). */
	depth: number;
	/** MAX_CASCADE_DEPTH at the root; tests may plant a smaller budget. */
	maxDepth: number;
	/** SHARED across the whole cascade tree — one re-entry per node, ever. */
	visited: Set<string>;
	/** Per-branch human-readable path (`tipo@section/id`) for loud failures. */
	chain: string[];
}

/** The depth ceiling — a backstop over a measured depth-≤2 graph. Exported
 * for the depth-budget gate in observer_cascade_native.test.ts. */
export const MAX_CASCADE_DEPTH = 8;

/**
 * Emit one cascade hop: guard-check (visited + depth budget), then either run
 * it immediately (no ambient transaction) or defer it to the COMMIT-ONLY lane
 * (B6/W12: inside an ambient tx — import_csv wraps whole rows — the hop must
 * fire only after the outer COMMIT, reading committed state; on ROLLBACK it is
 * discarded with the state it would have propagated). Pre-gated on the
 * observer itself declaring `observers` (a hop into a leaf is a no-op by
 * construction — skipping it keeps the commit lane and the guard log honest).
 *
 * Exported ONLY for the leaked-continuation drop gate in
 * observer_cascade_native.test.ts — production re-entry goes through
 * propagateToObservers.
 */
export async function emitCascadeHop(
	guard: CascadeGuard,
	observerTipo: string,
	kind: 'relay' | 'external' | 'info',
	sectionTipo: string,
	sectionId: number,
	userId: number,
	now: Date,
): Promise<void> {
	// Leaf pre-gate (Act 2: registry, not the node's own `observers` array):
	// a hop is worth scheduling only when the observer's OWN saves would
	// dispatch something — any subscription registered for it (forward-
	// declared, or a reverse-only observe+server declaration: those dispatch
	// by the ontology rule). A node with no subscriptions at all is a leaf —
	// no commit-lane task / guard entry / read appears for it.
	const hopSubscriptions = await getObserverSubscriptions(observerTipo);
	if (hopSubscriptions.length === 0) return; // leaf — nothing to relay into
	const chainLabel = `${observerTipo}@${sectionTipo}/${sectionId}`;
	const key = `${observerTipo}|${kind}|${sectionTipo}|${sectionId}`;
	if (guard.visited.has(key)) {
		// A revisit stops the branch either way (execute-once dispatch — the
		// visited set is shared across the whole cascade tree), but the TWO cases
		// are different signals (review 2026-08-02): the node already on the
		// CURRENT branch's chain is a TRUE CYCLE (PHP would infinite-loop —
		// incident signal, counter must stay 0); a node reached through a
		// DIFFERENT branch is a CONVERGED DIAMOND — legitimate graph shape,
		// deduped by design (execute-once vs PHP's re-execute-to-fixpoint is a
		// ledgered divergence: WC-2026-08-02-observer-cascade-bounded-flag).
		if (guard.chain.includes(chainLabel)) {
			console.error(
				`observer cascade CYCLE refused (node '${key}' is on its own chain) — chain: ${[...guard.chain, chainLabel].join(' -> ')}`,
			);
			incrementCounter('observers_cascade_cycle_refused');
		} else {
			console.warn(
				`observer cascade converged path skipped (node '${key}' already dispatched via another branch — benign dedup) — chain: ${[...guard.chain, chainLabel].join(' -> ')}`,
			);
			incrementCounter('observers_cascade_converged_skipped');
		}
		return;
	}
	const nextDepth = guard.depth + 1;
	if (nextDepth > guard.maxDepth) {
		console.error(
			`observer cascade DEPTH BUDGET exceeded (hop ${nextDepth} > max ${guard.maxDepth}) — chain: ${[...guard.chain, chainLabel].join(' -> ')} — cascade STOPPED here (counted: observers_cascade_depth_exceeded)`,
		);
		incrementCounter('observers_cascade_depth_exceeded');
		return;
	}
	guard.visited.add(key);
	const childGuard: CascadeGuard = {
		maxDepth: guard.maxDepth,
		visited: guard.visited,
		depth: nextDepth,
		chain: [...guard.chain, chainLabel],
	};
	const hop = () =>
		runObserverCascadeHop(observerTipo, sectionTipo, sectionId, userId, now, childGuard);
	if (isInTransaction()) {
		if (!registerCommitAction(hop)) {
			// The commit lane refused the registration: the ambient tx context is
			// present but its queue already drained — an S2-14 LEAKED CONTINUATION
			// (unawaited promise from inside a settled withTransaction). Running
			// the hop inline here would trip the B6 assert (isInTransaction() is
			// deliberately still true on an expired handle), so the hop is DROPPED
			// — but never silently: loud + counted (review 2026-08-02; this was
			// the dispatch's one silent-truncation path).
			console.error(
				`observer cascade hop DROPPED (commit lane closed — leaked continuation past withTransaction?) — chain: ${childGuard.chain.join(' -> ')} (counted: observers_cascade_hop_dropped)`,
			);
			incrementCounter('observers_cascade_hop_dropped');
		}
	} else {
		await hop();
	}
}

/**
 * One cascade hop: read the observer's CURRENT value "with references" (PHP
 * sets observable_dato = get_dato_with_references() for
 * component_relation_related, get_dato() otherwise, before the re-save —
 * getStoredWithReferences dispatches on the model and degrades to the stored
 * bag for every other model) and re-enter propagation as if the observer had
 * just saved. WRITES NOTHING itself (WC-2026-08-02-observer-relay-writes-nothing).
 *
 * MUST NOT run inside an ambient transaction (B6): withTransaction JOINS an
 * ambient tx, so the hop's recompute writes would ride a transaction it does
 * not own — and escaping onto a second connection would deadlock on the
 * outer tx's row locks undetectably. The assert throws WITH the chain (the
 * caller coordinates); scheduling through emitCascadeHop can never trip it
 * (in-tx emission defers to the commit lane). Per-hop errors below the assert
 * are swallowed LOUDLY — permitted precisely because the hop owns every
 * transaction it opens (an ambient tx would be poisoned by a swallowed error;
 * that is what the assert forbids).
 */
export async function runObserverCascadeHop(
	observerTipo: string,
	sectionTipo: string,
	sectionId: number,
	userId: number,
	now: Date,
	guard: CascadeGuard,
): Promise<void> {
	if (isInTransaction()) {
		incrementCounter('observers_cascade_in_transaction_refused');
		throw new Error(
			`runObserverCascadeHop: refusing to run inside an ambient transaction — hop '${observerTipo}' @ ${sectionTipo}/${sectionId}, chain: ${guard.chain.join(' -> ')}. Cascade hops read committed state and open their own transactions (B6); schedule through registerCommitAction / emitCascadeHop instead.`,
		);
	}
	try {
		const node = await getNode(observerTipo);
		// alias lookup registration (see collectExternalSeed for why this load
		// is dynamic and unconditional).
		await import('../../components/registry.ts');
		const model = node === null ? null : await getModelByTipo(observerTipo);
		const { getStoredWithReferences } = await import('../../relations/related.ts');
		const payload = await getStoredWithReferences(
			observerTipo,
			sectionTipo,
			sectionId,
			node?.properties ?? null,
			model,
			'lg-nolan',
		);
		await propagateToObservers(observerTipo, sectionTipo, sectionId, payload, userId, now, guard);
	} catch (error) {
		// Hop-owned containment (B6): safe to swallow ONLY because the assert
		// above guarantees no ambient transaction can be poisoned. Loud + counted.
		console.error(
			`observer cascade hop failed (swallowed) — '${observerTipo}' @ ${sectionTipo}/${sectionId}, chain: ${guard.chain.join(' -> ')}:`,
			error,
		);
		incrementCounter('observers_cascade_hop_failed');
	}
}

/**
 * Fires the server-side observers of a just-saved component. Never throws
 * OUTSIDE an ambient transaction (failures are swallowed loudly); INSIDE one
 * it rethrows — a swallowed error there would leave the caller's transaction
 * aborted-and-poisoned while hiding the cause (B6, see the catch below).
 * Returns the recomputed observer DATA ITEMS whose target IS the saved
 * record (PHP observers_data — merged into the save response so the
 * actively-edited record's info widget refreshes client-side).
 *
 * `cascade` is INTERNAL (D2): the bounded-dispatch guard threaded through
 * relay/recompute re-entries. External callers (save_component, relations/
 * save, duplicate_record) never pass it — the root propagation creates it
 * unconditionally (the cascade always fires for a declared edge; see the
 * CascadeGuard header).
 */
export async function propagateToObservers(
	observedTipo: string,
	sectionTipo: string,
	sectionId: number,
	savedItems: unknown[],
	userId: number,
	now: Date = new Date(),
	cascade?: CascadeGuard,
): Promise<unknown[]> {
	const observersData: unknown[] = [];
	try {
		// Act 2 discovery: the ontology-wide subscription registry (forward
		// specs in their declared order first — the historical iteration order
		// — then reverse-only declarations). Dispatchability is the ontology's
		// decision alone: an entry with a server block fires, full stop.
		const subscriptions = await getObserverSubscriptions(observedTipo);
		if (subscriptions.length === 0) return observersData;

		// D2 root guard: created ONCE per user-initiated propagation and threaded
		// through every re-entry (relay/external/info hops share the visited set).
		const guard: CascadeGuard = cascade ?? {
			depth: 0,
			maxDepth: MAX_CASCADE_DEPTH,
			visited: new Set(),
			chain: [`${observedTipo}@${sectionTipo}/${sectionId}`],
		};

		// The saved data's target locators (the observable data).
		const targets = (savedItems as StoredLocator[]).filter(
			(item) =>
				item !== null &&
				typeof item === 'object' &&
				typeof item.section_tipo === 'string' &&
				item.section_id !== undefined,
		);

		const done = new Set<string>(); // observerTipo|targetKey dedup across specs
		for (const sub of subscriptions) {
			const observerTipo = sub.observerTipo;
			// entryServerBlock is THE dispatchability predicate: undefined for a
			// client-only observer (most of them) AND for a malformed non-object
			// server value (build-time RED — never dispatched, never thrown on).
			const server = entryServerBlock(sub.entry);
			if (server === undefined) continue;
			// No further gate: a declared server edge dispatches — the ontology
			// decides (see the header's DISPATCH RULE).

			const performFunction = server.perform?.function;
			const useObservable = server.config?.use_observable_dato === true;

			// component_info observers (incl. the state/calculation aliases):
			// recompute the widgets per target + TM row; same-record targets
			// ride the save response (see header — oracle-verified 2026-07-10).
			const { getModelByTipo } = await import('../../ontology/resolver.ts');
			const { getComponentModel } = await import('../../components/registry.ts');
			const observerModel = await getModelByTipo(observerTipo);
			const isInfoObserver =
				observerModel !== null &&
				(observerModel === 'component_info' ||
					getComponentModel(observerModel)?.alias === 'component_info');
			if (isInfoObserver && performFunction === undefined) {
				// R5 host-section law: an SQO-filter recompute searches the section
				// the registry's 4-step resolution produced (observe-entry scope →
				// forward spec → the observer's own section, virtual↔real-aware —
				// see observer_subscriptions.ts). Unresolved = step 4: REFUSE
				// LOUDLY, never guess a section (a wrong fallback would search the
				// saved record's section, wrong for a cross-section observer). The
				// validator flags the same edges RED at build/boot.
				if (isSqoFilter(server.filter) && sub.hostSection === undefined) {
					console.error(
						`observer '${observerTipo}' ← '${observedTipo}': SQO-filter edge with UNRESOLVED host section — recompute REFUSED; add a section scope (section_tipo) to the observe entry`,
					);
					incrementCounter('observers_host_section_unresolved');
					continue;
				}
				observersData.push(
					...(await recomputeInfoObserver(
						observerTipo,
						sub.hostSection,
						server,
						sectionTipo,
						sectionId,
						userId,
						now,
						guard,
					)),
				);
				continue;
			}

			// DEFAULT branch, filter:false → PHP re-saves the observer on the
			// changed record. ORACLE-VERIFIED NO-OP for the hi family on this
			// install (an rsc36 save leaves rsc860's relation_search untouched —
			// pinned in the observer differential), so TS matches the no-op.
			// DISTINCT from `filter` ABSENT + config, the relay below — the two
			// shapes were previously indistinguishable here.
			if (performFunction === undefined && server.filter === false) {
				continue;
			}

			// D1 — THE TRIGGER RELAY (PHP's DEFAULT observer branch, v6
			// class.component_common.php:1651-1660 → Save() :1306 →
			// propagate_to_observers :1372): no `perform`, `filter` ABSENT
			// (filter:false is the written-out terminal no-op ABOVE), a config
			// naming use_observable_dato, observer not an info model (handled
			// earlier). PHP reads the observer's value, sets observable_dato =
			// the value WITH REFERENCES and re-SAVES the observer PURELY to
			// re-enter propagation — the value never changes; the branch is a
			// dependency EDGE (numisdata161→numisdata36, tch241→tch40; the
			// ontology's own comment documents the chain: numisdata161 saves →
			// fires numisdata36 → fires numisdata77). TS models it as
			// write:'none' + payload 'with references' — NO TM row, NO dd197/
			// dd201 bump, NO live write (deliberate divergence from PHP's
			// re-save side effects: WC-2026-08-02-observer-relay-writes-nothing)
			// — re-entering through the D2 bounded dispatch.
			if (performFunction === undefined && server.filter === undefined && useObservable) {
				const relayTargets = [...targets];
				if (server.config?.use_self_section === true) {
					relayTargets.push({ section_tipo: sectionTipo, section_id: sectionId });
				}
				const relayDone = new Set<string>(); // in-loop duplicate targets are not "revisits"
				for (const target of relayTargets) {
					const relayKey = `${target.section_tipo}|${target.section_id}`;
					if (relayDone.has(relayKey)) continue;
					relayDone.add(relayKey);
					await emitCascadeHop(
						guard,
						observerTipo,
						'relay',
						String(target.section_tipo),
						Number(target.section_id),
						userId,
						now,
					);
				}
				continue;
			}

			if (!useObservable || performFunction !== 'set_dato_external') {
				console.error(
					`observer '${observerTipo}' ← '${observedTipo}': server shape not covered (ledgered)`,
					{ perform: performFunction, hasFilter: server.filter !== undefined },
				);
				continue;
			}
			const observableTargets = [...targets];
			if (server.config?.use_self_section === true) {
				observableTargets.push({ section_tipo: sectionTipo, section_id: sectionId });
			}
			for (const target of observableTargets) {
				const key = `${observerTipo}|${target.section_tipo}|${target.section_id}`;
				if (done.has(key)) continue;
				done.add(key);
				const outcome = await recomputeExternalRelation(
					observerTipo,
					String(target.section_tipo),
					Number(target.section_id),
					userId,
					now,
					// Live cascade: GROW-ONLY until the value law is fixed (see the
					// shrink fail-safe in recomputeExternalRelation) — additions
					// land, drops are withheld: a save must never be the door that
					// empties a target's mirror.
					{ allowShrink: false },
				);
				// D2: a PERSISTED recompute is a save — PHP's Save() re-enters
				// propagate_to_observers, so the written observer fires its own
				// observers, bounded and post-commit. A refused/withheld/no-drift
				// recompute wrote nothing → no hop (PHP: `$changed=false` skips
				// the Save and therefore the propagation too).
				if (outcome.wrote === true) {
					await emitCascadeHop(
						guard,
						observerTipo,
						'external',
						String(target.section_tipo),
						Number(target.section_id),
						userId,
						now,
					);
				}
			}
		}
	} catch (error) {
		// B6 completion (review 2026-08-02): the swallow is legal ONLY when no
		// ambient transaction can be poisoned. Inside one (import_csv wraps whole
		// rows; the terminal recompute's withTransaction JOINS it), a failed SQL
		// statement has already ABORTED the outer transaction — swallowing hides
		// the real error and every later statement fails with "current
		// transaction is aborted", pointing the operator at a phantom bug.
		// Rethrow so the transaction OWNER sees the real failure and fails fast.
		if (isInTransaction()) {
			incrementCounter('observers_propagation_failed_in_tx');
			throw new Error(
				`observer propagation failed inside an ambient transaction (B6) — '${observedTipo}' @ ${sectionTipo}/${sectionId}; rethrown so the transaction owner sees the real failure: ${error instanceof Error ? error.message : String(error)}`,
				{ cause: error },
			);
		}
		console.error('observer propagation failed (swallowed):', error);
	}
	return observersData;
}

/**
 * component_info observer recompute (PHP update_observer_data for a
 * use_db_data=false compute component — oracle-verified on scratch twins
 * 2026-07-10): resolve the target records, recompute the widgets per target,
 * write ONE matrix_time_machine row each (lg-nolan, the computed live
 * shape), NEVER touch the live misc column, and return the response data
 * item for targets equal to the saved record.
 */
async function recomputeInfoObserver(
	observerTipo: string,
	hostSectionTipo: string | undefined,
	server: NonNullable<ObserveEntry['server']>,
	savedSectionTipo: string,
	savedSectionId: number,
	userId: number,
	now: Date,
	cascade: CascadeGuard,
): Promise<unknown[]> {
	// targets
	const targets: { sectionTipo: string; sectionId: number }[] = [];
	const filter = server.filter;
	if (isSqoFilter(filter)) {
		// PHP: every clause's q := the saved record's locator, with
		// from_component_tipo taken from the FIRST clause's last path step (the
		// portal/relation the observer's section references the record through).
		const mutated = structuredClone(filter) as Record<
			string,
			{ q?: unknown; path?: { component_tipo?: string }[] }[]
		>;
		const firstKey = Object.keys(mutated)[0];
		const clauses = firstKey !== undefined ? mutated[firstKey] : undefined;
		if (!Array.isArray(clauses) || clauses.length === 0 || clauses[0] === undefined) {
			console.error(`observer '${observerTipo}': no elements in server.filter (PHP parity skip)`);
			return [];
		}
		const firstPath = clauses[0].path;
		const fromComponentTipo = Array.isArray(firstPath)
			? firstPath[firstPath.length - 1]?.component_tipo
			: undefined;
		const qLocator: Record<string, unknown> = {
			section_tipo: savedSectionTipo,
			section_id: String(savedSectionId),
		};
		if (fromComponentTipo !== undefined) qLocator.from_component_tipo = fromComponentTipo;
		for (const clause of clauses) {
			clause.q = qLocator;
		}
		// The registry's 4-step host resolution supplies the search section; the
		// caller refused the recompute if it was unresolved (step 4 — never a
		// guessed fallback).
		if (hostSectionTipo === undefined) {
			console.error(
				`observer '${observerTipo}': SQO recompute reached with an unresolved host section — refused (defense in depth; the dispatch guard should have caught this)`,
			);
			incrementCounter('observers_host_section_unresolved');
			return [];
		}
		const searchSection = hostSectionTipo;
		const { sanitizeClientSqo } = await import('../../concepts/sqo.ts');
		const { buildSearchSql } = await import('../../search/sql_assembler.ts');
		const sqo = sanitizeClientSqo({
			section_tipo: [searchSection],
			filter: mutated,
			limit: 1,
		});
		sqo.limit = 'all'; // PHP set_limit(0) = every referencing record
		const query = await buildSearchSql(sqo);
		const rows = (await sql.unsafe(query.sql, query.params as (string | number | null)[])) as ({
			section_tipo: string;
			section_id: number;
		} & Record<string, unknown>)[];
		for (const row of rows) {
			targets.push({ sectionTipo: row.section_tipo, sectionId: Number(row.section_id) });
		}
	} else {
		// filter:false — the observer lives on the SAME record that changed
		targets.push({ sectionTipo: savedSectionTipo, sectionId: savedSectionId });
	}

	const { computeInfoWidgets } = await import(
		'../../components/component_info/widgets/registry.ts'
	);
	const { normalizeWidgetEntryKeys } = await import(
		'../../components/component_info/widgets/widget_common.ts'
	);
	const { currentDataLang } = await import('../../resolve/request_lang.ts');
	const { currentPrincipal } = await import('../../security/request_context.ts');
	const principal = currentPrincipal();

	const responseItems: unknown[] = [];
	for (const target of targets) {
		const items = await computeInfoWidgets(observerTipo, {
			sectionTipo: target.sectionTipo,
			sectionId: target.sectionId,
			mode: 'list',
			lang: currentDataLang(),
			userId: principal?.userId ?? userId,
			isAdmin: principal?.isGlobalAdmin,
		});
		// TM row — the computed live shape (lg-nolan; PHP writes one per save;
		// the live misc column is deliberately NOT touched, matching PHP).
		await recordTimeMachine(
			{
				sectionTipo: target.sectionTipo,
				sectionId: target.sectionId,
				componentTipo: observerTipo,
				lang: 'lg-nolan',
				userId,
				data: items !== null && items.length > 0 ? items : null,
			},
			dbTimestamp(now),
		);
		// D2: PHP's info recompute also ends in Save() →
		// propagate_to_observers of the info component — in practice a leaf
		// (no shipped info component declares `observers`; emitCascadeHop's
		// pre-gate no-ops on leaves), carried for parity completeness.
		await emitCascadeHop(
			cascade,
			observerTipo,
			'info',
			target.sectionTipo,
			target.sectionId,
			userId,
			now,
		);
		// same-record target → the save response carries the recomputed item
		// (PHP observers_data; section_id STRING as PHP emits it here)
		if (target.sectionTipo === savedSectionTipo && target.sectionId === savedSectionId) {
			responseItems.push({
				section_id: String(target.sectionId),
				section_tipo: target.sectionTipo,
				tipo: observerTipo,
				mode: 'list',
				lang: 'lg-nolan',
				from_component_tipo: observerTipo,
				entries: normalizeWidgetEntryKeys(items ?? []),
			});
		}
	}
	return responseItems;
}

/** One seed locator of the external-value related-mode search. */
export interface ExternalSeedLocator {
	section_tipo: string;
	section_id: number;
	from_component_tipo: string;
}

/**
 * THE VALUE LAW's SEED (D3, pure half) — PHP set_dato_external builds its
 * inverse-reference search over MORE than the target record (v6
 * class.component_relation_common.php:1996-2022): the seed is the target
 * itself PLUS every locator reachable through properties.source
 * .data_from_field (the "equivalents" of the target — e.g. numisdata77's
 * peer numisdata36, the dd621 equivalent-types relation), EVERY entry
 * re-stamped with from_component_tipo = component_to_search (PHP
 * $locator_dato->set_from_component_tipo($component_to_search) — the search
 * must match the REFERENCING component's locators, never the peer's own
 * stamp). Semantically: the mirror lists records referencing THIS record OR
 * ANY OF ITS EQUIVALENTS.
 *
 * PURE by design (the peer bags arrive resolved) so the law is hermetically
 * gated in observer_seed_native.test.ts. Divergences from PHP, both
 * result-neutral: malformed peer locators are DROPPED (PHP would seed an
 * unsearchable half-empty locator) with a counted log — never a silent
 * narrow; and the seed is DEDUPED on (section_tipo, section_id) — PHP sends
 * duplicates into an OR filter whose GROUP BY collapses them anyway, so
 * dedup only trims SQL clauses.
 */
export function buildExternalSeed(
	target: { section_tipo: string; section_id: number },
	componentToSearch: string,
	// a peer's own from_component_tipo may ride along — it is IGNORED (the
	// re-stamp below is the law).
	peerLocators: { section_tipo?: unknown; section_id?: unknown; from_component_tipo?: unknown }[],
): ExternalSeedLocator[] {
	const seed: ExternalSeedLocator[] = [
		{
			section_tipo: target.section_tipo,
			section_id: target.section_id,
			from_component_tipo: componentToSearch,
		},
	];
	const seen = new Set<string>([`${target.section_tipo}|${target.section_id}`]);
	for (const peer of peerLocators) {
		const sectionId = Number(peer?.section_id);
		if (typeof peer?.section_tipo !== 'string' || !Number.isFinite(sectionId)) {
			console.error(
				'buildExternalSeed: malformed peer locator dropped (unsearchable — no section_tipo/section_id):',
				peer,
			);
			incrementCounter('observers_seed_malformed_peer_locator');
			continue;
		}
		const key = `${peer.section_tipo}|${sectionId}`;
		if (seen.has(key)) continue;
		seen.add(key);
		seed.push({
			section_tipo: peer.section_tipo,
			section_id: sectionId,
			from_component_tipo: componentToSearch,
		});
	}
	return seed;
}

/**
 * Injection seam for collectExternalSeed: node-properties lookup + the
 * related-graph access, so the WIRED law (data_from_field walk → typeRel
 * switch → closure → re-stamp) is testable without a DB. Production callers
 * pass nothing and get the live ontology + matrix graph.
 */
export interface ExternalSeedIO {
	getNodeProperties(tipo: string): Promise<unknown>;
	/** The peer's resolved MODEL — PHP's get_dato_with_references dispatch is
	 * polymorphic (only component_relation_related computes the closure), so
	 * the seed law needs the model, not just the properties. */
	getNodeModel(tipo: string): Promise<string | null>;
	graph?: RelatedGraphIO;
}

/**
 * The seed of the external-value search for one (observer node, target
 * record) pair — the ASYNC half of the D3 law: resolve each data_from_field
 * peer's bag "with references" (PHP get_dato_with_references — stored bag ∪
 * the typeRel-gated closure, see relations/related.ts
 * getStoredWithReferences) at the TARGET record, then build the pure seed.
 *
 * MEASURED (2026-08-02, 19,908 numisdata3 records holding numisdata77,
 * against the v6-migrated stored bags = v6's correct answer):
 *   self only:                       7,430 exact / 318,122 locators lost
 *   self + peer stored bag (1 hop): 11,953 exact / 247,933 locators lost
 *   self + dd621 transitive closure: 19,885 exact /      13 locators lost
 * The closure IS the law; a one-hop read is wrong by a quarter-million
 * locators.
 */
export async function collectExternalSeed(
	source: { data_from_field?: unknown } | undefined,
	componentToSearch: string,
	targetSection: string,
	targetId: number,
	io?: ExternalSeedIO,
): Promise<ExternalSeedLocator[]> {
	const peerBag: { section_tipo: string; section_id: string }[] = [];
	const dataFromField = source?.data_from_field;
	if (Array.isArray(dataFromField)) {
		const { getStoredWithReferences } = await import('../../relations/related.ts');
		for (const peerTipo of dataFromField) {
			if (typeof peerTipo !== 'string' || peerTipo === '') {
				// Never-narrow: a non-tipo entry cannot be walked — counted skip.
				console.error(
					`collectExternalSeed @ ${targetSection}/${targetId}: non-string data_from_field entry skipped:`,
					peerTipo,
				);
				incrementCounter('observers_seed_invalid_data_from_field');
				continue;
			}
			let properties: unknown;
			let model: string | null;
			if (io !== undefined) {
				properties = await io.getNodeProperties(peerTipo);
				model = await io.getNodeModel(peerTipo);
			} else {
				const node = await getNode(peerTipo);
				properties = node?.properties ?? null;
				// getModelByTipo (not node.model): forced-model/alias resolution must
				// match what the engine would instantiate for the peer. Its alias
				// resolution needs the component registry's lookup registered —
				// server/test entrypoints preload it, standalone scripts (the
				// reconciler) do not, so load it here (dynamic: keeps the module
				// graph acyclic, the file's established pattern).
				await import('../../components/registry.ts');
				model = node === null ? null : await getModelByTipo(peerTipo);
			}
			if (properties === null && model === null) {
				// Never-narrow (review 2026-08-02): a declared peer whose ontology
				// node is MISSING (dropped/partial install) silently degrades the
				// seed to stored-bag-only — the measured 247,933-locator-loss shape.
				// The walk still falls through to the stored bag (the best law
				// computable without the node), but LOUDLY: log + counter, mirroring
				// the invalid-entry branch above.
				console.error(
					`collectExternalSeed @ ${targetSection}/${targetId}: data_from_field peer '${peerTipo}' has NO ontology node — closure half skipped, seed degraded to the stored bag`,
				);
				incrementCounter('observers_seed_peer_node_missing');
			}
			// PHP instantiates the peer with DEDALO_DATA_NOLAN → lang lg-nolan
			// (relation data is nolan; lang only keys the traversal's cycle cache).
			peerBag.push(
				...(await getStoredWithReferences(
					peerTipo,
					targetSection,
					targetId,
					properties,
					model,
					'lg-nolan',
					io?.graph,
				)),
			);
		}
	}
	return buildExternalSeed(
		{ section_tipo: targetSection, section_id: targetId },
		componentToSearch,
		peerBag,
	);
}

/**
 * The next append item id: max FINITE numeric id + 1. A single malformed
 * legacy id (`Number('x')` = NaN) must NOT NaN-poison the reduce — NaN ids
 * serialize as `null`, so EVERY appended entry would share id null and break
 * id-based pairing (id_key/dataframe, TM restore) downstream (review
 * 2026-08-02; D3 multiplies addition volume, so one bad id would poison far
 * more writes). Non-finite ids are treated as 0 for the max — appends still
 * get finite, monotonic ids.
 */
export function nextObserverItemId(existing: { id?: unknown }[]): number {
	let max = 0;
	for (const entry of existing) {
		const numericId = Number(entry?.id ?? 0);
		if (Number.isFinite(numericId) && numericId > max) max = numericId;
	}
	return max + 1;
}

/**
 * PHP's big-result freeze (v6 class.component_relation_common.php:2087,
 * `$total_ar_result>2000`): above this the order-preserving merge is skipped
 * AND the save is withheld (`$changed = false; // avoid expensive save`) —
 * PHP computes but never persists. TS ports it as an explicit WRITE REFUSAL
 * (counted + logged; the compute still reports the diff). Reachable on this
 * install: rsc387 → cult1/5 holds 4,547 referencers.
 */
const EXTERNAL_REFERENCES_FREEZE = 2000;

/**
 * set_dato_external's default path: the component's data := every record
 * referencing (targetSection, targetId) through source.component_to_search
 * — OR any equivalent of the target reachable through source.data_from_field
 * (the D3 seed law, collectExternalSeed above) — limited to
 * source.section_to_search; existing entries kept in stored order, new
 * references appended with the next item id.
 *
 * EXPORTED for scripts/observer_reconcile.ts: the reconciler heals mirrors
 * that bulk doors (imports, tool_propagate, portalize, delete_data) left
 * stale by replaying THIS exact recompute per candidate record — one law,
 * one implementation. `write:false` = dry run (diff only, no persist/TM).
 *
 * CONCURRENCY (review 2026-07-24): the write phase runs inside ONE
 * withTransaction with the target row locked FOR UPDATE and the bag + index
 * truth RE-READ under the lock — two concurrent saves referencing the same
 * term serialize instead of last-writer-wins dropping the newer referencer,
 * and the TM pair + live write commit atomically. The dry run stays
 * lock-free. DROPS are refused by default (inside the lock — no TOCTOU,
 * MEMBERSHIP-based, grow-only merge — see the fail-safe below): additions
 * always persist, but no stored entry is dropped without an explicit
 * `allowShrink:true`; `skippedShrink` reports withheld drops. `options` is
 * deliberately REQUIRED — an omitted argument armed the 2026-08-02 wipe
 * (undefined !== false let shrinks commit), so every caller must state
 * intent.
 *
 * RETURN CONTRACT: `before`/`after` always describe the FULL-LAW diff
 * (stored → kept+additions, the law-(c) truth target) so dry runs and
 * refused shrinks report the same numbers an --allow-shrink apply would
 * write; when `skippedShrink` is set in apply mode the record actually holds
 * `before + additions` entries (drops withheld). `refusedSublaw` names the
 * unported PHP sub-law key when the node was refused wholesale (nothing
 * computed, nothing written). `possiblyTruncated` = a finite referencesLimit
 * was refused outright (nothing computed — see the guard below).
 * `refusedBigResult` = the PHP >2000-reference freeze withheld the persist
 * (apply mode: computed, not written; dry run: an apply would refuse).
 */
export async function recomputeExternalRelation(
	observerTipo: string,
	targetSection: string,
	targetId: number,
	userId: number,
	now: Date,
	options: { write?: boolean; allowShrink?: boolean; referencesLimit?: number },
): Promise<{
	changed: boolean;
	before: number;
	after: number;
	skippedShrink?: boolean;
	refusedSublaw?: string;
	possiblyTruncated?: boolean;
	refusedBigResult?: boolean;
	/** True ONLY when a live-column write actually persisted (D2: the cascade
	 * hops on this — PHP re-propagates only after a real Save()). Absent on
	 * dry runs, refusals, no-drift skips and pure withheld shrinks. */
	wrote?: boolean;
}> {
	const unchanged = { changed: false, before: 0, after: 0 };
	// REFERENCES_LIMIT IS NEVER HONOURED (deliberate divergence from PHP —
	// WC-2026-08-02-observer-references-limit-not-honoured). PHP threads
	// perform.params.references_limit into the search as a naked SQL LIMIT; on
	// the write path a capped result set is indistinguishable from "these
	// records stopped referencing you", and the order-preserving merge removes
	// by OMISSION. MEASURED: tchi1/162 stores 1,023 numisdata250 locators
	// against a declared references_limit:200 — honouring the cap would
	// persist a 200-entry bag and destroy 823 locators. The recompute always
	// searches with limit:false; a caller that ever passes a finite NONZERO
	// limit is refused OUTRIGHT (counted + logged) instead of truncating — the
	// refusal is the tripwire for anyone "completing" the params port later.
	// 0 is PHP's UNCAPPED sentinel (`$sqo->set_limit($references_limit)` with
	// 0 = 'ALL', v6 :2040 — most shipped observe configs declare 0), so a
	// faithful params port passing 0 means "no limit" and falls through
	// (review 2026-08-02: refusing 0 would dead-stop every recompute
	// install-wide the day the params port lands).
	if (options.referencesLimit !== undefined && options.referencesLimit !== 0) {
		console.error(
			`observer '${observerTipo}' @ ${targetSection}/${targetId}: finite referencesLimit (${options.referencesLimit}) REFUSED — a capped recompute is possibly truncated and the merge removes by omission (tchi1/162: cap 200 would destroy 823 of 1,023 locators)`,
		);
		incrementCounter('observers_references_limit_refused');
		return { ...unchanged, possiblyTruncated: true };
	}
	const node = await getNode(observerTipo);
	const source = (
		node?.properties as {
			source?: {
				section_to_search?: string[];
				component_to_search?: string[] | string;
				data_from_field?: unknown;
			};
		} | null
	)?.source;
	// UNPORTED PHP SUB-LAWS — REFUSE before anything else (Phase-0 disarm,
	// measured 2026-08-02): `set_observed_data` (sub-law a) and
	// `source_overwrite` (sub-law b, data_from_field) are NOT ported to TS,
	// but such nodes still carry the covered observe shape, so discovery
	// reaches this kernel with them and would run the DEFAULT law (c) — the
	// provably WRONG law for them. Armed case: numisdata679/965 (both
	// source_overwrite) search component_to_search=numisdata656 within
	// numisdata4, zero overlap with where their mirrors live
	// (numisdata665/691/651) → recompute = 0 = FULL WIPE. Dry-run measured on
	// real records: numisdata665/3120 1077→0, /830 959→0, /345 766→0, /3122
	// 700→0; exposure 118,449 + 13,357 locators. Observers run post-commit
	// with errors swallowed (propagateToObservers), so the refusal is a loud
	// log + ops counter, never a throw. Remove per-key when the sub-law is
	// actually ported.
	// `typeof === 'object'` (not a bare null-check): a malformed scalar source
	// (oh55 stores a string, oh90 a number — measured in both DBs) would make
	// the `in` operator THROW, and duplicate_record reaches this kernel with no
	// try/catch — a scalar must fall through to the counted component_to_search
	// skip below, like the old tolerant `source?.` access did.
	if (source !== null && typeof source === 'object') {
		for (const unportedKey of ['set_observed_data', 'source_overwrite']) {
			if (unportedKey in source) {
				console.error(
					`observer '${observerTipo}' @ ${targetSection}/${targetId}: properties.source.${unportedKey} is an UNPORTED PHP sub-law — recompute REFUSED (default law (c) would wipe/corrupt this mirror)`,
				);
				incrementCounter('observers_unported_sublaw_refused');
				// The distinct flag keeps the refusal VISIBLE to callers that
				// aggregate outcomes (the reconciler must never report these
				// nodes as clean — review 2026-08-02).
				return { ...unchanged, refusedSublaw: unportedKey };
			}
		}
	}
	const sectionToSearch = source?.section_to_search ?? 'all';
	const componentToSearchRaw = source?.component_to_search;
	const componentToSearch = Array.isArray(componentToSearchRaw)
		? componentToSearchRaw[0]
		: componentToSearchRaw;
	if (typeof componentToSearch !== 'string') {
		// Never-narrow law: a node with the covered observe shape but no
		// source.component_to_search cannot run law (c) at all — skip LOUDLY
		// (logged + counted), never a silent no-op that reads as a green
		// recompute.
		console.error(
			`observer '${observerTipo}' @ ${targetSection}/${targetId}: properties.source.component_to_search missing/non-string — recompute skipped (reason: law (c) is undefined without it)`,
		);
		incrementCounter('observers_component_to_search_missing');
		return unchanged;
	}

	const table = await getMatrixTableFromTipo(targetSection);
	if (table === null) return unchanged;

	// The recompute law over one consistent snapshot, in PIECES so the caller's
	// allowShrink decides what persists: `kept` = existing entries still
	// referenced (stored order, the full law's keep half), `additions` = new
	// references appended with the next item ids (PHP save id assignment).
	// Full law = kept+additions; grow-only merge = existing+additions.
	const compute = async (
		lock: boolean,
	): Promise<{
		exists: boolean;
		existing: StoredLocator[];
		kept: StoredLocator[];
		additions: StoredLocator[];
		referenceCount: number;
	}> => {
		const rows = (await sql.unsafe(
			`SELECT relation->$3 AS bag FROM "${table}" WHERE section_tipo = $1 AND section_id = $2${lock ? ' FOR UPDATE' : ''}`,
			[targetSection, targetId, observerTipo],
		)) as { bag: StoredLocator[] | null }[];
		if (rows.length === 0) {
			return { exists: false, existing: [], kept: [], additions: [], referenceCount: 0 };
		}
		const existing = rows[0]?.bag ?? [];
		const { findInverseReferences } = await import('../../search/search_related.ts');
		// THE D3 SEED (see collectExternalSeed): the target PLUS its
		// data_from_field equivalents (dd621 closure), every entry re-stamped
		// with component_to_search. limit:false ALWAYS (see the referencesLimit
		// refusal above — a capped write path destroys locators by omission).
		// Order = the PHP related-search default (section_tipo, section_id ASC —
		// v6 class.search_related.php:189): multi-section scopes (e.g. tch33
		// spans tch1+tch178) need the tipo tiebreak for a PHP-identical append
		// order; the pure-SQL mode avoids the 'table' branch's 9.7M-row probe.
		const seed = await collectExternalSeed(source, componentToSearch, targetSection, targetId);
		const references = await findInverseReferences(seed, {
			sectionTipos: sectionToSearch as string[] | 'all',
			limit: false,
			order: 'section_tipo_section_id',
		});
		const referenceKeys = new Set(
			references.map((row) => `${row.section_tipo}|${String(row.section_id)}`),
		);
		const kept: StoredLocator[] = existing.filter((entry) =>
			referenceKeys.has(`${entry.section_tipo}|${String(entry.section_id)}`),
		);
		// Dedupe additions against ALL existing keys (identical to deduping
		// against kept: an existing entry outside referenceKeys has, by
		// construction, no matching reference).
		const presentKeys = new Set(
			existing.map((entry) => `${entry.section_tipo}|${String(entry.section_id)}`),
		);
		let nextId = nextObserverItemId(existing);
		const additions: StoredLocator[] = [];
		for (const reference of references) {
			const key = `${reference.section_tipo}|${String(reference.section_id)}`;
			if (presentKeys.has(key)) continue;
			presentKeys.add(key);
			additions.push({
				id: nextId++,
				type: 'dd151',
				section_id: String(reference.section_id),
				section_tipo: reference.section_tipo,
				from_component_tipo: observerTipo,
			});
		}
		return { exists: true, existing, kept, additions, referenceCount: references.length };
	};

	// Dry run: diff only, no lock, no writes. Reports the FULL-LAW diff (the
	// truth target — this is the diagnostic that measured the wipe), plus
	// skippedShrink when an apply under these options would withhold drops and
	// refusedBigResult when an apply would hit the PHP >2000 freeze.
	if (options.write === false) {
		const { exists, existing, kept, additions, referenceCount } = await compute(false);
		if (!exists) return unchanged;
		const replaced = [...kept, ...additions];
		const changed = JSON.stringify(replaced) !== JSON.stringify(existing);
		const wouldWithhold = kept.length < existing.length && options.allowShrink !== true;
		const wouldFreeze = changed && referenceCount > EXTERNAL_REFERENCES_FREEZE;
		return {
			changed,
			before: existing.length,
			after: replaced.length,
			...(wouldWithhold ? { skippedShrink: true } : {}),
			...(wouldFreeze ? { refusedBigResult: true } : {}),
		};
	}

	const { withTransaction } = await import('../../db/postgres.ts');
	return withTransaction(async () => {
		// LOCK-HOLD OBSERVABILITY (review 2026-08-02): compute(true) holds the
		// target row's FOR UPDATE lock through the D3 closure walk + the uncapped
		// inverse search — on big observers (tchi1/162: 1,023 locators behind a
		// dd621 closure) that is seconds of lock hold, and under an ambient
		// import tx the lock lives until the whole row commits. Accepted trade
		// (the merge must adjudicate under the lock), but MONITORED: a slow
		// locked compute is logged + counted so contention shows up in the
		// counters page before it shows up as editor stalls.
		const lockedStart = performance.now();
		const { exists, existing, kept, additions, referenceCount } = await compute(true);
		const lockedMs = performance.now() - lockedStart;
		if (lockedMs > 2000) {
			console.warn(
				`observer '${observerTipo}' @ ${targetSection}/${targetId}: locked recompute took ${Math.round(lockedMs)}ms holding FOR UPDATE (counted: observers_recompute_lock_slow)`,
			);
			incrementCounter('observers_recompute_lock_slow');
		}
		if (!exists) return unchanged; // target record does not exist
		const replaced = [...kept, ...additions];
		// No drift → no write (PHP re-saves anyway; we skip the no-op to
		// avoid TM noise — the stored VALUE converges either way).
		if (JSON.stringify(replaced) === JSON.stringify(existing)) {
			return { changed: false, before: existing.length, after: replaced.length };
		}
		// BIG-RESULT FREEZE (PHP :2087 ported as a write refusal — see
		// EXTERNAL_REFERENCES_FREEZE): PHP skips the merge above 2000 results
		// and withholds the save ("avoid expensive save", changed stays false).
		// TS computes the full-law diff for honest reporting but persists
		// NOTHING — a counted, logged refusal, adjudicated inside the row lock.
		if (referenceCount > EXTERNAL_REFERENCES_FREEZE) {
			console.error(
				`observer '${observerTipo}' @ ${targetSection}/${targetId}: ${referenceCount} references exceed the ${EXTERNAL_REFERENCES_FREEZE}-reference freeze (PHP parity) — write REFUSED (${existing.length} stored, law wants ${replaced.length})`,
			);
			incrementCounter('observers_big_result_refused');
			return {
				changed: true,
				before: existing.length,
				after: replaced.length,
				refusedBigResult: true,
			};
		}
		// SHRINK FAIL-SAFE (Phase-0 disarm 2026-08-02, re-shaped same day after
		// review): dropping a stored entry requires an EXPLICIT allowShrink:true
		// — an omitted/false option can NEVER mean "allow" (the old `=== false`
		// guard never fired for the live cascade, which passed no options; that
		// hole armed the wipe above). reason: DELIBERATE, TEMPORARY trade —
		// until the value law is fixed (data_from_field recursive closure, PHP
		// sub-laws a/b — D3), the computed reference set is known to be TOO
		// SMALL, so every entry it wants to DROP is suspect. The refusal is
		// MEMBERSHIP-based and GROW-ONLY, not all-or-nothing (review
		// 2026-08-02): additions ALWAYS persist, so the cascade stays
		// convergent-upward on drifted records instead of blocking new
		// references forever, and no existing entry is ever dropped without
		// opt-in — the previous length-only guard let a 1-drop+1-add swap
		// commit the drop. Cost accepted: a LEGITIMATE removal (an unlinked
		// reference) is not mirrored until D3 lands or an operator runs
		// `observer_reconcile.ts --apply --allow-shrink`. REVISIT this default
		// when D3 ships.
		const dropped = existing.length - kept.length;
		const withheld = dropped > 0 && options.allowShrink !== true;
		if (withheld) {
			console.error(
				`observer '${observerTipo}' @ ${targetSection}/${targetId}: shrink REFUSED — ${dropped} stale entrie(s) kept (${existing.length} stored, law keeps ${kept.length}, +${additions.length} new) — allowShrink not granted`,
			);
			incrementCounter('observers_shrink_refused');
		}
		// What persists: the full law on opt-in, else the grow-only merge
		// (every existing entry kept in place + the additions appended).
		const finalData = withheld ? [...existing, ...additions] : replaced;
		if (JSON.stringify(finalData) === JSON.stringify(existing)) {
			// Pure withheld shrink: nothing to persist. `after` = the law's
			// target count (what --allow-shrink would write), like the dry run.
			return {
				changed: true,
				before: existing.length,
				after: replaced.length,
				skippedShrink: true,
			};
		}

		const { persistRecordKeys } = await import('../../section_record/index.ts');
		const stamp = dbTimestamp(now);
		const history = (await sql.unsafe(
			`SELECT 1 FROM matrix_time_machine
			 WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3 AND lang = 'lg-nolan' LIMIT 1`,
			[targetSection, targetId, observerTipo],
		)) as unknown[];
		if (history.length === 0) {
			await recordTimeMachine(
				{
					sectionTipo: targetSection,
					sectionId: targetId,
					componentTipo: observerTipo,
					lang: 'lg-nolan',
					userId,
					data: existing.length > 0 ? existing : null,
				},
				dbTimestamp(new Date(now.getTime() - 60_000)),
			);
		}
		await recordTimeMachine(
			{
				sectionTipo: targetSection,
				sectionId: targetId,
				componentTipo: observerTipo,
				lang: 'lg-nolan',
				userId,
				data: finalData.length > 0 ? finalData : null,
			},
			stamp,
		);
		// Chokepoint write: observer value + the owner's modified stamps (dd197/
		// dd201) in ONE update, like every PHP component save.
		await persistRecordKeys(
			{ table, sectionTipo: targetSection, sectionId: targetId },
			[{ column: 'relation', key: observerTipo, value: finalData.length > 0 ? finalData : [] }],
			{ userId, now },
		);
		// `after` = the full-law target (see the return contract). When drops
		// were withheld the record actually holds existing+additions entries.
		return {
			changed: true,
			before: existing.length,
			after: replaced.length,
			wrote: true,
			...(withheld ? { skippedShrink: true } : {}),
		};
	});
}
