<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';

final class catalog_lang_defaults_Test extends TestCase {

	/** @return array<string,config_key> keyed by path, from lang.php */
	private function load_lang() : array {
		$by = [];
		foreach (require dirname(__DIR__, 3) . '/core/base/config/catalog/domains/lang.php' as $k) {
			$by[$k->path] = $k;
		}
		return $by;
	}

	/** @return array<string,config_key> keyed by path, from defaults.php */
	private function load_defaults() : array {
		$by = [];
		foreach (require dirname(__DIR__, 3) . '/core/base/config/catalog/domains/defaults.php' as $k) {
			$by[$k->path] = $k;
		}
		return $by;
	}

	// -------------------------------------------------------------------------
	// lang domain — presence, scope, const
	// -------------------------------------------------------------------------

	public function test_lang_keys_present_with_correct_scope_and_const() : void {
		$by = $this->load_lang();
		$expect = [
			'lang.structure_lang'          => [config_scope::STATIC,  'DEDALO_STRUCTURE_LANG'],
			'lang.application_langs'       => [config_scope::STATIC,  'DEDALO_APPLICATION_LANGS'],
			'lang.application_langs_default'=> [config_scope::STATIC, 'DEDALO_APPLICATION_LANGS_DEFAULT'],
			'lang.application_lang'        => [config_scope::REQUEST, 'DEDALO_APPLICATION_LANG'],
			'lang.data_lang_default'       => [config_scope::STATIC,  'DEDALO_DATA_LANG_DEFAULT'],
			'lang.data_lang'               => [config_scope::REQUEST, 'DEDALO_DATA_LANG'],
			'lang.data_lang_selector'      => [config_scope::STATIC,  'DEDALO_DATA_LANG_SELECTOR'],
			'lang.data_lang_sync'          => [config_scope::STATIC,  'DEDALO_DATA_LANG_SYNC'],
			'lang.data_nolan'              => [config_scope::STATIC,  'DEDALO_DATA_NOLAN'],
			'lang.projects_default_langs'  => [config_scope::STATIC,  'DEDALO_PROJECTS_DEFAULT_LANGS'],
			'lang.diffusion_langs'         => [config_scope::DERIVED, 'DEDALO_DIFFUSION_LANGS'],
		];
		foreach ($expect as $path => [$scope, $const]) {
			$this->assertArrayHasKey($path, $by, "missing $path");
			$this->assertSame($scope, $by[$path]->scope, "scope of $path");
			$this->assertSame($const, $by[$path]->const, "const of $path");
		}
	}

	// -------------------------------------------------------------------------
	// lang domain — static default values
	// -------------------------------------------------------------------------

	public function test_lang_static_defaults() : void {
		$by = $this->load_lang();
		$this->assertSame('lg-spa',   $by['lang.structure_lang']->default);
		$this->assertSame('lg-eng',   $by['lang.application_langs_default']->default);
		$this->assertSame('lg-eng',   $by['lang.data_lang_default']->default);
		$this->assertTrue($by['lang.data_lang_selector']->default);
		$this->assertFalse($by['lang.data_lang_sync']->default);
		$this->assertSame('lg-nolan', $by['lang.data_nolan']->default);
	}

	// -------------------------------------------------------------------------
	// lang domain — exact map: application_langs
	// -------------------------------------------------------------------------

	public function test_lang_application_langs_exact_map() : void {
		$by = $this->load_lang();
		$expected = [
			'lg-eng' => 'English',
			'lg-spa' => 'Castellano',
			'lg-cat' => 'Català',
			'lg-eus' => 'Euskara',
			'lg-fra' => 'Français',
			'lg-por' => 'Português',
			'lg-deu' => 'Deutsch',
			'lg-ita' => 'Italiano',
			'lg-ell' => 'Ελληνικά',
			'lg-nep' => 'नेपाली',
		];
		$this->assertSame($expected, $by['lang.application_langs']->default);
	}

	// -------------------------------------------------------------------------
	// lang domain — exact list: projects_default_langs
	// -------------------------------------------------------------------------

	public function test_lang_projects_default_langs_exact_list() : void {
		$by = $this->load_lang();
		$expected = ['lg-spa', 'lg-cat', 'lg-eng', 'lg-fra'];
		$this->assertSame($expected, $by['lang.projects_default_langs']->default);
	}

	// -------------------------------------------------------------------------
	// lang domain — REQUEST keys have null default
	// -------------------------------------------------------------------------

