<?php declare(strict_types=1);
/**
 * CLASS TOOL_IMPORT_FILES
 * Batch media-file importer tool — uploads files from the browser, moves them
 * into permanent media storage, and propagates metadata into section components.
 *
 * This tool surfaces as a section toolbar button (like tool_export) and is
 * configured through the ontology properties of the triggering component
 * (usually a component_portal).  Its configuration is supplied at runtime via
 * $options->tool_config, which carries a `ddo_map` array that maps DDO roles to
 * concrete tipos:
 *
 *   - 'target_component'  — the media component (component_image / component_av /
 *                           component_pdf) that will receive the uploaded file.
 *   - 'target_filename'   — optional text component where the original filename is
 *                           stored after import.
 *   - 'target_date'       — optional date component populated with EXIF/metadata
 *                           date extracted from the file.
 *   - 'input_component'   — optional form fields shown in the import UI whose
 *                           values are propagated into the newly created section.
 *   - 'component_option'  — portal-level option driving target section routing.
 *
 * Import modes (tool_config->import_mode):
 *   - 'default'           — files go into the portal that triggered the tool.
 *   - 'section'           — a new child section is created for each file.
 *   - 'section_resource'  — files are stored directly into a resource section
 *                           (e.g. rsc170 - Images) without creating a portal child.
 *
 * File-naming strategies (tool_config->import_file_name_mode):
 *   - null / default — each file gets a fresh section.
 *   - 'enumerate'    — the numeric prefix of the filename encodes the
 *                      section_id; a section is created with that explicit id.
 *                      Only valid with 'section' or 'section_resource' modes.
 *   - 'named'        — the basename groups files: files sharing the same base
 *                      name reuse the first-created section (multi-file records).
 *   - 'match'        — the numeric prefix is used to locate an existing source
 *                      section; the tool then resolves and re-uploads into the
 *                      media sections already linked to it (replacing/updating).
 *   - 'match_freename' — same as 'match' but the whole filename (not a prefix
 *                        id) is matched directly against stored filenames in the
 *                        target media section.
 *
 * Security:
 *   - API_ACTIONS enforces the HTTP-accessible surface (SEC-024 §9.2).
 *   - BACKGROUND_RUNNABLE limits background CLI dispatch to import_files only.
 *   - key_dir (upload subdirectory) is sanitized via sanitize_key_dir() before
 *     any filesystem use (TOOLS-05).
 *   - Custom file processors (file_processor) are confined to the tool directory
 *     and their function names must be bare identifiers (SEC-053).
 *
 * Extends tool_common (see tools/tool_common/class.tool_common.php).
 * Uses: component_common, ontology_node, section, section_record, search,
 *       ImageMagick, Ffmpeg, dd_date, security, logger.
 *
 * @package Dédalo
 * @subpackage Tools
 */
class tool_import_files extends tool_common {



	/**
	* SEC-024 (§9.2): explicit allowlist of methods callable via
	* `dd_tools_api::tool_request`. Internal helpers with positional or
	* non-rqo signatures (e.g. set_media_file, get_media_file_date,
	* set_components_data) are intentionally absent because they receive
	* resolved PHP objects rather than a raw $rqo and would need their own
	* input-validation layer before being safe to expose.
	* @var array<string> API_ACTIONS
	*/
	public const API_ACTIONS = [
		'file_processor',
		'import_files',
		'get_media_section_match_from_souce',
		'get_media_section_match'
	];

	/**
	* SEC-024 / §9.1b: explicit CLI allowlist for `process_runner.php`.
	* Only `import_files` runs with `background_running:true` from JS
	* (see `tools/tool_import_files/js/tool_import_files.js`).
	* Methods absent from this list cannot be dispatched via the background
	* process runner even if they appear in API_ACTIONS.
	* @var array<string> BACKGROUND_RUNNABLE
	* @see core/base/process_runner.php
	*/
	public const BACKGROUND_RUNNABLE = [
		'import_files'
	];



	/**
	 * GET_FILE_DATA
	 * Parses a filename against the Dédalo import naming convention and returns
	 * a flat associative array of file metadata together with a stdClass of
	 * regex-extracted components.
	 *
	 * The supported filename formats are (separator is always '-'):
	 *
	 *   section_id-filename-field.extension  →  73-my image-A.tiff
	 *   section_id-field.extension           →  73-A.tiff
	 *   section_id.extension                 →  73.jpg
	 *   section_id-filename.extension        →  73-my image.tif
	 *   filename-field.extension             →  My image-A.tiff
	 *   filename.extension                   →  My image.tiff
	 *
	 * The regex (group mapping, see inline comments) is conditional to handle the
	 * optional presence of each segment.  The field-letter (group 3) is 1-2 alpha
	 * chars and must be immediately before the extension dot.
	 *
	 * The returned $ar_data['regex'] stdClass is used downstream to:
	 *   - Route the file to the correct section   ($regex->section_id)
	 *   - Group multi-file imports by name         ($regex->base_name)
	 *   - Select the destination component         ($regex->letter)
	 *
	 * @param string $dir  Absolute path of the directory containing the file
	 *                     (no trailing slash; the method appends '/' internally).
	 * @param string $file Full filename including extension, e.g. 'my_photo.today.tif'.
	 *                     Must exist on disk — file_size calls filesize() directly.
	 * @return array Associative array with keys:
	 *   - 'dir_path'       string  Absolute directory path as supplied.
	 *   - 'file_path'      string  Absolute path to the file ($dir.'/'.$file).
	 *   - 'file_name'      string  Filename without extension.
	 *   - 'file_name_full' string  Full filename including extension.
	 *   - 'extension'      string  Extension, case preserved (e.g. 'JPG' not 'jpg').
	 *   - 'file_size'      string  Human-readable size, e.g. '1.700 MB'.
	 *   - 'regex'          stdClass Parsed components:
	 *                        ->full_name   string|null  Original filename as matched.
	 *                        ->section_id  string|null  Numeric prefix (may be empty string).
	 *                        ->base_name   string|null  Middle descriptive name segment.
	 *                        ->letter      string|null  1-2 char field selector (A, B, …).
	 *                        ->extension   string|null  Extension from regex match.
	 */
	public static function get_file_data( string $dir, string $file ) : array {

		$ar_data = array();

		$file_name	= pathinfo($file,PATHINFO_FILENAME);
		$extension	= pathinfo($file,PATHINFO_EXTENSION);

		// ar_data values
		// Populate the flat metadata array.  Examples taken from real museum data:
			$ar_data['dir_path']		= $dir;					# /Users/dedalo/media/media_mupreva/image/temp/files/user_1/
			$ar_data['file_path']		= $dir.'/'.$file;		# /Users/dedalo/media/media_mupreva/image/temp/files/user_1/45001-1.jpg
			$ar_data['file_name']		= $file_name;			# 04582_01_EsCuieram_Terracota_AD_ORIG
			$ar_data['file_name_full']	= $file;				# $ar_value[0]; # 04582_01_EsCuieram_Terracota_AD_ORIG.JPG
			$ar_data['extension']		= $extension;			# JPG (we respect upper/lower case)
			$ar_data['file_size']		= number_format(filesize($ar_data['file_path'])/1024/1024,3)." MB"; # 1.7 MB

		// des
			// $ar_data['image']['image_url']			= DEDALO_ROOT_WEB . "/inc/img.php?s=".$ar_data['file_path'];
			// $ar_data['image']['image_preview_url']	= DEDALO_LIB_BASE_URL . '/tools/tool_import_files/foto_preview.php?f='.$ar_data['file_path'];

		// PREVIOUS
			// it only allow digits in middle of the filename as : 712-2-A.jpg
			// Regex file info ^(.+)(-([a-zA-Z]{1}))\.([a-zA-Z]{3,4})$
				// Format result preg_match '1-2-A.jpg' and 'cat-2-A.jpg'
				// 0	=>	1-2-A.jpg 	: cat-2-A.jpg 	# full_name
				// 1	=>	1-2-A 		: cat-2-A 		# name
				// 2	=>	1 			: cat 			# base_name (name without order and letter)
				// 3	=>	1 			: 				# section_id (empty when not numeric)
				// 4	=>				: cat 			# base_string_name (empty when numeric)
				// 5	=>	-2 			: -2 			# not used
				// 6	=>	2 			: 2 			# portal_order
				// 7	=>	-A 			: -A 			# not used
				// 8	=>	A 			: A 			# target map (A,B,C..)
				// 9	=>	jpg 		: jpg 			# extension
			// regex values

			// previous regex, it only allow digits in middle of the filename as : 712-2-A.jpg
			// preg_match("/^((([\d]+)|([^-]+))([-](\d))?([-]([a-zA-Z]))?)\.([a-zA-Z]{3,4})$/", $file, $ar_match);
			// $regex_data = new stdClass();
			//	$regex_data->full_name		= $ar_match[0] ?? null;
			//	$regex_data->name			= $ar_match[1] ?? null;
			//	$regex_data->base_name		= $ar_match[2] ?? null;
			//	$regex_data->section_id		= $ar_match[3] ?? null;
			//	$regex_data->portal_order	= $ar_match[6] ?? null;
			//	$regex_data->letter			= $ar_match[8] ?? null;
			//	$regex_data->extension		= $ar_match[9] ?? null;

		// Regex
			// the name can identify the section_id to insert the media
			// the name can identify the field to insert the media (usually a portal)
			// the name can has other information about the media
			// separator between concepts is `-`
			// extension could be set with 3 or 4 letters
			// Formats supported:
			// section_id-filename-field.extension		| 73-my image-A.tiff
			// section_id-field.extension 				| 73-A.tiff
			// section_id.extension 					| 73.jpg
			// section_id-filename.extension 			| 73-my image.tif
			// filename-field.extension					| My image-A.tiff
			// filename.extension						| My image.tiff

			// Regex groups
			// group 1 : section_id
			// group 2 : filename
			// group 3 : field
			// group 4 : extension
			//
			// ^(\d*)?-?(?(?=.\.)|(.*?))(?(?=-)-([a-zA-Z])|)\.([a-zA-Z]{3,4})$
			// (\d*)? 					| group 1 | get the section_id it could be present or not
			// -? 						| check - | check if - exists to create the next groups
			// (?(?=.\.)|(.*?)) 		| group 2 | conditional, if the next character is only 1 following by the point go to next group, else capture all until next rule
			// (?(?=-)-([a-zA-Z])|) 	| group 3 | conditional, if the next character is a - get the letter to identify the field, else go next group
			// \.([a-zA-Z]{3,4})		| group 4 | get the extension
			// see an example : https://regex101.com/r/APaAxA/1

			// preg_match result examples
			//
			// | # | 73-my image-A.tiff | 73-A.tiff	| 73.jpg | 73-my image.tif | My image-A.tiff | My image.tiff | comment |
			// |---| ------------------ | --------- | ------ | --------------- | --------------- | ------------- | ------- |
			// | 0 | 73-my image-A.tiff | 73-A.tiff	| 73.jpg | 73-my image.tif | My image-A.tiff | My image.tiff | full_name |
			// | 1 | 73                 | 73        | 73     | 73              |                 |               | section_id (empty when not numeric) |
			// | 2 | my image			|           |        | my image        | My image        | My image      | base_name (name without order and letter) |
			// | 3 | A                  | A         |        |                 | A               |               | target field map (A,B,C..) |
			// | 4 | tiff               | tiff      | jpg    | tif             | tiff            | tiff          | extension |

			preg_match("/^(\d*)?-?(?(?=.\.)|(.*?))(?(?=-)-([a-zA-Z]{1,2})|)\.([a-zA-Z]{3,4})$/", $file, $ar_match);
			$regex_data = new stdClass();
				$regex_data->full_name		= $ar_match[0] ?? null;
				$regex_data->section_id		= $ar_match[1] ?? null;
				$regex_data->base_name		= $ar_match[2] ?? null;
				$regex_data->letter			= $ar_match[3] ?? null;
				$regex_data->extension		= $ar_match[4] ?? null;
			$ar_data['regex'] = $regex_data;


		return $ar_data;
	}//end get_file_data



