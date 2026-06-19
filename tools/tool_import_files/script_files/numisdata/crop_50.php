<?php declare(strict_types=1);

/**
* CROP_50
* Coin-image splitter: auto-detects obverse and reverse faces in a single
* scan image and inserts each crop into the corresponding images portal.
*
* This processor is purpose-built for the numisdata4 numismatic-object section.
* It assumes the source image shows exactly TWO coins (obverse and reverse) side
* by side on a clean white background.  The pipeline is:
*
*   1. Convert the source to a 1-bit (bilevel) grayscale projection so that
*      background pixels become white and coin pixels become black.
*   2. Run ImageMagick connected-components analysis (area threshold 30 000 px)
*      to locate the two largest foreground blobs.
*   3. Parse the bounding-box data, discard noise regions (< 50 × 50 px), and
*      abort if exactly two regions are not found — a third blob indicates
*      insufficient background contrast.
*   4. Crop each region from the original image and pad it to the height of
*      the taller coin (white fill, centred) so both outputs have identical
*      height.
*   5. Iterate $custom_arguments (keyed by destination label, valued by portal
*      component tipo), create a new child section in each portal, move the
*      cropped file into its permanent media location, and populate related
*      text/date components via tool_import_files::set_components_data().
*
* Limitations:
*   - Only works with plain white (or near-white) backgrounds; textured or
*     coloured backdrops will produce too many connected-component blobs and
*     the function will return an error without creating any records.
*   - Exactly two portals must be present in $custom_arguments (one per face).
*   - The images are sorted left-to-right in the source scan (not by
*     obverse/reverse semantic distinction — the caller controls that mapping
*     via the $custom_arguments key order).
*
* Invocation:
*   Registered as a `file_processor` function in tool_import_files (SEC-053
*   sandbox: script confined to the tool root, function_name validated as a
*   bare identifier).  Called by tool_import_files::file_processor() which
*   supplies the standard $request_options object assembled from the per-file
*   processor configuration.
*
* @param object $request_options  Standard processor options assembled by
*                                 tool_import_files::file_processor():
*   ->section_tipo          string       Source section tipo, e.g. 'numisdata4'.
*   ->section_id            int          Source section ID.
*   ->target_component      string|null  Tipo of the target media component.
*   ->file_name             string       Original uploaded filename (with extension).
*   ->file_path             string       Absolute directory path of the upload temp dir.
*   ->tool_config           object       Full tool configuration; must carry a `ddo_map`
*                                        array with at least one entry whose `role` is
*                                        'target_component'.
*   ->key_dir               string       Upload subdirectory token (e.g. 'oh1_oh1').
*   ->custom_target_quality string|null  Target media quality; falls back to component
*                                        default when null.
*   ->custom_arguments      iterable     Keyed iterable mapping destination label to
*                                        portal component tipo; must contain exactly two
*                                        entries (obverse / reverse portal tipos).
*   ->components_temp_data  array|null   Temporary component data propagated from the
*                                        import UI form fields.
* @return object $response  stdClass with:
*   ->result  bool    true on success; false if the image has more than 2 detected
*                     regions, if portal creation fails, or if media storage fails.
*   ->msg     string  Human-readable outcome message.
*/
function crop_50( object $request_options ) : object {

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed';

	// Options normalisation
	// Declare every expected property with a null default so that downstream
	// code can use simple variable assignment without isset() guards.
	$options = new stdClass();
		$options->section_tipo			= null;
		$options->section_id			= null;
		$options->target_component		= null;
		$options->file_name				= null;
		$options->file_path				= null;
		$options->tool_config			= null;
		$options->key_dir				= null;
		$options->custom_target_quality	= null;
		$options->custom_arguments 		= null;
		$options->components_temp_data	= null;
		foreach ($request_options as $key => $value) {
			if (property_exists($options, $key)) {
				$options->$key = $value;
				$$key = $value; // Create simple variables for easy select
			}
		}

	// target component info
	// Locate the DDO entry whose role is 'target_component'; its tipo identifies
	// the media component (e.g. component_image) that will receive each crop file.
		$target_ddo = array_find($tool_config->ddo_map, function($item){
			return $item->role === 'target_component';
		});
		$target_component_tipo	= $target_ddo->tipo;
		$target_component_model	= ontology_node::get_model_by_tipo($target_component_tipo, true);

	// Resolve the source file path from the upload temp directory.
	// $file_data carries: dir_path, file_path, file_name (no ext), file_name_full,
	// extension, file_size, and regex (parsed naming convention segments).
	$file_data 		= tool_import_files::get_file_data($file_path, $file_name);
	$source_image 	= $file_data['file_path'];

	// Intermediate bilevel (black/white) projection stored alongside the source.
	// The '_projection.png' suffix is ephemeral; it is deleted after analysis (step 4).
	$bit_image =  $file_data['dir_path'] . '/' .$file_data['file_name'] . '_projection.png';// . $file_data['extension'];

	// Cropping the image

	// Step 1: Generate 1-pixel grayscale image
	// Security: $source_image / $bit_image are derived from the user-uploaded
	// filename (`tool_import_files::get_file_data()` concatenates `file_name`).
	// escapeshellarg prevents command injection through crafted filenames.
	$conver_to_bit = ImageMagick::get_imagemagick_installed_path() . " " . escapeshellarg($source_image) . " -colorspace gray -negate -threshold 5% -type bilevel " . escapeshellarg($bit_image);
	shell_exec($conver_to_bit);

	// Step 2: Extract grayscale values
	// -connected-components 8: 8-connectivity (diagonal neighbours count as connected).
	// -define connected-components:area-threshold=30000: ignore blobs smaller than
	//   30 000 pixels to suppress background texture noise without manual tuning.
	// The awk pipe extracts columns 2 (bounding box) and 5 (mean colour) from each
	// component line; NR>1 skips the header row emitted by ImageMagick.
	$objects_info = $file_data['dir_path'] . '/objects_info.txt';
	$cmd = ImageMagick::get_imagemagick_installed_path() . " " . escapeshellarg($bit_image) . " -define connected-components:verbose=true -define connected-components:area-threshold=30000 -connected-components 8 null: | awk 'NR>1{print $2, $5}' > " . escapeshellarg($objects_info);
	shell_exec($cmd);

	// Step 3: Parse bounding boxes from connected components data
	// Pattern: WxH+X+Y gray(255) — the gray(255) qualifier ensures we match
	// only white (background-inverted) blobs, i.e. the coin silhouettes.
	$data = file_get_contents($objects_info);
	preg_match_all('/(\d+)x(\d+)\+(\d+)\+(\d+) gray\(255\)/', $data, $matches, PREG_SET_ORDER);

	// step 4: get the regions found.
	$regions = [];
	foreach ($matches as $match) {
		[$full, $w, $h, $x, $y ] = $match;

		// Skip small blobs (noise)
		// 50 × 50 px threshold discards scanner dust, fold shadows, and JPEG
		// artefacts near the edges that survive the area-threshold in step 2.
		if ($w > 50 && $h > 50) {
			$regions[] = ['x' => $x, 'y' => $y, 'w' => $w, 'h' => $h];
		}
	}

	// remove the process files.
	// Intermediate files are no longer needed; remove them before any early return
	// so they do not accumulate in the upload temp directory on repeated failures.
		unlink($bit_image);
		unlink($objects_info);

	// if the image has more than 2 regions, stop the process, the image background is not clean enough.
	// Exactly 2 blobs are required — the obverse and reverse coin faces.
	// Fewer than 2 means the coins merged into a single blob (background too dark);
	// more than 2 means speckles or a shadow were detected as extra objects.
	if( count($regions) !== 2){
		$response->msg = 'Error. Image with a dirty background, impossible to identify the subject, to many matches';
		return $response;
	}

	// max height
	// it will used to set the most higher value of the height to the other image.
	// Sort by descending height to extract the tallest region's height before
	// resorting by X coordinate.  This ensures both output files have identical
	// height even when the two coins differ in size (padding is added as white fill).
	usort($regions, fn($a, $b) => $b['h'] <=> $a['h']);
	$max_height = $regions[0]['h'];

	// Step 5: Sort regions left to right
	// Canonical order: index 0 = left coin (typically obverse), index 1 = right (reverse).
	// The mapping to actual portal components is determined by the caller's
	// $custom_arguments key order, not hardcoded here.
	usort($regions, fn($a, $b) => $a['x'] <=> $b['x']);

	// Step 6: Crop each coin from original image and add the white space for the smallest height image.
	// -crop WxH+X+Y: extract the bounding box of the detected coin.
	// +repage: remove the virtual canvas offset left by -crop so subsequent
	//   geometry calculations work against the cropped dimensions.
	// -background white -gravity center -extent WxH: pad the shorter coin to
	//   $max_height by adding equal white margins above and below (centred gravity).
	foreach ($regions as $key => $region) {
		$outputFile = $file_data['dir_path'] . '/' .$file_data['file_name'] . '_crop-' .$key. '.' . $file_data['extension'];

			// Security: %s placeholders carry user-controlled paths; switch to %s
			// with explicit escapeshellarg() so quoted filenames cannot break out
			// of the shell argument context. %d casts integer regions.
			$cmd = sprintf(
				ImageMagick::get_imagemagick_installed_path() . " %s -crop %dx%d+%d+%d +repage -background white -gravity center -extent %dx%d %s",
				escapeshellarg($source_image),
				(int)$region['w'], // crop width
				(int)$region['h'], // crop height
				(int)$region['x'], // crop from x point
				(int)$region['y'], // crop from y point
				(int)$region['w'],// expand to the width
				(int)$max_height, // expand to the max_height (the tiny image will expand with white to sustain the height in both images)
				escapeshellarg($outputFile),
			);

			exec($cmd);
	}

	// Portal ingestion loop
	// $custom_arguments is an iterable (stdClass or array) mapping destination label
	// to portal component tipo, e.g. {"obverse": "numisdata56", "reverse": "numisdata57"}.
	// $crop_number tracks which cropped file (0-indexed) corresponds to each portal.
	$crop_number = 0;
	foreach ($custom_arguments as $destination => $component_tipo) {

		// Resolve the portal component model and instantiate it against the source section
		// so that add_new_element() creates a linked child record in that portal.
		$model_name 		= ontology_node::get_model_by_tipo($component_tipo,true);
		$component_portal 	= component_common::get_instance(
			$model_name,
			$component_tipo,
			$section_id,
			'edit',
			DEDALO_DATA_NOLAN,
			$section_tipo
		);

		// Portal target_section_tipo
		// First entry of ar_target_section_tipo defines the section type that holds
		// images linked through this portal (e.g. 'rsc170' — the Images resource section).
		$target_section_tipo = $component_portal->get_ar_target_section_tipo()[0];
		// $properties 		 = $component_portal->get_properties();
		// $tool_properties 	 = $properties->ar_tools_name->tool_import_files;

		// Create a new child section in the images resource linked through this portal.
		$portal_response = (object)$component_portal->add_new_element((object)[
			'target_section_tipo' => $target_section_tipo
		]);
		if ($portal_response->result===false) {
			$response->result 	= false;
			$response->msg 		= "Error on create portal children: ".$portal_response->msg;
			return $response;
		}
		// save portal if all is OK
		// Persist the updated portal relation data so the new child record is linked.
		$component_portal->Save();

		$current_section_id = $portal_response->section_id;

		// File target name
		// Reconstruct the crop filename produced in Step 6 using the same naming
		// pattern: <base_name>_crop-<index>.<extension>.
		$crop_file_name	= $file_data['file_name'] . "_crop-" . $crop_number . '.' . $file_data['extension'];

		// File target data
		// Re-parse the cropped file to get its size and extension metadata;
		// these values are forwarded to set_media_file() as part of $add_file_options.
		$file_crop_data = tool_import_files::get_file_data($file_data['dir_path'], $crop_file_name);

		// Set components data
		// set data into target section of the component adding information provided by the user.
		// Propagates filename, EXIF date, and import-form field values (from
		// $components_temp_data) into the components of the newly created image section.
			$components_data_options = new stdClass();
				$components_data_options->ar_ddo_map					= $tool_config->ddo_map ?? [];
				$components_data_options->section_tipo					= $section_tipo;
				$components_data_options->section_id					= $section_id;
				$components_data_options->target_section_id				= $current_section_id;
				$components_data_options->target_ddo_component			= $target_ddo;
				$components_data_options->file_data						= $file_data;
				$components_data_options->current_file_name				= $file_name;
				$components_data_options->target_component_model		= $target_component_model;
				$components_data_options->components_temp_data			= $components_temp_data;

			tool_import_files::set_components_data($components_data_options);

		// set_media_file. Move uploaded file to media folder and create default versions
		// (!) $add_file_options->tmp_dir must be the *string constant name*
		// 'DEDALO_UPLOAD_TMP_DIR', not the resolved path — add_file() resolves
		// it internally via constant().  Passing the path directly causes
		// the media move to fail silently.
		$add_file_options = new stdClass();
			$add_file_options->name			= $crop_file_name; // string original file name like 'IMG_3007.jpg'
			$add_file_options->key_dir		= $key_dir; // string upload caller name like 'oh1_oh1'
			$add_file_options->tmp_dir		= 'DEDALO_UPLOAD_TMP_DIR'; // constant string name like 'DEDALO_UPLOAD_TMP_DIR'
			$add_file_options->tmp_name		= $crop_file_name; // string like 'phpJIQq4e'
			$add_file_options->quality		= $custom_target_quality;
			$add_file_options->source_file	= null;
			$add_file_options->size			= $file_crop_data['file_size'];
			$add_file_options->extension	= $file_crop_data['extension'];

		// Save file and verions
		// Moves the cropped file from the upload temp dir to permanent media storage
		// and triggers derivative generation (thumbnails, web previews, etc.).
		tool_import_files::set_media_file(
			$add_file_options,
			$target_section_tipo,
			$current_section_id,
			$target_component_tipo
		);

		$crop_number++;
	}

	$response->result	= true;
	$response->msg		= 'OK. Request done';


	return $response;
}//end crop_50
