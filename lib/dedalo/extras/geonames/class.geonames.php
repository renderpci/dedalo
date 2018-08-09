<?php
/**
* GEONAMES
* Manages all Dédalo - Geonames transactions. Import, references etc.
* Note that for get data from geonames you need a account and a premium account for request with no restrictions
* Good luck
*/
class geonames {


	protected $geonameId;
	public static $counter;

	const API_GEONAMES_CHILDRENS_JSON_URL = 'http://api.geonames.org/childrenJSON';


	/**
	* WALK_DATA
	* Iterate a geoname item and childrens recursively
	* and return a one level array of objects with parent resolved
	* @return array $full_list
	*/
	public static function walk_data( $code, $recursive=true, $level, $base_lang_alpha2='en', $username=false) {

		$full_list = array();

		// style=full
		// lang = en

		$geonameId 	= $code;
		$lang 	   	= $base_lang_alpha2; // 'en';
		$style 		= 'full';
		#$username 	= GEONAMES_ACCOUNT_USERNAME;
		#$username 	= 'pepelepegm';

		if ($username===false) {
			$username 	= self::get_geonames_account_username();
		}		

		$start_time=microtime(1);

		// Wait 20 ms
		usleep(20*1000);

		$vars = array(
			"geonameId" => $geonameId,
			"username"  => $username,
			"style"  	=> $style,
			"lang"  	=> $lang,
			"maxRows" 	=> 1000000,
			);
		
		$url 	= self::API_GEONAMES_CHILDRENS_JSON_URL . "?";
		foreach ($vars as $key => $value) {
			$url .= "$key=$value&";
		}
		$msg = " <br> - CALLING GEONAMES URL API WITH USERNAME: \"<b>$username</b>\" for code $geonameId ";
		echo $msg; flush();
		debug_log(__METHOD__." $msg", logger::ERROR);
		
		# Call to geonames web service API
		$data 	= file_get_contents($url);

		geonames::$counter++;
		if (empty($data)) {
			#debug_log(__METHOD__." 1. data from file_get_contents $code ".to_string($data), logger::ERROR);
			$msg = "<h3 style=\"color:orange\"> empty data from file_get_contents $code ".to_string($data)." </h3>";
			echo $msg; flush();
		}
		$data 	= json_decode($data);
		if (!isset($data->totalResultsCount)) {
			debug_log(__METHOD__." 2. data from file_get_contents $code ".to_string($data), logger::ERROR);
			if (isset($data->status->value) && $data->status->value==19) {

				$msg = "<h1 style=\"color:red\"> 3. Stopped! The hourly limit of 2000 credits for yoadev has been exceeded $code ".to_string($data)." </h1>";
				dump($msg, ' msg ++ '.to_string());
				#debug_log(__METHOD__. " $msg ", logger::ERROR);
				echo $msg; flush();
				throw new Exception("Error Processing Request $msg", 1);				
				return $full_list;
			}
		}

		$total=round(microtime(1)-$start_time,3);
		$msg = " <br><blockquote> - Finish normally geonames API call '".$username."' for code $geonameId [" .geonames::$counter. "] ". exec_time_unit($start_time,'ms').' ms </blockquote>';			
		echo $msg; flush();
		debug_log(__METHOD__." $msg ", logger::ERROR);	
		
		if (isset($data->totalResultsCount) && $data->totalResultsCount>0) {
			$level++;
			foreach ($data->geonames as $key => $value_object) {

				// Add parent to object
				$value_object->parent  = $code;

				// Add level
				$value_object->level   = (int)$level;
				
				$geonameId	 = $value_object->geonameId;
				$toponymName = $value_object->toponymName;

				#echo "Doing $geonameId - $toponymName <br>";
				
				// Add to array
				$full_list[] = $value_object;
				
				// Childrens
				if ($recursive===true) {

					$recursive_user = self::get_geonames_account_username();
					$msg = " <blockquote> - Begining recursion level: $level with username: \"$recursive_user\" from $toponymName </blockquote>";	
					echo $msg; flush();

					$full_list = array_merge($full_list, geonames::walk_data($geonameId, $recursive, $level, $base_lang_alpha2, $recursive_user));	//$code, $recursive=true, $level=0, $base_lang_alpha2='en'
				}				
				#dump($value_object, ' $value_object ++ '.$toponymName .' code: '.to_string($code));

				// Wait 200 ms
				usleep(200*1000);
			}			
		}

		return $full_list;
	}//end walk_data



