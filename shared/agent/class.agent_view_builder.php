<?php declare(strict_types=1);
/**
 * CLASS AGENT_VIEW_BUILDER
 * Single source of truth for the LLM-facing "agent view" of Dédalo data.
 *
 * Builds two canonical shapes used by the agent tier of the MCP and any
 * future non-browser agent client:
 *
 * 1. SECTION VIEW   — human-label list of fields for a section.
 * 2. RECORD VIEW    — flat `{label: value}` map for one record, portals
 *                     expanded to `{ref, label}` one hop deep.
 *
 * It also exposes the symmetric label↔tipo map used by the write resolver
 * so any label the agent ever sees can be written back without ambiguity.
 *
 * Key design rules:
 * - Field keys are HUMAN labels in the requested language. Collisions are
 *   disambiguated with a deterministic ` (2)`, ` (3)` suffix following
 *   section order. The suffix IS part of the public key.
 * - No `tipo`s appear in the body unless `include_tipos=true`. The opaque
 *   round-trip data is kept in `_meta.section_tipo` and `_meta.field_tipos`.
 * - Six simplified types only: text | html | date | number | link | media.
 *   The exact Dédalo model is exposed in `_meta` for power users.
 * - All caches are in-memory per request and respect Dédalo's existing
 *   ontology cache invalidation (no separate invalidation hook needed).
 *
 * @package Dedalo
 * @subpackage Shared
 */
final class agent_view_builder {



	/**
	 * In-memory cache of section label maps, keyed by "section_tipo|lang".
	 * @var array<string, object>
	 */
	private static array $section_label_map_cache = [];



	/**
	 * Components excluded from the agent view (UI noise, security-sensitive,
	 * or not meaningful as flat fields).
	 * @var array<int, string>
	 */
	private const EXCLUDED_MODELS = [
		'component_password',
		'component_security_access',
		'component_security_areas',
		'component_security_areas_profiles',
		'component_info',
		'component_inverse',
		'component_filter_records',
		'section_tab',
		'section_group',
		'section_group_div'
	];



	/**
	 * SIMPLIFIED_TYPE_MAP
	 * Maps Dédalo component models to the six simplified field types
	 * exposed to the LLM.
	 * @var array<string, string>
	 */
	private const SIMPLIFIED_TYPE_MAP = [
		// text
		'component_input_text'      => 'text',
		'component_text_area'       => 'html',
		'component_email'           => 'text',
		'component_iri'              => 'text',
		// numeric
		'component_number'          => 'number',
		'component_calculation'     => 'number',
		// date / time
		'component_date'            => 'date',
		'component_time'            => 'date',
		// link / relation
		'component_portal'          => 'link',
		'component_autocomplete'    => 'link',
		'component_autocomplete_hi' => 'link',
		'component_select'          => 'link',
		'component_radio_buttons'   => 'link',
		'component_check_box'       => 'link',
		'component_relation_model'  => 'link',
		'component_relation_parent' => 'link',
		'component_relation_children'=> 'link',
		'component_relation_related'=> 'link',
		'component_relation_index'  => 'link',
		'component_dataframe'       => 'link',
		'component_filter'          => 'link',
		// media
		'component_av'              => 'media',
		'component_image'           => 'media',
		'component_pdf'             => 'media',
		'component_3d'              => 'media'
	];



	/**
	 * Models considered "link/relation" (their value is a list of locators).
	 * @var array<int, string>
	 */
	public const LINK_MODELS = [
		'component_portal',
		'component_autocomplete',
		'component_autocomplete_hi',
		'component_select',
		'component_radio_buttons',
		'component_check_box',
		'component_relation_model',
		'component_relation_parent',
		'component_relation_children',
		'component_relation_related',
		'component_relation_index',
		'component_dataframe',
		'component_filter'
	];



