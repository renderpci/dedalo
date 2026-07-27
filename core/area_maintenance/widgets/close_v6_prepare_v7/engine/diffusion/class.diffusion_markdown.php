<?php declare(strict_types=1);
/**
* CLASS DIFFUSION_MARKDOWN
* Manages publication on Markdown format.
* v7 flow: dd_diffusion_api::diffuse resolves the records through the standard
* datum path (process_datum + cross-section levels) and then renders each
* datum record to ONE deterministic Markdown file per record:
* {section_tipo}_{section_id}.md inside /markdown/{service_name}/.
* The file name is shared with delete_record_file (delete propagation).
*
* Unlike RDF/XML this class is a pure renderer + file IO: it consumes the
* already-resolved datum (context + grouped fields) built by dd_diffusion_api,
* so the curated ddo_map, alias handling, publication gate and levels-based
* relation resolution are reused as-is. The goal is a human/AI-readable
* document: a section-name header, YAML frontmatter and one "## label" block
* per field. Relation fields show the flattened value AND a link to the
* related record's own .md (published through the same levels budget).
*/
class diffusion_markdown {



	// saved_files. Array of strings as ['/path/file1.md','/path/file2.md']
	public static array $saved_files = [];

	// request-scoped cache: section_tipo => resolved section name (cleared by reset_cache)
	private static array $section_name_cache = [];



	/**
	* RESET_CACHE
	* Clears the request-scoped static caches. Call at request boundaries and
	* between iterations of long-running CLI processes.
	* Note: $saved_files is NOT reset here (per-process accumulation, mirrors
	* diffusion_xml), only the resolution cache.
	* @return void
	*/
	public static function reset_cache() : void {

		self::$section_name_cache = [];
	}//end reset_cache



	/**
	* GET_RECORD_FILE_PATH
	* Resolves the canonical (deterministic) published Markdown file path of a
	* record: {section_tipo}_{section_id}.md inside /markdown/{service_name}/.
	* Single source of truth shared by publish (save_record) and delete
	* (delete_record_file) so re-publishing always overwrites the same file and
	* deleting always targets it.
	* @param string $diffusion_element_tipo Alias or real element tipo
	* @param string $section_tipo
	* @param string|int $section_id
	* @return object|null {service_name, sub_path, file_name, file_path, file_url}
	* 	Null when properties->diffusion->service_name is not defined
	* 	(run the 'validate' API action to locate unconfigured elements)
	*/
	public static function get_record_file_path( string $diffusion_element_tipo, string $section_tipo, string|int $section_id ) : ?object {

		// service_name from element properties (alias contract applied)
		$resolved		= diffusion_utils::resolve_node_with_alias($diffusion_element_tipo);
		$service_name	= $resolved->properties->diffusion->service_name ?? null;
		if (empty($service_name)) {
			debug_log(__METHOD__
				. " Unable to resolve service_name from diffusion_element properties" . PHP_EOL
				. ' diffusion_element_tipo: ' . $diffusion_element_tipo
				, logger::ERROR
			);
			return null;
		}

		$file_name	= $section_tipo .'_'. $section_id .'.md';
		$sub_path	= '/markdown/' . $service_name . '/';

		$file_info = new stdClass();
			$file_info->service_name	= $service_name;
			$file_info->sub_path		= $sub_path;
			$file_info->file_name		= $file_name;
			$file_info->file_path		= DEDALO_MEDIA_PATH . $sub_path . $file_name;
			$file_info->file_url		= DEDALO_MEDIA_URL  . $sub_path . $file_name;


		return $file_info;
	}//end get_record_file_path



