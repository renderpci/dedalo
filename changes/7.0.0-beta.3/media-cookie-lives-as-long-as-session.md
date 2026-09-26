---
title: The media access cookie now lives exactly as long as the session.
type: changed
audience: admin
date: 2026-07-25
---
`dedalo_media_auth` is re-issued on any authenticated request whose value is
missing or stale, with `Max-Age` = the session idle window.
[Media protection](./core/system/media_protection.md) ·
[login](./core/system/login.md).
