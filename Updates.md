**UPDATES AND CHANGES**

18-06-2026
Component-lock hardening (collaborative edit locks, DEDALO_LOCK_COMPONENTS).
Improves the per-field locking that prevents two users editing the same component
of the same record at once:
- Race-safety: every lock-registry mutation (focus / blur / delete_user_section_locks /
  force_unlock / garbage collection) now runs inside a DB transaction holding a row lock
  (SELECT ... FOR UPDATE) on the single registry row in matrix_notifications. This closes
  a read-modify-write race that could lose a lock or let two users acquire the same field.
- Stale-lock window cut from 5 hours to LOCK_TTL_SECONDS (150s). The browser refreshes its
  lock with a ~45s heartbeat (a focus re-send) and best-effort releases on tab close via
  navigator.sendBeacon, so a crashed/closed/disconnected session frees its field in minutes.
- Garbage collection moved off the per-request bootstrap: stale entries are pruned lazily
  inside the same locked transaction on every mutation (clean_locks_garbage() remains for the
  maintenance area). dd_init_test no longer sweeps on every page load.
- Conflict UX: a blocked user is told when the field frees. A new read-only API action
  dd_utils_api::get_lock_status (added to API_ACTIONS) drives a bounded client poll that
  dismisses the warning and re-offers the field once the holder releases it.
Note: the lock is per-user — a user is never blocked from their own field; only a DIFFERENT
user editing the exact same (section_id, section_tipo, component_tipo) is blocked.

12-06-2026
Media file access control (work system + publication).
New web-server-enforced media protection replacing/extending the legacy
DEDALO_PROTECT_MEDIA_FILES mechanism:
- New config constant DEDALO_MEDIA_ACCESS_MODE: false | 'private' | 'publication'.
  'private' = only logged-in users read media (legacy behavior); 'publication'
  additionally lets anonymous users read media of PUBLISHED records, only in
  the DEDALO_MEDIA_PUBLIC_QUALITIES folders (defaults to web qualities;
  'original'/'modified' are never public). The legacy boolean
  DEDALO_PROTECT_MEDIA_FILES===true still maps to 'private'.
- The media auth cookie now has a FIXED name ('dedalo_media_auth'); only its
  value rotates daily. The generated media/.htaccess is static (rewritten only
  on config changes) and includes the SEC-088 script-execution hardening the
  old generator dropped. Nginx is supported with a static config — see
  config/nginx.conf.sample ("Media access control").
- Publication state is mirrored by the Bun diffusion engine as zero-byte
  marker files under media/.publication/ (one stat() per request, fail-closed).
  Set DEDALO_MEDIA_PATH in diffusion/api/v1/.env (same value as the PHP
  constant) and restart the engine.
- MIGRATION when enabling 'publication' on an instance with existing
  publications: run once
      php diffusion/migration/helpers/rebuild_media_index.php
- INIT_COOKIE_AUTH_ADDONS is replaced by MEDIA_HTACCESS_ADDONS (raw
  mod_rewrite lines appended before the final deny rule). The old <RequireAny>
  block no longer exists; e.g. an IP allow becomes:
      ["RewriteCond %{REMOTE_ADDR} ^10\\.0\\.", "RewriteRule ^ - [L]"]
- Fixed subtitle .vtt files under media/av/subtitles are gated like any other
  media (subtitles are media: they carry unpublished transcriptions).


