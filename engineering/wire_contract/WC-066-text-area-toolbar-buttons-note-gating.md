# WC-066 — text_area `toolbar_buttons` note-gating fix (2026-07-29)

The server-gated CKEditor toolbar extras (`context.toolbar_buttons`:
button_person / button_note / reference / button_draw / button_geo) are now
emitted by the TS edit context (`resolve/structure_context.ts`). DELIBERATE
divergence from PHP `component_text_area_json.php:36-81`: **`button_note`
gates on `properties.tags_notes`** — the config the note flow actually reads —
where PHP gated it on `tags_persons` (and pushed it a second time with a
related geolocation); the TS list is deduped. On the shipped ontology (rsc36
declares both) the output is identical bytes. Gate:
`test/unit/tags_persons.test.ts` (toolbar_buttons block).