	/**
	 * SECTION_LABEL_MAP
	 * Returns the canonical label↔tipo resolution table for a section in a
	 * given language. Result is cached per (section_tipo, lang).
	 *
	 * Shape:
	 * {
	 *   "section_tipo": "oh1",
	 *   "lang": "lg-eng",
	 *   "section_label": "Oral History",
	 *   "labels": {
	 *     "Title":    {"tipo":"oh14","model":"component_input_text","type":"text"},
	 *     "Date (2)": {"tipo":"oh187","model":"component_date","type":"date"},
	 *     "Informant":{"tipo":"oh24","model":"component_portal","type":"link","target":"rsc197"}
	 *   },
	 *   "tipos": {"oh14":"Title","oh187":"Date (2)","oh24":"Informant"}
	 * }
	 *
	 * @param string $section_tipo
	 * @param string $lang
	 * @param bool $from_cache
	 * @return object
	 */
	public static function section_label_map( string $section_tipo, string $lang, bool $from_cache=true ) : object {

		$cache_key = $section_tipo . '|' . $lang;
		if ($from_cache===true && isset(self::$section_label_map_cache[$cache_key])) {
			return self::$section_label_map_cache[$cache_key];
		}

		$result = new stdClass();
		$result->section_tipo	= $section_tipo;
		$result->lang			= $lang;
		$result->section_label	= self::label_for_tipo($section_tipo, $lang);
		$result->labels			= new stdClass();
		$result->tipos			= new stdClass();

		// Gather component children in section order. Recursive so grouped
		// section_groups are flattened to their leaf components.
		$ar_component_tipo = section::get_ar_children_tipo_by_model_name_in_section(
			$section_tipo,
			['component_'],
			true,	// from_cache
			true,	// resolve_virtual
			true,	// recursive
			false	// search_exact (prefix match)
		);

		// Track label collisions to apply ` (N)` suffixes deterministically.
		$label_counts = [];

		foreach ($ar_component_tipo as $component_tipo) {

			$model = ontology_node::get_model_by_tipo($component_tipo, true);
			if (empty($model) || in_array($model, self::EXCLUDED_MODELS, true)) {
				continue;
			}

			$base_label	= self::label_for_tipo($component_tipo, $lang);
			$label		= self::disambiguate_label($base_label, $label_counts);

			$entry = new stdClass();
			$entry->tipo	= $component_tipo;
			$entry->model	= $model;
			$entry->type	= self::SIMPLIFIED_TYPE_MAP[$model] ?? 'text';

			// Portal target hint (best-effort; only one target listed).
			if (in_array($model, self::LINK_MODELS, true)) {
				$target = self::first_target_section_tipo($model, $component_tipo, $section_tipo);
				if ($target !== null) {
					$entry->target = $target;
				}
			}

			$result->labels->{$label}			= $entry;
			$result->tipos->{$component_tipo}	= $label;
		}

		self::$section_label_map_cache[$cache_key] = $result;

		return $result;
	}//end section_label_map



	/**
	 * SECTION_TO_VIEW
	 * Returns the LLM-facing section schema:
	 * {
	 *   "section": "Oral History",
	 *   "section_tipo": "oh1",
	 *   "lang": "lg-eng",
	 *   "fields": [
	 *     {"label":"Title","type":"text"},
	 *     {"label":"Informant","type":"link","target":"Person"}
	 *   ],
	 *   "_meta": { "field_tipos": {"Title":"oh14", ...} }    // only when include_tipos
	 * }
	 *
	 * @param string $section_tipo
	 * @param string $lang
	 * @param bool $include_tipos
	 * @return object
	 */
	public static function section_to_view( string $section_tipo, string $lang, bool $include_tipos=false ) : object {

		$map = self::section_label_map($section_tipo, $lang);

		$view = new stdClass();
		$view->section_label	= $map->section_label;
		$view->section_tipo		= $section_tipo;
		$view->lang				= $lang;
		$view->fields			= [];

		foreach ($map->labels as $label => $entry) {

			$field = new stdClass();
			$field->label	= $label;
			$field->type	= $entry->type;

			if (isset($entry->target)) {
				$field->target = self::label_for_tipo($entry->target, $lang) ?? $entry->target;
			}

			if ($include_tipos===true) {
				$field->tipo	= $entry->tipo;
				$field->model	= $entry->model;
			}

			$view->fields[] = $field;
		}

		if ($include_tipos===true) {
			$view->_meta = new stdClass();
			$view->_meta->field_tipos = $map->tipos;
		}

		return $view;
	}//end section_to_view



