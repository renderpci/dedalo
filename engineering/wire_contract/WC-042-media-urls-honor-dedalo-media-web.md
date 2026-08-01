# WC-042 — media URLs honor `DEDALO_MEDIA_WEB_BASE` (config-dependent absolute wire URLs)

- **PHP:** every client media URL was built on the constant `DEDALO_MEDIA_URL`
  (= configurable `DEDALO_ROOT_WEB` + media dir) — an install serving media from
  another origin emitted absolute URLs everywhere.
- **TS before this entry:** the base was HARDCODED relative
  (`/dedalo/<mediaDir>`), so an app browsed on one origin (the Bun dev port)
  could never fetch media served on another (the web server enforcing the
  generated protection rules) — images 404'd by design with no configuration
  escape.
- **Now:** `config.media.webBase` = `DEDALO_MEDIA_WEB_BASE` (trailing slash
  stripped; unset/'' → the relative default, i.e. the exact previous shape).
  Emitters on it: the client `DEDALO_MEDIA_URL` plain var
  (resolve/environment.ts), `base_svg_url` (media/svg_overlay.ts wire path),
  `posterframe_url` + `subtitles_url` (media/component_emit.ts + media/path.ts),
  the indexation-grid thumb URLs (section/indexation_grid.ts), the MCP media
  `url` field (ai/mcp/tools/media.ts), and the text_area tag 302 redirect
  (component_text_area/tag_endpoint.ts).
- **Deliberately NOT on it:** persisted content (the SVG envelope's embedded
  raster href stays relative — resolves against the envelope's own fetch
  origin), diffusion/publication output (`svgUrlFromTagLocator`,
  diffusion runner/default_value — published data must not embed a dev origin),
  bare `files_info.file_path` values (the client prefixes those with
  `DEDALO_MEDIA_URL`; absolutizing would double-prefix), inbound route matching
  (server.ts, protection.ts rules), and `DEDALO_MEDIA_EXPORT_BASE` (export cells —
  unchanged semantics: unset means unresolved, never guessed; read via
  `config.media.exportBase`). That key was spelled `DEDALO_MEDIA_BASE_URL` until
  2026-07-25; the two names were indistinguishable, so the pair was renamed to
  state its audience (WEB = the client, EXPORT = what leaves the app) and the old
  spelling is RETIRED (`RETIRED_ENV_KEYS`, refuses the boot). Same value shape as
  `webBase` — origin + `/dedalo/<mediaDir>`, trailing slash now stripped on both,
  since both are prefixed to the same media-root relative `file_path`.
- **Fixtures:** every harvest fixture pins the harvest-era RELATIVE shape, so
  `test/preload/test_database.ts` pins `DEDALO_MEDIA_WEB_BASE=''` for the whole
  suite — gates are hermetic against the developer's .env, no fixture edits.
- `DEDALO_MEDIA_URL` (the v6 constant name) stays DROPPED in
  `config/migration_map.ts`; the new key is a v7-native knob (classified NEW).

### Gate

`test/unit/media_web_base.test.ts` (default shape, builder rooting, fresh-import
override + trailing-slash strip) + the pinned relative shape across the existing
media gates and parity fixtures.
