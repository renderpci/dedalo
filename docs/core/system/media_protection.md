# media_protection

> See also: [Media protection (configuration)](../../config/media_protection.md) · [media_engine](media_engine.md) · [login](login.md) · [security](security.md) · [System hub](index.md)

`media_protection` is the subsystem that makes the **web server** authorize media files:
Apache or nginx answers each request with a single `stat()` on a zero-byte marker file, so
multi-GB media keeps native `sendfile`, `Range` and `?start=` clipping and **no engine process
ever sits in the media byte path**.

This page is the maintainer's orientation — the module map and the invariants that bite. Everything an
administrator needs (modes, keys, web-server wiring, the widget, troubleshooting, verification)
lives on one page and one page only: **[Media protection (configuration)](../../config/media_protection.md)**.
The authoritative subsystem definition, including the curl verification matrix that is its
definition of done, is `engineering/MEDIA_PROTECTION.md`.

## The model in one breath

One media tree, two audiences, no file duplication:

* **Rule A — work system.** A logged-in user carries the fixed-name cookie
  `dedalo_media_auth`; its daily-rotated value must exist as a marker in
  `<media>/.publication/auth/{value}`. Unrestricted access.
* **Rule B — publication.** An anonymous user reads only **published** records, only inside the
  configured public quality folders. The web server stats
  `<media>/.publication/pub/{section_tipo}_{section_id}`, with the record identity parsed out of
  the media **file name**.

Everything fails **closed**, and denies as **404, never 403**. Rule A markers are independent of
publication state, so a diffusion failure can never lock editors out.

## Module map

| Module | Owns |
|---|---|
| `src/core/media/protection.ts` | The engine: mode resolution, the public-quality filter, the rule-file templates and their idempotent write, the `auth/` markers. |
| `src/core/security/auth.ts` | The login hook `initMediaAuthCookie()` — mints or recycles the daily value, lays its marker, refreshes the rule files, returns the value to set. |
| `src/server.ts` | Boot-time `writeRuleFiles()`, and the `Set-Cookie` assembly (`HttpOnly; SameSite=Lax; Path=/`, `Max-Age=86400`, `Secure` when the session cookie is secure). |
| `src/diffusion/targets/mediastore/media_index.ts` | The rule-B marker **writer**: `pub/` and `dbs/`, and the `rebuild`/`reconcile` resync. |
| `src/core/area_maintenance/widgets/media_control.ts` | The admin widget: status, the **root-only** mode switch, *Rebuild media index*. |

**Marker-store ownership is exclusive.** Under `<media>/.publication/`, `auth/` belongs to
`protection.ts` and nothing else; `pub/` and `dbs/` belong to `media_index.ts` and nothing else.
Crossing that line is a bug.

## Invariants that bite

!!! danger "Three enforcement surfaces must stay in lockstep"
    The file name grammar is stated in three places: the generated Apache rules, the generated
    nginx rules, and `KEY_REGEX` / `makeMarkerKey` in `media_index.ts`. If they disagree, the
    gate either stats a marker nobody writes (every published record 404s — annoying but
    visible) or parses a file name into the **wrong record** and serves a file that was never
    published. `test/unit/media_protection_tripwire.test.ts` enforces the lockstep
    mechanically: it pulls the regexes back out of the generated text, compiles them, and
    asserts that all three classify the same table of real file names identically.

The grammar's **greedy prefix** pins the captures to the last two underscore tokens, so a
component `tipo` — which also contains underscores — can never be read as the section `tipo`:

```text
...{component_tipo}_{section_tipo}_{section_id}[_lg-xxx].{ext}

[^/]*_([a-z0-9]+)_([0-9]+)(?:_lg-[a-zA-Z0-9-]{2,12})?\.[A-Za-z0-9]+$
```

Files that do not parse (images renamed through `properties.image_id`, external sources) stay
**login-only by design**. Never loosen the regex to "fix" them — that hands anonymous users
every unparseable file in a public quality folder.

Other invariants the gates pin, each of which shipped as a real bug or a near miss:

* **The cookie NAME is fixed; only the VALUE rotates.** That is what lets the generated rules
  stay static and lets nginx survive the daily rotation with no reload — the rules never name a
  value, only the marker whose file name *is* the value.
* **Apache rule B backreferences `$1_$2`, not `%1_%2`**, and its `RewriteRule` must stay
  immediately after its `RewriteCond`.
* **The nginx rule-A location is a plain prefix.** A `^~` there would make nginx stop before
  ever consulting the rule-B regex location, and every anonymous request for published media
  would 404.
* **nginx rule B uses named captures.** The inner `if (-f …)` runs its own regex and resets the
  numeric captures, so a rule built on `$1`/`$2` would stat `pub/_` and deny everything.
* **Master qualities can never enter the public list**, whatever the configuration says — the
  literal `original`/`modified` plus this install's configured original quality per media type.
* **The script-execution hardening and the marker-store deny are emitted in every mode,
  including `off`**, and `off` never unlinks a rule file.
* **The auth store is never written under the media root.** It holds today's and yesterday's
  cookie values in cleartext; serving it would hand any visitor a working cookie for 48 hours.

## Related

* [Media protection (configuration)](../../config/media_protection.md) — the operator's page:
  modes, keys, web-server wiring, the widget, verification, troubleshooting.
* [media_engine](media_engine.md) — how the files being protected are produced and named.
* [login](login.md) — the authentication path that mints the cookie.
* [security](security.md) — the in-application permission layer; media protection is the
  web-server layer in front of the file tree.
* [Media pipeline](../../development/media_pipeline.md) — where this sits in the whole media flow.
