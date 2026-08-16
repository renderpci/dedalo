# WC-2026-08-09-av-fragment-failure-reason — dd_component_av_api.download_fragment: the failure says WHY

- **Date:** 2026-08-09, adopted with the port of `download_fragment`
  (`audits/2026-08_oh1_beta` §5.2, M6-lifecycle wave).
- **Decision:** no DEC- reference. It follows the CONVENTIONS.md posture that a
  refusal names what was refused.

## Shape before (PHP)

`dd_component_av_api::download_fragment` (class.dd_component_av_api.php:98)
answered, on ANY failure:

```json
{ "result": false, "msg": "Error on create the fragment file fragment_rsc36_oh1_1234_17.mp4", "errors": [] }
```

One string for every cause — a missing quality file, a watermark file absent from
disk, an ffmpeg that died, a time range that made no sense. `Ffmpeg::build_fragment`
distinguished all four internally and wrote them to `debug_log`; none of it
reached the response. `errors` was always `[]`.

## Shape after (TS)

Success is unchanged: `result` is the absolute URL of the fragment, `msg` is
`'OK. Request done successfully'`, `errors` is `[]`.

Failure keeps PHP's opening words and appends the cause, and `errors` carries the
same text (the shared `avActionFail` envelope this class already uses for its
other actions):

```json
{
  "result": false,
  "msg": "Error. on create the fragment file: download_fragment: the watermark file is missing (…/av/watermark/watermark.png) — a watermarked fragment cannot be produced, and an unmarked one is not a substitute",
  "errors": ["on create the fragment file: …"]
}
```

## Reason

The consumer is `download_av_fragment` in
`client/dedalo/core/component_av/js/component_av.js`, and on `result===false` it
does exactly two things: `console.error(msg)` and a **blocking `alert(msg)`**.
That string is the entire diagnosis anyone gets, and the four causes have four
different remedies — build the quality, install the watermark file, check the
box's ffmpeg, fix the index entry's time codes. PHP's one sentence sent every one
of them to a server log the person who clicked cannot read.

`errors` becoming non-empty is the same envelope every other failing action in
this class already emits (`avActionFail`), so the client's `api_response.errors`
handling meets nothing new.

## Gate reconciliation

No re-harvest: `download_fragment` has no fixture — it was never ported, so the
frozen store holds no response for it, and no parity gate covers it.

Gated by `test/unit/media_lifecycle_native.test.ts`: the action is registered on
`componentAvApiActions`, and each refusal (a tag_id that is not an identifier, a
non-positive duration, an absent watermark file) throws a message naming the
cause — which is what the handler relays.

## Addendum 2026-08-15 — the reason is no longer ON THE WIRE; it is the log, the cause and `debug`

The principle this entry established — a refusal names what was refused, and the
four causes have four different remedies — is kept. Its MECHANISM is replaced by
the closed taxonomy (`WC-2026-08-15-error-envelope-v2`,
`WC-2026-08-15-tool-response-envelope-v2`).

What changed: the free-text sentence built by `avActionFail` was operator
diagnostics travelling in the wire `msg`, and the disclosure ladder (ERRORS_SPEC
§2.2) does not allow that for an `internal`/operator-disclosure code — a media
path can name a filesystem location, an ffmpeg stderr can name anything at all.

```json
HTTP 500
{ "ok": false, "request_id": "…",
  "error": { "code": "media.action_failed", "category": "internal",
             "message": "The media operation could not be completed",
             "label_key": "error_media_action_failed", "retryable": false },
  "result": false, "msg": "The media operation could not be completed",
  "errors": ["media.action_failed"] }
```

`avActionFail(reason, cause)` (`src/core/api/handlers/media_action_context.ts`)
is the one throwing helper: it puts the reason in the DedaloError's `message`
(the log line) and the original in `cause`. `media.action_failed` is
`disclosure: 'operator'`, so the registry sentence is what reaches the wire and
the reason never does.

The four causes now live where they can be acted on without being published:

- the LOG line (`logError`, `[subsystem] imperative summary` + the error +
  coordinates — CONVENTIONS §1), which also increments `errors_total` and
  `error_<code>`;
- the `cause` chain, never serialized;
- `error.debug.exception` / `debug.cause_chain`, present only under
  `DEDALO_DEBUG_API_ERRORS=true`;
- and, where a cause is a CALLER fact rather than a machine fact (a tag_id that
  is not an identifier, a non-positive duration), its own `caller`-category code
  at 400 — which is the distinction the single 500 sentence used to blur.

The client consequence: `download_av_fragment`'s blocking `alert(msg)` no longer
shows a filesystem path to a curator. It renders `error.label_key` through the
labels catalog like every other failure, so the sentence is translated instead
of being English prose assembled server-side.
