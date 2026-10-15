---
title: A failed ontology update now says why, inside the Update ontology panel
type: fixed
audience: admin
date: 2026-09-30
---

When fetching the master's file list or importing the ontology failed, the
panel showed nothing — the error only reached the browser console. The panel
now shows the failure in place: the error, the server's explanation (for
example which address was refused) and the request id to find it in the
server log.
