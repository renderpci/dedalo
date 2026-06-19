<?php
/**
 * CLASS TOOL_TR_PRINT
 * Print-output tool for interview transcription sections.
 *
 * Responsibilities:
 * - Parse the raw transcription text stored in a component_text_area (typically
 *   rsc36), splitting it at timecode tags to produce an ordered array of
 *   {timecode, fragment, descriptors} value objects.
 * - Generate pseudo-VTT subtitle text from those value objects by pairing each
 *   timecode interval with the following interval's start, and applying the
 *   browser-safe HTML normalisation defined in clean_vtt_text().
 * - Assemble a structured print-data object (get_tr_data) that collects the
 *   interview ID, source language, recording date, municipality, reference code,
 *   posterframe URL, and associated informants for use by the JS print renderer.
 * - Provide three text variants for the raw transcription body:
 *     get_raw_text()      — verbatim value from the component's data column
 *     get_source_text()   — HTML-entity-encoded safe version
 *     get_original_text() — text with `add_tag_img_on_the_fly` markup expansion
 *
 * Relationships:
 * - Extends tool_common, which provides the tool registry, API_ACTIONS contract,
 *   and the get_json / get_structure_context browser context pipeline.
 * - Operates on a component_text_area instance stored in $component_obj; callers
 *   must set this property before calling any instance method.
 * - Delegates tag parsing to the abstract TR utility class (shared/class.TR.php).
 * - Delegates subtitle HTML normalisation to the subtitles utility class.
 * - Delegates timecode arithmetic to OptimizeTC::seg2tc().
 * - The AV duration lookup traverses the ontology to find the component_av that
 *   accompanies the transcription (get_related_component_av_tipo → rsc35).
 * - Interview/informant data is resolved by walking inverse references from the
 *   transcription's parent section back through oh1 (interview section) to
 *   oh24 (informants portal) and into rsc85/rsc86 (name/surname components).
 *
 * API surface: no remotely callable actions (API_ACTIONS = []). All public
 * methods are intended to be called from the JS-facing controller, not through
 * the dd_tools_api request pipeline.
 *
 * @package Dédalo
 * @subpackage Tools
 */
class tool_tr_print extends tool_common {



	/**
	* SEC-024 (§9.2): No remotely callable methods. The static helpers
	* (build_pseudo_vtt, clean_vtt_text, format_text_for_tool) are internal
	* utilities with non-rqo signatures and must not be exposed via
	* `dd_tools_api::tool_request`.
	*/
	public const API_ACTIONS = [];



	/**
	 * Component instance this tool operates on — typically a component_text_area
	 * instance for the transcription tipo (e.g. rsc36). Must be set by the caller
	 * before invoking any instance method on this class, since the constructor
	 * inherited from tool_common does not accept or assign a component object.
	 * @var object $component_obj
	 */
	protected $component_obj;



	/**
	* GET_AR_TC_TEXT
	* Splits a transcription text into an ordered map of timecode → value objects.
	*
	* The raw transcription text may contain:
	*   - Timecode tags of the form [TC_HH:MM:SS.mmm_TC] (produced by component_text_area).
	*   - Inline descriptor/index tags such as [index-a-123-label-data:...:data].
	*   - Arbitrary HTML markup.
	*
	* Algorithm:
	*   1. Fetch the current-language value via get_data_lang(); use the first item's
	*      'value' key (same shape as component_text_area data column items).
	*   2. Split the text at timecode tags using preg_split with PREG_SPLIT_DELIM_CAPTURE
	*      so the delimiters (the timecode tags themselves) are kept in the result array.
	*   3. If the first fragment is not itself a timecode, prepend a synthetic
	*      [TC_00:00:00.000_TC] so every fragment has an associated opening timecode.
	*   4. Remove consecutive duplicate timecode entries (edge case: two TC tags with
	*      no text between them) to keep the resulting array well-formed.
	*   5. Walk even-indexed fragments (timecodes) paired with odd-indexed fragments
	*      (transcript text), extract descriptors in 'index' mode, and build a
	*      stdClass value object for each pair.
	*
	* Result shape of each entry in $response->result:
	*   {
	*     tc           => string|null  — timecode value e.g. '00:01:25.091' (captured from the TC tag)
	*     fragment     => string       — raw HTML text following that timecode
	*     descriptors  => string[]     — flat list of descriptor labels extracted from the fragment
	*     descriptors_struct => mixed  — structured descriptor form (may be empty; see get_descriptors)
	*   }
	*
	* The result is keyed by the full TC tag string (e.g. '[TC_00:01:25.091_TC]') to
	* allow fast lookup by tag. Callers that need ordered iteration should use
	* array_values() on the result.
	*
	* (!) $request_options is accepted for API compatibility but none of its keys are
	* read; all configuration comes from $this->component_obj at call time.
	*
	* @param object $request_options Options object (currently unused; accepted for interface compatibility).
	* @return object stdClass with:
	*   - result (bool|array) — false on early failure, or the keyed value-object array
	*   - msg   (string)      — human-readable failure reason when result is false
	*/
	public function get_ar_tc_text( $request_options ) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';

