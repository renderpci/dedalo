<?php
/*
* CLASS COMPONENT_SVG
* Manage specific component input text logic
* Common components properties and method are inherited of component_common class that are inherited from common class
*/
class component_svg extends component_media_common {


	public $quality;



	/**
	* GET DATO
	*
	* Sample data:
	* [{
	* 	 "original_file_name": "icon_link.svg",
	*    "upload_date": {
	*      "day": 27,
	*      "hour": 17,
	*      "time": 65009757539,
	*      "year": 2022,
	*      "month": 8,
	*      "minute": 58,
	*      "second": 59
	*    },
	*    "user_id": -1
	* }]
	* @return array|null $dato
	*/
	public function get_dato() : ?array {

		$dato = parent::get_dato();
		if (!empty($dato) && !is_array($dato)) {
			$dato = [$dato];
		}

		return (array)$dato;
	}//end get_dato




	/**
	* GET VALOR
	* LIST:
	* GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECIFIC COMPONENT
	*/
	public function get_valor() {

		return $this->get_svg_id() .'.'. DEDALO_SVG_EXTENSION;
	}//end get_valor



	/**
	* GET_VALOR_EXPORT
	* Return component value sent to export data
	* @return string $valor_export
	*/
	public function get_valor_export($valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null) {

		if (empty($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
		}else{
			$this->set_dato( json_decode($valor) );	// Use parsed json string as dato
		}

		$valor = $this->get_url(true);

		return $valor;
	}//end get_valor_export



	/**
	* GET_NAME
	* Alias of get_svg_id
	*/
	public function get_name() : ?string {

		return $this->get_svg_id();
	}//end get_name



	/**
	* GET SVG ID
	* By default, it is built with the type of the current component_image and the section_id number, eg. 'dd20_rsc750_1'
	* It can be overwritten in properties with JSON eg. {"svg_id":"dd851"} and will read from the content of the referenced component
	* @return string|null $svg_id
	*/
	public function get_svg_id() : string {

		// already set
			if(isset($this->svg_id) && !empty($this->svg_id)) {
				return $this->svg_id;
			}

		$properties = $this->get_properties();

		switch (true) {
			case isset($properties->svg_id):
				$component_tipo		= $properties->svg_id;
				$component_modelo	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
				$component			= component_common::get_instance(
					$component_modelo,
					$component_tipo,
					$this->parent,
					'edit',
					DEDALO_DATA_NOLAN,
					$this->section_tipo
				);

				$valor	= trim($component->get_valor());
				$svg_id	= (!empty($valor) && strlen($valor)>0)
					? $valor
					: null;
				break;

			default:
				// $svg_id = $this->tipo.'_'.$this->section_tipo.'_'.$this->parent;
				// flat locator as id
				$locator = new locator();
					$locator->set_section_tipo($this->get_section_tipo());
					$locator->set_section_id($this->get_section_id());
					$locator->set_component_tipo($this->get_tipo());

				$svg_id	= $locator->get_flat();
				break;
		}


		// fix value
			$this->svg_id = $svg_id;


		return $svg_id;
	}//end get_svg_id



	/**
	* GET_INITIAL_MEDIA_PATH
	*/
	public function get_initial_media_path() : string {

		$component_tipo		= $this->tipo;
		// $parent_section	= section::get_instance($this->parent, $this->section_tipo);
		$parent_section		= $this->get_my_section();
		$properties			= $parent_section->get_properties();
			#dump($properties," properties component_tipo:$component_tipo");
			#dump($properties->initial_media_path->$component_tipo," ");

		if (isset($properties->initial_media_path->$component_tipo)) {
			$this->initial_media_path = $properties->initial_media_path->$component_tipo;
			# Add / at begin if not exits
			if ( substr($this->initial_media_path, 0, 1) != '/' ) {
				$this->initial_media_path = '/'.$this->initial_media_path;
			}
		}else{
			$this->initial_media_path = false;
		}

		return $this->initial_media_path;
	}//end get_initial_media_path



	/**
	* GET_ADDITIONAL_PATH
	* Calculate image additional path from 'properties' JSON config.
	* @return string|null $additional_path
	*/
	public function get_additional_path() : ?string {

		# Already resolved
		if(isset($this->additional_path)) {
			return $this->additional_path;
		}

		$additional_path	= false;
		$svg_id			= $this->get_svg_id();
		$parent			= $this->get_parent();
		$section_tipo	= $this->get_section_tipo();

		$properties = $this->get_properties();
		if (isset($properties->additional_path) && !empty($parent) ) {

			$component_tipo		= $properties->additional_path;
			$component_modelo	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component			= component_common::get_instance(
				$component_modelo,
				$component_tipo,
				$parent,
				'edit',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$dato = trim($component->get_valor());

			# Add / at begin if not exits
			if ( substr($dato, 0, 1)!=='/' ) {
				$dato = '/'.$dato;
			}
			# Remove / at end if exists
			if ( substr($dato, -1)==='/' ) {
				$dato = substr($dato, 0, -1);
			}

			# User defined additional_path path
			$additional_path = $dato;

			# Auto filled additional_path path
			# If the user not enter component dato, dato is filled by auto value when properties->max_items_folder is defined
			if(empty($dato) && isset($properties->max_items_folder)) {

				$max_items_folder  = $properties->max_items_folder;
				$parent_section_id = $parent;

				$additional_path = '/'.$max_items_folder*(floor($parent_section_id / $max_items_folder));

				# Final dato must be an array to saved into component_input_text
				$final_dato = array( $additional_path );
				$component->set_dato( $final_dato );
				$component->Save();
			}

		}else if(isset($properties->max_items_folder)) {

			$max_items_folder  = $properties->max_items_folder;
			$parent_section_id = $parent;

			$additional_path = '/'.$max_items_folder*(floor($parent_section_id / $max_items_folder));

		}//end if (isset($properties->additional_path) && !empty($parent) )

		# Fix
		$this->additional_path = $additional_path;


		return $additional_path;
	}//end get_additional_path



	/**
	* GET_FILE_NAME
	* @return string $file_name
	*/
	public function get_file_name() : string {

		$file_name = $this->tipo .'_'. $this->section_tipo .'_'. $this->parent;

		return $file_name;
	}//end get_file_name



	/**
	* GET_DEFAULT_QUALITY
	*/
	public function get_default_quality() : string {

		return DEDALO_SVG_QUALITY_DEFAULT;
	}//end get_default_quality



	/**
	* GET_AR_QUALITY
	* Get the list of defined image qualities in Dédalo config
	* @return array $ar_image_quality
	*/
	public function get_ar_quality() : array {

		$ar_quality = DEDALO_SVG_AR_QUALITY;

		return $ar_quality;
	}//end get_ar_quality



	/**
	* GET_PATH
	* @param string $quality = null
	* @return string $file_path
	*/
	public function get_path(string $quality=null) : string {

		if(empty($quality)) {
			$quality = $this->get_quality();
		}

		$additional_path = $this->get_additional_path();

		$file_name 	= $this->get_svg_id() .'.'. DEDALO_SVG_EXTENSION;
		$file_path 	= DEDALO_MEDIA_PATH . DEDALO_SVG_FOLDER . '/' . $quality . $additional_path . '/' . $file_name;

		return $file_path;
	}//end get_path



	/**
	* GET_FILE_CONTENT
	* @return string|null $file_content
	*/
	public function get_file_content() : ?string {

		$file_path		= $this->get_path();
		$file_content	= (file_exists($file_path))
			? file_get_contents($file_path)
			: null;

		return $file_content;
	}//end get_file_content



	/**
	* GET_TARGET_DIR
	* @return
	*/
	public function get_target_dir() : string {

		if(!$this->quality) {
			$this->quality = $this->get_quality();
		}

		$additional_path 	= $this->get_additional_path();
		$initial_media_path = $this->get_initial_media_path();

		$target_dir = DEDALO_MEDIA_PATH . DEDALO_SVG_FOLDER . $this->initial_media_path. '/' . $this->quality . $additional_path . '/';

		return $target_dir;
	}//end get_target_dir



	/**
	* GET_DEFAULT_SVG_URL
	* @return string $url
	*/
	public static function get_default_svg_url() : string {

		$url = DEDALO_CORE_URL . '/themes/default/upload.svg';

		return $url;
	}//end get_default_svg_url



	/**
	* GET_URL
	*	Return relative o absolute url. Default false (relative)
	* @param bool $absolute
	* @return string $url
	*/
		// public function get_url($absolute=false) {

		// 	$additional_path = $this->get_additional_path();

		// 	$file_name 	= $this->get_svg_id() .'.'. DEDALO_SVG_EXTENSION;
		// 	$url 		= DEDALO_MEDIA_URL .''. DEDALO_SVG_FOLDER . $additional_path . '/' . $file_name;

		// 	# ABSOLUTE (Default false)
		// 	if ($absolute) {
		// 		$url = DEDALO_PROTOCOL . DEDALO_HOST . $url;
		// 	}

		// 	return $url;
		// }//end get_url



	/**
	* GET_IMAGE_URL
	* Get image url for current quality
	* @param string $quality = null
	*	optional default (bool)false
	* @param bool $test_file = true
	*	Check if file exists. If not use 0.jpg as output. Default true
	* @param bool $absolute = false
	* @param bool $default_add = true
	* @return string|null $image_url
	*	Return relative o absolute url. Default false (relative)
	*/
	public function get_url(string $quality=null, bool $test_file=true, bool $absolute=false, bool $default_add=true) : ?string {

		// quality fallback to default
			if(empty($quality)) {
				$quality = $this->get_quality();
			}

		// image id
			$image_id 	= $this->get_svg_id();

		// url
			$additional_path		= $this->get_additional_path();
			$initial_media_path	= $this->get_initial_media_path();
			$file_name			= $image_id .'.'. DEDALO_SVG_EXTENSION;
			$image_url			= DEDALO_MEDIA_URL . DEDALO_SVG_FOLDER . $initial_media_path . '/' . $quality . $additional_path . '/' . $file_name;

		// File exists test : If not, show '0' dedalo image logo
			if($test_file===true) {
				$file = $this->get_path();

				if(!file_exists($file)) {
					if ($default_add===false) {
						return null;
					}
					$image_url = DEDALO_CORE_URL . '/themes/default/icons/dedalo_icon_grey.svg';
				}
			}

		// Absolute (Default false)
			if ($absolute===true) {
				$image_url = DEDALO_PROTOCOL . DEDALO_HOST . $image_url;
			}

		return $image_url;
	}//end get_image_url



	/**
	* GET_URL_FROM_LOCATOR
	* @param object $locator
	* @return string|null $url
	*/
	public static function get_url_from_locator(object $locator) : ?string {

		$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($locator->component_tipo,true);
		$component		= component_common::get_instance(
			$modelo_name,
			$locator->component_tipo,
			$locator->section_id,
			'list',
			DEDALO_DATA_NOLAN,
			$locator->section_tipo
		);
		$url = $component->get_url();

		return $url;
	}//end get_url_from_locator



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return string|null $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		$diffusion_value = $this->get_url();


		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* GET_ALLOWED_EXTENSIONS
	* @return array $allowed_extensions
	*/
	public function get_allowed_extensions() : array {

		$allowed_extensions = DEDALO_SVG_EXTENSIONS_SUPPORTED;

		return $allowed_extensions;
	}//end get_allowed_extensions



	/**
	* GET_ORIGINAL_QUALITY
	* @return $original_quality
	*/
	public function get_original_quality() : string {

		$original_quality = defined('DEDALO_SVG_QUALITY_ORIGINAL')
			? DEDALO_SVG_QUALITY_ORIGINAL
			: DEDALO_SVG_QUALITY_DEFAULT;

		return $original_quality;
	}//end get_original_quality



	/**
	* GET_PREVIEW_URL
	* @return string $url
	*/
	public function get_preview_url() : string {

		// $preview_url = $this->get_thumb_url();
		$preview_url = $this->get_url($quality=false, $test_file=true, $absolute=false, $default_add=false);

		return $preview_url;
	}//end get_preview_url



	/**
	* DELETE_FILE
	* Remove quality version moving the file to a deleted files dir
	* @see component_image->remove_component_media_files
	*
	* @param string $quality
	* @return object $response
	*/
	public function delete_file(string $quality) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		// remove_component_media_files returns bool value
		$result = $this->remove_component_media_files([$quality]);
		if ($result===true) {

			// save To update valor_list
				$this->Save();

			$response->result	= true;
			$response->msg		= 'File deleted successfully. ' . $quality;
		}


		return $response;
	}//end delete_file



	/**
	* GET_EXTENSION
	* @return string DEDALO_SVG_EXTENSION from config
	*/
	public function get_extension() : string {

		return $this->extension ?? DEDALO_SVG_EXTENSION;
	}//end get_extension



	/**
	* PROCESS_UPLOADED_FILE
	* @param object $file_data
	*	Data from trigger upload file
	* Format:
	* {
	*     "original_file_name": "my_file.svg",
	*     "full_file_name": "test81_test65_2.svg",
	*     "full_file_path": "/mypath/media/svg/standard/test81_test65_2.svg"
	* }
	* @return object $response
	*/
	public function process_uploaded_file(object $file_data) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__METHOD__.'] ';

		// short vars
			$original_file_name	= $file_data->original_file_name;	// kike "my file785.svg"
			$full_file_name		= $file_data->full_file_name;		// like "test175_test65_1.svg"
			$full_file_path		= $file_data->full_file_path;		// like "/mypath/media/svg/standard/test81_test65_2.svg"

		// extension
			$file_ext = pathinfo($original_file_name, PATHINFO_EXTENSION);
			if (empty($file_ext)) {
				// throw new Exception("Error Processing Request. File extension is unknow", 1);
				$msg = ' Error Processing Request. File extension is unknow';
				debug_log(__METHOD__.$msg, logger::ERROR);
				$response->msg .= $msg;
				return $response;
			}

		// quality default in upload is 'original' (!)
			$quality  = $this->get_quality();

		// add data with the file uploaded
			// if ($quality===DEDALO_SVG_QUALITY_DEFAULT) {
			// 	$dato			= $this->get_dato();
			// 	$value			= empty($dato) ? new stdClass() : reset($dato);
			// 	$media_value	= $this->build_media_value((object)[
			// 		'value'		=> $value,
			// 		'file_name'	=> $original_file_name
			// 	]);
			// 	$this->set_dato([$media_value]);
			// 	$this->Save();
			// }


		// get files info
			$files_info	= [];
			$ar_quality = DEDALO_SVG_AR_QUALITY;
			foreach ($ar_quality as $current_quality) {
				if ($current_quality==='thumb') continue;
				// read file if exists to get file_info
				$file_info = $this->get_quality_file_info($current_quality);
				// add non empty quality files data
				if (!empty($file_info)) {
					$files_info[] = $file_info;
				}
			}

		// save component dato
			$dato		= $this->get_dato();
			$save_dato	= false;
			if (isset($dato[0])) {
				if (!is_object($dato[0])) {
					// bad dato
					debug_log(__METHOD__." ERROR. BAD COMPONENT DATO ".to_string($dato), logger::ERROR);
				}else{
					// update property files_info
					$dato[0]->files_info = $files_info;
					$save_dato = true;
				}
			}else{
				// create a new dato from scratch
				$dato_item = (object)[
					'files_info' => $files_info
				];
				$dato = [$dato_item];
				$save_dato = true;
			}
			if ($save_dato===true) {
				$this->set_dato($dato);
				$this->Save();
			}

		// all is OK
			$response->result	= true;
			$response->msg		= 'OK. Request done ['.__METHOD__.'] ';


		return $response;
	}//end process_uploaded_file



