<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_compiler.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.compat_shim.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.entrypoint_profile.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_state.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_phase.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_config_phases.php';
require_once dirname(__DIR__, 3) . '/install/class.legacy_surface.php';

/**
* BOOT-DIFF GATE (spec §5.9)
* Proves the new boot pipeline emits exactly the legacy DEDALO_* surface declared by
* the canonical sample config files, minus the intentionally-excluded REQUEST/USER
* accessor-only set and the live-sourced SECRET/STATE/DERIVED_REQUEST set.
*/
final class boot_diff_gate_Test extends TestCase {

	/** the four canonical legacy reference files — templates, never the live config */
	private const SAMPLE_FILES = [
		'config/sample.config.php',
		'config/sample.config_db.php',
		'config/sample.config_areas.php',
		'config/sample.config_core.php',
	];

	/**
	* Legacy define()s v7 intentionally does NOT reproduce as constants. Each is dead
	* (0 consumers in core/install/shared/tools — verified). If a NEW unmatched legacy
	* constant appears, test_every_legacy_constant_is_classified fails by design:
	* classify it (add a catalog key or justify a drop), never silently widen this list.
	*/
	private const LEGACY_DROP_ALLOWLIST = [
		'DEDALO_CONFIG' => 'v6 path segment "config" — inlined into paths.* DERIVED closures; 0 consumers',
		'DEDALO_CORE'   => 'v6 path segment "core" — inlined into paths.* DERIVED closures; 0 consumers',
		'DEDALO_SHARED' => 'v6 path segment "shared" — inlined into paths.* DERIVED closures; 0 consumers',
		'DEDALO_TOOLS'  => 'v6 path segment "tools" — inlined into paths.* DERIVED closures; 0 consumers',
		'DEDALO_LIB'    => 'v6 path segment "lib" — inlined into paths.* DERIVED closures; 0 consumers',
		'DEDALO_SESSION_SAVE_PATH' => 'handler-conditional; applied by the session boot phase at cutover (P13); 0 consumers',
	];

	/**
	* Catalog consts present in v7 but absent from the legacy sample surface. Empty
	* today (reconciliation: 0 catalog-only). A genuinely new v7 setting would be listed
	* here with a justification; until then the gate asserts this stays empty.
	*/
	private const CATALOG_ONLY_ALLOWLIST = [];

	protected function setUp() : void { parent::setUp(); boot::reset(); config::reset(); }
	protected function tearDown() : void { boot::reset(); config::reset(); }

	private function repo_root() : string { return dirname(__DIR__, 3); }

	/** @return config_key[] the real 192-key catalog */
	private function catalog() : array {
		return require $this->repo_root() . '/core/base/config/catalog/catalog.php';
	}

	/** @return array<string,array{kind:string,value:mixed,file:string}> */
	private function legacy_surface() : array {
		$files = array_map(fn(string $f) : string => $this->repo_root() . '/' . $f, self::SAMPLE_FILES);
		return legacy_surface::extract($files);
	}

	/** @return array<string,mixed> emitted constant name => value, from one hermetic boot */
	private function emitted() : array {
		$recorded = [];
		$spy = static function (string $name, mixed $value) use (&$recorded) : void {
			$recorded[$name] = $value;
		};
		boot::run(entrypoint_profile::TEST, boot_config_phases::phases($this->catalog(), [], $spy));
		$this->assertSame(boot_state::READY, boot::state(), 'hermetic boot must reach READY');
		return $recorded;
	}

	/** @return array<string,config_scope> const name => scope, for every key with a const */
	private function const_scopes() : array {
		$map = [];
		foreach ($this->catalog() as $key) {
			if ($key->const !== null) {
				$map[$key->const] = $key->scope;
			}
		}
		return $map;
	}

	public function test_legacy_surface_is_substantial() : void {
		$this->assertGreaterThan(180, count($this->legacy_surface()),
			'expected ~196 legacy defines; a much smaller count means the tokenizer or sample files broke');
	}

