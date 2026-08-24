# MEDIA PROTECTION — web-server-enforced media access control

> **ADDENDUM 2026-08-24 (paths verified — read this before the rest).** Unlike its
> sibling media/diffusion specs, nothing this spec names has moved: every module
> and gate path below was swept and resolves as written —
> `src/core/media/protection.ts`, `src/diffusion/targets/mediastore/media_index.ts`,
> `test/unit/media_protection_tripwire.test.ts`,
> `test/unit/media_fallback_listener.test.ts`. Body text is current, not historical.
> Date is the date of the sweep.

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
is what makes the generated rules static and lets nginx survive every rotation with no
reload** — the rules never mention a value, only the marker whose filename IS the value.
Never reintroduce rotating cookie names.

**One value per SESSION** (2026-08-24). The marker set under `.publication/auth/` is a
PROJECTION of the sessions table: `createSession` stores the key on the row,
`issueSessionMediaKey()` mints it and lays the marker, and every way a session ends
unlinks it. `src/core/security/session_media.ts` is the one door that does both halves —
`endSession` (logout, expiry), `endUserSessions` (password reset, single-session
eviction), `sweepExpiredSessions` (prune + orphan reconcile).

Attributes (`server.ts mediaAuthCookieHeader`): `HttpOnly; SameSite=Lax; Path=/`, `Secure`
under `SESSION_COOKIE_SECURE`, `Max-Age` = **the session idle window**
(`SESSION_TTL_SECONDS`). HttpOnly still lets the browser attach it to `<img>`/`<video>`
subresource loads — that is the whole mechanism.

**The cookie's life is the SESSION's life (WC-051).** It is re-issued on any authenticated
request whose cookie is missing or is not this session's key — one string compare against
a value already on the session row. It was previously minted ONLY at login with a fixed
`Max-Age=86400`, which failed in both directions: an editor logged in longer than a day
kept a working session and lost the cookie, so **every media file 404'd while the app
itself looked healthy** (with no publication markers, Rule A is the only door); and a
cookie minted just before logout stayed a valid credential with no session behind it.

Two populations are RE-KEYED on that path rather than re-issued: sessions predating the
`media_key` column (the upgrade), and sessions created while protection was off on an
install that has since switched it on. Re-keying lays a marker and updates the row; it
must **never** call `writeRuleFiles()` — that is the authenticated hot path.

### Why it used to be install-global, and what that cost

Until 2026-08-24 the value was one per INSTALL per DAY: every logged-in editor held the
identical cookie, today's and yesterday's both valid. Two rules followed, and both were
written into the code:

- *"Logout must never unlink the marker"* — unlinking the shared value would have logged
  every other editor out of the media tree. So logout cleared the browser cookie only.
- A leaked value therefore granted media read until the next daily rotation, **surviving
  logout AND a password reset for up to ~48 hours**, entirely outside the session store's
  reach. The reset flow, whose whole purpose is cutting off whoever holds a stolen token,
  could not cut off that one.

That is now inverted: logout unlinks THIS session's marker and no other, and
`password_reset` goes through `endUserSessions`, so both credentials die together.

**The auth store is retired.** `<private>/media_auth.json` held the day-global values; a
fetchable one would have let anyone set the cookie and read the whole tree for ~48 h,
which is why it lived outside every served root. There is no shared value to persist any
more, so boot renames the file to `media_auth.json.migrated` once
(`retireLegacyAuthStore`) rather than leaving credentials on disk to be restored from a
backup years later.

**The orphan sweep does NOT run at boot**, deliberately. The session store is repointable
(`DEDALO_SESSION_DB_PATH`) and the media root is not: the update's smoke boot starts the
candidate tree with an empty throwaway session store and the inherited `MEDIA_PATH`, so a
boot reconcile would unlink every live editor's marker on the production tree — on every
`bun run test:update` and every real update. It runs from the maintenance widget and after
a prune, where the caller is definitionally holding the real store.

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
will execute an uploaded `.php`. The SEC-088 script-execution block, the MEDIA-03 response
headers and the marker-store deny are emitted in **every** mode.

### MEDIA-03: the response headers (2026-08-24)

