---
title: The site builder runs each site's AI agent as that site's own system user, from units that root installs. systemd 248 is now enough, and `provision apply` must run before the updated daemon starts.
type: security
audience: admin
date: 2026-10-01
breaking: true
---
Until now, every site of a museum ran its AI turns, builds and `git` commands as one agent user, so one site's run could read or change another site's agent state. The daemon also asked systemd to start those runs itself, which the previous release had to stop allowing (see the entry on the narrowed polkit rule).

Now each declared site has its own system user, `dedalo-a-<instance>_<n>`, with a private group that only that user and the service user belong to. `provision apply` creates them and never reuses a number. For each site and each kind of run (turn, build, `git`), root installs a socket and a service template. The daemon only connects to that socket, and systemd starts the run as the site's user, which the daemon cannot choose. The polkit rule now lets the service user stop or kill those runs and nothing else. What systemd enforces:

- A site never has two runs at once, and runs of different sites run as different users.
- Each run gets only its own site's workspace and its own HOME. A build cannot read the turn's `~/.claude`, and `git` gets no HOME.
- A turn or build reaches the network through its site's egress directory under `/run/dedalo-sites-agents/<instance>/egress/`. Root creates this directory at every boot from a rendered `/etc/tmpfiles.d/` file, and the run sees it read-only.
- A run of a site whose units differ from what the daemon expects (for example, a hand-added drop-in) is refused, naming the setting. This includes a drop-in that stops a run without killing its last processes, or one that makes systemd open or mount a file for the run as root.
- A run counts as finished only when systemd reports none of its processes left, so the site's next run never starts beside a survivor of the last one.
- Stopping or restarting the daemon also stops that museum's run sockets, which then accept no new run. Starting the daemon starts them again.

Other changes:

- The daemon starts no new run once it is shutting down. A turn whose final commit was refused that way is committed when the daemon next starts.
- The oldest supported systemd is now 248. polkit must be 0.106 or newer, because the stop rule is a JavaScript rules file, and `provision apply` refuses an older one. Supported hosts are Ubuntu 24.04 or newer, Debian 12 or newer, and RHEL 9 or newer. Ubuntu 22.04 is not supported: its polkit 0.105 ignores the rule. Server and minimal installs often have no polkit at all; install it first (`apt install polkitd` on Debian and Ubuntu, `dnf install polkit` on RHEL). On systemd 257 or newer each run also gets its own process namespace.
- A site's user may belong only to the instance group and its own private group. `provision apply` refuses a site user that any other group lists as a member, and the daemon refuses every run of a site user that has any other group, because a run gets every group of its user.
- The `opencode` agent is refused on a host where runs are confined (`AGENT_CONFINEMENT=systemd_scope`, every provisioned host): it loads configuration and plugins from files a run can write, so a planted plugin would run as the site's user. Use `claude_code` there.
- When the daemon is not running, `provision apply` clears its failed state before starting it. A daemon that the updated code stopped in a restart loop can then be started.
- If the daemon crashes on systemd older than 254, systemd does not stop its runs. The daemon stops them, or keeps their site unavailable, when it starts again.
- `provision apply` refuses a site user whose uid, or a private group whose gid, belongs to any other account or group on the host. It also refuses any other account whose primary group is a site's private group, and it refuses when the system id range in `/etc/login.defs` has no room left. The daemon checks the same things before every run.
- Creating a site is refused (503) before anything is written when the daemon cannot run that site's `git` yet, for example after `provision apply` added the site but before the daemon restarted.
- An agent run that was left running (for example, after the daemon was killed) is stopped before its site runs again. If it will not stop, that site stays unavailable until it does.
- The daemon's `.builder/` directory in each workspace is now `0710`, so a turn, which runs as the site's user, can open the MCP configuration it is given there. The site's user still cannot list or change anything in it. An existing `.builder/` is changed at the site's next turn.

**Action needed:** as root, run `provision apply` for every instance before the updated daemon starts, or in the same maintenance window as the code update. This includes an update installed from within the application.

- The daemon no longer starts while its environment still sets `AGENT_USER`, `AGENT_HOME` or `SYSTEMD_RUN_BIN`. `provision apply` removes those keys and writes `AGENT_IDENTITIES`, `AGENT_SOCKET_DIR`, `AGENT_STATE_ROOT` and `AGENT_IDENTITY_EPOCH`. It writes `SYSTEMCTL_BIN` only when the declaration names `agent.systemctl_bin`. Otherwise the daemon uses `/usr/bin/systemctl`, so declare it only on a host where `systemctl` is somewhere else. Do not add the key to the rendered environment file by hand: the next `provision apply` removes it.
- The first run of `provision apply` stops the daemon, gives each site's files that the old agent user wrote to the site's new user, installs the units, and starts the daemon again.
- It also opens to the instance group the files and directories in each existing workspace that are owned by the service user, except `.builder/`. Sites created before 2026-09-05 have these: back then turns and `git` ran as the service user and left `.git` closed to the group, so the site's new user could not commit. The service user keeps owning them.
- It locks the old agent user without deleting it.
- It moves the old shared agent HOME aside, next to itself, as `<home>.retired-<date>`. Nothing from it is copied to the new users.
- Once, after the update, a conversation cannot resume its earlier context: its next turn starts a new agent session.
- Adding a site later also needs `provision apply`, which restarts the daemon.

See [the site builder internals](./development/site_builder_internals.md).
