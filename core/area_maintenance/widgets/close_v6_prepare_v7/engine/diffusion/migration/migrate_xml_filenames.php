<?php
/**
* MIGRATE_XML_FILENAMES
* One-time CLI migration: moves legacy flat published XML files
* 	/xml/{section_tipo}_{section_id}_{user_id}_{Y-m-d}.xml
* to the v7 deterministic layout (one current file per record)
* 	/xml/{service_name}/{section_tipo}_{section_id}.xml
* keeping only the newest version of each record and deleting the rest.
*
* Usage:
* 	php diffusion/migration/migrate_xml_filenames.php --dry-run   # print actions only
* 	php diffusion/migration/migrate_xml_filenames.php             # apply
*
* @see diffusion_xml::get_record_file_path (deterministic naming source of truth)
*/

if (php_sapi_name()!=='cli') {
	die('This script must be run from CLI'.PHP_EOL);
}

require_once __DIR__ . '/../../config/bootstrap.php';

$dry_run = in_array('--dry-run', (array)($_SERVER['argv'] ?? []));
$xml_dir = DEDALO_MEDIA_PATH . '/xml';

if (!is_dir($xml_dir)) {
	echo "Nothing to do: $xml_dir does not exist".PHP_EOL;
	exit(0);
}

// legacy flat pattern: {section_tipo}_{section_id}_{user_id}_{Y-m-d}.xml
$legacy_pattern = '/^(?<section_tipo>[a-z_]+[0-9]+)_(?<section_id>\d+)_(?<user_id>-?\d+)_(?<date>\d{4}-\d{2}-\d{2})\.xml$/';

// resolve the xml element of a section (cached)
$element_cache = [];
function resolve_xml_element(string $section_tipo, array &$cache) : ?string {
	if (array_key_exists($section_tipo, $cache)) {
		return $cache[$section_tipo];
	}
	$element_tipo = null;
	foreach (diffusion_utils::get_section_diffusion_nodes($section_tipo) as $node) {
		foreach ($node->parents ?? [] as $path_item) {
			if (($path_item->model==='diffusion_element' || $path_item->model==='diffusion_element_alias')
				&& ($path_item->type ?? null)==='xml') {
				$resolved = diffusion_utils::resolve_node_with_alias($path_item->tipo);
				$element_tipo = $resolved->real_tipo ?? $path_item->tipo;
				break 2;
			}
		}
	}
	return $cache[$section_tipo] = $element_tipo;
}

// group legacy files by record, newest first
$groups = [];
foreach (glob($xml_dir . '/*.xml') ?: [] as $file) {
	if (!preg_match($legacy_pattern, basename($file), $m)) {
		continue; // not a legacy flat file: leave untouched
	}
	$key = $m['section_tipo'] .'_'. $m['section_id'];
	$groups[$key][] = (object)[
		'file'			=> $file,
		'section_tipo'	=> $m['section_tipo'],
		'section_id'	=> (int)$m['section_id'],
		'timestamp'		=> strtotime($m['date']) ?: filemtime($file)
	];
}

$renamed = 0; $deleted = 0; $skipped = 0;
foreach ($groups as $key => $versions) {

	usort($versions, fn($a, $b) => $b->timestamp <=> $a->timestamp);
	$newest = array_shift($versions);

	$element_tipo = resolve_xml_element($newest->section_tipo, $element_cache);
	$file_info = $element_tipo
		? diffusion_xml::get_record_file_path($element_tipo, $newest->section_tipo, $newest->section_id)
		: null;

	if ($file_info===null) {
		echo "  skip $key: no configured XML element (service_name) for section {$newest->section_tipo}".PHP_EOL;
		$skipped++;
		continue;
	}

	if (file_exists($file_info->file_path) && filemtime($file_info->file_path) >= $newest->timestamp) {
		echo "  keep existing: {$file_info->file_name} (newer than legacy versions)".PHP_EOL;
		array_unshift($versions, $newest);
	}else{
		echo "  move: " . basename($newest->file) . " -> {$file_info->sub_path}{$file_info->file_name}".PHP_EOL;
		if (!$dry_run) {
			if (!is_dir(dirname($file_info->file_path))) {
				mkdir(dirname($file_info->file_path), 0750, true);
			}
			rename($newest->file, $file_info->file_path);
		}
		$renamed++;
	}

	foreach ($versions as $old) {
		echo "  delete: " . basename($old->file) . PHP_EOL;
		if (!$dry_run) {
			unlink($old->file);
		}
		$deleted++;
	}
}

echo PHP_EOL . ($dry_run ? '[DRY-RUN] ' : '')
	. "Done. Moved: $renamed, deleted old versions: $deleted, skipped (unconfigured): $skipped" . PHP_EOL;
