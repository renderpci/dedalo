---
title: A site's AI turn no longer runs commands planted in the site's git settings, and the site builder says why it refuses a run.
type: security
audience: admin
date: 2026-10-01
breaking: true
---
Eight gaps around the site builder's confined agent are closed.

- **A turn no longer runs commands planted in the site's git settings.** Claude Code runs `git` itself when a turn starts. It switches off git's hooks for that, but not its content filters. A build script, a git hook or the agent itself could add a filter to the site's `.git/config`, and the next turn then ran that filter's command as the site's user, with the AI provider's key and the museum connection. Setting git's own environment variables does not help: Claude Code removes them. Each turn now runs with the site's `.git` folder hidden, so no `git` the turn starts finds a repository. **Action needed:** run `provision apply` after updating. Until the units are re-rendered, the site builder finds them different from what it expects and refuses every turn. A site whose folder has no `.git` is now refused a turn, with a message that names the missing folder.
- **The site builder reads systemd's answers correctly on Ubuntu 24.04 and Debian 12.** systemd prints some settings, such as `TemporaryFileSystem=`, as one line per entry. The site builder kept only the last line, so on those systems it would have refused every agent run as "not what this daemon expects". It now reads every line.
- **"systemd cannot say" never frees a site.** When systemd does not answer a question about a run (a timeout, a D-Bus or polkit error, an answer with a value missing), the site stays held until systemd answers. It is never treated as finished or idle.
- **A refused stop is named.** When systemd refuses to stop a run, for example because the polkit rule is missing or polkitd is not running, the refusal and the site's "unavailable" message now quote systemd's answer and point at the polkit rule.
- **A host that cannot confine runs says so at start.** The site builder now checks the host when it starts: the systemd version, each site's user and groups, and the files a run starts from. If something is wrong, it writes the reason to its log at start, instead of failing the first request. It still starts, and refuses each run until the host is fixed.
- **Session records and site folders are checked before a run.** A session's saved settings are used only if they name that same session and site, and only from folders the site builder created itself. A site folder that has been replaced by a link is refused before any run starts.
- **A broken turn setup is reported at start, not at the first turn.** The git settings file root renders for every turn, and the systemd units each site's runs use, are now checked when the site builder starts and before a session is accepted. A missing or altered settings file, or an extra drop-in on a unit, is written to the log at start and refused before any work is reserved. A site whose `.git` is a link or not a folder is refused a turn, with a message naming it.
- **One site's damaged session folder no longer stops the others.** When one site's session folder was replaced by a link, the start-up sweep stopped for every site: interrupted sessions were not marked and their work was not committed. The sweep now skips that site, logs why, and goes on with the others.
