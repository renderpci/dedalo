<?php
require_once( DEDALO_LIB_BASE_PATH .'/media_engine/class.OptimizeTC.php');
/*
* CLASS DIFFUSION_CEDIS
* Custom CEDIS diffusion proccess methods
* ¿ extends diffusion ?
*/
class diffusion_cedis {



	static $database_name = 'web_cedis_eog';



	/**
	* TRANSFORM_CODE_TO_ARCHIVE_ID
	* Format current code to lowercase and remove the '-' char
	* @return 
	*/
	public static function transform_code_to_archive_id( $options, $dato ) {
		
		$dato = (array)$dato;

		$code = reset( $dato );
		$code = strtolower($code);
		$code = str_replace('-', '', $code);

		return $code;
	}//end transform_code_to_archive_id



	/**
	* TRANSFORM_PROJECT_TO_COLLECTION_ID
	* @return int $collection_id
	*/
	public static function transform_project_to_collection_id( $options, $dato ) {

		$dato = (array)$dato;
		reset($dato);
		$collection_id = key($dato);

		return (int)$collection_id;
	}//end transform_project_to_collection_id




	/**
	* PORTAL_TO_BOOLEAN
	* @return 
	*/
	public static function portal_to_boolean( $options, $dato ) {
		$result = empty($dato) ? false : true;
		
		return (bool)$result;
	}//end portal_to_boolean



	/**
	* STATE_TO_BOOLEAN
	* @return 
	*/
	public static function state_to_boolean( $options, $dato ) {
		
		# Actually return true always
		return true;
	}//end state_to_boolean



	/**
	* CREATED_AT
	* Returns section created time
	* @return date $created_date
	*/
	public static function created_at( $options, $dato ) {
		
		$section_tipo = $options->section_tipo;
		$section_id   = $options->parent;

			$section = section::get_instance($section_id, $section_tipo);
			$date 	 = $section->get_created_date();

		//set_date_from_input_field
		$created_date = dd_date::get_date_with_format($date, $format="Y-m-d H:i:s");
		#dump($created_date, '$created_date ++ '.to_string());

		return $created_date;
	}//end created_at



	/**
	* UPDATED_AT
	* Returns section modified time
	* @return 
	*/
	public static function updated_at( $options, $dato ) {
		
		$section_tipo = $options->section_tipo;
		$section_id   = $options->parent;

			$section = section::get_instance($section_id, $section_tipo);
			$date 	 = $section->get_modified_date();

		//set_date_from_input_field
		$created_date = dd_date::get_date_with_format($date, $format="Y-m-d H:i:s");
		#dump($created_date, '$created_date ++ '.to_string());

		return $created_date;		
	}//end updated_at



	/**
	* RETURN_TRUE
	* Fake method to return true always
	* @return bool true
	*/
	public static function return_true( $options, $dato ) {
		
		return true;
	}//end return_true



	/**
	* RETURN_FALSE
	* Fake method to return true always
	* @return bool false
	*/
	public static function return_false( $options, $dato ) {
		
		return (int)false;
	}//end return_false



	/**
	* RETURN_EMPTY
	* Fake method to return true always
	* @return string 
	*/
	public static function return_empty( $options, $dato ) {
		
		return '';
	}//end return_empty



	/**
	* CALCULATE_DATE
	* Returns last date of section (audiovisual) inside portal (interview)
	* @return 
	*/
	public static function calculate_date( $options, $dato, $format='d.m.Y' ) {
		#dump($dato, ' dato ++ '.to_string());

		$date = null;

		$ar_dates = array();
		foreach ((array)$dato as $key => $locator) {
			$section = section::get_instance($locator->section_id, $locator->section_tipo);
			$date 	 = $section->get_modified_date();

			$date = dd_date::get_date_with_format($date, $format="Y-m-d H:i:s");

			$ar_dates[ json_encode($locator) ] = $date;
		}
		#dump($ar_dates, ' ar_dates ++ '.to_string());

		if (!empty($ar_dates)) {
			$max = max(array_map('strtotime', $ar_dates));
			$last = date('Y-m-d H:i:s', $max); // Like 2012-06-11 08:30:49
				#dump($last, ' last ++ max: '.to_string($max));

			// Format: string dd.mm.yyyy
			$date = date($format, strtotime($last));
				#dump($date, ' date ++ ar_dates:'.to_string($ar_dates));
		}
		

		return $date;
	}//end calculate_date



	/**
	* CALCULATE_DATE_TAPE
	* Returns last date of audiovisual rsc44 (Date of capture) inside portal (interview)
	* @return 
	*/
	public static function calculate_date_tape( $options, $dato, $format='d.m.Y' ) {

		$date = null;

		$source_tipo = reset($options->propiedades->data_source); // Like 'rsc44'
		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($source_tipo,true);
		$lang 		 = $options->lang;

		$ar_dates = array();
		foreach ((array)$dato as $key => $locator) {

			$parent 		= $locator->section_id;
			$section_tipo 	= $locator->section_tipo;

			$component 		= component_common::get_instance($modelo_name,
															 $source_tipo,
															 $parent,
															 'list',
															 $lang,
															 $section_tipo);
			$dato = (array)$component->get_dato();
			if (empty($dato)) {
				continue;
			}

			$date_raw = reset($dato);
			if (isset($date_raw->start)) {
				$date_raw = $date_raw->start; // Compatible new date format data version update 4.9.1
			}

			$dd_date = new dd_date($date_raw);
			$date 	 = $dd_date->get_dd_timestamp("Y-m-d H:i:s");

			$date = dd_date::get_date_with_format($date, $format="Y-m-d H:i:s");
			$ar_dates[] = $date;
		}

		if (!empty($ar_dates)) {
			$max  = max(array_map('strtotime', $ar_dates));
			$last = date('Y-m-d H:i:s', $max); // Like 2012-06-11 08:30:49

			// Format: string dd.mm.yyyy
			$date = date($format, strtotime($last));
		}
		

		return $date;
	}//end calculate_date_tape



	/**
	* CALCULATE_IMAGE_NAME
	* Returns first image indentify file name
	* @return 
	*/
	public static function calculate_image_name( $options, $dato ) {
		#dump($dato, ' dato ++ options: '.to_string($options));

		$image_name = '';
		
		$dato 		= (array)$dato;
		$locator 	= reset($dato);
		if( !empty($locator) ) {

			$data_source = $options->propiedades->data_source;
			$portal_tipo = key($data_source);
			$image_tipo  = reset($data_source);

			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($image_tipo,true);
			$component 		= component_common::get_instance($modelo_name,
															 $image_tipo,
															 $options->parent,
															 'list',
															 DEDALO_DATA_LANG,
															 $options->section_tipo);
			$image_name = $component->get_image_id() . '.' . DEDALO_IMAGE_EXTENSION;
		}
		#dump($image_name, ' $image_name ++ '.to_string());

		return $image_name;
	}//end calculate_image_name



	/**
	* CALCULATE_AV_NAME
	* Returns first image indentify file name
	* @return 
	*/
	public static function calculate_av_name( $section_id ) {
		#dump($dato, ' dato ++ options: '.to_string($options));
		$av_name = DEDALO_COMPONENT_RESOURCES_AV_TIPO .'_'. DEDALO_SECTION_RESOURCES_AV_TIPO .'_'. $section_id . '.' . DEDALO_AV_EXTENSION;
				
		return $av_name;
	}//end calculate_av_name


	/**
	* RETURN_JPG
	* Fake method to return 'jpg' always
	* @return string
	*/
	public static function return_jpg( $options, $dato ) {
		
		return 'jpg';
	}//end return_jpg



	/**
	* CALCULATE_IMAGE_SIZE
	* Returns first image indentify file name
	* @return 
	*/
	public static function calculate_image_size( $options, $dato ) {
		
		return 211968;
	}//end calculate_image_name



	/**
	* CALCULATE_IMAGE_DATE
	* Returns first image indentify record date
	* @return 
	*/
	public static function calculate_image_date( $options, $dato ) {
		#dump($dato, ' dato ++ options: '.to_string($options));

		$image_date = null;
		
		$dato 		= (array)$dato;
		$locator 	= reset($dato);
		if( !empty($locator) ) {

			$section = section::get_instance($locator->section_id, $locator->section_tipo);
			$date 	 = $section->get_created_date();

			$image_date = dd_date::get_date_with_format($date, $format="Y-m-d H:i:s");
		}		
		if (empty($image_date)) {
			$image_date = null;
		}
		#dump($image_date, ' image_date ++ '.to_string($dato ));

		return $image_date;
	}//end calculate_image_date



	/**
	* INDEXED_AT
	* Returns last section modified date from interview portal to last audiovisual record
	* @return 
	*/
	public static function indexed_at( $options, $dato ) {
		#dump($dato, ' dato ++ options:'.to_string($options));

		$indexed_at = diffusion_cedis::calculate_date($options, $dato, $format='Y-m-d H:i:s');
		#dump($indexed_at, ' $indexed_at ++ '.to_string());

		return $indexed_at;		
	}//end indexed_at



	/**
	* LANGUAGE_ID
	* Returns always greek lang id 5037
	* @return int
	*/
	public static function language_id( $options, $dato ) {
		
		return 5037;	// id of greek lang (dédalo)		
	}//end language_id




	/**
	* GET_table_RECORD_ID
	* @return 
	*/
	public static function get_table_record_id($section_id, $column_name, $table) {
		$id = false;

		$sql 	= "SELECT id FROM $table WHERE $column_name = '$section_id'";
		$result = diffusion_mysql::exec_mysql_query( $sql, $table, $database_name=self::$database_name, $multi_query=false);
		if (!$result) {			
			return false;		
		}
		
		while ($row = $result->fetch_assoc()) {
			$id = (int)$row["id"];			
			break;			
		}
		$result->free();

		return $id;
	}//end get_table_record_id



	/**
	* PROCESS_ALL_SEGMENTS
	* Process table segments and tables segment_translations
	* CREATE TABLE `web_cedis_eog`.`segments` ( `id` INT UNSIGNED NOT NULL AUTO_INCREMENT , `tape_id` INT NULL , `media_id` VARCHAR(160) NULL , `timecode` VARCHAR(160) NULL , `transcript` VARCHAR(2000) NULL , `translation` VARCHAR(2000) NULL , `created_at` DATETIME NULL , `updated_at` DATETIME NULL , `duration` DECIMAL(2,2) NULL , `sequence_number` INT NULL , `tape_number` INT NULL , `speaker` VARCHAR(256) NULL , `speaker_change` BOOLEAN NULL , `chapter_change` BOOLEAN NULL , `section` VARCHAR(160) NULL , `interview_id` INT NULL , PRIMARY KEY (`id`)) ENGINE = InnoDB CHARSET=utf8 COLLATE utf8_unicode_ci;
	* CREATE TABLE `web_cedis_eog`.`tapes` ( `id` INT NOT NULL AUTO_INCREMENT , `interview_id` INT NULL , `media_id` INT NULL , `created_at` DATETIME NULL , `updated_at` DATETIME NULL , `video` BOOLEAN NULL , `duration` INT NULL , PRIMARY KEY (`id`)) ENGINE = InnoDB COMMENT = 'Table builded manually';
	* @return 
	*/
	public static function process_all_segments( $request_options ) {

		#self::process_all_hierarchy(); return false;

		$options = new stdClass();
			$options->section_tipo 			= null;
			$options->section_id   			= null;
			$options->diffusion_element_tipo= null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}
		
		#
		# CHECK_PUBLICATION_VALUE. Delete record (and cascade) when component_publication value is false
		$p_options = new stdClass();
			$p_options->component_publication_tipo  = 'rsc20';
			$p_options->section_id 				 	= $options->section_id;
			$p_options->section_tipo 				= $options->section_tipo;
			$p_options->database_name 			 	= $request_options->database_name;
			$p_options->table_name 			 	 	= $request_options->table_name;
			$p_options->diffusion_element_tipo  	= $options->diffusion_element_tipo;
			$p_options->table_propiedades  	 	 	= $request_options->table_propiedades;
		$to_publish = diffusion_sql::check_publication_value($p_options);
			#dump($to_publish, ' $to_publish ++ '.to_string());

		if ($to_publish===false) {
			return false; # Record segment and segment translations are deleted. Stop here.
		}

		# Section inverse locator (interview)
		$interview_section_id = null;
		$section = section::get_instance($options->section_id, $options->section_tipo);
		$inverse_locators = $section->get_inverse_locators();
		foreach ((array)$inverse_locators as $locator) {
			if ($locator->from_section_tipo==='oh1') {
				$interview_section_id = $locator->from_section_id;
				break;
			}
		}
		# id interno (no de Dédalo)
		$interview_id = diffusion_cedis::get_table_record_id($interview_section_id, 'section_id', 'interviews');


		# Portal
		$tape_number = 1;
		$portal_tipo 	  = 'oh25';
		$component_portal = component_common::get_instance('component_portal',
														  $portal_tipo,
														  $interview_section_id,
														  'list',
														  DEDALO_DATA_NOLAN,
														  'oh1');

		$component_portal_dato = $component_portal->get_dato();

		foreach ((array)$component_portal_dato as $portal_key => $current_locator) {
			if($current_locator->section_id == $options->section_id){
				$tape_number = $portal_key +1;
			}
		}

		# save_tape		
		# Save data on table tapes
		$tapes_options = new stdClass();
			$tapes_options->section_id 		= $options->section_id;
			$tapes_options->section_tipo 	= $options->section_tipo;
			$tapes_options->delete_previous = true;
			$tapes_options->interview_id 	= $interview_id;
			$tapes_options->tape_number 	= $tape_number;
		$save_tape_result = diffusion_cedis::save_tape($tapes_options);
		$tape_id = isset($save_tape_result->new_id) ? $save_tape_result->new_id : null;

		# Add options
		$options->tape_id = $tape_id;		

