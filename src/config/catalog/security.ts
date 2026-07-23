/**
 * CONFIG CATALOG — domain: security
 *
 * GENERATED SCAFFOLD (probe_emit_catalog.ts). Hand-edit from here on.
 */

import type { CatalogEntry } from '../catalog_types.ts';

export const SECURITY_KEYS = {
	DEDALO_AR_EXCLUDE_COMPONENTS: {
		type: 'string_list',
		scope: 'operator',
		default: [],
		heading: 'Defining exclude components',
		typeLabel: 'array',
		doc: `This parameter defines components to be excluded.

Some installations need to block the global access to specific components, use this param to remove the components adding the tipo into the array.

\`\`\`bash
DEDALO_AR_EXCLUDE_COMPONENTS=[]
\`\`\``,
	},
	DEDALO_LOCK_COMPONENTS: {
		type: 'boolean',
		scope: 'operator',
		default: true,
		heading: 'Defining lock components',
		typeLabel: 'bool',
		doc: `This parameter defines if Dédalo will lock / unlock components to avoid replacement data when more than one user edit the same component or Dédalo do not manage the user edition unlocking all components. By default Dédalo do not manage the editions (option false).

\`\`\`bash
DEDALO_LOCK_COMPONENTS=false
\`\`\``,
	},
	DEDALO_MEDIA_ACCESS_MODE: {
		type: 'string',
		scope: 'operator',
		default: '',
		heading: 'Defining protect media files for external access',
		typeLabel: 'false | string',
		doc: `This parameter defines if the directory of the media files (av, images, pdf, subtitles, ...) will be protected and controlled for undesired/external access. The full documentation, with the architecture, use cases, web server configuration and examples, is in [Media protection (media file access control)](./media_protection.md).

* \`false\` : no protection — media files are world-readable (default)
* \`'private'\` : only logged-in Dédalo users can access media files
* \`'publication'\` : logged-in users access everything; anonymous users access only media of published records in the configured public quality folders (see \`DEDALO_MEDIA_PUBLIC_QUALITIES\`)

\`\`\`bash
DEDALO_MEDIA_ACCESS_MODE=false
\`\`\``,
	},
	DEDALO_MEDIA_PUBLIC_QUALITIES: {
		type: 'string_list',
		scope: 'operator',
		default: undefined,
		heading: 'Defining protect media files for external access',
		typeLabel: 'string[]',
		typeSuffix: '(optional)',
		doc: `The quality folders an **anonymous** visitor may read when the record is published (rule B).
A JSON array, or a comma-separated list. Leave it unset to derive the delivery-grade folders
from this installation's own quality catalog — \`av/404\`, \`av/posterframe\`, \`av/subtitles\`,
\`image/1.5MB\`, \`image/thumb\`, \`pdf/web\`, \`svg/web\`, \`3d/web\`.

Master and working qualities (\`original\`, \`modified\`) are **always refused, even if you list
them**: they are the source files, they are the large ones, and they are never public. A
refused entry is dropped and logged; it never silently becomes public and never aborts the boot.

\`\`\`bash
# publish the larger image derivative too, and keep thumbnails private
DEDALO_MEDIA_PUBLIC_QUALITIES=["image/1.5MB","av/404","av/subtitles"]
\`\`\``,
	},
	DEDALO_NOTIFICATIONS: {
		type: 'boolean',
		scope: 'operator',
		default: false,
		heading: 'Defining lock components notifications',
		typeLabel: 'bool',
		doc: `This parameter defines if Dédalo will notify to the user than other users are editing the same field in the same section when the user try to edit the field.

\`\`\`bash
DEDALO_NOTIFICATIONS=false
\`\`\``,
	},
	DEDALO_PROTECT_MEDIA_FILES: {
		type: 'boolean',
		scope: 'operator',
		default: false,
		heading: 'Defining protect media files for external access',
		typeLabel: 'bool',
		typeSuffix: '(deprecated)',
		doc: `The legacy boolean is kept for back-compat: \`true\` behaves as \`DEDALO_MEDIA_ACCESS_MODE='private'\` when the new constant is not defined.

\`\`\`bash
DEDALO_PROTECT_MEDIA_FILES=false
\`\`\`

!!! note "The mode can also be set at runtime"
    The root user can change the mode from the **media_control** maintenance widget. That
    override is stored in \`<private>/ts_state.json\` and **wins over this key**, taking effect
    with no restart. If editing \`.env\` appears to do nothing, the widget reports the effective
    mode and where it came from.`,
	},
	DEDALO_SESSION_CACHE_EXPIRE: {
		type: 'number',
		scope: 'operator',
		default: 180,
		heading: 'Defining the upload session cache expiry',
		typeLabel: 'int',
		doc: `The lifetime, **in minutes**, that the upload service announces for a queued upload
session. The engine reports it with the rest of the system information, and the upload
panel displays it, so a user knows how long files that were uploaded but not yet saved
into a record remain available in the temporary upload directory.

Default \`180\` (3 hours). This value is what the interface announces — it does not by
itself prune the temporary upload directory, so keep it in step with whatever
housekeeping runs over \`DEDALO_UPLOAD_TMP_SUBDIR\`.

\`\`\`bash
DEDALO_SESSION_CACHE_EXPIRE=180
\`\`\``,
	},
	DEDALO_SESSION_DB_PATH: {
		type: 'string',
		scope: 'test_seam',
		default: undefined,
		heading: 'Session store path (test seam — not an administrator setting)',
		typeLabel: 'string',
		doc: `**Do not set this.** Sessions and the login-throttle counters live in a small SQLite
database that always sits at \`dedalo_ts_sessions.sqlite\` inside the private directory.

This key redirects the whole process at a scratch file, so the test suite never opens —
or wipes — the live store; the suite sets it for itself. On a real installation it must
stay unset.`,
	},
	DEDALO_SINGLE_SESSION: {
		type: 'boolean',
		scope: 'operator',
		default: false,
		heading: 'Defining single-session (one active session per user)',
		typeLabel: 'bool',
		doc: `Restricts each user to ONE active session. When \`true\`, a successful login evicts every
other session that user already holds (keeping only the one just created) — so logging in
again anywhere immediately invalidates a token stolen earlier, closing the re-login window
(security finding AUTHZ-04). A password reset already revokes all of a user's sessions
regardless of this flag; this key extends that guarantee to ordinary re-login.

Default \`false\`: concurrent sessions are allowed, so the same user can stay logged in on
several devices at once. Set it \`true\` for a stricter, single-device policy — at the cost
that a new login logs the user out everywhere else.

\`\`\`bash
DEDALO_SINGLE_SESSION=false
\`\`\``,
	},
	LOGIN_ACCOUNT_MAX_ATTEMPTS: {
		type: 'number',
		scope: 'operator',
		default: 50,
		heading: 'Defining the account-wide login attempt limit',
		typeLabel: 'int',
		doc: `The second dimension of the login throttle: how many failed logins one **user name**
may accumulate inside \`LOGIN_ATTEMPT_WINDOW\` **from any address at all**, before that
account is locked for \`LOGIN_LOCKOUT_SECONDS\`. It is what stops an attacker who rotates
addresses (every new address gets a fresh per-address bucket, but they all share this one).

It is deliberately much higher than \`LOGIN_MAX_ATTEMPTS\` (default \`50\` against \`10\`),
and it should stay that way: a low account-wide limit lets anyone lock a colleague out of
their own account with a burst of wrong passwords — a denial of service you inflict on
yourself. Set it very high to effectively disable this dimension and rely on the
per-address limit alone.

\`\`\`bash
LOGIN_ACCOUNT_MAX_ATTEMPTS=50
\`\`\``,
	},
	LOGIN_ATTEMPT_WINDOW: {
		type: 'number',
		scope: 'operator',
		default: 900,
		heading: 'Defining the login attempt window',
		typeLabel: 'int',
		doc: `The sliding window, **in seconds**, over which failed logins are counted for both
throttle limits (\`LOGIN_MAX_ATTEMPTS\` and \`LOGIN_ACCOUNT_MAX_ATTEMPTS\`). A failure
older than the window no longer counts against anyone, and is deleted from the store
once it can no longer influence a decision.

Default \`900\` (15 minutes). A longer window makes the throttle stricter — failures
spread over a slow, patient attack still add up.

\`\`\`bash
LOGIN_ATTEMPT_WINDOW=900
\`\`\``,
	},
	LOGIN_LOCKOUT_SECONDS: {
		type: 'number',
		scope: 'operator',
		default: 900,
		heading: 'Defining the login lockout time',
		typeLabel: 'int',
		doc: `How long, **in seconds**, a login stays refused once a throttle limit has been reached.
The lock lifts this long after the most recent counted failure; a successful login clears
the counters immediately, so a user who finally remembers the password is not kept waiting.

Default \`900\` (15 minutes). Raising it slows a brute-force attempt further; lowering it
mostly buys convenience for people who mistype.

\`\`\`bash
LOGIN_LOCKOUT_SECONDS=900
\`\`\``,
	},
	LOGIN_MAX_ATTEMPTS: {
		type: 'number',
		scope: 'operator',
		default: 10,
		heading: 'Defining the login attempt limit per address',
		typeLabel: 'int',
		doc: `How many failed logins the same user name may accumulate **from the same client
address** inside \`LOGIN_ATTEMPT_WINDOW\` before further attempts are refused for
\`LOGIN_LOCKOUT_SECONDS\`. A successful login clears the counter at once.

Default \`10\` — room for a run of typos, nowhere near enough for a password-guessing
attack. Note that the client address is taken from the trusted reverse-proxy hop
(\`TRUSTED_PROXY_HOPS\`): if that number is wrong, every request looks like it comes from
your proxy and one user's mistakes will lock out everybody.

\`\`\`bash
LOGIN_MAX_ATTEMPTS=10
\`\`\``,
	},
	MEDIA_HTACCESS_ADDONS: {
		type: 'json_array',
		scope: 'operator',
		default: [],
		heading: 'Defining protect media files for external access',
		typeLabel: 'string[]',
		typeSuffix: '(optional, Apache only)',
		doc: `Raw Apache rewrite directives appended to the generated \`.htaccess\` immediately before the
final deny rule. You own their syntax; Dédalo only places them.

The value is **JSON only** — a directive legitimately contains commas (\`[R=404,L]\`), so a
comma-separated list would tear one directive into two invalid ones. That means **every
backslash must be doubled** for JSON. A malformed value is refused and logged
(\`[config] MEDIA_HTACCESS_ADDONS must be a JSON array of strings — ignoring the value.\`);
your lines are dropped, and the access gate itself is unaffected and stays closed.

\`\`\`bash
# allow an internal network unconditionally (note the doubled backslashes)
MEDIA_HTACCESS_ADDONS=["RewriteCond %{REMOTE_ADDR} ^10\\\\.0\\\\.","RewriteRule ^ - [L]"]
\`\`\``,
	},
	PERMISSIONS_CACHE_TTL_SECONDS: {
		type: 'number',
		scope: 'operator',
		default: 300,
		heading: 'Defining the permissions cache lifetime',
		typeLabel: 'int',
		doc: `Each user's permission table — the grants their profile gives them over sections and
components — is resolved from the database once and then kept in memory. Saving a profile
or changing a user's profile drops the cached table immediately, so a grant change is
normally visible on the next request.

This key is the **backstop**, in seconds: it caps how long a *missed* invalidation can
keep serving stale permissions. A grant changed by a different process (a second engine
instance, a background worker) cannot reach this process's memory, and the time limit is
what eventually corrects it. Default \`300\` (5 minutes). Lower it if several processes
share one database and you want a tighter bound; set \`0\` to disable the time limit and
rely on explicit invalidation alone.

\`\`\`bash
PERMISSIONS_CACHE_TTL_SECONDS=300
\`\`\``,
	},
	SESSION_ABSOLUTE_TTL_SECONDS: {
		type: 'number',
		scope: 'operator',
		default: 2592000,
		heading: 'Defining the absolute session lifetime',
		typeLabel: 'int',
		doc: `The hard ceiling, in seconds, on a session's life **counted from the moment it was
created** — regardless of how active it has been. It exists because an idle limit alone
(\`SESSION_TTL_SECONDS\`) never expires a session that is used at least once per window:
a stolen cookie would live forever.

Default \`2592000\` (30 days): a user is asked to log in again once a month, and any
long-lived token eventually dies on its own. Shorten it for a stricter policy; set \`0\`
to disable the absolute cap and keep the idle limit only.

\`\`\`bash
SESSION_ABSOLUTE_TTL_SECONDS=2592000
\`\`\``,
	},
	SESSION_COOKIE_SECURE: {
		type: 'boolean',
		scope: 'operator',
		default: true,
		heading: 'Defining the Secure flag of the session cookie',
		typeLabel: 'bool',
		doc: `Marks the session cookie \`Secure\`, so the browser only ever sends it back over HTTPS
(the media access cookie carries the same posture). It is \`true\` by default and it should
stay \`true\` on anything reachable over a network: a session cookie that travels once in
clear text is a session an eavesdropper can replay.

Only the exact value \`false\` turns it off. The single legitimate reason is a plain-HTTP
development listener on localhost — a browser silently discards a \`Secure\` cookie over
\`http://\`, so login there appears to succeed and then does nothing. Never set it on a
server that anyone else can reach; terminate TLS at the web server instead.

\`\`\`bash
SESSION_COOKIE_SECURE=true
\`\`\``,
	},
	SESSION_TTL_SECONDS: {
		type: 'number',
		scope: 'operator',
		default: 43200,
		heading: 'Defining the session idle timeout',
		typeLabel: 'int',
		doc: `How long, in seconds, a session survives **without being used**. Every authenticated
request refreshes it; a session left untouched for longer than this is destroyed and the
user must log in again.

Default \`43200\` (12 hours) — a session comfortably spans a working day but does not
outlive it. Lower it for shared or public workstations, where an unattended browser is the
real threat. The separate \`SESSION_ABSOLUTE_TTL_SECONDS\` caps the total life of a session
that is being used continuously.

\`\`\`bash
SESSION_TTL_SECONDS=43200
\`\`\``,
	},
} as const satisfies Record<string, CatalogEntry>;
