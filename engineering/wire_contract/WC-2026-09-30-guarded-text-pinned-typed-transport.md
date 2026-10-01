# WC-2026-09-30-guarded-text-pinned-typed-transport — `fetchGuardedText` connects pinned; its network failures are a typed `security.outbound_failed`

- **Date:** 2026-09-30 (SURF-2, 2026-09-26 audit closure, lane 4).
- **Decision:** `engineering/OUTBOUND_SPEC.md` §1/§2/§4 — the single-call door
  is `fetchPinnedHop` used once (vetted, pinned, any 3xx with a `Location`
  refused), and `fetchBoundedText` shares its transport core. Gates:
  `test/unit/guarded_text_pin_native.test.ts`,
  `test/unit/outbound_fetch_tripwire.test.ts`,
  `test/unit/job_lane_budget_native.test.ts` (the primitive),
  `test/unit/tool_import_rdf.test.ts` (the RDF door's per-URI body).
  Amends `WC-2026-09-29-rdf-per-uri-error-wire-body` (the per-URI `error` body).

## Shape before (TS)

`fetchGuardedText` vetted the name with `assertPublicUrl`, then handed the NAME
to a bare `fetch` (via `fetchBoundedText`), which resolved it again at connect —
the DNS-rebinding window. A transport failure, a timeout or a redirect surfaced
as Bun's own error: `TypeError` / `AbortError`, with Bun's message (e.g.
`The operation was aborted.`, `Unable to connect…`, `UnexpectedRedirect`).
Where a caller published `error.message` that text reached the wire:

- translation (`babelProvider`) and transcription (`babelTranscriberProvider`):
  `{ok: false, msg: <Bun's message>}`;
- `tool_import_rdf` `get_rdf_data`: `errors[i].error` was
  `toErrorBody(toDedaloError(<raw error>))` — an untyped error, so the
  converter's `internal.unexpected` body.

A non-2xx was already typed (`security.outbound_failed`, message `HTTP <n>`,
`status`) and an address refusal already `security.ssrf_blocked` — both
unchanged.

## Shape after (TS)

The socket connects to the vetted address (Host and TLS server name kept at the
real name); the name is resolved once. Every non-address failure is a
`DedaloError('security.outbound_failed')`:

| Failure | message | log-only coordinates |
|---|---|---|
| resolver stalled past the deadline | `hop resolve failed (timeout)` | `reason: timeout`, `stage: resolve` |
| connect failed / timed out / job stopped | `hop connect failed (<reason>)` | `reason: transport \| timeout \| aborted`, `stage: connect` |
| body stalled / failed | `no response bytes for <n>ms` / `hop body failed (<reason>)` | `reason: idle \| …`, `stage: body` |
| body over the ceiling | `response exceeds <n> bytes` | `reason: body_cap` |
| 3xx with a `Location` | `redirect refused (HTTP <n>)` | `reason: redirect`, `status` |
| non-2xx | `HTTP <n>` (unchanged; the body is cancelled unread, as before — a stalled or oversized error page is still `HTTP <n>`) | `status` (unchanged) |

So translation and transcription publish `{ok: false, msg: 'hop connect failed (transport)'}`
(etc.) instead of Bun's text, and `tool_import_rdf`'s per-URI `error` is the
registry body of `security.outbound_failed` (category `unavailable`, retryable,
the registry's fixed sentence) instead of `internal.unexpected`. The fixed
sentences name no address and no host. A method other than GET/POST, a body
other than a string / `URLSearchParams`, or an init key other than
`method`/`headers`/`body` is `request.invalid_data` (refused, never silently
dropped) — no current caller sends one.

## Reason

A refusal that one TTL=0 record can bypass is no refusal: the door whose URL a
client supplies (`tool_import_rdf`) must connect where it checked. Typing the
failures gives the client and the operator a stable, non-disclosing reason
(`timeout` vs `transport` vs `redirect`) instead of a runtime's internal text.

## Gate reconciliation

No parity gate covers these failure paths (the frozen store holds no
translation, transcription or `get_rdf_data` transport failure); no re-harvest
is involved. The TS-native gates above carry the contract, at two levels:

- **The primitive** — every row of the table above, on both text doors
  (`guarded_text_pin_native`, `job_lane_budget_native`).
- **The RDF door** — `tool_import_rdf.test.ts` drives `loadRdf` through the
  guard's seam (a refused connection, a 303) and asserts the published per-URI
  body: `security.outbound_failed`, `unavailable`, retryable, the registry
  sentence, no host, address or runtime text.

**Not door-gated (open):** translation's `babelProvider` and transcription's
`babelTranscriberProvider` publish `(error as Error).message`, which is now the
typed `hop connect failed (<reason>)`; no gate drives either provider through a
transport failure, because neither has a resolver/socket seam
(`src/core/tools/translation.ts`, `src/core/tools/transcription_asr.ts`). Until
one lands, the `msg` rows above are guaranteed only by the primitive's message.