SVG is the one image format that is also a DOCUMENT, and this origin is the application
origin. The generated rules emit `X-Content-Type-Options: nosniff` for the whole tree and
split SVG into two populations from ONE definition, `src/core/media/svg_safety.ts`, which
the Bun media route consumes too:

- the **server-generated image envelope** (`<imageFolder>/…/svg/…/*.svg`) stays **inline**
  with `script-src 'none'` — the edit view embeds it through `<object type="image/svg+xml">`
  and needs same-origin `contentDocument` access, which a CSP `sandbox` would sever;
- **every other** `.svg`/`.xml`/`.xsl`/`.xslt` is served `attachment` + `default-src 'none';
  sandbox`;
- `html|htm|xhtml|xht|shtml|swf|hta` are denied outright — no media model accepts them.

Two things about this are load-bearing. The envelope lives one bucket directory BELOW its
`svg/` segment, so a pattern anchoring the file directly inside `svg/` matches no real
envelope and blanks every edit view. And **headers may not fail open**: without
`mod_headers`, Apache cannot emit the CSP, so that branch DENIES the uploader-supplied
population rather than serving it inline unprotected.

Uploaded SVG is never refused or sanitized — refusing a curator's vector file is data
loss, and the quarantine is what makes it inert. Active content in an upload is NOTICED in
the log so it can be found. Wire contract: `WC-2026-08-24-media-svg-response-headers`.

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
- **Enabling on a live install**: users logged in *before* the change get their cookie on
  their next authenticated request (WC-051 re-issue) — no re-login needed, provided a store
  already exists; if none does, the first login creates it. The widget restores markers for
  existing cookie holders, not the cookies themselves. Existing publications need one
  `rebuild_media_index` run.
- **"All my images suddenly 404 but the app works"** is almost always Rule A: the browser is
  not sending a cookie whose value has a marker. Check, in order — `.publication/auth/`
  holds THIS SESSION's key (the `media_key` column on its row); the browser actually holds
  `dedalo_media_auth` (it is HttpOnly, so read it in DevTools → Application → Cookies, not
  from JS); and `curl -H "Cookie: dedalo_media_auth=<that session's key>" <a real media URL>`
  returns 200. If curl passes and the browser does not, the cookie is missing or stale, not
  the rules.
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
| any media file | any | `X-Content-Type-Options: nosniff` (MEDIA-03) |
| raw uploaded `.svg` (`svg/…`) | valid | **200** + `Content-Disposition: attachment` + `Content-Security-Policy: default-src 'none'; sandbox` |
| server-generated envelope (`<image>/…/svg/…/*.svg`) | valid | **200**, NO disposition, CSP with `script-src 'none'` — and the `<object>` edit view still renders |
| `.xml` under the media root | valid | **200** + `attachment` + sandbox CSP |
| uploaded `.html` / `.swf` under the media root | valid | **404 — denied outright** (also in mode `off`) |
| published file, then `rm` its `pub/` marker | none | **404 on the very next request**; `touch` it back → 200 |

**Status (2026-08-24): the whole matrix, including the five MEDIA-03 header rows, was run
end-to-end against a live Apache 2.4.66 AND a live nginx — the first time the nginx block
has been executed rather than pattern-checked.** Both engines agree on every row: envelope
inline with the script-blocking CSP, raw SVG and XML `attachment` + sandbox, `nosniff`
everywhere, active documents 404, published/unpublished rule-B behaviour, rule A by cookie,
hostile cookies denied, `.publication` denied, an unpublish taking effect on the very next
request, and `Range: bytes=0-4` answering **206** on both.

That run changed the implementation once, which is the argument for doing it: on Apache the
active-document deny was written as `Require all denied` and answered **403**, confirming
the file exists. In a `.htaccess` mod_rewrite runs in the FIXUP phase, i.e. AFTER
authorization, so an authz denial answers first — the opposite of what the code assumed. It
is now a `RewriteRule … [R=404,L]`, and both engines answer 404. Pattern gates cannot see
this class of defect at all.

Historic note: the **nginx block used to be pattern-verified only**
(the tripwire compiles its regexes and pins the `^~`/named-capture traps) — it has not yet
been run against a live nginx. Do that before the first nginx deployment.
