# WC-2026-09-29-rdf-per-uri-error-wire-body — `tool_import_rdf` reports each failed IRI as `{uri, error}`, `error` the error system's wire body

- **Date:** 2026-09-29 (verification round 3 of the harvesting-door review).
- **Decision:** the disclosure rule of `engineering/OUTBOUND_SPEC.md` §1 and
  `docs/development/tools/security.md` item 7 — a tool reports an outbound
  failure as `toErrorBody(toDedaloError(error))`, never as `error.message`.
  Gate: `test/unit/ssrf_one_guard_tripwire.test.ts` (a tool holding an outbound
  door reads no `.message`) and `test/unit/tool_import_rdf.test.ts`.

## Shape before (PHP)

`tool_import_rdf::get_rdf_data` answered `{result, msg}`; an IRI that failed
ended the call. The TS port (envelope v2) returned `data: {rdf, errors}` with
`errors: string[]`, each `"<uri>: <error.message>"` — and the SSRF guard's
message names the address a refused host resolved to
(`ssrf: localhost resolves to a private/reserved address (::1)`), so any user
with write access to the target section learned what an internal name resolves
to: the probe oracle the guard's `security.ssrf_blocked` disclosure level
exists to deny.

## Shape after (TS)

`data: {rdf: [{uri, subjects}], errors: [{uri, error}]}`. `error` is the same
body a failed call carries (`code`, `category`, `message`, `label_key`,
`retryable`, `details?` — plus `debug` only under the operator's own debug
ladder): for a refused address, `code: 'security.ssrf_blocked'` and the
registry's fixed sentence, never the address. The client
(`tools/tool_import_rdf/js/render_tool_import_rdf.js`) renders
`<uri>: <error.message>` per line.

## Reason

The per-URI list is a payload the page shows verbatim; its text must be the
public sentence, not a log line.

## Gate reconciliation

No parity gate covers `get_rdf_data` (no fixture in the frozen store); no
re-harvest is involved. The TS-native gates above carry the contract.

## Addendum 2026-09-30 — a transport failure's `error` is now typed

`fetchGuardedText` now connects pinned and types its network failures
(`WC-2026-09-30-guarded-text-pinned-typed-transport`): a timeout, a failed
connect, a stopped job or a refused redirect reaches `errors[i].error` as the
`security.outbound_failed` body (category `unavailable`, retryable, the
registry's fixed sentence) instead of `internal.unexpected`. The `{uri, error}`
shape is unchanged.
