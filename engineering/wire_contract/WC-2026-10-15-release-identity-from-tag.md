# WC-2026-10-15-release-identity-from-tag — the engine calls itself by its git tag; the data version travels beside it

- **Date:** 2026-10-15 (owner decision on finding C3i-F1: a build at tag
  `v7.0.0-beta.6` called itself `7.0.0`; target beta.7).
- **Decision:** TWO identities, never confused. The **data version**
  (`version.ts` `DEDALO_VERSION`, `7.0.0`) is what compares, migrates, names a
  code-server directory and crosses to an older peer — unchanged. The
  **release identity** (`src/core/update/release_identity.ts`) is what the
  program CALLS ITSELF: `X.Y.Z` for an exact stable tag, `X.Y.Z-(alpha|beta|rc).N`
  for an exact prerelease tag, `X.Y.Z.dev` for anything untagged. It is read
  from the tree's git tag (an archive's expanded `build_info.txt` describe
  field, or one bounded `git describe` on a checkout) and is for DISPLAY: no
  reader parses a data triple out of it.

## Shape before (WC-2026-08-24-update-code-dev-channel)

The one code-version string was `DEDALO_VERSION + DEDALO_PRERELEASE_TAG`:
`7.0.0`, or `7.0.0.dev` when the build stamp was unexpanded or the install
channel was `dev`. A tag was never read, so a beta archive said `7.0.0` —
indistinguishable from the stable release it precedes.

- `/health` `{result, entity, version, db, install_digest, request_id}` —
  `version` ∈ `X.Y.Z | X.Y.Z.dev`.
- `page_globals.dedalo_version` (logged-in only, API-03), the menu About
  `info_data.dedalo_version`, the login About "Code version" row and the update
  panel's `engine.engine_version` carried that string; the panel's
  `engine.version` the bare triple.
- `get_code_update_info` `options.version` = `page_globals.dedalo_version`
  verbatim; the master read it with `parseVersionString` (strips `.dev`, splits
  on dots, requires three integers).
- image-update request `from_version` validated against
  `^\d+\.\d+\.\d+(\.dev)?$`.

## Shape after (TS)

`/health`
- `version` widens to the release identity: `X.Y.Z | X.Y.Z-(alpha|beta|rc).N |
  X.Y.Z.dev`.
- NEW key `release_kind: 'stable' | 'prerelease' | 'dev'` — which of the three
  `version` is, so no reader infers it from the string's shape. OPTIONAL to a
  reader: a server predating this entry (a mid-restart poll may still be
  talking to one) omits it. Like `version`, it is anonymous-readable: it names
  a published tag, nothing more.

