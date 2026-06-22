<?php declare(strict_types=1);
/**
* SAMPLE_ENV_RENDERER
* Renders the documented ../private/sample.env reference from the config catalog
* (core/base/config/catalog/). Single source of truth shared by the installer
* (installer_setup_manager::persist_config) and the dev CLI (dev/gen_sample_env.php),
* so the two can never drift.
*
* Pure: returns the rendered text; performs NO file I/O. Every configurable constant
* Dédalo recognizes is listed, grouped by domain, commented out at its catalog default
* and tagged by scope, so an administrator can copy/uncomment what they need into .env.
*
* @package Dédalo
* @subpackage Config
*/

require_once __DIR__ . '/class.config_scope.php';
require_once __DIR__ . '/class.config_merge.php';
require_once __DIR__ . '/class.config_key.php';

final class sample_env_renderer {

	// Domain order == typology order (mirrors core/base/config/catalog/catalog.php).
	// [machine key] => [section title, one-line blurb]
	private const DOMAINS = [
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

	/**
	* RENDER
	* @param string|null $catalog_dir   Directory with the catalog domain files (default: sibling catalog/domains).
	* @param string|null $generated_date YYYY-MM-DD header stamp (default: today; pin it for deterministic tests).
	* @return string The full sample.env text.
	*/
	public static function render(?string $catalog_dir = null, ?string $generated_date = null) : string {

		$catalog_dir = $catalog_dir ?? __DIR__ . '/catalog/domains';
		$now = $generated_date ?? date('Y-m-d');
		$bar = str_repeat('═', 78);

		$o  = "# " . $bar . "\n";
		$o .= "#  DÉDALO v7 — sample.env  ·  ALL configurable constants, grouped by typology\n";
		$o .= "# " . $bar . "\n";
		$o .= "#\n";
		$o .= self::wrap_comment("Reference of every configuration constant Dédalo recognizes, generated from the "
			. "config catalog (core/base/config/catalog/). This file is NOT loaded by Dédalo — copy the "
			. "lines you need into ../private/.env (or a host override ../private/.env.<host>) and "
			. "uncomment them.");
		$o .= "#\n";
		$o .= self::wrap_comment("FORMAT.  KEY=value, one per line (an optional leading `export ` is accepted). "
			. "No \${VAR} interpolation. Wrap any value containing spaces or a # in quotes. "
			. "list/map values are JSON — e.g. [\"lg-eng\",\"lg-spa\"] or {\"lg-eng\":\"English\"}. "
			. "bool accepts true/false/1/0/yes/no/on/off.");
		$o .= "#\n";
		$o .= self::wrap_comment("PRECEDENCE (low→high): catalog defaults → ../private/config.local.php → "
			. "../private/.env → ../private/.env.<host> → real process env. Every line below is COMMENTED "
			. "OUT and shows its DEFAULT value; uncomment and edit only what you need to change.");
		$o .= "#\n";
		$o .= self::wrap_comment("TAGS.  [static] freely settable  ·  [secret] sensitive, env-only, set a real "
			. "value (never committed)  ·  [computed] auto-derived, override only if its note says so  ·  "
			. "[state] machine-managed, do not edit  ·  [runtime]/[per-user] resolved per request/user.");
		$o .= "#\n";
		$o .= "#  Generated " . $now . " from the config catalog (core/base/config/catalog/).\n";
		$o .= "#  Regenerate with: php dev/gen_sample_env.php\n";
		$o .= "# " . $bar . "\n";

		$counts = [];
		foreach (self::DOMAINS as $domain => [$title, $blurb]) {
			$keys = require $catalog_dir . '/' . $domain . '.php';
			$keys = array_values(array_filter($keys, static fn(config_key $k) => $k->const !== null));
			if (!$keys) continue;

			$o .= "\n\n";
			$o .= "# " . $bar . "\n";
			$o .= "#  " . strtoupper($title) . "\n";
			$o .= self::wrap_comment($blurb);
			$o .= "# " . $bar . "\n";

			foreach ($keys as $k) {
				$tag = self::scope_tag($k->scope);
				$counts[$tag] = ($counts[$tag] ?? 0) + 1;

				$o .= "\n";
				if ($k->doc !== '') {
					$o .= self::wrap_comment($k->doc);
				}
				if ($k->scope === config_scope::SECRET) {
					$o .= "# [secret · " . $k->type . "]  set a real value; env-only, never committed\n";
					$o .= "#" . $k->const . "=" . self::secret_placeholder($k) . "\n";
				} else {
					$note = match ($tag) {
						'computed' => '  auto-derived; uncomment only to override',
						'state'    => '  machine-managed; do not set by hand',
						'runtime'  => '  per-request default',
						'per-user' => '  per-user default',
						default    => '',
					};
					$o .= "# [" . $tag . " · " . $k->type . "]" . $note . "\n";
					$o .= "#" . $k->const . "=" . self::render_default($k) . "\n";
				}
			}
		}

		$summary = [];
		foreach ($counts as $t => $n) { $summary[] = $n . ' ' . $t; }
		$o .= "\n# " . $bar . "\n";
		$o .= "#  " . array_sum($counts) . " keys total  (" . implode(', ', $summary) . ")\n";
		$o .= self::wrap_comment("Custom or legacy define()s that are NOT in the catalog can still be set via "
			. "../private/config.local.php (return an array of path=>value) — see "
			. "config/sample.config.local.php for that format.");
		$o .= "# " . $bar . "\n";

		return $o;
	}//end render

	private static function wrap_comment(string $text, string $prefix = '# ') : string {
		$out = '';
		foreach (explode("\n", wordwrap($text, 76, "\n", false)) as $l) {
			$out .= rtrim($prefix . $l) . "\n";
		}
		return $out;
	}

	private static function scope_tag(config_scope $s) : string {
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

	private static function render_default(config_key $k) : string {
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

	private static function secret_placeholder(config_key $k) : string {
		return match ($k->type) {
			'list'   => '[]',
			'map'    => '{}',
			'int'    => '0',
			'bool'   => 'false',
			default  => 'CHANGE_ME',
		};
	}

}//end class sample_env_renderer