	/**
	* IMPORT_DATA
	*
		[adminCode1] => ESYE31
		[lng] => 23.88856
		[geonameId] => 445406
		[toponymName] => Nomarchía Anatolikís Attikís
		[countryId] => 390903
		[fcl] => A
		[population] => 0
		[numberOfChildren] => 13
		[countryCode] => GR
		[name] => Nomarchía Anatolikís Attikís
		[fclName] => country, state, region,...
		[countryName] => Greece
		[fcodeName] => second-order administrative division
		[adminName1] => Attica
		[lat] => 38.03352
		[fcode] => ADM2
		[parent] => 6692632
	*
	* @return 
	*/
	public static function import_data( $data, $section_tipo, $lang_alpha2, $other_langs_alpha2, $hierarchy_section_id ) {
		
		// Langs required for item name
		# $ar_langs 	= array('en','li','es','de');

		# Disable logging activity and time machine # !IMPORTANT
		logger_backend_activity::$enable_log = false;
		RecordObj_time_machine::$save_time_machine_version = false;

		$save_to_database_relations = false;

		# Create section root if not exists
		$root_section_id	= 1;   	
		$section 			= section::get_instance($root_section_id, $section_tipo);
		$section->forced_create_record();

		$ar_imported = array();
		foreach ((array)$data as $key => $value_object) {

			$code = $value_object->geonameId;
			
			$section_id		= geonames::search_section_id_from_code($code, $section_tipo);
			$is_new_record 	= false;
			if (empty($section_id)) {
				$section 	= section::get_instance(null, $section_tipo, 'edit', false);
				$section_id	= $section->Save();
				$is_new_record = true;
			}else{
				$section 	= section::get_instance($section_id, $section_tipo);
			}


			if ($is_new_record===true) {

				#
				# CODE GEONAMES (hierarchy63) no traducible
					$component 		= component_common::get_instance('component_input_text',
																	 DEDALO_THESAURUS_GEONAMES_ID_TIPO,
																	 $section_id,
																	 'list',
																	 DEDALO_DATA_NOLAN,
																	 $section_tipo);
					$component->set_dato( array((string)$code) );
					# SAVE_TO_DATABASE
					# Set component to save data but tells section that don save updated section to DDBB for now
					# No component time machine data will be saved when section saves later
					##$component->save_to_database = false;
					$component->Save();
				

					// IRI TO GEONAMES (hierarchy90) no traducible
					$component 		= component_common::get_instance('component_iri',
																	 'hierarchy90',
																	 $section_id,
																	 'list',
																	 DEDALO_DATA_NOLAN,
																	 $section_tipo);        	
					$url_parts = new stdClass();
						$url_parts->scheme 	= 'http://';
						$url_parts->host 	= 'geonames.org';
						$url_parts->path 	= (string)$code;

					$dd_iri = new dd_iri();
					$dd_iri->set_iri_from_url_parts($url_parts);

					$component->set_dato( array($dd_iri) );
					# SAVE_TO_DATABASE
					# Set component to save data but tells section that don save updated section to DDBB for now
					# No component time machine data will be saved when section saves later
					#$component->save_to_database = false;
					$component->Save();

				#
				# PROJECT filter default (hierarchy55)
					$component 		= component_common::get_instance('component_filter',
																	 DEDALO_THESAURUS_FILTER_TIPO,
																	 $section_id,
																	 'edit', # Already saves default project when load in edit mode
																	 DEDALO_DATA_NOLAN,
																	 $section_tipo);
					# Already saves default project when load in edit mode				

				#
				# IS DESCRIPTOR  (hierarchy33) no traducible
					$component 		= component_common::get_instance('component_radio_button',
																	 DEDALO_THESAURUS_DESCRIPTOR_TIPO,
																	 $section_id,
																	 'list',
																	 DEDALO_DATA_NOLAN,
																	 $section_tipo);
					
					//[{"section_id":"1","section_tipo":"dd64"}] = "YES"
					#$dato = json_decode('[{"section_id":"1","section_tipo":"dd64"}]');		        	
					$locator = new locator();
						$locator->set_section_tipo("dd64");
						$locator->set_section_id(1);
						$locator->set_type(DEDALO_RELATION_TYPE_LINK);
						$locator->set_from_component_tipo(DEDALO_THESAURUS_DESCRIPTOR_TIPO);

					$component->set_dato( $locator );
					# SAVE_TO_DATABASE
					# Set component to save data but tells section that don save updated section to DDBB for now
					# No component time machine data will be saved when section saves later
					#$component->save_to_database = false;
					# save_to_database_relations
					$component->save_to_database_relations = $save_to_database_relations;
					$component->Save();

				#
				# IS USABLE IN INDEXATION  (hierarchy24) no traducible
					$component 		= component_common::get_instance('component_radio_button',
																	 DEDALO_THESAURUS_USABLE_INDEX_TIPO,
																	 $section_id,
																	 'list',
																	 DEDALO_DATA_NOLAN,
																	 $section_tipo);
					
					//[{"section_id":"1","section_tipo":"dd64"}] = "YES"
					#$dato = json_decode('[{"section_id":"1","section_tipo":"dd64"}]');
					$locator = new locator();
						$locator->set_section_tipo("dd64");
						$locator->set_section_id(1);
						$locator->set_type(DEDALO_RELATION_TYPE_LINK);
						$locator->set_from_component_tipo(DEDALO_THESAURUS_USABLE_INDEX_TIPO);
					$component->set_dato( $locator );
					# SAVE_TO_DATABASE
					# Set component to save data but tells section that don save updated section to DDBB for now
					# No component time machine data will be saved when section saves later
					#$component->save_to_database = false;
					# save_to_database_relations
					$component->save_to_database_relations = $save_to_database_relations;
					$component->Save();

			}//end if ($is_new_record===true)


			#
			# NAME (hierarchy25)
				$saved_name_langs = geonames::save_name_all_langs($value_object, $section_id, $section_tipo, $lang_alpha2, $other_langs_alpha2);      	

			#
			# GEOLOCATION (hierarchy31)
				$lat 			= $value_object->lat;
				$lon 			= $value_object->lng;			
				$component 		= component_common::get_instance('component_geolocation',
																 DEDALO_THESAURUS_GEOLOCATION_TIPO,
																 $section_id,
																 'list',
																 DEDALO_DATA_NOLAN,
																 $section_tipo);
				$dato = new stdClass();
					$dato->lat 	= $lat;
					$dato->lon 	= $lon;
					$dato->zoom = 10;
				$component->set_dato($dato);
				# DIFFUSION_INFO
				# Note that this process can be very long if there are many inverse locators in this section
				# To optimize save process in scripts of importation, you can dissable this option if is not really necessary
				$component->update_diffusion_info_propagate_changes = false;
				# SAVE_TO_DATABASE
				# Set component to save data but tells section that don save updated section to DDBB for now
				# No component time machine data will be saved when section saves later
				#$component->save_to_database = false;
				$component->Save();

			#
			# REAL SAVE SECTION !
				$section->Save();

			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__." Saved section from geonames import: $section_tipo - $section_id ".to_string(), logger::DEBUG);;
			}