	/**
	* UPDATE_DATO_VERSION
	* @param object $request_options
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_dato_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the dato don't need change"
	*/
	public static function update_dato_version(object $request_options) : object {

		$options = new stdClass();
			$options->update_version	= null;
			$options->dato_unchanged	= null;
			$options->reference_id		= null;
			$options->tipo				= null;
			$options->section_id		= null;
			$options->section_tipo		= null;
			$options->context			= 'update_component_dato';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// short vars
			$update_version	= implode('.', $options->update_version);
			$dato_unchanged	= $options->dato_unchanged;
			$reference_id	= $options->reference_id;

		switch ($update_version) {

			case '6.0.0':
				$is_old_dato = (
					empty($dato_unchanged) || // v5 early case
					isset($dato_unchanged->section_id) || // v5 modern case
					(isset($dato_unchanged[0]) && isset($dato_unchanged[0]->original_file_name)) // v6 alpha case
				);
				$is_old_dato = true; // force here
				if ($is_old_dato===true) {

					// create the component svg
						$model		= RecordObj_dd::get_modelo_name_by_tipo($options->tipo,true);
						$component	= component_common::get_instance(
							$model, // string 'component_svg'
							$options->tipo,
							$options->section_id,
							'list',
							DEDALO_DATA_NOLAN,
							$options->section_tipo
						);

					// get existing files data
						$file_name			= $component->get_name();
						$source_quality		= $component->get_original_quality();
						$additional_path	= $component->get_additional_path();
						$initial_media_path	= $component->get_initial_media_path();
						$original_extension	= $component->get_original_extension(
							false // bool exclude_converted
						) ?? $component->get_extension(); // 'svg' fallback is expected

						$base_path	= DEDALO_SVG_FOLDER . $initial_media_path . '/' . $source_quality . $additional_path;
						$file		= DEDALO_MEDIA_PATH . $base_path . '/' . $file_name . '.' . $original_extension;

						// no original file found. Use default quality file
							if(!file_exists($file)) {
								// use default quality as original
								$source_quality	= $component->get_default_quality();
								$base_path		= DEDALO_SVG_FOLDER . $initial_media_path . '/' . $source_quality . $additional_path;
								$file			= DEDALO_MEDIA_PATH . $base_path . '/' . $file_name . '.' . $component->get_extension();
							}
							// try again
							if(!file_exists($file)) {
								// reset bad dato
								$response = new stdClass();
									$response->result	= 1;
									$response->new_dato	= null;
									$response->msg		= "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string(null).".<br />";
								// $response = new stdClass();
								// 	$response->result	= 2;
								// 	$response->msg		= "[$reference_id] Current dato don't need update. No files found (original,default)<br />";	// to_string($dato_unchanged)."
								return $response;
							}

					// source_file_upload_date
						$dd_date							= new dd_date();
						$upload_date_timestamp				= date ("Y-m-d H:i:s", filemtime($file));
						$source_file_upload_date			= $dd_date->get_date_from_timestamp($upload_date_timestamp);
						$source_file_upload_date->time		= dd_date::convert_date_to_seconds($source_file_upload_date);
						$source_file_upload_date->timestamp	= $upload_date_timestamp;

					// get the source file name
						$source_file_name = pathinfo($file)['basename'];

					// lib_data
						$lib_data = null;

					// get files info
						$files_info	= [];
						$ar_quality = DEDALO_SVG_AR_QUALITY;
						foreach ($ar_quality as $current_quality) {
							if ($current_quality==='thumb') continue;
							// read file if exists to get file_info
							$file_info = $component->get_quality_file_info($current_quality);
							// add non empty quality files data
							if (!empty($file_info)) {
								// Note that source_quality could be original or default
								if ($current_quality===$source_quality) {
									$file_info->upload_info = (object)[
										'file_name'	=> $source_file_name ?? null,
										'date'		=> $source_file_upload_date ?? null,
										'user'		=> null // unknown here
									];
								}
								// add
								$files_info[] = $file_info;
							}
						}

					// create new dato
						$dato_item = new stdClass();
							$dato_item->files_info	= $files_info;
							$dato_item->lib_data	= $lib_data;

					// fix final dato with new format as array
						$new_dato = [$dato_item];
						debug_log(__METHOD__." update_version new_dato ".to_string($new_dato), logger::DEBUG);

					$response = new stdClass();
						$response->result	= 1;
						$response->new_dato	= $new_dato;
						$response->msg		= "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
				}else{

					$response = new stdClass();
						$response->result	= 2;
						$response->msg		= "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
				}
				break;

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}//end switch ($update_version)


		return $response;
	}//end update_dato_version



}//end class component_svg
