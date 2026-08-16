# WC-2026-08-15-external-degradation-is-a-notice — a degraded source answers `ok:true` + `notices[]`, not an error

- **Date:** 2026-08-15 (P2 fold-in, `6c43cb46e0`).
- **Decision:** DEC-15. Normative source: `engineering/ERRORS_SPEC.md` §3
  (`notices[]`) and §5.4. Sibling of `WC-2026-08-15-error-envelope-v2` and
  `WC-2026-08-15-error-status-is-a-channel`.
- **Re-harvest: NO — impossible by definition.** External search has no frozen
  fixture at all: it did not exist in the oracle (the browser made the call —
  `WC-2026-08-06-external-search-request`).
- **Supersedes** the failure shape of `WC-2026-08-06-external-search-request`.

## What this covers

`dd_external_api::search` (`src/core/api/handlers/dd_external_api.ts`,
`searchDegraded`) — the answer when the REQUEST was fine and the SOURCE was
not: the service is disabled, unregistered, misconfigured, its host is off the
allowlist, its breaker is open, it timed out, it answered a bad status, it
overran the byte cap, or it spoke a protocol we do not.

## Shape before (TS, WC-2026-08-06)

```json
HTTP 200
{ "result": false,
  "msg": "Error. The external search did not complete",
  "errors": ["external_blocked_host"],
  "source_status": { "service": "zenon", "state": "misconfigured",
                     "label_key": "external_source_misconfigured", "retryable": false } }
```

`result:false` said "this request failed", which is not what happened: the
request was well-formed, authorised, and answered. What failed was a third
party. The client could only tell the two apart by reading `source_status`, a
key the envelope itself said nothing about — and the `errors` token
(`external_blocked_host`) belonged to a vocabulary that existed nowhere else.

## Shape after (TS)

```json
HTTP 200
{ "ok": true,
  "request_id": "…",
  "data": { "context": [], "data": [] },
  "notices": [ { "code": "external.blocked_host",
                 "label_key": "external_source_misconfigured",
                 "retryable": false,
                 "details": { "service": "zenon", "reason": "…"? } } ],
  "source_status": { "service": "zenon", "state": "misconfigured",
                     "label_key": "external_source_misconfigured", "retryable": false },
  "csrf_token": "…" }
```

- `data` is the EMPTY result set in its normal shape (`{context:[], data:[]}`)
  — the widget's rendering path is unchanged and never sees a special case.
- ONE notice per degradation. `code` is `external.<kind>`, a registered code:
  the registry is TOTAL over `ExternalErrorKind`, and each row's `retryable` and
  `label_key` are tripwired equal to the component_external state map, so a
  state can never acquire two different words.
- `details.service` names the counterparty (`details.reason` when the kind
  carries one — `external.bad_config`). Scalars only, per the code's declared
  `details_keys`; the failing URL is never on the error and never in a log
  (`originOf()` is the only permitted rendering of a target — CONVENTIONS §1).
- `source_status` is KEPT as an extension key during the compat window: it is
  the same object the record path (component_external) emits, built by the same
  `stateForKind` + `externalSourceStatus` pair, and the autocomplete source chip
  renders from it TODAY. **Removal condition:** the widget reads `notices[]`
  instead — then `source_status` goes, in one commit, with a WC entry.
- The finer grain the closed state set folds away (`blocked_host` and
  `not_registered` are both the `misconfigured` STATE) survives in
  `notice.code`, which is where an operator diagnostic belongs.

A CALLER fault on the same action is still an error and still throws: no
`source.tipo`, an unparseable page, a `limit` above the ceiling, an offset that
is not a whole number of pages, no read permission. Those get their registry
code, their non-2xx status (`WC-2026-08-15-error-status-is-a-channel`) and no
notice.

## Reason

`ok:false` is a statement about the request, and the request was right. Three
consequences of getting that wrong, all of which we had:

1. **The client cannot dispatch.** A refusal it must fix and a source that is
   temporarily down want opposite behaviours — one is a bug report, the other is
   a chip that says "try again later" over a search box that still works. Under
   one `result:false` both were "the search failed".
2. **The status channel becomes unusable.** Once degradation is an error, it
   must answer non-2xx (§3), and then a catalogue being briefly unreachable
   drives `requests_5xx` on a server that is perfectly healthy. Since a
   cataloguer types a query per keystroke, that is a permanent false alarm.
3. **`notices[]` is the general answer, not an external-search special case.**
   Identify warnings and truncation notices use the same channel; a subsystem
   that invented its own top-level key for "partially fine" would be the fifth
   vocabulary the closed taxonomy exists to remove.

The empty query keeps its own path and never leaves the browser at all: the
engine answers it with an empty result and no socket, and `external_engine`
short-circuits to a local `source_status` of state `empty_query` — the one
NEUTRAL state, which must not look like a failure.

## Gate reconciliation

`test/unit/external_search_native.test.ts` (a degraded search is `ok:true`,
carries exactly one notice, and the notice's code/label_key/retryable come from
the registry) · `external_search_action_native.test.ts` ·
`error_registry_native.test.ts` (the `external.<kind>` family is total over
`ExternalErrorKind` and agrees with the component_external state map) ·
`external_egress_tripwire.test.ts` and `external_search_target_tripwire.test.ts`
(unchanged by this entry) · client behaviour:
`client/dedalo/test/client/js/test_service_autocomplete.js`.

**Re-harvest: NOT NEEDED.** No frozen fixture covers this action, so
`adoptErrorEnvelopeV2` / `FROZEN_ERROR_BODIES` (`test/parity/normalize.ts`) do
not classify any body from this path — the eight rows they hold are the
oracle-era root `result:false` bodies listed in
`WC-2026-08-15-error-envelope-v2`.