	/**
	 * RECORD_TO_VIEW
	 * Returns the agent-view of a single record:
	 * {
	 *   "section": "Oral History",
	 *   "section_tipo": "oh1",
	 *   "id": 42,
	 *   "lang": "lg-eng",
	 *   "fields": {
	 *     "Title": "Interview with X",
	 *     "Date": "1998-05-12",
	 *     "Informant": [{ "ref": "rsc197#7", "label": "John Doe", "section_tipo": "rsc197", "section_id": 7 }]
	 *   },
	 *   "_meta": { "section_tipo": "oh1", "field_tipos": { ... } }
	 * }
	 *
	 * @param string $section_tipo
	 * @param int $section_id
	 * @param string $lang
	 * @param bool $include_tipos
	 * @return object
	 */
	public static function record_to_view( string $section_tipo, int $section_id, string $lang, bool $include_tipos=false ) : object {

		$map = self::section_label_map($section_tipo, $lang);

		$view = new stdClass();
		$view->section_label	= $map->section_label;
		$view->section_tipo		= $section_tipo;
		$view->section_id		= $section_id;
		$view->lang				= $lang;
		$view->fields			= new stdClass();

		foreach ($map->labels as $label => $entry) {

			$value = self::component_value(
				$entry->model,
				$entry->tipo,
				$section_id,
				$section_tipo,
				$lang
			);

			$view->fields->{$label} = $value;
		}

		// Always emit _meta so writes can round-trip even if the LLM
		// drops labels somewhere down the stack.
		$view->_meta = new stdClass();
		$view->_meta->section_tipo	= $section_tipo;
		$view->_meta->field_tipos	= $map->tipos;

		if ($include_tipos===true) {
			// Re-key the body by tipo for power users / debugging.
			$by_tipo = new stdClass();
			foreach ($map->tipos as $tipo => $label) {
				$by_tipo->{$tipo} = $view->fields->{$label} ?? null;
			}
			$view->fields_by_tipo = $by_tipo;
		}

		return $view;
	}//end record_to_view



	/**
	 * RESOLVE_FIELD
	 * Write-side resolver. Accepts a label OR a tipo and returns the matched
	 * component descriptor `{tipo, model, type, target?}` or null if the
	 * field cannot be resolved.
	 *
	 * Sequence:
	 *   1. Looks-like-tipo (^[a-z]{1,5}[0-9]+$) AND present in section's tipos map.
	 *   2. Exact label match in cached labels.
	 *   3. Cross-language fallback (lg-eng, then lg-nolan).
	 *   4. Stale-cache retry: rebuild once and retry 2–3.
	 *
	 * Callers handle the "unknown_field" error and the `available_fields`
	 * hint themselves so they can include the section's full label list in
	 * the response without re-querying.
	 *
	 * @param string $section_tipo
	 * @param string $lang
	 * @param string $field   Label or tipo.
	 * @return object|null    {tipo, model, type, target?} or null.
	 */
	public static function resolve_field( string $section_tipo, string $lang, string $field ) : ?object {

		$field = trim($field);
		if ($field === '') {
			return null;
		}

		$map = self::section_label_map($section_tipo, $lang);

		$hit = self::try_resolve($map, $field);
		if ($hit !== null) return $hit;

		// Cross-language fallback (LLM often emits English labels even when
		// the session lang is something else).
		$ar_fallback_langs = [];
		if ($lang !== 'lg-eng')   $ar_fallback_langs[] = 'lg-eng';
		if ($lang !== 'lg-nolan') $ar_fallback_langs[] = 'lg-nolan';

		foreach ($ar_fallback_langs as $fallback_lang) {
			$fallback_map = self::section_label_map($section_tipo, $fallback_lang);
			$hit = self::try_resolve($fallback_map, $field);
			if ($hit !== null) return $hit;
		}

		// Stale-cache retry: rebuild without cache and try once more.
		$map = self::section_label_map($section_tipo, $lang, false);
		return self::try_resolve($map, $field);
	}//end resolve_field



	/**
	 * AVAILABLE_FIELDS
	 * Returns the list of accepted labels for a section, used as a hint in
	 * "unknown_field" error responses.
	 * @param string $section_tipo
	 * @param string $lang
	 * @return array<int, string>
	 */
	public static function available_fields( string $section_tipo, string $lang ) : array {

		$map = self::section_label_map($section_tipo, $lang);
		return array_keys((array)$map->labels);
	}//end available_fields



