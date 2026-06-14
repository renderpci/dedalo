<?php
/**
* MIGRATE_RDF_FILENAMES
* One-time CLI migration: converts legacy timestamped published RDF files
* 	{rdf_name}_{section_tipo}_{section_id}_{user_id}_{Y-m-d H_i_s}.rdf
* to the v7 deterministic naming (one current file per record)
* 	{rdf_name}_{section_tipo}_{section_id}.rdf
* keeping only the newest version of each record and deleting the rest.
*
* Usage:
* 	php diffusion/migration/migrate_rdf_filenames.php --dry-run   # print actions only
* 	php diffusion/migration/migrate_rdf_filenames.php             # apply
*
* @see diffusion_rdf::get_record_file_path (deterministic naming source of truth)
*/

if (php_sapi_name()!=='cli') {
	die('This script must be run from CLI'.PHP_EOL);
}

require_once __DIR__ . '/../../config/config.php';

$dry_run = in_array('--dry-run', $argv);

if (!defined('DEDALO_MEDIA_PATH') || !is_dir(DEDALO_MEDIA_PATH . '/rdf')) {
	echo 'Nothing to do: '. (defined('DEDALO_MEDIA_PATH') ? DEDALO_MEDIA_PATH : '?') .'/rdf does not exist'.PHP_EOL;
	exit(0);
}

// legacy tail: _{user_id}_{Y-m-d H_i_s}.rdf (the date separator between date
// and time may be a space or its sanitized replacement)
$legacy_pattern = '/^(?<base>.+_\d+)_(?<user_id>\d+)_(?<date>\d{4}-\d{2}-\d{2}.\d{2}_\d{2}_\d{2})\.rdf$/';

$service_dirs = glob(DEDALO_MEDIA_PATH . '/rdf/*', GLOB_ONLYDIR) ?: [];

$total_renamed = 0;
$total_deleted = 0;

foreach ($service_dirs as $dir) {

	echo PHP_EOL .'Scanning: '. $dir . PHP_EOL;

	// group legacy files by their deterministic base name
	// base => [ {file, timestamp} ]
	$groups = [];

	$files = glob($dir . '/*.rdf') ?: [];
	foreach ($files as $file) {
		$file_name = basename($file);
		if (!preg_match($legacy_pattern, $file_name, $matches)) {
			continue; // already deterministic (or foreign file): leave untouched
		}

		// timestamp from embedded date (fallback: filesystem mtime)
		$date_normalized = substr($matches['date'], 0, 10) .' '. str_replace('_', ':', substr($matches['date'], 11));
		$timestamp = strtotime($date_normalized) ?: filemtime($file);

		$groups[$matches['base']][] = (object)[
			'file'		=> $file,
			'timestamp'	=> $timestamp
		];
	}

	foreach ($groups as $base => $versions) {

		// newest legacy version first
		usort($versions, function($a, $b) {
			return $b->timestamp <=> $a->timestamp;
		});
		$newest = array_shift($versions);

		$target = $dir .'/'. $base .'.rdf';

		// collision: a deterministic file already exists — keep the newer one
		if (file_exists($target) && filemtime($target) >= $newest->timestamp) {
			echo "  keep existing: ". basename($target) ." (newer than legacy versions)". PHP_EOL;
			array_unshift($versions, $newest); // delete all legacy versions
		}else{
			echo "  rename: ". basename($newest->file) ." -> ". basename($target) . PHP_EOL;
			if (!$dry_run) {
				rename($newest->file, $target);
			}
			$total_renamed++;
		}

		// delete older versions
		foreach ($versions as $old) {
			echo "  delete: ". basename($old->file) . PHP_EOL;
			if (!$dry_run) {
				unlink($old->file);
			}
			$total_deleted++;
		}
	}
}

echo PHP_EOL . ($dry_run ? '[DRY-RUN] ' : '')
	. "Done. Renamed: $total_renamed, deleted old versions: $total_deleted" . PHP_EOL;
