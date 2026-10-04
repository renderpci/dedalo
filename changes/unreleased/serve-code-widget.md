---
title: Building and serving code releases now has its own maintenance panel, Serve Code.
type: changed
audience: admin
date: 2026-09-28
wc: WC-2026-09-28-maintenance-serve-code-widget
---
The **Update code** panel used to hold two jobs: installing a new release on this installation, and — on a code server — building releases from git and serving them to others. The second job is now its own panel, **Serve Code**, shown only on a code server (`IS_A_CODE_SERVER=true`) or the development installation. **Update code** keeps installing, restoring and deleting restore points.

For scripts that build releases through the API: send the build request to `serve_code` instead of `update_code` (same action name, `build_version_from_git_master`, same options).
