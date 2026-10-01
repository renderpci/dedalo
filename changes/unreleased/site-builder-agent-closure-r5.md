---
title: The site builder's agent can no longer choose its own agent program, read another site's activity, or stall a turn with a planted brief.
type: security
audience: admin
date: 2026-10-01
breaking: true
---
Four gaps around the site builder's confined agent are closed.

- **The agent program is chosen by the site builder.** A site's agent program (Claude Code, OpenCode, …) was read from the site's own `site.json`, which the agent can edit. An agent could switch its next session to another program and plant a plugin that program loads. That bypassed every restriction placed on Claude Code. The choice made when the site is created is now kept in the site builder's private state. A site created before this update, or one whose record was removed, uses the instance's default agent program (`agent.driver`), never `site.json`.
- **One site's agent can no longer watch another's.** Each agent run already hid other sites' processes. It could still read the system's process-accounting files (`/sys/fs/cgroup`), which show another site's runs, when they started and how much they used. Every agent unit now hides that directory. **Action needed:** run `provision apply` after updating. Until the units are re-rendered, the site builder finds them different from what it expects and refuses every agent run.
- **A planted brief no longer stalls the site.** The site brief (`AGENTS.md`) is in a folder the agent writes. Replacing it with a pipe, a huge file or a file containing a NUL byte could hang every later turn or make every turn fail. The brief is now read without blocking, only up to its size limit, and refused with a clear message when it is not an ordinary text file. A turn's setup now also counts against the turn's time limit, and stopping a session reaches it.
- **An unusable Claude Code is reported, not hidden.** A Claude Code binary the site builder cannot run (missing, not executable, or under `/home`, which the site builder's service cannot see) was a generic, retryable error. It is now refused with "cannot run its agent safely on this server", naming the binary. A Claude Code check that fails once on a busy server, for example by timing out, is asked again at the next turn. It no longer refuses every turn until the site builder restarts.