		$options = new stdClass();
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		# Source text
		$data = $this->component_obj->get_data_lang();
		$raw_text = $data[0]->value ?? '';

		# Get all timecodes
		#$pattern = TR::get_mark_pattern($mark='tc',$standalone=false);
		# Search math pattern tags
		#preg_match_all($pattern,  $raw_text,  $matches_tc, PREG_PATTERN_ORDER);
			#dump($matches_tc,"matches_tc ".to_string($pattern));


		# explode by tc pattern
		$pattern_tc   = TR::get_mark_pattern('tc_full',$standalone=true);
		#$pattern_tc  = "/(\[TC_[0-9][0-9]:[0-9][0-9]:[0-9][0-9]\.[0-9]{1,3}_TC\])/";
		$ar_fragments = preg_split($pattern_tc, $raw_text, -1, PREG_SPLIT_NO_EMPTY | PREG_SPLIT_DELIM_CAPTURE);

			if (!isset($ar_fragments[0])) {
				$response->msg = 'No fragments are found';
				return $response;
			}

			# First element. Test if is time code
			# If not, add 00 time code
			preg_match($pattern_tc, $ar_fragments[0], $matches);
				#dump($matches, ' matches ++ '.to_string());
			if (empty($matches)) {
				$tc_init = '[TC_00:00:00.000_TC]';
				array_unshift($ar_fragments, $tc_init);
			}
			#dump($ar_fragments, ' ar_fragments 2 ++ '.to_string());

			# Fix consecutive tc case
			foreach ($ar_fragments as $key => $value) {
				if ( $key>0 && strpos($value, '[TC_')!==false && isset($ar_fragments[$key-1]) && strpos($ar_fragments[$key-1], '[TC_')!==false ) {
					// Remove second tc appearance
					unset($ar_fragments[$key]);
				}
			}
			$ar_fragments = array_values($ar_fragments);


		$ar_final = array();
		$pattern  = TR::get_mark_pattern($mark='tc',$standalone=false);
		foreach ($ar_fragments as $key => $value) {
			if ($key % 2 == 0) {
				# It's even
				if (isset($ar_fragments[$key+1])) {
					$tc_tag 	= $value;
					$fragment 	= $ar_fragments[$key+1];

					# tc
					preg_match($pattern, $tc_tag, $matches);
					$tc = isset($matches[1]) ? $matches[1] : null;

					# Descriptors
					$descriptors = $this->get_descriptors($fragment, 'index');

					# Descriptors structure
					$descriptors_struct = $this->get_descriptors($fragment, 'struct');

					$value_obj = new stdClass();
						$value_obj->tc 		 			= $tc;
						$value_obj->fragment 			= $fragment;
						$value_obj->descriptors 		= $descriptors;
						$value_obj->descriptors_struct 	= $descriptors_struct;

					$ar_final[$tc_tag] = $value_obj;
				}
			}
		}//foreach ($ar_fragments as $key => $value)

		if(SHOW_DEBUG===true) {
			#dump($ar_final, ' $ar_final ++ '.to_string()); die();
		}

		#$response->result = self::format_text_for_tool( $raw_text );
		$response->result = true;
		$response->result = $ar_final;

