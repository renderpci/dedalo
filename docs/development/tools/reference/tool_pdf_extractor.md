# tool_pdf_extractor

Extracts the text (or structured HTML) of a record's PDF and delivers it to a linked text component, via an external `pdftotext` / `pdftohtml` engine. Read-only; PDF-only.

## What it does / why & when to use it

`tool_pdf_extractor` reads the default-quality file of a `component_pdf` instance, runs an external PDF text engine over it, and returns the extracted string. The client hands that string to a target `component_text_area`, inserting page markers so the text keeps the document's page structure. It seeds a transcription from a PDF that already has a text layer — it does **not** OCR a scanned image.

Concrete heritage scenario: a documentary archive stores OCR'd journal articles as PDFs on its *Bibliography* records. A cataloguer opens the PDF component, runs the extractor over a page range, and the article text lands in the record's transcription field with a `[page-n-…]` tag at each page break — ready to index and publish. The register.json description states the extracted text is used "for publication searches".

Use it when a `component_pdf` has extractable text that should become a searchable/editable component value. Do not use it for image-only PDFs (nothing to extract) or for audio/video transcripts (that is the transcription tooling).

## How it works (server + client)

**Server** (`tools/tool_pdf_extractor/server/index.ts`). One declaratively gated action, `get_pdf_data` (`permission: 'record', minLevel: 1`). The handler:

1. reads `options.method` and rejects anything that is not `'text'` or `'html'` with an error envelope;
2. resolves the media tool context via `resolveMediaToolContext(ctx.options)` (`src/core/media/tool_support.ts`) — the `spec`, `identity` and `pathOpts` for the target component;
3. refuses with `'pdf extractor is pdf-only'` unless `spec.model === 'component_pdf'`;
4. delegates to `extractPdfCore(spec, identity, pathOpts, { method, pageIn, pageOut })` (`src/core/media/tools/pdf_extract.ts`), coercing `options.page_in` / `options.page_out` to numbers (or `null`);
5. returns `{ result: text, msg: 'ok', errors: [] }`, or `{ result: false, msg, errors }` on any thrown error.

`extractPdfCore` builds the absolute path of the record's **default-quality** PDF (`buildMediaLocation(spec, identity, spec.defaultQuality, 'pdf', pathOpts)`), throws `'pdf extractor: default-quality PDF not found'` when it is absent, and calls `extractText` (`src/core/media/engine/pdf.ts`). `extractText` spawns the engine with argv `<engine> -enc UTF-8 [-f pageIn] [-l pageOut] [-i -p -noframes -layout] <source> <outFile>` — `pdftotext` for `text`, `pdftohtml` for `html` (the `-i -p -noframes -layout` flags apply to HTML only) — then reads the output file and returns a UTF-8-cleaned string (invalid sequences and control characters stripped). The engine binaries come from `config.media.binaries.pdftotext` / `pdftohtml`.

**Client** (`tools/tool_pdf_extractor/js/`). `tool_pdf_extractor.js` is the instance; it extends the standard `tool_common` lifecycle (`init` / `build` / `render` / `edit`). `render_tool_pdf_extractor.js` builds the panel: `page_in` / `page_out` number inputs, a `txt` / `html` radio pair (`txt` checked, `self.config.method` seeded to `'text'`), a **Process** button, an inline preview, and a **Select text** helper. `init()` also reads a page `offset` from the caller's stored value (`caller.data.value[0].offset`, default `0`).

`get_pdf_data()` sends the `tool_request` (below) with a **180-second** timeout and a **single** retry (extraction can be slow on large files). `process_pdf_data()` post-processes the response:

- **text** — the server has already produced the final string; the browser only HTML-decodes it via `DOMParser` and returns it unchanged.
- **html** — the browser decodes the returned HTML, finds the `<a name="N">` anchors the engine inserts at each page boundary, and replaces each with a Dédalo page tag `[page-n-{N}-{key}-data:[{N}]:data]`, where `key = page_number - 1 + offset`.

The processed string is published on the `event_manager` channel `set_pdf_data_<id_base>` (with `id_base = <section_tipo>_<section_id>_<tipo>` of the caller), where the target `component_text_area` picks it up and stores it as its value.

## Actions & options

