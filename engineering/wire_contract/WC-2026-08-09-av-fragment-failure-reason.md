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
