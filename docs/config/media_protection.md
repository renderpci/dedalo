# Media protection (media file access control)

./dedalo/config/config.php

Dédalo can control who is allowed to read the media files (image, audiovisual, PDF, SVG, 3D and subtitles) served from the media directory:

> Example: <https://mydomain.org/dedalo/media/av/404/rsc35_rsc167_2.mp4>

One single media tree serves two different audiences **at the same URLs, without duplicating any file**:

* **Rule A — work system**: users logged into Dédalo have unrestricted access to all media files. Users who are not logged in have no access.
* **Rule B — publication**: anonymous visitors of the publication websites can only access media that belongs to **published** records, and only in the configured web-delivery quality folders (never the `original` masters).

## Why

Without protection, every media file is world-readable by anyone who knows (or guesses) its URL — including unpublished masters, working copies and **subtitle files that carry unpublished transcriptions**. The classic workaround, copying published media to a second public tree, doubles the storage (archives often hold terabytes of audiovisual masters) and desynchronizes the two copies on every publish/unpublish.

The media protection system solves this with hard requirements in mind:

* **No media duplication**. The same files are used for work and consultation.
* **Very fast authorization**. The check must not become a bottleneck on busy publication servers: it is a single `stat()` call on a marker file, performed by the web server itself. No PHP, no database, no application process participates in serving a media file.
* **Native file delivery preserved**. Files can be several GB. They keep being served by Apache/Nginx natively (`sendfile`, HTTP `Range` requests for seeking), and the real-time clip engines keep working: the Apache H.264 streaming module and the Nginx `mp4` module still receive the request untouched, so URL parameters like `?start=1&end=89` or `?vbegin=2013&vend=2033` work exactly as before.
* **Subtitles are media**. Fixed `.vtt` files under `media/av/subtitles/` are gated like any other media file, because they contain the transcriptions. (The dynamic subtitle endpoint of the publication API performs its own publication-database check and is independent of this system.)
* **Fail closed**. Every failure mode (missing marker, stale store, engine down) denies anonymous access to that file — it never exposes anything. Logged-in editors are never locked out by a publication-side failure.

## How it works

### The marker store

Authorization state lives in a directory of **zero-byte marker files** inside the media root:

```text
DEDALO_MEDIA_PATH/.publication/
    auth/{cookie_value}                     Rule A: valid auth cookie values
                                            (today + yesterday), written by PHP at login
    pub/{section_tipo}_{section_id}         Rule B: "this record is published in at
                                            least one publication database" — the ONLY
                                            thing the web server checks for anonymous users
    dbs/{database}/{table}/{key}            ground truth per publication target,
                                            maintained by the Bun diffusion engine
```

The web server answers every media request with at most two `stat()` calls (a few microseconds, served from the kernel dentry cache):

1. Does the request carry the auth cookie `dedalo_media_auth` whose value exists as a file in `auth/`? → logged-in user, serve anything.
2. Otherwise: is the URL inside a public quality folder, **and** does `pub/{section_tipo}_{section_id}` exist for the record the file belongs to? → published, serve it.
3. Otherwise: **404** (not 403 — the existence of unpublished media is not disclosed).

The marker store itself (`/media/.publication/...`) is never served.

### Rule A: the auth cookie

When `media_protection` is active, every successful login sets the cookie `dedalo_media_auth` (fixed name, defined in `media_protection::COOKIE_NAME`). Its value is a random sha512 hash **rotated daily**; today's and yesterday's values are valid simultaneously, so sessions never break at midnight. The login process mirrors the valid values as marker files in `auth/` and removes expired ones.

Because the cookie *name* is fixed and only marker *files* change, the generated Apache `.htaccess` is static and Nginx needs no reload — ever. Logout deletes the cookie from the browser.

### Rule B: publication markers and the file name grammar

Publication state in Dédalo equals "the record has rows in a publication (MariaDB) database", written exclusively by the Bun diffusion engine. The engine mirrors every publish, unpublish and delete into the marker store (`diffusion/api/v1/lib/media_index.ts`):

