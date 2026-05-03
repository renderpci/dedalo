# `*_json.php` files — reserved naming convention

## Summary

Any file whose basename ends in `_json.php` (e.g. `component_text_area_json.php`,
`relation_list_json.php`, `section_record_json.php`) is a **server-side
include template**, not an HTTP endpoint. It is never fetched directly by a
browser or an API client. The only caller is a PHP method such as
`common::get_json()` / `relation_list::get_json()` that `include`s the file
from inside the calling object's scope.

This convention is load-bearing: the web server (`.htaccess` on Apache, the
equivalent `location ~ _json\.php$ { deny all; }` rule in the nginx sample)
refuses HTTP access to every file matching this pattern. Breaking the
convention — for example creating a new file named `foo_json.php` that is
meant to be browsed to — would collide with the blanket deny and fail
silently.

## Why the rule exists (SEC-026)

These files expect to run inside an already-constructed object and typically
use `$this` on the very first line. If Apache / nginx routed a direct HTTP
request to one of them, PHP would:

1. Leak the file path through the fatal error message.
2. Skip the `dd_manager` CSRF + auth + `API_ACTIONS` allowlist entirely.
3. Expose the include as a future foothold if any maintainer ever adds a
   side-effect (DB write, file IO) before the first `$this` reference.

A blanket deny at the web-server layer makes the above impossible regardless
of what a future caller does inside the include.

## Rules when writing new code

**DO** use the `_json.php` suffix for:

- Per-component JSON serialisation templates included by `common::get_json()`.
- Any partial PHP file that is `include`d from inside an instance method and
  reads `$this` / locals of the caller.

**DO NOT** use the `_json.php` suffix for:

- Files that are meant to be served as HTTP endpoints (JSON APIs, AJAX
  handlers, form submission targets). Those belong under the documented
  API locations: `/core/api/v1/json/` for work APIs,
  `/publication/server_api/v1/json/` for publication APIs.
- Standalone scripts that can be invoked from the CLI or via cron — keep
  those under `/scripts/` or `/tools/<tool>/` without the reserved suffix.

## How the deny is enforced

### Apache (`.htaccess`)

```
# SEC-026: block direct HTTP access to *_json.php include templates.
<FilesMatch "(?i)_json\.php$">
    <IfModule mod_authz_core.c>
        Require all denied
    </IfModule>
    <IfModule !mod_authz_core.c>
        Order allow,deny
        Deny from all
    </IfModule>
</FilesMatch>
```

### nginx (`config/nginx.conf.sample`)

```
location ~* _json\.php$ {
    deny all;
    return 404;
}
```

## Adding a new file — checklist

1. **Is this file ever fetched by the browser?** If yes, do NOT end its
   basename in `_json.php`. Use a neutral suffix (e.g. `_api.php`,
   `_handler.php`) or place it under `core/api/v1/json/`.
2. **Is this file `include`d from an instance method?** If yes, the
   `_json.php` suffix is correct and the webroot deny will protect it
   automatically.
3. **After committing, fetch the file over HTTP once** to confirm the 403.
   If you get a 200, the deny rule is missing from your deployment's
   `.htaccess` / nginx config — stop and align the server config before
   shipping.

## References

- `.htaccess` SEC-026 block (around line 39).
- `config/nginx.conf.sample` mirrors the rule.
- Audit finding SEC-087 (open → tracked here) and the broader SEC-026
  remediation in the Phase-2 master register.
