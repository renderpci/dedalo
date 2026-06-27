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
require_once __DIR__ . '/../migrate_diffusion_properties.php';

$root = $argv[1] ?? 'numisdata29';
echo "Migrating subtree from root: $root\n";
traverse_ontology_recursive($root);

// ---------------------------------------------------------------------------
// Post-migration overrides.
// authorship_roles (numisdata1285) is STRUCTURALLY IDENTICAL to the designs
// iconography field (portal -> autocomplete_hi -> hierarchy25), so the migration
// mis-applies get_diffusion_iconography (no nested scenes -> null). They differ only
// in the OUTER v6 component_method (designs = get_diffusion_resolve_value nested;
// authorship = get_diffusion_value direct). authorship's correct resolution is the
// SIMPLE ddo chain portal -> autocomplete_hi -> term. Applied here (not by gating the
// iconography branch) to avoid any risk to the designs green. See memory harness #65.
$post_overrides = [
	'numisdata1285' => (object)['process' => (object)[
		'ddo_map' => [
			(object)['tipo' => 'numisdata1281', 'section_tipo' => 'self'],
			(object)['tipo' => 'rsc1038',       'parent' => 'numisdata1281'],
			(object)['tipo' => 'hierarchy25',   'label' => 'Term', 'parent' => 'rsc1038'],
		],
		'output_format' => 'string',
	]],
];
foreach ($post_overrides as $ov_tipo => $ov_props) {
	dd_ontology_db_manager::update($ov_tipo, (object)['properties' => $ov_props]);
	echo "  [POST-OVERRIDE] $ov_tipo -> simple ddo chain (authorship_roles)\n";
}

echo "\nDone.\n";
