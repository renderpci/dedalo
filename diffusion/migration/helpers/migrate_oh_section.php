<?php
/**
 * Migrate all oh-section diffusion ontology nodes (oh63 subtree).
 */
require_once '/Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/config/config.php';
require_once '/Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/diffusion/migration/migrate_diffusion_properties.php';

$root = 'oh63'; // oh diffusion element root
echo "Migrating from root: $root\n";
traverse_ontology_recursive($root);
echo "\nDone.\n";
