# RELEASE.md — publishing a code release from the master

The numbered runbook for cutting a release on the code master and making it
installable by every consumer install. The mechanism it drives lives in
`src/core/update/` (build: `code_build.ts`, manifest: `code_manifest.ts`,
serving: `code_serving.ts`, install side: `code_update.ts`); the operating
context (sentinel, rollback, deployment channels) is
`engineering/PRODUCTION.md` §12.

**The two channels (policy 2026-09-29).** A PUBLISHED release (`<v>.zip`,
advertised to every consumer) is built from a stable **release tag**
`vX.Y.Z` — a version that was cut and tagged, never a moving branch tip. The
DEVELOPER channel (`<v>-dev.zip`, offered only to consumers that ask, on a
master with `DEDALO_CODE_SERVER_DEV_CHANNEL=true`) is the tip of branch
**`master`**: the latest integrated code, before its release. The code
server's checked-out branch is irrelevant to both; the refs are resolved on
the server (`code_build.ts resolveBuildRefOrRefuse`).

The example below publishes `7.0.1` from a master running `7.0.0`. Substitute
your versions; the walk is strictly linear (`code_manifest.ts` — the next
minor within the major, no skipping).

1. **Bump the engine version.** Edit `DEDALO_VERSION_TRIPLE` in
   `src/core/update/version.ts` to `[7, 0, 1]`. The master must RUN the
   version it publishes — the manifest advertises releases strictly above the
   consumer's version and on the linear walk from it.

2. **Add the catalog descriptor.** Append a `7.0.1` `UpdateDescriptor` to
   `UPDATE_CATALOG` (`src/core/update/catalog.ts`) stating what the release
   needs: `updateData: false` for a code-only release, or the
   `sqlUpdate`/`runScripts` steps for a data migration. Script steps key into
   `SCRIPT_REGISTRY` (`src/core/update/engine.ts`) — register the script
   there first.

3. **Verify the gates.** `DEDALO_DATABASE_CONN=<suite db> bun test
   test/unit/…` for the touched surfaces, `bunx tsc --noEmit` (zero NEW
   errors), `bun run lint` on the touched files. **Tag the release commit**
   (`git tag v7.0.1 && git push <remote> v7.0.1`). The tag IS the release: its
   name and the commit's `version.ts` must agree (the build refuses a
   `v7.0.1` tag whose tree declares another version), and prerelease tags
   (`v7.0.1-beta.1`) are never published: while a major is in beta there is
   no release, and its code reaches installations only as developer builds of
   `master`. PHP-era tags (`v6.x`) are never candidates — a tag is publishable
   only if its tree carries `src/core/update/version.ts`.

4. **Bring the build checkout up to date**: `git fetch --tags` (and pull
   `master`) in `DEDALO_CODE_SERVER_GIT_DIR` — the panel reads LOCAL refs; a
   tag that was never fetched does not exist for it.

5. **Deploy the master itself** so it RUNS what it publishes (its own channel:
   tree swap or image, `PRODUCTION.md` §12). After the restart the boot log
   and the maintenance area must both show `7.0.1`.

6. **Build the archive.** In the master's maintenance area, open the
   *serve code* panel and use its *Build release* button (served only when
   `IS_A_CODE_SERVER` is set and `DEDALO_CODE_SERVER_GIT_DIR` +
   `DEDALO_CODE_FILES_DIR` are configured). It archives the NEWEST release
   tag — the panel's *Release tag* row names it before you press — with
   `git archive --format=zip --prefix=dedalo_code/ refs/tags/v7.0.1`.

7. **Verify the artifact on disk:**
   `<DEDALO_CODE_FILES_DIR>/7/7.0/7.0.1.zip` **and** its `7.0.1.zip.sha256`
   sidecar. A release with no valid sidecar (missing, or not a plain 64-hex
   digest) is still ADVERTISED but NOT installable — the consumer refuses an
   archive it cannot verify. That is deliberate: a lost sidecar fails loudly
   at install time, never silently.

8. **Verify the serving URL.** The exact URL the manifest advertises:

   ```
   curl -fsS https://<master host>/dedalo/install/code/7.0.1/7.0.1.zip.sha256
   ```

   Serving is fail-closed (`code_serving.ts`): only with `IS_A_CODE_SERVER` +
   `DEDALO_CODE_FILES_DIR`, only that release's own `.zip`/`.sha256`, path
   re-derived through the same confinement gate the manifest uses.

9. **Verify discovery from a consumer.** On a consumer install pointed at
   this master, open the maintenance area's *update code* panel: it must
   offer `7.0.1` with its sha256.

10. **Install on the consumer.** The pipeline downloads, verifies the sha256,
   pre-validates and extracts to quarantine, installs dependencies there,
   smoke-boots, swaps, writes the sentinel, restarts (`PRODUCTION.md` §12).

11. **Confirm BOTH markers moved** on the consumer: the engine version
    (`7.0.1`) AND the build stamp shown in the maintenance area. A version
    that changed with a stale build stamp (or vice versa) means the swap did
    not land — investigate before calling the release done.

Note: `deploy/deploy.sh` is a PARKED git-based deploy that has never run
against a real host — it is not a step of this runbook.

Automated twin: steps 1–11 are rehearsed end to end by
`bun run test:update` (`scripts/update_drill.ts`) — a scratch clone gets the
release commit and its `v<version>` tag, a real master instance builds and serves it, and a git-archive
copy installs it across the planned-death restart. Run it after changing
ANYTHING under `src/core/update/`, the update widgets, or `.gitattributes`
export rules; it is the only gate that exercises build → serve → discover →
install → restart as one wire-true sequence.
