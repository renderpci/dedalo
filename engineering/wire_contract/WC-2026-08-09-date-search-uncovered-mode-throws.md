# WC-2026-08-09-date-search-uncovered-mode-throws — an unhandled `date_mode` throws instead of emitting no predicate, and search times are always DERIVED

- **Date:** 2026-08-09 (audits/2026-08_oh1_beta REPORT §5.5, WS-5).
- **Decision:** DEC-15 (deliberate divergence), plan §9 (no silent narrowing).

## Context

The ordinary-table (JSONB) date search was rebuilt on this date to PHP's real
interval-overlap semantics (`trait.search_component_date.php`
`resolve_date_mode_date_range_sql` + `component_date::get_final_search_range_seconds`)
and to PHP's per-`date_mode` dispatch. **That rebuild is PHP PARITY and is not a
divergence** — see the WC-036 addendum for why the previous single
`start.time == <first second of the period>` predicate was the bug it replaced.

Two things in the rebuilt builder do NOT match the frozen oracle. They are
recorded here.

## 1. An unhandled `date_mode` throws

- **Shape before (PHP):** `dispatch_date_mode_sql`'s `default:` arm calls
  `resolve_date_mode_unknown_sql`, which logs `logger::ERROR` and returns the
  query object **with no `sentence` and no `params` at all**. The clause
  contributes nothing and the search silently produces an empty (or unfiltered,
  depending on the caller's grouping) result. `time_range` is a REAL configured
  mode on live installs (`actv59` on the mht archive) and lands there.
- **Shape after (TS):** `builder_date.ts` throws
  `search builder_date: date_mode '<mode>' is not implemented (uncovered scope; PHP emitted no sentence at all here)`.
- **Reason:** the project's standing rule is that an uncovered path throws
  loudly and gets a ledger line, never a plausible-but-narrowed result. A date
  field whose search silently answers "nothing" is exactly the failure class the
  2026-08 audit was convened over; a 500 with the mode in the message is
  diagnosable, a blank result set is not. Implementing `time_range` would be
  inventing behaviour the oracle never had — that is a separate, deliberate
  decision with its own entry, not something to slip in under a bug fix.

## 2. The comparison time is always DERIVED, never taken from the client

- **Shape before (PHP):** `extract_time_from_q` prefers the client's
  precomputed `q->start->time` when it is non-empty, and only recomputes from
  y/m/d/h/m/s when it is absent.
- **Shape after (TS):** the ordinal is ALWAYS recomputed from the components via
  the `dd_date::convert_date_to_seconds` port.
- **Reason:** jsonpath forbids bind parameters, so this integer is INLINED into
  the predicate literal. `builders/types.ts` states the rule — values embedded
  in a jsonpath literal are built from validated or derived data only. For a
  well-formed widget value the two paths agree exactly (the client runs the same
  arithmetic); they differ only when the client's `time` disagrees with its own
  fields, and in that case the fields are the honest answer (the same reasoning
  `test3_canonical_fixture.test.ts` "every date stamp agrees with its own
  fields" already gates on the write side).

## Also unchanged, recorded so it is not mistaken for new

`sanitize_date_q_operator` (PHP) coerces an unrecognised `q_operator` to `'='`
with a warning. TS throws instead, as it did before this change. Same posture as
(1): a silently rewritten operator answers a question the curator did not ask.

## Gate reconciliation

`test/unit/search_date_and_ancestors_native.test.ts` —
"an unhandled date_mode THROWS instead of silently returning nothing" pins (1)
against `time_range`. (2) is pinned implicitly by every predicate assertion in
that file and in `search_date_builder.test.ts`: each expects the ordinal derived
from the components, and the fixtures' stored `time` values are never fed back
in. **No re-harvest** — the frozen store carries no date-search fixture for an
uncovered mode, and there is no live oracle left to diff against.
