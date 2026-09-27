---
title: The multi-instance Apache example now sets an empty `DocumentRoot` and the entry redirects.
type: fixed
audience: admin
date: 2026-09-27
---
The Apache virtual host in [Multiple instances](./install/multi_instance.md) had no
`DocumentRoot`, so a vhost copied from it inherited the server-wide one (often
`/var/www/html`) and served its contents on any path it did not route. It now points
at an empty directory, like the single-instance reference, and carries the `302`
redirects from `/`, `/dedalo/` and `/dedalo/core/` to the login page. Check each
existing Dédalo vhost for a `DocumentRoot` line.
