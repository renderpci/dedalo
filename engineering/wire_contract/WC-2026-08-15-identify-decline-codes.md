# WC-2026-08-15-identify-decline-codes — an identify DECLINE is a registered `identify.*` code with its own status

- **Date:** 2026-08-15 (P1 core-handlers sweep, `2fe4c51d55`).
- **Decision:** DEC-15. Normative source: `engineering/ERRORS_SPEC.md` §1/§4.
  Envelope: `WC-2026-08-15-error-envelope-v2`; status:
  `WC-2026-08-15-error-status-is-a-channel`. Subsystem spec:
  `engineering/IDENTIFY_SPEC.md`.
- **Re-harvest: NO — impossible by definition.** Object identification is a
  TS-only subsystem (built 2026-07-28); the oracle never had it, so there is no
  fixture for it in the frozen store.

## What this covers

`dd_identify_api` (`src/core/api/handlers/dd_identify_api.ts`) —
`find_matches`, `find_by_image` and their siblings: the situations where the
engine cannot ANSWER, as opposed to answering "no matches".

## Shape before (TS until today)

`decline()` built a body with its own private vocabulary — the fifth of the
engine's five disjoint failure grammars — and answered HTTP 200 with
`result:false` plus a reason string. So "this section has no identification
profile" (an ordinary, expected fact about the ontology) and "the embedding
provider is down" (a transient infrastructure failure) arrived at the client as
the same 200 with two different sentences.

## Shape after (TS)

`decline(code, publicMessage?)` is a THROW typed `never` — never a body — and
the dispatch chokepoint converts it. The codes and the statuses they carry:

| code | status | when |
|---|---|---|
| `identify.missing_seed` | 400 | no seed record resolved from the request |
| `identify.missing_section` | 400 | the seed names no section |
| `identify.invalid_profile` | 400 (public) | the profile parser refused it — the parser's own sentence reaches the curator |
| `identify.no_profile` | 400 | the section has no identification descriptor |
| `identify.invalid_source` | 400 (public) | the requested source set is unusable |
| `identify.rag_disabled` | 503 | the RAG subsystem is switched off |
| `identify.media_disabled` | 503 | media handling is switched off |
| `identify.missing_image` | 400 | image search with no image |
| `identify.invalid_image` | 400 | not decodable base64 / empty |
| `identify.image_too_large` | 400 | past the byte ceiling |
| `identify.egress_forbidden` | 403 (public) | the multimodal provider's host is off the allowlist |
| `identify.provider_unavailable` | 503 (public) | the provider did not answer |
| `identify.embed_failed` | 503 (public) | embedding the query failed |
| `identify.empty_index` | 503 (public) | the image index has nothing to match against |
| `identify.no_type_section` | 400 (public) | no Type section is reachable from this one |
| `identify.no_link_component` | 400 (public) | no criterion links this section to its Type section in one hop |

A permission refusal on this surface is `perm.denied` (403) — the SHARED code,
not an identify-private one, because "you may not read this record" is the same
fact everywhere in the engine.

**Order is unchanged, and a throw does not change it.** The section read grant
is still checked BEFORE the profile is loaded, so a caller with no access
cannot use the decline codes as an oracle for whether a section has an
identification descriptor. Two of the image-path checks
(`identify.missing_image`, `identify.invalid_image`, `identify.image_too_large`)
are produced by an internal `{ok:false, code, msg}` VALIDATION result that the
handler immediately relays through `decline(...)`; that struct is a local
return type, never a wire body.

## Reason

A decline is an ANSWER the client can act on — and the actions differ
completely: "no profile" means an operator must configure the section, "provider
unavailable" means retry in a minute, "egress forbidden" means an
administrator must edit the allowlist, "no matches" means the object is not in
the collection. Under `200 + result:false + prose` the identify widget could
distinguish none of them, so it showed one generic failure for all four and the
curator learned nothing.

The `retryable` flag and the status now carry that difference for free: the
`503` group is retryable infrastructure, the `400` group is a configuration or
request fact that retrying will not change, and `403` is a decision. Making the
malformed-profile case PUBLIC disclosure preserves the pre-existing contract
that a broken profile is LOUD — the parser's exact message still reaches the
person who wrote the profile, which was the point of that behaviour.

## Gate reconciliation

The identify native gates pin each decline path to its code and status, and
`error_registry_native.test.ts` holds the `identify.*` rows to
`status === CATEGORY_STATUS[category]`, a `master.json` label per code, and
`details_keys` ≡ label placeholders. `dispatch_error_native.test.ts` covers the
conversion at the chokepoint.

**Re-harvest: NOT NEEDED.** No identify body exists in the frozen store;
`adoptErrorEnvelopeV2` / `FROZEN_ERROR_BODIES` (`test/parity/normalize.ts`)
classify only the eight oracle-era root `result:false` bodies listed in
`WC-2026-08-15-error-envelope-v2`.