	/**
	 * RESOLVE_SECTION_TIPO
	 * Resolves a section identifier that may be a tipo (e.g. "oh1") or a
	 * human name (e.g. "Cecas", "Oral History") to its canonical section_tipo.
	 *
	 * Resolution order:
	 *   1. Exact tipo match — if it looks like a tipo and resolves to a
	 *      section model, return it directly.
	 *   2. Exact label match in the given language.
	 *   3. Cross-language fallback (lg-eng, lg-nolan).
	 *   4. Fuzzy search via `dd_ontology_db_manager::search_fuzzy_term`.
	 *
	 * Returns the resolved section_tipo string, or null if not found / ambiguous.
	 * When multiple matches exist, returns an object with `tipos` array and
	 * `labels` map so the caller can surface the ambiguity to the user.
	 *
	 * @param string $identifier  Tipo or human name.
	 * @param string $lang        Preferred language for label matching.
	 * @return string|object|null
	 */
	public static function resolve_section_tipo( string $identifier, string $lang ) : string|null|object {

		$identifier = trim($identifier);
		if ($identifier === '') return null;

		// 1. Exact tipo: if it looks like a tipo and IS a section, return it.
		if (preg_match('/^[a-z]{1,5}[0-9]+$/i', $identifier) === 1) {
			$model = ontology_node::get_model_by_tipo($identifier, true);
			if ($model === 'section') {
				return $identifier;
			}
			// Not a section — don't continue label search with a tipo string.
			return null;
		}

		// 2. Exact label match in the given language.
		// Walk all section tipos and compare labels.
		$all_sections = section::get_ar_all_section_tipos();
		if (empty($all_sections)) {
			$all_sections = [];
		}

		$matches = [];
		$identifier_fold = self::fold_label($identifier);

		foreach ($all_sections as $section_tipo) {

			$model = ontology_node::get_model_by_tipo($section_tipo, true);
			if ($model !== 'section') continue;

			$label = self::label_for_tipo($section_tipo, $lang);
			if ($label === $identifier) {
				return $section_tipo;	// exact match
			}
			if (self::fold_label($label) === $identifier_fold) {
				$matches[] = (object)[
					'section_tipo'	=> $section_tipo,
					'label'			=> $label,
				];
			}
		}

		// 3. Cross-language fallback for label matches.
		if (empty($matches)) {
			$fallback_langs = [];
			if ($lang !== 'lg-eng')   $fallback_langs[] = 'lg-eng';
			if ($lang !== 'lg-nolan') $fallback_langs[] = 'lg-nolan';

			foreach ($fallback_langs as $fb_lang) {
				foreach ($all_sections as $section_tipo) {
					$model = ontology_node::get_model_by_tipo($section_tipo, true);
					if ($model !== 'section') continue;

					$label = self::label_for_tipo($section_tipo, $fb_lang);
					if ($label === $identifier) {
						return $section_tipo;
					}
					if (self::fold_label($label) === $identifier_fold) {
						$matches[] = (object)[
							'section_tipo'	=> $section_tipo,
							'label'			=> $label,
						];
					}
				}
				if (count($matches) === 1) break;
			}
		}

		// Deduplicate matches (same section_tipo may appear via multiple langs).
		$seen = [];
		$unique = [];
		foreach ($matches as $m) {
			if (!isset($seen[$m->section_tipo])) {
				$seen[$m->section_tipo] = true;
				$unique[] = $m;
			}
		}
		$matches = $unique;

		if (count($matches) === 1) {
			return $matches[0]->section_tipo;
		}

		// 4. Fuzzy search via ontology DB as last resort.
		if (empty($matches) && class_exists('dd_ontology_db_manager')) {
			try {
				$fuzzy_tipos = dd_ontology_db_manager::search_fuzzy_term(
					$identifier, 'section', false, 5
				);
				if (is_array($fuzzy_tipos) && count($fuzzy_tipos) > 0) {
					foreach ($fuzzy_tipos as $section_tipo) {
						$model = ontology_node::get_model_by_tipo($section_tipo, true);
						if ($model !== 'section') continue;
						$label = self::label_for_tipo($section_tipo, $lang);
						$matches[] = (object)[
							'section_tipo'	=> $section_tipo,
							'label'			=> $label,
						];
					}
				}
			} catch (\Throwable $e) {
				debug_log(__METHOD__ . ' fuzzy search failed: ' . $e->getMessage(), logger::WARNING);
			}

			if (count($matches) === 1) {
				return $matches[0]->section_tipo;
			}
		}

		// Ambiguous or not found.
		if (count($matches) > 1) {
			$result = new stdClass();
			$result->tipos = array_map(function($m) { return $m->section_tipo; }, $matches);
			$result->labels = [];
			foreach ($matches as $m) {
				$result->labels[$m->section_tipo] = $m->label;
			}
			return $result;
		}

		return null;
	}//end resolve_section_tipo



