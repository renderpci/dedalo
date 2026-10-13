# WC-2026-10-11-pdf-extractor-render-class — `get_pdf_data` answers `{value, render_class}`, shaped and sanitized on the server

- **Date:** 2026-10-11 (audit 2026-09-26 CLIENT-2, closure plan Step 8, lane 2).
- **Decision:** CLIENT-2 — ONE sanitizer, server-side; the client renders by a
  server-named render class and re-parses nothing.
- **Shape before (PHP):** `tool_pdf_extractor::get_pdf_data` returned
  `htmlentities($text, ENT_QUOTES, 'UTF-8')` as a bare string in `result`; the
  client decoded it (DOMParser → `textContent`), then for the `html` method
  re-parsed the decoded markup, replaced each `<a name="N">` page anchor with a
  page tag paragraph, serialised `body.innerHTML`, assigned it to the preview's
  `innerHTML` and published it on `set_pdf_data_<id_base>`. The TS port (until
  this entry) returned the RAW extractor output as a bare string in `data`
  (no encode), while the client kept the parse/serialise/innerHTML round trip
  for both methods — a text extraction rendered as markup, and the html method
  rode the mutation-XSS route.
- **Shape after (TS):** `data` is `{value: string, render_class: 'text'|'html'}`
  (`tools/tool_pdf_extractor/server/pdf_payload.ts` `shapePdfPayload`):
  - `method:'text'` → `{value: <pdftotext output verbatim>, render_class:'text'}`;
  - `method:'html'` → the pdftohtml document with the doctype removed, `<head>`
    removed with its content, `<html>`/`<body>` unwrapped, each numeric
    `<a name="N">` replaced by `<p>[page-n-N-K-data:[N]:data]</p>`
    (K = N − 1 + offset), then passed through the rich-text sanitizer
    (`src/core/security/html_sanitize.ts`) LAST; `render_class:'html'`.
  - The html method runs at all: `pdftohtml` is called WITHOUT the PHP-era
    `-layout` (a pdftotext-only option on which pdftohtml prints its usage and
    exits 1 — every html extraction failed; `src/core/media/engine/pdf.ts`).
  - New request option `offset` (integer — a number or a digit string; absent →
    1). Anything else is refused `request.invalid_options`. The client sends
    the offset the caller component_pdf stores — `data.entries[0].lib_data.offset`
    (absent/null/'' → 1). Before, the tool read the v6 `data.value[0].offset`,
    which a v7 component never carries, so every page tag was keyed as if no
    offset had been set.
  - The client renders `render_value(data.value, data.render_class)` (an absent
    or unknown class escapes) and no longer publishes `set_pdf_data_<id_base>`
    (no subscriber existed in `client/` or `tools/`).
- **Reason:** the text method is an archive transcription source — `CAES<A>R`
  and `a <gap/> b` must reach the curator character for character; the html
  method's markup must be judged by a spec tokenizer on the server, never by a
  client DOMParser round trip that re-serialises it.
- **Gate reconciliation:** no parity gate and no oracle-harvest fixture carries
  `get_pdf_data` (the action was never harvested), so NO re-harvest. Gates:
  `test/unit/tool_pdf_extractor.test.ts` (shapePdfPayload outcomes judged by the
  spec-parser oracle `test/helpers/html_oracle.ts`; the handler end to end on a
  gs-built hostile PDF for BOTH methods — the html case proves the validated
  offset reaches the page keys of a real pdftohtml run; offset refusal), `test/unit/pdf_extract_symmetry_tripwire.test.ts`
  (no client DOMParser; server never encodes), `client/dedalo/test/client/js/test_tool_pdf_extractor.js`
  (the real panel: text escaped, html rendered, missing class escaped, no publish;
  the tool built through its real `init()` from a component_pdf storing offset 5
  sends 5, and sends 1 when nothing is stored),
  `test/unit/render_escape_tripwire.test.ts` (sink ratchet 6 → 5).