`apiActions = { get_pdf_data: { permission: 'record', minLevel: 1, handler: getPdfData } }` — a single, declaratively gated, read-only action. The `'record'` gate asserts both the component permission level **and** the per-record project-scope check before the handler runs. There is no `backgroundRunnable`.

| Action | Gate | Background | Reads from `options` |
| --- | --- | --- | --- |
| `get_pdf_data` | declarative: `permission: 'record', minLevel: 1` | no | see below |

Options read by `get_pdf_data`:

| Option | Type | Meaning |
| --- | --- | --- |
| `method` | string | `'text'` (via `pdftotext`) or `'html'` (via `pdftohtml`). Any other value returns an error envelope (`"method must be 'text' or 'html'"`). |
| `component_tipo` / `tipo` | string | The `component_pdf` tipo whose file is read (resolved through `resolveMediaToolContext`). The server rejects a non-`component_pdf` model. |
| `section_tipo` | string | The parent section tipo. |
| `section_id` | string \| number | The record id. |
| `page_in` | number \| false | First page to extract (1-based, `-f`). `null`/absent → from the first page. The client sends `false` for "no restriction". |
| `page_out` | number \| false | Last page to extract, inclusive (`-l`). `null`/absent → to the last page. |
| `lang` | string | The caller's language code (sent by the client for context). |

Response: `{ result: <string> | false, msg, errors }`. On success `result` is the extracted string; on failure `result` is `false` and `msg` / `errors` carry the reason (bad method, not a PDF, default-quality PDF not found, or an engine error).

## How it is registered & surfaced

`tools/tool_pdf_extractor/register.json` is a **column-keyed dump** (`string`/`relation`/`misc`/… keyed by component tipo — a seeded matrix-row snapshot, not a hand-authored file); `importTools()` passes it through as-is (see [register.json reference](../register_json.md)). The essentials it carries:

- `dd1326` name = `tool_pdf_extractor`; `dd1327` version = `1.0.4`; `dd1328` minimum Dédalo version = `6.0.0`; `dd1644` developer = "Dédalo team".
- `dd799` label = *Extract PDF file content* (localized across project languages); `dd612` and `dd1362` descriptions. The `dd1362` note records that extraction requires an installed `pdftotext`-style daemon (historically configured as `PDF_AUTOMATIC_TRANSCRIPTION_ENGINE`).
- `dd1633` config defaults name the engines: `text_engine` (`/usr/local/bin/pdftotext`) and `html_engine` (`/usr/local/bin/pdftohtml`). On this engine the effective binaries are resolved through `config.media.binaries.pdftotext` / `pdftohtml`.
- `dd1372` labels supply the localized UI strings the client reads via `get_tool_label(...)`: `page_in`, `page_out`, `total_pages`, `proces_method`, `do_process`, `select_text`.

**Where it appears.** The tool attaches to **`component_pdf`** components and renders as an inline component tool; the server refuses any other model. It delivers its result to the record's `component_text_area` through the `set_pdf_data_*` event, so the PDF and its target text field live on the same record.

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
        page_out       : false                    // false → to the last page
    }
}
const response = await data_manager.request({ body: rqo, retries: 1, timeout: 180 * 1000 })
// response → { result: '<extracted text>', msg: 'ok', errors: [] }
```

The client then post-processes and broadcasts the value to the target text area:

```js
const pdf_data = await self.process_pdf_data(response.result)
const id_base  = self.caller.section_tipo + '_' + self.caller.section_id + '_' + self.caller.tipo
event_manager.publish('set_pdf_data_' + id_base, { key: 0, value: pdf_data })
```

## Related

- [tool_transcription](tool_transcription.md) — PDF text extraction plus automatic audio/video transcription; the broader transcription surface.
- [tool_media_versions](tool_media_versions.md) — manages the on-disk qualities of a media component (including `component_pdf` files) that this tool reads from.
- [Creating new tools](../creating_tools.md) · [Server contract](../server_contract.md) — the tool model, `apiActions`, permission gates and lifecycle this page builds on.
- Source: `tools/tool_pdf_extractor/server/index.ts`, `tools/tool_pdf_extractor/register.json`, `tools/tool_pdf_extractor/js/{tool_pdf_extractor,render_tool_pdf_extractor}.js`; the extraction core: `src/core/media/tools/pdf_extract.ts`, the engine adapter: `src/core/media/engine/pdf.ts`.
```
