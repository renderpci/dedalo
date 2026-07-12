---
name: dedalo-media-protection
description: Web-server-enforced media file access control in the Dédalo v7 TS/Bun engine — the .publication marker store, the fixed-name daily auth cookie, the filename→record grammar, and the GENERATED Apache/nginx rule files. Use when editing src/core/media/protection.ts, the login media-cookie hook (core/security/auth.ts + server.ts Set-Cookie assembly), the media_control maintenance widget, src/diffusion/targets/mediastore/media_index.ts, or when debugging why media 404s for a logged-in user, why anonymous users can (or cannot) read published media, or a media_protection_tripwire failure.
---

# Dédalo v7 media protection (TS)

One media tree, two audiences, same URLs, no duplication. Logged-in users read everything
(rule A); anonymous users read only **published** records in the configured public quality
folders (rule B). Authorization is one `stat()` on a zero-byte marker, performed by the
**web server** — no app process in the file-serving path.

Definition: `engineering/MEDIA_PROTECTION.md`. Engine: `src/core/media/protection.ts`.
Marker writer: `src/diffusion/targets/mediastore/media_index.ts`.
Landed 2026-07-12 (closes audit MEDIA-01 / DECISION 1(B)); before that, Rule A and the rule
generation were PHP-owned and died with the cutover.

## Hard rules

1. **Never put an application process in the media-serving path.** No proxying, no
   streaming through Bun, no X-Sendfile for gated media. Files reach 16–32 GB and installs
   hold millions of images: the request must reach the native handlers so `sendfile`, HTTP
   Range and the Apache H.264 / nginx `mp4` `?start=` clipping keep working. The gate never
   inspects the query string; the Apache rewrite substitution is always `-`.
   **Canary:** a `Range: bytes=0-99` request must answer **206**. A `200` with a full body
   means something is in the byte path.

2. **Fail closed, 404 not 403.** Every failure mode denies, and denies without disclosing
   that the file exists. Publication-side failures must never lock editors out — rule A
   markers are independent of publication state.

3. **Three enforcement surfaces stay in lockstep**: the generated Apache rules
   (`buildHtaccess`), the generated nginx rules (`buildNginxConf`), and the marker writer
   (`makeMarkerKey`/`KEY_REGEX` in `media_index.ts`). Touch one → review all three.
   `test/unit/media_protection_tripwire.test.ts` enforces it mechanically: it pulls the
   regexes back OUT of the generated text, compiles them, and asserts all three classify
   one table of real filenames identically.
   The grammar is LOAD-BEARING:
   ```
   [^/]*_([a-z0-9]+)_([0-9]+)(?:_lg-[a-zA-Z0-9-]{2,12})?\.[A-Za-z0-9]+$
   ```
   The greedy prefix pins the LAST TWO underscore tokens (a component tipo also contains
   underscores). **Files that do not parse stay login-only BY DESIGN** (`properties.image_id`
   renames, external sources) — document them, never loosen the regex to "fix" them.

4. **The auth cookie NAME is fixed** (`dedalo_media_auth`); only the 128-hex sha512 VALUE
   rotates daily (today + yesterday both valid). The fixed name is what keeps the generated
   rules static and lets nginx survive rotation **without a reload**. Never reintroduce
   rotating cookie names. The value is validated against `^[a-f0-9]{128}$` before it can
   reach the disk — **it becomes a literal filename**, so that pattern is the traversal
   guard.

5. **Marker-store ownership is exclusive.** Under `<media>/.publication/`:
   `auth/{value}` ← `protection.ts` only; `pub/{key}` + `dbs/{db}/{table}/{key}` ←
   `media_index.ts` only. `pub/{key}` is a DERIVED union: it exists ⇔ the key exists in at
   least one `dbs/` dir, **recomputed from full directory state — never refcounted**. The
   store is never served, in any mode.

