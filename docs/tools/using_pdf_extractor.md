# PDF text extractor (`tool_pdf_extractor`)

> See also: [Tools user guide](index.md) · [Developer reference](../development/tools/reference/tool_pdf_extractor.md)

The PDF text extractor pulls the text content of a PDF you have attached to a record and drops it into a linked text field, adding page markers so you can locate each page later. It is meant to seed a transcription from a document you already hold, not to run OCR on a scan.

## What it's for

When a record carries a PDF — an article, a report, a printed catalogue page — you often want its text inside a Dédalo text field so it becomes searchable and editable alongside the rest of the record. Copy-pasting from a PDF loses the page boundaries that let a reader jump to "page 12". This tool extracts the text with the page structure intact and writes it into the target text area for you.

Concrete scenario: a documentary archive holds scanned-and-OCR'd journal articles as PDFs on each *Bibliography* record. A cataloguer opens the PDF component, runs the extractor, and the full article text lands in the record's transcription field with a page tag at each page break — ready to correct, index and publish.

!!! note
    This extracts the text layer already present in a PDF; it is **not** OCR. A PDF that is a pure image with no text layer will yield little or nothing. Make sure the PDF has extractable text first.

## When to use it

- A record has a PDF component and you want its text in a linked text field.
- You want page markers so a reader can locate a page within the extracted text.

When *not* to use it:

- The PDF is a photographed or scanned image with no text layer — extraction will be empty; the file needs OCR first.
- You want a transcript of audio or video — that is the transcription tooling, not this tool.

## Where to find it

The extractor is an **inline tool on a PDF component** (`component_pdf`). Open the PDF component on a record and you will find the **Extract PDF file content** action on it. It is PDF-only: it refuses to run on any other kind of component.

The extracted text is delivered to the record's linked **text area** component — the field configured to receive it — so both the PDF and its target text field live on the same record.

## Using it, step by step

1. Open a record that has a PDF component with an extractable text layer.
2. Launch **Extract PDF file content** on the PDF component. A small panel opens.
3. Optionally set **Page in** and **Page out** to extract only a page range. Leave both blank to extract the whole document — blank *Page in* starts at the first page, blank *Page out* runs to the last.
4. Choose the extraction method with the **txt / html** radio. **txt** (the default) produces the finished plain-text transcription with page markers. **html** extracts structured HTML and inserts a page tag at each page boundary.
5. Press **Process**. Extraction can take up to three minutes on a large document, so the panel shows a loading state while it works.
6. Review the extracted text in the inline **preview**. The result is also handed to the linked text-area component as its new value.
7. Use **Select text** to select the whole preview if you want to copy it elsewhere.

## Options

| Option | What it does |
| --- | --- |
| Page in | First page to extract (1-based). Blank means start at page 1. |
| Page out | Last page to extract, inclusive. Blank means run to the last page. |
| Method (txt / html) | `txt` extracts plain text (the default) with page markers already applied. `html` extracts structured HTML and inserts a page tag at each page break. |

## Tips and gotchas

!!! tip
    Leave both page fields blank to extract the whole PDF. Set a range only when you need one section — for example a single article inside a bound journal issue.

!!! warning
    Running the extractor sets the linked text field's value to the extracted text. If that field already holds a transcription you have edited, extraction **replaces** it — extract first, then correct, rather than the other way around.

!!! note
    Extraction relies on an external PDF text engine (`pdftotext` / `pdftohtml`) being installed on the server. If it is missing or the PDF has no text layer, the panel shows an error instead of text. This is an installation-level requirement your administrator sets up.

## Related

- **[Print](using_print.md)** — lays out record components (including long transcriptions) onto a printable page.
- **[Developer reference](../development/tools/reference/tool_pdf_extractor.md)** — the `get_pdf_data` action, options and the extraction engine.
