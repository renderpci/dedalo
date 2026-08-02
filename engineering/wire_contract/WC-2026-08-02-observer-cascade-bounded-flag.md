# WC-2026-08-02-observer-cascade-bounded-flag — the transitive observer cascade is bounded and commit-gated (the flag is retired)

- **Date:** 2026-08-02 (D2, the guarded transitive dispatch). AMENDED the same
  day: the `DEDALO_OBSERVER_CASCADE` rollout flag this entry was named after
  was RETIRED once the benchmark cleared the cascade — the divergence from PHP
  is now "bounded + commit-gated", no longer "flagged". (The WC id is
  permanent; only the body is amended.)
- **Decision:** — (write-path safety posture; DEC-12 gates shipped with it:
  `test/unit/observer_cascade_native.test.ts`,
  `test/unit/commit_lane_native.test.ts`).

### Shape before (PHP)

PHP's propagation is transitively recursive and UNGUARDED: every recompute
and every relay ends in `Save()` → `propagate_to_observers` (v6
`class.component_common.php:1306/:1372`), with no visited set and no depth
budget — a cyclic observe graph infinite-loops the engine. The recursion also
runs INLINE in whatever transaction context the save happens to be in, and
each hop's re-save fires immediately, even if the surrounding operation later
fails.

### Shape after (TS)

`src/core/section/record/observers.ts` re-enters propagation ONLY through a
bounded dispatch, and the cascade is UNCONDITIONAL — every declared edge
fires on every install:

- **Visited set** keyed `observerTipo|performKind|section_tipo|section_id`
  (shared across the cascade tree): every node is dispatched EXECUTE-ONCE per
  cascade. A revisit whose node is already on its own branch's chain is a
  TRUE CYCLE — refused with a loud log naming the full chain +
  `observers_cascade_cycle_refused`; a node reached again through a
  DIFFERENT branch (a converged diamond) is skipped as benign dedup
  (`observers_cascade_converged_skipped`). **Value-level divergence from
  PHP**: PHP re-executes every arrival (its fixpoint can incorporate a
  payload changed by an intermediate recompute between the two arrivals); TS
  executes each node once, so on a diamond whose payload changes mid-cascade
  the sub-tree below the second arrival sees the first arrival's dispatch
  only. Latent by measurement — the shipped graphs are depth ≤ 2 with zero
  diamonds — and self-healing via `scripts/observer_reconcile.ts`.
- **Depth budget**: 8 hops. Exceeding it is a loud, counted stop
  (`observers_cascade_depth_exceeded`) naming the chain — never a silent
  truncation. (The measured real graph is depth ≤ 2 with zero cycles; the
  budget is a backstop.)
- **Commit-gated** (B6/W12): inside an ambient transaction (e.g.
  `import_csv_execute` wraps a whole row) hops are deferred to the
  commit-only lane (`registerCommitAction`, `src/core/db/postgres.ts`) — they
  fire only after the outer COMMIT, reading committed state, and are
  DISCARDED on rollback. `runObserverCascadeHop` refuses (throws, naming the
  chain) if it ever finds itself inside an ambient transaction. A
  registration the lane refuses (leaked continuation — the queue already
  drained) is a loud, counted drop (`observers_cascade_hop_dropped`), never
  silent. Symmetrically, a level-0 propagation failure INSIDE an ambient
  transaction rethrows to the transaction owner instead of swallowing (the
  outer tx is already aborted; hiding the cause poisons every later
  statement).
- A recompute hop fires only after a REAL persist (`wrote: true` from
  `recomputeExternalRelation`) — matching PHP, where `$changed === false`
  skips the `Save()` and therefore the propagation.

### The retired flag (history)

D2 originally shipped behind `DEDALO_OBSERVER_CASCADE` (`off` default |
`safe` | `on`) as a rollout safety valve pending a benchmark. The flag was
WRONG in kind, not just unnecessary: the mirrors are STORED relation data
declared by the ontology (`properties.observers`/`observe`), and those stored
values are exported by diffusion/publication — so a deploy setting that gates
whether declared edges fire makes two installations with the identical
ontology and identical edits store DIFFERENT values. It also demoted the
ontology as source of truth and silently narrowed declared behaviour by
configuration.

The benchmark that retired it (2026-08-02, read-only dry-run recompute = the
D3 closure walk + the inverse-reference search against the app DB): typical
external hop p50 1.3 ms / p90 3.1 ms / max 6.0 ms; widest 25 `numisdata77`
records (bags up to 1,189 entries) p50 10.6 ms / p90 20.0 ms / max 76.8 ms;
worst real case `rsc387`→`hierarchy93` @ `cult1/5` (4,547 referencers)
22.0 ms and already converged. Max cascade depth in the real ontology: 2 hops
(deepest chain `tch241 → tch40 → tch33`) across 71 declared forward edges,
zero cycles. Bulk projection at p50: 10,000 saved rows × 2 hops ≈ 27 s of
observer work total. (The previously-cited "~0.7 s per row" belongs to
INFO-widget observers walking a portal — a different code path.)

**Behaviour change at retirement**: the declared chains now fire for every
install (`numisdata161 → numisdata36 → numisdata77`; `tch241 → tch40 →
tch33`) — stale mirrors converge on save. Safe in the shrink direction: the
Phase-0 grow-only fail-safe still applies (a hop can ADD referencers but
cannot drop stored entries without an explicit `allowShrink:true`, which no
production caller passes).

### Reason

Unbounded recursion inside the save path is an availability hazard PHP
merely got away with (the shipped graphs happen to be acyclic); a bounded,
observable, post-commit dispatch preserves the cascade's convergence while
making the failure modes loud instead of a hang, and makes a rolled-back
import incapable of firing mirror writes for state that never existed.

### Gate reconciliation

`test/unit/observer_cascade_native.test.ts` — the unconditional 2-hop
convergence (a declared edge always fires), the loud cycle termination, the
depth-budget stop, the rollback-discard/commit-fire pair and the ambient-tx
refusal. `test/unit/commit_lane_native.test.ts` — the commit-only lane's own
contract (never fires on rollback, async-safe, drains outside the tx
context). No parity fixture replays observer cascades; **no re-harvest**
(impossible anyway).
