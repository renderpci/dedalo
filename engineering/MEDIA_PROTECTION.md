# MEDIA PROTECTION — web-server-enforced media access control

**What this is.** One media tree serves two audiences at the same URLs, with no file
duplication and **no application process in the byte path**. The web server authorizes
each request with a single `stat()` on a zero-byte marker file.

Native TS since 2026-07-12 (closes audit `MEDIA-01` / `SECURITY_DECISIONS.md` DECISION 1,
option B). Before that, Rule A and the rule generation were PHP-owned; the PHP engine is
retired, so nothing minted the cookie and nothing generated the rules.

Engine: `src/core/media/protection.ts`. Marker writer: `src/diffusion/targets/mediastore/media_index.ts`.
Gates: `test/unit/media_protection*.test.ts` (one of them a registered tripwire).

## 1. Why the web server enforces, and not Bun

Installs carry millions of images and single AV files of 16–32 GB. The gate must cost one
`stat()` so files keep native `sendfile`/Range and the Apache H.264 / nginx `mp4`
`?start=` clipping handlers. **Never put an application process in the media-serving
path** — no proxying, no streaming through Bun, no `X-Sendfile` for gated media. The gate
never inspects the query string, and its Apache rewrite substitution is always `-`.

Verified: a `Range: bytes=0-99` request against a gated file answers `206 Partial Content`
with the correct `Content-Range`. If that ever becomes a `200` with a full body, something
has been put in the byte path and the design is broken.

## 2. The two rules

- **Rule A — the work system.** A logged-in user carries the fixed-name cookie
  `dedalo_media_auth`, whose daily-rotated 128-hex value must exist as a zero-byte marker
  at `<media>/.publication/auth/{value}`. Grants unrestricted media access.
- **Rule B — publication.** An anonymous user may read only files of **published** records,
  and only inside the configured public quality folders. The web server stats
  `<media>/.publication/pub/{section_tipo}_{section_id}`, deriving the record identity
  from the media **file name**.

**Fail closed, and as 404 — never 403.** Every failure path (missing marker, malformed
cookie, non-grammar filename, absent store) denies, and denies without disclosing that the
file exists. Rule A markers are independent of publication state, so a diffusion failure
can never lock editors out.

## 3. The marker store, and who owns what

```
<media>/.publication/
  auth/{cookie_value}                 ← core/media/protection.ts, and ONLY it
  pub/{section_tipo}_{section_id}     ← media_index.ts, and ONLY it (the union)
  dbs/{db}/{table}/{key}              ← media_index.ts (per-target ground truth)
```

`pub/{key}` exists ⇔ the key exists in at least one `dbs/<db>/<table>/` dir. Appliers
**recompute that union from full directory state — never refcount**, so concurrent
publish/unpublish stay idempotent. Ownership is exclusive: crossing it is a bug.

The store is **never served, in any mode** — including `off`. The filenames under `auth/`
are live credentials and the ones under `pub/` enumerate every published record id.
(Stricter than the PHP original, whose `off` template omitted this deny.)

## 4. The filename grammar — LOAD-BEARING

```
...{component_tipo}_{section_tipo}_{section_id}[_lg-xxx].{ext}

[^/]*_([a-z0-9]+)_([0-9]+)(?:_lg-[a-zA-Z0-9-]{2,12})?\.[A-Za-z0-9]+$
```

The **greedy prefix** pins the captures to the LAST TWO underscore tokens, so a component
tipo — which also contains underscores — can never be read as the section tipo.

It is stated in **three surfaces that must stay in lockstep**: the generated Apache rules,
the generated nginx rules, and `KEY_REGEX`/`makeMarkerKey` in `media_index.ts`. Touch one,
review all three. `test/unit/media_protection_tripwire.test.ts` enforces this mechanically
— it pulls the regexes back out of the generated text, compiles them, and asserts all
three classify one table of real filenames identically.

**Files that do not parse stay login-only BY DESIGN** (e.g. images renamed through
`properties.image_id` or an external source). Document them; never loosen the regex to
"fix" them — that hands anonymous users every unparseable file in a public quality folder.

## 5. The cookie

Fixed NAME (`dedalo_media_auth`), rotating VALUE (128-char sha512 hex). **The fixed name
is what makes the generated rules static and lets nginx survive the daily rotation with no
reload** — the rules never mention a value, only the marker whose filename IS the value.
Never reintroduce rotating cookie names.

Today's and yesterday's values are both valid, so sessions do not break at midnight, and a
second login the same day RECYCLES rather than rotating every other editor out.

Attributes (`server.ts mediaAuthCookieHeader`): `HttpOnly; SameSite=Lax; Path=/`, `Secure`
under `SESSION_COOKIE_SECURE`, `Max-Age=86400`. HttpOnly still lets the browser attach it
to `<img>`/`<video>` subresource loads — that is the whole mechanism.

**The value is install-global**, not per-user: every logged-in editor shares today's value.
Two consequences:
- **Logout must never unlink the marker** — it clears the browser cookie only. Unlinking
  would lock out every other editor.
- A leaked value grants media read until the next daily rotation. That is the price of a
  reload-free, zero-config web-server gate.

**The auth store** (`<private>/media_auth.json`, mode 0600) persists today/yesterday across
restarts. It must live OUTSIDE every served tree — a fetchable store lets anyone set the
cookie and read the whole tree for up to 48 h. `writeAuthStore()` refuses to write it under
the media root, and the tripwire pins that.

## 6. Modes and precedence

`resolveMediaAccessMode()`:

