<?php declare(strict_types=1);
/**
* CLASS RAG_CONFIG
* Resolves per-section / per-component RAG configuration from the ontology
* `properties` object (no bespoke table — the Dédalo way). A component opts in
* with:
*     properties.rag = { embed:true, weight?, chunk?, strategy?, mode? }
* and a section opts in with:
*     properties.rag = { enabled:true }
*
* Section-level gating keeps non-RAG saves cheap: section_is_rag_enabled() is
* the cheap check the save() hook calls before doing anything else.
*
* All lookups go through ontology_node::get_instance($tipo)->get_properties()
* and are statically cached per process.
*
* @package Dedalo
* @subpackage Rag
*/
abstract class rag_config {



	/** @var array<string,?object> $properties_cache  tipo => properties|null */
	private static array $properties_cache = [];

	/** @var array<string,bool> $section_enabled_cache */
	private static array $section_enabled_cache = [];

	/** @var array<string,array<int,string>> $embeddable_cache */
	private static array $embeddable_cache = [];



	/**
	* GET_PROPERTIES  cached properties object for a tipo (or null)
	* @param string $tipo
	* @return ?object
	*/
	public static function get_properties( string $tipo ) : ?object {

		if (array_key_exists($tipo, self::$properties_cache)) {
			return self::$properties_cache[$tipo];
		}

		$properties = null;
		try {
			$node = ontology_node::get_instance($tipo);
			$properties = $node->get_properties();
		} catch (\Throwable $e) {
			$properties = null;
		}

		self::$properties_cache[$tipo] = is_object($properties) ? $properties : null;
		return self::$properties_cache[$tipo];
	}//end get_properties



	/**
	* GET_RAG  the `rag` sub-object of a tipo's properties (or null)
	* @param string $tipo
	* @return ?object
	*/
	public static function get_rag( string $tipo ) : ?object {

		$properties = self::get_properties($tipo);
		if ($properties === null || !isset($properties->rag) || !is_object($properties->rag)) {
			return null;
		}
		return $properties->rag;
	}//end get_rag



	/**
	* SECTION_IS_RAG_ENABLED
	* Cheap gate used by the save()/delete() hook. True when the section node
	* declares properties.rag.enabled === true. Also honours a global kill switch
	* (DEDALO_RAG_ENABLED) so an install can disable RAG without editing ontology.
	* @param string $section_tipo
	* @return bool
	*/
	public static function section_is_rag_enabled( string $section_tipo ) : bool {

		// strictly opt-in: RAG does nothing unless explicitly enabled
		if (!defined('DEDALO_RAG_ENABLED') || DEDALO_RAG_ENABLED !== true) {
			return false;
		}

		if (isset(self::$section_enabled_cache[$section_tipo])) {
			return self::$section_enabled_cache[$section_tipo];
		}

		$rag = self::get_rag($section_tipo);
		$enabled = ($rag !== null) && !empty($rag->enabled);

		self::$section_enabled_cache[$section_tipo] = $enabled;
		return $enabled;
	}//end section_is_rag_enabled



	/**
	* COMPONENT_IS_EMBEDDABLE  true when a component declares rag.embed === true
	* @param string $component_tipo
	* @return bool
	*/
	public static function component_is_embeddable( string $component_tipo ) : bool {

		$rag = self::get_rag($component_tipo);
		return ($rag !== null) && !empty($rag->embed);
	}//end component_is_embeddable



	/**
	* GET_EMBEDDABLE_COMPONENT_TIPOS
	* Enumerate the section's text-bearing child components that opted in with
	* rag.embed. The candidate set is restricted to the embeddable models
	* (DEDALO_RAG_EMBEDDABLE_MODELS) for efficiency, then filtered by the flag.
	* @param string $section_tipo
	* @return array<int,string>
	*/
	public static function get_embeddable_component_tipos( string $section_tipo ) : array {

		if (isset(self::$embeddable_cache[$section_tipo])) {
			return self::$embeddable_cache[$section_tipo];
		}

		$models = defined('DEDALO_RAG_EMBEDDABLE_MODELS')
			? DEDALO_RAG_EMBEDDABLE_MODELS
			: ['component_text_area','component_input_text','component_text'];

		$candidates = [];
		try {
			$candidates = section::get_ar_children_tipo_by_model_name_in_section(
				$section_tipo,
				$models,
				true,	// from_cache
				false,	// resolve_virtual
				true	// recursive
			);
		} catch (\Throwable $e) {
			$candidates = [];
		}

		$out = [];
		foreach ($candidates as $tipo) {
			if (self::component_is_embeddable($tipo)) {
				$out[] = $tipo;
			}
		}

		self::$embeddable_cache[$section_tipo] = $out;
		return $out;
	}//end get_embeddable_component_tipos