* publish a record → marker created in `dbs/{db}/{table}/` and the union marker `pub/{key}` appears;
* unpublish/delete → the per-table marker is removed; `pub/{key}` is removed only when **no** publication database holds the record anymore (a record published in several sites stays public until the last one unpublishes);
* the change takes effect on the very next HTTP request — including cutting access to the record's subtitle files.

The web server maps a URL to its record using the media **file name grammar**. Dédalo names every media file after the component and section it belongs to:

```text
{component_tipo}_{section_tipo}_{section_id}[_{lang}].{extension}

rsc35_rsc167_2.mp4              → record rsc167-2  (av, quality folder)
rsc35_rsc167_2.jpg              → record rsc167-2  (posterframe)
rsc35_rsc167_2_lg-spa.vtt       → record rsc167-2  (Spanish subtitles)
rsc29_rsc170_3_lg-spa.jpg       → record rsc170-3  (translatable image)
test94_test3_1.mp4              → record test3-1
```

The gate extracts the **last two** underscore tokens (`section_tipo`, `section_id`) and stats `pub/rsc167_2`. One marker therefore covers every derived artifact of the record: all qualities, the posterframe, every subtitle language.

> Note: media files renamed away from this grammar (e.g. images using `properties.image_id` or an external_source file name) cannot be mapped to a record. They simply stay login-only — fail closed, never exposed.

## Access modes

DEDALO_MEDIA_ACCESS_MODE `false | string`

./dedalo/config/config.php

```php
define('DEDALO_MEDIA_ACCESS_MODE', false);
```

| Mode | Logged-in users | Anonymous users |
|---|---|---|
| `false` | everything | **everything** (no protection — media is world-readable) |
| `'private'` | everything | nothing |
| `'publication'` | everything | only published records, only in the public quality folders |

* Use `'private'` for pure work systems with no public website.
* Use `'publication'` when the same server (or a server sharing the media tree) also feeds public websites.
* Back-compat: when `DEDALO_MEDIA_ACCESS_MODE` is not defined, the deprecated boolean `DEDALO_PROTECT_MEDIA_FILES===true` behaves as `'private'`.

---

## Configuration

### Public quality folders

DEDALO_MEDIA_PUBLIC_QUALITIES `array` (optional)

./dedalo/config/config.php

The quality folders (relative to the media root) that anonymous users may read in `'publication'` mode when the record is published. When undefined, the web-delivery defaults derived from the install constants are used:

```php
// default when undefined:
// ['av/404','av/posterframe','av/subtitles','image/1.5MB','image/thumb','pdf/web','svg/web','3d/web']
define('DEDALO_MEDIA_PUBLIC_QUALITIES', [
	DEDALO_AV_FOLDER .'/'. DEDALO_AV_QUALITY_DEFAULT,	// 'av/404'
	DEDALO_AV_FOLDER .'/posterframe',
	DEDALO_AV_FOLDER . DEDALO_SUBTITLES_FOLDER,			// 'av/subtitles'
	DEDALO_IMAGE_FOLDER .'/'. DEDALO_IMAGE_QUALITY_DEFAULT,
	DEDALO_IMAGE_FOLDER .'/'. DEDALO_QUALITY_THUMB,
	DEDALO_PDF_FOLDER .'/'. DEDALO_PDF_QUALITY_DEFAULT,
	DEDALO_SVG_FOLDER .'/'. DEDALO_SVG_QUALITY_DEFAULT,
	DEDALO_3D_FOLDER .'/'. DEDALO_3D_QUALITY_DEFAULT
]);
```

`original` and `modified` folders are **always refused**, even if listed: master files are never public. Entries containing `..` or unexpected characters are ignored with an error log.

> Example: to publish higher-quality video, add `'av/720'`. To keep thumbnails private, remove `'image/thumb'`.

---

### Extra Apache rules

MEDIA_HTACCESS_ADDONS `string` JSON (optional)

./dedalo/config/config.php

Raw `mod_rewrite` lines appended to the generated `media/.htaccess` just before the final deny rule. Replaces the legacy `INIT_COOKIE_AUTH_ADDONS` (whose lines targeted a `<RequireAny>` block that no longer exists).

```php
// example: allow an internal network unconditionally
define('MEDIA_HTACCESS_ADDONS', '["RewriteCond %{REMOTE_ADDR} ^10\\\\.0\\\\.","RewriteRule ^ - [L]"]');
```

