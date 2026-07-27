<?php declare(strict_types=1);

require_once dirname(__DIR__) . '/base/boot/class.env_value.php';
require_once dirname(__DIR__) . '/base/boot/class.env_sync.php';

/**
* INSTALL_CONFIG_PERSISTOR
* The runtime config writer used by the install wizard. Renders, from the values the
* administrator submits in the UI, the three machine-managed config artifacts as content
* strings (no disk writes — the caller commits them atomically):
*  - render_env()   → ../private/.env (PHP side): every collected value keyed by its
*                     DEDALO_ / MYSQL_ constant name, merged over the existing .env so
*                     prior keys (e.g. a salt written earlier in the wizard) survive.
*  - render_bun()   → diffusion/api/v1/.env (Bun side): only the shared keys, mapped
*                     PHP→Bun via env_sync::MAP (the one name map).
*  - render_state() → ../private/state.php: STATE values by catalog dot-path
*                     (info_key, information, install_status), merged over existing state.
* Quoting is delegated to env_value::quote so values round-trip through env_loader::parse
* exactly as the migration writer's do.
*/
final class installer_config_persistor {

	/** @var array<string,array{domain:string,order:int,doc:string,default:mixed,is_secret:bool}>|null cached catalog index (const → metadata) */
	private static ?array $catalog_index = null;

	/**
	* RENDER_ENV
	* Renders ../private/.env grouped by typology (the catalog domain): a section header per
	* group, a one-line explanation per variable (the catalog `doc`), a default hint, and a
	* secret marker. The value set, the merge-over-existing behaviour and the env_value quoting
	* are unchanged — only the ordering and the comments differ. env_loader::parse ignores comment
	* and blank lines, so the file round-trips to exactly the same key/value map as before.
	* @param array<string,string> $existing parsed current .env (KEY=>string), or []
	* @param array<string,mixed>  $values   collected values (KEY=>typed value), new wins
	* @return string full .env content
	*/
	public static function render_env(array $existing, array $values) : string {
		$merged = $existing;
		foreach ($values as $key => $value) {
			$merged[$key] = self::stringify($value);
		}

		$index = self::catalog_index();

		// group every key by its typology (catalog domain); keys with no catalog entry
		// (preserved/custom) fall into a final 'other' group so nothing is ever dropped.
		$groups = []; // domain => [ ['key'=>string,'order'=>int], … ]
		foreach ($merged as $key => $raw) {
			$domain = $index[$key]['domain'] ?? 'other';
			$groups[$domain][] = ['key' => $key, 'order' => $index[$key]['order'] ?? PHP_INT_MAX];
		}

		// domains in catalog order (by first-declared member); 'other' sorts last because its
		// members carry PHP_INT_MAX.
		uksort($groups, static function(string $a, string $b) use ($groups) : int {
			$min = static fn(array $g) : int => min(array_map(static fn(array $m) : int => $m['order'], $g));
			return $min($groups[$a]) <=> $min($groups[$b]);
		});

		$lines = [
			'# ============================================================',
			'#  Dédalo v7 — environment configuration',
			'#  Written by the installer. chmod 600. Never commit this file.',
			'#  Variables are grouped by typology; edit values as needed.',
			'# ============================================================',
		];

		foreach ($groups as $domain => $members) {
			// within a group keep catalog declaration order; 'other' has no order → sort by name
			usort($members, $domain === 'other'
				? static fn(array $a, array $b) : int => strcmp($a['key'], $b['key'])
				: static fn(array $a, array $b) : int => $a['order'] <=> $b['order']
			);

			$lines[] = '';
			$lines[] = '# ------------------------------------------------------------';
			$lines[] = '#  ' . self::domain_label($domain);
			$lines[] = '# ------------------------------------------------------------';

			foreach ($members as $member) {
				$key  = $member['key'];
				$meta = $index[$key] ?? null;

				// explanation line: catalog doc (+ default hint) (+ secret marker)
				$comment = '';
				if ($meta !== null && $meta['doc'] !== '') {
					$comment = '# ' . $meta['doc'];
					if (!$meta['is_secret'] && $meta['default'] !== null && $meta['default'] !== '') {
						$comment .= '  (default: ' . self::stringify($meta['default']) . ')';
					}
				}
				if ($meta !== null && $meta['is_secret']) {
					$comment = ($comment === '' ? '#' : $comment) . '  [secret — keep private]';
				}
				if ($comment !== '') {
					$lines[] = $comment;
				}

				$lines[] = $key . '=' . env_value::quote((string) $merged[$key]);
			}
		}

		return implode("\n", $lines) . "\n";
	}//end render_env

