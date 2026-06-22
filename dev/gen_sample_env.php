<?php declare(strict_types=1);
/**
* gen_sample_env.php
* Renders ../private/sample.env — a documented REFERENCE of every configuration
* constant Dédalo v7 recognizes, grouped by typology.
*
* Single source of truth: the config catalog (core/base/config/catalog/). The
* sample is GENERATED, never hand-edited: re-run this after touching any domain
* file so the reference can never drift from the keys Dédalo actually reads.
*
*   php dev/gen_sample_env.php            # write ../private/sample.env (+ summary)
*   php dev/gen_sample_env.php --stdout   # print to stdout instead
*/

$repo = dirname(__DIR__);
require_once $repo . '/core/base/config/class.config_scope.php';
require_once $repo . '/core/base/config/class.config_merge.php';
require_once $repo . '/core/base/config/class.config_key.php';

// Domain order == typology order (mirrors core/base/config/catalog/catalog.php).
// [machine key] => [section title, one-line blurb]
$domains = [
	'paths'       => ['Paths & URLs',                  'Filesystem locations and public URLs. Most are auto-resolved at boot from the install path; set one only to relocate data/media/cache outside the default tree.'],
	'identity'    => ['Identity',                      'Who this install is: entity name/label, timezone, locale, encryption.'],
	'runtime'     => ['Runtime',                       'Environment mode, debug, sessions, cache, CORS.'],
	'lang'        => ['Languages',                     'Application (UI) languages and data (content) languages.'],
	'defaults'    => ['Editor & record defaults',      'Default behaviours of the data editor and records.'],
	'media_image' => ['Media · Image',                 'Image handler: formats, qualities, thumbnails, print DPI.'],
	'media_av'    => ['Media · Audio / Video',         'Audio/Video handler: ffmpeg binaries, formats, qualities, streaming, watermark.'],
	'media_docs'  => ['Media · Documents, 3D & others','Document, 3D and other media handlers: binaries, formats, folders.'],
	'features'    => ['Features',                      'Feature toggles and global behaviour switches.'],
	'diffusion'   => ['Diffusion (public API)',        'Public publication / diffusion engine.'],
	'db'          => ['Database',                      'PostgreSQL (primary) and MariaDB/MySQL (publication) connections.'],
	'rag'         => ['RAG / vector subsystem',        'Optional semantic search + grounded Q&A (core/rag/). Dormant unless DEDALO_RAG_ENABLED=true.'],
	'mailer'      => ['Mailer & password reset',       'SMTP relay (core/dd_mailer) and password-reset knobs. Disabled while DEDALO_SMTP_HOST is empty.'],
	'areas'       => ['Ontology areas',                'Ontology area tipos. Advanced — change only if you know the ontology.'],
	'state'       => ['Install state',                 'Machine-managed runtime state. Written by Dédalo; do NOT edit by hand.'],
];

function wrap_comment(string $text, string $prefix = '# ') : string {
	$out = '';
	foreach (explode("\n", wordwrap($text, 76, "\n", false)) as $l) {
		$out .= rtrim($prefix . $l) . "\n";
	}
	return $out;
}

function scope_tag(config_scope $s) : string {
	return match ($s) {
		config_scope::SECRET          => 'secret',
		config_scope::STATIC          => 'static',
		config_scope::DERIVED         => 'computed',
		config_scope::DERIVED_REQUEST => 'computed',
		config_scope::STATE           => 'state',
		config_scope::REQUEST         => 'runtime',
		config_scope::USER            => 'per-user',
		config_scope::PASSTHROUGH     => 'passthrough',
	};
}

