<?php declare(strict_types=1);
/**
* CONTEXT_CACHE_DETERMINISM_TEST
* Verifies that the structure context cache is semantically transparent:
* a cache hit must return exactly what a fresh build would return for the
* calling instance and arguments. Each scenario covers a historical bug of
* the previous {tipo}_{section_tipo}_{mode} cache key ("first caller wins").
*/

use PHPUnit\Framework\TestCase;

final class context_cache_determinism_test extends BaseTestCase {

	protected function setUp(): void {
		parent::setUp();
		$this->user_login();
		// start every scenario from a cold context cache
		common::$cache_structure_context = [];
	}

	private function build_component(int $section_id=1) : component_common {
		return component_common::get_instance(
			'component_text_area',
			'test17',
			$section_id,
			'edit',
			DEDALO_DATA_NOLAN,
			'test3'
		);
	}

	/**
	* Old bug: add_request_config was not part of the cache key. A first call
	* with false froze request_config=null; later callers needing it for
	* get_subdatum received null and produced empty subdatum.
	*/
	public function test_request_config_not_frozen_by_first_call() {
		$component = $this->build_component();

		$ctx_plain = $component->get_structure_context(1, false);
		$ctx_rqc   = $component->get_structure_context(1, true);

		$this->assertNull($ctx_plain->request_config, 'request_config expected null when not requested');
		$this->assertIsArray($ctx_rqc->request_config, 'request_config expected when requested after a false-call');
		$this->assertNotEmpty($ctx_rqc->request_config);
	}

	/**
	* Old bug: permissions was not part of the cache key; get_subdatum injects
	* inherited/capped permissions on children, so the same tipo can carry
	* different permissions within one request.
	*/
	public function test_permissions_stamped_per_call() {
		$component = $this->build_component();

		$ctx_p2 = $component->get_structure_context(2, false);
		$ctx_p1 = $component->get_structure_context(1, false);

		$this->assertSame(2, $ctx_p2->permissions);
		$this->assertSame(1, $ctx_p1->permissions);
	}

	/**
	* Old bug: get_structure_context_simple shared the cache key with the full
	* version and permanently emptied $this->tools / $this->buttons_context on
	* the (cached, reused) instance, so a later full call returned no tools.
	*/
	public function test_simple_call_does_not_poison_full_context() {
		$component = $this->build_component(2);

		$ctx_simple = $component->get_structure_context_simple(1, false);
		$ctx_full   = $component->get_structure_context(1, false);

		$this->assertEmpty($ctx_simple->tools, 'simple context expected without tools');
		$this->assertNotEmpty($ctx_full->tools, 'full context after a simple call expected with tools');
	}

	/**
	* Old bug: cache hits returned the cache entry by reference; callers adding
	* properties to the returned context (e.g. target_section_tipo in the search
	* area builders) polluted the cache for every later caller.
	*/
	public function test_returned_context_mutation_does_not_pollute_cache() {
		$component = $this->build_component(2);

		$ctx_a = $component->get_structure_context(1, false);
		$ctx_a->target_section_tipo = ['polluted'];

		$ctx_b = $component->get_structure_context(1, false);
		$this->assertFalse(isset($ctx_b->target_section_tipo), 'cache entry polluted by caller mutation');
	}

	/**
	* Old bug: parent resolution depends on the injected from_parent, which was
	* not part of the cache key: the first resolved parent was frozen for all
	* later callers of the same tipo+section_tipo+mode.
	*/
	public function test_parent_stamped_per_call() {
		$component = $this->build_component(3);

		$component->from_parent = 'test3_fakeparent';
		$ctx_fp = $component->get_structure_context(1, false);

		$component->from_parent = null;
		$ctx_nofp = $component->get_structure_context(1, false);

		$this->assertSame('test3_fakeparent', $ctx_fp->parent, 'injected from_parent expected in context parent');
		$this->assertSame('test3', $ctx_nofp->parent, 'parent expected to fall back to section_tipo');
	}

	/**
	* Old bug: properties were shallow-cloned, so nested mutations during the
	* context build (filter_by_list, state_of_component, show_interface) leaked
	* into the instance-level properties cache of reused component instances.
	*/
	public function test_context_build_does_not_mutate_instance_properties() {
		$component = $this->build_component();

		$props_before = json_encode($component->get_properties());
		$component->get_structure_context(1, true);
		$props_after = json_encode($component->get_properties());

		$this->assertSame($props_before, $props_after, 'instance properties mutated by context build');
	}
}