	public function test_lang_request_keys_have_null_default() : void {
		$by = $this->load_lang();
		foreach (['lang.application_lang', 'lang.data_lang'] as $path) {
			$this->assertSame(config_scope::REQUEST, $by[$path]->scope, "scope of $path");
			$this->assertNull($by[$path]->default, "REQUEST key $path must have no default");
		}
	}

	// -------------------------------------------------------------------------
	// lang domain — diffusion_langs DERIVED closure
	// -------------------------------------------------------------------------

	public function test_lang_diffusion_langs_is_derived_and_closure_works() : void {
		$by = $this->load_lang();
		$key = $by['lang.diffusion_langs'];
		$this->assertSame(config_scope::DERIVED, $key->scope);
		$this->assertInstanceOf(\Closure::class, $key->derived);
		$result = ($key->derived)(['lang.projects_default_langs' => ['a', 'b']]);
		$this->assertSame(['a', 'b'], $result);
	}

	// -------------------------------------------------------------------------
	// defaults domain — presence, scope, const
	// -------------------------------------------------------------------------

	public function test_defaults_keys_present_with_correct_scope_and_const() : void {
		$by = $this->load_defaults();
		$expect = [
			'defaults.prefix_tipos'              => [config_scope::STATIC,  'DEDALO_PREFIX_TIPOS'],
			'defaults.main_fallback_section'     => [config_scope::STATIC,  'MAIN_FALLBACK_SECTION'],
			'defaults.numerical_matrix_value_yes'=> [config_scope::STATIC,  'NUMERICAL_MATRIX_VALUE_YES'],
			'defaults.numerical_matrix_value_no' => [config_scope::STATIC,  'NUMERICAL_MATRIX_VALUE_NO'],
			'defaults.max_rows_per_page'         => [config_scope::STATIC,  'DEDALO_MAX_ROWS_PER_PAGE'],
			'defaults.profile_default'           => [config_scope::STATIC,  'DEDALO_PROFILE_DEFAULT'],
			'defaults.default_project'           => [config_scope::STATIC,  'DEDALO_DEFAULT_PROJECT'],
			'defaults.filter_section_tipo'       => [config_scope::DERIVED, 'DEDALO_FILTER_SECTION_TIPO_DEFAULT'],
		];
		foreach ($expect as $path => [$scope, $const]) {
			$this->assertArrayHasKey($path, $by, "missing $path");
			$this->assertSame($scope, $by[$path]->scope, "scope of $path");
			$this->assertSame($const, $by[$path]->const, "const of $path");
		}
	}

	// -------------------------------------------------------------------------
	// defaults domain — static default values
	// -------------------------------------------------------------------------

	public function test_defaults_static_defaults() : void {
		$by = $this->load_defaults();
		$this->assertSame('oh1', $by['defaults.main_fallback_section']->default);
		$this->assertSame(1,     $by['defaults.numerical_matrix_value_yes']->default);
		$this->assertSame(2,     $by['defaults.numerical_matrix_value_no']->default);
		$this->assertSame(10,    $by['defaults.max_rows_per_page']->default);
		$this->assertSame(2,     $by['defaults.profile_default']->default);
		$this->assertSame(1,     $by['defaults.default_project']->default);
	}

	// -------------------------------------------------------------------------
	// defaults domain — exact list: prefix_tipos
	// -------------------------------------------------------------------------

	public function test_defaults_prefix_tipos_exact_list() : void {
		$by = $this->load_defaults();
		$expected = [
			'dd',
			'rsc',
			'ontology',
			'hierarchy',
			'lg',
			'utoponymy',
			'oh',
			'ich',
			'nexus',
			'actv',
		];
		$this->assertSame($expected, $by['defaults.prefix_tipos']->default);
	}

	// -------------------------------------------------------------------------
	// defaults domain — filter_section_tipo DERIVED closure
	// -------------------------------------------------------------------------

	public function test_defaults_filter_section_tipo_is_derived_and_closure_returns_fallback() : void {
		$by = $this->load_defaults();
		$key = $by['defaults.filter_section_tipo'];
		$this->assertSame(config_scope::DERIVED, $key->scope);
		$this->assertInstanceOf(\Closure::class, $key->derived);
		// DEDALO_SECTION_PROJECTS_TIPO is not defined in unit test context → must return 'dd153'
		$this->assertFalse(defined('DEDALO_SECTION_PROJECTS_TIPO'), 'constant must not be defined for this assertion');
		$result = ($key->derived)([]);
		$this->assertSame('dd153', $result);
	}
}
