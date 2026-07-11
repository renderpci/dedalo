# `*_json.php` files — reserved naming convention (PHP-only, obsolete in the TS server)

!!! warning "Not applicable to the TS server"
    This convention governs the **PHP** work system. The TypeScript/Bun server has
    **no `*_json.php` files at all** — component JSON is produced by the resolve
    engines (`src/core/resolve/`, `src/core/section/read.ts` `emitDdoData`), not by
    per-component PHP include templates. There is no per-component
    `component_X_json.php`, no `common::get_json()` include, and therefore no
    web-server deny rule to maintain for the TS deployment. This page is retained
    only for the **co-resident PHP reference** during the transition (both servers
    can share the same database and media tree); if you are working purely in the
    TS server you can ignore it.

## Summary (PHP reference)

In the PHP work system, any file whose basename ends in `_json.php` (e.g.
`component_text_area_json.php`, `relation_list_json.php`,
`section_record_json.php`) is a **server-side include template**, not an HTTP
endpoint. It is never fetched directly by a browser or an API client. The only
caller is a PHP method such as `common::get_json()` / `relation_list::get_json()`
that `include`s the file from inside the calling object's scope.

That convention was load-bearing on the PHP deployment: the web server
(`.htaccess` on Apache, the equivalent `location ~ _json\.php$ { deny all; }` rule
in the nginx sample) refused HTTP access to every file matching the pattern.

## Why the rule existed (SEC-026)

These PHP files expect to run inside an already-constructed object and typically
use `$this` on the very first line. If Apache / nginx routed a direct HTTP
request to one of them, PHP would:

1. Leak the file path through the fatal error message.
2. Skip the `dd_manager` CSRF + auth + `API_ACTIONS` allowlist entirely.
3. Expose the include as a future foothold if any maintainer ever added a
   side-effect (DB write, file IO) before the first `$this` reference.

A blanket deny at the web-server layer made the above impossible regardless of
what a future caller did inside the include.

## The TS equivalent

The TS server has no include-template attack surface to deny, because there are no
include templates. The equivalent security guarantees are provided structurally:

- **JSON emission is code, not a browsable file.** The resolve engines build the
  component/section JSON in-process; there is no path a browser could GET to
  reach a "serialization template".
- **There is one API entry point.** Every request goes through
  `src/server.ts` → `dispatchRqo()` (`src/core/api/dispatch.ts`), where the
  auth / CSRF / action-allowlist gates live. There is no way to bypass them by
  hitting an internal file, because internal modules are never served — only the
  copied client static assets under `/dedalo/` and the API endpoints are routed
  (and the static handler has a path-traversal guard).

So the concern SEC-026 addressed for PHP does not have a TS counterpart to guard;
it is closed by construction.

## If you touch the PHP reference

If you add or move a file in the **PHP** tree during the transition, the original
rules still apply there: use the `_json.php` suffix only for an include read from
inside an instance method, never for a browsable endpoint, and confirm the
web-server deny returns a 403/404 for it. See the PHP `.htaccess` SEC-026 block and
`config/nginx.conf.sample`.