	/**
	* RENDER_BUN
	* @param array<string,mixed> $values collected values keyed by PHP/.env constant name
	* @return string Bun diffusion .env content (keys mapped via env_sync::MAP)
	*/
	public static function render_bun(array $values, array $extra = []) : string {
		$lines = ['# Dédalo diffusion (Bun) .env — written by the installer; keys mapped via env_sync (MAP + BUN_DB_MAP).'];
		// MAP = shared keys; BUN_DB_MAP = MariaDB (Bun-only) — both are written to the Bun .env.
		foreach (array_merge(env_sync::MAP, env_sync::BUN_DB_MAP) as $php_key => $bun_key) {
			if (!array_key_exists($php_key, $values)) {
				continue;
			}
			$lines[] = $bun_key . '=' . env_value::quote((string) self::stringify($values[$php_key]));
		}
		// Bun-only transport controls with no PHP-side equivalent (e.g. DB_FORCE_TCP); passed
		// through verbatim by the installer. NOT part of env_sync::MAP / the drift contract.
		foreach ($extra as $bun_key => $val) {
			$lines[] = $bun_key . '=' . env_value::quote((string) self::stringify($val));
		}
		return implode("\n", $lines) . "\n";
	}//end render_bun

	/**
	* RENDER_STATE
	* @param array<string,mixed> $existing current state.php array (dot.path=>value), or []
	* @param array<string,mixed> $state    STATE values to set (dot.path=>value), new wins
	* @return string state.php PHP file content
	*/
	public static function render_state(array $existing, array $state) : string {
		$merged = array_replace($existing, $state);
		ksort($merged);
		return "<?php declare(strict_types=1);\n\n"
			. "// Machine-written install state — generated/updated by the installer. Do not hand-edit.\n"
			. "return " . var_export($merged, true) . ";\n";
	}//end render_state

	/** A typed value → its .env string form. Delegates to the shared serializer so the
	* installer and the migration writer encode identically (env_value::stringify). */
	private static function stringify(mixed $value) : string {
		return env_value::stringify($value);
	}//end stringify

	/**
	* CATALOG_INDEX
	* Lazily loads the config catalog and indexes it by env constant name, exposing the metadata
	* render_env() needs to group and document each variable. Cached for the process. Degrades
	* gracefully (empty index → everything lands in the 'other' group) if the catalog is absent.
	* @return array<string,array{domain:string,order:int,doc:string,default:mixed,is_secret:bool}>
	*/
	private static function catalog_index() : array {
		if (self::$catalog_index !== null) {
			return self::$catalog_index;
		}
		$index = [];
		$catalog_file = dirname(__DIR__) . '/base/config/catalog/catalog.php';
		if (is_file($catalog_file)) {
			$order = 0;
			foreach ((require $catalog_file) as $key) { // config_key[] — also loads config_scope
				if (empty($key->const) || isset($index[$key->const])) {
					continue; // skip internal (null const) and keep the first entry per const
				}
				$dot = strpos($key->path, '.');
				$index[$key->const] = [
					'domain'    => $dot === false ? $key->path : substr($key->path, 0, $dot),
					'order'     => $order++,
					'doc'       => $key->doc,
					'default'   => $key->default,
					'is_secret' => $key->scope === config_scope::SECRET,
				];
			}
		}
		self::$catalog_index = $index;
		return $index;
	}//end catalog_index

	/** Human-readable section title for a catalog domain (typology). */
	private static function domain_label(string $domain) : string {
		static $labels = [
			'paths'       => 'Paths',
			'identity'    => 'Site identity, locale & secrets',
			'runtime'     => 'Runtime',
			'lang'        => 'Languages & i18n',
			'defaults'    => 'Defaults',
			'media_image' => 'Media — images',
			'media_av'    => 'Media — audio / video',
			'media_docs'  => 'Media — documents & 3D',
			'features'    => 'Features',
			'diffusion'   => 'Diffusion / publication engine',
			'db'          => 'Database (PostgreSQL)',
			'rag'         => 'RAG / AI subsystem',
			'mailer'      => 'Email (SMTP)',
			'areas'       => 'Access control (areas)',
			'state'       => 'State (machine-written)',
			'other'       => 'Other / custom',
		];
		return $labels[$domain] ?? ucfirst($domain);
	}//end domain_label
}