	/**
	* DELETE_RECORD_FILE
	* Removes the published Markdown file of a record: the canonical
	* deterministic file plus any legacy variants ({base}_*.md). Missing files =
	* idempotent success.
	* @param string $diffusion_element_tipo
	* @param string $section_tipo
	* @param string|int $section_id
	* @return object {result: bool, msg: string, file_path: string|null, deleted_files: array}
	*/
	public static function delete_record_file( string $diffusion_element_tipo, string $section_tipo, string|int $section_id ) : object {

		$response = new stdClass();
			$response->result			= false;
			$response->msg				= '';
			$response->file_path		= null;
			$response->deleted_files	= [];

		$file_info = self::get_record_file_path($diffusion_element_tipo, $section_tipo, $section_id);
		if ($file_info===null) {
			$response->msg = "Markdown delete: unable to resolve file path for element '$diffusion_element_tipo', section $section_tipo $section_id";
			return $response;
		}
		$response->file_path = $file_info->file_path;

		// canonical file + legacy variants (incl. legacy flat /markdown/ dir)
			$base_name	= pathinfo($file_info->file_name, PATHINFO_FILENAME);
			$to_unlink	= [];
			if (file_exists($file_info->file_path)) {
				$to_unlink[] = $file_info->file_path;
			}
			foreach ([dirname($file_info->file_path), DEDALO_MEDIA_PATH . '/markdown'] as $dir) {
				if (is_dir($dir)) {
					$to_unlink = array_merge($to_unlink, glob($dir .'/'. $base_name .'_*.md') ?: []);
				}
			}
			$to_unlink = array_unique($to_unlink);

		if (empty($to_unlink)) {
			// nothing published (or already removed): idempotent success
			$response->result	= true;
			$response->msg		= 'Markdown delete: no file found (already removed)';
			return $response;
		}

		$all_ok = true;
		foreach ($to_unlink as $file_path) {
			if (unlink($file_path)) {
				$response->deleted_files[] = $file_path;
			}else{
				$all_ok = false;
				$response->msg = "Markdown delete: failed to unlink file '$file_path' (check permissions)";
				debug_log(__METHOD__ .' '. $response->msg, logger::ERROR);
			}
		}

		$response->result = $all_ok;
		if ($all_ok) {
			$response->msg = 'Markdown delete: removed '. count($response->deleted_files) .' file(s)';
		}


		return $response;
	}//end delete_record_file



	/**
	* SAVE_RECORD
	* Writes one Markdown file per record using the deterministic path.
	* @param string $diffusion_element_tipo
	* @param string $section_tipo
	* @param string|int $section_id
	* @param string $markdown
	* @return object {result: bool, msg: string, errors: array, file_path: string|null, file_url: string|null}
	*/
	public static function save_record( string $diffusion_element_tipo, string $section_tipo, string|int $section_id, string $markdown ) : object {

		$response = new stdClass();
			$response->result		= false;
			$response->msg			= 'Error. Request failed';
			$response->errors		= [];
			$response->file_path	= null;
			$response->file_url		= null;

		$file_info = self::get_record_file_path($diffusion_element_tipo, $section_tipo, $section_id);
		if ($file_info===null) {
			$response->errors[]	= 'unable to resolve Markdown file path (check properties->diffusion->service_name of the element)';
			$response->msg		= 'Error resolving Markdown file path';
			return $response;
		}

		$base_path = dirname($file_info->file_path);
		if (!create_directory($base_path)) {
			$response->errors[]	= 'unable to access/create the target directory: ' . $base_path;
			$response->msg		= 'Error accessing target directory: ' . $base_path;
			return $response;
		}

		// Return the number of bytes written, or false on failure.
		$result = file_put_contents($file_info->file_path, $markdown);
		if ($result === false) {
			$response->errors[]	= 'failed to write Markdown file: ' . $file_info->file_path;
			$response->msg		= 'Error saving Markdown file';
			debug_log(__METHOD__
				. " Failed to save file " . PHP_EOL
				. ' file_path: ' . to_string($file_info->file_path)
				, logger::ERROR
			);
			return $response;
		}

		// per-process accumulation
		self::$saved_files[] = $file_info->file_path;

		$response->result		= true;
		$response->msg			= 'OK. Request done successfully';
		$response->file_path	= $file_info->file_path;
		$response->file_url		= $file_info->file_url;

		debug_log(__METHOD__
			. " Saved Markdown file to " . PHP_EOL
			. ' file_path: ' . to_string($file_info->file_path)
			, logger::DEBUG
		);


		return $response;
	}//end save_record



