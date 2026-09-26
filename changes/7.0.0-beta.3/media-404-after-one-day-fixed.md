---
title: Images, video, PDFs and 3D files no longer 404 for anyone logged in longer than a day.
type: fixed
audience: user
date: 2026-07-25
---
Until this fix they did, while the application itself looked completely healthy. The media
cookie was minted only at login with a fixed 24-hour `Max-Age` while the
session refreshed on every request; since the *web server* enforces media
access, losing the cookie removed every media file with no other symptom. The
reverse leak is closed too — a cookie minted just before logout stayed a valid
media credential for up to 48 hours with no session behind it.
