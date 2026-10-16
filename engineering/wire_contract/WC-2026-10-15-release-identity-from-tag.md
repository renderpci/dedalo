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
the image updater's (shell) `DEDALO_VERSION` grammar and semver order, the
`prerelease` update channel token, the code-server file grammar for prerelease
archives. The installer's image tag set is the addendum below.

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
