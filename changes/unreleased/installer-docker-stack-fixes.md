---
title: Docker and Trial installs probe the media gate again on resume, and name their images and locks correctly.
type: fixed
audience: admin
date: 2026-10-14
---
A `--resume` that starts the stack again (after an `--abort`, or a stopped stack) now runs every `stack_health` probe again, the media gate included, instead of `/health` only. A locally built image carries Dédalo's own `source`, `url`, `description` and `licenses` labels instead of empty ones. On a completed install, `--abort` no longer suggests `docker image rm postgres:18`, because PostgreSQL keeps running on that image. A resume after an interrupted run says in plain words that the earlier run's lock was released, with no warning sign. An untrusted certificate chain is refused on the Review, before `yes`. The Docker and Trial pages now give the exact command that reads the salt back, say the salt is not shown again by a later `--resume`, and include `node_modules` in the removal steps. The installer reference says `--image-version` also applies to a local build.