	/**
	 * TRY_RESOLVE
	 * Inner resolution against a single label map. Tries the tipo-shape
	 * shortcut first, then exact label match.
	 * @param object $map
	 * @param string $field
	 * @return object|null
	 */
	private static function try_resolve( object $map, string $field ) : ?object {

		// 1. tipo shortcut
		if (preg_match('/^[a-z]{1,5}[0-9]+$/i', $field) === 1) {
			$tipos = (array)$map->tipos;
			if (isset($tipos[$field])) {
				$label = $tipos[$field];
				return $map->labels->{$label};
			}
		}

		// 2. exact label match
		$labels = (array)$map->labels;
		if (isset($labels[$field])) {
			return $labels[$field];
		}

		// 3. case-insensitive and accent-insensitive match
		// LLMs often change casing (título → Título) or drop accents (titulo → título)
		$field_fold = self::fold_label($field);
		foreach ($labels as $label_key => $label_entry) {
			if (self::fold_label($label_key) === $field_fold) {
				return $label_entry;
			}
		}

		return null;
	}//end try_resolve



	/**
	 * FOLD_LABEL
	 * Normalises a label for case- and accent-insensitive comparison.
	 * Strips Unicode combining marks (accents/diacritics) and lowercases.
	 * @param string $label
	 * @return string
	 */
	private static function fold_label( string $label ) : string {

		// Decompose: é → e + ◌́  then strip combining marks
		$stripped = preg_replace('/\p{M}/u', '', Normalizer::normalize($label, Normalizer::FORM_KD));
		return mb_strtolower($stripped, 'UTF-8');
	}//end fold_label



	/**
	 * NORMALIZE_LINK_VALUE
	 * Converts agent-view link values (ref objects) into Dédalo locator arrays.
	 * Accepts any of:
	 *   - Expanded refs: [{ref, label, section_tipo, section_id}, ...]
	 *   - Dédalo locators: [{section_tipo, section_id}, ...]
	 *   - A single object (wrapped into array)
	 *   - A string ref like "rsc197#7" (parsed into locator)
	 * Always returns an array of {section_tipo, section_id} objects.
	 *
	 * @param mixed $value
	 * @return array
	 */
	public static function normalize_link_value( mixed $value ) : array {

		if (empty($value)) return [];

		if (is_string($value)) {
			$decoded = json_decode($value, true);
			if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
				$value = $decoded;
			}
		}

		if (is_object($value)) {
			$value = [$value];
		}

		// "rsc197#7" string ref
		if (is_string($value) && strpos($value, '#') !== false) {
			$parts = explode('#', $value, 2);
			return [(object)[
				'section_tipo' => $parts[0],
				'section_id'	=> (string)$parts[1]
			]];
		}

		if (!is_array($value)) return [];

		$out = [];
		foreach ($value as $item) {

			if (is_string($item) && strpos($item, '#') !== false) {
				$parts = explode('#', $item, 2);
				$locator = (object)[
					'section_tipo' => $parts[0],
					'section_id'	=> (string)$parts[1]
				];
				$out[] = $locator;
				continue;
			}

			if (!is_object($item) && !is_array($item)) continue;

			$item = (object)$item;

			$st = $item->section_tipo ?? null;
			$sid = $item->section_id ?? null;

			if (empty($st) || $sid === null) continue;

			$locator = (object)[
				'section_tipo'	=> $st,
				'section_id'	=> (string)$sid
			];
			$out[] = $locator;
		}