1. `ts_state.json` `media_access_mode` — the runtime override the **root-only**
   `media_control` widget writes. `null`/absent = no override; `false` = explicitly OFF.
2. `.env` `DEDALO_MEDIA_ACCESS_MODE` — `private` | `publication`.
3. legacy `.env` `DEDALO_PROTECT_MEDIA_FILES=true` → `private`.
4. else `false` (media world-readable).

The override lives in `ts_state.json` and **not** in `.env` because `../private/.env` is
append-only *and* parsed once at import — this Bun process lives for weeks, so a `.env`
change could never take effect without a restart. `getServerState()` re-reads its file on
every call, so a widget mode change applies immediately.

`'off'` is a **generator-only** mode: `resolveMediaAccessMode()` never returns it.

## 7. The generated rule files

Written into the media root, config-hash guarded (so a login is normally a no-op), and
regenerated at **boot** as well as at login — a fresh deploy must not serve the whole tree
until someone happens to log in.

| File | Consumer |
|---|---|
| `.htaccess` | Apache, per-directory, **no reload needed** |
| `dedalo_media_protection.nginx.conf` | nginx `server{}` — `include` it |
| `dedalo_media_protection_map.nginx.conf` | nginx `http{}` — `include` it (a `map` cannot live in `server{}`) |

**Bump `TEMPLATE_VERSION` whenever a template changes**, or existing installs — whose other
inputs are unchanged — never regenerate.

`'off'` writes the **hardening-only** template. It must NEVER unlink the files: the media
root is full of user-uploaded files, and an `.htaccess`-less media dir is one where Apache
will execute an uploaded `.php`. The SEC-088 script-execution block and the marker-store
deny are emitted in **every** mode.

### The nginx asymmetry — read this before switching modes

Apache reads `.htaccess` per request: a mode change applies **immediately**. nginx reads
its include at **reload**: a mode change does **nothing** until `nginx -t && nginx -s
reload`. An operator who flips `off → publication` and does not reload keeps serving
everything, with a green widget. The widget says so in its success message and reports
`rules.nginx.reload_required`.

Conversely, an `include` of a *missing* file makes nginx refuse to start. That is
fail-closed and intended — but the tempting "fix" is to comment the include out, which is
world-open. Generate the rules at boot so the file is always there.

Note what does **not** need a reload: the daily cookie rotation.

## 8. Operational gotchas

- **`open_file_cache`**: keep it off on the media locations (or `open_file_cache_valid ≤ 2s`).
  It caches `stat()` results and delays an unpublish taking effect.
- **NFS / web farms**: the marker `stat()` honors the attribute cache, so an unpublish can
  lag a few seconds across hosts.
- **CDN**: purge the record's media paths on unpublish (especially `.vtt` subtitles). The
  origin denies immediately; downstream caches do not.
- **Enabling on a live install**: users logged in *before* the change hold no cookie until
  they re-login (the widget restores markers for existing cookie holders, not the cookies
  themselves). Existing publications need one `rebuild_media_index` run.
- **The #1 misconfiguration** is an unset `MEDIA_PATH`: publishes succeed but anonymous
  access stays 404. The widget surfaces it. (`MEDIA_PATH` now DERIVES to `<projectRoot>/media`
  — `config.media.rootPath` — so this bites only when an install overrides it wrongly.)
- The **engine media fallback** (Bun serving media itself: session-gated, no per-record ACL,
  bypasses these rules — MEDIA-04) is bound to conditions production cannot meet, so it needs
  no flag and cannot leak into a real deployment: it answers **only** on the TCP dev listener
  (production is socket-only) and **only** while protection is unconfigured. Setting a mode
  stands the engine down — the generated rules become authoritative, and the engine must never
  serve the same bytes with weaker checks. `MEDIA_DEV_ROUTE_ENABLED=true` overrides that and
  forces the fallback on for EVERY listener, socket included: never do it on a shared host.
  It exists because the dev listener has no web server in front, so without it a fresh install
  set up exactly per `docs/install/dev_quickstart.md` 404s every image, video and PDF.
  Gate: `test/unit/media_fallback_listener.test.ts`.

## 9. Definition of done — the curl matrix

Unit tests prove the patterns; only a real web server proves the **engines**. This method
is what historically caught the Apache rule-B backreference bug (`$1_$2` vs `%1_%2`) and
the nginx `^~` precedence trap. Boot a throwaway server against the **actually generated**
rule files (never hand-written ones) over a scratch media tree, then:

| request | cookie | expect |
|---|---|---|
| published record, public quality | none | **200** (rule B) |
| unpublished record, public quality | none | **404** |
| master (`original`/`modified`) quality | none | **404**, even when published |
| `_lg-spa.vtt` subtitle of a published record | none | **200** |
| non-grammar filename | none | **404** (login-only by design) |
| any of the above | valid | **200** (rule A) |
| `.publication/auth/<value>`, `.publication/pub/<key>`, `.htaccess` | any | **404** |
| any protected file | `../../../etc/passwd`, short, non-hex, 128-hex non-marker | **404**, never 500 |
| uploaded `.php` under the media root | valid | **denied — never executed** (also in mode `off`) |
| AV file, `Range: bytes=0-99` | none | **206** + `Content-Range` |
| published file, then `rm` its `pub/` marker | none | **404 on the very next request**; `touch` it back → 200 |

**Status:** the Apache matrix above was run end-to-end and passes every row, including the
`206` Range check and the `off`-mode hardening. The **nginx block is pattern-verified only**
(the tripwire compiles its regexes and pins the `^~`/named-capture traps) — it has not yet
been run against a live nginx. Do that before the first nginx deployment.
