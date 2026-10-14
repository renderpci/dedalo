---
title: On the Docker and trial routes, `--abort` removes an install interrupted before the engine container ever started, database included.
type: fixed
audience: admin
date: 2026-10-14
---
The installer counted a Docker or trial instance as *served* — a live instance that `--abort` never takes apart — as soon as `stack_up` began, before the `dedalo` container had started. An install stopped at that moment (a Ctrl-C, a failed `up -d dedalo`) was then kept by `--abort` as if it had served. Whether it served is now measured, as on the production route: the container started, or the engine answers `/health`; when that cannot be read, the instance is kept. An instance that never served is removed whole by `--abort --confirm-database <db>`. See [Resume and abort](./install/installer_reference.md#resuming-an-install-resume).
