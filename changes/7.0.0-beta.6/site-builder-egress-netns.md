---
title: Site builder agent turns and builds run in a private network namespace and reach the outside only by hostname, through the daemon's egress gate; the Publication API key no longer reaches the agent, and AGENT_EGRESS_ALLOW is refused.
type: security
audience: admin
date: 2026-09-30
---
A confined agent turn used to be allowed "any" address with loopback and the private ranges denied. systemd's address filter lets the allow list win over the deny list, so that turn could in fact reach the database, the engine, the local network and a cloud host's metadata service. Every confined run (a turn, a build step, a git command) now runs in its own private network namespace with `/run` hidden. Loopback, the LAN, the metadata service and the host's own sockets do not exist inside it. A turn or a build reaches the outside only through its site's socket directory, served by the site-builder daemon: an HTTPS proxy that connects only to the hostnames that run may use, on port 443, and refuses any name that resolves to a non-public address. It forwards nothing until the connection's TLS handshake names that same hostname, so a hostname behind a shared CDN is not a way to other sites on that CDN. A git command gets no network at all. The database socket directories some distributions keep outside `/run` (RHEL's MariaDB uses `/var/lib/mysql/mysql.sock`) are hidden from every run too, and each run gets its own `/dev/shm` instead of the host's shared one. A run cannot reach another site's socket directory: only its own site's is mounted, and runs of different sites run as different users, so a concurrent run cannot be reached through `/proc` either. Each blocked destination is written as one line in the session or build log. A run on a host that silently ignores the namespace setting is refused before anything starts.

The hostnames are:

- Claude Code turns: `api.anthropic.com`.
- opencode/pi turns: the hosts named in `AGENT_PROVIDER_HOSTS`. With none named, such a turn is refused, naming the key.
- Builds: the hosts in `BUILD_REGISTRY_HOSTS` (default `registry.npmjs.org`).

On a provisioned host these come from the declaration's `agent.provider_hosts` / `agent.registry_hosts`. The Publication API key now stays with the daemon, which adds it on its side of the agent's MCP connection; it is no longer written into the site workspace.

What changes for an operator:

- A non-empty `AGENT_EGRESS_ALLOW` stops the daemon at boot, with a message naming its replacements.
- A model served on loopback or the museum's LAN can no longer be used by a turn.
- Builds can no longer reach anything on loopback or the LAN.
- A command-line tool that ignores the standard proxy environment variables has no network.
- A tool that tunnels anything but TLS naming the host it asked for (plain HTTP over port 443, Encrypted Client Hello, a handshake naming two hosts) is disconnected, with a line in the log.
- A run may hold at most 128 connections through the daemon at once. One more is refused, with a line in the log.
- An opencode turn installs its provider's package from `registry.npmjs.org` on first use. Name that host in `agent.provider_hosts` too.
- The daemon refuses to start any confined run (503, naming the cause) when:
  - the host's systemd is older than 248, or its version cannot be read;
  - its socket (`LISTEN_SOCKET`) or the agent socket directory is not under `/run`;
  - it cannot read its own network namespace;
  - the site has no agent user of its own on the host (see the entry on per-site agent users);
  - the site builder or its bun can be changed by any site's agent user, or cannot be read or run by it (a directory above them that such a user owns counts as one it can change, whatever its permissions);
  - the site builder or its bun lives under `/home`, `/root`, `/run`, `/tmp` or `/var/tmp`.
- A site builder and bun owned by the engine's own user, as the documented install lays them out, are accepted.

See [the site builder internals](./development/site_builder_internals.md).
