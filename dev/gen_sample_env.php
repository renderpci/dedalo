<?php declare(strict_types=1);
/**
* gen_sample_env.php
* CLI wrapper that renders ../private/sample.env — a documented REFERENCE of every
* configuration constant Dédalo v7 recognizes, grouped by typology.
*
* The rendering lives in sample_env_renderer (core/base/config/), shared with the
* installer (installer_setup_manager::persist_config) so the two can never drift.
*
*   php dev/gen_sample_env.php            # write ../private/sample.env
*   php dev/gen_sample_env.php --stdout   # print to stdout instead
*/

$repo = dirname(__DIR__);
require_once $repo . '/core/base/config/class.sample_env_renderer.php';

$content = sample_env_renderer::render();

if (in_array('--stdout', $argv, true)) {
	echo $content;
	exit(0);
}

$target = $repo . '/../private/sample.env';
$dir = dirname($target);
if (!is_dir($dir)) {
	fwrite(STDERR, "gen_sample_env: target dir does not exist: $dir\n");
	exit(1);
}
if (file_put_contents($target, $content) === false) {
	fwrite(STDERR, "gen_sample_env: could not write $target\n");
	exit(1);
}
fwrite(STDERR, "Wrote " . realpath($target) . "\n");
