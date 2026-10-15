---
title: Deleting a site while an agent session or a build is running is refused, and no longer blocks the site name.
type: fixed
audience: admin
date: 2026-10-01
breaking: false
---
A site could be deleted while an agent session was still working on it. The session kept writing its own history, which re-created an empty folder with the site's name. Creating a site with that name was then refused with the reason `workspace_exists` until an administrator removed the folder by hand. Every restart of the site builder also retried a recovery that could never succeed for that folder.

Now a delete is refused while a session, a build or a repository operation is running on the site. The response names what is running (for example `session_running`), and nothing is removed. Stop the session or wait for the build, then delete again. Sessions and builds can no longer re-create a deleted site's folder. At startup, the site builder ignores folders left by the old behaviour, so it no longer retries their recovery. Remove those folders by hand to free the name.
