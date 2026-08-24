# WC-2026-08-19-tool-lang-translator-engine-type-and-browser-transformer — the tool_lang translator list carries `type` and the local AI engine

- **Date:** 2026-08-19 (ledgering a change that landed in
  `tools/tool_lang/register.json` before the cutover — the fixture predates it;
  measured as a red `tool_element_context_differential` assertion 2026-08-18).
- **Scope:** `tools/tool_lang/register.json` (`translator_engine` in the tool's
  registered `properties`), served through `get_element_context` for
  `source.model: 'tool_lang'`; consumed by `tools/tool_lang/js/*.js`.
- **Related:** `src/core/tools/translation.ts` (`browser_transformer` is
  client-only and never reaches the server provider seam; `google_translation`
  is not implemented server-side, in TS or in PHP);
  `tools/tool_lang/translators/browser_transformer/` (the in-browser runtime,
  pinned locally per RC-01 / W1-02).

## Shape before (PHP)

`translator_engine.value` items were `{name, label}` — two of them:
`babel` ("Babel") and `google_translation` ("Google translator").

## Shape after (TS)

Each item carries a `type` discriminator, and a third engine exists:

```json
[
  { "name": "babel",               "type": "server",  "label": "Babel" },
  { "name": "google_translation",  "type": "server",  "label": "Google translator" },
  { "name": "browser_transformer", "type": "browser", "label": "Local AI translator" }
]
```

Addendum 2026-08-23 (measured): a per-INSTALL config (dd996/dd999) may extend
the `browser_transformer` item with `models` — the local model catalog the
in-browser runtime offers (name/task/dtype/model_id/requires_webgpu per model);
the live install's record carries one. Additive, browser-consumed only, and
NOT part of the register default (dd1633), which this entry pins. Also
measured 2026-08-23: the register default had drifted to TWO engines
(`google_translation` missing) while the install-config slot and this entry
both carry three — the default was reconciled back to the pinned three.

`type: 'server'` engines are dispatched to `tool_lang`'s server action;
`type: 'browser'` engines run entirely in the client (no round trip). The
client keys its behaviour on `type`, so a config item without it is treated as
`server` — additive for any pre-existing install config.

## Why

Machine translation of heritage records must be possible without sending text
to an external service; the browser-local engine is the privacy-preserving
default and needs a wire-visible way to say "do not POST me". Adding `type`
rather than a naming convention keeps the engine list declarative and lets an
install add further local engines by config.

## Gate

The old differential (`tool_element_context_differential`, corpus-harvested)
pins the PRE-change bytes; it is corpus-bound and will be replaced by a
generic-TLD twin per `engineering/ORACLE_HARVEST.md` "Generic-TLD replacement
map". Until then this entry is the contract of record for the divergence.