		return (object)$response;
	}//end get_ar_tc_text



	/**
	* BUILD_PSEUDO_VTT
	* Assembles a pseudo-VTT subtitle string from the ordered timecode–fragment map
	* produced by get_ar_tc_text().
	*
	* Output format follows the WebVTT spec structurally (WEBVTT header, cue
	* number, start --> end, cue payload) but the cue text is only partially
	* normalised (clean_vtt_text strips proprietary tags and maps HTML entities);
	* it is not guaranteed to be fully spec-compliant for all browsers.
	*
	* The end timecode of each cue is the start of the next cue. The last cue
	* uses $duration as its end time, so $duration must be provided as the
	* HH:MM:SS.mmm string returned by get_av_duration() / OptimizeTC::seg2tc().
	*
	* The --> separator is passed through htmlentities() — this is a pre-existing
	* quirk of the implementation; the output is intended for further processing
	* rather than direct browser consumption.
	*
	* (!) Flagged: the htmlentities(' --> ') call encodes the space
	* and arrow into HTML entities, which is non-standard for WebVTT and may
	* break direct use as a .vtt file. Documented here; not changed.
	*
	* @param array $ar_tc_text Ordered map as produced by get_ar_tc_text()::result.
	*   Values are stdClass objects with at least 'tc' (string) and 'fragment' (string).
	* @param string $duration AV duration timecode string e.g. '00:01:55.680'.
	*   Used as the end-time for the last cue.
	* @return string The assembled pseudo-VTT text, or an empty string when $ar_tc_text is empty.
	*/
	public static function build_pseudo_vtt( $ar_tc_text, $duration ) {
		$vtt_text = '';

		if (empty($ar_tc_text)) {
			return $vtt_text;
		}

		$ar_lines = [];

		// Remove array keys
		$ar_tc_base = array_values($ar_tc_text);

		foreach ($ar_tc_base as $key => $obj_value) {

			$current_tc = $obj_value->tc;
			$next_tc 	= isset($ar_tc_base[$key+1]) ? $ar_tc_base[$key+1]->tc : $duration;
			$text 		= tool_tr_print::clean_vtt_text($obj_value->fragment);

			$ar_lines[] =  $key+1 .PHP_EOL . $current_tc . ' --> ' . $next_tc . PHP_EOL . $text . PHP_EOL;
		}

		$vtt_text = 'WEBVTT' . PHP_EOL . PHP_EOL . implode(PHP_EOL, $ar_lines);


		return $vtt_text;
	}//end build_pseudo_vtt



	/**
	* GET_AV_DURATION
	* Returns the total duration of the audio/video media linked to the transcription
	* component, formatted as a timecode string (HH:MM:SS.mmm).
	*
	* Resolution chain:
	*   1. Calls get_related_component_av_tipo() on $component_obj to discover the
	*      component tipo for the companion AV component (typically rsc35).
	*   2. Resolves the class name from the ontology via ontology_node::get_model_by_tipo().
	*   3. Instantiates the component_av via component_common::get_instance() in 'list'
	*      mode on DEDALO_DATA_NOLAN so no language filtering occurs.
	*   4. Calls get_duration() (returns float seconds) and converts with
	*      OptimizeTC::seg2tc() to the HH:MM:SS.mmm string expected by build_pseudo_vtt().
	*
	* The comment '# Actually rsc35' documents the typical real-world tipo at the time
	* of writing; the actual tipo is resolved dynamically from the ontology.
	*
	* @return string Timecode string e.g. '00:01:55.680', or whatever OptimizeTC::seg2tc()
	*   returns for the AV component's duration in seconds.
	*/
	public function get_av_duration() {

		# Actually rsc35
		$related_component_av_tipo = $this->component_obj->get_related_component_av_tipo();

		$model_name		= ontology_node::get_model_by_tipo($related_component_av_tipo,true);
		$parent			= $this->component_obj->get_parent();
		$section_tipo	= $this->component_obj->get_section_tipo();
		$component_av	= component_common::get_instance(
			$model_name,
			$related_component_av_tipo,
			$parent,
			'list',
			DEDALO_DATA_NOLAN,
			$section_tipo
		);

		$duration_seconds	= $component_av->get_duration();
		$tc					= OptimizeTC::seg2tc($duration_seconds);
		$av_duration		= $tc;


		return $av_duration;
	}//end get_av_duration



	/**
	* CLEAN_VTT_TEXT
	* Normalises a raw transcription HTML fragment to a safe, subtitle-compatible
	* string suitable for inclusion as a VTT cue payload.
	*
	* Transformations applied in order:
	*   1. html_entity_decode — converts entities (e.g. &amp;) back to plain characters.
	*      The Spanish comment 'Traducciones mal formadas provinientes de Babel' means
	*      "malformed translations coming from Babel" — these arrive double-encoded.
	*   2. strip_tags — removes all tags except <br>, <strong>, <em> to sanitise
	*      content while preserving basic inline formatting.
	*   3. <br>/<br /> → newline character.
	*   4. <strong>/<em> → <b>/<i> (WebVTT cue payload uses the shorter forms).
	*   5. &nbsp; → single space.
	*   6. Double spaces and double newlines are collapsed (run twice to handle nested cases).
	*   7. The pattern "\n</b>" is replaced with "<b>" — this appears to be a legacy
	*      clean-up for a specific malformed output from Babel transcriptions.
	*      (!) Flagged: the replacement target starts with a newline and </b> but the
	*      replacement is an opening <b>. This effectively discards the newline and
	*      flips the closing tag to an opening tag, which may be a latent bug in
	*      the original code. Not changed.
	*   8. TR::deleteMarks — strips all remaining proprietary Dédalo tag markup
	*      (timecodes, index markers, etc.) from the text.
	*   9. A leading colon optionally followed by a single space is stripped (pattern "^:[ ]?").
	*  10. subtitles::revise_tag_in_line — ensures <b> and <i> tags are properly closed
	*      within each subtitle line.
	*  11. trim — removes surrounding whitespace.
	*
	* @param string $text Raw HTML fragment from a transcription timecode segment.
	* @return string Cleaned, subtitle-safe text ready for VTT cue payload.
	*/
	public static function clean_vtt_text($text) {

		#$text = subtitles::clean_text_for_subtitles($text);

		# CONVERT ENCODING (malformed translations coming from Babel)
		$text = html_entity_decode($text);

		$text	= strip_tags($text, '<br><strong><em>');

		$text = str_replace(['<br />','<br>'], "\n", $text);
		$text = str_replace('<strong>', '<b>', $text);
		$text = str_replace('</strong>', '</b>', $text);
		$text = str_replace('<em>', '<i>', $text);
		$text = str_replace('</em>', '</i>', $text);
		$text = str_replace(['&nbsp;'], [' '], $text);
		$text = str_replace(['  ',"\n\n"], [' ',"\n"], $text);
		$text = str_replace(['  ',"\n\n"], [' ',"\n"], $text);
		$text = str_replace(["\n</b>"], ['<b>'], $text);

		$text = TR::deleteMarks($text);

		$text = preg_replace("/^:[ ]?/", "", $text);

		$text = subtitles::revise_tag_in_line($text,'b');
		$text = subtitles::revise_tag_in_line($text,'i');

		$text = trim($text);

		return $text;
	}//end clean_vtt_text



	/**
	* GET_DESCRIPTORS
	* Extracts the human-readable labels of all descriptor tags of the given type
	* found within a single timecode fragment.
	*
	* Tag type validation:
	*   Only types listed in TR::$tag_types are accepted ('tc', 'index', 'reference',
	*   'svg', 'draw', 'geo', 'page', 'person', 'note', 'lang'). The type 'struct'
	*   used by the caller for $descriptors_struct is intentionally NOT in that list,
	*   so those calls return an empty array without error — this is by design.
	*
	* For the 'index' type the tag pattern captures up to six groups; group 5 is
	* the human-readable label portion (the text between the second '-' and '-data:'):
	*   \[/{0,1}(index)-([a-z])-([0-9]{1,6})(-([^-]{0,22})-data:(.*?):data)?\]
	*   group 1 = 'index', 2 = state letter, 3 = numeric ID, 4 = full suffix,
	*   5 = label (up to 22 chars), 6 = data payload.
	*
	* @param string $fragment Raw HTML text of a single timecode segment.
	* @param string $type Tag type to extract; must be one of TR::$tag_types.
	*   Passing 'struct' or any other unrecognised value returns [].
	* @return array Flat string array of non-empty label values found in the fragment.
	*/
	public function get_descriptors( $fragment, $type ) {

		$descriptors = array();

		// Check valid types in TR class
		if (!in_array($type, TR::$tag_types)) {
			// 'struct' or other legacy types are ignored to avoid errors
			return $descriptors;
		}

		$ar_tags = TR::get_tags_of_type_in_text($fragment, [$type]);

		foreach($ar_tags as $tag_info) {
			$tag = $tag_info->tag;
			// Parse tag to get label
			// For 'index' pattern: \[/{0,1}(index)-([a-z])-([0-9]{1,6})(-([^-]{0,22})-data:(.*?):data)?\]
			// Group 5 is the label
			$pattern = TR::get_mark_pattern($type, false);
			if (preg_match("/$pattern/", $tag, $matches)) {
				$label = $matches[5] ?? '';
				if (!empty($label)) {
					$descriptors[] = $label;
				}
			}
		}

		return $descriptors;
	}//end get_descriptors



	/**
	* GET_RAW_TEXT
	* Returns the verbatim transcription value from the component's current-language
	* data column, without any transformation.
	*
	* Reads via get_data_lang() which filters the data array to the component's
	* active language, then takes the first item's 'value' key — the standard
	* shape for component_text_area rows ({id, lang, value}).
	*
	* Returns an empty string when the component has no data for the current language.
	*
	* @return string Raw transcription HTML string, or '' when no data is present.
	*/
	public function get_raw_text() : string {

		$data = $this->component_obj->get_data_lang();

		$raw_text = $data[0]->value ?? '';

		return $raw_text;
	}//end get_raw_text



	/**
	* GET_ORIGINAL_TEXT
	* Returns the transcription text with on-the-fly tag-to-image markup expansion
	* applied via TR::add_tag_img_on_the_fly().
	*
	* This is used by the print view to render inline index/descriptor tags as
	* HTML <img> elements so that the printed page shows visual descriptors rather
	* than raw tag syntax.
	*
	* The @return type annotation is declared as string but the doc-block was left
	* blank in the original. The actual return type is string (guaranteed by the
	* string return type of format_text_for_tool / add_tag_img_on_the_fly).
	*
	* @return string Transcription HTML with tag markup expanded to <img> elements.
	*/
	public function get_original_text() : string {

		$data = $this->component_obj->get_data_lang();
		$raw_text = $data[0]->value ?? '';

		$raw_text = self::format_text_for_tool( $raw_text );

		return $raw_text;
	}//end get_original_text



	/**
	* GET_SOURCE_TEXT
	* Returns the raw transcription value with all characters HTML-entity-encoded
	* via htmlentities(), making the output safe for embedding in an HTML attribute
	* or injecting into contexts that require escaped entities.
	*
	* This variant is typically used when the print renderer needs to pass the
	* transcript as a plain-text source to a JavaScript template without risk of
	* breaking the surrounding HTML structure.
	*
	* (!) Unlike get_raw_text() this method does not specify a return type hint;
	* the actual return type is string (htmlentities always returns string).
	*
	* @return string HTML-entity-encoded transcription string.
	*/
	public function get_source_text() {

		$data = $this->component_obj->get_data_lang();
		$raw_text = $data[0]->value ?? '';

		$raw_text = htmlentities($raw_text);

		return $raw_text;
	}//end get_source_text



	/**
	* FORMAT_TEXT_FOR_TOOL
	* Static helper that expands proprietary Dédalo transcription tag markup
	* into browser-renderable <img> HTML using TR::add_tag_img_on_the_fly().
	*
	* Wraps the TR utility to give tool_tr_print a stable internal API: if the
	* expansion strategy ever changes, only this method needs updating.
	*
	* Called by get_original_text() for the expanded print view.
	*
	* @param string $raw_text Raw transcription HTML with Dédalo tag markup.
	* @return string Text with tags replaced by their <img> HTML equivalents.
	*/
	public static function format_text_for_tool( $raw_text ) {
		$raw_text = TR::add_tag_img_on_the_fly($raw_text);

		return $raw_text;
	}//end format_text_for_tool



	/**
	* GET_TR_DATA
	* Assembles a structured data object summarising the transcription record and its
	* associated interview metadata for consumption by the print renderer.
	*
	* The method reads a fixed set of well-known component tipos from the parent
	* section (the transcription section, e.g. rsc167) and from the related interview
	* section (oh1). All components are fetched in 'edit' mode so their full data
	* is available regardless of diffusion state.
	*
	* Returned object shape:
	* {
	*   ID           : string|int     — section_id of the parent section
	*   source_lang  : mixed          — value from component_select_lang if present,
	*                                   else DEDALO_DATA_LANG constant
	*   date         : string|null    — formatted recording date (d-m-Y) from rsc44,
	*                                   or null when no date data exists
	*   municipality : mixed          — resolved thesaurus label from rsc46 (component_autocomplete_ts)
	*   code         : mixed          — identifier value from rsc21 (component_autocomplete_ts)
	*   posterframe  : string         — relative posterframe URL from rsc35 (component_av),
	*                                   with $test_file=true so a missing file returns ''
	*   interview    : array          — result of get_interview_data(); zero or more
	*                                   interview stdClass objects
	* }
	*
	* Component tipos used (all resolved dynamically via ontology_node::get_model_by_tipo):
	*   rsc44 — recording date (component_date)
	*   rsc46 — municipality (component_autocomplete_ts)
	*   rsc21 — reference code (component_autocomplete_ts)
	*   rsc35 — AV media (component_av)
	*
	* The source_lang lookup uses common::get_ar_related_by_model('component_select_lang',
	* $tipo) to discover whether a language selector component is associated with
	* the transcription component tipo in the current ontology.
	*
	* @return object stdClass with the fields described above.
	*/
	public function get_tr_data() {

		$tr_data = new stdClass();

		$tipo 		  = $this->component_obj->get_tipo();
		$parent 	  = $this->component_obj->get_parent();
		$section_tipo = $this->component_obj->get_section_tipo();
		$lang 		  = $this->component_obj->get_lang();


		# ID
			$tr_data->ID = $parent;

		# source lang
			$model_name = 'component_select_lang';
			$ar_related = common::get_ar_related_by_model( $model_name, $tipo );
			if (isset($ar_related[0])) {
				$component_select_lang = $ar_related[0];
				$component = component_common::get_instance(
					$model_name,
					$component_select_lang,
					$parent,
					'edit',
					$lang,
					$section_tipo
				);
				$value = $component->get_value();
				$tr_data->source_lang = $value;
			}else{
				$tr_data->source_lang = DEDALO_DATA_LANG;
			}

		# date
			$current_tipo	= 'rsc44';
			$model_name		= ontology_node::get_model_by_tipo($current_tipo, true); // 'component_date';
			$component		= component_common::get_instance(
				$model_name,
				$current_tipo,
				$parent,
				'edit',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$data    = $component->get_data();
			$value 	 = null;
			if (!empty($data[0])) {
				$dd_date = new dd_date($data[0]);
				$value   = $dd_date->get_dd_timestamp($date_format="d-m-Y");
			}
			$tr_data->date = $value;

		# municipality
			$current_tipo	= 'rsc46';
			$model_name		= ontology_node::get_model_by_tipo($current_tipo, true); // component_autocomplete_ts
			$component		= component_common::get_instance(
				$model_name,
				$current_tipo,
				$parent,
				'edit',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$value = $component->get_value();
			$tr_data->municipality = $value;

		# code
			$current_tipo	= 'rsc21';
			$model_name		= ontology_node::get_model_by_tipo($current_tipo, true); // component_autocomplete_ts
			$component		= component_common::get_instance(
				$model_name,
				$current_tipo,
				$parent,
				'edit',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$value = $component->get_value();
			$tr_data->code = $value;

		# posterframe
			$current_tipo	= 'rsc35';
			$model_name		= ontology_node::get_model_by_tipo($current_tipo, true); // component_autocomplete_ts
			$component		= component_common::get_instance(
				$model_name,
				$current_tipo,
				$parent,
				'edit',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$value = $component->get_posterframe_url($test_file=true, $absolute=false);
			$tr_data->posterframe = $value;

		# interview
			$tr_data->interview = $this->get_interview_data();


		return (object)$tr_data;
	}//end get_tr_data



	/**
	* GET_INTERVIEW_DATA
	* Resolves the interview sections (oh1) that reference the parent transcription
	* section via inverse locator references, and returns an array of interview
	* objects with their associated informant data.
	*
	* The transcription parent section may be referenced by zero or more oh1
	* (interview) sections. This method uses section::get_inverse_references() to
	* discover those back-references, then filters to section_tipo === 'oh1' and
	* for each match fetches the informants portal (oh24 → component_portal) whose
	* data items are arrays of locators pointing to person sections.
	*
	* Returned array item shape:
	* {
	*   ID         : string|int  — section_id of the oh1 interview section
	*   informants : string[]    — array of "name surname" strings from get_informants_data()
	* }
	*
	* When no oh1 inverse references exist (e.g. the transcription section is not
	* yet linked to an interview), the returned array is empty.
	*
	* @return array Array of stdClass interview objects; may be empty.
	*/
	public function get_interview_data() {

		$tipo 		  = $this->component_obj->get_tipo();
		$parent 	  = $this->component_obj->get_parent();
		$section_tipo = $this->component_obj->get_section_tipo();
		$lang 		  = $this->component_obj->get_lang();

		$section = section::get_instance($parent, $section_tipo);
		$inverse_locators = $section->get_inverse_references();

		$ar_interviews = [];
		foreach ($inverse_locators as $current_locator) {

			$current_section_tipo = $current_locator->from_section_tipo;
			$current_section_id   = $current_locator->from_section_id;

			if ($current_section_tipo==='oh1') {

				# Informants
					$current_tipo	= 'oh24';
					$model_name		= ontology_node::get_model_by_tipo($current_tipo, true); // component_portal
					$component		= component_common::get_instance(
						$model_name,
						$current_tipo,
						$current_section_id,
						'edit',
						DEDALO_DATA_NOLAN,
						$current_section_tipo
					);
					$data = $component->get_data();
					$informants = $this->get_informants_data( $data );

				# interview
				$interview = new stdClass();
					$interview->ID 		   = $current_section_id;
					$interview->informants = $informants;

				$ar_interviews[] = $interview;
			}
		}

		return (array)$ar_interviews;
	}//end get_interview_data



	/**
	* GET_INFORMANTS_DATA
	* Resolves a list of locators (from a component_portal data array) to an array
	* of full "name surname" strings for the informants linked to an interview.
	*
	* Each $ar_locators item is a locator object with at least:
	*   - section_id   (string|int) — ID of the person section
	*   - section_tipo (string)     — tipo of the person section (e.g. rsc or equivalent)
	*
	* For each locator the method fetches:
	*   rsc85 (component_input_text) — first name
	*   rsc86 (component_input_text) — surname
	*
	* Both components are instantiated in 'edit' mode on DEDALO_DATA_NOLAN since
	* names are language-neutral (stored without a lang key). The two values are
	* concatenated as "name surname" and appended to the result array.
	*
	* @param array $ar_locators Array of locator objects from a component_portal's get_data() result.
	* @return array Flat string array of "name surname" entries, one per locator.
	*/
	public function get_informants_data( $ar_locators ) {

		$informants_data = array();

		foreach ($ar_locators as $current_locator) {

			# name
				$current_tipo	= 'rsc85';
				$model_name		= ontology_node::get_model_by_tipo($current_tipo, true); // component_input_text
				$component		= component_common::get_instance(
					$model_name,
					$current_tipo,
					$current_locator->section_id,
					'edit',
					DEDALO_DATA_NOLAN,
					$current_locator->section_tipo
				);
				$name = $component->get_value();

			# surname
				$current_tipo	= 'rsc86';
				$model_name		= ontology_node::get_model_by_tipo($current_tipo, true); // component_input_text
				$component		= component_common::get_instance(
					$model_name,
					$current_tipo,
					$current_locator->section_id,
					'edit',
					DEDALO_DATA_NOLAN,
					$current_locator->section_tipo
				);
				$surname = $component->get_value();


			$informants_data[] = "$name $surname";
		}

		return (array)$informants_data;
	}//end get_informants_data



}//end tool_tr_print
