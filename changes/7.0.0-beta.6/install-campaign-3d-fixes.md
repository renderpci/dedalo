---
title: The installer refuses an installed instance's name up front, and a refused Review checks again on install.
type: fixed
audience: admin
date: 2026-10-14
---
- **Production, an instance name already installed on the host**: the System check, right after the name, now says `instance <i> is already installed on this host (<registry file or drop-in>)` and asks for another name. The Identity check no longer calls that instance's account "an earlier install's leftover" to remove with `userdel`, and a typed service user that belongs to another instance gets that instance's clash, not the leftover advice. A fresh headless run over a complete install of the name says the same instead of "resume it or undo it".
- **A refused Review**: pressing Enter (or typing `install` in `--plain`) measures the plan again; once the cause is fixed (a CA trusted, a port freed) it goes on to the `yes` prompt with every answer kept. The key bar says `enter check again` instead of `enter install`, and the untrusted-chain refusal says "check again" instead of "run this again".
- **The first instance on a fresh host**: when the run installs nginx, the closing To-do now includes the note about nginx's own default site on port 80 (`/etc/nginx/sites-enabled/default`).
- **Resume after an interrupted Docker install**: the released-lock line says whether the earlier run was in a container or on a host.
- **Docs**: `production.md` lists the update-server question before the domain ontologies, in the order the screens ask them.
