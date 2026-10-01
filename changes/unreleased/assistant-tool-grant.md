---
title: Only profiles granted the assistant tool can use the assistant.
type: security
audience: admin
date: 2026-09-30
breaking: true
wc: WC-2026-09-30-agent-tool-grant
---
With the assistant enabled on the server (`DEDALO_AGENT_HTTP_ENABLED`), any logged-in user could run it, even if their profile did not include the assistant tool. The assistant now requires the profile to grant `tool_assistant`, for global administrators too; only the root account holds every tool. **Action needed:** in the profile editor, grant the assistant tool to the profiles whose users should keep using it.