---

### Deprecated: DEDALO_PROTECT_MEDIA_FILES

DEDALO_PROTECT_MEDIA_FILES `bool` (deprecated)

Kept for back-compat only. `true` maps to `DEDALO_MEDIA_ACCESS_MODE='private'` when the new constant is not defined. New installs should use `DEDALO_MEDIA_ACCESS_MODE`.

---

### Runtime override: DEDALO_MEDIA_ACCESS_MODE_CUSTOM

DEDALO_MEDIA_ACCESS_MODE_CUSTOM `null | false | string`

./dedalo/config/config_core.php

Written automatically by the **media_control** maintenance widget (root user) — do not edit manually. When defined and not `null`, it overrides the config.php value (same convention as `DEDALO_MAINTENANCE_MODE_CUSTOM`). `null` means "no override, use the config file".

---

### Diffusion engine: DEDALO_MEDIA_PATH

DEDALO_MEDIA_PATH `string`

./dedalo/diffusion/api/v1/.env

The Bun diffusion engine maintains the publication markers, so it must know where the media directory is. Set the **same absolute path** as the PHP `DEDALO_MEDIA_PATH` constant and restart the engine:

```ini
# diffusion/api/v1/.env
DEDALO_MEDIA_PATH=/var/www/html/dedalo/media
```

Leave it empty to disable marker maintenance (all marker operations become no-ops). Without it, `'publication'` mode denies all anonymous access — fail closed.

---

## Web server configuration

### Apache

Nothing to configure manually: Dédalo generates `DEDALO_MEDIA_PATH/.htaccess` automatically (at login, or immediately when the mode is changed from the media_control widget). The file is static — it is only rewritten when the configuration changes — and includes the SEC-088 script-execution hardening.

Requirements:

* `mod_rewrite` enabled.
* `AllowOverride All` (or at least `FileInfo Options`) on the media directory.
* Optional: the Dédalo H.264 streaming module for `?start=` clipping keeps working unchanged — the gate never touches the query string and the request still reaches the module handler.

Generated file (publication mode, abbreviated):

```apache
# 0. The marker store itself is never served.
RewriteRule (^|/)\.publication(/|$) - [R=404,L]

# 1. Rule A: logged-in Dédalo users.
RewriteCond %{HTTP_COOKIE} (?:^|;\s*)dedalo_media_auth=([a-f0-9]{128}) [NC]
RewriteCond "/var/www/html/dedalo/media/.publication/auth/%1" -f
RewriteRule ^ - [L]

# 2. Rule B: public quality + publication marker.
RewriteCond "/var/www/html/dedalo/media/.publication/pub/$1_$2" -f
RewriteRule ^(?:av\/404|av\/posterframe|av\/subtitles|image\/1\.5MB|...)/(?:.+/)?[^/]*_([a-z0-9]+)_([0-9]+)(?:_lg-[a-zA-Z0-9-]{2,12})?\.[A-Za-z0-9]+$ - [L]

# 3. Default deny: 404 hides the existence of unpublished media.
RewriteRule ^ - [R=404,L]
```

### Nginx

Nginx cannot read `.htaccess`, so the equivalent rules are added to the site configuration. A complete, commented block ships in `config/nginx.conf.sample` ("Media access control" section). Summary:

```nginx
# http context: sanitize the cookie value (hex-only) before filesystem use
map $cookie_dedalo_media_auth $dedalo_auth_key {
    "~^(?<h>[a-f0-9]{128})$"  $h;
    default                   "_invalid_";
}

# server context:
location ^~ /media/.publication/ { deny all; return 404; }

# Rule B: public qualities — marker OR valid login cookie
location ~ ^/media/(?:av/404|av/posterframe|av/subtitles|image/1\.5MB|image/thumb|pdf/web|svg/web|3d/web)/(?:.+/)?[^/]*_(?<dd_s>[a-z0-9]+)_(?<dd_i>[0-9]+)(?:_lg-[a-zA-Z0-9-]{2,12})?\.[A-Za-z0-9]+$ {
    set $dd_pass 0;
    if (-f $document_root/media/.publication/auth/$dedalo_auth_key) { set $dd_pass 1; }
    if (-f $document_root/media/.publication/pub/${dd_s}_${dd_i})   { set $dd_pass 1; }
    if ($dd_pass = 0) { return 404; }
    mp4;   # native '?start='/'?end=' clipping
}

# Rule A: everything else under /media is login-only
# (plain prefix, NO ^~ : the rule-B regex above must be consulted first)
location /media/ {
    if (!-f $document_root/media/.publication/auth/$dedalo_auth_key) { return 404; }
}
```