		# build_segments
		$ar_segments = diffusion_cedis::build_segments($options);

		
		$delete_previous 		= true; // Only first iteration
		$delete_previous_text 	= true; # [11-06-2018]
		foreach ($ar_segments as $skey => $segment_value) {
			#dump($segment_value, ' $segment_value ++ $skey '.to_string($skey));

			$record_data=array();
				$record_data['database_name'] 		= self::$database_name;
				$record_data['table_name'] 			= 'segments';
				$record_data['diffusion_section'] 	= 'cedis14';
				$record_data['engine'] 				= 'InnoDB';
				$record_data['ar_fields'] 			= array();

			$ar_fields=array();
			$pseudo_section_id = $options->section_id .'_'. $skey;
			$ar_segment_translations = array();
			$ar_fields[] = array('field_name' => 'section_id', 'field_value' => $options->section_id);
			foreach ($segment_value as $field_name => $field_value) {
				#dump($field_value, ' field_value ++ $field_name: '.to_string($field_name));

				switch (true) {
					
					#case ($field_name==='translation' && isset($ar_segments_translation[$skey])):
					#	$ar_fields[] = array('field_name' => 'translation', 'field_value' => $ar_segments_translation[$skey]->transcript);
					#	break;
					# [11-06-2018]
					case ($field_name==='translation_eng'):
						# Skip this new field
						break;

					case ($field_name==='mainheading'):
						#dump($field_value['lg-ell'], ' MAINHEADING $field_value[lg-ell] ++ '.to_string());
						$ar_segment_translations['lg-ell'][] = array('field_name' => 'mainheading', 'field_value' => $field_value['lg-ell']);
						$ar_segment_translations['lg-deu'][] = array('field_name' => 'mainheading', 'field_value' => $field_value['lg-deu']);
						$ar_segment_translations['lg-eng'][] = array('field_name' => 'mainheading', 'field_value' => $field_value['lg-eng']);
						break;

					case ($field_name==='subheading'):
						#dump($field_value['lg-ell'], ' SUBHEADING $field_value[lg-ell] ++ '.to_string());
						$ar_segment_translations['lg-ell'][] = array('field_name' => 'subheading', 'field_value' => $field_value['lg-ell']);
						$ar_segment_translations['lg-deu'][] = array('field_name' => 'subheading', 'field_value' => $field_value['lg-deu']);
						$ar_segment_translations['lg-eng'][] = array('field_name' => 'subheading', 'field_value' => $field_value['lg-eng']);
						break;

					default:
						# $ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);
						if ($field_name==='transcript' || $field_name==='translation') {
							# nothing to save [04-07-2018]
						}else{
							$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);
						}
						break;
				}				
			}			
			$ar_fields[] = array('field_name' => 'interview_id', 'field_value' => $interview_id);

			$record_data['ar_fields'][$options->section_id]['lg-ell'] = $ar_fields;

			# segments save. Generamos el registro en mysql
			$options_save_record = new stdClass();
				$options_save_record->record_data 	  = $record_data;
				$options_save_record->typology 	  	  = null;
				$options_save_record->delete_previous = $delete_previous;
					#dump($options_save_record, ' options_save_record ++ '.to_string());
			$result = diffusion_mysql::save_record( $options_save_record );
						
			if ( !empty($result->new_id) ) {
				#dump($ar_segment_translations['lg-ell'], ' ar_segment_translations ell ++ '.to_string());

				# [11-06-2018]
				# Save current segment to new segment translations 'text' column
					$record_data_text=array();
						$record_data_text['database_name'] 		= self::$database_name;
						$record_data_text['table_name'] 		= 'segment_translations';
						$record_data_text['diffusion_section'] 	= 'cedis19';
						$record_data_text['engine'] 			= 'InnoDB';
						$record_data_text['ar_fields'] 			= array();

					$date = new DateTime();
					$now  = date('Y-m-d H:i:s', $date->getTimestamp());

					$ar_save_text = [];
					foreach ($segment_value as $field_name => $current_field_value) {										

						$ar_fields = array();

						switch ($field_name) {
							case 'transcript':
								$current_lang = 'lg-ell';
								break;
							case 'translation':
								$current_lang = 'lg-deu';
								break;
							case 'translation_eng':
								$current_lang = 'lg-eng';
								break;
							default:
								continue 2;
								break;
						}
						#dump($field_value, ' field_value ++ '.to_string());

						# section_id
						$field_name  = 'section_id';
						$field_value = $options->section_id;
						$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

						# segment_id
						$field_name  = 'segment_id';
						$field_value = (int)$result->new_id;
						$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);
					
						# locale
						$field_name  = 'locale';
						$field_value = str_replace('lg-', '', $current_lang);
						$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);
						
						# created_at
						$field_name  = 'created_at';
						$field_value = $now;
						$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

						# updated_at
						$field_name  = 'updated_at';
						$field_value = $now;
						$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

						# text
						$field_name  = 'text';
						$field_value = $current_field_value;
						$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

