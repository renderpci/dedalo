---
title: Translation, transcription and RDF-import fetches now connect to the address the SSRF guard vetted (DNS rebinding closed); network failures report a typed reason.
type: security
audience: admin
date: 2026-09-30
wc: WC-2026-09-30-guarded-text-pinned-typed-transport
---
The guard used to check the server's address and then let the connection look the name up again, so a hostile DNS server could answer "public" to the check and "this machine" or "the internal network" to the connection. The connection now goes to the address that was checked, with the real name kept for the certificate and the `Host` header, for the translation and transcription services and for every RDF URI a cataloguer imports. Failures are typed instead of carrying the runtime's own error text: the RDF import reports the fixed sentence "The outbound request could not be completed" for each URI that failed (see [the RDF import tool reference](./development/tools/reference/tool_import_rdf.md)), while translation and transcription report a short message naming the reason, such as `hop connect failed (timeout)` or `redirect refused (HTTP 302)`, never an address. A translation or transcription request (a POST) that may already have reached the server is never re-sent to the server's other address, so a failed transcription request cannot start a second job; an RDF-import fetch (a GET, safe to repeat) may be retried on the next address.