Operational notes (also in the sample file):

* Do **not** enable `open_file_cache` on the media locations (or keep `open_file_cache_valid` ≤ 2s): it caches `stat()` results and delays unpublish taking effect.
* The quality alternation in the regex must match `DEDALO_MEDIA_PUBLIC_QUALITIES`.
* NFS / shared-storage web farms: the marker `stat()` honors the NFS attribute cache, so unpublish can lag a few seconds across hosts.
* CDN or proxy in front: purge the record's media paths on unpublish — the origin denies immediately, downstream caches do not.

---

## Cases and examples

The examples assume `'publication'` mode, default public qualities, and an audiovisual record `rsc167-2` whose files are:

```text
media/av/404/rsc35_rsc167_2.mp4             web quality video
media/av/original/rsc35_rsc167_2.mp4        master
media/av/posterframe/rsc35_rsc167_2.jpg     posterframe
media/av/subtitles/rsc35_rsc167_2_lg-spa.vtt subtitles (transcription!)
```

### Case 1 — anonymous visitor, record published

The record was published (diffusion), so `pub/rsc167_2` exists:

```shell
curl -I https://mydomain.org/dedalo/media/av/404/rsc35_rsc167_2.mp4
# HTTP/1.1 200 OK

curl -I "https://mydomain.org/dedalo/media/av/404/rsc35_rsc167_2.mp4?start=1&end=89"
# HTTP/1.1 200 OK            (clip engine receives ?start/?end untouched)

curl -I -H "Range: bytes=0-1023" https://mydomain.org/dedalo/media/av/404/rsc35_rsc167_2.mp4
# HTTP/1.1 206 Partial Content   (seeking works: native delivery)

curl -I https://mydomain.org/dedalo/media/av/subtitles/rsc35_rsc167_2_lg-spa.vtt
# HTTP/1.1 200 OK            (published transcription)

curl -I https://mydomain.org/dedalo/media/av/original/rsc35_rsc167_2.mp4
# HTTP/1.1 404 Not Found     (master quality is never public)
```

### Case 2 — anonymous visitor, record NOT published

No `pub/rsc167_3` marker:

```shell
curl -I https://mydomain.org/dedalo/media/av/404/rsc35_rsc167_3.mp4
# HTTP/1.1 404 Not Found

curl -I https://mydomain.org/dedalo/media/av/subtitles/rsc35_rsc167_3_lg-spa.vtt
# HTTP/1.1 404 Not Found     (unpublished transcription is protected)
```

### Case 3 — logged-in Dédalo user

The browser holds the `dedalo_media_auth` cookie set at login:

```shell
curl -I -H "Cookie: dedalo_media_auth=<128-hex-value>" \
    https://mydomain.org/dedalo/media/av/original/rsc35_rsc167_2.mp4
# HTTP/1.1 200 OK            (everything, including masters and unpublished media)
```

A stale, expired or malformed cookie value behaves like an anonymous request (404 on non-public media).

### Case 4 — unpublishing takes effect immediately

```text
1. Editor sets the record publication to 'no' and runs diffusion
   (or deletes the record).
2. The diffusion engine deletes the publication rows and removes
   dbs/{db}/{table}/rsc167_2; if no other publication database still
   holds the record, pub/rsc167_2 is removed too.
3. The next HTTP request for ANY file of the record
   (video, posterframe, every .vtt) answers 404.
```

If the record is published in two sites (`web_site_a` and `web_site_b`) and only `web_site_a` unpublishes, `pub/rsc167_2` survives and the media stays public — union semantics across all publication databases.

### Case 5 — attempts that fail closed

