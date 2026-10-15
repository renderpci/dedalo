---
title: The site builder's Claude Code agent no longer loads configuration from the site's own files, and refuses a Claude Code that cannot be told not to.
type: security
audience: admin
date: 2026-10-01
breaking: true
wc: WC-2026-10-01-site-builder-confinement-codes
---
Claude Code reads hooks, MCP servers, skills and settings from the project it works in and from its home directory. In a site builder workspace both are written by the agent itself (and by the site's build scripts), so a file planted in one turn ran as a shell command in the next, although the agent is denied a shell. Each Claude Code turn now loads its settings only from the site builder (no user, project or local source; only the site builder's own MCP server), and the site brief (AGENTS.md) is handed to the agent by the site builder instead of being read from the workspace. **Action needed:** the installed Claude Code must list `--setting-sources`, `--settings` and `--strict-mcp-config` in `claude --help` (verified on 2.1.286). The site builder checks this at start and before every turn; an older Claude Code is reported in the start log and every turn is refused until it is upgraded. In the site builder tool these refusals now read "cannot run its agent safely on this server" (an administrator must act) or "busy with this site" (try again in a moment) instead of a generic error.