`page_globals` (`get_environment` / `start`)
- `dedalo_version` — same domain widening (still logged-in only).
- NEW key `dedalo_data_version: string | null` — the bare data triple
  (`7.0.0`) this code belongs to, beside the identity; null for anonymous
  callers, exactly like `dedalo_version` (API-03). It is what the client
  compares with `data_version` (the page's update-data gate) and what it SENDS
  to another server.

`info_data` (menu About)
- `dedalo_version` — the identity; NEW `dedalo_data_version` beside it.

Login About (`login_context`)
- Unchanged keys: the "Code version" row shows the identity, the "Data
  version" row the triple.

Update panel (`dd_area_maintenance_api` update_code status, `consumerStatus`)
- `engine.version` stays the data triple; `engine.engine_version` is the
  identity; NEW `engine.release_kind` (same vocabulary as `/health`).
  `engine.posture` is unchanged and stays CHANNEL-driven: a dev-channel archive
  of an exact tag reports `release_kind: 'prerelease'` (or `'stable'`) and
  `posture: 'dev'` (owner Q5).

REQUEST — `dd_utils_api.get_code_update_info`
- `options.version` STAYS a bare `X.Y.Z` — the data triple, never the
  identity: an OLDER master's parser reads three integers and would refuse
  `7.0.0-beta.6` as `Invalid version number` for ever. The client reads it from
  `page_globals.dedalo_data_version` (deriving it from the identity only as a
  fallback).
- NEW optional `options.release` — the asker's release identity. Informational
  today: no answer depends on it (the prerelease identity walk, design §2.8.3,
  is the first reader). Older masters ignore unknown option keys.
- Server side, `parseVersionString` is hardened anyway: any release identity
  reads as its data triple (`7.0.0-beta.6` → `[7,0,0]`); a foreign suffix
  (`7.0.0-pre.1`, `7.0.0-beta`) is still refused.
- `get_ontology_update_info` `options.version`: same rule (the data triple).

IMAGE-UPDATE REQUEST (`<private>/image_update/request.json`)
- `from_version` grammar widens to the release identity (the shared
  `parseReleaseVersion`, ≤ 64 chars): `X.Y.Z | X.Y.Z-(alpha|beta|rc).N |
  X.Y.Z.dev`. Before, a prerelease engine's own request failed its own
  validation. `tag` / `version` (the TARGET) are unchanged here.

Not yet in this entry (later steps of the same design add an addendum here):
the image updater's (shell) `DEDALO_VERSION` grammar and semver order. The
installer's image tag set, the code-server file grammar for prerelease
archives, and the `prerelease` update channel token are addenda below.

## Reason

A beta others run must say WHICH beta it is (reproducible bug reports, a
verifiable supply chain) — and the string that says so must never reach a
reader that compares, or it breaks every one of them. Three did break the
moment the identity was exposed, and are fixed in the same change: the page's
version gate split the identity on dots (`7.0.0-beta` ≠ `7.0.0` → every page
rendered the update-data widget instead of the app), the code-update ask sent
it to parsers that read three integers, and the image-update request refused
its own engine. `dedalo_data_version` and `release_kind` exist so that no
client ever needs to parse the identity again.

## Gate reconciliation

- `test/unit/client_release_identity_wire.test.ts` — EXECUTES `render_page`
  and `update_code` (leaves stubbed): a prerelease / rc / dev identity whose
  data equals the stored data renders the app, with and without the published
  key; a real mismatch renders the widget; the wrapper class is one valid
  token; the ask's `version` passes the current master door AND the
  pre-hardening parser (copied verbatim), `release` = the identity; the
  ontology ask (`render_update_ontology` `get_update_info`, executed) carries
  exactly the data triple, accepted by the current and pre-change ontology
  doors. Red against the pre-change client.
- `test/unit/release_identity_served_native.test.ts` — the values where they
  are SERVED: the real `/health` route answers `version` = the identity and
  `release_kind` = its kind; `buildPageGlobals` (logged in) and
  `buildInfoData` publish `dedalo_data_version` = `DEDALO_VERSION`, a bare
  triple equal to the identity's data triple, and the page's comparison over
  the served globals finds no mismatch on the suite DB. Red when the server
  publishes the identity there (on any non-stable checkout) or drops / fixes
  `release_kind`.
- `test/unit/utils_update_manifest_native.test.ts`,
  `test/unit/update_version.test.ts` — the master accepts a prerelease asker as
  its triple, refuses foreign suffixes.
- `test/unit/image_update_channel_native.test.ts` — `from_version` of every
  identity kind is written and claimed by the host; non-identities refused.
- `test/unit/health_payload_native.test.ts` — `release_kind` present when
  given, absent otherwise. `test/unit/update_status_native.test.ts` —
  `engine.release_kind` = the resolved kind.
- `test/unit/client_release_identity.test.ts` — no client source reads
  `dedalo_version` numerically or sends it as a version.
- `test/parity/environment_differential.test.ts` — transforms, no
  re-harvest: `dedalo_data_version` is asserted TS-only then stripped (the
  WC-031 pattern); `dedalo_version` is compared by DATA TRIPLE against the
  frozen `7.0.0.dev` instead of byte for byte — it is a fact about the serving
  checkout's tag now, like `dedalo_build`. The frozen fixture is untouched.

## Addendum 2026-10-15 — the installer's image (design step 5)

The Docker/trial installer's image is derived from its release identity
(`src/core/install/installer_identity.ts`, `host/stack/layout.ts`).

Before: the image tag was the bare data version (`X.Y.Z`) for every build —
a beta installed and pinned `:7.0.0`, after the stable release ANOTHER image
(C3i-F1); the accepted set was `{X.Y.Z, X.Y.Z-dev}`; Official was the
default for every installer and refused only when the registry said absent.

After:
- `.dedalo.env DEDALO_VERSION` (the stack's pin, also the local build's tag
  and `org.opencontainers.image.version` label) = `imageTagOf(identity)`:
  `X.Y.Z` | `X.Y.Z-(alpha|beta|rc).N` | `X.Y.Z-dev` (dev identity). The
  `X.Y.Z-(alpha|beta|rc).N` value is NEW in this file's domain; the shell
  library's grammar that reads it back (`deploy/dedalo-image-lib.sh`
  `DEDALO_VERSION_RE`) widens in design step 6 — until then the image updater
  reports such a pin `invalid`.
- `--image-version` / the answers' `image_version` accepts
  `{imageTagOf(identity), X.Y.Z-dev}`; anything else is refused on its
  question, naming the set.
- Official: stable/prerelease → the registry is asked for
  `:<imageTagOf(identity)>` (absent refuses, unknown never refuses); dev →
  refused from the identity, no registry asked, on the `image_source`
  question and by the System check. The default `image_source` is `official`
  for stable/prerelease, `build` for dev (owner Q6).
- The installer header, welcome and System check name the identity with its
  kind (`7.0.0-beta.7 (prerelease)`, `7.0.0.dev (development build)`).
- Test seam `DEDALO_INSTALL_RELEASE_IDENTITY` (test process only, same data
  version only; refused anywhere else).