			#
			# PARENT (hierarchy36)
				$parent = geonames::search_section_id_from_code($value_object->parent, $section_tipo);
				if (!empty($parent)) {
					$component 		= component_common::get_instance('component_relation_children',
																	 DEDALO_THESAURUS_RELATION_CHIDRENS_TIPO,
																	 $parent,
																	 'list',
																	 DEDALO_DATA_NOLAN,
																	 $section_tipo);
					$locator = new locator();
						$locator->set_section_tipo($section_tipo);
						$locator->set_section_id($section_id);
						$locator->set_type(DEDALO_RELATION_TYPE_CHILDREN_TIPO);
						$locator->set_from_component_tipo(DEDALO_THESAURUS_RELATION_CHIDRENS_TIPO);
					
					$component->add_children($locator);
					# save_to_database_relations
					$component->save_to_database_relations = $save_to_database_relations;
					# SAVES INDEPENDANT !!! (Is another section id)
					$component->Save();
				}
		   

			// LEVEL
			if (isset($value_object->level) && $value_object->level===1) {
				#dump($value_object->level, ' level ++ '.to_string($value_object->name));
				# Attach as children of hierarchy
				#$attach = geonames::attach_as_hierarchy_children($hierarchy_section_id, $section_id, $section_tipo);
				$attach = geonames::attach_to_root_children($section_id, $section_tipo);
				if ($attach===true) {
					debug_log(__METHOD__." Added children ($section_tipo - $section_id) to hierarchy $hierarchy_section_id ".to_string(), logger::WARNING);
				}
			}//end if (isset($value_object->level) && $value_object->level==0)

			
			$ar_imported[] = $section_id;

		}//end foreach ((array)$data as $key => $value_object) {


		return (array)$ar_imported;
	}//end import_data



	/**
	* SAVE_NAME_ALL_LANGS
	* @return array $ar_saved_langs
	*/
	public static function save_name_all_langs($value_object, $section_id, $section_tipo, $lang_alpha2, $other_langs_alpha2) {
		
		$ar_saved_langs = array();
		$modelo_name 	= 'component_input_text';

		$section = section::get_instance($section_id, $section_tipo);
		
		# Base lang is always saved				
		$component 		= component_common::get_instance($modelo_name,
														 DEDALO_THESAURUS_TERM_TIPO,
														 $section_id,
														 'list',
														 DEDALO_DATA_LANG,
														 $section_tipo);
		
		

		$name = $value_object->name;
		$component->set_dato( array($name) );
		# Configure component
		# DIFFUSION_INFO
		# Note that this process can be very long if there are many inverse locators in this section
		# To optimize save process in scripts of importation, you can dissable this option if is not really necessary
		$component->update_diffusion_info_propagate_changes = false;
		# SAVE_TO_DATABASE
		# Set component to save data but tells section that don save updated section to DDBB for now
		# No component time machine data will be saved when section saves later
		#$component->save_to_database = false;
		$component->Save();
		$ar_saved_langs[] = $lang_alpha2;
		
		# Alternate langs
		if (isset($value_object->alternateNames)) {		
			foreach ($value_object->alternateNames as $key => $name_obj) {
				
				$current_lang = $name_obj->lang;
				
				if ($current_lang==='link'){

					$current_link 		= $name_obj->name;
					$url  				= parse_url($current_link);
					$host 				= $url['host'];
					$ar_domains 		= explode('.', $host);
					$inverse_ar_domains = array_reverse($ar_domains);

					switch ($inverse_ar_domains[1]) {
						case 'wikipedia':
							$current_wiki_lang 	= (strlen($inverse_ar_domains[2])>2) ? "lg-".$inverse_ar_domains[2] : lang::get_lang_code_from_alpha2($inverse_ar_domains[2]);
							$component 			= component_common::get_instance('component_iri',
																				 'hierarchy89',
																				 $section_id,
																				 'list',
																				 $current_wiki_lang,
																				 $section_tipo);
							# dd_id object
							$dd_iri = new dd_iri();
								$dd_iri->iri = $current_link;

							$component->set_dato( array($dd_iri) );
							# Configure component
							# DIFFUSION_INFO
							# Note that this process can be very long if there are many inverse locators in this section
							# To optimize save process in scripts of importation, you can dissable this option if is not really necessary
							$component->update_diffusion_info_propagate_changes = false;
							# SAVE_TO_DATABASE
							# Set component to save data but tells section that don save updated section to DDBB for now
							# No component time machine data will be saved when section saves later
							#$component->save_to_database = false;
							$component->Save();
							break;
					}
					#continue; //Skip special geonames lang named 'link'
				} else{

					$lang_code = (strlen($current_lang)>2) ? "lg-".$current_lang : lang::get_lang_code_from_alpha2($current_lang);					
					if (!empty($lang_code)) {							
						$component 		= component_common::get_instance($modelo_name,
																		 DEDALO_THESAURUS_TERM_TIPO,
																		 $section_id,
																		 'list',
																		 $lang_code,
																		 $section_tipo);
						$name = $name_obj->name;	
						$component->set_dato( array($name) );
						# DIFFUSION_INFO
						# Note that this process can be very long if there are many inverse locators in this section
						# To optimize save process in scripts of importation, you can dissable this option if is not really necessary
						$component->update_diffusion_info_propagate_changes = false;
						# SAVE_TO_DATABASE
						# Set component to save data but tells section that don save updated section to DDBB for now
						# No component time machine data will be saved when section saves later
						#$component->save_to_database = false;
						$component->Save();
						$ar_saved_langs[] = $lang_code;
					}
				}				
			}//end foreach ($value_object->alternateNames as $key => $name_obj)
		}//end if (isset($value_object->alternateNames))

		# REAL SAVE SECTION
		$section->Save();

		return $ar_saved_langs;
	}//end save_name_all_langs



	/**
	* ATTACH_AS_HIERARCHY_CHILDREN
	* @return 
	*/
	public static function attach_as_hierarchy_children($hierarchy_section_id, $section_id, $section_tipo) {

		$save_to_database_relations = false;
		
		$component 		= component_common::get_instance('component_relation_children',
														 DEDALO_HIERARCHY_CHIDRENS_TIPO,
														 $hierarchy_section_id,
														 'list',
														 DEDALO_DATA_NOLAN,
														 DEDALO_HIERARCHY_SECTION_TIPO);
		$locator = new locator();
			$locator->set_section_tipo($section_tipo);
			$locator->set_section_id($section_id);
			$locator->set_type(DEDALO_RELATION_TYPE_CHILDREN_TIPO);
			$locator->set_from_component_tipo(DEDALO_HIERARCHY_CHIDRENS_TIPO);
		
		$result = $component->add_children($locator);
			#dump($result, " ++ add_children result ". DEDALO_HIERARCHY_SECTION_TIPO ." $hierarchy_section_id, $section_id, $section_tipo , locator: ".json_encode($locator));
		if ($result) {
			$component->update_diffusion_info_propagate_changes = false;
			# save_to_database_relations
			$component->save_to_database_relations = $save_to_database_relations;
			$component->Save();
		}		

		return $result;
	}//end attach_as_hierarchy_children



	/**
	* ATTACH_AS_HIERARCHY_CHILDREN
	* @return 
	*/
	public static function attach_to_root_children($section_id, $section_tipo) {

		$save_to_database_relations = false;	
		
		# Save root term
		$component 		= component_common::get_instance('component_relation_children',
														 DEDALO_THESAURUS_RELATION_CHIDRENS_TIPO,
														 1,
														 'list',
														 DEDALO_DATA_NOLAN,
														 $section_tipo);
		$locator = new locator();
			$locator->set_section_tipo($section_tipo);
			$locator->set_section_id($section_id);
			$locator->set_type(DEDALO_RELATION_TYPE_CHILDREN_TIPO);
			$locator->set_from_component_tipo(DEDALO_THESAURUS_RELATION_CHIDRENS_TIPO);
		
		$result = $component->add_children($locator);
			#dump($result, " ++ add_children to component_tipo:". DEDALO_THESAURUS_RELATION_CHIDRENS_TIPO .", section_id:$section_id, section_tipo:$section_tipo , locator: ".json_encode($locator));
		if ($result) {
			$component->update_diffusion_info_propagate_changes = false;
			# save_to_database_relations
			$component->save_to_database_relations = $save_to_database_relations;
			$component->Save();
		}		

		return $result;
	}//end attach_as_hierarchy_children



	/**
	* SEARCH_SECTION_ID_FROM_CODE
	* @return mixed int|null
	*/
	public static function search_section_id_from_code( $code, $section_tipo ) {

		$section_id 	= null;
		$table 			= common::get_matrix_table_from_tipo($section_tipo);
		$component_tipo = DEDALO_THESAURUS_GEONAMES_ID_TIPO;	
		
		// Search DB
		$strQuery  = '';
		$strQuery .= "SELECT section_id";
		$strQuery .= " FROM \"$table\" ";
		$strQuery .= " WHERE ";
		$strQuery .= " datos#>'{components,$component_tipo,dato,lg-nolan}' ? '".$code."' "; // Search in array container (multiple input text)
			#dump($strQuery, ' strQuery ++ '.to_string()); die();

		$result   = JSON_RecordObj_matrix::search_free($strQuery);
		$num_rows = pg_num_rows($result);
		if ($num_rows>1) {
			debug_log(__METHOD__." More than 1 records are found with the same code. The first will be returned, but fix this issue ASAP to avoid errors ".to_string(), logger::ERROR);
		}elseif ($num_rows===1) {
			while ($rows = pg_fetch_assoc($result)) {
				$section_id = $rows['section_id'];
				break;
			}
		}		

		return $section_id;
	}//end search_section_id_from_code



	/**
	* GET_GEONAMES_ACCOUNT_USERNAME
	* Rotate geonames account and return the next available in the array
	* @return string $username
	*/
	public static function get_geonames_account_username() {

		$max = 1900;

		static $current_geonames_account_key = -1; // For rotate

		# users_counter
		static $users_counter = 0;

		$ar_users = array(		
						'lualana',
						'pepelepegm',
						'ramirogomez',
						'juliachowban',
						'martaladro',
						'rualgramales',
						'flarecarnab',
						'jorge.gomez',
						'pedrogarcialopez',
						'bertagamez',
						'pepeperez1591',
						'javiermir',
						'marialijau',
						'yoadev',
					  );

		switch (true) {
			case ( $users_counter <= $max ): // < 2000
				$username = $ar_users[0];
				break;
			case ( $users_counter <= $max * 2 ): // >2000 && < 4000
				$username = $ar_users[1];
				break;
			case ( $users_counter <= $max * 3 ): // >4000 && < 6000
				$username = $ar_users[2];
				break;
			case ( $users_counter <= $max * 4 ): // >6000 && < 8000
				$username = $ar_users[3];
				break;
			case ( $users_counter <= $max * 5 ): // >8000 && < 10000
				$username = $ar_users[4];
				break;
			case ( $users_counter <= $max * 6 ): // >10000 && < 12000
				$username = $ar_users[5];
				break;	
			case ( $users_counter <= $max * 7 ): // >12000 && < 14000
				$username = $ar_users[6];
				break;
			case ( $users_counter <= $max * 8 ): // >14000 && < 16000
				$username = $ar_users[7];
				break;
			case ( $users_counter <= $max * 9 ): // >16000 && < 18000
				$username = $ar_users[8];
				break;
			case ( $users_counter <= $max * 10 ): // >18000 && < 20000
				$username = $ar_users[9];
				break;
			case ( $users_counter <= $max * 11 ): // >20000 && < 22000
				$username = $ar_users[10];
				break;
			case ( $users_counter <= $max * 12 ): // >22000 && < 24000
				$username = $ar_users[11];
				break;
			case ( $users_counter <= $max * 13 ): // >24000 && < 26000
				$username = $ar_users[12];
				break;
			case ( $users_counter <= $max * 14 ): // >26000 && < 28000
				$username = $ar_users[13];
				break;

			default:
				# reset counter
				$users_counter = 0;

				# Return first user
				$username = $ar_users[0];
				/*
				# Rotate
				$current_geonames_account_key++;

				if (!isset($ar_users[$current_geonames_account_key])) {
					$current_geonames_account_key = 0;
				}
				$username = $ar_users[$current_geonames_account_key];
				*/
				break;
		}	

		# Add 1 to users counter
		$users_counter++;

		return $username;
	}//end get_geonames_account_username



}
?>