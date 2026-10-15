---
title: The installer names a killed engine and shows what the engine said while it stopped.
type: fixed
audience: admin
date: 2026-10-14
---
- When the engine steps' process or container is killed (for example out of memory, or
  `docker kill`), the installer's ✖ line now says so, e.g. "the engine container was killed by
  SIGKILL — out of memory, or a kill", instead of quoting a Docker Compose progress line such as
  "Container dedalo-install-engine Created".
- After a Ctrl-C, the lines the engine prints while it stops (such as "ended the seed restore's
  database session") now appear inside the ✖ block, on both the full screen and the plain
  output. On the Docker routes they were lost before.
- On a production install that uses the institution's own certificate, the packages step no
  longer lists certbot, which it does not install.
