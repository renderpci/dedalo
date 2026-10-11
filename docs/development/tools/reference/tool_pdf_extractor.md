# tool_pdf_extractor

Extracts the text (or structured HTML) of a record's PDF through an external `pdftotext` / `pdftohtml` engine and shows it in an inline preview for the cataloguer to copy. Read-only; PDF-only.

## What it does / why & when to use it

`tool_pdf_extractor` reads the default-quality file of a `component_pdf` instance, runs an external PDF text engine over it, and answers the extracted content already shaped for display: `{value, render_class}`. The client renders that answer in an inline preview; the cataloguer selects it (**Select text**) and pastes it where it belongs. It seeds a transcription from a PDF that already has a text layer — it does **not** OCR a scanned image.

Concrete heritage scenario: a documentary archive stores OCR'd journal articles as PDFs on its *Bibliography* records. A cataloguer opens the PDF component, runs the extractor over a page range with the **html** method, and copies the article text — with a `[page-n-…]` tag at each page break — into the record's transcription field, ready to index and publish. The register.json description states the extracted text is used "for publication searches".

Use it when a `component_pdf` has extractable text that should become a searchable/editable component value. Do not use it for image-only PDFs (nothing to extract) or for audio/video transcripts (that is the transcription tooling).

## How it works (server + client)

**Server** (`tools/tool_pdf_extractor/server/index.ts`). One declaratively gated action, `get_pdf_data` (`permission: 'record_tipo', minLevel: 1`). The handler:

1. validates the request with `pdfPayloadRequest(options)` (`tools/tool_pdf_extractor/server/pdf_payload.ts`) **before** any permission or filesystem work: `method` must be `'text'` or `'html'`, and `offset` must be an integer (a number or a string of digits; absent → `1`). Anything else is refused with `request.invalid_options` — never coerced;
2. asserts READ on the (section, component) pair (`getPermissions(principal, section_tipo, component_tipo) >= 1`) itself, refusing with `perm.denied` — the same pair the declarative gate checks, held at the door that reads the file;
3. resolves the media tool context via `resolveMediaToolContext(ctx.options)` (`src/core/media/tool_support.ts`) — the `spec`, `identity` and `pathOpts` for the target component;
4. refuses with `tool.unsupported_target` unless `spec.model === 'component_pdf'`;
5. delegates to `extractPdfCore(spec, identity, pathOpts, { method, pageIn, pageOut })` (`src/core/media/tools/pdf_extract.ts`), coercing `options.page_in` / `options.page_out` to numbers (or `null`);
6. shapes the raw output with `answerPdfPayload(raw, request)` — the SAME validated request, so the offset that was checked is the offset the page keys use — and answers it as the envelope's `data`.

`extractPdfCore` builds the absolute path of the record's **default-quality** PDF (`buildMediaLocation(spec, identity, spec.defaultQuality, 'pdf', pathOpts)`), throws `media.file_not_found` when it is absent, and calls `extractText` (`src/core/media/engine/pdf.ts`). `extractText` spawns the engine with argv `<engine> -enc UTF-8 [-f pageIn] [-l pageOut] [-i -p -noframes] <source> <outFile>` — `pdftotext` for `text`, `pdftohtml` for `html` (the `-i -p -noframes` flags apply to HTML only; `pdftohtml` has no `-layout` option and exits on it) — then reads the output file and returns a UTF-8-cleaned string (invalid sequences and control characters stripped). The engine binaries come from `config.media.binaries.pdftotext` / `pdftohtml`.

**The payload is shaped on the server** (`shapePdfPayload`, `pdf_payload.ts`):

- **text** → `{value: <the extractor's characters verbatim>, render_class: 'text'}`. Nothing is entity-encoded: an epigraphic edition such as `IMP CAES<A>R` arrives as the PDF holds it, and the client escapes it when it renders.
- **html** → the `pdftohtml` document is reduced to a fragment (doctype removed, `<head>` removed with its content, `<html>`/`<body>` unwrapped), each numeric `<a name="N">` page anchor is replaced by a Dédalo page tag paragraph `<p>[page-n-{N}-{key}-data:[{N}]:data]</p>` with `key = N - 1 + offset` (a non-numeric named anchor is ordinary content and stays), and the result passes the rich-text sanitizer (`src/core/security/html_sanitize.ts`) **last**, so nothing the shaping emits bypasses it. `render_class: 'html'`.

**Client** (`tools/tool_pdf_extractor/js/`). `tool_pdf_extractor.js` is the instance; it extends the standard `tool_common` lifecycle (`init` / `build` / `render` / `edit`). `render_tool_pdf_extractor.js` builds the panel: `page_in` / `page_out` number inputs, a `txt` / `html` radio pair (`txt` checked, `self.config.method` seeded to `'text'`), a **Process** button, an inline preview, and a **Select text** helper. `init()` also reads the page `offset` the PDF component stores (`caller.data.entries[0].lib_data.offset`, set with the offset input under the PDF viewer; absent → `1`).

