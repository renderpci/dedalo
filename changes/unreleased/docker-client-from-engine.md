---
title: On Docker, the browser client now always matches the engine that is running.
type: fixed
audience: admin
date: 2026-10-09
---
The proxy used to serve the browser client straight from the checkout on the host, while the engine ran from its image. When the two came from different versions — a checkout at one release behind an image of another — the client and the engine no longer understood each other, and pages broke in ways that looked like engine bugs. Now the engine publishes the client of its own image into a `client` volume each time it starts, and the proxy serves it from there. An update or a rollback therefore moves the client together with the engine. No action is needed: the new compose files declare the volume. If you keep your own compose file, give the `dedalo` service `DEDALO_CLIENT_PUBLISH_DIR: /srv/dedalo/client` with the `client` volume mounted there, and mount the same volume read-only in `nginx` instead of `./client` ([the files](./install/docker.md#the-files-and-where-they-live)).
