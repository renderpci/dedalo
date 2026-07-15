# Site builder cookbook

Practical recipes for configuring and using the [site builder](site_builder.md): concrete
configuration blocks, the day-to-day workflow, and a library of prompts you can copy,
adapt, and hand to the agent.

This page assumes you have read the [overview](site_builder.md). It shows examples; it does
not repeat the concepts.

---

## Recipe 1 — Configure the daemon and the engine

The site builder has two configuration surfaces: the daemon's own `.env` (on the host that
runs it) and two keys the engine reads.

**On the daemon host** — `publication/site_builder/.env` (the installer writes a starting
copy from `sample.env`; fill in the blanks):

```bash
# Auth — the token the engine will present. Generate it once:
#   openssl rand -hex 32
SERVICE_TOKEN=6f1c…the-generated-token…9a2b

# Where the generated sites read their data. Point at the read-only publication API.
PUBLICATION_API_URL=https://data.example.org/publication/server_api/v2

# Public addresses the workspace links to.
PREPROD_BASE_URL=https://preprod.example.org
PROD_BASE_URL=https://www.example.org

# The coding agent and its key. Instance-level: every user shares this agent.
AGENT_DRIVER=claude_code
CLAUDE_CODE_BIN=claude
ANTHROPIC_API_KEY=sk-ant-…

# Where sites live on disk (defaults shown).
SITES_ROOT=/var/lib/dedalo_sites/workspaces
PREPROD_ROOT=/var/lib/dedalo_sites/preprod
PROD_ROOT=/var/www/dedalo_sites
```

**On the engine host** — append to `../private/.env`:

```bash
DEDALO_SITE_BUILDER_URL="https://sites.example.org/publication/site_builder"
DEDALO_SITE_BUILDER_TOKEN="6f1c…the-same-token…9a2b"
```

The token on both sides **must match**. Every key is documented in the
[settings reference](../config/config.md#sitebuilder). Restart the engine, then register
the tool with the *Register tools* maintenance widget.

### Using a local model instead of Claude

The daemon is driver-agnostic. To drive the agent with an OpenAI-compatible endpoint (for
example a local model) through the OpenCode driver, set these on the daemon host instead of
the Anthropic key:

```bash
AGENT_DRIVER=opencode
OPENCODE_BIN=opencode
# Forwarded only to the OpenCode child process:
OPENCODE_ENV=OPENAI_API_KEY=sk-local,OPENAI_BASE_URL=http://127.0.0.1:11434/v1
```

Nothing else changes — the workspace, build, and publish flow are identical.

---

## Recipe 2 — Decide who can build and who can publish

- **Build a site** — any user granted the `tool_sitebuilder` tool through their profile.
  Grant it the same way you grant any tool. Administrators have it automatically.
- **Publish to production** — developers and global administrators only. This is enforced by
  the engine, not by trust: a non-developer never gets a Publish button, and a hand-crafted
  request is refused.

The launcher lives in **Area maintenance → Publication → Site builder** (it opens the
workspace in its own window). Because Area maintenance is admin/developer-gated, that is who
reaches the launcher.

---

## Recipe 3 — Build your first site

1. Open **Area maintenance**, find the **Site builder** panel (Publication subsystem), and
   click **Open site builder**.
2. In the left pane, type a slug (lowercase letters, digits, hyphens — e.g. `photo-archive`)
   and a name, then create the site. The daemon scaffolds a starter project and points its
   data helpers at your publication API.
3. In the chat, describe what you want. Work in stages rather than one big prompt (Recipe 4).
4. When the agent stops, click **Build**. On success the preview reloads.
5. Review the preview. When it is right, **Publish** (if you may).

A good first prompt sets the goal and lets the agent discover the data:

> Build a landing page for this archive. First call the MCP tools to list the databases and
> the tables, pick the main records table, and show its 20 most recent records as cards with
> a title and a thumbnail. Keep it clean and responsive. Use the helpers in
> `src/lib/dedalo.ts` for every request.

---

## Recipe 4 — Work in stages: plan, mockup, then refine

The agent does its best work when you build up in stages instead of asking for the finished
site in one prompt. Each stage is a cheap checkpoint before the next — and every turn is
committed, so you always have a working point to fall back to.

**Stage 1 — Ask for a plan first, before any code.** This catches a wrong direction while it
still costs nothing to change.

> Before writing any code, look at the data — list the databases and tables, and read the
> schema of the main ones — and propose a plan for a public site: the pages, what each one
> shows, which tables and columns it uses, and the libraries you would choose. Don't build
> anything yet; just the plan.

Read it, correct it, then approve:

> Good, but drop the login page — everything here is public — and use a timeline instead of a
> table on the home page. Go ahead with that plan.

**Stage 2 — Ask for a rough mockup, layout first.** A quick static draft lets you judge the
look and structure before the agent spends effort on data plumbing.

> Build a static mockup of the home page from the plan: the real layout, header and
> navigation, but with a few hard-coded sample records instead of live API calls. One page
> only, so I can see the shape.

Build it, preview it, and adjust the shape cheaply:

> Move the search box into the header, make the cards two per row, and add a footer.

**Stage 3 — Wire the real data and fill in the rest.** Once the shape is right, turn the
mockup into the real thing.

> Now replace the sample records with live data from the `[documents]` table using the helpers
> in `src/lib/dedalo.ts`, add the other pages from the plan, and handle empty results and
> errors.

This beats one big prompt because each stage is small enough to review, a wrong turn is caught
early and cheaply, and you are never far from a working version. Use **Stop** the moment a turn
heads the wrong way, then correct course in the next message.

---

## Recipe 5 — Prompt library by visualization

The generated sites read the published data through the Publication API, and the agent has
the API's MCP tools wired in (`list_databases`, `get_schema`, `search_records`, `get_record`,
`count_records`, `fulltext_search`, and the fragment tools). Records are keyed by
`section_id`, and multilingual tables return one row per language — mention the language you
want when it matters.

