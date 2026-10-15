---
title: The PDF extractor shows extracted text exactly as the PDF holds it, and its HTML mode is cleaned on the server.
type: fixed
audience: user
date: 2026-10-11
wc: WC-2026-10-11-pdf-extractor-render-class
---
In **text** mode the extractor used to read the extracted text as if it were web markup, so anything between angle brackets disappeared from the preview — an epigraphic edition such as `IMP CAES<A>R` became `IMP CAESR`, and that was what "Select text" copied into the record. Now the preview shows the characters exactly as the PDF holds them. In **HTML** mode the page markers are now added on the server, using the page offset set on the PDF field, and the result is cleaned by the same sanitizer that cleans rich text on save before the preview shows it; a PDF with no page markers no longer produces an empty preview. HTML mode also works again with current versions of the PDF tools on the server: an option they do not accept made every HTML extraction fail.