						# Add
						$record_data_text['ar_fields'][$options->section_id][$current_lang] = $ar_fields;
					}

					# Generamos el registro en mysql
					$options_text_save_record = new stdClass();
						$options_text_save_record->record_data 	  	= $record_data_text;
						$options_text_save_record->typology 	  	= null;
						$options_text_save_record->delete_previous 	= $delete_previous_text;
					$result_text = diffusion_mysql::save_record( $options_text_save_record );
					
					$delete_previous_text = false; // Only first loop deletes previous

				# SEGMENT_TRASLATIONS. Save data on table segment_translations
				$first_traslation = reset($ar_segment_translations);
				#dump($first_traslation, ' first_traslation ++ '.to_string());
				if ( (isset($first_traslation[0]) && !empty($first_traslation[0]['field_value'])) ||
					 (isset($first_traslation[1]) && !empty($first_traslation[1]['field_value']))
				   ){
					$segment_id_traslation = (int)$result->new_id + 1;
					$st_options = new stdClass();
						$st_options->new_id 				 	= $segment_id_traslation;
						$st_options->section_id 			 	= $options->section_id;
						$st_options->ar_segment_translations 	= $ar_segment_translations;
						$st_options->delete_previous 		 	= $delete_previous;
					diffusion_cedis::save_segment_traslations($st_options);
				}

				# TERMS. Save_segment_ar_term_id. write current terms to aditional table (many to many)
				if (!empty($segment_value->term_id)) {
				 if ($ar_term_id = json_decode($segment_value->term_id)) {
					if (!empty($ar_term_id)) {
						$segment_id_terms = (int)$result->new_id + 1;
						$save_segment_ar_term_id_options = new stdClass();
							$save_segment_ar_term_id_options->ar_term_id 			= $ar_term_id;
							$save_segment_ar_term_id_options->av_section_id 		= $segment_value->tape_id;
							$save_segment_ar_term_id_options->segment_id 			= $segment_id_terms;
							$save_segment_ar_term_id_options->interview_section_id 	= $segment_value->interview_section_id;
							$save_segment_ar_term_id_options->interview_id 			= $interview_id;
							$save_segment_ar_term_id_options->delete_previous		= $delete_previous;
						diffusion_cedis::save_segment_ar_term_id($save_segment_ar_term_id_options);
					}
				 }
				}

				# NOTES. Save the note of current segment (if exists)
				if (!empty($segment_value->note_section_id)) {
					// Updates annotation record in DDBB
					diffusion_cedis::update_annotation(array("note_section_id" 		=> $segment_value->note_section_id,
															 "interview_section_id" => $segment_value->interview_section_id,
															 "interview_id" 		=> $interview_id,
															 "av_section_id" 		=> $options->section_id,
															 "segment_timecode" 	=> $segment_value->timecode,
															 "segment_id" 			=> $result->new_id
															));
				}
			
			}//end if ( !empty($result->new_id) )			

			$delete_previous = false; // Only first iteration delete previous records with current section_id
		}//end foreach ($ar_segments as $skey => $segment_value)

		# INTERVIEW_TRANSLATIONS. Save data on table interview_translations				
		$it_options = new stdClass();
			$it_options->interview_id 				= $interview_id;
			$it_options->interview_section_id 		= $interview_section_id;
		self::build_interview_translations($it_options);
	
		return true;
	}//end process_all_segments



	/**
	* SAVE_SEGMENT_TRASLATIONS
	* CREATE TABLE `web_cedis_eog`.`segment_translations` ( `id` INT NOT NULL AUTO_INCREMENT , `segment_id` INT NULL , `locale` VARCHAR(128) NULL , `subheading` VARCHAR(1000) NULL , `mainheading` VARCHAR(1000) NULL , `created_at` DATETIME NULL , `updated_at` DATETIME NULL , PRIMARY KEY (`id`)) ENGINE = InnoDB CHARSET=utf8 COLLATE utf8_unicode_ci;
	* @return 
	*/
	public static function save_segment_traslations( $request_options ) {
		
		$options = new stdClass();
			$options->new_id 	 			  = null;
			$options->section_id 			  = null;
			$options->ar_segment_translations = null;
			$options->delete_previous 		  = true;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		# Force false
		$options->delete_previous = false; # [11-06-2018]

		# id segment_translations
		#$current_segment_translations_id = diffusion_cedis::get_table_record_id($options->new_id, 'segment_id', 'segment_translations');
			#dump($current_segment_translations_id, ' current_segment_translations_id ++ $options->new_id: '.to_string($options->new_id));

		$record_data=array();
			$record_data['database_name'] 		= self::$database_name;
			$record_data['table_name'] 			= 'segment_translations';
			$record_data['diffusion_section'] 	= 'cedis19';
			$record_data['engine'] 				= 'InnoDB';
			$record_data['ar_fields'] 			= array();

		$date = new DateTime();
		$now  = date('Y-m-d H:i:s', $date->getTimestamp());


		# [11-06-2018] add lg-eng
		foreach (array('lg-ell','lg-deu','lg-eng') as $lang) {

			$ar_fields = array();

			# section_id
			$field_name  = 'section_id';
			$field_value = $options->section_id;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# segment_id
			$field_name  = 'segment_id';
			$field_value = $options->new_id;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# locale
			$field_name  = 'locale';
			$field_value = str_replace('lg-', '', $lang);
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# subheading | mainheadings
			foreach ((array)$options->ar_segment_translations[$lang]  as $value) {
				$ar_fields[] = $value;
			}

			# created_at
			$field_name  = 'created_at';
			$field_value = $now;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# updated_at
			$field_name  = 'updated_at';
			$field_value = $now;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# Add
			$record_data['ar_fields'][$options->section_id][$lang] = $ar_fields;
		}

		# Generamos el registro en mysql
			$options_save_record = new stdClass();
				$options_save_record->record_data 	  = $record_data;
				$options_save_record->typology 	  	  = null;
				$options_save_record->delete_previous = $options->delete_previous;
					#dump($options_save_record, ' options_save_record ++ '.to_string());
			$result = diffusion_mysql::save_record( $options_save_record );

		return true;
	}//end save_segment_traslations



	/**
	* SAVE_TAPE
	* @return 
	*/
	public static function save_tape( $request_options ) {
		
		$options = new stdClass();			
			$options->section_id 		= null;
			$options->section_tipo 		= null;		
			$options->delete_previous 	= true;
			$options->interview_id 		= null;
			$options->tape_number 		= null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$record_data=array();
			$record_data['database_name'] 		= self::$database_name;
			$record_data['table_name'] 			= 'tapes';
			$record_data['diffusion_section'] 	= 'cedis103';
			$record_data['engine'] 				= 'InnoDB';
			$record_data['ar_fields'] 			= array();

		$lang = 'lg-ell';	

		$ar_fields = array();

		# section_id
		$field_name  = 'section_id';
		$field_value = $options->section_id;
		$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

		# interview_section_id
		$field_name  = 'interview_section_id';
		# Section inverse locator (interview)
		$interview_section_id = null;
		$section = section::get_instance($options->section_id, $options->section_tipo);
		$inverse_locators = $section->get_inverse_locators();
		foreach ((array)$inverse_locators as $locator) {
			if ($locator->from_section_tipo==='oh1') {
				$interview_section_id = $locator->from_section_id;
				break;
			}
		}
		$field_value = $interview_section_id;
		$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

		# media_id
		$field_name  = 'media_id';
		$field_value = diffusion_cedis::calculate_av_name($options->section_id);	
		$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

		# created_at
		$field_name  = 'created_at';
		$field_value = $section->get_created_date();
		$field_value = dd_date::get_date_with_format($field_value, $format="Y-m-d H:i:s");
		$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

		# updated_at
		$field_name  = 'updated_at';
		$field_value = $section->get_modified_date();
		$field_value = dd_date::get_date_with_format($field_value, $format="Y-m-d H:i:s");
		$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

		# video
		$field_name  = 'video';
		$field_value = true;
		$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

		# duration
		$field_name  = 'duration';		
		$current_tipo 	= DEDALO_COMPONENT_RESOURCES_AV_DURATION_TIPO;
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
		$component 		= component_common::get_instance($modelo_name,
														 $current_tipo,
														 $options->section_id,
														 'list',
														 DEDALO_DATA_NOLAN,
														 $options->section_tipo);
		$duration 	 = $component->get_valor();
		$field_value = ceil( OptimizeTC::TC2seg($duration) );
		$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

		# interview_id
		$field_name  = 'interview_id';
		$field_value = $options->interview_id;
		$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

		# tape_number
		$field_name  = 'tape_number';
		$field_value = $options->tape_number;
		$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

		$record_data['ar_fields'][$options->section_id][$lang] = $ar_fields;
			#dump($record_data, ' record_data ++ *** '.to_string());

		# Generamos el registro en mysql
		$options_save_record = new stdClass();
			$options_save_record->record_data 	  = $record_data;
			$options_save_record->typology 	  	  = null;
			$options_save_record->delete_previous = $options->delete_previous;
				#dump($options_save_record, ' options_save_record ++ '.to_string());
		$result = diffusion_mysql::save_record( $options_save_record );


		###################### 4-2-2018 IN ################################################################
		# contributors
		$ar_contributors_tipo = array(	'rsc51', # Camera # ADDED 15-03-2018 !!
										'rsc61', # Digital proccessing
										'rsc62', # Transcribed /described
										'rsc63', # Indexed
										'rsc376', # Translated
										'rsc48', # Quality management intervieving
										'rsc400', # Quality management transcription
										'rsc401', # Quality management indexation
										'rsc402'); # Quality management translation

		foreach ($ar_contributors_tipo as $component_tipo) {

			# contributors_compentes
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component 		= component_common::get_instance($modelo_name,
															 $component_tipo,
															 $options->section_id,
															 'list',
															 DEDALO_DATA_NOLAN,
															 $options->section_tipo);
			$current_dato 	= $component->get_dato();

			#debug_log(__METHOD__." contributor $modelo_name - $component_tipo - $options->section_tipo - $options->section_id ".to_string($current_dato), logger::ERROR);
			
			$contributor_dato = null;
			if (!empty($current_dato[0])) {
				$contributor_dato = $current_dato[0];
				$person_dedalo_id = $contributor_dato->section_tipo.'_'.$contributor_dato->section_id;
				$person_contribution_label = RecordObj_dd::get_termino_by_tipo($component_tipo, 'lg-eng', true, false);

				diffusion_cedis::save_contribution(array(
						'person_dedalo_id' 		=> $person_dedalo_id,
						'interview_section_id' 	=> $interview_section_id,
						'contribution_type' 	=> $person_contribution_label
					));
			}


		}
		###################### 4-2-2018 OUT ################################################################

		#
		# REGISTRY REFERENCES ADD
			# Delete previous record			
			$custom = new stdClass();
				$custom->field_name = array('dedalo_rsc167_section_id','ref_object_type');
				$custom->field_value= array($options->section_id, 'Interview');
			diffusion_mysql::delete_sql_record($options->section_id, self::$database_name, 'registry_references', $options->section_tipo, $custom);
			# $section_id, $database_name, $table_name, $section_tipo=null, $custom=false

			$record_data=array();
				$record_data['database_name'] 		= self::$database_name;
				$record_data['table_name'] 			= 'registry_references';
				$record_data['diffusion_section'] 	= '';
				$record_data['engine'] 				= 'InnoDB';
				$record_data['ar_fields'] 			= array();

			$ar_fields = array();

			# ref_object_id (interview_id)
			$field_name  = 'ref_object_id';
			$field_value = $options->interview_id;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# ref_object_type
			$field_name  = 'ref_object_type';
			$field_value = 'Interview';
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# registry_reference_type_id
			$field_name  = 'registry_reference_type_id';
			$field_value = 3;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# registry_entry_id
			$field_name  = 'registry_entry_id';
		
			$component_tipo = 'rsc46';
			$section_tipo 	= $options->section_tipo;
			$parent 		= $options->section_id;
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true); // component_autocomplete_hi
			$component 		= component_common::get_instance($modelo_name,
															 $component_tipo,
															 $parent,
															 'list',
															 DEDALO_DATA_NOLAN,
															 $section_tipo);
			$dato = $component->get_dato();

			$registry_entry_id  = null;
			$term_id 			= null;
			if (isset($dato[0])) {
				$term_id = $dato[0]->section_tipo .'_'. $dato[0]->section_id;
				$registry_entry_id = diffusion_cedis::get_table_record_id($term_id, 'entry_dedalo_code', 'registry_entries');
					#dump($registry_entry_id, ' registry_entry_id ++ '.to_string($term_id)); die();
			}
			$field_value = $registry_entry_id;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# registry_entry_dedalo_id
			$field_name  = 'registry_entry_dedalo_id';
			$field_value = $term_id;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# dedalo_rsc167_section_id
			$field_name  = 'dedalo_rsc167_section_id';
			$field_value = $options->section_id;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);


			$record_data['ar_fields'][$options->section_id][$lang] = $ar_fields;
			#dump($record_data, ' record_data ++ *** '.to_string());

			# Generamos el registro en mysql
			$options_save_record = new stdClass();
				$options_save_record->record_data 	  = $record_data;
				$options_save_record->typology 	  	  = null;
				$options_save_record->delete_previous = false;
					#dump($options_save_record, ' options_save_record ++ '.to_string());
			$result2 = diffusion_mysql::save_record( $options_save_record );


		return $result;
	}//end save_tape



	/**
	* BUILD_SEGMENTS
	* @return 
	*/
	public static function build_segments( $request_options ) {
		
		$options = new stdClass();
			$options->section_tipo 			= null;
			$options->section_id   			= null;
			$options->diffusion_element_tipo= null;
			$options->lang 					= 'lg-ell';
			$options->resolve_persons 		= true;
			$options->resolve_notes 		= true;
			$options->resolve_headings 		= true;
			$options->tape_id 		 		= true;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}


		# RSC36 Text area transcription
		$component_tipo = DEDALO_COMPONENT_RESOURCES_TR_TIPO;	// 'rsc36';
		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);

		# 1. Transcription lang
		$lang = $options->lang;
		
		$component_text_area = component_common::get_instance($modelo_name,
															  $component_tipo,
															  $options->section_id,
															  'list',
															  'lg-ell', // $lang,
															  $options->section_tipo);

		$component_text_area_deu = component_common::get_instance($modelo_name,
															  $component_tipo,
															  $options->section_id,
															  'list',
															  'lg-deu',
															  $options->section_tipo);

		$component_text_area_eng = component_common::get_instance($modelo_name,
															  $component_tipo,
															  $options->section_id,
															  'list',
															  'lg-eng',
															  $options->section_tipo);

		#dump($component_text_area->get_lang(), ' $component_text_area->get_lang() ++ '.to_string());
		$raw_text = $component_text_area->get_dato();
		#$dato_process 	= self::process_transcription($dato);

		# Section inverse locator (interview)
		$interview_section_id = null;
		$section = section::get_instance($options->section_id, $options->section_tipo);
		$inverse_locators = $section->get_inverse_locators();
		foreach ((array)$inverse_locators as $locator) {
			if ($locator->from_section_tipo==='oh1') {
				$interview_section_id = $locator->from_section_id;
				break;
			}
		}

		$fragments_text_by_tc = $component_text_area->get_fragments_text_by_tc($raw_text);
		$pattern_tc  		  = TR::get_mark_pattern('tc_full',$standalone=true);
		$pattern_person  	  = TR::get_mark_pattern('person',$standalone=true);
		$pattern_struct    	  = TR::get_mark_pattern('struct',$standalone=true);
		$pattern_note    	  = TR::get_mark_pattern('note',$standalone=true);
		
		$speaker     = '';
		$speaker_id  = '';
		

		# Always prepend tc 00 to safe process
		$tc_init = '[TC_00:00:00.000_TC]';
		array_unshift($fragments_text_by_tc, $tc_init);
		$ar_segments = array();
		$i=0;

		$mainheading = array(); // Empty array
		$subheading  = array(); // Empty array
		
		$ar_resolved_contribution = array();
		foreach ($fragments_text_by_tc as $key => $value) {

			#$mainheading = array();
			#$subheading  = array();
			$header_value 	 = array();
			$subheader_value = array();

			$segment = new stdClass();

			#dump($value, ' value ++ '.to_string($key));
			preg_match($pattern_tc, $value, $matches);
			$is_tc = !empty($matches);
			if ($is_tc===true) continue; // Only text ar usefull here

			if ( !isset($fragments_text_by_tc[$key -1]) ) {
				continue; // Skip
			}
			if ( !isset($fragments_text_by_tc[$key +1]) ) {
				continue; // Skip
			}

			# Tape id
			$segment->tape_id = $options->tape_id;

			$tc_in  	= $fragments_text_by_tc[$key -1];
			$tc_out 	= $fragments_text_by_tc[$key +1];
			$vbegin 	= OptimizeTC::TC2seg($tc_in);
			$vend 		= OptimizeTC::TC2seg($tc_out);
			$duration 	= $vend - $vbegin;

			# Media id
			$segment->media_id  = diffusion_cedis::calculate_av_name($options->section_id);			
			#$segment->media_id .= '?vbegin=' . floor($vbegin) . '&vend=' . floor($vend);

			# Timecode			
			$timecode 	= str_replace( array('[TC_','_TC]'), '', $tc_in);
			$segment->timecode = $timecode;

			# Transcript
			$transcript = TR::deleteMarks($value);
			$transcript = strip_tags($transcript);	//, '<br><br/>'
			$segment->transcript = trim($transcript);

			# Translation [11-06-2018]
			$segments_options_deu = new stdClass();
				$segments_options_deu->tc_in 	= $tc_in;
				$segments_options_deu->tc_out 	= $tc_out;
				$segments_options_deu->lang 	= 'lg-deu';
				$segments_options_deu->component_text_area 	= $component_text_area_deu;

			$translation = self::get_segment_translation($segments_options_deu);
			$translation = strip_tags($translation);	// , '<br><br/>'
			$segment->translation = trim($translation);

			# Translation eng [11-06-2018]			
			$segments_options_eng = new stdClass();
				$segments_options_eng->tc_in 	= $tc_in;
				$segments_options_eng->tc_out 	= $tc_out;
				$segments_options_eng->lang 	= 'lg-eng';
				$segments_options_eng->component_text_area 	= $component_text_area_eng;

			$translation_eng = self::get_segment_translation($segments_options_eng);
			$translation_eng = strip_tags($translation_eng);	// , '<br><br/>'
			$segment->translation_eng = trim($translation_eng);

			# created_at
			$segment->created_at = null;

			# updated_at
			$segment->updated_at = null;

			# Duration			
			$segment->duration = floatval($duration);

			# sequence_number
			$segment->sequence_number = null;

			# tape_number
			$segment->tape_number = null;

			# Persons
			if($options->resolve_persons===true) {
				$speaker 	= null;	
				$speaker_id = null;
				preg_match($pattern_person, $value, $matches);
					#dump($matches, ' matches ++ '.to_string());
				$key_locator = 6;
				$key_speaker = 5;
				if (isset($matches[$key_locator])) {
					$person_locator = json_decode( str_replace("'", '"', $matches[$key_locator]) );
						#dump($person_locator, ' person_locator ++ '.to_string());
					$speaker 	= $matches[$key_speaker];
					#$speaker_id = (int)$person_locator->section_id; // Dedalo					

					# Calculate contribution data
					$person_section_tipo 		= $person_locator->section_tipo;
					$person_component_tipo 		= $person_locator->component_tipo;
					$person_contribution_label	= RecordObj_dd::get_termino_by_tipo($person_component_tipo, 'lg-eng', true, false);

					$person_dedalo_id 			= $person_section_tipo . "_" . $person_locator->section_id;
					$pseudo_contibution_key 	= $interview_section_id . "_" . $person_dedalo_id;

					# Calculate table id of current person (we have section_id)
					# id interno (no de Dédalo)					
					$speaker_id = diffusion_cedis::get_table_record_id($person_dedalo_id, 'person_dedalo_id', 'people'); // Cedis
					#debug_log(__METHOD__." ####### Calculated speaker_id from $person_dedalo_id :  ".to_string($speaker_id), logger::DEBUG);
					
					if (!in_array($pseudo_contibution_key, $ar_resolved_contribution)) {

						diffusion_cedis::save_contribution(array(
							'person_dedalo_id' 		=> $person_dedalo_id,
							'interview_section_id' 	=> $interview_section_id,
							'contribution_type' 	=> $person_contribution_label
						));
						$ar_resolved_contribution[] = $pseudo_contibution_key;
					}
				}
				$segment->speaker 	 = $speaker;
				$segment->speaker_id = $speaker_id;
			}

			# speaker_change
			$segment->speaker_change = null;

			# chapter_change
			$segment->chapter_change = null;

			# notes
			if($options->resolve_notes===true) {
				$note_id = null;
				preg_match($pattern_note, $value, $matches);
					#dump($matches, ' matches ++ '.to_string());
				$key_state 	  = 3;
				$state_public = "b";
				$key_locator  = 7;
				if (isset($matches[$key_locator]) && isset($matches[$key_state])) {
					#dump($matches[$key_locator], ' key_locator ++ '.to_string());
					// When state is b (public) add note id to table
					if ($matches[$key_state]==$state_public) {
						$note_locator = json_decode( str_replace("'", '"', $matches[$key_locator]) );					
						$note_id = (int)$note_locator->section_id;						
					}
				}
				$segment->note_section_id = $note_id;
			}			

			# section
			$segment->section = null;

			# interview_section_id
			$segment->interview_section_id = $interview_section_id;

			# Headings	
			$segment->term_id = array();		
			if ($options->resolve_headings===true) {
				$current_fragment_to_see = $value;
				preg_match_all($pattern_struct, $current_fragment_to_see, $matches);
				#dump($matches, ' matches ++ '.to_string());
				$key_locator = 6;
				$key_tag_id  = 3;
				if (!empty($matches[0])) {
					#dump($matches[0], ' matches in ++ '.to_string());
					$is_new = true;
					$is_new_subheading  = true;
					#$mainheading = array(); // Empty array
					#$subheading  = array(); // Empty array
					foreach ($matches[0] as $hkey => $hvalue) {

						$is_in  = strpos($hvalue, '[struct')===0;
						$tag_id = $matches[3][$hkey];
							#dump($hvalue, ' hvalue ++ '.to_string($is_in));

						if ($is_in===true) {
							# TAG IN
							#dump($matches[6][$hkey], '$matches[6][$hkey] ++ '.to_string($hkey));
							$locator= $matches[6][$hkey];	// "locator tag_id: $tag_id";//
								#dump(count($mainheading), ' count($mainheading) ++ '.to_string());						
							if ($is_new===true) {

								if (count($mainheading)===0) {
									$mainheading[$tag_id] = $locator;
								}else{
									$subheading[$tag_id]  = $locator;
									#dump($subheading, ' $subheading ++ '.to_string());								
								}

								// Get thesaurus locators
								$ar_term_id = (array)self::get_ar_term_id($options->section_tipo, $options->section_id, $component_tipo, $tag_id);														
								// Add term_id as column							
								$segment->term_id = json_encode($ar_term_id);
								// set is_new
								if (count($matches[0])>1) {
									$is_new = true;
								}else{
									$is_new = false;
								}								
							}

						}else{
							# TAG OUT							
							if (isset($mainheading[$tag_id])) {
								$mainheading = array(); // Empty array							
							}
							if (isset($subheading[$tag_id])) {
								$subheading  = array(); // Empty array
							}							

								// Set thesaurus locators
								$ar_term_id = array();
								// Add term_id as column	
								$segment->term_id = array();
								// set is_new
								$is_new = true;
						}
						#$mainheading_val = isset($mainheading[$tag_id]) ? $mainheading[$tag_id] : false;
						#$subheading_val  = isset($subheading[$tag_id]) ? $subheading[$tag_id] : false;
						#dump($subheading, ' $subheading ++ '.to_string());
					}
					
					# MAINHEADING							
					$mainheading_val = reset($mainheading);
					$mainheading_val = json_decode( str_replace("'", '"', $mainheading_val) );
						#dump($mainheading_val, ' mainheading_val ++ '.to_string());				
					if ($mainheading_val!==null) {
						$header_component_tipo  = 'rsc372';
						$modelo_name 			=  RecordObj_dd::get_modelo_name_by_tipo($header_component_tipo,true);
						$header_component = component_common::get_instance($modelo_name,
																		   $header_component_tipo,
																		   $mainheading_val->section_id,
																		   'list',
																		   'lg-ell',
																		   $mainheading_val->section_tipo,
																		   false);
						$header_value['lg-ell'] = $header_component->get_valor('lg-ell');					
							#dump( $header_value, ' MAINHEADING_VAL ++ '.to_string($mainheading_val->section_id));
						$header_component_deu = component_common::get_instance($modelo_name,
																		   $header_component_tipo,
																		   $mainheading_val->section_id,
																		   'list',
																		   'lg-deu',
																		   $mainheading_val->section_tipo,
																		   false);
						$header_value['lg-deu'] = $header_component_deu->get_valor('lg-deu');

						$header_component_eng = component_common::get_instance($modelo_name,
																		   $header_component_tipo,
																		   $mainheading_val->section_id,
																		   'list',
																		   'lg-eng',
																		   $mainheading_val->section_tipo,
																		   false);
						$header_value['lg-eng'] = $header_component_eng->get_valor('lg-eng');
					}
					
					# SUBHEADING	
					$subheading_val = reset($subheading);	
					$subheading_val = json_decode( str_replace("'", '"', $subheading_val) );
						#dump($subheading_val, ' subheading_val ++ '.to_string());
					if ($subheading_val!==null) { 
						$subheader_component_tipo= 'rsc372';
						$modelo_name 			 =  RecordObj_dd::get_modelo_name_by_tipo($subheader_component_tipo,true);
						$subheader_component 	 = component_common::get_instance($modelo_name,
																		   	  	  $subheader_component_tipo,
																		   	  	  $subheading_val->section_id,
																		   	  	  'list',
																		   	  	  'lg-ell',
																		   	  	  $subheading_val->section_tipo,
																		   	  	  false);
						$subheader_value['lg-ell'] = $subheader_component->get_valor('lg-ell');					
							#dump( $subheader_value, ' SUBHEADING_VAL ++ '.to_string($subheading_val->section_id));
						$subheader_component_deu 	 = component_common::get_instance($modelo_name,
																		   	  	  $subheader_component_tipo,
																		   	  	  $subheading_val->section_id,
																		   	  	  'list',
																		   	  	  'lg-deu',
																		   	  	  $subheading_val->section_tipo,
																		   	  	  false);
						$subheader_value['lg-deu'] = $subheader_component_deu->get_valor('lg-deu');

						$subheader_component_eng 	 = component_common::get_instance($modelo_name,
																		   	  	  $subheader_component_tipo,
																		   	  	  $subheading_val->section_id,
																		   	  	  'list',
																		   	  	  'lg-eng',
																		   	  	  $subheading_val->section_tipo,
																		   	  	  false);
						$subheader_value['lg-eng'] = $subheader_component_eng->get_valor('lg-eng');
					}

				}//end if (!empty($matches[0])) {			
				$segment->mainheading['lg-ell'] = !empty($header_value['lg-ell']) 	 ? $header_value['lg-ell'] 	  : null;
				$segment->mainheading['lg-deu'] = !empty($header_value['lg-deu']) 	 ? $header_value['lg-deu'] 	  : null;
				$segment->mainheading['lg-eng'] = !empty($header_value['lg-eng']) 	 ? $header_value['lg-eng'] 	  : null;
				$segment->subheading['lg-ell']  = !empty($subheader_value['lg-ell']) ? $subheader_value['lg-ell'] : null;
				$segment->subheading['lg-deu']  = !empty($subheader_value['lg-deu']) ? $subheader_value['lg-deu'] : null;
				$segment->subheading['lg-eng']  = !empty($subheader_value['lg-eng']) ? $subheader_value['lg-eng'] : null;

				// Process terms. Write current terms to aditional table (many to many)
				/*
				$save_segment_ar_term_id_options = new stdClass();
					$save_segment_ar_term_id_options->ar_term_id 	= $ar_term_id;
					$save_segment_ar_term_id_options->av_section_id 	= $segment->tape_id;
					$save_segment_ar_term_id_options->segment_id 	= $segment->tape_id;
				diffusion_cedis::save_segment_ar_term_id($save_segment_ar_term_id_options);*/				
			}
			#dump($segment, ' segment ++ '.to_string());	

			# Add
			$ar_segments[] = $segment;

			$i++;
		}//end foreach ($fragments_text_by_tc as $key => $value)
		#dump($ar_segments, ' ar_segments ++ '.to_string());

		return $ar_segments;
	}//end build_segments



	/**
	* GET_SEGMENT_TRANSLATION($SEGMENTS_OPTIONS);
	* @return 
	*/
	public static function get_segment_translation($request_options) {

		$options = new stdClass();
			$options->tc_in 				= null;
			$options->tc_out 				= null;
			$options->lang 					= null; // 'lg-deu'; [11-06-2018]
			$options->component_text_area 	= null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$translation_text_area 		 = $options->component_text_area;
			#$translation_text_area->set_lang($options->lang);
			$raw_text 					 = $translation_text_area->get_dato();
	
			# Delete all tags except tc
			$delete_options = new stdClass();
				$delete_options->deleteTC = false;
			$raw_text = TR::deleteMarks($raw_text, $delete_options);

			$fragments_text_by_tc = $translation_text_area->get_fragments_text_by_tc($raw_text);
			$pattern_tc  		  = TR::get_mark_pattern('tc_full',$standalone=true);

			$fragment = null;
			foreach ($fragments_text_by_tc as $key => $value) {

				if ($value === $options->tc_in ) {
					$fragment_key = $key + 1;
					if (isset($fragments_text_by_tc[$fragment_key])) {
						$fragment = $fragments_text_by_tc[$fragment_key];
						break;
					}					
				}
			}//end foreach ($fragments_text_by_tc as $key => $value)


		return $fragment;
	}//end get_segment_translation($segments_options)	



	/**
	* SAVE_CONTRIBUTION
	* @return 
	*/
	public static function save_contribution($request_options) {
		
		$options = new stdClass();
			$options->person_dedalo_id 		= null; // is pseudo_locator like rsc197_11
			$options->interview_section_id  = null;
			$options->contribution_type 	= null; // label
			$options->database_name 		= self::$database_name;
			$options->table_name 			= 'contributions';
			$options->section_tipo 			= 'rsc197';
			$options->delete_previous 		= true;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}
				#dump($options, ' options ++ '.to_string());

		# Delete previous record
		if($options->delete_previous===true) {
			$custom = new stdClass();
				#$custom->field_name = array('person_dedalo_id','interview_section_id');
				#$custom->field_value= array($options->person_dedalo_id, $options->interview_section_id);
				# Like one person can have various types of contributions, only delete current contribution type for current person
				$custom->field_name = array('person_dedalo_id','interview_section_id','contribution_type'); // ADDED contribution_type 9-3-2018 !
				$custom->field_value= array($options->person_dedalo_id, $options->interview_section_id, $options->contribution_type); // ADDED contribution_type 9-3-2018 !
			diffusion_mysql::delete_sql_record($options->person_dedalo_id, $options->database_name, $options->table_name, $options->section_tipo, $custom);
		}

		# id interno (no de Dédalo)
		$interview_id = diffusion_cedis::get_table_record_id($options->interview_section_id, 'section_id', 'interviews');

		# id interno (no de Dédalo)
		$people_id = diffusion_cedis::get_table_record_id($options->person_dedalo_id, 'person_dedalo_id', 'people');


		###################### 4-2-2018 IN ################################################################
		if (empty($people_id)) {
			# If person is not published, force publish here 
			# Mimic real call from section publish button
			# NOTA : Si la persona no está "publicable" (botón publicación en NO), no se publicará y por tanto NO generará un new_id !!
			$ar_parts = explode('_', $options->person_dedalo_id);
			$current_person_section_tipo = $ar_parts[0];
			$current_person_section_id 	 = $ar_parts[1];
			$new_person_options = new stdClass();
				$new_person_options->section_tipo 			= $current_person_section_tipo;
				$new_person_options->section_id   			= $current_person_section_id;
				$new_person_options->diffusion_element_tipo = 'cedis3'; // Fixed cedis3
				$new_person_options->database_name 			= self::$database_name;
				$new_person_options->table_name 			= 'people (other people)';
				$new_person_options->table_propiedades 		= json_decode('{"custom_diffusion":"diffusion_cedis::process_all_persons"}');
   				#dump($new_person_options, ' $new_person_options ++ '.to_string()); die();
			
   			$result_new_id = diffusion_cedis::process_all_persons($new_person_options);
   			if (!empty($result_new_id)) {
   				$people_id = $result_new_id;
   				debug_log(__METHOD__." Successfully create person (options->person_dedalo_id) people_id:$people_id with options ".to_string($new_person_options), logger::ERROR);
   			}else{
   				debug_log(__METHOD__." Error on create person (options->person_dedalo_id) with options ".to_string($new_person_options)."\n maybe this person (options->person_dedalo_id) is NOT publicable now", logger::ERROR);
   			}
		}
		###################### 4-2-2018 OUT ################################################################


		$record_data=array();
			$record_data['database_name'] 		= $options->database_name;
			$record_data['table_name'] 			= $options->table_name;
			$record_data['diffusion_section'] 	= '';
			$record_data['engine'] 				= 'InnoDB';
			$record_data['ar_fields'] 			= array();

		$ar_fields = array();

		# interview_section_id
		$field_name  = 'interview_section_id';
		$field_value = $options->interview_section_id;
		$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

		# interview_id
		$field_name  = 'interview_id';
		$field_value = $interview_id;
		$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

		# contribution_type
		$field_name  = 'contribution_type';
		$field_value = $options->contribution_type;
		$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);		

		# person_dedalo_id
		$field_name  = 'person_dedalo_id';
		$field_value = $options->person_dedalo_id;
		$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

		# person_id
		$field_name  = 'person_id';
		$field_value = $people_id;
		$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

		$record_data['ar_fields'][$options->person_dedalo_id][] = $ar_fields;

		# Generamos el registro en mysql
		$options_save_record = new stdClass();
			$options_save_record->record_data 	  = $record_data;
			$options_save_record->typology 	  	  = null;
			$options_save_record->delete_previous = false;
			$options_save_record->section_tipo 	  = $options->section_tipo;
		$result = diffusion_mysql::save_record( $options_save_record );

		return true;
	}//end save_contribution



	/**
	* SAVE_SEGMENT_AR_TERM_ID
	* @return 
	*/
	public static function save_segment_ar_term_id($request_options) {
		
		$options = new stdClass();
			$options->ar_term_id 			= array();
			$options->av_section_id 		= null;
			$options->interview_section_id  = null;
			$options->interview_id  		= null;
			$options->segment_id 			= null;
			$options->database_name 		= self::$database_name;
			$options->table_name 			= 'registry_references';
			$options->section_tipo 			= 'rsc167';
			$options->delete_previous 		= true;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		# Delete previous record
		if($options->delete_previous===true) {
			$custom = new stdClass();
				$custom->field_name = 'dedalo_rsc167_section_id';
				$custom->field_value= $options->av_section_id;
			diffusion_mysql::delete_sql_record($options->av_section_id, $options->database_name, $options->table_name, $options->section_tipo, $custom);
		}

		# registry_references
		# Create new records
		foreach ($options->ar_term_id as $key => $term_id) {
			
			$record_data=array();
				$record_data['database_name'] 		= $options->database_name;
				$record_data['table_name'] 			= $options->table_name;
				$record_data['diffusion_section'] 	= '';
				$record_data['engine'] 				= 'InnoDB';
				$record_data['ar_fields'] 			= array();

			# id interno (no de Dédalo)
			$registry_entry_id = diffusion_cedis::get_table_record_id($term_id, 'entry_dedalo_code', 'registry_entries');

			$ar_fields = array();
			/*
			# entry_desc
			$field_name  = 'entry_code';
			$field_value = $term_id;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# segment_id
			$field_name  = 'segment_id';
			$field_value = $options->segment_id;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);*/

			# dedalo_rsc167_section_id
			$field_name  = 'dedalo_rsc167_section_id';
			$field_value = $options->av_section_id;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# registry_entry_id
			$field_name  = 'registry_entry_id';
			$field_value = $registry_entry_id;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# registry_entry_dedalo_id
			$field_name  = 'registry_entry_dedalo_id';
			$field_value = $term_id;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# ref_object_type
			$field_name  = 'ref_object_type';
			$field_value = "Segment";
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# ref_object_id
			$field_name  = 'ref_object_id';
			$field_value = $options->segment_id;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# registry_reference_type_id
			$field_name  = 'registry_reference_type_id';
			$field_value = null;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# ref_position
			$field_name  = 'ref_position';
			$field_value = null;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# original_descriptor
			$field_name  = 'original_descriptor';
			$field_value = null;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# ref_details
			$field_name  = 'ref_details';
			$field_value = null;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# ref_comments
			$field_name  = 'ref_comments';
			$field_value = null;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# ref_info
			$field_name  = 'ref_info';
			$field_value = null;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# workflow_state
			$field_name  = 'workflow_state';
			$field_value = "checked";
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# interview_section_id
			$field_name  = 'interview_section_id';
			$field_value = $options->interview_section_id;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# interview_id
			$field_name  = 'interview_id';
			$field_value = $options->interview_id;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# created_at
			$field_name  = 'created_at';
			$date = new DateTime();
			$now  = date('Y-m-d H:i:s', $date->getTimestamp());
			$field_value = $now;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# updated_at
			$field_name  = 'updated_at';
			$field_value = $now;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			$record_data['ar_fields'][$options->av_section_id][] = $ar_fields;

			# Generamos el registro en mysql
			$options_save_record = new stdClass();
				$options_save_record->record_data 	  = $record_data;
				$options_save_record->typology 	  	  = null;
				$options_save_record->delete_previous = false;
				$options_save_record->section_tipo 	  = $options->section_tipo;				
			$result = diffusion_mysql::save_record( $options_save_record );
		}//end foreach ($options->ar_term_id as $key => $term_id)
	}//end save_segment_ar_term_id



	/**
	* GET_AR_TERM_ID($SECTION_TIPO, $SECTION_ID, $COMPONENT_TIPO, $TAG_ID);
	* @return array $ar_term_id
	*/
	public static function get_ar_term_id($section_tipo, $section_id, $component_tipo, $tag_id) {
		
		$indexations_from_tag = component_relation_struct::get_indexations_from_tag($component_tipo, $section_tipo, $section_id, $tag_id, null);

		$ar_term_id = array();
		foreach ($indexations_from_tag as $key => $current_data) {
			$ar_term_id[] = $current_data->section_tipo .'_'. $current_data->section_id;
		}

		return $ar_term_id; 
	}//end get_ar_term_id($section_tipo, $section_id, $component_tipo, $tag_id);



	/**
	* PROCESS_TRANSCRIPTION
	* @return 
	*/
	public static function process_transcription($dato) {
		
		return true;
	}//end process_transcription



	/**
	* PROCESS_ALL_PERSONS
	* @return 
	*/
	public static function process_all_persons($request_options) {
		
		$options = new stdClass();
			$options->section_tipo 			= null;
			$options->section_id   			= null;
			$options->diffusion_element_tipo= null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}
			//dump($request_options, ' request_options ++ '.to_string()); die();
		
		#
		# CHECK_PUBLICATION_VALUE. Delete record (and cascade) when component_publication value is false
		$p_options = new stdClass();
			$p_options->component_publication_tipo  = 'rsc279';
			$p_options->section_id 				 	= $options->section_id;
			$p_options->section_tipo 				= $options->section_tipo;
			$p_options->database_name 			 	= $request_options->database_name;
			$p_options->table_name 			 	 	= 'people';	//$request_options->table_name;
			$p_options->diffusion_element_tipo  	= $options->diffusion_element_tipo;
			$p_options->table_propiedades  	 	 	= $request_options->table_propiedades;
			$p_options->delete_previous  	 	 	= false;
		$to_publish = diffusion_sql::check_publication_value($p_options);
		

		# pseudo_section_id
		$pseudo_section_id = $options->section_tipo .'_'. $options->section_id;

		debug_log(__METHOD__." Called with pseudo_section_id:$pseudo_section_id - to_publish:".to_string($to_publish), logger::DEBUG);


		# Delete people and person_translations
			# Delete previous record
			$custom = new stdClass();
				$custom->field_name = 'person_dedalo_id';
				$custom->field_value= $pseudo_section_id;
			diffusion_mysql::delete_sql_record($options->section_id, $request_options->database_name, 'people', $options->section_tipo, $custom);

			# Delete person_translations previous record
			$custom = new stdClass();
				$custom->field_name = 'person_dedalo_id';
				$custom->field_value= $pseudo_section_id;
			diffusion_mysql::delete_sql_record($options->section_id, $request_options->database_name, 'person_translations', $options->section_tipo, $custom);

		# Delete histories and history_translations
			# Delete histories previous record
			$custom = new stdClass();
				$custom->field_name = 'person_dedalo_id';
				$custom->field_value= $pseudo_section_id;
			diffusion_mysql::delete_sql_record($options->section_id, $request_options->database_name, 'histories', $options->section_tipo, $custom);
			
			# Delete history_translations previous record
			$custom = new stdClass();
				$custom->field_name = 'person_dedalo_id';
				$custom->field_value= $pseudo_section_id;
			diffusion_mysql::delete_sql_record($options->section_id, $request_options->database_name, 'history_translations', $options->section_tipo, $custom);
		

		if ($to_publish===false) {

			return false; # Record segment and segment translations are deleted. Stop here.
		}//end if ($to_publish===false)
		
		debug_log(__METHOD__." Called 2 with pseudo_section_id:$pseudo_section_id - to_publish:".to_string($to_publish), logger::DEBUG);

		#
		# people table
			$record_data=array();
				$record_data['database_name'] 		= self::$database_name;
				$record_data['table_name'] 			= 'people';
				$record_data['diffusion_section'] 	= 'cedis17';
				$record_data['engine'] 				= 'InnoDB';
				$record_data['ar_fields'] 			= array();

			$ar_fields  = array();
			$lang 		= 'lg-ell';
			$section 	= section::get_instance($options->section_id, $options->section_tipo);

			# person_dedalo_id
			$field_name  = 'person_dedalo_id';
			$field_value = $pseudo_section_id;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# date_of_birth
			$field_name  = 'date_of_birth';
			$component_tipo = 'rsc89';
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component 		= component_common::get_instance($modelo_name,
															 $component_tipo,
															 $options->section_id,
															 'list',
															 DEDALO_DATA_NOLAN,
															 $options->section_tipo);
			$dato = $component->get_dato();	#$valor = $component->get_valor(); 
				#dump($dato, ' dato ++ '.to_string());
			$dato 	= reset($dato);
			$year 	= isset($dato->year) ? $dato->year : '';
			$month 	= isset($dato->month) ? $dato->month : '';
			$day 	= isset($dato->day) ? $dato->day : '';
			if (!empty($year)) {
				$field_value = "$day.$month.$year";
			}else{
				$field_value = null;
			}			
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# gender
			$field_name  = 'gender';
			$component_tipo = 'rsc93';
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component 		= component_common::get_instance($modelo_name,
															 $component_tipo,
															 $options->section_id,
															 'list',
															 DEDALO_DATA_NOLAN,
															 $options->section_tipo);
			$dato = $component->get_dato();	$valor = $component->get_valor('lg-eng');
			$field_value = $valor;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# created_at
			$field_name  = 'created_at';
			$field_value = $section->get_created_date();
			$field_value = dd_date::get_date_with_format($field_value, $format="Y-m-d H:i:s");
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# updated_at
			$field_name  = 'updated_at';
			$field_value = $section->get_modified_date();
			$field_value = dd_date::get_date_with_format($field_value, $format="Y-m-d H:i:s");
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# typology
			$field_name  	= 'typology';
			$component_tipo = 'rsc449'; // typology
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component 		= component_common::get_instance($modelo_name,
															 $component_tipo,
															 $options->section_id,
															 'list',
															 'lg-eng',
															 $options->section_tipo);
			$dato = $component->get_dato();	$valor = $component->get_valor('lg-eng');
			
			$field_value = strip_tags($valor);
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);


			$record_data['ar_fields'][$options->section_id][$lang] = $ar_fields;
				#dump($record_data, ' record_data ++ *** '.to_string());

			# Generamos el registro en mysql
			$options_save_record = new stdClass();
				$options_save_record->record_data 	  = $record_data;
				$options_save_record->typology 	  	  = null;
				$options_save_record->delete_previous = false;
				$options_save_record->section_tipo 	  = $options->section_tipo;
					#dump($options_save_record, ' options_save_record ++ '.to_string());
			$result = diffusion_mysql::save_record( $options_save_record );


			# History (Biographical Milestones)
			$component_tipo = 'rsc423'; // component_portal to informant milestones
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component 		= component_common::get_instance($modelo_name,
															 $component_tipo,
															 $options->section_id,
															 'list',
															 DEDALO_DATA_NOLAN,
															 $options->section_tipo);
			$ar_locators = $component->get_dato();
			foreach ((array)$ar_locators as $key => $current_h_locator) {
				diffusion_cedis::update_history(array(
					"section_tipo" 		=> $current_h_locator->section_tipo,
					"section_id" 		=> $current_h_locator->section_id,
					"person_section_id" => $pseudo_section_id
				));
			}			

		#
		# person_translations table
		if ( !empty($result->new_id) ) {
			
			$record_data=array();
				$record_data['database_name'] 		= self::$database_name;
				$record_data['table_name'] 			= 'person_translations';
				$record_data['diffusion_section'] 	= 'cedis18';
				$record_data['engine'] 				= 'InnoDB';
				$record_data['ar_fields'] 			= array();

			foreach (array('lg-ell','lg-deu','lg-eng') as $lang) {
				
				$ar_fields  = array();
				
				# person_dedalo_id
				$field_name  = 'person_dedalo_id';
				$field_value = $pseudo_section_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# person_id
				$field_name  = 'person_id';
				$field_value = (int)$result->new_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# locale
				$field_name  = 'locale';
				$field_value = str_replace('lg-', '', $lang);
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# created_at
				$field_name  = 'created_at';
				$field_value = $section->get_created_date();
				$field_value = dd_date::get_date_with_format($field_value, $format="Y-m-d H:i:s");
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# updated_at
				$field_name  = 'updated_at';
				$field_value = $section->get_modified_date();
				$field_value = dd_date::get_date_with_format($field_value, $format="Y-m-d H:i:s");
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# first_name
				$field_name  = 'first_name';
				$component_tipo = 'rsc85'; // name
				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
				$component 		= component_common::get_instance($modelo_name,
																 $component_tipo,
																 $options->section_id,
																 'list',
																 $lang,
																 $options->section_tipo);
				$dato = $component->get_dato();	$valor = $component->get_valor($lang);
				$field_value = $valor;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# last_name
				$field_name  = 'last_name';
				$component_tipo = 'rsc86'; // surname
				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
				$component 		= component_common::get_instance($modelo_name,
																 $component_tipo,
																 $options->section_id,
																 'list',
																 $lang,
																 $options->section_tipo);
				$dato = $component->get_dato();	$valor = $component->get_valor($lang);
				$field_value = $valor;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# birth_name
				$field_name  = 'birth_name';
				$field_value = '';
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# other_first_names
				$field_name  = 'other_first_names';
				$field_value = '';
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# alias_names
				$field_name  	= 'alias_names';
				$component_tipo = 'rsc87'; // nickname
				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
				$component 		= component_common::get_instance($modelo_name,
																 $component_tipo,
																 $options->section_id,
																 'list',
																 $lang,
																 $options->section_tipo);
				$dato = $component->get_dato();	$valor = $component->get_valor($lang);
				$field_value = strip_tags($valor);
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				$record_data['ar_fields'][$pseudo_section_id][$lang] = $ar_fields;
			}//end foreach (array('lg-ell','lg-deu') as $lang)
			#dump($record_data, ' $record_data ++ '.to_string());

			# Generamos el registro en mysql
			$options_save_record = new stdClass();
				$options_save_record->record_data 	  = $record_data;
				$options_save_record->typology 	  	  = null;
				$options_save_record->delete_previous = false;
				$options_save_record->section_tipo 	  = $options->section_tipo;
					#dump($options_save_record, ' options_save_record ++ '.to_string());
			$result_translation = diffusion_mysql::save_record( $options_save_record );
		}//end if ( !empty($result->new_id) )


		#
		# registry_references table
		# Registry references add
		if ( !empty($result->new_id) ) {
			# Delete previous record			
			$custom = new stdClass();
				$custom->field_name = array('dedalo_rsc167_section_id','ref_object_type');
				$custom->field_value= array($options->section_id, 'Person');
			diffusion_mysql::delete_sql_record($options->section_id, self::$database_name, 'registry_references', $options->section_tipo, $custom);
			# $section_id, $database_name, $table_name, $section_tipo=null, $custom=false

			$record_data=array();
					$record_data['database_name'] 		= self::$database_name;
					$record_data['table_name'] 			= 'registry_references';
					$record_data['diffusion_section'] 	= '';
					$record_data['engine'] 				= 'InnoDB';
					$record_data['ar_fields'] 			= array();

			# BIRTH PLACE
				$ar_fields = array();

				# ref_object_id (interview_id)
				$field_name  = 'ref_object_id';
				$field_value = $result->new_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# ref_object_type
				$field_name  = 'ref_object_type';
				$field_value = 'Person';
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# registry_reference_type_id
				$field_name  = 'registry_reference_type_id';
				$field_value = 4;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# registry_entry_id
				$field_name  = 'registry_entry_id';
			
				$component_tipo = 'rsc91';
				$section_tipo 	= $options->section_tipo;
				$parent 		= $options->section_id;
				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true); // component_autocomplete_hi
				$component 		= component_common::get_instance($modelo_name,
																 $component_tipo,
																 $parent,
																 'list',
																 DEDALO_DATA_NOLAN,
																 $section_tipo);
				$dato = $component->get_dato();
				
				$registry_entry_id  = null;
				$term_id 			= null;
				if (isset($dato[0])) {
					$term_id = $dato[0]->section_tipo .'_'. $dato[0]->section_id;
					$registry_entry_id = diffusion_cedis::get_table_record_id($term_id, 'entry_dedalo_code', 'registry_entries');
						#dump($registry_entry_id, ' registry_entry_id ++ '.to_string($term_id)); die();
				}
				$field_value = $registry_entry_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# registry_entry_dedalo_id
				$field_name  = 'registry_entry_dedalo_id';
				$field_value = $term_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# dedalo_rsc167_section_id
				$field_name  = 'dedalo_rsc167_section_id';
				$field_value = $options->section_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);


				$record_data['ar_fields'][$options->section_id][$lang] = $ar_fields;
				#dump($record_data, ' record_data ++ *** '.to_string());

				# Generamos el registro en mysql
				$options_save_record = new stdClass();
					$options_save_record->record_data 	  = $record_data;
					$options_save_record->typology 	  	  = null;
					$options_save_record->delete_previous = false;
						#dump($options_save_record, ' options_save_record ++ '.to_string());
				$result2 = diffusion_mysql::save_record( $options_save_record );


			# DEAD PLACE
				$ar_fields = array();

				# ref_object_id
				$field_name  = 'ref_object_id';
				$field_value = $result->new_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# ref_object_type
				$field_name  = 'ref_object_type';
				$field_value = 'Person';
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# registry_reference_type_id
				$field_name  = 'registry_reference_type_id';
				$field_value = 5;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# registry_entry_id
				$field_name  = 'registry_entry_id';
			
				$component_tipo = 'rsc284';
				$section_tipo 	= $options->section_tipo;
				$parent 		= $options->section_id;
				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true); // component_autocomplete_hi
				$component 		= component_common::get_instance($modelo_name,
																 $component_tipo,
																 $parent,
																 'list',
																 DEDALO_DATA_NOLAN,
																 $section_tipo);
				$dato = $component->get_dato();

				$registry_entry_id  = null;
				$term_id 			= null;
				if (isset($dato[0])) {
					$term_id = $dato[0]->section_tipo .'_'. $dato[0]->section_id;
					$registry_entry_id = diffusion_cedis::get_table_record_id($term_id, 'entry_dedalo_code', 'registry_entries');
						#dump($registry_entry_id, ' registry_entry_id ++ '.to_string($term_id)); die();
				}
				$field_value = $registry_entry_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# registry_entry_dedalo_id
				$field_name  = 'registry_entry_dedalo_id';
				$field_value = $term_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# dedalo_rsc167_section_id
				$field_name  = 'dedalo_rsc167_section_id';
				$field_value = $options->section_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);


				$record_data['ar_fields'][$options->section_id][$lang] = $ar_fields;
				#dump($record_data, ' record_data ++ *** '.to_string());

				# Generamos el registro en mysql
				$options_save_record = new stdClass();
					$options_save_record->record_data 	  = $record_data;
					$options_save_record->typology 	  	  = null;
					$options_save_record->delete_previous = false;
						#dump($options_save_record, ' options_save_record ++ '.to_string());
				$result_dead = diffusion_mysql::save_record( $options_save_record );

		}//end if ( !empty($result->new_id) )


		return $result->new_id;
	}//end process_all_persons



	/**
	* PROCESS_ALL_HIERARCHY
	* @return bool
	*/
	public static function process_all_hierarchy() {
		
		// Calculate all hierarchy active sections
		$ar_sections = hierarchy::get_active_hierarchies($ar_type=null);


		foreach ((array)$ar_sections as $key => $row) {
			
			$section_tipo = $row['target_section'];
				#dump($section_tipo, ' $section_tipo ++ '.to_string()); continue;

			// Skip languages section
			if ($section_tipo==="lg1") {
				continue;
			}

			// Get all records from current section
			$resource_all_section_result = section::get_resource_all_section_records_unfiltered($section_tipo);			
			while ($rows = pg_fetch_assoc($resource_all_section_result)) {
				$section_id = $rows['section_id'];
				// Update current record
				diffusion_cedis::update_ts_term(array("section_tipo" => $section_tipo,
													  "section_id" 	 => $section_id));
			}//end while ($rows = pg_fetch_assoc($result)) {

			# Forces collection of any existing garbage cycles on each section cycle		
			gc_collect_cycles();
			
			debug_log(__METHOD__." Done section_tipo: $section_tipo - ".to_string($key), logger::WARNING);
			#break; // Only one for test
		}//end foreach ($ar_sections as $key => $row)

		#$q1 = "UPDATE registry_hierarchies rh, (select id, entry_dedalo_code from registry_entries) re SET rh.ancestor_id=re.id WHERE rh.ancestor_dedalo_id=re.entry_dedalo_code; ";
		#$q2 = "UPDATE registry_hierarchies rh, (select id, entry_dedalo_code from registry_entries) re SET rh.descendant_id=re.id WHERE rh.descendant_dedalo_id=re.entry_dedalo_code; ";
		#$sql= $q1 . $q2;
		#$result = diffusion_mysql::exec_mysql_query( $q1, $table='registry_hierarchies', $database_name=self::$database_name, $multi_query=true);
		#$result = diffusion_mysql::exec_mysql_query( $q2, $table='registry_hierarchies', $database_name=self::$database_name, $multi_query=true);

		return true;
	}//end process_all_hierarchy



	/**
	* UPDATE_TS_TERM
	* Called also from thesaurus diffusion buttons
	* @return bool
	*/
	public static function update_ts_term($request_options) {

		static $resolved_term;
	
		$options = new stdClass();
			$options->section_tipo = null;
			$options->section_id   = null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$section_tipo 	= $options->section_tipo;
		$section_id 	= $options->section_id;
		$term_id 		= $section_tipo.'_'.$section_id;

		# Resolved		
		if(array_key_exists($term_id, (array)$resolved_term)) {
			debug_log(__METHOD__." = Skip already reolved term $term_id - ".$resolved_term[$term_id], logger::DEBUG);
			return $resolved_term[$term_id];
		}

		$is_hierarchy   = ($section_tipo==="hierarchy1") ? true : false;

		if ($is_hierarchy===true) {
			$component_publication_tipo = 'hierarchy62';
		}else{
			$component_publication_tipo = 'hierarchy26';
		}

		#
		# CHECK_PUBLICATION_VALUE. Delete record (and cascade) when component_publication value is false
		$p_options = new stdClass();
			$p_options->component_publication_tipo  = $component_publication_tipo;
			$p_options->section_id 				 	= $options->section_id;
			$p_options->section_tipo 				= $options->section_tipo;
			$p_options->database_name 			 	= $request_options->database_name;
			$p_options->table_name 			 	 	= $request_options->table_name;
			$p_options->diffusion_element_tipo  	= $request_options->diffusion_element_tipo;
			$p_options->table_propiedades  	 	 	= $request_options->table_propiedades;
		$to_publish = diffusion_sql::check_publication_value($p_options);
			#dump($to_publish, ' to_publish ++ '.to_string($p_options));

		# DELETE PREVIOUS
			# Delete registry_entries previous record
			$custom = new stdClass();
				$custom->field_name = 'entry_dedalo_code';
				$custom->field_value= $term_id;
			$delete = diffusion_mysql::delete_sql_record($options->section_id, $request_options->database_name, 'registry_entries', $options->section_tipo, $custom);
			debug_log(__METHOD__." - delete_sql_record $request_options->database_name $options->section_tipo $options->section_id $custom->field_name $custom->field_value ".to_string(), logger::DEBUG);

			# Delete registry_hierarchies previous record
			$custom = new stdClass();
				$custom->field_name = 'ancestor_dedalo_id';
				$custom->field_value= $term_id;
			diffusion_mysql::delete_sql_record($options->section_id, $request_options->database_name, 'registry_hierarchies', $options->section_tipo, $custom);

			# Delete registry_names previous record
			$custom = new stdClass();
				$custom->field_name = 'registry_entry_dedalo_id';
				$custom->field_value= $term_id;
			diffusion_mysql::delete_sql_record($options->section_id, $request_options->database_name, 'registry_names', $options->section_tipo, $custom);

			# Delete registry_name_translations previous record
			$custom = new stdClass();
				$custom->field_name = 'registry_name_dedalo_id';
				$custom->field_value= $term_id;
			diffusion_mysql::delete_sql_record($options->section_id, $request_options->database_name, 'registry_name_translations', $options->section_tipo, $custom);

		if ($to_publish===false) {
			return false; # Record segment and segment translations are deleted. Stop here.
		}//end if ($to_publish===false)	
		

		#
		# registry_entries table
			$record_data=array();
				$record_data['database_name'] 		= self::$database_name;
				$record_data['table_name'] 			= 'registry_entries';
				$record_data['diffusion_section'] 	= '';
				$record_data['engine'] 				= 'InnoDB';
				$record_data['ar_fields'] 			= array();

			$ar_fields = array();

			# Geolocation (hierarchy31)
			if($is_hierarchy===true) {
				$dato = null;
			}else{
				$modelo_name= RecordObj_dd::get_modelo_name_by_tipo(DEDALO_THESAURUS_GEOLOCATION_TIPO, true);
				$component 	= component_common::get_instance($modelo_name,
															 DEDALO_THESAURUS_GEOLOCATION_TIPO,
															 $section_id,
															 'list',
															 DEDALO_DATA_NOLAN,
															 $section_tipo);
				$dato 	   = $component->get_dato();
			}
			
			$latitude  = isset($dato->lat) ? $dato->lat : null;
			$longitude = isset($dato->lon) ? $dato->lon : null;
			if(($latitude=='0' && $longitude=='0') || ($latitude=='39.46243882474595' && $longitude=='-0.3764533996582032')) {
				$latitude  = null;
				$longitude = null;
			}
			#dump($latitude, ' latitude ++ '.to_string());

			# entry_dedalo_code
			$field_name  = 'entry_dedalo_code';
			$field_value = $term_id;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# entry_code
			$field_name  = 'entry_code';
			$field_value = null;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# entry_desc
			$field_name  = 'entry_desc';
			$field_value = null;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# latitude
			$field_name  = 'latitude';
			$field_value = $latitude;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# longitude
			$field_name  = 'longitude';
			$field_value = $longitude;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# workflow_state
			$field_name  = 'workflow_state';
			$field_value = 'public';
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# list_priority
			$field_name  = 'list_priority';
			$field_value = 0;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# created_at
			$field_name  = 'created_at';
			$date = new DateTime();
			$now  = date('Y-m-d H:i:s', $date->getTimestamp());
			$field_value = $now;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# updated_at
			$field_name  = 'updated_at';
			$field_value = $now;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# Delete previous record
			# $custom = new stdClass();
			# 	$custom->field_name = 'entry_dedalo_code';
			# 	$custom->field_value= $term_id;
			# diffusion_mysql::delete_sql_record($section_id, $record_data['database_name'], $record_data['table_name'], $section_tipo, $custom);

			$record_data['ar_fields'][$section_id][] = $ar_fields;

			# Generamos el registro en mysql
			$options_save_record = new stdClass();
				$options_save_record->record_data 	  = $record_data;
				$options_save_record->typology 	  	  = null;
				$options_save_record->delete_previous = false;
				$options_save_record->section_tipo 	  = $section_tipo;						
			$result = diffusion_mysql::save_record( $options_save_record );

			// REGISTRY_ENTRY_ID
			$registry_entry_id = $result->new_id;
	
		#
		# registry_hierarchies table
			$record_data=array();
				$record_data['database_name'] 		= self::$database_name;
				$record_data['table_name'] 			= 'registry_hierarchies';
				$record_data['diffusion_section'] 	= '';
				$record_data['engine'] 				= 'InnoDB';
				$record_data['ar_fields'] 			= array();

			# Childrens 
			if($is_hierarchy===true) {
				# (hierarchy45)
				$modelo_name= RecordObj_dd::get_modelo_name_by_tipo(DEDALO_HIERARCHY_CHIDRENS_TIPO, true);
				$component 	= component_common::get_instance($modelo_name,
															 DEDALO_HIERARCHY_CHIDRENS_TIPO,
															 $section_id,
															 'list',
															 DEDALO_DATA_NOLAN,
															 $section_tipo);
				$dato = $component->get_dato();
			}else{
				# (hierarchy49)
				$modelo_name= RecordObj_dd::get_modelo_name_by_tipo(DEDALO_THESAURUS_RELATION_CHIDRENS_TIPO, true);
				$component 	= component_common::get_instance($modelo_name,
															 DEDALO_THESAURUS_RELATION_CHIDRENS_TIPO,
															 $section_id,
															 'list',
															 DEDALO_DATA_NOLAN,
															 $section_tipo);
				$dato = $component->get_dato();
			}
			
			foreach ($dato as $key => $children_locator) {

				$descendant_term_id = $children_locator->section_tipo.'_'.$children_locator->section_id;

				# id interno (no de Dédalo)
				$descendant_id = diffusion_cedis::get_table_record_id($descendant_term_id, 'entry_dedalo_code', 'registry_entries');
				if (empty($descendant_id)) {

					## 
					# Create children term in MySQL
					# This code create each no existing children record in registry_entries
					$create_options = new stdClass();
						$create_options->database_name 			= $request_options->database_name;
						$create_options->table_name 			= $request_options->table_name;
						$create_options->diffusion_element_tipo = $request_options->diffusion_element_tipo;
						$create_options->table_propiedades  	= $request_options->table_propiedades;
						$create_options->section_tipo 			= $children_locator->section_tipo;
						$create_options->section_id   			= $children_locator->section_id;
					$created_registry_entries_id = diffusion_cedis::update_ts_term($create_options);

					# Try again
					$descendant_id = $created_registry_entries_id;//diffusion_cedis::get_table_record_id($descendant_term_id, 'entry_dedalo_code', 'registry_entries');
				}//end if (empty($descendant_id))

				$ar_fields = array();

				# ancestor_dedalo_id
				$field_name  = 'ancestor_dedalo_id';
				$field_value = $term_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# descendant_dedalo_id
				$field_name  = 'descendant_dedalo_id';
				$field_value = $descendant_term_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# ancestor_id
				$field_name  = 'ancestor_id';
				$field_value = $registry_entry_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# descendant_id
				$field_name  = 'descendant_id';
				$field_value = $descendant_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# direct
				$field_name  = 'direct';
				$field_value = 1;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# count
				$field_name  = 'count';
				$field_value = 0;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# created_at
				$field_name  = 'created_at';
				$date = new DateTime();
				$now  = date('Y-m-d H:i:s', $date->getTimestamp());
				$field_value = $now;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# updated_at
				$field_name  = 'updated_at';
				$field_value = $now;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);				

				$record_data['ar_fields'][$section_id][] = $ar_fields;
				
			}//end foreach ($dato as $key => $children_locator)

			# Delete previous record
				# $custom = new stdClass();
				# 	$custom->field_name = 'ancestor_dedalo_id';
				# 	$custom->field_value= $term_id;
				# diffusion_mysql::delete_sql_record($section_id, $record_data['database_name'], $record_data['table_name'], $section_tipo, $custom);

			# Generamos el registro en mysql
				$options_save_record = new stdClass();
					$options_save_record->record_data 	  = $record_data;
					$options_save_record->typology 	  	  = null;
					$options_save_record->delete_previous = false;
					$options_save_record->section_tipo 	  = $section_tipo;
						#dump($options_save_record, ' options_save_record ++ '.to_string());
				$result = diffusion_mysql::save_record( $options_save_record );

		#
		# registry_names table
			$record_data=array();
				$record_data['database_name'] 		= self::$database_name;
				$record_data['table_name'] 			= 'registry_names';
				$record_data['diffusion_section'] 	= '';
				$record_data['engine'] 				= 'InnoDB';
				$record_data['ar_fields'] 			= array();

			$ar_fields = array();

			# registry_entry_dedalo_id
			$field_name  = 'registry_entry_dedalo_id';
			$field_value = $term_id;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# registry_name_type_dedalo_id
			$field_name  = 'registry_name_type_dedalo_id';
			$field_value = $term_id;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# registry_entry_id
			$field_name  = 'registry_entry_id';
			$field_value = $registry_entry_id;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# registry_name_type_id
			$field_name  = 'registry_name_type_id';
			$field_value = 1;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# name_position
			$field_name  = 'name_position';
			$field_value = null;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# created_at
			$field_name  = 'created_at';
			$date = new DateTime();
			$now  = date('Y-m-d H:i:s', $date->getTimestamp());
			$field_value = $now;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# updated_at
			$field_name  = 'updated_at';
			$field_value = $now;
			$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

			# Delete previous record
			# $custom = new stdClass();
			# 	$custom->field_name = 'registry_entry_id';
			# 	$custom->field_value= $term_id;
			# diffusion_mysql::delete_sql_record($section_id, $record_data['database_name'], $record_data['table_name'], $section_tipo, $custom);

			$record_data['ar_fields'][$section_id][] = $ar_fields;

			# Generamos el registro en mysql
			$options_save_record = new stdClass();
				$options_save_record->record_data 	  = $record_data;
				$options_save_record->typology 	  	  = null;
				$options_save_record->delete_previous = false;
				$options_save_record->section_tipo 	  = $section_tipo;
					#dump($options_save_record, ' options_save_record ++ '.to_string());
			$result = diffusion_mysql::save_record( $options_save_record );

			$registry_name_id = $result->new_id;

		#
		# registry_name_translations table
			$record_data=array();
				$record_data['database_name'] 		= self::$database_name;
				$record_data['table_name'] 			= 'registry_name_translations';
				$record_data['diffusion_section'] 	= '';
				$record_data['engine'] 				= 'InnoDB';
				$record_data['ar_fields'] 			= array();

				# Delete previous record
				# $custom = new stdClass();
				# 	$custom->field_name = 'registry_name_dedalo_id';
				# 	$custom->field_value= $term_id;
				# diffusion_mysql::delete_sql_record($section_id, $record_data['database_name'], $record_data['table_name'], $section_tipo, $custom);

			$term_is_empty = true;
			if (!function_exists('get_term_value')) {
			function get_term_value($is_hierarchy, $section_id, $section_tipo, $lang, &$term_is_empty) {
				$term = null;

				# Thesaurus term 
				if($is_hierarchy===true) {
					# (hierarchy5)
					$modelo_name= RecordObj_dd::get_modelo_name_by_tipo(DEDALO_HIERARCHY_TERM_TIPO, true);
					$component 	= component_common::get_instance($modelo_name,
																 DEDALO_HIERARCHY_TERM_TIPO,
																 $section_id,
																 'edit', // list mode do a lang fallback ..
																 $lang,
																 $section_tipo);
					$term = $component->get_valor();
				}else{
					# (hierarchy25)
					$modelo_name= RecordObj_dd::get_modelo_name_by_tipo(DEDALO_THESAURUS_TERM_TIPO, true);
					$component 	= component_common::get_instance($modelo_name,
																 DEDALO_THESAURUS_TERM_TIPO,
																 $section_id,
																 'edit', // list mode do a lang fallback ..
																 $lang,
																 $section_tipo);
					$term = $component->get_valor();
				}

				if (empty($term)===false) {
					$term_is_empty = false;
				}

				return $term;
			}
			}


			$note_is_empty = true;
			if (!function_exists('get_note_value')) {
			function get_note_value($is_hierarchy, $section_id, $section_tipo, $lang, &$note_is_empty) {
				$note = null;

				# Thesaurus term 
				if($is_hierarchy===true) {
					//nothing to do
				}else{
					# (hierarchy28)
					$modelo_name= RecordObj_dd::get_modelo_name_by_tipo('hierarchy28', true);
					$component 	= component_common::get_instance($modelo_name,
																 'hierarchy28',
																 $section_id,
																 'edit', // list mode do a lang fallback ..
																 $lang,
																 $section_tipo);
					$note = $component->get_valor();
				}

				if (empty($note)===false) {
					$note_is_empty = false;
				}

				return $note;
			}
			}


			$ar_langs = array('lg-ell','lg-deu','lg-eng');			
			foreach ($ar_langs as $lang) {
				
				$term = get_term_value($is_hierarchy, $section_id, $section_tipo, $lang, $term_is_empty);
				$note = get_note_value($is_hierarchy, $section_id, $section_tipo, $lang, $note_is_empty);
				
				$ar_fields = array();

				# registry_name_dedalo_id
				$field_name  = 'registry_name_dedalo_id';
				$field_value = $term_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# registry_name_id
				$field_name  = 'registry_name_id';
				$field_value = $registry_name_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);
				
				# locale
				$field_name  = 'locale';
				$field_value = substr($lang, 3);
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# descriptor
				$field_name  = 'descriptor';
				$field_value = $term;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# Scope notes
				$field_name  = 'notes';
				$field_value = $note;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# created_at
				$field_name  = 'created_at';
				$date = new DateTime();
				$now  = date('Y-m-d H:i:s', $date->getTimestamp());
				$field_value = $now;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# updated_at
				$field_name  = 'updated_at';
				$field_value = $now;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);
				
				$record_data['ar_fields'][$section_id][$lang] = $ar_fields;						
			}//end foreach (array('lg-ell','lg-deu','lg-eng') as $lang)	

			# Check if all langs are empty to generate aditional fallback row in main_lang				
			if ($term_is_empty===true) {
				# Do fallback
				$main_lang = hierarchy::get_main_lang($section_tipo);
				if (!in_array($main_lang, $ar_langs)) {
					$source_value = reset($record_data['ar_fields'][$section_id]);
					foreach ($source_value as $key => $ar_value) {
						if ($ar_value['field_name']==='locale') {
							$source_value[$key]['field_value'] = $main_lang;
						}elseif ($ar_value['field_name']==='descriptor') {
							$term = get_term_value($is_hierarchy, $section_id, $section_tipo, $main_lang, $term_is_empty);
							$source_value[$key]['field_value'] = $term;
						}
					}	
					$record_data['ar_fields'][$section_id][$main_lang] = $source_value;
				}//if (!in_array($main_lang, $ar_langs))
			}

			
			# Generamos el registro en mysql
			$options_save_record = new stdClass();
				$options_save_record->record_data 	  = $record_data;
				$options_save_record->typology 	  	  = null;
				$options_save_record->delete_previous = false;
				$options_save_record->section_tipo 	  = $section_tipo;
					#dump($options_save_record, ' options_save_record ++ '.to_string());
			$result = diffusion_mysql::save_record( $options_save_record );

		debug_log(__METHOD__." + Updated record $term_id - $section_id - $section_tipo - ".to_string($registry_entry_id), logger::DEBUG);

		$resolved_term[$term_id] = $registry_entry_id;


		return $registry_entry_id; // automatic id generated in MySQL 
	}//end update_ts_term



	/**
	* UPDATE_ANNOTATION
	* Updates tables annotations, annotations_traslations for each note_section_id requested
	* Is triggered by diffusion_cedis::build_segments when segment is builded and current segment 
	* contains a annotation inside. 
	* @return bool
	*/
	public static function update_annotation( $request_options ) {

		$options = new stdClass();
			$options->note_section_id 		= null;
			$options->interview_section_id 	= null;
			$options->interview_id 			= null;
			$options->av_section_id 		= null;
			$options->segment_timecode 		= null;
			$options->segment_id 			= null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$section_tipo 	= DEDALO_NOTES_SECTION_TIPO;	
		$section_id 	= $options->note_section_id;

		
		$section 		 = section::get_instance($section_id, $section_tipo );
		$user_content_id = $section->get_created_by_userID();
		$author  		 = $section->get_created_by_user_name(true);
			
		$component_tipo = 'rsc21'; // Code
		$modelo_name= RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
		$component 	= component_common::get_instance($modelo_name,
													 $component_tipo,
													 $options->av_section_id,
													 'list',
													 DEDALO_DATA_NOLAN,
													 DEDALO_SECTION_RESOURCES_AV_TIPO);
		$media_id 	   = $component->get_valor();

		$date = new DateTime();
		$now  = date('Y-m-d H:i:s', $date->getTimestamp());

		#
		# annotations table
			$record_data=array();
				$record_data['database_name'] 		= self::$database_name;
				$record_data['table_name'] 			= 'annotations';
				$record_data['diffusion_section'] 	= '';
				$record_data['engine'] 				= 'InnoDB';
				$record_data['ar_fields'] 			= array();

			# Delete previous record
				$custom = new stdClass();
					$custom->field_name = 'section_id';
					$custom->field_value= $options->note_section_id;
				diffusion_mysql::delete_sql_record($section_id, $record_data['database_name'], $record_data['table_name'], $section_tipo, $custom);
				
				$ar_fields = array();
				
				# interview_section_id
				$field_name  = 'interview_section_id';
				$field_value = $options->interview_section_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# interview_id
				$field_name  = 'interview_id';
				$field_value = $options->interview_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# section_id
				$field_name  = 'section_id';
				$field_value = $options->note_section_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# author
				$field_name  = 'author';
				$field_value = $author;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# media_id
				$field_name  = 'media_id';
				$field_value = $media_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# timecode
				$field_name  = 'timecode';
				$field_value = $options->segment_timecode;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# segment_id
				$field_name  = 'segment_id';
				$field_value = $options->segment_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# user_content_id
				$field_name  = 'user_content_id';
				$field_value = null;	//(int)$user_content_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# created_at
				$field_name  = 'created_at';		
				$field_value = $now;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# updated_at
				$field_name  = 'updated_at';
				$field_value = $now;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				$record_data['ar_fields'][$section_id][] = $ar_fields;

			# Generamos el registro en mysql
			$options_save_record = new stdClass();
				$options_save_record->record_data 	  = $record_data;
				$options_save_record->typology 	  	  = null;
				$options_save_record->delete_previous = false;
				$options_save_record->section_tipo 	  = $section_tipo;
			$result = diffusion_mysql::save_record( $options_save_record );

			$new_annotation_id = $result->new_id;

		#
		# annotation_translations table
			$record_data=array();
				$record_data['database_name'] 		= self::$database_name;
				$record_data['table_name'] 			= 'annotation_translations';
				$record_data['diffusion_section'] 	= '';
				$record_data['engine'] 				= 'InnoDB';
				$record_data['ar_fields'] 			= array();

			# Delete previous record
				$custom = new stdClass();
					$custom->field_name = 'annotation_section_id';
					$custom->field_value= $options->note_section_id;
				diffusion_mysql::delete_sql_record($section_id, $record_data['database_name'], $record_data['table_name'], $section_tipo, $custom);

			# iterate langs
			foreach (array('lg-ell','lg-deu','lg-eng') as $lang) {

				# Annotations text (rsc329)
				$modelo_name= RecordObj_dd::get_modelo_name_by_tipo(DEDALO_NOTES_TEXT_TIPO, true);
				$component 	= component_common::get_instance($modelo_name,
															 DEDALO_NOTES_TEXT_TIPO,
															 $section_id,
															 'edit', // mode list implies fallback
															 $lang,
															 $section_tipo);
				$text 	   = $component->get_valor();
				
				$ar_fields = array();

				# annotation_section_id
				$field_name  = 'annotation_section_id';
				$field_value = $options->note_section_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# annotation_id
				$field_name  = 'annotation_id';
				$field_value = $new_annotation_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# locale
				$field_name  = 'locale';
				$field_value = substr($lang, 3);
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# text
				$field_name  = 'text';
				$field_value = $text;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);				

				# created_at
				$field_name  = 'created_at';				
				$field_value = $now;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# updated_at
				$field_name  = 'updated_at';
				$field_value = $now;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				$record_data['ar_fields'][$section_id][$lang] = $ar_fields;	
			}//end foreach (array('lg-ell','lg-deu','lg-eng') as $lang) 


			# Generamos el registro en mysql
			$options_save_record = new stdClass();
				$options_save_record->record_data 	  = $record_data;
				$options_save_record->typology 	  	  = null;
				$options_save_record->delete_previous = false;
				$options_save_record->section_tipo 	  = $section_tipo;						
			$result = diffusion_mysql::save_record( $options_save_record );

		debug_log(__METHOD__." Updated note record $section_id - $section_tipo ".to_string(), logger::DEBUG);

		return true;
	}//end update_annotation



	/**
	* UPDATE_HISTORY
	* @return bool
	*/
	public static function update_history( $request_options ) {
		
		$options = new stdClass();
			$options->section_tipo 			= null; // Biographical Milestones section tipo
			$options->section_id 			= null;	// Biographical Milestones section_id
			$options->person_section_id 	= null;	// Informant pseudo section_id like rsc197_2
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$section_id 	= $options->section_id;
		$section_tipo 	= $options->section_tipo;	// 'rsc420'; // Biographical Milestones

		$date = new DateTime();
		$now  = date('Y-m-d H:i:s', $date->getTimestamp());

		# id interno (no de Dédalo)
		$people_id = diffusion_cedis::get_table_record_id($options->person_section_id, 'person_dedalo_id', 'people');

		#
		# histories table
			$record_data=array();
				$record_data['database_name'] 		= self::$database_name;
				$record_data['table_name'] 			= 'histories';
				$record_data['diffusion_section'] 	= '';
				$record_data['engine'] 				= 'InnoDB';
				$record_data['ar_fields'] 			= array();

			# Delete previous record
				/*$custom = new stdClass();
					$custom->field_name = 'section_id';
					$custom->field_value= $section_id;
				diffusion_mysql::delete_sql_record($section_id, $record_data['database_name'], $record_data['table_name'], $section_tipo, $custom);*/
				
				$ar_fields = array();
				
				# section_id
				$field_name  = 'section_id';
				$field_value = $section_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# person_dedalo_id
				$field_name  = 'person_dedalo_id';
				$field_value = (string)$options->person_section_id; // like rsc197_2
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# person_id
				$field_name  = 'person_id';
				$field_value = $people_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);
				
				# created_at
				$field_name  = 'created_at';
				$field_value = $now;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# updated_at
				$field_name  = 'updated_at';
				$field_value = $now;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				$record_data['ar_fields'][$section_id][] = $ar_fields;

			# Generamos el registro en mysql
			$options_save_record = new stdClass();
				$options_save_record->record_data 	  = $record_data;
				$options_save_record->typology 	  	  = null;
				$options_save_record->delete_previous = false;
				$options_save_record->section_tipo 	  = $section_tipo;
			$result = diffusion_mysql::save_record( $options_save_record );

			$history_id = $result->new_id;

		#
		# history_translations table
			$record_data=array();
				$record_data['database_name'] 		= self::$database_name;
				$record_data['table_name'] 			= 'history_translations';
				$record_data['diffusion_section'] 	= '';
				$record_data['engine'] 				= 'InnoDB';
				$record_data['ar_fields'] 			= array();

			# Delete previous record
				/*$custom = new stdClass();
					$custom->field_name = 'person_id';
					$custom->field_value= (string)$options->person_section_id; // like rsc197_2
				diffusion_mysql::delete_sql_record($section_id, $record_data['database_name'], $record_data['table_name'], $section_tipo, $custom);*/

			# Date (rsc415) Timeframe
			$date_tipo = 'rsc415';
			$modelo_name= RecordObj_dd::get_modelo_name_by_tipo($date_tipo, true);
			$date_component 	= component_common::get_instance($modelo_name,
														 $date_tipo,
														 $section_id,
														 'list',
														 DEDALO_DATA_NOLAN,
														 $section_tipo);
			$dato = (array)$date_component->get_dato();
			$date_object = reset($dato);
			$deportation_date = null;			
			if (isset($date_object->start)) {
				$ar_parts = array();
				if (isset($date_object->start->day)) {
					$ar_parts[] = $date_object->start->day;
				}
				if (isset($date_object->start->month)) {
					$ar_parts[] = $date_object->start->month;
				}
				if (isset($date_object->start->year)) {
					$ar_parts[] = $date_object->start->year;
				}
				$deportation_date = implode('-', $ar_parts);
			}
			$return_date = null;
			if (isset($date_object->end)) {
				$ar_parts = array();
				if (isset($date_object->end->day)) {
					$ar_parts[] = $date_object->end->day;
				}
				if (isset($date_object->end->month)) {
					$ar_parts[] = $date_object->end->month;
				}
				if (isset($date_object->end->year)) {
					$ar_parts[] = $date_object->end->year;
				}
				$return_date = implode('-', $ar_parts);
			}
			

			# iterate langs
			foreach (array('lg-ell','lg-deu','lg-eng') as $lang) {

				# Description text (rsc417)
				$description_tipo 	= 'rsc417';
				$modelo_name 		= RecordObj_dd::get_modelo_name_by_tipo($description_tipo, true);
				$desc_component 	= component_common::get_instance($modelo_name,
																	 $description_tipo,
																	 $section_id,
																	 'edit',
																	 $lang,
																	 $section_tipo);
				$forced_labor_details = $desc_component->get_dato();
					#dump($forced_labor_details, ' forced_labor_details ++ '.to_string($lang));
				
				$ar_fields = array();

				# history_id
				$field_name  = 'history_id';
				#$field_value = $section_id;
				$field_value = $history_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# person_dedalo_id
				$field_name  = 'person_dedalo_id';
				$field_value = (string)$options->person_section_id; // like rsc197_2
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# person_id
				$field_name  = 'person_id';
				$field_value = $people_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# locale
				$field_name  = 'locale';
				$field_value = substr($lang, 3);
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# forced_labor_details
				$field_name  = 'forced_labor_details';
				$field_value = $forced_labor_details;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);	

				# return_date
				$field_name  = 'return_date';
				$field_value = $return_date;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# deportation_date
				$field_name  = 'deportation_date';
				$field_value = $deportation_date;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# punishment
				$field_name  = 'punishment';
				$field_value = null;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# liberation_date
				$field_name  = 'liberation_date';
				$field_value = null;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# created_at
				$field_name  = 'created_at';				
				$field_value = $now;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# updated_at
				$field_name  = 'updated_at';
				$field_value = $now;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				$record_data['ar_fields'][$section_id][$lang] = $ar_fields;	
			}//end foreach (array('lg-ell','lg-deu','lg-eng') as $lang) 


			# Generamos el registro en mysql
			$options_save_record = new stdClass();
				$options_save_record->record_data 	  = $record_data;
				$options_save_record->typology 	  	  = null;
				$options_save_record->delete_previous = false;
				$options_save_record->section_tipo 	  = $section_tipo;
			$result = diffusion_mysql::save_record( $options_save_record );

		debug_log(__METHOD__." Updated history (Biographical Milestones) informant:$options->person_section_id - section_id:$section_id - section_tipo:$section_tipo ".to_string(), logger::DEBUG);

		return true;
	}//end update_history



	/**
	* PROCESS_INTERVIEW_PHOTOS
	* Note: not configure to direct call because neef interview_id. Called from from 'photos' (cedis104) on interview washwer
	* @return 
	*/
	public static function process_interview_photos( $request_options ) {

		#debug_log(__METHOD__." CALLED with options: ".to_string($request_options), logger::ERROR);

		    # Direct
		   		#[section_tipo] => rsc170
			    #[section_id] => 1
			    #[diffusion_element_tipo] => cedis3
			    #[database_name] => web_cedis_eog
			    #[table_name] => photos
			    #[table_propiedades] => stdClass Object
			    #    (
			    #        [custom_diffusion] => diffusion_cedis::process_interview_photos
			    #    )

		$section_tipo 			= $request_options->section_tipo;
		$section_id 			= $request_options->section_id;
		$diffusion_element_tipo = $request_options->diffusion_element_tipo;
		$table_propiedades 		= $request_options->table_propiedades;

		# Section inverse locator (interview)
		$interview_section_id = null;
		$section = section::get_instance($section_id, $section_tipo);
		$inverse_locators = $section->get_inverse_locators();
		foreach ((array)$inverse_locators as $locator) {
			if ($locator->from_section_tipo==='oh1') {
				$interview_section_id = $locator->from_section_id;
				break;
			}
		}
		# id interno (no de Dédalo)
		$interview_id = diffusion_cedis::get_table_record_id($interview_section_id, 'section_id', 'interviews');

	   	#foreach ($ar_locators as $key => $current_locator) {

	    	$current_section_tipo 	= $section_tipo;
	    	$current_section_id 	= $section_id;
	    	
	    	# section_id
			$photo_dedalo_id 		= $current_section_id;

	    	#
			# CHECK_PUBLICATION_VALUE. Delete record (and cascade) when component_publication value is false
			$p_options = new stdClass();
				$p_options->component_publication_tipo  = 'rsc20';
				$p_options->section_id 				 	= $current_section_id;
				$p_options->section_tipo 				= $current_section_tipo;
				$p_options->database_name 			 	= self::$database_name;
				$p_options->table_name 			 	 	= 'photos';	//$request_options->table_name;
				$p_options->diffusion_element_tipo  	= $diffusion_element_tipo;
				$p_options->table_propiedades  	 	 	= $table_propiedades;
				$p_options->delete_previous 			= false; // Important set to false
			$to_publish = diffusion_sql::check_publication_value($p_options);

			# Delete photos and photo_translations
			# Delete previous record
			$custom = new stdClass();
				$custom->field_name = 'photo_dedalo_id';
				$custom->field_value= $photo_dedalo_id;
			diffusion_mysql::delete_sql_record($current_section_id, self::$database_name, 'photos', $current_section_tipo, $custom);

			# Delete person_translations previous record
			$custom = new stdClass();
				$custom->field_name = 'photo_dedalo_id';
				$custom->field_value= $photo_dedalo_id;
			diffusion_mysql::delete_sql_record($current_section_id, self::$database_name, 'photo_translations', $current_section_tipo, $custom);		

			if ($to_publish===false) {

				#continue; # Record segment and segment translations are deleted. Stop here.
				return false;
			}//end if ($to_publish===false)

			$date = new DateTime();
			$now  = date('Y-m-d H:i:s', $date->getTimestamp());

	    	#
			# photos table 
				$record_data=array();
					$record_data['database_name'] 		= self::$database_name;
					$record_data['table_name'] 			= 'photos';
					$record_data['diffusion_section'] 	= 'cedis14';
					$record_data['engine'] 				= 'InnoDB';
					$record_data['ar_fields'] 			= array();

				$ar_fields  = array();

				# photo_dedalo_id
				$field_name  = 'photo_dedalo_id';
				$field_value = $photo_dedalo_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# interview_section_id
				$field_name  = 'interview_section_id';
				$field_value = $interview_section_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# interview_id
				$field_name  = 'interview_id';
				$field_value = $interview_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# photo_file_name
				$field_name  = 'photo_file_name';				
				$field_value = 'rsc29_rsc170_' . $photo_dedalo_id . '.jpg';
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# photo_content_type
				$field_name  = 'photo_content_type';
				$field_value = null;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# photo_file_size
				$field_name  = 'photo_file_size';
				$field_value = null;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# photo_updated_at
				$field_name  = 'photo_updated_at';				
				$field_value = $now;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				$record_data['ar_fields'][$photo_dedalo_id][] = $ar_fields;

				# Generamos el registro en mysql
				$options_save_record = new stdClass();
					$options_save_record->record_data 	  = $record_data;
					$options_save_record->typology 	  	  = null;
					$options_save_record->delete_previous = false;
					$options_save_record->section_tipo 	  = $current_section_tipo;					
				$result = diffusion_mysql::save_record( $options_save_record );

			#
			# photo_translations table 
				if ( !empty($result->new_id) ) {

					$record_data=array();
						$record_data['database_name'] 		= self::$database_name;
						$record_data['table_name'] 			= 'photo_translations';
						$record_data['diffusion_section'] 	= 'cedis14';
						$record_data['engine'] 				= 'InnoDB';
						$record_data['ar_fields'] 			= array();					

					foreach (array('lg-ell','lg-deu','lg-eng') as $lang) {
						
						$ar_fields   = array();

						$current_component_tipo = 'rsc30'; // Text area description of image
						$modelo_name 		= RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo, true); 
				    	$component_caption 	= component_common::get_instance($modelo_name,
						    												 $current_component_tipo,
						    												 $current_section_id,
						    												 'edit',
						    												 $lang,
						    												 $current_section_tipo);
				    	$image_caption_value = $component_caption->get_dato();

				    	# photo_dedalo_id
						$field_name  = 'photo_dedalo_id';
						$field_value = $photo_dedalo_id;
						$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

						# photo_id
						$field_name  = 'photo_id';
						$field_value = $result->new_id;
						$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

						# locale
						$field_name  = 'locale';
						$field_value = str_replace('lg-', '', $lang);
						$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

						# caption
						$field_name  = 'caption';
						$field_value = $image_caption_value;
						$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

						# created_at
						$field_name  = 'created_at';				
						$field_value = $now;
						$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

						# updated_at
						$field_name  = 'updated_at';				
						$field_value = $now;
						$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

						#$record_data['ar_fields'][$request_options->parent][$lang] = $ar_fields;
						$record_data['ar_fields'][$section_id][$lang] = $ar_fields;					

				    }//end foreach (array('lg-ell','lg-deu') as $lang)

				    # Generamos el registro en mysql
						$options_save_record = new stdClass();
							$options_save_record->record_data 	  = $record_data;
							$options_save_record->typology 	  	  = null;
							$options_save_record->delete_previous = false;
							$options_save_record->section_tipo 	  = $current_section_tipo;
						$result = diffusion_mysql::save_record( $options_save_record );

				  }//end if ( !empty($result->new_id) )

		#}//end  foreach ($dato as $key => $current_locator)

		debug_log(__METHOD__." Updated photos and photos_translation photo_dedalo_id:$photo_dedalo_id - interview_section_id:$interview_section_id - interview_id:$interview_id ".to_string(), logger::DEBUG);


		return null; // null is returned to interviews
	}//end process_interview_photos



	/**
	* PROCESS_INTERVIEW_PHOTOS
	* Note: not configure to direct call because neef interview_id. Called from from 'photos' (cedis104) on interview washwer
	* @return 
	*//*
	public static function process_interview_photos__OLD( $request_options ) {
		#dump($request_options, ' request_options ++ '.to_string()); return;

		debug_log(__METHOD__." CALLED with options: ".to_string($request_options), logger::ERROR);

		# Called from 'photos' (cedis104) on interview washwer
			#[typology] => 
		    #[value] => 
		    #[tipo] => cedis104
		    #[parent] => 27
		    #[lang] => lg-ell
		    #[section_tipo] => oh1
		    #[caler_id] => 3

		   #  Direct
		   		#[section_tipo] => rsc170
			    #[section_id] => 1
			    #[diffusion_element_tipo] => cedis3
			    #[database_name] => web_cedis_eog
			    #[table_name] => photos
			    #[table_propiedades] => stdClass Object
			    #    (
			    #        [custom_diffusion] => diffusion_cedis::process_interview_photos
			    #    )			

	    $component_portal = component_common::get_instance('component_portal',
    												 'oh26',
    												 $request_options->parent,
    												 'list',
    												 DEDALO_DATA_NOLAN,
    												 'oh1');
	    $ar_locators = (array)$component_portal->get_dato();

	    $interview_section_id 	= $request_options->parent;

	    # id interno (no de Dédalo)
		$interview_id = diffusion_cedis::get_table_record_id($interview_section_id, 'section_id', 'interviews');


	    foreach ($ar_locators as $key => $current_locator) {

	    	$current_section_tipo 	= $current_locator->section_tipo;
	    	$current_section_id 	= $current_locator->section_id;
	    	
	    	# section_id
			$photo_dedalo_id 		= $current_section_id;			

	    	#
			# CHECK_PUBLICATION_VALUE. Delete record (and cascade) when component_publication value is false
			$p_options = new stdClass();
				$p_options->component_publication_tipo  = 'rsc20';
				$p_options->section_id 				 	= $current_section_id;
				$p_options->section_tipo 				= $current_section_tipo;
				$p_options->database_name 			 	= self::$database_name;
				$p_options->table_name 			 	 	= 'photos';	//$request_options->table_name;
				$p_options->diffusion_element_tipo  	= $request_options->tipo;
				$p_options->table_propiedades  	 	 	= $request_options->propiedades;
				$p_options->delete_previous 			= false; // Important set to false
			$to_publish = diffusion_sql::check_publication_value($p_options);

			# Delete photos and photo_translations
			# Delete previous record
			$custom = new stdClass();
				$custom->field_name = 'photo_dedalo_id';
				$custom->field_value= $photo_dedalo_id;
			diffusion_mysql::delete_sql_record($current_section_id, self::$database_name, 'photos', $current_section_tipo, $custom);

			# Delete person_translations previous record
			$custom = new stdClass();
				$custom->field_name = 'photo_dedalo_id';
				$custom->field_value= $photo_dedalo_id;
			diffusion_mysql::delete_sql_record($current_section_id, self::$database_name, 'photo_translations', $current_section_tipo, $custom);		

			if ($to_publish===false) {

				continue; # Record segment and segment translations are deleted. Stop here.
			}//end if ($to_publish===false)

			$date = new DateTime();
			$now  = date('Y-m-d H:i:s', $date->getTimestamp());

	    	#
			# photos table 
				$record_data=array();
					$record_data['database_name'] 		= self::$database_name;
					$record_data['table_name'] 			= 'photos';
					$record_data['diffusion_section'] 	= 'cedis14';
					$record_data['engine'] 				= 'InnoDB';
					$record_data['ar_fields'] 			= array();

				$ar_fields  = array();

				# photo_dedalo_id
				$field_name  = 'photo_dedalo_id';
				$field_value = $photo_dedalo_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# interview_section_id
				$field_name  = 'interview_section_id';
				$field_value = $interview_section_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# interview_id
				$field_name  = 'interview_id';
				$field_value = $interview_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# photo_file_name
				$field_name  = 'photo_file_name';				
				$field_value = 'rsc29_rsc170_' . $photo_dedalo_id . '.jpg';
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# photo_content_type
				$field_name  = 'photo_content_type';
				$field_value = null;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# photo_file_size
				$field_name  = 'photo_file_size';
				$field_value = null;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# photo_updated_at
				$field_name  = 'photo_updated_at';				
				$field_value = $now;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				$record_data['ar_fields'][$photo_dedalo_id][] = $ar_fields;

				# Generamos el registro en mysql
				$options_save_record = new stdClass();
					$options_save_record->record_data 	  = $record_data;
					$options_save_record->typology 	  	  = null;
					$options_save_record->delete_previous = false;
					$options_save_record->section_tipo 	  = $current_section_tipo;					
				$result = diffusion_mysql::save_record( $options_save_record );

			#
			# photo_translations table 
				if ( !empty($result->new_id) ) {

					$record_data=array();
						$record_data['database_name'] 		= self::$database_name;
						$record_data['table_name'] 			= 'photo_translations';
						$record_data['diffusion_section'] 	= 'cedis14';
						$record_data['engine'] 				= 'InnoDB';
						$record_data['ar_fields'] 			= array();					

					foreach (array('lg-ell','lg-deu','lg-eng') as $lang) {
						
						$ar_fields   = array();

						$current_component_tipo = 'rsc30'; // Text area description of image
						$modelo_name 		= RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo, true); 
				    	$component_caption 	= component_common::get_instance($modelo_name,
						    												 $current_component_tipo,
						    												 $current_section_id,
						    												 'edit',
						    												 $lang,
						    												 $current_section_tipo);
				    	$image_caption_value = $component_caption->get_dato();

				    	# photo_dedalo_id
						$field_name  = 'photo_dedalo_id';
						$field_value = $photo_dedalo_id;
						$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

						# photo_id
						$field_name  = 'photo_id';
						$field_value = $result->new_id;
						$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

						# locale
						$field_name  = 'locale';
						$field_value = str_replace('lg-', '', $lang);
						$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

						# caption
						$field_name  = 'caption';
						$field_value = $image_caption_value;
						$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

						# created_at
						$field_name  = 'created_at';				
						$field_value = $now;
						$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

						# updated_at
						$field_name  = 'updated_at';				
						$field_value = $now;
						$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

						$record_data['ar_fields'][$request_options->parent][$lang] = $ar_fields;						

				    }//end foreach (array('lg-ell','lg-deu') as $lang)

				    # Generamos el registro en mysql
						$options_save_record = new stdClass();
							$options_save_record->record_data 	  = $record_data;
							$options_save_record->typology 	  	  = null;
							$options_save_record->delete_previous = false;
							$options_save_record->section_tipo 	  = $current_section_tipo;
						$result = diffusion_mysql::save_record( $options_save_record );

				  }//end if ( !empty($result->new_id) )

	    }//end  foreach ($dato as $key => $current_locator)

	    debug_log(__METHOD__." Updated photos and photos_translation photo_dedalo_id:$photo_dedalo_id - interview_section_id:$interview_section_id - interview_id:$interview_id ".to_string(), logger::DEBUG);


	    return null; // null is returned to interviews
	}//end process_interview_photos*/



	/**
	* BUILD_INTERVIEW_TRANSLATIONS
	* @return 
	*/
	public static function build_interview_translations( $options ) {
		#dump($options, ' options ++ '.to_string());
		#dump($dato, ' dato ++ '.to_string());

		$interview_section_id 	= $options->interview_section_id;
		$interview_id 			= $options->interview_id;
		$current_section_tipo 	= 'oh1';
		$lang 					= 'lg-ell';

		# Delete interview_translations previous record
			$custom = new stdClass();
				$custom->field_name = 'interview_section_id';
				$custom->field_value= $interview_section_id;
			diffusion_mysql::delete_sql_record($interview_section_id, self::$database_name, 'interview_translations', $current_section_tipo, $custom);		
		

		foreach ($ar_langs=array('lg-ell','lg-deu','lg-eng') as $key => $lang) {

			# Component
			$component_tipo   = 'oh38';
			$component 		= component_common::get_instance('component_text_area',
															  $component_tipo,
															  $interview_section_id,
															  'edit',
															  $lang,
															  $current_section_tipo);
			
			$dato = $component->get_dato();
			#dump($dato, ' dato ++ '.to_string($interview_section_id));

			#
			# interview_translations table 
				$record_data=array();
					$record_data['database_name'] 		= self::$database_name;
					$record_data['table_name'] 			= 'interview_translations';
					$record_data['diffusion_section'] 	= 'cedis14';
					$record_data['engine'] 				= 'InnoDB';
					$record_data['ar_fields'] 			= array();

				$ar_fields  = array();

				# locale
				$field_name  = 'locale';
				$lang_3 	 = str_replace('lg-', '', $lang);
				$field_value = $lang_3;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# observations
				$field_name  = 'observations';
				$observations= trim($dato);
				$field_value = $observations;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# interview_id
				$field_name  = 'interview_id';
				$field_value = $interview_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				# interview_section_id
				$field_name  = 'interview_section_id';
				$field_value = $interview_section_id;
				$ar_fields[] = array('field_name' => $field_name, 'field_value' => $field_value);

				$record_data['ar_fields'][$interview_section_id][] = $ar_fields;

				# Generamos el registro en mysql
				$options_save_record = new stdClass();
					$options_save_record->record_data 	  = $record_data;
					$options_save_record->typology 	  	  = null;
					$options_save_record->delete_previous = false;
					$options_save_record->section_tipo 	  = $current_section_tipo;
				$result = diffusion_mysql::save_record( $options_save_record );
		}


		return true;
	}//end build_interview_translations



}//end diffusion_cedis
?>