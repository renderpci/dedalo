# WC-2026-10-21-ontology-update-rebuild — the ontology update re-derives each tld through the one writer

- **Date:** 2026-10-21 (audit 2026-09-26, Step 5 ONT-1). Amends WC-023's step messages.
- **Decision:** none (owner decisions 2026-09-30, leanings accepted).
- **Shape before (PHP):** `update_ontology` re-derived each imported tld with
  `set_records_in_dd_ontology` over the whole `<tld>0` section — an upsert per record, no
  delete, no transaction. TS kept it (`setRecordsInDdOntology({ wholeSection: true })`), so:
  a node the new package no longer carries stayed in `dd_ontology` forever (`orphaned`
  drift every resolver still served); a record whose `ontology7` named another tld was
  upserted INTO that tld's namespace, silently; the step message was one
  `OK. Request completed successfully for <tld>0` per tld.
- **Shape after (TS):** each imported tld is re-derived by `ontology_state.rebuildOntology`
  (`mainNode: 'existing'` — the registry row is never written by the derive):
  - ONE transaction per tld; a failure rolls that tld back and is an error line
    (`Rebuild of '<tld>' failed and was rolled back`);
  - nodes the package no longer carries are REMOVED (no orphan);
  - a misfiled record is refused and named in `errors`
    (`<tld>0/<id> declares tld '<x>' (parses to node '<tipo>'), not '<tld>' — …`);
  - a tld where only SOME records declare no tld is a warning inside the step message; a tld
    where NONE does is an error (`<tld>: none of N record(s) of <tld>0 declares a tld —
    nothing projected`) — unchanged severity: a warning line in the update panel, fatal in
    the installer and the seed compiler;
  - surviving nodes keep their `dd_ontology` id (id-stable reconcile, not wipe-and-reinsert);
  - every node's `model` column reaches its fixpoint in ONE update. The rebuild parses
    before it writes, so a model node of the same tld is resolved against the parse being
    written, not its stored row: a model the release adds or renames reaches all its
    instances, whatever their ids. PHP's per-record loop only got this right for instances
    above the model's id. A tld derived before the tld that adds or renames one of its
    models is re-inspected after all of them and re-derived when a `model` column is stale
    (pass 2). The step message is that of the tld's last derive, one per tld;
  - a staged GROUPER package (`ontologytype`, `hierarchytype`, `hierarchymtype`) no longer
    takes the installation's groupers away. Its import replaces the whole `<grouper>0`
    section, so a grouper record the installation made for a typology the release lacks (a
    thesaurus or tld of that typology) was wiped, and the orphan sweep would then delete its
    node, leaving every root / thesaurus node under it dangling. Before the derive, every
    typology still referenced — by a record's parent locator (`ontology15`) into
    `<grouper>0`, or by a `<tld>0` root's parent — and no longer backed by a record is re-made
    (`createParentGrouper`, the grouper tld itself not re-registered), one transaction each,
    with a step message `<grouper>: re-made grouper record(s) <ids> — referenced by this
    installation, absent from the package`. A re-made record carries the generic values
    createParentGrouper writes: an installation's own edits to it were already lost to the
    import (unchanged);
  - step messages are the rebuild's own: `Ontology '<tld>' rebuilt…`,
    `Ontology '<tld>' rebuilt with drift`, or `…; N source record(s) declare another tld and
    were skipped`.
  The envelope (v2: `ok`, `msg` prefix, `errors`, the `root_info` extension key —
  WC-2026-08-16-error-envelope-compat-removal) is unchanged; `ok:true` with a non-empty
  `errors` is the warning case.
- **Reason:** `dd_ontology(tld)` is the projection of `matrix_ontology(<tld>0)`; an update
  that leaves orphans or writes foreign nodes breaks the invariant the resolver serves from,
  and only the one whole-tld writer can delete (single-writer tripwire).
- **Gate reconciliation:** TS-native gates `test/unit/ontology_update_shell_native.test.ts`
  (G1a no orphan + in sync, G1b id stability) and
  `test/unit/ontology_derive_packages_native.test.ts` (G1c orphan + foreign, G1d main-node
  mode, G1f model fixpoint, G1g wholesale failure + unsafe-tld refusal, G1h installation-made
  grouper records re-made, with the bare-rebuild control). No parity gate replays `update_ontology`'s step messages; no re-harvest.