	/**
	 * SET_MEDIA_FILE
	 * Moves a file from the user's temporary upload directory into permanent
	 * media storage and triggers component-level post-processing (thumbnail
	 * generation, format conversion, etc.).
	 *
	 * The three-step sequence is:
	 *   1. Resolve the component model and desired quality level.
	 *   2. Call $component->add_file() — physically moves/copies the file into
	 *      the media directory tree.
	 *   3. Call $component->process_uploaded_file() — runs ImageMagick/FFmpeg
	 *      derivative generation (thumbnails, web preview, etc.).
	 *   4. Clean up the per-user thumbnail copy left by the upload service.
	 *
	 * On failure at step 2 or 3 the method short-circuits, emits a CLI error if
	 * running in CLI mode, and returns false without removing the source file.
	 *
	 * (!) $add_file_options->tmp_dir must be the *string name* of the constant
	 * (e.g. 'DEDALO_UPLOAD_TMP_DIR'), not the resolved path — the component's
	 * add_file() resolves it internally via constant().
	 *
	 * @param object $add_file_options Upload descriptor object with properties:
	 *   ->name          string       Original filename, e.g. 'IMG_3007.jpg'.
	 *   ->key_dir       string       Upload subdirectory token, e.g. 'oh1_oh1'.
	 *   ->tmp_dir       string       Constant name: 'DEDALO_UPLOAD_TMP_DIR'.
	 *   ->tmp_name      string       Temp filename (often same as ->name post-move).
	 *   ->quality       string|null  Target quality level; falls back to component default.
	 *   ->source_file   mixed|null   Source file override (null for standard upload flow).
	 *   ->size          string       Human-readable size string, e.g. '1.700 MB'.
	 *   ->extension     string       File extension, e.g. 'jpg'.
	 * @param string $target_section_tipo Section tipo where the file belongs, e.g. 'rsc170'.
	 * @param int    $current_section_id  Section ID of the record receiving the file.
	 * @param string $target_component_tipo Component tipo that stores the media, e.g. 'rsc29'.
	 * @return bool True on full success; false if add_file, process_uploaded_file, or
	 *              thumbnail cleanup fails.
	 */
	public static function set_media_file(
		object $add_file_options,
		string $target_section_tipo,
		int $current_section_id,
		string $target_component_tipo
		) : bool {

		$model = ontology_node::get_model_by_tipo($target_component_tipo, true);

		// activity log
		// The generic service_upload endpoint does not know when a chunked transfer
		// completes; logging here ensures there is always one activity record per
		// successfully received file, regardless of chunking strategy.
			// safe_file_data
			// Prevent single-quote problems in filenames (e.g. "L'osuna.jpg") when
			// embedding the JSON string inside a PostgreSQL log entry.
			$file_data_encoded	= json_encode($add_file_options, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
			$connection			= DBi::_getConnection();
			$safe_file_data		= pg_escape_string($connection, $file_data_encoded);
			logger::$obj['activity']->log_message(
				'UPLOAD COMPLETE',
				logger::INFO,
				$target_component_tipo,
				NULL,
				[
					'msg'			=> 'Upload file complete. Processing uploaded file',
					'file_data'		=> $safe_file_data
					// 'file_name'	=> $file_data->name,
					// 'file_size'	=> format_size_units($file_data->size),
					// 'time_sec'	=> $file_data->time_sec,
					// 'f_error'	=> $file_data->error || null
				],
				logged_user_id() // int
			);

		// component instance
		// 'list' mode is sufficient here — we only need access to add_file() and
		// process_uploaded_file(); no rendered output is required.
			$component = component_common::get_instance(
				$model,
				$target_component_tipo,
				$current_section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$target_section_tipo
			);

		// quality resolution
		// Caller may supply an explicit quality level; if absent, fall back to the
		// component's own 'original' quality (the unmodified source file).
			$custom_target_quality = $add_file_options->quality ?? $component->get_original_quality();

		// fix current component target quality
		// set_quality() determines the destination subdirectory inside the media
		// tree (e.g. '…/image/original/' vs '…/image/thumb/'), so it must be set
		// before add_file() is called.
			$component->set_quality($custom_target_quality);

		// add file
			$add_file = $component->add_file($add_file_options);
			if ($add_file->result===false) {
				// $response->msg .= $add_file->msg;
				// return $response;

				// CLI process data
				if ( running_in_cli()===true ) {
					common::$pdata->errors[] = $add_file->msg;
					// send to output
					print_cli(common::$pdata);
				}
				return false;
			}

		// post-processing
		// add_file() returns the resolved final path in $add_file->ready so that
		// process_uploaded_file() can find the file under its canonical name even
		// when the upload service renamed it (e.g. to avoid collisions).
			$process_file = $component->process_uploaded_file(
				$add_file->ready,
				null
			);
			if ($process_file->result===false) {
				// $response->msg .= 'Errors occurred when processing file: '.$process_file->msg;
				// return $response;

				// CLI process data
				if ( running_in_cli()===true ) {
					common::$pdata->errors[] = $process_file->msg;
					// send to output
					print_cli(common::$pdata);
				}
				return false;
			}

		// thumbnail cleanup
		// The browser upload service creates a lightweight JPEG thumbnail preview
		// alongside every upload so that the import dialog can render a preview
		// before submission.  That thumbnail is no longer needed once the file has
		// been processed, so remove it to keep the tmp directory clean.
			$user_id		= logged_user_id();
			$source_path	= DEDALO_UPLOAD_TMP_DIR . '/'. $user_id . '/' . $add_file_options->key_dir;

			$thumbnail_name			= pathinfo($add_file_options->name, PATHINFO_FILENAME);
			$original_file_thumb	= $source_path .'/thumbnail/'. $thumbnail_name. '.jpg';

			if (file_exists($original_file_thumb)) {
				if(!unlink($original_file_thumb)){
					debug_log(__METHOD__
						." Thumb Delete ERROR of: ".to_string($original_file_thumb)
						, logger::ERROR
					);
					return false;
				}
			}

		return true;
	}//end set_media_file



	/**
	 * GET_MEDIA_FILE_DATE
	 * Extracts the original creation date embedded in a media file's metadata
	 * and returns it as a dd_date object ready to be saved to a date component.
	 *
	 * The extraction strategy depends on the component model:
	 *   - component_image  → ImageMagick::get_date_time_original() reads EXIF
	 *                         DateTimeOriginal / CreateDate tags.
	 *   - component_av     → Ffmpeg::get_date_time_original() reads ID3 or
	 *                         container creation_time metadata.
	 *   - component_pdf    → pdfinfo (from ImageMagick bundle) is shelled out;
	 *                         the 'CreationDate' field is parsed from its
	 *                         ISO/PDF date format 'D:YYYYMMDDHHmmss±hh'mm''.
	 *                         Only year, month, and day are stored.
	 *
	 * The PDF branch uses exec() with a piped grep; a non-zero exit code is
	 * logged at WARNING level and the branch breaks with $dd_date still null,
	 * unless the output contains 'ERROR:' in which case it also breaks early.
	 *
	 * Callers (set_components_data) check for empty($dd_date) before persisting,
	 * so returning null is the correct signal when no date is available.
	 *
	 * @param array  $media_file Associative array; requires key 'file_path'
	 *               (string, absolute path to the media file on disk).
	 * @param string $model      Component model class name: 'component_image',
	 *               'component_av', or 'component_pdf'.  Any other value
	 *               triggers an ERROR log entry and returns null.
	 * @return object|null dd_date instance populated with available date fields,
	 *                     or null when no date could be extracted.
	 */
	public static function get_media_file_date( array $media_file, string $model ) : ?object {

		$dd_date			= null;
		$source_full_path	= $media_file['file_path'];

		switch ($model) {
			case 'component_image':
				$dd_date = ImageMagick::get_date_time_original($source_full_path);
				break;

			case 'component_av':
				$dd_date = Ffmpeg::get_date_time_original($source_full_path);
				break;

			case 'component_pdf':
				$command = ImageMagick::get_imagemagick_pdfinfo_path() . ' -rawdates ' . $source_full_path . ' | grep -i CreationDate';

				// exec command
			// stderr is merged into stdout (' 2>&1') so it appears in $output
			// and can be inspected for 'ERROR:' below without a second channel.
				$result = exec($command.' 2>&1', $output, $worked_result);
				// error case
				// A non-zero exit code means pdfinfo returned an error; log and
				// attempt to continue if the output does not contain 'ERROR:'.
					if ($worked_result!=0) {
						debug_log(__METHOD__
							. ' exec command bad result' . PHP_EOL
							. ' command:' . to_string($command) . PHP_EOL
							. ' worked_result:' . to_string($worked_result) . PHP_EOL
							. ' result: ' .to_string($result) . PHP_EOL
							. ' output: ' . to_string($output). PHP_EOL
							, logger::WARNING
						);
						if(SHOW_DEBUG===true) {
							$bt = debug_backtrace();
							dump($bt[1], ' bt[1] -- source_full_path: ++ '.to_string($source_full_path));
						}
						if (stripos(to_string($output), 'ERROR:')!==false) {
							break;
						}
					}

				// PDF date format parsing
				// pdfinfo outputs dates in the PDF standard format:
				//   D:YYYYMMDDHHmmssOHH'mm'
				// where everything after YYYY is optional and the timezone
				// offset uses single-quotes as delimiters.  Examples:
				//   D:20110816234339-04'00'
				//   D:20230101
				// Only year (group 2), month (group 3), and day (group 4) are
				// extracted; time and timezone are ignored for component storage.
				$regex = '/(D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(-|\+|Z{1})?(\d{2})?(\'{1})?(\d{2})?(\'{1})?/';
				preg_match($regex, $result, $matches);

				$dd_date		= new dd_date();
				if(isset($matches[2])) $dd_date->set_year((int)$matches[2]);
				if(isset($matches[3])) $dd_date->set_month((int)$matches[3]);
				if(isset($matches[4])) $dd_date->set_day((int)$matches[4]);
				break;

			default:
				debug_log(__METHOD__
					. " Error. get_media_file_date . Model is not defined ". PHP_EOL
					. ' source_full_path: ' . $source_full_path .PHP_EOL
					. ' model: ' .$model
					, logger::ERROR
				);
				// CLI process data
					if ( running_in_cli()===true ) {
						if (empty(common::$pdata)) {
							common::$pdata = new stdClass();
							common::$pdata->errors = [];
						}
						common::$pdata->errors[] = 'Error. get_media_file_date . Model is not defined';
						// send to output
						print_cli(common::$pdata);
					}
				break;
		}//end switch ($model)


		return $dd_date;
	}//end get_media_file_date



	/**
	 * FILE_PROCESSOR
	 * Executes a named custom PHP processor function for a single file, enabling
	 * project-specific transformations (e.g. crop_50 splits an image in two halves)
	 * that the generic import flow cannot express.
	 *
	 * The processor system works as follows:
	 *   1. tool_config->file_processor (an array) lists available processor
	 *      definitions; each entry has:
	 *        - function_name  string  Name of the PHP function to call.
	 *        - script_file    string  Relative path (from the tool root) to the
	 *                                PHP file that declares function_name.
	 *        - custom_arguments  mixed  Extra arguments forwarded verbatim to the
	 *                                   processor via $standard_options->custom_arguments.
	 *   2. The per-file selection $options->file_processor is the function_name
	 *      string chosen by the user in the UI for this specific file.
	 *   3. This method iterates all definitions, finds the one whose function_name
	 *      matches, applies SEC-053 sandbox checks (path confinement + bare-
	 *      identifier + ReflectionFunction source-file check), then calls the
	 *      function with a $standard_options object.
	 *
	 * SEC-053 enforcement:
	 *   - script_file must resolve to a realpath inside the tool root directory.
	 *   - function_name must match '/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/'.
	 *   - After include_once(), ReflectionFunction verifies the function was
	 *     declared in the same file (not injected via an earlier include).
	 *
	 * The processor function must accept one stdClass $options argument and return
	 * a stdClass with at least { result: bool, msg: string }.  A false result is
	 * collected in $response->errors; the loop continues to subsequent definitions.
	 *
	 * (!) $options->section_tipo must be non-empty for the write-permission gate to
	 * be enforced; if it is missing the assertion is skipped and a missing-permission
	 * error will surface downstream.
	 *
	 * @param object $options Processing context with properties:
	 *   ->file_processor            string       function_name to invoke.
	 *   ->file_processor_properties array|null   Full processor definition list from tool_config.
	 *   ->file_name                 string       Filename being processed.
	 *   ->file_path                 string       Absolute directory path of the file.
	 *   ->section_tipo              string       Section tipo (used for write-permission gate).
	 *   ->section_id                int          Section ID of the current record.
	 *   ->tool_config               object       Full tool configuration object.
	 *   ->key_dir                   string       Upload subdirectory token.
	 *   ->custom_target_quality     string|null  Target quality level.
	 *   ->components_temp_data      array        Temporary component data from import form.
	 * @return object stdClass with:
	 *   ->result bool   True when all matched processors succeeded (or none were found).
	 *   ->msg   string  'OK. Request done' or 'Errors happened'.
	 *   ->errors array  Per-processor error messages collected during iteration.
	 */
	public static function file_processor( object $options ) : object {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';
			$response->errors	= [];

		// options
			$file_processor				= $options->file_processor ?? null;
			$file_processor_properties	= $options->file_processor_properties ?? null;
			$file_name					= $options->file_name ?? null;
			$file_path					= $options->file_path ?? null;
			$section_tipo				= $options->section_tipo ?? null;
			$section_id					= $options->section_id ?? null;
			$tool_config				= $options->tool_config ?? null;
			$key_dir					= $options->key_dir ?? null;
			$custom_target_quality		= $options->custom_target_quality ?? null;
			$components_temp_data		= $options->components_temp_data ?? null;

		// SEC-024 (§9.2): WRITE gate on the destination section.
			if (!empty($section_tipo)) {
				security::assert_section_permission($section_tipo, 2, __METHOD__);
			}

		// FILE_PROCESSOR — iterate processor definitions
		// $file_processor_properties is the full list of processor definitions from
		// the ontology button properties (not the per-file selection).
		// $file_processor is only the function_name chosen for the current file.
		// We iterate all definitions and skip any whose function_name does not
		// match the selection; in practice only one entry should match.
		foreach ((array)$file_processor_properties as $file_processor_obj) {

			if ($file_processor_obj->function_name!==$file_processor) {
				continue;
			}

			$script_file =  dirname(__FILE__).$file_processor_obj->script_file;
			// SEC-053: `$script_file` and `$function_name` come from ontology
			// `file_processor_properties`, which an admin/developer can edit.
			// Without containment a hostile processor definition could
			// `include_once` any PHP file on disk (via `../../`) and call
			// any global function. Confine the include under the tool
			// directory and require `$function_name` to be a bare
			// identifier whose declaration lives inside the same root.
				$tool_root   = realpath(dirname(__FILE__));
				$real_script = realpath($script_file);
				$function_name = $file_processor_obj->function_name ?? '';
				if ($tool_root === false || $real_script === false
					|| strncmp($real_script, $tool_root . DIRECTORY_SEPARATOR, strlen($tool_root) + 1) !== 0) {
					debug_log(__METHOD__
						. ' SEC-053 refused script_file outside tool root.' . PHP_EOL
						. ' script_file: ' . to_string($script_file)
						, logger::ERROR
					);
					continue;
				}
				if (!is_string($function_name) || !preg_match('/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/', $function_name)) {
					debug_log(__METHOD__
						. ' SEC-053 refused function_name (not a bare identifier): ' . to_string($function_name)
						, logger::ERROR
					);
					continue;
				}
			if(include_once($real_script)) {

				if (is_callable($function_name)) {
					try {
						$fn_ref  = new ReflectionFunction($function_name);
						$fn_file = $fn_ref->getFileName();
						if ($fn_file === false
							|| strncmp($fn_file, $tool_root . DIRECTORY_SEPARATOR, strlen($tool_root) + 1) !== 0) {
							debug_log(__METHOD__
								. ' SEC-053 refused function_name defined outside tool root.' . PHP_EOL
								. ' function_name: ' . to_string($function_name)
								. ' fn_file: ' . to_string($fn_file)
								, logger::ERROR
							);
							continue;
						}
					} catch (Throwable $e) {
						debug_log(__METHOD__
							. ' SEC-053 ReflectionFunction failed: ' . $e->getMessage()
							, logger::ERROR
						);
						continue;
					}
					$custom_arguments = $file_processor_obj->custom_arguments;
					$standard_options = (object)[
						'file_name'				=> $file_name,
						'file_path'				=> $file_path,
						'section_tipo'			=> $section_tipo,
						'section_id'			=> $section_id,
						'tool_config'			=> $tool_config,
						'key_dir'				=> $key_dir,
						'custom_target_quality'	=> $custom_target_quality,
						'custom_arguments' 		=> $custom_arguments,
						'components_temp_data'	=> $components_temp_data
					];
					$current_response = call_user_func($function_name, $standard_options);
					if($current_response->result === false){
						$response->result = false;
						$response->errors[] = $current_response->msg;
					}
				}else{
					debug_log(__METHOD__
						." Error on call file processor function: " . PHP_EOL
						.' function_name: ' . to_string($function_name)
						, logger::ERROR
					);

					// CLI process data
						if ( running_in_cli()===true ) {
							common::$pdata->errors[] = 'Error on call file processor function';
							print_cli(common::$pdata);
						}
				}
			}else{
				debug_log(__METHOD__
					." Error on include file processor file script_file: " . PHP_EOL
					.' script_file: ' .to_string($script_file)
					, logger::ERROR
				);
				// CLI process data
					if ( running_in_cli()===true ) {
						common::$pdata->errors[] = 'Error on include file processor file script_file';
						print_cli(common::$pdata);
					}
			}

			debug_log(__METHOD__
				." Processed file function_name $function_name with script $script_file"
				, logger::DEBUG
			);
		}//end foreach ((array)$options->file_processor_properties as $key => $file_processor_obj)


		$response->result	= empty($response->errors);
		$response->msg		= empty($response->errors)
			? 'OK. Request done'
			: 'Errors happened';


		return $response;
	}//end file_processor



	/**
	 * IMPORT_FILES
	 * Main orchestration method — iterates every file in $options->files_data and
	 * drives the full import pipeline: path validation → section creation → component
	 * data population → media file storage → CLI progress reporting.
	 *
	 * Per-file flow (simplified):
	 *   1. Decode the URL-encoded filename and verify the file exists under the
	 *      user's temporary upload directory (safe_upload_target guard, TOOLS-05).
	 *   2. Validate mode compatibility ('enumerate' only valid with section modes).
	 *   3. Parse filename components via get_file_data().
	 *   4. Depending on import_mode + import_file_name_mode:
	 *        match / match_freename  → locate existing media sections and update them;
	 *                                  continue 2 to skip the standard flow.
	 *        enumerate               → create a section with the numeric id from filename.
	 *        named                   → reuse a previously-created section by base_name.
	 *        default / null          → create a fresh section per file.
	 *   5. If a custom file_processor is assigned, delegate to file_processor().
	 *      Otherwise run the standard path:
	 *        a. Create a portal child element (section + default / section modes) or
	 *           route directly (section_resource mode).
	 *        b. Populate component data via set_components_data().
	 *        c. Store the file via set_media_file().
	 *   6. Append to $ar_processed (used for 'named' grouping across the batch).
	 *
	 * After the loop, the method clears any temporary session section_data for
	 * the input component section types that were touched during the import, so
	 * the next import session starts with empty form fields.
	 *
	 * (!) The 'enumerate' + 'match'/'match_freename' combination is detected
	 * before the switch and aborted with an error; the switch itself does not
	 * guard against this — the continue 2 in the match branch handles it.
	 *
	 * This method is listed in BACKGROUND_RUNNABLE and runs inside
	 * process_runner.php for large batches; CLI progress is streamed via
	 * print_cli(common::$pdata) after each file.
	 *
	 * @param object $options Import job descriptor with properties:
	 *   ->tipo                  string        Triggering component tipo, e.g. 'oh17'.
	 *   ->section_tipo          string        Caller section tipo, e.g. 'oh1'.
	 *   ->section_id            int           Caller section ID.
	 *   ->tool_config           object        Tool configuration (ddo_map, import_mode,
	 *                                         import_file_name_mode, file_processor).
	 *   ->files_data            array         Per-file descriptor objects with properties:
	 *                                           ->name            string  URL-encoded filename.
	 *                                           ->file_processor  string|null  Processor key.
	 *                                           ->component_option string|null  Option tipo.
	 *   ->components_temp_data  array|null    Input component data captured from the
	 *                                         import form; forwarded to set_components_data().
	 *   ->key_dir               string        Upload subdirectory token (will be sanitized).
	 *   ->custom_target_quality string|null   Target quality for set_media_file().
	 * @return object stdClass with:
	 *   ->result bool    True even when some files failed (partial success is still true).
	 *   ->msg   string   Summary: 'Import files done successfully. Imported: N of M' or
	 *                    'Import files done with errors. Imported: N of M'.
	 *   ->errors array   Merged unique errors from all per-file failures.
	 *   ->time   string  Human-readable total execution time.
	 *   ->memory mixed   Memory usage statistics from dd_memory_usage().
	 */
	public static function import_files( object $options ) : object {
		$start_time=start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// options
			// tipo. string component tipo like 'oh17'
			$tipo						= $options->tipo ?? null;
			// section_tipo. string current section tipo like 'oh1'
			$section_tipo				= $options->section_tipo ?? null;
			// section_id. int current section id like '5'
			$section_id					= $options->section_id ?? null;
			// tool_config. object like: '{"ddo_map":[{"role":"target_component","tipo":"rsc29","section_id":"self","section_tipo":"rsc170","model":"component_image","label":"Image"}],"import_file_name_mode":null}'
			$tool_config				= $options->tool_config ?? null;
			// files data. array of objects like: '[{"name":"_290000_rsc29_rsc170_290437.jpg","previewTemplate":{},"previewElement":{},"size":734061,"component_option":""}]'
			$files_data					= $options->files_data ?? null;
			// components_temp_data. array of objects like: '[{"section_id":"tmp","section_tipo":"rsc170","tipo":"rsc23","lang":"lg-eng","from_component_tipo":"rsc23","value":[],"parent_tipo":"rsc23","parent_section_id":"tmp","fallback_value":[null],"debug":{"exec_time":"0.740 ms"},"debug_model":"component_input_text","debug_label":"Title","debug_mode":"edit"}]'
			$components_temp_data		= $options->components_temp_data ?? null;
			// key_dir. string like: 'oh17_oh1' (contraction section_tipo + component tipo)
			// TOOLS-05: client-supplied; sanitize before it builds a filesystem path.
			$key_dir					= sanitize_key_dir($options->key_dir ?? '');
			// custom_target_quality. Optional media quality to store uploaded files
			$custom_target_quality		= $options->custom_target_quality ?? null;

		// check files data
			if (empty($files_data)) {
				$response->msg = 'Error. Empty files_data';
				$response->errors[] = 'Empty files data';
				return $response;
			}

		// SEC-024 (§9.2): WRITE gate. import_files materialises uploaded
		// content into the target section. Caller must have write (>=2) on
		// (section_tipo, tipo).
			if (empty($section_tipo) || empty($tipo)) {
				$response->msg = 'Error. Missing section_tipo or tipo';
				return $response;
			}
			security::assert_tipo_permission($section_tipo, $tipo, 2, __METHOD__);

		// import_mode: section|section_resource|default
		// Note that the tool buttons are conditional upon import mode.
			$import_mode = $tool_config->import_mode ?? 'default';

		// import_file_name_mode
			$import_file_name_mode = $tool_config->import_file_name_mode ?? null;

		// ddo_map
			$ar_ddo_map = $tool_config->ddo_map ?? [];

		// target component info
			$target_ddo_component = array_find($ar_ddo_map, function($item){
				return $item->role==='target_component';
			});
			if (!is_object($target_ddo_component)) {
				$response->msg .= ' Invalid target_component. Role "target_component" is not defined in Ontology tool configuration properties.';
				$response->errors[] = 'Invalid target component';
				return $response;
			}
			$target_component_tipo	= $target_ddo_component->tipo;
			$target_component_model	= ontology_node::get_model_by_tipo($target_component_tipo, true);

		// file_processor_properties
			$file_processor_properties = $tool_config->file_processor ?? null;

		// init vars
			$ar_msg							= [];	// messages for response info
			$input_components_section_tipo	= [];	// all different used section tipo in section_temp
			$total_processed				= 0;
			$total							= count($files_data);	// n of files
			$counter						= 0;

		// CLI process data
			if ( running_in_cli()===true ) {
				common::$pdata = new stdClass(); // init $pdata object
					common::$pdata->msg			= (label::get_label('processing') ?? 'Processing');
					common::$pdata->counter		= $counter;
					common::$pdata->total		= $total;
					common::$pdata->total_ms	= exec_time_unit($start_time);
					common::$pdata->errors		= [];
				// send to output
				print_cli(common::$pdata);
			}

		// $ar_processed accumulates one entry per file after it has been handled.
		// 'named' mode queries this array to avoid creating duplicate sections for
		// files that share the same base_name (e.g. ánfora.jpg + ánfora.tiff).
			$ar_processed	= [];
			// $tmp_dir		= TOOL_IMPORT_FILES_UPLOAD_DIR;
			$user_id = logged_user_id();
			$tmp_dir = DEDALO_UPLOAD_TMP_DIR . '/'. $user_id . '/' . $key_dir;

			foreach ((array)$files_data as $value_obj) {

				$start_time2=start_time();
				$counter++;

				// rawurldecode: the JS client sends filenames through encodeURI() to
				// safely transmit characters like spaces, accents, and CJK glyphs
				// over HTTP; decode them back to the filesystem representation here.
				$current_file_name				= rawurldecode($value_obj->name); // Note that name is JS encodeURI from browser
				$current_file_processor			= $value_obj->file_processor ?? null; // Note that var $current_file_processor is only the current element processor selection
				$current_component_option_tipo	= $value_obj->component_option ?? null;

				// CLI process data
					if ( running_in_cli()===true ) {
						common::$pdata->counter	= $counter;
						common::$pdata->file	= $current_file_name;
						// send to output
						print_cli(common::$pdata);
					}

				// Check file exists
					// TOOLS-05: confine the url-decoded client name under $tmp_dir
					// before any filesystem access (rawurldecode can expand %2e%2e/).
					try {
						$file_full_path = safe_upload_target($tmp_dir, $current_file_name, false);
					} catch (\Throwable $e) {
						$msg = "File ignored (invalid name) $current_file_name";
						$ar_msg[] = $msg;
						debug_log(__METHOD__ ." $msg: ". $e->getMessage(), logger::ERROR);
						$response->errors[] = $msg;
						common::$pdata->errors[] = $msg;
						continue; // Skip file
					}
					if (!file_exists($file_full_path)) {
						$msg = "File ignored (not found) $current_file_name";
						$ar_msg[] = $msg;
						debug_log(__METHOD__
							." $msg ". PHP_EOL
							.' file_full_path: ' .$file_full_path
							, logger::ERROR
						);
						$response->errors[] = $msg;
						common::$pdata->errors[] = $msg;
						continue; // Skip file
					}

				// Check proper mode config
					if ($import_file_name_mode==='enumerate' && !in_array($import_mode, ['section','section_resource'])) {
						$msg = "Incompatible import mode: '$import_mode' with import_file_name_mode: 'enumerate'. Ignored action";
						debug_log(__METHOD__
							." $msg "
							, logger::ERROR
						);
						$ar_msg[] = $msg;
						$response->errors[] = $msg;
						common::$pdata->errors[] = $msg;
						continue; // Skip file
					}

				// file_data
					$file_data = tool_import_files::get_file_data($tmp_dir, $current_file_name);

				// target_ddo
					if ($import_mode==='section' || $import_mode==='section_resource') {
						// switch import_file_name_mode
						switch ($import_file_name_mode) {
							// match case
							// used to find the filename in the previous uploaded files.
							// it use the filename to match into image section.
							case 'match_freename':
							case 'match':

								$target_section_tipo = $target_ddo_component->section_tipo;
								$target_filename = array_find($ar_ddo_map, function($item) use ($target_section_tipo){
									return $item->role==='target_filename' && $item->section_tipo === $target_section_tipo;
								});
								// get the id of name of the file and match the id of the caller section
								// then use the match to find the image section and match with the filename
								// it match filenames as 1-1-A.jpg
								if( $import_file_name_mode === 'match' ){

									$match_options = new stdClass();
										$match_options->section_id			= $file_data['regex']->section_id;
										$match_options->section_tipo		= $section_tipo;
										$match_options->full_name			= $current_file_name;
										$match_options->target_section_tipo	= $target_section_tipo;
										$match_options->target_filename		= $target_filename;

									$ar_target_section_id = tool_import_files::get_media_section_match_from_souce( $match_options );

								}
								// get the filename and match directly into the image section
								// the match will be into the original filename field into the image section
								// it match filenames as: 0a90723c2936028b08093d7560a098cb-b.jpg
								else if( $import_file_name_mode === 'match_freename' ){

									$match_options = new stdClass();
										$match_options->target_filename		= $target_filename;
										$match_options->full_name			= $current_file_name;

									$ar_target_section_id = tool_import_files::get_media_section_match( $match_options );
								}

								// in both cases is not possible close the search to 1 record
								// so assume that the file could match in multiple image sections
								foreach ($ar_target_section_id as $target_section_id) {

									$target_filename = $current_file_name;
									// as target section_id could has multiple matches for the same image
									// then copy the image with the section_id and do not touch the original file
									// it will be copied for other sections.
									// last section_id will copy the file without create a copy, it remove the uploaded file.
									// multi-section copy strategy
								// When a single filename matches more than one
								// existing media section, the file must be placed
								// into each of them.  For all sections except the
								// last one, create a temporary copy named
								// '<basename>_<section_id>.<ext>' so that the
								// original temp file survives for the next
								// iteration.  The last section gets the original
								// file (which set_media_file() will then remove
								// from tmp after moving it to media storage).
								if( $target_section_id !== end($ar_target_section_id) ){

										$basename_value		= pathinfo($current_file_name)['filename'];
										$basename_extension	= pathinfo($current_file_name)['extension'];

										$target_filename = $basename_value .'_'. $target_section_id .'.'. $basename_extension;
										$source_file	= $tmp_dir . '/' . $current_file_name;
										$target_file	= $tmp_dir . '/' . $target_filename;
										if (false===copy($source_file, $target_file)) {
											debug_log(__METHOD__
												. ' Error coping file: ' . PHP_EOL
												. ' source_file: ' . $source_file . PHP_EOL
												. ' target_file: ' . $target_file
												, logger::ERROR
											);
											$response->errors[] = 'Error coping file';
										}
									}

									// set_media_file. Move uploaded file to media folder and create default versions
										$add_file_options = new stdClass();
											$add_file_options->name			= $target_filename; // string original file name like 'IMG_3007.jpg'
											$add_file_options->key_dir		= $key_dir; // string upload caller name like 'oh1_oh1'
											$add_file_options->tmp_dir		= 'DEDALO_UPLOAD_TMP_DIR'; // constant string name like 'DEDALO_UPLOAD_TMP_DIR'
											$add_file_options->tmp_name		= $target_filename; // string like 'phpJIQq4e'
											$add_file_options->quality		= $custom_target_quality;
											$add_file_options->source_file	= null;
											$add_file_options->size			= $file_data['file_size'];
											$add_file_options->extension	= $file_data['extension'];

										tool_import_files::set_media_file(
											$add_file_options,
											$target_section_tipo,
											$target_section_id,
											$target_component_tipo
										);

										// component processor
										$components_data_options = new stdClass();
											$components_data_options->ar_ddo_map					= $ar_ddo_map;
											$components_data_options->section_tipo					= $section_tipo;
											$components_data_options->section_id					= $section_id;
											$components_data_options->target_section_id				= $target_section_id;
											$components_data_options->target_ddo_component			= $target_ddo_component;
											$components_data_options->file_data						= $file_data;
											$components_data_options->current_file_name				= $target_filename;
											$components_data_options->target_component_model		= $target_component_model;
											$components_data_options->components_temp_data			= $components_temp_data;

										 tool_import_files::set_components_data($components_data_options);
								}

								// continue 2: skip the switch() below AND the current foreach iteration,
								// jumping straight to the next file.  match / match_freename have
								// already handled section creation and file storage inside the foreach
								// above; none of the standard post-match code should run.
								// (!) The stray 'breaK' (capital K) below this line is dead code left
								// from an earlier refactor — it is unreachable after continue 2 but must
								// not be removed under the doc-only rule.
								continue 2;
								breaK;

							case 'enumerate':
							// enumerate: the numeric filename prefix is used as the explicit
							// section_id to create.  If a section with that id already exists,
							// create_record() returns that id without creating a duplicate,
							// so multiple files with the same prefix (e.g. 5-A.jpg, 5-B.jpg)
							// share one section.

								$section = section::get_instance( $section_tipo, 'list', false );

								// Direct numeric case like 1.jpg
								// First record of current section_id force create record. Next files with same section_id, not.
								$target_section_id = $file_data['regex']->section_id ?? null;

								$_base_section_id = $section->create_record((object)[
									'section_id' => $target_section_id
								]);

								$section_id = (int)$_base_section_id;
								break;

							case 'named':
							// named: group files by their descriptive base_name component.
							// When regex extracts no base_name (e.g. purely numeric filenames),
							// fall back to the section_id segment so grouping still works.
							// $ar_processed (accumulated above the loop) is searched linearly;
							// the first entry with a matching base_name supplies its section_id
							// and no new section is created for subsequent files of that group.

								// String case like ánfora.jpg
								// Look already imported files
								$file_data['regex']->base_name = empty($file_data['regex']->base_name)
									? $file_data['regex']->section_id
									: $file_data['regex']->base_name;

								$ar_filter_result = array_filter($ar_processed, function($element) use($file_data) {
									return $file_data['regex']->base_name === $element->file_data['regex']->base_name;
								});
								$filter_result = reset($ar_filter_result);
								if (!empty($filter_result->section_id)) {
									# Re-use safe already created section_id (file with same base_name like 'ánforas')
									$_base_section_id = $filter_result->section_id;
								}else{
									$section = section::get_instance($section_tipo, 'edit', false);
									$_base_section_id = $section->create_record();
								}
								$section_id = (int)$_base_section_id;
								break;

							default:
								// Create new section
								$section = section::get_instance($section_tipo);
								$section_id = $section->create_record();
								break;
						}//end switch ($import_file_name_mode)

						// set target_ddo from tool_config ddo_map
						$target_ddo = array_find($ar_ddo_map, function($item) use($current_component_option_tipo){
							return $item->role === 'component_option' && $item->tipo===$current_component_option_tipo;
						});

						if (!is_object($target_ddo)) {
							debug_log(__METHOD__
								." target_ddo is empty and will be ignored "
								.' role: component_option' .  PHP_EOL
								.' role: tipo' .  to_string($current_component_option_tipo)
								, logger::ERROR
							);
							$response->errors[] = 'empty target_ddo for role "component_option" and tipo "$current_component_option_tipo"';
							continue;
						}

						// 'self' substitution
						// When the ontology uses 'self' as a placeholder section_tipo (a
						// convention for virtual/inline sections that live in the same table as
						// their parent), substitute the actual calling section_tipo at runtime.
						if( $target_ddo->section_tipo === 'self'){
							$target_ddo->section_tipo = $section_tipo;
						}

					}else{
						// 'default' import_mode: files go directly into the portal that triggered
						// the tool.  Build a minimal dd_object pointing back at the calling
						// component ($tipo) in the calling section ($section_tipo) so that the
						// add_new_element() call below works with the portal as the target.
						$target_ddo = new dd_object();
							$target_ddo->set_tipo($tipo);
							$target_ddo->set_section_tipo($section_tipo);
							$target_ddo->set_model(ontology_node::get_model_by_tipo($tipo, true));
					}//end if($import_mode==='section')

				// target_ddo check
					if(empty($target_ddo)){
						debug_log(__METHOD__
							." target_ddo is empty and will be ignored "
							, logger::ERROR
						);
						$response->errors[] = 'target_ddo is empty and will be ignored';
						continue;
					}

				// set the media into the component_portal and its own target section.
				// the media can be processed by a specific script ($current_file_processor)
				// if media has not a specific process, import directly.
					if ( !empty($current_file_processor) ) {
						// file_processor
						// Global var button properties JSON data array
						// Optional additional file script processor defined in button import properties
						// Note that var $file_processor_properties is the button properties JSON data, NOT current element processor selection

						if ( empty($file_processor_properties) ) {
							debug_log(__METHOD__
								.' Undefined file processor properties'. PHP_EOL
								.' current value_obj: '. json_encode( $value_obj )
								, logger::ERROR
							);
							$response->errors[] = 'Undefined file processor properties';
							continue;
						}
						$processor_options = new stdClass();
							$processor_options->file_processor				= $current_file_processor;
							$processor_options->file_processor_properties	= $file_processor_properties;
							// Standard arguments
							$processor_options->file_name				= $current_file_name;
							$processor_options->file_path				= $tmp_dir;
							$processor_options->section_tipo			= $section_tipo;
							$processor_options->section_id				= $section_id;
							$processor_options->tool_config				= $tool_config;
							$processor_options->key_dir					= $key_dir;
							$processor_options->custom_target_quality	= $custom_target_quality;
							$processor_options->components_temp_data	= $components_temp_data;

						tool_import_files::file_processor( $processor_options );

					} else {

						// Usually files
						// media files without process assigned will be imported into the component_portal of the media
						// Create new media section and set the imported file to it.
						// Media files that has not file_processor as splits or other process.

						// import_mode conditional
						// All cases are section or default except section_resource import from resources (rsc170  - Images)
						switch ($import_mode) {
							case 'section_resource':
								// Fix new section created as current_section_id
								$target_section_id		= $section_id;
								$target_section_tipo	= $section_tipo;
								break;

							case 'section':
							case 'default':
								// component portal. Component (expected portal)
								$component_portal = component_common::get_instance(
									$target_ddo->model,
									$target_ddo->tipo,
									$section_id,
									'list',
									DEDALO_DATA_NOLAN,
									$target_ddo->section_tipo
								);
								// Portal target_section_tipo
								$target_section_tipo = $target_ddo->target_section_tipo ?? $component_portal->get_ar_target_section_tipo()[0];

								// section. Create a new section for each file from current portal
								$portal_response = (object)$component_portal->add_new_element((object)[
									'target_section_tipo' => $target_section_tipo
								]);
								if ($portal_response->result===false) {
									$current_msg = "Error on create portal children: ".$portal_response->msg;
									$response->result 	= false;
									$response->msg 		= $current_msg;
									$response->errors[] = $current_msg;
									debug_log(__METHOD__." $response->msg ", logger::ERROR);
									return $response;
								}

								// save portal
						// add_new_element() buffers the new locator in memory;
						// Save() persists the updated portal relation to the database.
								$component_portal->Save();

								// Fix new section created as current_section_id
								$target_section_id = $portal_response->section_id;

								// component portal new section order. Order portal record when is $import_file_name_mode=enumerate
									// if ($import_file_name_mode==='enumerate' || $import_file_name_mode==='named' ) {
									// 	$portal_norder = $regex']->portal_order!=='' ? (int)$regex']->portal_order : false;
									// 	if ($portal_norder!==false) {
									// 		$changed_order = $component_portal->set_locator_order( $portal_response->added_locator, $portal_norder );
									// 		if ($changed_order===true) {
									// 			$component_portal->Save();
									// 		}
									// 		debug_log(__METHOD__
									// 			." CHANGED ORDER FOR : ".$regex']->portal_order." ".to_string($regex'])
									// 			, logger::DEBUG
									// 		);
									// 	}
									// }
								break;
						}

						// Set components data
						// set data into target section of the component adding information provided by the user.
							$components_data_options = new stdClass();
								$components_data_options->ar_ddo_map					= $ar_ddo_map;
								$components_data_options->section_tipo					= $section_tipo;
								$components_data_options->section_id					= $section_id;
								$components_data_options->target_section_id				= $target_section_id;
								$components_data_options->target_ddo_component			= $target_ddo_component;
								$components_data_options->file_data						= $file_data;
								$components_data_options->current_file_name				= $current_file_name;
								$components_data_options->target_component_model		= $target_component_model;
								$components_data_options->components_temp_data			= $components_temp_data;

							tool_import_files::set_components_data($components_data_options);

						// set_media_file. Move uploaded file to media folder and create default versions
							$add_file_options = new stdClass();
								$add_file_options->name			= $current_file_name; // string original file name like 'IMG_3007.jpg'
								$add_file_options->key_dir		= $key_dir; // string upload caller name like 'oh1_oh1'
								$add_file_options->tmp_dir		= 'DEDALO_UPLOAD_TMP_DIR'; // constant string name like 'DEDALO_UPLOAD_TMP_DIR'
								$add_file_options->tmp_name		= $current_file_name; // string like 'phpJIQq4e'
								$add_file_options->quality		= $custom_target_quality;
								$add_file_options->source_file	= null;
								$add_file_options->size			= $file_data['file_size'];
								$add_file_options->extension	= $file_data['extension'];

							tool_import_files::set_media_file(
								$add_file_options,
								$target_section_tipo,
								$target_section_id,
								$target_component_tipo
							);
					}

				// ar_processed. Add as processed
					$processed_info = new stdClass();
						$processed_info->file_name				= $value_obj->name;
						$processed_info->file_processor			= $value_obj->file_processor ?? null;
						$processed_info->target_component_tipo	= $target_component_tipo;
						$processed_info->section_id				= $section_id;
						$processed_info->file_data				= $file_data;
					$ar_processed[] = $processed_info;

				// CLI process data
					if ( running_in_cli()===true ) {
						common::$pdata->current_time	= exec_time_unit($start_time2, 'ms');
						common::$pdata->total_ms		= common::$pdata->total_ms + common::$pdata->current_time; // cumulative time
						// send to output
						print_cli(common::$pdata);
					}

				$total_processed++;

				debug_log(__METHOD__
					." Imported files and data from $section_tipo - $section_id"
					, logger::WARNING
				);
			}//end foreach ((array)$files_data as $key => $value_obj)

		// session cleanup: clear temp section data for all touched input_component section types
		// Input component values are buffered in $_SESSION['dedalo']['section_temp_data']
		// under keys that include the section_tipo.  After import completes, purge those
		// entries so the next use of the import dialog starts with empty form fields.
		// Keys are matched by a regex built from $input_components_section_tipo, which is
		// populated by set_components_data() (via the 'input_component' role in the ddo_map).
		// (!) $input_components_section_tipo is declared near the top of this method but
		// never populated here — set_components_data() currently does not write back into it.
		// The cleanup block is therefore a no-op in the current codebase.
			if (!empty($input_components_section_tipo) && !empty($_SESSION['dedalo']['section_temp_data'])) {

				// Create regex pattern to match any of the section types. Pattern example: /_(type1|type2)_/
				$pattern = '/(' . implode('|', array_map(function($t){ return preg_quote($t, '/'); }, $input_components_section_tipo)) . ')/';

				$_SESSION['dedalo']['section_temp_data'] = array_filter(
					(array)$_SESSION['dedalo']['section_temp_data'],
					function($key) use ($pattern) {
						// Keep items that DO NOT match the pattern
						return preg_match($pattern, (string)$key) === 0;
					},
					ARRAY_FILTER_USE_KEY
				);
			}

		// response
		// result is always true here — partial imports are considered a success so
		// the caller can display the imported count and error list together rather
		// than treating the whole batch as a hard failure.
			$response->result	= true;
			$response->msg		= ($total_processed<$total || count(common::$pdata->errors)>0)
				? 'Import files done with errors. Imported: '.$total_processed." of " .$total
				: 'Import files done successfully. Imported: '.$total_processed." of " .$total;
			$response->time		= exec_time_unit_auto($start_time);
			$response->memory	= dd_memory_usage();
			$response->errors	= array_unique( array_merge($response->errors, common::$pdata->errors) );


		return $response;
	}//end import_files



	/**
	 * GET_MEDIA_SECTION_MATCH_FROM_SOUCE
	 * Resolves which existing media sections should receive a re-uploaded file by
	 * using the numeric section_id embedded in the filename to look up the source
	 * record and then comparing the stored filename values of all linked media
	 * sections against the uploaded filename.
	 *
	 * This implements the 'match' import_file_name_mode strategy:
	 *   1. Parse the numeric prefix from the filename (e.g. '11' from '11-1.tiff').
	 *   2. Load the source section_record for that id in $section_tipo.
	 *   3. Walk its relation data to collect all locators pointing at $target_section_tipo.
	 *   4. For each linked media section, instantiate the target_filename component
	 *      and retrieve its stored value.
	 *   5. Compare basenames (extension stripped) to allow format changes
	 *      (e.g. the record stores 'portrait.jpg' but the upload is 'portrait.tiff').
	 *   6. Return the section_id values of all matching entries.
	 *
	 * (!) The method name contains a typo ('Souce' instead of 'Source'); it is
	 * preserved as-is because it appears in API_ACTIONS and changing it would be
	 * an API-breaking change.
	 *
	 * @param object $options Search context with properties:
	 *   ->section_id          string  Numeric prefix from the filename, e.g. '11'.
	 *   ->section_tipo        string  Section tipo of the source record, e.g. 'oh1'.
	 *   ->target_section_tipo string  Section tipo of the media sections, e.g. 'rsc170'.
	 *   ->full_name           string  Full uploaded filename including extension.
	 *   ->target_filename     object  DDO map entry (role 'target_filename') carrying:
	 *                                   ->tipo         string  Component tipo for stored name.
	 *                                   ->section_tipo string  Section tipo of that component.
	 * @return array Integer-indexed array of section_id values (int|string) for media
	 *               sections whose stored filename matches the uploaded file's basename.
	 *               Empty array when no match is found.
	 */
	public static function get_media_section_match_from_souce( object $options ) : array {

		$section_id				= $options->section_id;
		$section_tipo			= $options->section_tipo;
		$target_section_tipo	= $options->target_section_tipo;
		$full_name				= $options->full_name;
		$target_filename		= $options->target_filename;

		// short vars
		// Determine the model and language of the target_filename component so we can
		// instantiate it correctly for each candidate media section below.
		$tipo	= $target_filename->tipo;
		$model	= ontology_node::get_model_by_tipo($tipo,true);
		$lang	= ontology_node::get_translatable($tipo) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;

		// source section load
		// The numeric section_id from the filename identifies a record in the caller
		// section (e.g. oh1:11).  Load the full section record so we can walk its
		// relation data to discover which media sections are already linked to it.
		$section_record = section_record::get_instance(
			$section_tipo,
			(int)$section_id
		);

		$data = $section_record->get_data();

		// collect locators pointing at the target media section tipo
		// The relation map on the section_record is keyed by component_tipo;
		// each value is an array of locator objects.  We gather every locator
		// whose section_tipo matches the requested target (e.g. 'rsc170').
		$target_locators = [];
		if (!empty($data->relation)) {
			foreach ($data->relation as $component_tipo => $locators) {
				foreach ($locators as $locator) {
					if ($locator->section_tipo === $target_section_tipo) {
						$target_locators[] = $locator;
					}
				}
			}
		}

		// filename matching loop
		// For each linked media section, load the stored filename component and
		// compare its value's basename (extension stripped) to the upload's basename.
		// Extension is stripped so that a .jpg already on record matches a .tiff
		// replacement upload.
		$match_section_id = [];
		foreach ($target_locators as $target_locator) {

			// target_filename component for this media section
			$target_name_component = component_common::get_instance(
				$model, // string model
				$tipo, // string tipo
				$target_locator->section_id, // string section_id
				'list', // string mode
				$lang, // string lang
				$target_locator->section_tipo // string section_tipo
			);

			$value = $target_name_component->get_value();

			// check without extension, uploaded files could be different format of the previous upload.
			$basename_value		= pathinfo($value)['filename'];
			$basename_full_name	= pathinfo($full_name)['filename'];

			if($basename_value === $basename_full_name){
				$match_section_id[] = $target_locator->section_id;
			}
		}


		return $match_section_id;
	}//end get_media_section_match_from_souce



	/**
	 * GET_MEDIA_SECTION_MATCH
	 * Finds existing media sections that match an uploaded filename by executing a
	 * full-text search query against the stored filename component.  This implements
	 * the 'match_freename' import_file_name_mode strategy, where the match target is
	 * the whole filename rather than a numeric id prefix.
	 *
	 * Search strategy:
	 *   1. Strip the file extension from the uploaded filename to tolerate format
	 *      changes (e.g. 'portrait.jpg' on record, 'portrait.tiff' being uploaded).
	 *   2. Append a literal '.' to the search term as a boundary marker so that
	 *      'my_image.' matches 'my_image.jpg' but NOT 'my_image2.jpg'.
	 *   3. Build an SQO (search_query_object) with a $and filter on the path
	 *      returned by search::get_query_path() for the target_filename component.
	 *   4. Execute the search and collect section_id values from the result set.
	 *
	 * The SQO sets limit(0) (= no limit) and skip_projects_filter(true) because
	 * import operations must be able to update records regardless of the active
	 * project filter.
	 *
	 * @param object $options Match context with properties:
	 *   ->target_filename object  DDO map entry (role 'target_filename') with:
	 *                               ->tipo         string  Component tipo of stored filename field.
	 *                               ->section_tipo string  Section tipo to search within.
	 *   ->full_name       string  Uploaded filename including extension, e.g. 'portrait.tiff'.
	 * @return array Integer-indexed array of section_id values (int|string) from the search
	 *               result.  Empty array when no records match.
	 */
	public static function get_media_section_match( object $options ) : array {

		// short vars
		$target_tipo			= $options->target_filename->tipo; // string tipo
		$target_section_tipo	= $options->target_filename->section_tipo; // string section_tipo
		$full_name 				= $options->full_name;

		// resolve search path
		// get_query_path() translates the component tipo + section_tipo into a
		// dot-separated ontology path string used by the search engine to locate
		// the correct DB column/field (e.g. 'rsc170.rsc398').
		$path = search::get_query_path(
			$target_tipo, // string tipo
			$target_section_tipo, // string section_tipo
			true // bool resolve_related
		);
		// the image has extension, is possible that the image can change the extension
		// the original is a .jpg and modified is a .tiff with alpha channel.
		$basename_full_name	= pathinfo($full_name)['filename'];

		// build the SQO filter
		// A single $and clause with one term is equivalent to a plain text search,
		// but using $and leaves the structure open for additional clauses in future.
			$operator = '$and';
			$filter = new stdClass();
				$filter->{$operator} = [];

			// set the filter with the base name and add '.' to the final,
			// the point is between name and extension
			// adding it could avoid false match with short names
			// as my_image.tiff and my_image2.tiff
			// searching `my_image.` will remove the second case
			$filter_item = new stdClass();
				$filter_item->q = $basename_full_name .'.';
				$filter_item->path = $path;

			$filter->{$operator}[] = $filter_item;

			$sqo = new search_query_object();
				$sqo->set_section_tipo([$target_section_tipo]);
				$sqo->set_limit(0);
				$sqo->set_skip_projects_filter(true);
				$sqo->set_filter($filter);

		// search exec
			$search		= search::get_instance($sqo);
			$db_result	= $search->search();

		// stored the section_id of the match sections.
		$match_section_id = [];
		foreach ($db_result as $section_data) {
			$match_section_id[] = $section_data->section_id;
		}

		return $match_section_id;
	}//end get_media_section_match



	/**
	 * SET_COMPONENTS_DATA
	 * Iterates the DDO map from tool_config and persists import-related data into the
	 * components of the newly created target section.  Roles drive what is saved:
	 *
	 *   'target_filename'  — Writes the original uploaded filename (or its basename,
	 *                        when $ddo->only_basename is true) into a text component.
	 *                        Only writes when the component is currently empty, so
	 *                        re-importing a file does not overwrite a manually edited
	 *                        title.
	 *
	 *   'target_date'      — Extracts the creation date from the file's embedded
	 *                        metadata via get_media_file_date() and stores it as a
	 *                        dd_date start value.  Only writes when the component
	 *                        is currently empty.
	 *
	 *   'input_component'  — Propagates form field values captured in the import UI:
	 *                        - Non-translatable: reads from $components_temp_data
	 *                          (indexed by tipo + section_tipo) and saves the value
	 *                          directly.
	 *                        - Translatable: instantiates a temporary component
	 *                          ($is_temp = true, section_id = 1) to read the temp
	 *                          data handler, then copies that data into the real
	 *                          destination component in all languages.
	 *
	 *   'component_option' — Skipped; these drive import routing, not data storage.
	 *
	 * The destination section_id is chosen by comparing the DDO's section_tipo to
	 * the caller's section_tipo: if they match, data goes into the calling record;
	 * otherwise it goes into the target media section (target_section_id).
	 *
	 * @param object $options Propagation context with properties:
	 *   ->ar_ddo_map              array    Full DDO map from tool_config.
	 *   ->section_tipo            string   Caller section tipo.
	 *   ->section_id              int      Caller section ID.
	 *   ->target_section_id       int      Newly created media section ID.
	 *   ->target_ddo_component    object   DDO entry with role 'target_component'.
	 *   ->file_data               array    Output of get_file_data() for the current file.
	 *   ->current_file_name       string   Decoded filename (used for 'target_filename').
	 *   ->target_component_model  string   Model class name, e.g. 'component_image'.
	 *   ->components_temp_data    array    Temp component data from the import form; may be empty.
	 * @return void
	 */
	public static function set_components_data( object $options ) {

		// options
			$ar_ddo_map						= $options->ar_ddo_map;
			$section_tipo					= $options->section_tipo;
			$section_id						= $options->section_id;
			$target_section_id				= $options->target_section_id;
			$target_ddo_component			= $options->target_ddo_component;
			$file_data						= $options->file_data;
			$current_file_name				= $options->current_file_name;
			$target_component_model			= $options->target_component_model;
			$components_temp_data			= $options->components_temp_data ?? [];

		// Index components_temp_data for O(1) lookup
		// $components_temp_data arrives as a flat array of component-data objects.
		// Build a two-level associative map [$tipo][$section_tipo] so that the
		// 'input_component' branch below can find the right entry in constant time
		// instead of scanning the full array for every DDO entry.
		$indexed_temp_data = [];
		foreach ($components_temp_data as $item) {
			if (isset($item->tipo) && isset($item->section_tipo)) {
				$indexed_temp_data[$item->tipo][$item->section_tipo] = $item;
			}
		}

		// ar_ddo_map iterate. role based actions
		// Create the ddo components with the data to store with the import
		// when the component has a input in the tool propagate temp section_data
		// Update created section with temp section data
		// when the component stored the filename, get the filename and save it
		foreach ($ar_ddo_map as $ddo) {

			if($ddo->role === 'component_option'){
				continue;
			}

			$is_translatable		= ontology_node::get_translatable($ddo->tipo);
			$model					= ontology_node::get_model_by_tipo($ddo->tipo,true);
			$current_lang			= $is_translatable ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
			// destination routing
			// If the DDO lives in the same section as the caller (e.g. a title
			// field on the parent section), write to the caller's section_id.
			// Otherwise write to the freshly created target media section.
			$destination_section_id	= ($ddo->section_tipo===$section_tipo)
				? $section_id
				: $target_section_id;

			// Current component instance
			$component = component_common::get_instance(
				$model,
				$ddo->tipo,
				$destination_section_id,
				'list',
				$current_lang,
				$ddo->section_tipo
			);

			switch ($ddo->role) {
				case 'target_filename':

					// Fill the component with image data only when the field is empty. Do not update existing data
					$component_data = $component->get_data();
					if(empty($component_data)){
						// name_to_save: full filename or stripped basename
					// Some projects want only the descriptive middle segment (e.g. 'portrait'
					// from '73-portrait-A.jpg') stored as the title — enable this by setting
					// only_basename:true on the DDO entry in the ontology properties.
					// Default (only_basename absent or false): stores the complete original
					// filename including section_id prefix and extension.
						$name_to_save = (isset($ddo->only_basename) && $ddo->only_basename === true)
							? $file_data['regex']->base_name // only the name of the file without section_id or field
							: $current_file_name; // full name with extension

						$data_to_save = [(object) [
							'value' => $name_to_save,
							'lang' => $current_lang
						]];
						$component->set_data($data_to_save);
						$component->save();
					}
					break;

				case 'target_date':

					// media_file_date (using EXIF or similar metadata source into the file)
					// Fill the component with date only when the field is empty. Do not update existing data
					$component_data = $component->get_data();
					if (empty($component_data)) {
						$dd_date = tool_import_files::get_media_file_date($file_data, $target_component_model);
						if (!empty($dd_date)) {
							$data_element = new stdClass();
								$data_element->start = $dd_date;
							$component->set_data([$data_element]);
							$component->save();
						}
					}
					break;

				case 'input_component':

					// component_data save
					if ($is_translatable===false) {

						// use value from request

						// component_data. Get from indexed temp data or request and save
						$component_data = $indexed_temp_data[$ddo->tipo][$ddo->section_tipo] ?? null;

						// The client sends the full component dd_object (with value, datalist, etc.)
					// not just the raw value array; extract the value property.
						if(is_object($component_data) && !empty($component_data->value)){
							$component->set_data($component_data->value);
							$component->save();
						}

					}else{

						// get value from instances of the temporal component in all languages

						// Translatable input_component path
						// For multi-language fields the temp data is stored per-language inside
						// the component instance (not in $components_temp_data which only carries
						// the current UI language).  Instantiate the component at section_id=1
						// (a deliberately invalid id that the temp handler ignores) and set
						// is_temp=true to switch it to the session-backed temp data source.
						$temp_component = component_common::get_instance(
							$model,
							$ddo->tipo,
							1, // Fake section_id for temporal component
							'list',
							$current_lang,
							$ddo->section_tipo
						);
						// Set as temporal component forces to use the tmp data handler.
						$temp_component->is_temp = true;

						// set to real component the temporal component data in all languages
						$temp_data = $temp_component->get_data();
						$component->set_data($temp_data);
						$component->save();
					}
					break;

				default:
					// Nothing to do here
					break;
			}//end switch ($ddo->role)
		}//end foreach ($ar_ddo_map as $ddo)
	}//end set_components_data



}//end class tool_import_files
