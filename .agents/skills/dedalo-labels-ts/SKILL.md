---
name: dedalo-labels-ts
description: The Dédalo v7 TypeScript/Bun UI-label subsystem — repo-owned label catalogs as the SINGLE source of truth for program strings (WC-033 + WC-034, 2026-07-16). Covers the two roles (src/core/labels/master.json = source of definitions; catalog/lg-<code>.json = per-lang translations), the getLabels serving/fallback chain (src/core/labels/catalog.ts), the labels_tripwire invariants, the scripts/labels_fill.ts translation backlog, the WC-034 rename/tool-local/removal map (test/parity/wc034_label_cleanup.json), and why dd_ontology model='label' rows are now INERT. Use when adding/renaming/removing a UI label key, translating a lang catalog, editing src/core/labels/**, debugging a labels_tripwire or environment_differential get_label failure, wiring a get_label.x reference in client/widget code, moving a string to a tool's register.json, or asking "why does my label serve undefined / why did my label change not show up". PHP oracle (dead): dd_ontology dd383 label children, rebuild_lang_files, client/dedalo/core/common/js/lang/lg-*.js (deleted).
---

# Dédalo v7 UI labels (TypeScript/Bun)

Since the **2026-07-16 label-model migration (WC-033/WC-034)**, `src/core/labels/` is the **SINGLE source of truth for program strings**. Program strings are coupled to CODE, not to the data model: a key exists because a line of client/widget code references it, so **a label ships in the same commit as the code that uses it** (labels ride `git`/`update_code`, NEVER `update_ontology`).

This skill POINTS — the authoritative content lives in `engineering/WIRE_CONTRACT.md` (WC-033, WC-034), the serving code header (`src/core/labels/catalog.ts`), and the gate (`test/unit/labels_tripwire.test.ts`). Read those; this teaches the model and the workflows.

## The model: two files, two roles

- **`src/core/labels/master.json` — the SOURCE OF DEFINITIONS.** The COMPLETE key set, each with its source string. Tripwired complete (every statically-referenced key must exist here). It is *authored in* `MASTER_SOURCE_LANG` (currently `lg-eng` — a fact about who writes the strings, gettext-msgid style, NOT a runtime language priority). Sorted keys, tab-indented, non-empty string values.
- **`src/core/labels/catalog/lg-<code>.json` — per-lang TRANSLATIONS.** All langs equal, sparse allowed (a missing key resolves via the fallback chain). EVERY application lang has one — **including the master-source lang** (`lg-eng.json`), whose file is a sparse display-text OVERRIDE that starts empty (`{}`) and must never contain an entry byte-equal to the master (that's duplication, not an override — the tripwire fails it).

**`dd_ontology` `model='label'` rows (the dd383 children) are INERT for the TS engine.** A WC-023 ontology update still imports them (v6 consumers may read them) but they drive nothing. The old generated `client/dedalo/core/common/js/lang/lg-*.js` files are DELETED. `rebuild_lang_files` / `export_to_translate` stay `engineDenied`.

## Serving: `getLabels` (`src/core/labels/catalog.ts`)

`getLabels(lang)` is served as `get_environment`'s `get_label` — always the FULL master key set, localized. The **wire shape is unchanged** (a lang-keyed string map); only its provenance moved. Fallback overlay order (later wins, no hardcoded language priority):

1. `master.json` — the guaranteed-complete base;
2. the INSTALL's default application lang (`config.lang.applicationLangsDefault` = `DEDALO_APPLICATION_LANGS_DEFAULT`, the operator's choice);
3. a declared LINGUISTIC alias (`LANG_ALIAS`, e.g. `lg-vlca` reads `lg-cat`);
4. the requested lang's own catalog.

**Special case:** requesting `MASTER_SOURCE_LANG` applies ONLY its own override catalog — no other lang may shadow a master the requester already reads natively. A missing per-lang catalog is normal; a missing/malformed **master** throws loudly (broken deploy). Merged dictionaries are cached in the ontology cache hub (`createOntologyCache`) — immutable per deploy; a hub clear just re-reads the files.

## The gate: `labels_tripwire` (`test/unit/labels_tripwire.test.ts`)

Run: `bun test test/unit/labels_tripwire.test.ts`. It enforces:

1. **master + catalog integrity** — parse, sorted, non-empty string entries; empty catalog allowed (sparse).
2. **subset** — every catalog's key set ⊆ the master (no orphan keys).
3. **master-source symmetry** — `lg-eng.json` exists and holds only real overrides (no entry byte-equal to master).
4. **completeness** — every key the client statically references (`get_label.key` / `get_label['key']`) and every plain `kind:'label'` / `kind:'label_concat'` widget rule key in `src/` exists in the master. **This is why you cannot ship a UI string without its definition.**
5. **the `UNCATALOGED_CLIENT_KEYS` ratchet** — pre-migration client keys resolved only through call-site `|| 'literal'` chains. **SHRINK-ONLY:** remove an entry by DEFINING the key in master; never add. A stale entry (no longer referenced, or now defined) fails.

NOT covered (documented, not silently narrowed): dynamic `get_label[variable]` access is unscannable, so dead-label detection is out of scope; `label_mark_fallback` widget rules carry their own literal and are exempt from check 4.

## Workflows

**Add a new UI label** (the common case):
1. Add the key + English source string to `src/core/labels/master.json` (keep keys **sorted**, tab-indented).
2. Reference it in the same commit: client `get_label.my_key` / `get_label['my_key']`, or a `src/` widget rule `{ kind: 'label', key: 'my_key' }`.
3. `bun test test/unit/labels_tripwire.test.ts` — proves the definition exists.
4. Optionally translate (below). Untranslated langs serve the master string via the fallback chain — safe.

**Translate a lang catalog** — `scripts/labels_fill.ts` reports the per-lang missing-key backlog vs the master:
- `bun run scripts/labels_fill.ts` — per-lang missing summary.
- `bun run scripts/labels_fill.ts --lang lg-ita` — that lang's missing keys + source strings (tab-separated).
- `bun run scripts/labels_fill.ts --json` — full backlog as JSON (MT/agent input).
Add translated keys to `catalog/lg-<code>.json` (sorted, tab-indented), review the diff like any code change. The recent `i18n(<lang>): add missing … translations` commits are exactly this.

**Rename / remove / move a key** is a WC-034-class contract edit. The machine-readable map is **`test/parity/wc034_label_cleanup.json`** (28 renames, 21 tool-local migrations, 240 removals) — extend it if you do more, and reconcile `environment_differential` per WC-034. Rules:
- **Rename → English key:** update every reference across `client/src/tools/install`; merging into an existing English key keeps the target's translations and adopts the source's for missing langs.
- **Remove:** only if proven unused — no static reference anywhere, not reachable from any dynamic `get_label[expr]` site, no DB hit (data-driven state/calculation widgets + `search_operators.ts` operator→key map read the live dictionary; degrade via `get_label[x] || x`).
- **Tool-local migration:** a key used by exactly ONE tool and tool-specific in meaning moves into that tool's `register.json` `misc.dd1372` labels; the tool JS switches `get_label.x` → `self.get_tool_label('x')`, keeping its `|| 'literal'` fallback. Requires re-running the *Register tools* maintenance widget to land the DB `matrix_tools` rows. Genuinely generic vocabulary used by one tool (`error`, `print`, `upload`, …) STAYS global.

## Gotchas

- **Label change not showing?** Labels ride CODE deploys, not ontology updates. A running server caches merged dictionaries — the cache lives in the ontology hub; an invalidation/clear re-reads the files. In production, files are immutable per deploy.
- **`get_label` serves `undefined`?** Pre-migration behavior — no longer possible for a defined key (master is complete). If a key is undefined, it's either in the `UNCATALOGED_CLIENT_KEYS` ratchet (add the definition) or genuinely missing (tripwire would fail).
- **Keys must be sorted** in both master and every catalog, or the tripwire fails.
- **Two deliberate VALUE divergences from the PHP oracle dictionary** (WC-033 dup-name collision fixes): asserted present-and-changed in `environment_differential`, not byte-equal. Don't "fix" them back.
- **One-time DB↔file reconcile** (dup-name rows, 22 mojibake-corrupted Italian values, baked-fallback removal) is recorded in `rewrite/LABELS_RECONCILE.md` (local-only).

## Map

| Path | Role |
|---|---|
| `src/core/labels/master.json` | Source of definitions — complete key set, tripwired complete. |
| `src/core/labels/catalog/lg-<code>.json` | Per-lang translations (sparse); `lg-eng.json` = sparse override, starts `{}`. |
| `src/core/labels/catalog.ts` | `getLabels` serving + fallback chain; `MASTER_SOURCE_LANG`, `LANG_ALIAS`, cache. |
| `test/unit/labels_tripwire.test.ts` | The invariant gate. |
| `scripts/labels_fill.ts` | Per-lang missing-key translation backlog. |
| `test/parity/wc034_label_cleanup.json` | Machine-readable rename/tool-local/removal map. |
| `engineering/WIRE_CONTRACT.md` (WC-033, WC-034) | Authoritative contract + gate reconciliation. |
| `rewrite/LABELS_RECONCILE.md` (local-only) | The one-time DB↔file merge record. |

Foundation: **`dedalo-ts-foundation`** (tripwire law). Serving lands in `get_environment` — section/environment read path.
