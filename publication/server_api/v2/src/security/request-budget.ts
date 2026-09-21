/**
 * How much database work ONE request may commission — the bound under all the others.
 *
 * The per-parameter caps (MAX_LIMIT, MAX_RESOLVE_DEPTH, MAX_RESOLVE_ROWS,
 * MAX_RESOLVE_KEYS) each bound one dimension of fan-out. What reaches the database is
 * their PRODUCT: relation resolution is an explicit N+1, so a page of rows × the columns
 * asked to expand × the ids in each cell × the nesting depth is a number no single cap
 * sees. Audit 2026-08-26 (PUB-05) put the worst case at 10^5–10^6 statements for one
 * unauthenticated request against the read-only database a public museum site shares.
 * REQUEST_TIMEOUT_MS does not help: it abandons the promise, and the queries already
 * issued keep running.
 *
 * So the budget is charged where statements are actually SPENT — db/pool.ts `dbExecute`,
 * the one chokepoint every query in this service passes through — against a counter
 * carried in an AsyncLocalStorage scope opened once per HTTP request.
 *
 * TWO PROPERTIES THIS SHAPE BUYS, both of which a module-level counter would lose:
 *
 *   - Concurrency safety. Requests interleave in one Bun process; an ALS scope belongs to
 *     one request's async tree, so two callers can never spend each other's budget.
 *   - /batch honesty. router.dispatch re-enters the routing table in-process for each
 *     sub-query, so a batch would otherwise get MAX_BATCH_QUERIES fresh budgets. `run`
 *     REUSES an already-open scope instead of nesting a new one: the whole envelope shares
 *     the budget of the one HTTP request that carried it.
 *
 * OUTSIDE a scope (a script, a test calling a service directly) nothing is charged. That is
 * deliberate: the budget is a property of a served request, and a would-be enforcement that
 * fired in contexts with no request would only teach people to disable it.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { MAX_QUERIES_PER_REQUEST } from '../constants';
import { BudgetExceededError } from '../errors';

interface RequestBudget {
  spent: number;
  readonly max: number;
}

const budgetStore = new AsyncLocalStorage<RequestBudget>();

/**
 * Run `fn` inside a request budget. If one is already open (a /batch sub-query re-entering
 * the router) the SAME budget is kept — never reset, never stacked.
 */
export function withRequestBudget<T>(fn: () => T, max: number = MAX_QUERIES_PER_REQUEST): T {
  const existing = budgetStore.getStore();
  if (existing) return fn();
  return budgetStore.run({ spent: 0, max }, fn);
}

/**
 * Charge one statement. Throws BudgetExceededError (429) when the request has spent its
 * envelope — the caller asked for more work than one request may buy, and the honest
 * remedy is fewer resolve keys, a smaller page, or more requests.
 *
 * A no-op outside a scope (see the header).
 */
export function chargeQuery(cost: number = 1): void {
  const budget = budgetStore.getStore();
  if (!budget) return;

  budget.spent += cost;
  if (budget.spent > budget.max) {
    throw new BudgetExceededError(
      `This request exceeded its query budget of ${budget.max} database statements. Reduce the page size (limit), the number of resolve_relations keys, or split the work across requests.`,
    );
  }
}

/** What the current request has spent, or null outside a scope. Reporting only. */
export function currentBudgetSpent(): number | null {
  return budgetStore.getStore()?.spent ?? null;
}
