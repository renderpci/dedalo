<?php declare(strict_types=1);

require_once __DIR__ . '/class.migration_destination.php';

/**
* PASSTHROUGH_WRITER
* Reproduces unknown custom defines verbatim (spec §5.10 "preserved verbatim"). For each
* PASSTHROUGH-destination constant it emits a guarded define using the extractor's raw
* source text, so a literal stays a literal and a runtime expression (dirname(...), etc.)
* is preserved exactly. Guarded with !defined() so re-running / double-include is safe.
* Returns the PHP file content (no disk write).
*/
final class passthrough_writer {

	/** @param array<string,array> $classification migration_classifier::classify() output */
	public static function render(array $classification) : string {
		$names = [];
		foreach ($classification as $name => $info) {
			if ($info['destination'] === migration_destination::PASSTHROUGH) {
				$names[$name] = $info['record']['raw'];
			}
		}
		ksort($names);

		$lines = ['<?php declare(strict_types=1);', '', '// Preserved custom defines (unknown to the catalog) — generated verbatim by the migration.'];
		foreach ($names as $name => $raw) {
			$lines[] = "if (!defined('{$name}')) { define('{$name}', {$raw}); }";
		}
		return implode("\n", $lines) . "\n";
	}//end render
}