```shell
# marker store is never served
curl -I https://mydomain.org/dedalo/media/.publication/pub/rsc167_2          # 404

# query string cannot bypass the gate
curl -I "https://mydomain.org/dedalo/media/av/original/rsc35_rsc167_2.mp4?x=/av/404/"  # 404

# encoded traversal
curl -I "https://mydomain.org/dedalo/media/av/404/..%2Foriginal%2Frsc35_rsc167_2.mp4"  # 404

# files that do not follow the naming grammar stay login-only
curl -I https://mydomain.org/dedalo/media/av/404/freeform.mp4                # 404
```

---

## The media_control maintenance widget

Area Maintenance includes the **Media access control** widget (`media_control`), which:

* reports the current status: effective mode and where it comes from (config.php, legacy constant, or runtime override), public quality folders, generated `.htaccess` state, marker counts, and whether the diffusion engine is reachable and has `DEDALO_MEDIA_PATH` configured — every misconfiguration is highlighted;
* lets the **root user** change the mode (`Use config file value / Off / Private / Publication`). The change is applied immediately: the override is persisted to `config_core.php`, the `.htaccess` is regenerated for the new mode, and the auth markers are restored so already-logged users keep access. Other users get the auth cookie at their next login;
* provides the **Rebuild media index** button (global admins), a full resync of the publication markers from the publication databases.

## Enabling on an existing installation

1. Set the mode in `config.php` (or from the media_control widget):

    ```php
    define('DEDALO_MEDIA_ACCESS_MODE', 'publication');
    ```

2. Configure the diffusion engine and restart it:

    ```ini
    # diffusion/api/v1/.env
    DEDALO_MEDIA_PATH=/var/www/html/dedalo/media
    ```

3. If the instance already has published records, build the markers once — from the widget button, or from CLI:

    ```shell
    php diffusion/migration/helpers/rebuild_media_index.php
    ```

    PHP resolves every SQL publication target from the diffusion ontology and the engine diff-syncs the marker store from `SELECT DISTINCT section_id` of each table (covering all publication databases). The rebuild never creates a deny-everything window and is safe to re-run at any time to repair drift.

4. Nginx installs: enable the "Media access control" block from `config/nginx.conf.sample` and reload. Apache installs need nothing (the `.htaccess` is generated automatically).

5. Ask users to log out and in once (the auth cookie is set at login).

## Troubleshooting / failure modes

| Symptom / failure | Effect | Recovery |
|---|---|---|
| Diffusion engine down | markers frozen (no publish/unpublish is possible anyway); editors unaffected | restart the engine — it reconciles the marker union at boot |
| Engine running but `DEDALO_MEDIA_PATH` unset in its `.env` | publishes succeed but markers are not maintained → published media stays 404 for anonymous users | set the env var, restart, run the rebuild (the widget flags this state) |
| `.publication/` deleted or media tree restored from backup | anonymous 404 everywhere; editors fine | Rebuild media index (widget or CLI) |
| Published record still 404 for anonymous users | marker missing (drift), file outside the public qualities, or file name does not follow the grammar | check the widget status; rebuild; review `DEDALO_MEDIA_PUBLIC_QUALITIES` |
| Editors get 404 after enabling protection | they logged in before the protection was active (no cookie) | log out / log in |
| Unpublished media still reachable through a CDN | downstream cache holds the copy | purge the record's media paths on unpublish |
| Mode changed in config but behavior unchanged | a runtime override is set in `config_core.php` | check "Mode source" in the widget; set the selector back to "Use config file value" |

## Security notes

* Default deny answers **404**, not 403, so the existence of unpublished files is not disclosed.
* The auth cookie is a bearer token for media access (HttpOnly, Secure on HTTPS, value rotated daily). Cookie values and URL captures are validated against strict patterns (`[a-f0-9]{128}`, `[a-z0-9]+_[0-9]+`) before they are ever used in a filesystem path — no traversal is possible.
* The generated `.htaccess` always includes the script-execution hardening for the media root (SEC-088): user-uploaded files are never interpreted as code.
* The persisted cookie file (`core/extras/media_protection/cookie/cookie_auth.php`) carries a `<?php exit();` guard line so it can never disclose its values over HTTP.
* Marker files are zero-byte: even if a name leaked, it only reveals publication state, which is public by definition.