		return $out;
	}//end normalize_link_value



	/**
	 * LABEL_FOR_TIPO
	 * Resolves the human label of a tipo with Dédalo's standard fallback chain.
	 * Final fallback is the tipo itself so the label is never empty.
	 * @param string $tipo
	 * @param string $lang
	 * @return string
	 */
	public static function label_for_tipo( string $tipo, string $lang ) : string {

		$label = ontology_node::get_term_by_tipo($tipo, $lang, true, true);
		if (!empty($label)) return $label;

		if ($lang !== 'lg-eng') {
			$label = ontology_node::get_term_by_tipo($tipo, 'lg-eng', true, true);
			if (!empty($label)) return $label;
		}
		if ($lang !== 'lg-nolan') {
			$label = ontology_node::get_term_by_tipo($tipo, 'lg-nolan', true, true);
			if (!empty($label)) return $label;
		}

		return $tipo;
	}//end label_for_tipo



	/**
	 * DISAMBIGUATE_LABEL
	 * Applies a deterministic ` (N)` suffix on label collisions, updating
	 * the running counter in `$label_counts`.
	 * @param string $base
	 * @param array $label_counts
	 * @return string
	 */
	private static function disambiguate_label( string $base, array &$label_counts ) : string {

		$count = ($label_counts[$base] ?? 0) + 1;
		$label_counts[$base] = $count;

		return ($count === 1)
			? $base
			: $base . ' (' . $count . ')';
	}//end disambiguate_label



	/**
	 * FIRST_TARGET_SECTION_TIPO
	 * Returns the first target section_tipo for a link/portal component,
	 * or null when not resolvable. Best-effort: many link components don't
	 * expose targets cheaply, so we swallow exceptions and return null.
	 * @param string $model
	 * @param string $tipo
	 * @param string $section_tipo
	 * @return string|null
	 */
	private static function first_target_section_tipo( string $model, string $tipo, string $section_tipo ) : ?string {

		try {
			$component = component_common::get_instance(
				$model,
				$tipo,
				null,
				'list',
				DEDALO_DATA_LANG,
				$section_tipo
			);
			if ($component === null) return null;

			if (method_exists($component, 'get_ar_target_section_tipo')) {
				$targets = $component->get_ar_target_section_tipo();
				if (is_array($targets) && !empty($targets)) {
					return (string)$targets[0];
				}
			}
		} catch (\Throwable $e) {
			// best-effort: no target hint is fine
		}

		return null;
	}//end first_target_section_tipo



	/**
	 * COMPONENT_VALUE
	 * Reads one component's value in agent-view shape.
	 * - link/relation models return `[ {ref, label, section_tipo, section_id}, … ]`
	 * - everything else returns the component's resolved display value (string).
	 * Returns null when the component carries no data.
	 * @param string $model
	 * @param string $tipo
	 * @param int $section_id
	 * @param string $section_tipo
	 * @param string $lang
	 * @return mixed
	 */
	private static function component_value( string $model, string $tipo, int $section_id, string $section_tipo, string $lang ) : mixed {

		try {
			$component = component_common::get_instance(
				$model,
				$tipo,
				$section_id,
				'list',
				$lang,
				$section_tipo
			);
			if ($component === null) return null;

			// Link/relation case → expand locators one hop deep.
			if (in_array($model, self::LINK_MODELS, true)) {
				$dato = $component->get_data();
				if (!is_array($dato) || empty($dato)) return null;

				$out = [];
				foreach ($dato as $locator) {
					if (!is_object($locator)) continue;
					$ref_section_tipo	= $locator->section_tipo ?? null;
					$ref_section_id		= $locator->section_id ?? null;
					if (empty($ref_section_tipo) || $ref_section_id === null) continue;

					$ref_label = self::record_short_label(
						(string)$ref_section_tipo,
						(int)$ref_section_id,
						$lang
					);

					$row = new stdClass();
					$row->ref			= $ref_section_tipo . '#' . $ref_section_id;
					$row->label			= $ref_label;
					$row->section_tipo	= $ref_section_tipo;
					$row->section_id	= (int)$ref_section_id;
					$out[] = $row;
				}
				return $out;
			}

			// Scalar case
			$value = $component->get_value();
			if ($value === null || $value === '') return null;

			return $value;

		} catch (\Throwable $e) {
			debug_log(__METHOD__
				. ' Error reading component value' . PHP_EOL
				. ' model: ' . $model . PHP_EOL
				. ' tipo: ' . $tipo . PHP_EOL
				. ' section_tipo: ' . $section_tipo . PHP_EOL
				. ' section_id: ' . $section_id . PHP_EOL
				. ' err: ' . $e->getMessage()
				, logger::WARNING
			);
			return null;
		}
	}//end component_value



	/**
	 * RECORD_SHORT_LABEL
	 * Best-effort one-line label for a referenced record. Currently falls
	 * back to "{section_label}#{section_id}". A future iteration can call
	 * the section's "main" component (component_input_text marked as title)
	 * for nicer summaries.
	 * @param string $section_tipo
	 * @param int $section_id
	 * @param string $lang
	 * @return string
	 */
	private static function record_short_label( string $section_tipo, int $section_id, string $lang ) : string {

		$section_label = self::label_for_tipo($section_tipo, $lang);
		return $section_label . '#' . $section_id;
	}//end record_short_label



}//end class agent_view_builder
