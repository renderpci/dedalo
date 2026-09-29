---
title: The RDF import no longer shows the internal address a refused link resolved to.
type: security
audience: developer
date: 2026-09-29
wc: WC-2026-09-29-rdf-per-uri-error-wire-body
---
When an RDF link was refused because its host leads into the institution's own network,
the per-link error list of `get_rdf_data` repeated the server's log text, which names the
internal address the host resolved to. Each failed link is now reported as
`{uri, error}`, where `error` is the same error body a failed request carries: a fixed,
public sentence and a code (`security.ssrf_blocked`), never the address. The import
screen shows one line per failed link, as before, now in the user's language when that
error has a translated label.
