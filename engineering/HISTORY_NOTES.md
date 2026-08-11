# History notes — commits that do not build, and commits that bundle unrelated work

Permanent record of hazards in the committed history. This file exists so that a
`git bisect` result inside a listed range is not mistaken for a real regression.

**Nothing here is rewritten.** Every commit named below is already published on
`gitdedalo/v7`; rewriting shared history costs more than the hazard it removes.
The tree at every later commit is correct — these are point-in-time defects only.

---

## 1. Commits that do not build (2026-08-08)

Two test files were committed *before* the `export` keyword they import. At each of
these commits `bun test` and `bunx tsc --noEmit` both fail. Bisecting across them
reports breakage that is an artefact of commit ordering, not a code regression.

| Broken commit | Imports | Not exported until |
|---|---|---|
| `8ad9cf0cd1` | `isCanonicalEmpty` from `src/core/components/component_info/widgets/dd/user_activity.ts` | `69328d2dfe` (+95 s) |
| `145eb1a92f` | `restoreSnapshots` from `src/core/ontology/ontology_update.ts` | `3adff10471` (+11 min) |

`145eb1a92f` also adds `ontology_recovery_file_native.test.ts`, whose other seam
(`buildRecoveryVersionFile`) *was* already exported at that commit — only
`restoreSnapshots` breaks it.

**When bisecting:** treat these two commits as `git bisect skip`.

---

## 2. Commits that bundle unrelated work (2026-08-08)

These carry the test-coverage program *and* in-progress work from another stream in
the same commit. The commit messages describe only part of what they contain.

| Commit | Coverage-program part | Also contains |
|---|---|---|
| `58d81c79c0` | — | client record-pin / SQO scoping (`render_open_list_with_direct_relations.js`, `test_open_related_data.js`), `src/core/security/session_store.ts`, `test/unit/sqo_session.test.ts` |
| `1d5b3ebcc5` | — | grid layout fix (`view_indexation` js+less, `main.css`, `ts_object.less`) |
| `0a4f22b6a1` | `test/unit/api_gzip_native.test.ts` | JSON response gzip in `src/server.ts` + `src/core/api/static_asset.ts` |

`api_gzip_native.test.ts` corresponds to no item in the coverage plan — it was
written opportunistically against pre-existing changes found in the working tree.
It is a valid gate; it is simply not part of the planned scope, so do not look for
its rationale in the plan.

---

## 3. Attribution

The 42 commits of the 2026-08-08 test-coverage program were *committed* by coding
agents (39 in-scope + the 3 in §2, whose contents are partly hand-written work the
agent swept up) and carry **no `Co-Authored-By` trailer** — they are
indistinguishable from hand-written commits in `git log`, and several messages
narrate intent behind changes the agent did not make. Weigh commit-message rationale in that range
accordingly; the code and its tests are the reliable record, the prose is not.