	/**
	* RENDER_RECORD
	* Renders one resolved datum record into a Markdown document.
	* Consumes the grouped 'fields' structure built by dd_diffusion_api::process_datum
	* (record->fields keyed by field-node tipo, each an array of field_group objects
	* with entries[], lang and, for relations, section_tipo/section_id).
	*
	* @param object $options {
	* 	section_tipo: string,
	* 	section_id: string|int,
	* 	context: array,                 // datum context field definitions ({term, tipo, model, ...})
	* 	fields: object,                 // datum record fields keyed by field-node tipo
	* 	diffusion_element_tipo: string
	* }
	* @return string Markdown document
	*/
	public static function render_record( object $options ) : string {

		$section_tipo	= $options->section_tipo;
		$section_id		= $options->section_id;
		$context		= $options->context ?? [];
		$fields			= $options->fields ?? new stdClass();
		$element_tipo	= $options->diffusion_element_tipo;

		$section_name	= self::resolve_section_name($section_tipo);
		$title			= self::resolve_record_title($context, $fields);

		// YAML frontmatter (machine metadata for AI agents)
		$md = self::render_frontmatter([
			'section_name'		=> $section_name,
			'section_tipo'		=> $section_tipo,
			'section_id'		=> (string)$section_id,
			'title'				=> $title ?? ($section_tipo .'_'. $section_id),
			'diffusion_element'	=> $element_tipo
		]);

		// section name as the document header (always present)
		$md .= '# ' . self::sanitize_md_value($section_name) . "\n\n";

		// one "## label" block per field, in context (column) order
		foreach ($context as $context_entry) {

			$node_tipo	= $context_entry->tipo ?? null;
			if (empty($node_tipo)) {
				continue;
			}
			$groups = $fields->{$node_tipo} ?? null;
			if (empty($groups)) {
				continue;
			}

			$field_md = self::render_field($context_entry, $groups);
			if ($field_md === '') {
				continue; // skip empty fields to keep the document compact
			}

			$label = $context_entry->term ?? $node_tipo;
			$md .= '## ' . self::sanitize_md_value((string)$label) . "\n\n";
			$md .= $field_md . "\n\n";
		}


		return rtrim($md) . "\n";
	}//end render_record



	/**
	* RENDER_FIELD
	* Renders the field_group values of a single field into Markdown text.
	* Handles three shapes:
	*  - relation field_group (section_tipo + section_id present): the flattened
	*    value followed by a link to the related record's own .md, OR a bare link
	*    when there is no flattened value (links resolve when the related section
	*    is published through the diffusion levels budget).
	*  - media field_group (component_image / av / 3d / pdf): a Markdown image or link.
	*  - literal field_group: the plain value, with translatable values split per lang.
	* @param object $context_entry
	* @param array $groups Array of field_group objects
	* @return string
	*/
	private static function render_field( object $context_entry, array $groups ) : string {

		$lines = [];

		foreach ($groups as $group) {

			// flat value text from the group entries
			$values = [];
			foreach ($group->entries ?? [] as $entry) {
				$value = $entry->value ?? null;
				if ($value===null || $value==='') {
					continue;
				}
				$values[] = is_string($value) ? $value : to_string($value);
			}
			$text = implode(', ', $values);

			// per-lang prefix for translatable values
			$lang	= $group->lang ?? null;
			$prefix	= ($lang && $lang!==DEDALO_DATA_NOLAN)
				? '- **' . lang::get_alpha2_from_code($lang) . ':** '
				: '';

			// relation: flattened value + link to the related record .md
			if (isset($group->section_tipo, $group->section_id)) {
				$target	= $group->section_tipo .'_'. $group->section_id .'.md';
				if ($text!=='') {
					$lines[] = $prefix
						. self::sanitize_md_value($text)
						. ' ([' . $group->section_tipo .'_'. $group->section_id . '](' . $target . '))';
				}else{
					$label = self::resolve_section_name($group->section_tipo) .' '. $group->section_id;
					$lines[] = $prefix . '[' . self::sanitize_md_value($label) . '](' . $target . ')';
				}
				continue;
			}

			if ($text==='') {
				continue;
			}

			// media: render as Markdown image/link (component value is the URL)
			$model = !empty($group->tipo) ? ontology_node::get_model_by_tipo($group->tipo) : '';
			if ($model==='component_image') {
				$lines[] = $prefix . '![' . self::sanitize_md_value((string)($context_entry->term ?? '')) . '](' . $text . ')';
				continue;
			}
			if (in_array($model, ['component_av','component_3d','component_pdf'], true)) {
				$lines[] = $prefix . '[' . self::sanitize_md_value((string)($context_entry->term ?? '')) . '](' . $text . ')';
				continue;
			}

			// literal value
			$lines[] = $prefix . self::sanitize_md_value($text);
		}


		return implode("\n", $lines);
	}//end render_field