	public function test_every_legacy_constant_is_classified() : void {
		$surface = array_keys($this->legacy_surface());
		$cat     = array_keys($this->const_scopes());
		$allow   = array_keys(self::LEGACY_DROP_ALLOWLIST);

		$unclassified = array_values(array_diff($surface, $cat, $allow));
		$this->assertSame([], $unclassified,
			'legacy constants with no catalog key and not in the drop allowlist: '
			. implode(', ', $unclassified)
			. ' — add a catalog key or justify a drop; never leave a legacy constant unaccounted for');
	}

	public function test_no_catalog_const_absent_from_legacy_surface() : void {
		$surface = array_keys($this->legacy_surface());
		$cat     = array_keys($this->const_scopes());
		$allow   = array_keys(self::CATALOG_ONLY_ALLOWLIST);

		$catalog_only = array_values(array_diff($cat, $surface, $allow));
		$this->assertSame([], $catalog_only,
			'catalog consts not present in the legacy sample surface: ' . implode(', ', $catalog_only)
			. ' — regenerate the samples or add to CATALOG_ONLY_ALLOWLIST with justification');
	}

	public function test_drop_allowlist_entries_all_exist_in_legacy_surface() : void {
		$surface = array_keys($this->legacy_surface());
		foreach (array_keys(self::LEGACY_DROP_ALLOWLIST) as $dropped) {
			$this->assertContains($dropped, $surface,
				"drop-allowlisted '{$dropped}' is no longer defined in the samples — remove the stale allowlist entry");
		}
	}

	public function test_emitted_surface_is_exactly_static_and_derived_consts() : void {
		$expected = [];
		foreach ($this->const_scopes() as $const => $scope) {
			if ($scope === config_scope::STATIC || $scope === config_scope::DERIVED) {
				$expected[] = $const;
			}
		}
		$emitted = array_keys($this->emitted());
		sort($expected);
		sort($emitted);
		$this->assertSame($expected, $emitted,
			'the hermetic compat-shim must emit exactly the STATIC+DERIVED legacy constants — no more, no less');
	}

	public function test_request_and_user_scoped_constants_are_never_emitted() : void {
		$emitted = $this->emitted();
		$targets = array_filter($this->const_scopes(), static fn(config_scope $s) : bool =>
			$s === config_scope::REQUEST || $s === config_scope::USER);
		// guard: a future catalog refactor that emptied these scopes would make the loop
		// below assert nothing — fail loudly instead of passing vacuously.
		$this->assertNotEmpty($targets,
			'no REQUEST/USER consts in the catalog — this exclusion check would be vacuous; update the gate');
		foreach ($targets as $const => $scope) {
			$this->assertArrayNotHasKey($const, $emitted,
				"{$const} is accessor-only (REQUEST/USER) and must never be a process constant (worker cross-user leak)");
		}
	}

	public function test_secret_state_and_derived_request_constants_are_not_in_the_hermetic_compile() : void {
		$emitted = $this->emitted();
		$targets = array_filter($this->const_scopes(), static fn(config_scope $s) : bool =>
			$s === config_scope::SECRET || $s === config_scope::STATE || $s === config_scope::DERIVED_REQUEST);
		// guard: never let this exclusion check pass vacuously (see note above).
		$this->assertNotEmpty($targets,
			'no SECRET/STATE/DERIVED_REQUEST consts in the catalog — this exclusion check would be vacuous; update the gate');
		foreach ($targets as $const => $scope) {
			$this->assertArrayNotHasKey($const, $emitted,
				"{$const} is live-sourced ({$scope->value}); it must come from env/state/\$_SERVER at cutover, never the compiled artifact");
		}
	}

	public function test_static_constant_values_match_the_canonical_samples() : void {
		$surface = $this->legacy_surface();
		$scopes  = $this->const_scopes();
		$emitted = $this->emitted();

		$checked = 0;
		foreach ($scopes as $const => $scope) {
			if ($scope !== config_scope::STATIC) {
				continue;
			}
			if (!isset($surface[$const]) || $surface[$const]['kind'] !== 'literal') {
				continue; // list/map/derived defaults are not single scalar literals
			}
			$this->assertArrayHasKey($const, $emitted, "{$const} (STATIC) must be emitted");
			$this->assertSame($surface[$const]['value'], $emitted[$const],
				"emitted {$const} must equal its canonical sample value");
			$checked++;
		}
		$this->assertGreaterThan(100, $checked,
			'expected ~133 STATIC scalar literals cross-checked against the samples');
	}
}
