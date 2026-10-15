---
title: Asking a vision model for proposals, or identifying a photograph with an external encoder, now requires the identification tool permission.
type: security
audience: admin
date: 2026-10-01
wc: WC-2026-10-01-identify-vision-grant
---
Proposals from a vision model and image identification through an external service call a paid model and may send the object's photograph off the server. Any user who could read the section could start them. They now require the user's profile to include the identification tool; without it the request is refused before any model is called. Matching by record, proposals voted by similar records and a locally run image encoder cost nothing and are unchanged. Grant the identification tool to the profiles that should use the vision source.