Gates: `test/unit/installer_identity_native.test.ts` (derivation per kind,
seam refusals, docs re-derived — design gate 12),
`test/unit/install_stack_steps_native.test.ts` describe "the image follows
the installer's RELEASE IDENTITY" (design gate 6: prerelease probes and pulls
`:<identity>`, refuses a `:X.Y.Z`-labelled image; dev builds
`localhost/dedalo:X.Y.Z-dev`, refuses Official with no registry call),
`test/unit/install_sh_image_source.test.ts` (prerelease Build: tag = label =
the built archive's identity), `test/unit/install_probe_child.test.ts`
(System check label per kind).

## Addendum 2026-10-15 — the shell library and the image updater (design step 6)

The host side reads the same identity and the same order as the engine
(`deploy/dedalo-image-lib.sh`, the shell twin of `release_identity.ts`).
This supersedes the "until then the image updater reports such a pin
`invalid`" sentence of the step-5 addendum.

Before: `DEDALO_VERSION_RE` = `^[0-9]+\.[0-9]+\.[0-9]+(-dev)?$` (leading zeros
accepted, no prerelease); `dedalo_version_cmp` compared integer triples only
(`-dev` ignored); a local build's `org.opencontainers.image.version` label was
the tag part of the reference it was built under; the image updater's build
mode compared `version.ts`'s triple with `${TARGET%-dev}`; `--ref` was for
`-dev` targets only.

After:
- `.dedalo.env DEDALO_VERSION`, `dedalo-image-update.sh --version`, the outcome
  file's `from` / `to` and the host updater's request tag: the image-tag
  grammar `^X.Y.Z(-dev|-(alpha|beta|rc).N)?$` with canonical numbers (no
  leading zero) — exactly the set `identityOfImageTag` accepts. NEW in the
  domain: `X.Y.Z-(alpha|beta|rc).N`. REFUSED now: a leading-zero number
  (`07.0.0`), which no installer ever wrote.
- Order (`dedalo_version_cmp`, `dedalo_identity_cmp`): semver §11, the one
  ordering fixture; `X.Y.Z-dev` orders as `X.Y.Z`.
- A local build's version label = the image tag of the RELEASE IDENTITY of the
  snapshot built (`X.Y.Z`, `X.Y.Z-beta.N`, or `X.Y.Z-dev` for an untagged
  commit), whatever the reference is tagged; a mismatch is built and said on
  stderr. `dedalo_image_labels CHECKOUT [TREE]` (the second argument was the
  tag; it is now the tree whose identity is labelled).
- Image updater, build mode: the checked-out commit must BE the target — its
  identity's image tag equals a release/prerelease target, or its data triple
  a `-dev` target's; `--ref` is accepted for `-dev` and prerelease targets.
  `--skip-version-check` additionally waives an order refusal WITHIN one data
  version (owner Q4: a stack built from a beta before 7.0.0-beta.7 is pinned at
  the bare `X.Y.Z`); never a step back to an older data version.
- `deploy/deploy.sh`: a ref in the release-tag grammar must be a release the
  checked-out tree calls itself, or the deploy is refused before the restart.

- Image-update channel (`image_update_channel.ts`), the fields the HOST
  reports: heartbeat `pinned` and outcome `from` / `to` accept the host's
  image-tag grammar (`identityOfImageTag`, ≤ 64 chars) besides the walkable
  tags. Before, a prerelease-pinned stack (every beta stack the step-5
  installer builds) had its heartbeat refused as malformed — the host updater
  stopped — and a prerelease outcome was unrecordable.

Not changed here: what the engine WALKS — `parseImageTag` (`version_walk.ts`,
`IMAGE_TAG_RE`), a request's `tag` / `version` / `channel` and the
`check-target` answer — still reads `X.Y.Z(-dev)?`; a prerelease target
reaches it only with the identity walk (design step 9c). Until then
`check-target <X.Y.Z-beta.N>` answers `malformed_version`, exit 3 — a
REFUSAL, not "unavailable" — and so does every engine up to 7.0.0-beta.6,
which is the engine a stack being updated runs (the OLD image answers, so no
engine change can fix it for that stack). The host therefore translates
(`dedalo-image-update.sh` `engine_blind_to_identity`): `malformed_version` for
a prerelease target, or `downgrade_or_same_version` for a release from a
prerelease of the same X.Y.Z (rc.1 → X.Y.Z, which the engine sees as
X.Y.Z → X.Y.Z), is re-asked as the DATA walk `check-target X.Y.Z-dev` — same
X.Y.Z or the next rung legal, a skip or a step back refused (exit 3, never
waivable), which is the design §2.8.3 rule at the data level; release order
within the X.Y.Z stays the host's step 3. The panel cannot request a
prerelease until 9c.

Gates: `test/unit/release_identity_shell_parity.test.ts` (design gate 7 —
identity over the shared truth table `test/fixtures/release_identity/truth_table.json`
as checkout and archive, the grammars over both fixtures, the order driven by
`test/fixtures/release_identity/ordering.json`, deploy.sh's refusal),
`test/unit/image_update_script_native.test.ts` (prerelease pull/build, `--ref`,
the Q4 waiver and its limit, lightweight tags — every prerelease ask answered by
the REAL `check-target` CLI, not an always-ok stub; the data-walk re-ask and its
rung-skip refusal), `test/unit/install_sh_image_source.test.ts`,
`test/unit/install_stack_steps_native.test.ts` (labels = identity),
`test/unit/image_update_channel_native.test.ts` + `test/unit/image_updater_host_native.test.ts`
(a prerelease pin beats, a prerelease outcome is recorded, the host floor
orders prereleases, a prerelease request target is still refused).

## Addendum 2026-10-15 — CI holds the identity at publication (design step 7)

No wire shape changes here; the shapes above become RELEASE CONDITIONS.

- The image pipeline's smoke (`scripts/ci/image_release.ts` `SMOKE_HEALTH_SCRIPT`,
  part of each arch's smoke) boots the built image's own server in smoke-boot
  mode with no database and requires the SERVED `/health` `version` = the
  identity the run was planned for (a release tag's `X.Y.Z`; a developer
  build's archive identity — the tag when the commit is exactly tagged, else
  `X.Y.Z.dev`) and `release_kind` = its kind. `/health` answers 503 `db:
  down` there and still carries both keys; a reply without them fails.
- A release tag (stable or prerelease grammar) is published only when its
  commit's `version.ts` declares the tag's triple AND carries
  `changes/<identity>/release.json` for exactly that identity, ending at that
  tag (`scripts/lib/release_tag.ts` `releaseTagFault` — the pre-push hook via
  `bun run push:release-tag`, and image-release `plan`). The push door passes,
  with a note, a tag whose identity sorts below `FIRST_CUT_RELEASE`
  (7.0.0-beta.6): those tags were published before the rule and cannot meet it
  at their own commit; `releaseTagFault` itself (and so `plan`) stays strict.
- Archives that carry the identity (`build_info.txt`'s
  `%(describe:match=…,abbrev=…)`) are built only with git >=
  `MIN_GIT_FOR_DESCRIBE` (2.35, sourced from git's RelNotes/pretty-formats in
  `release_identity.ts`): the code-server build answers `update.refused`
  ("Error. The code server's git is older than 2.35: …"), the image pipeline
  refuses at `plan`/`context`. Before, an older git produced an archive whose
  identity silently fell to `X.Y.Z.dev`.

Gates: `test/unit/image_release_native.test.ts` (design gate 10: the health
fragment EXECUTED against this checkout's real server — its own identity
passes, a wrong version or kind is red; an uncut tag and an old git refused
at `plan`), `test/unit/release_tag_native.test.ts` (design gate 11 on a real
repository + the git-minimum table), `test/unit/pre_push_gate_native.test.ts`
(every pushed `v*` tag checked at its commit before any gate; a failing check
pushes nothing), `test/unit/code_build_native.test.ts` (an old git refuses
the build before anything is written).

## Addendum 2026-10-15 — the separation is tripwired (design step 8)

No wire shape changes. What this entry promises — the DATA version compares,
migrates and names files; the IDENTITY is what the program calls itself — is
now held mechanically, on data flow rather than names:

- data-version consumers (publication host, tool min-version, seeds /
  matrix_updates, install-plan engine checks, boot confirm, the update walk /
  catalog / engine, the code server's build / manifest / asker parse) read no
  binding that carries the identity, however it is imported or renamed;
- every display site above (`/health` `version`, page_globals / info_data
  `dedalo_version`, login "Code version", update status `engine_version`, the
  installer's version label / image tag, image-update `from_version`, the
  error report's `dedalo_version`) emits a value that reaches the identity
  and no data-version alias — a mix hoisted into a constant or a helper
  included;
- the client never reads `dedalo_version` as numbers — directly, through a
  wrapper or a string transform (`.replace('.dev', '')`), destructured, or
  through a local — and takes the data triple from
  `dedalo_data_version` or `common/js/release_identity.js`.

Gate: `test/unit/release_identity_separation_tripwire.test.ts` (design gate 9;
model `test/helpers/release_identity_flow.ts`). It supersedes, as a stronger
form, the spelling scan of `dedalo_version.split(` in
`test/unit/client_release_identity.test.ts`, which stays as a cheap second net.

## Addendum 2026-10-18 — `page_globals.release_kind`; the harvest User-Agent (owner Q10, Q11)

`page_globals` (`get_environment` / `start`)
- Before: the kind of build was not published there; the menu's debug-bar
  badge sniffed the identity (`dedalo_version.indexOf('7.0') !== -1` → class
  `beta`), which marked the stable `7.0.0` beta and missed any prerelease of
  another X.Y.
- After: NEW key `release_kind: 'stable' | 'prerelease' | 'dev' | null` —
  `RELEASE_IDENTITY.kind`, the `/health` vocabulary; `null` for anonymous
  callers, exactly like `dedalo_version` (API-03). TS-ONLY (no PHP twin): the
  environment differential asserts its presence, then strips it (the WC-031
  pattern). `info_data` is unchanged. The client's badge reads
  `page_globals.release_kind` — `beta` for `prerelease`, `dev` for `dev`,
  nothing for `stable`, an absent key (an older server) or any other value.

Harvest door (`src/core/harvest/identity.ts`, OUTBOUND, not this server's wire)
- Before: `User-Agent: dedalo/<DEDALO_VERSION> (+https://dedalo.dev; heritage
  cataloguing)` — the data version.
- After: `dedalo/<release identity> (…)` — the header names the software that
  made the request, so a remote log tells a beta from the stable release. The
  robots.txt product token (`dedalo`) is unchanged.

Gates: `test/unit/release_identity_served_native.test.ts` (logged-in
`release_kind` = `RELEASE_IDENTITY.kind` = the kind of the SERVED
`dedalo_version`; anonymous `null`), `test/unit/client_release_identity_wire.test.ts`
(executes `render_debug_info_bar`: the class follows the kind, a kind that
contradicts the string wins, a stable `7.0.0` is unmarked — red against the
`indexOf('7.0')` sniff), `test/unit/harvest_door_native.test.ts` (the SENT
header starts `dedalo/<identity> (`), `test/unit/release_identity_separation_tripwire.test.ts`
§3b (`HARVEST_USER_AGENT` carries the identity, its module reads no data
version — with planted controls).

## Addendum 2026-10-18 — the code server BUILDS prereleases (design §2.8 items 1 + 6; extends WC-2026-09-29-code-release-channel-refs)

Owner Q1: a prerelease tag IS a release. This addendum is the BUILD half (the
consumer's `prerelease` channel token and the manifest that advertises one are
not here yet — design 9b).

Code-server build (`serve_code.build_version_from_git_master`)
- Before (WC-2026-09-29): `options.channel` ∈ `master | dev`; a prerelease tag
  was no release tag — `releaseFileName` named any `vX.Y.Z-beta.N` ref build
  `<v>-dev.zip`; the release tag grammar was a private stable-only regex; tags
  ordered by numeric triple; a release build overwrote an existing `<v>.zip`.
- After:
  - `options.channel` ∈ `master | prerelease | dev`. `prerelease` builds the
    newest prerelease tag of this engine that sorts ABOVE the newest stable
    one (`code_build_plan.ts prereleaseTagAbove`); none → `update.refused`
    "No prerelease to build…" before any directory is provisioned. `master`
    is unchanged (the newest STABLE tag, never a newer beta). An explicit
    `ref: 'v7.0.1-beta.2'` is qualified to `refs/tags/…` like a stable one.
  - ONE tag grammar — the shared `RELEASE_VERSION_RE` (canonical numbers,
    `alpha|beta|rc` only); `releaseTagsNewestFirst` orders by
    `compareReleaseIdentities` (`7.0.0-beta.9 < 7.0.0-beta.10 < 7.0.0-rc.1 <
    7.0.0`). `releaseTagVersion` keeps meaning "a STABLE tag's version" (the
    image plan's rule until design 9d); `releaseTagIdentity` reads either kind.
  - File grammar (`code_manifest.ts releaseArchiveNameOf` / `codeReleasePath`):
    `<X.Y.Z>.zip | <X.Y.Z-(alpha|beta|rc).N>.zip | <X.Y.Z>-dev.zip`, all under
    `<X>/<X.Y>/`, confinement unchanged (every accepted character is
    `[0-9a-z.-]`). A tag/version.ts triple disagreement is refused for a
    prerelease tag too (`tag/version mismatch`).
  - IMMUTABLE: a tag build (stable or prerelease) whose `.zip` AND `.sha256`
    already exist is refused (`update.refused`, "…is already published… a
    published release is immutable"); the archive is written to a `.partial`
    name beside it and CLAIMED with a no-overwrite link, so a racing build is
    refused too. An archive with no sidecar (an interrupted build — never
    installable) is replaced. A `-dev.zip` is still replaced (a branch tip).
  - SELF-NAMING: before publishing, the build reads the archive's own
    `dedalo_code/src/core/update/build_info.txt` back (`unzip -p`); an archive
    whose stamp's describe field is not exactly the tag — so an installed
    engine would not call itself the release (a lightweight tag) — is refused
    (`update.refused`) and nothing is published. The refusal names the cause
    from the parsed stamp: an expanded describe naming something else → "must
    be ANNOTATED (`git tag -a`)"; a LEGACY two-field stamp (a tree cut before
    the describe field — every prerelease tag up to `v7.0.0-beta.6`) →
    "predates the release-identity stamp" (re-tagging cannot fix it); an
    unexpanded stamp → no export-subst. A prerelease whose committed
    `build_info.txt` placeholder lacks `%(describe…)` is not a candidate at all
    (`code_build_plan.ts` placeholderNamesItsTag): the *Build prerelease*
    channel and the panel's `prerelease_ref` skip it, so the panel never offers
    a build that must fail. The build module stays a data-version consumer (separation tripwire): it
    compares the stamp to the tag, never asks the identity resolver; GATE 13
    proves the resolver agrees on the real archive.
  - Serving (`GET /dedalo/install/code/<X.Y.Z>/<file>`): `<file>` may be any
    archive OF THAT TRIPLE in the grammar above (or its `.sha256`) — a
    prerelease is servable at `/<X.Y.Z>/<X.Y.Z-beta.N>.zip`.
  - Panel (`serve_code` widget value, `code_server`): `source` gains
    `prerelease_ref | prerelease_sha | prerelease_date | prerelease_version`
    (null when there is none above the release); `releases[]` items gain
    `identity` (`7.0.1`, `7.0.1-beta.2`, null for dev) and `channel` gains
    `'prerelease'`. The client renders a third row, *Build prerelease*.

Release-tag push door (`scripts/lib/release_tag.ts`, the pre-push hook)
- Before: `check <tag> <commit>`, exit 0 for a pass AND for nothing-to-hold;
  the hook required a FULL green only for a stable `vX.Y.Z` (its own regex).
- After: `check <tag> <commit> <object>` (`<object>` = what the pushed ref
  names); exit 0 = a HELD release tag (stable or prerelease) that passes, 3 =
  nothing to hold (no identity, or below `FIRST_CUT_RELEASE`), 1 = refused, 2
  = usage. A held tag must be ANNOTATED (`git cat-file -t <object>` = `tag`,
  owner Q7). The hook holds no tag regex: every exit-0 tag needs a FULL green
  for its commit, prereleases included.

Gates: `test/unit/code_build_native.test.ts` (GATE 13: a server running
`X.Y.Z` builds and serves `X.Y.(Z+1)-beta.1`, the archive's own stamp resolves
(through resolveReleaseIdentity) to the tag, a second build is refused with the bytes unchanged, lightweight (stable AND
prerelease) / pre-stamp / mismatched / superseded tags refused, an orphan replaced, the publish's
no-overwrite claim), `test/unit/release_tag_native.test.ts` and
`test/unit/pre_push_gate_native.test.ts` (GATE 18), `test/unit/code_manifest.test.ts`,
`test/unit/client_serve_code_render.test.ts`.

## Addendum 2026-10-18 — the `prerelease` update channel (design §2.8 items 2-3, manifest half; extends WC-2026-09-29-code-release-channel-refs)

The CONSUMER half of the build addendum above: who is offered a prerelease.
The channels form a LADDER (owner Q8) `master ⊂ prerelease ⊂ dev`; each rung
needs BOTH the consumer's ask and the master's own opt-in.

Code master config
- NEW key `DEDALO_CODE_SERVER_PRERELEASE_CHANNEL` (bool, default `false`,
  catalog `maintenance.ts`) — a SEPARATE switch from
  `DEDALO_CODE_SERVER_DEV_CHANNEL`: a master publishes betas without exposing
  branch builds, and the other way round.

`dd_utils_api.get_code_update_info` (`options`)
- Before: `channel` read as `=== 'dev' ? 'dev' : 'master'`; `release` sent by
  the client but unread.
- After: `channel` ∈ `master | prerelease | dev` exactly (anything else is
  `master`, never a refusal, never wider). `release` (the asker's identity)
  places the asker in the release sequence — trusted only when it parses AND
  names the asker's own data triple (`version`); otherwise the asker stands at
  its bare triple (= the stable release of it), which offers nothing of its own
  triple. Never a throw on wire text.

Manifest answer (`data`)
- `info` gains `channels` — EVERY rung this master HONOURED, in ladder order
  (`['master']` when it published nothing more than releases; `['master',
  'dev']` for a `dev` ask on a master with the dev switch but not the
  prerelease one). A set, not a highest rung: the switches are separate, and a
  single `dev` would claim prereleases the answer does not hold. An OLDER
  master's answer has no such key and answers a `prerelease` ask as a release
  ask (its parse knows only `dev`) — the client reads the absence as
  `['master']` for a prerelease ask, and as `['master', 'dev']` (no
  prereleases) for a dev ask that brought developer items back.
- `files[]`, in order: dev items (dev rung honoured; unchanged), then the
  archives of the asker's OWN triple ABOVE its identity, ascending by
  `compareReleaseIdentities` (the stable `<X.Y.Z>.zip` to any asker below it —
  a stable release is no exposure; its prereleases only on an honoured
  prerelease rung), then ONE item per upgrade rung: the stable `<v>.zip` when
  it exists, else — prerelease rung only — the rung's newest prerelease. A
  `master` asker therefore never sees a prerelease, even when one is the newest
  identity on the master.
- A prerelease item: `{version: <X.Y.Z> (the DATA triple — the URL segment and
  what every update door parses), release: <X.Y.Z-beta.N>, channel:
  'prerelease', url: …/<X.Y.Z>/<X.Y.Z-beta.N>.zip, date, sha256, notes?}`;
  `notes` from `changes/<X.Y.Z-beta.N>/release.json` (its own cut).
  Published items stay byte-unchanged (no `channel`, no `release`).

`update_code` (the swap door, `options.file.channel`)
- Before: `=== 'dev' ? 'dev' : 'master'`. After: any exact `InstallChannel`
  token, else `master`; `prerelease` relaxes NO guard (`assertLinearUpgrade`
  relaxes only for `dev`) and is recorded in `install_stamp.json`
  (`channel: 'prerelease'`, now a valid stamp value; posture stays `release`).
  Moving a prerelease WITHIN its triple (beta.6 → beta.7 → 7.0.0) is the
  identity walk (design step 9c) — until then such an item is listed and its
  install refused as a same-version install.

Update panel (`update_code` widget, client)
- The "Developer builds" checkbox became a 3-way choice — published /
  prereleases / developer builds — sent as `options.channel`. A rung asked and
  not honoured is said above the list (`update_code_channel_not_offered_*`,
  incl. `…_prerelease_with_dev` when developer builds are listed but no
  prereleases); a resumed panel accepts a `/health` prerelease identity of the
  frames' data triple as the update landing (`resolve_health_outcome`); a
  prerelease row is named by `release`, never by its bare `version`; on a
  container installation its host command is `--version <X.Y.Z-beta.N>` (never
  the stable `:<X.Y.Z>`), and a `request_image_update` for it is refused as
  `malformed_version` until the engine walks prerelease image tags (9c).
- `serve_code` widget value (`code_server`) gains `prerelease_channel` (the
  switch, beside `dev_channel`).

Gates (GATE 14): `test/unit/code_manifest.test.ts` (*gate 14*: a master asker
never sees a prerelease, also the newest identity; a prerelease asker at beta.6
sees beta.7 and 7.0.0, then the rung's newest prerelease; a non-opted master
never advertises one; the ladder and the separate switches; an untrusted
`release` never widens; a rung's stable outranks its prereleases),
`test/unit/utils_update_manifest_native.test.ts` (the same through the real
door, in a child configured as a master), `test/unit/client_update_code_render.test.ts`
(*gate 14, consumer half*: executes `update_code_channel.js` — an older
master's answer, built from its shipped channel parse (vendored byte-exact in
`test/fixtures/release_identity/legacy_channel_parse.json`, checked against the
`v7.0.0-beta.6` blob when the tag is in the clone), reads as "not offered"; the
dev-on/prerelease-off answer names the missing prereleases;
the shortfall follows the ladder; a prerelease row's name), `test/unit/code_update.test.ts`
(the same-version refusal holds for `prerelease` and near-miss tokens),
`test/unit/update_install_stamp_native.test.ts`; browser:
`client/dedalo/test/client/js/test_update_code.js` (the prerelease host command).
- **Gate reconciliation:** TS-only surfaces, no PHP fixture involved;
  `code_manifest.test.ts`'s `info` equality gains `channels: ['master']`.

## Addendum 2026-10-18 — the identity walk (design §2.8 item 3, step 9c; extends WC-2026-09-29-code-release-channel-refs)

Every door that moves an install to another version asks ONE rule,
`src/core/update/version_walk.ts` `identityWalkRefusal(running, target,
channel, offered?)`, from what the engine CALLS ITSELF (`build_stamp.ts`
`DEDALO_ENGINE_VERSION`). It replaces the triple-only `assertLinearUpgrade` at
every door; that data walk stays, unchanged, as the clause for a move that
crosses a data triple (and as the contract of every older engine).
- SAME data triple → no migration rung: a NEWER identity is legal
  (`beta.6 → beta.7`, `beta.7 → rc.1 → 7.0.0`; skipping betas included); a
  developer build is legal on the dev channel (the 2026-08-24 exception); on
  the dev channel a RUNNING developer build may also move to any release of its
  triple (the way back to the release line). OFF the dev channel a running
  `X.Y.Z.dev` compares as its bare triple — an install of a stable archive can
  resolve to `.dev` without being a branch build, and must never be offered
  `X.Y.Z` again or an older prerelease of it. An older or equal identity is
  refused.
- ANOTHER triple → the data walk (up, next rung only) — and, where the offer is
  known (the manifest), the target is the rung's newest identity on the asker's
  channel (`newestOfRung`, which `code_manifest.ts` `rungItemsFor` now picks
  with).
- Channel admission: a prerelease target needs `prerelease` or `dev`; a
  developer build needs `dev`.
- Refusal ids (`WalkRefusal`), before: `downgrade_or_same_version |
  version_skip`. After: + `not_newer_release` (the same-triple order — its own
  id, so `deploy/dedalo-image-update.sh` never mistakes an informed refusal for
  an older engine's blind `downgrade_or_same_version` and re-asks it away),
  `channel_refused`, `not_newest_of_rung`.

`update_code` (the swap door)
- `options.file` gains `release` (forwarded from a prerelease manifest item);
  it must be a prerelease OF `file.version`, else `request.invalid_options`
  ("Malformed release identity"). The walk's target is `release`, else
  `<version>.dev` on the dev channel, else `version`. A same-triple prerelease
  item is no longer refused as a same-version install (supersedes the
  "until then … refused" line of the manifest addendum above).
- Frames: the `restart` frame's `expected_version` is the target IDENTITY
  (before: the data triple); unchanged for a release (they are equal) and for a
  developer build (its identity is its archive's to say — the digest decides).
- Success envelope `data`: `{version}` → `{version, release?}` — `release` only
  when it differs from `version` (a prerelease); a release's envelope is
  byte-unchanged.
- Sentinel / backup-dir names keep the DATA version (`boot_confirm.ts`).
- `file.version` must be a canonical bare triple (the shared grammar,
  `RELEASE_VERSION_RE` with no suffix), else `request.invalid_options`
  ("Malformed release version"). Before: `^\d+(\.\d+){1,3}$` — `7.0`,
  `07.0.1` and `7.0.1.4` passed, and the first two then made the walk THROW
  (an untyped job failure, not the refusal).
- The archive must BE the release the walk judged: the url's file name
  (`releaseArchiveNameOf`: `<identity>.zip`, `<triple>-dev.zip`) must name the
  target identity, else `request.invalid_options` before any fetch; after
  extraction the quarantine's own build stamp, resolved against the request
  triple (`readReleaseIdentityOf`), must equal it, else `update.refused`
  (developer builds exempt — their archive names them). Before: a stable
  request could carry a prerelease archive's url and install it.

Update panel (client)
- `resolve_health_outcome` compares the identity EXACTLY; the "a prerelease of
  the expected triple meets it" acceptance (manifest addendum above) is
  REMOVED: within a triple the rolled-back tree answers the same triple, so it
  read every same-triple rollback as an update. The click passes the item's
  identity (`item_release`), the resume path reads `data.release ?? data.version`.
- `request_image_update` `options` gains `release` (a prerelease item's).

Image-update channel
- `check-target <tag>` accepts `X.Y.Z-(alpha|beta|rc).N` (`IMAGE_TAG_RE` /
  `parseImageTag` = the host's grammar, canonical numbers; `ImageTag` gains
  `identity`, `channel` gains `prerelease`) and walks it from the image's own
  identity — a current engine never answers a prerelease `malformed_version`.
  The host's data-walk re-ask (`engine_blind_to_identity`) stays for engines
  that predate this walk (beta.6 and older).
- The request record (`request.json` / `inflight.json`): `channel` ∈
  `master | prerelease | dev` (before: `master | dev`); `tag` may be a
  prerelease tag (`version` stays the data triple). Supersedes the manifest
  addendum's "refused as `malformed_version` until … (9c)".

`UPDATE_CATALOG` is keyed by triple and matched against the stamped DATA version
(`matrix_updates`), so a triple's descriptor runs once, on the first identity of
that triple installed; a prerelease contributes none. The running-`.dev`
same-triple relaxation applies ON THE DEV CHANNEL only: elsewhere a running
`X.Y.Z.dev` is its bare triple to the order (`X.Y.Z` itself refused as
`not_newer_release`, a prerelease of it too).

Gates (GATE 15): `test/unit/release_identity_walk_native.test.ts` — ONE fixture
`test/fixtures/release_identity/walk_truth_table.json` read by the rule, by the
REAL host CLI run from an engine tree that calls itself the row's identity
(`test/helpers/engine_cli_tree.ts`), and by the client verdict (live and resume
path); plus the catalog-once run (<rung>-beta.7 → rc.1 → <rung>: one
descriptor run — each hop an engine tree calling itself that identity, reading
and stamping the data version through the real doors on the marked suite
database; an identity-derived reader turns it red). Also `code_update.test.ts`
(the swap door: walk, malformed `version`/`release`, the archive-name and
quarantine-identity refusals, a
beta.6 → beta.7 swap end to end with the identity in the restart frame and the
envelope), `image_update_channel_native` (census from a pinned engine;
`not_newer_release`), `image_update_script_native` (the current engine answers
directly, asked once; an informed refusal is never re-asked; the older engine,
emulated by its exact contract, still gets the re-ask), `update_code_widget_native`
(a prerelease request is tagged by its identity), `client_update_code_render`.
- **Gate reconciliation:** TS-only surfaces, no PHP fixture involved.

## Addendum 2026-10-18 — the official image of a prerelease (design §2.8 item 4, step 9d)

Before: `image-release.yml` triggered on stable tags only; `plan` refused a
prerelease tag ("prerelease tags are never published"); the signing identity
(`engineering/image_registries.json` `signing.identity_regexp`, which every
`cosign verify` reads — the publish verb, the installer, the image updater, the
operator) accepted `refs/tags/vX.Y.Z` and `refs/heads/master` only. The
installer's Official probe already asked `:<imageTagOf(identity)>` (step 5), so
for a prerelease it always found `absent`.

After:
- Trigger: `vX.Y.Z` plus `vX.Y.Z-alpha.N`, `-beta.N`, `-rc.N` globs; `plan`
  validates the tag exactly (the shared grammar — `v7.0.1-beta.01` is refused).
- A prerelease plan: `version` = the data triple, `tag` = `imageTagOf(identity)`
  = the identity, `channel` = `prerelease` (the image's install stamp; the
  Dockerfile provenance step accepts `master | prerelease | dev`),
  `expected_engine_version` = the identity (smoke: `/health` `7.0.1-beta.2` /
  `prerelease`). Held like a stable release: release-tag check (gate 11), full
  gate, the archive calling itself the tag, immutability, the reviewer.
- The tag SET a run writes to a registry is exactly `{plan tag}`: never
  `latest`, `:X`, `:X.Y`, and for a prerelease never `:X.Y.Z` — `publish`
  refuses a TAG that is not its channel's tag of VERSION before any command
  (`publishTagFault`).
- `signing.identity_regexp` = `…image-release\.yml@refs/(tags/v[0-9]+\.[0-9]+\.[0-9]+(-(alpha|beta|rc)\.[0-9]+)?|heads/master)$`
  (anchored); `deploy/image_registries.sh` regenerated; the printed checks in
  `docs/install/docker.md`, `engineering/RELEASE.md` §13 and `engineering/CI.md`
  are held equal to it.
- The publication record's `channel` ∈ `master | prerelease | dev`.

Gates (GATE 16): `test/unit/image_release_native.test.ts` — a prerelease tag
plan in a real scratch repo, chained into `publish` (stub registry): every
target ends holding exactly `{7.0.2-beta.1}`, which is `imageVersionOf` of the
installer whose archive is that commit; a stable `:X.Y.Z` beside it keeps its
digest; floating/foreign TAGs refused with no command run; a stub `cosign
verify` that matches the run's signer identity against the list regexp passes a
`refs/tags/v…-beta.N` signer and fails a branch one; the trigger globs cover the
ordering fixture and `plan` refuses every non-identity they also match.
`test/unit/image_registries_docs_tripwire.test.ts` F (the three pages),
`test/unit/product_image_tripwire.test.ts` (provenance `prerelease`).
- **Gate reconciliation:** TS-only surfaces, no PHP fixture involved.

## Addendum 2026-10-19 — the dev-build bootstrap reaches its triple's tags (design §2.8 item 5)

Before: a `.dev` asker was its bare triple everywhere but the walk. The manifest
(`code_manifest.ts` `sameTripleItemsFor`) offered a `7.0.0.dev` asker nothing of
`7.0.0` (`beta.7 < 7.0.0.dev`, `7.0.0 == 7.0.0.dev`), and the swap door walked
on the ITEM's token (`prerelease` / `master`), never `dev`, so even a hand-made
request was refused `not_newer_release`. An install bootstrapped off
`7.0.0-beta.6` through `7.0.0-dev.zip` stayed on developer builds until the
`7.0.1` rung.

After:
- Manifest: on a `dev` ask, a `.dev` asker (its `release` a `.dev` of its own
  data triple) is offered EVERY tag-built archive of that triple, in release
  order — the stable release always, the prereleases where the prerelease rung
  is exposed (the master's switch). Items keep their own kind token
  (`prerelease` + `release`, or none). Any other ask: unchanged.
- Swap door: the walk channel is `dev` when the RUNNING tree is a `.dev` that
  its own install stamp says the dev channel installed (`walkChannelOf`, seam
  `runningChannel`); otherwise the item's token, as before. Read from the
  tree, never the request. The stamp then written records the item's token
  (what the tree becomes).
- Unchanged: the image path (`image_update_request.ts`, the host CLI
  `check-target`) walks on the tag's own channel — a `-dev` image install
  reaches a prerelease by the host command (`docs/install/docker.md`).

Gates: `test/unit/code_manifest.test.ts` gate 14 (`§2.8.5 bootstrap`: a
`7.0.0.dev` dev asker is offered `beta.6, beta.7, 7.0.0` then the rung; the
prerelease switch off leaves `7.0.0`; master/prerelease asks unchanged; a
foreign-triple `.dev` is no claim); `test/unit/code_update.test.ts` gate 15
(`§2.8.5 bootstrap`: stamped-`dev` `.dev` passes the walk to beta.6/beta.7/the
release; unstamped / `master` / `prerelease` stamps refused; a `dev` stamp under
a tagged identity keeps the release order). Both proven red by mutation.
- **Gate reconciliation:** TS-only surfaces, no PHP fixture involved.