	/**
	* RESOLVE_RECORD_TITLE
	* Best-effort human title for a record: the first non-empty input_text field
	* value. Used for the frontmatter 'title'. Returns null when none is found.
	* @param array $context
	* @param object $fields
	* @return string|null
	*/
	private static function resolve_record_title( array $context, object $fields ) : ?string {

		foreach ($context as $context_entry) {

			$node_tipo = $context_entry->tipo ?? null;
			if (empty($node_tipo)) {
				continue;
			}
			$groups = $fields->{$node_tipo} ?? null;
			if (empty($groups)) {
				continue;
			}

			foreach ($groups as $group) {
				// skip relations (they are not a record title)
				if (isset($group->section_tipo, $group->section_id)) {
					continue;
				}
				$model = !empty($group->tipo) ? ontology_node::get_model_by_tipo($group->tipo) : '';
				if ($model!=='component_input_text') {
					continue;
				}
				foreach ($group->entries ?? [] as $entry) {
					$value = $entry->value ?? null;
					if (is_string($value) && $value!=='') {
						return trim($value);
					}
				}
			}
		}


		return null;
	}//end resolve_record_title



	/**
	* RESOLVE_SECTION_NAME
	* Resolves (and caches) the human-readable name of a section.
	* @param string $section_tipo
	* @return string
	*/
	private static function resolve_section_name( string $section_tipo ) : string {

		if (isset(self::$section_name_cache[$section_tipo])) {
			return self::$section_name_cache[$section_tipo];
		}

		$name = ontology_node::get_term_by_tipo($section_tipo, DEDALO_APPLICATION_LANG);
		if (empty($name)) {
			$name = $section_tipo;
		}

		self::$section_name_cache[$section_tipo] = $name;


		return $name;
	}//end resolve_section_name



	/**
	* RENDER_FRONTMATTER
	* Builds a YAML frontmatter block from a flat key => string map.
	* @param array $kv
	* @return string
	*/
	private static function render_frontmatter( array $kv ) : string {

		$out = "---\n";
		foreach ($kv as $key => $value) {
			$escaped = str_replace(['\\', '"'], ['\\\\', '\\"'], (string)$value);
			$out .= $key . ': "' . $escaped . "\"\n";
		}
		$out .= "---\n\n";


		return $out;
	}//end render_frontmatter



	/**
	* SANITIZE_MD_VALUE
	* Neutralises only the sequences that would break Markdown structure
	* (frontmatter terminator and line-leading ATX headers). Values are NOT
	* HTML-escaped: readability for an LLM is the goal.
	* @param string $value
	* @return string
	*/
	private static function sanitize_md_value( string $value ) : string {

		$value = trim($value);
		// escape line-leading ATX headers (e.g. "# title" inside a value)
		$value = preg_replace('/^(\s*)(#{1,6}\s)/m', '$1\\\\$2', $value);
		// escape a lone "---" line (would be read as a frontmatter / thematic break)
		$value = preg_replace('/^---\s*$/m', '\\-\\-\\-', $value);


		return $value;
	}//end sanitize_md_value



}//end diffusion_markdown class