`get_pdf_data()` sends the `tool_request` (below), including the `offset` (`config.offset`, sent as `1` when unset), with a **180-second** timeout and a **single** try (extraction can be slow on large files). The client re-parses nothing: the preview is `preview.innerHTML = render_value(data.value, data.render_class)` — the one render-boundary escaper (`client/dedalo/core/common/js/utils/render_escape.js`) escapes a `'text'` payload and passes an `'html'` payload the server already shaped and sanitized. A text preview also gets the `.text` class (`white-space: pre-wrap`, so the extractor's line breaks show). Nothing is broadcast to another component: the result is not written anywhere until the cataloguer copies it.

## Actions & options

`apiActions = { get_pdf_data: { permission: 'record_tipo', minLevel: 1, handler: getPdfData } }` — a single, declaratively gated, read-only action. The `'record_tipo'` gate asserts READ on the (section, component) pair **and** the per-record project-scope check before the handler runs; the handler repeats the pair check itself. There is no `backgroundRunnable`.

| Action | Gate | Background | Reads from `options` |
| --- | --- | --- | --- |
| `get_pdf_data` | declarative: `permission: 'record_tipo', minLevel: 1` | no | see below |

Options read by `get_pdf_data`:

| Option | Type | Meaning |
| --- | --- | --- |
| `method` | string | `'text'` (via `pdftotext`) or `'html'` (via `pdftohtml`). Any other value is refused with `request.invalid_options` (`"method must be 'text' or 'html'"`). |
| `offset` | integer \| digit string | The logical page number of physical page 1: html page tags carry `key = page - 1 + offset`. Absent, `null` or `''` → `1`. A non-integer (`'abc'`, `1.5`, `'2x'`) is refused with `request.invalid_options`. Ignored by the text method. |
| `component_tipo` / `tipo` | string | The `component_pdf` tipo whose file is read (resolved through `resolveMediaToolContext`). The server rejects a non-`component_pdf` model. |
| `section_tipo` | string | The parent section tipo. |
| `section_id` | string \| number | The record id. |
| `page_in` | number \| false | First page to extract (1-based, `-f`). `null`/absent → from the first page. The client sends `false` for "no restriction". |
| `page_out` | number \| false | Last page to extract, inclusive (`-l`). `null`/absent → to the last page. |
| `lang` | string | The caller's language code (sent by the client for context). |

Response: the envelope v2 `data` is `{ value: <string>, render_class: 'text' | 'html' }` (see above for how each is shaped). A failure is an `ok:false` envelope with a typed error (`request.invalid_options`, `perm.denied`, `tool.unsupported_target`, `media.file_not_found`, or an engine failure) — never an empty value. Wire contract: `engineering/wire_contract/WC-2026-10-11-pdf-extractor-render-class.md`.

## How it is registered & surfaced

`tools/tool_pdf_extractor/register.json` is a **column-keyed dump** (`string`/`relation`/`misc`/… keyed by component tipo — a seeded matrix-row snapshot, not a hand-authored file); `importTools()` passes it through as-is (see [register.json reference](../register_json.md)). The essentials it carries:

- `dd1326` name = `tool_pdf_extractor`; `dd1327` version = `1.0.4`; `dd1328` minimum Dédalo version = `6.0.0`; `dd1644` developer = "Dédalo team".
- `dd799` label = *Extract PDF file content* (localized across project languages); `dd612` and `dd1362` descriptions. The `dd1362` note records that extraction requires an installed `pdftotext`-style daemon (historically configured as `PDF_AUTOMATIC_TRANSCRIPTION_ENGINE`).
- `dd1633` config defaults name the engines: `text_engine` (`/usr/local/bin/pdftotext`) and `html_engine` (`/usr/local/bin/pdftohtml`). On this engine the effective binaries are resolved through `config.media.binaries.pdftotext` / `pdftohtml`.
- `dd1372` labels supply the localized UI strings the client reads via `get_tool_label(...)`: `page_in`, `page_out`, `total_pages`, `proces_method`, `do_process`, `select_text`.

**Where it appears.** The tool attaches to **`component_pdf`** components and renders as an inline component tool; the server refuses any other model. Its result is shown in the tool's own preview; it does not write to any other component.

## Examples

Client-side `tool_request` (built by `tool_pdf_extractor.js::get_pdf_data`, sent through `dd_tools_api`). Extract the plain text of a PDF component, all pages:

```js
const source = create_source(self, 'get_pdf_data') // → tool_pdf_extractor::get_pdf_data
const rqo = {
    dd_api  : 'dd_tools_api',
    action  : 'tool_request',
    source  : source,
    options : {
        lang           : component.lang,
        component_tipo : component.tipo,          // the component_pdf tipo
        section_tipo   : component.section_tipo,
        section_id     : component.section_id,
        method         : 'text',                  // 'text' (pdftotext) | 'html' (pdftohtml)
        page_in        : false,                   // false → from page 1
        page_out       : false,                   // false → to the last page
        offset         : 1                        // logical page of physical page 1
    }
}
const response = await data_manager.request({ body: rqo, retries: 1, timeout: 180 * 1000 })
// response_data(response) → { value: '<the PDF text, verbatim>', render_class: 'text' }
```

The client renders the answer by the class the server named — no decode, no reshaping:

```js
const extracted = response_data(response)
preview.innerHTML = render_value(extracted?.value, extracted?.render_class)
```

## Related

- [tool_transcription](tool_transcription.md) — PDF text extraction plus automatic audio/video transcription; the broader transcription surface.
- [tool_media_versions](tool_media_versions.md) — manages the on-disk qualities of a media component (including `component_pdf` files) that this tool reads from.
- [Creating new tools](../creating_tools.md) · [Server contract](../server_contract.md) — the tool model, `apiActions`, permission gates and lifecycle this page builds on.
- Source: `tools/tool_pdf_extractor/server/index.ts`, `tools/tool_pdf_extractor/register.json`, `tools/tool_pdf_extractor/js/{tool_pdf_extractor,render_tool_pdf_extractor}.js`; the extraction core: `src/core/media/tools/pdf_extract.ts`, the engine adapter: `src/core/media/engine/pdf.ts`.
```