	/**
	* GET_CHUNK_OPTS  per-component chunker options derived from rag.chunk/strategy
	* @param string $component_tipo
	* @return array<string,mixed>
	*/
	public static function get_chunk_opts( string $component_tipo ) : array {

		$rag = self::get_rag($component_tipo);
		$opts = [
			'mode'		=> 'auto',
			'strategy'	=> defined('DEDALO_RAG_CHUNK_STRATEGY') ? DEDALO_RAG_CHUNK_STRATEGY : 'structural_semantic'
		];
		if ($rag !== null) {
			if (isset($rag->strategy) && is_string($rag->strategy)) {
				$opts['strategy'] = $rag->strategy;
			}
			if (isset($rag->mode) && is_string($rag->mode)) {
				$opts['mode'] = $rag->mode;
			}
			if (isset($rag->chunk) && is_object($rag->chunk)) {
				if (isset($rag->chunk->max_tokens)) $opts['max_tokens'] = (int)$rag->chunk->max_tokens;
				if (isset($rag->chunk->min_tokens)) $opts['min_tokens'] = (int)$rag->chunk->min_tokens;
			}
		}
		return $opts;
	}//end get_chunk_opts



	// ------------------------------------------------------------------
	// Phase 5b — image/object context (properties.rag.context)
	// ------------------------------------------------------------------

	/** @var array<string,?object> $context_cache */
	private static array $context_cache = [];



	/**
	* GET_CONTEXT
	* The section's RAG object-context: which images (+ view roles) form the
	* visual signal, which components are typology/period/material, and the
	* comparison scope. Returns null when not declared.
	* Shape: { images:[{tipo,view}], metadata:{typology,period,material,…}, compare_scope }
	* @param string $section_tipo
	* @return ?object
	*/
	public static function get_context( string $section_tipo ) : ?object {

		if (array_key_exists($section_tipo, self::$context_cache)) {
			return self::$context_cache[$section_tipo];
		}
		$rag = self::get_rag($section_tipo);
		$context = ($rag !== null && isset($rag->context) && is_object($rag->context)) ? $rag->context : null;
		self::$context_cache[$section_tipo] = $context;
		return $context;
	}//end get_context



	/**
	* SECTION_HAS_IMAGE_CONTEXT  true when the section declares image components
	* @param string $section_tipo
	* @return bool
	*/
	public static function section_has_image_context( string $section_tipo ) : bool {

		$context = self::get_context($section_tipo);
		return $context !== null && !empty($context->images) && is_array($context->images);
	}//end section_has_image_context



	/**
	* GET_CONTEXT_IMAGES  list of {tipo, view} declared image components
	* @param string $section_tipo
	* @return array<int,array{tipo:string,view:?string}>
	*/
	public static function get_context_images( string $section_tipo ) : array {

		$context = self::get_context($section_tipo);
		if ($context === null || empty($context->images) || !is_array($context->images)) {
			return [];
		}
		$out = [];
		foreach ($context->images as $img) {
			$tipo = is_object($img) ? ($img->tipo ?? null) : (is_string($img) ? $img : null);
			if (empty($tipo)) {
				continue;
			}
			$out[] = [ 'tipo' => (string)$tipo, 'view' => is_object($img) ? ($img->view ?? null) : null ];
		}
		return $out;
	}//end get_context_images



	/**
	* GET_CONTEXT_METADATA  { role => component_tipo } (typology/period/material/…)
	* @param string $section_tipo
	* @return array<string,string>
	*/
	public static function get_context_metadata( string $section_tipo ) : array {

		$context = self::get_context($section_tipo);
		if ($context === null || empty($context->metadata) || !is_object($context->metadata)) {
			return [];
		}
		$out = [];
		foreach ((array)$context->metadata as $role => $tipo) {
			if (is_string($tipo) && $tipo !== '') {
				$out[(string)$role] = $tipo;
			}
		}
		return $out;
	}//end get_context_metadata



	/**
	* GET_COMPARE_SCOPE  section_tipos to match an object against
	* @param string $section_tipo
	* @return array<int,string>
	*/
	public static function get_compare_scope( string $section_tipo ) : array {

		$context = self::get_context($section_tipo);
		$scope = $context->compare_scope ?? 'same_section';
		if (is_array($scope)) {
			return array_values(array_filter(array_map('strval', $scope)));
		}
		return [$section_tipo]; // 'same_section' (default)
	}//end get_compare_scope



	/**
	* RESET  (tests / cache invalidation)
	* @return void
	*/
	public static function reset() : void {
		self::$properties_cache		= [];
		self::$section_enabled_cache= [];
		self::$embeddable_cache		= [];
		self::$context_cache		= [];
	}//end reset



}//end class rag_config
