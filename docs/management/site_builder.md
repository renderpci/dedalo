# Site builder

The **site builder** lets your users build their own public websites over the published
data — maps, charts, interactive analysis, anything — by talking to a coding agent, and
publish them to production when they are happy. It is an optional add-on: until you
configure it, it does not appear anywhere in Dédalo.

> For copy-paste configuration blocks, the day-to-day workflow, and a library of example
> prompts, see the [site builder cookbook](site_builder_cookbook.md).

## How it fits together

There are two pieces:

- **The site builder daemon** — a standalone service (`publication/site_builder`) that
  runs next to the publication API and its database, possibly on a different host. It owns
  the site workspaces, runs the coding agent, builds each site to static files, serves the
  pre-production preview, and promotes an approved build to production. It reads data only
  from the read-only publication API, so a generated site can never reach your work-system
  data.
- **The site builder tool inside Dédalo** — a workspace where a logged-in user picks or
  creates a site, chats with the agent, watches a live preview, and (if permitted)
  publishes. It talks to the daemon on the user's behalf over an authenticated channel; the
  browser never contacts the daemon directly.

A user builds a site, previews it on a pre-production address, and — once it looks right — a
developer or administrator publishes it to the public address. Publishing copies the exact
bytes that were previewed, so what goes live is always what was approved.

## Enabling it

1. **Install the daemon** on its host and note the service token its installer prints (see
   the service's own README and `install.sh`). Point it at your publication API and set the
   provider key for the coding agent you want to use.
2. **Tell the engine where the daemon is.** Add two keys to `../private/.env`:

   ```bash
   DEDALO_SITE_BUILDER_URL="https://sites.example.org/publication/site_builder"
   DEDALO_SITE_BUILDER_TOKEN="…the daemon's service token…"
   ```

   Both are documented in the [settings reference](../config/config.md#sitebuilder). With
   the URL unset the feature stays completely hidden.
3. **Restart the engine** and **register the tool** with the *Register tools* maintenance
   widget, so `tool_sitebuilder` becomes an active tool.
4. **Grant the tool** to the users who should build sites, through their profile — the same
   way you grant any tool. Administrators have it automatically.

Once configured, the launcher appears in **Area maintenance**, under the **Publication**
subsystem, as the **Site builder** panel — click **Open site builder** to launch the
workspace in its own window. Because Area maintenance is gated to administrators and
developers, that is who reaches the launcher; the tool grant and the publish gate still
apply on top.

## Who can do what

- **Build sites** — any user granted the tool. Sites are shared: everyone with the tool
  sees and can work on every site, and each turn the agent runs is committed to the site's
  history for accountability.
- **Publish to production** — developers and global administrators only. Publishing is a
  deployment act, so it is deliberately narrower than building, and it always asks for a
  confirmation naming the public address.

## Pre-production access

Draft sites are served on a pre-production address that ships behind HTTP basic auth by
default, so unfinished work is never publicly indexable. The daemon's installer generates
the credentials; share them with your site builders. Production sites are public by intent.

## Operating it

The *Site builder* panel in **Area maintenance** shows whether the daemon is configured and
reachable, which coding agents it has available, and the most recent publishes — a quick
health check without leaving Dédalo.

## Behind a reverse proxy

The chat with the agent streams events live. If you run Dédalo behind nginx, the streaming
location already needs `proxy_buffering off` (it is the same requirement the in-app
assistant has — see [production notes](../config/config.md)); the site builder stream rides
the same path and sets the `X-Accel-Buffering: no` response header so the events reach the
browser as they happen.