// Render a key's DEFAULT value in valid .env syntax (JSON for list/map, etc.).
function render_default(config_key $k) : string {
	$d = $k->default;
	if ($d === null) return '';
	switch ($k->type) {
		case 'bool': return $d ? 'true' : 'false';
		case 'int':  return (string) $d;
		case 'list':
		case 'map':  return json_encode($d, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
		default:
			$s = (string) $d;
			// quote when the raw value could be mis-parsed (whitespace, surrounding space, inline #)
			if ($s !== trim($s) || preg_match('/\s/', $s) === 1 || strpos($s, '#') !== false) {
				return '"' . str_replace('"', '\\"', $s) . '"';
			}
			return $s;
	}
}

// A type-correct placeholder for a SECRET (which carries no default in the catalog).
function secret_placeholder(config_key $k) : string {
	return match ($k->type) {
		'list'   => '[]',
		'map'    => '{}',
		'int'    => '0',
		'bool'   => 'false',
		default  => 'CHANGE_ME',
	};
}

$bar = str_repeat('═', 78);
$now = date('Y-m-d');

$o  = "# " . $bar . "\n";
$o .= "#  DÉDALO v7 — sample.env  ·  ALL configurable constants, grouped by typology\n";
$o .= "# " . $bar . "\n";
$o .= "#\n";
$o .= wrap_comment("Reference of every configuration constant Dédalo recognizes, generated from the "
	. "config catalog (core/base/config/catalog/). This file is NOT loaded by Dédalo — copy the "
	. "lines you need into ../private/.env (or a host override ../private/.env.<host>) and "
	. "uncomment them.");
$o .= "#\n";
$o .= wrap_comment("FORMAT.  KEY=value, one per line (an optional leading `export ` is accepted). "
	. "No \${VAR} interpolation. Wrap any value containing spaces or a # in quotes. "
	. "list/map values are JSON — e.g. [\"lg-eng\",\"lg-spa\"] or {\"lg-eng\":\"English\"}. "
	. "bool accepts true/false/1/0/yes/no/on/off.");
$o .= "#\n";
$o .= wrap_comment("PRECEDENCE (low→high): catalog defaults → ../private/config.local.php → "
	. "../private/.env → ../private/.env.<host> → real process env. Every line below is COMMENTED "
	. "OUT and shows its DEFAULT value; uncomment and edit only what you need to change.");
$o .= "#\n";
$o .= wrap_comment("TAGS.  [static] freely settable  ·  [secret] sensitive, env-only, set a real "
	. "value (never committed)  ·  [computed] auto-derived, override only if its note says so  ·  "
	. "[state] machine-managed, do not edit  ·  [runtime]/[per-user] resolved per request/user.");
$o .= "#\n";
$o .= "#  Generated " . $now . " by dev/gen_sample_env.php — re-run to refresh.\n";
$o .= "# " . $bar . "\n";

$counts = [];
foreach ($domains as $domain => [$title, $blurb]) {
	$keys = require $repo . '/core/base/config/catalog/domains/' . $domain . '.php';
	$keys = array_values(array_filter($keys, static fn(config_key $k) => $k->const !== null));
	if (!$keys) continue;

	$o .= "\n\n";
	$o .= "# " . $bar . "\n";
	$o .= "#  " . strtoupper($title) . "\n";
	$o .= wrap_comment($blurb);
	$o .= "# " . $bar . "\n";

	foreach ($keys as $k) {
		$tag = scope_tag($k->scope);
		$counts[$tag] = ($counts[$tag] ?? 0) + 1;

		$o .= "\n";
		if ($k->doc !== '') {
			$o .= wrap_comment($k->doc);
		}
		if ($k->scope === config_scope::SECRET) {
			$o .= "# [secret · " . $k->type . "]  set a real value; env-only, never committed\n";
			$o .= "#" . $k->const . "=" . secret_placeholder($k) . "\n";
		} else {
			$note = match ($tag) {
				'computed' => '  auto-derived; uncomment only to override',
				'state'    => '  machine-managed; do not set by hand',
				'runtime'  => '  per-request default',
				'per-user' => '  per-user default',
				default    => '',
			};
			$o .= "# [" . $tag . " · " . $k->type . "]" . $note . "\n";
			$o .= "#" . $k->const . "=" . render_default($k) . "\n";
		}
	}
}

$summary = [];
foreach ($counts as $t => $n) { $summary[] = $n . ' ' . $t; }
$o .= "\n# " . $bar . "\n";
$o .= "#  " . array_sum($counts) . " keys total  (" . implode(', ', $summary) . ")\n";
$o .= wrap_comment("Custom or legacy define()s that are NOT in the catalog can still be set via "
	. "../private/config.local.php (return an array of path=>value) — see "
	. "config/sample.config.local.php for that format.");
$o .= "# " . $bar . "\n";

if (in_array('--stdout', $argv, true)) {
	echo $o;
	exit(0);
}

$target = $repo . '/../private/sample.env';
$dir = dirname($target);
if (!is_dir($dir)) {
	fwrite(STDERR, "gen_sample_env: target dir does not exist: $dir\n");
	exit(1);
}
if (file_put_contents($target, $o) === false) {
	fwrite(STDERR, "gen_sample_env: could not write $target\n");
	exit(1);
}
fwrite(STDERR, "Wrote " . realpath($target) . "  (" . array_sum($counts) . " keys: " . implode(', ', $summary) . ")\n");
