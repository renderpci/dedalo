<?php declare(strict_types=1);

require_once __DIR__ . '/class.legacy_surface.php';

/**
* BOOT_DIFF (spec §5.9, prove-now)
* Pure classifier comparing two captured constant surfaces: $old (from booting the
* legacy config.php) vs $new (from booting the new pipeline). It proves the new
* pipeline reproduces exactly the config-originated surface (catalog STATIC/DERIVED +
* version.inc + dd_tipos.php) and classifies every old-only constant. Reports print
* NAMES and counts only — never values — because the surfaces hold secrets (salt, DB
* password) and unmigrated custom defines.
*/
final class boot_diff {

	/** v6 constants v7 intentionally drops (verified 0 consumers). */
	private const DROPS = ['DEDALO_CONFIG', 'DEDALO_CORE', 'DEDALO_SHARED', 'DEDALO_TOOLS', 'DEDALO_LIB', 'DEDALO_SESSION_SAVE_PATH'];

	/**
	* @param array<string,mixed> $old constants from the legacy config.php boot
	* @param array<string,mixed> $new constants from the new-pipeline boot
	* @param config_key[] $catalog
	* @param string[] $subsystem_files absolute paths whose define()s the new pipeline includes (version.inc, dd_tipos.php)
	* @return array{parity:bool,new_count:int,old_count:int,missing:string[],new_extras:string[],value_mismatches:string[],buckets:array<string,string[]>}
	*/
	public static function classify(array $old, array $new, array $catalog, array $subsystem_files) : array {

		$emit_expected = []; // STATIC + DERIVED config consts (new MUST emit)
		$excluded      = []; // REQUEST + USER (never emitted)
		$live          = []; // SECRET + STATE + DERIVED_REQUEST + PASSTHROUGH (live-sourced)
		foreach ($catalog as $key) {
			if ($key->const === null) {
				continue;
			}
			if ($key->scope === config_scope::STATIC || $key->scope === config_scope::DERIVED) {
				$emit_expected[$key->const] = true;
			} elseif ($key->scope === config_scope::REQUEST || $key->scope === config_scope::USER) {
				$excluded[$key->const] = true;
			} else {
				$live[$key->const] = true;
			}
		}

		// version + tipos constant NAMES, recovered by tokenizing (never including) the files
		$subsystem = [];
		foreach (legacy_surface::extract($subsystem_files) as $name => $info) {
			$subsystem[$name] = true;
		}

		$expected_new = $emit_expected + $subsystem; // union of keys

		$missing = [];
		foreach (array_keys($expected_new) as $const) {
			if (!array_key_exists($const, $new)) {
				$missing[] = $const;
			}
		}

		$new_extras = [];
		foreach (array_keys($new) as $const) {
			if (!isset($expected_new[$const])) {
				$new_extras[] = $const;
			}
		}

		$value_mismatches = [];
		foreach ($new as $const => $value) {
			if (array_key_exists($const, $old) && $old[$const] !== $value) {
				$value_mismatches[] = $const;
			}
		}

		$buckets = ['excluded' => [], 'live_secret_state' => [], 'dropped' => [], 'unexplained' => []];
		foreach (array_keys($old) as $const) {
			if (array_key_exists($const, $new)) {
				continue; // reproduced — not an old-only extra
			}
			if (isset($excluded[$const])) {
				$buckets['excluded'][] = $const;
			} elseif (isset($live[$const])) {
				$buckets['live_secret_state'][] = $const;
			} elseif (in_array($const, self::DROPS, true)) {
				$buckets['dropped'][] = $const;
			} else {
				$buckets['unexplained'][] = $const;
			}
		}

		sort($missing); sort($new_extras); sort($value_mismatches);
		foreach ($buckets as &$b) { sort($b); } unset($b);

		return [
			'parity'           => ($missing === [] && $new_extras === [] && $value_mismatches === []),
			'new_count'        => count($new),
			'old_count'        => count($old),
			'missing'          => $missing,
			'new_extras'       => $new_extras,
			'value_mismatches' => $value_mismatches,
			'buckets'          => $buckets,
		];
	}//end classify

	/** Render a names-and-counts-only report. NEVER prints constant values. */
	public static function render(array $r) : string {
		$lines = [];
		$lines[] = '=== boot-diff (prove-now) ===';
		$lines[] = 'parity: ' . ($r['parity'] ? 'YES — new pipeline reproduces the config surface' : 'NO — see below');
		$lines[] = "surface sizes: old={$r['old_count']} new={$r['new_count']}";
		$lines[] = '';
		$lines[] = '-- parity failures (must be empty) --';
		$lines[] = 'missing from new (' . count($r['missing']) . '): ' . implode(', ', $r['missing']);
		$lines[] = 'unexpected in new (' . count($r['new_extras']) . '): ' . implode(', ', $r['new_extras']);
		$lines[] = 'value mismatches (' . count($r['value_mismatches']) . '): ' . implode(', ', $r['value_mismatches']);
		$lines[] = '';
		$lines[] = '-- old-only constants, classified (names only; values redacted) --';
		$lines[] = 'excluded REQUEST/USER (' . count($r['buckets']['excluded']) . '): ' . implode(', ', $r['buckets']['excluded']);
		$lines[] = 'live SECRET/STATE/DERIVED_REQUEST (' . count($r['buckets']['live_secret_state']) . '): ' . implode(', ', $r['buckets']['live_secret_state']);
		$lines[] = 'intentional drops (' . count($r['buckets']['dropped']) . '): ' . implode(', ', $r['buckets']['dropped']);
		$lines[] = 'UNEXPLAINED — review for Phase-4 passthrough or framework consts (' . count($r['buckets']['unexplained']) . '): ' . implode(', ', $r['buckets']['unexplained']);
		return implode("\n", $lines);
	}//end render
}
