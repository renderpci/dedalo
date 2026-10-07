# WC-2026-10-07-ontology-area-admin-grant — area_ontology opens for root or a dd5-granted global admin (2026-10-07)

- **Date:** 2026-10-07 (TODO-025 "Non root users can't access to the Ontology
  tree" + TODO-026 "Ontology menu access … should be for global admins with
  specific permissions").
- **Decision:** user decision, replacing the 2026-07-03 superuser-only mandate
  (engineering/AREA_SPEC.md §9). area_ontology (dd5) opens — read AND menu — for
  the superuser, or a global admin whose profile grants dd5 (level ≥ 1). Both
  conditions required. Inside, no admin bypass.
- **Shape before (TS):** `dispatchAreaRead` refused every `userId !== SUPERUSER_ID`
  with `perm.denied` (403); the menu dropped dd5 for every non-superuser; for the
  superuser, `filterHierarchiesByGrant` kept every ontology hierarchy unchecked
  (the PHP global-admin bypass).
- **Shape before (PHP, frozen):** no hard gate — ordinary ACL; a global admin got
  every ontology hierarchy unconditionally; a non-admin dd5 self-key opened it.
- **Shape after (TS):** ONE predicate, `canAccessOntologyArea`
  (`src/core/security/permissions.ts`), gates the area read and the menu node.
  A refused principal still gets `perm.denied` (403) / no dd5 menu node — same
  wire shapes. An admitted non-root admin gets the ontology boot payload pruned
  per hierarchy: kept iff read on its TLD section (`target_section_tipo`);
  inactive and rootless hierarchies stay kept (unchanged ontology semantics).
  The superuser's payload is byte-identical (it holds every grant).
- **Divergence from PHP (deliberate):** a non-admin with a dd5 grant is refused;
  a global admin without the dd5 grant is refused; an admitted admin sees only
  the TLDs its profile grants (PHP bypassed).
- **Gate reconciliation:** NO fixture edit. The frozen `area_hierarchy` /
  `areas` / `area_security` differentials run as the superuser — unchanged
  payload. `test/unit/area_security.test.ts` (non-admin refused) still holds.
  New gate `test/unit/ontology_area_access_native.test.ts` builds its identities
  (`test/helpers/ontology_area_access_fixture.ts`): root in; granted admin in
  and served exactly the granted TLD (`test0`, root sees `dd0` too —
  non-vacuity); ungranted admin and granted non-admin out, read and menu.
