---
title: RDF import now works with linked-data servers that redirect, and respects their robots.txt.
type: fixed
audience: user
date: 2026-10-01
breaking: false
wc: WC-2026-10-01-rdf-harvest-door
---
Linked-data servers usually answer an IRI by redirecting to the document that describes it (or from `http` to `https`). The RDF import refused every redirect, so on those servers each import failed. It now asks the IRI itself for RDF/XML and follows the redirects, checking every step. Servers that only answer at the IRI with `.rdf` appended still work: the tool tries that form when the first answer is not RDF/XML. The tool now also reads each site's `robots.txt` and spaces its requests to the same site a few seconds apart. A site that does not allow automated access gets a per-IRI message saying so, and nothing is fetched from it. One run fetches at most three IRIs. See [RDF import](./tools/using_import_rdf.md).