Copy a prompt, replace the bracketed parts with your table and column names (ask the agent to
`get_schema` first if you do not know them), and send it.

### A map

> Add a page with a full-screen Leaflet map. Pull records from the `[places]` table, read the
> latitude and longitude from `[gis_lat]` / `[gis_lon]`, and drop a marker for each. Show the
> record title in the popup, and fit the map to the markers. Skip records with no coordinates.

### A bar or line chart

> Add a chart page using Chart.js. Group the records in `[objects]` by `[material]` and show a
> horizontal bar chart of the count per material, top 15, sorted descending. Fetch up to 500
> records and aggregate client-side.

### A timeline

> Build a timeline of the `[events]` table ordered by `[date_start]`. Render each event as a
> row with its year, title and a one-line description, grouped by decade. Make the decades
> collapsible.

### A searchable index

> Add a search box that calls the publication API full-text search on the `[documents]` table
> and renders the results as a list, with the query debounced by 300 ms and a result count.
> Link each result to a detail page for that record.

### A record detail page

> Add a detail route `#/record/:id` that loads a single record from `[documents]` by its
> `section_id`, shows every non-empty field as a labelled row, and renders any related images
> from the `[image]` relation. Fall back to a "not found" message for an unknown id.

### A gallery

> Make an image gallery from the `[image]` table: a responsive grid of thumbnails that open a
> larger view on click. Lazy-load images and show the caption under each one.

### Filters and facets

> Above the results list, add facet filters for `[period]` and `[country]`. Populate each
> facet's options from the distinct values in the first 500 records, and combine active
> filters with AND. Reflect the active filters in the URL hash so a filtered view is
> shareable.

---

## Recipe 6 — Iterate with follow-up prompts

The agent keeps the session context, so follow-ups are short and refer to what is on screen:

> Make the cards bigger and show two per row on desktop, one on mobile.

> The dates render as raw numbers — format them as years, and sort newest first.

> Add a header with the archive name and a link back to the home page on every page.

> Some records have no image; show a neutral placeholder instead of a broken image.

> Switch the whole site to a dark theme with good contrast.

If a turn goes wrong, click **Stop**, then correct course:

> Stop. That removed the navigation. Put the nav back exactly as it was and only change the
> colours.

Every turn is committed, so the site's history is a safety net even though the UI does not
yet expose a visual rollback of agent turns.

---

## Recipe 7 — Build, preview, and publish

- **Build** runs the site's install and build commands and promotes the static output to the
  pre-production address. The preview iframe reloads with a cache-busting parameter, so you
  always see the fresh build.
- **Preview** is served behind HTTP basic auth by default (the daemon's installer prints the
  credentials). Share those with anyone reviewing a draft.
- **Publish** copies the exact bytes you previewed to the production address — it does not
  rebuild, so what goes live is what you approved. You are asked to confirm, and the action
  names the public URL.

A typical review-to-launch sequence:

1. Build → check the preview.
2. A couple of follow-up prompts → Build again → re-check.
3. Publish → confirm → the site is live at `PROD_BASE_URL/<slug>/`.

---

## Recipe 8 — Roll back a production site

Every publish keeps the previous releases. If a launch has a problem, roll back to the last
good release from the workspace's release history — production swaps back atomically, with no
rebuild. Because production is an independent copy of each release, a rollback never depends
on the workspace still existing.

---

## Recipe 9 — Multiple sites and a custom domain

- You can run several named sites on one instance (up to the daemon's `MAX_SITES`). Each is an
  independent workspace served at `PREPROD_BASE_URL/<slug>/` and `PROD_BASE_URL/<slug>/`.
- To give one site its own domain, point a small web-server virtual host's document root at
  `PROD_ROOT/<slug>/` and add the DNS and TLS for that domain. The site itself needs no
  change — it is built with relative asset paths, so it works at a subpath or a domain root.

---

## Recipe 10 — Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| The **Site builder** panel shows "Not configured" | `DEDALO_SITE_BUILDER_URL`/`TOKEN` unset on the engine | Set both keys, restart the engine, register the tool. |
| The panel shows "Configured, but not reachable" | The daemon is down, or the URL/token is wrong | Check the daemon service and that the two tokens match; the daemon's `/health` should answer. |
| The launcher is missing entirely | You are not an admin/developer, or the tool is not granted | The launcher lives in Area maintenance (admin/developer). For build access, grant `tool_sitebuilder` in the user's profile. |
| A build fails | The agent's code does not build | Read the build log in the chat; ask the agent to fix the specific error it reports. |
| The preview is blank | The site fetched no data, or a runtime error | Ask the agent to handle empty results and check the browser console; confirm the table and column names with `get_schema`. |
| "No agents available" | No coding-agent binary is installed/configured on the daemon | Install the CLI and set its `*_BIN`, plus the provider key, in the daemon `.env`. |

---

## See also

- [Site builder](site_builder.md) — the overview and enabling steps.
- [Settings reference — Site builder](../config/config.md#sitebuilder) — every configuration
  key.
