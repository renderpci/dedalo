---
title: A production install can live in any folder and run as an existing account.
type: added
audience: admin
date: 2026-10-12
---
The Production route's Identity screen now asks, after the instance name, for the
**install folder** (default `/home/ded_<instance>`, any absolute path — for example
`/home/my_domain.org/dedalo`), the **service user** (default `ded_<instance>`) and the
**service group** (default: the user's own). The same answers are the flags
`--install-dir`, `--service-user`, `--service-group` and the answers-file keys
`install_dir`, `service_user`, `service_group` (production only). A new account is
created; an **existing** account — a hosting account — is used as it is and is never
created, changed or deleted by the installer, `--abort` included. The folder's parent
is never changed. The database role is the service user (peer authentication), and
the backups default to `<install folder>/backups`. The System check refuses another
instance's user, group or folder (and an account in another instance's group), root and
system accounts, the packages' accounts (`postgres`, the web server's), privileged
groups, a folder the installer may not use (an OS directory or another account's is
never taken over), and a backup dir that already exists; the Review shows what will be **CREATED** and what is
**USED AS IS**. The systemd templates now name no user or path: each instance's
drop-ins carry them, and a template without its drop-in runs nothing. See
[The install folder and the service account](./install/production.md#the-install-folder-and-the-service-account).
