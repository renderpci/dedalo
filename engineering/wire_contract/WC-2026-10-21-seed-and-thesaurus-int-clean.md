# WC-2026-10-21-seed-and-thesaurus-int-clean — a fresh install and an imported thesaurus are born with int record addresses (and the seed carries the `section_id_int_normalize` marker)

- **Date:** 2026-10-21 (cross-ops:r2, review-diff b095553e22..a1cb1f7549 S2).
- **Decision:** applies WC-2026-08-10-section-id-int-canonical ("writers mint int",
  "every future migration arrives int-clean") to the two doors that load PHP-era COPY
  text into matrix tables outside the engine's writers. No new divergence class: the
  same rule, the same kernel, two more writers.
- **Gates:** `test/unit/copy_section_ids.test.ts` (the codec),
  `test/unit/seed_section_id_int_clean_native.test.ts` (the canonical records, the
  marker statement, the compiler census), the content contract
  `test/helpers/seed_contract.ts` (census + marker, held by
  `install_seed_contract_native` on the committed seed and `seed_build_native` on a
  fresh compile), `test/unit/hierarchy_import_obligations_native.test.ts` (d).

## Shape before

- **The install seed** (`install/db/dedalo_install.pgsql.gz`, compiled by
  `src/core/install/seed_build.ts`) shipped record addresses in the repealed STRING
  form: root's `dd1725` / `dd131` / `dd244` locators and every canonical record's
  `dd197` / `dd200` (`src/core/install/seed_sources.ts` quoted literals), the langs
  (`matrix_langs.relation`, 129 916), the core registry row, the core ontology
  packages (`matrix_ontology.relation` / `.misc`, 313). Measured on the committed
  seed at a1cb1f7549: 130 245 string addresses, and NO `section_id_int_normalize`
  row — a fresh install never runs the sweep, so the contraction release's boot floor
  (WC-2026-08-10 step 5) would have had nothing to find, and an int-only probe would
  miss root's profile, project and audit-author locators.
- **A thesaurus import** (`src/core/install/hierarchy_import.ts`, installer + the
  add_hierarchy widget) `\copy`'d the vendored `<tld>1|2.copy.gz` verbatim: e.g.
  `de1.copy.gz` carries 449 484 string addresses (89 843 int).

## Shape after

- **One codec** (`src/core/install/copy_section_ids.ts`): every jsonb field of a COPY
  row goes through the sweep's own kernel (`intifySectionIdsInValue` — the shared
  conversion vectors), re-encoded by `encodeForJsonb`. Convertible strings → int on
  any tipo; everything else verbatim; nothing purged. A field whose numbers would not
  survive a JavaScript round trip (`40.0`, digits beyond 2^53) is KEPT verbatim and
  counted (measured: zero such fields in every vendored source) — the codec never
  alters a value other than an address.
- **The seed compiler** stages every matrix COPY source through it (langs, registry,
  ontology packages, matrix_dd), writes the canonical records int-clean, then REFUSES
  to ship when its own server-side census (`stringAddressResidue`: a jsonb_path walk
  of every jsonb column, the sweep post-verify's predicate) finds one string address.
  The data script writes, in the version row's statement, the marker
  `{"section_id_int_normalize": {"date": <release stamp>, "origin": "seed_build",
  "converted": <n>}}` — the THIRD marker writer beside the v6 step and
  `scripts/migrate_section_id_locators.ts`; honest because the census proved the
  stock before the dump. Both version readers skip it (`data ? 'dedalo_version'`).
- **A thesaurus import** streams every row through the codec on its way to psql.

## Named exemptions (unchanged)

`dd_ontology.properties` (the config DSL's `output_sample` locators) — the
2026-08-10 entry's exemption; neither the codec (not a matrix column) nor either
census touches it.

## Open (recorded, not this lane's)

- **The ontology package import door** (`src/core/ontology/data_io_import.ts`, via
  `ontology_update.ts`) still loads `matrix_ontology` / `matrix_dd` verbatim: the
  `oh` package an installer installs after the seed carries 18 string addresses, and
  every ontology update re-imports the master's rows as served. The codec is the
  door's one-line fix (stage through `canonicalCopyChunks`). Until then a fresh
  install's marker describes the seed's stock, as a swept install's describes the
  stock at its sweep — later imports through that door are the residue the sweep's
  dry-run reports.

## Gate reconciliation

No parity fixture involved (stored shape, not an emitted one). The committed seed
and its manifest are recompiled in the same change (`install_seed_manifest_tripwire`).