6. **The auth store is a credential file.** `<private>/media_auth.json`, mode 0600, and it
   must live OUTSIDE every served tree — a fetchable store lets anyone set the cookie and
   read the whole tree for ~48 h. `writeAuthStore()` refuses to write it under the media
   root; the tripwire pins that.

7. **The cookie value is install-global**, not per-user. Therefore **logout must never
   unlink the marker** (it would lock out every other editor) — it clears the browser cookie
   only.

8. **`original`/`modified` are never public.** `filterPublicQualities()` refuses master/work
   qualities even when explicitly configured — and refuses this install's *configured*
   original/retouched names, not just the two literals (stricter than the PHP original).

9. **Mode `off` writes the hardening-only template — it NEVER unlinks the rule files.** The
   media root is full of user-uploaded files; an `.htaccess`-less media dir is one where
   Apache executes an uploaded `.php`. The SEC-088 script block and the `.publication` deny
   are emitted in EVERY mode. **Bump `TEMPLATE_VERSION` whenever a template changes**, or
   existing installs never regenerate (the config-hash guard would otherwise match).

10. **Mode precedence**: `ts_state.json media_access_mode` (root-only, from the widget) →
    `.env DEDALO_MEDIA_ACCESS_MODE` → legacy `DEDALO_PROTECT_MEDIA_FILES=true` → `false`.
    `null` = no override; `false` = explicit OFF — the two are NOT the same. The override
    lives in `ts_state.json` because `../private/.env` is append-only *and* parsed once at
    import (this process lives for weeks). When changing the mode, thread it **explicitly**
    into `writeRuleFiles(mode)` — never let the writer re-derive it from a cached layer.

## The traps that have actually shipped as bugs

- **Apache rule B uses `$1_$2`** (captures of the FOLLOWING RewriteRule), **not `%1`**
  (rule A's last RewriteCond capture). The RewriteRule must immediately follow its
  RewriteCond.
- **The nginx rule-A location is a PLAIN prefix.** A `^~` there makes nginx skip the rule-B
  regex location entirely, and every anonymous request for published media 404s.
- **nginx rule B needs NAMED captures** (`dd_s`/`dd_i`): the inner `if (-f …)` runs its own
  regex and resets the numeric captures.
- **`server.ts` response headers must be a `Headers` object**, not a `Record<string,string>`:
  an object key holds ONE `Set-Cookie`, so the media cookie would silently clobber the
  session cookie (login "breaks", and the tempting fix is to switch protection off — i.e.
  world-open media). Never comma-fold Set-Cookie (RFC 6265 §3).
- **`MEDIA_HTACCESS_ADDONS` is JSON-only.** A comma-list reader shreds
  `RewriteRule ^ - [R=404,L]` into two broken directives.
- **nginx needs a RELOAD on a mode change**; Apache's `.htaccess` does not. The daily cookie
  rotation needs no reload.

## Operational gotchas

`open_file_cache` off (or `_valid ≤ 2s`) — it caches `stat()` and delays unpublish. NFS
attribute cache lags unpublish across web farms. CDNs must purge on unpublish (especially
`.vtt`). Users logged in *before* protection is enabled hold no cookie until they re-login.
Existing publications need one `rebuild_media_index` run. The #1 misconfiguration is an
unset `MEDIA_PATH`: publishes succeed, anonymous access stays 404 — the widget surfaces it.

## Verifying a change (the definition of done)

Unit tests prove the patterns; only a real web server proves the ENGINES — and this method
is what caught the `$1_$2` and `^~` bugs. Boot a throwaway Apache/nginx against the
**actually generated** rule files over a scratch media tree, then run the curl matrix in
`engineering/MEDIA_PROTECTION.md` §9 (anonymous vs cookie × published/unpublished ×
public-quality/master, subtitle lang suffix, non-grammar name, marker-store paths, hostile
cookies, uploaded `.php`, `Range → 206`, and an unpublish flipping 200→404 on the next
request).

Then: `bun test test/unit/media_protection*.test.ts` and `bun run scripts/verify.ts`.
