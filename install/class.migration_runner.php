<?php declare(strict_types=1);

require_once __DIR__ . '/class.migration_extractor.php';
require_once __DIR__ . '/class.migration_classifier.php';
require_once __DIR__ . '/class.migration_destination.php';
require_once __DIR__ . '/class.env_writer.php';
require_once __DIR__ . '/class.state_writer.php';
require_once __DIR__ . '/class.passthrough_writer.php';

/**
* MIGRATION_RUNNER
* Pure orchestration: tokenize the legacy config (4a), classify each constant (4a), and
* render the five artifacts (4b) into an in-memory plan. Produces a redacted dry-run
* report (names + counts only). No disk I/O — migration_committer writes; the CLI wires.
*/
final class migration_runner {

	public const SCHEMA_VERSION = 1;

	/**
	* @param string[] $source_files legacy config files to migrate, in include order
	* @param config_key[] $catalog
	* @return array{artifacts:array<string,string>,summary:array<string,array<int,string>>,entity:?string,dropped_secrets:array<int,string>}
	*/
	public static function plan(array $source_files, array $catalog) : array {
		$records = migration_extractor::extract($source_files);
		$cls = migration_classifier::classify($records, $catalog);

		// .env is the single config place: secrets + general config (overrides) go into ../private/.env.
		// config.local.php is NOT written by the migration — it stays an optional admin-only file the
		// shim still loads if present.
		$artifacts = [
			'env_php'     => env_writer::render_php($cls) . env_writer::render_config($cls, $catalog),
			'env_bun'     => env_writer::render_bun($cls),
			'state'       => state_writer::render($cls, $catalog),
			'passthrough' => passthrough_writer::render($cls),
		];

		$summary = [];
		foreach ($cls as $name => $info) {
			$summary[$info['destination']->value][] = $name;
		}
		foreach ($summary as &$names) { sort($names); }
		unset($names);
		ksort($summary);

		$entity = (isset($records['DEDALO_ENTITY']) && $records['DEDALO_ENTITY']['kind'] === 'literal')
			? (string) $records['DEDALO_ENTITY']['value']
			: null;

		// G2 — silent-secret detection. A constant routed to ENV (a secret: catalog SECRET scope or
		// constant_map-flagged) whose value did NOT fold to a literal (computed from $_SERVER /
		// dirname() / a function call) is SILENTLY skipped by env_writer::render_php → it would land
		// in ../private/.env as nothing, the boot would define it empty, and e.g. DB auth would fail
		// with no error. Surface the NAMES (never values) so the caller refuses rather than ship a
		// broken-but-alive box. The operator migrates those by hand.
		$dropped_secrets = [];
		foreach ($cls as $name => $info) {
			if ($info['destination'] === migration_destination::ENV
				&& ($info['record']['kind'] ?? null) !== 'literal') {
				$dropped_secrets[] = $name;
			}
		}
		sort($dropped_secrets);

		return ['artifacts' => $artifacts, 'summary' => $summary, 'entity' => $entity, 'dropped_secrets' => $dropped_secrets];
	}//end plan

	/** Redacted human report: destination => count + sorted NAMES (never values). */
	public static function dry_run_report(array $plan) : string {
		$lines = [];
		$lines[] = '=== migration dry-run (schema_version ' . self::SCHEMA_VERSION . ') ===';
		// The install identifier (non-secret; the backup keying handle). Shown intentionally — constant VALUES (secrets/config) are never printed.
		$lines[] = 'entity: ' . ($plan['entity'] ?? '(unresolved)');
		$lines[] = '';
		foreach ($plan['summary'] as $destination => $names) {
			$lines[] = strtoupper($destination) . ' (' . count($names) . '): ' . implode(', ', $names);
		}
		if (!empty($plan['dropped_secrets'])) {
			$lines[] = '';
			$lines[] = '!! DROPPED SECRETS (' . count($plan['dropped_secrets']) . ') — dynamic value, NOT migratable automatically:';
			$lines[] = '   ' . implode(', ', $plan['dropped_secrets']);
			$lines[] = '   Set these by hand in ../private/.env after migrating, or the install will boot with empty secrets.';
		}
		$lines[] = '';
		$lines[] = 'Targets: ENV (secrets) + CONFIG (general overrides) → ../private/.env; STATE → state.php;';
		$lines[] = 'PASSTHROUGH (verbatim) → passthrough.php. config.local.php is NOT written (optional admin file).';
		$lines[] = 'Review especially PASSTHROUGH and the ENV secrets.';
		return implode("\n", $lines) . "\n";
	}//end dry_run_report
}
