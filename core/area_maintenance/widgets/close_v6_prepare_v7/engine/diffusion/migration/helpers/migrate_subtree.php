<?php
/**
 * Run the diffusion property migration over a single subtree (one diffusion element
 * or any ontology node), writing v7 `properties` directly to dd_ontology. Fast
 * iteration helper — avoids re-migrating the whole diffusion tree.
 *
 * Usage:
 *   php migrate_subtree.php <root_tipo>
 *
 * Example:
 *   php migrate_subtree.php numisdata29
 */
require_once __DIR__ . '/../../../config/bootstrap.php';
require_once __DIR__ . '/../migrate_diffusion_properties.php';   // functions only: the autorun is guarded there

$root = $argv[1] ?? 'numisdata29';
echo "Migrating subtree from root: $root\n";
traverse_ontology_recursive($root);

// ---------------------------------------------------------------------------
// Post-migration overrides.
// Whole `properties` values that replace what the mapping computed for one specific node.
// They are DATA (overrides.json `post_overrides`), not code, and they are scoped BY TLD: an entry
// is applied when the requested root is listed in its `roots`, or — with an empty `roots` — when
// the entry's tipo has the SAME TLD as the requested root. So migrating mht2 no longer rewrites a
// numisdata node, which is exactly what the former unconditional block did. It is NOT reachability:
// migrating numisdata50 still rewrites numisdata1285. Pin an entry to one subtree with `roots`.
//
// Seeded entry: authorship_roles (numisdata1285) is STRUCTURALLY IDENTICAL to the designs
// iconography field (portal -> autocomplete_hi -> hierarchy25), so the migration mis-applies
// get_diffusion_iconography (no nested scenes -> null). They differ only in the OUTER v6
// component_method (designs = get_diffusion_resolve_value nested; authorship = get_diffusion_value
// direct). authorship's correct resolution is the SIMPLE ddo chain portal -> autocomplete_hi ->
// term. Applied here (not by gating the iconography branch) to avoid any risk to the designs
// green. See memory harness #65.
migrate_diffusion_apply_post_overrides($root);

echo "\nDone.\n";
