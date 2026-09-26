---
title: An expired session raises the re-login modal instead of a network error and blank widgets.
type: fixed
audience: user
date: 2026-07-25
---
The client's whole recovery path keys on the error code
`not_logged`, which the server never emitted (it put the human message in
`errors[]`), and the client's retry wrapper treated the 401 as a transport
failure and threw before the response could be read. Expiry now raises the
re-login modal in place, and pending saves replay on `login_successful`.
